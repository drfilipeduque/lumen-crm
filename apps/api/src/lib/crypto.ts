// Util genérico de criptografia simétrica (AES-256-GCM).
// Usado pra qualquer segredo que vai ao banco: API keys de IA, tokens,
// credenciais Baileys (via wrapper em encryption.ts), etc.
//
// Formato do payload: base64(iv(12) || authTag(16) || ciphertext).
// Chave: WHATSAPP_ENCRYPTION_KEY do .env (hex, 64 chars = 32 bytes).
// O nome da env veio histórico (Baileys), mas a chave é genérica.

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '../env.js';

const KEY = (() => {
  const k = env.WHATSAPP_ENCRYPTION_KEY;
  if (!/^[0-9a-fA-F]{64}$/.test(k)) {
    throw new Error('WHATSAPP_ENCRYPTION_KEY deve ser hex com 64 chars (32 bytes)');
  }
  return Buffer.from(k, 'hex');
})();

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decrypt(encoded: string): string {
  const buf = Buffer.from(encoded, 'base64');
  if (buf.length < 12 + 16) throw new Error('payload muito curto pra AES-256-GCM');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

// Mostra "sk-***...abc" pra UI sem vazar o valor inteiro.
export function maskKey(plain: string): string {
  if (plain.length <= 8) return '***';
  return `${plain.slice(0, 3)}***${plain.slice(-4)}`;
}
