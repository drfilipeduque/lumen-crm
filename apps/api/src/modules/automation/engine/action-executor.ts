// Executa um nó do tipo "action".
//
// Convenções:
// - retorno normal vira `step[nodeId] = { ...result }` no contexto
// - "wait" sinaliza pausa: o flow-runner enfileira continuação no BullMQ
// - falhas lançam ActionExecutionError; o runner decide retry/persistência

import { prisma } from '../../../lib/prisma.js';
import { renderTemplate } from '../ai/prompt-builder.js';
import { eventBus } from './event-bus.js';
import { runAIAction } from './ai-actions.js';
import type { ExecutionContext } from './context.js';

export class ActionExecutionError extends Error {
  retryable: boolean;
  constructor(message: string, retryable = true) {
    super(message);
    this.retryable = retryable;
  }
}

export type ActionResult =
  | { kind: 'ok'; output: Record<string, unknown> }
  | { kind: 'wait'; delayMs: number };

type ActionConfig = Record<string, unknown>;

// Renderiza recursivamente {{...}} em strings dentro do config.
function renderConfig<T>(config: T, ctx: ExecutionContext): T {
  if (typeof config === 'string') return renderTemplate(config, ctx as unknown as Record<string, unknown>) as unknown as T;
  if (Array.isArray(config)) return config.map((v) => renderConfig(v, ctx)) as unknown as T;
  if (config && typeof config === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(config as Record<string, unknown>)) {
      out[k] = renderConfig(v, ctx);
    }
    return out as unknown as T;
  }
  return config;
}

const SYSTEM_ACTOR = { id: 'system', role: 'ADMIN' };

export async function executeAction(
  subtype: string,
  rawConfig: ActionConfig,
  ctx: ExecutionContext,
): Promise<ActionResult> {
  const cfg = renderConfig(rawConfig, ctx);

  // Em dry-run, não persistimos nada — só simulamos retorno.
  if (ctx.dryRun) {
    return { kind: 'ok', output: { dryRun: true, subtype, config: cfg } };
  }

  // Despacha pra ai-actions os subtypes de IA.
  if (subtype.startsWith('ai_')) {
    const out = await runAIAction(subtype, cfg, ctx);
    return { kind: 'ok', output: out };
  }

  switch (subtype) {
    case 'send_whatsapp_message': {
      const text = cfg.text as string | undefined;
      const scriptId = cfg.scriptId as string | undefined;
      const mediaUrl = cfg.mediaUrl as string | undefined;
      let body = text ?? '';
      if (scriptId) {
        const s = await prisma.script.findUnique({ where: { id: scriptId } });
        if (s) body = renderTemplate(s.content, ctx as unknown as Record<string, unknown>);
      }
      const fallback = (cfg.fallback as Record<string, unknown> | undefined) ?? {};
      const { resolveSendCandidates } = await import('./whatsapp-router.js');
      const candidates = await resolveSendCandidates({
        ctx,
        conversationId: cfg.conversationId as string | undefined,
        connectionStrategy: cfg.connectionStrategy as 'DEFAULT' | 'SPECIFIC' | 'TYPE_PREFERRED' | undefined,
        connectionId: cfg.connectionId as string | undefined,
        preferredType: cfg.preferredType as 'OFFICIAL' | 'UNOFFICIAL' | undefined,
      });
      if (candidates.length === 0) {
        throw new ActionExecutionError('send_whatsapp_message: nenhuma conexão/conversa elegível', false);
      }
      const path: { conversationId: string; connectionId: string; outcome: string }[] = [];
      const fbToOther = Boolean(fallback.fallbackToOtherConnection);
      const tryUseTemplate = Boolean(fallback.useTemplate);
      const fbTemplateId = fallback.templateId as string | undefined;
      const fbTemplateVars = (fallback.templateVariables as Record<string, string> | undefined) ?? {};
      const { sendMessageToConversation } = await import('../../whatsapp/baileys/message.service.js');
      const { loadConvForSend, sendTemplateViaMeta, MetaSendError } = await import('../../whatsapp/meta/send.service.js');

      const ordered = fbToOther ? candidates : candidates.slice(0, 1);
      for (const cand of ordered) {
        try {
          const sent = await sendMessageToConversation(SYSTEM_ACTOR, cand.conversationId, {
            type: mediaUrl ? 'IMAGE' : 'TEXT',
            content: body || null,
            mediaUrl: mediaUrl ?? null,
          });
          path.push({ conversationId: cand.conversationId, connectionId: cand.connectionId, outcome: 'sent' });
          return {
            kind: 'ok',
            output: {
              messageId: (sent as { id?: string })?.id,
              connectionId: cand.connectionId,
              connectionType: cand.connectionType,
              path,
            },
          };
        } catch (e) {
          const err = e as { code?: string; message?: string };
          path.push({ conversationId: cand.conversationId, connectionId: cand.connectionId, outcome: `failed:${err?.code ?? 'unknown'}` });
          // Janela 24h fechada na Meta + fallback de template configurado
          const isWindowClosed = err?.code === 'WINDOW_CLOSED' && cand.connectionType === 'OFFICIAL';
          if (isWindowClosed && tryUseTemplate && fbTemplateId) {
            try {
              const conv = await loadConvForSend(cand.conversationId);
              if (conv) {
                const sent = await sendTemplateViaMeta(conv, fbTemplateId, fbTemplateVars);
                path.push({ conversationId: cand.conversationId, connectionId: cand.connectionId, outcome: 'template_fallback' });
                return {
                  kind: 'ok',
                  output: {
                    messageId: (sent as { id?: string })?.id,
                    connectionId: cand.connectionId,
                    fallback: 'template',
                    path,
                  },
                };
              }
            } catch (tplErr) {
              const te = tplErr as { code?: string };
              path.push({ conversationId: cand.conversationId, connectionId: cand.connectionId, outcome: `template_failed:${te?.code ?? 'unknown'}` });
              if (tplErr instanceof MetaSendError) {
                // continua pro próximo candidate
              }
            }
          }
          // Sem fallbackToOtherConnection: relança o erro original
          if (!fbToOther) {
            throw new ActionExecutionError(
              `send_whatsapp_message: ${err?.message ?? 'falha no envio'}`,
              true,
            );
          }
        }
      }
      throw new ActionExecutionError(
        `send_whatsapp_message: todas as ${ordered.length} tentativas falharam (path=${JSON.stringify(path)})`,
        true,
      );
    }

    case 'send_whatsapp_template': {
      const templateId = cfg.templateId as string | undefined;
      const variables = (cfg.variables as Record<string, string> | undefined) ?? {};
      if (!templateId) throw new ActionExecutionError('send_whatsapp_template: templateId ausente', false);
      const { resolveSendCandidates } = await import('./whatsapp-router.js');
      const candidates = await resolveSendCandidates({
        ctx,
        conversationId: cfg.conversationId as string | undefined,
        connectionStrategy: (cfg.connectionStrategy as 'DEFAULT' | 'SPECIFIC' | 'TYPE_PREFERRED' | undefined) ?? 'SPECIFIC',
        connectionId: cfg.connectionId as string | undefined,
        preferredType: cfg.preferredType as 'OFFICIAL' | 'UNOFFICIAL' | undefined,
      });
      // Templates só fazem sentido na conexão OFFICIAL
      const officialOnly = candidates.filter((c) => c.connectionType === 'OFFICIAL');
      if (officialOnly.length === 0) {
        throw new ActionExecutionError('send_whatsapp_template: nenhuma conexão Meta Oficial elegível', false);
      }
      const { loadConvForSend, sendTemplateViaMeta } = await import('../../whatsapp/meta/send.service.js');
      const cand = officialOnly[0]!;
      const conv = await loadConvForSend(cand.conversationId);
      if (!conv) throw new ActionExecutionError('send_whatsapp_template: conversa não encontrada', false);
      const sent = await sendTemplateViaMeta(conv, templateId, variables);
      return {
        kind: 'ok',
        output: {
          messageId: (sent as { id?: string })?.id,
          connectionId: cand.connectionId,
        },
      };
    }

    case 'move_stage': {
      const op = ctx.opportunity;
      const stageId = cfg.stageId as string | undefined;
      if (!op || !stageId) throw new ActionExecutionError('move_stage: opportunity/stageId ausente', false);
      await prisma.opportunity.update({ where: { id: op.id }, data: { stageId } });
      eventBus.publish({
        type: 'opportunity.stage_changed',
        entityId: op.id,
        actorId: 'automation',
        data: { opportunityId: op.id, fromStageId: op.stageId, toStageId: stageId },
      });
      return { kind: 'ok', output: { stageId } };
    }

    case 'add_tag': {
      const op = ctx.opportunity;
      const tagId = cfg.tagId as string | undefined;
      if (!op || !tagId) throw new ActionExecutionError('add_tag: opportunity/tagId ausente', false);
      await prisma.opportunity.update({
        where: { id: op.id },
        data: { tags: { connect: { id: tagId } } },
      });
      eventBus.publish({
        type: 'opportunity.tag_added',
        entityId: op.id,
        actorId: 'automation',
        data: { opportunityId: op.id, tagId },
      });
      return { kind: 'ok', output: { tagId } };
    }

    case 'remove_tag': {
      const op = ctx.opportunity;
      const tagId = cfg.tagId as string | undefined;
      if (!op || !tagId) throw new ActionExecutionError('remove_tag: opportunity/tagId ausente', false);
      await prisma.opportunity.update({
        where: { id: op.id },
        data: { tags: { disconnect: { id: tagId } } },
      });
      eventBus.publish({
        type: 'opportunity.tag_removed',
        entityId: op.id,
        actorId: 'automation',
        data: { opportunityId: op.id, tagId },
      });
      return { kind: 'ok', output: { tagId } };
    }

    case 'assign_owner':
    case 'transfer_owner': {
      const op = ctx.opportunity;
      const ownerId = cfg.ownerId as string | undefined;
      if (!op || !ownerId) throw new ActionExecutionError(`${subtype}: opportunity/ownerId ausente`, false);
      await prisma.opportunity.update({ where: { id: op.id }, data: { ownerId } });
      eventBus.publish({
        type: 'opportunity.owner_changed',
        entityId: op.id,
        actorId: 'automation',
        data: { opportunityId: op.id, fromOwnerId: op.ownerId, toOwnerId: ownerId },
      });
      return { kind: 'ok', output: { ownerId } };
    }

    case 'unassign_owner': {
      const op = ctx.opportunity;
      if (!op) throw new ActionExecutionError('unassign_owner: opportunity ausente', false);
      await prisma.opportunity.update({ where: { id: op.id }, data: { ownerId: null } });
      eventBus.publish({
        type: 'opportunity.owner_changed',
        entityId: op.id,
        actorId: 'automation',
        data: { opportunityId: op.id, fromOwnerId: op.ownerId, toOwnerId: null },
      });
      return { kind: 'ok', output: { ownerId: null } };
    }

    case 'create_reminder': {
      const op = ctx.opportunity;
      if (!op) throw new ActionExecutionError('create_reminder: opportunity ausente', false);
      const title = (cfg.title as string | undefined) ?? 'Lembrete';
      const userId = (cfg.userId as string | undefined) ?? op.ownerId;
      if (!userId) throw new ActionExecutionError('create_reminder: userId ausente', false);
      const dueAtCfg = cfg.dueAt as string | undefined;
      const dueIn = Number(cfg.dueInMinutes ?? 60);
      const dueAt = dueAtCfg ? new Date(dueAtCfg) : new Date(Date.now() + dueIn * 60_000);
      const r = await prisma.reminder.create({
        data: { title, opportunityId: op.id, userId, dueAt },
      });
      return { kind: 'ok', output: { reminderId: r.id } };
    }

    case 'change_priority': {
      const op = ctx.opportunity;
      const priority = cfg.priority as string | undefined;
      if (!op || !priority) throw new ActionExecutionError('change_priority: opportunity/priority ausente', false);
      await prisma.opportunity.update({ where: { id: op.id }, data: { priority: priority as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' } });
      eventBus.publish({
        type: 'opportunity.priority_changed',
        entityId: op.id,
        actorId: 'automation',
        data: { opportunityId: op.id, priority },
      });
      return { kind: 'ok', output: { priority } };
    }

    case 'update_custom_field': {
      const op = ctx.opportunity;
      const fieldId = cfg.fieldId as string | undefined;
      const value = String(cfg.value ?? '');
      if (!op || !fieldId) throw new ActionExecutionError('update_custom_field: opportunity/fieldId ausente', false);
      await prisma.customFieldValue.upsert({
        where: { customFieldId_opportunityId: { customFieldId: fieldId, opportunityId: op.id } },
        update: { value },
        create: { customFieldId: fieldId, opportunityId: op.id, value },
      });
      eventBus.publish({
        type: 'opportunity.field_updated',
        entityId: op.id,
        actorId: 'automation',
        data: { opportunityId: op.id, customFieldId: fieldId, value },
      });
      return { kind: 'ok', output: { fieldId, value } };
    }

    case 'create_opportunity': {
      const pipelineId = cfg.pipelineId as string | undefined;
      const stageId = cfg.stageId as string | undefined;
      const contactId = (cfg.contactId as string | undefined) ?? ctx.contact?.id;
      const title = (cfg.title as string | undefined) ?? 'Nova oportunidade';
      if (!pipelineId || !stageId || !contactId) {
        throw new ActionExecutionError('create_opportunity: pipelineId/stageId/contactId ausente', false);
      }
      const o = await prisma.opportunity.create({
        data: {
          title,
          pipelineId,
          stageId,
          contactId,
          value: cfg.value !== undefined ? Number(cfg.value) : 0,
          priority: (cfg.priority as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' | undefined) ?? 'MEDIUM',
        },
      });
      eventBus.publish({
        type: 'opportunity.created',
        entityId: o.id,
        actorId: 'automation',
        data: { opportunityId: o.id, contactId, pipelineId, stageId },
      });
      return { kind: 'ok', output: { opportunityId: o.id } };
    }

    case 'create_note': {
      const op = ctx.opportunity;
      const text = (cfg.text as string | undefined) ?? '';
      if (!op) throw new ActionExecutionError('create_note: opportunity ausente', false);
      const stamp = new Date().toISOString();
      const cur = op.description ?? '';
      const next = cur ? `${cur}\n\n[${stamp}] ${text}` : `[${stamp}] ${text}`;
      await prisma.opportunity.update({ where: { id: op.id }, data: { description: next } });
      return { kind: 'ok', output: { note: text } };
    }

    case 'transfer_to_pipeline': {
      const op = ctx.opportunity;
      if (!op) throw new ActionExecutionError('transfer_to_pipeline: opportunity ausente', false);
      const targetPipelineId = cfg.targetPipelineId as string | undefined;
      const targetStageId = cfg.targetStageId as string | undefined;
      if (!targetPipelineId || !targetStageId) {
        throw new ActionExecutionError('transfer_to_pipeline: targetPipelineId/targetStageId ausente', false);
      }
      const { transferOpportunity } = await import('../../opportunities/opportunities.service.js');
      const r = await transferOpportunity(SYSTEM_ACTOR, op.id, {
        targetPipelineId,
        targetStageId,
        customFieldStrategy: cfg.customFieldStrategy as 'KEEP_COMPATIBLE' | 'DISCARD_ALL' | 'MAP' | undefined,
        fieldMapping: cfg.fieldMapping as { fromCustomFieldId: string; toCustomFieldId: string }[] | undefined,
        keepHistory: cfg.keepHistory as boolean | undefined,
        keepTags: cfg.keepTags as boolean | undefined,
        keepReminders: cfg.keepReminders as boolean | undefined,
        keepFiles: cfg.keepFiles as boolean | undefined,
      });
      return { kind: 'ok', output: { ...r } };
    }

    case 'resolve_conversation': {
      const cfgConvId = cfg.conversationId as string | undefined;
      const convId = cfgConvId ?? (ctx.message?.conversationId as string | undefined);
      if (!convId) throw new ActionExecutionError('resolve_conversation: conversationId ausente', false);
      const sendFinal = Boolean(cfg.sendFinalMessage);
      const finalText = (cfg.finalMessageContent as string | undefined) ?? '';
      let finalMessageId: string | null = null;
      if (sendFinal && finalText.trim()) {
        const { sendMessageToConversation } = await import('../../whatsapp/baileys/message.service.js');
        try {
          const sent = await sendMessageToConversation(SYSTEM_ACTOR, convId, {
            type: 'TEXT',
            content: finalText,
          });
          finalMessageId = (sent as { id?: string })?.id ?? null;
        } catch (e) {
          // Não bloqueia a resolução por falha no envio — registra no output.
          finalMessageId = null;
          console.warn('[automation] resolve_conversation: envio final falhou', (e as Error)?.message);
        }
      }
      await prisma.conversation.update({
        where: { id: convId },
        data: { status: 'RESOLVED', unreadCount: 0 },
      });
      eventBus.publish({
        type: 'conversation.resolved',
        entityId: convId,
        actorId: 'automation',
        data: { conversationId: convId, finalMessageId },
      });
      return { kind: 'ok', output: { conversationId: convId, finalMessageId } };
    }

    case 'send_webhook': {
      const url = cfg.url as string | undefined;
      if (!url) throw new ActionExecutionError('send_webhook: url ausente', false);
      const method = ((cfg.method as string | undefined) ?? 'POST').toUpperCase();
      const headers = (cfg.headers as Record<string, string> | undefined) ?? {};
      const body = cfg.body !== undefined ? cfg.body : { event: ctx.event, opportunityId: ctx.opportunity?.id };
      const res = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json', ...headers },
        body: method === 'GET' || method === 'HEAD' ? undefined : JSON.stringify(body),
      });
      const ok = res.ok;
      if (!ok) throw new ActionExecutionError(`send_webhook: HTTP ${res.status}`, true);
      return { kind: 'ok', output: { status: res.status } };
    }

    case 'wait': {
      const minutes = Number(cfg.minutes ?? 0);
      const hours = Number(cfg.hours ?? 0);
      const days = Number(cfg.days ?? 0);
      const delayMs = minutes * 60_000 + hours * 3_600_000 + days * 86_400_000;
      if (delayMs <= 0) return { kind: 'ok', output: { skipped: true } };
      return { kind: 'wait', delayMs };
    }

    case 'notify_user': {
      // Delivery interna via socket.io (best-effort). Persistência fica pra um
      // futuro Notification model se necessário.
      const userId = cfg.userId as string | undefined;
      const title = (cfg.title as string | undefined) ?? 'Notificação';
      const message = (cfg.message as string | undefined) ?? '';
      if (!userId) throw new ActionExecutionError('notify_user: userId ausente', false);
      const { emitToUser } = await import('../../../lib/realtime.js');
      emitToUser(userId, 'automation:notify', { title, message, automationId: ctx.automationId });
      return { kind: 'ok', output: { userId, title } };
    }

    default:
      throw new ActionExecutionError(`Action subtype desconhecido: ${subtype}`, false);
  }
}
