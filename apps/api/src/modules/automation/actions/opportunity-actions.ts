import type { ActionDefinition } from './types.js';

export const opportunityActions: ActionDefinition[] = [
  {
    subtype: 'move_stage',
    label: 'Mover de etapa',
    domain: 'opportunity',
    configFields: [{ name: 'stageId', type: 'stage', required: true, label: 'Etapa destino' }],
  },
  {
    subtype: 'add_tag',
    label: 'Adicionar tag',
    domain: 'opportunity',
    configFields: [{ name: 'tagId', type: 'tag', required: true, label: 'Tag' }],
  },
  {
    subtype: 'remove_tag',
    label: 'Remover tag',
    domain: 'opportunity',
    configFields: [{ name: 'tagId', type: 'tag', required: true, label: 'Tag' }],
  },
  {
    subtype: 'assign_owner',
    label: 'Atribuir responsável',
    domain: 'opportunity',
    configFields: [{ name: 'ownerId', type: 'user', required: true, label: 'Usuário' }],
  },
  {
    subtype: 'transfer_owner',
    label: 'Transferir responsável',
    domain: 'opportunity',
    configFields: [{ name: 'ownerId', type: 'user', required: true, label: 'Novo responsável' }],
  },
  { subtype: 'unassign_owner', label: 'Remover responsável', domain: 'opportunity', configFields: [] },
  {
    subtype: 'change_priority',
    label: 'Alterar prioridade',
    domain: 'opportunity',
    configFields: [{ name: 'priority', type: 'string', required: true, label: 'LOW|MEDIUM|HIGH|URGENT' }],
  },
  {
    subtype: 'update_custom_field',
    label: 'Atualizar campo personalizado',
    domain: 'opportunity',
    configFields: [
      { name: 'fieldId', type: 'customField', required: true, label: 'Campo' },
      { name: 'value', type: 'string', required: true, label: 'Valor' },
    ],
  },
  {
    subtype: 'create_opportunity',
    label: 'Criar oportunidade',
    domain: 'opportunity',
    configFields: [
      { name: 'pipelineId', type: 'pipeline', required: true, label: 'Pipeline' },
      { name: 'stageId', type: 'stage', required: true, label: 'Etapa' },
      { name: 'contactId', type: 'string', required: false, label: 'Contato (default: do trigger)' },
      { name: 'title', type: 'string', required: false, label: 'Título' },
      { name: 'value', type: 'number', required: false, label: 'Valor' },
    ],
  },
  {
    subtype: 'create_note',
    label: 'Adicionar nota',
    domain: 'opportunity',
    configFields: [{ name: 'text', type: 'string', required: true, label: 'Texto' }],
  },
  {
    subtype: 'wait',
    label: 'Aguardar',
    domain: 'control',
    configFields: [
      { name: 'minutes', type: 'number', required: false, label: 'Minutos' },
      { name: 'hours', type: 'number', required: false, label: 'Horas' },
      { name: 'days', type: 'number', required: false, label: 'Dias' },
    ],
  },
  {
    subtype: 'transfer_to_pipeline',
    label: 'Transferir para outro funil',
    domain: 'opportunity',
    configFields: [
      { name: 'targetPipelineId', type: 'pipeline', required: true, label: 'Funil destino' },
      { name: 'targetStageId', type: 'stage', required: true, label: 'Etapa destino' },
      {
        name: 'customFieldStrategy',
        type: 'string',
        required: false,
        label: 'Campos personalizados (KEEP_COMPATIBLE | DISCARD_ALL | MAP)',
      },
      { name: 'keepTags', type: 'boolean', required: false, label: 'Manter tags' },
      { name: 'keepReminders', type: 'boolean', required: false, label: 'Manter lembretes' },
      { name: 'keepFiles', type: 'boolean', required: false, label: 'Manter arquivos' },
    ],
  },
];
