import type { ActionDefinition } from './types.js';

export const notificationActions: ActionDefinition[] = [
  {
    subtype: 'create_reminder',
    label: 'Criar lembrete',
    domain: 'notification',
    configFields: [
      { name: 'title', type: 'string', required: true, label: 'Título' },
      { name: 'userId', type: 'user', required: false, label: 'Pra quem (default: owner)' },
      { name: 'dueInMinutes', type: 'number', required: false, label: 'Daqui a X min' },
      { name: 'dueAt', type: 'string', required: false, label: 'ISO date (alternativa)' },
    ],
  },
  {
    subtype: 'notify_user',
    label: 'Notificar usuário',
    domain: 'notification',
    configFields: [
      { name: 'userId', type: 'user', required: true, label: 'Usuário' },
      { name: 'title', type: 'string', required: false, label: 'Título' },
      { name: 'message', type: 'string', required: false, label: 'Mensagem' },
    ],
  },
];
