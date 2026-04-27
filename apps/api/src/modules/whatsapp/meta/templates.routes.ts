// Rotas de templates por conexão (apenas conexões OFFICIAL).
// Prefixo: /whatsapp/connections/:id/templates

import { z } from 'zod';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { authenticate, requireRole } from '../../auth/auth.middleware.js';
import { prisma } from '../../../lib/prisma.js';
import { decryptAccessToken } from './crypto.js';
import { MetaApiError } from './meta.service.js';
import {
  createTemplate as svcCreate,
  deleteTemplate as svcDelete,
  syncTemplates as svcSync,
  type LocalTemplateInput,
} from './templates.service.js';

const idParam = z.object({ id: z.string().min(1) });
const idAndTemplate = z.object({ id: z.string().min(1), templateId: z.string().min(1) });

const createBody = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9_]+$/, 'Use apenas letras minúsculas, números e _'),
  category: z.enum(['MARKETING', 'UTILITY', 'AUTHENTICATION']),
  language: z.string().trim().min(2).default('pt_BR'),
  header: z
    .object({
      format: z.enum(['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT']),
      text: z.string().optional(),
    })
    .nullable()
    .optional(),
  body: z.string().trim().min(1, 'Corpo obrigatório').max(1024),
  footer: z.string().trim().max(60).nullable().optional(),
  buttons: z
    .array(
      z.object({
        type: z.enum(['QUICK_REPLY', 'URL', 'PHONE_NUMBER']),
        text: z.string().trim().min(1).max(25),
        url: z.string().trim().url().optional(),
        phone_number: z.string().trim().optional(),
      }),
    )
    .max(3)
    .nullable()
    .optional(),
});

function send(reply: FastifyReply, e: unknown) {
  if (e instanceof MetaApiError) return reply.code(e.status).send({ error: e.code, message: e.message });
  const msg = e instanceof Error ? e.message : 'Erro';
  return reply.code(500).send({ error: 'INTERNAL', message: msg });
}

async function loadOfficial(id: string) {
  const conn = await prisma.whatsAppConnection.findUnique({ where: { id } });
  if (!conn) throw new MetaApiError('NOT_FOUND', 'Conexão não encontrada', 404);
  if (conn.type !== 'OFFICIAL' || !conn.accessToken || !conn.wabaId) {
    throw new MetaApiError('NOT_OFFICIAL', 'Conexão não é Meta Cloud API', 400);
  }
  return { ...conn, token: decryptAccessToken(conn.accessToken) };
}

export const connectionTemplatesRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', authenticate);

  // Lista local (sem chamar Meta)
  app.get<{ Params: { id: string } }>('/:id/templates', async (req, reply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    const items = await prisma.template.findMany({
      where: { connectionId: p.data.id },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    });
    return reply.send(items);
  });

  // Sync com Meta
  app.post<{ Params: { id: string } }>(
    '/:id/templates/sync',
    { preHandler: requireRole('ADMIN') },
    async (req, reply) => {
      const p = idParam.safeParse(req.params);
      if (!p.success) return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
      try {
        const conn = await loadOfficial(p.data.id);
        const r = await svcSync(conn.id, conn.wabaId!, conn.token);
        return reply.send(r);
      } catch (e) {
        return send(reply, e);
      }
    },
  );

  // Criar (envia pra Meta aprovar)
  app.post<{ Params: { id: string }; Body: LocalTemplateInput }>(
    '/:id/templates',
    { preHandler: requireRole('ADMIN') },
    async (req, reply) => {
      const p = idParam.safeParse(req.params);
      if (!p.success) return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
      const body = createBody.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: 'VALIDATION', issues: body.error.flatten() });
      try {
        const conn = await loadOfficial(p.data.id);
        const created = await svcCreate(conn.id, conn.wabaId!, conn.token, body.data as LocalTemplateInput);
        return reply.code(201).send(created);
      } catch (e) {
        return send(reply, e);
      }
    },
  );

  // Deletar
  app.delete<{ Params: { id: string; templateId: string } }>(
    '/:id/templates/:templateId',
    { preHandler: requireRole('ADMIN') },
    async (req, reply) => {
      const p = idAndTemplate.safeParse(req.params);
      if (!p.success) return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
      try {
        const conn = await loadOfficial(p.data.id);
        await svcDelete(conn.id, conn.wabaId!, conn.token, p.data.templateId);
        return reply.send({ ok: true });
      } catch (e) {
        return send(reply, e);
      }
    },
  );
};
