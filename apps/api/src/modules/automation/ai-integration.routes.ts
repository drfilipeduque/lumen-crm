// Rotas /api/ai-integrations.
// Todas exigem ADMIN — cuidado: aqui rola key sensível.
//
// Nunca devolvemos a apiKey decifrada. Em GET, devolvemos só `keyMask`.

import type { FastifyPluginAsync } from 'fastify';
import { authenticate, requireAnyRole } from '../auth/auth.middleware.js';
import { prisma } from '../../lib/prisma.js';
import { decrypt, encrypt, maskKey } from '../../lib/crypto.js';
import { defaultModelFor, testIntegration, testKey } from './ai/ai.service.js';
import {
  createAIIntegrationSchema,
  idParamSchema,
  rotateKeySchema,
  testIntegrationSchema,
  testKeySchema,
  updateAIIntegrationSchema,
} from './ai-integration.schemas.js';

type IntegrationRow = {
  id: string;
  name: string;
  provider: 'CLAUDE' | 'OPENAI';
  apiKey: string;
  defaultModel: string;
  active: boolean;
  usageCount: number;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function safeView(row: IntegrationRow) {
  // Decifra só pra calcular o mask. Se decryption falhar, mostra "***".
  let mask = '***';
  try {
    mask = maskKey(decrypt(row.apiKey));
  } catch {
    mask = '***';
  }
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    keyMask: mask,
    defaultModel: row.defaultModel,
    active: row.active,
    usageCount: row.usageCount,
    lastUsedAt: row.lastUsedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export const aiIntegrationRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', authenticate);
  app.addHook('preHandler', requireAnyRole(['ADMIN']));

  app.get('/', async () => {
    const list = await prisma.aIIntegration.findMany({ orderBy: { createdAt: 'desc' } });
    return list.map(safeView);
  });

  app.get('/:id', async (req, reply) => {
    const params = idParamSchema.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: 'VALIDATION', issues: params.error.flatten() });
    const row = await prisma.aIIntegration.findUnique({ where: { id: params.data.id } });
    if (!row) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Integração não encontrada' });
    return reply.send(safeView(row));
  });

  app.post('/', async (req, reply) => {
    const body = createAIIntegrationSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'VALIDATION', issues: body.error.flatten() });
    const { name, provider, apiKey, defaultModel, active } = body.data;
    const created = await prisma.aIIntegration.create({
      data: {
        name,
        provider,
        apiKey: encrypt(apiKey),
        defaultModel: defaultModel ?? defaultModelFor(provider),
        active: active ?? true,
      },
    });
    return reply.code(201).send(safeView(created));
  });

  app.put('/:id', async (req, reply) => {
    const params = idParamSchema.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: 'VALIDATION', issues: params.error.flatten() });
    const body = updateAIIntegrationSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'VALIDATION', issues: body.error.flatten() });
    const row = await prisma.aIIntegration.findUnique({ where: { id: params.data.id } });
    if (!row) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Integração não encontrada' });
    const updated = await prisma.aIIntegration.update({
      where: { id: row.id },
      data: {
        name: body.data.name ?? undefined,
        defaultModel: body.data.defaultModel ?? undefined,
        active: body.data.active ?? undefined,
      },
    });
    return reply.send(safeView(updated));
  });

  app.put('/:id/rotate-key', async (req, reply) => {
    const params = idParamSchema.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: 'VALIDATION', issues: params.error.flatten() });
    const body = rotateKeySchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'VALIDATION', issues: body.error.flatten() });
    const row = await prisma.aIIntegration.findUnique({ where: { id: params.data.id } });
    if (!row) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Integração não encontrada' });
    const updated = await prisma.aIIntegration.update({
      where: { id: row.id },
      data: { apiKey: encrypt(body.data.apiKey) },
    });
    return reply.send(safeView(updated));
  });

  app.delete('/:id', async (req, reply) => {
    const params = idParamSchema.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: 'VALIDATION', issues: params.error.flatten() });
    const row = await prisma.aIIntegration.findUnique({ where: { id: params.data.id } });
    if (!row) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Integração não encontrada' });
    await prisma.aIIntegration.delete({ where: { id: row.id } });
    return reply.send({ ok: true });
  });

  // Testa uma integração já salva.
  app.post('/:id/test', async (req, reply) => {
    const params = idParamSchema.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: 'VALIDATION', issues: params.error.flatten() });
    const body = testIntegrationSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: 'VALIDATION', issues: body.error.flatten() });
    const result = await testIntegration(params.data.id, body.data.prompt);
    return reply.send(result);
  });

  // Testa uma key ANTES de salvar (input: { provider, apiKey, model? })
  app.post('/test-key', async (req, reply) => {
    const parsed = testKeySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'VALIDATION', issues: parsed.error.flatten() });
    const model = parsed.data.model ?? defaultModelFor(parsed.data.provider);
    const result = await testKey(parsed.data.provider, parsed.data.apiKey, model);
    return reply.send(result);
  });
};
