import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { authenticate } from '../auth/auth.middleware.js';
import {
  bulkAssignSchema,
  bulkDeleteSchema,
  bulkTagSchema,
  contactBodySchema,
  idParamSchema,
  listContactsQuerySchema,
} from './contacts.schemas.js';
import {
  ContactError,
  bulkAssign,
  bulkDelete,
  bulkTag,
  createContact,
  deleteContact,
  exportContactsCsv,
  getContact,
  listContacts,
  updateContact,
} from './contacts.service.js';
import {
  buildImportTemplate,
  importContactsCsv,
  type DuplicateStrategy,
  type ImportMapping,
} from './contacts.import.js';

function send(reply: FastifyReply, e: unknown) {
  if (e instanceof ContactError)
    return reply.code(e.status).send({ error: e.code, message: e.message, ...e.extra });
  throw e;
}

export const contactsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', authenticate);

  app.get('/', async (req, reply) => {
    const parsed = listContactsQuerySchema.safeParse(req.query);
    if (!parsed.success)
      return reply.code(400).send({ error: 'VALIDATION', issues: parsed.error.flatten() });
    return reply.send(await listContacts(req.user!, parsed.data));
  });

  // CSV template (download)
  app.get('/import-template', async (_req, reply) => {
    const csv = buildImportTemplate();
    return reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', 'attachment; filename="modelo-contatos.csv"')
      .send(csv);
  });

  // Import CSV (multipart)
  app.post('/import', async (req, reply) => {
    let csvText: string | null = null;
    let mapping: ImportMapping | null = null;
    let tagIds: string[] | undefined;
    let ownerId: string | undefined;
    let duplicateStrategy: DuplicateStrategy = 'SKIP';

    const parts = req.parts();
    for await (const part of parts) {
      if (part.type === 'file') {
        const buf = await part.toBuffer();
        csvText = buf.toString('utf-8');
      } else {
        const v = part.value as string;
        if (part.fieldname === 'mapping') {
          try {
            mapping = JSON.parse(v) as ImportMapping;
          } catch {
            return reply.code(400).send({ error: 'VALIDATION', message: 'mapping JSON inválido' });
          }
        } else if (part.fieldname === 'tagIds') {
          try {
            tagIds = JSON.parse(v) as string[];
          } catch {
            return reply.code(400).send({ error: 'VALIDATION', message: 'tagIds JSON inválido' });
          }
        } else if (part.fieldname === 'ownerId') {
          ownerId = v || undefined;
        } else if (part.fieldname === 'duplicateStrategy') {
          if (['SKIP', 'UPDATE', 'CREATE_ANYWAY'].includes(v)) {
            duplicateStrategy = v as DuplicateStrategy;
          }
        }
      }
    }

    if (!csvText) return reply.code(400).send({ error: 'VALIDATION', message: 'Arquivo CSV obrigatório' });
    if (!mapping) return reply.code(400).send({ error: 'VALIDATION', message: 'mapping obrigatório' });

    try {
      const report = await importContactsCsv(csvText, {
        mapping,
        tagIds,
        ownerId: ownerId ?? null,
        duplicateStrategy,
      });
      return reply.send(report);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Falha ao importar';
      return reply.code(400).send({ error: 'IMPORT_FAILED', message: msg });
    }
  });

  app.get('/export', async (req, reply) => {
    const parsed = listContactsQuerySchema.safeParse(req.query);
    if (!parsed.success)
      return reply.code(400).send({ error: 'VALIDATION', issues: parsed.error.flatten() });
    const csv = await exportContactsCsv(req.user!, parsed.data);
    const filename = `contatos-${new Date().toISOString().slice(0, 10)}.csv`;
    return reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="${filename}"`)
      .send(csv);
  });

  app.post('/bulk-assign', async (req, reply) => {
    const parsed = bulkAssignSchema.safeParse(req.body);
    if (!parsed.success)
      return reply.code(400).send({ error: 'VALIDATION', issues: parsed.error.flatten() });
    try {
      return reply.send(await bulkAssign(req.user!, parsed.data.ids, parsed.data.ownerId));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.post('/bulk-tag', async (req, reply) => {
    const parsed = bulkTagSchema.safeParse(req.body);
    if (!parsed.success)
      return reply.code(400).send({ error: 'VALIDATION', issues: parsed.error.flatten() });
    try {
      return reply.send(await bulkTag(req.user!, parsed.data.ids, parsed.data.tagIds, parsed.data.mode));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.post('/bulk-delete', async (req, reply) => {
    const parsed = bulkDeleteSchema.safeParse(req.body);
    if (!parsed.success)
      return reply.code(400).send({ error: 'VALIDATION', issues: parsed.error.flatten() });
    try {
      return reply.send(await bulkDelete(req.user!, parsed.data.ids));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.get('/:id', async (req, reply) => {
    const params = idParamSchema.safeParse(req.params);
    if (!params.success)
      return reply.code(400).send({ error: 'VALIDATION', issues: params.error.flatten() });
    try {
      return reply.send(await getContact(req.user!, params.data.id));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.post('/', async (req, reply) => {
    const body = contactBodySchema.safeParse(req.body);
    if (!body.success)
      return reply.code(400).send({ error: 'VALIDATION', issues: body.error.flatten() });
    try {
      return reply.code(201).send(await createContact(req.user!, body.data));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.put('/:id', async (req, reply) => {
    const params = idParamSchema.safeParse(req.params);
    if (!params.success)
      return reply.code(400).send({ error: 'VALIDATION', issues: params.error.flatten() });
    const body = contactBodySchema.safeParse(req.body);
    if (!body.success)
      return reply.code(400).send({ error: 'VALIDATION', issues: body.error.flatten() });
    try {
      return reply.send(await updateContact(req.user!, params.data.id, body.data));
    } catch (e) {
      return send(reply, e);
    }
  });

  app.delete('/:id', async (req, reply) => {
    const params = idParamSchema.safeParse(req.params);
    if (!params.success)
      return reply.code(400).send({ error: 'VALIDATION', issues: params.error.flatten() });
    try {
      return reply.send(await deleteContact(req.user!, params.data.id));
    } catch (e) {
      return send(reply, e);
    }
  });
};
