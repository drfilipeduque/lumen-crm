import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export type ScheduledStatus = 'PENDING' | 'SENT' | 'FAILED' | 'CANCELLED';
export type ScheduledContentType = 'TEXT' | 'TEMPLATE' | 'SCRIPT';

export type ScheduledMessage = {
  id: string;
  contactId: string;
  opportunityId: string | null;
  connectionId: string;
  scheduledAt: string;
  contentType: ScheduledContentType;
  content: string;
  templateVariables: Record<string, string> | null;
  mediaUrl: string | null;
  mediaName: string | null;
  mediaMimeType: string | null;
  status: ScheduledStatus;
  sentAt: string | null;
  error: string | null;
  messageId: string | null;
  contact: { id: string; name: string; phone: string };
  opportunity: { id: string; title: string } | null;
  connection: { id: string; name: string; type: 'OFFICIAL' | 'UNOFFICIAL' };
  createdBy: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
};

export type ScheduledList = {
  data: ScheduledMessage[];
  total: number;
  page: number;
  totalPages: number;
};

export type CreateScheduledInput = {
  contactId: string;
  opportunityId?: string | null;
  connectionId: string;
  scheduledAt: string;
  contentType: ScheduledContentType;
  content: string;
  templateVariables?: Record<string, string>;
  mediaUrl?: string;
  mediaName?: string;
  mediaMimeType?: string;
};

const KEY = 'scheduled-messages';

export function useScheduledMessages(filters: {
  contactId?: string;
  opportunityId?: string;
  status?: ScheduledStatus;
}) {
  const params = new URLSearchParams();
  if (filters.contactId) params.set('contactId', filters.contactId);
  if (filters.opportunityId) params.set('opportunityId', filters.opportunityId);
  if (filters.status) params.set('status', filters.status);
  return useQuery({
    queryKey: [KEY, filters],
    queryFn: async () =>
      (await api.get<ScheduledList>(`/scheduled-messages?${params.toString()}`)).data,
    enabled: !!(filters.contactId || filters.opportunityId),
    refetchInterval: 30_000,
  });
}

export function useCreateScheduledMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateScheduledInput) =>
      (await api.post<ScheduledMessage>('/scheduled-messages', input)).data,
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: [KEY] });
      qc.invalidateQueries({ queryKey: ['scheduled-count', 'contact', vars.contactId] });
      if (vars.opportunityId) {
        qc.invalidateQueries({ queryKey: ['scheduled-count', 'opportunity', vars.opportunityId] });
      }
    },
  });
}

export function useUpdateScheduledMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string } & Partial<CreateScheduledInput>) =>
      (await api.put<ScheduledMessage>(`/scheduled-messages/${id}`, patch)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useCancelScheduledMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/scheduled-messages/${id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      qc.invalidateQueries({ queryKey: ['scheduled-count'] });
    },
  });
}

export function useContactScheduledCount(contactId: string | null) {
  return useQuery({
    queryKey: ['scheduled-count', 'contact', contactId],
    queryFn: async () =>
      (await api.get<{ count: number }>(`/contacts/${contactId}/scheduled-messages-count`)).data
        .count,
    enabled: !!contactId,
    staleTime: 30_000,
  });
}

export function useOpportunityScheduledCount(opportunityId: string | null) {
  return useQuery({
    queryKey: ['scheduled-count', 'opportunity', opportunityId],
    queryFn: async () =>
      (await api.get<{ count: number }>(`/opportunities/${opportunityId}/scheduled-messages-count`))
        .data.count,
    enabled: !!opportunityId,
    staleTime: 30_000,
  });
}
