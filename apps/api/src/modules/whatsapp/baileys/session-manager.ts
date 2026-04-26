import {
  makeWASocket,
  Browsers,
  DisconnectReason,
  type WASocket,
  type ConnectionState,
} from 'baileys';
import qrcode from 'qrcode';
import { prisma } from '../../../lib/prisma.js';
import { emitToUser } from '../../../lib/realtime.js';
import { useDBAuthState } from './auth-state.js';
import { handleIncomingMessages } from './message.service.js';
import { normalizePhone, phoneVariants } from '../../../lib/phone.js';

// Logger no-op pra não obrigar pino como dep direta
type NoopLogger = {
  level: string;
  fatal: () => void;
  error: () => void;
  warn: () => void;
  info: () => void;
  debug: () => void;
  trace: () => void;
  child: () => NoopLogger;
};
const noopLog: NoopLogger = {
  level: 'silent',
  fatal: () => {}, error: () => {}, warn: () => {}, info: () => {},
  debug: () => {}, trace: () => {}, child(): NoopLogger { return this; },
};

type SessionEntry = {
  socket: WASocket | null;
  qrDataUrl: string | null;
  status: 'CONNECTED' | 'DISCONNECTED' | 'WAITING_QR' | 'ERROR';
  startedAt: Date;
};

const sessions = new Map<string, SessionEntry>();

export async function startSession(connectionId: string): Promise<void> {
  // Se ja existe e nao esta DESCONECTADO, ignora
  const existing = sessions.get(connectionId);
  if (existing?.socket && existing.status !== 'DISCONNECTED' && existing.status !== 'ERROR') {
    return;
  }

  const conn = await prisma.whatsAppConnection.findUnique({
    where: { id: connectionId },
    select: { id: true, name: true, type: true, active: true },
  });
  if (!conn || conn.type !== 'UNOFFICIAL' || !conn.active) return;

  const { state, saveCreds } = await useDBAuthState(connectionId);

  // baileys v7 não exporta mais fetchLatestBaileysVersion — a lib mantém
  // a versão WA internamente.
  const socket = makeWASocket({
    auth: state,
    browser: Browsers.macOS('Lumen CRM'),
    logger: noopLog as unknown as Parameters<typeof makeWASocket>[0]['logger'],
    syncFullHistory: false,
    markOnlineOnConnect: false,
  });

  sessions.set(connectionId, {
    socket,
    qrDataUrl: existing?.qrDataUrl ?? null,
    status: 'WAITING_QR',
    startedAt: new Date(),
  });

  socket.ev.on('creds.update', () => {
    void saveCreds();
  });

  socket.ev.on('connection.update', async (update: Partial<ConnectionState>) => {
    const { connection, lastDisconnect, qr } = update;
    const entry = sessions.get(connectionId);
    if (!entry) return;

    // Novo QR
    if (qr) {
      try {
        const url = await qrcode.toDataURL(qr, { margin: 1, scale: 6 });
        entry.qrDataUrl = url;
        entry.status = 'WAITING_QR';
        await persistStatus(connectionId, 'WAITING_QR');
        await broadcastConnectionUpdate(connectionId, { status: 'WAITING_QR', qr: url });
      } catch {
        /* ignore */
      }
    }

    if (connection === 'open') {
      entry.qrDataUrl = null;
      entry.status = 'CONNECTED';
      const userJid = socket.user?.id;
      const phone = userJid?.split(':')[0]?.split('@')[0] ?? null;
      const profileName = socket.user?.name ?? null;

      // Busca foto de perfil — best effort (CDN URL pode demorar/falhar)
      let avatar: string | null = null;
      if (userJid) {
        try {
          avatar = (await socket.profilePictureUrl(userJid, 'image')) ?? null;
        } catch {
          avatar = null;
        }
      }

      await prisma.whatsAppConnection.update({
        where: { id: connectionId },
        data: {
          status: 'CONNECTED',
          phone: phone ?? undefined,
          profileName: profileName ?? undefined,
          avatar: avatar ?? undefined,
        },
      });
      await broadcastConnectionUpdate(connectionId, {
        status: 'CONNECTED',
        phone,
        profileName,
        avatar,
      });
    }

    if (connection === 'close') {
      const err = lastDisconnect?.error as { output?: { statusCode?: number } } | undefined;
      const code = err?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      entry.status = loggedOut ? 'ERROR' : 'DISCONNECTED';
      await persistStatus(connectionId, entry.status);
      await broadcastConnectionUpdate(connectionId, { status: entry.status });

      if (loggedOut) {
        // Logged out: limpa session pra forçar QR de novo na próxima conexão
        await prisma.whatsAppConnection.update({
          where: { id: connectionId },
          data: { sessionData: null, phone: null },
        });
      } else {
        // Tenta reconectar em 3s
        setTimeout(() => {
          startSession(connectionId).catch(() => {});
        }, 3000);
      }
    }
  });

  socket.ev.on('messages.upsert', (event: Parameters<typeof handleIncomingMessages>[1]) => {
    void handleIncomingMessages(connectionId, event);
  });

  socket.ev.on('messages.update', (updates) => {
    void handleMessageStatusUpdates(connectionId, updates);
  });

  socket.ev.on('presence.update', (event) => {
    void handlePresenceUpdate(connectionId, event);
  });
}

async function handleMessageStatusUpdates(
  connectionId: string,
  updates: { update: { status?: number | null }; key: { id?: string | null; remoteJid?: string | null } }[],
) {
  for (const u of updates) {
    const externalId = u.key.id;
    const rawStatus = u.update.status;
    if (!externalId || rawStatus == null) continue;

    let status: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
    if (rawStatus === 0) status = 'FAILED';
    else if (rawStatus === 1 || rawStatus === 2) status = 'SENT';
    else if (rawStatus === 3) status = 'DELIVERED';
    else if (rawStatus === 4 || rawStatus === 5) status = 'READ';
    else continue;

    try {
      const msg = await prisma.message.findFirst({
        where: { externalId },
        select: {
          id: true,
          conversationId: true,
          conversation: { select: { connectionId: true, assigneeId: true } },
        },
      });
      if (!msg || msg.conversation.connectionId !== connectionId) continue;

      const data: { status: typeof status; deliveredAt?: Date; readAt?: Date } = { status };
      if (status === 'DELIVERED') data.deliveredAt = new Date();
      if (status === 'READ') data.readAt = new Date();
      await prisma.message.update({ where: { id: msg.id }, data });

      await broadcastToConnection(connectionId, msg.conversation.assigneeId, 'message:status', {
        conversationId: msg.conversationId,
        messageId: msg.id,
        status,
      });
    } catch (e) {
      console.error('[whatsapp/status] update failed', e);
    }
  }
}

async function handlePresenceUpdate(
  connectionId: string,
  event: { id: string; presences: Record<string, { lastKnownPresence?: string }> },
) {
  // event.id é o jid do chat (1:1 ou grupo). Pegamos a presence do próprio jid.
  const jid = event.id;
  if (!jid || jid.endsWith('@g.us')) return;
  const phoneRaw = jid.split('@')[0]?.split(':')[0] ?? '';
  const phone = normalizePhone(phoneRaw);
  if (!phone) return;

  const presence = event.presences[jid]?.lastKnownPresence;
  if (!presence) return;
  if (presence !== 'composing' && presence !== 'recording' && presence !== 'paused') return;

  // Encontra a conversation correspondente
  const contact = await prisma.contact.findFirst({
    where: { phone: { in: phoneVariants(phone) } },
    select: { id: true },
  });
  if (!contact) return;
  const conv = await prisma.conversation.findUnique({
    where: { contactId_connectionId: { contactId: contact.id, connectionId } },
    select: { id: true, assigneeId: true },
  });
  if (!conv) return;

  await broadcastToConnection(connectionId, conv.assigneeId, 'typing', {
    conversationId: conv.id,
    state: presence,
  });
}

async function broadcastToConnection<E extends 'message:status' | 'typing'>(
  connectionId: string,
  assigneeId: string | null,
  event: E,
  payload: E extends 'message:status'
    ? { conversationId: string; messageId: string; status: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' }
    : { conversationId: string; state: 'composing' | 'recording' | 'paused' },
) {
  const targets = new Set<string>();
  if (assigneeId) targets.add(assigneeId);
  const links = await prisma.userWhatsAppConnection.findMany({
    where: { connectionId },
    select: { userId: true },
  });
  for (const l of links) targets.add(l.userId);
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN', active: true },
    select: { id: true },
  });
  for (const a of admins) targets.add(a.id);
  for (const userId of targets) {
    emitToUser(userId, event, payload as never);
  }
}

export async function stopSession(connectionId: string): Promise<void> {
  const entry = sessions.get(connectionId);
  if (entry?.socket) {
    try {
      entry.socket.end(undefined);
    } catch {
      /* ignore */
    }
  }
  sessions.delete(connectionId);
  await persistStatus(connectionId, 'DISCONNECTED').catch(() => {});
}

export async function logoutSession(connectionId: string): Promise<void> {
  const entry = sessions.get(connectionId);
  if (entry?.socket) {
    try {
      await entry.socket.logout();
    } catch {
      /* ignore */
    }
  }
  await stopSession(connectionId);
  await prisma.whatsAppConnection.update({
    where: { id: connectionId },
    data: { sessionData: null, phone: null, status: 'DISCONNECTED' },
  }).catch(() => {});
}

export function getSocket(connectionId: string): WASocket | null {
  return sessions.get(connectionId)?.socket ?? null;
}

export function getCurrentQr(connectionId: string): string | null {
  return sessions.get(connectionId)?.qrDataUrl ?? null;
}

export function getStatus(connectionId: string): SessionEntry['status'] | null {
  return sessions.get(connectionId)?.status ?? null;
}

async function persistStatus(connectionId: string, status: SessionEntry['status']) {
  await prisma.whatsAppConnection.update({
    where: { id: connectionId },
    data: { status },
  }).catch(() => {});
}

async function broadcastConnectionUpdate(
  connectionId: string,
  payload: {
    status: string;
    qr?: string;
    phone?: string | null;
    profileName?: string | null;
    avatar?: string | null;
  },
) {
  const fullPayload = {
    connectionId,
    status: payload.status,
    qr: payload.qr,
    phone: payload.phone,
    profileName: payload.profileName,
    avatar: payload.avatar,
  };
  // Busca users autorizados pra essa conexao
  const links = await prisma.userWhatsAppConnection.findMany({
    where: { connectionId },
    select: { userId: true },
  });
  for (const l of links) {
    emitToUser(l.userId, 'whatsapp:connection-update', fullPayload);
  }
  // Tambem manda pra TODOS os admins
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN', active: true },
    select: { id: true },
  });
  for (const a of admins) {
    emitToUser(a.id, 'whatsapp:connection-update', fullPayload);
  }
}

// Reinicia todas as conexoes UNOFFICIAL ativas com sessao salva no boot.
export async function restoreAllSessions(): Promise<void> {
  const conns = await prisma.whatsAppConnection.findMany({
    where: { type: 'UNOFFICIAL', active: true, sessionData: { not: null } },
    select: { id: true },
  });
  for (const c of conns) {
    startSession(c.id).catch(() => {});
  }
}
