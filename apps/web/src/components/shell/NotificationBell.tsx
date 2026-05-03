import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../lib/ThemeContext';
import { Icons } from '../icons';
import { FONT_STACK } from '../../lib/theme';
import {
  useMarkAllSeen,
  useMarkSeen,
  useNotifications,
  usePendingCount,
  type Reminder,
} from '../../hooks/useReminders';

export function NotificationBell() {
  const { tokens: t } = useTheme();
  const navigate = useNavigate();
  const pending = usePendingCount();
  const notifications = useNotifications();
  const markSeen = useMarkSeen();
  const markAllSeen = useMarkAllSeen();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  // Recalcula posição do popover (fixed) a partir do botão. Renderizamos via
  // portal pra escapar do stacking context do Header (que tem z-index baixo
  // intencionalmente, pra modais ficarem por cima).
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const id = setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener('mousedown', handler);
    };
  }, [open]);

  const count = pending.data ?? 0;
  const items = notifications.data ?? [];

  const handleItemClick = async (n: Reminder) => {
    setOpen(false);
    if (!n.seenAt) {
      try {
        await markSeen.mutateAsync(n.id);
      } catch {
        /* ignore */
      }
    }
    navigate(`/pipeline?opp=${n.opportunityId}`);
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        ref={buttonRef}
        onClick={() => setOpen((v) => !v)}
        title="Notificações"
        style={{
          position: 'relative',
          width: 32,
          height: 32,
          border: `1px solid ${open ? t.borderStrong : t.border}`,
          background: open ? t.bgHover : 'transparent',
          borderRadius: 7,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          transition: 'all 120ms ease',
        }}
        onMouseEnter={(e) => {
          if (!open) e.currentTarget.style.background = t.bgHover;
        }}
        onMouseLeave={(e) => {
          if (!open) e.currentTarget.style.background = 'transparent';
        }}
      >
        <Icons.Bell s={14} c={count > 0 ? t.gold : t.icon} />
        {count > 0 && (
          <span
            style={{
              position: 'absolute',
              top: -4,
              right: -4,
              minWidth: 16,
              height: 16,
              padding: '0 4px',
              borderRadius: 8,
              background: t.gold,
              color: '#0a0a0a',
              fontSize: 10,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: `2px solid ${t.bg}`,
            }}
          >
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && pos &&
        createPortal(
        <div
          ref={popoverRef}
          style={{
            position: 'fixed',
            top: pos.top,
            right: pos.right,
            width: 400,
            maxHeight: 500,
            background: t.bgElevated,
            border: `1px solid ${t.border}`,
            borderRadius: 12,
            boxShadow: '0 14px 40px rgba(0,0,0,0.3)',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 1000,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 14px',
              borderBottom: `1px solid ${t.border}`,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600, color: t.text }}>Notificações</span>
            {items.length > 0 && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    await markAllSeen.mutateAsync();
                  } catch {
                    /* ignore */
                  }
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: t.gold,
                  fontSize: 11.5,
                  cursor: 'pointer',
                  fontFamily: FONT_STACK,
                }}
              >
                marcar todas como lidas
              </button>
            )}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', maxHeight: 380 }}>
            {items.length === 0 ? (
              <div
                style={{
                  padding: 28,
                  textAlign: 'center',
                  color: t.textSubtle,
                  fontSize: 12.5,
                }}
              >
                <div style={{ fontSize: 26, marginBottom: 6 }}>✓</div>
                Tudo em dia!
              </div>
            ) : (
              items.slice(0, 10).map((n) => (
                <NotificationItem key={n.id} reminder={n} onClick={() => handleItemClick(n)} />
              ))
            )}
          </div>

          <div
            style={{
              padding: 8,
              borderTop: `1px solid ${t.border}`,
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                navigate('/reminders');
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: t.text,
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: FONT_STACK,
                padding: '7px 10px',
                borderRadius: 6,
                width: '100%',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = t.bgHover)}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              Ver todos os lembretes
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

function NotificationItem({ reminder, onClick }: { reminder: Reminder; onClick: () => void }) {
  const { tokens: t } = useTheme();
  const [hover, setHover] = useState(false);
  const isUnseen = !reminder.seenAt;
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        width: '100%',
        padding: '11px 14px',
        background: hover ? t.bgHover : 'transparent',
        border: 'none',
        borderBottom: `1px solid ${t.border}`,
        cursor: 'pointer',
        textAlign: 'left',
        fontFamily: FONT_STACK,
        position: 'relative',
      }}
    >
      <div style={{ flexShrink: 0, marginTop: 2 }}>
        <Icons.Bell s={13} c={reminder.overdue ? t.danger : t.gold} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12.5,
            color: t.text,
            fontWeight: 500,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {reminder.title}
        </div>
        {reminder.opportunity && (
          <div
            style={{
              fontSize: 11,
              color: t.textSubtle,
              marginTop: 2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {reminder.opportunity.contactName} — {reminder.opportunity.title}
          </div>
        )}
        <div
          style={{
            fontSize: 10.5,
            color: reminder.overdue ? t.danger : t.textFaint,
            marginTop: 3,
          }}
        >
          {relative(reminder.effectiveDueAt)}
        </div>
      </div>
      {isUnseen && (
        <span
          style={{
            position: 'absolute',
            right: 12,
            top: 14,
            width: 7,
            height: 7,
            borderRadius: 999,
            background: t.gold,
          }}
        />
      )}
    </button>
  );
}

function relative(iso: string): string {
  const d = new Date(iso);
  const diff = d.getTime() - Date.now();
  const abs = Math.abs(diff);
  const future = diff > 0;
  const mins = Math.floor(abs / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return future ? `em ${mins}m` : `há ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return future ? `em ${hours}h` : `há ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return future ? `em ${days}d` : `há ${days}d`;
  return d.toLocaleDateString('pt-BR');
}
