import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export type PipelineListItem = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  order: number;
  stageCount: number;
  opportunityCount: number;
  createdAt: string;
  updatedAt: string;
};

export type StageDetail = {
  id: string;
  name: string;
  color: string;
  order: number;
  isClosedWon: boolean;
  isClosedLost: boolean;
  opportunityCount: number;
};

export type PipelineCustomField = {
  customFieldId: string;
  name: string;
  type: string;
  visible: boolean;
  order: number;
};

export type PipelineDetail = PipelineListItem & {
  stages: StageDetail[];
  customFields: PipelineCustomField[];
};

const LIST_KEY = ['pipelines'] as const;
const detailKey = (id: string) => ['pipelines', id] as const;

export function usePipelines() {
  return useQuery({
    queryKey: LIST_KEY,
    queryFn: async () => (await api.get<PipelineListItem[]>('/pipelines')).data,
  });
}

export function usePipeline(id: string | null) {
  return useQuery({
    queryKey: id ? detailKey(id) : ['pipelines', 'none'],
    queryFn: async () => (await api.get<PipelineDetail>(`/pipelines/${id}`)).data,
    enabled: !!id,
  });
}

export function useCreatePipeline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      description?: string;
      stages: Array<{ name: string; color: string; isClosedWon?: boolean; isClosedLost?: boolean }>;
    }) => (await api.post<PipelineDetail>('/pipelines', input)).data,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: LIST_KEY });
      qc.setQueryData(detailKey(data.id), data);
    },
  });
}

export function useUpdatePipeline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...patch
    }: {
      id: string;
      name?: string;
      description?: string | null;
      active?: boolean;
    }) => (await api.put<PipelineDetail>(`/pipelines/${id}`, patch)).data,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: LIST_KEY });
      qc.setQueryData(detailKey(data.id), data);
    },
  });
}

export function useDeletePipeline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, force }: { id: string; force?: boolean }) =>
      (await api.delete(`/pipelines/${id}${force ? '/force' : ''}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: LIST_KEY }),
  });
}

export function useReorderStages() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ pipelineId, ids }: { pipelineId: string; ids: string[] }) =>
      (await api.put<PipelineDetail>(`/pipelines/${pipelineId}/stages/reorder`, { ids })).data,
    onSuccess: (data) => qc.setQueryData(detailKey(data.id), data),
  });
}

export function useSetPipelineCustomFields() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      pipelineId,
      rows,
    }: {
      pipelineId: string;
      rows: Array<{ customFieldId: string; visible: boolean; order: number }>;
    }) => (await api.put<PipelineDetail>(`/pipelines/${pipelineId}/custom-fields`, rows)).data,
    onSuccess: (data) => qc.setQueryData(detailKey(data.id), data),
  });
}

export function useCreateStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      pipelineId,
      ...body
    }: {
      pipelineId: string;
      name: string;
      color: string;
      isClosedWon?: boolean;
      isClosedLost?: boolean;
    }) => (await api.post<PipelineDetail>(`/pipelines/${pipelineId}/stages`, body)).data,
    onSuccess: (data) => qc.setQueryData(detailKey(data.id), data),
  });
}

export function useUpdateStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...patch
    }: {
      id: string;
      name?: string;
      color?: string;
      isClosedWon?: boolean;
      isClosedLost?: boolean;
    }) => (await api.put<PipelineDetail>(`/stages/${id}`, patch)).data,
    onSuccess: (data) => qc.setQueryData(detailKey(data.id), data),
  });
}

export function useDeleteStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, force }: { id: string; force?: boolean }) =>
      (
        await api.delete<{ ok: true; pipelineId: string; opportunitiesRemoved?: number }>(
          `/stages/${id}${force ? '/force' : ''}`,
        )
      ).data,
    onSuccess: (data) => qc.invalidateQueries({ queryKey: detailKey(data.pipelineId) }),
  });
}
