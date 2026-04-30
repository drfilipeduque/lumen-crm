// Tipos compartilhados pelos arquivos de trigger registry.

export type ConfigFieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'tag'
  | 'stage'
  | 'pipeline'
  | 'user'
  | 'customField'
  | 'connection'
  | 'string[]';

export type ConfigField = {
  name: string;
  type: ConfigFieldType;
  required: boolean;
  label: string;
};

export type TriggerDefinition = {
  subtype: string;
  label: string;
  // event = disparado pelo eventBus; cron = avaliado periodicamente; webhook = HTTP externo.
  kind: 'event' | 'cron' | 'webhook';
  configFields: ConfigField[];
};
