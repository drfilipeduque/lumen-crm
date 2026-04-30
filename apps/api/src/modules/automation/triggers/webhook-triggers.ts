import type { TriggerDefinition } from './types.js';

export const webhookTriggers: TriggerDefinition[] = [
  {
    subtype: 'webhook_received',
    label: 'Webhook recebido',
    kind: 'webhook',
    configFields: [
      { name: 'webhookId', type: 'string', required: false, label: 'ID do webhook (opcional)' },
    ],
  },
];

// Lista única exportada (usada pelo construtor visual).
import { opportunityTriggers } from './opportunity-triggers.js';
import { messageTriggers } from './message-triggers.js';
import { timeTriggers } from './time-triggers.js';

export const allTriggerDefinitions = [
  ...opportunityTriggers,
  ...messageTriggers,
  ...timeTriggers,
  ...webhookTriggers,
];
