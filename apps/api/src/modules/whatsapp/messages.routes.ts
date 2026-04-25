import { z } from 'zod';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { authenticate } from '../auth/auth.middleware.js';
import { WAMessageError, sendMessageToConversation } from './baileys/message.service.js';

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

function send(reply: FastifyReply, e: unknown) {
  if (e instanceof WAMessageError) return reply.code(e.status).send({ error: e.code, message: e.message });
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
};
