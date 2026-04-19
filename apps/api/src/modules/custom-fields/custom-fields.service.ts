import { prisma } from '../../lib/prisma.js';
import { Prisma } from '../../lib/prisma.js';

export class CustomFieldError extends Error {
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

export type CustomFieldDTO = {
  id: string;
  name: string;
  type: string;
  options: { label: string; value: string }[] | null;
  required: boolean;
  active: boolean;
  order: number;
  valueCount: number;
};

function normalizeOptions(raw: unknown): { label: string; value: string }[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.map((item) => {
    if (typeof item === 'string') return { label: item, value: item };
    if (item && typeof item === 'object') {
      const o = item as { label?: unknown; value?: unknown };
      return { label: String(o.label ?? ''), value: String(o.value ?? '') };
    }
    return { label: String(item), value: String(item) };
  });
}

function toDTO(f: {
  id: string;
  name: string;
  type: string;
  options: unknown;
  required: boolean;
  active: boolean;
  order: number;
  _count: { values: number };
}): CustomFieldDTO {
  return {
    id: f.id,
    name: f.name,
    type: f.type,
    options: normalizeOptions(f.options),
    required: f.required,
    active: f.active,
    order: f.order,
    valueCount: f._count.values,
  };
}

const INCLUDE = { _count: { select: { values: true } } } as const;

async function findByCaseInsensitiveName(name: string, excludeId?: string) {
  return prisma.customField.findFirst({
    where: {
      name: { equals: name, mode: 'insensitive' },
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { id: true },
  });
}

export async function listCustomFields(): Promise<CustomFieldDTO[]> {
  const fields = await prisma.customField.findMany({
    include: INCLUDE,
    orderBy: [{ order: 'asc' }, { name: 'asc' }],
  });
  return fields.map(toDTO);
}

export async function getCustomField(id: string): Promise<CustomFieldDTO> {
  const field = await prisma.customField.findUnique({ where: { id }, include: INCLUDE });
  if (!field) throw new CustomFieldError('NOT_FOUND', 'Campo não encontrado', 404);
  return toDTO(field);
}

type CreateInput = {
  name: string;
  type: string;
  options?: { label: string; value: string }[];
  required: boolean;
  active: boolean;
};

export async function createCustomField(input: CreateInput): Promise<CustomFieldDTO> {
  const conflict = await findByCaseInsensitiveName(input.name);
  if (conflict)
    throw new CustomFieldError('NAME_IN_USE', 'Já existe um campo com esse nome', 409);

  const max = await prisma.customField.aggregate({ _max: { order: true } });
  const nextOrder = (max._max.order ?? -1) + 1;

  const field = await prisma.customField.create({
    data: {
      name: input.name,
      type: input.type as Prisma.CustomFieldCreateInput['type'],
      options: (input.options as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      required: input.required,
      active: input.active,
      order: nextOrder,
    },
    include: INCLUDE,
  });
  return toDTO(field);
}

export async function updateCustomField(id: string, input: CreateInput): Promise<CustomFieldDTO> {
  const conflict = await findByCaseInsensitiveName(input.name, id);
  if (conflict)
    throw new CustomFieldError('NAME_IN_USE', 'Já existe um campo com esse nome', 409);
  try {
    const field = await prisma.customField.update({
      where: { id },
      data: {
        name: input.name,
        type: input.type as Prisma.CustomFieldUpdateInput['type'],
        options: (input.options as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        required: input.required,
        active: input.active,
      },
      include: INCLUDE,
    });
    return toDTO(field);
  } catch (e) {
    if ((e as { code?: string }).code === 'P2025')
      throw new CustomFieldError('NOT_FOUND', 'Campo não encontrado', 404);
    throw e;
  }
}

export async function deleteCustomField(
  id: string,
  force = false,
): Promise<{ ok: true; valuesRemoved?: number }> {
  const field = await prisma.customField.findUnique({ where: { id }, include: INCLUDE });
  if (!field) throw new CustomFieldError('NOT_FOUND', 'Campo não encontrado', 404);

  const usage = field._count.values;
  if (usage > 0 && !force) {
    throw new CustomFieldError(
      'IN_USE',
      `Este campo possui ${usage} valor(es) preenchido(s). Use force=true para remover tudo e excluir.`,
      409,
      { valueCount: usage },
    );
  }

  if (force && usage > 0) {
    await prisma.customFieldValue.deleteMany({ where: { customFieldId: id } });
  }
  await prisma.customField.delete({ where: { id } });
  return { ok: true, valuesRemoved: force ? usage : undefined };
}

export async function reorderCustomFields(ids: string[]): Promise<CustomFieldDTO[]> {
  const existing = await prisma.customField.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  if (existing.length !== ids.length) {
    throw new CustomFieldError(
      'INVALID_IDS',
      'A lista contém IDs que não existem',
      400,
      { missing: ids.filter((id) => !existing.some((e) => e.id === id)) },
    );
  }
  await prisma.$transaction(
    ids.map((id, idx) => prisma.customField.update({ where: { id }, data: { order: idx } })),
  );
  return listCustomFields();
}
