// Receiver INBOUND: POST /webhooks/inbound/:uniqueUrl
//
// Valida X-Auth-Token contra Webhook.authToken (timing-safe).
// Despacha pra ação configurada (actionType + actionConfig).
// Persiste AutomationLog.

import { timingSafeEqual } from 'node:crypto';
import { prisma, Prisma } from '../../lib/prisma.js';
import { eventBus } from '../automation/engine/event-bus.js';
import {
  enqueueExecution,
} from '../automation/queues.js';

export class ReceiverError extends Error {
  status: number;
  code: string;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function tokensMatch(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

// Recebe a requisição já parseada (uniqueUrl, token, body).
// Retorna { success, createdId? } pro client externo.
export async function processInbound(
  uniqueUrl: string,
  authToken: string | undefined,
  payload: Record<string, unknown>,
): Promise<{ success: true; createdId?: string; message?: string }> {
  const w = await prisma.webhook.findUnique({ where: { uniqueUrl } });
  if (!w || w.type !== 'INBOUND') {
    throw new ReceiverError('NOT_FOUND', 'Webhook não encontrado', 404);
  }
  if (!w.active) {
    throw new ReceiverError('INACTIVE', 'Webhook desativado', 403);
  }
  if (!w.authToken || !authToken || !tokensMatch(w.authToken, authToken)) {
    throw new ReceiverError('UNAUTHORIZED', 'Token inválido', 401);
  }

  const startedAt = new Date();

  // Cria log RUNNING
  const log = await prisma.automationLog.create({
    data: {
      type: 'WEBHOOK',
      entityId: w.id,
      status: 'RUNNING',
      trigger: `inbound:${w.name}`,
      triggeredBy: 'webhook',
      input: payload as Prisma.InputJsonValue,
      startedAt,
    },
  });

  try {
    const result = await dispatch(w.actionType ?? '', (w.actionConfig as Record<string, unknown>) ?? {}, payload);
    await prisma.automationLog.update({
      where: { id: log.id },
      data: {
        status: 'SUCCESS',
        output: result as unknown as Prisma.InputJsonValue,
        completedAt: new Date(),
        executionTime: Date.now() - startedAt.getTime(),
      },
    });
    return { success: true, ...result };
  } catch (err) {
    const e = err as Error;
    await prisma.automationLog.update({
      where: { id: log.id },
      data: {
        status: 'FAILED',
        error: e.message,
        completedAt: new Date(),
        executionTime: Date.now() - startedAt.getTime(),
      },
    });
    throw err;
  }
}

// Pega valor do payload com dot path (ex: "data.contact.name").
function pickPath(obj: Record<string, unknown>, path: string | undefined): unknown {
  if (!path) return undefined;
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

async function dispatch(
  actionType: string,
  config: Record<string, unknown>,
  payload: Record<string, unknown>,
): Promise<{ createdId?: string; message?: string }> {
  switch (actionType) {
    case 'create_opportunity': {
      // config: { pipelineId, stageId, namePath?, phonePath?, valuePath?, defaultName? }
      const pipelineId = config.pipelineId as string | undefined;
      const stageId = config.stageId as string | undefined;
      if (!pipelineId || !stageId) throw new ReceiverError('CONFIG', 'pipelineId/stageId obrigatórios', 400);

      const phone = (pickPath(payload, config.phonePath as string | undefined) as string | undefined) ?? '';
      const contactName = (pickPath(payload, config.namePath as string | undefined) as string | undefined) ?? (config.defaultName as string | undefined) ?? 'Lead';
      if (!phone) throw new ReceiverError('CONFIG', 'phonePath não resolveu pra um valor', 400);

      // Localiza/cria contato.
      let contact = await prisma.contact.findUnique({ where: { phone } });
      if (!contact) {
        contact = await prisma.contact.create({ data: { name: contactName, phone } });
        eventBus.publish({
          type: 'opportunity.created' as never, // contact.created sintético — cobertura mínima
          entityId: contact.id,
          actorId: 'webhook',
          data: { contactId: contact.id },
        });
      }

      const valueRaw = pickPath(payload, config.valuePath as string | undefined);
      const valueNum = typeof valueRaw === 'number' ? valueRaw : Number(valueRaw ?? 0);

      const titleTpl = (config.titlePath as string | undefined) ?? '';
      const title = (pickPath(payload, titleTpl) as string | undefined) ?? `Lead via webhook — ${contactName}`;

      const created = await prisma.opportunity.create({
        data: {
          title,
          pipelineId,
          stageId,
          contactId: contact.id,
          value: Number.isFinite(valueNum) ? valueNum : 0,
        },
      });
      eventBus.publish({
        type: 'opportunity.created',
        entityId: created.id,
        actorId: 'webhook',
        data: { opportunityId: created.id, contactId: contact.id, pipelineId, stageId },
      });
      return { createdId: created.id, message: 'Oportunidade criada' };
    }

    case 'create_contact': {
      const phone = (pickPath(payload, config.phonePath as string | undefined) as string | undefined) ?? '';
      const name =
        (pickPath(payload, config.namePath as string | undefined) as string | undefined) ??
        (config.defaultName as string | undefined) ??
        'Contato';
      if (!phone) throw new ReceiverError('CONFIG', 'phonePath não resolveu', 400);

      const existing = await prisma.contact.findUnique({ where: { phone } });
      if (existing) {
        return { createdId: existing.id, message: 'Contato já existia' };
      }
      const created = await prisma.contact.create({ data: { name, phone } });
      return { createdId: created.id, message: 'Contato criado' };
    }

    case 'trigger_automation': {
      const automationId = config.automationId as string | undefined;
      if (!automationId) throw new ReceiverError('CONFIG', 'automationId obrigatório', 400);
      const a = await prisma.automation.findUnique({ where: { id: automationId } });
      if (!a) throw new ReceiverError('NOT_FOUND', 'Automação não encontrada', 404);
      // Enfileira execução com o payload como input
      await enqueueExecution({
        automationId,
        triggeredBy: 'webhook',
        event: {
          type: 'webhook.received',
          data: payload,
        } as unknown as Record<string, unknown>,
      });
      return { message: `Automação ${a.name} disparada` };
    }

    case 'add_tag': {
      const tagId = config.tagId as string | undefined;
      const opportunityId = (pickPath(payload, config.opportunityIdPath as string | undefined) as string | undefined) ?? (config.opportunityId as string | undefined);
      if (!tagId || !opportunityId) throw new ReceiverError('CONFIG', 'tagId e opportunityId obrigatórios', 400);
      await prisma.opportunity.update({
        where: { id: opportunityId },
        data: { tags: { connect: { id: tagId } } },
      });
      eventBus.publish({
        type: 'opportunity.tag_added',
        entityId: opportunityId,
        actorId: 'webhook',
        data: { opportunityId, tagId },
      });
      return { createdId: opportunityId, message: 'Tag adicionada' };
    }

    case 'add_note': {
      const opportunityId = (pickPath(payload, config.opportunityIdPath as string | undefined) as string | undefined) ?? (config.opportunityId as string | undefined);
      const text = (pickPath(payload, config.textPath as string | undefined) as string | undefined) ?? (config.text as string | undefined) ?? '';
      if (!opportunityId || !text) throw new ReceiverError('CONFIG', 'opportunityId e textPath/text obrigatórios', 400);
      const op = await prisma.opportunity.findUnique({ where: { id: opportunityId }, select: { description: true } });
      if (!op) throw new ReceiverError('NOT_FOUND', 'Oportunidade não encontrada', 404);
      const stamp = new Date().toISOString();
      const cur = op.description ?? '';
      const next = cur ? `${cur}\n\n[${stamp}] ${text}` : `[${stamp}] ${text}`;
      await prisma.opportunity.update({ where: { id: opportunityId }, data: { description: next } });
      return { createdId: opportunityId, message: 'Nota adicionada' };
    }

    default:
      throw new ReceiverError('UNKNOWN_ACTION', `Action desconhecida: ${actionType}`, 400);
  }
}
