import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export type CadenceScope = 'PIPELINE' | 'STAGE' | 'OPPORTUNITY' | 'CONTACT' | 'GROUP';
export type CadenceExecStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED' | 'FAILED';
export type CadenceUnit = 'minutes' | 'hours' | 'days' | 'weeks';

export type CadenceMessage = {
  id: string;
  order: number;
  content?: string;
  scriptId?: string;
  mediaUrl?: string;
  mediaType?: 'IMAGE' | 'AUDIO' | 'DOCUMENT' | 'VIDEO';
  delay: { value: number; unit: CadenceUnit };
};

export type Cadence = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  connectionId: string | null;
  scope: CadenceScope;
  scopeConfig: Record<string, unknown>;
  pauseOnReply: boolean;
  respectBusinessHours: boolean;
  businessHoursStart: string;
  businessHoursEnd: string;
  businessDays: number[];
  messages: CadenceMessage[];
  createdAt: string;
  updatedAt: string;
  connection?: { id: string; name: string; type: 'OFFICIAL' | 'UNOFFICIAL' } | null;
  messageCount?: number;
  activeExecutions?: number;
};

export type CadenceExecution = {
  id: string;
  cadenceId: string;
  contactId: string;
  opportunityId: string | null;
  connectionId: string | null;
  currentStep: number;
  status: CadenceExecStatus;
  nextExecutionAt: string | null;
  completedSteps: { stepId: string; sentAt: string; messageId?: string }[];
  pauseReason: string | null;
  createdAt: string;
  updatedAt: string;
  contact?: { id: string; name: string; phone: string; avatar: string | null } | null;
  opportunity?: { id: string; title: string } | null;
  cadence?: { id: string; name: string; messages: CadenceMessage[] };
};

export type CadenceStats = {
  totalStarted: number;
  active: number;
  completed: number;
  paused: number;
  cancelled: number;
  failed: number;
  replyRate: number;
};

const KEY = ['cadences'] as const;

export function useCadences(filters: { active?: boolean; scope?: CadenceScope } = {}) {
  return useQuery({
    queryKey: [...KEY, filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.active !== undefined) params.set('active', String(filters.active));
      if (filters.scope) params.set('scope', filters.scope);
      const qs = params.toString();
      return (await api.get<Cadence[]>(`/cadences${qs ? `?${qs}` : ''}`)).data;
    },
  });
}

export function useCadence(id: string | null) {
  return useQuery({
    enabled: !!id,
    queryKey: ['cadence', id],
    queryFn: async () => (await api.get<Cadence>(`/cadences/${id}`)).data,
  });
}

export function useManualCadences() {
  return useQuery({
    queryKey: ['cadences', 'manual'],
    queryFn: async () =>
      (
        await api.get<{ id: string; name: string; scope: CadenceScope; description: string | null }[]>(
          '/cadences/manual',
        )
      ).data,
  });
}

export function useCreateCadence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Cadence>) => (await api.post<Cadence>('/cadences', input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateCadence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Cadence> & { id: string }) =>
      (await api.put<Cadence>(`/cadences/${id}`, patch)).data,
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ['cadence', vars.id] });
    },
  });
}

export function useToggleCadence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.put<Cadence>(`/cadences/${id}/toggle`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDuplicateCadence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.post<Cadence>(`/cadences/${id}/duplicate`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteCadence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/cadences/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useStartCadence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...body
    }: {
      id: string;
      opportunityId?: string;
      contactId?: string;
      opportunityIds?: string[];
      contactIds?: string[];
    }) => (await api.post(`/cadences/${id}/start`, body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useCadenceExecutions(
  cadenceId: string | null,
  filters: { status?: CadenceExecStatus; page?: number; limit?: number } = {},
) {
  return useQuery({
    enabled: !!cadenceId,
    queryKey: ['cadence-executions', cadenceId, filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      if (filters.page) params.set('page', String(filters.page));
      if (filters.limit) params.set('limit', String(filters.limit));
      const qs = params.toString();
      return (
        await api.get<{
          data: CadenceExecution[];
          total: number;
          page: number;
          totalPages: number;
        }>(`/cadences/${cadenceId}/executions${qs ? `?${qs}` : ''}`)
      ).data;
    },
  });
}

export function useCadenceStats(cadenceId: string | null) {
  return useQuery({
    enabled: !!cadenceId,
    queryKey: ['cadence-stats', cadenceId],
    queryFn: async () => (await api.get<CadenceStats>(`/cadences/${cadenceId}/stats`)).data,
  });
}

export function usePauseExecution() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.put<CadenceExecution>(`/cadence-executions/${id}/pause`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cadence-executions'] });
      qc.invalidateQueries({ queryKey: ['contact-cadences'] });
    },
  });
}

export function useResumeExecution() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.put<CadenceExecution>(`/cadence-executions/${id}/resume`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cadence-executions'] });
      qc.invalidateQueries({ queryKey: ['contact-cadences'] });
    },
  });
}

export function useCancelExecution() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.delete<CadenceExecution>(`/cadence-executions/${id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cadence-executions'] });
      qc.invalidateQueries({ queryKey: ['contact-cadences'] });
    },
  });
}

// Cadências ativas/pausadas de um contato (pra badge no painel de conversa).
export function useContactCadences(contactId: string | null) {
  return useQuery({
    enabled: !!contactId,
    queryKey: ['contact-cadences', contactId],
    queryFn: async () =>
      (await api.get<CadenceExecution[]>(`/cadence-executions/by-contact/${contactId}`)).data,
  });
}
