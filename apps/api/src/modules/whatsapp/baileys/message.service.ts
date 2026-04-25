import {
  type WAMessage,
  type proto,
  type MessageUpsertType,
} from '@whiskeysockets/baileys';
import { prisma, type Prisma } from '../../../lib/prisma.js';
import { emitToUser } from '../../../lib/realtime.js';
import { normalizePhone, formatPhoneBR } from '../../../lib/phone.js';
import { getSocket } from './session-manager.js';

type Actor = { id: string; role: string };

export class WAMessageError extends Error {
  status: number;
  code: string;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

// ============================================================
// INCOMING (Baileys → CRM)
// ============================================================

export async function handleIncomingMessages(
  connectionId: string,
  event: { messages: WAMessage[]; type: MessageUpsertType },
): Promise<void> {
  if (event.type !== 'notify') return;

  for (const msg of event.messages) {
    try {
      await processOne(connectionId, msg);
    } catch (e) {
      console.error('[whatsapp/incoming] process failed', e);
    }
  }
}

async function processOne(connectionId: string, msg: WAMessage) {
  // Ignora mensagens nossas (já registradas no envio)
  if (msg.key.fromMe) return;
  // Ignora mensagens de grupo por ora (jids com "@g.us")
  const jid = msg.key.remoteJid;
  if (!jid || jid.endsWith('@g.us') || jid === 'status@broadcast') return;

  const phoneRaw = jid.split('@')[0]?.split(':')[0] ?? '';
  const phone = normalizePhone(phoneRaw);
  if (!phone) return;

  const { type, content, mediaUrl } = extractContent(msg);

  // Encontra/cria contato
  let contact = await prisma.contact.findFirst({
    where: { phone: { in: [phone, `+${phone}`] } },
    select: { id: true, ownerId: true, name: true },
  });
  let isNewContact = false;
  if (!contact) {
    const created = await prisma.contact.create({
      data: {
        name: msg.pushName?.trim() || formatPhoneBR(phone),
        phone,
      },
      select: { id: true, ownerId: true, name: true },
    });
    contact = created;
    isNewContact = true;
  }

  // Encontra/cria conversation
  let conversation = await prisma.conversation.findUnique({
    where: { contactId_connectionId: { contactId: contact.id, connectionId } },
    select: { id: true, assigneeId: true },
  });
  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        contactId: contact.id,
        connectionId,
        status: 'OPEN',
        unreadCount: 0,
      },
      select: { id: true, assigneeId: true },
    });
  }

  // Cria a mensagem
  const created = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      fromMe: false,
      type,
      content,
      mediaUrl,
      status: 'DELIVERED',
      externalId: msg.key.id ?? null,
      sentAt: msg.messageTimestamp
        ? new Date(Number(msg.messageTimestamp) * 1000)
        : new Date(),
    },
  });

  // Atualiza conversation
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      lastMessageAt: created.createdAt,
      unreadCount: { increment: 1 },
    },
  });

  // Aplica regra de entrada se contato é novo
  if (isNewContact) {
    await applyEntryRule(connectionId, contact.id);
  }

  // Notifica via socket os users autorizados (e admins)
  await broadcastNewMessage(connectionId, conversation.id, created.id, contact.id);
}

function extractContent(msg: WAMessage): {
  type: 'TEXT' | 'IMAGE' | 'AUDIO' | 'DOCUMENT' | 'VIDEO';
  content: string | null;
  mediaUrl: string | null;
} {
  const m = msg.message;
  if (!m) return { type: 'TEXT', content: null, mediaUrl: null };

  if (m.conversation) return { type: 'TEXT', content: m.conversation, mediaUrl: null };
  if (m.extendedTextMessage?.text)
    return { type: 'TEXT', content: m.extendedTextMessage.text, mediaUrl: null };
  if (m.imageMessage)
    return { type: 'IMAGE', content: m.imageMessage.caption ?? null, mediaUrl: null };
  if (m.audioMessage) return { type: 'AUDIO', content: null, mediaUrl: null };
  if (m.videoMessage)
    return { type: 'VIDEO', content: m.videoMessage.caption ?? null, mediaUrl: null };
  if (m.documentMessage)
    return { type: 'DOCUMENT', content: m.documentMessage.fileName ?? null, mediaUrl: null };

  return { type: 'TEXT', content: '[mensagem nao suportada]', mediaUrl: null };
}

async function applyEntryRule(connectionId: string, contactId: string) {
  const rule = await prisma.connectionEntryRule.findUnique({
    where: { connectionId },
  });
  if (!rule || rule.mode !== 'AUTO') return;

  // Cria opportunity inicial
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
      title: 'Novo lead WhatsApp',
      contactId,
      pipelineId: rule.pipelineId,
      stageId: rule.stageId,
      value: 0,
      priority: 'MEDIUM',
      order: (max._max.order ?? -1) + 1,
      history: {
        create: { action: 'CREATED', toStageId: rule.stageId },
      },
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

// ============================================================
// OUTGOING (CRM → Baileys)
// ============================================================

type SendInput = {
  type: 'TEXT' | 'IMAGE' | 'AUDIO' | 'DOCUMENT' | 'VIDEO';
  content?: string | null;
  mediaUrl?: string | null;
};

export async function sendMessageToConversation(
  actor: Actor,
  conversationId: string,
  input: SendInput,
) {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      contact: { select: { id: true, name: true, phone: true } },
      connection: { select: { id: true, type: true, active: true } },
    },
  });
  if (!conv) throw new WAMessageError('NOT_FOUND', 'Conversa não encontrada', 404);

  // Permissão: admin ou link em UserWhatsAppConnection
  if (actor.role !== 'ADMIN') {
    const link = await prisma.userWhatsAppConnection.findUnique({
      where: { userId_connectionId: { userId: actor.id, connectionId: conv.connectionId } },
      select: { userId: true },
    });
    if (!link) throw new WAMessageError('FORBIDDEN', 'Sem permissão pra essa conexão', 403);
  }

  const socket = getSocket(conv.connectionId);
  if (!socket) {
    throw new WAMessageError('NOT_CONNECTED', 'Conexão WhatsApp não está ativa', 503);
  }

  const phone = normalizePhone(conv.contact.phone);
  const jid = `${phone}@s.whatsapp.net`;

  let payload: proto.IMessage;
  switch (input.type) {
    case 'TEXT':
      payload = { conversation: input.content ?? '' };
      break;
    case 'IMAGE':
      payload = {
        imageMessage: { caption: input.content ?? '', url: input.mediaUrl ?? '' } as proto.Message.IImageMessage,
      };
      break;
    case 'AUDIO':
      payload = {
        audioMessage: { url: input.mediaUrl ?? '' } as proto.Message.IAudioMessage,
      };
      break;
    case 'VIDEO':
      payload = {
        videoMessage: { caption: input.content ?? '', url: input.mediaUrl ?? '' } as proto.Message.IVideoMessage,
      };
      break;
    case 'DOCUMENT':
      payload = {
        documentMessage: { fileName: input.content ?? 'arquivo', url: input.mediaUrl ?? '' } as proto.Message.IDocumentMessage,
      };
      break;
  }

  let externalId: string | null = null;
  try {
    const r = await socket.sendMessage(jid, payload as Parameters<typeof socket.sendMessage>[1]);
    externalId = r?.key?.id ?? null;
  } catch (e) {
    throw new WAMessageError(
      'SEND_FAILED',
      e instanceof Error ? e.message : 'Falha no envio',
      502,
    );
  }

  const created = await prisma.message.create({
    data: {
      conversationId,
      fromMe: true,
      type: input.type,
      content: input.content ?? null,
      mediaUrl: input.mediaUrl ?? null,
      status: 'SENT',
      externalId,
      sentAt: new Date(),
    },
  });

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: created.createdAt },
  });

  return created;
}

// Helpers de tipo (manter export pra uso em rotas)
export type { Prisma };
