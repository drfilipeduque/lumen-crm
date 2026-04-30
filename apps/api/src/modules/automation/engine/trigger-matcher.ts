// Decide quais Automations devem rodar pra um determinado evento.
//
// Cada Automation tem `triggerType` (denormalizado) que mapeia 1-pra-1 com um
// AutomationEventType. Quando o EventType é o mesmo, ainda checamos config:
//   - opportunity_stage_changed: { fromStageId?, toStageId? } — se setado precisa bater
//   - tag_added/tag_removed: { tagId? } — idem
//   - custom_field_changed: { customFieldId? } — idem
//   - keyword_detected (variante de message_received): { keywords: [...], matchType: "any"|"all" }

import type { Prisma } from '../../../lib/prisma.js';
import type { AutomationEventType, EventPayload } from './event-bus.js';

// Trigger subtype (no `flow.nodes[trigger].subtype`) → AutomationEventType correspondente.
// Triggers com sufixo `_cron` são disparados pelo worker, não pelo event-bus.
export const TRIGGER_TO_EVENT: Record<string, AutomationEventType | null> = {
  opportunity_created: 'opportunity.created',
  opportunity_stage_changed: 'opportunity.stage_changed',
  opportunity_stale_in_stage: null, // cron
  opportunity_inactive: null, // cron
  tag_added: 'opportunity.tag_added',
  tag_removed: 'opportunity.tag_removed',
  custom_field_changed: 'opportunity.field_updated',
  owner_changed: 'opportunity.owner_changed',
  due_date_approaching: null, // cron
  message_received: 'message.received',
  message_sent: 'message.sent',
  keyword_detected: 'message.received', // filtra por keyword no config
  opportunity_won: 'opportunity.won',
  opportunity_lost: 'opportunity.lost',
  scheduled: null, // cron
  webhook_received: 'webhook.received',
};

// Lista de triggers válidos (usado em validação Zod nas rotas).
export const VALID_TRIGGER_SUBTYPES = Object.keys(TRIGGER_TO_EVENT);

// Mapeia evento → triggerType (string usada no `Automation.triggerType` denormalizado).
// Pode haver múltiplos triggerTypes que mapeiam pro mesmo evento (ex: keyword_detected).
export function eventToTriggerTypes(eventType: AutomationEventType): string[] {
  const out: string[] = [];
  for (const [trig, ev] of Object.entries(TRIGGER_TO_EVENT)) {
    if (ev === eventType) out.push(trig);
  }
  return out;
}

// Verifica se a config do trigger casa com o payload do evento.
export function matchesTriggerConfig(
  triggerType: string,
  triggerConfig: Prisma.JsonValue,
  event: EventPayload,
): boolean {
  const cfg = (triggerConfig ?? {}) as Record<string, unknown>;
  const data = event.data as Record<string, unknown>;

  switch (triggerType) {
    case 'opportunity_stage_changed': {
      const from = cfg.fromStageId as string | undefined;
      const to = cfg.toStageId as string | undefined;
      if (from && data.fromStageId !== from) return false;
      if (to && data.toStageId !== to) return false;
      return true;
    }
    case 'tag_added':
    case 'tag_removed': {
      const tagId = cfg.tagId as string | undefined;
      if (tagId && data.tagId !== tagId) return false;
      return true;
    }
    case 'custom_field_changed': {
      const fieldId = cfg.customFieldId as string | undefined;
      if (fieldId && data.customFieldId !== fieldId) return false;
      return true;
    }
    case 'keyword_detected': {
      const keywords = (cfg.keywords as string[] | undefined) ?? [];
      const matchType = (cfg.matchType as 'any' | 'all' | undefined) ?? 'any';
      const content = ((data.content as string | undefined) ?? '').toLowerCase();
      if (keywords.length === 0) return false;
      const hits = keywords.map((k) => content.includes(k.toLowerCase()));
      return matchType === 'all' ? hits.every(Boolean) : hits.some(Boolean);
    }
    case 'webhook_received': {
      const webhookId = cfg.webhookId as string | undefined;
      if (webhookId && data.webhookId !== webhookId) return false;
      return true;
    }
    default:
      return true;
  }
}
