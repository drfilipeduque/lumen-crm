import type { CSSProperties } from 'react';
import { Outlet, useMatch, useNavigate } from 'react-router-dom';
import { useTheme } from '../../lib/ThemeContext';
import { useAuthStore } from '../../stores/useAuthStore';
import type { UserRole } from '../../lib/auth';

type SubItem = {
  path: string;
  label: string;
  description: string;
  roles?: UserRole[];
};

const ITEMS: SubItem[] = [
  { path: '/settings/account',        label: 'Minha Conta',          description: 'Perfil, senha e sessão' },
  { path: '/settings/appearance',     label: 'Aparência',            description: 'Tema e densidade' },
  { path: '/settings/users',          label: 'Usuários',             description: 'Equipe e permissões', roles: ['ADMIN'] },
  { path: '/settings/pipelines',      label: 'Pipelines',            description: 'Funis e etapas',       roles: ['ADMIN'] },
  { path: '/settings/custom-fields',  label: 'Campos Personalizados', description: 'Campos extras das oportunidades', roles: ['ADMIN'] },
  { path: '/settings/tags',           label: 'Tags',                 description: 'Etiquetas dos leads',  roles: ['ADMIN'] },
];

export function SettingsLayout() {
  const { tokens: t } = useTheme();
  const user = useAuthStore((s) => s.user);
  const role = (user?.role ?? 'COMMERCIAL') as UserRole;

  const visible = ITEMS.filter((i) => !i.roles || i.roles.includes(role));

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
      <SettingsSidebar items={visible} />
      <div style={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
        <Outlet />
      </div>
    </div>
  );
}

function SettingsSidebar({ items }: { items: SubItem[] }) {
  const { tokens: t } = useTheme();
  return (
    <aside
      style={{
        width: 240,
        flexShrink: 0,
        borderRight: `1px solid ${t.border}`,
        background: t.bgElevated,
        padding: '20px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      <div
        style={{
          padding: '0 8px 12px',
          fontSize: 10.5,
          fontWeight: 500,
          letterSpacing: 1,
          textTransform: 'uppercase',
          color: t.textFaint,
        }}
      >
        Configurações
      </div>
      {items.map((it) => (
        <SubNavItem key={it.path} item={it} />
      ))}
    </aside>
  );
}

function SubNavItem({ item }: { item: SubItem }) {
  const { tokens: t } = useTheme();
  const navigate = useNavigate();
  const match = useMatch({ path: item.path, end: false });
  const active = !!match;

  const style: CSSProperties = {
    width: '100%',
    textAlign: 'left',
    background: active ? t.bgActive : 'transparent',
    border: 'none',
    borderRadius: 7,
    padding: '9px 10px',
    cursor: 'pointer',
    color: active ? t.text : t.textDim,
    fontFamily: 'inherit',
    transition: 'background 120ms ease, color 120ms ease',
  };

  return (
    <button
      onClick={() => navigate(item.path)}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = t.bgHover;
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = 'transparent';
      }}
      style={style}
    >
      <div style={{ fontSize: 12.5, fontWeight: 500, color: active ? t.gold : 'inherit' }}>
        {item.label}
      </div>
      <div style={{ fontSize: 11, color: t.textFaint, marginTop: 2 }}>{item.description}</div>
    </button>
  );
}
