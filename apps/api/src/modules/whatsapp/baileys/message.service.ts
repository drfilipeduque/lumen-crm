import {
  areJidsSameUser,
  type WAMessage,
  type MessageUpsertType,
} from 'baileys';
import { prisma, type Prisma } from '../../../lib/prisma.js';
import { emitToUser } from '../../../lib/realtime.js';
import { formatPhoneBR, normalizePhone, phoneVariants } from '../../../lib/phone.js';
import { eventBus } from '../../automation/engine/event-bus.js';
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
  for (const msg of event.messages) {
    // 'notify' = mensagem chegando agora (cliente escrevendo).
    // 'append' = sync histórico OU eco de mensagens enviadas pelo APP do
    //   celular conectado. Aceitamos append APENAS quando fromMe — assim
    //   o atendente que respondeu pelo celular vê a msg no CRM, mas não
    //   trazemos histórico inteiro de volta a cada reconexão.
    if (event.type !== 'notify' && !msg.key.fromMe) continue;
    try {
      await processOne(connectionId, msg);
    } catch (e) {
      console.error('[whatsapp/incoming] process failed', e);
    }
  }
}

async function processOne(connectionId: string, msg: WAMessage) {
  // Mensagens fromMe podem ter duas origens:
  //   (a) enviadas pelo CRM — já temos uma Message com esse externalId,
  //       então ignoramos pra não duplicar.
  //   (b) enviadas pelo APP do celular conectado — não temos registro;
  //       precisamos espelhar pro histórico ficar completo.
  const fromMe = !!msg.key.fromMe;
  if (fromMe && msg.key.id) {
    const exists = await prisma.message.findFirst({
      where: { externalId: msg.key.id },
      select: { id: true },
    });
    if (exists) return;
  }

  // Ignora mensagens de grupo por ora (jids com "@g.us")
  const jid = msg.key.remoteJid;
  if (!jid || jid.endsWith('@g.us') || jid === 'status@broadcast') return;

  // Ignora "chat consigo mesmo" — quando o remoteJid é o próprio número
  // conectado. Vem em sync histórico ou em notas pessoais; não deve virar
  // conversa de cliente.
  const sock = getSocket(connectionId);
  if (sock?.user?.id && areJidsSameUser(jid, sock.user.id)) return;

  // WhatsApp moderno usa "@lid" pra contatos com privacidade ativa: o id NÃO é
  // telefone, é um identificador interno. Tentamos resolver via lidMapping
  // do baileys (v7+); quando não dá, armazenamos um placeholder em
  // Contact.phone (com prefixo "lid:") pra não corromper buscas/exibição.
  const isLid = jid.endsWith('@lid');
  const idPart = jid.split('@')[0]?.split(':')[0] ?? '';

  let contactPhone: string;
  let resolvedFromLid = false;
  if (isLid) {
    if (!idPart) return;
    // Tenta resolver LID → PN via store interno do baileys.
    let pnJid: string | null = null;
    try {
      pnJid = (await sock?.signalRepository?.lidMapping?.getPNForLID?.(jid)) ?? null;
    } catch {
      pnJid = null;
    }
    const pnDigits = pnJid
      ? normalizePhone(pnJid.split('@')[0]?.split(':')[0] ?? '')
      : '';
    if (pnDigits) {
      contactPhone = pnDigits;
      resolvedFromLid = true;
    } else {
      contactPhone = `lid:${idPart}`;
    }
  } else {
    const phone = normalizePhone(idPart);
    if (!phone) return;
    contactPhone = phone;
  }

  const { type, content, mediaUrl } = extractContent(msg);

  // Encontra/cria contato.
  // - Telefone real (incluindo LID resolvido): phoneVariants cobre o "9 problem".
  // - LID não-resolvido: lookup direto pelo placeholder.
  const phoneIsPlaceholder = contactPhone.startsWith('lid:');
  let contact = await prisma.contact.findFirst({
    where: phoneIsPlaceholder
      ? { phone: contactPhone }
      : { phone: { in: phoneVariants(contactPhone) } },
    select: { id: true, ownerId: true, name: true, avatar: true },
  });

  // Migração silenciosa: contato antigo salvo como "lid:<id>" agora resolve
  // pra um PN. Reaproveita o mesmo Contact e atualiza pro telefone real.
  if (!contact && resolvedFromLid) {
    const legacy = await prisma.contact.findFirst({
      where: { phone: `lid:${idPart}` },
      select: { id: true, ownerId: true, name: true, avatar: true },
    });
    if (legacy) {
      await prisma.contact.update({
        where: { id: legacy.id },
        data: { phone: contactPhone },
      });
      contact = legacy;
    }
  }

  let isNewContact = false;
  if (!contact) {
    const fallbackName = phoneIsPlaceholder
      ? msg.pushName?.trim() || 'Contato sem telefone'
      : msg.pushName?.trim() || formatPhoneBR(contactPhone);
    const created = await prisma.contact.create({
      data: {
        name: fallbackName,
        phone: contactPhone,
      },
      select: { id: true, ownerId: true, name: true, avatar: true },
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
      fromMe,
      type,
      content,
      mediaUrl,
      // fromMe enviada pelo app do celular: marca como SENT (o servidor já
      // entregou — esse evento veio do próprio WhatsApp). Recebida do
      // contato: DELIVERED (chegou pra gente).
      status: fromMe ? 'SENT' : 'DELIVERED',
      externalId: msg.key.id ?? null,
      sentAt: msg.messageTimestamp
        ? new Date(Number(msg.messageTimestamp) * 1000)
        : new Date(),
    },
  });

  eventBus.publish({
    type: fromMe ? 'message.sent' : 'message.received',
    entityId: conversation.id,
    actorId: fromMe ? 'system' : null,
    data: {
      messageId: created.id,
      conversationId: conversation.id,
      contactId: contact.id,
      connectionId,
      connectionType: 'UNOFFICIAL',
      content: content ?? '',
      type,
      fromMe,
    },
  });

  // Atualiza conversation. Só conta unread quando é o contato escrevendo.
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      lastMessageAt: created.createdAt,
      ...(fromMe ? {} : { unreadCount: { increment: 1 } }),
    },
  });

  // Aplica regra de entrada em toda mensagem. applyEntryRule decide se
  // cria a opportunity: só cria se o contato não tem nenhuma opportunity
  // no pipeline configurado (em qualquer etapa). Assim, lead antigo que
  // voltou a falar vira lead novo; quem já está no funil permanece onde
  // o usuário deixou.
  await applyEntryRule(connectionId, contact.id, contact.name);

  // Notifica via socket os users autorizados (e admins)
  await broadcastNewMessage(connectionId, conversation.id, created.id, contact.id, fromMe);

  // Avatar do contato — busca em background quando ainda não temos.
  // profilePictureUrl pode demorar/falhar (CDN expira ou usuário com
  // privacidade), então fica fora do path quente.
  const contactId = contact.id;
  if (!contact.avatar) {
    void (async () => {
      try {
        const url = (await sock?.profilePictureUrl?.(jid, 'image')) ?? null;
        if (url) {
          await prisma.contact.update({ where: { id: contactId }, data: { avatar: url } });
          await broadcastNewMessage(connectionId, conversation.id, created.id, contactId, fromMe);
        }
      } catch {
        /* sem foto / privacidade — segue sem avatar */
      }
    })();
  }

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
        await broadcastNewMessage(connectionId, conversation.id, created.id, contact.id, fromMe);
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

async function applyEntryRule(connectionId: string, contactId: string, contactName: string) {
  const rule = await prisma.connectionEntryRule.findUnique({
    where: { connectionId },
  });
  if (!rule || rule.mode !== 'AUTO') return;

  // Já tem opp neste pipeline (em qualquer etapa)? Não mexe — usuário
  // controla a movimentação manualmente pelo kanban/conversa.
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
  fromMe: boolean,
) {
  const links = await prisma.userWhatsAppConnection.findMany({
    where: { connectionId },
    select: { userId: true },
  });
  for (const l of links) {
    emitToUser(l.userId, 'message:new', { conversationId, messageId, contactId, fromMe });
  }
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN', active: true },
    select: { id: true },
  });
  for (const a of admins) {
    emitToUser(a.id, 'message:new', { conversationId, messageId, contactId, fromMe });
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

  // Roteamento por tipo de conexão
  if (conv.connection.type === 'OFFICIAL') {
    const { loadConvForSend, sendViaMeta, MetaSendError } = await import('../meta/send.service.js');
    const metaConv = await loadConvForSend(conversationId);
    if (!metaConv) throw new WAMessageError('NOT_FOUND', 'Conversa não encontrada', 404);
    try {
      return await sendViaMeta(metaConv, input);
    } catch (e) {
      if (e instanceof MetaSendError) throw new WAMessageError(e.code, e.message, e.status);
      throw e;
    }
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

  eventBus.publish({
    type: 'message.sent',
    entityId: conversationId,
    actorId: actor.id,
    data: {
      messageId: created.id,
      conversationId,
      contactId: conv.contact.id,
      connectionId: conv.connectionId,
      connectionType: 'UNOFFICIAL',
      content: input.content ?? '',
      type: input.type,
      fromMe: true,
    },
  });

  // Notifica outros users (admins / vinculados) sobre a mensagem enviada
  await broadcastNewMessage(conv.connectionId, conversationId, created.id, conv.contact.id, true);

  return created;
}

// Helpers de tipo (manter export pra uso em rotas)
export type { Prisma };
