import { mkdir } from 'node:fs/promises';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import staticPlugin from '@fastify/static';
import { env } from './env.js';
import { UPLOADS_DIR } from './lib/uploads.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { dashboardRoutes } from './modules/dashboard/dashboard.routes.js';
import { tagsRoutes } from './modules/tags/tags.routes.js';
import { customFieldsRoutes } from './modules/custom-fields/custom-fields.routes.js';
import { pipelinesRoutes, stagesRoutes } from './modules/pipelines/pipelines.routes.js';
import { contactsRoutes } from './modules/contacts/contacts.routes.js';
import { teamRoutes } from './modules/team/team.routes.js';
import { opportunitiesRoutes, opportunityBoardRoutes } from './modules/opportunities/opportunities.routes.js';
import { filesRoutes, opportunityFilesRoutes } from './modules/files/files.routes.js';
import { opportunityRemindersRoutes, remindersRoutes } from './modules/reminders/reminders.routes.js';
import { initRealtime } from './lib/realtime.js';
import { startReminderWorker } from './workers/reminders.js';

const app = Fastify({
  logger: {
    level: env.NODE_ENV === 'development' ? 'info' : 'warn',
    transport:
      env.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } }
        : undefined,
  },
});

await app.register(cors, {
  origin: env.CORS_ORIGIN.split(',').map((s) => s.trim()),
  credentials: true,
});

await app.register(multipart, {
  // limite global; rotas individuais (ex.: avatar) impõem limites menores
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
});

await mkdir(UPLOADS_DIR, { recursive: true });
await app.register(staticPlugin, {
  root: UPLOADS_DIR,
  prefix: '/uploads/',
  decorateReply: false,
  cacheControl: true,
  maxAge: '1h',
});

await app.register(healthRoutes);
await app.register(authRoutes, { prefix: '/auth' });
await app.register(dashboardRoutes, { prefix: '/dashboard' });
await app.register(tagsRoutes, { prefix: '/tags' });
await app.register(customFieldsRoutes, { prefix: '/custom-fields' });
await app.register(pipelinesRoutes, { prefix: '/pipelines' });
await app.register(stagesRoutes, { prefix: '/stages' });
await app.register(contactsRoutes, { prefix: '/contacts' });
await app.register(teamRoutes, { prefix: '/team' });
await app.register(opportunitiesRoutes, { prefix: '/opportunities' });
await app.register(opportunityBoardRoutes, { prefix: '/pipelines' });
await app.register(opportunityFilesRoutes, { prefix: '/opportunities' });
await app.register(opportunityRemindersRoutes, { prefix: '/opportunities' });
await app.register(filesRoutes, { prefix: '/files' });
await app.register(remindersRoutes, { prefix: '/reminders' });

try {
  await app.listen({ host: env.API_HOST, port: env.API_PORT });
  app.log.info(`Lumen API ouvindo em http://${env.API_HOST}:${env.API_PORT}`);
  initRealtime(app, env.CORS_ORIGIN.split(',').map((s) => s.trim()));
  startReminderWorker(app.log);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
