import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export type CustomFieldType =
  | 'TEXT'
  | 'LONG_TEXT'
  | 'NUMBER'
  | 'CURRENCY'
  | 'DATE'
  | 'SELECT'
  | 'MULTI_SELECT'
  | 'BOOLEAN'
  | 'URL';

export type FieldOption = { label: string; value: string };

export type CustomField = {
  id: string;
  name: string;
  type: CustomFieldType;
  options: FieldOption[] | null;
  required: boolean;
  active: boolean;
  order: number;
  valueCount: number;
};

export type CustomFieldInput = {
  name: string;
  type: CustomFieldType;
  options?: FieldOption[];
  required: boolean;
  active: boolean;
};

const KEY = ['custom-fields'] as const;

export function useCustomFields() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => (await api.get<CustomField[]>('/custom-fields')).data,
  });
}

export function useCreateCustomField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CustomFieldInput) =>
      (await api.post<CustomField>('/custom-fields', input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateCustomField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string } & CustomFieldInput) =>
      (await api.put<CustomField>(`/custom-fields/${id}`, patch)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteCustomField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, force }: { id: string; force?: boolean }) =>
      (await api.delete(`/custom-fields/${id}${force ? '/force' : ''}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useReorderCustomFields() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) =>
      (await api.put<CustomField[]>('/custom-fields/reorder', { ids })).data,
    onSuccess: (data) => qc.setQueryData(KEY, data),
  });
}
