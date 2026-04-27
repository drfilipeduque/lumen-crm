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
import { prisma } from '../../lib/prisma.js';
import { getWindowStatus } from './meta/window.service.js';
import {
  MAX_MESSAGE_FILE_BYTES,
  inferMessageTypeFromMime,
  isAllowedMessageMime,
  saveMessageMedia,
} from './baileys/media.js';

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

  app.post('/:id/upload', async (req, reply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });

    if (!req.isMultipart()) {
      return reply.code(400).send({ error: 'INVALID_REQUEST', message: 'Esperado multipart/form-data' });
    }

    // Visibilidade: reusa a mesma checagem do GET /:id (basta tentar ler)
    const conv = await prisma.conversation.findUnique({
      where: { id: p.data.id },
      select: { id: true, connectionId: true, assigneeId: true },
    });
    if (!conv) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Conversa não encontrada' });
    if (req.user!.role !== 'ADMIN') {
      const link = await prisma.userWhatsAppConnection.findUnique({
        where: { userId_connectionId: { userId: req.user!.id, connectionId: conv.connectionId } },
        select: { userId: true },
      });
      if (!link) return reply.code(403).send({ error: 'FORBIDDEN', message: 'Sem acesso à conexão' });
      if (conv.assigneeId && conv.assigneeId !== req.user!.id) {
        return reply.code(403).send({ error: 'FORBIDDEN', message: 'Conversa de outro usuário' });
      }
    }

    let file;
    try {
      file = await req.file({ limits: { fileSize: MAX_MESSAGE_FILE_BYTES, files: 1 } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.toLowerCase().includes('too large')) {
        return reply.code(413).send({ error: 'FILE_TOO_LARGE', message: 'Arquivo excede 20MB' });
      }
      throw e;
    }
    if (!file) return reply.code(400).send({ error: 'NO_FILE', message: 'Nenhum arquivo recebido' });
    if (!isAllowedMessageMime(file.mimetype)) {
      return reply.code(415).send({ error: 'UNSUPPORTED_MEDIA', message: 'Tipo não suportado' });
    }

    let buffer: Buffer;
    try {
      buffer = await file.toBuffer();
    } catch (e) {
      const err = e as { code?: string; message?: string };
      const tooLarge =
        err.code === 'FST_REQ_FILE_TOO_LARGE' ||
        (err.message ?? '').toLowerCase().includes('too large');
      if (tooLarge) return reply.code(413).send({ error: 'FILE_TOO_LARGE', message: 'Arquivo excede 20MB' });
      return reply.code(400).send({ error: 'INVALID_FILE', message: 'Falha ao ler arquivo' });
    }

    const saved = await saveMessageMedia(conv.connectionId, {
      buffer,
      mimeType: file.mimetype,
      originalName: file.filename,
    });
    return reply.code(201).send({
      url: saved.url,
      name: saved.name,
      mimeType: file.mimetype,
      size: saved.size,
      type: inferMessageTypeFromMime(file.mimetype),
    });
  });

  // Status da janela de 24h (apenas conexões OFFICIAL têm janela real;
  // UNOFFICIAL retorna sempre open: true).
  app.get('/:id/window-status', async (req, reply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    const conv = await prisma.conversation.findUnique({
      where: { id: p.data.id },
      select: { windowExpiresAt: true, connection: { select: { type: true } } },
    });
    if (!conv) return reply.code(404).send({ error: 'NOT_FOUND' });
    if (conv.connection.type === 'UNOFFICIAL') {
      return reply.send({ open: true, expiresAt: null, hoursRemaining: null, applicable: false });
    }
    const status = await getWindowStatus(p.data.id);
    return reply.send({ ...status, applicable: true });
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
