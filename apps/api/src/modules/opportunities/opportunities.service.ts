import { prisma, Prisma } from '../../lib/prisma.js';
import { eventBus } from '../automation/engine/event-bus.js';

export class OpportunityError extends Error {
  status: number;
  code: string;
  extra?: Record<string, unknown>;
  constructor(code: string, message: string, status = 400, extra?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.status = status;
    this.extra = extra;
  }
}

type Actor = { id: string; role: string };

// ============================================================
// SCOPING
// ============================================================

function ownerScope(actor: Actor): Prisma.OpportunityWhereInput {
  if (actor.role === 'ADMIN') return {};
  return { OR: [{ ownerId: actor.id }, { ownerId: null }] };
}

// ============================================================
// BOARD
// ============================================================

export type BoardCard = {
  id: string;
  title: string;
  contactId: string;
  contactName: string;
  value: number;
  priority: string;
  description: string | null;
  dueDate: string | null;
  tagsCount: number;
  tags: { id: string; name: string; color: string }[];
  ownerId: string | null;
  ownerName: string | null;
  ownerAvatar: string | null;
  lastActivity: string;
  hasActiveReminder: boolean;
  hasOverdueReminder: boolean;
  unreadMessages: number;
  order: number;
  createdAt: string;
};

export type BoardColumn = {
  stageId: string;
  stageName: string;
  color: string;
  order: number;
  isClosedWon: boolean;
  isClosedLost: boolean;
  count: number;
  totalValue: number;
  opportunities: BoardCard[];
};

type BoardFilters = {
  search?: string;
  tagIds?: string[];
  ownerId?: string;
  priority?: string;
  dueFrom?: string;
  dueTo?: string;
};

export async function getBoard(
  actor: Actor,
  pipelineId: string,
  filters: BoardFilters,
): Promise<{ pipelineId: string; pipelineName: string; columns: BoardColumn[] }> {
  const pipeline = await prisma.pipeline.findUnique({
    where: { id: pipelineId },
    include: { stages: { orderBy: { order: 'asc' } } },
  });
  if (!pipeline) throw new OpportunityError('NOT_FOUND', 'Funil não encontrado', 404);

  const where: Prisma.OpportunityWhereInput = {
    pipelineId,
    ...ownerScope(actor),
    ...(filters.priority ? { priority: filters.priority as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' } : {}),
    ...(filters.ownerId ? { ownerId: filters.ownerId } : {}),
    ...(filters.tagIds && filters.tagIds.length > 0
      ? { tags: { some: { id: { in: filters.tagIds } } } }
      : {}),
    ...(filters.search
      ? {
          OR: [
            { title: { contains: filters.search, mode: 'insensitive' } },
            { contact: { name: { contains: filters.search, mode: 'insensitive' } } },
          ],
        }
      : {}),
    ...(filters.dueFrom || filters.dueTo
      ? {
          dueDate: {
            ...(filters.dueFrom ? { gte: new Date(filters.dueFrom) } : {}),
            ...(filters.dueTo ? { lte: new Date(filters.dueTo) } : {}),
          },
        }
      : {}),
  };

  const opps = await prisma.opportunity.findMany({
    where,
    orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
    include: {
      contact: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true, avatar: true } },
      tags: { select: { id: true, name: true, color: true } },
      reminders: { where: { completed: false }, select: { dueAt: true } },
    },
  });

  // Mensagens não lidas: somar conversations de cada contato visível
  const contactIds = Array.from(new Set(opps.map((o) => o.contactId)));
  const unread =
    contactIds.length > 0
      ? await prisma.conversation.groupBy({
          by: ['contactId'],
          where: { contactId: { in: contactIds } },
          _sum: { unreadCount: true },
        })
      : [];
  const unreadByContact = new Map(unread.map((u) => [u.contactId, u._sum.unreadCount ?? 0] as const));

  const now = new Date();
  const cardsByStage = new Map<string, BoardCard[]>();
  const totalsByStage = new Map<string, number>();

  for (const o of opps) {
    const card: BoardCard = {
      id: o.id,
      title: o.title,
      contactId: o.contactId,
      contactName: o.contact.name,
      value: Number(o.value),
      priority: o.priority,
      description: o.description,
      dueDate: o.dueDate ? o.dueDate.toISOString() : null,
      tagsCount: o.tags.length,
      tags: o.tags.map((t) => ({ id: t.id, name: t.name, color: t.color })),
      ownerId: o.ownerId,
      ownerName: o.owner?.name ?? null,
      ownerAvatar: o.owner?.avatar ?? null,
      lastActivity: o.updatedAt.toISOString(),
      hasActiveReminder: o.reminders.length > 0,
      hasOverdueReminder: o.reminders.some((r) => r.dueAt < now),
      unreadMessages: unreadByContact.get(o.contactId) ?? 0,
      order: o.order,
      createdAt: o.createdAt.toISOString(),
    };
    const arr = cardsByStage.get(o.stageId) ?? [];
    arr.push(card);
    cardsByStage.set(o.stageId, arr);
    totalsByStage.set(o.stageId, (totalsByStage.get(o.stageId) ?? 0) + Number(o.value));
  }

  return {
    pipelineId: pipeline.id,
    pipelineName: pipeline.name,
    columns: pipeline.stages.map((s) => ({
      stageId: s.id,
      stageName: s.name,
      color: s.color,
      order: s.order,
      isClosedWon: s.isClosedWon,
      isClosedLost: s.isClosedLost,
      count: cardsByStage.get(s.id)?.length ?? 0,
      totalValue: totalsByStage.get(s.id) ?? 0,
      opportunities: cardsByStage.get(s.id) ?? [],
    })),
  };
}

// ============================================================
// GET DETAIL
// ============================================================

export type OpportunityDetail = BoardCard & {
  pipelineId: string;
  stageId: string;
  customFields: { customFieldId: string; value: string }[];
  updatedAt: string;
};

export async function getOpportunity(actor: Actor, id: string): Promise<OpportunityDetail> {
  const o = await prisma.opportunity.findFirst({
    where: { AND: [{ id }, ownerScope(actor)] },
    include: {
      contact: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true, avatar: true } },
      tags: { select: { id: true, name: true, color: true } },
      reminders: { where: { completed: false }, select: { dueAt: true } },
      customFieldValues: { select: { customFieldId: true, value: true } },
    },
  });
  if (!o) throw new OpportunityError('NOT_FOUND', 'Oportunidade não encontrada', 404);

  const unread = await prisma.conversation.aggregate({
    where: { contactId: o.contactId },
    _sum: { unreadCount: true },
  });
  const now = new Date();

  return {
    id: o.id,
    pipelineId: o.pipelineId,
    stageId: o.stageId,
    title: o.title,
    contactId: o.contactId,
    contactName: o.contact.name,
    value: Number(o.value),
    priority: o.priority,
    description: o.description,
    dueDate: o.dueDate ? o.dueDate.toISOString() : null,
    tagsCount: o.tags.length,
    tags: o.tags.map((t) => ({ id: t.id, name: t.name, color: t.color })),
    ownerId: o.ownerId,
    ownerName: o.owner?.name ?? null,
    ownerAvatar: o.owner?.avatar ?? null,
    lastActivity: o.updatedAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
    hasActiveReminder: o.reminders.length > 0,
    hasOverdueReminder: o.reminders.some((r) => r.dueAt < now),
    unreadMessages: unread._sum.unreadCount ?? 0,
    order: o.order,
    createdAt: o.createdAt.toISOString(),
    customFields: o.customFieldValues.map((v) => ({ customFieldId: v.customFieldId, value: v.value })),
  };
}

// ============================================================
// VALIDATIONS
// ============================================================

async function validateStageBelongsToPipeline(stageId: string, pipelineId: string) {
  const s = await prisma.stage.findUnique({ where: { id: stageId }, select: { pipelineId: true } });
  if (!s) throw new OpportunityError('INVALID_STAGE', 'Etapa não encontrada', 400);
  if (s.pipelineId !== pipelineId) {
    throw new OpportunityError('STAGE_PIPELINE_MISMATCH', 'A etapa não pertence ao funil informado', 400);
  }
}

async function validateContact(contactId: string) {
  const c = await prisma.contact.findUnique({ where: { id: contactId }, select: { id: true } });
  if (!c) throw new OpportunityError('INVALID_CONTACT', 'Contato não encontrado', 400);
}

async function validateTags(tagIds: string[] | undefined) {
  if (!tagIds || tagIds.length === 0) return;
  const found = await prisma.tag.findMany({ where: { id: { in: tagIds } }, select: { id: true } });
  if (found.length !== tagIds.length) {
    throw new OpportunityError('INVALID_TAGS', 'Uma ou mais tags não existem', 400);
  }
}

async function validateOwner(ownerId: string | null | undefined) {
  if (!ownerId) return;
  const u = await prisma.user.findUnique({ where: { id: ownerId }, select: { id: true } });
  if (!u) throw new OpportunityError('INVALID_OWNER', 'Responsável não encontrado', 400);
}

async function validateCustomFields(pipelineId: string, fields: Record<string, string> | undefined) {
  if (!fields) return;
  const ids = Object.keys(fields);
  if (ids.length === 0) return;
  const visible = await prisma.pipelineCustomField.findMany({
    where: { pipelineId, customFieldId: { in: ids }, visible: true },
    select: { customFieldId: true },
  });
  const visibleSet = new Set(visible.map((v) => v.customFieldId));
  const invalid = ids.filter((id) => !visibleSet.has(id));
  if (invalid.length > 0) {
    throw new OpportunityError(
      'CUSTOM_FIELD_NOT_VISIBLE',
      'Um ou mais campos personalizados não estão visíveis neste funil',
      400,
      { invalid },
    );
  }
}

// ============================================================
// CREATE
// ============================================================

type CreateInput = {
  title: string;
  contactId: string;
  pipelineId: string;
  stageId: string;
  value: number;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  description?: string | null;
  dueDate?: Date | null;
  ownerId?: string | null;
  tagIds?: string[];
  customFields?: Record<string, string>;
};

export async function createOpportunity(actor: Actor, input: CreateInput): Promise<OpportunityDetail> {
  await validateStageBelongsToPipeline(input.stageId, input.pipelineId);
  await validateContact(input.contactId);
  await validateTags(input.tagIds);
  await validateOwner(input.ownerId);
  await validateCustomFields(input.pipelineId, input.customFields);

  const max = await prisma.opportunity.aggregate({
    where: { stageId: input.stageId },
    _max: { order: true },
  });
  const nextOrder = (max._max.order ?? -1) + 1;

  const created = await prisma.opportunity.create({
    data: {
      title: input.title,
      contactId: input.contactId,
      pipelineId: input.pipelineId,
      stageId: input.stageId,
      value: input.value,
      priority: input.priority,
      description: input.description ?? null,
      dueDate: input.dueDate ?? null,
      ownerId: input.ownerId ?? null,
      order: nextOrder,
      tags: input.tagIds ? { connect: input.tagIds.map((id) => ({ id })) } : undefined,
      customFieldValues: input.customFields
        ? {
            create: Object.entries(input.customFields).map(([customFieldId, value]) => ({
              customFieldId,
              value,
            })),
          }
        : undefined,
      history: {
        create: { action: 'CREATED', userId: actor.id, toStageId: input.stageId },
      },
    },
    select: { id: true },
  });

  eventBus.publish({
    type: 'opportunity.created',
    entityId: created.id,
    actorId: actor.id,
    data: {
      opportunityId: created.id,
      contactId: input.contactId,
      pipelineId: input.pipelineId,
      stageId: input.stageId,
      userId: actor.id,
    },
  });

  return getOpportunity(actor, created.id);
}

// ============================================================
// UPDATE (com history diff)
// ============================================================

type UpdateInput = Partial<Omit<CreateInput, 'pipelineId'>>;

export async function updateOpportunity(
  actor: Actor,
  id: string,
  input: UpdateInput,
): Promise<OpportunityDetail> {
  const prev = await prisma.opportunity.findFirst({
    where: { AND: [{ id }, ownerScope(actor)] },
    include: { tags: { select: { id: true } } },
  });
  if (!prev) throw new OpportunityError('NOT_FOUND', 'Oportunidade não encontrada', 404);

  if (input.stageId && input.stageId !== prev.stageId) {
    await validateStageBelongsToPipeline(input.stageId, prev.pipelineId);
  }
  if (input.contactId !== undefined) await validateContact(input.contactId);
  if (input.tagIds !== undefined) await validateTags(input.tagIds);
  if (input.ownerId !== undefined) await validateOwner(input.ownerId);
  if (input.customFields !== undefined) await validateCustomFields(prev.pipelineId, input.customFields);

  const data: Prisma.OpportunityUpdateInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.value !== undefined) data.value = input.value;
  if (input.priority !== undefined) data.priority = input.priority;
  if (input.description !== undefined) data.description = input.description;
  if (input.dueDate !== undefined) data.dueDate = input.dueDate;
  if (input.contactId !== undefined) data.contact = { connect: { id: input.contactId } };
  if (input.ownerId !== undefined) data.owner = input.ownerId ? { connect: { id: input.ownerId } } : { disconnect: true };
  if (input.stageId !== undefined) data.stage = { connect: { id: input.stageId } };
  if (input.tagIds !== undefined) data.tags = { set: input.tagIds.map((tid) => ({ id: tid })) };

  await prisma.opportunity.update({ where: { id }, data });

  if (input.customFields) {
    // Substitui valores informados (não apaga os ausentes)
    await prisma.$transaction(
      Object.entries(input.customFields).map(([customFieldId, value]) =>
        prisma.customFieldValue.upsert({
          where: { customFieldId_opportunityId: { customFieldId, opportunityId: id } },
          create: { customFieldId, opportunityId: id, value },
          update: { value },
        }),
      ),
    );
  }

  await logOpportunityChange(id, prev, input, actor.id);

  // Eventos de domínio pra automation engine.
  // pipelineId/stageId atuais incluídos pra trigger-matcher filtrar por funil/etapa.
  const pipelineId = prev.pipelineId;
  const currentStageId = input.stageId ?? prev.stageId;

  if (input.stageId && input.stageId !== prev.stageId) {
    const next = await prisma.stage.findUnique({
      where: { id: input.stageId },
      select: { isClosedWon: true, isClosedLost: true },
    });
    eventBus.publish({
      type: 'opportunity.stage_changed',
      entityId: id,
      actorId: actor.id,
      data: { opportunityId: id, pipelineId, fromStageId: prev.stageId, toStageId: input.stageId, stageId: input.stageId, contactId: prev.contactId, userId: actor.id },
    });
    if (next?.isClosedWon) {
      eventBus.publish({ type: 'opportunity.won', entityId: id, actorId: actor.id, data: { opportunityId: id, pipelineId, stageId: input.stageId, contactId: prev.contactId, userId: actor.id } });
    }
    if (next?.isClosedLost) {
      eventBus.publish({ type: 'opportunity.lost', entityId: id, actorId: actor.id, data: { opportunityId: id, pipelineId, stageId: input.stageId, contactId: prev.contactId, userId: actor.id } });
    }
  }
  if (input.priority !== undefined && input.priority !== prev.priority) {
    eventBus.publish({ type: 'opportunity.priority_changed', entityId: id, actorId: actor.id, data: { opportunityId: id, pipelineId, stageId: currentStageId, contactId: prev.contactId, priority: input.priority, userId: actor.id } });
  }
  if (input.value !== undefined && Number(prev.value) !== input.value) {
    eventBus.publish({ type: 'opportunity.value_changed', entityId: id, actorId: actor.id, data: { opportunityId: id, pipelineId, stageId: currentStageId, contactId: prev.contactId, value: input.value, userId: actor.id } });
  }
  if (input.ownerId !== undefined && prev.ownerId !== input.ownerId) {
    eventBus.publish({ type: 'opportunity.owner_changed', entityId: id, actorId: actor.id, data: { opportunityId: id, pipelineId, stageId: currentStageId, contactId: prev.contactId, fromOwnerId: prev.ownerId, toOwnerId: input.ownerId, userId: actor.id } });
  }
  if (input.tagIds !== undefined) {
    const before = new Set(prev.tags.map((t) => t.id));
    const after = new Set(input.tagIds);
    for (const tid of input.tagIds) {
      if (!before.has(tid)) {
        eventBus.publish({ type: 'opportunity.tag_added', entityId: id, actorId: actor.id, data: { opportunityId: id, pipelineId, stageId: currentStageId, contactId: prev.contactId, tagId: tid, userId: actor.id } });
      }
    }
    for (const tid of before) {
      if (!after.has(tid)) {
        eventBus.publish({ type: 'opportunity.tag_removed', entityId: id, actorId: actor.id, data: { opportunityId: id, pipelineId, stageId: currentStageId, contactId: prev.contactId, tagId: tid, userId: actor.id } });
      }
    }
  }
  if (input.customFields) {
    for (const [customFieldId, value] of Object.entries(input.customFields)) {
      eventBus.publish({ type: 'opportunity.field_updated', entityId: id, actorId: actor.id, data: { opportunityId: id, pipelineId, stageId: currentStageId, contactId: prev.contactId, customFieldId, value, userId: actor.id } });
    }
  }

  return getOpportunity(actor, id);
}

async function logOpportunityChange(
  id: string,
  prev: {
    stageId: string;
    title: string;
    value: Prisma.Decimal;
    priority: string;
    dueDate: Date | null;
    description: string | null;
    ownerId: string | null;
    tags: { id: string }[];
  },
  input: UpdateInput,
  userId: string,
) {
  const entries: Prisma.OpportunityHistoryCreateManyInput[] = [];

  if (input.stageId !== undefined && input.stageId !== prev.stageId) {
    entries.push({
      opportunityId: id,
      action: 'STAGE_CHANGE',
      fromStageId: prev.stageId,
      toStageId: input.stageId,
      userId,
    });
  }
  if (input.value !== undefined && Number(prev.value) !== input.value) {
    entries.push({
      opportunityId: id,
      action: 'VALUE_CHANGED',
      userId,
      metadata: { from: Number(prev.value), to: input.value } as Prisma.InputJsonValue,
    });
  }
  if (input.priority !== undefined && prev.priority !== input.priority) {
    entries.push({
      opportunityId: id,
      action: 'PRIORITY_CHANGED',
      userId,
      metadata: { from: prev.priority, to: input.priority } as Prisma.InputJsonValue,
    });
  }
  if (input.ownerId !== undefined && prev.ownerId !== input.ownerId) {
    entries.push({
      opportunityId: id,
      action: 'OWNER_CHANGED',
      userId,
      metadata: { from: prev.ownerId, to: input.ownerId } as Prisma.InputJsonValue,
    });
  }
  if (
    (input.title !== undefined && input.title !== prev.title) ||
    (input.dueDate !== undefined && (prev.dueDate?.toISOString() ?? null) !== (input.dueDate?.toISOString() ?? null)) ||
    (input.description !== undefined && (prev.description ?? null) !== (input.description ?? null))
  ) {
    const fields: string[] = [];
    if (input.title !== undefined && input.title !== prev.title) fields.push('title');
    if (input.dueDate !== undefined && (prev.dueDate?.toISOString() ?? null) !== (input.dueDate?.toISOString() ?? null))
      fields.push('dueDate');
    if (input.description !== undefined && (prev.description ?? null) !== (input.description ?? null))
      fields.push('description');
    entries.push({
      opportunityId: id,
      action: 'FIELD_UPDATE',
      userId,
      metadata: { fields } as Prisma.InputJsonValue,
    });
  }
  if (input.tagIds !== undefined) {
    const before = new Set(prev.tags.map((t) => t.id));
    const after = new Set(input.tagIds);
    for (const tid of input.tagIds) {
      if (!before.has(tid)) {
        entries.push({
          opportunityId: id,
          action: 'TAG_ADDED',
          userId,
          metadata: { tagId: tid } as Prisma.InputJsonValue,
        });
      }
    }
    for (const tid of before) {
      if (!after.has(tid)) {
        entries.push({
          opportunityId: id,
          action: 'TAG_REMOVED',
          userId,
          metadata: { tagId: tid } as Prisma.InputJsonValue,
        });
      }
    }
  }

  if (entries.length > 0) {
    await prisma.opportunityHistory.createMany({ data: entries });
  }
}

// ============================================================
// MOVE (drag entre colunas)
// ============================================================

export async function moveOpportunity(
  actor: Actor,
  id: string,
  toStageId: string,
  order: number,
): Promise<{ ok: true }> {
  const opp = await prisma.opportunity.findFirst({
    where: { AND: [{ id }, ownerScope(actor)] },
    select: { id: true, stageId: true, pipelineId: true, contactId: true },
  });
  if (!opp) throw new OpportunityError('NOT_FOUND', 'Oportunidade não encontrada', 404);
  await validateStageBelongsToPipeline(toStageId, opp.pipelineId);

  const fromStageId = opp.stageId;
  const targetOrder = Math.max(0, Math.floor(order));

  await prisma.$transaction(async (tx) => {
    if (fromStageId === toStageId) {
      await renumberStage(tx, toStageId, id, targetOrder);
    } else {
      // Tira da coluna de origem (compactar ordens)
      await tx.opportunity.update({
        where: { id },
        data: { stageId: toStageId, order: -1 }, // -1 temporário; vai ser corrigido logo
      });
      await renumberStage(tx, fromStageId, null, 0);
      await renumberStage(tx, toStageId, id, targetOrder);
    }

    if (fromStageId !== toStageId) {
      await tx.opportunityHistory.create({
        data: {
          opportunityId: id,
          action: 'STAGE_CHANGE',
          fromStageId,
          toStageId,
          userId: actor.id,
        },
      });
    }
  });

  if (fromStageId !== toStageId) {
    eventBus.publish({
      type: 'opportunity.stage_changed',
      entityId: id,
      actorId: actor.id,
      data: { opportunityId: id, fromStageId, toStageId, contactId: opp.contactId, userId: actor.id },
    });
    const next = await prisma.stage.findUnique({
      where: { id: toStageId },
      select: { isClosedWon: true, isClosedLost: true },
    });
    if (next?.isClosedWon) {
      eventBus.publish({ type: 'opportunity.won', entityId: id, actorId: actor.id, data: { opportunityId: id, contactId: opp.contactId, userId: actor.id } });
    }
    if (next?.isClosedLost) {
      eventBus.publish({ type: 'opportunity.lost', entityId: id, actorId: actor.id, data: { opportunityId: id, contactId: opp.contactId, userId: actor.id } });
    }
  }

  return { ok: true };
}

export async function reorderOpportunity(
  actor: Actor,
  id: string,
  order: number,
): Promise<{ ok: true }> {
  const opp = await prisma.opportunity.findFirst({
    where: { AND: [{ id }, ownerScope(actor)] },
    select: { id: true, stageId: true },
  });
  if (!opp) throw new OpportunityError('NOT_FOUND', 'Oportunidade não encontrada', 404);

  const targetOrder = Math.max(0, Math.floor(order));
  await prisma.$transaction(async (tx) => {
    await renumberStage(tx, opp.stageId, id, targetOrder);
  });
  return { ok: true };
}

// Renumera a coluna inteira em sequência. Se `placeId` for fornecido,
// força esse id na posição `placeAt`. Se não, só compacta.
async function renumberStage(
  tx: Prisma.TransactionClient,
  stageId: string,
  placeId: string | null,
  placeAt: number,
) {
  const all = await tx.opportunity.findMany({
    where: { stageId },
    orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
    select: { id: true },
  });
  let ids = all.map((o) => o.id);

  if (placeId) {
    ids = ids.filter((x) => x !== placeId);
    const at = Math.min(Math.max(0, placeAt), ids.length);
    ids.splice(at, 0, placeId);
  }

  for (let i = 0; i < ids.length; i++) {
    await tx.opportunity.update({ where: { id: ids[i]! }, data: { order: i } });
  }
}

// ============================================================
// DELETE
// ============================================================

export async function deleteOpportunity(actor: Actor, id: string): Promise<{ ok: true }> {
  const opp = await prisma.opportunity.findFirst({
    where: { AND: [{ id }, ownerScope(actor)] },
    select: { id: true, stageId: true },
  });
  if (!opp) throw new OpportunityError('NOT_FOUND', 'Oportunidade não encontrada', 404);
  await prisma.$transaction(async (tx) => {
    await tx.opportunity.delete({ where: { id } });
    await renumberStage(tx, opp.stageId, null, 0);
  });
  return { ok: true };
}

// ============================================================
// HISTORY LIST (com filtro por grupo)
// ============================================================

export type HistoryFilter =
  | 'ALL'
  | 'STAGE_CHANGED'
  | 'FIELD_UPDATED'
  | 'TAG'
  | 'OWNER'
  | 'REMINDER'
  | 'FILE'
  | 'DESCRIPTION';

const HISTORY_GROUPS: Record<HistoryFilter, string[] | null> = {
  ALL: null,
  STAGE_CHANGED: ['STAGE_CHANGE'],
  FIELD_UPDATED: ['FIELD_UPDATE', 'VALUE_CHANGED', 'PRIORITY_CHANGED'],
  TAG: ['TAG_ADDED', 'TAG_REMOVED'],
  OWNER: ['OWNER_CHANGED'],
  REMINDER: ['REMINDER_CREATED', 'REMINDER_COMPLETED'],
  FILE: ['FILE_UPLOADED', 'FILE_DELETED'],
  DESCRIPTION: ['DESCRIPTION_UPDATED'],
};

export type HistoryEntry = {
  id: string;
  action: string;
  fromStageId: string | null;
  toStageId: string | null;
  fromStageName: string | null;
  toStageName: string | null;
  metadata: unknown;
  user: { id: string; name: string; avatar: string | null } | null;
  createdAt: string;
};

export async function listHistory(
  actor: Actor,
  opportunityId: string,
  filter: HistoryFilter,
): Promise<HistoryEntry[]> {
  const opp = await prisma.opportunity.findFirst({
    where: { AND: [{ id: opportunityId }, ownerScope(actor)] },
    select: { id: true },
  });
  if (!opp) throw new OpportunityError('NOT_FOUND', 'Oportunidade não encontrada', 404);

  const actions = HISTORY_GROUPS[filter];
  const rows = await prisma.opportunityHistory.findMany({
    where: {
      opportunityId,
      ...(actions ? { action: { in: actions as never[] } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { id: true, name: true, avatar: true } },
      fromStage: { select: { name: true } },
      toStage: { select: { name: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    fromStageId: r.fromStageId,
    toStageId: r.toStageId,
    fromStageName: r.fromStage?.name ?? null,
    toStageName: r.toStage?.name ?? null,
    metadata: r.metadata,
    user: r.user,
    createdAt: r.createdAt.toISOString(),
  }));
}

// ============================================================
// DESCRIÇÃO / TAGS / CUSTOM FIELDS (endpoints thin)
// ============================================================

export async function setDescription(
  actor: Actor,
  id: string,
  description: string | null,
): Promise<OpportunityDetail> {
  const prev = await prisma.opportunity.findFirst({
    where: { AND: [{ id }, ownerScope(actor)] },
    select: { id: true, description: true },
  });
  if (!prev) throw new OpportunityError('NOT_FOUND', 'Oportunidade não encontrada', 404);

  await prisma.opportunity.update({ where: { id }, data: { description } });

  if ((prev.description ?? null) !== (description ?? null)) {
    await prisma.opportunityHistory.create({
      data: { opportunityId: id, action: 'DESCRIPTION_UPDATED', userId: actor.id },
    });
  }
  return getOpportunity(actor, id);
}

export async function setTags(
  actor: Actor,
  id: string,
  tagIds: string[],
): Promise<OpportunityDetail> {
  const prev = await prisma.opportunity.findFirst({
    where: { AND: [{ id }, ownerScope(actor)] },
    include: { tags: { select: { id: true } } },
  });
  if (!prev) throw new OpportunityError('NOT_FOUND', 'Oportunidade não encontrada', 404);

  await validateTags(tagIds);
  await prisma.opportunity.update({
    where: { id },
    data: { tags: { set: tagIds.map((tid) => ({ id: tid })) } },
  });

  const before = new Set(prev.tags.map((t) => t.id));
  const after = new Set(tagIds);
  const entries: Prisma.OpportunityHistoryCreateManyInput[] = [];
  for (const tid of tagIds) {
    if (!before.has(tid)) {
      entries.push({
        opportunityId: id,
        action: 'TAG_ADDED',
        userId: actor.id,
        metadata: { tagId: tid } as Prisma.InputJsonValue,
      });
    }
  }
  for (const tid of before) {
    if (!after.has(tid)) {
      entries.push({
        opportunityId: id,
        action: 'TAG_REMOVED',
        userId: actor.id,
        metadata: { tagId: tid } as Prisma.InputJsonValue,
      });
    }
  }
  if (entries.length > 0) await prisma.opportunityHistory.createMany({ data: entries });

  for (const tid of tagIds) {
    if (!before.has(tid)) {
      eventBus.publish({ type: 'opportunity.tag_added', entityId: id, actorId: actor.id, data: { opportunityId: id, contactId: prev.contactId, tagId: tid, userId: actor.id } });
    }
  }
  for (const tid of before) {
    if (!after.has(tid)) {
      eventBus.publish({ type: 'opportunity.tag_removed', entityId: id, actorId: actor.id, data: { opportunityId: id, contactId: prev.contactId, tagId: tid, userId: actor.id } });
    }
  }

  return getOpportunity(actor, id);
}

export async function setOpportunityCustomFields(
  actor: Actor,
  id: string,
  rows: { customFieldId: string; value: string }[],
): Promise<OpportunityDetail> {
  const opp = await prisma.opportunity.findFirst({
    where: { AND: [{ id }, ownerScope(actor)] },
    select: { id: true, pipelineId: true },
  });
  if (!opp) throw new OpportunityError('NOT_FOUND', 'Oportunidade não encontrada', 404);

  const record: Record<string, string> = {};
  for (const r of rows) record[r.customFieldId] = r.value;
  await validateCustomFields(opp.pipelineId, record);

  await prisma.$transaction(
    rows.map((r) =>
      prisma.customFieldValue.upsert({
        where: { customFieldId_opportunityId: { customFieldId: r.customFieldId, opportunityId: id } },
        create: { customFieldId: r.customFieldId, opportunityId: id, value: r.value },
        update: { value: r.value },
      }),
    ),
  );

  await prisma.opportunityHistory.create({
    data: {
      opportunityId: id,
      action: 'FIELD_UPDATE',
      userId: actor.id,
      metadata: { fields: ['customFields'] } as Prisma.InputJsonValue,
    },
  });

  for (const r of rows) {
    eventBus.publish({
      type: 'opportunity.field_updated',
      entityId: id,
      actorId: actor.id,
      data: { opportunityId: id, customFieldId: r.customFieldId, value: r.value, userId: actor.id },
    });
  }

  return getOpportunity(actor, id);
}

// ============================================================
// EXPORT CSV
// ============================================================

export async function exportOpportunitiesCsv(
  actor: Actor,
  pipelineId: string,
  filters: BoardFilters,
): Promise<string> {
  const board = await getBoard(actor, pipelineId, filters);
  const customFields = await prisma.pipelineCustomField.findMany({
    where: { pipelineId, visible: true },
    include: { customField: { select: { name: true } } },
    orderBy: { order: 'asc' },
  });

  // Para puxar valores dos custom fields:
  const oppIds = board.columns.flatMap((c) => c.opportunities.map((o) => o.id));
  const cfValues =
    oppIds.length > 0
      ? await prisma.customFieldValue.findMany({
          where: { opportunityId: { in: oppIds } },
          select: { opportunityId: true, customFieldId: true, value: true },
        })
      : [];
  const cfMap = new Map<string, Map<string, string>>();
  for (const v of cfValues) {
    if (!cfMap.has(v.opportunityId)) cfMap.set(v.opportunityId, new Map());
    cfMap.get(v.opportunityId)!.set(v.customFieldId, v.value);
  }

  const header = [
    'id', 'titulo', 'contato', 'etapa', 'valor', 'prioridade',
    'responsavel', 'tags', 'vencimento', 'criado_em',
    ...customFields.map((cf) => cf.customField.name),
  ];
  const lines = [header.map(csvEscape).join(',')];
  for (const col of board.columns) {
    for (const o of col.opportunities) {
      const row = [
        o.id,
        o.title,
        o.contactName,
        col.stageName,
        o.value.toFixed(2),
        o.priority,
        o.ownerName ?? '',
        o.tags.map((t) => t.name).join('; '),
        o.dueDate ? new Date(o.dueDate).toISOString() : '',
        new Date(o.createdAt).toISOString(),
        ...customFields.map((cf) => cfMap.get(o.id)?.get(cf.customFieldId) ?? ''),
      ];
      lines.push(row.map(csvEscape).join(','));
    }
  }
  return '\uFEFF' + lines.join('\n');
}

function csvEscape(v: string): string {
  if (v.includes(',') || v.includes('"') || v.includes('\n')) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}
