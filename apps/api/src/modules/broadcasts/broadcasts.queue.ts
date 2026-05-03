// Queue BullMQ pra dispatch de BroadcastRecipient.
// 1 job por recipient (FIFO global por queue) com delay incremental aplicado
// pelo orquestrador (campaign service) baseado em intervalSeconds.

import { Queue } from 'bullmq';
import { redis } from '../../lib/redis.js';

export type BroadcastSendJob = { recipientId: string };

export const QUEUE_BROADCAST_SEND = 'broadcast-send';

export const broadcastSendQueue = new Queue<BroadcastSendJob>(QUEUE_BROADCAST_SEND, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 10_000 },
    removeOnComplete: { count: 5000, age: 30 * 24 * 60 * 60 },
    removeOnFail: { count: 5000, age: 60 * 24 * 60 * 60 },
  },
});

// BullMQ 5.74+ proíbe ':' em jobId custom. Usamos '__' como separador.
const jobIdFor = (id: string) => `bcast-recipient__${id}`;

export async function enqueueRecipient(recipientId: string, delayMs: number): Promise<void> {
  await broadcastSendQueue.add(
    'send',
    { recipientId },
    { jobId: jobIdFor(recipientId), delay: Math.max(0, delayMs) },
  );
}

export async function removeRecipient(recipientId: string): Promise<void> {
  const job = await broadcastSendQueue.getJob(jobIdFor(recipientId));
  if (job) await job.remove();
}

export async function removeRecipientsBatch(recipientIds: string[]): Promise<void> {
  for (const id of recipientIds) {
    const job = await broadcastSendQueue.getJob(jobIdFor(id));
    if (job) await job.remove().catch(() => {});
  }
}
