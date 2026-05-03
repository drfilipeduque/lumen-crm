import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { authenticate } from '../auth/auth.middleware.js';
import {
  boardQuerySchema,
  createOpportunitySchema,
  idParamSchema,
  moveSchema,
  pipelineParamSchema,
  reorderSchema,
  transferSchema,
  updateOpportunitySchema,
} from './opportunities.schemas.js';
import { z } from 'zod';
import {
  OpportunityError,
  createOpportunity,
  deleteOpportunity,
  exportOpportunitiesCsv,
  getBoard,
  getOpportunity,
  listHistory,
  moveOpportunity,
  reorderOpportunity,
  searchOpportunities,
  setDescription,
  setOpportunityCustomFields,
  setTags,
  transferOpportunity,
  updateOpportunity,
  type HistoryFilter,
} from './opportunities.service.js';

function send(reply: FastifyReply, e: unknown) {
  if (e instanceof OpportunityError)
    return reply.code(e.status).send({ error: e.code, message: e.message, ...e.extra });
  throw e;
}

// Rotas plugadas em dois prefixos:
//   /pipelines/:pipelineId/board (board endpoint)
//   /opportunities/* (CRUD)
// Mas pra simplificar, registro tudo aqui e adiciono as duas rotas com paths absolutos.

export const opportunitiesRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', authenticate);

  // Busca cross-pipeline por título ou nome do contato (usado pelo DryRun
  // do flow builder pra escolher uma oportunidade pra simular).
  app.get('/search', async (req, reply) => {
    const query = z
      .object({ q: z.string().optional(), limit: z.coerce.number().int().positive().max(50).optional() })
      .safeParse(req.query);
    if (!query.success) return reply.code(400).send({ error: 'VALIDATION', issues: query.error.flatten() });
    return reply.send(await searchOpportunities(req.user!, query.data.q ?? '', query.data.limit ?? 20));
  });

  // CRUD principal montado em /opportunities
  app.get('/:id', async (req, reply) => {
    const params = idParamSchema.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: 'VALIDATION', issues: params.error.flatten() });
    try {
      return reply.send(await getOpportunity(req.user!, params.data.id));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.post('/', async (req, reply) => {
    const body = createOpportunitySchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'VALIDATION', issues: body.error.flatten() });
    try {
      return reply.code(201).send(await createOpportunity(req.user!, body.data));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.put('/:id', async (req, reply) => {
    const params = idParamSchema.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: 'VALIDATION', issues: params.error.flatten() });
    const body = updateOpportunitySchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'VALIDATION', issues: body.error.flatten() });
    try {
      return reply.send(await updateOpportunity(req.user!, params.data.id, body.data));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.put('/:id/move', async (req, reply) => {
    const params = idParamSchema.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: 'VALIDATION', issues: params.error.flatten() });
    const body = moveSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'VALIDATION', issues: body.error.flatten() });
    try {
      return reply.send(await moveOpportunity(req.user!, params.data.id, body.data.toStageId, body.data.order));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.put('/:id/transfer', async (req, reply) => {
    const params = idParamSchema.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: 'VALIDATION', issues: params.error.flatten() });
    const body = transferSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'VALIDATION', issues: body.error.flatten() });
    try {
      return reply.send(await transferOpportunity(req.user!, params.data.id, body.data));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.put('/:id/reorder', async (req, reply) => {
    const params = idParamSchema.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: 'VALIDATION', issues: params.error.flatten() });
    const body = reorderSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'VALIDATION', issues: body.error.flatten() });
    try {
      return reply.send(await reorderOpportunity(req.user!, params.data.id, body.data.order));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.delete('/:id', async (req, reply) => {
    const params = idParamSchema.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: 'VALIDATION', issues: params.error.flatten() });
    try {
      return reply.send(await deleteOpportunity(req.user!, params.data.id));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.get('/:id/history', async (req, reply) => {
    const params = idParamSchema.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: 'VALIDATION', issues: params.error.flatten() });
    const query = z
      .object({
        type: z
          .enum(['ALL', 'STAGE_CHANGED', 'FIELD_UPDATED', 'TAG', 'OWNER', 'REMINDER', 'FILE', 'DESCRIPTION', 'TRANSFER'])
          .default('ALL'),
      })
      .safeParse(req.query);
    if (!query.success) return reply.code(400).send({ error: 'VALIDATION', issues: query.error.flatten() });
    try {
      return reply.send(await listHistory(req.user!, params.data.id, query.data.type as HistoryFilter));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.put('/:id/description', async (req, reply) => {
    const params = idParamSchema.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: 'VALIDATION', issues: params.error.flatten() });
    const body = z
      .object({
        description: z.string().max(10_000, 'Descrição muito longa').nullable().optional(),
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'VALIDATION', issues: body.error.flatten() });
    try {
      return reply.send(await setDescription(req.user!, params.data.id, body.data.description ?? null));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.put('/:id/tags', async (req, reply) => {
    const params = idParamSchema.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: 'VALIDATION', issues: params.error.flatten() });
    const body = z.object({ tagIds: z.array(z.string().min(1)) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'VALIDATION', issues: body.error.flatten() });
    try {
      return reply.send(await setTags(req.user!, params.data.id, body.data.tagIds));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.put('/:id/custom-fields', async (req, reply) => {
    const params = idParamSchema.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: 'VALIDATION', issues: params.error.flatten() });
    const body = z
      .array(
        z.object({
          customFieldId: z.string().min(1),
          value: z.string(),
        }),
      )
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'VALIDATION', issues: body.error.flatten() });
    try {
      return reply.send(await setOpportunityCustomFields(req.user!, params.data.id, body.data));
    } catch (e) {
      return send(reply, e);
    }
  });
};

// Endpoints de board / export agrupados por pipeline. Plugado em /pipelines.
export const opportunityBoardRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', authenticate);

  app.get('/:pipelineId/board', async (req, reply) => {
    const params = pipelineParamSchema.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: 'VALIDATION', issues: params.error.flatten() });
    const query = boardQuerySchema.safeParse(req.query);
    if (!query.success) return reply.code(400).send({ error: 'VALIDATION', issues: query.error.flatten() });
    try {
      return reply.send(await getBoard(req.user!, params.data.pipelineId, query.data));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.get('/:pipelineId/opportunities/export', async (req, reply) => {
    const params = pipelineParamSchema.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: 'VALIDATION', issues: params.error.flatten() });
    const query = boardQuerySchema.safeParse(req.query);
    if (!query.success) return reply.code(400).send({ error: 'VALIDATION', issues: query.error.flatten() });
    try {
      const csv = await exportOpportunitiesCsv(req.user!, params.data.pipelineId, query.data);
      const filename = `oportunidades-${new Date().toISOString().slice(0, 10)}.csv`;
      return reply
        .header('content-type', 'text/csv; charset=utf-8')
        .header('content-disposition', `attachment; filename="${filename}"`)
        .send(csv);
    } catch (e) {
      return send(reply, e);
    }
  });
};
