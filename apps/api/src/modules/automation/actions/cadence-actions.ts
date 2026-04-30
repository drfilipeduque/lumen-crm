// Metadados das actions do domínio Cadência usadas no construtor visual.
// A lógica fica em engine/action-executor.ts.

import type { ActionDefinition } from './types.js';

export const cadenceActions: ActionDefinition[] = [
  {
    subtype: 'start_cadence',
    label: 'Iniciar cadência',
    domain: 'control',
    configFields: [
      { name: 'cadenceId', type: 'string', required: true, label: 'Cadência' },
      {
        name: 'target',
        type: 'string',
        required: false,
        label: 'Alvo (auto: opportunity ou contact do contexto)',
      },
    ],
  },
  {
    subtype: 'pause_cadence',
    label: 'Pausar cadência',
    domain: 'control',
    configFields: [
      {
        name: 'cadenceId',
        type: 'string',
        required: false,
        label: 'Cadência específica (vazio = todas ativas)',
      },
      {
        name: 'reason',
        type: 'string',
        required: false,
        label: 'Motivo (opcional)',
      },
    ],
  },
  {
    subtype: 'cancel_cadence',
    label: 'Cancelar cadência',
    domain: 'control',
    configFields: [
      {
        name: 'cadenceId',
        type: 'string',
        required: false,
        label: 'Cadência específica (vazio = todas)',
      },
    ],
  },
];
