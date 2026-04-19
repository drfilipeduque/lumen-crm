import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export type PeriodKey = 'today' | 'yesterday' | 'week' | 'month' | 'year' | 'custom';

type PeriodArgs = {
  period: PeriodKey;
  from?: string;
  to?: string;
};

export type Metrics = {
  totalLeads: number;
  leadsByStage: { stageId: string; stageName: string; count: number }[];
  avgTimeBetweenStages: number;
  leadsByUser: { userId: string; userName: string; count: number }[];
  conversionRate: number;
  inactiveLeads: number;
};

export type TagDistribution = { tagId: string; tagName: string; color: string; count: number }[];

export type Funnel = {
  pipelineId: string | null;
  pipelineName: string | null;
  stages: {
    stageId: string;
    stageName: string;
    color: string;
    count: number;
    conversionFromPrevious: number | null;
  }[];
};

export type FinancialBlock = {
  id: string;
  label: string;
  customFieldId: string;
  operation: 'sum' | 'avg' | 'count';
};

export type FinancialResult = { value: number; label: string };

function toQuery(args: Record<string, string | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(args)) if (v !== undefined && v !== '') p.set(k, v);
  return p.toString();
}

export function useMetrics(args: PeriodArgs) {
  return useQuery({
    queryKey: ['dashboard', 'metrics', args],
    queryFn: async () => {
      const { data } = await api.get<Metrics>(`/dashboard/metrics?${toQuery(args)}`);
      return data;
    },
  });
}

export function useTagDistribution(args: PeriodArgs) {
  return useQuery({
    queryKey: ['dashboard', 'tags', args],
    queryFn: async () => {
      const { data } = await api.get<TagDistribution>(`/dashboard/tag-distribution?${toQuery(args)}`);
      return data;
    },
  });
}

export function useFunnel(args: PeriodArgs & { pipelineId?: string }) {
  return useQuery({
    queryKey: ['dashboard', 'funnel', args],
    queryFn: async () => {
      const { data } = await api.get<Funnel>(`/dashboard/funnel?${toQuery(args)}`);
      return data;
    },
  });
}

export function useCustomBlocks() {
  return useQuery({
    queryKey: ['dashboard', 'custom-blocks'],
    queryFn: async () => {
      const { data } = await api.get<FinancialBlock[]>('/dashboard/custom-blocks');
      return data;
    },
  });
}

export function useFinancial(
  args: PeriodArgs & { customFieldId: string; operation: 'sum' | 'avg' | 'count' },
  enabled = true,
) {
  return useQuery({
    queryKey: ['dashboard', 'financial', args],
    enabled,
    queryFn: async () => {
      const { data } = await api.get<FinancialResult>(`/dashboard/financial?${toQuery(args)}`);
      return data;
    },
  });
}
