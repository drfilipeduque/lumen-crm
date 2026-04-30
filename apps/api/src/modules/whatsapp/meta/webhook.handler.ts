// Recebimento de eventos da Meta Cloud API.
// Espelha a lógica do Baileys (handleIncomingMessages) mas via webhook HTTP.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { prisma } from '../../../lib/prisma.js';
import { emitToUser } from '../../../lib/realtime.js';
import { formatPhoneBR, normalizePhone, phoneVariants } from '../../../lib/phone.js';
import { saveMessageMedia, type SavedMedia } from '../baileys/media.js';
import { decryptAccessToken } from './crypto.js';
import { downloadMedia, getMediaInfo, MetaApiError } from './meta.service.js';
import { refreshWindow } from './window.service.js';
import { eventBus } from '../../automation/engine/event-bus.js';

// =====================================================================
// HMAC (x-hub-signature-256)
// =====================================================================

export function verifySignature(rawBody: Buffer | string, signature: string | undefined, secret: string): boolean {
  if (!signature) return false;
  const expected = signature.startsWith('sha256=') ? signature.slice(7) : signature;
  const buf = typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody;
  const hmac = createHmac('sha256', secret).update(buf).digest('hex');
  if (hmac.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(hmac, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

// =====================================================================
// PROCESS EVENTS
// =====================================================================

type MetaInboundContact = { wa_id: string; profile?: { name?: string } };

type MetaInboundMessage = {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text?: { body?: string };
  image?: { id?: string; mime_type?: string; caption?: string };
  audio?: { id?: string; mime_type?: string };
  video?: { id?: string; mime_type?: string; caption?: string };
  document?: { id?: string; mime_type?: string; filename?: string; caption?: string };
  sticker?: { id?: string; mime_type?: string };
  context?: { from?: string; id?: string };
};

type MetaStatus = {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  recipient_id: string;
  errors?: Array<{ code: number; title: string; message?: string }>;
};

type MetaChange = {
  field: 'messages' | string;
  value: {
    messaging_product: string;
    metadata?: { display_phone_number?: string; phone_number_id?: string };
    contacts?: MetaInboundContact[];
    messages?: MetaInboundMessage[];
    statuses?: MetaStatus[];
  };
};

export type MetaWebhookPayload = {
  object: string;
  entry?: Array<{ id: string; changes?: MetaChange[] }>;
};

export async function processWebhook(connectionId: string, payload: MetaWebhookPayload): Promise<void> {
  if (!payload.entry?.length) return;
  const conn = await prisma.whatsAppConnection.findUnique({
    where: { id: connectionId },
    select: { id: true, type: true, accessToken: true, phoneNumberId: true },
  });
  if (!conn || conn.type !== 'OFFICIAL') return;

  for (const entry of payload.entry) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'messages') continue;
      const value = change.value;

      // Filtra por phone_number_id quando a conexão tem (nem todas as
      // notificações são pra esta conexão se a WABA tem múltiplos números).
      if (
        conn.phoneNumberId &&
        value.metadata?.phone_number_id &&
        value.metadata.phone_number_id !== conn.phoneNumberId
      ) {
        continue;
      }

      // Mensagens recebidas
      for (const msg of value.messages ?? []) {
        try {
          const contactProfile = value.contacts?.find((c) => c.wa_id === msg.from);
          await processIncoming(conn, msg, contactProfile);
        } catch (e) {
          console.error('[meta/webhook] processIncoming failed', e);
        }
      }

      // Status updates
      for (const st of value.statuses ?? []) {
        try {
          await processStatus(conn.id, st);
        } catch (e) {
          console.error('[meta/webhook] processStatus failed', e);
        }
      }
    }
  }
}

// =====================================================================
// INCOMING
// =====================================================================

async function processIncoming(
  conn: { id: string; accessToken: string | null },
  msg: MetaInboundMessage,
  profile: MetaInboundContact | undefined,
): Promise<void> {
  // Idempotência: se já processamos (re-entrega da Meta), ignora.
  const existing = await prisma.message.findFirst({
    where: { externalId: msg.id },
    select: { id: true },
  });
  if (existing) return;

  const phone = normalizePhone(msg.from);
  if (!phone) return;

  // Encontra/cria contato (mesmo critério phoneVariants do Baileys).
  let contact = await prisma.contact.findFirst({
    where: { phone: { in: phoneVariants(phone) } },
    select: { id: true, name: true, avatar: true },
  });

  let isNewContact = false;
  if (!contact) {
    const fallbackName = profile?.profile?.name?.trim() || formatPhoneBR(phone);
    contact = await prisma.contact.create({
      data: { name: fallbackName, phone },
      select: { id: true, name: true, avatar: true },
    });
    isNewContact = true;
  }

  // Conversation (1 por contato+conexão)
  let conversation = await prisma.conversation.findUnique({
    where: { contactId_connectionId: { contactId: contact.id, connectionId: conn.id } },
    select: { id: true, whatsappJid: true },
  });
  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        contactId: contact.id,
        connectionId: conn.id,
        status: 'OPEN',
        unreadCount: 0,
        whatsappJid: msg.from,
      },
      select: { id: true, whatsappJid: true },
    });
  } else if (conversation.whatsappJid !== msg.from) {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { whatsappJid: msg.from },
    });
  }

  const { type, content, mediaId, mediaName, mediaMime } = extractContent(msg);

  // Se tem mídia, baixa em background (igual Baileys: msg cria sem mediaUrl,
  // depois atualiza). Texto cria a mensagem direto.
  const created = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      fromMe: false,
      type,
      content,
      status: 'DELIVERED',
      externalId: msg.id,
      sentAt: new Date(Number(msg.timestamp) * 1000),
    },
  });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      lastMessageAt: created.createdAt,
      unreadCount: { increment: 1 },
    },
  });

  // Janela de 24h: cliente respondeu, renova.
  await refreshWindow(conversation.id);

  eventBus.publish({
    type: 'message.received',
    entityId: conversation.id,
    actorId: null,
    data: {
      messageId: created.id,
      conversationId: conversation.id,
      contactId: contact.id,
      content: content ?? '',
      type,
      fromMe: false,
    },
  });

  // Aplica regra de entrada (mesma lógica do Baileys).
  await applyEntryRule(conn.id, contact.id, contact.name);

  // Broadcast
  await broadcastNewMessage(conn.id, conversation.id, created.id, contact.id);

  // Mídia em background
  if (mediaId && conn.accessToken) {
    void (async () => {
      try {
        const token = decryptAccessToken(conn.accessToken!);
        const info = await getMediaInfo(mediaId, token);
        const buffer = await downloadMedia(info.url, token);
        const saved: SavedMedia = await saveMessageMedia(conn.id, {
          buffer,
          mimeType: mediaMime ?? info.mime_type,
          originalName: mediaName ?? null,
        });
        await prisma.message.update({
          where: { id: created.id },
          data: { mediaUrl: saved.url, mediaName: saved.name, mediaSize: saved.size },
        });
        await broadcastNewMessage(conn.id, conversation.id, created.id, contact.id);
      } catch (e) {
        console.error('[meta/webhook] media download failed', e);
      }
    })();
  }

  // Marca isNewContact pra debug — não é usado pois applyEntryRule já checa
  void isNewContact;
}

// =====================================================================
// STATUS
// =====================================================================

const STATUS_MAP: Record<MetaStatus['status'], 'SENT' | 'DELIVERED' | 'READ' | 'FAILED'> = {
  sent: 'SENT',
  delivered: 'DELIVERED',
  read: 'READ',
  failed: 'FAILED',
};

async function processStatus(connectionId: string, st: MetaStatus): Promise<void> {
  const msg = await prisma.message.findFirst({
    where: { externalId: st.id },
    select: { id: true, conversationId: true, status: true },
  });
  if (!msg) return;
  const newStatus = STATUS_MAP[st.status];
  if (!newStatus) return;

  const ts = new Date(Number(st.timestamp) * 1000);
  const data: Record<string, unknown> = { status: newStatus };
  if (newStatus === 'DELIVERED') data.deliveredAt = ts;
  if (newStatus === 'READ') data.readAt = ts;
  if (newStatus === 'FAILED' && st.errors?.length) {
    data.metadata = { error: st.errors[0] };
  }

  await prisma.message.update({ where: { id: msg.id }, data });

  // Broadcast (status update)
  const links = await prisma.userWhatsAppConnection.findMany({
    where: { connectionId },
    select: { userId: true },
  });
  for (const l of links) {
    emitToUser(l.userId, 'message:status', {
      conversationId: msg.conversationId,
      messageId: msg.id,
      status: newStatus,
    });
  }
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN', active: true },
    select: { id: true },
  });
  for (const a of admins) {
    emitToUser(a.id, 'message:status', {
      conversationId: msg.conversationId,
      messageId: msg.id,
      status: newStatus,
    });
  }
}

// =====================================================================
// HELPERS — espelham o Baileys
// =====================================================================

function extractContent(msg: MetaInboundMessage): {
  type: 'TEXT' | 'IMAGE' | 'AUDIO' | 'VIDEO' | 'DOCUMENT';
  content: string | null;
  mediaId: string | null;
  mediaName: string | null;
  mediaMime: string | null;
} {
  if (msg.type === 'text') {
    return { type: 'TEXT', content: msg.text?.body ?? null, mediaId: null, mediaName: null, mediaMime: null };
  }
  if (msg.type === 'image') {
    return {
      type: 'IMAGE',
      content: msg.image?.caption ?? null,
      mediaId: msg.image?.id ?? null,
      mediaName: null,
      mediaMime: msg.image?.mime_type ?? null,
    };
  }
  if (msg.type === 'audio') {
    return {
      type: 'AUDIO',
      content: null,
      mediaId: msg.audio?.id ?? null,
      mediaName: null,
      mediaMime: msg.audio?.mime_type ?? null,
    };
  }
  if (msg.type === 'video') {
    return {
      type: 'VIDEO',
      content: msg.video?.caption ?? null,
      mediaId: msg.video?.id ?? null,
      mediaName: null,
      mediaMime: msg.video?.mime_type ?? null,
    };
  }
  if (msg.type === 'document') {
    return {
      type: 'DOCUMENT',
      content: msg.document?.caption ?? msg.document?.filename ?? null,
      mediaId: msg.document?.id ?? null,
      mediaName: msg.document?.filename ?? null,
      mediaMime: msg.document?.mime_type ?? null,
    };
  }
  if (msg.type === 'sticker') {
    return {
      type: 'IMAGE',
      content: null,
      mediaId: msg.sticker?.id ?? null,
      mediaName: null,
      mediaMime: msg.sticker?.mime_type ?? null,
    };
  }
  // interactive, button, location, contacts, reaction → guardamos como texto.
  return { type: 'TEXT', content: `[${msg.type} não suportado]`, mediaId: null, mediaName: null, mediaMime: null };
}

async function applyEntryRule(connectionId: string, contactId: string, contactName: string) {
  const rule = await prisma.connectionEntryRule.findUnique({ where: { connectionId } });
  if (!rule || rule.mode !== 'AUTO') return;

  const existing = await prisma.opportunity.findFirst({
    where: { contactId, pipelineId: rule.pipelineId },
    select: { id: true },
  });
  if (existing) return;

  const stage = await prisma.stage.findUnique({
    where: { id: rule.stageId },
    select: { id: true, pipelineId: true },
  });
  if (!stage || stage.pipelineId !== rule.pipelineId) return;

  const max = await prisma.opportunity.aggregate({
    where: { stageId: rule.stageId },
    _max: { order: true },
  });
  await prisma.opportunity.create({
    data: {
      title: contactName.trim() || 'Novo lead WhatsApp',
      contactId,
      pipelineId: rule.pipelineId,
      stageId: rule.stageId,
      value: 0,
      priority: 'MEDIUM',
      order: (max._max.order ?? -1) + 1,
      history: { create: { action: 'CREATED', toStageId: rule.stageId } },
    },
  });
}

async function broadcastNewMessage(
  connectionId: string,
  conversationId: string,
  messageId: string,
  contactId: string,
) {
  const links = await prisma.userWhatsAppConnection.findMany({
    where: { connectionId },
    select: { userId: true },
  });
  for (const l of links) {
    emitToUser(l.userId, 'message:new', { conversationId, messageId, contactId });
  }
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN', active: true },
    select: { id: true },
  });
  for (const a of admins) {
    emitToUser(a.id, 'message:new', { conversationId, messageId, contactId });
  }
}

// Type guard pra erro de API Meta — re-export pra rotas
export { MetaApiError };
