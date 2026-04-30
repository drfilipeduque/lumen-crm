// Fila BullMQ pra execução passo-a-passo de cadências.
// Cada job representa "executar o próximo step" de uma execution.

import { Queue, type JobsOptions } from 'bullmq';
import { redis } from '../../lib/redis.js';

export type CadenceStepJob = {
  executionId: string;
  // attempt count opcional (BullMQ já trackeia, isto é só pra logs internos).
  attempt?: number;
};

export const QUEUE_CADENCE_STEP = 'cadence-step';

export const cadenceStepQueue = new Queue<CadenceStepJob>(QUEUE_CADENCE_STEP, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 10_000 },
    removeOnComplete: { count: 1000, age: 7 * 24 * 60 * 60 },
    removeOnFail: { count: 1000, age: 30 * 24 * 60 * 60 },
  },
});

// Enfileira o próximo step da execution. delayMs=0 dispara imediato.
export async function enqueueStep(
  executionId: string,
  delayMs = 0,
  opts: JobsOptions = {},
): Promise<void> {
  await cadenceStepQueue.add('step', { executionId }, { delay: delayMs, ...opts });
}
