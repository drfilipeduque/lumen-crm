import { prisma, Prisma } from '../../lib/prisma.js';

export class PipelineError extends Error {
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

// ---------------- DTOs ----------------

export type StageDTO = {
  id: string;
  name: string;
  color: string;
  order: number;
  isClosedWon: boolean;
  isClosedLost: boolean;
  opportunityCount: number;
};

export type PipelineListDTO = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  order: number;
  stageCount: number;
  opportunityCount: number;
  createdAt: Date;
  updatedAt: Date;
};

export type PipelineDetailDTO = PipelineListDTO & {
  stages: StageDTO[];
  customFields: {
    customFieldId: string;
    name: string;
    type: string;
    visible: boolean;
    order: number;
  }[];
};

// Pipelines com opportunities ABERTAS (não em stage closedWon/Lost)
const openOppFilter = (pipelineId?: string): Prisma.OpportunityWhereInput => ({
  ...(pipelineId ? { pipelineId } : {}),
  stage: { isClosedWon: false, isClosedLost: false },
});

// ---------------- LIST / GET ----------------

export async function listPipelines(): Promise<PipelineListDTO[]> {
  const pipelines = await prisma.pipeline.findMany({
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    include: {
      _count: { select: { stages: true } },
    },
  });
  if (pipelines.length === 0) return [];

  const opens = await prisma.opportunity.groupBy({
    by: ['pipelineId'],
    where: openOppFilter(),
    _count: { _all: true },
  });
  const openByPipeline = new Map(opens.map((o) => [o.pipelineId, o._count._all] as const));

  return pipelines.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    active: p.active,
    order: p.order,
    stageCount: p._count.stages,
    opportunityCount: openByPipeline.get(p.id) ?? 0,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  }));
}

export async function getPipeline(id: string): Promise<PipelineDetailDTO> {
  const pipeline = await prisma.pipeline.findUnique({
    where: { id },
    include: {
      stages: {
        orderBy: { order: 'asc' },
        include: { _count: { select: { opportunities: true } } },
      },
      customFields: { include: { customField: { select: { name: true, type: true } } } },
    },
  });
  if (!pipeline) throw new PipelineError('NOT_FOUND', 'Funil não encontrado', 404);

  const openCount = await prisma.opportunity.count({ where: openOppFilter(id) });

  return {
    id: pipeline.id,
    name: pipeline.name,
    description: pipeline.description,
    active: pipeline.active,
    order: pipeline.order,
    stageCount: pipeline.stages.length,
    opportunityCount: openCount,
    createdAt: pipeline.createdAt,
    updatedAt: pipeline.updatedAt,
    stages: pipeline.stages.map((s) => ({
      id: s.id,
      name: s.name,
      color: s.color,
      order: s.order,
      isClosedWon: s.isClosedWon,
      isClosedLost: s.isClosedLost,
      opportunityCount: s._count.opportunities,
    })),
    customFields: pipeline.customFields
      .sort((a, b) => a.order - b.order)
      .map((pcf) => ({
        customFieldId: pcf.customFieldId,
        name: pcf.customField.name,
        type: pcf.customField.type,
        visible: pcf.visible,
        order: pcf.order,
      })),
  };
}

// ---------------- CREATE ----------------

type CreateInput = {
  name: string;
  description?: string;
  stages: Array<{
    name: string;
    color: string;
    isClosedWon?: boolean;
    isClosedLost?: boolean;
  }>;
};

export async function createPipeline(input: CreateInput): Promise<PipelineDetailDTO> {
  // Garante no máximo 1 won e 1 lost
  enforceUniqueClosedFlags(input.stages);

  const max = await prisma.pipeline.aggregate({ _max: { order: true } });
  const nextOrder = (max._max.order ?? -1) + 1;

  const created = await prisma.pipeline.create({
    data: {
      name: input.name,
      description: input.description ?? null,
      order: nextOrder,
      stages: {
        create: input.stages.map((s, idx) => ({
          name: s.name,
          color: s.color,
          order: idx,
          isClosedWon: !!s.isClosedWon,
          isClosedLost: !!s.isClosedLost,
        })),
      },
    },
    select: { id: true },
  });

  return getPipeline(created.id);
}

// ---------------- UPDATE ----------------

export async function updatePipeline(
  id: string,
  patch: { name?: string; description?: string | null; active?: boolean },
): Promise<PipelineDetailDTO> {
  try {
    await prisma.pipeline.update({ where: { id }, data: patch });
  } catch (e) {
    if ((e as { code?: string }).code === 'P2025')
      throw new PipelineError('NOT_FOUND', 'Funil não encontrado', 404);
    throw e;
  }
  return getPipeline(id);
}

// ---------------- DELETE ----------------

export async function deletePipeline(
  id: string,
  force = false,
): Promise<{ ok: true; opportunitiesRemoved?: number }> {
  const pipeline = await prisma.pipeline.findUnique({ where: { id } });
  if (!pipeline) throw new PipelineError('NOT_FOUND', 'Funil não encontrado', 404);

  const openCount = await prisma.opportunity.count({ where: openOppFilter(id) });
  if (openCount > 0 && !force) {
    throw new PipelineError(
      'IN_USE',
      `O funil tem ${openCount} oportunidade(s) ativa(s). Use force=true para excluir tudo.`,
      409,
      { opportunityCount: openCount },
    );
  }

  let removed = 0;
  if (force) {
    const all = await prisma.opportunity.count({ where: { pipelineId: id } });
    removed = all;
    // Cascade definido em Stage→Pipeline; mas Opportunity→Pipeline é Restrict.
    // Apaga oportunidades primeiro, depois a pipeline (cascata derruba as stages).
    await prisma.opportunity.deleteMany({ where: { pipelineId: id } });
  }
  await prisma.pipeline.delete({ where: { id } });
  return { ok: true, opportunitiesRemoved: force ? removed : undefined };
}

// ---------------- STAGE REORDER ----------------

export async function reorderStages(pipelineId: string, ids: string[]): Promise<PipelineDetailDTO> {
  const stages = await prisma.stage.findMany({
    where: { pipelineId },
    select: { id: true },
  });
  const known = new Set(stages.map((s) => s.id));
  const allMatch = ids.length === stages.length && ids.every((id) => known.has(id));
  if (!allMatch) {
    throw new PipelineError(
      'INVALID_IDS',
      'Lista de etapas não bate com as do funil',
      400,
      { expected: stages.map((s) => s.id) },
    );
  }
  await prisma.$transaction(
    ids.map((id, idx) => prisma.stage.update({ where: { id }, data: { order: idx } })),
  );
  return getPipeline(pipelineId);
}

// ---------------- CUSTOM FIELDS N:N ----------------

export async function setPipelineCustomFields(
  pipelineId: string,
  rows: Array<{ customFieldId: string; visible: boolean; order: number }>,
): Promise<PipelineDetailDTO> {
  // Confere que o funil existe
  const exists = await prisma.pipeline.findUnique({ where: { id: pipelineId }, select: { id: true } });
  if (!exists) throw new PipelineError('NOT_FOUND', 'Funil não encontrado', 404);

  const fieldIds = rows.map((r) => r.customFieldId);
  if (fieldIds.length > 0) {
    const found = await prisma.customField.findMany({
      where: { id: { in: fieldIds } },
      select: { id: true },
    });
    if (found.length !== fieldIds.length) {
      throw new PipelineError('INVALID_CUSTOM_FIELDS', 'Alguns campos não existem', 400);
    }
  }

  await prisma.$transaction([
    prisma.pipelineCustomField.deleteMany({ where: { pipelineId } }),
    ...(rows.length > 0
      ? [
          prisma.pipelineCustomField.createMany({
            data: rows.map((r) => ({
              pipelineId,
              customFieldId: r.customFieldId,
              visible: r.visible,
              order: r.order,
            })),
          }),
        ]
      : []),
  ]);

  return getPipeline(pipelineId);
}

// ---------------- STAGES — CREATE / UPDATE / DELETE ----------------

export async function createStage(
  pipelineId: string,
  input: { name: string; color: string; isClosedWon?: boolean; isClosedLost?: boolean },
): Promise<PipelineDetailDTO> {
  const pipeline = await prisma.pipeline.findUnique({
    where: { id: pipelineId },
    select: { id: true, stages: { select: { id: true, isClosedWon: true, isClosedLost: true } } },
  });
  if (!pipeline) throw new PipelineError('NOT_FOUND', 'Funil não encontrado', 404);

  const max = await prisma.stage.aggregate({
    where: { pipelineId },
    _max: { order: true },
  });
  const nextOrder = (max._max.order ?? -1) + 1;

  await prisma.$transaction(async (tx) => {
    if (input.isClosedWon) {
      await tx.stage.updateMany({ where: { pipelineId, isClosedWon: true }, data: { isClosedWon: false } });
    }
    if (input.isClosedLost) {
      await tx.stage.updateMany({ where: { pipelineId, isClosedLost: true }, data: { isClosedLost: false } });
    }
    await tx.stage.create({
      data: {
        pipelineId,
        name: input.name,
        color: input.color,
        order: nextOrder,
        isClosedWon: !!input.isClosedWon,
        isClosedLost: !!input.isClosedLost,
      },
    });
  });

  return getPipeline(pipelineId);
}

export async function updateStage(
  stageId: string,
  patch: { name?: string; color?: string; isClosedWon?: boolean; isClosedLost?: boolean },
): Promise<PipelineDetailDTO> {
  const stage = await prisma.stage.findUnique({ where: { id: stageId } });
  if (!stage) throw new PipelineError('NOT_FOUND', 'Etapa não encontrada', 404);

  await prisma.$transaction(async (tx) => {
    if (patch.isClosedWon === true) {
      await tx.stage.updateMany({
        where: { pipelineId: stage.pipelineId, isClosedWon: true, NOT: { id: stageId } },
        data: { isClosedWon: false },
      });
    }
    if (patch.isClosedLost === true) {
      await tx.stage.updateMany({
        where: { pipelineId: stage.pipelineId, isClosedLost: true, NOT: { id: stageId } },
        data: { isClosedLost: false },
      });
    }
    await tx.stage.update({ where: { id: stageId }, data: patch });
  });

  return getPipeline(stage.pipelineId);
}

export async function deleteStage(
  stageId: string,
  force = false,
): Promise<{ ok: true; pipelineId: string; opportunitiesRemoved?: number }> {
  const stage = await prisma.stage.findUnique({
    where: { id: stageId },
    include: { _count: { select: { opportunities: true } } },
  });
  if (!stage) throw new PipelineError('NOT_FOUND', 'Etapa não encontrada', 404);

  const remaining = await prisma.stage.count({ where: { pipelineId: stage.pipelineId } });
  if (remaining <= 2) {
    throw new PipelineError(
      'MIN_STAGES',
      'O funil precisa de pelo menos duas etapas — adicione outra antes de excluir esta',
      409,
    );
  }

  const usage = stage._count.opportunities;
  if (usage > 0 && !force) {
    throw new PipelineError(
      'IN_USE',
      `Esta etapa tem ${usage} oportunidade(s). Use force=true para apagá-las e remover.`,
      409,
      { opportunityCount: usage },
    );
  }

  if (force && usage > 0) {
    await prisma.opportunity.deleteMany({ where: { stageId } });
  }
  await prisma.stage.delete({ where: { id: stageId } });
  return { ok: true, pipelineId: stage.pipelineId, opportunitiesRemoved: force ? usage : undefined };
}

// ---------------- HELPERS ----------------

function enforceUniqueClosedFlags(stages: Array<{ isClosedWon?: boolean; isClosedLost?: boolean }>) {
  const wonCount = stages.filter((s) => s.isClosedWon).length;
  const lostCount = stages.filter((s) => s.isClosedLost).length;
  if (wonCount > 1) {
    throw new PipelineError('TOO_MANY_WON', 'Apenas uma etapa pode ser de Ganho', 400);
  }
  if (lostCount > 1) {
    throw new PipelineError('TOO_MANY_LOST', 'Apenas uma etapa pode ser de Perdido', 400);
  }
  // Mesma etapa não pode ser as duas
  if (stages.some((s) => s.isClosedWon && s.isClosedLost)) {
    throw new PipelineError('CONFLICTING_FLAGS', 'Uma etapa não pode ser Ganho e Perdido ao mesmo tempo', 400);
  }
}
