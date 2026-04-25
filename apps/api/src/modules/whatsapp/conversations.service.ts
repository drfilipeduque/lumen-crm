import { prisma, type Prisma } from '../../lib/prisma.js';
import { emitToUser } from '../../lib/realtime.js';
import { formatPhoneBR } from '../../lib/phone.js';

type Actor = { id: string; role: string };

export class ConvError extends Error {
  status: number;
  code: string;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

// ============================================================
// SCOPING / VISIBILITY
// ============================================================

// Conexões visíveis pro usuário:
// - ADMIN: todas
// - demais: aquelas onde existe vínculo em UserWhatsAppConnection
async function visibleConnectionIds(actor: Actor): Promise<string[] | null> {
  if (actor.role === 'ADMIN') return null; // null = sem filtro
  const links = await prisma.userWhatsAppConnection.findMany({
    where: { userId: actor.id },
    select: { connectionId: true },
  });
  return links.map((l) => l.connectionId);
}

async function assertConversationVisible(actor: Actor, conversationId: string) {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, assigneeId: true, connectionId: true },
  });
  if (!conv) throw new ConvError('NOT_FOUND', 'Conversa não encontrada', 404);
  if (actor.role === 'ADMIN') return conv;
  // Não-admin: precisa estar vinculado à conexão E (ser assignee OU não atribuída)
  const link = await prisma.userWhatsAppConnection.findUnique({
    where: { userId_connectionId: { userId: actor.id, connectionId: conv.connectionId } },
    select: { userId: true },
  });
  if (!link) throw new ConvError('FORBIDDEN', 'Sem acesso a essa conversa', 403);
  if (conv.assigneeId && conv.assigneeId !== actor.id) {
    throw new ConvError('FORBIDDEN', 'Conversa atribuída a outro usuário', 403);
  }
  return conv;
}

// ============================================================
// LIST
// ============================================================

export type ListFilters = {
  assigneeId?: string | null; // string = filtra por id, 'me' = atual
  unassigned?: boolean;
  tagId?: string;
  search?: string;
  status?: 'OPEN' | 'RESOLVED';
  connectionId?: string;
  unreadOnly?: boolean;
  page?: number;
  limit?: number;
};

export type ConversationListItem = {
  id: string;
  contactId: string;
  contactName: string;
  contactPhone: string;
  contactAvatar: string | null;
  connectionId: string;
  connectionName: string;
  connectionType: 'OFFICIAL' | 'UNOFFICIAL';
  assigneeId: string | null;
  assigneeName: string | null;
  status: 'OPEN' | 'RESOLVED';
  unreadCount: number;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastMessageFromMe: boolean;
  tags: { id: string; name: string; color: string }[];
};

export async function listConversations(
  actor: Actor,
  filters: ListFilters,
): Promise<{ data: ConversationListItem[]; total: number; page: number; totalPages: number }> {
  const allowed = await visibleConnectionIds(actor);
  const where: Prisma.ConversationWhereInput = {};
  if (allowed !== null) where.connectionId = { in: allowed };
  if (filters.connectionId) where.connectionId = filters.connectionId;

  if (filters.status) where.status = filters.status;

  if (filters.unassigned) {
    where.assigneeId = null;
  } else if (filters.assigneeId === 'me') {
    where.assigneeId = actor.id;
  } else if (filters.assigneeId) {
    where.assigneeId = filters.assigneeId;
  } else if (actor.role !== 'ADMIN') {
    // Padrão pra não-admin: vê suas conversas atribuídas + as não atribuídas das conexões dele
    where.OR = [{ assigneeId: actor.id }, { assigneeId: null }];
  }

  if (filters.unreadOnly) where.unreadCount = { gt: 0 };

  if (filters.search) {
    const s = filters.search.trim();
    if (s) {
      const phoneDigits = s.replace(/\D+/g, '');
      const orFilters: Prisma.ConversationWhereInput[] = [
        { contact: { name: { contains: s, mode: 'insensitive' } } },
      ];
      if (phoneDigits) orFilters.push({ contact: { phone: { contains: phoneDigits } } });
      where.AND = [{ OR: orFilters }];
    }
  }

  if (filters.tagId) {
    where.contact = {
      ...(where.contact as Prisma.ContactWhereInput | undefined),
      tags: { some: { id: filters.tagId } },
    };
  }

  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(100, Math.max(1, filters.limit ?? 30));
  const skip = (page - 1) * limit;

  const [total, rows] = await Promise.all([
    prisma.conversation.count({ where }),
    prisma.conversation.findMany({
      where,
      orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      skip,
      take: limit,
      include: {
        contact: {
          select: {
            id: true,
            name: true,
            phone: true,
            tags: { select: { id: true, name: true, color: true } },
          },
        },
        connection: { select: { id: true, name: true, type: true } },
        assignee: { select: { id: true, name: true } },
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: { type: true, content: true, fromMe: true },
        },
      },
    }),
  ]);

  return {
    data: rows.map((c) => {
      const last = c.messages[0];
      return {
        id: c.id,
        contactId: c.contactId,
        contactName: c.contact.name,
        contactPhone: c.contact.phone,
        contactAvatar: null,
        connectionId: c.connectionId,
        connectionName: c.connection.name,
        connectionType: c.connection.type,
        assigneeId: c.assigneeId,
        assigneeName: c.assignee?.name ?? null,
        status: c.status,
        unreadCount: c.unreadCount,
        lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
        lastMessagePreview: last ? previewOf(last.type, last.content) : null,
        lastMessageFromMe: last?.fromMe ?? false,
        tags: c.contact.tags,
      };
    }),
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

function previewOf(type: string, content: string | null): string {
  if (type === 'TEXT') return content ?? '';
  if (type === 'IMAGE') return '📷 Imagem';
  if (type === 'AUDIO') return '🎤 Áudio';
  if (type === 'VIDEO') return '🎬 Vídeo';
  if (type === 'DOCUMENT') return `📎 ${content ?? 'Documento'}`;
  return content ?? '';
}

// ============================================================
// DETAIL
// ============================================================

export type ConversationDetail = {
  id: string;
  contact: {
    id: string;
    name: string;
    phone: string;
    phoneFormatted: string;
    email: string | null;
    avatar: string | null;
    tags: { id: string; name: string; color: string }[];
    ownerId: string | null;
    ownerName: string | null;
  };
  connection: { id: string; name: string; type: 'OFFICIAL' | 'UNOFFICIAL'; status: string };
  assigneeId: string | null;
  assignee: { id: string; name: string; avatar: string | null } | null;
  status: 'OPEN' | 'RESOLVED';
  unreadCount: number;
  lastMessageAt: string | null;
  // Atalho pra UI: oportunidade ativa do contato (se houver)
  activeOpportunity: {
    id: string;
    title: string;
    value: number;
    pipelineId: string;
    pipelineName: string;
    stageId: string;
    stageName: string;
    stageColor: string;
  } | null;
  // Próximo lembrete (se houver)
  nextReminder: { id: string; title: string; dueAt: string } | null;
  // Histórico recente da oportunidade ativa (3)
  recentHistory: { id: string; action: string; createdAt: string; userName: string | null }[];
  createdAt: string;
};

export async function getConversation(actor: Actor, id: string): Promise<ConversationDetail> {
  await assertConversationVisible(actor, id);
  const conv = await prisma.conversation.findUnique({
    where: { id },
    include: {
      contact: {
        include: {
          tags: { select: { id: true, name: true, color: true } },
          owner: { select: { id: true, name: true } },
          opportunities: {
            where: { stage: { isClosedWon: false, isClosedLost: false } },
            orderBy: { updatedAt: 'desc' },
            take: 1,
            include: {
              pipeline: { select: { id: true, name: true } },
              stage: { select: { id: true, name: true, color: true } },
            },
          },
        },
      },
      connection: { select: { id: true, name: true, type: true, status: true } },
      assignee: { select: { id: true, name: true, avatar: true } },
    },
  });
  if (!conv) throw new ConvError('NOT_FOUND', 'Conversa não encontrada', 404);

  const opp = conv.contact.opportunities[0] ?? null;

  let nextReminder: ConversationDetail['nextReminder'] = null;
  let recentHistory: ConversationDetail['recentHistory'] = [];
  if (opp) {
    const reminder = await prisma.reminder.findFirst({
      where: { opportunityId: opp.id, completed: false },
      orderBy: { dueAt: 'asc' },
      select: { id: true, title: true, dueAt: true, snoozedUntil: true },
    });
    if (reminder) {
      nextReminder = {
        id: reminder.id,
        title: reminder.title,
        dueAt: (reminder.snoozedUntil ?? reminder.dueAt).toISOString(),
      };
    }
    const history = await prisma.opportunityHistory.findMany({
      where: { opportunityId: opp.id },
      orderBy: { createdAt: 'desc' },
      take: 3,
      include: { user: { select: { name: true } } },
    });
    recentHistory = history.map((h) => ({
      id: h.id,
      action: h.action,
      createdAt: h.createdAt.toISOString(),
      userName: h.user?.name ?? null,
    }));
  }

  return {
    id: conv.id,
    contact: {
      id: conv.contact.id,
      name: conv.contact.name,
      phone: conv.contact.phone,
      phoneFormatted: formatPhoneBR(conv.contact.phone),
      email: conv.contact.email,
      avatar: null,
      tags: conv.contact.tags,
      ownerId: conv.contact.ownerId,
      ownerName: conv.contact.owner?.name ?? null,
    },
    connection: conv.connection,
    assigneeId: conv.assigneeId,
    assignee: conv.assignee,
    status: conv.status,
    unreadCount: conv.unreadCount,
    lastMessageAt: conv.lastMessageAt?.toISOString() ?? null,
    activeOpportunity: opp
      ? {
          id: opp.id,
          title: opp.title,
          value: Number(opp.value),
          pipelineId: opp.pipelineId,
          pipelineName: opp.pipeline.name,
          stageId: opp.stageId,
          stageName: opp.stage.name,
          stageColor: opp.stage.color,
        }
      : null,
    nextReminder,
    recentHistory,
    createdAt: conv.createdAt.toISOString(),
  };
}

// ============================================================
// MESSAGES (paginação reversa)
// ============================================================

export type MessageDTO = {
  id: string;
  conversationId: string;
  fromMe: boolean;
  type: 'TEXT' | 'IMAGE' | 'AUDIO' | 'DOCUMENT' | 'VIDEO';
  content: string | null;
  mediaUrl: string | null;
  mediaName: string | null;
  mediaSize: number | null;
  status: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
  externalId: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  createdAt: string;
};

export async function listMessages(
  actor: Actor,
  conversationId: string,
  args: { before?: string; limit?: number },
): Promise<{ data: MessageDTO[]; hasMore: boolean }> {
  await assertConversationVisible(actor, conversationId);
  const limit = Math.min(100, Math.max(1, args.limit ?? 40));

  const where: Prisma.MessageWhereInput = { conversationId };
  if (args.before) {
    const cursor = await prisma.message.findUnique({
      where: { id: args.before },
      select: { createdAt: true },
    });
    if (cursor) where.createdAt = { lt: cursor.createdAt };
  }

  const rows = await prisma.message.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
  });
  const hasMore = rows.length > limit;
  const slice = rows.slice(0, limit);
  // Inverte pra ordem cronológica (asc) pra UI ler de cima pra baixo
  slice.reverse();
  return { data: slice.map(toMessageDTO), hasMore };
}

export function toMessageDTO(m: {
  id: string;
  conversationId: string;
  fromMe: boolean;
  type: string;
  content: string | null;
  mediaUrl: string | null;
  mediaName: string | null;
  mediaSize: number | null;
  status: string;
  externalId: string | null;
  sentAt: Date | null;
  deliveredAt: Date | null;
  readAt: Date | null;
  createdAt: Date;
}): MessageDTO {
  return {
    id: m.id,
    conversationId: m.conversationId,
    fromMe: m.fromMe,
    type: m.type as MessageDTO['type'],
    content: m.content,
    mediaUrl: m.mediaUrl,
    mediaName: m.mediaName,
    mediaSize: m.mediaSize,
    status: m.status as MessageDTO['status'],
    externalId: m.externalId,
    sentAt: m.sentAt?.toISOString() ?? null,
    deliveredAt: m.deliveredAt?.toISOString() ?? null,
    readAt: m.readAt?.toISOString() ?? null,
    createdAt: m.createdAt.toISOString(),
  };
}

// ============================================================
// MARK AS READ
// ============================================================

export async function markAsRead(actor: Actor, conversationId: string): Promise<{ ok: true }> {
  await assertConversationVisible(actor, conversationId);
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { unreadCount: 0 },
  });
  await broadcastConversationUpdate(conversationId);
  return { ok: true };
}

// ============================================================
// ASSIGN
// ============================================================

export async function assignConversation(
  actor: Actor,
  conversationId: string,
  userId: string | null,
): Promise<{ ok: true }> {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, connectionId: true, assigneeId: true },
  });
  if (!conv) throw new ConvError('NOT_FOUND', 'Conversa não encontrada', 404);

  // ADMIN pode atribuir a qualquer um. Não-admin só pode pegar pra si.
  if (actor.role !== 'ADMIN') {
    if (userId !== actor.id) {
      throw new ConvError('FORBIDDEN', 'Você só pode atribuir a si mesmo', 403);
    }
    // Precisa estar vinculado à conexão
    const link = await prisma.userWhatsAppConnection.findUnique({
      where: { userId_connectionId: { userId: actor.id, connectionId: conv.connectionId } },
      select: { userId: true },
    });
    if (!link) throw new ConvError('FORBIDDEN', 'Sem acesso à conexão', 403);
  }

  if (userId) {
    // Garante que o user existe e tem vínculo (ou é admin)
    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });
    if (!target) throw new ConvError('NOT_FOUND', 'Usuário não encontrado', 404);
    if (target.role !== 'ADMIN') {
      const link = await prisma.userWhatsAppConnection.findUnique({
        where: { userId_connectionId: { userId, connectionId: conv.connectionId } },
        select: { userId: true },
      });
      if (!link) {
        throw new ConvError('TARGET_NO_ACCESS', 'O usuário escolhido não tem acesso à conexão', 400);
      }
    }
  }

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { assigneeId: userId ?? null },
  });
  await broadcastConversationUpdate(conversationId);
  return { ok: true };
}

// ============================================================
// RESOLVE
// ============================================================

export async function resolveConversation(
  actor: Actor,
  conversationId: string,
  status: 'OPEN' | 'RESOLVED',
): Promise<{ ok: true }> {
  await assertConversationVisible(actor, conversationId);
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { status },
  });
  await broadcastConversationUpdate(conversationId);
  return { ok: true };
}

// ============================================================
// CREATE OPPORTUNITY
// ============================================================

export type CreateOppInput = {
  title: string;
  pipelineId: string;
  stageId: string;
  value?: number;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
};

export async function createOpportunityFromConversation(
  actor: Actor,
  conversationId: string,
  input: CreateOppInput,
): Promise<{ id: string }> {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, contactId: true, connectionId: true, assigneeId: true },
  });
  if (!conv) throw new ConvError('NOT_FOUND', 'Conversa não encontrada', 404);
  await assertConversationVisible(actor, conversationId);

  const stage = await prisma.stage.findUnique({
    where: { id: input.stageId },
    select: { id: true, pipelineId: true },
  });
  if (!stage || stage.pipelineId !== input.pipelineId) {
    throw new ConvError('STAGE_PIPELINE_MISMATCH', 'A etapa não pertence ao funil', 400);
  }

  const max = await prisma.opportunity.aggregate({
    where: { stageId: input.stageId },
    _max: { order: true },
  });
  const ownerId = conv.assigneeId ?? actor.id;

  const opp = await prisma.opportunity.create({
    data: {
      title: input.title.trim(),
      contactId: conv.contactId,
      pipelineId: input.pipelineId,
      stageId: input.stageId,
      value: input.value ?? 0,
      priority: input.priority ?? 'MEDIUM',
      order: (max._max.order ?? -1) + 1,
      ownerId,
      history: {
        create: { action: 'CREATED', toStageId: input.stageId, userId: actor.id },
      },
    },
    select: { id: true },
  });
  return { id: opp.id };
}

// ============================================================
// BROADCAST
// ============================================================

async function broadcastConversationUpdate(conversationId: string) {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { connectionId: true, assigneeId: true },
  });
  if (!conv) return;
  const targets = new Set<string>();
  if (conv.assigneeId) targets.add(conv.assigneeId);
  const links = await prisma.userWhatsAppConnection.findMany({
    where: { connectionId: conv.connectionId },
    select: { userId: true },
  });
  for (const l of links) targets.add(l.userId);
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN', active: true },
    select: { id: true },
  });
  for (const a of admins) targets.add(a.id);
  for (const userId of targets) {
    emitToUser(userId, 'conversation:update', { conversationId });
  }
}

// Total de não lidas visíveis pro user (pra badge na sidebar)
export async function totalUnread(actor: Actor): Promise<number> {
  const allowed = await visibleConnectionIds(actor);
  const where: Prisma.ConversationWhereInput = { unreadCount: { gt: 0 } };
  if (allowed !== null) where.connectionId = { in: allowed };
  if (actor.role !== 'ADMIN') {
    where.OR = [{ assigneeId: actor.id }, { assigneeId: null }];
  }
  const sum = await prisma.conversation.aggregate({
    where,
    _sum: { unreadCount: true },
  });
  return sum._sum.unreadCount ?? 0;
}
