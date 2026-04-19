import { unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { prisma, Prisma } from '../../lib/prisma.js';
import { normalizePhone, phoneVariants } from '../../lib/phone.js';
import { UPLOADS_DIR } from '../../lib/uploads.js';

export class ContactError extends Error {
  status: number;
  code: string;
  extra?: Record<string, unknown>;
  constructor(code: string, message: string, status = 400, extra?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.status = status;
    this.extra = extra;
  }
}

type Actor = { id: string; role: string };

export type ContactListItem = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  ownerId: string | null;
  ownerName: string | null;
  tags: { id: string; name: string; color: string }[];
  opportunityCount: number;
  lastInteractionAt: string | null;
  createdAt: string;
};

export type ContactDetail = ContactListItem & {
  birthDate: string | null;
  cpf: string | null;
  address: Record<string, string> | null;
  notes: string | null;
  updatedAt: string;
  opportunities: {
    id: string;
    title: string;
    value: number;
    pipelineId: string;
    stageId: string;
    stageName: string;
    createdAt: string;
  }[];
};

// ----------------- Helpers -----------------

function ownerScope(actor: Actor): Prisma.ContactWhereInput {
  if (actor.role === 'ADMIN') return {};
  return { OR: [{ ownerId: actor.id }, { ownerId: null }] };
}

function toListItem(c: {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  ownerId: string | null;
  owner: { name: string } | null;
  tags: { id: string; name: string; color: string }[];
  _count: { opportunities: number };
  conversations: { lastMessageAt: Date | null }[];
  createdAt: Date;
}): ContactListItem {
  const lastInteraction = c.conversations
    .map((cv) => cv.lastMessageAt)
    .filter((d): d is Date => d != null)
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  return {
    id: c.id,
    name: c.name,
    phone: c.phone,
    email: c.email,
    ownerId: c.ownerId,
    ownerName: c.owner?.name ?? null,
    tags: c.tags.map((t) => ({ id: t.id, name: t.name, color: t.color })),
    opportunityCount: c._count.opportunities,
    lastInteractionAt: lastInteraction ? lastInteraction.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
  };
}

const LIST_INCLUDE = {
  owner: { select: { name: true } },
  tags: { select: { id: true, name: true, color: true } },
  _count: { select: { opportunities: true } },
  conversations: { select: { lastMessageAt: true } },
} as const;

// ----------------- LIST -----------------

type ListInput = {
  search?: string;
  tagIds?: string[];
  ownerId?: string;
  hasOwner?: boolean;
  createdFrom?: string;
  createdTo?: string;
  page: number;
  limit: number;
  sortBy: 'name' | 'phone' | 'createdAt' | 'updatedAt';
  sortOrder: 'asc' | 'desc';
};

export async function listContacts(
  actor: Actor,
  args: ListInput,
): Promise<{ data: ContactListItem[]; total: number; page: number; totalPages: number }> {
  const where = buildListWhere(actor, args);
  const orderBy: Prisma.ContactOrderByWithRelationInput = { [args.sortBy]: args.sortOrder };

  const [total, rows] = await Promise.all([
    prisma.contact.count({ where }),
    prisma.contact.findMany({
      where,
      orderBy,
      skip: (args.page - 1) * args.limit,
      take: args.limit,
      include: LIST_INCLUDE,
    }),
  ]);

  return {
    data: rows.map(toListItem),
    total,
    page: args.page,
    totalPages: Math.max(1, Math.ceil(total / args.limit)),
  };
}

function buildListWhere(actor: Actor, args: ListInput): Prisma.ContactWhereInput {
  const filters: Prisma.ContactWhereInput[] = [ownerScope(actor)];

  if (args.search) {
    const digits = normalizePhone(args.search);
    const ors: Prisma.ContactWhereInput[] = [
      { name: { contains: args.search, mode: 'insensitive' } },
    ];
    if (digits.length >= 3) {
      ors.push({ phone: { contains: digits } });
    }
    filters.push({ OR: ors });
  }
  if (args.tagIds && args.tagIds.length > 0) {
    filters.push({ tags: { some: { id: { in: args.tagIds } } } });
  }
  if (args.ownerId) {
    filters.push({ ownerId: args.ownerId });
  } else if (args.hasOwner === false) {
    filters.push({ ownerId: null });
  } else if (args.hasOwner === true) {
    filters.push({ ownerId: { not: null } });
  }
  if (args.createdFrom) {
    filters.push({ createdAt: { gte: new Date(args.createdFrom) } });
  }
  if (args.createdTo) {
    filters.push({ createdAt: { lte: new Date(args.createdTo) } });
  }
  return filters.length === 1 ? filters[0]! : { AND: filters };
}

// ----------------- GET DETAIL -----------------

export async function getContact(actor: Actor, id: string): Promise<ContactDetail> {
  const c = await prisma.contact.findFirst({
    where: { AND: [{ id }, ownerScope(actor)] },
    include: {
      ...LIST_INCLUDE,
      opportunities: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          value: true,
          pipelineId: true,
          stageId: true,
          stage: { select: { name: true } },
          createdAt: true,
        },
      },
    },
  });
  if (!c) throw new ContactError('NOT_FOUND', 'Contato não encontrado', 404);
  const base = toListItem(c);
  return {
    ...base,
    birthDate: c.birthDate ? c.birthDate.toISOString() : null,
    cpf: c.cpf,
    address: (c.address as Record<string, string> | null) ?? null,
    notes: c.notes,
    updatedAt: c.updatedAt.toISOString(),
    opportunities: c.opportunities.map((o) => ({
      id: o.id,
      title: o.title,
      value: Number(o.value),
      pipelineId: o.pipelineId,
      stageId: o.stageId,
      stageName: o.stage.name,
      createdAt: o.createdAt.toISOString(),
    })),
  };
}

// ----------------- CREATE -----------------

type CreateInput = {
  name: string;
  phone: string;
  email?: string | null;
  birthDate?: Date | null;
  cpf?: string | null;
  address?: Record<string, string> | null;
  notes?: string | null;
  ownerId?: string | null;
  tagIds?: string[];
};

export async function createContact(actor: Actor, input: CreateInput): Promise<ContactDetail> {
  const phone = normalizePhone(input.phone);
  if (!phone) throw new ContactError('INVALID_PHONE', 'Telefone inválido', 400);

  const existing = await prisma.contact.findFirst({
    where: { phone: { in: phoneVariants(input.phone) } },
    select: { id: true, name: true },
  });
  if (existing) {
    throw new ContactError(
      'PHONE_IN_USE',
      `Já existe um contato (${existing.name}) com este telefone`,
      409,
      { contactId: existing.id },
    );
  }

  if (input.tagIds && input.tagIds.length > 0) {
    const found = await prisma.tag.findMany({ where: { id: { in: input.tagIds } }, select: { id: true } });
    if (found.length !== input.tagIds.length) {
      throw new ContactError('INVALID_TAGS', 'Uma ou mais tags não existem', 400);
    }
  }
  if (input.ownerId) {
    const u = await prisma.user.findUnique({ where: { id: input.ownerId }, select: { id: true } });
    if (!u) throw new ContactError('INVALID_OWNER', 'Responsável não encontrado', 400);
  }

  const created = await prisma.contact.create({
    data: {
      name: input.name,
      phone,
      email: input.email ?? null,
      birthDate: input.birthDate ?? null,
      cpf: input.cpf ?? null,
      address: (input.address as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
      notes: input.notes ?? null,
      ownerId: input.ownerId ?? null,
      tags: input.tagIds ? { connect: input.tagIds.map((id) => ({ id })) } : undefined,
    },
    select: { id: true },
  });
  return getContact(actor, created.id);
}

// ----------------- UPDATE -----------------

export async function updateContact(actor: Actor, id: string, input: CreateInput): Promise<ContactDetail> {
  const current = await prisma.contact.findFirst({
    where: { AND: [{ id }, ownerScope(actor)] },
    select: { id: true, phone: true },
  });
  if (!current) throw new ContactError('NOT_FOUND', 'Contato não encontrado', 404);

  const phone = normalizePhone(input.phone);
  if (!phone) throw new ContactError('INVALID_PHONE', 'Telefone inválido', 400);

  if (phone !== normalizePhone(current.phone)) {
    const conflict = await prisma.contact.findFirst({
      where: { phone: { in: phoneVariants(input.phone) }, NOT: { id } },
      select: { id: true, name: true },
    });
    if (conflict) {
      throw new ContactError('PHONE_IN_USE', `Já existe um contato (${conflict.name}) com este telefone`, 409, {
        contactId: conflict.id,
      });
    }
  }

  if (input.tagIds) {
    const found = await prisma.tag.findMany({ where: { id: { in: input.tagIds } }, select: { id: true } });
    if (found.length !== input.tagIds.length) {
      throw new ContactError('INVALID_TAGS', 'Uma ou mais tags não existem', 400);
    }
  }
  if (input.ownerId) {
    const u = await prisma.user.findUnique({ where: { id: input.ownerId }, select: { id: true } });
    if (!u) throw new ContactError('INVALID_OWNER', 'Responsável não encontrado', 400);
  }

  await prisma.contact.update({
    where: { id },
    data: {
      name: input.name,
      phone,
      email: input.email ?? null,
      birthDate: input.birthDate ?? null,
      cpf: input.cpf ?? null,
      address: (input.address as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
      notes: input.notes ?? null,
      ownerId: input.ownerId ?? null,
      ...(input.tagIds ? { tags: { set: input.tagIds.map((tid) => ({ id: tid })) } } : {}),
    },
  });
  return getContact(actor, id);
}

// ----------------- DELETE -----------------

export async function deleteContact(actor: Actor, id: string): Promise<{ ok: true }> {
  const c = await prisma.contact.findFirst({
    where: { AND: [{ id }, ownerScope(actor)] },
    include: { opportunities: { include: { files: { select: { url: true } } } } },
  });
  if (!c) throw new ContactError('NOT_FOUND', 'Contato não encontrado', 404);

  // Coleta arquivos pra deletar do disco depois (cascade SQL apaga só linhas)
  const fileUrls = c.opportunities.flatMap((o) => o.files.map((f) => f.url));

  await prisma.contact.delete({ where: { id } });

  // Tenta apagar arquivos do disco — best effort
  for (const url of fileUrls) {
    if (!url.startsWith('/uploads/')) continue;
    const path = resolve(UPLOADS_DIR, url.replace(/^\/uploads\//, ''));
    await unlink(path).catch(() => {});
  }

  return { ok: true };
}

// ----------------- BULK ACTIONS -----------------

export async function bulkAssign(
  actor: Actor,
  ids: string[],
  ownerId: string | null,
): Promise<{ ok: true; affected: number }> {
  if (ownerId) {
    const u = await prisma.user.findUnique({ where: { id: ownerId }, select: { id: true } });
    if (!u) throw new ContactError('INVALID_OWNER', 'Responsável não encontrado', 400);
  }
  const r = await prisma.contact.updateMany({
    where: { AND: [{ id: { in: ids } }, ownerScope(actor)] },
    data: { ownerId: ownerId },
  });
  return { ok: true, affected: r.count };
}

export async function bulkTag(
  actor: Actor,
  ids: string[],
  tagIds: string[],
  mode: 'add' | 'replace' | 'remove',
): Promise<{ ok: true; affected: number }> {
  const tags = await prisma.tag.findMany({ where: { id: { in: tagIds } }, select: { id: true } });
  if (tags.length !== tagIds.length) {
    throw new ContactError('INVALID_TAGS', 'Uma ou mais tags não existem', 400);
  }
  const visible = await prisma.contact.findMany({
    where: { AND: [{ id: { in: ids } }, ownerScope(actor)] },
    select: { id: true },
  });
  if (visible.length === 0) return { ok: true, affected: 0 };

  // Não há updateMany pra relações N:N — itera (mas em transação).
  // Com role scoping aplicado, opera só nos IDs visíveis.
  await prisma.$transaction(
    visible.map((c) =>
      prisma.contact.update({
        where: { id: c.id },
        data:
          mode === 'replace'
            ? { tags: { set: tagIds.map((id) => ({ id })) } }
            : mode === 'add'
              ? { tags: { connect: tagIds.map((id) => ({ id })) } }
              : { tags: { disconnect: tagIds.map((id) => ({ id })) } },
      }),
    ),
  );
  return { ok: true, affected: visible.length };
}

export async function bulkDelete(actor: Actor, ids: string[]): Promise<{ ok: true; affected: number }> {
  const visible = await prisma.contact.findMany({
    where: { AND: [{ id: { in: ids } }, ownerScope(actor)] },
    include: { opportunities: { include: { files: { select: { url: true } } } } },
  });
  if (visible.length === 0) return { ok: true, affected: 0 };

  const fileUrls = visible.flatMap((c) => c.opportunities.flatMap((o) => o.files.map((f) => f.url)));
  await prisma.contact.deleteMany({ where: { id: { in: visible.map((c) => c.id) } } });

  for (const url of fileUrls) {
    if (!url.startsWith('/uploads/')) continue;
    const path = resolve(UPLOADS_DIR, url.replace(/^\/uploads\//, ''));
    await unlink(path).catch(() => {});
  }
  return { ok: true, affected: visible.length };
}

// ----------------- EXPORT CSV -----------------

export async function exportContactsCsv(actor: Actor, args: ListInput): Promise<string> {
  // Mesmo where da listagem, mas ignora paginação
  const where = buildListWhere(actor, { ...args, page: 1, limit: 1 });
  const rows = await prisma.contact.findMany({
    where,
    orderBy: { [args.sortBy]: args.sortOrder },
    include: LIST_INCLUDE,
  });

  const header = [
    'id', 'nome', 'telefone', 'email', 'cpf',
    'responsavel', 'tags', 'oportunidades', 'criado_em',
  ];
  const lines = [header.map(csvEscape).join(',')];
  for (const c of rows) {
    const item = toListItem(c);
    lines.push(
      [
        item.id,
        item.name,
        item.phone,
        item.email ?? '',
        c.cpf ?? '',
        item.ownerName ?? '',
        item.tags.map((t) => t.name).join('; '),
        String(item.opportunityCount),
        new Date(item.createdAt).toISOString(),
      ].map(csvEscape).join(','),
    );
  }
  // BOM pra Excel reconhecer UTF-8
  return '\uFEFF' + lines.join('\n');
}

function csvEscape(v: string): string {
  if (v.includes(',') || v.includes('"') || v.includes('\n')) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}
