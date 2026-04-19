import type { FastifyPluginAsync } from 'fastify';
import { authenticate } from '../auth/auth.middleware.js';
import {
  financialQuerySchema,
  funnelQuerySchema,
  periodSchema,
} from './dashboard.schemas.js';
import {
  getCustomBlocks,
  getFinancial,
  getFunnel,
  getMetrics,
  getTagDistribution,
} from './dashboard.service.js';

export const dashboardRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', authenticate);

  app.get('/metrics', async (req, reply) => {
    const parsed = periodSchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: 'VALIDATION', issues: parsed.error.flatten() });
    return reply.send(await getMetrics(req.user!, parsed.data));
  });

  app.get('/tag-distribution', async (req, reply) => {
    const parsed = periodSchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: 'VALIDATION', issues: parsed.error.flatten() });
    return reply.send(await getTagDistribution(req.user!, parsed.data));
  });

  app.get('/funnel', async (req, reply) => {
    const parsed = funnelQuerySchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: 'VALIDATION', issues: parsed.error.flatten() });
    return reply.send(await getFunnel(req.user!, parsed.data));
  });

  app.get('/custom-blocks', async (req, reply) => {
    return reply.send(await getCustomBlocks(req.user!));
  });

  app.get('/financial', async (req, reply) => {
    const parsed = financialQuerySchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: 'VALIDATION', issues: parsed.error.flatten() });
    try {
      return reply.send(await getFinancial(req.user!, parsed.data));
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Erro';
      return reply.code(404).send({ error: 'NOT_FOUND', message });
    }
  });
};
