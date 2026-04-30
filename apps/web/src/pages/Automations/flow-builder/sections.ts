// Categorização e labels usadas pelos dropdowns de gatilho/ação no
// construtor estilo ClickUp.

export type Category = {
  label: string;
  emoji: string;
  items: { subtype: string; label: string }[];
};

export const TRIGGER_CATEGORIES: Category[] = [
  {
    label: 'Pipeline',
    emoji: '📂',
    items: [
      { subtype: 'opportunity_created', label: 'Oportunidade criada' },
      { subtype: 'opportunity_stage_changed', label: 'Etapa mudou' },
      { subtype: 'opportunity_transferred', label: 'Oportunidade transferida' },
      { subtype: 'opportunity_stale_in_stage', label: 'Parado em etapa há X tempo' },
      { subtype: 'opportunity_inactive', label: 'Sem atividade há X tempo' },
      { subtype: 'tag_added', label: 'Tag adicionada' },
      { subtype: 'tag_removed', label: 'Tag removida' },
      { subtype: 'custom_field_changed', label: 'Campo personalizado alterado' },
      { subtype: 'owner_changed', label: 'Responsável alterado' },
      { subtype: 'due_date_approaching', label: 'Data de vencimento próxima' },
      { subtype: 'opportunity_won', label: 'Oportunidade ganha' },
      { subtype: 'opportunity_lost', label: 'Oportunidade perdida' },
    ],
  },
  {
    label: 'WhatsApp',
    emoji: '💬',
    items: [
      { subtype: 'message_received', label: 'Mensagem recebida' },
      { subtype: 'message_sent', label: 'Mensagem enviada' },
      { subtype: 'keyword_detected', label: 'Palavra-chave detectada' },
      { subtype: 'message_unanswered', label: 'Mensagem sem resposta há X tempo' },
    ],
  },
  {
    label: 'Tempo / Externo',
    emoji: '⏰',
    items: [
      { subtype: 'scheduled', label: 'Horário específico (cron)' },
      { subtype: 'webhook_received', label: 'Webhook recebido' },
    ],
  },
];

export const ACTION_CATEGORIES: Category[] = [
  {
    label: 'Pipeline',
    emoji: '📂',
    items: [
      { subtype: 'move_stage', label: 'Mover para etapa' },
      { subtype: 'transfer_to_pipeline', label: 'Transferir para outro funil' },
      { subtype: 'add_tag', label: 'Adicionar tag' },
      { subtype: 'remove_tag', label: 'Remover tag' },
      { subtype: 'assign_owner', label: 'Atribuir responsável' },
      { subtype: 'transfer_owner', label: 'Transferir responsável' },
      { subtype: 'unassign_owner', label: 'Remover responsável' },
      { subtype: 'change_priority', label: 'Alterar prioridade' },
      { subtype: 'update_custom_field', label: 'Atualizar campo personalizado' },
      { subtype: 'create_opportunity', label: 'Criar oportunidade' },
      { subtype: 'create_note', label: 'Adicionar nota' },
    ],
  },
  {
    label: 'WhatsApp',
    emoji: '💬',
    items: [
      { subtype: 'send_whatsapp_message', label: 'Enviar WhatsApp' },
      { subtype: 'send_whatsapp_template', label: 'Enviar template oficial (Meta)' },
      { subtype: 'resolve_conversation', label: 'Marcar conversa como resolvida' },
    ],
  },
  {
    label: 'Cadências e Tempo',
    emoji: '⏱',
    items: [
      { subtype: 'start_cadence', label: 'Iniciar cadência' },
      { subtype: 'pause_cadence', label: 'Pausar cadência' },
      { subtype: 'cancel_cadence', label: 'Cancelar cadência' },
      { subtype: 'wait', label: 'Aguardar (delay)' },
    ],
  },
  {
    label: 'IA',
    emoji: '🤖',
    items: [
      { subtype: 'ai_generate', label: 'Gerar texto' },
      { subtype: 'ai_classify', label: 'Classificar' },
      { subtype: 'ai_summarize', label: 'Resumir' },
      { subtype: 'ai_extract', label: 'Extrair dados' },
    ],
  },
  {
    label: 'Pessoas',
    emoji: '🔔',
    items: [
      { subtype: 'create_reminder', label: 'Criar lembrete' },
      { subtype: 'notify_user', label: 'Notificar usuário (in-app)' },
    ],
  },
  {
    label: 'Externo',
    emoji: '🌐',
    items: [{ subtype: 'send_webhook', label: 'Disparar webhook' }],
  },
];

export const CONDITION_CATEGORIES: Category[] = [
  {
    label: 'Pipeline',
    emoji: '📂',
    items: [
      { subtype: 'pipeline_equals', label: 'Funil é' },
      { subtype: 'stage_equals', label: 'Etapa é' },
      { subtype: 'tag_equals', label: 'Tem tag' },
      { subtype: 'tag_includes_any', label: 'Tem qualquer tag' },
      { subtype: 'tag_includes_all', label: 'Tem todas as tags' },
      { subtype: 'owner_equals', label: 'Responsável é' },
      { subtype: 'priority_equals', label: 'Prioridade é' },
      { subtype: 'value_gt', label: 'Valor maior que' },
      { subtype: 'value_lt', label: 'Valor menor que' },
      { subtype: 'value_between', label: 'Valor entre' },
      { subtype: 'days_since_creation_gt', label: 'Criada há mais de X dias' },
      { subtype: 'has_active_reminder', label: 'Tem lembrete ativo' },
      { subtype: 'custom_field_equals', label: 'Campo personalizado é' },
      { subtype: 'custom_field_contains', label: 'Campo personalizado contém' },
    ],
  },
  {
    label: 'Tempo',
    emoji: '⏰',
    items: [
      { subtype: 'business_hours', label: 'Em horário comercial' },
      { subtype: 'day_of_week', label: 'Dia da semana é' },
    ],
  },
];

export function findItem(
  cats: Category[],
  subtype: string,
): { category: Category; item: { subtype: string; label: string } } | null {
  for (const c of cats) {
    const it = c.items.find((i) => i.subtype === subtype);
    if (it) return { category: c, item: it };
  }
  return null;
}

// Schemas Zod-equivalentes pros campos de cada condition (não vêm do catalog).
// Mapeia subtype → ConfigField[] para reuso do DynamicConfigForm.
export const CONDITION_FIELDS: Record<string, { name: string; type: string; required: boolean; label: string }[]> = {
  pipeline_equals: [{ name: 'pipelineId', type: 'pipeline', required: true, label: 'Funil' }],
  stage_equals: [
    { name: 'pipelineId', type: 'pipeline', required: true, label: 'Funil' },
    { name: 'stageId', type: 'stage', required: true, label: 'Etapa' },
  ],
  tag_equals: [{ name: 'tagId', type: 'tag', required: true, label: 'Tag' }],
  tag_includes_any: [{ name: 'tagIds', type: 'string[]', required: true, label: 'Tags (IDs separados por vírgula)' }],
  tag_includes_all: [{ name: 'tagIds', type: 'string[]', required: true, label: 'Tags (IDs separados por vírgula)' }],
  owner_equals: [{ name: 'ownerId', type: 'user', required: true, label: 'Responsável' }],
  priority_equals: [{ name: 'priority', type: 'string', required: true, label: 'Prioridade' }],
  value_gt: [{ name: 'value', type: 'number', required: true, label: 'Valor (maior que)' }],
  value_lt: [{ name: 'value', type: 'number', required: true, label: 'Valor (menor que)' }],
  value_between: [
    { name: 'min', type: 'number', required: true, label: 'Mínimo' },
    { name: 'max', type: 'number', required: true, label: 'Máximo' },
  ],
  days_since_creation_gt: [{ name: 'days', type: 'number', required: true, label: 'Dias desde criação (maior que)' }],
  has_active_reminder: [],
  custom_field_equals: [
    { name: 'fieldName', type: 'string', required: true, label: 'Nome do campo' },
    { name: 'value', type: 'string', required: true, label: 'Valor' },
  ],
  custom_field_contains: [
    { name: 'fieldName', type: 'string', required: true, label: 'Nome do campo' },
    { name: 'value', type: 'string', required: true, label: 'Contém' },
  ],
  business_hours: [],
  day_of_week: [{ name: 'days', type: 'string[]', required: true, label: 'Dias (0=Dom,1=Seg,...)' }],
};
