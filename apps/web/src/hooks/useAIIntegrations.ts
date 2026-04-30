import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export type AIProvider = 'CLAUDE' | 'OPENAI';

export type AIIntegration = {
  id: string;
  name: string;
  provider: AIProvider;
  keyMask: string;
  defaultModel: string;
  active: boolean;
  usageCount: number;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export const CLAUDE_MODELS = [
  'claude-opus-4-7',
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
] as const;
export const OPENAI_MODELS = ['gpt-4o', 'gpt-4o-mini'] as const;

export function modelsFor(provider: AIProvider): readonly string[] {
  return provider === 'CLAUDE' ? CLAUDE_MODELS : OPENAI_MODELS;
}

const KEY = ['ai-integrations'] as const;

export function useAIIntegrations() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => (await api.get<AIIntegration[]>('/ai-integrations')).data,
  });
}

type CreateInput = {
  name: string;
  provider: AIProvider;
  apiKey: string;
  defaultModel?: string;
  active?: boolean;
};

export function useCreateAIIntegration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateInput) =>
      (await api.post<AIIntegration>('/ai-integrations', input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateAIIntegration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...patch
    }: {
      id: string;
      name?: string;
      defaultModel?: string;
      active?: boolean;
    }) => (await api.put<AIIntegration>(`/ai-integrations/${id}`, patch)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useRotateAIIntegrationKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, apiKey }: { id: string; apiKey: string }) =>
      (await api.put<AIIntegration>(`/ai-integrations/${id}/rotate-key`, { apiKey })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteAIIntegration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/ai-integrations/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

// Testa integração já salva.
export function useTestAIIntegration() {
  return useMutation({
    mutationFn: async ({ id, prompt }: { id: string; prompt?: string }) =>
      (
        await api.post<
          | { ok: true; result: { text: string; model: string } }
          | { ok: false; error: string }
        >(`/ai-integrations/${id}/test`, { prompt })
      ).data,
  });
}

// Testa key ANTES de salvar.
export function useTestAIKey() {
  return useMutation({
    mutationFn: async (input: { provider: AIProvider; apiKey: string; model?: string }) =>
      (await api.post<{ ok: boolean; error?: string }>('/ai-integrations/test-key', input)).data,
  });
}
