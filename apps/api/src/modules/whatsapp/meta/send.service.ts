// Envio de mensagens via Meta Cloud API. Persiste no banco igual ao
// caminho do Baileys e propaga via socket. Janela de 24h é checada
// pra texto livre/mídia (templates podem enviar com a janela fechada).

import { Prisma, prisma } from '../../../lib/prisma.js';
import { emitToUser } from '../../../lib/realtime.js';
import { decryptAccessToken } from './crypto.js';
import { MetaApiError, sendMedia, sendTemplate, sendText } from './meta.service.js';
import { calculateStatus } from './window.service.js';
import { buildSendComponents } from './templates.service.js';
import { eventBus } from '../../automation/engine/event-bus.js';

export class MetaSendError extends Error {
  status: number;
  code: string;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export type MetaSendInput = {
  type: 'TEXT' | 'IMAGE' | 'AUDIO' | 'DOCUMENT' | 'VIDEO';
  content?: string | null;
  mediaUrl?: string | null;
  mediaName?: string | null;
  mediaMimeType?: string | null;
};

type Conv = {
  id: string;
  contactId: string;
  connectionId: string;
  whatsappJid: string | null;
  windowExpiresAt: Date | null;
  contact: { id: string; phone: string };
  connection: {
    id: string;
    type: 'OFFICIAL' | 'UNOFFICIAL';
    accessToken: string | null;
    phoneNumberId: string | null;
  };
};

function recipientFromConv(conv: Conv): string {
  // Meta espera o número internacional sem '+' (apenas dígitos).
  // whatsappJid pra OFFICIAL guarda o "from" (já é o wa_id).
  if (conv.whatsappJid && /^\d+$/.test(conv.whatsappJid)) return conv.whatsappJid;
  return conv.contact.phone.replace(/\D+/g, '');
}

// =====================================================================
// PUBLIC API URL — necessária pra mídia (Meta baixa do nosso server)
// =====================================================================

function publicMediaUrl(mediaUrl: string): string {
  const base = process.env.PUBLIC_API_URL?.replace(/\/+$/, '') ?? '';
  if (!base) {
    throw new MetaSendError(
      'NO_PUBLIC_URL',
      'PUBLIC_API_URL não configurada — Meta precisa de URL pública pra baixar mídia',
      500,
    );
  }
  if (mediaUrl.startsWith('http://') || mediaUrl.startsWith('https://')) return mediaUrl;
  return `${base}${mediaUrl.startsWith('/') ? '' : '/'}${mediaUrl}`;
}

// =====================================================================
// SEND TEXT / MEDIA
// =====================================================================

export async function sendViaMeta(conv: Conv, input: MetaSendInput) {
  if (!conv.connection.accessToken || !conv.connection.phoneNumberId) {
    throw new MetaSendError('NOT_OFFICIAL', 'Conexão não é Meta Cloud API', 400);
  }
  const status = calculateStatus(conv.windowExpiresAt);
  if (!status.open) {
    throw new MetaSendError(
      'WINDOW_CLOSED',
      'Janela de 24h fechada — só é possível enviar templates',
      422,
    );
  }
  const token = decryptAccessToken(conv.connection.accessToken);
  const to = recipientFromConv(conv);

  let externalId = '';
  try {
    if (input.type === 'TEXT') {
      externalId = await sendText(conv.connection.phoneNumberId, token, to, input.content ?? '');
    } else {
      if (!input.mediaUrl) throw new MetaSendError('NO_MEDIA', 'mediaUrl obrigatório', 400);
      const url = publicMediaUrl(input.mediaUrl);
      externalId = await sendMedia(conv.connection.phoneNumberId, token, to, {
        type: input.type,
        url,
        caption: input.content ?? undefined,
        filename: input.mediaName ?? undefined,
      });
    }
  } catch (e) {
    if (e instanceof MetaApiError) throw new MetaSendError(e.code, e.message, e.status);
    throw e;
  }

  return persistOutgoing(conv, {
    type: input.type,
    content: input.content ?? null,
    mediaUrl: input.mediaUrl ?? null,
    mediaName: input.mediaName ?? null,
    externalId,
    metadata: null,
  });
}

// =====================================================================
// SEND TEMPLATE
// =====================================================================

export async function sendTemplateViaMeta(
  conv: Conv,
  templateId: string,
  variables: Record<string, string>,
) {
  if (!conv.connection.accessToken || !conv.connection.phoneNumberId) {
    throw new MetaSendError('NOT_OFFICIAL', 'Conexão não é Meta Cloud API', 400);
  }
  const tmpl = await prisma.template.findUnique({ where: { id: templateId } });
  if (!tmpl || tmpl.connectionId !== conv.connection.id) {
    throw new MetaSendError('TEMPLATE_NOT_FOUND', 'Template não encontrado nesta conexão', 404);
  }
  if (tmpl.status !== 'APPROVED') {
    throw new MetaSendError('TEMPLATE_NOT_APPROVED', 'Template ainda não aprovado pela Meta', 400);
  }

  const components = buildSendComponents(
    { body: tmpl.body, header: tmpl.header, buttons: tmpl.buttons },
    variables,
  );
  const token = decryptAccessToken(conv.connection.accessToken);
  const to = recipientFromConv(conv);

  let externalId = '';
  try {
    externalId = await sendTemplate(conv.connection.phoneNumberId, token, to, {
      name: tmpl.name,
      language: tmpl.language,
      components,
    });
  } catch (e) {
    if (e instanceof MetaApiError) throw new MetaSendError(e.code, e.message, e.status);
    throw e;
  }

  // Renderiza o body com as variáveis pra exibir no chat (assim quem abrir
  // a conversa vê o texto enviado, não os {{1}} crus).
  const rendered = tmpl.body.replace(/\{\{(\d+)\}\}/g, (_m, idx) => variables[idx] ?? '');

  return persistOutgoing(conv, {
    type: 'TEMPLATE',
    content: rendered,
    mediaUrl: null,
    mediaName: null,
    externalId,
    metadata: {
      templateId: tmpl.id,
      templateName: tmpl.name,
      language: tmpl.language,
      variables,
    },
  });
}

// =====================================================================
// PERSIST + BROADCAST
// =====================================================================

type PersistInput = {
  type: 'TEXT' | 'IMAGE' | 'AUDIO' | 'DOCUMENT' | 'VIDEO' | 'TEMPLATE';
  content: string | null;
  mediaUrl: string | null;
  mediaName: string | null;
  externalId: string;
  metadata: Record<string, unknown> | null;
};

async function persistOutgoing(conv: Conv, p: PersistInput) {
  const created = await prisma.message.create({
    data: {
      conversationId: conv.id,
      fromMe: true,
      type: p.type,
      content: p.content,
      mediaUrl: p.mediaUrl,
      mediaName: p.mediaName,
      status: 'SENT',
      externalId: p.externalId || null,
      metadata: (p.metadata ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      sentAt: new Date(),
    },
  });

  await prisma.conversation.update({
    where: { id: conv.id },
    data: { lastMessageAt: created.createdAt },
  });

  // Broadcast (mesmos events do Baileys)
  const links = await prisma.userWhatsAppConnection.findMany({
    where: { connectionId: conv.connection.id },
    select: { userId: true },
  });
  for (const l of links) {
    emitToUser(l.userId, 'message:new', {
      conversationId: conv.id,
      messageId: created.id,
      contactId: conv.contact.id,
      fromMe: true,
    });
  }
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN', active: true },
    select: { id: true },
  });
  for (const a of admins) {
    emitToUser(a.id, 'message:new', {
      conversationId: conv.id,
      messageId: created.id,
      contactId: conv.contact.id,
      fromMe: true,
    });
  }

  eventBus.publish({
    type: 'message.sent',
    entityId: conv.id,
    actorId: 'system',
    data: {
      messageId: created.id,
      conversationId: conv.id,
      contactId: conv.contact.id,
      content: p.content ?? '',
      type: p.type,
      fromMe: true,
    },
  });

  return created;
}

// Loader compartilhado pelos handlers — carrega tudo que precisamos
export async function loadConvForSend(conversationId: string): Promise<Conv | null> {
  return prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true,
      contactId: true,
      connectionId: true,
      whatsappJid: true,
      windowExpiresAt: true,
      contact: { select: { id: true, phone: true } },
      connection: {
        select: { id: true, type: true, accessToken: true, phoneNumberId: true },
      },
    },
  }) as Promise<Conv | null>;
}
