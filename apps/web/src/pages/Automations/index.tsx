// Página /automations com tabs.
// Por enquanto só "Cadências" é funcional; demais são placeholder
// que serão implementados na Parte 3.

import { useState } from 'react';
import { useTheme } from '../../lib/ThemeContext';
import { CadencesTab } from './CadencesTab';

type TabKey = 'cadences' | 'flows' | 'webhooks' | 'logs';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'cadences', label: 'Cadências' },
  { key: 'flows', label: 'Fluxos' },
  { key: 'webhooks', label: 'Webhooks' },
  { key: 'logs', label: 'Logs' },
];

export function AutomationsPage() {
  const { tokens: t } = useTheme();
  const [tab, setTab] = useState<TabKey>('cadences');

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: t.bg }}>
      <div
        style={{
          padding: '20px 32px 0',
          borderBottom: `1px solid ${t.border}`,
          background: t.bg,
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0, color: t.text }}>Automações</h1>
        <div style={{ display: 'flex', gap: 4, marginTop: 16 }}>
          {TABS.map((tt) => (
            <button
              key={tt.key}
              type="button"
              onClick={() => setTab(tt.key)}
              style={{
                padding: '10px 16px',
                background: 'transparent',
                border: 'none',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                color: tab === tt.key ? t.text : t.textDim,
                borderBottom: tab === tt.key ? `2px solid ${t.gold}` : '2px solid transparent',
                marginBottom: -1,
              }}
            >
              {tt.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {tab === 'cadences' && <CadencesTab />}
        {tab === 'flows' && <Soon t={t} title="Construtor visual de Fluxos" hint="Vai chegar na Parte 3 das Automações." />}
        {tab === 'webhooks' && <Soon t={t} title="Webhooks" hint="Inbound e outbound — Parte 3." />}
        {tab === 'logs' && <Soon t={t} title="Logs" hint="Histórico de execuções — Parte 3." />}
      </div>
    </div>
  );
}

function Soon({ t, title, hint }: { t: ReturnType<typeof useTheme>['tokens']; title: string; hint: string }) {
  return (
    <div style={{ padding: 80, textAlign: 'center', color: t.textDim }}>
      <div style={{ fontSize: 16, color: t.text, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 13 }}>{hint}</div>
    </div>
  );
}
