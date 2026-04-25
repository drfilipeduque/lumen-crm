import { z } from 'zod';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { authenticate, requireRole } from '../auth/auth.middleware.js';
import { prisma } from '../../lib/prisma.js';
import {
  getCurrentQr,
  logoutSession,
  startSession,
  stopSession,
} from './baileys/session-manager.js';

const idParam = z.object({ id: z.string().min(1) });

const listQuery = z.object({
  type: z.enum(['OFFICIAL', 'UNOFFICIAL']).optional(),
});

const createUnofficialBody = z.object({
  name: z.string().trim().min(1, 'Nome obrigatório').max(80, 'Nome muito longo'),
  webhookUrl: z.string().trim().url('URL inválida').nullable().optional().or(z.literal('').transform(() => null)),
});

const entryRuleBody = z
  .object({
    mode: z.enum(['AUTO', 'MANUAL']),
    pipelineId: z.string().min(1).optional(),
    stageId: z.string().min(1).optional(),
  })
  .refine((d) => d.mode !== 'AUTO' || (!!d.pipelineId && !!d.stageId), {
    message: 'No modo AUTO, pipelineId e stageId são obrigatórios',
    path: ['mode'],
  });

function send(reply: FastifyReply, e: unknown) {
  const msg = e instanceof Error ? e.message : 'Erro desconhecido';
  return reply.code(500).send({ error: 'INTERNAL', message: msg });
}

// =====================================================================
// Conexões — admin only pra criar/excluir; listagem pra qualquer usuário
// (filtra por permissão se não for admin).
// =====================================================================
export const whatsappConnectionsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', authenticate);

  app.get('/', async (req, reply) => {
    const q = listQuery.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'VALIDATION', issues: q.error.flatten() });
    const isAdmin = req.user!.role === 'ADMIN';
    const where: Record<string, unknown> = {};
    if (q.data.type) where.type = q.data.type;
    if (!isAdmin) {
      where.users = { some: { userId: req.user!.id } };
    }
    const conns = await prisma.whatsAppConnection.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      include: {
        users: { select: { user: { select: { id: true, name: true, avatar: true } } } },
        entryRule: true,
      },
    });
    return reply.send(
      conns.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        phone: c.phone,
        profileName: c.profileName,
        avatar: c.avatar,
        status: c.status,
        active: c.active,
        coexistenceMode: c.coexistenceMode,
        webhookUrl: c.webhookUrl,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        users: c.users.map((u) => u.user),
        entryRule: c.entryRule,
      })),
    );
  });

  app.get('/:id/qr', async (req, reply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    const qr = getCurrentQr(p.data.id);
    return reply.send({ qr });
  });

  app.post('/:id/restart', { preHandler: requireRole('ADMIN') }, async (req, reply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    try {
      await stopSession(p.data.id);
      await startSession(p.data.id);
      return reply.send({ ok: true });
    } catch (e) {
      return send(reply, e);
    }
  });

  app.post('/unofficial', { preHandler: requireRole('ADMIN') }, async (req, reply) => {
    const body = createUnofficialBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'VALIDATION', issues: body.error.flatten() });
    try {
      const conn = await prisma.whatsAppConnection.create({
        data: {
          name: body.data.name,
          type: 'UNOFFICIAL',
          status: 'WAITING_QR',
          webhookUrl: body.data.webhookUrl ?? null,
        },
      });
      // Vincula o admin que criou pra ele receber events do socket
      await prisma.userWhatsAppConnection.create({
        data: { userId: req.user!.id, connectionId: conn.id },
      }).catch(() => {});
      // Inicia sessão (assíncrono — QR vem via socket)
      startSession(conn.id).catch(() => {});
      return reply.code(201).send(conn);
    } catch (e) {
      return send(reply, e);
    }
  });

  app.delete('/:id', { preHandler: requireRole('ADMIN') }, async (req, reply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    try {
      await logoutSession(p.data.id).catch(() => {});
      await prisma.whatsAppConnection.delete({ where: { id: p.data.id } });
      return reply.send({ ok: true });
    } catch (e) {
      return send(reply, e);
    }
  });

  // -------- Entry rule por conexão --------
  app.get('/:id/entry-rule', async (req, reply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    const rule = await prisma.connectionEntryRule.findUnique({ where: { connectionId: p.data.id } });
    return reply.send(rule);
  });

  app.put('/:id/entry-rule', { preHandler: requireRole('ADMIN') }, async (req, reply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    const body = entryRuleBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'VALIDATION', issues: body.error.flatten() });

    if (body.data.mode === 'AUTO') {
      const stage = await prisma.stage.findUnique({
        where: { id: body.data.stageId! },
        select: { pipelineId: true },
      });
      if (!stage || stage.pipelineId !== body.data.pipelineId) {
        return reply.code(400).send({
          error: 'STAGE_PIPELINE_MISMATCH',
          message: 'A etapa não pertence ao funil informado',
        });
      }
    }

    const rule = await prisma.connectionEntryRule.upsert({
      where: { connectionId: p.data.id },
      create: {
        connectionId: p.data.id,
        mode: body.data.mode,
        pipelineId: body.data.pipelineId ?? '',
        stageId: body.data.stageId ?? '',
      },
      update: {
        mode: body.data.mode,
        ...(body.data.pipelineId ? { pipelineId: body.data.pipelineId } : {}),
        ...(body.data.stageId ? { stageId: body.data.stageId } : {}),
      },
    });
    return reply.send(rule);
  });
};

// Lista cross-connection das regras (atalho pra UI)
export const whatsappEntryRulesRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', authenticate);
  app.addHook('preHandler', requireRole('ADMIN'));

  app.get('/', async (_req, reply) => {
    const conns = await prisma.whatsAppConnection.findMany({
      where: { active: true },
      include: { entryRule: true },
      orderBy: { createdAt: 'desc' },
    });
    return reply.send(
      conns.map((c) => ({
        connectionId: c.id,
        name: c.name,
        type: c.type,
        status: c.status,
        rule: c.entryRule,
      })),
    );
  });
};
