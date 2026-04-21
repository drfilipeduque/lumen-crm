import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../lib/ThemeContext';
import { Icons, type IconName } from '../icons';
import { useAuthStore } from '../../stores/useAuthStore';
import { NotificationBell } from './NotificationBell';

function SearchBar() {
  const { tokens: t } = useTheme();
  const [focus, setFocus] = useState(false);
  return (
    <div
      style={{
        width: '100%',
        maxWidth: 520,
        height: 34,
        background: t.bgInput,
        border: `1px solid ${focus ? t.borderFocus : t.border}`,
        boxShadow: focus ? '0 0 0 3px rgba(212,175,55,0.12)' : 'none',
        borderRadius: 7,
        display: 'flex',
        alignItems: 'center',
        padding: '0 10px',
        gap: 8,
        transition: 'border-color 120ms ease, box-shadow 120ms ease',
      }}
    >
      <Icons.Search s={14} c={t.icon} />
      <input
        type="text"
        placeholder="Buscar leads, contatos, oportunidades…"
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={{
          flex: 1,
          border: 'none',
          background: 'transparent',
          outline: 'none',
          color: t.text,
          fontSize: 13,
          fontFamily: 'inherit',
          letterSpacing: -0.05,
        }}
      />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 3,
          fontSize: 10.5,
          color: t.textSubtle,
          background: t.kbdBg,
          padding: '2px 6px',
          borderRadius: 4,
          border: `1px solid ${t.border}`,
          fontFamily: '"SF Mono", ui-monospace, monospace',
        }}
      >
        ⌘ K
      </div>
    </div>
  );
}

function ThemeToggle() {
  const { tokens: t, isDark, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      style={{
        width: 32,
        height: 32,
        border: `1px solid ${t.border}`,
        background: 'transparent',
        borderRadius: 7,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        transition: 'background 120ms ease, border-color 120ms ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = t.bgHover;
        e.currentTarget.style.borderColor = t.borderStrong;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.borderColor = t.border;
      }}
      title={isDark ? 'Modo claro' : 'Modo escuro'}
    >
      {isDark ? <Icons.Sun s={14} c={t.icon} /> : <Icons.Moon s={14} c={t.icon} />}
    </button>
  );
}

function MenuRow({
  icon,
  label,
  shortcut,
  danger,
  onClick,
}: {
  icon: IconName;
  label: string;
  shortcut?: string;
  danger?: boolean;
  onClick?: () => void;
}) {
  const { tokens: t } = useTheme();
  const [h, setH] = useState(false);
  const Icon = Icons[icon];
  const color = danger ? t.danger : h ? t.text : t.textDim;
  return (
    <button
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        height: 32,
        padding: '0 8px',
        border: 'none',
        background: h ? t.bgHover : 'transparent',
        borderRadius: 6,
        color,
        fontSize: 12.5,
        fontFamily: 'inherit',
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <Icon s={14} c={color} />
      <span style={{ flex: 1 }}>{label}</span>
      {shortcut && <span style={{ fontSize: 10.5, color: t.textFaint }}>{shortcut}</span>}
    </button>
  );
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '··';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function AvatarMenu() {
  const { tokens: t } = useTheme();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const doLogout = useAuthStore((s) => s.logout);

  const displayName = user?.name ?? 'Usuário';
  const displayEmail = user?.email ?? '';
  const initials = initialsOf(displayName);
  const avatarUrl = user?.avatar ? `/api${user.avatar}` : null;

  const handleLogout = async () => {
    setOpen(false);
    await doLogout();
    navigate('/login', { replace: true });
  };

  useEffect(() => {
    if (!open) return;
    const handler = () => setOpen(false);
    const id = setTimeout(() => document.addEventListener('click', handler), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener('click', handler);
    };
  }, [open]);

  return (
    <div style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '3px 8px 3px 3px',
          height: 32,
          border: `1px solid ${open ? t.borderStrong : t.border}`,
          background: open ? t.bgHover : 'transparent',
          borderRadius: 999,
          cursor: 'pointer',
          fontFamily: 'inherit',
          transition: 'all 120ms ease',
        }}
        onMouseEnter={(e) => {
          if (!open) e.currentTarget.style.background = t.bgHover;
        }}
        onMouseLeave={(e) => {
          if (!open) e.currentTarget.style.background = 'transparent';
        }}
      >
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: '50%',
            background: avatarUrl
              ? '#000'
              : 'linear-gradient(135deg, #D4AF37 0%, #8a6c17 100%)',
            color: '#0a0a0a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            fontWeight: 600,
            overflow: 'hidden',
          }}
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            initials
          )}
        </div>
        <span style={{ fontSize: 12.5, color: t.text, fontWeight: 500 }}>{displayName}</span>
        <Icons.ChevronD s={13} c={t.textSubtle} />
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 40,
            width: 240,
            background: t.bgElevated,
            border: `1px solid ${t.border}`,
            borderRadius: 10,
            boxShadow: '0 10px 30px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.08)',
            padding: 6,
            zIndex: 50,
          }}
        >
          <div
            style={{
              padding: '10px 10px 12px',
              borderBottom: `1px solid ${t.border}`,
              marginBottom: 6,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: '50%',
                  background: avatarUrl
                    ? '#000'
                    : 'linear-gradient(135deg, #D4AF37 0%, #8a6c17 100%)',
                  color: '#0a0a0a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 13,
                  fontWeight: 600,
                  overflow: 'hidden',
                }}
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  initials
                )}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: t.text }}>{displayName}</div>
                <div
                  style={{
                    fontSize: 11.5,
                    color: t.textSubtle,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {displayEmail}
                </div>
              </div>
            </div>
          </div>

          <MenuRow icon="User" label="Minha conta" />
          <MenuRow icon="Gear" label="Configurações" />
          <MenuRow icon="Help" label="Ajuda & atalhos" shortcut="?" />
          <div style={{ height: 1, background: t.border, margin: '6px 4px' }} />
          <MenuRow icon="LogOut" label="Sair" danger onClick={handleLogout} />
        </div>
      )}
    </div>
  );
}

export function Header({
  pageCrumb = 'Workspace',
  pageTitle = 'Dashboard',
}: {
  pageCrumb?: string;
  pageTitle?: string;
}) {
  const { tokens: t } = useTheme();

  return (
    <header
      style={{
        height: 56,
        flexShrink: 0,
        background: t.bgHeader,
        borderBottom: `1px solid ${t.border}`,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 20px',
        gap: 16,
        position: 'relative',
        zIndex: 10,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          minWidth: 0,
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 13, color: t.textSubtle }}>{pageCrumb}</span>
        <Icons.ChevronR s={13} c={t.textFaint} />
        <span style={{ fontSize: 13, fontWeight: 500, color: t.text }}>{pageTitle}</span>
      </div>

      <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
        <SearchBar />
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexShrink: 0,
        }}
      >
        <button
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            height: 32,
            padding: '0 11px',
            border: 'none',
            background: t.gold,
            color: '#0a0a0a',
            borderRadius: 7,
            fontSize: 12.5,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
            letterSpacing: -0.05,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = t.goldHover)}
          onMouseLeave={(e) => (e.currentTarget.style.background = t.gold)}
        >
          <Icons.Plus s={13} c="#0a0a0a" /> Novo lead
        </button>
        <div style={{ width: 1, height: 20, background: t.border, margin: '0 2px' }} />
        <ThemeToggle />
        <NotificationBell />
        <AvatarMenu />
      </div>
    </header>
  );
}
