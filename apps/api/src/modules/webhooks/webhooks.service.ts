// Service de Webhooks (OUTBOUND e INBOUND).
//
// OUTBOUND: o CRM dispara HTTP requests pra URLs externas quando eventos
// configurados acontecem. Configura: url, method, headers, events[],
// payloadTemplate (renderizado com vars do contexto).
//
// INBOUND: clientes externos disparam ações no CRM via POST. Cada webhook tem
// uniqueUrl + authToken únicos, gerados pelo sistema. Ações suportadas:
// create_opportunity, create_contact, trigger_automation, add_tag, add_note.

import { randomBytes } from 'node:crypto';
import { prisma, Prisma } from '../../lib/prisma.js';

export class WebhookError extends Error {
  status: number;
  code: string;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

// Eventos válidos pra OUTBOUND. Coincide com os AutomationEventType do bus
// + alguns sintéticos (cadence.completed, automation.executed) que serão
// publicados pelo respectivo módulo no futuro.
export const VALID_OUTBOUND_EVENTS = [
  'opportunity.created',
  'opportunity.updated',
  'opportunity.stage_changed',
  'opportunity.won',
  'opportunity.lost',
  'opportunity.tag_added',
  'opportunity.tag_removed',
  'opportunity.owner_changed',
  'opportunity.field_updated',
  'opportunity.priority_changed',
  'opportunity.value_changed',
  'opportunity.deleted',
  'contact.created',
  'contact.updated',
  'message.received',
  'message.sent',
  'reminder.created',
  'reminder.completed',
  'automation.executed',
  'cadence.completed',
] as const;

export type OutboundEvent = (typeof VALID_OUTBOUND_EVENTS)[number];

export const VALID_INBOUND_ACTIONS = [
  'create_opportunity',
  'create_contact',
  'trigger_automation',
  'add_tag',
  'add_note',
] as const;

export type InboundActionType = (typeof VALID_INBOUND_ACTIONS)[number];

// =============================================================================
// HELPERS
// =============================================================================

function genUniqueUrl(): string {
  // 24 chars hex (96 bits) — suficiente pra evitar colisão sem ficar feio na URL.
  return randomBytes(12).toString('hex');
}

function genAuthToken(): string {
  // 32 chars hex (128 bits).
  return randomBytes(16).toString('hex');
}

// View pública: oculta authToken (mostra só prefixo).
function safeView<T extends { type: string; authToken?: string | null }>(
  row: T,
): T & { authTokenMask?: string | null } {
  if (row.type !== 'INBOUND') return row;
  const t = row.authToken ?? '';
  return {
    ...row,
    authTokenMask: t ? `${t.slice(0, 4)}…${t.slice(-4)}` : null,
    authToken: undefined as unknown as string,
  };
}

// =============================================================================
// CRUD
// =============================================================================

export async function listWebhooks(filters: { type?: 'OUTBOUND' | 'INBOUND' } = {}) {
  const where: Prisma.WebhookWhereInput = {};
  if (filters.type) where.type = filters.type;
  const rows = await prisma.webhook.findMany({ where, orderBy: { createdAt: 'desc' } });
  return rows.map(safeView);
}

export async function getWebhook(id: string) {
  const w = await prisma.webhook.findUnique({ where: { id } });
  if (!w) throw new WebhookError('NOT_FOUND', 'Webhook não encontrado', 404);
  return safeView(w);
}

// Internal — devolve o webhook com authToken decifrado pra uso no receiver.
export async function getWebhookRaw(id: string) {
  return prisma.webhook.findUnique({ where: { id } });
}

export type OutboundCreateInput = {
  type: 'OUTBOUND';
  name: string;
  url: string;
  method?: string;
  headers?: Record<string, string>;
  events: OutboundEvent[];
  payloadTemplate?: unknown;
  active?: boolean;
};

export type InboundCreateInput = {
  type: 'INBOUND';
  name: string;
  actionType: InboundActionType;
  actionConfig?: Record<string, unknown>;
  active?: boolean;
};

export type WebhookCreateInput = OutboundCreateInput | InboundCreateInput;

export async function createWebhook(input: WebhookCreateInput) {
  if (input.type === 'OUTBOUND') {
    const w = await prisma.webhook.create({
      data: {
        type: 'OUTBOUND',
        name: input.name,
        active: input.active ?? true,
        url: input.url,
        method: input.method ?? 'POST',
        headers: (input.headers ?? {}) as Prisma.InputJsonValue,
        events: input.events,
        payloadTemplate: (input.payloadTemplate ?? null) as Prisma.InputJsonValue,
      },
    });
    return { ...safeView(w), _authTokenOnce: undefined as string | undefined };
  }
  // INBOUND — retorna authToken UMA VEZ pra ser exibido na UI.
  const tokenPlain = genAuthToken();
  const w = await prisma.webhook.create({
    data: {
      type: 'INBOUND',
      name: input.name,
      active: input.active ?? true,
      actionType: input.actionType,
      actionConfig: (input.actionConfig ?? {}) as Prisma.InputJsonValue,
      uniqueUrl: genUniqueUrl(),
      authToken: tokenPlain,
      events: [],
    },
  });
  return { ...safeView(w), _authTokenOnce: tokenPlain };
}

export type WebhookUpdateInput = Partial<{
  name: string;
  active: boolean;
  url: string;
  method: string;
  headers: Record<string, string>;
  events: OutboundEvent[];
  payloadTemplate: unknown;
  actionType: InboundActionType;
  actionConfig: Record<string, unknown>;
}>;

export async function updateWebhook(id: string, input: WebhookUpdateInput) {
  const w = await prisma.webhook.findUnique({ where: { id } });
  if (!w) throw new WebhookError('NOT_FOUND', 'Webhook não encontrado', 404);

  const data: Prisma.WebhookUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.active !== undefined) data.active = input.active;
  if (w.type === 'OUTBOUND') {
    if (input.url !== undefined) data.url = input.url;
    if (input.method !== undefined) data.method = input.method;
    if (input.headers !== undefined) data.headers = input.headers as Prisma.InputJsonValue;
    if (input.events !== undefined) data.events = input.events;
    if (input.payloadTemplate !== undefined) data.payloadTemplate = input.payloadTemplate as Prisma.InputJsonValue;
  } else {
    if (input.actionType !== undefined) data.actionType = input.actionType;
    if (input.actionConfig !== undefined) data.actionConfig = input.actionConfig as Prisma.InputJsonValue;
  }

  return prisma.webhook.update({ where: { id }, data }).then(safeView);
}

export async function toggleWebhook(id: string) {
  const w = await prisma.webhook.findUnique({ where: { id } });
  if (!w) throw new WebhookError('NOT_FOUND', 'Webhook não encontrado', 404);
  return prisma.webhook.update({ where: { id }, data: { active: !w.active } }).then(safeView);
}

export async function deleteWebhook(id: string) {
  const w = await prisma.webhook.findUnique({ where: { id } });
  if (!w) throw new WebhookError('NOT_FOUND', 'Webhook não encontrado', 404);
  await prisma.webhook.delete({ where: { id } });
  return { ok: true as const };
}

// Rotaciona token (somente INBOUND). Retorna o token NOVO em texto plano —
// é a única vez que o cliente vai vê-lo.
export async function rotateAuthToken(id: string): Promise<{ id: string; authToken: string }> {
  const w = await prisma.webhook.findUnique({ where: { id } });
  if (!w) throw new WebhookError('NOT_FOUND', 'Webhook não encontrado', 404);
  if (w.type !== 'INBOUND') throw new WebhookError('NOT_INBOUND', 'Apenas webhooks de entrada têm token');
  const fresh = genAuthToken();
  await prisma.webhook.update({ where: { id }, data: { authToken: fresh } });
  return { id, authToken: fresh };
}
