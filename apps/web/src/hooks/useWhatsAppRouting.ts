import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export type RoutingStrategy = 'OFFICIAL_FIRST' | 'UNOFFICIAL_FIRST' | 'OFFICIAL_ONLY' | 'UNOFFICIAL_ONLY';

export type RoutingConfig = {
  id: string;
  defaultConnectionId: string | null;
  defaultStrategy: RoutingStrategy;
  fallbackTemplateId: string | null;
  autoMarkAsRead: boolean;
  businessHoursOnly: boolean;
  defaultConnection: { id: string; name: string; type: 'OFFICIAL' | 'UNOFFICIAL' } | null;
  fallbackTemplate: { id: string; name: string; language: string; status: string } | null;
  updatedAt: string;
};

export type RoutingConfigInput = Partial<{
  defaultConnectionId: string | null;
  defaultStrategy: RoutingStrategy;
  fallbackTemplateId: string | null;
  autoMarkAsRead: boolean;
  businessHoursOnly: boolean;
}>;

const KEY = ['whatsapp-routing-config'] as const;

export function useRoutingConfig() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => (await api.get<RoutingConfig>('/whatsapp/routing-config')).data,
  });
}

export function useUpdateRoutingConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RoutingConfigInput) =>
      (await api.put<RoutingConfig>('/whatsapp/routing-config', input)).data,
    onSuccess: (data) => {
      qc.setQueryData(KEY, data);
    },
  });
}
