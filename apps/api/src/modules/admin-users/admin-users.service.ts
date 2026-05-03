// CRUD administrativo de usuários do sistema. Tudo restrito a role ADMIN
// (checagem feita no preHandler da rota). Inclui proteções pra que o admin
// não possa rebaixar/desativar a si mesmo, evitando lockout.

import { prisma } from '../../lib/prisma.js';
import { hashPassword } from '../../lib/bcrypt.js';

export class AdminUsersError extends Error {
  status: number;
  code: string;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export type AdminUserDTO = {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'COMMERCIAL' | 'RECEPTION';
  active: boolean;
  avatar: string | null;
  phone: string | null;
  lastLogin: string | null;
  createdAt: string;
};

function toDTO(u: {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  avatar: string | null;
  phone: string | null;
  lastLogin: Date | null;
  createdAt: Date;
}): AdminUserDTO {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role as AdminUserDTO['role'],
    active: u.active,
    avatar: u.avatar,
    phone: u.phone,
    lastLogin: u.lastLogin?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
  };
}

export async function listAdminUsers(): Promise<AdminUserDTO[]> {
  const users = await prisma.user.findMany({
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      avatar: true,
      phone: true,
      lastLogin: true,
      createdAt: true,
    },
  });
  return users.map(toDTO);
}

export type CreateUserInput = {
  name: string;
  email: string;
  password: string;
  role: 'ADMIN' | 'COMMERCIAL' | 'RECEPTION';
  phone?: string | null;
};

export async function createAdminUser(input: CreateUserInput): Promise<AdminUserDTO> {
  const email = input.email.trim().toLowerCase();
  const exists = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (exists) throw new AdminUsersError('EMAIL_TAKEN', 'Já existe um usuário com esse email', 409);

  const password = await hashPassword(input.password);
  const created = await prisma.user.create({
    data: {
      name: input.name.trim(),
      email,
      password,
      role: input.role,
      phone: input.phone?.trim() || null,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      avatar: true,
      phone: true,
      lastLogin: true,
      createdAt: true,
    },
  });
  return toDTO(created);
}

export type UpdateUserInput = {
  name?: string;
  role?: 'ADMIN' | 'COMMERCIAL' | 'RECEPTION';
  active?: boolean;
  phone?: string | null;
};

export async function updateAdminUser(
  actorId: string,
  id: string,
  input: UpdateUserInput,
): Promise<AdminUserDTO> {
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) throw new AdminUsersError('NOT_FOUND', 'Usuário não encontrado', 404);

  // Auto-proteção: não rebaixa nem desativa a si mesmo (evita lockout).
  if (id === actorId) {
    if (input.role !== undefined && input.role !== 'ADMIN') {
      throw new AdminUsersError('SELF_DEMOTE', 'Você não pode rebaixar a si mesmo', 400);
    }
    if (input.active === false) {
      throw new AdminUsersError('SELF_DEACTIVATE', 'Você não pode desativar a si mesmo', 400);
    }
  }

  // Garante que sempre exista pelo menos 1 admin ativo.
  if ((input.role !== undefined && input.role !== 'ADMIN' && target.role === 'ADMIN') ||
      (input.active === false && target.role === 'ADMIN')) {
    const otherAdmins = await prisma.user.count({
      where: { role: 'ADMIN', active: true, NOT: { id } },
    });
    if (otherAdmins === 0) {
      throw new AdminUsersError('LAST_ADMIN', 'Precisa existir ao menos um administrador ativo', 400);
    }
  }

  const updated = await prisma.user.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
      ...(input.phone !== undefined ? { phone: input.phone?.trim() || null } : {}),
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      avatar: true,
      phone: true,
      lastLogin: true,
      createdAt: true,
    },
  });
  return toDTO(updated);
}

export async function resetAdminUserPassword(
  actorId: string,
  id: string,
  newPassword: string,
): Promise<{ ok: true }> {
  const target = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!target) throw new AdminUsersError('NOT_FOUND', 'Usuário não encontrado', 404);
  if (newPassword.length < 8) {
    throw new AdminUsersError('WEAK_PASSWORD', 'Senha deve ter no mínimo 8 caracteres', 400);
  }
  const hash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id }, data: { password: hash } });
  // Invalida sessões ativas do usuário (exceto se ele for o próprio admin
  // resetando a própria senha, pra não cair fora da sessão atual).
  if (id !== actorId) {
    await prisma.session.deleteMany({ where: { userId: id } });
  }
  return { ok: true };
}
