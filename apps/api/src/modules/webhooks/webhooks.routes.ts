// Rotas /webhooks (admin) e o receiver /webhooks/inbound/:uniqueUrl (público).
//
// O receiver é registrado SEM hook de auth — a autenticação é feita por
// token em header (X-Auth-Token) dentro do handler.

import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { authenticate, requireAnyRole } from '../auth/auth.middleware.js';
import {
  WebhookError,
  createWebhook,
  deleteWebhook,
  getWebhook,
  listWebhooks,
  rotateAuthToken,
  toggleWebhook,
  updateWebhook,
  type InboundActionType,
  type OutboundEvent,
  type WebhookCreateInput,
} from './webhooks.service.js';
import { processInbound, ReceiverError } from './webhooks.receiver.js';
import { testWebhookDispatch } from './webhooks.dispatcher.js';
import {
  createWebhookSchema,
  idParamSchema,
  listWebhooksQuerySchema,
  testWebhookSchema,
  uniqueUrlParamSchema,
  updateWebhookSchema,
} from './webhooks.schemas.js';

function send(reply: FastifyReply, e: unknown) {
  if (e instanceof WebhookError || e instanceof ReceiverError) {
    return reply.code(e.status).send({ error: e.code, message: e.message });
  }
  throw e;
}

// Painel admin
export const webhooksRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', authenticate);

  app.get('/', async (req, reply) => {
    const q = listWebhooksQuerySchema.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'VALIDATION', issues: q.error.flatten() });
    return reply.send(await listWebhooks({ type: q.data.type }));
  });

  app.get('/:id', async (req, reply) => {
    const p = idParamSchema.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    try {
      return reply.send(await getWebhook(p.data.id));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.post('/', { preHandler: requireAnyRole(['ADMIN']) }, async (req, reply) => {
    const body = createWebhookSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'VALIDATION', issues: body.error.flatten() });
    try {
      const created = await createWebhook(body.data as unknown as WebhookCreateInput);
      return reply.code(201).send(created);
    } catch (e) {
      return send(reply, e);
    }
  });

  app.put('/:id', { preHandler: requireAnyRole(['ADMIN']) }, async (req, reply) => {
    const p = idParamSchema.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    const body = updateWebhookSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'VALIDATION', issues: body.error.flatten() });
    try {
      return reply.send(
        await updateWebhook(p.data.id, {
          ...body.data,
          events: body.data.events as OutboundEvent[] | undefined,
          actionType: body.data.actionType as InboundActionType | undefined,
        }),
      );
    } catch (e) {
      return send(reply, e);
    }
  });

  app.put('/:id/toggle', { preHandler: requireAnyRole(['ADMIN']) }, async (req, reply) => {
    const p = idParamSchema.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    try {
      return reply.send(await toggleWebhook(p.data.id));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.delete('/:id', { preHandler: requireAnyRole(['ADMIN']) }, async (req, reply) => {
    const p = idParamSchema.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    try {
      return reply.send(await deleteWebhook(p.data.id));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.put('/:id/rotate-token', { preHandler: requireAnyRole(['ADMIN']) }, async (req, reply) => {
    const p = idParamSchema.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    try {
      const r = await rotateAuthToken(p.data.id);
      return reply.send(r);
    } catch (e) {
      return send(reply, e);
    }
  });

  app.post('/:id/test', { preHandler: requireAnyRole(['ADMIN']) }, async (req, reply) => {
    const p = idParamSchema.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    const body = testWebhookSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: 'VALIDATION', issues: body.error.flatten() });
    try {
      const r = await testWebhookDispatch(p.data.id, body.data.eventPayload as Record<string, unknown> | undefined, app.log);
      return reply.send(r);
    } catch (e) {
      return send(reply, e);
    }
  });
};

// Receiver público — sem auth global.
export const webhooksInboundRoutes: FastifyPluginAsync = async (app) => {
  app.post('/:uniqueUrl', async (req, reply) => {
    const p = uniqueUrlParamSchema.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    const token = (req.headers['x-auth-token'] as string | undefined)?.trim();
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      const r = await processInbound(p.data.uniqueUrl, token, body);
      return reply.send(r);
    } catch (e) {
      return send(reply, e);
    }
  });
};
