import { z } from 'zod';

const SORT_FIELDS = ['name', 'phone', 'createdAt', 'updatedAt'] as const;

const dateOrEmpty = z
  .string()
  .trim()
  .refine((v) => v === '' || !Number.isNaN(Date.parse(v)), 'Data inválida')
  .optional()
  .transform((v) => (v ? v : undefined));

export const listContactsQuerySchema = z.object({
  search: z.string().trim().optional(),
  tagIds: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : v.split(',').filter(Boolean))),
  ownerId: z.string().min(1).optional(),
  hasOwner: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  createdFrom: dateOrEmpty,
  createdTo: dateOrEmpty,
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  sortBy: z.enum(SORT_FIELDS).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

const addressSchema = z
  .object({
    street: z.string().trim().max(120).optional(),
    number: z.string().trim().max(20).optional(),
    city: z.string().trim().max(80).optional(),
    state: z.string().trim().max(40).optional(),
    zip: z.string().trim().max(15).optional(),
  })
  .partial()
  .nullable()
  .optional();

export const contactBodySchema = z.object({
  name: z.string().trim().min(1, 'Nome obrigatório').max(120, 'Nome muito longo'),
  phone: z
    .string()
    .trim()
    .min(8, 'Telefone obrigatório')
    .max(40, 'Telefone muito longo'),
  email: z
    .string()
    .trim()
    .email('E-mail inválido')
    .max(160)
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  birthDate: z
    .string()
    .nullable()
    .optional()
    .refine((v) => v == null || v === '' || !Number.isNaN(Date.parse(v)), 'Data inválida')
    .transform((v) => (v && v !== '' ? new Date(v) : null)),
  cpf: z
    .string()
    .trim()
    .max(20)
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  address: addressSchema,
  notes: z.string().trim().max(2000).nullable().optional().or(z.literal('').transform(() => null)),
  ownerId: z.string().min(1).nullable().optional(),
  tagIds: z.array(z.string().min(1)).optional(),
});

export const bulkAssignSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, 'Selecione ao menos um contato'),
  ownerId: z.string().min(1).nullable(),
});

export const bulkTagSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, 'Selecione ao menos um contato'),
  tagIds: z.array(z.string().min(1)).min(1, 'Selecione ao menos uma tag'),
  mode: z.enum(['add', 'replace', 'remove']),
});

export const bulkDeleteSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, 'Selecione ao menos um contato'),
});

export const idParamSchema = z.object({ id: z.string().min(1) });

export type ListContactsInput = z.infer<typeof listContactsQuerySchema>;
export type ContactBodyInput = z.infer<typeof contactBodySchema>;
