import { createReadStream } from 'node:fs';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { prisma, type Prisma } from '../../lib/prisma.js';
import { UPLOADS_DIR } from '../../lib/uploads.js';

export class FileError extends Error {
  status: number;
  code: string;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

type Actor = { id: string; role: string };

export const MAX_OPPORTUNITY_FILE_BYTES = 20 * 1024 * 1024;

const ALLOWED_PREFIXES = ['image/', 'audio/', 'video/'];
const ALLOWED_EXACT = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
]);

export function isAllowedMime(mime: string): boolean {
  if (ALLOWED_PREFIXES.some((p) => mime.startsWith(p))) return true;
  return ALLOWED_EXACT.has(mime);
}

function ownerScope(actor: Actor): Prisma.OpportunityWhereInput {
  if (actor.role === 'ADMIN') return {};
  return { OR: [{ ownerId: actor.id }, { ownerId: null }] };
}

async function assertOpportunityVisible(actor: Actor, opportunityId: string) {
  const opp = await prisma.opportunity.findFirst({
    where: { AND: [{ id: opportunityId }, ownerScope(actor)] },
    select: { id: true },
  });
  if (!opp) throw new FileError('NOT_FOUND', 'Oportunidade não encontrada', 404);
}

export type FileDTO = {
  id: string;
  opportunityId: string;
  name: string;
  mimeType: string;
  size: number;
  url: string;
  createdAt: string;
  uploadedBy: { id: string; name: string; avatar: string | null } | null;
};

function toDTO(f: {
  id: string;
  opportunityId: string;
  name: string;
  mimeType: string;
  size: number;
  url: string;
  createdAt: Date;
  user: { id: string; name: string; avatar: string | null } | null;
}): FileDTO {
  return {
    id: f.id,
    opportunityId: f.opportunityId,
    name: f.name,
    mimeType: f.mimeType,
    size: f.size,
    url: f.url,
    createdAt: f.createdAt.toISOString(),
    uploadedBy: f.user,
  };
}

export async function listFiles(actor: Actor, opportunityId: string): Promise<FileDTO[]> {
  await assertOpportunityVisible(actor, opportunityId);
  const files = await prisma.file.findMany({
    where: { opportunityId },
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { id: true, name: true, avatar: true } } },
  });
  return files.map(toDTO);
}

export async function createFile(
  actor: Actor,
  opportunityId: string,
  file: { originalName: string; mimeType: string; buffer: Buffer },
): Promise<FileDTO> {
  await assertOpportunityVisible(actor, opportunityId);

  if (!isAllowedMime(file.mimeType)) {
    throw new FileError('UNSUPPORTED_MEDIA', 'Tipo de arquivo não suportado', 415);
  }
  if (file.buffer.byteLength > MAX_OPPORTUNITY_FILE_BYTES) {
    throw new FileError('FILE_TOO_LARGE', 'Arquivo excede 20MB', 413);
  }

  const ext = extname(file.originalName) || mimeToExt(file.mimeType);
  const safeName = file.originalName.replace(/[^\w.\-]+/g, '_').slice(0, 80);
  const fileId = randomBytes(8).toString('hex');
  const storedName = `${fileId}${ext}`;
  const dir = resolve(UPLOADS_DIR, 'opportunities', opportunityId);
  await mkdir(dir, { recursive: true });
  await writeFile(resolve(dir, storedName), file.buffer);

  const created = await prisma.file.create({
    data: {
      opportunityId,
      userId: actor.id,
      name: safeName || storedName,
      mimeType: file.mimeType,
      size: file.buffer.byteLength,
      url: `/uploads/opportunities/${opportunityId}/${storedName}`,
    },
    include: { user: { select: { id: true, name: true, avatar: true } } },
  });

  await prisma.opportunityHistory.create({
    data: {
      opportunityId,
      action: 'FILE_UPLOADED',
      userId: actor.id,
      metadata: { fileId: created.id, name: created.name, size: created.size } as Prisma.InputJsonValue,
    },
  });

  return toDTO(created);
}

export async function getFileForDownload(actor: Actor, fileId: string) {
  const file = await prisma.file.findUnique({
    where: { id: fileId },
    include: { opportunity: { select: { id: true, ownerId: true } } },
  });
  if (!file) throw new FileError('NOT_FOUND', 'Arquivo não encontrado', 404);
  // Scope: admin tudo; demais: opp sua ou sem dono
  if (actor.role !== 'ADMIN') {
    const ownedByMe = file.opportunity.ownerId === actor.id || file.opportunity.ownerId === null;
    if (!ownedByMe) throw new FileError('FORBIDDEN', 'Sem acesso a este arquivo', 403);
  }
  if (!file.url.startsWith('/uploads/')) {
    throw new FileError('INVALID_PATH', 'Caminho do arquivo inválido', 500);
  }
  const path = resolve(UPLOADS_DIR, file.url.replace(/^\/uploads\//, ''));
  return { file, stream: createReadStream(path) };
}

export async function deleteFile(actor: Actor, fileId: string): Promise<{ ok: true }> {
  const file = await prisma.file.findUnique({
    where: { id: fileId },
    include: { opportunity: { select: { id: true, ownerId: true } } },
  });
  if (!file) throw new FileError('NOT_FOUND', 'Arquivo não encontrado', 404);
  if (actor.role !== 'ADMIN') {
    const ownedByMe = file.opportunity.ownerId === actor.id || file.opportunity.ownerId === null;
    if (!ownedByMe) throw new FileError('FORBIDDEN', 'Sem acesso', 403);
  }

  await prisma.file.delete({ where: { id: fileId } });
  await prisma.opportunityHistory.create({
    data: {
      opportunityId: file.opportunityId,
      action: 'FILE_DELETED',
      userId: actor.id,
      metadata: { fileId: file.id, name: file.name } as Prisma.InputJsonValue,
    },
  });

  if (file.url.startsWith('/uploads/')) {
    const path = resolve(UPLOADS_DIR, file.url.replace(/^\/uploads\//, ''));
    await unlink(path).catch(() => {});
  }
  return { ok: true };
}

function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'application/pdf': '.pdf',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.ms-excel': '.xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'audio/mpeg': '.mp3',
    'audio/ogg': '.ogg',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'text/plain': '.txt',
    'text/csv': '.csv',
  };
  return map[mime] ?? '.bin';
}
