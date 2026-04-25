import type { FastifyInstance } from 'fastify';
import { Server as IOServer, type Server } from 'socket.io';
import { verifyAccessToken } from './jwt.js';

let io: Server | null = null;

export function initRealtime(app: FastifyInstance, allowedOrigins: string[]) {
  io = new IOServer(app.server, {
    cors: { origin: allowedOrigins, credentials: true },
    path: '/socket.io',
  });

  io.use((socket, next) => {
    try {
      const token = (socket.handshake.auth?.token ?? socket.handshake.query?.token) as string | undefined;
      if (!token) return next(new Error('UNAUTHORIZED'));
      const payload = verifyAccessToken(token);
      socket.data.userId = payload.sub;
      socket.data.role = payload.role;
      return next();
    } catch {
      return next(new Error('UNAUTHORIZED'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId as string;
    if (userId) socket.join(`user:${userId}`);
    app.log.info({ socketId: socket.id, userId }, 'socket connected');
    socket.on('disconnect', (reason) => {
      app.log.info({ socketId: socket.id, userId, reason }, 'socket disconnected');
    });
  });

  return io;
}

// Eventos previstos
export type RealtimeEventMap = {
  'reminder:due': { id: string; title: string; opportunityId: string };
  'message:new': { conversationId: string; messageId: string; contactId: string };
  'conversation:update': { conversationId: string };
  'whatsapp:connection-update': {
    connectionId: string;
    status: string;
    qr?: string;
    phone?: string | null;
    profileName?: string | null;
    avatar?: string | null;
  };
};

export function emitToUser<E extends keyof RealtimeEventMap>(
  userId: string,
  event: E,
  payload: RealtimeEventMap[E],
) {
  if (!io) return;
  io.to(`user:${userId}`).emit(event, payload);
}

export function getIO(): Server | null {
  return io;
}
