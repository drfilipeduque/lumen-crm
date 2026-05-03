import type { FastifyBaseLogger } from 'fastify';
import { findDueAndNotify } from '../modules/reminders/reminders.service.js';
import { prisma } from '../lib/prisma.js';
import { emitToUser } from '../lib/realtime.js';

const TICK_MS = 60_000; // 1 min

let timer: NodeJS.Timeout | null = null;

export function startReminderWorker(log: FastifyBaseLogger) {
  if (timer) return;
  log.info('reminder worker started (tick=60s)');

  const tick = async () => {
    try {
      const due = await findDueAndNotify();
      if (due.length === 0) return;
      // Carrega detalhes pra mandar payload util pro client
      const details = await prisma.reminder.findMany({
        where: { id: { in: due.map((d) => d.id) } },
        select: { id: true, title: true, opportunityId: true, userId: true },
      });
      for (const r of details) {
        emitToUser(r.userId, 'reminder:overdue', {
          id: r.id,
          title: r.title,
          opportunityId: r.opportunityId,
        });
      }
      log.info({ count: due.length }, 'reminders notified');
    } catch (e) {
      log.error({ err: e }, 'reminder worker tick failed');
    }
  };

  // Primeira execução imediata + intervalo
  void tick();
  timer = setInterval(() => void tick(), TICK_MS);
}

export function stopReminderWorker() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
