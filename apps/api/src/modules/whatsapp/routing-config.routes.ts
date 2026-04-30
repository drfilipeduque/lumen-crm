// Configuração singleton de roteamento padrão de WhatsApp.
// Usado pelas actions de envio quando a action não preenche connectionStrategy
// e pra exibir defaults na UI de Automações.

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { authenticate, requireRole } from '../auth/auth.middleware.js';
import { prisma } from '../../lib/prisma.js';

const routingConfigSchema = z.object({
  defaultConnectionId: z.string().min(1).nullable().optional(),
  defaultStrategy: z
    .enum(['OFFICIAL_FIRST', 'UNOFFICIAL_FIRST', 'OFFICIAL_ONLY', 'UNOFFICIAL_ONLY'])
    .optional(),
  fallbackTemplateId: z.string().min(1).nullable().optional(),
  autoMarkAsRead: z.boolean().optional(),
  businessHoursOnly: z.boolean().optional(),
});

const SINGLETON_ID = 'default';

async function getOrCreate() {
  const existing = await prisma.whatsAppRoutingConfig.findUnique({
    where: { id: SINGLETON_ID },
    include: {
      defaultConnection: { select: { id: true, name: true, type: true } },
      fallbackTemplate: { select: { id: true, name: true, language: true, status: true } },
    },
  });
  if (existing) return existing;
  return prisma.whatsAppRoutingConfig.create({
    data: { id: SINGLETON_ID },
    include: {
      defaultConnection: { select: { id: true, name: true, type: true } },
      fallbackTemplate: { select: { id: true, name: true, language: true, status: true } },
    },
  });
}

export const whatsappRoutingConfigRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', authenticate);

  app.get('/', async (_req, reply) => {
    return reply.send(await getOrCreate());
  });

  app.put('/', { preHandler: requireRole('ADMIN') }, async (req, reply) => {
    const body = routingConfigSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'VALIDATION', issues: body.error.flatten() });
    // Garante que existe pra fazer update
    await getOrCreate();
    const data: Record<string, unknown> = {};
    if (body.data.defaultConnectionId !== undefined) data.defaultConnectionId = body.data.defaultConnectionId;
    if (body.data.defaultStrategy !== undefined) data.defaultStrategy = body.data.defaultStrategy;
    if (body.data.fallbackTemplateId !== undefined) data.fallbackTemplateId = body.data.fallbackTemplateId;
    if (body.data.autoMarkAsRead !== undefined) data.autoMarkAsRead = body.data.autoMarkAsRead;
    if (body.data.businessHoursOnly !== undefined) data.businessHoursOnly = body.data.businessHoursOnly;
    const updated = await prisma.whatsAppRoutingConfig.update({
      where: { id: SINGLETON_ID },
      data,
      include: {
        defaultConnection: { select: { id: true, name: true, type: true } },
        fallbackTemplate: { select: { id: true, name: true, language: true, status: true } },
      },
    });
    return reply.send(updated);
  });
};
