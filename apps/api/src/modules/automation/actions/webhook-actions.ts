import type { ActionDefinition } from './types.js';

export const webhookActions: ActionDefinition[] = [
  {
    subtype: 'send_webhook',
    label: 'Disparar webhook',
    domain: 'webhook',
    configFields: [
      { name: 'url', type: 'string', required: true, label: 'URL' },
      { name: 'method', type: 'string', required: false, label: 'Método (default POST)' },
      { name: 'headers', type: 'string', required: false, label: 'Headers (JSON)' },
      { name: 'body', type: 'string', required: false, label: 'Body (JSON ou auto)' },
    ],
  },
];
