import { z } from 'zod';

export const scriptIdParam = z.object({ id: z.string().min(1, 'ID inválido') });
export const folderIdParam = z.object({ id: z.string().min(1, 'ID inválido') });

export const listScriptsQuery = z.object({
  folderId: z.string().min(1).optional(),
  search: z.string().trim().min(1).optional(),
});

const mediaTypeEnum = z.enum(['IMAGE', 'AUDIO', 'VIDEO', 'DOCUMENT']);

export const scriptBodySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Nome obrigatório')
    .max(120, 'Nome muito longo (máx. 120)'),
  folderId: z.string().min(1).nullable().optional(),
  content: z.string().min(1, 'Conteúdo obrigatório').max(8000, 'Conteúdo muito longo'),
  mediaType: mediaTypeEnum.nullable().optional(),
  mediaUrl: z
    .string()
    .nullable()
    .optional()
    .refine((v) => !v || v.startsWith('/uploads/') || /^https?:\/\//.test(v), {
      message: 'mediaUrl deve ser /uploads/... ou http(s)://...',
    }),
});

export const renderScriptBody = z.object({
  contactId: z.string().min(1).optional(),
  opportunityId: z.string().min(1).optional(),
});

export const folderBodySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Nome obrigatório')
    .max(80, 'Nome muito longo (máx. 80)'),
  order: z.number().int().min(0).optional(),
});

export const folderReorderSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, 'Lista de pastas vazia'),
});

export type ScriptBodyInput = z.infer<typeof scriptBodySchema>;
export type FolderBodyInput = z.infer<typeof folderBodySchema>;
