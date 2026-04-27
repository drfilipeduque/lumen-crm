// Stub — preenchido na próxima fase.
import { useTheme } from '../../../lib/ThemeContext';

export function TemplatesTab({ connectionId }: { connectionId: string }) {
  const { tokens: t } = useTheme();
  return (
    <div style={{ padding: 22, color: t.textDim, fontSize: 13 }}>
      Templates da conexão <code>{connectionId}</code>.
    </div>
  );
}
