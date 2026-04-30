// Labels human-readable em PT pra cada subtype.

export const TRIGGER_LABELS: Record<string, string> = {
  opportunity_created: 'Oportunidade criada',
  opportunity_stage_changed: 'Etapa mudou',
  opportunity_stale_in_stage: 'Parado na etapa há…',
  opportunity_inactive: 'Sem atividade há…',
  tag_added: 'Tag adicionada',
  tag_removed: 'Tag removida',
  custom_field_changed: 'Campo personalizado alterado',
  owner_changed: 'Responsável alterado',
  due_date_approaching: 'Prazo se aproximando',
  message_received: 'Mensagem recebida',
  message_sent: 'Mensagem enviada',
  keyword_detected: 'Palavra-chave detectada',
  opportunity_won: 'Oportunidade ganha',
  opportunity_lost: 'Oportunidade perdida',
  scheduled: 'Horário específico',
  webhook_received: 'Webhook recebido',
};

export const CONDITION_LABELS: Record<string, string> = {
  pipeline_equals: 'Funil é igual a',
  stage_equals: 'Etapa é igual a',
  tag_equals: 'Tem tag',
  tag_includes_any: 'Tem qualquer tag',
  tag_includes_all: 'Tem todas as tags',
  owner_equals: 'Responsável é',
  priority_equals: 'Prioridade é',
  value_gt: 'Valor maior que',
  value_lt: 'Valor menor que',
  value_between: 'Valor entre',
  business_hours: 'Horário comercial',
  day_of_week: 'Dia da semana',
  custom_field_equals: 'Campo personalizado é',
  custom_field_contains: 'Campo personalizado contém',
  has_active_reminder: 'Tem lembrete ativo',
  days_since_creation_gt: 'Criada há mais de X dias',
  and: 'E (todas)',
  or: 'OU (qualquer)',
  not: 'NÃO',
};

export const ACTION_LABELS: Record<string, string> = {
  send_whatsapp_message: 'Enviar WhatsApp',
  send_whatsapp_template: 'Enviar template',
  move_stage: 'Mover de etapa',
  add_tag: 'Adicionar tag',
  remove_tag: 'Remover tag',
  assign_owner: 'Atribuir responsável',
  transfer_owner: 'Transferir responsável',
  unassign_owner: 'Remover responsável',
  create_reminder: 'Criar lembrete',
  change_priority: 'Alterar prioridade',
  update_custom_field: 'Atualizar campo',
  create_opportunity: 'Criar oportunidade',
  create_note: 'Adicionar nota',
  send_webhook: 'Disparar webhook',
  wait: 'Aguardar',
  notify_user: 'Notificar usuário',
  ai_generate: 'IA — Gerar texto',
  ai_classify: 'IA — Classificar',
  ai_summarize: 'IA — Resumir',
  ai_extract: 'IA — Extrair dados',
};

export function labelFor(type: 'trigger' | 'condition' | 'action', subtype: string): string {
  if (type === 'trigger') return TRIGGER_LABELS[subtype] ?? subtype;
  if (type === 'condition') return CONDITION_LABELS[subtype] ?? subtype;
  return ACTION_LABELS[subtype] ?? subtype;
}

// Categorias pra biblioteca de nós (painel esquerdo).
export const NODE_LIBRARY: Array<{
  category: 'Gatilhos' | 'Condições' | 'Ações' | 'IA' | 'Controle';
  type: 'trigger' | 'condition' | 'action';
  items: { subtype: string; label: string }[];
}> = [
  {
    category: 'Gatilhos',
    type: 'trigger',
    items: Object.entries(TRIGGER_LABELS).map(([s, l]) => ({ subtype: s, label: l })),
  },
  {
    category: 'Condições',
    type: 'condition',
    items: Object.entries(CONDITION_LABELS).map(([s, l]) => ({ subtype: s, label: l })),
  },
  {
    category: 'Ações',
    type: 'action',
    items: [
      'send_whatsapp_message',
      'send_whatsapp_template',
      'move_stage',
      'add_tag',
      'remove_tag',
      'assign_owner',
      'transfer_owner',
      'unassign_owner',
      'create_reminder',
      'change_priority',
      'update_custom_field',
      'create_opportunity',
      'create_note',
      'send_webhook',
      'notify_user',
    ].map((s) => ({ subtype: s, label: ACTION_LABELS[s] ?? s })),
  },
  {
    category: 'IA',
    type: 'action',
    items: ['ai_generate', 'ai_classify', 'ai_summarize', 'ai_extract'].map((s) => ({
      subtype: s,
      label: ACTION_LABELS[s] ?? s,
    })),
  },
  {
    category: 'Controle',
    type: 'action',
    items: [{ subtype: 'wait', label: ACTION_LABELS.wait ?? 'wait' }],
  },
];
