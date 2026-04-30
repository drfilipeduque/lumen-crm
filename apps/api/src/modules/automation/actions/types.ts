// Metadados de actions pro construtor visual (Parte 3).
// A LÓGICA real fica em engine/action-executor.ts e engine/ai-actions.ts;
// estes arquivos só descrevem cada subtype pra UI.

import type { ConfigField } from '../triggers/types.js';

export type ActionDefinition = {
  subtype: string;
  label: string;
  domain: 'message' | 'opportunity' | 'notification' | 'webhook' | 'ai' | 'control';
  configFields: ConfigField[];
};
