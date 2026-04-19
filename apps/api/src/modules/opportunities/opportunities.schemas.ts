import { z } from 'zod';

const PRIORITY = z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT'], {
  errorMap: () => ({ message: 'Prioridade inválida' }),
});

const dateOrEmpty = z
  .string()
  .trim()
  .refine((v) => v === '' || !Number.isNaN(Date.parse(v)), 'Data inválida')
  .optional()
  .transform((v) => (v ? v : undefined));

export const boardQuerySchema = z.object({
  search: z.string().trim().optional(),
  tagIds: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : v.split(',').filter(Boolean))),
  ownerId: z.string().min(1).optional(),
  priority: PRIORITY.optional(),
  dueFrom: dateOrEmpty,
  dueTo: dateOrEmpty,
});

export const customFieldsRecordSchema = z.record(z.string(), z.string());

export const createOpportunitySchema = z.object({
  title: z.string().trim().min(1, 'Título obrigatório').max(160, 'Título muito longo'),
  contactId: z.string().min(1, 'Contato obrigatório'),
  pipelineId: z.string().min(1, 'Funil obrigatório'),
  stageId: z.string().min(1, 'Etapa obrigatória'),
  value: z.coerce.number().min(0, 'Valor não pode ser negativo').default(0),
  priority: PRIORITY.default('MEDIUM'),
  description: z.string().trim().max(2000).nullable().optional().or(z.literal('').transform(() => null)),
  dueDate: z
    .string()
    .nullable()
    .optional()
    .refine((v) => v == null || v === '' || !Number.isNaN(Date.parse(v)), 'Data inválida')
    .transform((v) => (v && v !== '' ? new Date(v) : null)),
  ownerId: z.string().min(1).nullable().optional(),
  tagIds: z.array(z.string().min(1)).optional(),
  customFields: customFieldsRecordSchema.optional(),
});

export const updateOpportunitySchema = createOpportunitySchema.partial().extend({
  // pipelineId não é alterável após criação
  pipelineId: z.never().optional(),
});

export const moveSchema = z.object({
  toStageId: z.string().min(1, 'Etapa de destino obrigatória'),
  order: z.coerce.number().int().min(0, 'Ordem inválida'),
});

export const reorderSchema = z.object({
  order: z.coerce.number().int().min(0, 'Ordem inválida'),
});

export const idParamSchema = z.object({ id: z.string().min(1) });
export const pipelineParamSchema = z.object({ pipelineId: z.string().min(1) });

export type BoardQueryInput = z.infer<typeof boardQuerySchema>;
export type CreateOpportunityInput = z.infer<typeof createOpportunitySchema>;
export type UpdateOpportunityInput = z.infer<typeof updateOpportunitySchema>;
