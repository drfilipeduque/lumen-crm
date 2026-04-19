import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export type ContactTag = { id: string; name: string; color: string };

export type ContactListItem = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  ownerId: string | null;
  ownerName: string | null;
  tags: ContactTag[];
  opportunityCount: number;
  lastInteractionAt: string | null;
  createdAt: string;
};

export type ContactDetail = ContactListItem & {
  birthDate: string | null;
  cpf: string | null;
  address: Record<string, string> | null;
  notes: string | null;
  updatedAt: string;
  opportunities: {
    id: string;
    title: string;
    value: number;
    pipelineId: string;
    stageId: string;
    stageName: string;
    createdAt: string;
  }[];
};

export type ContactsListResponse = {
  data: ContactListItem[];
  total: number;
  page: number;
  totalPages: number;
};

export type ContactFilters = {
  search?: string;
  tagIds?: string[];
  ownerId?: string;
  hasOwner?: boolean;
  createdFrom?: string;
  createdTo?: string;
  page?: number;
  limit?: number;
  sortBy?: 'name' | 'phone' | 'createdAt' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
};

const LIST_KEY = 'contacts-list';
const detailKey = (id: string) => ['contacts-detail', id] as const;

export function buildContactsQuery(args: ContactFilters): string {
  const p = new URLSearchParams();
  if (args.search) p.set('search', args.search);
  if (args.tagIds && args.tagIds.length > 0) p.set('tagIds', args.tagIds.join(','));
  if (args.ownerId) p.set('ownerId', args.ownerId);
  if (args.hasOwner !== undefined) p.set('hasOwner', String(args.hasOwner));
  if (args.createdFrom) p.set('createdFrom', args.createdFrom);
  if (args.createdTo) p.set('createdTo', args.createdTo);
  if (args.page) p.set('page', String(args.page));
  if (args.limit) p.set('limit', String(args.limit));
  if (args.sortBy) p.set('sortBy', args.sortBy);
  if (args.sortOrder) p.set('sortOrder', args.sortOrder);
  return p.toString();
}

export function useContacts(filters: ContactFilters) {
  return useQuery({
    queryKey: [LIST_KEY, filters],
    queryFn: async () =>
      (await api.get<ContactsListResponse>(`/contacts?${buildContactsQuery(filters)}`)).data,
    placeholderData: keepPreviousData,
  });
}

export function useContact(id: string | null) {
  return useQuery({
    queryKey: id ? detailKey(id) : ['contacts-detail', 'none'],
    queryFn: async () => (await api.get<ContactDetail>(`/contacts/${id}`)).data,
    enabled: !!id,
  });
}

export type ContactInput = {
  name: string;
  phone: string;
  email?: string | null;
  birthDate?: string | null;
  cpf?: string | null;
  address?: Record<string, string> | null;
  notes?: string | null;
  ownerId?: string | null;
  tagIds?: string[];
};

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: [LIST_KEY] });
}

export function useCreateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ContactInput) =>
      (await api.post<ContactDetail>('/contacts', input)).data,
    onSuccess: () => invalidate(qc),
  });
}

export function useUpdateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: ContactInput & { id: string }) =>
      (await api.put<ContactDetail>(`/contacts/${id}`, input)).data,
    onSuccess: (data) => {
      invalidate(qc);
      qc.setQueryData(detailKey(data.id), data);
    },
  });
}

export function useDeleteContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/contacts/${id}`)).data,
    onSuccess: () => invalidate(qc),
  });
}

export function useBulkAssign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, ownerId }: { ids: string[]; ownerId: string | null }) =>
      (await api.post<{ ok: true; affected: number }>('/contacts/bulk-assign', { ids, ownerId })).data,
    onSuccess: () => invalidate(qc),
  });
}

export function useBulkTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, tagIds, mode }: { ids: string[]; tagIds: string[]; mode: 'add' | 'replace' | 'remove' }) =>
      (await api.post<{ ok: true; affected: number }>('/contacts/bulk-tag', { ids, tagIds, mode })).data,
    onSuccess: () => invalidate(qc),
  });
}

export function useBulkDelete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) =>
      (await api.post<{ ok: true; affected: number }>('/contacts/bulk-delete', { ids })).data,
    onSuccess: () => invalidate(qc),
  });
}
