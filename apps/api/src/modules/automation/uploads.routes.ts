// Upload genérico de mídia pra ações de automação (send_whatsapp_message).
// Diferente do upload de conversa, não exige um parent — salva direto em
// /uploads/automation-media/<random>/<file>. O usuário cola a URL retornada
// na config da action.

import type { FastifyPluginAsync } from 'fastify';
import { mkdir, writeFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { authenticate } from '../auth/auth.middleware.js';
import { UPLOADS_DIR } from '../../lib/uploads.js';
import {
  MAX_MESSAGE_FILE_BYTES,
  inferMessageTypeFromMime,
  isAllowedMessageMime,
  mimeToExt,
} from '../whatsapp/baileys/media.js';

const FOLDER = 'automation-media';

export const automationUploadsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', authenticate);

  app.post('/media', async (req, reply) => {
    if (!req.isMultipart()) {
      return reply.code(400).send({ error: 'INVALID_REQUEST', message: 'Esperado multipart/form-data' });
    }

    let file;
    try {
      file = await req.file({ limits: { fileSize: MAX_MESSAGE_FILE_BYTES, files: 1 } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.toLowerCase().includes('too large')) {
        return reply.code(413).send({ error: 'FILE_TOO_LARGE', message: 'Arquivo excede 20MB' });
      }
      throw e;
    }
    if (!file) return reply.code(400).send({ error: 'NO_FILE', message: 'Nenhum arquivo recebido' });
    if (!isAllowedMessageMime(file.mimetype)) {
      return reply.code(415).send({ error: 'UNSUPPORTED_MEDIA', message: 'Tipo não suportado' });
    }

    let buffer: Buffer;
    try {
      buffer = await file.toBuffer();
    } catch (e) {
      const err = e as { code?: string; message?: string };
      const tooLarge =
        err.code === 'FST_REQ_FILE_TOO_LARGE' ||
        (err.message ?? '').toLowerCase().includes('too large');
      if (tooLarge) return reply.code(413).send({ error: 'FILE_TOO_LARGE', message: 'Arquivo excede 20MB' });
      return reply.code(400).send({ error: 'INVALID_FILE', message: 'Falha ao ler arquivo' });
    }

    const safeName = (file.filename ?? '').replace(/[^\w.\-]+/g, '_').slice(0, 80);
    const ext = (safeName ? extname(safeName) : '') || mimeToExt(file.mimetype);
    const id = randomBytes(8).toString('hex');
    const bucket = randomBytes(4).toString('hex');
    const dir = resolve(UPLOADS_DIR, FOLDER, bucket);
    await mkdir(dir, { recursive: true });
    const storedName = `${id}${ext}`;
    await writeFile(resolve(dir, storedName), buffer);

    return reply.code(201).send({
      url: `/uploads/${FOLDER}/${bucket}/${storedName}`,
      name: safeName || storedName,
      mimeType: file.mimetype,
      size: buffer.byteLength,
      type: inferMessageTypeFromMime(file.mimetype),
    });
  });
};
