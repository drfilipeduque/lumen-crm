import { prisma } from '../../lib/prisma.js';
import { hashPassword, verifyPassword } from '../../lib/bcrypt.js';
import { signAccessToken, generateRefreshToken, refreshExpiresAt } from '../../lib/jwt.js';

export class AuthError extends Error {
  status: number;
  code: string;
  constructor(code: string, message: string, status = 401) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export type PublicUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar: string | null;
  phone: string | null;
  preferences: unknown;
};

function toPublic(u: {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar: string | null;
  phone: string | null;
  preferences: unknown;
}): PublicUser {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    avatar: u.avatar,
    phone: u.phone,
    preferences: u.preferences,
  };
}

export async function login(
  email: string,
  password: string,
  ctx: { userAgent?: string | null; ipAddress?: string | null },
) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) throw new AuthError('INVALID_CREDENTIALS', 'E-mail ou senha incorretos');
  if (!user.active) throw new AuthError('ACCOUNT_INACTIVE', 'Conta inativa. Procure o administrador.', 403);

  const ok = await verifyPassword(password, user.password);
  if (!ok) throw new AuthError('INVALID_CREDENTIALS', 'E-mail ou senha incorretos');

  const refreshToken = generateRefreshToken();
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      refreshToken,
      expiresAt: refreshExpiresAt(),
      userAgent: ctx.userAgent ?? null,
      ipAddress: ctx.ipAddress ?? null,
    },
  });

  const accessToken = signAccessToken({ id: user.id, role: user.role }, session.id);

  await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });

  return { accessToken, refreshToken, user: toPublic(user) };
}

export async function refresh(token: string) {
  const session = await prisma.session.findUnique({
    where: { refreshToken: token },
    include: { user: true },
  });
  if (!session) throw new AuthError('INVALID_REFRESH', 'Refresh token inválido');
  if (session.expiresAt < new Date()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    throw new AuthError('REFRESH_EXPIRED', 'Sessão expirada');
  }
  if (!session.user.active) throw new AuthError('ACCOUNT_INACTIVE', 'Conta inativa', 403);

  const accessToken = signAccessToken({ id: session.user.id, role: session.user.role }, session.id);
  return { accessToken, user: toPublic(session.user) };
}

export async function logout(token: string) {
  await prisma.session.deleteMany({ where: { refreshToken: token } });
}

export async function getMe(userId: string): Promise<PublicUser> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AuthError('NOT_FOUND', 'Usuário não encontrado', 404);
  if (!user.active) throw new AuthError('ACCOUNT_INACTIVE', 'Conta inativa', 403);
  return toPublic(user);
}

export async function updatePreferences(
  userId: string,
  patch: {
    theme?: 'light' | 'dark' | 'auto';
    density?: 'compact' | 'standard' | 'spacious';
    notifications?: { sound?: boolean; desktop?: boolean; email?: boolean };
  },
): Promise<PublicUser> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AuthError('NOT_FOUND', 'Usuário não encontrado', 404);

  const current = (user.preferences ?? {}) as {
    theme?: string;
    density?: string;
    notifications?: Record<string, boolean>;
  };
  const merged = {
    ...current,
    ...(patch.theme ? { theme: patch.theme } : {}),
    ...(patch.density ? { density: patch.density } : {}),
    ...(patch.notifications
      ? { notifications: { ...(current.notifications ?? {}), ...patch.notifications } }
      : {}),
  };

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { preferences: merged },
  });
  return toPublic(updated);
}

export async function updateProfile(
  userId: string,
  patch: { name?: string; email?: string; phone?: string | null },
): Promise<PublicUser> {
  const data: { name?: string; email?: string; phone?: string | null } = {};
  if (patch.name !== undefined) data.name = patch.name;
  if (patch.email !== undefined) data.email = patch.email.toLowerCase();
  if (patch.phone !== undefined) data.phone = patch.phone;

  if (data.email) {
    const conflict = await prisma.user.findFirst({
      where: { email: data.email, NOT: { id: userId } },
      select: { id: true },
    });
    if (conflict) throw new AuthError('EMAIL_IN_USE', 'Este e-mail já está em uso', 409);
  }

  try {
    const updated = await prisma.user.update({ where: { id: userId }, data });
    return toPublic(updated);
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === 'P2025') throw new AuthError('NOT_FOUND', 'Usuário não encontrado', 404);
    throw e;
  }
}

export async function setAvatar(userId: string, url: string): Promise<PublicUser> {
  const updated = await prisma.user.update({ where: { id: userId }, data: { avatar: url } });
  return toPublic(updated);
}

export async function changePassword(
  userId: string,
  currentSessionId: string | undefined,
  args: { currentPassword: string; newPassword: string },
): Promise<{ ok: true; sessionsClosed: number }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AuthError('NOT_FOUND', 'Usuário não encontrado', 404);

  const ok = await verifyPassword(args.currentPassword, user.password);
  if (!ok) throw new AuthError('INVALID_CURRENT_PASSWORD', 'Senha atual incorreta');

  const hash = await hashPassword(args.newPassword);
  await prisma.user.update({ where: { id: userId }, data: { password: hash } });

  // Invalida todas as outras sessões (mantém a atual, se conhecida).
  const result = await prisma.session.deleteMany({
    where: {
      userId,
      ...(currentSessionId ? { NOT: { id: currentSessionId } } : {}),
    },
  });
  return { ok: true, sessionsClosed: result.count };
}
