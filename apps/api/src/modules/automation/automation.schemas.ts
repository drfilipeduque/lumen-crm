import { z } from 'zod';
import { VALID_TRIGGER_SUBTYPES } from './engine/trigger-matcher.js';

const flowNodeSchema = z.object({
  id: z.string().min(1, { message: 'id obrigatório' }),
  type: z.enum(['trigger', 'condition', 'action']),
  subtype: z.string().min(1, { message: 'subtype obrigatório' }),
  config: z.record(z.string(), z.unknown()).optional(),
  position: z
    .object({ x: z.number(), y: z.number() })
    .optional(),
});

const flowEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  branch: z.enum(['true', 'false']).optional(),
});

export const flowSchema = z
  .object({
    nodes: z.array(flowNodeSchema).min(1, { message: 'flow precisa de pelo menos 1 nó' }),
    edges: z.array(flowEdgeSchema).default([]),
  })
  .superRefine((flow, ctx) => {
    const triggers = flow.nodes.filter((n) => n.type === 'trigger');
    if (triggers.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'fluxo precisa de exatamente 1 nó de trigger' });
    }
    const trig = triggers[0];
    if (trig && !VALID_TRIGGER_SUBTYPES.includes(trig.subtype)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `trigger inválido: ${trig.subtype}` });
    }
    // Edges precisam apontar pra nodes existentes.
    const ids = new Set(flow.nodes.map((n) => n.id));
    for (const e of flow.edges) {
      if (!ids.has(e.from)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `edge.from desconhecido: ${e.from}` });
      if (!ids.has(e.to)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `edge.to desconhecido: ${e.to}` });
    }
  });

export const createAutomationSchema = z.object({
  name: z.string().min(1, { message: 'nome obrigatório' }).max(120),
  active: z.boolean().optional(),
  flow: flowSchema,
});

export const updateAutomationSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  active: z.boolean().optional(),
  flow: flowSchema.optional(),
});

export const idParamSchema = z.object({ id: z.string().min(1) });

export const testAutomationSchema = z.object({
  // Evento sintético opcional (pra dry-run com IDs reais).
  event: z
    .object({
      type: z.string(),
      data: z.record(z.string(), z.unknown()).default({}),
    })
    .optional(),
});
