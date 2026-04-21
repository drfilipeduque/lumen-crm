import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export type OppFile = {
  id: string;
  opportunityId: string;
  name: string;
  mimeType: string;
  size: number;
  url: string;
  createdAt: string;
  uploadedBy: { id: string; name: string; avatar: string | null } | null;
};

const key = (opportunityId: string) => ['opportunity-files', opportunityId] as const;

export function useFiles(opportunityId: string | null) {
  return useQuery({
    queryKey: opportunityId ? key(opportunityId) : ['opportunity-files', 'none'],
    queryFn: async () => (await api.get<OppFile[]>(`/opportunities/${opportunityId}/files`)).data,
    enabled: !!opportunityId,
  });
}

export function useUploadFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ opportunityId, file }: { opportunityId: string; file: File }) => {
      const form = new FormData();
      form.append('file', file);
      const { data } = await api.post<OppFile>(
        `/opportunities/${opportunityId}/files`,
        form,
      );
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: key(vars.opportunityId) });
      qc.invalidateQueries({ queryKey: ['opportunity-history', vars.opportunityId] });
    },
  });
}

export function useDeleteFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, opportunityId: _opp }: { id: string; opportunityId: string }) =>
      (await api.delete(`/files/${id}`)).data,
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: key(vars.opportunityId) });
      qc.invalidateQueries({ queryKey: ['opportunity-history', vars.opportunityId] });
    },
  });
}
