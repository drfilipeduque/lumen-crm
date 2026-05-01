// Worker BullMQ que dispara mensagens agendadas individuais quando a hora chega.
// Cada job carrega { id } e o worker carrega os detalhes do banco no momento
// da execução — então edits feitos antes do dispatch valem.

import { Worker } from 'bullmq';
import type { FastifyBaseLogger } from 'fastify';
import { redis } from '../lib/redis.js';
import { prisma } from '../lib/prisma.js';
import {
  QUEUE_SCHEDULED_MESSAGE,
  type ScheduledMessageJob,
} from '../modules/scheduled-messages/scheduled-messages.queue.js';

let started = false;

export function startScheduledMessageWorker(log: FastifyBaseLogger) {
  if (started) return;
  started = true;

  const worker = new Worker<ScheduledMessageJob>(
    QUEUE_SCHEDULED_MESSAGE,
    async (job) => {
      const { id } = job.data;
      await processOne(id, log);
    },
    { connection: redis, concurrency: 4 },
  );
  worker.on('failed', (job, err) => {
    log.warn({ jobId: job?.id, scheduledId: job?.data?.id, err: err.message }, 'scheduled message failed');
  });
  log.info('scheduled-message worker started');
}

async function processOne(id: string, log: FastifyBaseLogger) {
  const sm = await prisma.scheduledMessage.findUnique({
    where: { id },
    include: {
      contact: { select: { id: true, name: true, phone: true } },
      connection: { select: { id: true, type: true, active: true } },
    },
  });
  if (!sm) return; // foi deletada
  if (sm.status !== 'PENDING') return;
  if (!sm.connection.active) {
    await fail(id, 'Conexão desativada');
    return;
  }

  try {
    // Garante que existe conversation entre contact + connection
    let conv = await prisma.conversation.findUnique({
      where: { contactId_connectionId: { contactId: sm.contactId, connectionId: sm.connectionId } },
      select: { id: true },
    });
    if (!conv) {
      conv = await prisma.conversation.create({
        data: { contactId: sm.contactId, connectionId: sm.connectionId, status: 'OPEN' },
        select: { id: true },
      });
    }

    let messageId: string | null = null;

    if (sm.contentType === 'TEMPLATE') {
      const { loadConvForSend, sendTemplateViaMeta } = await import('../modules/whatsapp/meta/send.service.js');
      const metaConv = await loadConvForSend(conv.id);
      if (!metaConv) throw new Error('Conversa não pôde ser carregada (Meta)');
      const sent = await sendTemplateViaMeta(
        metaConv,
        sm.content, // templateId guardado em content
        (sm.templateVariables as Record<string, string>) ?? {},
      );
      messageId = (sent as { id?: string })?.id ?? null;
    } else {
      // TEXT ou SCRIPT — renderiza variáveis simples e envia
      let body = sm.content;
      if (sm.contentType === 'SCRIPT') {
        const sc = await prisma.script.findUnique({ where: { id: sm.content } });
        body = sc?.content ?? '';
      }
      body = renderBasicVars(body, { contact: sm.contact });

      const { sendMessageToConversation } = await import('../modules/whatsapp/baileys/message.service.js');
      const sent = await sendMessageToConversation(
        { id: sm.createdById, role: 'ADMIN' },
        conv.id,
        sm.mediaUrl
          ? { type: 'IMAGE', content: body || null, mediaUrl: sm.mediaUrl, mediaName: sm.mediaName, mediaMimeType: sm.mediaMimeType }
          : { type: 'TEXT', content: body },
      );
      messageId = (sent as { id?: string })?.id ?? null;
    }

    await prisma.scheduledMessage.update({
      where: { id },
      data: { status: 'SENT', sentAt: new Date(), messageId },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Falha desconhecida';
    log.warn({ scheduledId: id, err: msg }, 'scheduled message dispatch failed');
    await fail(id, msg);
    throw err; // BullMQ marca como failed e respeita attempts
  }
}

async function fail(id: string, error: string) {
  await prisma.scheduledMessage
    .update({ where: { id }, data: { status: 'FAILED', error } })
    .catch(() => {});
}

// Substitui {{contact.name}}, {{contact.phone}} e {{contact.firstName}}.
// Sem builder pesado — escopo de scheduled message é minimalista.
function renderBasicVars(
  template: string,
  scope: { contact: { name: string; phone: string } },
): string {
  const firstName = scope.contact.name.trim().split(/\s+/)[0] ?? '';
  return template
    .replace(/\{\{\s*contact\.name\s*\}\}/g, scope.contact.name)
    .replace(/\{\{\s*contact\.firstName\s*\}\}/g, firstName)
    .replace(/\{\{\s*contact\.phone\s*\}\}/g, scope.contact.phone);
}
