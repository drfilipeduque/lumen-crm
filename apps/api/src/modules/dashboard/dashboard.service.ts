import { prisma } from '../../lib/prisma.js';
import type { Prisma } from '../../lib/prisma.js';
import { resolvePeriod, type PeriodKey } from '../../lib/period.js';

type Actor = { id: string; role: string };

const INACTIVITY_DAYS = 7;

function ownerScope(actor: Actor): Prisma.OpportunityWhereInput {
  if (actor.role === 'ADMIN') return {};
  return { ownerId: actor.id };
}

function periodFilter(period: PeriodKey, from?: string, to?: string): { gte: Date; lte: Date } {
  const r = resolvePeriod(period, from, to);
  return { gte: r.from, lte: r.to };
}

// ---------- Métricas agregadas ----------
export async function getMetrics(
  actor: Actor,
  args: { period: PeriodKey; from?: string; to?: string },
) {
  const created = periodFilter(args.period, args.from, args.to);
  const where: Prisma.OpportunityWhereInput = {
    ...ownerScope(actor),
    createdAt: created,
  };

  const [totalLeads, byStageRaw, byUserRaw, stages, users, closedWon, inactiveLeads, transitions] =
    await Promise.all([
      prisma.opportunity.count({ where }),
      prisma.opportunity.groupBy({
        by: ['stageId'],
        where,
        _count: { _all: true },
      }),
      prisma.opportunity.groupBy({
        by: ['ownerId'],
        where,
        _count: { _all: true },
      }),
      prisma.stage.findMany({ select: { id: true, name: true, order: true, isClosedWon: true } }),
      prisma.user.findMany({ where: { active: true }, select: { id: true, name: true } }),
      prisma.opportunity.count({
        where: { ...where, stage: { isClosedWon: true } },
      }),
      prisma.opportunity.count({
        where: {
          ...ownerScope(actor),
          updatedAt: { lt: new Date(Date.now() - INACTIVITY_DAYS * 86400_000) },
          stage: { isClosedWon: false, isClosedLost: false },
        },
      }),
      prisma.opportunityHistory.findMany({
        where: {
          action: 'STAGE_CHANGE',
          createdAt: created,
          opportunity: { is: ownerScope(actor) },
        },
        select: { opportunityId: true, createdAt: true },
        orderBy: [{ opportunityId: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);

  const stageById = new Map(stages.map((s) => [s.id, s] as const));
  const userById = new Map(users.map((u) => [u.id, u] as const));

  const leadsByStage = byStageRaw
    .map((row) => {
      const s = stageById.get(row.stageId);
      return {
        stageId: row.stageId,
        stageName: s?.name ?? 'Etapa removida',
        order: s?.order ?? 9999,
        count: row._count._all,
      };
    })
    .sort((a, b) => a.order - b.order)
    .map(({ order: _o, ...rest }) => rest);

  const leadsByUser = byUserRaw
    .filter((r) => r.ownerId !== null)
    .map((row) => ({
      userId: row.ownerId as string,
      userName: userById.get(row.ownerId as string)?.name ?? 'Usuário removido',
      count: row._count._all,
    }))
    .sort((a, b) => b.count - a.count);

  // Tempo médio entre transições de etapa (em minutos).
  let totalDeltaMs = 0;
  let deltaCount = 0;
  let prev: { opportunityId: string; createdAt: Date } | null = null;
  for (const h of transitions) {
    if (prev && prev.opportunityId === h.opportunityId) {
      totalDeltaMs += h.createdAt.getTime() - prev.createdAt.getTime();
      deltaCount += 1;
    }
    prev = h;
  }
  const avgTimeBetweenStages = deltaCount > 0 ? Math.round(totalDeltaMs / deltaCount / 60000) : 0;

  const conversionRate = totalLeads > 0 ? Number(((closedWon / totalLeads) * 100).toFixed(2)) : 0;

  return {
    totalLeads,
    leadsByStage,
    avgTimeBetweenStages,
    leadsByUser,
    conversionRate,
    inactiveLeads,
  };
}

// ---------- Distribuição por tag ----------
export async function getTagDistribution(
  actor: Actor,
  args: { period: PeriodKey; from?: string; to?: string },
) {
  const created = periodFilter(args.period, args.from, args.to);
  const tags = await prisma.tag.findMany({
    select: {
      id: true,
      name: true,
      color: true,
      _count: {
        select: {
          opportunities: {
            where: {
              ...ownerScope(actor),
              createdAt: created,
            },
          },
        },
      },
    },
  });
  return tags
    .map((t) => ({ tagId: t.id, tagName: t.name, color: t.color, count: t._count.opportunities }))
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count);
}

// ---------- Funil ----------
export async function getFunnel(
  actor: Actor,
  args: { period: PeriodKey; from?: string; to?: string; pipelineId?: string },
) {
  const created = periodFilter(args.period, args.from, args.to);

  const pipeline = args.pipelineId
    ? await prisma.pipeline.findUnique({
        where: { id: args.pipelineId },
        include: { stages: { orderBy: { order: 'asc' } } },
      })
    : await prisma.pipeline.findFirst({
        where: { active: true },
        orderBy: { order: 'asc' },
        include: { stages: { orderBy: { order: 'asc' } } },
      });

  if (!pipeline) return { pipelineId: null, pipelineName: null, stages: [] as unknown[] };

  const counts = await prisma.opportunity.groupBy({
    by: ['stageId'],
    where: { ...ownerScope(actor), pipelineId: pipeline.id, createdAt: created },
    _count: { _all: true },
  });
  const countById = new Map(counts.map((c) => [c.stageId, c._count._all] as const));

  const stages = pipeline.stages.map((s, i, arr) => {
    const count = countById.get(s.id) ?? 0;
    const prevCount = i === 0 ? null : (countById.get(arr[i - 1]!.id) ?? 0);
    const conversionFromPrevious =
      prevCount === null
        ? null
        : prevCount === 0
          ? 0
          : Number(((count / prevCount) * 100).toFixed(2));
    return { stageId: s.id, stageName: s.name, color: s.color, count, conversionFromPrevious };
  });

  return { pipelineId: pipeline.id, pipelineName: pipeline.name, stages };
}

// ---------- Custom blocks (placeholder) ----------
export async function getCustomBlocks(_actor: Actor) {
  // CRUD ainda não implementado — retorna lista vazia.
  return [] as Array<{
    id: string;
    label: string;
    customFieldId: string;
    operation: 'sum' | 'avg' | 'count';
  }>;
}

// ---------- Financeiro / agregação por custom field ----------
export async function getFinancial(
  actor: Actor,
  args: {
    period: PeriodKey;
    from?: string;
    to?: string;
    customFieldId: string;
    operation: 'sum' | 'avg' | 'count';
  },
) {
  const created = periodFilter(args.period, args.from, args.to);

  const field = await prisma.customField.findUnique({
    where: { id: args.customFieldId },
    select: { name: true, type: true },
  });
  if (!field) throw new Error('Campo personalizado não encontrado');

  const values = await prisma.customFieldValue.findMany({
    where: {
      customFieldId: args.customFieldId,
      opportunity: {
        is: { ...ownerScope(actor), createdAt: created },
      },
    },
    select: { value: true },
  });

  if (args.operation === 'count') {
    return { value: values.length, label: field.name };
  }

  const numbers = values
    .map((v) => Number(v.value))
    .filter((n) => Number.isFinite(n));

  if (numbers.length === 0) return { value: 0, label: field.name };

  if (args.operation === 'sum') {
    return { value: Number(numbers.reduce((a, b) => a + b, 0).toFixed(2)), label: field.name };
  }
  // avg
  const avg = numbers.reduce((a, b) => a + b, 0) / numbers.length;
  return { value: Number(avg.toFixed(2)), label: field.name };
}
