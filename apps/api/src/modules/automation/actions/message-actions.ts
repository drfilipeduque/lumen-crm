import type { ActionDefinition } from './types.js';

// connectionStrategy/fallback são objetos aninhados (Json) — declarados como
// "string" no catalog só pra UI tratar via inspetor especializado em
// flow-editor/properties.tsx (não dropdown genérico).
export const messageActions: ActionDefinition[] = [
  {
    subtype: 'send_whatsapp_message',
    label: 'Enviar WhatsApp',
    domain: 'message',
    configFields: [
      { name: 'conversationId', type: 'string', required: false, label: 'Conversa (auto se vier do trigger)' },
      { name: 'text', type: 'string', required: false, label: 'Texto (suporta {{var}})' },
      { name: 'scriptId', type: 'string', required: false, label: 'Script (alternativa ao texto)' },
      { name: 'mediaUrl', type: 'string', required: false, label: 'URL de mídia (opcional)' },
      {
        name: 'connectionStrategy',
        type: 'string',
        required: false,
        label: 'Estratégia de conexão (DEFAULT | SPECIFIC | TYPE_PREFERRED)',
      },
      { name: 'connectionId', type: 'string', required: false, label: 'Conexão específica' },
      {
        name: 'preferredType',
        type: 'string',
        required: false,
        label: 'Tipo preferido (OFFICIAL | UNOFFICIAL)',
      },
      { name: 'fallback', type: 'string', required: false, label: 'Fallback (objeto JSON)' },
    ],
  },
  {
    subtype: 'send_whatsapp_template',
    label: 'Enviar template (oficial)',
    domain: 'message',
    configFields: [
      { name: 'conversationId', type: 'string', required: false, label: 'Conversa' },
      { name: 'templateId', type: 'string', required: true, label: 'Template' },
      {
        name: 'connectionStrategy',
        type: 'string',
        required: false,
        label: 'Estratégia de conexão (default SPECIFIC)',
      },
      { name: 'connectionId', type: 'string', required: false, label: 'Conexão específica' },
    ],
  },
  {
    subtype: 'resolve_conversation',
    label: 'Marcar conversa como resolvida',
    domain: 'message',
    configFields: [
      { name: 'conversationId', type: 'string', required: false, label: 'Conversa (default: do contexto)' },
      { name: 'sendFinalMessage', type: 'boolean', required: false, label: 'Enviar mensagem final' },
      { name: 'finalMessageContent', type: 'string', required: false, label: 'Texto final (suporta {{var}})' },
    ],
  },
];
