import type { TriggerDefinition } from './types.js';

export const messageTriggers: TriggerDefinition[] = [
  { subtype: 'message_received', label: 'Mensagem recebida', kind: 'event', configFields: [] },
  { subtype: 'message_sent', label: 'Mensagem enviada', kind: 'event', configFields: [] },
  {
    subtype: 'keyword_detected',
    label: 'Palavra-chave detectada',
    kind: 'event',
    configFields: [
      { name: 'keywords', type: 'string[]', required: true, label: 'Palavras-chave' },
      { name: 'matchType', type: 'string', required: false, label: 'Modo (any|all)' },
    ],
  },
];
