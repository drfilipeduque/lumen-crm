// Valida o grafo de um Flow ANTES de salvar.
//
// Regras:
//   - exatamente 1 nó de trigger
//   - todos os nós (exceto trigger) precisam ser alcançáveis a partir do trigger
//   - trigger não tem entradas (edge.to nunca aponta pro trigger)
//   - sem ciclos
//   - configs por subtype validados (Zod)
//
// Erros são retornados estruturados pra UI marcar nodes inválidos:
//   [{ nodeId?: string, code: string, message: string }]

import { z } from 'zod';
import { TRIGGER_TO_EVENT, VALID_TRIGGER_SUBTYPES } from './trigger-matcher.js';
import type { Flow, FlowNode, FlowEdge } from './flow-runner.js';

export type FlowValidationError = {
  nodeId?: string;
  code: string;
  message: string;
};

// ============================================================================
// Zod schemas por subtype (configs).
// Valores opcionais são tolerados (UI pode salvar parcialmente em rascunho),
// mas a UI também roda validate antes de ativar.
// ============================================================================

const triggerConfigSchemas: Record<string, z.ZodTypeAny> = {
  opportunity_created: z
    .object({
      pipelineId: z.string().optional(),
      stageId: z.string().optional(),
    })
    .passthrough(),
  opportunity_stage_changed: z
    .object({
      pipelineId: z.string().optional(),
      fromStageId: z.string().optional(),
      toStageId: z.string().optional(),
    })
    .passthrough(),
  opportunity_stale_in_stage: z
    .object({
      pipelineId: z.string().optional(),
      stageId: z.string().optional(),
      minutes: z.number().int().nonnegative().optional(),
      hours: z.number().int().nonnegative().optional(),
      days: z.number().int().nonnegative().optional(),
    })
    .passthrough(),
  opportunity_inactive: z
    .object({
      pipelineId: z.string().optional(),
      stageId: z.string().optional(),
      minutes: z.number().int().nonnegative().optional(),
      hours: z.number().int().nonnegative().optional(),
      days: z.number().int().nonnegative().optional(),
    })
    .passthrough(),
  tag_added: z.object({ tagId: z.string().optional() }).passthrough(),
  tag_removed: z.object({ tagId: z.string().optional() }).passthrough(),
  custom_field_changed: z.object({ customFieldId: z.string().optional() }).passthrough(),
  owner_changed: z
    .object({
      pipelineId: z.string().optional(),
      stageId: z.string().optional(),
    })
    .passthrough(),
  due_date_approaching: z
    .object({
      pipelineId: z.string().optional(),
      stageId: z.string().optional(),
      withinHours: z.number().positive(),
    })
    .passthrough(),
  message_received: z
    .object({
      connectionId: z.string().optional(),
      connectionType: z.enum(['OFFICIAL', 'UNOFFICIAL']).optional(),
    })
    .passthrough(),
  message_sent: z
    .object({
      connectionId: z.string().optional(),
      connectionType: z.enum(['OFFICIAL', 'UNOFFICIAL']).optional(),
    })
    .passthrough(),
  keyword_detected: z
    .object({
      keywords: z.array(z.string()).min(1, { message: 'Defina pelo menos 1 palavra-chave' }),
      matchType: z.enum(['any', 'all']).optional(),
    })
    .passthrough(),
  opportunity_won: z
    .object({
      pipelineId: z.string().optional(),
      stageId: z.string().optional(),
    })
    .passthrough(),
  opportunity_lost: z
    .object({
      pipelineId: z.string().optional(),
      stageId: z.string().optional(),
    })
    .passthrough(),
  scheduled: z
    .object({
      hour: z.number().int().min(0).max(23),
      minute: z.number().int().min(0).max(59),
      dayOfWeek: z.number().int().min(0).max(6).optional(),
    })
    .passthrough(),
  webhook_received: z.object({ webhookId: z.string().optional() }).passthrough(),
  opportunity_transferred: z
    .object({
      fromPipelineId: z.string().optional(),
      toPipelineId: z.string().optional(),
      fromStageId: z.string().optional(),
      toStageId: z.string().optional(),
    })
    .passthrough(),
  message_unanswered: z
    .object({
      hours: z.number().positive({ message: 'Horas deve ser positivo' }),
      direction: z.enum(['CLIENT_WAITING', 'US_WAITING']),
      connectionId: z.string().optional(),
      connectionType: z.enum(['OFFICIAL', 'UNOFFICIAL']).optional(),
    })
    .passthrough(),
  conversation_resolved: z.object({}).passthrough(),
};

const conditionConfigSchemas: Record<string, z.ZodTypeAny> = {
  pipeline_equals: z.object({ pipelineId: z.string().min(1) }).passthrough(),
  stage_equals: z.object({ stageId: z.string().min(1) }).passthrough(),
  tag_equals: z.object({ tagId: z.string().min(1) }).passthrough(),
  tag_includes_any: z.object({ tagIds: z.array(z.string()).min(1) }).passthrough(),
  tag_includes_all: z.object({ tagIds: z.array(z.string()).min(1) }).passthrough(),
  owner_equals: z.object({ ownerId: z.string().min(1) }).passthrough(),
  priority_equals: z.object({ priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']) }).passthrough(),
  value_gt: z.object({ value: z.number() }).passthrough(),
  value_lt: z.object({ value: z.number() }).passthrough(),
  value_between: z.object({ min: z.number(), max: z.number() }).passthrough(),
  business_hours: z.object({}).passthrough(),
  day_of_week: z.object({ days: z.array(z.number().min(0).max(6)).min(1) }).passthrough(),
  custom_field_equals: z.object({ fieldName: z.string().min(1), value: z.string() }).passthrough(),
  custom_field_contains: z.object({ fieldName: z.string().min(1), value: z.string() }).passthrough(),
  has_active_reminder: z.object({}).passthrough(),
  days_since_creation_gt: z.object({ days: z.number().nonnegative() }).passthrough(),
  and: z.object({ children: z.array(z.unknown()) }).passthrough(),
  or: z.object({ children: z.array(z.unknown()) }).passthrough(),
  not: z.object({ children: z.array(z.unknown()).max(1) }).passthrough(),
};

const actionConfigSchemas: Record<string, z.ZodTypeAny> = {
  send_whatsapp_message: z
    .object({
      conversationId: z.string().optional(),
      text: z.string().optional(),
      scriptId: z.string().optional(),
      mediaUrl: z.string().optional(),
      connectionStrategy: z.enum(['DEFAULT', 'SPECIFIC', 'TYPE_PREFERRED']).optional(),
      connectionId: z.string().optional(),
      preferredType: z.enum(['OFFICIAL', 'UNOFFICIAL']).optional(),
      fallback: z
        .object({
          enabled: z.boolean().optional(),
          useTemplate: z.boolean().optional(),
          templateId: z.string().optional(),
          templateVariables: z.record(z.string(), z.string()).optional(),
          fallbackToOtherConnection: z.boolean().optional(),
        })
        .passthrough()
        .optional(),
    })
    .refine((v) => v.text || v.scriptId || v.mediaUrl, {
      message: 'Defina texto, script ou mídia',
    })
    .or(z.object({ text: z.string() }).passthrough()),
  send_whatsapp_template: z
    .object({
      templateId: z.string().min(1),
      conversationId: z.string().optional(),
      connectionStrategy: z.enum(['DEFAULT', 'SPECIFIC', 'TYPE_PREFERRED']).optional(),
      connectionId: z.string().optional(),
      preferredType: z.enum(['OFFICIAL', 'UNOFFICIAL']).optional(),
      variables: z.record(z.string(), z.string()).optional(),
    })
    .passthrough(),
  resolve_conversation: z
    .object({
      conversationId: z.string().optional(),
      sendFinalMessage: z.boolean().optional(),
      finalMessageContent: z.string().optional(),
    })
    .passthrough(),
  transfer_to_pipeline: z
    .object({
      targetPipelineId: z.string().min(1, 'Funil destino obrigatório'),
      targetStageId: z.string().min(1, 'Etapa destino obrigatória'),
      customFieldStrategy: z.enum(['KEEP_COMPATIBLE', 'DISCARD_ALL', 'MAP']).optional(),
      fieldMapping: z
        .array(z.object({ fromCustomFieldId: z.string(), toCustomFieldId: z.string() }))
        .optional(),
      keepHistory: z.boolean().optional(),
      keepTags: z.boolean().optional(),
      keepReminders: z.boolean().optional(),
      keepFiles: z.boolean().optional(),
    })
    .passthrough(),
  start_cadence: z
    .object({
      cadenceId: z.string().min(1, 'Cadência obrigatória'),
      target: z.enum(['opportunity', 'contact']).optional(),
    })
    .passthrough(),
  pause_cadence: z
    .object({
      cadenceId: z.string().optional(),
      reason: z.string().optional(),
    })
    .passthrough(),
  cancel_cadence: z
    .object({
      cadenceId: z.string().optional(),
    })
    .passthrough(),
  move_stage: z.object({ stageId: z.string().min(1) }).passthrough(),
  add_tag: z.object({ tagId: z.string().min(1) }).passthrough(),
  remove_tag: z.object({ tagId: z.string().min(1) }).passthrough(),
  assign_owner: z.object({ ownerId: z.string().min(1) }).passthrough(),
  transfer_owner: z.object({ ownerId: z.string().min(1) }).passthrough(),
  unassign_owner: z.object({}).passthrough(),
  create_reminder: z
    .object({
      title: z.string().min(1),
      userId: z.string().optional(),
      dueInMinutes: z.number().int().positive().optional(),
      dueAt: z.string().optional(),
    })
    .passthrough(),
  change_priority: z.object({ priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']) }).passthrough(),
  update_custom_field: z.object({ fieldId: z.string().min(1), value: z.unknown() }).passthrough(),
  create_opportunity: z
    .object({
      pipelineId: z.string().min(1),
      stageId: z.string().min(1),
      contactId: z.string().optional(),
      title: z.string().optional(),
      value: z.number().optional(),
      priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
    })
    .passthrough(),
  create_note: z.object({ text: z.string().min(1) }).passthrough(),
  send_webhook: z
    .object({
      url: z.string().url(),
      method: z.string().optional(),
      headers: z.record(z.string(), z.string()).optional(),
      body: z.unknown().optional(),
    })
    .passthrough(),
  wait: z
    .object({
      minutes: z.number().int().nonnegative().optional(),
      hours: z.number().int().nonnegative().optional(),
      days: z.number().int().nonnegative().optional(),
    })
    .refine(
      (v) => (v.minutes ?? 0) + (v.hours ?? 0) + (v.days ?? 0) > 0,
      { message: 'Defina pelo menos uma duração maior que zero' },
    ),
  notify_user: z.object({ userId: z.string().min(1) }).passthrough(),
  ai_generate: z
    .object({
      integrationId: z.string().min(1),
      prompt: z.string().min(1),
      outputVar: z.string().min(1),
      model: z.string().optional(),
      temperature: z.number().min(0).max(2).optional(),
      maxTokens: z.number().int().positive().optional(),
    })
    .passthrough(),
  ai_classify: z
    .object({
      integrationId: z.string().min(1),
      input: z.string().min(1),
      categories: z.array(z.string()).min(2),
      outputVar: z.string().min(1),
    })
    .passthrough(),
  ai_summarize: z
    .object({
      integrationId: z.string().min(1),
      input: z.string().min(1),
      outputVar: z.string().min(1),
      maxLength: z.number().int().positive().optional(),
    })
    .passthrough(),
  ai_extract: z
    .object({
      integrationId: z.string().min(1),
      input: z.string().min(1),
      outputVar: z.string().min(1),
      schema: z.record(z.string(), z.string()),
    })
    .passthrough(),
};

function pickSchema(type: FlowNode['type'], subtype: string): z.ZodTypeAny | null {
  const map = type === 'trigger'
    ? triggerConfigSchemas
    : type === 'condition'
      ? conditionConfigSchemas
      : type === 'action'
        ? actionConfigSchemas
        : null;
  return map?.[subtype] ?? null;
}

// ============================================================================
// Algoritmo: validação completa
// ============================================================================

export function validateFlow(flow: Flow): FlowValidationError[] {
  const errors: FlowValidationError[] = [];

  // 1. Existe trigger?
  const triggers = flow.nodes.filter((n) => n.type === 'trigger');
  if (triggers.length === 0) {
    errors.push({ code: 'NO_TRIGGER', message: 'Fluxo precisa de um nó de gatilho' });
    return errors;
  }
  if (triggers.length > 1) {
    errors.push({ code: 'MULTIPLE_TRIGGERS', message: 'Fluxo só pode ter um único gatilho' });
  }

  const trigger = triggers[0]!;
  if (!VALID_TRIGGER_SUBTYPES.includes(trigger.subtype)) {
    errors.push({ nodeId: trigger.id, code: 'INVALID_TRIGGER', message: `Gatilho desconhecido: ${trigger.subtype}` });
  }

  // 2. IDs únicos
  const seenIds = new Set<string>();
  for (const n of flow.nodes) {
    if (seenIds.has(n.id)) {
      errors.push({ nodeId: n.id, code: 'DUPLICATE_NODE_ID', message: `ID duplicado: ${n.id}` });
    }
    seenIds.add(n.id);
  }

  // 3. Edges apontam pra nós existentes
  const nodeIds = new Set(flow.nodes.map((n) => n.id));
  for (const e of flow.edges) {
    if (!nodeIds.has(e.from)) {
      errors.push({ code: 'EDGE_BAD_FROM', message: `Edge.from inexistente: ${e.from}` });
    }
    if (!nodeIds.has(e.to)) {
      errors.push({ code: 'EDGE_BAD_TO', message: `Edge.to inexistente: ${e.to}` });
    }
  }

  // 4. Trigger não tem entradas (nunca é destino de edge)
  for (const e of flow.edges) {
    if (e.to === trigger.id) {
      errors.push({ nodeId: trigger.id, code: 'TRIGGER_HAS_INPUT', message: 'Gatilho não pode ter entrada' });
    }
  }

  // 5. Alcançabilidade a partir do trigger
  const reachable = reachableFrom(flow, trigger.id);
  for (const n of flow.nodes) {
    if (!reachable.has(n.id) && n.id !== trigger.id) {
      errors.push({ nodeId: n.id, code: 'UNREACHABLE', message: 'Nó desconectado do gatilho' });
    }
  }

  // 6. Sem ciclos (DFS-based detection)
  if (hasCycle(flow)) {
    errors.push({ code: 'CYCLE', message: 'Fluxo contém ciclo (loop)' });
  }

  // 7. Validação de config por subtype
  for (const n of flow.nodes) {
    const schema = pickSchema(n.type, n.subtype);
    if (!schema) {
      // type=trigger/condition/action mas subtype desconhecido
      if (['trigger', 'condition', 'action'].includes(n.type)) {
        errors.push({ nodeId: n.id, code: 'UNKNOWN_SUBTYPE', message: `Subtype desconhecido: ${n.subtype}` });
      }
      continue;
    }
    const r = schema.safeParse(n.config ?? {});
    if (!r.success) {
      const issues = r.error.issues
        .map((i) => `${i.path.join('.') || 'config'}: ${i.message}`)
        .join('; ');
      errors.push({ nodeId: n.id, code: 'CONFIG_INVALID', message: issues });
    }
  }

  return errors;
}

function reachableFrom(flow: Flow, startId: string): Set<string> {
  const out = new Map<string, string[]>();
  for (const e of flow.edges) {
    if (!out.has(e.from)) out.set(e.from, []);
    out.get(e.from)!.push(e.to);
  }
  const visited = new Set<string>();
  const stack = [startId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    for (const next of out.get(id) ?? []) stack.push(next);
  }
  return visited;
}

function hasCycle(flow: Flow): boolean {
  const adj = new Map<string, string[]>();
  for (const e of flow.edges) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from)!.push(e.to);
  }
  const WHITE = 0,
    GRAY = 1,
    BLACK = 2;
  const color: Record<string, number> = {};
  for (const n of flow.nodes) color[n.id] = WHITE;

  function dfs(id: string): boolean {
    color[id] = GRAY;
    for (const next of adj.get(id) ?? []) {
      if (color[next] === GRAY) return true;
      if (color[next] === WHITE && dfs(next)) return true;
    }
    color[id] = BLACK;
    return false;
  }

  for (const n of flow.nodes) {
    if (color[n.id] === WHITE && dfs(n.id)) return true;
  }
  return false;
}
