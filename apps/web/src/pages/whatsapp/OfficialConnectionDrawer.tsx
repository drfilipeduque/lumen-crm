// Drawer de gerenciamento de uma conexão OFICIAL (Meta Cloud API).
// 3 sub-abas: Visão Geral, Templates, Janela 24h.

import { useState, type CSSProperties } from 'react';
import { useTheme } from '../../lib/ThemeContext';
import { Drawer } from '../../components/ui/Drawer';
import { Icons } from '../../components/icons';
import { FONT_STACK } from '../../lib/theme';
import { useWhatsAppConnections } from '../../hooks/useWhatsApp';
import { OverviewTab } from './official/OverviewTab';
import { TemplatesTab } from './official/TemplatesTab';
import { WindowTab } from './official/WindowTab';

type SubTab = 'overview' | 'templates' | 'window';

const TABS: { key: SubTab; label: string }[] = [
  { key: 'overview', label: 'Visão geral' },
  { key: 'templates', label: 'Templates' },
  { key: 'window', label: 'Janela 24h' },
];

export function OfficialConnectionDrawer({
  connectionId,
  onClose,
}: {
  connectionId: string;
  onClose: () => void;
}) {
  const { tokens: t } = useTheme();
  const list = useWhatsAppConnections('OFFICIAL');
  const conn = list.data?.find((c) => c.id === connectionId);
  const [tab, setTab] = useState<SubTab>('overview');

  return (
    <Drawer open onClose={onClose} width={760}>
      <div
        style={{
          padding: '18px 22px',
          borderBottom: `1px solid ${t.border}`,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: t.textDim,
            cursor: 'pointer',
            padding: 4,
            display: 'flex',
            alignItems: 'center',
          }}
          title="Fechar"
        >
          <Icons.ChevronR s={18} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: t.textFaint, letterSpacing: 0.4, textTransform: 'uppercase', fontWeight: 500 }}>
            Conexão oficial
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, color: t.text, marginTop: 2 }}>
            {conn?.name ?? 'Carregando…'}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, padding: '0 22px', borderBottom: `1px solid ${t.border}` }}>
        {TABS.map((opt) => {
          const active = tab === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => setTab(opt.key)}
              style={{
                background: 'transparent',
                border: 'none',
                color: active ? t.gold : t.textDim,
                fontSize: 12.5,
                fontWeight: active ? 600 : 500,
                padding: '12px 14px',
                cursor: 'pointer',
                borderBottom: `2px solid ${active ? t.gold : 'transparent'}`,
                fontFamily: FONT_STACK,
                marginBottom: -1,
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {tab === 'overview' && conn && <OverviewTab connection={conn} />}
        {tab === 'templates' && <TemplatesTab connectionId={connectionId} />}
        {tab === 'window' && <WindowTab connectionId={connectionId} />}
      </div>
    </Drawer>
  );
}

// shared style helpers reusable across sub-tabs
export function panelStyle(t: ReturnType<typeof useTheme>['tokens']): CSSProperties {
  return {
    padding: 16,
    background: t.bgElevated,
    border: `1px solid ${t.border}`,
    borderRadius: 10,
  };
}
