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
  title: string;
  description: string | null;
  dueAt: string;
  completed: boolean;
  completedAt: string | null;
  snoozedUntil: string | null;
  createdBy: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
  overdue: boolean;
};

function toDTO(r: {
  id: string;
  opportunityId: string;
  title: string;
  description: string | null;
  dueAt: Date;
  completed: boolean;
  completedAt: Date | null;
  snoozedUntil: Date | null;
  user: { id: string; name: string } | null;
  createdAt: Date;
  updatedAt: Date;
}): ReminderDTO {
  const effective = r.snoozedUntil && r.snoozedUntil > r.dueAt ? r.snoozedUntil : r.dueAt;
  const overdue = !r.completed && effective < new Date();
  return {
    id: r.id,
    opportunityId: r.opportunityId,
    title: r.title,
    description: r.description,
    dueAt: r.dueAt.toISOString(),
    completed: r.completed,
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
    snoozedUntil: r.snoozedUntil ? r.snoozedUntil.toISOString() : null,
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
