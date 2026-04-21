import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export type Reminder = {
  id: string;
  opportunityId: string;
  title: string;
  description: string | null;
  dueAt: string;
  completed: boolean;
  completedAt: string | null;
  snoozedUntil: string | null;
  createdBy: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
  overdue: boolean;
};

const key = (opportunityId: string) => ['opportunity-reminders', opportunityId] as const;

export function useReminders(opportunityId: string | null) {
  return useQuery({
    queryKey: opportunityId ? key(opportunityId) : ['opportunity-reminders', 'none'],
    queryFn: async () => (await api.get<Reminder[]>(`/opportunities/${opportunityId}/reminders`)).data,
    enabled: !!opportunityId,
  });
}

export function useCreateReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      opportunityId,
      title,
      description,
      dueAt,
    }: {
      opportunityId: string;
      title: string;
      description?: string | null;
      dueAt: string;
    }) =>
      (
        await api.post<Reminder>(`/opportunities/${opportunityId}/reminders`, {
          title,
          description,
          dueAt,
        })
      ).data,
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: key(vars.opportunityId) });
      qc.invalidateQueries({ queryKey: ['opportunity-history', vars.opportunityId] });
    },
  });
}

export function useUpdateReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      opportunityId: _opp,
      ...patch
    }: {
      id: string;
      opportunityId: string;
      title?: string;
      description?: string | null;
      dueAt?: string;
      completed?: boolean;
      snoozedUntil?: string | null;
    }) => (await api.put<Reminder>(`/reminders/${id}`, patch)).data,
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: key(vars.opportunityId) });
      qc.invalidateQueries({ queryKey: ['opportunity-history', vars.opportunityId] });
    },
  });
}

export function useCompleteReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, opportunityId: _opp }: { id: string; opportunityId: string }) =>
      (await api.post<Reminder>(`/reminders/${id}/complete`, {})).data,
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: key(vars.opportunityId) });
      qc.invalidateQueries({ queryKey: ['opportunity-history', vars.opportunityId] });
    },
  });
}

export function useSnoozeReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      opportunityId: _opp,
      ...payload
    }: {
      id: string;
      opportunityId: string;
      until?: string;
      preset?: '1h' | '3h' | 'tomorrow' | 'next-week';
    }) => (await api.post<Reminder>(`/reminders/${id}/snooze`, payload)).data,
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: key(vars.opportunityId) }),
  });
}

export function useDeleteReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, opportunityId: _opp }: { id: string; opportunityId: string }) =>
      (await api.delete(`/reminders/${id}`)).data,
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: key(vars.opportunityId) }),
  });
}
