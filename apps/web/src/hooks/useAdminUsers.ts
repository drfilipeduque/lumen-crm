import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export type AdminUser = {
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

const KEY = ['admin-users'];

export function useAdminUsers() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => (await api.get<AdminUser[]>('/admin/users')).data,
    staleTime: 30_000,
  });
}

export type CreateAdminUserInput = {
  name: string;
  email: string;
  password: string;
  role: AdminUser['role'];
  phone?: string | null;
};

export function useCreateAdminUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateAdminUserInput) =>
      (await api.post<AdminUser>('/admin/users', input)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ['team'] });
    },
  });
}

export type UpdateAdminUserInput = {
  name?: string;
  role?: AdminUser['role'];
  active?: boolean;
  phone?: string | null;
};

export function useUpdateAdminUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string } & UpdateAdminUserInput) =>
      (await api.patch<AdminUser>(`/admin/users/${id}`, patch)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ['team'] });
    },
  });
}

export function useResetAdminUserPassword() {
  return useMutation({
    mutationFn: async ({ id, password }: { id: string; password: string }) =>
      (await api.post<{ ok: true }>(`/admin/users/${id}/reset-password`, { password })).data,
  });
}

export type AssignedConnection = {
  id: string;
  name: string;
  type: 'OFFICIAL' | 'UNOFFICIAL';
  active: boolean;
  status: string;
  phone: string | null;
};

export function useUserConnections(userId: string | null) {
  return useQuery({
    queryKey: ['admin-user-connections', userId],
    queryFn: async () =>
      (await api.get<AssignedConnection[]>(`/admin/users/${userId}/connections`)).data,
    enabled: !!userId,
  });
}

export function useSetUserConnections() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, connectionIds }: { userId: string; connectionIds: string[] }) =>
      (
        await api.put<{ ok: true; assigned: number }>(`/admin/users/${userId}/connections`, {
          connectionIds,
        })
      ).data,
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['admin-user-connections', vars.userId] });
      qc.invalidateQueries({ queryKey: ['whatsapp-connections'] });
    },
  });
}
