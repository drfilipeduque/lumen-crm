// Lista de conversas dessa conexão com status da janela de 24h.

import { useMemo, useState, type CSSProperties } from 'react';
import { useTheme } from '../../../lib/ThemeContext';
import { Icons } from '../../../components/icons';
import { FONT_STACK } from '../../../lib/theme';
import { useConversationsList, type ConversationListItem } from '../../../hooks/useConversations';

type Filter = 'all' | 'closing' | 'closed';

export function WindowTab({ connectionId }: { connectionId: string }) {
  const { tokens: t } = useTheme();
  const list = useConversationsList({ connectionId, status: 'OPEN', limit: 100 });
  const [filter, setFilter] = useState<Filter>('all');

  const enriched = useMemo(() => {
    const items = list.data?.data ?? [];
    return items.map((c) => ({ conv: c, win: windowOf(c) }));
  }, [list.data]);

  const filtered = useMemo(() => {
    if (filter === 'all') return enriched;
    if (filter === 'closing') return enriched.filter((e) => e.win.open && e.win.hoursRemaining <= 2);
    return enriched.filter((e) => !e.win.open);
  }, [enriched, filter]);

  return (
    <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
          Todas ({enriched.length})
        </FilterChip>
        <FilterChip active={filter === 'closing'} onClick={() => setFilter('closing')}>
          Fechando em breve
        </FilterChip>
        <FilterChip active={filter === 'closed'} onClick={() => setFilter('closed')}>
          Fechadas
        </FilterChip>
      </div>

      {list.isLoading ? (
        <div style={{ color: t.textDim, fontSize: 12.5 }}>Carregando…</div>
      ) : filtered.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: 40,
            background: t.bgElevated,
            border: `1px dashed ${t.border}`,
            borderRadius: 10,
            fontSize: 13,
            color: t.textSubtle,
          }}
        >
          Nenhuma conversa nesse filtro.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.map((e) => (
            <WindowRow key={e.conv.id} conv={e.conv} win={e.win} />
          ))}
        </div>
      )}
    </div>
  );
}

function WindowRow({ conv, win }: { conv: ConversationListItem; win: WinInfo }) {
  const { tokens: t } = useTheme();
  return (
    <div
      style={{
        padding: '10px 14px',
        background: t.bgElevated,
        border: `1px solid ${win.severity === 'warn' ? hexAlpha('#f59e0b', 0.4) : t.border}`,
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          background: t.bgInput,
          color: t.textDim,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          fontWeight: 600,
          flexShrink: 0,
        }}
      >
        {initials(conv.contactName)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{conv.contactName}</div>
        <div style={{ fontSize: 11, color: t.textSubtle }}>
          Última msg: {conv.lastMessageAt ? relative(conv.lastMessageAt) : '—'}
        </div>
      </div>
      <span
        style={{
          fontSize: 10.5,
          padding: '4px 9px',
          borderRadius: 999,
          background: hexAlpha(win.color, 0.15),
          color: win.color,
          fontWeight: 600,
          letterSpacing: 0.4,
          textTransform: 'uppercase',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
        }}
      >
        <Icons.Bell s={10} />
        {win.label}
      </span>
    </div>
  );
}

// =====================================================================
// HELPERS
// =====================================================================

type WinInfo = { open: boolean; label: string; hoursRemaining: number; severity: 'ok' | 'warn' | 'closed'; color: string };

function windowOf(c: ConversationListItem): WinInfo {
  if (!c.windowExpiresAt) return { open: false, label: 'Sem msgs', hoursRemaining: 0, severity: 'closed', color: '#94a3b8' };
  const ms = new Date(c.windowExpiresAt).getTime() - Date.now();
  if (ms <= 0) return { open: false, label: 'Janela fechada', hoursRemaining: 0, severity: 'closed', color: '#f85149' };
  const hours = ms / 3_600_000;
  if (hours <= 2) return { open: true, label: `Fecha em ${formatHours(hours)}`, hoursRemaining: hours, severity: 'warn', color: '#f59e0b' };
  return { open: true, label: `Aberta — ${formatHours(hours)}`, hoursRemaining: hours, severity: 'ok', color: '#22c55e' };
}

function formatHours(h: number): string {
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}min`;
  return `${Math.round(h)}h`;
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  const { tokens: t } = useTheme();
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '6px 12px',
        background: active ? t.gold : 'transparent',
        color: active ? '#1a1300' : t.textDim,
        border: `1px solid ${active ? t.gold : t.border}`,
        borderRadius: 999,
        fontSize: 11.5,
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: FONT_STACK,
      }}
    >
      {children}
    </button>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '··';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function relative(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `há ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `há ${days}d`;
  return d.toLocaleDateString('pt-BR');
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

// for satisfies-style style helper if needed
export const _styleHelper: CSSProperties = {};
