import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
// apps/api/src/lib/uploads.ts → apps/api/uploads
export const UPLOADS_DIR = resolve(here, '../../uploads');
