import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api } from '../lib/api';

export type LogType = 'AUTOMATION' | 'CADENCE' | 'WEBHOOK';
export type LogStatus = 'SUCCESS' | 'FAILED' | 'RUNNING' | 'PARTIAL';

export type AutomationLog = {
  id: string;
  type: LogType;
  entityId: string;
  automationId: string | null;
  status: LogStatus;
  trigger: string;
  triggeredBy: string | null;
  input: unknown;
  output: unknown;
  error: string | null;
  executionTime: number | null;
  steps: Array<{
    nodeId: string;
    type: string;
    subtype: string;
    status: string;
    durationMs: number;
    output?: unknown;
    error?: string;
  }> | null;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
  automation?: { id: string; name: string; flow?: unknown } | null;
};

export type LogFilters = {
  type?: LogType;
  entityId?: string;
  status?: LogStatus;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
  search?: string;
};

export function useAutomationLogs(filters: LogFilters = {}) {
  return useQuery({
    queryKey: ['automation-logs', filters],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (filters.type) p.set('type', filters.type);
      if (filters.entityId) p.set('entityId', filters.entityId);
      if (filters.status) p.set('status', filters.status);
      if (filters.from) p.set('from', filters.from);
      if (filters.to) p.set('to', filters.to);
      if (filters.page) p.set('page', String(filters.page));
      if (filters.limit) p.set('limit', String(filters.limit));
      if (filters.search) p.set('search', filters.search);
      const qs = p.toString();
      return (
        await api.get<{
          data: AutomationLog[];
          total: number;
          page: number;
          totalPages: number;
        }>(`/automation-logs${qs ? `?${qs}` : ''}`)
      ).data;
    },
    placeholderData: keepPreviousData,
  });
}

export function useAutomationLog(id: string | null) {
  return useQuery({
    enabled: !!id,
    queryKey: ['automation-log', id],
    queryFn: async () => (await api.get<AutomationLog>(`/automation-logs/${id}`)).data,
  });
}

export function useAutomationLogStats(period: '24h' | '7d' | '30d' = '24h') {
  return useQuery({
    queryKey: ['automation-log-stats', period],
    queryFn: async () =>
      (
        await api.get<{
          period: string;
          total: number;
          success: number;
          failed: number;
          partial: number;
          running: number;
          successRate: number;
          byType: Record<string, { total: number; success: number; failed: number; partial: number; running: number }>;
        }>(`/automation-logs/stats?period=${period}`)
      ).data,
    refetchInterval: 60_000,
  });
}

export function useRetryAutomationLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.post(`/automation-logs/${id}/retry`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['automation-logs'] });
      qc.invalidateQueries({ queryKey: ['automation-log-stats'] });
    },
  });
}
