import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { authenticate } from '../auth/auth.middleware.js';
import {
  ScheduledMessageError,
  cancelScheduledMessage,
  countScheduledForContact,
  countScheduledForOpportunity,
  createScheduledMessage,
  getScheduledMessage,
  listScheduledMessages,
  updateScheduledMessage,
} from './scheduled-messages.service.js';
import {
  createScheduledMessageSchema,
  listScheduledMessagesSchema,
  updateScheduledMessageSchema,
} from './scheduled-messages.schemas.js';
import { z } from 'zod';

function send(reply: FastifyReply, e: unknown) {
  if (e instanceof ScheduledMessageError) {
    return reply.code(e.status).send({ error: e.code, message: e.message });
  }
  throw e;
}

// Junta os erros do Zod numa mensagem legível pra surfacear no frontend.
function zodMessage(err: z.ZodError): string {
  const flat = err.flatten();
  const fields = Object.entries(flat.fieldErrors)
    .flatMap(([k, msgs]) => (msgs ?? []).map((m) => `${k}: ${m}`));
  const all = [...flat.formErrors, ...fields];
  return all.join(' · ') || 'Dados inválidos';
}

const idParam = z.object({ id: z.string().min(1) });

export const scheduledMessagesRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', authenticate);

  app.post('/', async (req, reply) => {
    const body = createScheduledMessageSchema.safeParse(req.body);
    if (!body.success)
      return reply.code(400).send({ error: 'VALIDATION', message: zodMessage(body.error), issues: body.error.flatten() });
    try {
      return reply.code(201).send(await createScheduledMessage(req.user!, body.data));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.get('/', async (req, reply) => {
    const q = listScheduledMessagesSchema.safeParse(req.query);
    if (!q.success)
      return reply.code(400).send({ error: 'VALIDATION', message: zodMessage(q.error), issues: q.error.flatten() });
    return reply.send(await listScheduledMessages(q.data));
  });

  app.get('/:id', async (req, reply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success)
      return reply.code(400).send({ error: 'VALIDATION', message: zodMessage(p.error), issues: p.error.flatten() });
    try {
      return reply.send(await getScheduledMessage(p.data.id));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.put('/:id', async (req, reply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success)
      return reply.code(400).send({ error: 'VALIDATION', message: zodMessage(p.error), issues: p.error.flatten() });
    const body = updateScheduledMessageSchema.safeParse(req.body);
    if (!body.success)
      return reply.code(400).send({ error: 'VALIDATION', message: zodMessage(body.error), issues: body.error.flatten() });
    try {
      return reply.send(await updateScheduledMessage(req.user!, p.data.id, body.data));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.delete('/:id', async (req, reply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success)
      return reply.code(400).send({ error: 'VALIDATION', message: zodMessage(p.error), issues: p.error.flatten() });
    try {
      return reply.send(await cancelScheduledMessage(req.user!, p.data.id));
    } catch (e) {
      return send(reply, e);
    }
  });
};

// Endpoints auxiliares pra exibir contadores na UI.
// Plugados em /contacts/:id/scheduled-messages-count e
// /opportunities/:id/scheduled-messages-count.
export const contactScheduledCountRoute: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', authenticate);
  app.get('/:id/scheduled-messages-count', async (req, reply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    return reply.send({ count: await countScheduledForContact(p.data.id) });
  });
};

export const opportunityScheduledCountRoute: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', authenticate);
  app.get('/:id/scheduled-messages-count', async (req, reply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    return reply.send({ count: await countScheduledForOpportunity(p.data.id) });
  });
};
