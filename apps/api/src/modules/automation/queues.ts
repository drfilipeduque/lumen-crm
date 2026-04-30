// 3 filas BullMQ usadas pelo motor de automation:
//
//  - automation-execution: roda um fluxo do início (ou resume após wait)
//  - scheduled-actions:    delayed jobs com `wait` (alias funcional da execution)
//  - cron-checks:          tick periódico pra triggers cron-based
//
// Mantemos uma referência única por fila pra evitar reconexões.

import { Queue, type JobsOptions } from 'bullmq';
import { redis } from '../../lib/redis.js';

export type ExecutionJobPayload = {
  automationId: string;
  // Quando vem de evento, o flow começa pelo trigger node.
  // Quando é resume após wait, começa pelas outgoing edges desse nodeId.
  resumeFromNodeId?: string;
  logId?: string;
  // Snapshot do contexto quando há resume (após wait). Em start-from-event, indefinido.
  contextSnapshot?: Record<string, unknown>;
  // Evento original (preservado pra dry-run e construção de contexto).
  event?: Record<string, unknown>;
  // Disparado por: "event:<type>", "manual", "test", "cron"
  triggeredBy: string;
  attempt?: number;
};

export type CronJobPayload = {
  // "stale" | "inactive" | "due_date" | "scheduled"
  kind: string;
};

export const QUEUE_AUTOMATION_EXECUTION = 'automation-execution';
export const QUEUE_SCHEDULED_ACTIONS = 'scheduled-actions';
export const QUEUE_CRON_CHECKS = 'cron-checks';

export const automationExecutionQueue = new Queue<ExecutionJobPayload>(QUEUE_AUTOMATION_EXECUTION, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5_000 },
    removeOnComplete: { count: 1000, age: 7 * 24 * 60 * 60 },
    removeOnFail: { count: 1000, age: 30 * 24 * 60 * 60 },
  },
});

export const scheduledActionsQueue = new Queue<ExecutionJobPayload>(QUEUE_SCHEDULED_ACTIONS, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5_000 },
    removeOnComplete: { count: 1000, age: 7 * 24 * 60 * 60 },
    removeOnFail: { count: 1000, age: 30 * 24 * 60 * 60 },
  },
});

export const cronChecksQueue = new Queue<CronJobPayload>(QUEUE_CRON_CHECKS, {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 100,
  },
});

export async function enqueueExecution(
  payload: ExecutionJobPayload,
  opts: JobsOptions = {},
): Promise<void> {
  await automationExecutionQueue.add('execute', payload, opts);
}

export async function enqueueResume(
  payload: ExecutionJobPayload,
  delayMs: number,
): Promise<void> {
  await scheduledActionsQueue.add('resume', payload, { delay: delayMs });
}
