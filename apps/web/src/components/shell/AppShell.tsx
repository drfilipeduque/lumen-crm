import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useTheme } from '../../lib/ThemeContext';
import { FONT_STACK } from '../../lib/theme';
import { Sidebar, NAV_ITEMS } from './Sidebar';
import { Header } from './Header';

function deriveTitle(pathname: string): string {
  const match = NAV_ITEMS.find(
    (i) => pathname === i.path || pathname.startsWith(i.path + '/'),
  );
  return match?.label ?? 'Workspace';
}

export function AppShell({ initialCollapsed = false }: { initialCollapsed?: boolean }) {
  const { tokens: t } = useTheme();
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const { pathname } = useLocation();
  const title = deriveTitle(pathname);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        background: t.bg,
        color: t.text,
        fontFamily: FONT_STACK,
        WebkitFontSmoothing: 'antialiased',
        fontFeatureSettings: '"cv11", "ss01"',
      }}
    >
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <Header pageTitle={title} pageCrumb="Workspace" />
        <Outlet />
      </div>
    </div>
  );
}
