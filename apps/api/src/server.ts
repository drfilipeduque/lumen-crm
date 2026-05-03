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
import { startWhatsAppQualityWorker } from './workers/whatsapp-quality.js';
import { startAutomationEngine } from './workers/automation.js';
import { startCadenceWorker } from './workers/cadence.js';
import { startScheduledMessageWorker } from './workers/scheduled-message.js';
import { startBroadcastSendWorker } from './workers/broadcast-send.js';
import {
  scheduledMessagesRoutes,
  contactScheduledCountRoute,
  opportunityScheduledCountRoute,
} from './modules/scheduled-messages/scheduled-messages.routes.js';
import { broadcastsRoutes } from './modules/broadcasts/broadcasts.routes.js';
import { registerCadenceListeners } from './modules/cadences/cadence-listeners.js';
import {
  whatsappConnectionsRoutes,
  whatsappEntryRulesRoutes,
} from './modules/whatsapp/connections.routes.js';
import { whatsappRoutingConfigRoutes } from './modules/whatsapp/routing-config.routes.js';
import { conversationMessagesRoutes } from './modules/whatsapp/messages.routes.js';
import { conversationsRoutes } from './modules/whatsapp/conversations.routes.js';
import { restoreAllSessions } from './modules/whatsapp/baileys/session-manager.js';
import { metaWebhookRoutes } from './modules/whatsapp/meta/webhook.routes.js';
import { connectionTemplatesRoutes } from './modules/whatsapp/meta/templates.routes.js';
import { scriptFoldersRoutes, scriptsRoutes } from './modules/scripts/scripts.routes.js';
import { automationRoutes } from './modules/automation/automation.routes.js';
import { aiIntegrationRoutes } from './modules/automation/ai-integration.routes.js';
import { automationLogsRoutes } from './modules/automation/logs.routes.js';
import { automationUploadsRoutes } from './modules/automation/uploads.routes.js';
import {
  cadencesRoutes,
  cadenceExecutionsRoutes,
} from './modules/cadences/cadences.routes.js';
import {
  webhooksRoutes,
  webhooksInboundRoutes,
} from './modules/webhooks/webhooks.routes.js';
import { registerWebhookDispatcher } from './modules/webhooks/webhooks.dispatcher.js';

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
await app.register(whatsappConnectionsRoutes, { prefix: '/whatsapp/connections' });
await app.register(connectionTemplatesRoutes, { prefix: '/whatsapp/connections' });
await app.register(whatsappEntryRulesRoutes, { prefix: '/whatsapp/entry-rules' });
await app.register(whatsappRoutingConfigRoutes, { prefix: '/whatsapp/routing-config' });
await app.register(conversationsRoutes, { prefix: '/conversations' });
await app.register(conversationMessagesRoutes, { prefix: '/conversations' });
// Webhook da Meta — rota pública (sem auth), assinatura HMAC validada na rota.
// Registrada como plugin isolado pra não vazar o content-type parser custom.
await app.register(metaWebhookRoutes, { prefix: '/webhooks/meta' });
await app.register(scriptsRoutes, { prefix: '/scripts' });
await app.register(scriptFoldersRoutes, { prefix: '/script-folders' });
await app.register(automationRoutes, { prefix: '/automations' });
await app.register(aiIntegrationRoutes, { prefix: '/ai-integrations' });
await app.register(automationLogsRoutes, { prefix: '/automation-logs' });
await app.register(automationUploadsRoutes, { prefix: '/automation-uploads' });
await app.register(cadencesRoutes, { prefix: '/cadences' });
await app.register(cadenceExecutionsRoutes, { prefix: '/cadence-executions' });
await app.register(scheduledMessagesRoutes, { prefix: '/scheduled-messages' });
await app.register(contactScheduledCountRoute, { prefix: '/contacts' });
await app.register(opportunityScheduledCountRoute, { prefix: '/opportunities' });
await app.register(broadcastsRoutes, { prefix: '/broadcasts' });
await app.register(webhooksRoutes, { prefix: '/webhooks' });
// Receiver INBOUND público — rota sem auth global, valida X-Auth-Token no handler.
await app.register(webhooksInboundRoutes, { prefix: '/webhooks/inbound' });

try {
  await app.listen({ host: env.API_HOST, port: env.API_PORT });
  app.log.info(`Lumen API ouvindo em http://${env.API_HOST}:${env.API_PORT}`);
  initRealtime(app, env.CORS_ORIGIN.split(',').map((s) => s.trim()));
  startReminderWorker(app.log);
  startWhatsAppQualityWorker(app.log);
  startAutomationEngine(app.log);
  startCadenceWorker(app.log);
  startScheduledMessageWorker(app.log);
  startBroadcastSendWorker(app.log);
  registerCadenceListeners(app.log);
  registerWebhookDispatcher(app.log);
  // Reabre sessões WhatsApp persistidas
  void restoreAllSessions().catch((err) => app.log.error({ err }, 'restoreAllSessions failed'));
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
