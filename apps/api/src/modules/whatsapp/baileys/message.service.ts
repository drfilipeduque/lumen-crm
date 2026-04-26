import {
  type WAMessage,
  type MessageUpsertType,
} from '@whiskeysockets/baileys';
import { prisma, type Prisma } from '../../../lib/prisma.js';
import { emitToUser } from '../../../lib/realtime.js';
import { formatPhoneBR, normalizePhone, phoneVariants } from '../../../lib/phone.js';
import { getSocket } from './session-manager.js';
import {
  downloadIncomingMedia,
  inferMessageTypeFromMime,
  readUploadedFile,
  saveMessageMedia,
} from './media.js';

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

  // WhatsApp moderno usa "@lid" pra contatos com privacidade ativa: o id NÃO é
  // telefone, é um identificador interno. Pra esses, usamos o JID como chave
  // de envio e armazenamos um placeholder em Contact.phone (com prefixo "lid:")
  // pra não corromper buscas/exibição por telefone.
  const isLid = jid.endsWith('@lid');
  const idPart = jid.split('@')[0]?.split(':')[0] ?? '';

  let contactPhone: string;
  if (isLid) {
    if (!idPart) return;
    contactPhone = `lid:${idPart}`;
  } else {
    const phone = normalizePhone(idPart);
    if (!phone) return;
    contactPhone = phone;
  }

  const { type, content, mediaUrl } = extractContent(msg);

  // Encontra/cria contato.
  // - Pra @lid: lookup direto pelo placeholder.
  // - Pra telefone real: usa phoneVariants pra cobrir o "9 problem" do BR
  //   e variantes com/sem prefixo 55.
  let contact = await prisma.contact.findFirst({
    where: isLid
      ? { phone: contactPhone }
      : { phone: { in: phoneVariants(contactPhone) } },
    select: { id: true, ownerId: true, name: true },
  });
  let isNewContact = false;
  if (!contact) {
    const fallbackName = isLid
      ? msg.pushName?.trim() || 'Contato sem telefone'
      : msg.pushName?.trim() || formatPhoneBR(contactPhone);
    const created = await prisma.contact.create({
      data: {
        name: fallbackName,
        phone: contactPhone,
      },
      select: { id: true, ownerId: true, name: true },
    });
    contact = created;
    isNewContact = true;
  }

  // Encontra/cria conversation; sempre garante whatsappJid atualizado pro envio.
  let conversation = await prisma.conversation.findUnique({
    where: { contactId_connectionId: { contactId: contact.id, connectionId } },
    select: { id: true, assigneeId: true, whatsappJid: true },
  });
  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        contactId: contact.id,
        connectionId,
        status: 'OPEN',
        unreadCount: 0,
        whatsappJid: jid,
      },
      select: { id: true, assigneeId: true, whatsappJid: true },
    });
  } else if (conversation.whatsappJid !== jid) {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { whatsappJid: jid },
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

  // Mídia: baixa em background e atualiza message + reemite
  if (type !== 'TEXT') {
    void (async () => {
      try {
        const dl = await downloadIncomingMedia(msg);
        if (!dl) return;
        const saved = await saveMessageMedia(connectionId, {
          buffer: dl.buffer,
          mimeType: dl.mimeType,
          originalName: dl.fileName,
        });
        await prisma.message.update({
          where: { id: created.id },
          data: { mediaUrl: saved.url, mediaName: saved.name, mediaSize: saved.size },
        });
        await broadcastNewMessage(connectionId, conversation.id, created.id, contact.id);
      } catch (e) {
        console.error('[whatsapp/incoming] media download failed', e);
      }
    })();
  }
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
  mediaName?: string | null;
  mediaMimeType?: string | null;
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

  // Prioriza o JID que o Baileys já nos entregou (cobre @lid e device suffixes).
  // Fallback: monta a partir do phone — só funciona se for telefone real,
  // não LID placeholder.
  let jid: string;
  if (conv.whatsappJid) {
    jid = conv.whatsappJid;
  } else {
    if (conv.contact.phone.startsWith('lid:')) {
      throw new WAMessageError(
        'NO_JID',
        'Esse contato não tem telefone visível e a conversa ainda não tem JID resolvido',
        400,
      );
    }
    const phone = normalizePhone(conv.contact.phone);
    jid = `${phone}@s.whatsapp.net`;
  }

  // Pra mídia: lê o arquivo do disco se for /uploads/
  let mediaBuffer: Buffer | null = null;
  let mediaSize: number | null = null;
  if (input.type !== 'TEXT' && input.mediaUrl && input.mediaUrl.startsWith('/uploads/')) {
    try {
      const f = await readUploadedFile(input.mediaUrl);
      mediaBuffer = f.buffer;
      mediaSize = f.size;
    } catch {
      throw new WAMessageError('MEDIA_READ_FAILED', 'Falha ao ler mídia anexada', 400);
    }
  }

  let payload: Parameters<typeof socket.sendMessage>[1];
  switch (input.type) {
    case 'TEXT':
      payload = { text: input.content ?? '' } as Parameters<typeof socket.sendMessage>[1];
      break;
    case 'IMAGE':
      payload = {
        image: mediaBuffer ?? { url: input.mediaUrl ?? '' },
        caption: input.content ?? undefined,
      } as Parameters<typeof socket.sendMessage>[1];
      break;
    case 'AUDIO':
      payload = {
        audio: mediaBuffer ?? { url: input.mediaUrl ?? '' },
        mimetype: input.mediaName?.endsWith('.ogg') ? 'audio/ogg; codecs=opus' : 'audio/mp4',
        ptt: true,
      } as Parameters<typeof socket.sendMessage>[1];
      break;
    case 'VIDEO':
      payload = {
        video: mediaBuffer ?? { url: input.mediaUrl ?? '' },
        caption: input.content ?? undefined,
      } as Parameters<typeof socket.sendMessage>[1];
      break;
    case 'DOCUMENT':
      payload = {
        document: mediaBuffer ?? { url: input.mediaUrl ?? '' },
        fileName: input.mediaName ?? input.content ?? 'arquivo',
        mimetype: input.mediaMimeType ?? 'application/octet-stream',
      } as Parameters<typeof socket.sendMessage>[1];
      break;
  }

  let externalId: string | null = null;
  try {
    const r = await socket.sendMessage(jid, payload);
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
      mediaName: input.mediaName ?? null,
      mediaSize: mediaSize ?? null,
      status: 'SENT',
      externalId,
      sentAt: new Date(),
    },
  });

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: created.createdAt },
  });

  // Notifica outros users (admins / vinculados) sobre a mensagem enviada
  await broadcastNewMessage(conv.connectionId, conversationId, created.id, conv.contact.id);

  return created;
}

// Helpers de tipo (manter export pra uso em rotas)
export type { Prisma };
