import { z } from 'zod';

const FIELD_TYPES = [
  'TEXT',
  'LONG_TEXT',
  'NUMBER',
  'CURRENCY',
  'DATE',
  'SELECT',
  'MULTI_SELECT',
  'BOOLEAN',
  'URL',
] as const;

const optionSchema = z.object({
  label: z.string().trim().min(1, 'Rótulo obrigatório'),
  value: z.string().trim().min(1, 'Valor obrigatório'),
});

export const customFieldBodySchema = z
  .object({
    name: z.string().trim().min(1, 'Nome obrigatório').max(80, 'Nome muito longo'),
    type: z.enum(FIELD_TYPES, { errorMap: () => ({ message: 'Tipo inválido' }) }),
    options: z.array(optionSchema).optional(),
    required: z.boolean().default(false),
    active: z.boolean().default(true),
  })
  .refine(
    (d) => !(d.type === 'SELECT' || d.type === 'MULTI_SELECT') || (d.options && d.options.length > 0),
    {
      message: 'Campos do tipo SELECT/MULTI_SELECT exigem ao menos uma opção',
      path: ['options'],
    },
  );

export const reorderSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, 'Lista de IDs vazia'),
});

export const customFieldIdParamSchema = z.object({
  id: z.string().min(1, 'ID inválido'),
});

export type CustomFieldBodyInput = z.infer<typeof customFieldBodySchema>;
export type ReorderInput = z.infer<typeof reorderSchema>;
