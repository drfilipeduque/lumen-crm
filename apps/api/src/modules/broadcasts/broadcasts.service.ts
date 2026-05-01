// Service de campanhas de disparo em massa via Meta Oficial.
// Audience é resolvida em 2 momentos:
//   - preview: filtros aplicados sem persistir, retorna count + sample
//   - start:  filtros aplicados, snapshot persistido em audienceSnapshot,
//             BroadcastRecipient criados, jobs agendados no BullMQ com
//             delay incremental (intervalSeconds * index)
//
// Status:
//   DRAFT → SCHEDULED (agendamento futuro) ou SENDING (imediato)
//   SENDING ↔ PAUSED
//   SENDING/PAUSED → CANCELLED (recipients PENDING viram SKIPPED)
//   SENDING → COMPLETED (todos processados)

import { prisma, Prisma } from '../../lib/prisma.js';
import {
  enqueueRecipient,
  removeRecipientsBatch,
} from './broadcasts.queue.js';
import type {
  AudienceFilters,
  CreateBroadcastInput,
  UpdateBroadcastInput,
  PreviewAudienceInput,
} from './broadcasts.schemas.js';

export class BroadcastError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

type Actor = { id: string; role: string };

// =====================================================================
// Resolução de audiência
// =====================================================================

export async function resolveAudienceContactIds(
  audienceType: 'CONTACTS' | 'OPPORTUNITIES',
  filters: AudienceFilters,
  limit = 10000,
): Promise<{ contactIds: string[]; opportunityByContact: Map<string, string> }> {
  const opportunityByContact = new Map<string, string>();

  if (audienceType === 'CONTACTS') {
    const where: Prisma.ContactWhereInput = {};
    if (filters.tagsInclude && filters.tagsInclude.length > 0) {
      where.tags = { some: { id: { in: filters.tagsInclude } } };
    }
    if (filters.tagsExclude && filters.tagsExclude.length > 0) {
      where.NOT = { tags: { some: { id: { in: filters.tagsExclude } } } };
    }
    if (filters.ownerIds && filters.ownerIds.length > 0) {
      where.ownerId = { in: filters.ownerIds };
    } else if (filters.hasOwner === true) {
      where.ownerId = { not: null };
    } else if (filters.hasOwner === false) {
      where.ownerId = null;
    }
    if (filters.createdFrom || filters.createdTo) {
      where.createdAt = {
        ...(filters.createdFrom ? { gte: new Date(filters.createdFrom) } : {}),
        ...(filters.createdTo ? { lte: new Date(filters.createdTo) } : {}),
      };
    }
    if (filters.hasOpportunity === true) {
      where.opportunities = { some: {} };
    } else if (filters.hasOpportunity === false) {
      where.opportunities = { none: {} };
    }
    const contacts = await prisma.contact.findMany({
      where,
      select: { id: true },
      take: limit,
    });
    return { contactIds: contacts.map((c) => c.id), opportunityByContact };
  }

  // OPPORTUNITIES: filtra opps, retorna contatos deduplicados
  const where: Prisma.OpportunityWhereInput = {};
  if (filters.pipelineIds && filters.pipelineIds.length > 0) {
    where.pipelineId = { in: filters.pipelineIds };
  }
  if (filters.stageIdsInclude && filters.stageIdsInclude.length > 0) {
    where.stageId = { in: filters.stageIdsInclude };
  }
  if (filters.stageIdsExclude && filters.stageIdsExclude.length > 0) {
    where.NOT = { stageId: { in: filters.stageIdsExclude } };
  }
  if (filters.status === 'WON') where.stage = { isClosedWon: true };
  if (filters.status === 'LOST') where.stage = { isClosedLost: true };
  if (filters.status === 'ACTIVE') {
    where.stage = { isClosedWon: false, isClosedLost: false };
  }
  if (filters.tagsInclude && filters.tagsInclude.length > 0) {
    where.tags = { some: { id: { in: filters.tagsInclude } } };
  }
  if (filters.tagsExclude && filters.tagsExclude.length > 0) {
    const prev = where.NOT ?? {};
    where.NOT = {
      ...(Array.isArray(prev) ? {} : (prev as Record<string, unknown>)),
      tags: { some: { id: { in: filters.tagsExclude } } },
    };
  }
  if (filters.ownerIds && filters.ownerIds.length > 0) {
    where.ownerId = { in: filters.ownerIds };
  }
  if (filters.priority && filters.priority.length > 0) {
    where.priority = { in: filters.priority };
  }
  if (filters.valueMin !== undefined || filters.valueMax !== undefined) {
    where.value = {
      ...(filters.valueMin !== undefined ? { gte: filters.valueMin } : {}),
      ...(filters.valueMax !== undefined ? { lte: filters.valueMax } : {}),
    };
  }
  if (filters.dueDateFrom || filters.dueDateTo) {
    where.dueDate = {
      ...(filters.dueDateFrom ? { gte: new Date(filters.dueDateFrom) } : {}),
      ...(filters.dueDateTo ? { lte: new Date(filters.dueDateTo) } : {}),
    };
  }
  const opps = await prisma.opportunity.findMany({
    where,
    select: { id: true, contactId: true },
    take: limit,
  });
  // Dedupe: 1 contato → 1 mensagem (preserva 1a opp pra audit)
  const seen = new Set<string>();
  const contactIds: string[] = [];
  for (const o of opps) {
    if (seen.has(o.contactId)) continue;
    seen.add(o.contactId);
    contactIds.push(o.contactId);
    opportunityByContact.set(o.contactId, o.id);
  }
  return { contactIds, opportunityByContact };
}

export async function previewAudience(input: PreviewAudienceInput) {
  const { contactIds } = await resolveAudienceContactIds(input.audienceType, input.audienceFilters, 10000);
  const sample = await prisma.contact.findMany({
    where: { id: { in: contactIds.slice(0, 5) } },
    select: { id: true, name: true, phone: true },
  });
  return { count: contactIds.length, sample };
}

// =====================================================================
// Validações comuns
// =====================================================================

async function validateConnectionAndTemplate(connectionId: string, templateId: string) {
  const conn = await prisma.whatsAppConnection.findUnique({
    where: { id: connectionId },
    select: { id: true, type: true, active: true },
  });
  if (!conn) throw new BroadcastError('CONNECTION_NOT_FOUND', 'Conexão não encontrada', 404);
  if (conn.type !== 'OFFICIAL') {
    throw new BroadcastError('OFFICIAL_REQUIRED', 'Disparos em massa só funcionam via conexão Meta Oficial', 400);
  }
  if (!conn.active) throw new BroadcastError('CONNECTION_INACTIVE', 'Conexão desativada', 400);

  const tmpl = await prisma.template.findUnique({
    where: { id: templateId },
    select: { id: true, connectionId: true, status: true },
  });
  if (!tmpl) throw new BroadcastError('TEMPLATE_NOT_FOUND', 'Template não encontrado', 404);
  if (tmpl.connectionId !== conn.id) {
    throw new BroadcastError('TEMPLATE_MISMATCH', 'Template não pertence a essa conexão', 400);
  }
  if (tmpl.status !== 'APPROVED') {
    throw new BroadcastError('TEMPLATE_NOT_APPROVED', 'Template ainda não aprovado pela Meta', 400);
  }
}

// =====================================================================
// CRUD básico
// =====================================================================

export async function createBroadcast(actor: Actor, input: CreateBroadcastInput) {
  await validateConnectionAndTemplate(input.connectionId, input.templateId);
  return prisma.broadcastCampaign.create({
    data: {
      name: input.name,
      description: input.description ?? null,
      connectionId: input.connectionId,
      templateId: input.templateId,
      templateVariables: (input.templateVariables ?? {}) as Prisma.InputJsonValue,
      audienceType: input.audienceType,
      audienceFilters: input.audienceFilters as Prisma.InputJsonValue,
      audienceSnapshot: [] as unknown as Prisma.InputJsonValue,
      intervalSeconds: input.intervalSeconds,
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
      status: 'DRAFT',
      respectBusinessHours: input.respectBusinessHours ?? false,
      createdById: actor.id,
    },
  });
}

export async function listBroadcasts(filters: { status?: string; page?: number; limit?: number }) {
  const page = filters.page ?? 1;
  const limit = filters.limit ?? 20;
  const where: Prisma.BroadcastCampaignWhereInput = {};
  if (filters.status) where.status = filters.status as Prisma.EnumBroadcastStatusFilter['equals'];
  const [data, total] = await Promise.all([
    prisma.broadcastCampaign.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        connection: { select: { id: true, name: true, type: true } },
        template: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
    }),
    prisma.broadcastCampaign.count({ where }),
  ]);
  return { data, total, page, totalPages: Math.ceil(total / limit) };
}

export async function getBroadcast(id: string) {
  const c = await prisma.broadcastCampaign.findUnique({
    where: { id },
    include: {
      connection: { select: { id: true, name: true, type: true } },
      template: { select: { id: true, name: true, language: true, body: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });
  if (!c) throw new BroadcastError('NOT_FOUND', 'Campanha não encontrada', 404);
  return c;
}

export async function updateBroadcast(id: string, input: UpdateBroadcastInput) {
  const cur = await getBroadcast(id);
  if (cur.status !== 'DRAFT') {
    throw new BroadcastError('NOT_EDITABLE', 'Apenas campanhas em rascunho podem ser editadas', 400);
  }
  if (input.connectionId && input.templateId) {
    await validateConnectionAndTemplate(input.connectionId, input.templateId);
  }
  const data: Prisma.BroadcastCampaignUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.description !== undefined) data.description = input.description;
  if (input.connectionId !== undefined) data.connection = { connect: { id: input.connectionId } };
  if (input.templateId !== undefined) data.template = { connect: { id: input.templateId } };
  if (input.templateVariables !== undefined)
    data.templateVariables = input.templateVariables as Prisma.InputJsonValue;
  if (input.audienceType !== undefined) data.audienceType = input.audienceType;
  if (input.audienceFilters !== undefined)
    data.audienceFilters = input.audienceFilters as Prisma.InputJsonValue;
  if (input.intervalSeconds !== undefined) data.intervalSeconds = input.intervalSeconds;
  if (input.scheduledAt !== undefined)
    data.scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
  if (input.respectBusinessHours !== undefined) data.respectBusinessHours = input.respectBusinessHours;
  return prisma.broadcastCampaign.update({ where: { id }, data });
}

export async function deleteBroadcastDraft(id: string) {
  const cur = await getBroadcast(id);
  if (cur.status !== 'DRAFT') {
    throw new BroadcastError('NOT_DELETABLE', 'Apenas rascunhos podem ser excluídos', 400);
  }
  await prisma.broadcastCampaign.delete({ where: { id } });
  return { ok: true as const };
}

// =====================================================================
// Lifecycle
// =====================================================================

export async function startBroadcast(id: string) {
  const cur = await getBroadcast(id);
  if (cur.status !== 'DRAFT') {
    throw new BroadcastError('CANT_START', `Campanha em status ${cur.status} não pode iniciar`, 400);
  }
  await validateConnectionAndTemplate(cur.connectionId, cur.templateId);

  const filters = (cur.audienceFilters ?? {}) as AudienceFilters;
  const { contactIds, opportunityByContact } = await resolveAudienceContactIds(
    cur.audienceType,
    filters,
  );
  if (contactIds.length === 0) {
    throw new BroadcastError('EMPTY_AUDIENCE', 'Nenhum destinatário casa com os filtros', 400);
  }

  // Pré-carrega contatos com phone (snapshot)
  const contacts = await prisma.contact.findMany({
    where: { id: { in: contactIds } },
    select: { id: true, phone: true },
  });

  const baseTime = cur.scheduledAt ? cur.scheduledAt.getTime() : Date.now();
  const intervalMs = cur.intervalSeconds * 1000;
  const nextStatus: 'SCHEDULED' | 'SENDING' = baseTime > Date.now() + 5_000 ? 'SCHEDULED' : 'SENDING';

  // Cria recipients e enfileira jobs
  await prisma.$transaction(async (tx) => {
    await tx.broadcastCampaign.update({
      where: { id },
      data: {
        audienceSnapshot: contactIds as unknown as Prisma.InputJsonValue,
        totalRecipients: contacts.length,
        status: nextStatus,
        startedAt: nextStatus === 'SENDING' ? new Date() : null,
      },
    });
    for (const c of contacts) {
      await tx.broadcastRecipient.create({
        data: {
          campaignId: id,
          contactId: c.id,
          opportunityId: opportunityByContact.get(c.id) ?? null,
          phone: c.phone,
          status: 'PENDING',
        },
      });
    }
  });

  // Re-fetch com IDs e enfileira fora da tx (BullMQ usa Redis)
  const recipients = await prisma.broadcastRecipient.findMany({
    where: { campaignId: id },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  for (let i = 0; i < recipients.length; i++) {
    const sendAt = baseTime + i * intervalMs;
    await enqueueRecipient(recipients[i]!.id, sendAt - Date.now());
  }

  return getBroadcast(id);
}

export async function pauseBroadcast(id: string) {
  const cur = await getBroadcast(id);
  if (cur.status !== 'SENDING' && cur.status !== 'SCHEDULED') {
    throw new BroadcastError('NOT_PAUSABLE', 'Campanha não está enviando', 400);
  }
  // Remove os jobs ainda PENDING
  const pending = await prisma.broadcastRecipient.findMany({
    where: { campaignId: id, status: 'PENDING' },
    select: { id: true },
  });
  await removeRecipientsBatch(pending.map((p) => p.id));
  await prisma.broadcastCampaign.update({
    where: { id },
    data: { status: 'PAUSED' },
  });
  return getBroadcast(id);
}

export async function resumeBroadcast(id: string) {
  const cur = await getBroadcast(id);
  if (cur.status !== 'PAUSED') throw new BroadcastError('NOT_PAUSED', 'Campanha não está pausada', 400);

  const pending = await prisma.broadcastRecipient.findMany({
    where: { campaignId: id, status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  const intervalMs = cur.intervalSeconds * 1000;
  await prisma.broadcastCampaign.update({
    where: { id },
    data: { status: 'SENDING', pauseReason: null },
  });
  for (let i = 0; i < pending.length; i++) {
    await enqueueRecipient(pending[i]!.id, i * intervalMs);
  }
  return getBroadcast(id);
}

export async function cancelBroadcast(id: string) {
  const cur = await getBroadcast(id);
  if (cur.status === 'COMPLETED' || cur.status === 'CANCELLED') {
    return cur;
  }
  const pending = await prisma.broadcastRecipient.findMany({
    where: { campaignId: id, status: 'PENDING' },
    select: { id: true },
  });
  await removeRecipientsBatch(pending.map((p) => p.id));
  await prisma.$transaction([
    prisma.broadcastRecipient.updateMany({
      where: { campaignId: id, status: 'PENDING' },
      data: { status: 'SKIPPED', error: 'Campanha cancelada' },
    }),
    prisma.broadcastCampaign.update({
      where: { id },
      data: { status: 'CANCELLED', completedAt: new Date() },
    }),
  ]);
  return getBroadcast(id);
}

export async function listRecipients(
  campaignId: string,
  filters: { status?: string; page?: number; limit?: number },
) {
  const page = filters.page ?? 1;
  const limit = filters.limit ?? 50;
  const where: Prisma.BroadcastRecipientWhereInput = { campaignId };
  if (filters.status) where.status = filters.status as Prisma.EnumBroadcastRecipientStatusFilter['equals'];
  const [data, total] = await Promise.all([
    prisma.broadcastRecipient.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        contact: { select: { id: true, name: true, phone: true } },
      },
    }),
    prisma.broadcastRecipient.count({ where }),
  ]);
  return { data, total, page, totalPages: Math.ceil(total / limit) };
}

// Atualiza status agregados após cada send (chamado pelo worker e webhook).
// Quando todos os PENDING saem, marca COMPLETED.
export async function updateCampaignProgress(campaignId: string) {
  const counts = await prisma.broadcastRecipient.groupBy({
    by: ['status'],
    where: { campaignId },
    _count: { _all: true },
  });
  const map = new Map<string, number>(counts.map((c) => [c.status as string, c._count._all]));
  const sentCount = (map.get('SENT') ?? 0) + (map.get('DELIVERED') ?? 0) + (map.get('READ') ?? 0);
  const deliveredCount = (map.get('DELIVERED') ?? 0) + (map.get('READ') ?? 0);
  const readCount = map.get('READ') ?? 0;
  const failedCount = (map.get('FAILED') ?? 0) + (map.get('SKIPPED') ?? 0);
  const pending = map.get('PENDING') ?? 0;

  const total = Array.from(map.values()).reduce((s, n) => s + n, 0);
  const data: Prisma.BroadcastCampaignUpdateInput = {
    sentCount,
    deliveredCount,
    readCount,
    failedCount,
  };
  if (pending === 0 && total > 0) {
    data.status = failedCount === total ? 'FAILED' : 'COMPLETED';
    data.completedAt = new Date();
  }
  await prisma.broadcastCampaign.update({ where: { id: campaignId }, data });
}
