// Conexão única ioredis compartilhada (BullMQ exige instância dedicada com
// `maxRetriesPerRequest: null`). Tudo que produz/consome filas reutiliza esta.

import { Redis } from 'ioredis';
import { env } from '../env.js';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

redis.on('error', (err: Error) => {
  // Logger ainda não disponível aqui — printa mas não derruba o processo.
  // eslint-disable-next-line no-console
  console.error('[redis] error', err.message);
});
