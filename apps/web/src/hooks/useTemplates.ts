import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export type TemplateStatus = 'APPROVED' | 'PENDING' | 'REJECTED';
export type TemplateCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';

export type TemplateButton =
  | { type: 'QUICK_REPLY'; text: string }
  | { type: 'URL'; text: string; url: string }
  | { type: 'PHONE_NUMBER'; text: string; phone_number: string };

export type Template = {
  id: string;
  connectionId: string;
  externalId: string | null;
  name: string;
  category: TemplateCategory;
  language: string;
  status: TemplateStatus;
  body: string;
  variables: string[] | null;
  header: { format: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT'; text?: string | null } | null;
  footer: string | null;
  buttons: TemplateButton[] | null;
  createdAt: string;
  updatedAt: string;
};

const KEY = (connectionId: string) => ['templates', connectionId] as const;

export function useTemplates(connectionId: string | null) {
  return useQuery({
    queryKey: connectionId ? KEY(connectionId) : (['templates', 'none'] as const),
    queryFn: async () =>
      (await api.get<Template[]>(`/whatsapp/connections/${connectionId}/templates`)).data,
    enabled: !!connectionId,
  });
}

export function useSyncTemplates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (connectionId: string) =>
      (await api.post<{ count: number }>(`/whatsapp/connections/${connectionId}/templates/sync`, {})).data,
    onSuccess: (_d, connectionId) => qc.invalidateQueries({ queryKey: KEY(connectionId) }),
  });
}

export type CreateTemplateInput = {
  name: string;
  category: TemplateCategory;
  language: string;
  header?: { format: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT'; text?: string } | null;
  body: string;
  footer?: string | null;
  buttons?: TemplateButton[] | null;
};

export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ connectionId, input }: { connectionId: string; input: CreateTemplateInput }) =>
      (await api.post<Template>(`/whatsapp/connections/${connectionId}/templates`, input)).data,
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: KEY(vars.connectionId) }),
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ connectionId, templateId }: { connectionId: string; templateId: string }) =>
      (await api.delete(`/whatsapp/connections/${connectionId}/templates/${templateId}`)).data,
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: KEY(vars.connectionId) }),
  });
}

// =====================================================================
// Janela de 24h por conversa
// =====================================================================

export type WindowStatus = {
  open: boolean;
  expiresAt: string | null;
  hoursRemaining: number | null;
  applicable: boolean;
};

export function useWindowStatus(conversationId: string | null) {
  return useQuery({
    queryKey: conversationId ? (['window', conversationId] as const) : (['window', 'none'] as const),
    queryFn: async () =>
      (await api.get<WindowStatus>(`/conversations/${conversationId}/window-status`)).data,
    enabled: !!conversationId,
    refetchInterval: 60_000,
  });
}

// =====================================================================
// Envio de template
// =====================================================================

export function useSendTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      conversationId,
      templateId,
      variables,
    }: {
      conversationId: string;
      templateId: string;
      variables: Record<string, string>;
    }) =>
      (await api.post(`/conversations/${conversationId}/messages/template`, {
        templateId,
        variables,
      })).data,
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['messages', vars.conversationId] });
      qc.invalidateQueries({ queryKey: ['window', vars.conversationId] });
    },
  });
}
