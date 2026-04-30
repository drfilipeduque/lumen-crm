// Pub/sub interno do sistema.
//
// Domínios publicam eventos no formato "domain.action" (ex: "opportunity.created").
// O motor de automation escuta TUDO via "*" e despacha pra automations elegíveis.
//
// Implementação intencionalmente simples (Node EventEmitter). Single-process.
// Quando precisar de fan-out cross-instance, troca por Redis pub/sub mantendo
// o mesmo contrato externo.

import { EventEmitter } from 'node:events';

export type AutomationEventType =
  | 'opportunity.created'
  | 'opportunity.stage_changed'
  | 'opportunity.tag_added'
  | 'opportunity.tag_removed'
  | 'opportunity.owner_changed'
  | 'opportunity.field_updated'
  | 'opportunity.priority_changed'
  | 'opportunity.value_changed'
  | 'opportunity.won'
  | 'opportunity.lost'
  | 'opportunity.deleted'
  | 'opportunity.transferred'
  | 'message.received'
  | 'message.sent'
  | 'message.unanswered'
  | 'conversation.created'
  | 'conversation.resolved'
  | 'webhook.received';

export type EventPayload = {
  type: AutomationEventType;
  // ID do recurso principal afetado (opportunityId, conversationId, etc).
  // Permite indexação de logs sem parsear payload.
  entityId?: string;
  // Quem disparou. Pode ser userId, "system", "cron", ou ID de webhook.
  actorId?: string | null;
  // Payload específico de cada event type. Tipado lá embaixo via union.
  data: Record<string, unknown>;
  // Timestamp do evento (ms epoch). Default agora.
  ts?: number;
};

class AutomationEventBus {
  private emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(50);
  }

  // Publica um evento. Listeners do tipo específico E do wildcard "*" recebem.
  publish(event: EventPayload): void {
    const e: EventPayload = { ...event, ts: event.ts ?? Date.now() };
    this.emitter.emit(e.type, e);
    this.emitter.emit('*', e);
  }

  on(type: AutomationEventType | '*', handler: (e: EventPayload) => void | Promise<void>): () => void {
    this.emitter.on(type, handler);
    return () => this.emitter.off(type, handler);
  }
}

// Singleton — uma única instância pra todo o processo.
export const eventBus = new AutomationEventBus();
