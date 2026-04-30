// Dispatcher OUTBOUND: escuta o eventBus e dispara HTTP requests pra todos os
// webhooks ativos com matching event.
//
// - retry com backoff exponencial (3 tentativas)
// - timeout 30s por chamada
// - render do payloadTemplate via prompt-builder (substitui {{path}})
// - log AutomationLog por execução

import type { FastifyBaseLogger } from 'fastify';
import { prisma, Prisma } from '../../lib/prisma.js';
import { eventBus, type EventPayload } from '../automation/engine/event-bus.js';
import { renderTemplate } from '../automation/ai/prompt-builder.js';
import { VALID_OUTBOUND_EVENTS } from './webhooks.service.js';

let registered = false;

export function registerWebhookDispatcher(log: FastifyBaseLogger) {
  if (registered) return;
  registered = true;

  // Sub em todos os eventos OUTBOUND válidos.
  for (const evType of VALID_OUTBOUND_EVENTS) {
    eventBus.on(evType as never, (event) => {
      void dispatchOutbound(event, log).catch((err) => {
        log.error({ err, eventType: event.type }, 'webhook dispatcher error');
      });
    });
  }
  log.info('webhook dispatcher registered');
}

async function dispatchOutbound(event: EventPayload, log: FastifyBaseLogger) {
  // Webhooks ativos com este event configurado.
  const hooks = await prisma.webhook.findMany({
    where: { type: 'OUTBOUND', active: true, events: { has: event.type } },
  });
  for (const h of hooks) {
    void deliverOne(h, event, log).catch((err) => {
      log.error({ err, webhookId: h.id }, 'webhook deliver fatal');
    });
  }
}

const MAX_ATTEMPTS = 3;
const TIMEOUT_MS = 30_000;

async function deliverOne(
  hook: Prisma.WebhookGetPayload<{}>,
  event: EventPayload,
  log: FastifyBaseLogger,
) {
  const startedAt = new Date();
  const logRow = await prisma.automationLog.create({
    data: {
      type: 'WEBHOOK',
      entityId: hook.id,
      status: 'RUNNING',
      trigger: `outbound:${event.type}`,
      triggeredBy: `event:${event.type}`,
      input: { event } as unknown as Prisma.InputJsonValue,
      startedAt,
    },
  });

  const url = hook.url;
  if (!url) {
    await prisma.automationLog.update({
      where: { id: logRow.id },
      data: { status: 'FAILED', error: 'URL ausente', completedAt: new Date() },
    });
    return;
  }

  // Render payload: se template existir, faz template-replace por scalar value;
  // se for objeto, render recursivo. Sem template, manda { event, data } cru.
  const payload = renderPayload(hook.payloadTemplate, event);

  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const cfgHeaders = (hook.headers ?? {}) as Record<string, string>;
  for (const [k, v] of Object.entries(cfgHeaders)) headers[k] = v;

  const method = (hook.method ?? 'POST').toUpperCase();
  const attempts: { attempt: number; status?: number; error?: string; durationMs: number }[] = [];
  let success = false;
  let lastErr: string | undefined;
  let lastStatus: number | undefined;

  for (let a = 1; a <= MAX_ATTEMPTS; a++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const t0 = Date.now();
    try {
      const res = await fetch(url, {
        method,
        headers,
        body: method === 'GET' || method === 'HEAD' ? undefined : JSON.stringify(payload),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      lastStatus = res.status;
      attempts.push({ attempt: a, status: res.status, durationMs: Date.now() - t0 });
      if (res.ok) {
        success = true;
        break;
      }
      // 4xx (exceto 408/429): não retentamos
      if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
        lastErr = `HTTP ${res.status}`;
        break;
      }
      lastErr = `HTTP ${res.status}`;
    } catch (err) {
      clearTimeout(t);
      const e = err as Error;
      lastErr = e.message;
      attempts.push({ attempt: a, error: e.message, durationMs: Date.now() - t0 });
    }
    // Backoff exponencial com jitter (1s, 3s)
    if (a < MAX_ATTEMPTS) {
      const delay = 1000 * 2 ** (a - 1) + Math.floor(Math.random() * 200);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  await prisma.automationLog.update({
    where: { id: logRow.id },
    data: {
      status: success ? 'SUCCESS' : 'FAILED',
      output: { attempts, finalStatus: lastStatus } as unknown as Prisma.InputJsonValue,
      error: success ? null : lastErr ?? 'falha desconhecida',
      completedAt: new Date(),
      executionTime: Date.now() - startedAt.getTime(),
    },
  });

  if (!success) {
    log.warn(
      { webhookId: hook.id, url, lastErr, attempts: attempts.length },
      'webhook outbound failed after retries',
    );
  }
}

// Render recursivo: strings passam por renderTemplate({{path}}); objetos
// recursam; outros tipos preservam. Se template for nulo, monta default.
function renderPayload(template: Prisma.JsonValue | null, event: EventPayload): unknown {
  if (template === null || template === undefined) {
    return { event: event.type, entityId: event.entityId, ts: event.ts, data: event.data };
  }
  const scope = { event: event.data, eventType: event.type, entityId: event.entityId, ts: event.ts } as Record<string, unknown>;
  return walk(template as unknown, scope);
}

function walk(node: unknown, scope: Record<string, unknown>): unknown {
  if (typeof node === 'string') return renderTemplate(node, scope);
  if (Array.isArray(node)) return node.map((n) => walk(n, scope));
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      out[k] = walk(v, scope);
    }
    return out;
  }
  return node;
}

// Disparo manual (botão "Testar disparo" na UI).
export async function testWebhookDispatch(
  webhookId: string,
  fakeEventPayload?: Record<string, unknown>,
  log?: FastifyBaseLogger,
): Promise<{ ok: boolean; status?: number; error?: string; durationMs: number }> {
  const w = await prisma.webhook.findUnique({ where: { id: webhookId } });
  if (!w || w.type !== 'OUTBOUND' || !w.url) {
    return { ok: false, error: 'webhook OUTBOUND inválido', durationMs: 0 };
  }
  const event: EventPayload = {
    type: (fakeEventPayload?.type as never) ?? 'opportunity.created',
    entityId: (fakeEventPayload?.entityId as string | undefined) ?? 'test',
    actorId: 'manual-test',
    data: (fakeEventPayload?.data as Record<string, unknown> | undefined) ?? { test: true },
    ts: Date.now(),
  };
  const payload = renderPayload(w.payloadTemplate, event);
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const cfgHeaders = (w.headers ?? {}) as Record<string, string>;
  for (const [k, v] of Object.entries(cfgHeaders)) headers[k] = v;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const t0 = Date.now();
  try {
    const res = await fetch(w.url, {
      method: (w.method ?? 'POST').toUpperCase(),
      headers,
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    return { ok: res.ok, status: res.status, durationMs: Date.now() - t0 };
  } catch (err) {
    clearTimeout(t);
    log?.warn({ err }, 'test webhook failed');
    return { ok: false, error: (err as Error).message, durationMs: Date.now() - t0 };
  }
}
