// Resolve qual conversa/conexão usar pra enviar mensagem em automações,
// e tenta uma sequência de candidatos em caso de fallback.
//
// Estratégias:
//   DEFAULT          → conversa do trigger ou primeira ativa do contact
//   SPECIFIC         → conexão específica (precisa ter conversation prévia
//                      com o contato — não criamos uma do zero)
//   TYPE_PREFERRED   → primeira ativa do tipo preferido; fallback pro outro tipo
//
// Fallback adicional (se enabled):
//   - useTemplate     → quando janela 24h fechou na Meta, dispara template
//   - fallbackToOtherConnection → tenta próxima conexão ativa
//
// Singleton de configuração global (WhatsAppRoutingConfig) é consultado
// pra defaults quando a action não preenche.

import { prisma } from '../../../lib/prisma.js';
import type { ExecutionContext } from './context.js';

export type ConnectionStrategy = 'DEFAULT' | 'SPECIFIC' | 'TYPE_PREFERRED';

export type WhatsAppFallbackConfig = {
  enabled?: boolean;
  useTemplate?: boolean;
  templateId?: string;
  templateVariables?: Record<string, string>;
  fallbackToOtherConnection?: boolean;
};

export type SendCandidate = {
  conversationId: string;
  connectionId: string;
  connectionType: 'OFFICIAL' | 'UNOFFICIAL';
};

export type ResolveInput = {
  ctx: ExecutionContext;
  // Override explícito vindo da config da action
  conversationId?: string;
  connectionStrategy?: ConnectionStrategy;
  connectionId?: string;
  preferredType?: 'OFFICIAL' | 'UNOFFICIAL';
};

export async function resolveSendCandidates(input: ResolveInput): Promise<SendCandidate[]> {
  const { ctx } = input;

  // Conversa explícita no config tem prioridade absoluta.
  if (input.conversationId) {
    const c = await loadConvCandidate(input.conversationId);
    if (c) return [c];
  }

  // Conversa do trigger (ex: gatilho de mensagem recebida)
  const triggerConvId = ctx.message?.conversationId;
  const strategy: ConnectionStrategy = input.connectionStrategy ?? 'DEFAULT';

  // Resolve contactId pra buscar conversas alternativas
  const contactId = ctx.contact?.id ?? ctx.opportunity?.contactId ?? null;

  if (strategy === 'SPECIFIC') {
    if (!input.connectionId) return [];
    if (!contactId) {
      // Sem contactId, mas se vem do trigger, valida se é a mesma conexão.
      if (triggerConvId) {
        const c = await loadConvCandidate(triggerConvId);
        if (c && c.connectionId === input.connectionId) return [c];
      }
      return [];
    }
    const conv = await prisma.conversation.findUnique({
      where: { contactId_connectionId: { contactId, connectionId: input.connectionId } },
      select: { id: true, connectionId: true, connection: { select: { type: true, active: true, status: true } } },
    });
    if (!conv || !conv.connection.active) return [];
    return [
      {
        conversationId: conv.id,
        connectionId: conv.connectionId,
        connectionType: conv.connection.type,
      },
    ];
  }

  if (strategy === 'TYPE_PREFERRED') {
    if (!contactId) return triggerConvId ? await loadOne(triggerConvId) : [];
    const preferred = input.preferredType ?? 'OFFICIAL';
    const all = await listContactConversations(contactId);
    const sorted = [
      ...all.filter((c) => c.connectionType === preferred),
      ...all.filter((c) => c.connectionType !== preferred),
    ];
    return sorted;
  }

  // DEFAULT: conversa do trigger se houver, senão singleton, senão primeira ativa do contact
  if (triggerConvId) {
    const c = await loadConvCandidate(triggerConvId);
    if (c) return [c];
  }

  // Tenta usar a conexão padrão configurada globalmente
  const cfg = await prisma.whatsAppRoutingConfig.findUnique({ where: { id: 'default' } });
  if (cfg?.defaultConnectionId && contactId) {
    const conv = await prisma.conversation.findUnique({
      where: { contactId_connectionId: { contactId, connectionId: cfg.defaultConnectionId } },
      select: { id: true, connectionId: true, connection: { select: { type: true, active: true, status: true } } },
    });
    if (conv && conv.connection.active) {
      return [
        {
          conversationId: conv.id,
          connectionId: conv.connectionId,
          connectionType: conv.connection.type,
        },
      ];
    }
  }

  if (!contactId) return [];

  // Strategy padrão considera defaultStrategy do singleton, se houver
  const defaultStrategy = cfg?.defaultStrategy ?? null;
  const all = await listContactConversations(contactId);
  if (!defaultStrategy) return all;
  if (defaultStrategy === 'OFFICIAL_ONLY') return all.filter((c) => c.connectionType === 'OFFICIAL');
  if (defaultStrategy === 'UNOFFICIAL_ONLY') return all.filter((c) => c.connectionType === 'UNOFFICIAL');
  if (defaultStrategy === 'OFFICIAL_FIRST') {
    return [
      ...all.filter((c) => c.connectionType === 'OFFICIAL'),
      ...all.filter((c) => c.connectionType === 'UNOFFICIAL'),
    ];
  }
  // UNOFFICIAL_FIRST
  return [
    ...all.filter((c) => c.connectionType === 'UNOFFICIAL'),
    ...all.filter((c) => c.connectionType === 'OFFICIAL'),
  ];
}

async function loadOne(conversationId: string): Promise<SendCandidate[]> {
  const c = await loadConvCandidate(conversationId);
  return c ? [c] : [];
}

async function loadConvCandidate(conversationId: string): Promise<SendCandidate | null> {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true,
      connectionId: true,
      connection: { select: { type: true, active: true } },
    },
  });
  if (!conv) return null;
  return {
    conversationId: conv.id,
    connectionId: conv.connectionId,
    connectionType: conv.connection.type,
  };
}

async function listContactConversations(contactId: string): Promise<SendCandidate[]> {
  const rows = await prisma.conversation.findMany({
    where: { contactId, connection: { active: true } },
    orderBy: { lastMessageAt: 'desc' },
    select: {
      id: true,
      connectionId: true,
      connection: { select: { type: true } },
    },
  });
  return rows.map((r) => ({
    conversationId: r.id,
    connectionId: r.connectionId,
    connectionType: r.connection.type,
  }));
}
