import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';

const here = dirname(fileURLToPath(import.meta.url));
// .env vive na raiz do monorepo
const envPath = resolve(here, '../../../.env');
if (existsSync(envPath)) {
  loadEnv({ path: envPath });
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z.coerce.number().int().positive().default(3333),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string().url().optional(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_ACCESS_SECRET: z.string().min(16).default('dev-access-secret-change-me-please'),
  JWT_REFRESH_SECRET: z.string().min(16).default('dev-refresh-secret-change-me-please'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  // Chave (hex, 64 chars = 32 bytes) usada pra criptografar
  // credenciais Baileys salvas no banco. Em dev cai num default
  // determinístico; em prod precisa ser configurada.
  WHATSAPP_ENCRYPTION_KEY: z
    .string()
    .default('00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'),
  // ==== Meta Cloud API ====
  // App Secret usado pra validar a assinatura HMAC dos webhooks (x-hub-signature-256).
  META_APP_SECRET: z.string().optional(),
  // Versão da Graph API; default mantém compat com endpoints atuais.
  META_GRAPH_VERSION: z.string().default('v21.0'),
  // Token usado no handshake de verificação do webhook (hub.verify_token).
  META_WEBHOOK_VERIFY_TOKEN: z.string().default('lumen-meta-verify'),
  // URL pública usada pra registrar webhook na Meta. Sem isso, registramos
  // o webhook mas não funciona em produção; útil em dev via tunelamento.
  PUBLIC_API_URL: z.string().url().optional(),
});

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;
