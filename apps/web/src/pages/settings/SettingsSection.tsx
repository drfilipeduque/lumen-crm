import { useTheme } from '../../lib/ThemeContext';

// Placeholder reutilizável para as sub-páginas de Settings (cada uma será
// substituída por sua tela real conforme as features forem implementadas).
export function SettingsSection({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  const { tokens: t } = useTheme();
  return (
    <div style={{ padding: '28px 32px 40px' }}>
      <div style={{ marginBottom: 20 }}>
        <h2
          style={{
            fontSize: 20,
            fontWeight: 600,
            letterSpacing: -0.4,
            margin: 0,
            color: t.text,
          }}
        >
          {title}
        </h2>
        <div style={{ fontSize: 13, color: t.textDim, marginTop: 4 }}>{description}</div>
      </div>

      <div
        style={{
          background: t.bgElevated,
          border: `1px solid ${t.border}`,
          borderRadius: 12,
          padding: 32,
          textAlign: 'center',
          color: t.textSubtle,
          fontSize: 13,
        }}
      >
        Em construção. Esta seção será implementada nas próximas etapas.
      </div>
    </div>
  );
}
