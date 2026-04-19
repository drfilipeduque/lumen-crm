import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import {
  changePasswordSchema,
  loginSchema,
  preferencesSchema,
  profilePatchSchema,
  refreshSchema,
} from './auth.schemas.js';
import {
  AuthError,
  changePassword,
  getMe,
  login,
  logout,
  refresh,
  setAvatar,
  updatePreferences,
  updateProfile,
} from './auth.service.js';
import { authenticate } from './auth.middleware.js';
import { UPLOADS_DIR } from '../../lib/uploads.js';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post('/login', async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'VALIDATION', issues: parsed.error.flatten() });
    }
    try {
      const result = await login(parsed.data.email, parsed.data.password, {
        userAgent: req.headers['user-agent'] ?? null,
        ipAddress: req.ip,
      });
      return reply.send(result);
    } catch (e) {
      if (e instanceof AuthError) return reply.code(e.status).send({ error: e.code, message: e.message });
      throw e;
    }
  });

  app.post('/refresh', async (req, reply) => {
    const parsed = refreshSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'VALIDATION', issues: parsed.error.flatten() });
    }
    try {
      return reply.send(await refresh(parsed.data.refreshToken));
    } catch (e) {
      if (e instanceof AuthError) return reply.code(e.status).send({ error: e.code, message: e.message });
      throw e;
    }
  });

  app.post('/logout', { preHandler: authenticate }, async (req, reply) => {
    const body = (req.body ?? {}) as { refreshToken?: string };
    if (body.refreshToken) await logout(body.refreshToken);
    return reply.send({ ok: true });
  });

  app.get('/me', { preHandler: authenticate }, async (req, reply) => {
    try {
      return reply.send(await getMe(req.user!.id));
    } catch (e) {
      if (e instanceof AuthError) return reply.code(e.status).send({ error: e.code, message: e.message });
      throw e;
    }
  });

  app.patch('/me', { preHandler: authenticate }, async (req, reply) => {
    const parsed = profilePatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'VALIDATION', issues: parsed.error.flatten() });
    }
    try {
      return reply.send(await updateProfile(req.user!.id, parsed.data));
    } catch (e) {
      if (e instanceof AuthError) return reply.code(e.status).send({ error: e.code, message: e.message });
      throw e;
    }
  });

  app.patch('/me/preferences', { preHandler: authenticate }, async (req, reply) => {
    const parsed = preferencesSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'VALIDATION', issues: parsed.error.flatten() });
    }
    try {
      return reply.send(await updatePreferences(req.user!.id, parsed.data));
    } catch (e) {
      if (e instanceof AuthError) return reply.code(e.status).send({ error: e.code, message: e.message });
      throw e;
    }
  });

  app.patch('/me/password', { preHandler: authenticate }, async (req, reply) => {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'VALIDATION', issues: parsed.error.flatten() });
    }
    try {
      return reply.send(await changePassword(req.user!.id, req.user!.sid, parsed.data));
    } catch (e) {
      if (e instanceof AuthError) return reply.code(e.status).send({ error: e.code, message: e.message });
      throw e;
    }
  });

  app.post('/me/avatar', { preHandler: authenticate }, async (req, reply) => {
    if (!req.isMultipart()) {
      return reply.code(400).send({ error: 'INVALID_REQUEST', message: 'Esperado multipart/form-data' });
    }
    let file;
    try {
      file = await req.file({ limits: { fileSize: MAX_AVATAR_BYTES, files: 1 } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('FST_REQ_FILE_TOO_LARGE') || msg.toLowerCase().includes('too large')) {
        return reply.code(413).send({ error: 'FILE_TOO_LARGE', message: 'Arquivo excede 2MB' });
      }
      throw e;
    }
    if (!file) return reply.code(400).send({ error: 'NO_FILE', message: 'Nenhum arquivo recebido' });
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return reply.code(415).send({ error: 'UNSUPPORTED_MEDIA', message: 'Use JPG, PNG ou WEBP' });
    }

    let buffer: Buffer;
    try {
      buffer = await file.toBuffer();
    } catch (e) {
      const err = e as { code?: string; name?: string; message?: string };
      const isTooLarge =
        err.code === 'FST_REQ_FILE_TOO_LARGE' ||
        err.name === 'RequestFileTooLargeError' ||
        (err.message ?? '').toLowerCase().includes('too large');
      if (isTooLarge) {
        return reply.code(413).send({ error: 'FILE_TOO_LARGE', message: 'Arquivo excede 2MB' });
      }
      return reply.code(400).send({ error: 'INVALID_FILE', message: 'Falha ao ler arquivo' });
    }
    if (buffer.byteLength > MAX_AVATAR_BYTES) {
      return reply.code(413).send({ error: 'FILE_TOO_LARGE', message: 'Arquivo excede 2MB' });
    }

    const ext = EXT_BY_MIME[file.mimetype] ?? (extname(file.filename) || '.bin');
    const name = `${req.user!.id}-${randomBytes(6).toString('hex')}${ext}`;
    const dir = resolve(UPLOADS_DIR, 'avatars');
    await mkdir(dir, { recursive: true });
    await writeFile(resolve(dir, name), buffer);

    const url = `/uploads/avatars/${name}`;
    try {
      return reply.send(await setAvatar(req.user!.id, url));
    } catch (e) {
      if (e instanceof AuthError) return reply.code(e.status).send({ error: e.code, message: e.message });
      throw e;
    }
  });
};
