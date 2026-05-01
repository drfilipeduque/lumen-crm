import { z } from 'zod';

const CONTENT_TYPE = z.enum(['TEXT', 'TEMPLATE', 'SCRIPT']);

export const createScheduledMessageSchema = z
  .object({
    contactId: z.string().min(1, 'Contato obrigatório'),
    opportunityId: z.string().min(1).nullable().optional(),
    connectionId: z.string().min(1, 'Conexão obrigatória'),
    scheduledAt: z
      .string()
      .refine((v) => !Number.isNaN(Date.parse(v)), 'Data de agendamento inválida'),
    contentType: CONTENT_TYPE,
    content: z.string().min(1, 'Conteúdo obrigatório'),
    templateVariables: z.record(z.string(), z.string()).optional(),
    mediaUrl: z.string().optional(),
    mediaName: z.string().optional(),
    mediaMimeType: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    const when = new Date(v.scheduledAt);
    if (when.getTime() <= Date.now() + 30_000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scheduledAt'],
        message: 'Agende ao menos 30 segundos no futuro',
      });
    }
  });

export const updateScheduledMessageSchema = z
  .object({
    scheduledAt: z
      .string()
      .refine((v) => !Number.isNaN(Date.parse(v)), 'Data inválida')
      .optional(),
    contentType: CONTENT_TYPE.optional(),
    content: z.string().min(1).optional(),
    templateVariables: z.record(z.string(), z.string()).optional(),
    mediaUrl: z.string().nullable().optional(),
    mediaName: z.string().nullable().optional(),
    mediaMimeType: z.string().nullable().optional(),
    connectionId: z.string().min(1).optional(),
  });

export const listScheduledMessagesSchema = z.object({
  contactId: z.string().optional(),
  opportunityId: z.string().optional(),
  status: z.enum(['PENDING', 'SENT', 'FAILED', 'CANCELLED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type CreateScheduledMessageInput = z.infer<typeof createScheduledMessageSchema>;
export type UpdateScheduledMessageInput = z.infer<typeof updateScheduledMessageSchema>;
