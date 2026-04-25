import { useMemo, useState, type CSSProperties } from 'react';
import { useMatch, useNavigate } from 'react-router-dom';
import { useTheme } from '../../lib/ThemeContext';
import { Icons, type IconName } from '../icons';
import { useUnreadTotal } from '../../hooks/useConversations';
import { usePendingCount } from '../../hooks/useReminders';

export type NavItem = {
  path: string;
  label: string;
  icon: IconName;
  badge?: number;
};

export const NAV_ITEMS: NavItem[] = [
  { path: '/dashboard', label: 'Dashboard', icon: 'Home' },
  { path: '/pipeline', label: 'Pipeline', icon: 'Pipeline' },
  { path: '/conversations', label: 'Conversas', icon: 'Chat' },
  { path: '/leads', label: 'Leads', icon: 'Users' },
  { path: '/reminders', label: 'Lembretes', icon: 'Bell' },
  { path: '/automations', label: 'Automações', icon: 'Bolt' },
  { path: '/whatsapp', label: 'WhatsApp', icon: 'Phone' },
  { path: '/settings', label: 'Configurações', icon: 'Gear' },
];

function LumenMark({ collapsed }: { collapsed: boolean }) {
  const { tokens: t } = useTheme();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
      <svg width="24" height="24" viewBox="0 0 26 26" fill="none" style={{ flexShrink: 0 }}>
        <circle cx="13" cy="13" r="11" stroke={t.text} strokeWidth="1.5" />
        <circle cx="13" cy="13" r="4.5" fill="#D4AF37" />
      </svg>
      {!collapsed && (
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: -0.2,
            color: t.text,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
          }}
        >
          Lumen <span style={{ fontWeight: 400, color: t.textSubtle }}>CRM</span>
        </div>
      )}
    </div>
  );
}

function NavButton({
  item,
  collapsed,
  onClick,
  forceActive,
}: {
  item: NavItem;
  collapsed: boolean;
  onClick?: () => void;
  // Quando o item não tem rota (ex.: "Ajuda"), permite forçar o estado.
  forceActive?: boolean;
}) {
  const { tokens: t } = useTheme();
  const navigate = useNavigate();
  const match = useMatch({ path: item.path, end: false });
  const active = forceActive ?? !!match;
  const [hover, setHover] = useState(false);
  const Icon = Icons[item.icon];
  const iconColor = active ? t.gold : hover ? t.text : t.icon;

  const style: CSSProperties = {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: 11,
    width: '100%',
    height: 34,
    padding: collapsed ? 0 : '0 10px',
    justifyContent: collapsed ? 'center' : 'flex-start',
    borderRadius: 7,
    border: 'none',
    background: active ? t.bgActive : hover ? t.bgHover : 'transparent',
    color: active ? t.text : hover ? t.text : t.textDim,
    fontSize: 13,
    fontWeight: active ? 500 : 400,
    letterSpacing: -0.05,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'background 120ms ease, color 120ms ease',
  };

  const handleClick = () => {
    if (onClick) onClick();
    else navigate(item.path);
  };

  return (
    <button
      onClick={handleClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={collapsed ? item.label : undefined}
      style={style}
    >
      {active && !collapsed && (
        <div
          style={{
            position: 'absolute',
            left: -8,
            top: 7,
            bottom: 7,
            width: 2,
            borderRadius: 2,
            background: t.gold,
          }}
        />
      )}
      <Icon s={16} c={iconColor} />
      {!collapsed && (
        <>
          <span style={{ flex: 1, textAlign: 'left' }}>{item.label}</span>
          {item.badge != null && (
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 500,
                minWidth: 18,
                height: 18,
                padding: '0 5px',
                borderRadius: 9,
                background: active ? t.gold : t.bgHover,
                color: active ? '#0a0a0a' : t.textDim,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                letterSpacing: 0,
              }}
            >
              {item.badge}
            </span>
          )}
        </>
      )}
      {collapsed && item.badge != null && (
        <div
          style={{
            position: 'absolute',
            top: 5,
            right: 8,
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: t.gold,
            border: `1.5px solid ${t.bgSidebar}`,
          }}
        />
      )}
    </button>
  );
}

export function Sidebar({
  collapsed,
  setCollapsed,
}: {
  collapsed: boolean;
  setCollapsed: (next: boolean | ((v: boolean) => boolean)) => void;
}) {
  const { tokens: t } = useTheme();
  const width = collapsed ? 60 : 240;
  const unread = useUnreadTotal();
  const pendingReminders = usePendingCount();

  const items = useMemo<NavItem[]>(
    () =>
      NAV_ITEMS.map((item) => {
        if (item.path === '/conversations' && unread.data && unread.data > 0) {
          return { ...item, badge: unread.data };
        }
        if (item.path === '/reminders' && pendingReminders.data && pendingReminders.data > 0) {
          return { ...item, badge: pendingReminders.data };
        }
        return item;
      }),
    [unread.data, pendingReminders.data],
  );

  return (
    <aside
      style={{
        width,
        flexShrink: 0,
        background: t.bgSidebar,
        borderRight: `1px solid ${t.border}`,
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 180ms ease',
      }}
    >
      <div
        style={{
          height: 56,
          flexShrink: 0,
          padding: collapsed ? 0 : '0 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-start',
          borderBottom: `1px solid ${t.border}`,
        }}
      >
        <LumenMark collapsed={collapsed} />
      </div>

      {!collapsed ? (
        <div
          style={{
            padding: '18px 18px 8px',
            fontSize: 10.5,
            fontWeight: 500,
            letterSpacing: 1,
            textTransform: 'uppercase',
            color: t.textFaint,
          }}
        >
          Workspace
        </div>
      ) : (
        <div style={{ height: 18 }} />
      )}

      <nav
        style={{
          flex: 1,
          padding: collapsed ? '0 10px' : '0 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          overflowY: 'auto',
        }}
      >
        {items.map((item) => (
          <NavButton key={item.path} item={item} collapsed={collapsed} />
        ))}
      </nav>

      <div
        style={{
          borderTop: `1px solid ${t.border}`,
          padding: collapsed ? '10px' : '10px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <NavButton
          item={{ path: '#help', label: 'Ajuda & Suporte', icon: 'Help' }}
          collapsed={collapsed}
          onClick={() => {}}
          forceActive={false}
        />
        <button
          onClick={() => setCollapsed((v) => !v)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            width: '100%',
            height: 32,
            padding: collapsed ? 0 : '0 10px',
            justifyContent: collapsed ? 'center' : 'flex-start',
            border: 'none',
            background: 'transparent',
            color: t.textSubtle,
            fontSize: 12,
            cursor: 'pointer',
            fontFamily: 'inherit',
            borderRadius: 7,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = t.bgHover)}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          {collapsed ? (
            <Icons.ChevronR s={14} c={t.textSubtle} />
          ) : (
            <>
              <Icons.ChevronL s={14} c={t.textSubtle} />
              <span>Recolher</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
