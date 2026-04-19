import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(1, 'Senha obrigatória'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token obrigatório'),
});

export const preferencesSchema = z.object({
  theme: z.enum(['light', 'dark', 'auto']).optional(),
  density: z.enum(['compact', 'standard', 'spacious']).optional(),
  notifications: z
    .object({
      sound: z.boolean().optional(),
      desktop: z.boolean().optional(),
      email: z.boolean().optional(),
    })
    .partial()
    .optional(),
});

export const profilePatchSchema = z.object({
  name: z.string().trim().min(2, 'Nome muito curto').max(120, 'Nome muito longo').optional(),
  email: z.string().trim().toLowerCase().email('E-mail inválido').optional(),
  phone: z
    .string()
    .trim()
    .max(32, 'Telefone muito longo')
    .nullable()
    .optional()
    .transform((v) => (v === '' ? null : v)),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Senha atual obrigatória'),
    newPassword: z
      .string()
      .min(8, 'A nova senha deve ter ao menos 8 caracteres')
      .max(128, 'Senha muito longa')
      .refine((v) => /[a-zA-Z]/.test(v), 'Inclua ao menos uma letra')
      .refine((v) => /[0-9]/.test(v), 'Inclua ao menos um número'),
  })
  .refine((d) => d.currentPassword !== d.newPassword, {
    message: 'A nova senha não pode ser igual à atual',
    path: ['newPassword'],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type PreferencesInput = z.infer<typeof preferencesSchema>;
export type ProfilePatchInput = z.infer<typeof profilePatchSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
