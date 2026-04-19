import type { FastifyPluginAsync } from 'fastify';
import { authenticate, requireRole } from '../auth/auth.middleware.js';
import {
  createPipelineSchema,
  idParamSchema,
  pipelineCustomFieldsSchema,
  pipelineIdParamSchema,
  reorderStagesSchema,
  stageBodySchema,
  stagePatchSchema,
  updatePipelineSchema,
} from './pipelines.schemas.js';
import {
  PipelineError,
  createPipeline,
  createStage,
  deletePipeline,
  deleteStage,
  getPipeline,
  listPipelines,
  reorderStages,
  setPipelineCustomFields,
  updatePipeline,
  updateStage,
} from './pipelines.service.js';

function send(reply: import('fastify').FastifyReply, e: unknown) {
  if (e instanceof PipelineError)
    return reply.code(e.status).send({ error: e.code, message: e.message, ...e.extra });
  throw e;
}

export const pipelinesRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', authenticate);
  app.addHook('preHandler', requireRole('ADMIN'));

  app.get('/', async (_req, reply) => reply.send(await listPipelines()));

  app.get('/:id', async (req, reply) => {
    const params = idParamSchema.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: 'VALIDATION', issues: params.error.flatten() });
    try {
      return reply.send(await getPipeline(params.data.id));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.post('/', async (req, reply) => {
    const body = createPipelineSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'VALIDATION', issues: body.error.flatten() });
    try {
      return reply.code(201).send(await createPipeline(body.data));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.put('/:id', async (req, reply) => {
    const params = idParamSchema.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: 'VALIDATION', issues: params.error.flatten() });
    const body = updatePipelineSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'VALIDATION', issues: body.error.flatten() });
    try {
      return reply.send(await updatePipeline(params.data.id, body.data));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.delete('/:id', async (req, reply) => {
    const params = idParamSchema.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: 'VALIDATION', issues: params.error.flatten() });
    try {
      return reply.send(await deletePipeline(params.data.id, false));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.delete('/:id/force', async (req, reply) => {
    const params = idParamSchema.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: 'VALIDATION', issues: params.error.flatten() });
    try {
      return reply.send(await deletePipeline(params.data.id, true));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.put('/:id/stages/reorder', async (req, reply) => {
    const params = idParamSchema.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: 'VALIDATION', issues: params.error.flatten() });
    const body = reorderStagesSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'VALIDATION', issues: body.error.flatten() });
    try {
      return reply.send(await reorderStages(params.data.id, body.data.ids));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.put('/:id/custom-fields', async (req, reply) => {
    const params = idParamSchema.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: 'VALIDATION', issues: params.error.flatten() });
    const body = pipelineCustomFieldsSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'VALIDATION', issues: body.error.flatten() });
    try {
      return reply.send(await setPipelineCustomFields(params.data.id, body.data));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.post('/:pipelineId/stages', async (req, reply) => {
    const params = pipelineIdParamSchema.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: 'VALIDATION', issues: params.error.flatten() });
    const body = stageBodySchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'VALIDATION', issues: body.error.flatten() });
    try {
      return reply.code(201).send(await createStage(params.data.pipelineId, body.data));
    } catch (e) {
      return send(reply, e);
    }
  });
};

// Rotas de stage no nível raiz (PUT/DELETE /stages/:id)
export const stagesRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', authenticate);
  app.addHook('preHandler', requireRole('ADMIN'));

  app.put('/:id', async (req, reply) => {
    const params = idParamSchema.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: 'VALIDATION', issues: params.error.flatten() });
    const body = stagePatchSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'VALIDATION', issues: body.error.flatten() });
    try {
      return reply.send(await updateStage(params.data.id, body.data));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.delete('/:id', async (req, reply) => {
    const params = idParamSchema.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: 'VALIDATION', issues: params.error.flatten() });
    try {
      return reply.send(await deleteStage(params.data.id, false));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.delete('/:id/force', async (req, reply) => {
    const params = idParamSchema.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: 'VALIDATION', issues: params.error.flatten() });
    try {
      return reply.send(await deleteStage(params.data.id, true));
    } catch (e) {
      return send(reply, e);
    }
  });
};
