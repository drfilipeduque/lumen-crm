import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export type FlowNode = {
  id: string;
  type: 'trigger' | 'condition' | 'action';
  subtype: string;
  config?: Record<string, unknown>;
  position?: { x: number; y: number };
};

export type FlowEdge = {
  from: string;
  to: string;
  branch?: 'true' | 'false';
};

export type Flow = {
  nodes: FlowNode[];
  edges: FlowEdge[];
};

export type Automation = {
  id: string;
  name: string;
  active: boolean;
  triggerType: string;
  triggerConfig: Record<string, unknown>;
  flow: Flow;
  executionCount: number;
  lastExecutedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FlowValidationError = {
  nodeId?: string;
  code: string;
  message: string;
};

export type ConfigField = {
  name: string;
  type: string;
  required: boolean;
  label: string;
};

export type Definition = {
  subtype: string;
  label: string;
  kind?: 'event' | 'cron' | 'webhook';
  domain?: string;
  configFields: ConfigField[];
};

export type Catalog = {
  triggers: Definition[];
  actions: Definition[];
};

const KEY = ['automations'] as const;

export function useAutomations() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => (await api.get<Automation[]>('/automations')).data,
  });
}

export function useAutomation(id: string | null) {
  return useQuery({
    enabled: !!id,
    queryKey: ['automation', id],
    queryFn: async () => (await api.get<Automation>(`/automations/${id}`)).data,
  });
}

export function useAutomationCatalog() {
  return useQuery({
    queryKey: ['automation-catalog'],
    queryFn: async () => (await api.get<Catalog>('/automations/catalog')).data,
    staleTime: 60 * 60 * 1000,
  });
}

export function useCreateAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; active?: boolean; flow: Flow }) =>
      (await api.post<Automation>('/automations', input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string; name?: string; active?: boolean; flow?: Flow }) =>
      (await api.put<Automation>(`/automations/${id}`, patch)).data,
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ['automation', vars.id] });
    },
  });
}

export function useToggleAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.put<Automation>(`/automations/${id}/toggle`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/automations/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useValidateFlow() {
  return useMutation({
    mutationFn: async (flow: Flow) =>
      (await api.post<{ ok: boolean; errors: FlowValidationError[] }>(
        '/automations/validate',
        { flow },
      )).data,
  });
}

export type AutomationMediaUpload = {
  url: string;
  name: string;
  mimeType: string;
  size: number;
  type: 'IMAGE' | 'AUDIO' | 'VIDEO' | 'DOCUMENT';
};

export function useUploadAutomationMedia() {
  return useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      const r = await api.post<AutomationMediaUpload>('/automation-uploads/media', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return r.data;
    },
  });
}

export function useTestAutomation() {
  return useMutation({
    mutationFn: async ({ id, event }: { id: string; event?: { type: string; data?: Record<string, unknown> } }) =>
      (
        await api.post<{
          steps: Array<{
            nodeId: string;
            type: string;
            subtype: string;
            status: 'success' | 'failed' | 'skipped' | 'wait';
            durationMs: number;
            output?: unknown;
            error?: string;
          }>;
          context: Record<string, unknown>;
        }>(`/automations/${id}/test`, { event })
      ).data,
  });
}
