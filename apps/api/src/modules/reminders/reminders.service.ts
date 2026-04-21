import { prisma, type Prisma } from '../../lib/prisma.js';

export class ReminderError extends Error {
  status: number;
  code: string;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

type Actor = { id: string; role: string };

function ownerScope(actor: Actor): Prisma.OpportunityWhereInput {
  if (actor.role === 'ADMIN') return {};
  return { OR: [{ ownerId: actor.id }, { ownerId: null }] };
}

async function assertOpportunityVisible(actor: Actor, opportunityId: string) {
  const opp = await prisma.opportunity.findFirst({
    where: { AND: [{ id: opportunityId }, ownerScope(actor)] },
    select: { id: true },
  });
  if (!opp) throw new ReminderError('NOT_FOUND', 'Oportunidade não encontrada', 404);
}

async function assertReminderVisible(actor: Actor, reminderId: string) {
  const r = await prisma.reminder.findUnique({
    where: { id: reminderId },
    include: { opportunity: { select: { id: true, ownerId: true } } },
  });
  if (!r) throw new ReminderError('NOT_FOUND', 'Lembrete não encontrado', 404);
  if (actor.role !== 'ADMIN') {
    const mine = r.opportunity.ownerId === actor.id || r.opportunity.ownerId === null;
    if (!mine) throw new ReminderError('FORBIDDEN', 'Sem acesso', 403);
  }
  return r;
}

export type ReminderDTO = {
  id: string;
  opportunityId: string;
  opportunity?: { id: string; title: string; contactName: string } | null;
  title: string;
  description: string | null;
  dueAt: string;
  effectiveDueAt: string;
  completed: boolean;
  completedAt: string | null;
  snoozedUntil: string | null;
  notified: boolean;
  notifiedAt: string | null;
  seenAt: string | null;
  createdBy: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
  overdue: boolean;
};

function toDTO(r: {
  id: string;
  opportunityId: string;
  opportunity?: { id: string; title: string; contact: { name: string } } | null;
  title: string;
  description: string | null;
  dueAt: Date;
  completed: boolean;
  completedAt: Date | null;
  snoozedUntil: Date | null;
  notified: boolean;
  notifiedAt: Date | null;
  seenAt: Date | null;
  user: { id: string; name: string } | null;
  createdAt: Date;
  updatedAt: Date;
}): ReminderDTO {
  const effective = r.snoozedUntil && r.snoozedUntil > r.dueAt ? r.snoozedUntil : r.dueAt;
  const overdue = !r.completed && effective < new Date();
  return {
    id: r.id,
    opportunityId: r.opportunityId,
    opportunity: r.opportunity
      ? { id: r.opportunity.id, title: r.opportunity.title, contactName: r.opportunity.contact.name }
      : null,
    title: r.title,
    description: r.description,
    dueAt: r.dueAt.toISOString(),
    effectiveDueAt: effective.toISOString(),
    completed: r.completed,
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
    snoozedUntil: r.snoozedUntil ? r.snoozedUntil.toISOString() : null,
    notified: r.notified,
    notifiedAt: r.notifiedAt ? r.notifiedAt.toISOString() : null,
    seenAt: r.seenAt ? r.seenAt.toISOString() : null,
    createdBy: r.user,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    overdue,
  };
}

export async function listReminders(actor: Actor, opportunityId: string): Promise<ReminderDTO[]> {
  await assertOpportunityVisible(actor, opportunityId);
  const reminders = await prisma.reminder.findMany({
    where: { opportunityId },
    orderBy: [{ completed: 'asc' }, { dueAt: 'asc' }],
    include: { user: { select: { id: true, name: true } } },
  });
  return reminders.map(toDTO);
}

type CreateInput = { title: string; description?: string | null; dueAt: string };

export async function createReminder(actor: Actor, opportunityId: string, input: CreateInput): Promise<ReminderDTO> {
  await assertOpportunityVisible(actor, opportunityId);
  const due = new Date(input.dueAt);
  if (Number.isNaN(due.getTime())) {
    throw new ReminderError('INVALID_DATE', 'Data inválida', 400);
  }
  const created = await prisma.reminder.create({
    data: {
      opportunityId,
      userId: actor.id,
      title: input.title,
      description: input.description ?? null,
      dueAt: due,
    },
    include: { user: { select: { id: true, name: true } } },
  });
  await prisma.opportunityHistory.create({
    data: {
      opportunityId,
      action: 'REMINDER_CREATED',
      userId: actor.id,
      metadata: { reminderId: created.id, title: created.title } as Prisma.InputJsonValue,
    },
  });
  return toDTO(created);
}

type UpdateInput = {
  title?: string;
  description?: string | null;
  dueAt?: string;
  completed?: boolean;
  snoozedUntil?: string | null;
};

export async function updateReminder(actor: Actor, id: string, input: UpdateInput): Promise<ReminderDTO> {
  const prev = await assertReminderVisible(actor, id);

  const data: Prisma.ReminderUpdateInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.description !== undefined) data.description = input.description;
  if (input.dueAt !== undefined) {
    const d = new Date(input.dueAt);
    if (Number.isNaN(d.getTime())) throw new ReminderError('INVALID_DATE', 'Data inválida', 400);
    data.dueAt = d;
  }
  if (input.snoozedUntil !== undefined) {
    if (input.snoozedUntil === null) data.snoozedUntil = null;
    else {
      const d = new Date(input.snoozedUntil);
      if (Number.isNaN(d.getTime())) throw new ReminderError('INVALID_DATE', 'Data inválida', 400);
      data.snoozedUntil = d;
    }
  }
  if (input.completed !== undefined) {
    data.completed = input.completed;
    data.completedAt = input.completed ? new Date() : null;
  }

  const updated = await prisma.reminder.update({
    where: { id },
    data,
    include: { user: { select: { id: true, name: true } } },
  });

  if (input.completed === true && !prev.completed) {
    await prisma.opportunityHistory.create({
      data: {
        opportunityId: updated.opportunityId,
        action: 'REMINDER_COMPLETED',
        userId: actor.id,
        metadata: { reminderId: updated.id, title: updated.title } as Prisma.InputJsonValue,
      },
    });
  }

  return toDTO(updated);
}

export async function snoozeReminder(
  actor: Actor,
  id: string,
  args: { until?: string; preset?: '1h' | '3h' | 'tomorrow' | 'next-week' },
): Promise<ReminderDTO> {
  await assertReminderVisible(actor, id);
  let until: Date;
  if (args.until) {
    until = new Date(args.until);
    if (Number.isNaN(until.getTime())) throw new ReminderError('INVALID_DATE', 'Data inválida', 400);
  } else if (args.preset) {
    until = computePreset(args.preset);
  } else {
    throw new ReminderError('INVALID_INPUT', 'Informe until ou preset', 400);
  }
  const updated = await prisma.reminder.update({
    where: { id },
    data: { snoozedUntil: until },
    include: { user: { select: { id: true, name: true } } },
  });
  return toDTO(updated);
}

function computePreset(preset: '1h' | '3h' | 'tomorrow' | 'next-week'): Date {
  const now = new Date();
  switch (preset) {
    case '1h':
      return new Date(now.getTime() + 60 * 60 * 1000);
    case '3h':
      return new Date(now.getTime() + 3 * 60 * 60 * 1000);
    case 'tomorrow': {
      const t = new Date(now);
      t.setDate(t.getDate() + 1);
      t.setHours(9, 0, 0, 0);
      return t;
    }
    case 'next-week': {
      const t = new Date(now);
      t.setDate(t.getDate() + 7);
      t.setHours(9, 0, 0, 0);
      return t;
    }
  }
}

export async function completeReminder(actor: Actor, id: string): Promise<ReminderDTO> {
  return updateReminder(actor, id, { completed: true });
}

export async function deleteReminder(actor: Actor, id: string): Promise<{ ok: true }> {
  await assertReminderVisible(actor, id);
  await prisma.reminder.delete({ where: { id } });
  return { ok: true };
}

// ============================================================
// LISTAGEM GLOBAL
// ============================================================

export type ListReminderStatus = 'PENDING' | 'OVERDUE' | 'COMPLETED' | 'ALL';
export type ListReminderPeriod = 'today' | 'week' | 'month' | 'all';

export async function listGlobalReminders(
  actor: Actor,
  args: { status: ListReminderStatus; period: ListReminderPeriod; userId?: string },
): Promise<ReminderDTO[]> {
  // Apenas admin pode passar userId arbitrário; demais sempre veem só os seus
  const filterUserId = actor.role === 'ADMIN' && args.userId ? args.userId : actor.id;
  const now = new Date();

  const where: Prisma.ReminderWhereInput = { userId: filterUserId };

  if (args.status === 'PENDING') {
    where.completed = false;
    where.OR = [
      { snoozedUntil: { not: null, gt: now } },
      { snoozedUntil: null, dueAt: { gt: now } },
    ];
  } else if (args.status === 'OVERDUE') {
    where.completed = false;
    where.OR = [
      { snoozedUntil: { not: null, lte: now } },
      { snoozedUntil: null, dueAt: { lte: now } },
    ];
  } else if (args.status === 'COMPLETED') {
    where.completed = true;
  }

  if (args.period !== 'all') {
    const range = periodRange(args.period);
    if (range) {
      where.dueAt = { ...(typeof where.dueAt === 'object' ? where.dueAt : {}), ...range };
    }
  }

  const reminders = await prisma.reminder.findMany({
    where,
    orderBy: [{ completed: 'asc' }, { dueAt: 'asc' }],
    include: {
      user: { select: { id: true, name: true } },
      opportunity: { select: { id: true, title: true, contact: { select: { name: true } } } },
    },
  });
  return reminders.map(toDTO);
}

function periodRange(period: 'today' | 'week' | 'month'): { gte: Date; lte: Date } | null {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (period === 'today') {
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    return { gte: start, lte: end };
  }
  if (period === 'week') {
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { gte: start, lte: end };
  }
  if (period === 'month') {
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    return { gte: start, lte: end };
  }
  return null;
}

// ============================================================
// PENDING COUNT (badge do sino)
// ============================================================

export async function pendingCount(actor: Actor): Promise<number> {
  const now = new Date();
  return prisma.reminder.count({
    where: {
      userId: actor.id,
      completed: false,
      OR: [
        { snoozedUntil: { not: null, lte: now } },
        { snoozedUntil: null, dueAt: { lte: now } },
      ],
    },
  });
}

// ============================================================
// NOTIFICAÇÕES (lembretes já notificados, ainda não vistos)
// ============================================================

export async function listNotifications(actor: Actor): Promise<ReminderDTO[]> {
  const reminders = await prisma.reminder.findMany({
    where: {
      userId: actor.id,
      completed: false,
      notified: true,
      seenAt: null,
    },
    orderBy: { notifiedAt: 'desc' },
    include: {
      user: { select: { id: true, name: true } },
      opportunity: { select: { id: true, title: true, contact: { select: { name: true } } } },
    },
  });
  return reminders.map(toDTO);
}

export async function markSeen(actor: Actor, id: string): Promise<{ ok: true }> {
  await assertReminderVisible(actor, id);
  await prisma.reminder.update({
    where: { id },
    data: { seenAt: new Date() },
  });
  return { ok: true };
}

export async function markAllSeen(actor: Actor): Promise<{ ok: true; affected: number }> {
  const r = await prisma.reminder.updateMany({
    where: { userId: actor.id, notified: true, seenAt: null },
    data: { seenAt: new Date() },
  });
  return { ok: true, affected: r.count };
}

// ============================================================
// WORKER: encontra lembretes vencidos não-notificados
// (usado pelo setInterval em src/workers/reminders.ts)
// ============================================================

export async function findDueAndNotify(): Promise<{ id: string; userId: string }[]> {
  const now = new Date();
  const due = await prisma.reminder.findMany({
    where: {
      completed: false,
      notified: false,
      OR: [
        { snoozedUntil: { not: null, lte: now } },
        { snoozedUntil: null, dueAt: { lte: now } },
      ],
    },
    select: { id: true, userId: true },
    take: 200,
  });
  if (due.length === 0) return [];
  await prisma.reminder.updateMany({
    where: { id: { in: due.map((r) => r.id) } },
    data: { notified: true, notifiedAt: now },
  });
  return due;
}
