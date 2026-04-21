import { z } from 'zod';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { authenticate } from '../auth/auth.middleware.js';
import {
  ReminderError,
  completeReminder,
  createReminder,
  deleteReminder,
  listGlobalReminders,
  listNotifications,
  listReminders,
  markAllSeen,
  markSeen,
  pendingCount,
  snoozeReminder,
  updateReminder,
  type ListReminderPeriod,
  type ListReminderStatus,
} from './reminders.service.js';

const listQuery = z.object({
  status: z.enum(['PENDING', 'OVERDUE', 'COMPLETED', 'ALL']).default('PENDING'),
  period: z.enum(['today', 'week', 'month', 'all']).default('all'),
  userId: z.string().min(1).optional(),
});

const idParam = z.object({ id: z.string().min(1) });
const oppParam = z.object({ opportunityId: z.string().min(1) });

const createSchema = z.object({
  title: z.string().trim().min(1, 'Título obrigatório').max(160, 'Título muito longo'),
  description: z.string().trim().max(2000).nullable().optional().or(z.literal('').transform(() => null)),
  dueAt: z.string().min(1, 'Data obrigatória'),
});

const updateSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  dueAt: z.string().optional(),
  completed: z.boolean().optional(),
  snoozedUntil: z.string().nullable().optional(),
});

const snoozeSchema = z
  .object({
    until: z.string().optional(),
    preset: z.enum(['1h', '3h', 'tomorrow', 'next-week']).optional(),
  })
  .refine((v) => !!(v.until || v.preset), { message: 'Informe until ou preset' });

function send(reply: FastifyReply, e: unknown) {
  if (e instanceof ReminderError) return reply.code(e.status).send({ error: e.code, message: e.message });
  throw e;
}

// /opportunities/:opportunityId/reminders — list + create
export const opportunityRemindersRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', authenticate);

  app.get('/:opportunityId/reminders', async (req, reply) => {
    const p = oppParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    try {
      return reply.send(await listReminders(req.user!, p.data.opportunityId));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.post('/:opportunityId/reminders', async (req, reply) => {
    const p = oppParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    const body = createSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'VALIDATION', issues: body.error.flatten() });
    try {
      return reply.code(201).send(await createReminder(req.user!, p.data.opportunityId, body.data));
    } catch (e) {
      return send(reply, e);
    }
  });
};

// /reminders — listagem global + endpoints de notificação + :id ações
export const remindersRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', authenticate);

  // Listagem global com filtros
  app.get('/', async (req, reply) => {
    const q = listQuery.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'VALIDATION', issues: q.error.flatten() });
    return reply.send(
      await listGlobalReminders(req.user!, {
        status: q.data.status as ListReminderStatus,
        period: q.data.period as ListReminderPeriod,
        userId: q.data.userId,
      }),
    );
  });

  app.get('/pending-count', async (req, reply) => {
    return reply.send({ count: await pendingCount(req.user!) });
  });

  app.get('/notifications', async (req, reply) => {
    return reply.send(await listNotifications(req.user!));
  });

  app.post('/mark-all-seen', async (req, reply) => {
    return reply.send(await markAllSeen(req.user!));
  });

  app.post('/:id/mark-seen', async (req, reply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    try {
      return reply.send(await markSeen(req.user!, p.data.id));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.put('/:id', async (req, reply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    const body = updateSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'VALIDATION', issues: body.error.flatten() });
    try {
      return reply.send(await updateReminder(req.user!, p.data.id, body.data));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.post('/:id/complete', async (req, reply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    try {
      return reply.send(await completeReminder(req.user!, p.data.id));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.post('/:id/snooze', async (req, reply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    const body = snoozeSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'VALIDATION', issues: body.error.flatten() });
    try {
      return reply.send(await snoozeReminder(req.user!, p.data.id, body.data));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.delete('/:id', async (req, reply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: 'VALIDATION', issues: p.error.flatten() });
    try {
      return reply.send(await deleteReminder(req.user!, p.data.id));
    } catch (e) {
      return send(reply, e);
    }
  });
};
