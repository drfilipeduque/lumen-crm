import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export type HistoryFilter =
  | 'ALL'
  | 'STAGE_CHANGED'
  | 'FIELD_UPDATED'
  | 'TAG'
  | 'OWNER'
  | 'REMINDER'
  | 'FILE'
  | 'DESCRIPTION'
  | 'TRANSFER';

export type HistoryEntry = {
  id: string;
  action: string;
  fromStageId: string | null;
  toStageId: string | null;
  fromStageName: string | null;
  toStageName: string | null;
  metadata: unknown;
  user: { id: string; name: string; avatar: string | null } | null;
  createdAt: string;
};

export function useOpportunityHistory(opportunityId: string | null, type: HistoryFilter = 'ALL') {
  return useQuery({
    queryKey: opportunityId ? (['opportunity-history', opportunityId, type] as const) : ['opportunity-history', 'none'],
    queryFn: async () =>
      (await api.get<HistoryEntry[]>(`/opportunities/${opportunityId}/history?type=${type}`)).data,
    enabled: !!opportunityId,
  });
}
