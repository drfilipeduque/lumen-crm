import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export type BroadcastStatus =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'SENDING'
  | 'PAUSED'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type BroadcastAudienceType = 'CONTACTS' | 'OPPORTUNITIES';

export type BroadcastRecipientStatus =
  | 'PENDING'
  | 'SENT'
  | 'DELIVERED'
  | 'READ'
  | 'FAILED'
  | 'SKIPPED';

export type AudienceFilters = {
  // CONTACTS
  tagsInclude?: string[];
  tagsExclude?: string[];
  ownerIds?: string[];
  hasOwner?: boolean | null;
  createdFrom?: string;
  createdTo?: string;
  hasOpportunity?: boolean | null;

  // OPPORTUNITIES
  pipelineIds?: string[];
  stageIdsInclude?: string[];
  stageIdsExclude?: string[];
  status?: 'ACTIVE' | 'WON' | 'LOST';
  priority?: ('LOW' | 'MEDIUM' | 'HIGH' | 'URGENT')[];
  valueMin?: number;
  valueMax?: number;
  dueDateFrom?: string;
  dueDateTo?: string;
};

export type Broadcast = {
  id: string;
  name: string;
  description: string | null;
  connectionId: string;
  templateId: string;
  templateVariables: Record<string, string> | null;
  audienceType: BroadcastAudienceType;
  audienceFilters: AudienceFilters;
  audienceSnapshot: string[];
  intervalSeconds: number;
  scheduledAt: string | null;
  status: BroadcastStatus;
  totalRecipients: number;
  sentCount: number;
  deliveredCount: number;
  readCount: number;
  failedCount: number;
  pauseReason: string | null;
  respectBusinessHours: boolean;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  connection: { id: string; name: string; type: 'OFFICIAL' | 'UNOFFICIAL' };
  template: { id: string; name: string; language?: string; body?: string };
  createdBy: { id: string; name: string };
};

export type BroadcastRecipient = {
  id: string;
  campaignId: string;
  contactId: string;
  opportunityId: string | null;
  phone: string;
  status: BroadcastRecipientStatus;
  externalId: string | null;
  messageId: string | null;
  error: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  contact: { id: string; name: string; phone: string };
};

export type CreateBroadcastInput = {
  name: string;
  description?: string | null;
  connectionId: string;
  templateId: string;
  templateVariables?: Record<string, string>;
  audienceType: BroadcastAudienceType;
  audienceFilters: AudienceFilters;
  intervalSeconds?: number;
  scheduledAt?: string | null;
  respectBusinessHours?: boolean;
};

const KEY = 'broadcasts';

export function useBroadcasts(filters: { status?: BroadcastStatus; page?: number } = {}) {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.page) params.set('page', String(filters.page));
  return useQuery({
    queryKey: [KEY, filters],
    queryFn: async () =>
      (await api.get<{ data: Broadcast[]; total: number; page: number; totalPages: number }>(
        `/broadcasts?${params.toString()}`,
      )).data,
    refetchInterval: 30_000,
  });
}

export function useBroadcast(id: string | null) {
  return useQuery({
    queryKey: [KEY, id],
    queryFn: async () => (await api.get<Broadcast>(`/broadcasts/${id}`)).data,
    enabled: !!id,
    refetchInterval: 5_000,
  });
}

export function useBroadcastRecipients(
  id: string | null,
  filters: { status?: BroadcastRecipientStatus; page?: number } = {},
) {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.page) params.set('page', String(filters.page));
  return useQuery({
    queryKey: [KEY, id, 'recipients', filters],
    queryFn: async () =>
      (
        await api.get<{
          data: BroadcastRecipient[];
          total: number;
          page: number;
          totalPages: number;
        }>(`/broadcasts/${id}/recipients?${params.toString()}`)
      ).data,
    enabled: !!id,
    refetchInterval: 5_000,
  });
}

export function useCreateBroadcast() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateBroadcastInput) =>
      (await api.post<Broadcast>('/broadcasts', input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useUpdateBroadcast() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string } & Partial<CreateBroadcastInput>) =>
      (await api.put<Broadcast>(`/broadcasts/${id}`, patch)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useDeleteBroadcastDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/broadcasts/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useStartBroadcast() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.post<Broadcast>(`/broadcasts/${id}/start`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function usePauseBroadcast() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.put<Broadcast>(`/broadcasts/${id}/pause`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useResumeBroadcast() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.put<Broadcast>(`/broadcasts/${id}/resume`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useCancelBroadcast() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete<Broadcast>(`/broadcasts/${id}/cancel`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function usePreviewAudience() {
  return useMutation({
    mutationFn: async (input: { audienceType: BroadcastAudienceType; audienceFilters: AudienceFilters }) =>
      (
        await api.post<{
          count: number;
          sample: { id: string; name: string; phone: string }[];
        }>('/broadcasts/preview-audience', input)
      ).data,
  });
}
