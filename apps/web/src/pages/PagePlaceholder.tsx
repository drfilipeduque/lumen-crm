import { useTheme } from '../lib/ThemeContext';
import { Icons, type IconName } from '../components/icons';

export function PagePlaceholder({
  title,
  icon = 'Bolt',
  description = 'Esta tela ainda está em construção.',
}: {
  title: string;
  icon?: IconName;
  description?: string;
}) {
  const { tokens: t } = useTheme();
  const Icon = Icons[icon];
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        background: t.bg,
        overflow: 'auto',
      }}
    >
      <div
        style={{
          padding: '28px 32px 20px',
          borderBottom: `1px solid ${t.border}`,
        }}
      >
        <div
          style={{
            fontSize: 11.5,
            letterSpacing: 1,
            textTransform: 'uppercase',
            color: t.textFaint,
            fontWeight: 500,
            marginBottom: 6,
          }}
        >
          {title}
        </div>
        <h1
          style={{
            fontSize: 26,
            fontWeight: 600,
            letterSpacing: -0.6,
            margin: 0,
            color: t.text,
          }}
        >
          Em construção
        </h1>
      </div>

      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 40,
        }}
      >
        <div
          style={{
            maxWidth: 380,
            background: t.bgElevated,
            border: `1px solid ${t.border}`,
            borderRadius: 14,
            padding: 28,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: t.bg,
              border: `1px solid ${t.border}`,
              margin: '0 auto 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon s={20} c={t.gold} />
          </div>
          <div style={{ fontSize: 14, fontWeight: 500, color: t.text, marginBottom: 6 }}>
            {title}
          </div>
          <div style={{ fontSize: 12.5, color: t.textSubtle, lineHeight: 1.5 }}>
            {description}
          </div>
        </div>
      </div>
    </div>
  );
}
