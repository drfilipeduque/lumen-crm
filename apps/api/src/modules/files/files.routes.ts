import { z } from 'zod';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { authenticate } from '../auth/auth.middleware.js';
import {
  FileError,
  MAX_OPPORTUNITY_FILE_BYTES,
  createFile,
  deleteFile,
  getFileForDownload,
  isAllowedMime,
  listFiles,
} from './files.service.js';

const idParam = z.object({ id: z.string().min(1) });
const oppParam = z.object({ opportunityId: z.string().min(1) });

function send(reply: FastifyReply, e: unknown) {
  if (e instanceof FileError) return reply.code(e.status).send({ error: e.code, message: e.message });
  throw e;
}

// Montado em /opportunities/:opportunityId (upload + list) e /files/:id (download/delete)
export const opportunityFilesRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', authenticate);

  app.get('/:opportunityId/files', async (req, reply) => {
    const p = oppParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    try {
      return reply.send(await listFiles(req.user!, p.data.opportunityId));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.post('/:opportunityId/files', async (req, reply) => {
    const p = oppParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });

    if (!req.isMultipart()) {
      return reply.code(400).send({ error: 'INVALID_REQUEST', message: 'Esperado multipart/form-data' });
    }
    let file;
    try {
      file = await req.file({ limits: { fileSize: MAX_OPPORTUNITY_FILE_BYTES, files: 1 } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.toLowerCase().includes('too large')) {
        return reply.code(413).send({ error: 'FILE_TOO_LARGE', message: 'Arquivo excede 20MB' });
      }
      throw e;
    }
    if (!file) return reply.code(400).send({ error: 'NO_FILE', message: 'Nenhum arquivo recebido' });
    if (!isAllowedMime(file.mimetype)) {
      return reply.code(415).send({ error: 'UNSUPPORTED_MEDIA', message: 'Tipo de arquivo não suportado' });
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

    try {
      const dto = await createFile(req.user!, p.data.opportunityId, {
        originalName: file.filename || 'arquivo',
        mimeType: file.mimetype,
        buffer,
      });
      return reply.code(201).send(dto);
    } catch (e) {
      return send(reply, e);
    }
  });
};

// Rotas diretas em /files/:id
export const filesRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', authenticate);

  app.get('/:id/download', async (req, reply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    try {
      const { file, stream } = await getFileForDownload(req.user!, p.data.id);
      return reply
        .header('content-type', file.mimeType)
        .header('content-length', String(file.size))
        .header('content-disposition', `attachment; filename="${encodeURIComponent(file.name)}"`)
        .send(stream);
    } catch (e) {
      return send(reply, e);
    }
  });

  app.delete('/:id', async (req, reply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    try {
      return reply.send(await deleteFile(req.user!, p.data.id));
    } catch (e) {
      return send(reply, e);
    }
  });
};
