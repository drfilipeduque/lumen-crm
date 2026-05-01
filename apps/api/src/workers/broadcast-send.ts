// Worker BullMQ que envia 1 BroadcastRecipient por vez via Meta Cloud
// (sendTemplateViaMeta). Antes de cada envio, valida que a campanha está
// SENDING; se PAUSED/CANCELLED, marca como SKIPPED.
//
// Atualiza status individual do recipient e contadores agregados da campanha
// via updateCampaignProgress.

import { Worker } from 'bullmq';
import type { FastifyBaseLogger } from 'fastify';
import { redis } from '../lib/redis.js';
import { prisma } from '../lib/prisma.js';
import {
  QUEUE_BROADCAST_SEND,
  type BroadcastSendJob,
} from '../modules/broadcasts/broadcasts.queue.js';
import { updateCampaignProgress } from '../modules/broadcasts/broadcasts.service.js';

let started = false;

export function startBroadcastSendWorker(log: FastifyBaseLogger) {
  if (started) return;
  started = true;

  const worker = new Worker<BroadcastSendJob>(
    QUEUE_BROADCAST_SEND,
    async (job) => processOne(job.data.recipientId, log),
    { connection: redis, concurrency: 1 },
  );
  worker.on('failed', (job, err) => {
    log.warn({ jobId: job?.id, err: err.message }, 'broadcast send failed');
  });
  log.info('broadcast-send worker started');
}

async function processOne(recipientId: string, log: FastifyBaseLogger) {
  const recipient = await prisma.broadcastRecipient.findUnique({
    where: { id: recipientId },
    include: {
      campaign: {
        select: {
          id: true,
          status: true,
          connectionId: true,
          templateId: true,
          templateVariables: true,
        },
      },
      contact: { select: { id: true, name: true, phone: true } },
    },
  });
  if (!recipient) return;
  if (recipient.status !== 'PENDING') return;

  const camp = recipient.campaign;
  if (camp.status !== 'SENDING' && camp.status !== 'SCHEDULED') {
    // Pausada ou cancelada: marca como SKIPPED e atualiza progresso
    await prisma.broadcastRecipient.update({
      where: { id: recipientId },
      data: { status: 'SKIPPED', error: `Campaign ${camp.status}` },
    });
    await updateCampaignProgress(camp.id);
    return;
  }

  // Se ainda estava SCHEDULED, o tempo chegou — promove pra SENDING
  if (camp.status === 'SCHEDULED') {
    await prisma.broadcastCampaign.update({
      where: { id: camp.id },
      data: { status: 'SENDING', startedAt: new Date() },
    });
  }

  try {
    // Garante conversation entre contact + connection
    let conv = await prisma.conversation.findUnique({
      where: {
        contactId_connectionId: {
          contactId: recipient.contactId,
          connectionId: camp.connectionId,
        },
      },
      select: { id: true },
    });
    if (!conv) {
      conv = await prisma.conversation.create({
        data: { contactId: recipient.contactId, connectionId: camp.connectionId, status: 'OPEN' },
        select: { id: true },
      });
    }

    const { loadConvForSend, sendTemplateViaMeta } = await import('../modules/whatsapp/meta/send.service.js');
    const metaConv = await loadConvForSend(conv.id);
    if (!metaConv) throw new Error('Conversa Meta não pôde ser carregada');

    // Renderiza variáveis do template ({{contact.name}}, etc.)
    const vars = renderTemplateVars(
      (camp.templateVariables as Record<string, string>) ?? {},
      recipient.contact,
    );
    const sent = await sendTemplateViaMeta(metaConv, camp.templateId, vars);
    const messageId = (sent as { id?: string; externalId?: string | null })?.id ?? null;

    await prisma.broadcastRecipient.update({
      where: { id: recipientId },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        messageId,
        externalId: (sent as { externalId?: string | null })?.externalId ?? null,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Falha desconhecida';
    log.warn({ recipientId, err: msg }, 'broadcast recipient failed');
    await prisma.broadcastRecipient
      .update({ where: { id: recipientId }, data: { status: 'FAILED', error: msg } })
      .catch(() => {});
  } finally {
    await updateCampaignProgress(camp.id).catch(() => {});
  }
}

// Renderiza valores do tipo "{{contact.name}}" ou "fixo: ..." pra valor final.
function renderTemplateVars(
  raw: Record<string, string>,
  contact: { name: string; phone: string },
): Record<string, string> {
  const out: Record<string, string> = {};
  const firstName = contact.name.trim().split(/\s+/)[0] ?? '';
  for (const [k, v] of Object.entries(raw)) {
    let val = v;
    val = val.replace(/\{\{\s*contact\.name\s*\}\}/g, contact.name);
    val = val.replace(/\{\{\s*contact\.firstName\s*\}\}/g, firstName);
    val = val.replace(/\{\{\s*contact\.phone\s*\}\}/g, contact.phone);
    // Suporta "fixo: ..." pra texto literal opcional
    val = val.replace(/^fixo:\s*/i, '');
    out[k] = val;
  }
  return out;
}
