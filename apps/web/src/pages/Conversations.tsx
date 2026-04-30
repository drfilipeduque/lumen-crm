import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { useTheme } from '../lib/ThemeContext';
import { useAuthStore } from '../stores/useAuthStore';
import { Icons } from '../components/icons';
import { FONT_STACK } from '../lib/theme';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { toast } from '../components/ui/Toast';
import { OpportunityPopup } from '../components/opportunity/OpportunityPopup';
import { createPortal } from 'react-dom';
import {
  useConversation,
  useConversationMessages,
  useConversationsList,
  useAssignConversation,
  useCreateOpportunityFromConversation,
  useMarkRead,
  useResolveConversation,
  useSendMessage,
  useUploadConversationMedia,
  type ConversationListItem,
  type Message,
  type SendMessageInput,
} from '../hooks/useConversations';
import { useTeam } from '../hooks/useTeam';
import { useTags } from '../hooks/useTags';
import { useWhatsAppConnections } from '../hooks/useWhatsApp';
import { useContactCadences, usePauseExecution, useResumeExecution } from '../hooks/useCadences';
import { usePipeline, usePipelines } from '../hooks/usePipelines';
import { useSocketEvent } from '../hooks/useSocketIO';
import { ScriptsPopover, type RenderedScript } from '../components/conversations/ScriptsPopover';
import { useWindowStatus, type WindowStatus } from '../hooks/useTemplates';
import { TemplatePopover } from '../components/conversations/TemplatePopover';

// ============================================================
// PAGE
// ============================================================

type Tab = 'mine' | 'unassigned';

export function ConversationsPage() {
  const { tokens: t } = useTheme();
  const me = useAuthStore((s) => s.user);
  const isAdmin = me?.role === 'ADMIN';
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [tab, setTab] = useState<Tab>('mine');
  const [filterConnectionId, setFilterConnectionId] = useState<string | null>(null);
  const [filterTagId, setFilterTagId] = useState<string | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get('id');
  const requestedContactId = searchParams.get('contactId');

  // Debounce na busca
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  // Reset tab unassigned se não for admin
  useEffect(() => {
    if (!isAdmin && tab === 'unassigned') setTab('mine');
  }, [isAdmin, tab]);

  const list = useConversationsList({
    assigneeId: tab === 'mine' ? 'me' : undefined,
    unassigned: tab === 'unassigned' ? true : undefined,
    connectionId: filterConnectionId ?? undefined,
    tagId: filterTagId ?? undefined,
    unreadOnly: unreadOnly || undefined,
    search: debouncedSearch || undefined,
    limit: 50,
  });

  // Resolve ?contactId=xxx pra ?id= da conversa correspondente
  useEffect(() => {
    if (!requestedContactId || selectedId) return;
    const match = list.data?.data.find((c) => c.contactId === requestedContactId);
    if (match) {
      setSearchParams((prev) => {
        prev.delete('contactId');
        prev.set('id', match.id);
        return prev;
      });
    }
  }, [requestedContactId, selectedId, list.data, setSearchParams]);

  const handleSelect = (id: string) => {
    setSearchParams((prev) => {
      prev.set('id', id);
      return prev;
    });
  };

  const handleCloseChat = () => {
    setSearchParams((prev) => {
      prev.delete('id');
      return prev;
    });
  };

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        background: t.bg,
        overflow: 'hidden',
      }}
    >
      {/* COLUNA ESQUERDA */}
      <aside
        style={{
          width: 320,
          flexShrink: 0,
          borderRight: `1px solid ${t.border}`,
          display: 'flex',
          flexDirection: 'column',
          background: t.bgElevated,
          minHeight: 0,
        }}
      >
        <LeftHeader
          search={search}
          setSearch={setSearch}
          tab={tab}
          setTab={setTab}
          isAdmin={isAdmin}
          filterConnectionId={filterConnectionId}
          setFilterConnectionId={setFilterConnectionId}
          filterTagId={filterTagId}
          setFilterTagId={setFilterTagId}
          unreadOnly={unreadOnly}
          setUnreadOnly={setUnreadOnly}
        />

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {list.isLoading && !list.data ? (
            <div style={{ padding: 24, fontSize: 12.5, color: t.textDim }}>Carregando…</div>
          ) : !list.data || list.data.data.length === 0 ? (
            <ListEmpty hasFilters={!!debouncedSearch || !!filterConnectionId || !!filterTagId || unreadOnly} />
          ) : (
            list.data.data.map((c) => (
              <ConversationRow
                key={c.id}
                conv={c}
                selected={c.id === selectedId}
                onSelect={() => handleSelect(c.id)}
              />
            ))
          )}
        </div>
      </aside>

      {/* COLUNA CENTRAL + DIREITA */}
      {selectedId ? (
        <ChatArea conversationId={selectedId} onClose={handleCloseChat} />
      ) : (
        <EmptyChat />
      )}
    </div>
  );
}

// ============================================================
// LEFT — HEADER (busca, abas, filtros)
// ============================================================

function LeftHeader({
  search,
  setSearch,
  tab,
  setTab,
  isAdmin,
  filterConnectionId,
  setFilterConnectionId,
  filterTagId,
  setFilterTagId,
  unreadOnly,
  setUnreadOnly,
}: {
  search: string;
  setSearch: (v: string) => void;
  tab: Tab;
  setTab: (v: Tab) => void;
  isAdmin: boolean;
  filterConnectionId: string | null;
  setFilterConnectionId: (v: string | null) => void;
  filterTagId: string | null;
  setFilterTagId: (v: string | null) => void;
  unreadOnly: boolean;
  setUnreadOnly: (v: boolean) => void;
}) {
  const { tokens: t } = useTheme();
  const conns = useWhatsAppConnections();
  const tags = useTags();

  return (
    <div
      style={{
        padding: '14px 14px 10px',
        borderBottom: `1px solid ${t.border}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        flexShrink: 0,
      }}
    >
      <div style={{ fontSize: 16, fontWeight: 600, color: t.text, letterSpacing: -0.3 }}>
        Conversas
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: t.bgInput,
          border: `1px solid ${t.border}`,
          borderRadius: 7,
          padding: '0 10px',
          height: 32,
        }}
      >
        <Icons.Search s={13} c={t.icon} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar nome ou telefone…"
          style={{
            flex: 1,
            border: 'none',
            background: 'transparent',
            outline: 'none',
            color: t.text,
            fontSize: 12.5,
            fontFamily: FONT_STACK,
          }}
        />
      </div>

      <div style={{ display: 'inline-flex', background: t.bgInput, border: `1px solid ${t.border}`, borderRadius: 8, padding: 2 }}>
        <TabButton active={tab === 'mine'} onClick={() => setTab('mine')} label="Minhas conversas" />
        {isAdmin && <TabButton active={tab === 'unassigned'} onClick={() => setTab('unassigned')} label="Não atribuídas" />}
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <FilterChip
          active={unreadOnly}
          onClick={() => setUnreadOnly(!unreadOnly)}
          label="Não lidas"
        />
        {(conns.data ?? []).map((c) => (
          <FilterChip
            key={c.id}
            active={filterConnectionId === c.id}
            onClick={() => setFilterConnectionId(filterConnectionId === c.id ? null : c.id)}
            label={c.name}
          />
        ))}
        {(tags.data ?? []).slice(0, 6).map((tag) => (
          <FilterChip
            key={tag.id}
            active={filterTagId === tag.id}
            onClick={() => setFilterTagId(filterTagId === tag.id ? null : tag.id)}
            label={tag.name}
            color={tag.color}
          />
        ))}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  const { tokens: t } = useTheme();
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '5px 10px',
        border: 'none',
        borderRadius: 6,
        background: active ? t.gold : 'transparent',
        color: active ? '#1a1300' : t.textDim,
        fontSize: 11.5,
        fontWeight: active ? 600 : 500,
        cursor: 'pointer',
        fontFamily: FONT_STACK,
      }}
    >
      {label}
    </button>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  color,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  color?: string;
}) {
  const { tokens: t } = useTheme();
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: active ? (color ?? t.gold) : 'transparent',
        color: active ? '#1a1300' : t.textDim,
        border: `1px solid ${active ? (color ?? t.gold) : t.border}`,
        borderRadius: 999,
        padding: '3px 9px',
        fontSize: 10.5,
        fontWeight: active ? 600 : 500,
        cursor: 'pointer',
        fontFamily: FONT_STACK,
      }}
    >
      {label}
    </button>
  );
}

// ============================================================
// CONVERSATION ROW
// ============================================================

function ConversationRow({
  conv,
  selected,
  onSelect,
}: {
  conv: ConversationListItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const { tokens: t } = useTheme();
  const [hover, setHover] = useState(false);

  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: '100%',
        textAlign: 'left',
        padding: '10px 14px',
        background: selected ? t.bgActive : hover ? t.bgHover : 'transparent',
        border: 'none',
        borderBottom: `1px solid ${t.border}`,
        cursor: 'pointer',
        display: 'flex',
        gap: 10,
        alignItems: 'center',
        fontFamily: FONT_STACK,
      }}
    >
      <Avatar name={conv.contactName} size={40} url={conv.contactAvatar} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div
            style={{
              flex: 1,
              fontSize: 13,
              fontWeight: conv.unreadCount > 0 ? 600 : 500,
              color: t.text,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {conv.contactName}
          </div>
          <div style={{ fontSize: 10, color: t.textFaint, flexShrink: 0 }}>
            {conv.lastMessageAt ? relativeTime(conv.lastMessageAt) : ''}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <div
            style={{
              flex: 1,
              fontSize: 11.5,
              color: conv.unreadCount > 0 ? t.text : t.textSubtle,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {conv.lastMessageFromMe && conv.lastMessagePreview ? 'Você: ' : ''}
            {conv.lastMessagePreview ?? 'Sem mensagens ainda'}
          </div>
          {conv.unreadCount > 0 && (
            <span
              style={{
                background: t.gold,
                color: '#1a1300',
                fontSize: 10,
                fontWeight: 700,
                minWidth: 18,
                height: 18,
                borderRadius: 9,
                padding: '0 5px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
            </span>
          )}
        </div>
        <div style={{ marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
          <Icons.Phone s={9} c={t.textFaint} />
          <span style={{ fontSize: 9.5, color: t.textFaint }}>{conv.connectionName}</span>
          {conv.assigneeName && (
            <>
              <span style={{ fontSize: 9.5, color: t.textFaint }}>·</span>
              <span style={{ fontSize: 9.5, color: t.textFaint }}>{conv.assigneeName}</span>
            </>
          )}
        </div>
      </div>
    </button>
  );
}

function ListEmpty({ hasFilters }: { hasFilters: boolean }) {
  const { tokens: t } = useTheme();
  return (
    <div style={{ padding: 32, textAlign: 'center', color: t.textSubtle, fontSize: 12.5 }}>
      {hasFilters ? 'Nenhuma conversa encontrada.' : 'Nenhuma conversa ainda.'}
    </div>
  );
}

// ============================================================
// EMPTY CHAT (nenhuma seleção)
// ============================================================

function EmptyChat() {
  const { tokens: t } = useTheme();
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 12,
        background: t.bg,
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 16,
          background: t.bgElevated,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icons.Chat s={28} c={t.textFaint} />
      </div>
      <div style={{ fontSize: 14, color: t.text, fontWeight: 500 }}>Selecione uma conversa</div>
      <div style={{ fontSize: 12, color: t.textSubtle }}>
        As mensagens vão aparecer aqui em tempo real.
      </div>
    </div>
  );
}

// ============================================================
// CHAT AREA (centro + direita)
// ============================================================

function ChatArea({ conversationId, onClose }: { conversationId: string; onClose: () => void }) {
  const { tokens: t } = useTheme();
  const detail = useConversation(conversationId);
  const messages = useConversationMessages(conversationId, 40);
  const me = useAuthStore((s) => s.user);
  const markRead = useMarkRead();
  const send = useSendMessage();
  // Janela de 24h só importa pra OFFICIAL — pra UNOFFICIAL retorna applicable: false.
  const windowQ = useWindowStatus(conversationId);
  const [typing, setTyping] = useState(false);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useSocketEvent<{ conversationId: string; state: 'composing' | 'recording' | 'paused' }>(
    'typing',
    (payload) => {
      if (payload.conversationId !== conversationId) return;
      if (payload.state === 'paused') {
        setTyping(false);
        return;
      }
      setTyping(true);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => setTyping(false), 4000);
    },
  );

  useEffect(() => {
    return () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    };
  }, []);

  // Reset typing ao trocar de conversa
  useEffect(() => {
    setTyping(false);
  }, [conversationId]);

  // Marca como lida ao abrir e quando chega nova msg
  useEffect(() => {
    if (detail.data && detail.data.unreadCount > 0) {
      void markRead.mutateAsync(conversationId).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, detail.data?.unreadCount]);

  const flatMessages = useMemo(() => {
    const pages = messages.data?.pages ?? [];
    // Cada página vem em ordem cronológica asc; pageParam vai pra trás (mais antigas).
    // Ordem das pages: primeira é a mais nova; pra concatenar do topo (antigo) ao fim (novo)
    // precisamos reverter a ordem das pages e concatenar.
    const ordered = [...pages].reverse();
    return ordered.flatMap((p) => p.data);
  }, [messages.data]);

  if (detail.isLoading || !detail.data) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.textDim, fontSize: 12.5 }}>
        Carregando…
      </div>
    );
  }

  return (
    <>
      <section
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          background: t.bg,
          minHeight: 0,
        }}
      >
        <ChatHeader detail={detail.data} onClose={onClose} windowStatus={windowQ.data ?? null} />
        <MessagesView
          messages={flatMessages}
          loadOlder={() => messages.fetchNextPage()}
          hasMore={!!messages.hasNextPage}
          loadingOlder={messages.isFetchingNextPage}
          typing={typing}
        />
        <Composer
          conversationId={conversationId}
          contactId={detail.data.contact.id}
          opportunityId={detail.data.activeOpportunity?.id ?? undefined}
          connectionId={detail.data.connection.id}
          connectionType={detail.data.connection.type}
          windowStatus={windowQ.data ?? null}
          disabled={detail.data.connection.status !== 'CONNECTED'}
          onSend={async (input) => {
            await send.mutateAsync({ id: conversationId, ...input });
          }}
        />
      </section>

      <RightPanel detail={detail.data} meId={me?.id ?? null} isAdmin={me?.role === 'ADMIN'} />
    </>
  );
}

// ============================================================
// CHAT HEADER
// ============================================================

function ChatHeader({
  detail,
  onClose,
  windowStatus,
}: {
  detail: ReturnType<typeof useConversation>['data'] & object;
  onClose: () => void;
  windowStatus: WindowStatus | null;
}) {
  const { tokens: t } = useTheme();
  const me = useAuthStore((s) => s.user);
  const isAdmin = me?.role === 'ADMIN';
  const team = useTeam();
  const assign = useAssignConversation();
  const resolve = useResolveConversation();
  const [actionsOpen, setActionsOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [confirmResolve, setConfirmResolve] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setActionsOpen(false), actionsOpen);
  const assignRef = useRef<HTMLDivElement>(null);
  useClickOutside(assignRef, () => setAssignOpen(false), assignOpen);

  const handleAssignToMe = async () => {
    if (!me) return;
    try {
      await assign.mutateAsync({ id: detail.id, userId: me.id });
      toast('Conversa atribuída a você', 'success');
    } catch (e) {
      toast(axiosMsg(e) || 'Falha ao atribuir', 'error');
    }
  };

  const handleAssignTo = async (userId: string | null) => {
    setAssignOpen(false);
    setActionsOpen(false);
    try {
      await assign.mutateAsync({ id: detail.id, userId });
      toast(userId ? 'Conversa atribuída' : 'Conversa desatribuída', 'success');
    } catch (e) {
      toast(axiosMsg(e) || 'Falha ao atribuir', 'error');
    }
  };

  const handleResolve = async () => {
    setActionsOpen(false);
    try {
      await resolve.mutateAsync({
        id: detail.id,
        status: detail.status === 'RESOLVED' ? 'OPEN' : 'RESOLVED',
      });
      toast(detail.status === 'RESOLVED' ? 'Conversa reaberta' : 'Conversa resolvida', 'success');
    } catch (e) {
      toast(axiosMsg(e) || 'Falha', 'error');
    } finally {
      setConfirmResolve(false);
    }
  };

  const isUnassigned = !detail.assigneeId;

  return (
    <header
      style={{
        height: 64,
        flexShrink: 0,
        padding: '0 18px',
        borderBottom: `1px solid ${t.border}`,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        background: t.bgElevated,
      }}
    >
      <Avatar name={detail.contact.name} size={40} url={detail.contact.avatar} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: t.text }}>{detail.contact.name}</div>
        <div style={{ fontSize: 11, color: t.textSubtle, display: 'flex', gap: 6, alignItems: 'center' }}>
          <span>{detail.contact.phoneFormatted}</span>
          <span>·</span>
          <span>via {detail.connection.name}</span>
          {detail.status === 'RESOLVED' && (
            <>
              <span>·</span>
              <span style={{ color: t.success, fontWeight: 600 }}>Resolvida</span>
            </>
          )}
        </div>
      </div>

      {windowStatus?.applicable && <WindowChip status={windowStatus} />}

      {isUnassigned && (
        <button type="button" onClick={handleAssignToMe} style={buttonGhost(t)}>
          Atribuir a mim
        </button>
      )}

      <div ref={ref} style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => setActionsOpen((v) => !v)}
          aria-label="Ações"
          style={iconButton(t)}
        >
          <Icons.MoreH s={16} c={t.textDim} />
        </button>
        {actionsOpen && (
          <div
            style={{
              position: 'absolute',
              right: 0,
              top: 36,
              zIndex: 30,
              background: t.bgElevated,
              border: `1px solid ${t.border}`,
              borderRadius: 8,
              boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
              padding: 4,
              minWidth: 200,
            }}
          >
            <ActionRow
              icon={<Icons.Check s={13} c="currentColor" />}
              label={detail.status === 'RESOLVED' ? 'Reabrir conversa' : 'Resolver conversa'}
              onClick={() => {
                if (detail.status === 'RESOLVED') void handleResolve();
                else setConfirmResolve(true);
              }}
            />
            {isAdmin && (
              <div ref={assignRef} style={{ position: 'relative' }}>
                <ActionRow
                  icon={<Icons.User s={13} c="currentColor" />}
                  label="Atribuir a outro usuário…"
                  onClick={() => setAssignOpen((v) => !v)}
                />
                {assignOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      right: '100%',
                      top: 0,
                      marginRight: 6,
                      background: t.bgElevated,
                      border: `1px solid ${t.border}`,
                      borderRadius: 8,
                      boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
                      padding: 4,
                      minWidth: 200,
                      maxHeight: 280,
                      overflowY: 'auto',
                    }}
                  >
                    {detail.assigneeId && (
                      <ActionRow
                        icon={<Icons.X s={13} c="currentColor" />}
                        label="Desatribuir"
                        onClick={() => handleAssignTo(null)}
                      />
                    )}
                    {(team.data ?? []).map((u) => (
                      <ActionRow
                        key={u.id}
                        icon={<Avatar name={u.name} size={18} />}
                        label={u.name + (u.id === detail.assigneeId ? ' ✓' : '')}
                        onClick={() => handleAssignTo(u.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
            <div style={{ height: 1, background: t.border, margin: '4px 0' }} />
            <ActionRow
              icon={<Icons.X s={13} c="currentColor" />}
              label="Fechar painel"
              onClick={() => {
                setActionsOpen(false);
                onClose();
              }}
            />
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmResolve}
        title="Resolver conversa?"
        description="A conversa será marcada como resolvida. Você pode reabri-la depois."
        confirmLabel="Resolver"
        onConfirm={handleResolve}
        onClose={() => setConfirmResolve(false)}
      />
    </header>
  );
}

function ActionRow({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  danger?: boolean;
}) {
  const { tokens: t } = useTheme();
  const [hover, setHover] = useState(false);
  const color = danger ? t.danger : hover ? t.text : t.textDim;
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        height: 32,
        padding: '0 10px',
        border: 'none',
        background: hover ? t.bgHover : 'transparent',
        borderRadius: 6,
        color,
        fontSize: 12.5,
        fontFamily: FONT_STACK,
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <span style={{ flexShrink: 0, display: 'flex' }}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
    </button>
  );
}

// ============================================================
// WINDOW CHIP — janela de 24h da Meta Cloud API
// ============================================================

function WindowChip({ status }: { status: WindowStatus }) {
  const { tokens: t } = useTheme();
  const info = chipInfoFor(status);
  return (
    <span
      title={status.expiresAt ? `Expira em ${new Date(status.expiresAt).toLocaleString('pt-BR')}` : undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '4px 10px',
        borderRadius: 999,
        background: info.bg,
        color: info.color,
        border: `1px solid ${info.border}`,
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: 0.4,
        textTransform: 'uppercase',
        fontFamily: FONT_STACK,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 999, background: info.color }} />
      {info.label}
      <span style={{ display: 'none' }}>{t.bg}</span>
    </span>
  );
}

function chipInfoFor(status: WindowStatus): { label: string; color: string; bg: string; border: string } {
  if (!status.open) {
    return {
      label: 'Janela fechada',
      color: '#f85149',
      bg: 'rgba(248,81,73,0.10)',
      border: 'rgba(248,81,73,0.32)',
    };
  }
  const h = status.hoursRemaining ?? 0;
  if (h <= 2) {
    return {
      label: `Fecha em ${formatChipHours(h)}`,
      color: '#f59e0b',
      bg: 'rgba(245,158,11,0.10)',
      border: 'rgba(245,158,11,0.32)',
    };
  }
  return {
    label: `Janela aberta — ${formatChipHours(h)}`,
    color: '#D4AF37',
    bg: 'rgba(212,175,55,0.10)',
    border: 'rgba(212,175,55,0.32)',
  };
}

function formatChipHours(h: number): string {
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}min`;
  return `${Math.round(h)}h`;
}

// ============================================================
// MESSAGES VIEW
// ============================================================

function MessagesView({
  messages,
  loadOlder,
  hasMore,
  loadingOlder,
  typing,
}: {
  messages: Message[];
  loadOlder: () => void;
  hasMore: boolean;
  loadingOlder: boolean;
  typing?: boolean;
}) {
  const { tokens: t } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const lastMsgIdRef = useRef<string | null>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [unseenCount, setUnseenCount] = useState(0);

  // Scroll automático pro fim quando carrega ou chega nova msg (se já tava perto do fim)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg) return;

    const wasAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    const isInitial = !lastMsgIdRef.current;
    if (lastMsg.id === lastMsgIdRef.current) return;

    if (isInitial || wasAtBottom || lastMsg.fromMe) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
      setUnseenCount(0);
    } else {
      setUnseenCount((n) => n + 1);
    }
    lastMsgIdRef.current = lastMsg.id;
  }, [messages]);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollButton(distance > 240);
    if (distance < 80) setUnseenCount(0);
    if (el.scrollTop < 80 && hasMore && !loadingOlder) {
      const prevHeight = el.scrollHeight;
      loadOlder();
      // Após carregar, manter posição relativa
      requestAnimationFrame(() => {
        const newHeight = el.scrollHeight;
        el.scrollTop = newHeight - prevHeight;
      });
    }
  };

  const groups = useMemo(() => groupMessagesByDay(messages), [messages]);

  const scrollToBottom = () => {
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    setUnseenCount(0);
  };

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '16px 22px',
        background: t.bg,
        position: 'relative',
        minHeight: 0,
      }}
    >
      {hasMore && (
        <div style={{ textAlign: 'center', padding: 8, fontSize: 11, color: t.textFaint }}>
          {loadingOlder ? 'Carregando mensagens antigas…' : 'Role pra cima pra ver mais'}
        </div>
      )}

      {messages.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: t.textSubtle, fontSize: 12 }}>
          Sem mensagens ainda.
        </div>
      ) : (
        groups.map((g) => (
          <div key={g.label}>
            <DayLabel label={g.label} />
            {g.messages.map((m, i) => {
              const prev = g.messages[i - 1];
              const groupStart = !prev || prev.fromMe !== m.fromMe || (new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime()) > 5 * 60 * 1000;
              return <Bubble key={m.id} m={m} groupStart={groupStart} />;
            })}
          </div>
        ))
      )}

      {typing && <TypingIndicator />}

      {showScrollButton && (
        <button
          type="button"
          onClick={scrollToBottom}
          style={{
            position: 'sticky',
            bottom: 8,
            float: 'right',
            marginRight: 4,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            background: t.gold,
            color: '#1a1300',
            border: 'none',
            borderRadius: 999,
            fontSize: 11.5,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: FONT_STACK,
            boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
          }}
        >
          <Icons.ArrowDown s={12} c="#1a1300" />
          {unseenCount > 0 ? `${unseenCount} nova${unseenCount > 1 ? 's' : ''}` : 'Final'}
        </button>
      )}
    </div>
  );
}

function TypingIndicator() {
  const { tokens: t } = useTheme();
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: 8 }}>
      <div
        style={{
          padding: '8px 14px',
          background: t.bgElevated,
          border: `1px solid ${t.border}`,
          borderRadius: 12,
          color: t.textDim,
          fontSize: 11.5,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span>digitando</span>
        <span style={{ display: 'inline-flex', gap: 3 }}>
          <Dot d="0s" />
          <Dot d="0.15s" />
          <Dot d="0.3s" />
        </span>
        <style>{`@keyframes lumen-typing { 0%, 80%, 100% { opacity: 0.3 } 40% { opacity: 1 } }`}</style>
      </div>
    </div>
  );
}

function Dot({ d }: { d: string }) {
  const { tokens: t } = useTheme();
  return (
    <span
      style={{
        width: 4,
        height: 4,
        borderRadius: 999,
        background: t.textDim,
        animation: `lumen-typing 1.2s ease-in-out ${d} infinite`,
      }}
    />
  );
}

function DayLabel({ label }: { label: string }) {
  const { tokens: t } = useTheme();
  return (
    <div style={{ display: 'flex', justifyContent: 'center', margin: '14px 0 10px' }}>
      <span
        style={{
          fontSize: 10.5,
          fontWeight: 500,
          padding: '3px 10px',
          background: t.bgElevated,
          color: t.textSubtle,
          borderRadius: 999,
          border: `1px solid ${t.border}`,
          textTransform: 'capitalize',
        }}
      >
        {label}
      </span>
    </div>
  );
}

function Bubble({ m, groupStart }: { m: Message; groupStart: boolean }) {
  const { tokens: t } = useTheme();
  const own = m.fromMe;
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: own ? 'flex-end' : 'flex-start',
        marginTop: groupStart ? 10 : 2,
      }}
    >
      <div
        style={{
          maxWidth: 'min(560px, 70%)',
          padding: '7px 11px 5px',
          borderRadius: 12,
          background: own ? hexAlpha('#D4AF37', 0.18) : t.bgElevated,
          border: `1px solid ${own ? hexAlpha('#D4AF37', 0.32) : t.border}`,
          color: t.text,
          fontSize: 13,
          lineHeight: 1.45,
          wordBreak: 'break-word',
          whiteSpace: 'pre-wrap',
        }}
      >
        <BubbleBody m={m} />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 4,
            marginTop: 2,
            fontSize: 9.5,
            color: t.textFaint,
          }}
        >
          <span>{formatHour(m.createdAt)}</span>
          {own && <StatusTick status={m.status} />}
        </div>
      </div>
    </div>
  );
}

function BubbleBody({ m }: { m: Message }) {
  const { tokens: t } = useTheme();
  const [lightbox, setLightbox] = useState(false);
  if (m.type === 'TEXT') {
    return <span>{m.content ?? ''}</span>;
  }
  if (m.type === 'IMAGE') {
    return (
      <div>
        {m.mediaUrl ? (
          <>
            <img
              src={`/api${m.mediaUrl}`}
              alt={m.content ?? ''}
              onClick={() => setLightbox(true)}
              style={{
                maxWidth: 280,
                maxHeight: 280,
                borderRadius: 8,
                display: 'block',
                cursor: 'zoom-in',
              }}
            />
            {lightbox && (
              <Lightbox src={`/api${m.mediaUrl}`} alt={m.content ?? ''} onClose={() => setLightbox(false)} />
            )}
          </>
        ) : (
          <span style={{ color: t.textSubtle, fontStyle: 'italic' }}>Baixando imagem…</span>
        )}
        {m.content && <div style={{ marginTop: 4 }}>{m.content}</div>}
      </div>
    );
  }
  if (m.type === 'AUDIO') {
    return (
      <div style={{ minWidth: 180 }}>
        {m.mediaUrl ? (
          <audio controls src={`/api${m.mediaUrl}`} style={{ maxWidth: 240 }} />
        ) : (
          <span style={{ color: t.textSubtle, fontStyle: 'italic' }}>Baixando áudio…</span>
        )}
      </div>
    );
  }
  if (m.type === 'VIDEO') {
    return (
      <div>
        {m.mediaUrl ? (
          <video controls src={`/api${m.mediaUrl}`} style={{ maxWidth: 320, borderRadius: 8 }} />
        ) : (
          <span style={{ color: t.textSubtle, fontStyle: 'italic' }}>Baixando vídeo…</span>
        )}
        {m.content && <div style={{ marginTop: 4 }}>{m.content}</div>}
      </div>
    );
  }
  if (m.type === 'DOCUMENT') {
    return (
      <a
        href={m.mediaUrl ? `/api${m.mediaUrl}` : undefined}
        target="_blank"
        rel="noreferrer"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 8px',
          background: t.bg,
          border: `1px solid ${t.border}`,
          borderRadius: 8,
          color: t.text,
          textDecoration: 'none',
          fontSize: 12,
          maxWidth: 280,
        }}
      >
        <Icons.File s={20} c={t.gold} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {m.mediaName ?? m.content ?? 'Documento'}
          </div>
          {m.mediaSize && <div style={{ fontSize: 10, color: t.textFaint }}>{prettyBytes(m.mediaSize)}</div>}
        </div>
        {m.mediaUrl && <Icons.Download s={14} c={t.textDim} />}
      </a>
    );
  }
  return null;
}

function StatusTick({ status }: { status: Message['status'] }) {
  const { tokens: t } = useTheme();
  if (status === 'FAILED') {
    return <span style={{ color: t.danger }}>!</span>;
  }
  const isRead = status === 'READ';
  const isDelivered = status === 'DELIVERED' || isRead;
  const color = isRead ? '#3b82f6' : t.textFaint;
  if (isDelivered) return <Icons.CheckCheck s={11} c={color} />;
  return <Icons.Check s={11} c={color} />;
}

// ============================================================
// COMPOSER
// ============================================================

function Composer({
  conversationId,
  contactId,
  opportunityId,
  connectionId,
  connectionType,
  windowStatus,
  disabled,
  onSend,
}: {
  conversationId: string;
  contactId?: string;
  opportunityId?: string;
  connectionId: string;
  connectionType: 'OFFICIAL' | 'UNOFFICIAL';
  windowStatus: WindowStatus | null;
  disabled: boolean;
  onSend: (input: SendMessageInput) => Promise<void>;
}) {
  const { tokens: t } = useTheme();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [attached, setAttached] = useState<{
    type: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT';
    url: string;
    name: string;
    mimeType: string;
    size: number;
    previewUrl?: string;
  } | null>(null);
  const [recording, setRecording] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [scriptsOpen, setScriptsOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);

  // Conexões OFFICIAL: se a janela estiver fechada, texto livre fica bloqueado
  // e só templates podem ser enviados.
  const windowClosed =
    connectionType === 'OFFICIAL' && windowStatus?.applicable === true && windowStatus.open === false;
  const composerDisabled = disabled || windowClosed;
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileImgRef = useRef<HTMLInputElement>(null);
  const fileDocRef = useRef<HTMLInputElement>(null);
  const fileVideoRef = useRef<HTMLInputElement>(null);
  const upload = useUploadConversationMedia();
  const attachRef = useRef<HTMLDivElement>(null);
  useClickOutside(attachRef, () => setAttachOpen(false), attachOpen);

  const handlePickScript = (rendered: RenderedScript) => {
    setText((prev) => {
      const sep = prev && !prev.endsWith('\n') ? '\n' : '';
      return prev ? prev + sep + rendered.content : rendered.content;
    });
    if (rendered.mediaUrl && rendered.mediaType) {
      const ext = rendered.mediaUrl.split('/').pop() ?? 'arquivo';
      const mime =
        rendered.mediaType === 'IMAGE'
          ? 'image/jpeg'
          : rendered.mediaType === 'AUDIO'
            ? 'audio/mpeg'
            : rendered.mediaType === 'VIDEO'
              ? 'video/mp4'
              : 'application/octet-stream';
      setAttached({
        type: rendered.mediaType,
        url: rendered.mediaUrl,
        name: ext,
        mimeType: mime,
        size: 0,
        previewUrl: rendered.mediaType === 'IMAGE' ? rendered.mediaUrl : undefined,
      });
    }
    requestAnimationFrame(() => {
      const el = taRef.current;
      if (!el) return;
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
    });
  };

  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(180, el.scrollHeight) + 'px';
  }, [text]);

  // reset ao trocar de conversa
  useEffect(() => {
    setText('');
    setAttached(null);
    setRecording(false);
  }, [conversationId]);

  const pick = async (kind: 'image' | 'video' | 'document') => {
    setAttachOpen(false);
    const ref = kind === 'image' ? fileImgRef : kind === 'video' ? fileVideoRef : fileDocRef;
    ref.current?.click();
  };

  const handleFile = async (file: File, kind: 'IMAGE' | 'VIDEO' | 'DOCUMENT') => {
    try {
      const r = await upload.mutateAsync({ id: conversationId, file });
      const previewUrl = kind === 'IMAGE' ? URL.createObjectURL(file) : undefined;
      setAttached({
        type: kind,
        url: r.url,
        name: r.name,
        mimeType: r.mimeType,
        size: r.size,
        previewUrl,
      });
    } catch (e) {
      toast(axiosMsg(e) || 'Falha ao enviar arquivo', 'error');
    }
  };

  const cancelAttachment = () => {
    if (attached?.previewUrl) URL.revokeObjectURL(attached.previewUrl);
    setAttached(null);
  };

  const handleSend = () => {
    const content = text.trim();
    if (!content && !attached) return;

    const payload: SendMessageInput = attached
      ? {
          type: attached.type,
          content: content || null,
          mediaUrl: attached.url,
          mediaName: attached.name,
          mediaMimeType: attached.mimeType,
        }
      : { type: 'TEXT', content };

    // Limpa o input imediatamente — a mensagem otimista já aparece no chat
    // via onMutate de useSendMessage; o POST roda em segundo plano.
    setText('');
    cancelAttachment();

    void onSend(payload).catch((e) => {
      toast(axiosMsg(e) || 'Falha ao enviar', 'error');
    });
  };

  const handleAudioReady = async (blob: Blob) => {
    setRecording(false);
    setSending(true);
    try {
      const file = new File([blob], `audio-${Date.now()}.webm`, { type: blob.type || 'audio/webm' });
      const r = await upload.mutateAsync({ id: conversationId, file });
      await onSend({
        type: 'AUDIO',
        content: null,
        mediaUrl: r.url,
        mediaName: r.name,
        mediaMimeType: r.mimeType,
      });
    } catch (e) {
      toast(axiosMsg(e) || 'Falha ao enviar áudio', 'error');
    } finally {
      setSending(false);
    }
  };

  const showSend = !!text.trim() || !!attached;

  return (
    <div
      style={{
        flexShrink: 0,
        borderTop: `1px solid ${t.border}`,
        background: t.bgElevated,
        padding: '10px 14px',
      }}
    >
      {disabled && (
        <div style={{ fontSize: 11, color: t.danger, marginBottom: 6 }}>
          ⚠️ Conexão WhatsApp não está ativa — não é possível enviar mensagens agora.
        </div>
      )}

      {windowClosed && !disabled && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 10px',
            background: 'rgba(245,158,11,0.10)',
            border: '1px solid rgba(245,158,11,0.32)',
            borderRadius: 8,
            marginBottom: 8,
            fontSize: 11.5,
            color: t.text,
            position: 'relative',
          }}
        >
          <span style={{ color: '#f59e0b' }}>
            <Icons.Bell s={13} />
          </span>
          <span style={{ flex: 1 }}>
            Janela de 24h fechada. Envie um <strong>template aprovado</strong> pra continuar a
            conversa — o cliente vai poder responder e a janela reabre.
          </span>
          <button
            type="button"
            onClick={() => setTemplatesOpen((v) => !v)}
            style={{
              background: t.gold,
              color: '#1a1300',
              border: 'none',
              borderRadius: 7,
              padding: '6px 12px',
              fontSize: 11.5,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: FONT_STACK,
            }}
          >
            Enviar Template
          </button>
          {templatesOpen && (
            <TemplatePopover
              conversationId={conversationId}
              connectionId={connectionId}
              onClose={() => setTemplatesOpen(false)}
              onSent={() => setTemplatesOpen(false)}
            />
          )}
        </div>
      )}

      {attached && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: 8,
            background: t.bgInput,
            border: `1px solid ${t.border}`,
            borderRadius: 8,
            marginBottom: 8,
          }}
        >
          {attached.type === 'IMAGE' && attached.previewUrl ? (
            <img
              src={attached.previewUrl}
              alt=""
              style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6 }}
            />
          ) : (
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 6,
                background: t.bg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {attached.type === 'DOCUMENT' && <Icons.File s={20} c={t.gold} />}
              {attached.type === 'VIDEO' && <Icons.Play s={20} c={t.gold} />}
              {attached.type === 'AUDIO' && <Icons.Mic s={20} c={t.gold} />}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, color: t.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {attached.name}
            </div>
            <div style={{ fontSize: 10.5, color: t.textFaint }}>{prettyBytes(attached.size)}</div>
          </div>
          <button type="button" onClick={cancelAttachment} aria-label="Remover" style={iconButton(t)}>
            <Icons.X s={14} c={t.textDim} />
          </button>
        </div>
      )}

      {recording ? (
        <AudioRecorderBar
          onCancel={() => setRecording(false)}
          onReady={handleAudioReady}
        />
      ) : (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: 6,
            background: t.bgInput,
            border: `1px solid ${t.border}`,
            borderRadius: 12,
            padding: '6px 8px',
          }}
        >
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              title="Scripts"
              onClick={() => setScriptsOpen((v) => !v)}
              disabled={composerDisabled}
              style={{ ...iconButton(t), opacity: composerDisabled ? 0.4 : 1 }}
            >
              <Icons.AlignLeft s={16} c={scriptsOpen ? t.gold : t.textDim} />
            </button>
            {scriptsOpen && (
              <ScriptsPopover
                contactId={contactId}
                opportunityId={opportunityId}
                onPick={handlePickScript}
                onClose={() => setScriptsOpen(false)}
              />
            )}
          </div>

          {/* Botão "Templates" — sempre visível pra OFFICIAL (atalho mesmo
              com janela aberta), permite enviar template a qualquer momento. */}
          {connectionType === 'OFFICIAL' && (
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                title="Templates"
                onClick={() => setTemplatesOpen((v) => !v)}
                disabled={disabled}
                style={{ ...iconButton(t), opacity: disabled ? 0.4 : 1 }}
              >
                <Icons.ListChecks s={16} c={templatesOpen ? t.gold : t.textDim} />
              </button>
              {templatesOpen && !windowClosed && (
                <TemplatePopover
                  conversationId={conversationId}
                  connectionId={connectionId}
                  onClose={() => setTemplatesOpen(false)}
                  onSent={() => setTemplatesOpen(false)}
                />
              )}
            </div>
          )}

          <div ref={attachRef} style={{ position: 'relative' }}>
            <button
              type="button"
              title="Anexar"
              onClick={() => setAttachOpen((v) => !v)}
              disabled={composerDisabled || upload.isPending}
              style={{ ...iconButton(t), opacity: composerDisabled ? 0.4 : 1 }}
            >
              <Icons.Paperclip s={16} c={t.textDim} />
            </button>
            {attachOpen && (
              <div
                style={{
                  position: 'absolute',
                  bottom: 38,
                  left: 0,
                  background: t.bgElevated,
                  border: `1px solid ${t.border}`,
                  borderRadius: 8,
                  boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
                  padding: 4,
                  minWidth: 170,
                  zIndex: 20,
                }}
              >
                <ActionRow icon={<Icons.Image s={13} c="currentColor" />} label="Imagem" onClick={() => pick('image')} />
                <ActionRow icon={<Icons.Play s={13} c="currentColor" />} label="Vídeo" onClick={() => pick('video')} />
                <ActionRow icon={<Icons.File s={13} c="currentColor" />} label="Documento" onClick={() => pick('document')} />
              </div>
            )}
          </div>

          <input
            ref={fileImgRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f, 'IMAGE');
              e.target.value = '';
            }}
          />
          <input
            ref={fileVideoRef}
            type="file"
            accept="video/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f, 'VIDEO');
              e.target.value = '';
            }}
          />
          <input
            ref={fileDocRef}
            type="file"
            accept="application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain,text/csv,application/zip,application/octet-stream"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f, 'DOCUMENT');
              e.target.value = '';
            }}
          />

          <textarea
            ref={taRef}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={
              disabled
                ? 'Conexão offline'
                : windowClosed
                  ? 'Janela 24h fechada — envie um template'
                  : attached
                    ? 'Adicione uma legenda…'
                    : 'Digite uma mensagem…'
            }
            disabled={composerDisabled || sending}
            style={{
              flex: 1,
              border: 'none',
              background: 'transparent',
              outline: 'none',
              resize: 'none',
              color: t.text,
              fontSize: 13,
              fontFamily: FONT_STACK,
              lineHeight: 1.4,
              padding: '6px 4px',
              maxHeight: 180,
            }}
          />

          {showSend ? (
            <button
              type="button"
              onClick={handleSend}
              disabled={composerDisabled || sending}
              title="Enviar"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 34,
                height: 34,
                border: 'none',
                borderRadius: 8,
                background: t.gold,
                color: '#1a1300',
                cursor: 'pointer',
                opacity: sending ? 0.6 : 1,
              }}
            >
              <Icons.Send s={15} c="#1a1300" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setRecording(true)}
              disabled={composerDisabled}
              title="Gravar áudio"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 34,
                height: 34,
                border: 'none',
                borderRadius: 8,
                background: t.bgInput,
                color: t.textDim,
                cursor: composerDisabled ? 'not-allowed' : 'pointer',
                opacity: composerDisabled ? 0.4 : 1,
              }}
            >
              <Icons.Mic s={15} c={t.textDim} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// AUDIO RECORDER
// ============================================================

function AudioRecorderBar({
  onCancel,
  onReady,
}: {
  onCancel: () => void;
  onReady: (blob: Blob) => void;
}) {
  const { tokens: t } = useTheme();
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef<number>(Date.now());
  const [elapsed, setElapsed] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Inicia gravação
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const mime =
          MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus'
            : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
              ? 'audio/ogg;codecs=opus'
              : '';
        const mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
        recorderRef.current = mr;
        chunksRef.current = [];
        mr.ondataavailable = (ev) => {
          if (ev.data.size > 0) chunksRef.current.push(ev.data);
        };
        mr.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
          setPreviewBlob(blob);
          setPreviewUrl(URL.createObjectURL(blob));
        };
        mr.start();
        startedAtRef.current = Date.now();
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Falha ao acessar microfone';
        setError(msg);
      }
    })();
    return () => {
      cancelled = true;
      const mr = recorderRef.current;
      if (mr && mr.state !== 'inactive') {
        try {
          mr.stop();
        } catch {
          /* ignore */
        }
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  // Timer
  useEffect(() => {
    if (previewUrl) return;
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
    }, 250);
    return () => clearInterval(id);
  }, [previewUrl]);

  // Limpeza de URL ao desmontar
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const stopRecording = () => {
    const mr = recorderRef.current;
    if (mr && mr.state !== 'inactive') {
      mr.stop();
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const handleSend = () => {
    if (!previewBlob) return;
    onReady(previewBlob);
  };

  if (error) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: t.bgInput,
          border: `1px solid ${t.danger}`,
          borderRadius: 12,
          padding: '8px 12px',
          fontSize: 12,
          color: t.danger,
        }}
      >
        <span style={{ flex: 1 }}>⚠️ {error}</span>
        <button type="button" onClick={onCancel} style={iconButton(t)}>
          <Icons.X s={14} c={t.textDim} />
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        background: t.bgInput,
        border: `1px solid ${t.border}`,
        borderRadius: 12,
        padding: '6px 8px 6px 12px',
      }}
    >
      <button type="button" onClick={onCancel} title="Cancelar" style={iconButton(t)}>
        <Icons.Trash s={14} c={t.danger} />
      </button>

      {previewUrl ? (
        <>
          <audio src={previewUrl} controls style={{ flex: 1, height: 32 }} />
          <button
            type="button"
            onClick={handleSend}
            title="Enviar áudio"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 34,
              height: 34,
              border: 'none',
              borderRadius: 8,
              background: t.gold,
              color: '#1a1300',
              cursor: 'pointer',
            }}
          >
            <Icons.Send s={15} c="#1a1300" />
          </button>
        </>
      ) : (
        <>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: t.danger,
                animation: 'lumen-rec 1s ease-in-out infinite',
              }}
            />
            <span style={{ fontSize: 12, color: t.text, fontVariantNumeric: 'tabular-nums' }}>
              {formatDuration(elapsed)}
            </span>
          </span>
          <span style={{ flex: 1, fontSize: 11, color: t.textSubtle }}>Gravando…</span>
          <button
            type="button"
            onClick={stopRecording}
            title="Parar"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 34,
              height: 34,
              border: 'none',
              borderRadius: 8,
              background: t.gold,
              color: '#1a1300',
              cursor: 'pointer',
            }}
          >
            <Icons.Check s={15} c="#1a1300" />
          </button>
        </>
      )}
      <style>{`@keyframes lumen-rec { 0%, 100% { opacity: 1 } 50% { opacity: 0.3 } }`}</style>
    </div>
  );
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ============================================================
// RIGHT PANEL — LEAD INFO
// ============================================================

function RightPanel({
  detail,
  meId: _meId,
  isAdmin: _isAdmin,
}: {
  detail: NonNullable<ReturnType<typeof useConversation>['data']>;
  meId: string | null;
  isAdmin: boolean;
}) {
  const { tokens: t } = useTheme();
  const [openOpp, setOpenOpp] = useState<string | null>(null);
  const [creatingOpp, setCreatingOpp] = useState(false);
  const navigate = useNavigate();

  const opp = detail.activeOpportunity;

  return (
    <>
      <aside
        style={{
          width: 320,
          flexShrink: 0,
          borderLeft: `1px solid ${t.border}`,
          background: t.bgElevated,
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
          minHeight: 0,
        }}
      >
        <div
          style={{
            padding: '20px 18px',
            borderBottom: `1px solid ${t.border}`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 10,
            textAlign: 'center',
          }}
        >
          <Avatar name={detail.contact.name} size={64} url={detail.contact.avatar} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: t.text }}>{detail.contact.name}</div>
            <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 2 }}>
              {detail.contact.phoneFormatted}
            </div>
            {detail.contact.email && (
              <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 2 }}>{detail.contact.email}</div>
            )}
          </div>
          <button
            type="button"
            onClick={() => navigate(`/leads?focus=${detail.contact.id}`)}
            style={buttonGhost(t)}
          >
            <Icons.Edit s={11} c={t.text} /> Editar contato
          </button>
        </div>

        {detail.contact.tags.length > 0 && (
          <Section label="Tags">
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {detail.contact.tags.map((tag) => (
                <span
                  key={tag.id}
                  style={{
                    background: hexAlpha(tag.color, 0.18),
                    color: tag.color,
                    padding: '3px 10px',
                    borderRadius: 999,
                    fontSize: 10.5,
                    fontWeight: 600,
                  }}
                >
                  {tag.name}
                </span>
              ))}
            </div>
          </Section>
        )}

        <Section label="Oportunidade ativa">
          {opp ? (
            <div
              style={{
                padding: 12,
                border: `1px solid ${t.border}`,
                borderRadius: 10,
                background: t.bg,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: opp.stageColor,
                  }}
                />
                <span style={{ fontSize: 11, color: t.textDim }}>
                  {opp.pipelineName} · {opp.stageName}
                </span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{opp.title}</div>
              <div style={{ fontSize: 12, color: t.textSubtle }}>
                {opp.value > 0 ? formatBRL(opp.value) : 'Sem valor'}
              </div>
              <button
                type="button"
                onClick={() => setOpenOpp(opp.id)}
                style={{ ...buttonGold(t), padding: '6px 10px', fontSize: 11.5, marginTop: 4 }}
              >
                Ver oportunidade completa
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCreatingOpp(true)}
              style={{
                width: '100%',
                padding: '14px 12px',
                border: `1px dashed ${t.border}`,
                borderRadius: 10,
                background: 'transparent',
                color: t.textDim,
                fontSize: 12,
                cursor: 'pointer',
                fontFamily: FONT_STACK,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              <Icons.Plus s={12} c={t.textDim} /> Criar oportunidade
            </button>
          )}
        </Section>

        <ContactCadencesSection contactId={detail.contact.id} />

        {detail.nextReminder && (
          <Section label="Próximo lembrete">
            <div
              style={{
                padding: 10,
                background: t.bg,
                border: `1px solid ${t.border}`,
                borderRadius: 8,
              }}
            >
              <div style={{ fontSize: 12.5, color: t.text, fontWeight: 500 }}>{detail.nextReminder.title}</div>
              <div style={{ fontSize: 10.5, color: t.textSubtle, marginTop: 2 }}>
                {relativeTime(detail.nextReminder.dueAt)}
              </div>
            </div>
          </Section>
        )}

        {detail.recentHistory.length > 0 && (
          <Section label="Últimas movimentações">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {detail.recentHistory.map((h) => (
                <div key={h.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <Icons.Dot s={6} c={t.textFaint} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11.5, color: t.text }}>{labelHistoryAction(h.action)}</div>
                    <div style={{ fontSize: 10, color: t.textFaint }}>
                      {relativeTime(h.createdAt)}
                      {h.userName ? ` · ${h.userName}` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {detail.assignee && (
          <Section label="Responsável">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar name={detail.assignee.name} size={28} />
              <div style={{ fontSize: 12.5, color: t.text }}>{detail.assignee.name}</div>
            </div>
          </Section>
        )}
      </aside>

      {openOpp && <OpportunityPopup opportunityId={openOpp} onClose={() => setOpenOpp(null)} />}

      {creatingOpp && (
        <CreateOpportunityModal
          conversationId={detail.id}
          contactName={detail.contact.name}
          onClose={() => setCreatingOpp(false)}
          onCreated={(id) => {
            setCreatingOpp(false);
            setOpenOpp(id);
          }}
        />
      )}
    </>
  );
}

// Mostra cadências ativas/pausadas pra esse contato + botão pausar/retomar inline.
function ContactCadencesSection({ contactId }: { contactId: string }) {
  const { tokens: t } = useTheme();
  const { data, isLoading } = useContactCadences(contactId);
  const pause = usePauseExecution();
  const resume = useResumeExecution();

  if (isLoading) return null;
  if (!data || data.length === 0) return null;

  return (
    <Section label="Cadências">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {data.map((ex) => {
          const total = ex.cadence?.messages?.length ?? 0;
          const isPaused = ex.status === 'PAUSED';
          return (
            <div
              key={ex.id}
              style={{
                padding: 10,
                borderRadius: 8,
                background: t.bg,
                border: `1px solid ${t.border}`,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <div style={{ fontSize: 12, color: t.text, fontWeight: 600 }}>
                {ex.cadence?.name ?? 'Cadência'}
              </div>
              <div style={{ fontSize: 11, color: t.textDim }}>
                Passo {ex.currentStep + 1}/{total}
                {' · '}
                {isPaused ? `Pausada${ex.pauseReason ? ` (${ex.pauseReason})` : ''}` : 'Ativa'}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                {isPaused ? (
                  <button
                    type="button"
                    onClick={() => resume.mutateAsync(ex.id).then(() => toast('Retomada', 'success'))}
                    style={{
                      padding: '4px 8px',
                      fontSize: 11,
                      borderRadius: 6,
                      background: t.bgInput,
                      color: t.text,
                      border: `1px solid ${t.border}`,
                      cursor: 'pointer',
                    }}
                  >
                    Retomar
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => pause.mutateAsync(ex.id).then(() => toast('Pausada', 'success'))}
                    style={{
                      padding: '4px 8px',
                      fontSize: 11,
                      borderRadius: 6,
                      background: t.bgInput,
                      color: t.text,
                      border: `1px solid ${t.border}`,
                      cursor: 'pointer',
                    }}
                  >
                    Pausar
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  const { tokens: t } = useTheme();
  return (
    <div style={{ padding: '14px 18px', borderBottom: `1px solid ${t.border}` }}>
      <div
        style={{
          fontSize: 10,
          letterSpacing: 1,
          textTransform: 'uppercase',
          color: t.textFaint,
          fontWeight: 500,
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

// ============================================================
// CREATE OPPORTUNITY MODAL
// ============================================================

function CreateOpportunityModal({
  conversationId,
  contactName,
  onClose,
  onCreated,
}: {
  conversationId: string;
  contactName: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { tokens: t } = useTheme();
  const create = useCreateOpportunityFromConversation();
  const pipelines = usePipelines();
  const [pipelineId, setPipelineId] = useState('');
  const [stageId, setStageId] = useState('');
  const [title, setTitle] = useState(`Oportunidade — ${contactName}`);
  const [value, setValue] = useState('0');
  const [error, setError] = useState<string | null>(null);
  const pipeline = usePipeline(pipelineId || null);

  useEffect(() => {
    if (!pipelineId && pipelines.data && pipelines.data.length > 0) {
      const first = pipelines.data.find((p) => p.active) ?? pipelines.data[0];
      if (first) setPipelineId(first.id);
    }
  }, [pipelines.data, pipelineId]);

  useEffect(() => {
    if (pipeline.data) {
      const first = pipeline.data.stages[0];
      if (first && !pipeline.data.stages.some((s) => s.id === stageId)) {
        setStageId(first.id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipelineId, pipeline.data?.id]);

  const submit = async () => {
    setError(null);
    if (!title.trim()) return setError('Informe o título');
    if (!pipelineId || !stageId) return setError('Escolha funil e etapa');
    try {
      const r = await create.mutateAsync({
        id: conversationId,
        title: title.trim(),
        pipelineId,
        stageId,
        value: Number(value) || 0,
      });
      toast('Oportunidade criada', 'success');
      onCreated(r.id);
    } catch (e) {
      setError(axiosMsg(e) || 'Falha ao criar');
    }
  };

  return (
    <Modal open onClose={onClose} title="Criar oportunidade" width={460}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Título *">
          <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle(t)} autoFocus />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Funil *">
            <select
              value={pipelineId}
              onChange={(e) => setPipelineId(e.target.value)}
              style={{ ...inputStyle(t), cursor: 'pointer' }}
            >
              <option value="">— escolha —</option>
              {pipelines.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Etapa *">
            <select
              value={stageId}
              onChange={(e) => setStageId(e.target.value)}
              style={{ ...inputStyle(t), cursor: 'pointer' }}
              disabled={!pipeline.data}
            >
              <option value="">— escolha —</option>
              {pipeline.data?.stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Valor (R$)">
          <input
            type="number"
            min={0}
            step={0.01}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            style={inputStyle(t)}
          />
        </Field>
        {error && (
          <div
            style={{
              fontSize: 12,
              background: 'rgba(248,81,73,0.08)',
              border: `1px solid rgba(248,81,73,0.32)`,
              color: t.danger,
              padding: '8px 11px',
              borderRadius: 7,
            }}
          >
            {error}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onClose} style={buttonGhost(t)}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={create.isPending}
            style={{ ...buttonGold(t), opacity: create.isPending ? 0.6 : 1 }}
          >
            {create.isPending ? 'Criando…' : 'Criar oportunidade'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ============================================================
// PRIMITIVES
// ============================================================

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const { tokens: t } = useTheme();
  return (
    <div>
      <label
        style={{
          display: 'block',
          fontSize: 11,
          letterSpacing: 0.4,
          textTransform: 'uppercase',
          color: t.textSubtle,
          marginBottom: 6,
          fontWeight: 500,
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function Avatar({ name, size = 32, url }: { name: string; size?: number; url?: string | null }) {
  const [broken, setBroken] = useState(false);
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
  if (url && !broken) {
    return (
      <img
        src={url}
        alt={name}
        onError={() => setBroken(true)}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          flexShrink: 0,
          background: '#222',
        }}
      />
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #D4AF37 0%, #8a6c17 100%)',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.36,
        fontWeight: 600,
        flexShrink: 0,
      }}
    >
      {initials || '··'}
    </div>
  );
}

function iconButton(t: ReturnType<typeof useTheme>['tokens']): CSSProperties {
  return {
    background: 'transparent',
    border: 'none',
    width: 34,
    height: 34,
    borderRadius: 7,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    color: t.textDim,
  };
}

function buttonGold(t: ReturnType<typeof useTheme>['tokens']): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    background: t.gold,
    color: '#1a1300',
    border: 'none',
    borderRadius: 8,
    padding: '7px 12px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: FONT_STACK,
  };
}

function buttonGhost(t: ReturnType<typeof useTheme>['tokens']): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    background: 'transparent',
    color: t.text,
    border: `1px solid ${t.border}`,
    borderRadius: 8,
    padding: '5px 10px',
    fontSize: 11.5,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: FONT_STACK,
  };
}

function inputStyle(t: ReturnType<typeof useTheme>['tokens']): CSSProperties {
  return {
    width: '100%',
    background: t.bgInput,
    border: `1px solid ${t.border}`,
    borderRadius: 8,
    padding: '9px 12px',
    fontSize: 13,
    color: t.text,
    outline: 'none',
    fontFamily: FONT_STACK,
  };
}

// ============================================================
// HELPERS
// ============================================================

function useClickOutside(
  ref: React.RefObject<HTMLElement | null>,
  cb: () => void,
  active: boolean,
) {
  useEffect(() => {
    if (!active) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) cb();
    };
    const id = setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener('mousedown', handler);
    };
  }, [active, cb, ref]);
}

function relativeTime(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function formatHour(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function groupMessagesByDay(messages: Message[]): { label: string; messages: Message[] }[] {
  const groups: { label: string; messages: Message[] }[] = [];
  for (const m of messages) {
    const label = dayLabel(m.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.messages.push(m);
    else groups.push({ label, messages: [m] });
  }
  return groups;
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const ymdMsg = new Date(d).setHours(0, 0, 0, 0);
  const dayMs = 24 * 60 * 60 * 1000;
  const diffDays = Math.round((today.getTime() - ymdMsg) / dayMs);
  if (diffDays === 0) return 'Hoje';
  if (diffDays === 1) return 'Ontem';
  if (diffDays < 7) return d.toLocaleDateString('pt-BR', { weekday: 'long' });
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function prettyBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function hexAlpha(hex: string, alpha: number): string {
  const m = hex.match(/^#?([0-9A-Fa-f]{6})$/);
  if (!m) return `rgba(128,128,128,${alpha})`;
  const v = m[1]!;
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function labelHistoryAction(action: string): string {
  const map: Record<string, string> = {
    CREATED: 'Oportunidade criada',
    STAGE_CHANGE: 'Mudou de etapa',
    FIELD_UPDATE: 'Campo atualizado',
    TAG_ADDED: 'Tag adicionada',
    TAG_REMOVED: 'Tag removida',
    OWNER_CHANGED: 'Responsável alterado',
    VALUE_CHANGED: 'Valor alterado',
    PRIORITY_CHANGED: 'Prioridade alterada',
    CLOSED_WON: 'Fechada ganha',
    CLOSED_LOST: 'Fechada perdida',
    REOPENED: 'Reaberta',
    FILE_UPLOADED: 'Arquivo enviado',
    FILE_DELETED: 'Arquivo removido',
    REMINDER_CREATED: 'Lembrete criado',
    REMINDER_COMPLETED: 'Lembrete concluído',
    DESCRIPTION_UPDATED: 'Descrição atualizada',
  };
  return map[action] ?? action;
}

function axiosMsg(e: unknown): string | null {
  return axios.isAxiosError(e) ? (e.response?.data?.message ?? null) : null;
}

// ============================================================
// LIGHTBOX
// ============================================================

function Lightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return createPortal(
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Visualizar imagem"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.85)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'zoom-out',
      }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Fechar"
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.12)',
          border: 'none',
          color: '#fff',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icons.X s={18} c="#fff" />
      </button>
      <img
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '92vw',
          maxHeight: '92vh',
          objectFit: 'contain',
          borderRadius: 8,
          cursor: 'default',
        }}
      />
    </div>,
    document.body,
  );
}
