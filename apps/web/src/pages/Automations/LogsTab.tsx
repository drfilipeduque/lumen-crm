// Placeholder — será preenchido pelo próximo commit (Logs UI completa).

import { useTheme } from '../../lib/ThemeContext';

export function LogsTab() {
  const { tokens: t } = useTheme();
  return (
    <div style={{ padding: 80, textAlign: 'center', color: t.textDim }}>
      <div style={{ fontSize: 16, color: t.text, marginBottom: 4 }}>Logs</div>
      <div style={{ fontSize: 13 }}>Em construção…</div>
    </div>
  );
}
