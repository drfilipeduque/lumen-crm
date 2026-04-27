// Wrapper REST da Graph API (WhatsApp Cloud API).
// Toda chamada espera o accessToken já decriptado em memória — quem chama
// é responsável por carregar do banco e descriptografar.

import { env } from '../../../env.js';

const GRAPH = `https://graph.facebook.com/${env.META_GRAPH_VERSION}`;

export class MetaApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(code: string, message: string, status = 502, details?: unknown) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

type Json = Record<string, unknown>;

async function request<T = Json>(
  method: 'GET' | 'POST' | 'DELETE',
  url: string,
  token: string,
  body?: Json,
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  if (!res.ok) {
    const err = (parsed as { error?: { message?: string; code?: number; type?: string } })?.error;
    throw new MetaApiError(
      err?.type ?? `META_${res.status}`,
      err?.message ?? `Meta API ${res.status}`,
      res.status >= 500 ? 502 : res.status,
      parsed,
    );
  }
  return parsed as T;
}

// =====================================================================
// PHONE NUMBER
// =====================================================================

export type MetaPhoneNumber = {
  id: string;
  display_phone_number: string;
  verified_name?: string;
  quality_rating?: string;
  messaging_limit_tier?: string;
  code_verification_status?: string;
  platform_type?: string;
};

export async function getPhoneNumber(phoneNumberId: string, token: string): Promise<MetaPhoneNumber> {
  const fields = [
    'id',
    'display_phone_number',
    'verified_name',
    'quality_rating',
    'messaging_limit_tier',
    'code_verification_status',
    'platform_type',
  ].join(',');
  return request<MetaPhoneNumber>('GET', `${GRAPH}/${phoneNumberId}?fields=${fields}`, token);
}

// =====================================================================
// WEBHOOK SUBSCRIPTION
// =====================================================================

export async function subscribeApp(wabaId: string, token: string): Promise<void> {
  // Inscreve o app nos eventos da WABA. A URL/verify token são configurados
  // no painel do app Meta — esta chamada apenas habilita a inscrição.
  await request<Json>('POST', `${GRAPH}/${wabaId}/subscribed_apps`, token);
}

// =====================================================================
// SEND MESSAGES
// =====================================================================

type SendResult = { messages?: { id: string }[]; messaging_product?: string };

function endpointSend(phoneNumberId: string) {
  return `${GRAPH}/${phoneNumberId}/messages`;
}

export async function sendText(
  phoneNumberId: string,
  token: string,
  to: string,
  body: string,
): Promise<string> {
  const r = await request<SendResult>('POST', endpointSend(phoneNumberId), token, {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body, preview_url: true },
  });
  return r.messages?.[0]?.id ?? '';
}

export type MetaMediaPayload = {
  type: 'IMAGE' | 'AUDIO' | 'VIDEO' | 'DOCUMENT';
  url: string; // URL pública (será baixada pela Meta)
  caption?: string;
  filename?: string;
};

export async function sendMedia(
  phoneNumberId: string,
  token: string,
  to: string,
  media: MetaMediaPayload,
): Promise<string> {
  const key = media.type.toLowerCase();
  const mediaBody: Json = { link: media.url };
  if ((media.type === 'IMAGE' || media.type === 'VIDEO') && media.caption) {
    mediaBody.caption = media.caption;
  }
  if (media.type === 'DOCUMENT') {
    if (media.filename) mediaBody.filename = media.filename;
    if (media.caption) mediaBody.caption = media.caption;
  }
  const r = await request<SendResult>('POST', endpointSend(phoneNumberId), token, {
    messaging_product: 'whatsapp',
    to,
    type: key,
    [key]: mediaBody,
  });
  return r.messages?.[0]?.id ?? '';
}

export type TemplateSendInput = {
  name: string;
  language: string;
  components?: unknown[]; // já formatado pra Meta
};

export async function sendTemplate(
  phoneNumberId: string,
  token: string,
  to: string,
  template: TemplateSendInput,
): Promise<string> {
  const r = await request<SendResult>('POST', endpointSend(phoneNumberId), token, {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: template.name,
      language: { code: template.language },
      components: template.components ?? [],
    },
  });
  return r.messages?.[0]?.id ?? '';
}

export async function markRead(
  phoneNumberId: string,
  token: string,
  externalMessageId: string,
): Promise<void> {
  await request<Json>('POST', endpointSend(phoneNumberId), token, {
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: externalMessageId,
  });
}

// =====================================================================
// MEDIA DOWNLOAD (pra mensagens recebidas)
// =====================================================================

export type MetaMediaInfo = { url: string; mime_type: string; file_size?: number };

export async function getMediaInfo(mediaId: string, token: string): Promise<MetaMediaInfo> {
  return request<MetaMediaInfo>('GET', `${GRAPH}/${mediaId}`, token);
}

export async function downloadMedia(mediaUrl: string, token: string): Promise<Buffer> {
  const res = await fetch(mediaUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    throw new MetaApiError('MEDIA_DOWNLOAD_FAILED', `Falha ao baixar mídia (${res.status})`, 502);
  }
  return Buffer.from(await res.arrayBuffer());
}

// =====================================================================
// TEMPLATES
// =====================================================================

export type MetaTemplateComponent = {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
  format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  text?: string;
  example?: { header_text?: string[]; body_text?: string[][]; header_handle?: string[] };
  buttons?: Array<{
    type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';
    text: string;
    url?: string;
    phone_number?: string;
  }>;
};

export type MetaTemplate = {
  id: string;
  name: string;
  status: 'APPROVED' | 'PENDING' | 'REJECTED' | 'IN_APPEAL' | 'PAUSED' | 'DISABLED';
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  language: string;
  components: MetaTemplateComponent[];
};

export async function listTemplates(wabaId: string, token: string): Promise<MetaTemplate[]> {
  const fields = 'id,name,status,category,language,components';
  type Resp = { data: MetaTemplate[]; paging?: { next?: string } };
  let url: string | undefined = `${GRAPH}/${wabaId}/message_templates?fields=${fields}&limit=200`;
  const out: MetaTemplate[] = [];
  while (url) {
    const r = await request<Resp>('GET', url, token);
    out.push(...(r.data ?? []));
    url = r.paging?.next;
  }
  return out;
}

export type CreateTemplateInput = {
  name: string;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  language: string;
  components: MetaTemplateComponent[];
};

export async function createTemplate(
  wabaId: string,
  token: string,
  input: CreateTemplateInput,
): Promise<{ id: string; status: string; category: string }> {
  return request('POST', `${GRAPH}/${wabaId}/message_templates`, token, input as unknown as Json);
}

export async function deleteTemplate(
  wabaId: string,
  token: string,
  name: string,
): Promise<void> {
  await request('DELETE', `${GRAPH}/${wabaId}/message_templates?name=${encodeURIComponent(name)}`, token);
}
