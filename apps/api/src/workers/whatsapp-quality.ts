// Worker periódico que sincroniza o tier de qualidade das conexões OFFICIAL
// com a Meta. Roda 1x por dia (24h). Falha de uma conexão não derruba as outras.

import type { FastifyBaseLogger } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { decryptAccessToken } from '../modules/whatsapp/meta/crypto.js';
import { getPhoneNumber, MetaApiError } from '../modules/whatsapp/meta/meta.service.js';

const TICK_MS = 24 * 60 * 60 * 1000;
// Pequeno atraso pra primeira execução não acontecer junto com o boot
const FIRST_DELAY_MS = 60_000;

let timer: NodeJS.Timeout | null = null;

export function startWhatsAppQualityWorker(log: FastifyBaseLogger) {
  if (timer) return;
  log.info('whatsapp quality worker started (tick=24h)');

  const tick = async () => {
    try {
      const conns = await prisma.whatsAppConnection.findMany({
        where: { type: 'OFFICIAL', active: true },
        select: { id: true, phoneNumberId: true, accessToken: true },
      });
      for (const c of conns) {
        if (!c.phoneNumberId || !c.accessToken) continue;
        try {
          const token = decryptAccessToken(c.accessToken);
          const info = await getPhoneNumber(c.phoneNumberId, token);
          await prisma.whatsAppConnection.update({
            where: { id: c.id },
            data: {
              qualityTier: info.messaging_limit_tier ?? null,
              profileName: info.verified_name ?? undefined,
            },
          });
        } catch (e) {
          const msg = e instanceof MetaApiError ? e.message : (e as Error).message;
          log.warn({ connectionId: c.id, err: msg }, 'quality tier sync failed');
        }
      }
    } catch (e) {
      log.error({ err: e }, 'whatsapp quality tick failed');
    }
  };

  setTimeout(() => {
    void tick();
    timer = setInterval(() => void tick(), TICK_MS);
  }, FIRST_DELAY_MS);
}
