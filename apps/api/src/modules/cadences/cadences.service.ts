// Service de Cadências.
// CRUD + execução manual + pause/resume/cancel + stats + auto-start.

import { prisma, Prisma } from '../../lib/prisma.js';
import { enqueueStep } from './cadence.queue.js';
import { computeNextValidExecution, isWithinBusinessHours } from './business-hours.js';
import { renderScript, type RenderContext } from '../scripts/render.js';

export class CadenceError extends Error {
  status: number;
  code: string;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

// Contrato das mensagens dentro de Cadence.messages (Json).
export type CadenceMessageDelay = {
  // 0 (imediato) é válido só na primeira mensagem.
  value: number;
  unit: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks';
};

export type CadenceMessage = {
  id: string;
  order: number;
  // Modos:
  // - texto livre: usar `content`
  // - script: usar `scriptId` (quando setado, content vira fallback)
  content?: string;
  scriptId?: string;
  mediaUrl?: string;
  mediaType?: 'IMAGE' | 'AUDIO' | 'DOCUMENT' | 'VIDEO';
  delay: CadenceMessageDelay;
};

export type CadenceScopeConfig = {
  pipelineId?: string;
  stageId?: string;
  // Pra GROUP:
  tagIds?: string[];
  ownerId?: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  valueMin?: number;
  valueMax?: number;
};

export type CadenceCreateInput = {
  name: string;
  description?: string | null;
  active?: boolean;
  connectionId?: string | null;
  scope: 'PIPELINE' | 'STAGE' | 'OPPORTUNITY' | 'CONTACT' | 'GROUP';
  scopeConfig: CadenceScopeConfig;
  pauseOnReply?: boolean;
  respectBusinessHours?: boolean;
  businessHoursStart?: string;
  businessHoursEnd?: string;
  businessDays?: number[];
  messages: CadenceMessage[];
};

// =============================================================================
// CRUD
// =============================================================================

export async function listCadences(filters: { active?: boolean; scope?: string } = {}) {
  const where: Prisma.CadenceWhereInput = {};
  if (filters.active !== undefined) where.active = filters.active;
  if (filters.scope) where.scope = filters.scope as Prisma.EnumCadenceScopeFilter['equals'];

  const rows = await prisma.cadence.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      connection: { select: { id: true, name: true, type: true } },
      _count: { select: { executions: true } },
    },
  });

  // Calcula contagem ativa (não cabe em _count com filtro sem groupBy).
  const activeCounts = await prisma.cadenceExecution.groupBy({
    by: ['cadenceId'],
    where: { status: 'ACTIVE' },
    _count: { _all: true },
  });
  const activeMap = new Map(activeCounts.map((a) => [a.cadenceId, a._count._all]));

  return rows.map((r) => ({
    ...r,
    messageCount: Array.isArray(r.messages) ? (r.messages as unknown[]).length : 0,
    activeExecutions: activeMap.get(r.id) ?? 0,
  }));
}

export async function getCadence(id: string) {
  const c = await prisma.cadence.findUnique({
    where: { id },
    include: {
      connection: { select: { id: true, name: true, type: true } },
    },
  });
  if (!c) throw new CadenceError('NOT_FOUND', 'Cadência não encontrada', 404);
  return c;
}

function validateMessages(msgs: CadenceMessage[]) {
  if (!Array.isArray(msgs) || msgs.length === 0) {
    throw new CadenceError('INVALID_MESSAGES', 'Cadência precisa de pelo menos 1 mensagem');
  }
  msgs.forEach((m, i) => {
    if (!m.content && !m.scriptId) {
      throw new CadenceError('INVALID_MESSAGE', `Mensagem ${i + 1} precisa de texto ou script`);
    }
  });
}

export async function createCadence(input: CadenceCreateInput) {
  validateMessages(input.messages);
  const created = await prisma.cadence.create({
    data: {
      name: input.name,
      description: input.description ?? null,
      active: input.active ?? true,
      connectionId: input.connectionId ?? null,
      scope: input.scope,
      scopeConfig: (input.scopeConfig ?? {}) as Prisma.InputJsonValue,
      pauseOnReply: input.pauseOnReply ?? true,
      respectBusinessHours: input.respectBusinessHours ?? true,
      businessHoursStart: input.businessHoursStart ?? '09:00',
      businessHoursEnd: input.businessHoursEnd ?? '18:00',
      businessDays: input.businessDays ?? [1, 2, 3, 4, 5],
      messages: input.messages as unknown as Prisma.InputJsonValue,
    },
  });
  // Se nasce ativa com escopo PIPELINE/STAGE/GROUP, dispara pros leads
  // que já estão no escopo. Idempotente — não duplica execuções existentes.
  if (created.active && ['PIPELINE', 'STAGE', 'GROUP'].includes(created.scope)) {
    void backfillCadence(created.id).catch(() => {});
  }
  return created;
}

export async function updateCadence(id: string, input: Partial<CadenceCreateInput>) {
  const before = await getCadence(id);
  if (input.messages) validateMessages(input.messages);
  const data: Prisma.CadenceUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.description !== undefined) data.description = input.description;
  if (input.active !== undefined) data.active = input.active;
  if (input.connectionId !== undefined) {
    data.connection = input.connectionId
      ? { connect: { id: input.connectionId } }
      : { disconnect: true };
  }
  if (input.scope !== undefined) data.scope = input.scope;
  if (input.scopeConfig !== undefined) data.scopeConfig = input.scopeConfig as Prisma.InputJsonValue;
  if (input.pauseOnReply !== undefined) data.pauseOnReply = input.pauseOnReply;
  if (input.respectBusinessHours !== undefined) data.respectBusinessHours = input.respectBusinessHours;
  if (input.businessHoursStart !== undefined) data.businessHoursStart = input.businessHoursStart;
  if (input.businessHoursEnd !== undefined) data.businessHoursEnd = input.businessHoursEnd;
  if (input.businessDays !== undefined) data.businessDays = input.businessDays;
  if (input.messages !== undefined) data.messages = input.messages as unknown as Prisma.InputJsonValue;
  const updated = await prisma.cadence.update({ where: { id }, data });

  // Backfill se acabou de ser ativada OU se o escopo mudou enquanto ativa.
  const becameActive = !before.active && updated.active;
  const scopeChanged =
    updated.active &&
    (before.scope !== updated.scope ||
      JSON.stringify(before.scopeConfig) !== JSON.stringify(updated.scopeConfig));
  if (
    (becameActive || scopeChanged) &&
    ['PIPELINE', 'STAGE', 'GROUP'].includes(updated.scope)
  ) {
    void backfillCadence(updated.id).catch(() => {});
  }
  return updated;
}

export async function toggleCadence(id: string) {
  const c = await getCadence(id);
  const updated = await prisma.cadence.update({ where: { id }, data: { active: !c.active } });
  // Toggle ativando: dispara backfill pros leads que já estão no escopo.
  if (updated.active && ['PIPELINE', 'STAGE', 'GROUP'].includes(updated.scope)) {
    void backfillCadence(updated.id).catch(() => {});
  }
  return updated;
}

// Cancelando a cadência também cancela todas executions ativas.
export async function deleteCadence(id: string) {
  await getCadence(id);
  await prisma.cadenceExecution.updateMany({
    where: { cadenceId: id, status: { in: ['ACTIVE', 'PAUSED'] } },
    data: { status: 'CANCELLED', nextExecutionAt: null },
  });
  await prisma.cadence.delete({ where: { id } });
  return { ok: true as const };
}

export async function duplicateCadence(id: string) {
  const src = await getCadence(id);
  const copy = await prisma.cadence.create({
    data: {
      name: `${src.name} (cópia)`,
      description: src.description,
      active: false, // cópia começa pausada
      connectionId: src.connectionId,
      scope: src.scope,
      scopeConfig: src.scopeConfig as Prisma.InputJsonValue,
      pauseOnReply: src.pauseOnReply,
      respectBusinessHours: src.respectBusinessHours,
      businessHoursStart: src.businessHoursStart,
      businessHoursEnd: src.businessHoursEnd,
      businessDays: src.businessDays,
      messages: src.messages as unknown as Prisma.InputJsonValue,
    },
  });
  return copy;
}

// =============================================================================
// EXECUTIONS
// =============================================================================

export async function listExecutions(
  cadenceId: string,
  filters: { status?: string; page?: number; limit?: number } = {},
) {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.max(1, Math.min(100, filters.limit ?? 25));
  const where: Prisma.CadenceExecutionWhereInput = { cadenceId };
  if (filters.status) where.status = filters.status as Prisma.CadenceExecutionWhereInput['status'];
  const [data, total] = await Promise.all([
    prisma.cadenceExecution.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        contact: { select: { id: true, name: true, phone: true, avatar: true } },
        opportunity: { select: { id: true, title: true } },
      },
    }),
    prisma.cadenceExecution.count({ where }),
  ]);
  return { data, total, page, totalPages: Math.ceil(total / limit) };
}

// Resolve a "data inicial" pro primeiro step. Imediato = agora.
function delayMs(d: CadenceMessageDelay): number {
  switch (d.unit) {
    case 'seconds':
      return d.value * 1_000;
    case 'minutes':
      return d.value * 60_000;
    case 'hours':
      return d.value * 3_600_000;
    case 'days':
      return d.value * 86_400_000;
    case 'weeks':
      return d.value * 7 * 86_400_000;
    default:
      return 0;
  }
}

// Inicia uma execution e enfileira o primeiro step.
async function startExecution(args: {
  cadenceId: string;
  contactId: string;
  opportunityId?: string | null;
  connectionId?: string | null;
}) {
  const { cadenceId, contactId, opportunityId, connectionId } = args;
  const cadence = await getCadence(cadenceId);
  if (!cadence.active) throw new CadenceError('INACTIVE', 'Cadência está desativada');

  // Idempotência: se já existe execution ACTIVE/PAUSED da mesma cadência pra
  // mesma opportunity (ou contato, em escopo CONTACT), reaproveita em vez de duplicar.
  const existing = await prisma.cadenceExecution.findFirst({
    where: {
      cadenceId,
      contactId,
      opportunityId: opportunityId ?? null,
      status: { in: ['ACTIVE', 'PAUSED'] },
    },
  });
  if (existing) return existing;

  const messages = (cadence.messages as unknown as CadenceMessage[]) ?? [];
  if (messages.length === 0) throw new CadenceError('NO_MESSAGES', 'Cadência sem mensagens');

  // Primeira mensagem dispara segundo o delay configurado (0 = imediato).
  const firstDelay = delayMs(messages[0]?.delay ?? { value: 0, unit: 'minutes' });
  let nextAt = new Date(Date.now() + firstDelay);
  if (cadence.respectBusinessHours) {
    nextAt = computeNextValidExecution(
      nextAt,
      cadence.businessHoursStart,
      cadence.businessHoursEnd,
      cadence.businessDays,
    );
  }

  const exec = await prisma.cadenceExecution.create({
    data: {
      cadenceId,
      contactId,
      opportunityId: opportunityId ?? null,
      connectionId: connectionId ?? cadence.connectionId ?? null,
      currentStep: 0,
      status: 'ACTIVE',
      nextExecutionAt: nextAt,
      completedSteps: [] as unknown as Prisma.InputJsonValue,
    },
  });

  await enqueueStep(exec.id, Math.max(0, nextAt.getTime() - Date.now()));
  return exec;
}

export async function startForOpportunity(cadenceId: string, opportunityId: string) {
  const op = await prisma.opportunity.findUnique({
    where: { id: opportunityId },
    select: { id: true, contactId: true },
  });
  if (!op) throw new CadenceError('NOT_FOUND', 'Oportunidade não encontrada', 404);
  return startExecution({ cadenceId, contactId: op.contactId, opportunityId: op.id });
}

export async function startForContact(cadenceId: string, contactId: string) {
  const c = await prisma.contact.findUnique({ where: { id: contactId }, select: { id: true } });
  if (!c) throw new CadenceError('NOT_FOUND', 'Contato não encontrado', 404);
  return startExecution({ cadenceId, contactId: c.id });
}

// Cria uma execution pra cada alvo (uso em start manual em batch).
export async function startBatch(
  cadenceId: string,
  args: { opportunityIds?: string[]; contactIds?: string[] },
): Promise<{ started: number; skipped: number }> {
  let started = 0;
  let skipped = 0;
  for (const id of args.opportunityIds ?? []) {
    try {
      await startForOpportunity(cadenceId, id);
      started++;
    } catch {
      skipped++;
    }
  }
  for (const id of args.contactIds ?? []) {
    try {
      await startForContact(cadenceId, id);
      started++;
    } catch {
      skipped++;
    }
  }
  return { started, skipped };
}

export async function pauseExecution(id: string, reason = 'Pausada manualmente') {
  const ex = await prisma.cadenceExecution.findUnique({ where: { id } });
  if (!ex) throw new CadenceError('NOT_FOUND', 'Execução não encontrada', 404);
  if (ex.status !== 'ACTIVE') throw new CadenceError('NOT_ACTIVE', 'Execução não está ativa');
  return prisma.cadenceExecution.update({
    where: { id },
    data: { status: 'PAUSED', pauseReason: reason },
  });
}

export async function resumeExecution(id: string) {
  const ex = await prisma.cadenceExecution.findUnique({ where: { id } });
  if (!ex) throw new CadenceError('NOT_FOUND', 'Execução não encontrada', 404);
  if (ex.status !== 'PAUSED') throw new CadenceError('NOT_PAUSED', 'Execução não está pausada');
  // Re-enfileira o step atual imediatamente (a worker faz a próxima checagem).
  const updated = await prisma.cadenceExecution.update({
    where: { id },
    data: { status: 'ACTIVE', pauseReason: null, nextExecutionAt: new Date() },
  });
  await enqueueStep(id, 0);
  return updated;
}

export async function cancelExecution(id: string) {
  const ex = await prisma.cadenceExecution.findUnique({ where: { id } });
  if (!ex) throw new CadenceError('NOT_FOUND', 'Execução não encontrada', 404);
  if (ex.status === 'COMPLETED' || ex.status === 'CANCELLED') return ex;
  return prisma.cadenceExecution.update({
    where: { id },
    data: { status: 'CANCELLED', nextExecutionAt: null },
  });
}

// =============================================================================
// STATS
// =============================================================================

export async function getStats(cadenceId: string) {
  await getCadence(cadenceId);
  const grouped = await prisma.cadenceExecution.groupBy({
    by: ['status'],
    where: { cadenceId },
    _count: { _all: true },
  });
  const map = new Map(grouped.map((g) => [g.status, g._count._all]));
  const totalStarted = grouped.reduce((acc, g) => acc + g._count._all, 0);
  const completed = map.get('COMPLETED') ?? 0;
  const paused = map.get('PAUSED') ?? 0;
  const cancelled = map.get('CANCELLED') ?? 0;
  const failed = map.get('FAILED') ?? 0;
  const active = map.get('ACTIVE') ?? 0;
  // replyRate ≈ (PAUSED por "Lead respondeu") / total iniciados.
  const repliedPause = await prisma.cadenceExecution.count({
    where: { cadenceId, status: 'PAUSED', pauseReason: 'Lead respondeu' },
  });
  const replyRate = totalStarted > 0 ? +(repliedPause / totalStarted).toFixed(4) : 0;
  return { totalStarted, active, completed, paused, cancelled, failed, replyRate };
}

// =============================================================================
// BACKFILL — chamado ao criar/ativar uma cadência com escopo PIPELINE/STAGE/GROUP
// pra disparar pros leads que JÁ estão no escopo no momento da ativação
// =============================================================================

export async function backfillCadence(
  cadenceId: string,
): Promise<{ enqueued: number; skipped: number }> {
  const cadence = await getCadence(cadenceId);
  if (!cadence.active) return { enqueued: 0, skipped: 0 };
  if (!['PIPELINE', 'STAGE', 'GROUP'].includes(cadence.scope)) {
    return { enqueued: 0, skipped: 0 };
  }
  const cfg = (cadence.scopeConfig as Record<string, unknown>) ?? {};

  const where: Prisma.OpportunityWhereInput = {};
  if (cadence.scope === 'PIPELINE') {
    where.pipelineId = cfg.pipelineId as string;
  } else if (cadence.scope === 'STAGE') {
    where.pipelineId = cfg.pipelineId as string;
    where.stageId = cfg.stageId as string;
  } else if (cadence.scope === 'GROUP') {
    const tagIds = (cfg.tagIds as string[] | undefined) ?? [];
    if (tagIds.length > 0) where.tags = { some: { id: { in: tagIds } } };
    if (cfg.ownerId) where.ownerId = cfg.ownerId as string;
    if (cfg.priority) where.priority = cfg.priority as Prisma.EnumPriorityFilter['equals'];
    const valueMin = cfg.valueMin as number | undefined;
    const valueMax = cfg.valueMax as number | undefined;
    if (valueMin !== undefined || valueMax !== undefined) {
      where.value = {
        ...(valueMin !== undefined ? { gte: valueMin } : {}),
        ...(valueMax !== undefined ? { lte: valueMax } : {}),
      };
    }
  }

  const ops = await prisma.opportunity.findMany({
    where,
    select: { id: true, contactId: true },
    take: 5000,
  });

  let enqueued = 0;
  let skipped = 0;
  for (const op of ops) {
    try {
      const exec = await startExecution({
        cadenceId,
        contactId: op.contactId,
        opportunityId: op.id,
      });
      // startExecution retorna a execution existente quando já há uma ACTIVE/PAUSED
      // pra mesma combinação — assim não duplica e não bloqueia o backfill.
      if (exec) enqueued++;
    } catch {
      skipped++;
    }
  }
  return { enqueued, skipped };
}

// =============================================================================
// AUTO-START por evento (chamado pelo listener)
// =============================================================================

// Encontra cadências PIPELINE/STAGE/GROUP que casam com um evento de oportunidade.
export async function startMatchingCadencesForOpportunity(opportunityId: string) {
  const op = await prisma.opportunity.findUnique({
    where: { id: opportunityId },
    select: {
      id: true,
      contactId: true,
      pipelineId: true,
      stageId: true,
      ownerId: true,
      priority: true,
      value: true,
      tags: { select: { id: true } },
    },
  });
  if (!op) return;

  const cadences = await prisma.cadence.findMany({
    where: { active: true, scope: { in: ['PIPELINE', 'STAGE', 'GROUP'] } },
  });

  for (const c of cadences) {
    const cfg = (c.scopeConfig as Record<string, unknown>) ?? {};
    let match = false;
    if (c.scope === 'PIPELINE') match = cfg.pipelineId === op.pipelineId;
    else if (c.scope === 'STAGE') match = cfg.pipelineId === op.pipelineId && cfg.stageId === op.stageId;
    else if (c.scope === 'GROUP') {
      const tagIds = (cfg.tagIds as string[] | undefined) ?? [];
      const ownerId = cfg.ownerId as string | undefined;
      const priority = cfg.priority as string | undefined;
      const valueMin = cfg.valueMin as number | undefined;
      const valueMax = cfg.valueMax as number | undefined;
      const opTagIds = new Set(op.tags.map((t) => t.id));
      const tagOk = tagIds.length === 0 || tagIds.some((t) => opTagIds.has(t));
      const ownerOk = !ownerId || ownerId === op.ownerId;
      const priorityOk = !priority || priority === op.priority;
      const v = Number(op.value);
      const minOk = valueMin === undefined || v >= valueMin;
      const maxOk = valueMax === undefined || v <= valueMax;
      match = tagOk && ownerOk && priorityOk && minOk && maxOk;
    }
    if (match) {
      try {
        await startExecution({
          cadenceId: c.id,
          contactId: op.contactId,
          opportunityId: op.id,
        });
      } catch {
        // Ignora erros isolados pra não quebrar a cadeia.
      }
    }
  }
}

// Pausa toda execution ACTIVE com pauseOnReply=true do contato.
export async function pauseExecutionsForContactReply(contactId: string) {
  const execs = await prisma.cadenceExecution.findMany({
    where: { contactId, status: 'ACTIVE' },
    include: { cadence: { select: { pauseOnReply: true } } },
  });
  for (const e of execs) {
    if (!e.cadence.pauseOnReply) continue;
    await prisma.cadenceExecution.update({
      where: { id: e.id },
      data: { status: 'PAUSED', pauseReason: 'Lead respondeu' },
    });
  }
}

// =============================================================================
// Render p/ worker
// =============================================================================

// Carrega o snapshot pra renderizar variáveis da mensagem.
export async function buildRenderContextForExecution(executionId: string): Promise<RenderContext> {
  const ex = await prisma.cadenceExecution.findUnique({
    where: { id: executionId },
    include: {
      contact: true,
      opportunity: { include: { stage: { select: { name: true } } } },
    },
  });
  if (!ex) return {};
  return {
    contact: ex.contact,
    opportunity: ex.opportunity
      ? {
          title: ex.opportunity.title,
          value: Number(ex.opportunity.value),
          stage: ex.opportunity.stage ? { name: ex.opportunity.stage.name } : null,
        }
      : null,
  };
}

export { isWithinBusinessHours, renderScript };
