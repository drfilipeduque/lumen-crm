import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export type BoardCard = {
  id: string;
  title: string;
  contactId: string;
  contactName: string;
  value: number;
  priority: Priority;
  description: string | null;
  dueDate: string | null;
  tagsCount: number;
  tags: { id: string; name: string; color: string }[];
  ownerId: string | null;
  ownerName: string | null;
  ownerAvatar: string | null;
  lastActivity: string;
  hasActiveReminder: boolean;
  hasOverdueReminder: boolean;
  unreadMessages: number;
  scheduledMessagesCount: number;
  order: number;
  createdAt: string;
};

export type BoardColumn = {
  stageId: string;
  stageName: string;
  color: string;
  order: number;
  isClosedWon: boolean;
  isClosedLost: boolean;
  count: number;
  totalValue: number;
  opportunities: BoardCard[];
};

export type BoardResponse = {
  pipelineId: string;
  pipelineName: string;
  columns: BoardColumn[];
};

export type BoardFilters = {
  search?: string;
  tagIds?: string[];
  ownerId?: string;
  priority?: Priority;
  dueFrom?: string;
  dueTo?: string;
};

const boardKey = (pipelineId: string, filters: BoardFilters) =>
  ['board', pipelineId, filters] as const;

function toQuery(args: BoardFilters): string {
  const p = new URLSearchParams();
  if (args.search) p.set('search', args.search);
  if (args.tagIds && args.tagIds.length > 0) p.set('tagIds', args.tagIds.join(','));
  if (args.ownerId) p.set('ownerId', args.ownerId);
  if (args.priority) p.set('priority', args.priority);
  if (args.dueFrom) p.set('dueFrom', args.dueFrom);
  if (args.dueTo) p.set('dueTo', args.dueTo);
  return p.toString();
}

export function useBoard(pipelineId: string | null, filters: BoardFilters) {
  return useQuery({
    queryKey: pipelineId ? boardKey(pipelineId, filters) : ['board', 'none'],
    queryFn: async () =>
      (await api.get<BoardResponse>(`/pipelines/${pipelineId}/board?${toQuery(filters)}`)).data,
    enabled: !!pipelineId,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

export type OpportunityDetail = BoardCard & {
  pipelineId: string;
  stageId: string;
  customFields: { customFieldId: string; value: string }[];
  updatedAt: string;
};

export type OpportunitySearchHit = {
  id: string;
  title: string;
  contactName: string;
  pipelineId: string;
  pipelineName: string;
  stageId: string;
  stageName: string;
};

export function useSearchOpportunities(q: string) {
  return useQuery({
    queryKey: ['opportunities-search', q],
    queryFn: async () =>
      (await api.get<OpportunitySearchHit[]>(`/opportunities/search`, { params: { q, limit: 20 } })).data,
    staleTime: 10_000,
    placeholderData: keepPreviousData,
  });
}

export function useOpportunity(id: string | null) {
  return useQuery({
    queryKey: id ? (['opportunity', id] as const) : ['opportunity', 'none'],
    queryFn: async () => (await api.get<OpportunityDetail>(`/opportunities/${id}`)).data,
    enabled: !!id,
  });
}

export function buildBoardExportUrl(pipelineId: string, filters: BoardFilters): string {
  return `/pipelines/${pipelineId}/opportunities/export?${toQuery(filters)}`;
}

// ---------- mutations ----------

export type OpportunityInput = {
  title: string;
  contactId: string;
  pipelineId: string;
  stageId: string;
  value: number;
  priority: Priority;
  description?: string | null;
  dueDate?: string | null;
  ownerId?: string | null;
  tagIds?: string[];
  customFields?: Record<string, string>;
};

function invalidateBoard(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['board'] });
}

export function useCreateOpportunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: OpportunityInput) =>
      (await api.post<BoardCard>('/opportunities', input)).data,
    onSuccess: () => invalidateBoard(qc),
  });
}

export function useUpdateOpportunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string } & Partial<Omit<OpportunityInput, 'pipelineId'>>) =>
      (await api.put<BoardCard>(`/opportunities/${id}`, patch)).data,
    onSuccess: () => invalidateBoard(qc),
  });
}

export function useDeleteOpportunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/opportunities/${id}`)).data,
    onSuccess: () => invalidateBoard(qc),
  });
}

export function useMoveOpportunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, toStageId, order }: { id: string; toStageId: string; order: number }) =>
      (await api.put(`/opportunities/${id}/move`, { toStageId, order })).data,
    onSettled: () => invalidateBoard(qc),
  });
}

export function useSetDescription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, description }: { id: string; description: string | null }) =>
      (await api.put(`/opportunities/${id}/description`, { description })).data,
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['opportunity', vars.id] });
      qc.invalidateQueries({ queryKey: ['opportunity-history', vars.id] });
    },
  });
}

export function useSetTags() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, tagIds }: { id: string; tagIds: string[] }) =>
      (await api.put(`/opportunities/${id}/tags`, { tagIds })).data,
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['opportunity', vars.id] });
      qc.invalidateQueries({ queryKey: ['opportunity-history', vars.id] });
      qc.invalidateQueries({ queryKey: ['board'] });
    },
  });
}

export function useSetOppCustomFields() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      rows,
    }: {
      id: string;
      rows: { customFieldId: string; value: string }[];
    }) => (await api.put(`/opportunities/${id}/custom-fields`, rows)).data,
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['opportunity', vars.id] });
      qc.invalidateQueries({ queryKey: ['opportunity-history', vars.id] });
    },
  });
}

export function useReorderOpportunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, order }: { id: string; order: number }) =>
      (await api.put(`/opportunities/${id}/reorder`, { order })).data,
    onSettled: () => invalidateBoard(qc),
  });
}

export type TransferStrategy = 'KEEP_COMPATIBLE' | 'DISCARD_ALL' | 'MAP';

export type TransferInput = {
  targetPipelineId: string;
  targetStageId: string;
  customFieldStrategy?: TransferStrategy;
  fieldMapping?: { fromCustomFieldId: string; toCustomFieldId: string }[];
  keepHistory?: boolean;
  keepTags?: boolean;
  keepReminders?: boolean;
  keepFiles?: boolean;
};

export type TransferResult = {
  opportunityId: string;
  fromPipelineId: string;
  fromStageId: string;
  toPipelineId: string;
  toStageId: string;
  removedCustomFields: string[];
  mappedCustomFields: { from: string; to: string }[];
  removedTagIds: string[];
  cancelledReminderIds: string[];
};

export function useTransferOpportunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string } & TransferInput) =>
      (await api.put<TransferResult>(`/opportunities/${id}/transfer`, input)).data,
    onSuccess: (_, vars) => {
      invalidateBoard(qc);
      qc.invalidateQueries({ queryKey: ['opportunity', vars.id] });
      qc.invalidateQueries({ queryKey: ['opportunity-history', vars.id] });
    },
  });
}
