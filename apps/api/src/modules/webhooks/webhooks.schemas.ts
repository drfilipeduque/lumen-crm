import { z } from 'zod';
import { VALID_INBOUND_ACTIONS, VALID_OUTBOUND_EVENTS } from './webhooks.service.js';

const outboundEventEnum = z.enum(VALID_OUTBOUND_EVENTS as readonly [string, ...string[]]);
const inboundActionEnum = z.enum(VALID_INBOUND_ACTIONS as readonly [string, ...string[]]);

export const createOutboundSchema = z.object({
  type: z.literal('OUTBOUND'),
  name: z.string().min(1, { message: 'nome obrigatório' }).max(120),
  url: z.string().url({ message: 'URL inválida' }),
  method: z.enum(['POST', 'PUT', 'PATCH', 'GET', 'DELETE']).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  events: z.array(outboundEventEnum).min(1, { message: 'pelo menos 1 evento' }),
  payloadTemplate: z.unknown().optional(),
  active: z.boolean().optional(),
});

export const createInboundSchema = z.object({
  type: z.literal('INBOUND'),
  name: z.string().min(1).max(120),
  actionType: inboundActionEnum,
  actionConfig: z.record(z.string(), z.unknown()).optional(),
  active: z.boolean().optional(),
});

export const createWebhookSchema = z.discriminatedUnion('type', [createOutboundSchema, createInboundSchema]);

export const updateWebhookSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  active: z.boolean().optional(),
  url: z.string().url().optional(),
  method: z.enum(['POST', 'PUT', 'PATCH', 'GET', 'DELETE']).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  events: z.array(outboundEventEnum).optional(),
  payloadTemplate: z.unknown().optional(),
  actionType: inboundActionEnum.optional(),
  actionConfig: z.record(z.string(), z.unknown()).optional(),
});

export const idParamSchema = z.object({ id: z.string().min(1) });
export const uniqueUrlParamSchema = z.object({ uniqueUrl: z.string().min(1) });

export const listWebhooksQuerySchema = z.object({
  type: z.enum(['OUTBOUND', 'INBOUND']).optional(),
});

export const testWebhookSchema = z.object({
  eventPayload: z
    .object({
      type: z.string().optional(),
      entityId: z.string().optional(),
      data: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
});
