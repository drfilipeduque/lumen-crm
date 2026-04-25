import {
  makeWASocket,
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  type WASocket,
  type ConnectionState,
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode';
import { prisma } from '../../../lib/prisma.js';
import { emitToUser } from '../../../lib/realtime.js';
import { useDBAuthState } from './auth-state.js';
import { handleIncomingMessages } from './message.service.js';

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
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined as unknown as [number, number, number] }));

  const socket = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
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
