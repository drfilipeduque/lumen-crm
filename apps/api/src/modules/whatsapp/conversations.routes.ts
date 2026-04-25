import { z } from 'zod';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { authenticate } from '../auth/auth.middleware.js';
import {
  ConvError,
  assignConversation,
  createOpportunityFromConversation,
  getConversation,
  listConversations,
  listMessages,
  markAsRead,
  resolveConversation,
  totalUnread,
} from './conversations.service.js';

const idParam = z.object({ id: z.string().min(1) });

const listQuery = z.object({
  assigneeId: z.string().optional(),
  unassigned: z
    .union([z.boolean(), z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) => v === true || v === 'true'),
  tagId: z.string().optional(),
  search: z.string().optional(),
  status: z.enum(['OPEN', 'RESOLVED']).optional(),
  connectionId: z.string().optional(),
  unreadOnly: z
    .union([z.boolean(), z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) => v === true || v === 'true'),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const messagesQuery = z.object({
  before: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const assignBody = z.object({
  userId: z.string().nullable(),
});

const resolveBody = z.object({
  status: z.enum(['OPEN', 'RESOLVED']),
});

const createOppBody = z.object({
  title: z.string().min(1, 'Título obrigatório').max(160),
  pipelineId: z.string().min(1),
  stageId: z.string().min(1),
  value: z.number().nonnegative().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
});

function send(reply: FastifyReply, e: unknown) {
  if (e instanceof ConvError) return reply.code(e.status).send({ error: e.code, message: e.message });
  throw e;
}

export const conversationsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', authenticate);

  app.get('/', async (req, reply) => {
    const q = listQuery.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'VALIDATION', issues: q.error.flatten() });
    try {
      return reply.send(await listConversations(req.user!, q.data));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.get('/unread-count', async (req, reply) => {
    return reply.send({ total: await totalUnread(req.user!) });
  });

  app.get('/:id', async (req, reply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    try {
      return reply.send(await getConversation(req.user!, p.data.id));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.get('/:id/messages', async (req, reply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    const q = messagesQuery.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'VALIDATION', issues: q.error.flatten() });
    try {
      return reply.send(await listMessages(req.user!, p.data.id, q.data));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.put('/:id/read', async (req, reply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    try {
      return reply.send(await markAsRead(req.user!, p.data.id));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.put('/:id/assign', async (req, reply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    const body = assignBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'VALIDATION', issues: body.error.flatten() });
    try {
      return reply.send(await assignConversation(req.user!, p.data.id, body.data.userId));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.put('/:id/resolve', async (req, reply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    const body = resolveBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'VALIDATION', issues: body.error.flatten() });
    try {
      return reply.send(await resolveConversation(req.user!, p.data.id, body.data.status));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.post('/:id/create-opportunity', async (req, reply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    const body = createOppBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'VALIDATION', issues: body.error.flatten() });
    try {
      return reply.code(201).send(await createOpportunityFromConversation(req.user!, p.data.id, body.data));
    } catch (e) {
      return send(reply, e);
    }
  });
};
