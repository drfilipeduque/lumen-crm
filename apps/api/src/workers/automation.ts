// Workers BullMQ pro motor de automation.
// - automation-execution: dispara um fluxo do início (a partir de evento)
// - scheduled-actions:    retoma um fluxo após `wait`
// - cron-checks:          tick periódico (1 min) que cria eventos sintéticos
//                         pra triggers cron-based: stale, inactive, due_date, scheduled

import type { FastifyBaseLogger } from 'fastify';
import { Worker } from 'bullmq';
import { redis } from '../lib/redis.js';
import { prisma } from '../lib/prisma.js';
import {
  QUEUE_AUTOMATION_EXECUTION,
  QUEUE_SCHEDULED_ACTIONS,
  QUEUE_CRON_CHECKS,
  cronChecksQueue,
  type ExecutionJobPayload,
  type CronJobPayload,
} from '../modules/automation/queues.js';
import {
  executeAutomationFromQueue,
  registerEventBridge,
} from '../modules/automation/automation.service.js';
import type { ExecutionContext } from '../modules/automation/engine/context.js';
import type { EventPayload } from '../modules/automation/engine/event-bus.js';
import { eventBus } from '../modules/automation/engine/event-bus.js';

let started = false;

export function startAutomationEngine(log: FastifyBaseLogger) {
  if (started) return;
  started = true;
  registerEventBridge(log);
  log.info('automation engine: event bridge registered');

  // ---------------- automation-execution ----------------
  const execWorker = new Worker<ExecutionJobPayload>(
    QUEUE_AUTOMATION_EXECUTION,
    async (job) => {
      const { automationId, triggeredBy, event, resumeFromNodeId, logId, contextSnapshot } = job.data;
      await executeAutomationFromQueue(automationId, triggeredBy, {
        event: event as EventPayload | undefined,
        resumeFromNodeId,
        logId,
        contextSnapshot: contextSnapshot as unknown as ExecutionContext | undefined,
      });
    },
    { connection: redis, concurrency: 4 },
  );
  execWorker.on('failed', (job, err) => {
    log.warn({ jobId: job?.id, automationId: job?.data?.automationId, err: err.message }, 'automation execution failed');
  });

  // ---------------- scheduled-actions (resume após wait) ----------------
  const resumeWorker = new Worker<ExecutionJobPayload>(
    QUEUE_SCHEDULED_ACTIONS,
    async (job) => {
      const { automationId, triggeredBy, event, resumeFromNodeId, logId, contextSnapshot } = job.data;
      await executeAutomationFromQueue(automationId, triggeredBy, {
        event: event as EventPayload | undefined,
        resumeFromNodeId,
        logId,
        contextSnapshot: contextSnapshot as unknown as ExecutionContext | undefined,
      });
    },
    { connection: redis, concurrency: 4 },
  );
  resumeWorker.on('failed', (job, err) => {
    log.warn({ jobId: job?.id, err: err.message }, 'automation resume failed');
  });

  // ---------------- cron-checks (tick periódico) ----------------
  const cronWorker = new Worker<CronJobPayload>(
    QUEUE_CRON_CHECKS,
    async (job) => {
      await runCronTick(job.data.kind, log);
    },
    { connection: redis, concurrency: 1 },
  );
  cronWorker.on('failed', (job, err) => {
    log.warn({ jobId: job?.id, err: err.message }, 'cron check failed');
  });

  // Repeating job: a cada 60s
  void cronChecksQueue.add(
    'tick',
    { kind: 'tick' },
    { repeat: { every: 60_000 }, jobId: 'cron-tick' },
  );

  log.info('automation workers started (execution, resume, cron)');
}

// ============================================================================
// CRON TRIGGERS
// ============================================================================

// Disparado a cada minuto. Avalia todas as automations cron-based ativas e
// dispara via eventBus.publish — quem ouve é o próprio bridge do engine.
//
// Triggers cron suportados:
//   opportunity_stale_in_stage  cfg: { stageId?, days, hours, minutes }
//     publica synthetic "opportunity.stage_changed" com matcher? Não — usamos
//     evento dedicado "opportunity.cron.stale" e mapeamos pra triggerType direto.
//   opportunity_inactive        cfg: { days, hours }
//   due_date_approaching        cfg: { withinHours }
//   scheduled                   cfg: { cron: "0 9 * * *" } — simplificado por agora:
//                                cfg: { hour: 9, minute: 0, dayOfWeek?: number }
async function runCronTick(_kind: string, log: FastifyBaseLogger) {
  // Pega todas as automations cron ativas. Como triggerType é denormalizado, fica direto.
  const cronTriggers = [
    'opportunity_stale_in_stage',
    'opportunity_inactive',
    'due_date_approaching',
    'scheduled',
    'message_unanswered',
  ];
  const list = await prisma.automation.findMany({
    where: { active: true, triggerType: { in: cronTriggers } },
    select: { id: true, triggerType: true, triggerConfig: true, flow: true },
  });

  const now = new Date();
  for (const a of list) {
    try {
      const cfg = (a.triggerConfig as Record<string, unknown> | null) ?? {};
      switch (a.triggerType) {
        case 'opportunity_stale_in_stage': {
          const pipelineId = cfg.pipelineId as string | undefined;
          const stageId = cfg.stageId as string | undefined;
          const minutes = Number(cfg.minutes ?? 0) + Number(cfg.hours ?? 0) * 60 + Number(cfg.days ?? 0) * 1440;
          if (minutes <= 0) continue;
          const cutoff = new Date(now.getTime() - minutes * 60_000);
          const ops = await prisma.opportunity.findMany({
            where: {
              pipelineId: pipelineId ?? undefined,
              stageId: stageId ?? undefined,
              updatedAt: { lt: cutoff },
            },
            select: { id: true, contactId: true, pipelineId: true, stageId: true },
            take: 100,
          });
          for (const op of ops) {
            // Reusa o trigger via "matchesTriggerConfig" não bate aqui, então
            // disparamos direto com triggeredBy="cron".
            await fireDirect(a.id, 'cron:stale', {
              type: 'opportunity.cron.stale' as never,
              entityId: op.id,
              data: { opportunityId: op.id, contactId: op.contactId, pipelineId: op.pipelineId, stageId: op.stageId },
            });
          }
          break;
        }
        case 'opportunity_inactive': {
          // Sem mensagem nem update há X tempo
          const pipelineId = cfg.pipelineId as string | undefined;
          const stageId = cfg.stageId as string | undefined;
          const minutes = Number(cfg.minutes ?? 0) + Number(cfg.hours ?? 0) * 60 + Number(cfg.days ?? 0) * 1440;
          if (minutes <= 0) continue;
          const cutoff = new Date(now.getTime() - minutes * 60_000);
          const ops = await prisma.opportunity.findMany({
            where: {
              pipelineId: pipelineId ?? undefined,
              stageId: stageId ?? undefined,
              updatedAt: { lt: cutoff },
            },
            select: { id: true, contactId: true, pipelineId: true, stageId: true },
            take: 100,
          });
          for (const op of ops) {
            await fireDirect(a.id, 'cron:inactive', {
              type: 'opportunity.cron.inactive' as never,
              entityId: op.id,
              data: { opportunityId: op.id, contactId: op.contactId, pipelineId: op.pipelineId, stageId: op.stageId },
            });
          }
          break;
        }
        case 'due_date_approaching': {
          const pipelineId = cfg.pipelineId as string | undefined;
          const stageId = cfg.stageId as string | undefined;
          const within = Number(cfg.withinHours ?? 24);
          const upper = new Date(now.getTime() + within * 3_600_000);
          const ops = await prisma.opportunity.findMany({
            where: {
              pipelineId: pipelineId ?? undefined,
              stageId: stageId ?? undefined,
              dueDate: { gte: now, lte: upper },
            },
            select: { id: true, contactId: true, pipelineId: true, stageId: true },
            take: 100,
          });
          for (const op of ops) {
            await fireDirect(a.id, 'cron:due', {
              type: 'opportunity.cron.due' as never,
              entityId: op.id,
              data: { opportunityId: op.id, contactId: op.contactId, pipelineId: op.pipelineId, stageId: op.stageId },
            });
          }
          break;
        }
        case 'scheduled': {
          const hour = Number(cfg.hour ?? -1);
          const minute = Number(cfg.minute ?? -1);
          const dow = cfg.dayOfWeek as number | undefined;
          // Process.env.TZ=America/Sao_Paulo (setado em env.ts) garante que
          // getHours/getMinutes/getDay já retornam horário de Brasília.
          const ok =
            now.getHours() === hour &&
            now.getMinutes() === minute &&
            (dow === undefined || now.getDay() === dow);
          if (!ok) continue;
          await fireDirect(a.id, 'cron:scheduled', {
            type: 'scheduled' as never,
            data: {},
          });
          break;
        }
        case 'message_unanswered': {
          // Detecta conversas onde a última mensagem foi enviada num dos lados
          // e ninguém respondeu há `hours` horas.
          const hours = Number(cfg.hours ?? 0);
          if (hours <= 0) continue;
          const direction = (cfg.direction as 'CLIENT_WAITING' | 'US_WAITING' | undefined) ?? 'US_WAITING';
          const cfgConnId = cfg.connectionId as string | undefined;
          const cfgConnType = cfg.connectionType as 'OFFICIAL' | 'UNOFFICIAL' | undefined;
          const cutoff = new Date(now.getTime() - hours * 3_600_000);

          // Direction:
          //   US_WAITING       → última msg foi nossa (fromMe=true), cliente sumiu
          //   CLIENT_WAITING   → última msg foi do cliente (fromMe=false), nós sumimos
          const lastFromMe = direction === 'US_WAITING';
          const convs = await prisma.conversation.findMany({
            where: {
              status: 'OPEN',
              lastMessageAt: { lt: cutoff },
              ...(cfgConnId ? { connectionId: cfgConnId } : {}),
              ...(cfgConnType ? { connection: { type: cfgConnType } } : {}),
            },
            select: {
              id: true,
              contactId: true,
              connectionId: true,
              lastMessageAt: true,
              connection: { select: { type: true } },
              messages: {
                orderBy: { createdAt: 'desc' },
                take: 1,
                select: { id: true, fromMe: true, createdAt: true },
              },
            },
            take: 200,
          });

          for (const conv of convs) {
            const last = conv.messages[0];
            if (!last) continue;
            if (last.fromMe !== lastFromMe) continue;
            // Idempotência via Redis: 1 disparo por conversation + automation
            // a cada janela de `hours`. TTL = hours*3600s mais um buffer.
            const dedupeKey = `cron:msg-unanswered:${a.id}:${conv.id}:${last.id}`;
            const set = await redis.set(dedupeKey, '1', 'EX', Math.max(60, hours * 3600), 'NX');
            if (set !== 'OK') continue;
            await fireDirect(a.id, 'cron:message-unanswered', {
              type: 'message.unanswered' as never,
              entityId: conv.id,
              data: {
                conversationId: conv.id,
                contactId: conv.contactId,
                connectionId: conv.connectionId,
                connectionType: conv.connection.type,
                direction,
                lastMessageId: last.id,
                lastMessageAt: last.createdAt.toISOString(),
                hours,
              },
            });
          }
          break;
        }
      }
    } catch (err) {
      log.error({ err, automationId: a.id }, 'cron eval failed');
    }
  }
}

async function fireDirect(automationId: string, triggeredBy: string, event: EventPayload) {
  const { enqueueExecution } = await import('../modules/automation/queues.js');
  await enqueueExecution({
    automationId,
    triggeredBy,
    event: event as unknown as Record<string, unknown>,
  });
}

// Reexpose pra usar em testes manuais
export { eventBus };
