// Metadados das ações de IA. A LÓGICA fica em engine/ai-actions.ts.

import type { ActionDefinition } from './types.js';
import { messageActions } from './message-actions.js';
import { opportunityActions } from './opportunity-actions.js';
import { notificationActions } from './notification-actions.js';
import { webhookActions } from './webhook-actions.js';

export const aiActions: ActionDefinition[] = [
  {
    subtype: 'ai_generate',
    label: 'Gerar texto (IA)',
    domain: 'ai',
    configFields: [
      { name: 'integrationId', type: 'string', required: true, label: 'Integração de IA' },
      { name: 'model', type: 'string', required: false, label: 'Modelo (override)' },
      { name: 'prompt', type: 'string', required: true, label: 'Prompt (suporta {{var}})' },
      { name: 'outputVar', type: 'string', required: true, label: 'Salvar em (variável)' },
      { name: 'temperature', type: 'number', required: false, label: 'Temperatura (0-2)' },
      { name: 'maxTokens', type: 'number', required: false, label: 'Tokens máximos' },
    ],
  },
  {
    subtype: 'ai_classify',
    label: 'Classificar (IA)',
    domain: 'ai',
    configFields: [
      { name: 'integrationId', type: 'string', required: true, label: 'Integração' },
      { name: 'input', type: 'string', required: true, label: 'Texto a classificar' },
      { name: 'categories', type: 'string[]', required: true, label: 'Categorias' },
      { name: 'outputVar', type: 'string', required: true, label: 'Salvar em' },
    ],
  },
  {
    subtype: 'ai_summarize',
    label: 'Resumir (IA)',
    domain: 'ai',
    configFields: [
      { name: 'integrationId', type: 'string', required: true, label: 'Integração' },
      { name: 'input', type: 'string', required: true, label: 'Texto' },
      { name: 'maxLength', type: 'number', required: false, label: 'Caracteres máximos' },
      { name: 'outputVar', type: 'string', required: true, label: 'Salvar em' },
    ],
  },
  {
    subtype: 'ai_extract',
    label: 'Extrair dados (IA)',
    domain: 'ai',
    configFields: [
      { name: 'integrationId', type: 'string', required: true, label: 'Integração' },
      { name: 'input', type: 'string', required: true, label: 'Texto' },
      { name: 'schema', type: 'string', required: true, label: 'Schema JSON ({ campo: tipo })' },
      { name: 'outputVar', type: 'string', required: true, label: 'Salvar em' },
    ],
  },
];

export const allActionDefinitions: ActionDefinition[] = [
  ...messageActions,
  ...opportunityActions,
  ...notificationActions,
  ...webhookActions,
  ...aiActions,
];
