import { prisma } from '../../lib/prisma.js';

export class TagError extends Error {
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

export type TagDTO = {
  id: string;
  name: string;
  color: string;
  usageCount: number;
};

function toDTO(t: { id: string; name: string; color: string; _count: { opportunities: number } }): TagDTO {
  return { id: t.id, name: t.name, color: t.color, usageCount: t._count.opportunities };
}

export async function listTags(): Promise<TagDTO[]> {
  const tags = await prisma.tag.findMany({
    include: { _count: { select: { opportunities: true } } },
    orderBy: [{ name: 'asc' }],
  });
  return tags.map(toDTO);
}

async function findByCaseInsensitiveName(name: string, excludeId?: string) {
  return prisma.tag.findFirst({
    where: {
      name: { equals: name, mode: 'insensitive' },
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { id: true },
  });
}

export async function createTag(input: { name: string; color: string }): Promise<TagDTO> {
  const conflict = await findByCaseInsensitiveName(input.name);
  if (conflict) throw new TagError('NAME_IN_USE', 'Já existe uma tag com esse nome', 409);
  const tag = await prisma.tag.create({
    data: input,
    include: { _count: { select: { opportunities: true } } },
  });
  return toDTO(tag);
}

export async function updateTag(id: string, input: { name: string; color: string }): Promise<TagDTO> {
  const conflict = await findByCaseInsensitiveName(input.name, id);
  if (conflict) throw new TagError('NAME_IN_USE', 'Já existe uma tag com esse nome', 409);
  try {
    const tag = await prisma.tag.update({
      where: { id },
      data: input,
      include: { _count: { select: { opportunities: true } } },
    });
    return toDTO(tag);
  } catch (e) {
    if ((e as { code?: string }).code === 'P2025')
      throw new TagError('NOT_FOUND', 'Tag não encontrada', 404);
    throw e;
  }
}

export async function deleteTag(id: string, force = false): Promise<{ ok: true; removedFrom?: number }> {
  const tag = await prisma.tag.findUnique({
    where: { id },
    include: { _count: { select: { opportunities: true } } },
  });
  if (!tag) throw new TagError('NOT_FOUND', 'Tag não encontrada', 404);

  const usage = tag._count.opportunities;
  if (usage > 0 && !force) {
    throw new TagError(
      'IN_USE',
      `Esta tag está em uso por ${usage} oportunidade(s). Use force=true para remover de todas e excluir.`,
      409,
      { usageCount: usage },
    );
  }

  if (force && usage > 0) {
    await prisma.tag.update({ where: { id }, data: { opportunities: { set: [] } } });
  }
  await prisma.tag.delete({ where: { id } });
  return { ok: true, removedFrom: force ? usage : undefined };
}
