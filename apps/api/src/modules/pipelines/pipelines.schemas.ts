import { z } from 'zod';

const HEX = /^#[0-9A-Fa-f]{6}$/;

export const stageBodySchema = z.object({
  name: z.string().trim().min(1, 'Nome obrigatório').max(50, 'Nome muito longo'),
  color: z.string().trim().regex(HEX, 'Cor inválida — use #RRGGBB').default('#94a3b8'),
  isClosedWon: z.boolean().optional(),
  isClosedLost: z.boolean().optional(),
});

export const stagePatchSchema = z.object({
  name: z.string().trim().min(1, 'Nome obrigatório').max(50, 'Nome muito longo').optional(),
  color: z.string().trim().regex(HEX, 'Cor inválida — use #RRGGBB').optional(),
  isClosedWon: z.boolean().optional(),
  isClosedLost: z.boolean().optional(),
});

export const createPipelineSchema = z.object({
  name: z.string().trim().min(1, 'Nome obrigatório').max(80, 'Nome muito longo'),
  description: z.string().trim().max(500, 'Descrição muito longa').optional(),
  stages: z.array(stageBodySchema).min(2, 'Pelo menos duas etapas são necessárias'),
});

export const updatePipelineSchema = z.object({
  name: z.string().trim().min(1, 'Nome obrigatório').max(80, 'Nome muito longo').optional(),
  description: z.string().trim().max(500, 'Descrição muito longa').nullable().optional(),
  active: z.boolean().optional(),
});

export const reorderStagesSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
});

export const pipelineCustomFieldsSchema = z.array(
  z.object({
    customFieldId: z.string().min(1),
    visible: z.boolean(),
    order: z.number().int().min(0),
  }),
);

export const idParamSchema = z.object({ id: z.string().min(1) });
export const pipelineIdParamSchema = z.object({ pipelineId: z.string().min(1) });
