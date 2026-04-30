import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export type WebhookType = 'OUTBOUND' | 'INBOUND';

export type Webhook = {
  id: string;
  type: WebhookType;
  name: string;
  active: boolean;
  // OUTBOUND
  url?: string | null;
  method?: string | null;
  headers?: Record<string, string> | null;
  events?: string[];
  payloadTemplate?: unknown;
  // INBOUND
  uniqueUrl?: string | null;
  authTokenMask?: string | null;
  actionType?: string | null;
  actionConfig?: Record<string, unknown> | null;
  // one-time field — só presente no POST de criação INBOUND
  _authTokenOnce?: string;
  createdAt: string;
  updatedAt: string;
};

const KEY = ['webhooks'] as const;

export function useWebhooks(type?: WebhookType) {
  return useQuery({
    queryKey: type ? ([...KEY, type] as const) : KEY,
    queryFn: async () =>
      (await api.get<Webhook[]>(`/webhooks${type ? `?type=${type}` : ''}`)).data,
  });
}

export function useWebhook(id: string | null) {
  return useQuery({
    enabled: !!id,
    queryKey: ['webhook', id],
    queryFn: async () => (await api.get<Webhook>(`/webhooks/${id}`)).data,
  });
}

export function useCreateWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Webhook> & { type: WebhookType; name: string }) =>
      (await api.post<Webhook>('/webhooks', input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Webhook> & { id: string }) =>
      (await api.put<Webhook>(`/webhooks/${id}`, patch)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useToggleWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.put<Webhook>(`/webhooks/${id}/toggle`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/webhooks/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useRotateWebhookToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.put<{ id: string; authToken: string }>(`/webhooks/${id}/rotate-token`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useTestWebhook() {
  return useMutation({
    mutationFn: async ({
      id,
      eventPayload,
    }: {
      id: string;
      eventPayload?: { type?: string; entityId?: string; data?: Record<string, unknown> };
    }) =>
      (
        await api.post<{ ok: boolean; status?: number; error?: string; durationMs: number }>(
          `/webhooks/${id}/test`,
          { eventPayload },
        )
      ).data,
  });
}
