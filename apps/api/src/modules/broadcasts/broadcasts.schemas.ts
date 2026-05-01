import { z } from 'zod';

const audienceFiltersSchema = z
  .object({
    // CONTACTS
    tagsInclude: z.array(z.string()).optional(),
    tagsExclude: z.array(z.string()).optional(),
    ownerIds: z.array(z.string()).optional(),
    hasOwner: z.boolean().nullable().optional(),
    createdFrom: z.string().optional(),
    createdTo: z.string().optional(),
    hasOpportunity: z.boolean().nullable().optional(),

    // OPPORTUNITIES
    pipelineIds: z.array(z.string()).optional(),
    stageIdsInclude: z.array(z.string()).optional(),
    stageIdsExclude: z.array(z.string()).optional(),
    status: z.enum(['ACTIVE', 'WON', 'LOST']).optional(),
    priority: z.array(z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])).optional(),
    valueMin: z.number().optional(),
    valueMax: z.number().optional(),
    dueDateFrom: z.string().optional(),
    dueDateTo: z.string().optional(),
  })
  .passthrough();

export const createBroadcastSchema = z.object({
  name: z.string().trim().min(1, 'Nome obrigatório').max(120),
  description: z.string().max(500).nullable().optional(),
  connectionId: z.string().min(1, 'Conexão obrigatória'),
  templateId: z.string().min(1, 'Template obrigatório'),
  templateVariables: z.record(z.string(), z.string()).optional(),
  audienceType: z.enum(['CONTACTS', 'OPPORTUNITIES']),
  audienceFilters: audienceFiltersSchema,
  intervalSeconds: z.number().int().min(5).max(300).default(30),
  scheduledAt: z
    .string()
    .nullable()
    .optional()
    .refine((v) => !v || !Number.isNaN(Date.parse(v)), 'Data inválida'),
  respectBusinessHours: z.boolean().optional(),
});

export const updateBroadcastSchema = createBroadcastSchema.partial();

export const previewAudienceSchema = z.object({
  audienceType: z.enum(['CONTACTS', 'OPPORTUNITIES']),
  audienceFilters: audienceFiltersSchema,
});

export const listBroadcastsSchema = z.object({
  status: z.enum(['DRAFT', 'SCHEDULED', 'SENDING', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const listRecipientsSchema = z.object({
  status: z.enum(['PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'SKIPPED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type CreateBroadcastInput = z.infer<typeof createBroadcastSchema>;
export type UpdateBroadcastInput = z.infer<typeof updateBroadcastSchema>;
export type PreviewAudienceInput = z.infer<typeof previewAudienceSchema>;
export type AudienceFilters = z.infer<typeof audienceFiltersSchema>;
