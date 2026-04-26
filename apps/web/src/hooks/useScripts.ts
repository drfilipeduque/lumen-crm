import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export type ScriptMediaType = 'IMAGE' | 'AUDIO' | 'VIDEO' | 'DOCUMENT';

export type Script = {
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

export type ScriptFolder = {
  id: string;
  name: string;
  order: number;
  scriptCount: number;
};

export type ScriptVariable = {
  key: string;
  category: 'contato' | 'oportunidade' | 'usuario' | 'data';
  label: string;
  description: string;
  example: string;
};

const SCRIPTS_KEY = ['scripts'] as const;
const FOLDERS_KEY = ['script-folders'] as const;
const VARIABLES_KEY = ['script-variables'] as const;

export function useScripts(params: { folderId?: string | null; search?: string } = {}) {
  const search = params.search?.trim() ?? '';
  const folderId = params.folderId ?? undefined;
  return useQuery({
    queryKey: [...SCRIPTS_KEY, { folderId, search }] as const,
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (folderId) qs.set('folderId', folderId);
      if (search) qs.set('search', search);
      const url = `/scripts${qs.toString() ? `?${qs}` : ''}`;
      return (await api.get<Script[]>(url)).data;
    },
  });
}

export function useScriptVariables() {
  return useQuery({
    queryKey: VARIABLES_KEY,
    queryFn: async () => (await api.get<ScriptVariable[]>('/scripts/variables')).data,
    staleTime: 1000 * 60 * 60,
  });
}

type ScriptInput = {
  name: string;
  folderId?: string | null;
  content: string;
  mediaType?: ScriptMediaType | null;
  mediaUrl?: string | null;
};

export function useCreateScript() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ScriptInput) => (await api.post<Script>('/scripts', input)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SCRIPTS_KEY });
      qc.invalidateQueries({ queryKey: FOLDERS_KEY });
    },
  });
}

export function useUpdateScript() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: ScriptInput & { id: string }) =>
      (await api.put<Script>(`/scripts/${id}`, patch)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SCRIPTS_KEY });
      qc.invalidateQueries({ queryKey: FOLDERS_KEY });
    },
  });
}

export function useDeleteScript() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/scripts/${id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SCRIPTS_KEY });
      qc.invalidateQueries({ queryKey: FOLDERS_KEY });
    },
  });
}

export function useDuplicateScript() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.post<Script>(`/scripts/${id}/duplicate`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SCRIPTS_KEY });
      qc.invalidateQueries({ queryKey: FOLDERS_KEY });
    },
  });
}

export function useUploadScriptMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      const fd = new FormData();
      fd.append('file', file);
      return (
        await api.post<Script>(`/scripts/${id}/media`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      ).data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: SCRIPTS_KEY }),
  });
}

export function useRemoveScriptMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete<Script>(`/scripts/${id}/media`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: SCRIPTS_KEY }),
  });
}

export function useRenderScript() {
  return useMutation({
    mutationFn: async ({
      id,
      contactId,
      opportunityId,
    }: {
      id: string;
      contactId?: string;
      opportunityId?: string;
    }) =>
      (
        await api.post<{
          id: string;
          content: string;
          mediaType: ScriptMediaType | null;
          mediaUrl: string | null;
        }>(`/scripts/${id}/render`, { contactId, opportunityId })
      ).data,
  });
}

// ---------- folders ----------

export function useScriptFolders() {
  return useQuery({
    queryKey: FOLDERS_KEY,
    queryFn: async () => (await api.get<ScriptFolder[]>('/script-folders')).data,
  });
}

export function useCreateFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; order?: number }) =>
      (await api.post<ScriptFolder>('/script-folders', input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: FOLDERS_KEY }),
  });
}

export function useUpdateFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string; name: string; order?: number }) =>
      (await api.put<ScriptFolder>(`/script-folders/${id}`, patch)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: FOLDERS_KEY }),
  });
}

export function useDeleteFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/script-folders/${id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: FOLDERS_KEY });
      qc.invalidateQueries({ queryKey: SCRIPTS_KEY });
    },
  });
}

export function useReorderFolders() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) =>
      (await api.put<ScriptFolder[]>('/script-folders/reorder', { ids })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: FOLDERS_KEY }),
  });
}
