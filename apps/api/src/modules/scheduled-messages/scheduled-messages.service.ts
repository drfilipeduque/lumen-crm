// Service de mensagens agendadas individuais.
// Suporta envio TEXT (livre), TEMPLATE (Meta Cloud) e SCRIPT (texto renderizado).
// O dispatch acontece via worker BullMQ (scheduled-message.worker.ts).

import { prisma, Prisma } from '../../lib/prisma.js';
import { enqueueScheduledMessage, removeScheduledMessage } from './scheduled-messages.queue.js';
import type {
  CreateScheduledMessageInput,
  UpdateScheduledMessageInput,
} from './scheduled-messages.schemas.js';

export class ScheduledMessageError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

type Actor = { id: string; role: string };

// Permissão: ADMIN passa direto; demais precisam ter acesso ao contato (ser owner)
// ou à opportunity (ser owner). Como contatos/opps já têm seu próprio scope check,
// reusa a lógica via consulta direta.
async function ensureCanAccessContact(actor: Actor, contactId: string) {
  if (actor.role === 'ADMIN') return;
  const c = await prisma.contact.findFirst({
    where: { id: contactId, OR: [{ ownerId: actor.id }, { ownerId: null }] },
    select: { id: true },
  });
  if (!c) throw new ScheduledMessageError('FORBIDDEN', 'Sem permissão pra esse contato', 403);
}

async function ensureCanAccessOpportunity(actor: Actor, opportunityId: string) {
  if (actor.role === 'ADMIN') return;
  const o = await prisma.opportunity.findFirst({
    where: { id: opportunityId, OR: [{ ownerId: actor.id }, { ownerId: null }] },
    select: { id: true },
  });
  if (!o) throw new ScheduledMessageError('FORBIDDEN', 'Sem permissão pra essa oportunidade', 403);
}

export async function createScheduledMessage(actor: Actor, input: CreateScheduledMessageInput) {
  await ensureCanAccessContact(actor, input.contactId);
  if (input.opportunityId) await ensureCanAccessOpportunity(actor, input.opportunityId);

  // Valida conexão e tipo de conteúdo
  const conn = await prisma.whatsAppConnection.findUnique({
    where: { id: input.connectionId },
    select: { id: true, type: true, active: true },
  });
  if (!conn) throw new ScheduledMessageError('CONNECTION_NOT_FOUND', 'Conexão não encontrada', 404);
  if (!conn.active) throw new ScheduledMessageError('CONNECTION_INACTIVE', 'Conexão desativada', 400);

  if (input.contentType === 'TEMPLATE') {
    if (conn.type !== 'OFFICIAL') {
      throw new ScheduledMessageError(
        'TEMPLATE_NEEDS_OFFICIAL',
        'Templates só podem ser enviados por conexão Meta Oficial',
        400,
      );
    }
    const tmpl = await prisma.template.findUnique({
      where: { id: input.content },
      select: { id: true, connectionId: true, status: true },
    });
    if (!tmpl) throw new ScheduledMessageError('TEMPLATE_NOT_FOUND', 'Template não encontrado', 404);
    if (tmpl.connectionId !== conn.id) {
      throw new ScheduledMessageError('TEMPLATE_MISMATCH', 'Template não pertence a essa conexão', 400);
    }
    if (tmpl.status !== 'APPROVED') {
      throw new ScheduledMessageError('TEMPLATE_NOT_APPROVED', 'Template não aprovado pela Meta', 400);
    }
  } else if (input.contentType === 'SCRIPT') {
    const sc = await prisma.script.findUnique({
      where: { id: input.content },
      select: { id: true },
    });
    if (!sc) throw new ScheduledMessageError('SCRIPT_NOT_FOUND', 'Script não encontrado', 404);
  }

  const scheduledAt = new Date(input.scheduledAt);
  const created = await prisma.scheduledMessage.create({
    data: {
      contactId: input.contactId,
      opportunityId: input.opportunityId ?? null,
      connectionId: input.connectionId,
      scheduledAt,
      contentType: input.contentType,
      content: input.content,
      templateVariables: (input.templateVariables ?? {}) as Prisma.InputJsonValue,
      mediaUrl: input.mediaUrl ?? null,
      mediaName: input.mediaName ?? null,
      mediaMimeType: input.mediaMimeType ?? null,
      status: 'PENDING',
      createdById: actor.id,
    },
  });
  // Se o enqueue falhar (Redis indisponível, etc.), removemos a row pra não
  // ficar fantasma — sem job, ela nunca dispararia.
  try {
    await enqueueScheduledMessage(created.id, scheduledAt);
  } catch (err) {
    await prisma.scheduledMessage.delete({ where: { id: created.id } }).catch(() => {});
    const msg = err instanceof Error ? err.message : 'fila indisponível';
    throw new ScheduledMessageError('ENQUEUE_FAILED', `Falha ao enfileirar: ${msg}`, 503);
  }
  return created;
}

export async function listScheduledMessages(filters: {
  contactId?: string;
  opportunityId?: string;
  status?: 'PENDING' | 'SENT' | 'FAILED' | 'CANCELLED';
  page?: number;
  limit?: number;
}) {
  const page = filters.page ?? 1;
  const limit = filters.limit ?? 50;
  const where: Prisma.ScheduledMessageWhereInput = {};
  if (filters.contactId) where.contactId = filters.contactId;
  if (filters.opportunityId) where.opportunityId = filters.opportunityId;
  if (filters.status) where.status = filters.status;
  const [data, total] = await Promise.all([
    prisma.scheduledMessage.findMany({
      where,
      orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
      include: {
        contact: { select: { id: true, name: true, phone: true } },
        opportunity: { select: { id: true, title: true } },
        connection: { select: { id: true, name: true, type: true } },
        createdBy: { select: { id: true, name: true } },
      },
    }),
    prisma.scheduledMessage.count({ where }),
  ]);
  return { data, total, page, totalPages: Math.ceil(total / limit) };
}

export async function getScheduledMessage(id: string) {
  const m = await prisma.scheduledMessage.findUnique({
    where: { id },
    include: {
      contact: { select: { id: true, name: true, phone: true } },
      opportunity: { select: { id: true, title: true } },
      connection: { select: { id: true, name: true, type: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });
  if (!m) throw new ScheduledMessageError('NOT_FOUND', 'Mensagem agendada não encontrada', 404);
  return m;
}

export async function updateScheduledMessage(
  actor: Actor,
  id: string,
  input: UpdateScheduledMessageInput,
) {
  const cur = await prisma.scheduledMessage.findUnique({ where: { id } });
  if (!cur) throw new ScheduledMessageError('NOT_FOUND', 'Mensagem não encontrada', 404);
  if (cur.status !== 'PENDING') {
    throw new ScheduledMessageError('NOT_EDITABLE', 'Apenas mensagens pendentes podem ser editadas', 400);
  }
  await ensureCanAccessContact(actor, cur.contactId);

  const data: Prisma.ScheduledMessageUpdateInput = {};
  if (input.scheduledAt !== undefined) data.scheduledAt = new Date(input.scheduledAt);
  if (input.contentType !== undefined) data.contentType = input.contentType;
  if (input.content !== undefined) data.content = input.content;
  if (input.templateVariables !== undefined)
    data.templateVariables = input.templateVariables as Prisma.InputJsonValue;
  if (input.mediaUrl !== undefined) data.mediaUrl = input.mediaUrl;
  if (input.mediaName !== undefined) data.mediaName = input.mediaName;
  if (input.mediaMimeType !== undefined) data.mediaMimeType = input.mediaMimeType;
  if (input.connectionId !== undefined) data.connection = { connect: { id: input.connectionId } };

  const updated = await prisma.scheduledMessage.update({ where: { id }, data });

  // Reagenda no BullMQ se a data mudou
  if (input.scheduledAt) {
    await removeScheduledMessage(id);
    await enqueueScheduledMessage(id, updated.scheduledAt);
  }
  return updated;
}

export async function cancelScheduledMessage(actor: Actor, id: string) {
  const cur = await prisma.scheduledMessage.findUnique({ where: { id } });
  if (!cur) throw new ScheduledMessageError('NOT_FOUND', 'Mensagem não encontrada', 404);
  if (cur.status !== 'PENDING') {
    throw new ScheduledMessageError('NOT_CANCELLABLE', 'Mensagem não está pendente', 400);
  }
  await ensureCanAccessContact(actor, cur.contactId);
  await removeScheduledMessage(id);
  return prisma.scheduledMessage.update({
    where: { id },
    data: { status: 'CANCELLED' },
  });
}

// Counters pra UI
export async function countScheduledForContact(contactId: string): Promise<number> {
  return prisma.scheduledMessage.count({ where: { contactId, status: 'PENDING' } });
}

export async function countScheduledForOpportunity(opportunityId: string): Promise<number> {
  return prisma.scheduledMessage.count({ where: { opportunityId, status: 'PENDING' } });
}
