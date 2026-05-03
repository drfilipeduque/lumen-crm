import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export type Reminder = {
  id: string;
  opportunityId: string;
  opportunity?: { id: string; title: string; contactName: string } | null;
  title: string;
  description: string | null;
  dueAt: string;
  effectiveDueAt: string;
  completed: boolean;
  completedAt: string | null;
  snoozedUntil: string | null;
  notified: boolean;
  notifiedAt: string | null;
  seenAt: string | null;
  createdBy: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
  overdue: boolean;
};

export type ReminderListStatus = 'PENDING' | 'OVERDUE' | 'COMPLETED' | 'ALL';
export type ReminderListPeriod = 'today' | 'week' | 'month' | 'all';

export function useGlobalReminders(args: {
  status: ReminderListStatus;
  period: ReminderListPeriod;
  userId?: string;
}) {
  const params = new URLSearchParams();
  params.set('status', args.status);
  params.set('period', args.period);
  if (args.userId) params.set('userId', args.userId);
  return useQuery({
    queryKey: ['reminders-global', args],
    queryFn: async () => (await api.get<Reminder[]>(`/reminders?${params.toString()}`)).data,
  });
}

export function usePendingCount() {
  return useQuery({
    queryKey: ['reminders-pending-count'],
    queryFn: async () => (await api.get<{ count: number }>(`/reminders/pending-count`)).data.count,
    refetchInterval: 60_000,
  });
}

export function useNotifications() {
  return useQuery({
    queryKey: ['reminders-notifications'],
    queryFn: async () => (await api.get<Reminder[]>(`/reminders/notifications`)).data,
    refetchInterval: 60_000,
  });
}

export function useMarkSeen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.post<{ ok: true }>(`/reminders/${id}/mark-seen`, {})).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reminders-notifications'] });
      qc.invalidateQueries({ queryKey: ['reminders-pending-count'] });
    },
  });
}

export function useMarkAllSeen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      (await api.post<{ ok: true; affected: number }>(`/reminders/mark-all-seen`, {})).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reminders-notifications'] });
    },
  });
}

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

// Invalida todas as queries de lembrete que dependem do estado mudar:
// lista por oportunidade, histórico, lista global da página /reminders,
// badge do sino e popover de notificações.
function invalidateReminderQueries(qc: ReturnType<typeof useQueryClient>, opportunityId: string) {
  qc.invalidateQueries({ queryKey: key(opportunityId) });
  qc.invalidateQueries({ queryKey: ['opportunity-history', opportunityId] });
  qc.invalidateQueries({ queryKey: ['reminders-global'] });
  qc.invalidateQueries({ queryKey: ['reminders-pending-count'] });
  qc.invalidateQueries({ queryKey: ['reminders-notifications'] });
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
    onSuccess: (_, vars) => invalidateReminderQueries(qc, vars.opportunityId),
  });
}

export function useCompleteReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, opportunityId: _opp }: { id: string; opportunityId: string }) =>
      (await api.post<Reminder>(`/reminders/${id}/complete`, {})).data,
    onSuccess: (_, vars) => invalidateReminderQueries(qc, vars.opportunityId),
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
    onSuccess: (_, vars) => invalidateReminderQueries(qc, vars.opportunityId),
  });
}

export function useDeleteReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, opportunityId: _opp }: { id: string; opportunityId: string }) =>
      (await api.delete(`/reminders/${id}`)).data,
    onSuccess: (_, vars) => invalidateReminderQueries(qc, vars.opportunityId),
  });
}
