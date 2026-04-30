// Contexto compartilhado entre os nós de um fluxo.
//
// É o "scope" usado pelo prompt-builder pra resolver {{...}}.
// Em cada execução de fluxo, montamos UMA instância de Context com:
// - entidades de domínio relevantes (opportunity, contact, user, message)
// - payload do evento que disparou
// - bag de outputs por nó (`step.<nodeId>.<outputVar>`)
// - metadata do log (id, automationId, dryRun)

import { prisma } from '../../../lib/prisma.js';
import type { EventPayload } from './event-bus.js';

export type ContactSnapshot = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
};

export type OpportunitySnapshot = {
  id: string;
  title: string;
  value: number;
  priority: string;
  description: string | null;
  pipelineId: string;
  stageId: string;
  stageName: string;
  contactId: string;
  ownerId: string | null;
  tags: { id: string; name: string }[];
  customFields: Record<string, string>;
  createdAt: Date;
  dueDate: Date | null;
};

export type UserSnapshot = {
  id: string;
  name: string;
  email: string;
  role: string;
};

export type MessageSnapshot = {
  id: string;
  conversationId: string;
  type: string;
  content: string | null;
  fromMe: boolean;
  createdAt: Date;
};

export type ExecutionContext = {
  // Quem somos: identificação da execução
  automationId: string;
  logId: string | null;
  dryRun: boolean;

  // Evento que disparou (ou null em runs manuais/teste sem evento)
  event: EventPayload | null;

  // Entidades de domínio
  opportunity?: OpportunitySnapshot;
  contact?: ContactSnapshot;
  user?: UserSnapshot;
  message?: MessageSnapshot;

  // Outputs por nó: step["ai-1"] = { resposta: "..." }
  step: Record<string, Record<string, unknown>>;
};

// Carrega os snapshots a partir de IDs no payload do evento.
// Não trava se algo não existir — só não preenche aquela parte do contexto.
export async function buildContextFromEvent(
  automationId: string,
  logId: string | null,
  event: EventPayload,
  dryRun = false,
): Promise<ExecutionContext> {
  const ctx: ExecutionContext = {
    automationId,
    logId,
    dryRun,
    event,
    step: {},
  };

  const data = event.data as Record<string, unknown>;
  const opportunityId = (data.opportunityId as string | undefined) ?? null;
  const contactId = (data.contactId as string | undefined) ?? null;
  const userId = (data.userId as string | undefined) ?? null;
  const messageId = (data.messageId as string | undefined) ?? null;

  if (opportunityId) {
    const op = await prisma.opportunity.findUnique({
      where: { id: opportunityId },
      include: {
        stage: { select: { id: true, name: true } },
        tags: { select: { id: true, name: true } },
        customFieldValues: { select: { customFieldId: true, value: true, customField: { select: { name: true } } } },
        contact: true,
      },
    });
    if (op) {
      ctx.opportunity = {
        id: op.id,
        title: op.title,
        value: Number(op.value),
        priority: op.priority,
        description: op.description,
        pipelineId: op.pipelineId,
        stageId: op.stageId,
        stageName: op.stage.name,
        contactId: op.contactId,
        ownerId: op.ownerId,
        tags: op.tags.map((t) => ({ id: t.id, name: t.name })),
        customFields: Object.fromEntries(op.customFieldValues.map((c) => [c.customField.name, c.value])),
        createdAt: op.createdAt,
        dueDate: op.dueDate,
      };
      if (!ctx.contact && op.contact) {
        ctx.contact = {
          id: op.contact.id,
          name: op.contact.name,
          phone: op.contact.phone,
          email: op.contact.email,
        };
      }
    }
  }

  if (contactId && !ctx.contact) {
    const c = await prisma.contact.findUnique({ where: { id: contactId } });
    if (c) ctx.contact = { id: c.id, name: c.name, phone: c.phone, email: c.email };
  }

  if (userId) {
    const u = await prisma.user.findUnique({ where: { id: userId } });
    if (u) ctx.user = { id: u.id, name: u.name, email: u.email, role: u.role };
  }

  if (messageId) {
    const m = await prisma.message.findUnique({ where: { id: messageId } });
    if (m) {
      ctx.message = {
        id: m.id,
        conversationId: m.conversationId,
        type: m.type,
        content: m.content,
        fromMe: m.fromMe,
        createdAt: m.createdAt,
      };
    }
  }

  return ctx;
}
