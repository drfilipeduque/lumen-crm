import type { FastifyPluginAsync } from 'fastify';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async () => ({
    status: 'ok',
    service: 'lumen-api',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  }));
};
