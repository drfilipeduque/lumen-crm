// Stub — preenchido na próxima fase (drawer de gerenciamento).
import { useTheme } from '../../../lib/ThemeContext';
import type { WAConnection } from '../../../hooks/useWhatsApp';

export function OverviewTab({ connection }: { connection: WAConnection }) {
  const { tokens: t } = useTheme();
  return (
    <div style={{ padding: 22, color: t.textDim, fontSize: 13 }}>
      Visão geral de <strong style={{ color: t.text }}>{connection.name}</strong>.
    </div>
  );
}
