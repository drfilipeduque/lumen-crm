import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { prisma } from '../../lib/prisma.js';
import { UPLOADS_DIR } from '../../lib/uploads.js';
import { extractVariables, renderScript, type RenderContext } from './render.js';

export class ScriptError extends Error {
  status: number;
  code: string;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export type ScriptMediaType = 'IMAGE' | 'AUDIO' | 'VIDEO' | 'DOCUMENT';

export type ScriptDTO = {
  id: string;
  name: string;
  folderId: string | null;
  folderName: string | null;
  content: string;
  mediaType: ScriptMediaType | null;
  mediaUrl: string | null;
  variables: string[];
  createdAt: string;
  updatedAt: string;
};

export type FolderDTO = {
  id: string;
  name: string;
  order: number;
  scriptCount: number;
};

type ScriptRow = {
  id: string;
  name: string;
  folderId: string | null;
  content: string;
  mediaType: string | null;
  mediaUrl: string | null;
  variables: unknown;
  createdAt: Date;
  updatedAt: Date;
  folder: { id: string; name: string } | null;
};

function toScriptDTO(s: ScriptRow): ScriptDTO {
  const fromStored = Array.isArray(s.variables) ? (s.variables as unknown[]).filter((x) => typeof x === 'string') as string[] : null;
  const vars = fromStored && fromStored.length > 0 ? fromStored : extractVariables(s.content);
  const mediaType = (s.mediaType as ScriptMediaType | null) ?? null;
  return {
    id: s.id,
    name: s.name,
    folderId: s.folderId,
    folderName: s.folder?.name ?? null,
    content: s.content,
    mediaType,
    mediaUrl: s.mediaUrl,
    variables: vars,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

const scriptInclude = { folder: { select: { id: true, name: true } } } as const;

export async function listScripts(input: { folderId?: string; search?: string }): Promise<ScriptDTO[]> {
  const where: Record<string, unknown> = {};
  if (input.folderId) where.folderId = input.folderId;
  if (input.search) {
    where.OR = [
      { name: { contains: input.search, mode: 'insensitive' } },
      { content: { contains: input.search, mode: 'insensitive' } },
    ];
  }
  const rows = await prisma.script.findMany({
    where,
    orderBy: [{ updatedAt: 'desc' }],
    include: scriptInclude,
  });
  return rows.map(toScriptDTO);
}

export async function getScript(id: string): Promise<ScriptDTO> {
  const s = await prisma.script.findUnique({ where: { id }, include: scriptInclude });
  if (!s) throw new ScriptError('NOT_FOUND', 'Script não encontrado', 404);
  return toScriptDTO(s);
}

export async function createScript(input: {
  name: string;
  folderId?: string | null;
  content: string;
  mediaType?: ScriptMediaType | null;
  mediaUrl?: string | null;
}): Promise<ScriptDTO> {
  if (input.folderId) await assertFolderExists(input.folderId);
  const created = await prisma.script.create({
    data: {
      name: input.name,
      folderId: input.folderId ?? null,
      content: input.content,
      mediaType: input.mediaType ?? null,
      mediaUrl: input.mediaUrl ?? null,
      variables: extractVariables(input.content),
    },
    include: scriptInclude,
  });
  return toScriptDTO(created);
}

export async function updateScript(
  id: string,
  input: {
    name: string;
    folderId?: string | null;
    content: string;
    mediaType?: ScriptMediaType | null;
    mediaUrl?: string | null;
  },
): Promise<ScriptDTO> {
  if (input.folderId) await assertFolderExists(input.folderId);
  try {
    const updated = await prisma.script.update({
      where: { id },
      data: {
        name: input.name,
        folderId: input.folderId ?? null,
        content: input.content,
        mediaType: input.mediaType ?? null,
        mediaUrl: input.mediaUrl ?? null,
        variables: extractVariables(input.content),
      },
      include: scriptInclude,
    });
    return toScriptDTO(updated);
  } catch (e) {
    if ((e as { code?: string }).code === 'P2025')
      throw new ScriptError('NOT_FOUND', 'Script não encontrado', 404);
    throw e;
  }
}

export async function deleteScript(id: string): Promise<{ ok: true }> {
  const s = await prisma.script.findUnique({ where: { id }, select: { id: true, mediaUrl: true } });
  if (!s) throw new ScriptError('NOT_FOUND', 'Script não encontrado', 404);
  await prisma.script.delete({ where: { id } });
  if (s.mediaUrl?.startsWith('/uploads/scripts/')) {
    const path = resolve(UPLOADS_DIR, s.mediaUrl.replace(/^\/uploads\//, ''));
    await unlink(path).catch(() => {});
  }
  return { ok: true };
}

export async function duplicateScript(id: string): Promise<ScriptDTO> {
  const original = await prisma.script.findUnique({ where: { id } });
  if (!original) throw new ScriptError('NOT_FOUND', 'Script não encontrado', 404);
  const copy = await prisma.script.create({
    data: {
      name: `${original.name} (cópia)`,
      folderId: original.folderId,
      content: original.content,
      mediaType: original.mediaType,
      mediaUrl: original.mediaUrl,
      variables: extractVariables(original.content),
    },
    include: scriptInclude,
  });
  return toScriptDTO(copy);
}

// ---------- render ----------

export async function renderScriptById(
  id: string,
  input: { contactId?: string; opportunityId?: string },
  user: { id: string },
): Promise<{ id: string; content: string; mediaType: ScriptMediaType | null; mediaUrl: string | null }> {
  const script = await prisma.script.findUnique({ where: { id } });
  if (!script) throw new ScriptError('NOT_FOUND', 'Script não encontrado', 404);

  const ctx: RenderContext = {};

  if (input.contactId) {
    const c = await prisma.contact.findUnique({
      where: { id: input.contactId },
      select: { id: true, name: true, phone: true, email: true },
    });
    if (c) ctx.contact = c;
  }
  if (input.opportunityId) {
    const o = await prisma.opportunity.findUnique({
      where: { id: input.opportunityId },
      select: {
        id: true,
        title: true,
        value: true,
        stage: { select: { name: true } },
        contact: { select: { id: true, name: true, phone: true, email: true } },
      },
    });
    if (o) {
      ctx.opportunity = {
        title: o.title,
        value: o.value !== null ? Number(o.value) : null,
        stage: o.stage,
      };
      if (!ctx.contact && o.contact) ctx.contact = o.contact;
    }
  }
  const u = await prisma.user.findUnique({ where: { id: user.id }, select: { name: true } });
  if (u) ctx.user = u;

  const content = renderScript(script.content, ctx);
  return {
    id: script.id,
    content,
    mediaType: (script.mediaType as ScriptMediaType | null) ?? null,
    mediaUrl: script.mediaUrl,
  };
}

// ---------- media upload ----------

const MEDIA_PREFIXES: Record<ScriptMediaType, string[]> = {
  IMAGE: ['image/'],
  AUDIO: ['audio/'],
  VIDEO: ['video/'],
  DOCUMENT: [],
};

const DOC_MIMES = new Set([
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

export const MAX_SCRIPT_MEDIA_BYTES = 20 * 1024 * 1024;

function detectMediaType(mime: string): ScriptMediaType | null {
  if (mime.startsWith('image/')) return 'IMAGE';
  if (mime.startsWith('audio/')) return 'AUDIO';
  if (mime.startsWith('video/')) return 'VIDEO';
  if (DOC_MIMES.has(mime)) return 'DOCUMENT';
  return null;
}

function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'audio/mpeg': '.mp3',
    'audio/ogg': '.ogg',
    'audio/wav': '.wav',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'application/pdf': '.pdf',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.ms-excel': '.xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'text/plain': '.txt',
    'text/csv': '.csv',
  };
  return map[mime] ?? '.bin';
}

export async function uploadScriptMedia(
  id: string,
  file: { originalName: string; mimeType: string; buffer: Buffer },
): Promise<ScriptDTO> {
  const script = await prisma.script.findUnique({ where: { id } });
  if (!script) throw new ScriptError('NOT_FOUND', 'Script não encontrado', 404);

  const mediaType = detectMediaType(file.mimeType);
  if (!mediaType) throw new ScriptError('UNSUPPORTED_MEDIA', 'Tipo de mídia não suportado', 415);
  if (file.buffer.byteLength > MAX_SCRIPT_MEDIA_BYTES)
    throw new ScriptError('FILE_TOO_LARGE', 'Arquivo excede 20MB', 413);

  const ext = extname(file.originalName) || mimeToExt(file.mimeType);
  const fileId = randomBytes(8).toString('hex');
  const storedName = `${fileId}${ext}`;
  const dir = resolve(UPLOADS_DIR, 'scripts', id);
  await mkdir(dir, { recursive: true });
  await writeFile(resolve(dir, storedName), file.buffer);
  const url = `/uploads/scripts/${id}/${storedName}`;

  if (script.mediaUrl?.startsWith('/uploads/scripts/')) {
    const oldPath = resolve(UPLOADS_DIR, script.mediaUrl.replace(/^\/uploads\//, ''));
    await unlink(oldPath).catch(() => {});
  }

  const updated = await prisma.script.update({
    where: { id },
    data: { mediaType, mediaUrl: url },
    include: scriptInclude,
  });
  return toScriptDTO(updated);
}

export async function removeScriptMedia(id: string): Promise<ScriptDTO> {
  const script = await prisma.script.findUnique({ where: { id } });
  if (!script) throw new ScriptError('NOT_FOUND', 'Script não encontrado', 404);
  if (script.mediaUrl?.startsWith('/uploads/scripts/')) {
    const path = resolve(UPLOADS_DIR, script.mediaUrl.replace(/^\/uploads\//, ''));
    await unlink(path).catch(() => {});
  }
  const updated = await prisma.script.update({
    where: { id },
    data: { mediaType: null, mediaUrl: null },
    include: scriptInclude,
  });
  return toScriptDTO(updated);
}

// ---------- folders ----------

async function assertFolderExists(id: string) {
  const f = await prisma.scriptFolder.findUnique({ where: { id }, select: { id: true } });
  if (!f) throw new ScriptError('FOLDER_NOT_FOUND', 'Pasta não encontrada', 404);
}

export async function listFolders(): Promise<FolderDTO[]> {
  const rows = await prisma.scriptFolder.findMany({
    orderBy: [{ order: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { scripts: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    order: r.order,
    scriptCount: r._count.scripts,
  }));
}

export async function createFolder(input: { name: string; order?: number }): Promise<FolderDTO> {
  const max = await prisma.scriptFolder.aggregate({ _max: { order: true } });
  const order = input.order ?? (max._max.order ?? -1) + 1;
  const f = await prisma.scriptFolder.create({
    data: { name: input.name, order },
    include: { _count: { select: { scripts: true } } },
  });
  return { id: f.id, name: f.name, order: f.order, scriptCount: f._count.scripts };
}

export async function updateFolder(id: string, input: { name: string; order?: number }): Promise<FolderDTO> {
  try {
    const f = await prisma.scriptFolder.update({
      where: { id },
      data: { name: input.name, ...(input.order != null ? { order: input.order } : {}) },
      include: { _count: { select: { scripts: true } } },
    });
    return { id: f.id, name: f.name, order: f.order, scriptCount: f._count.scripts };
  } catch (e) {
    if ((e as { code?: string }).code === 'P2025')
      throw new ScriptError('FOLDER_NOT_FOUND', 'Pasta não encontrada', 404);
    throw e;
  }
}

export async function deleteFolder(id: string): Promise<{ ok: true }> {
  const f = await prisma.scriptFolder.findUnique({ where: { id }, select: { id: true } });
  if (!f) throw new ScriptError('FOLDER_NOT_FOUND', 'Pasta não encontrada', 404);
  // Scripts viram "sem pasta" automaticamente (FK ON DELETE SET NULL no schema)
  await prisma.scriptFolder.delete({ where: { id } });
  return { ok: true };
}

export async function reorderFolders(ids: string[]): Promise<FolderDTO[]> {
  await prisma.$transaction(
    ids.map((id, idx) =>
      prisma.scriptFolder.update({ where: { id }, data: { order: idx } }),
    ),
  );
  return listFolders();
}
