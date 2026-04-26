import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { authenticate } from '../auth/auth.middleware.js';
import {
  ScriptError,
  MAX_SCRIPT_MEDIA_BYTES,
  createFolder,
  createScript,
  deleteFolder,
  deleteScript,
  duplicateScript,
  getScript,
  listFolders,
  listScripts,
  removeScriptMedia,
  renderScriptById,
  reorderFolders,
  updateFolder,
  updateScript,
  uploadScriptMedia,
} from './scripts.service.js';
import {
  folderBodySchema,
  folderIdParam,
  folderReorderSchema,
  listScriptsQuery,
  renderScriptBody,
  scriptBodySchema,
  scriptIdParam,
} from './scripts.schemas.js';
import { VARIABLES } from './render.js';

function send(reply: FastifyReply, e: unknown) {
  if (e instanceof ScriptError)
    return reply.code(e.status).send({ error: e.code, message: e.message });
  throw e;
}

export const scriptsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', authenticate);

  app.get('/variables', async (_req, reply) => reply.send(VARIABLES));

  app.get('/', async (req, reply) => {
    const q = listScriptsQuery.safeParse(req.query);
    if (!q.success)
      return reply.code(400).send({ error: 'VALIDATION', issues: q.error.flatten() });
    return reply.send(await listScripts(q.data));
  });

  app.get('/:id', async (req, reply) => {
    const p = scriptIdParam.safeParse(req.params);
    if (!p.success)
      return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    try {
      return reply.send(await getScript(p.data.id));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.post('/', async (req, reply) => {
    const body = scriptBodySchema.safeParse(req.body);
    if (!body.success)
      return reply.code(400).send({ error: 'VALIDATION', issues: body.error.flatten() });
    try {
      return reply.code(201).send(await createScript(body.data));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.put('/:id', async (req, reply) => {
    const p = scriptIdParam.safeParse(req.params);
    if (!p.success)
      return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    const body = scriptBodySchema.safeParse(req.body);
    if (!body.success)
      return reply.code(400).send({ error: 'VALIDATION', issues: body.error.flatten() });
    try {
      return reply.send(await updateScript(p.data.id, body.data));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.delete('/:id', async (req, reply) => {
    const p = scriptIdParam.safeParse(req.params);
    if (!p.success)
      return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    try {
      return reply.send(await deleteScript(p.data.id));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.post('/:id/duplicate', async (req, reply) => {
    const p = scriptIdParam.safeParse(req.params);
    if (!p.success)
      return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    try {
      return reply.code(201).send(await duplicateScript(p.data.id));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.post('/:id/render', async (req, reply) => {
    const p = scriptIdParam.safeParse(req.params);
    if (!p.success)
      return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    const body = renderScriptBody.safeParse(req.body ?? {});
    if (!body.success)
      return reply.code(400).send({ error: 'VALIDATION', issues: body.error.flatten() });
    try {
      return reply.send(await renderScriptById(p.data.id, body.data, req.user!));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.post('/:id/media', async (req, reply) => {
    const p = scriptIdParam.safeParse(req.params);
    if (!p.success)
      return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    if (!req.isMultipart())
      return reply.code(400).send({ error: 'INVALID_REQUEST', message: 'Esperado multipart/form-data' });

    let file;
    try {
      file = await req.file({ limits: { fileSize: MAX_SCRIPT_MEDIA_BYTES, files: 1 } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.toLowerCase().includes('too large'))
        return reply.code(413).send({ error: 'FILE_TOO_LARGE', message: 'Arquivo excede 20MB' });
      throw e;
    }
    if (!file) return reply.code(400).send({ error: 'NO_FILE', message: 'Nenhum arquivo recebido' });

    let buffer: Buffer;
    try {
      buffer = await file.toBuffer();
    } catch (e) {
      const err = e as { code?: string; message?: string };
      const tooLarge =
        err.code === 'FST_REQ_FILE_TOO_LARGE' ||
        (err.message ?? '').toLowerCase().includes('too large');
      if (tooLarge)
        return reply.code(413).send({ error: 'FILE_TOO_LARGE', message: 'Arquivo excede 20MB' });
      return reply.code(400).send({ error: 'INVALID_FILE', message: 'Falha ao ler arquivo' });
    }

    try {
      const dto = await uploadScriptMedia(p.data.id, {
        originalName: file.filename || 'arquivo',
        mimeType: file.mimetype,
        buffer,
      });
      return reply.code(201).send(dto);
    } catch (e) {
      return send(reply, e);
    }
  });

  app.delete('/:id/media', async (req, reply) => {
    const p = scriptIdParam.safeParse(req.params);
    if (!p.success)
      return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    try {
      return reply.send(await removeScriptMedia(p.data.id));
    } catch (e) {
      return send(reply, e);
    }
  });
};

export const scriptFoldersRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', authenticate);

  app.get('/', async (_req, reply) => reply.send(await listFolders()));

  app.post('/', async (req, reply) => {
    const body = folderBodySchema.safeParse(req.body);
    if (!body.success)
      return reply.code(400).send({ error: 'VALIDATION', issues: body.error.flatten() });
    try {
      return reply.code(201).send(await createFolder(body.data));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.put('/reorder', async (req, reply) => {
    const body = folderReorderSchema.safeParse(req.body);
    if (!body.success)
      return reply.code(400).send({ error: 'VALIDATION', issues: body.error.flatten() });
    try {
      return reply.send(await reorderFolders(body.data.ids));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.put('/:id', async (req, reply) => {
    const p = folderIdParam.safeParse(req.params);
    if (!p.success)
      return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    const body = folderBodySchema.safeParse(req.body);
    if (!body.success)
      return reply.code(400).send({ error: 'VALIDATION', issues: body.error.flatten() });
    try {
      return reply.send(await updateFolder(p.data.id, body.data));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.delete('/:id', async (req, reply) => {
    const p = folderIdParam.safeParse(req.params);
    if (!p.success)
      return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    try {
      return reply.send(await deleteFolder(p.data.id));
    } catch (e) {
      return send(reply, e);
    }
  });
};
