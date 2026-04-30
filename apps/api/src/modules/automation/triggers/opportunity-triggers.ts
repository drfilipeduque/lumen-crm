// Metadados dos triggers do domínio de Oportunidades.
// Servem pro construtor visual (Parte 3) e pra documentar a forma do config.

import type { TriggerDefinition } from './types.js';

export const opportunityTriggers: TriggerDefinition[] = [
  { subtype: 'opportunity_created', label: 'Oportunidade criada', kind: 'event', configFields: [] },
  {
    subtype: 'opportunity_stage_changed',
    label: 'Mudou de etapa',
    kind: 'event',
    configFields: [
      { name: 'fromStageId', type: 'stage', required: false, label: 'Da etapa' },
      { name: 'toStageId', type: 'stage', required: false, label: 'Pra etapa' },
    ],
  },
  {
    subtype: 'opportunity_stale_in_stage',
    label: 'Parado na etapa há…',
    kind: 'cron',
    configFields: [
      { name: 'stageId', type: 'stage', required: false, label: 'Etapa' },
      { name: 'minutes', type: 'number', required: false, label: 'Minutos' },
      { name: 'hours', type: 'number', required: false, label: 'Horas' },
      { name: 'days', type: 'number', required: false, label: 'Dias' },
    ],
  },
  {
    subtype: 'opportunity_inactive',
    label: 'Sem atividade há…',
    kind: 'cron',
    configFields: [
      { name: 'minutes', type: 'number', required: false, label: 'Minutos' },
      { name: 'hours', type: 'number', required: false, label: 'Horas' },
      { name: 'days', type: 'number', required: false, label: 'Dias' },
    ],
  },
  {
    subtype: 'tag_added',
    label: 'Tag adicionada',
    kind: 'event',
    configFields: [{ name: 'tagId', type: 'tag', required: false, label: 'Tag específica' }],
  },
  {
    subtype: 'tag_removed',
    label: 'Tag removida',
    kind: 'event',
    configFields: [{ name: 'tagId', type: 'tag', required: false, label: 'Tag específica' }],
  },
  {
    subtype: 'custom_field_changed',
    label: 'Campo personalizado alterado',
    kind: 'event',
    configFields: [{ name: 'customFieldId', type: 'customField', required: false, label: 'Campo' }],
  },
  { subtype: 'owner_changed', label: 'Responsável alterado', kind: 'event', configFields: [] },
  {
    subtype: 'due_date_approaching',
    label: 'Prazo se aproximando',
    kind: 'cron',
    configFields: [{ name: 'withinHours', type: 'number', required: true, label: 'Dentro de (horas)' }],
  },
  { subtype: 'opportunity_won', label: 'Ganha', kind: 'event', configFields: [] },
  { subtype: 'opportunity_lost', label: 'Perdida', kind: 'event', configFields: [] },
];
