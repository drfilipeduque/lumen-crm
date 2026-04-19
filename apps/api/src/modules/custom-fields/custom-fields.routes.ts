import type { FastifyPluginAsync } from 'fastify';
import { authenticate, requireRole } from '../auth/auth.middleware.js';
import {
  customFieldBodySchema,
  customFieldIdParamSchema,
  reorderSchema,
} from './custom-fields.schemas.js';
import {
  CustomFieldError,
  createCustomField,
  deleteCustomField,
  getCustomField,
  listCustomFields,
  reorderCustomFields,
  updateCustomField,
} from './custom-fields.service.js';

export const customFieldsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', authenticate);
  app.addHook('preHandler', requireRole('ADMIN'));

  app.get('/', async (_req, reply) => reply.send(await listCustomFields()));

  // /reorder vem antes de /:id pra não conflitar
  app.put('/reorder', async (req, reply) => {
    const parsed = reorderSchema.safeParse(req.body);
    if (!parsed.success)
      return reply.code(400).send({ error: 'VALIDATION', issues: parsed.error.flatten() });
    try {
      return reply.send(await reorderCustomFields(parsed.data.ids));
    } catch (e) {
      if (e instanceof CustomFieldError)
        return reply.code(e.status).send({ error: e.code, message: e.message, ...e.extra });
      throw e;
    }
  });

  app.get('/:id', async (req, reply) => {
    const params = customFieldIdParamSchema.safeParse(req.params);
    if (!params.success)
      return reply.code(400).send({ error: 'VALIDATION', issues: params.error.flatten() });
    try {
      return reply.send(await getCustomField(params.data.id));
    } catch (e) {
      if (e instanceof CustomFieldError)
        return reply.code(e.status).send({ error: e.code, message: e.message, ...e.extra });
      throw e;
    }
  });

  app.post('/', async (req, reply) => {
    const parsed = customFieldBodySchema.safeParse(req.body);
    if (!parsed.success)
      return reply.code(400).send({ error: 'VALIDATION', issues: parsed.error.flatten() });
    try {
      return reply.code(201).send(await createCustomField(parsed.data));
    } catch (e) {
      if (e instanceof CustomFieldError)
        return reply.code(e.status).send({ error: e.code, message: e.message, ...e.extra });
      throw e;
    }
  });

  app.put('/:id', async (req, reply) => {
    const params = customFieldIdParamSchema.safeParse(req.params);
    if (!params.success)
      return reply.code(400).send({ error: 'VALIDATION', issues: params.error.flatten() });
    const body = customFieldBodySchema.safeParse(req.body);
    if (!body.success)
      return reply.code(400).send({ error: 'VALIDATION', issues: body.error.flatten() });
    try {
      return reply.send(await updateCustomField(params.data.id, body.data));
    } catch (e) {
      if (e instanceof CustomFieldError)
        return reply.code(e.status).send({ error: e.code, message: e.message, ...e.extra });
      throw e;
    }
  });

  app.delete('/:id', async (req, reply) => {
    const params = customFieldIdParamSchema.safeParse(req.params);
    if (!params.success)
      return reply.code(400).send({ error: 'VALIDATION', issues: params.error.flatten() });
    try {
      return reply.send(await deleteCustomField(params.data.id, false));
    } catch (e) {
      if (e instanceof CustomFieldError)
        return reply.code(e.status).send({ error: e.code, message: e.message, ...e.extra });
      throw e;
    }
  });

  app.delete('/:id/force', async (req, reply) => {
    const params = customFieldIdParamSchema.safeParse(req.params);
    if (!params.success)
      return reply.code(400).send({ error: 'VALIDATION', issues: params.error.flatten() });
    try {
      return reply.send(await deleteCustomField(params.data.id, true));
    } catch (e) {
      if (e instanceof CustomFieldError)
        return reply.code(e.status).send({ error: e.code, message: e.message, ...e.extra });
      throw e;
    }
  });
};
