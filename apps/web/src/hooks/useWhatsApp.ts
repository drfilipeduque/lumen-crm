import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export type WAStatus = 'CONNECTED' | 'DISCONNECTED' | 'WAITING_QR' | 'ERROR';
export type WAType = 'OFFICIAL' | 'UNOFFICIAL';

export type WAConnection = {
  id: string;
  name: string;
  type: WAType;
  status: WAStatus;
  phone: string | null;
  profileName: string | null;
  avatar: string | null;
  active: boolean;
  webhookUrl: string | null;
  createdAt: string;
  updatedAt: string;
  users: { id: string; name: string; avatar: string | null }[];
  entryRule: {
    id: string;
    connectionId: string;
    mode: 'AUTO' | 'MANUAL';
    pipelineId: string;
    stageId: string;
  } | null;
};

export type EntryRuleSummary = {
  connectionId: string;
  name: string;
  type: WAType;
  status: WAStatus;
  rule: WAConnection['entryRule'];
};

const KEY = ['whatsapp-connections'] as const;

export function useWhatsAppConnections(type?: WAType) {
  return useQuery({
    queryKey: type ? ([...KEY, type] as const) : KEY,
    queryFn: async () =>
      (await api.get<WAConnection[]>(`/whatsapp/connections${type ? `?type=${type}` : ''}`)).data,
    refetchInterval: 30_000,
  });
}

export function useCreateUnofficialConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; webhookUrl?: string | null }) =>
      (await api.post<WAConnection>('/whatsapp/connections/unofficial', input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/whatsapp/connections/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useRestartConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.post(`/whatsapp/connections/${id}/restart`, {})).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useConnectionQr(id: string | null, enabled = true) {
  return useQuery({
    queryKey: id ? (['whatsapp-qr', id] as const) : ['whatsapp-qr', 'none'],
    queryFn: async () =>
      (await api.get<{ qr: string | null }>(`/whatsapp/connections/${id}/qr`)).data.qr,
    enabled: !!id && enabled,
    refetchInterval: 3000,
  });
}

export function useEntryRules() {
  return useQuery({
    queryKey: ['whatsapp-entry-rules'],
    queryFn: async () => (await api.get<EntryRuleSummary[]>(`/whatsapp/entry-rules`)).data,
  });
}

export function useUpdateEntryRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      connectionId,
      mode,
      pipelineId,
      stageId,
    }: {
      connectionId: string;
      mode: 'AUTO' | 'MANUAL';
      pipelineId?: string;
      stageId?: string;
    }) =>
      (await api.put(`/whatsapp/connections/${connectionId}/entry-rule`, {
        mode,
        pipelineId,
        stageId,
      })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ['whatsapp-entry-rules'] });
    },
  });
}
