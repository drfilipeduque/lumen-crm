import type { TriggerDefinition } from './types.js';

export const timeTriggers: TriggerDefinition[] = [
  {
    subtype: 'scheduled',
    label: 'Horário específico',
    kind: 'cron',
    configFields: [
      { name: 'hour', type: 'number', required: true, label: 'Hora (0-23, BRT)' },
      { name: 'minute', type: 'number', required: true, label: 'Minuto (0-59)' },
      { name: 'dayOfWeek', type: 'number', required: false, label: 'Dia da semana (0=Dom)' },
    ],
  },
];
