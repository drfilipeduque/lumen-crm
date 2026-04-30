// Orquestra a execução de um fluxo (`Automation.flow`).
//
// Modelo do fluxo (validado em automation.schemas):
//   nodes: { id, type: "trigger"|"condition"|"action", subtype, config, position? }[]
//   edges: { from, to, branch?: "true"|"false" }[]
//
// Caminho:
//   1. Acha trigger node (start). Em runs por evento, é o que casa o subtype com o EventType.
//   2. Walk em BFS-like seguindo `edges`. Em condition, escolhe edge cuja `branch`
//      bate com o resultado (true/false). Em action/trigger, segue todas as outgoing.
//   3. Se uma action pedir `wait`, paramos e enfileiramos retomada via BullMQ
//      (a partir das outgoing edges da node de wait).

import { prisma } from '../../../lib/prisma.js';
import {
  ActionExecutionError,
  executeAction,
  type ActionResult,
} from './action-executor.js';
import { evaluateCondition } from './condition-evaluator.js';
import type { ExecutionContext } from './context.js';

export type FlowNode = {
  id: string;
  type: 'trigger' | 'condition' | 'action';
  subtype: string;
  config?: Record<string, unknown>;
  position?: { x: number; y: number };
};

export type FlowEdge = {
  from: string;
  to: string;
  branch?: 'true' | 'false';
};

export type Flow = {
  nodes: FlowNode[];
  edges: FlowEdge[];
};

export type StepResult = {
  nodeId: string;
  type: string;
  subtype: string;
  status: 'success' | 'failed' | 'skipped' | 'wait';
  durationMs: number;
  output?: unknown;
  error?: string;
};

// Executa nó até esbarrar em wait ou terminar. Retorna lista de steps + opcional resume.
export async function runFlow(
  flow: Flow,
  ctx: ExecutionContext,
  startNodeId: string,
): Promise<{ steps: StepResult[]; resume?: { nodeId: string; delayMs: number } }> {
  const byId = new Map(flow.nodes.map((n) => [n.id, n]));
  const out = new Map<string, FlowEdge[]>();
  for (const e of flow.edges) {
    if (!out.has(e.from)) out.set(e.from, []);
    out.get(e.from)!.push(e);
  }

  const steps: StepResult[] = [];
  // Stack de IDs ainda a executar (DFS pra previsibilidade).
  const queue: string[] = [startNodeId];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);

    const node = byId.get(id);
    if (!node) continue;

    const t0 = Date.now();
    if (node.type === 'trigger') {
      // Nó de trigger é só o start point — registra e segue todas as outgoing.
      steps.push({ nodeId: node.id, type: node.type, subtype: node.subtype, status: 'success', durationMs: 0 });
      for (const e of out.get(node.id) ?? []) queue.push(e.to);
      continue;
    }

    if (node.type === 'condition') {
      try {
        const ok = await evaluateCondition(node.subtype, node.config ?? {}, ctx);
        steps.push({
          nodeId: node.id,
          type: node.type,
          subtype: node.subtype,
          status: 'success',
          durationMs: Date.now() - t0,
          output: { result: ok },
        });
        // Segue só edges com branch correspondente. Edges sem branch tb seguem.
        const wanted = ok ? 'true' : 'false';
        for (const e of out.get(node.id) ?? []) {
          if (!e.branch || e.branch === wanted) queue.push(e.to);
        }
      } catch (err) {
        steps.push({
          nodeId: node.id,
          type: node.type,
          subtype: node.subtype,
          status: 'failed',
          durationMs: Date.now() - t0,
          error: (err as Error).message,
        });
        // Em condition que falha, não seguimos por nenhum branch.
      }
      continue;
    }

    if (node.type === 'action') {
      try {
        const r: ActionResult = await executeAction(node.subtype, node.config ?? {}, ctx);
        if (r.kind === 'wait') {
          steps.push({
            nodeId: node.id,
            type: node.type,
            subtype: node.subtype,
            status: 'wait',
            durationMs: Date.now() - t0,
            output: { delayMs: r.delayMs },
          });
          // Paramos. Resumimos a partir desta node depois.
          return { steps, resume: { nodeId: node.id, delayMs: r.delayMs } };
        }
        // Output vai pro contexto pra ser referenciado por nodes seguintes.
        ctx.step[node.id] = r.output;
        steps.push({
          nodeId: node.id,
          type: node.type,
          subtype: node.subtype,
          status: 'success',
          durationMs: Date.now() - t0,
          output: r.output,
        });
        for (const e of out.get(node.id) ?? []) queue.push(e.to);
      } catch (err) {
        const e = err as Error;
        steps.push({
          nodeId: node.id,
          type: node.type,
          subtype: node.subtype,
          status: 'failed',
          durationMs: Date.now() - t0,
          error: e.message,
        });
        // Erro retryable: deixa o BullMQ retry-ar via `throw`. Erro não-retryable: para o fluxo.
        if (err instanceof ActionExecutionError && !err.retryable) {
          return { steps };
        }
        throw err;
      }
    }
  }

  return { steps };
}

// Acha o nó de trigger. Em flows com vários triggers (raro), pega o primeiro.
export function findTriggerNode(flow: Flow): FlowNode | null {
  return flow.nodes.find((n) => n.type === 'trigger') ?? null;
}

// Atualiza um log já existente com o resultado parcial/final.
export async function persistLogResult(
  logId: string,
  status: 'SUCCESS' | 'FAILED' | 'RUNNING',
  steps: StepResult[],
  options: { output?: unknown; error?: string } = {},
) {
  await prisma.automationLog.update({
    where: { id: logId },
    data: {
      status,
      steps: steps as unknown as object,
      output: options.output as object | undefined,
      error: options.error,
      executionTime: steps.reduce((acc, s) => acc + s.durationMs, 0),
      completedAt: status === 'RUNNING' ? null : new Date(),
    },
  });
}
