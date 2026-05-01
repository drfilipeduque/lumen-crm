import { z } from 'zod';

const HM = /^\d{2}:\d{2}$/;

const messageSchema = z.object({
  id: z.string().min(1),
  order: z.number().int().nonnegative(),
  content: z.string().optional(),
  scriptId: z.string().optional(),
  mediaUrl: z.string().optional(),
  mediaType: z.enum(['IMAGE', 'AUDIO', 'DOCUMENT', 'VIDEO']).optional(),
  delay: z.object({
    value: z.number().int().nonnegative(),
    unit: z.enum(['seconds', 'minutes', 'hours', 'days', 'weeks']),
  }),
});

const scopeConfigSchema = z
  .object({
    pipelineId: z.string().optional(),
    stageId: z.string().optional(),
    tagIds: z.array(z.string()).optional(),
    ownerId: z.string().optional(),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
    valueMin: z.number().nonnegative().optional(),
    valueMax: z.number().nonnegative().optional(),
  })
  .partial();

export const createCadenceSchema = z
  .object({
    name: z.string().min(1, { message: 'nome obrigatório' }).max(120),
    description: z.string().max(2000).nullable().optional(),
    active: z.boolean().optional(),
    connectionId: z.string().nullable().optional(),
    scope: z.enum(['PIPELINE', 'STAGE', 'OPPORTUNITY', 'CONTACT', 'GROUP']),
    scopeConfig: scopeConfigSchema.default({}),
    pauseOnReply: z.boolean().optional(),
    respectBusinessHours: z.boolean().optional(),
    businessHoursStart: z.string().regex(HM, { message: 'formato HH:MM' }).optional(),
    businessHoursEnd: z.string().regex(HM, { message: 'formato HH:MM' }).optional(),
    businessDays: z.array(z.number().int().min(0).max(6)).optional(),
    messages: z.array(messageSchema).min(1, { message: 'pelo menos 1 mensagem' }),
  })
  .superRefine((v, ctx) => {
    // Sanity da scope config conforme escopo:
    if (v.scope === 'PIPELINE' && !v.scopeConfig.pipelineId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'pipelineId obrigatório p/ escopo PIPELINE', path: ['scopeConfig', 'pipelineId'] });
    }
    if (v.scope === 'STAGE' && (!v.scopeConfig.pipelineId || !v.scopeConfig.stageId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'pipelineId e stageId obrigatórios p/ escopo STAGE', path: ['scopeConfig'] });
    }
  });

export const updateCadenceSchema = createCadenceSchema._def.schema.partial();

export const idParamSchema = z.object({ id: z.string().min(1) });

export const listCadencesQuerySchema = z.object({
  active: z.enum(['true', 'false']).optional(),
  scope: z.enum(['PIPELINE', 'STAGE', 'OPPORTUNITY', 'CONTACT', 'GROUP']).optional(),
});

export const listExecutionsQuerySchema = z.object({
  status: z.enum(['ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED', 'FAILED']).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export const startCadenceSchema = z
  .object({
    opportunityId: z.string().optional(),
    contactId: z.string().optional(),
    opportunityIds: z.array(z.string()).optional(),
    contactIds: z.array(z.string()).optional(),
  })
  .refine(
    (v) => v.opportunityId || v.contactId || (v.opportunityIds?.length ?? 0) > 0 || (v.contactIds?.length ?? 0) > 0,
    { message: 'Informe pelo menos um alvo (opportunity ou contact)' },
  );
