import type { FastifyReply, FastifyRequest } from 'fastify';
import { verifyAccessToken } from '../../lib/jwt.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: { id: string; role: string; sid?: string };
  }
}

export async function authenticate(req: FastifyRequest, reply: FastifyReply) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Token ausente' });
  }
  try {
    const payload = verifyAccessToken(header.slice('Bearer '.length).trim());
    req.user = { id: payload.sub, role: payload.role, sid: payload.sid };
  } catch {
    return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Token inválido ou expirado' });
  }
}

export function requireRole(role: string) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.user) return reply.code(401).send({ error: 'UNAUTHORIZED' });
    if (req.user.role !== role) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Acesso negado' });
    }
  };
}

export function requireAnyRole(roles: string[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.user) return reply.code(401).send({ error: 'UNAUTHORIZED' });
    if (!roles.includes(req.user.role)) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Acesso negado' });
    }
  };
}
