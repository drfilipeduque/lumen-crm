// Listeners do eventBus que cadências precisam observar:
//   - "message.received"          → pausar execuções ACTIVE com pauseOnReply
//   - "opportunity.created"       → tentar auto-start (PIPELINE/STAGE/GROUP)
//   - "opportunity.stage_changed" → idem (sobretudo p/ STAGE)
//
// Idempotência fica no startMatchingCadencesForOpportunity (verifica execution
// já existente antes de criar nova).

import { eventBus } from '../automation/engine/event-bus.js';
import {
  pauseExecutionsForContactReply,
  startMatchingCadencesForOpportunity,
} from './cadences.service.js';

let registered = false;

export function registerCadenceListeners(log?: { error: (...a: unknown[]) => void }) {
  if (registered) return;
  registered = true;

  eventBus.on('message.received', (event) => {
    const contactId = (event.data as Record<string, unknown>).contactId as string | undefined;
    if (!contactId) return;
    void pauseExecutionsForContactReply(contactId).catch((err) => {
      log?.error({ err, contactId }, 'cadence pauseOnReply failed');
    });
  });

  eventBus.on('opportunity.created', (event) => {
    const oppId = (event.data as Record<string, unknown>).opportunityId as string | undefined;
    if (!oppId) return;
    void startMatchingCadencesForOpportunity(oppId).catch((err) => {
      log?.error({ err, opportunityId: oppId }, 'cadence auto-start failed');
    });
  });

  eventBus.on('opportunity.stage_changed', (event) => {
    const oppId = (event.data as Record<string, unknown>).opportunityId as string | undefined;
    if (!oppId) return;
    void startMatchingCadencesForOpportunity(oppId).catch((err) => {
      log?.error({ err, opportunityId: oppId }, 'cadence auto-start failed');
    });
  });
}
