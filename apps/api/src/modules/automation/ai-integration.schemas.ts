import { z } from 'zod';
import { CLAUDE_MODELS } from './ai/providers/claude.provider.js';
import { OPENAI_MODELS } from './ai/providers/openai.provider.js';

const allowedModels = new Set<string>([...CLAUDE_MODELS, ...OPENAI_MODELS]);

export const createAIIntegrationSchema = z
  .object({
    name: z.string().min(1, { message: 'nome obrigatório' }).max(120),
    provider: z.enum(['CLAUDE', 'OPENAI']),
    apiKey: z.string().min(8, { message: 'API key muito curta' }),
    defaultModel: z.string().optional(),
    active: z.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.defaultModel && !allowedModels.has(v.defaultModel)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `modelo desconhecido: ${v.defaultModel}`,
        path: ['defaultModel'],
      });
    }
  });

export const updateAIIntegrationSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  defaultModel: z.string().optional(),
  active: z.boolean().optional(),
});

export const rotateKeySchema = z.object({
  apiKey: z.string().min(8, { message: 'API key muito curta' }),
});

export const testIntegrationSchema = z.object({
  prompt: z.string().min(1).optional(),
});

export const idParamSchema = z.object({ id: z.string().min(1) });

// Versão pré-save: apenas valida shape básico (provider+apiKey+model).
export const testKeySchema = z
  .object({
    provider: z.enum(['CLAUDE', 'OPENAI']),
    apiKey: z.string().min(8),
    model: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.model && !allowedModels.has(v.model)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `modelo desconhecido: ${v.model}`, path: ['model'] });
    }
  });
