import { z } from 'zod';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { authenticate } from '../auth/auth.middleware.js';
import { prisma } from '../../lib/prisma.js';
import { WAMessageError, sendMessageToConversation } from './baileys/message.service.js';
import { loadConvForSend, MetaSendError, sendTemplateViaMeta } from './meta/send.service.js';

const idParam = z.object({ id: z.string().min(1) });

const sendBody = z.object({
  type: z.enum(['TEXT', 'IMAGE', 'AUDIO', 'DOCUMENT', 'VIDEO']),
  content: z.string().nullable().optional(),
  mediaUrl: z
    .string()
    .nullable()
    .optional()
    .refine((v) => !v || v.startsWith('/uploads/') || /^https?:\/\//.test(v), {
      message: 'mediaUrl deve ser /uploads/... ou http(s)://...',
    }),
  mediaName: z.string().nullable().optional(),
  mediaMimeType: z.string().nullable().optional(),
});

const templateBody = z.object({
  templateId: z.string().min(1, 'templateId obrigatório'),
  variables: z.record(z.string()).optional().default({}),
});

function send(reply: FastifyReply, e: unknown) {
  if (e instanceof WAMessageError) return reply.code(e.status).send({ error: e.code, message: e.message });
  if (e instanceof MetaSendError) return reply.code(e.status).send({ error: e.code, message: e.message });
  throw e;
}

// /conversations/:id/messages
export const conversationMessagesRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', authenticate);

  app.post('/:id/messages', async (req, reply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    const body = sendBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'VALIDATION', issues: body.error.flatten() });
    try {
      const msg = await sendMessageToConversation(req.user!, p.data.id, body.data);
      return reply.code(201).send(msg);
    } catch (e) {
      return send(reply, e);
    }
  });

  // Envio de template (apenas conexões OFFICIAL).
  // Funciona mesmo com janela fechada (não chama window check).
  app.post('/:id/messages/template', async (req, reply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    const body = templateBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'VALIDATION', issues: body.error.flatten() });

    // Permissão (mesma do envio normal)
    const conv = await prisma.conversation.findUnique({
      where: { id: p.data.id },
      select: { connectionId: true },
    });
    if (!conv) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Conversa não encontrada' });
    if (req.user!.role !== 'ADMIN') {
      const link = await prisma.userWhatsAppConnection.findUnique({
        where: { userId_connectionId: { userId: req.user!.id, connectionId: conv.connectionId } },
        select: { userId: true },
      });
      if (!link) return reply.code(403).send({ error: 'FORBIDDEN', message: 'Sem acesso à conexão' });
    }

    try {
      const metaConv = await loadConvForSend(p.data.id);
      if (!metaConv) return reply.code(404).send({ error: 'NOT_FOUND' });
      if (metaConv.connection.type !== 'OFFICIAL') {
        return reply.code(400).send({ error: 'NOT_OFFICIAL', message: 'Templates exigem conexão Meta Cloud API' });
      }
      const msg = await sendTemplateViaMeta(metaConv, body.data.templateId, body.data.variables);
      return reply.code(201).send(msg);
    } catch (e) {
      return send(reply, e);
    }
  });
};
