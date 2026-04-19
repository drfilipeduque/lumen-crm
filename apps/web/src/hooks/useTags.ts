import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export type Tag = {
  id: string;
  name: string;
  color: string;
  usageCount: number;
};

const KEY = ['tags'] as const;

export function useTags() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => (await api.get<Tag[]>('/tags')).data,
  });
}

export function useCreateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; color: string }) =>
      (await api.post<Tag>('/tags', input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string; name: string; color: string }) =>
      (await api.put<Tag>(`/tags/${id}`, patch)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, force }: { id: string; force?: boolean }) =>
      (await api.delete(`/tags/${id}${force ? '/force' : ''}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
