import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { authenticate, requireRole } from '../auth/auth.middleware.js';
import {
  BroadcastError,
  cancelBroadcast,
  createBroadcast,
  deleteBroadcastDraft,
  getBroadcast,
  listBroadcasts,
  listRecipients,
  pauseBroadcast,
  previewAudience,
  resumeBroadcast,
  startBroadcast,
  updateBroadcast,
} from './broadcasts.service.js';
import {
  createBroadcastSchema,
  listBroadcastsSchema,
  listRecipientsSchema,
  previewAudienceSchema,
  updateBroadcastSchema,
} from './broadcasts.schemas.js';
import { z } from 'zod';

function send(reply: FastifyReply, e: unknown) {
  if (e instanceof BroadcastError) {
    return reply.code(e.status).send({ error: e.code, message: e.message });
  }
  throw e;
}

const idParam = z.object({ id: z.string().min(1) });

export const broadcastsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', authenticate);
  app.addHook('preHandler', requireRole('ADMIN'));

  app.get('/', async (req, reply) => {
    const q = listBroadcastsSchema.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'VALIDATION', issues: q.error.flatten() });
    return reply.send(await listBroadcasts(q.data));
  });

  app.post('/', async (req, reply) => {
    const body = createBroadcastSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'VALIDATION', issues: body.error.flatten() });
    try {
      return reply.code(201).send(await createBroadcast(req.user!, body.data));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.post('/preview-audience', async (req, reply) => {
    const body = previewAudienceSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'VALIDATION', issues: body.error.flatten() });
    return reply.send(await previewAudience(body.data));
  });

  app.get('/:id', async (req, reply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    try {
      return reply.send(await getBroadcast(p.data.id));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.put('/:id', async (req, reply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    const body = updateBroadcastSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'VALIDATION', issues: body.error.flatten() });
    try {
      return reply.send(await updateBroadcast(p.data.id, body.data));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.delete('/:id', async (req, reply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    try {
      return reply.send(await deleteBroadcastDraft(p.data.id));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.post('/:id/start', async (req, reply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    try {
      return reply.send(await startBroadcast(p.data.id));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.put('/:id/pause', async (req, reply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    try {
      return reply.send(await pauseBroadcast(p.data.id));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.put('/:id/resume', async (req, reply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    try {
      return reply.send(await resumeBroadcast(p.data.id));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.delete('/:id/cancel', async (req, reply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    try {
      return reply.send(await cancelBroadcast(p.data.id));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.get('/:id/recipients', async (req, reply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    const q = listRecipientsSchema.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'VALIDATION', issues: q.error.flatten() });
    return reply.send(await listRecipients(p.data.id, q.data));
  });
};
