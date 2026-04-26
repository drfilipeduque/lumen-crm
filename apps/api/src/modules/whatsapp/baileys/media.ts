import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { downloadMediaMessage, type WAMessage } from 'baileys';
import { UPLOADS_DIR } from '../../../lib/uploads.js';

export const MESSAGES_DIR = 'messages';

export type SavedMedia = {
  url: string; // /uploads/messages/<connectionId>/<file>
  absPath: string;
  size: number;
  name: string;
};

export type MessageMediaInput = {
  buffer: Buffer;
  mimeType: string;
  originalName?: string | null;
};

export async function saveMessageMedia(
  connectionId: string,
  input: MessageMediaInput,
): Promise<SavedMedia> {
  const dir = resolve(UPLOADS_DIR, MESSAGES_DIR, connectionId);
  await mkdir(dir, { recursive: true });

  const safeName = (input.originalName ?? '').replace(/[^\w.\-]+/g, '_').slice(0, 80);
  const ext = (safeName ? extname(safeName) : '') || mimeToExt(input.mimeType);
  const id = randomBytes(8).toString('hex');
  const storedName = `${id}${ext}`;
  const absPath = resolve(dir, storedName);
  await writeFile(absPath, input.buffer);

  return {
    url: `/uploads/${MESSAGES_DIR}/${connectionId}/${storedName}`,
    absPath,
    size: input.buffer.byteLength,
    name: safeName || storedName,
  };
}

// Lê arquivo do disco a partir de um path /uploads/...
// Usado pra enviar mídia que foi previamente uploaded.
export async function readUploadedFile(url: string): Promise<{ buffer: Buffer; size: number }> {
  if (!url.startsWith('/uploads/')) throw new Error('URL inválida');
  const rel = url.replace(/^\/uploads\//, '');
  const abs = resolve(UPLOADS_DIR, rel);
  const buffer = await readFile(abs);
  return { buffer, size: buffer.byteLength };
}

// Baixa mídia de uma WAMessage (Baileys) — best effort.
export async function downloadIncomingMedia(
  msg: WAMessage,
): Promise<{ buffer: Buffer; mimeType: string; fileName: string | null } | null> {
  const m = msg.message;
  if (!m) return null;

  let mimeType = 'application/octet-stream';
  let fileName: string | null = null;

  if (m.imageMessage) {
    mimeType = m.imageMessage.mimetype ?? 'image/jpeg';
  } else if (m.audioMessage) {
    mimeType = m.audioMessage.mimetype ?? 'audio/ogg';
  } else if (m.videoMessage) {
    mimeType = m.videoMessage.mimetype ?? 'video/mp4';
  } else if (m.documentMessage) {
    mimeType = m.documentMessage.mimetype ?? 'application/octet-stream';
    fileName = m.documentMessage.fileName ?? null;
  } else {
    return null;
  }

  try {
    const buffer = await downloadMediaMessage(msg, 'buffer', {});
    return { buffer: buffer as Buffer, mimeType, fileName };
  } catch {
    return null;
  }
}

export function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'audio/mpeg': '.mp3',
    'audio/mp4': '.m4a',
    'audio/ogg': '.ogg',
    'audio/webm': '.webm',
    'audio/wav': '.wav',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/quicktime': '.mov',
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

export function inferMessageTypeFromMime(
  mime: string,
): 'IMAGE' | 'AUDIO' | 'VIDEO' | 'DOCUMENT' {
  if (mime.startsWith('image/')) return 'IMAGE';
  if (mime.startsWith('audio/')) return 'AUDIO';
  if (mime.startsWith('video/')) return 'VIDEO';
  return 'DOCUMENT';
}

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

export function isAllowedMessageMime(mime: string): boolean {
  if (ALLOWED_PREFIXES.some((p) => mime.startsWith(p))) return true;
  return ALLOWED_EXACT.has(mime);
}

export const MAX_MESSAGE_FILE_BYTES = 20 * 1024 * 1024;
