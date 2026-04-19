import type { FastifyPluginAsync } from 'fastify';
import { authenticate, requireRole } from '../auth/auth.middleware.js';
import { tagBodySchema, tagIdParamSchema } from './tags.schemas.js';
import { TagError, createTag, deleteTag, listTags, updateTag } from './tags.service.js';

export const tagsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', authenticate);
  app.addHook('preHandler', requireRole('ADMIN'));

  app.get('/', async (_req, reply) => {
    return reply.send(await listTags());
  });

  app.post('/', async (req, reply) => {
    const parsed = tagBodySchema.safeParse(req.body);
    if (!parsed.success)
      return reply.code(400).send({ error: 'VALIDATION', issues: parsed.error.flatten() });
    try {
      return reply.code(201).send(await createTag(parsed.data));
    } catch (e) {
      if (e instanceof TagError)
        return reply.code(e.status).send({ error: e.code, message: e.message, ...e.extra });
      throw e;
    }
  });

  app.put('/:id', async (req, reply) => {
    const params = tagIdParamSchema.safeParse(req.params);
    if (!params.success)
      return reply.code(400).send({ error: 'VALIDATION', issues: params.error.flatten() });
    const body = tagBodySchema.safeParse(req.body);
    if (!body.success)
      return reply.code(400).send({ error: 'VALIDATION', issues: body.error.flatten() });
    try {
      return reply.send(await updateTag(params.data.id, body.data));
    } catch (e) {
      if (e instanceof TagError)
        return reply.code(e.status).send({ error: e.code, message: e.message, ...e.extra });
      throw e;
    }
  });

  app.delete('/:id', async (req, reply) => {
    const params = tagIdParamSchema.safeParse(req.params);
    if (!params.success)
      return reply.code(400).send({ error: 'VALIDATION', issues: params.error.flatten() });
    try {
      return reply.send(await deleteTag(params.data.id, false));
    } catch (e) {
      if (e instanceof TagError)
        return reply.code(e.status).send({ error: e.code, message: e.message, ...e.extra });
      throw e;
    }
  });

  app.delete('/:id/force', async (req, reply) => {
    const params = tagIdParamSchema.safeParse(req.params);
    if (!params.success)
      return reply.code(400).send({ error: 'VALIDATION', issues: params.error.flatten() });
    try {
      return reply.send(await deleteTag(params.data.id, true));
    } catch (e) {
      if (e instanceof TagError)
        return reply.code(e.status).send({ error: e.code, message: e.message, ...e.extra });
      throw e;
    }
  });
};
