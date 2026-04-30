import type { ActionDefinition } from './types.js';

export const messageActions: ActionDefinition[] = [
  {
    subtype: 'send_whatsapp_message',
    label: 'Enviar WhatsApp',
    domain: 'message',
    configFields: [
      { name: 'conversationId', type: 'string', required: false, label: 'Conversa (auto se vier do trigger)' },
      { name: 'text', type: 'string', required: false, label: 'Texto (suporta {{var}})' },
      { name: 'scriptId', type: 'string', required: false, label: 'Script (alternativa ao texto)' },
    ],
  },
  {
    subtype: 'send_whatsapp_template',
    label: 'Enviar template (oficial)',
    domain: 'message',
    configFields: [
      { name: 'conversationId', type: 'string', required: false, label: 'Conversa' },
      { name: 'templateId', type: 'string', required: true, label: 'Template' },
    ],
  },
];
