import type { TriggerDefinition } from './types.js';

export const messageTriggers: TriggerDefinition[] = [
  {
    subtype: 'message_received',
    label: 'Mensagem recebida',
    kind: 'event',
    configFields: [
      { name: 'connectionId', type: 'connection', required: false, label: 'Conexão (opcional)' },
      {
        name: 'connectionType',
        type: 'string',
        required: false,
        label: 'Tipo de conexão (OFFICIAL | UNOFFICIAL)',
      },
    ],
  },
  {
    subtype: 'message_sent',
    label: 'Mensagem enviada',
    kind: 'event',
    configFields: [
      { name: 'connectionId', type: 'connection', required: false, label: 'Conexão (opcional)' },
      {
        name: 'connectionType',
        type: 'string',
        required: false,
        label: 'Tipo de conexão (OFFICIAL | UNOFFICIAL)',
      },
    ],
  },
  {
    subtype: 'keyword_detected',
    label: 'Palavra-chave detectada',
    kind: 'event',
    configFields: [
      { name: 'keywords', type: 'string[]', required: true, label: 'Palavras-chave' },
      { name: 'matchType', type: 'string', required: false, label: 'Modo (any|all)' },
      { name: 'connectionId', type: 'connection', required: false, label: 'Conexão (opcional)' },
      {
        name: 'connectionType',
        type: 'string',
        required: false,
        label: 'Tipo de conexão (OFFICIAL | UNOFFICIAL)',
      },
    ],
  },
  {
    subtype: 'message_unanswered',
    label: 'Mensagem sem resposta há…',
    kind: 'cron',
    configFields: [
      { name: 'hours', type: 'number', required: true, label: 'Horas sem resposta' },
      {
        name: 'direction',
        type: 'string',
        required: true,
        label: 'Direção (CLIENT_WAITING | US_WAITING)',
      },
      { name: 'connectionId', type: 'connection', required: false, label: 'Conexão (opcional)' },
      {
        name: 'connectionType',
        type: 'string',
        required: false,
        label: 'Tipo de conexão (OFFICIAL | UNOFFICIAL)',
      },
    ],
  },
];
