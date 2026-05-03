import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../auth/auth.middleware.js';
import {
  AdminUsersError,
  createAdminUser,
  listAdminUsers,
  listUserConnections,
  resetAdminUserPassword,
  setUserConnections,
  updateAdminUser,
} from './admin-users.service.js';

function send(reply: FastifyReply, e: unknown) {
  if (e instanceof AdminUsersError) {
    return reply.code(e.status).send({ error: e.code, message: e.message });
  }
  throw e;
}

function requireAdmin(reply: FastifyReply, role: string): boolean {
  if (role !== 'ADMIN') {
    reply.code(403).send({ error: 'FORBIDDEN', message: 'Apenas administradores' });
    return false;
  }
  return true;
}

const ROLE = z.enum(['ADMIN', 'COMMERCIAL', 'RECEPTION']);

const createSchema = z.object({
  name: z.string().trim().min(2, 'Nome deve ter no mínimo 2 caracteres'),
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres'),
  role: ROLE,
  phone: z.string().nullable().optional(),
});

const updateSchema = z.object({
  name: z.string().trim().min(2).optional(),
  role: ROLE.optional(),
  active: z.boolean().optional(),
  phone: z.string().nullable().optional(),
});

const resetPasswordSchema = z.object({
  password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres'),
});

const setConnectionsSchema = z.object({
  connectionIds: z.array(z.string().min(1)).default([]),
});

const idParam = z.object({ id: z.string().min(1) });

export const adminUsersRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', authenticate);

  app.get('/', async (req, reply) => {
    if (!requireAdmin(reply, req.user!.role)) return;
    return reply.send(await listAdminUsers());
  });

  app.post('/', async (req, reply) => {
    if (!requireAdmin(reply, req.user!.role)) return;
    const body = createSchema.safeParse(req.body);
    if (!body.success) {
      const first = body.error.errors[0]?.message ?? 'Dados inválidos';
      return reply.code(400).send({ error: 'VALIDATION', message: first, issues: body.error.flatten() });
    }
    try {
      return reply.code(201).send(await createAdminUser(body.data));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.patch('/:id', async (req, reply) => {
    if (!requireAdmin(reply, req.user!.role)) return;
    const params = idParam.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: 'VALIDATION', message: 'ID inválido' });
    const body = updateSchema.safeParse(req.body);
    if (!body.success) {
      const first = body.error.errors[0]?.message ?? 'Dados inválidos';
      return reply.code(400).send({ error: 'VALIDATION', message: first, issues: body.error.flatten() });
    }
    try {
      return reply.send(await updateAdminUser(req.user!.id, params.data.id, body.data));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.get('/:id/connections', async (req, reply) => {
    if (!requireAdmin(reply, req.user!.role)) return;
    const params = idParam.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: 'VALIDATION', message: 'ID inválido' });
    try {
      return reply.send(await listUserConnections(params.data.id));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.put('/:id/connections', async (req, reply) => {
    if (!requireAdmin(reply, req.user!.role)) return;
    const params = idParam.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: 'VALIDATION', message: 'ID inválido' });
    const body = setConnectionsSchema.safeParse(req.body);
    if (!body.success) {
      const first = body.error.errors[0]?.message ?? 'Dados inválidos';
      return reply.code(400).send({ error: 'VALIDATION', message: first });
    }
    try {
      return reply.send(await setUserConnections(params.data.id, body.data.connectionIds));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.post('/:id/reset-password', async (req, reply) => {
    if (!requireAdmin(reply, req.user!.role)) return;
    const params = idParam.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: 'VALIDATION', message: 'ID inválido' });
    const body = resetPasswordSchema.safeParse(req.body);
    if (!body.success) {
      const first = body.error.errors[0]?.message ?? 'Senha inválida';
      return reply.code(400).send({ error: 'VALIDATION', message: first });
    }
    try {
      return reply.send(await resetAdminUserPassword(req.user!.id, params.data.id, body.data.password));
    } catch (e) {
      return send(reply, e);
    }
  });
};
