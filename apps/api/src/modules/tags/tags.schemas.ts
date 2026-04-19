import { z } from 'zod';

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

export const tagBodySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Nome obrigatório')
    .max(50, 'Nome muito longo (máx. 50)'),
  color: z
    .string()
    .trim()
    .regex(HEX_COLOR, 'Cor inválida — use hex no formato #RRGGBB'),
});

export const tagIdParamSchema = z.object({
  id: z.string().min(1, 'ID inválido'),
});

export type TagBodyInput = z.infer<typeof tagBodySchema>;
