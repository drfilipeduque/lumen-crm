import { z } from 'zod';

export const periodSchema = z.object({
  period: z.enum(['today', 'yesterday', 'week', 'month', 'year', 'custom']).default('month'),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const funnelQuerySchema = periodSchema.extend({
  pipelineId: z.string().optional(),
});

export const financialQuerySchema = periodSchema.extend({
  customFieldId: z.string().min(1, 'customFieldId é obrigatório'),
  operation: z.enum(['sum', 'avg', 'count']).default('sum'),
});

export type PeriodInput = z.infer<typeof periodSchema>;
export type FunnelInput = z.infer<typeof funnelQuerySchema>;
export type FinancialInput = z.infer<typeof financialQuerySchema>;
