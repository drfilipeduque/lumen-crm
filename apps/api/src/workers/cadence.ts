// Worker BullMQ que processa um step da cadência por vez.
// Responsabilidades:
//   1. Carrega execution + cadence
//   2. Confirma status ACTIVE (se não, ignora silenciosamente)
//   3. Se respectBusinessHours e fora da janela: reagenda + para
//   4. Pega messages[currentStep], renderiza variáveis (script ou texto livre)
//   5. Resolve a conversa (1 por contato+conexão; cria se não existir)
//   6. Envia via sendMessageToConversation (Baileys/Meta)
//   7. Persiste step em completedSteps + incrementa currentStep
//   8. Se há próximo: enfileira com delay; senão: COMPLETED

import type { FastifyBaseLogger } from 'fastify';
import { Worker } from 'bullmq';
import { redis } from '../lib/redis.js';
import { prisma } from '../lib/prisma.js';
import { QUEUE_CADENCE_STEP, enqueueStep, type CadenceStepJob } from '../modules/cadences/cadence.queue.js';
import {
  buildRenderContextForExecution,
  type CadenceMessage,
} from '../modules/cadences/cadences.service.js';
import { computeNextValidExecution, isWithinBusinessHours } from '../modules/cadences/business-hours.js';
import { renderScript } from '../modules/scripts/render.js';

let started = false;

export function startCadenceWorker(log: FastifyBaseLogger) {
  if (started) return;
  started = true;

  const worker = new Worker<CadenceStepJob>(
    QUEUE_CADENCE_STEP,
    async (job) => {
      await processStep(job.data.executionId, log);
    },
    { connection: redis, concurrency: 4 },
  );
  worker.on('failed', (job, err) => {
    log.warn({ jobId: job?.id, executionId: job?.data?.executionId, err: err.message }, 'cadence step failed');
  });
  log.info('cadence worker started');
}

async function processStep(executionId: string, log: FastifyBaseLogger) {
  const ex = await prisma.cadenceExecution.findUnique({
    where: { id: executionId },
    include: {
      cadence: true,
      contact: { select: { id: true, name: true, phone: true } },
    },
  });
  if (!ex) return; // execution sumiu (cadence deletada)
  if (ex.status !== 'ACTIVE') return; // pausada/cancelada/etc

  // Janela comercial.
  if (ex.cadence.respectBusinessHours) {
    const now = new Date();
    if (
      !isWithinBusinessHours(
        now,
        ex.cadence.businessHoursStart,
        ex.cadence.businessHoursEnd,
        ex.cadence.businessDays,
      )
    ) {
      const next = computeNextValidExecution(
        now,
        ex.cadence.businessHoursStart,
        ex.cadence.businessHoursEnd,
        ex.cadence.businessDays,
      );
      await prisma.cadenceExecution.update({
        where: { id: ex.id },
        data: { nextExecutionAt: next, pauseReason: 'Fora do horário' },
      });
      await enqueueStep(ex.id, Math.max(1_000, next.getTime() - now.getTime()));
      return;
    }
  }

  const messages = (ex.cadence.messages as unknown as CadenceMessage[]) ?? [];
  const idx = ex.currentStep;
  const msg = messages[idx];
  if (!msg) {
    await prisma.cadenceExecution.update({
      where: { id: ex.id },
      data: { status: 'COMPLETED', nextExecutionAt: null },
    });
    return;
  }

  // Resolve conexão a usar.
  const connectionId = ex.connectionId ?? ex.cadence.connectionId;
  if (!connectionId) {
    await fail(ex.id, 'Sem conexão WhatsApp configurada na cadência ou na execução');
    return;
  }

  // Renderiza variáveis. Se a mensagem usa script, carrega conteúdo do script;
  // senão usa content. Em ambos casos, passa pelo renderScript.
  let content = msg.content ?? '';
  if (msg.scriptId) {
    const s = await prisma.script.findUnique({ where: { id: msg.scriptId }, select: { content: true } });
    if (s) content = s.content;
  }
  const ctx = await buildRenderContextForExecution(ex.id);
  const rendered = renderScript(content, ctx);

  // Garante conversa contato+conexão.
  const conv = await ensureConversation(ex.contactId, connectionId);

  try {
    const { sendMessageToConversation } = await import('../modules/whatsapp/baileys/message.service.js');
    const sent = (await sendMessageToConversation(
      { id: 'system', role: 'ADMIN' },
      conv.id,
      msg.mediaUrl
        ? {
            type: (msg.mediaType ?? 'IMAGE') as 'IMAGE' | 'AUDIO' | 'DOCUMENT' | 'VIDEO',
            content: rendered,
            mediaUrl: msg.mediaUrl,
          }
        : { type: 'TEXT', content: rendered },
    )) as { id?: string };

    // Persiste em completedSteps.
    const completed = (ex.completedSteps as unknown as Array<{
      stepId: string;
      sentAt: string;
      messageId?: string;
    }>) ?? [];
    completed.push({
      stepId: msg.id,
      sentAt: new Date().toISOString(),
      messageId: sent?.id,
    });

    const nextIdx = idx + 1;
    const hasNext = nextIdx < messages.length;
    let nextAt: Date | null = null;
    if (hasNext) {
      const d = messages[nextIdx]?.delay ?? { value: 0, unit: 'minutes' };
      const wait =
        d.value *
        (d.unit === 'minutes' ? 60_000 : d.unit === 'hours' ? 3_600_000 : d.unit === 'days' ? 86_400_000 : 7 * 86_400_000);
      nextAt = new Date(Date.now() + wait);
      if (ex.cadence.respectBusinessHours) {
        nextAt = computeNextValidExecution(
          nextAt,
          ex.cadence.businessHoursStart,
          ex.cadence.businessHoursEnd,
          ex.cadence.businessDays,
        );
      }
    }

    await prisma.cadenceExecution.update({
      where: { id: ex.id },
      data: {
        currentStep: nextIdx,
        status: hasNext ? 'ACTIVE' : 'COMPLETED',
        nextExecutionAt: hasNext ? nextAt : null,
        completedSteps: completed as unknown as object,
        pauseReason: null,
      },
    });

    if (hasNext && nextAt) {
      await enqueueStep(ex.id, Math.max(0, nextAt.getTime() - Date.now()));
    }
  } catch (err) {
    log.error({ err, executionId: ex.id }, 'cadence send failed');
    await fail(ex.id, (err as Error).message ?? 'Falha no envio');
    throw err; // BullMQ reagenda com backoff até esgotar attempts
  }
}

async function ensureConversation(contactId: string, connectionId: string) {
  const found = await prisma.conversation.findUnique({
    where: { contactId_connectionId: { contactId, connectionId } },
    select: { id: true },
  });
  if (found) return found;
  return prisma.conversation.create({
    data: { contactId, connectionId, status: 'OPEN' },
    select: { id: true },
  });
}

async function fail(executionId: string, reason: string) {
  await prisma.cadenceExecution.update({
    where: { id: executionId },
    data: { status: 'FAILED', pauseReason: reason, nextExecutionAt: null },
  });
}
