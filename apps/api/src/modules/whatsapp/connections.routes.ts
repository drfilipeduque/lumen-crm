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
import { decryptAccessToken, encryptAccessToken } from './meta/crypto.js';
import { getPhoneNumber, MetaApiError, subscribeApp } from './meta/meta.service.js';

const idParam = z.object({ id: z.string().min(1) });

const listQuery = z.object({
  type: z.enum(['OFFICIAL', 'UNOFFICIAL']).optional(),
});

const createUnofficialBody = z.object({
  name: z.string().trim().min(1, 'Nome obrigatório').max(80, 'Nome muito longo'),
  webhookUrl: z.string().trim().url('URL inválida').nullable().optional().or(z.literal('').transform(() => null)),
});

const createOfficialBody = z.object({
  name: z.string().trim().min(1, 'Nome obrigatório').max(80, 'Nome muito longo'),
  wabaId: z.string().trim().min(1, 'WABA ID obrigatório'),
  phoneNumberId: z.string().trim().min(1, 'Phone Number ID obrigatório'),
  accessToken: z.string().trim().min(20, 'Access Token inválido'),
  phone: z.string().trim().optional(),
  coexistenceMode: z.boolean().optional().default(true),
});

const updateOfficialBody = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  accessToken: z.string().trim().min(20).optional(),
  coexistenceMode: z.boolean().optional(),
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
        // Campos OFFICIAL — accessToken NUNCA é exposto, só os IDs
        wabaId: c.wabaId,
        phoneNumberId: c.phoneNumberId,
        qualityTier: c.qualityTier,
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
      // Baileys: encerra a sessão; OFFICIAL: não tem socket pra encerrar.
      const conn = await prisma.whatsAppConnection.findUnique({
        where: { id: p.data.id },
        select: { type: true },
      });
      if (conn?.type === 'UNOFFICIAL') {
        await logoutSession(p.data.id).catch(() => {});
      }
      await prisma.whatsAppConnection.delete({ where: { id: p.data.id } });
      return reply.send({ ok: true });
    } catch (e) {
      return send(reply, e);
    }
  });

  // -------- OFFICIAL: criar conexão Meta Cloud API --------
  app.post('/official', { preHandler: requireRole('ADMIN') }, async (req, reply) => {
    const body = createOfficialBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'VALIDATION', issues: body.error.flatten() });
    const data = body.data;

    // Valida credenciais consultando o phone number
    let phoneInfo;
    try {
      phoneInfo = await getPhoneNumber(data.phoneNumberId, data.accessToken);
    } catch (e) {
      if (e instanceof MetaApiError) {
        return reply.code(400).send({
          error: 'META_INVALID_CREDENTIALS',
          message: `Meta rejeitou as credenciais: ${e.message}`,
          details: e.details,
        });
      }
      return send(reply, e);
    }

    // Inscreve o app na WABA (best effort — falha não bloqueia criação)
    let subscribeWarning: string | null = null;
    try {
      await subscribeApp(data.wabaId, data.accessToken);
    } catch (e) {
      const msg = e instanceof MetaApiError ? e.message : 'falha ao inscrever';
      subscribeWarning = msg;
    }

    try {
      const conn = await prisma.whatsAppConnection.create({
        data: {
          name: data.name,
          type: 'OFFICIAL',
          status: 'CONNECTED',
          wabaId: data.wabaId,
          phoneNumberId: data.phoneNumberId,
          accessToken: encryptAccessToken(data.accessToken),
          coexistenceMode: data.coexistenceMode,
          phone: data.phone || phoneInfo.display_phone_number,
          profileName: phoneInfo.verified_name ?? null,
          qualityTier: phoneInfo.messaging_limit_tier ?? null,
        },
      });
      await prisma.userWhatsAppConnection.create({
        data: { userId: req.user!.id, connectionId: conn.id },
      }).catch(() => {});
      return reply.code(201).send({
        id: conn.id,
        name: conn.name,
        type: conn.type,
        phone: conn.phone,
        profileName: conn.profileName,
        status: conn.status,
        wabaId: conn.wabaId,
        phoneNumberId: conn.phoneNumberId,
        qualityTier: conn.qualityTier,
        coexistenceMode: conn.coexistenceMode,
        warning: subscribeWarning,
      });
    } catch (e) {
      return send(reply, e);
    }
  });

  // -------- OFFICIAL: revalidar credenciais --------
  app.put('/:id/verify', { preHandler: requireRole('ADMIN') }, async (req, reply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    const conn = await prisma.whatsAppConnection.findUnique({ where: { id: p.data.id } });
    if (!conn) return reply.code(404).send({ error: 'NOT_FOUND' });
    if (conn.type !== 'OFFICIAL' || !conn.accessToken || !conn.phoneNumberId) {
      return reply.code(400).send({ error: 'NOT_OFFICIAL', message: 'Conexão não é Meta Cloud API' });
    }
    try {
      const token = decryptAccessToken(conn.accessToken);
      const phoneInfo = await getPhoneNumber(conn.phoneNumberId, token);
      const updated = await prisma.whatsAppConnection.update({
        where: { id: conn.id },
        data: {
          status: 'CONNECTED',
          phone: phoneInfo.display_phone_number,
          profileName: phoneInfo.verified_name ?? conn.profileName,
          qualityTier: phoneInfo.messaging_limit_tier ?? conn.qualityTier,
        },
      });
      return reply.send({
        id: updated.id,
        status: updated.status,
        phone: updated.phone,
        profileName: updated.profileName,
        qualityTier: updated.qualityTier,
        verifiedAt: new Date(),
      });
    } catch (e) {
      if (e instanceof MetaApiError) {
        await prisma.whatsAppConnection.update({
          where: { id: conn.id },
          data: { status: 'ERROR' },
        });
        return reply.code(400).send({ error: 'META_VERIFY_FAILED', message: e.message });
      }
      return send(reply, e);
    }
  });

  // -------- OFFICIAL: rename / rotate access token --------
  app.put('/:id', { preHandler: requireRole('ADMIN') }, async (req, reply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    const body = updateOfficialBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'VALIDATION', issues: body.error.flatten() });
    const conn = await prisma.whatsAppConnection.findUnique({ where: { id: p.data.id } });
    if (!conn) return reply.code(404).send({ error: 'NOT_FOUND' });

    const data: Record<string, unknown> = {};
    if (body.data.name !== undefined) data.name = body.data.name;
    if (body.data.coexistenceMode !== undefined) data.coexistenceMode = body.data.coexistenceMode;

    if (body.data.accessToken !== undefined) {
      if (conn.type !== 'OFFICIAL' || !conn.phoneNumberId) {
        return reply.code(400).send({ error: 'NOT_OFFICIAL', message: 'Conexão não é Meta Cloud API' });
      }
      // Valida o novo token contra o phone number antes de salvar
      try {
        await getPhoneNumber(conn.phoneNumberId, body.data.accessToken);
      } catch (e) {
        if (e instanceof MetaApiError) {
          return reply.code(400).send({
            error: 'META_INVALID_CREDENTIALS',
            message: `Token inválido: ${e.message}`,
          });
        }
        return send(reply, e);
      }
      data.accessToken = encryptAccessToken(body.data.accessToken);
      data.status = 'CONNECTED';
    }

    if (Object.keys(data).length === 0) return reply.send({ id: conn.id });

    const updated = await prisma.whatsAppConnection.update({
      where: { id: conn.id },
      data,
    });
    return reply.send({
      id: updated.id,
      name: updated.name,
      status: updated.status,
      coexistenceMode: updated.coexistenceMode,
    });
  });

  // -------- OFFICIAL: métricas básicas --------
  app.get('/:id/metrics', async (req, reply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    const conn = await prisma.whatsAppConnection.findUnique({
      where: { id: p.data.id },
      select: { type: true, qualityTier: true },
    });
    if (!conn) return reply.code(404).send({ error: 'NOT_FOUND' });

    const since = new Date(Date.now() - 24 * 3600_000);
    const [received, sent, openConvs] = await Promise.all([
      prisma.message.count({
        where: {
          conversation: { connectionId: p.data.id },
          fromMe: false,
          createdAt: { gte: since },
        },
      }),
      prisma.message.count({
        where: {
          conversation: { connectionId: p.data.id },
          fromMe: true,
          createdAt: { gte: since },
        },
      }),
      prisma.conversation.count({
        where: { connectionId: p.data.id, status: 'OPEN' },
      }),
    ]);

    return reply.send({
      qualityTier: conn.qualityTier,
      last24h: { received, sent },
      openConversations: openConvs,
    });
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
