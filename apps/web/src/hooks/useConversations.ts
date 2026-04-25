import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api } from '../lib/api';

export type ConversationListItem = {
  id: string;
  contactId: string;
  contactName: string;
  contactPhone: string;
  contactAvatar: string | null;
  connectionId: string;
  connectionName: string;
  connectionType: 'OFFICIAL' | 'UNOFFICIAL';
  assigneeId: string | null;
  assigneeName: string | null;
  status: 'OPEN' | 'RESOLVED';
  unreadCount: number;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastMessageFromMe: boolean;
  tags: { id: string; name: string; color: string }[];
};

export type ConversationListResponse = {
  data: ConversationListItem[];
  total: number;
  page: number;
  totalPages: number;
};

export type ConversationFilters = {
  assigneeId?: 'me' | string;
  unassigned?: boolean;
  tagId?: string;
  search?: string;
  status?: 'OPEN' | 'RESOLVED';
  connectionId?: string;
  unreadOnly?: boolean;
  page?: number;
  limit?: number;
};

export type ConversationDetail = {
  id: string;
  contact: {
    id: string;
    name: string;
    phone: string;
    phoneFormatted: string;
    email: string | null;
    avatar: string | null;
    tags: { id: string; name: string; color: string }[];
    ownerId: string | null;
    ownerName: string | null;
  };
  connection: { id: string; name: string; type: 'OFFICIAL' | 'UNOFFICIAL'; status: string };
  assigneeId: string | null;
  assignee: { id: string; name: string; avatar: string | null } | null;
  status: 'OPEN' | 'RESOLVED';
  unreadCount: number;
  lastMessageAt: string | null;
  activeOpportunity: {
    id: string;
    title: string;
    value: number;
    pipelineId: string;
    pipelineName: string;
    stageId: string;
    stageName: string;
    stageColor: string;
  } | null;
  nextReminder: { id: string; title: string; dueAt: string } | null;
  recentHistory: { id: string; action: string; createdAt: string; userName: string | null }[];
  createdAt: string;
};

export type Message = {
  id: string;
  conversationId: string;
  fromMe: boolean;
  type: 'TEXT' | 'IMAGE' | 'AUDIO' | 'DOCUMENT' | 'VIDEO';
  content: string | null;
  mediaUrl: string | null;
  mediaName: string | null;
  mediaSize: number | null;
  status: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
  externalId: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  createdAt: string;
};

export type MessagesPage = { data: Message[]; hasMore: boolean };

export type UploadResult = {
  url: string;
  name: string;
  mimeType: string;
  size: number;
  type: 'IMAGE' | 'AUDIO' | 'VIDEO' | 'DOCUMENT';
};

const LIST_KEY = 'conversations-list';
const DETAIL_KEY = 'conversation-detail';
const MSG_KEY = 'conversation-messages';
const UNREAD_KEY = 'conversations-unread-total';

function buildQuery(args: ConversationFilters): string {
  const p = new URLSearchParams();
  if (args.assigneeId) p.set('assigneeId', args.assigneeId);
  if (args.unassigned) p.set('unassigned', 'true');
  if (args.tagId) p.set('tagId', args.tagId);
  if (args.search) p.set('search', args.search);
  if (args.status) p.set('status', args.status);
  if (args.connectionId) p.set('connectionId', args.connectionId);
  if (args.unreadOnly) p.set('unreadOnly', 'true');
  if (args.page) p.set('page', String(args.page));
  if (args.limit) p.set('limit', String(args.limit));
  return p.toString();
}

export function useConversationsList(filters: ConversationFilters) {
  return useQuery({
    queryKey: [LIST_KEY, filters],
    queryFn: async () =>
      (await api.get<ConversationListResponse>(`/conversations?${buildQuery(filters)}`)).data,
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });
}

export function useConversation(id: string | null) {
  return useQuery({
    queryKey: id ? [DETAIL_KEY, id] : [DETAIL_KEY, 'none'],
    queryFn: async () => (await api.get<ConversationDetail>(`/conversations/${id}`)).data,
    enabled: !!id,
  });
}

export function useUnreadTotal() {
  return useQuery({
    queryKey: [UNREAD_KEY],
    queryFn: async () => (await api.get<{ total: number }>(`/conversations/unread-count`)).data.total,
    staleTime: 5_000,
  });
}

// Infinite query: cada página é a fatia mais antiga (cursor=before).
// `pageParams` armazena o id mais antigo conhecido. A primeira página vem sem cursor.
export function useConversationMessages(id: string | null, limit = 40) {
  return useInfiniteQuery({
    queryKey: id ? [MSG_KEY, id] : [MSG_KEY, 'none'],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const p = new URLSearchParams();
      p.set('limit', String(limit));
      if (pageParam) p.set('before', pageParam);
      return (await api.get<MessagesPage>(`/conversations/${id}/messages?${p.toString()}`)).data;
    },
    getNextPageParam: (last) => (last.hasMore && last.data[0] ? last.data[0].id : undefined),
    enabled: !!id,
  });
}

// ---------- Mutations ----------

function invalidateLists(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: [LIST_KEY] });
  qc.invalidateQueries({ queryKey: [UNREAD_KEY] });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.put(`/conversations/${id}/read`)).data,
    onSuccess: (_, id) => {
      invalidateLists(qc);
      qc.invalidateQueries({ queryKey: [DETAIL_KEY, id] });
    },
  });
}

export function useAssignConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, userId }: { id: string; userId: string | null }) =>
      (await api.put(`/conversations/${id}/assign`, { userId })).data,
    onSuccess: (_, vars) => {
      invalidateLists(qc);
      qc.invalidateQueries({ queryKey: [DETAIL_KEY, vars.id] });
    },
  });
}

export function useResolveConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'OPEN' | 'RESOLVED' }) =>
      (await api.put(`/conversations/${id}/resolve`, { status })).data,
    onSuccess: (_, vars) => {
      invalidateLists(qc);
      qc.invalidateQueries({ queryKey: [DETAIL_KEY, vars.id] });
    },
  });
}

export type SendMessageInput = {
  type: 'TEXT' | 'IMAGE' | 'AUDIO' | 'DOCUMENT' | 'VIDEO';
  content?: string | null;
  mediaUrl?: string | null;
  mediaName?: string | null;
  mediaMimeType?: string | null;
};

export function useSendMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: SendMessageInput & { id: string }) =>
      (await api.post<Message>(`/conversations/${id}/messages`, input)).data,
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: [MSG_KEY, vars.id] });
      qc.invalidateQueries({ queryKey: [LIST_KEY] });
    },
  });
}

export function useUploadConversationMedia() {
  return useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      const fd = new FormData();
      fd.append('file', file);
      const r = await api.post<UploadResult>(`/conversations/${id}/upload`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return r.data;
    },
  });
}

export function useCreateOpportunityFromConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...input
    }: {
      id: string;
      title: string;
      pipelineId: string;
      stageId: string;
      value?: number;
      priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
    }) =>
      (await api.post<{ id: string }>(`/conversations/${id}/create-opportunity`, input)).data,
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: [DETAIL_KEY, vars.id] });
      qc.invalidateQueries({ queryKey: ['board'] });
    },
  });
}
