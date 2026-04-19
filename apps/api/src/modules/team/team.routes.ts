import type { FastifyPluginAsync } from 'fastify';
import { authenticate } from '../auth/auth.middleware.js';
import { prisma } from '../../lib/prisma.js';

// Lista enxuta de usuarios ativos para uso em selects de atribuicao
// (responsavel de contato, oportunidade etc.). Disponivel para qualquer
// usuario autenticado.
export const teamRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', authenticate);

  app.get('/', async (_req, reply) => {
    const users = await prisma.user.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, role: true, avatar: true },
    });
    return reply.send(users);
  });
};
