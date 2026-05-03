// Queue BullMQ pra dispatch de ScheduledMessage.
// Cada mensagem agendada gera 1 job delayed (delay = scheduledAt - now).
// Cancelamento remove o job pelo jobId padronizado.

import { Queue } from 'bullmq';
import { redis } from '../../lib/redis.js';

export type ScheduledMessageJob = { id: string };

export const QUEUE_SCHEDULED_MESSAGE = 'scheduled-message';

export const scheduledMessageQueue = new Queue<ScheduledMessageJob>(QUEUE_SCHEDULED_MESSAGE, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5_000 },
    removeOnComplete: { count: 500, age: 7 * 24 * 60 * 60 },
    removeOnFail: { count: 500, age: 30 * 24 * 60 * 60 },
  },
});

// BullMQ 5.74+ proíbe ':' em jobId custom. Usamos '__' como separador.
const jobIdFor = (id: string) => `scheduled-message__${id}`;

export async function enqueueScheduledMessage(id: string, runAt: Date): Promise<void> {
  const delay = Math.max(0, runAt.getTime() - Date.now());
  await scheduledMessageQueue.add(
    'dispatch',
    { id },
    { jobId: jobIdFor(id), delay, attempts: 3 },
  );
}

export async function removeScheduledMessage(id: string): Promise<void> {
  const job = await scheduledMessageQueue.getJob(jobIdFor(id));
  if (job) await job.remove();
}
