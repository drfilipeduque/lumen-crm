// Rotas /cadences e /cadence-executions.
// Mutações: ADMIN. Leitura/start manual: qualquer autenticado.

import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticate, requireAnyRole } from '../auth/auth.middleware.js';
import {
  CadenceError,
  cancelExecution,
  createCadence,
  deleteCadence,
  duplicateCadence,
  getCadence,
  getStats,
  listCadences,
  listExecutions,
  pauseExecution,
  resumeExecution,
  startBatch,
  startForContact,
  startForOpportunity,
  toggleCadence,
  updateCadence,
  type CadenceMessage,
  type CadenceScopeConfig,
} from './cadences.service.js';
import {
  createCadenceSchema,
  idParamSchema,
  listCadencesQuerySchema,
  listExecutionsQuerySchema,
  startCadenceSchema,
  updateCadenceSchema,
} from './cadences.schemas.js';
import { prisma } from '../../lib/prisma.js';

function send(reply: FastifyReply, e: unknown) {
  if (e instanceof CadenceError) return reply.code(e.status).send({ error: e.code, message: e.message });
  throw e;
}

// Cadences (montadas em /cadences pelo server.ts)
export const cadencesRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', authenticate);

  app.get('/', async (req, reply) => {
    const q = listCadencesQuerySchema.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'VALIDATION', issues: q.error.flatten() });
    const filters: { active?: boolean; scope?: string } = {};
    if (q.data.active) filters.active = q.data.active === 'true';
    if (q.data.scope) filters.scope = q.data.scope;
    return reply.send(await listCadences(filters));
  });

  // Cadências disponíveis pra start manual (escopo OPPORTUNITY/CONTACT, ativas).
  // Útil pro menu 3-pontinhos do Pipeline/Leads.
  app.get('/manual', async (_req, reply) => {
    const list = await prisma.cadence.findMany({
      where: { active: true, scope: { in: ['OPPORTUNITY', 'CONTACT', 'GROUP'] } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, scope: true, description: true },
    });
    return reply.send(list);
  });

  app.get('/:id', async (req, reply) => {
    const p = idParamSchema.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    try {
      return reply.send(await getCadence(p.data.id));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.post('/', { preHandler: requireAnyRole(['ADMIN']) }, async (req, reply) => {
    const body = createCadenceSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'VALIDATION', issues: body.error.flatten() });
    try {
      const c = await createCadence({
        ...body.data,
        scopeConfig: body.data.scopeConfig as CadenceScopeConfig,
        messages: body.data.messages as unknown as CadenceMessage[],
      });
      return reply.code(201).send(c);
    } catch (e) {
      return send(reply, e);
    }
  });

  app.put('/:id', { preHandler: requireAnyRole(['ADMIN']) }, async (req, reply) => {
    const p = idParamSchema.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    const body = updateCadenceSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'VALIDATION', issues: body.error.flatten() });
    try {
      const c = await updateCadence(p.data.id, {
        ...body.data,
        scopeConfig: body.data.scopeConfig as CadenceScopeConfig | undefined,
        messages: body.data.messages as unknown as CadenceMessage[] | undefined,
      });
      return reply.send(c);
    } catch (e) {
      return send(reply, e);
    }
  });

  app.put('/:id/toggle', { preHandler: requireAnyRole(['ADMIN']) }, async (req, reply) => {
    const p = idParamSchema.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    try {
      return reply.send(await toggleCadence(p.data.id));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.delete('/:id', { preHandler: requireAnyRole(['ADMIN']) }, async (req, reply) => {
    const p = idParamSchema.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    try {
      return reply.send(await deleteCadence(p.data.id));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.post('/:id/duplicate', { preHandler: requireAnyRole(['ADMIN']) }, async (req, reply) => {
    const p = idParamSchema.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    try {
      return reply.code(201).send(await duplicateCadence(p.data.id));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.get('/:id/stats', async (req, reply) => {
    const p = idParamSchema.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    try {
      return reply.send(await getStats(p.data.id));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.get('/:id/executions', async (req, reply) => {
    const p = idParamSchema.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    const q = listExecutionsQuerySchema.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'VALIDATION', issues: q.error.flatten() });
    try {
      return reply.send(
        await listExecutions(p.data.id, {
          status: q.data.status,
          page: q.data.page,
          limit: q.data.limit,
        }),
      );
    } catch (e) {
      return send(reply, e);
    }
  });

  app.post('/:id/start', async (req, reply) => {
    const p = idParamSchema.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    const body = startCadenceSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'VALIDATION', issues: body.error.flatten() });
    try {
      // Caminho 1: alvos plurais (batch)
      if (body.data.opportunityIds || body.data.contactIds) {
        const r = await startBatch(p.data.id, {
          opportunityIds: body.data.opportunityIds,
          contactIds: body.data.contactIds,
        });
        return reply.send(r);
      }
      // Caminho 2: alvo único
      if (body.data.opportunityId) {
        return reply.send(await startForOpportunity(p.data.id, body.data.opportunityId));
      }
      if (body.data.contactId) {
        return reply.send(await startForContact(p.data.id, body.data.contactId));
      }
      return reply.code(400).send({ error: 'VALIDATION', message: 'alvo ausente' });
    } catch (e) {
      return send(reply, e);
    }
  });
};

// Executions (rota separada /cadence-executions/:id/...)
export const cadenceExecutionsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', authenticate);

  app.get('/:id', async (req, reply) => {
    const p = idParamSchema.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    const ex = await prisma.cadenceExecution.findUnique({
      where: { id: p.data.id },
      include: {
        cadence: { select: { id: true, name: true, messages: true, scope: true } },
        contact: { select: { id: true, name: true, phone: true, avatar: true } },
        opportunity: { select: { id: true, title: true } },
      },
    });
    if (!ex) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Execução não encontrada' });
    return reply.send(ex);
  });

  app.put('/:id/pause', async (req, reply) => {
    const p = idParamSchema.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    try {
      return reply.send(await pauseExecution(p.data.id));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.put('/:id/resume', async (req, reply) => {
    const p = idParamSchema.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    try {
      return reply.send(await resumeExecution(p.data.id));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.delete('/:id', async (req, reply) => {
    const p = idParamSchema.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    try {
      return reply.send(await cancelExecution(p.data.id));
    } catch (e) {
      return send(reply, e);
    }
  });

  // Executions ativas pra um contato (usado no painel de conversa).
  app.get('/by-contact/:contactId', async (req, reply) => {
    const p = z
      .object({ contactId: z.string().min(1) })
      .safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    const list = await prisma.cadenceExecution.findMany({
      where: { contactId: p.data.contactId, status: { in: ['ACTIVE', 'PAUSED'] } },
      include: { cadence: { select: { id: true, name: true, messages: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return reply.send(list);
  });
};
