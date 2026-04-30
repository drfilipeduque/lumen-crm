// Camada de serviço de Automation:
// - CRUD persistido (rotas chamam aqui)
// - bridge eventBus → fila (registerEventBridge)
// - execução de um fluxo a partir de event/payload (executeAutomationFromEvent)
// - dry-run pra POST /test
//
// Os workers BullMQ chamam executeAutomationFromQueue, que basicamente delega
// pra runFlow + persiste log.

import { prisma, Prisma } from '../../lib/prisma.js';
import { eventBus, type AutomationEventType, type EventPayload } from './engine/event-bus.js';
import {
  TRIGGER_TO_EVENT,
  matchesTriggerConfig,
  eventToTriggerTypes,
} from './engine/trigger-matcher.js';
import {
  findTriggerNode,
  persistLogResult,
  runFlow,
  type Flow,
  type StepResult,
} from './engine/flow-runner.js';
import { buildContextFromEvent, type ExecutionContext } from './engine/context.js';
import { enqueueExecution, enqueueResume } from './queues.js';
import { validateFlow, type FlowValidationError } from './engine/flow-validator.js';

export class AutomationError extends Error {
  status: number;
  code: string;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

// ============================================================================
// CRUD
// ============================================================================

type AutomationCreateInput = {
  name: string;
  active?: boolean;
  flow: Flow;
};

// Extrai triggerType + triggerConfig do nó de trigger pra denormalizar.
function denormalizeTrigger(flow: Flow): { triggerType: string; triggerConfig: Prisma.InputJsonValue } {
  const trig = findTriggerNode(flow);
  if (!trig) throw new AutomationError('NO_TRIGGER', 'Fluxo precisa de um nó de trigger');
  if (!(trig.subtype in TRIGGER_TO_EVENT)) {
    throw new AutomationError('INVALID_TRIGGER', `Trigger desconhecido: ${trig.subtype}`);
  }
  return { triggerType: trig.subtype, triggerConfig: (trig.config ?? {}) as Prisma.InputJsonValue };
}

export async function listAutomations() {
  return prisma.automation.findMany({ orderBy: { createdAt: 'desc' } });
}

export async function getAutomation(id: string) {
  const a = await prisma.automation.findUnique({ where: { id } });
  if (!a) throw new AutomationError('NOT_FOUND', 'Automação não encontrada', 404);
  return a;
}

export async function createAutomation(input: AutomationCreateInput) {
  // Só bloqueia quando o usuário tenta SALVAR ATIVO. Em rascunho (active=false)
  // tolera erros de validação pra deixar continuar editando.
  if (input.active !== false) {
    const errs = validateFlow(input.flow);
    if (errs.length > 0) {
      throw new AutomationValidationError(errs);
    }
  }
  const { triggerType, triggerConfig } = denormalizeTrigger(input.flow);
  return prisma.automation.create({
    data: {
      name: input.name,
      active: input.active ?? true,
      triggerType,
      triggerConfig,
      flow: input.flow as unknown as Prisma.InputJsonValue,
    },
  });
}

export class AutomationValidationError extends Error {
  errors: FlowValidationError[];
  status = 400;
  code = 'FLOW_INVALID';
  constructor(errors: FlowValidationError[]) {
    super('Fluxo inválido');
    this.errors = errors;
  }
}

// Validação standalone — usada pelo header do editor pra mostrar status.
export function validateFlowExternal(flow: Flow): FlowValidationError[] {
  return validateFlow(flow);
}

export async function updateAutomation(id: string, input: Partial<AutomationCreateInput>) {
  const data: Prisma.AutomationUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.active !== undefined) data.active = input.active;
  if (input.flow !== undefined) {
    // Bloqueia se vai ficar ativo (input.active=true ou já era ativo).
    const willBeActive = input.active !== undefined
      ? input.active
      : (await getAutomation(id)).active;
    if (willBeActive) {
      const errs = validateFlow(input.flow);
      if (errs.length > 0) throw new AutomationValidationError(errs);
    }
    const { triggerType, triggerConfig } = denormalizeTrigger(input.flow);
    data.triggerType = triggerType;
    data.triggerConfig = triggerConfig;
    data.flow = input.flow as unknown as Prisma.InputJsonValue;
  }
  await getAutomation(id);
  return prisma.automation.update({ where: { id }, data });
}

export async function toggleAutomation(id: string) {
  const a = await getAutomation(id);
  return prisma.automation.update({ where: { id }, data: { active: !a.active } });
}

export async function deleteAutomation(id: string) {
  await getAutomation(id);
  await prisma.automation.delete({ where: { id } });
  return { ok: true as const };
}

// ============================================================================
// EVENT BRIDGE
// ============================================================================

let bridgeRegistered = false;

// Conecta o eventBus às filas. Chamada uma vez no boot.
export function registerEventBridge(log?: { error: (...a: unknown[]) => void }) {
  if (bridgeRegistered) return;
  bridgeRegistered = true;
  eventBus.on('*', (event) => {
    void onEventReceived(event).catch((err) => {
      // Falha aqui não deve derrubar o evento original.
      log?.error({ err }, 'automation event bridge failed');
    });
  });
}

async function onEventReceived(event: EventPayload) {
  const triggerTypes = eventToTriggerTypes(event.type as AutomationEventType);
  if (triggerTypes.length === 0) return;

  // Pega automations ativas que casam com o eventType.
  const candidates = await prisma.automation.findMany({
    where: { active: true, triggerType: { in: triggerTypes } },
    select: { id: true, triggerType: true, triggerConfig: true },
  });

  for (const a of candidates) {
    if (!matchesTriggerConfig(a.triggerType, a.triggerConfig, event)) continue;
    await enqueueExecution({
      automationId: a.id,
      triggeredBy: `event:${event.type}`,
      event: event as unknown as Record<string, unknown>,
    });
  }
}

// ============================================================================
// EXECUTION (chamada pelos workers BullMQ)
// ============================================================================

export async function executeAutomationFromQueue(
  automationId: string,
  triggeredBy: string,
  options: {
    event?: EventPayload;
    resumeFromNodeId?: string;
    logId?: string;
    contextSnapshot?: ExecutionContext;
  } = {},
) {
  const automation = await prisma.automation.findUnique({ where: { id: automationId } });
  if (!automation) return; // pode ter sido deletada entre enqueue e exec
  if (!automation.active) return;

  const flow = automation.flow as unknown as Flow;

  // Cria log inicial OU recupera o existente em caso de resume.
  let logId = options.logId;
  if (!logId) {
    const log = await prisma.automationLog.create({
      data: {
        type: 'AUTOMATION',
        entityId: automationId,
        automationId,
        status: 'RUNNING',
        trigger: triggeredBy,
        triggeredBy,
        input: (options.event as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
      },
    });
    logId = log.id;
  }

  // Constrói/restaura contexto.
  let ctx: ExecutionContext;
  if (options.contextSnapshot) {
    ctx = options.contextSnapshot;
    ctx.logId = logId;
  } else if (options.event) {
    ctx = await buildContextFromEvent(automationId, logId, options.event, false);
  } else {
    ctx = {
      automationId,
      logId,
      dryRun: false,
      event: null,
      step: {},
    };
  }

  // Resolve start node.
  let startNodeId: string;
  if (options.resumeFromNodeId) {
    // Resume: pula o próprio wait node — começamos pelos filhos dele.
    // Aqui tratamos resumeFromNodeId como o nó de wait; o runner já marcou-o
    // como visited via steps[]; pra simplificar, criamos um trigger virtual
    // que aponta pras outgoing dele. Mais simples: rodamos a partir das outgoing edges.
    const out = flow.edges.filter((e) => e.from === options.resumeFromNodeId);
    if (out.length === 0) {
      // Fim do fluxo: marca log como SUCCESS.
      await persistLogResult(logId, 'SUCCESS', []);
      await prisma.automation.update({
        where: { id: automationId },
        data: { executionCount: { increment: 1 }, lastExecutedAt: new Date() },
      });
      return;
    }
    startNodeId = out[0]!.to; // BFS continua a partir daí
    // Adicionar os irmãos ao queue: usamos um "virtual" iniciando do primeiro
    // e o runner pega os outros via edges de saída — mas runner começa por 1 só.
    // Pra cobrir múltiplas branches paralelas, enfileira uma exec por branch.
    if (out.length > 1) {
      for (let i = 1; i < out.length; i++) {
        await enqueueExecution({
          automationId,
          triggeredBy,
          resumeFromNodeId: options.resumeFromNodeId,
          logId,
        });
      }
    }
  } else {
    const trig = findTriggerNode(flow);
    if (!trig) {
      await persistLogResult(logId, 'FAILED', [], { error: 'sem nó de trigger' });
      return;
    }
    startNodeId = trig.id;
  }

  let allSteps: StepResult[] = [];
  try {
    const { steps, resume } = await runFlow(flow, ctx, startNodeId);
    allSteps = steps;
    if (resume) {
      // Persistir log como RUNNING com steps parciais e enfileirar continuação.
      await persistLogResult(logId, 'RUNNING', steps);
      await enqueueResume(
        {
          automationId,
          triggeredBy,
          resumeFromNodeId: resume.nodeId,
          logId,
          contextSnapshot: ctx as unknown as Record<string, unknown>,
        },
        resume.delayMs,
      );
      return;
    }
    // Fluxo terminou.
    const failed = steps.find((s) => s.status === 'failed');
    await persistLogResult(logId, failed ? 'FAILED' : 'SUCCESS', steps, {
      error: failed?.error,
    });
    await prisma.automation.update({
      where: { id: automationId },
      data: { executionCount: { increment: 1 }, lastExecutedAt: new Date() },
    });
  } catch (err) {
    const e = err as Error;
    await persistLogResult(logId, 'FAILED', allSteps, { error: e.message });
    throw err; // sinaliza pro BullMQ tentar de novo (retryable)
  }
}

// ============================================================================
// DRY-RUN (POST /api/automations/:id/test)
// ============================================================================

export async function dryRunAutomation(automationId: string, fakeEvent?: EventPayload) {
  const automation = await getAutomation(automationId);
  const flow = automation.flow as unknown as Flow;
  const trig = findTriggerNode(flow);
  if (!trig) throw new AutomationError('NO_TRIGGER', 'Sem trigger no fluxo');

  // Sem evento → contexto mínimo. Com evento → snapshot real (se IDs forem reais).
  const ctx: ExecutionContext = fakeEvent
    ? await buildContextFromEvent(automationId, null, fakeEvent, true)
    : { automationId, logId: null, dryRun: true, event: null, step: {} };

  const { steps } = await runFlow(flow, ctx, trig.id);
  return { steps, context: ctx };
}
