// Rotas /api/automations.
// Todas exigem auth; mutações exigem ADMIN.

import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { authenticate, requireAnyRole } from '../auth/auth.middleware.js';
import {
  AutomationError,
  createAutomation,
  deleteAutomation,
  dryRunAutomation,
  getAutomation,
  listAutomations,
  toggleAutomation,
  updateAutomation,
} from './automation.service.js';
import {
  createAutomationSchema,
  idParamSchema,
  testAutomationSchema,
  updateAutomationSchema,
} from './automation.schemas.js';
import { allTriggerDefinitions } from './triggers/webhook-triggers.js';
import { allActionDefinitions } from './actions/ai-actions.js';
import type { Flow } from './engine/flow-runner.js';
import type { EventPayload } from './engine/event-bus.js';

function send(reply: FastifyReply, e: unknown) {
  if (e instanceof AutomationError) return reply.code(e.status).send({ error: e.code, message: e.message });
  throw e;
}

export const automationRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', authenticate);

  // Lista — qualquer usuário autenticado pode ver.
  app.get('/', async () => listAutomations());

  // Catálogo de triggers/actions (pra construtor visual da Parte 3).
  app.get('/catalog', async () => ({
    triggers: allTriggerDefinitions,
    actions: allActionDefinitions,
  }));

  app.get('/:id', async (req, reply) => {
    const params = idParamSchema.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: 'VALIDATION', issues: params.error.flatten() });
    try {
      return reply.send(await getAutomation(params.data.id));
    } catch (e) {
      return send(reply, e);
    }
  });

  // Mutações: ADMIN-only.
  app.post('/', { preHandler: requireAnyRole(['ADMIN']) }, async (req, reply) => {
    const body = createAutomationSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'VALIDATION', issues: body.error.flatten() });
    try {
      const a = await createAutomation({
        name: body.data.name,
        active: body.data.active,
        flow: body.data.flow as unknown as Flow,
      });
      return reply.code(201).send(a);
    } catch (e) {
      return send(reply, e);
    }
  });

  app.put('/:id', { preHandler: requireAnyRole(['ADMIN']) }, async (req, reply) => {
    const params = idParamSchema.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: 'VALIDATION', issues: params.error.flatten() });
    const body = updateAutomationSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'VALIDATION', issues: body.error.flatten() });
    try {
      return reply.send(
        await updateAutomation(params.data.id, {
          name: body.data.name,
          active: body.data.active,
          flow: body.data.flow as unknown as Flow,
        }),
      );
    } catch (e) {
      return send(reply, e);
    }
  });

  app.put('/:id/toggle', { preHandler: requireAnyRole(['ADMIN']) }, async (req, reply) => {
    const params = idParamSchema.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: 'VALIDATION', issues: params.error.flatten() });
    try {
      return reply.send(await toggleAutomation(params.data.id));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.delete('/:id', { preHandler: requireAnyRole(['ADMIN']) }, async (req, reply) => {
    const params = idParamSchema.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: 'VALIDATION', issues: params.error.flatten() });
    try {
      return reply.send(await deleteAutomation(params.data.id));
    } catch (e) {
      return send(reply, e);
    }
  });

  // Dry-run: NÃO persiste e NÃO envia mensagem real.
  app.post('/:id/test', { preHandler: requireAnyRole(['ADMIN']) }, async (req, reply) => {
    const params = idParamSchema.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: 'VALIDATION', issues: params.error.flatten() });
    const body = testAutomationSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: 'VALIDATION', issues: body.error.flatten() });
    try {
      const fakeEvent = body.data.event
        ? ({ type: body.data.event.type, data: body.data.event.data } as unknown as EventPayload)
        : undefined;
      const result = await dryRunAutomation(params.data.id, fakeEvent);
      return reply.send(result);
    } catch (e) {
      return send(reply, e);
    }
  });

  // Histórico de execuções (logs) — útil pra UI.
  app.get('/:id/logs', async (req, reply) => {
    const params = idParamSchema.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: 'VALIDATION', issues: params.error.flatten() });
    const { prisma } = await import('../../lib/prisma.js');
    const rows = await prisma.automationLog.findMany({
      where: { automationId: params.data.id },
      orderBy: { startedAt: 'desc' },
      take: 50,
    });
    return reply.send(rows);
  });
};
