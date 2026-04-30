// Rotas /automation-logs — listagem com filtros, detalhe, retry, stats.
//
// Logs são populados pelo motor de automation, pelo cadence worker e pelo
// dispatcher de webhooks. Esta rota é só leitura + retry.

import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticate, requireAnyRole } from '../auth/auth.middleware.js';
import { prisma, Prisma } from '../../lib/prisma.js';
import { enqueueExecution } from './queues.js';

const listSchema = z.object({
  type: z.enum(['AUTOMATION', 'CADENCE', 'WEBHOOK']).optional(),
  entityId: z.string().optional(),
  status: z.enum(['SUCCESS', 'FAILED', 'RUNNING', 'PARTIAL']).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
  search: z.string().optional(),
});

const idSchema = z.object({ id: z.string().min(1) });

const statsSchema = z.object({
  period: z.enum(['24h', '7d', '30d']).optional(),
});

function send(reply: FastifyReply, e: unknown) {
  throw e;
}

export const automationLogsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', authenticate);

  app.get('/', async (req, reply) => {
    const q = listSchema.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'VALIDATION', issues: q.error.flatten() });
    const page = Math.max(1, q.data.page ?? 1);
    const limit = Math.max(1, Math.min(200, q.data.limit ?? 30));

    const where: Prisma.AutomationLogWhereInput = {};
    if (q.data.type) where.type = q.data.type;
    if (q.data.entityId) where.entityId = q.data.entityId;
    if (q.data.status) where.status = q.data.status;
    if (q.data.from || q.data.to) {
      where.startedAt = {};
      if (q.data.from) where.startedAt.gte = new Date(q.data.from);
      if (q.data.to) where.startedAt.lte = new Date(q.data.to);
    }
    if (q.data.search) {
      where.OR = [
        { trigger: { contains: q.data.search, mode: 'insensitive' } },
        { triggeredBy: { contains: q.data.search, mode: 'insensitive' } },
        { error: { contains: q.data.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.automationLog.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          automation: { select: { id: true, name: true } },
        },
      }),
      prisma.automationLog.count({ where }),
    ]);
    return reply.send({ data, total, page, totalPages: Math.ceil(total / limit) });
  });

  app.get('/:id', async (req, reply) => {
    const p = idSchema.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    const row = await prisma.automationLog.findUnique({
      where: { id: p.data.id },
      include: {
        automation: { select: { id: true, name: true, flow: true } },
      },
    });
    if (!row) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Log não encontrado' });
    return reply.send(row);
  });

  app.post('/:id/retry', { preHandler: requireAnyRole(['ADMIN']) }, async (req, reply) => {
    const p = idSchema.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    const row = await prisma.automationLog.findUnique({ where: { id: p.data.id } });
    if (!row) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Log não encontrado' });

    if (row.type === 'AUTOMATION' && row.automationId) {
      await enqueueExecution({
        automationId: row.automationId,
        triggeredBy: `retry:${row.id}`,
        event: row.input as unknown as Record<string, unknown> | undefined,
      });
      return reply.send({ ok: true, kind: 'AUTOMATION', queued: true });
    }
    if (row.type === 'CADENCE') {
      // Reagenda o step atual da execution. entityId aqui é cadenceExecutionId.
      const ex = await prisma.cadenceExecution.findUnique({ where: { id: row.entityId } });
      if (!ex) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Execução de cadência não encontrada' });
      const { enqueueStep } = await import('../cadences/cadence.queue.js');
      await prisma.cadenceExecution.update({ where: { id: ex.id }, data: { status: 'ACTIVE', pauseReason: null } });
      await enqueueStep(ex.id, 0);
      return reply.send({ ok: true, kind: 'CADENCE', resumedExecutionId: ex.id });
    }
    if (row.type === 'WEBHOOK') {
      const { testWebhookDispatch } = await import('../webhooks/webhooks.dispatcher.js');
      const r = await testWebhookDispatch(row.entityId, row.input as Record<string, unknown> | undefined, app.log);
      return reply.send({ ok: true, kind: 'WEBHOOK', result: r });
    }
    return reply.code(400).send({ error: 'UNSUPPORTED', message: 'Tipo de log não suporta retry' });
  });

  // Métricas — taxa de sucesso e total no período.
  app.get('/stats', async (req, reply) => {
    const q = statsSchema.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'VALIDATION', issues: q.error.flatten() });
    const period = q.data.period ?? '24h';
    const ms = period === '24h' ? 86_400_000 : period === '7d' ? 7 * 86_400_000 : 30 * 86_400_000;
    const since = new Date(Date.now() - ms);

    const grouped = await prisma.automationLog.groupBy({
      by: ['status', 'type'],
      where: { startedAt: { gte: since } },
      _count: { _all: true },
    });

    const byType: Record<string, { total: number; success: number; failed: number; partial: number; running: number }> = {
      AUTOMATION: { total: 0, success: 0, failed: 0, partial: 0, running: 0 },
      CADENCE: { total: 0, success: 0, failed: 0, partial: 0, running: 0 },
      WEBHOOK: { total: 0, success: 0, failed: 0, partial: 0, running: 0 },
    };
    let total = 0;
    let success = 0;
    let failed = 0;
    let partial = 0;
    let running = 0;
    for (const g of grouped) {
      const slot = byType[g.type];
      if (!slot) continue;
      slot.total += g._count._all;
      total += g._count._all;
      const k = g.status.toLowerCase();
      if (k !== 'total' && Object.prototype.hasOwnProperty.call(slot, k)) {
        const numericSlot = slot as unknown as Record<string, number>;
        numericSlot[k] = (numericSlot[k] ?? 0) + g._count._all;
      }
      if (g.status === 'SUCCESS') success += g._count._all;
      if (g.status === 'FAILED') failed += g._count._all;
      if (g.status === 'PARTIAL') partial += g._count._all;
      if (g.status === 'RUNNING') running += g._count._all;
    }
    const successRate = total > 0 ? +(success / total).toFixed(4) : 0;
    return reply.send({
      period,
      since: since.toISOString(),
      total,
      success,
      failed,
      partial,
      running,
      successRate,
      byType,
    });
  });
};
