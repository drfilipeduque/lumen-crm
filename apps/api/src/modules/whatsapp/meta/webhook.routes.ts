// Rotas /webhooks/meta/:connectionId — públicas (sem auth) por design
// (a Meta chama elas). Validamos via x-hub-signature-256 (HMAC SHA256).

import type { FastifyPluginAsync } from 'fastify';
import { env } from '../../../env.js';
import { processWebhook, verifySignature, type MetaWebhookPayload } from './webhook.handler.js';

export const metaWebhookRoutes: FastifyPluginAsync = async (app) => {
  // Custom content-type parser que retém o raw body em Buffer pra HMAC.
  // Escopo: este plugin (não vaza pras outras rotas que usam JSON normal).
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => {
    try {
      const buf = body as Buffer;
      const json = buf.length === 0 ? {} : JSON.parse(buf.toString('utf8'));
      // anexa rawBody pra inspeção no handler
      (json as Record<string, unknown>).__rawBody = buf;
      done(null, json);
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  // Verificação inicial: a Meta chama com hub.mode=subscribe e hub.challenge.
  // Devolvemos o challenge como texto puro se o verify_token bater.
  app.get<{ Params: { connectionId: string } }>('/:connectionId', async (req, reply) => {
    const q = req.query as Record<string, string | undefined>;
    const mode = q['hub.mode'];
    const token = q['hub.verify_token'];
    const challenge = q['hub.challenge'];
    if (mode === 'subscribe' && token === env.META_WEBHOOK_VERIFY_TOKEN && challenge) {
      return reply.code(200).type('text/plain').send(challenge);
    }
    return reply.code(403).send({ error: 'FORBIDDEN' });
  });

  app.post<{ Params: { connectionId: string }; Body: MetaWebhookPayload & { __rawBody?: Buffer } }>(
    '/:connectionId',
    async (req, reply) => {
      const sig = req.headers['x-hub-signature-256'] as string | undefined;

      // Em prod exige META_APP_SECRET. Em dev, se não configurado, deixa
      // passar pra facilitar testes locais — mas loga warning.
      if (env.META_APP_SECRET) {
        const raw = req.body?.__rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
        if (!verifySignature(raw, sig, env.META_APP_SECRET)) {
          req.log.warn({ connectionId: req.params.connectionId }, 'meta webhook signature inválida');
          return reply.code(401).send({ error: 'INVALID_SIGNATURE' });
        }
      } else if (env.NODE_ENV === 'production') {
        req.log.error('META_APP_SECRET ausente em produção — bloqueando');
        return reply.code(500).send({ error: 'CONFIG' });
      }

      // Resposta rápida (200) é importante pra Meta não reenfileirar.
      // Processa em background.
      reply.code(200).send({ ok: true });
      void (async () => {
        try {
          // Remove o rawBody do payload antes de processar
          const { __rawBody, ...payload } = req.body ?? ({} as MetaWebhookPayload & { __rawBody?: Buffer });
          void __rawBody;
          await processWebhook(req.params.connectionId, payload as MetaWebhookPayload);
        } catch (e) {
          req.log.error({ err: e }, 'meta webhook processWebhook failed');
        }
      })();
    },
  );
};
