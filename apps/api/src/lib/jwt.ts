import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '../env.js';

export type AccessTokenPayload = {
  sub: string;
  role: string;
  type: 'access';
  sid?: string;
};

function base64url(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(input: string): Buffer {
  input = input.replace(/-/g, '+').replace(/_/g, '/');
  while (input.length % 4) input += '=';
  return Buffer.from(input, 'base64');
}

function parseExpiresIn(expr: string): number {
  const m = expr.match(/^(\d+)([smhd])$/);
  if (!m) throw new Error(`expiresIn inválido: ${expr}`);
  const n = Number(m[1]);
  const unit = m[2];
  const mult = unit === 's' ? 1 : unit === 'm' ? 60 : unit === 'h' ? 3600 : 86400;
  return n * mult;
}

function sign(payloadObj: Record<string, unknown>, secret: string, ttlSeconds: number): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = { ...payloadObj, iat: now, exp: now + ttlSeconds };
  const encoded = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const sig = base64url(createHmac('sha256', secret).update(encoded).digest());
  return `${encoded}.${sig}`;
}

function verify<T extends object>(token: string, secret: string): T {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('JWT malformado');
  const [h, p, s] = parts as [string, string, string];
  const expected = base64url(createHmac('sha256', secret).update(`${h}.${p}`).digest());
  const a = Buffer.from(s);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error('Assinatura inválida');
  const payload = JSON.parse(base64urlDecode(p).toString('utf8')) as T & { exp?: number };
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) throw new Error('Token expirado');
  return payload;
}

export function signAccessToken(user: { id: string; role: string }, sessionId?: string): string {
  return sign(
    { sub: user.id, role: user.role, type: 'access', sid: sessionId },
    env.JWT_ACCESS_SECRET,
    parseExpiresIn(env.JWT_ACCESS_EXPIRES_IN),
  );
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const payload = verify<AccessTokenPayload>(token, env.JWT_ACCESS_SECRET);
  if (payload.type !== 'access') throw new Error('Tipo de token inválido');
  return payload;
}

export function generateRefreshToken(): string {
  return base64url(randomBytes(48));
}

export function refreshExpiresAt(): Date {
  const ttl = parseExpiresIn(env.JWT_REFRESH_EXPIRES_IN);
  return new Date(Date.now() + ttl * 1000);
}
