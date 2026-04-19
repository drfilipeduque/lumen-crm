import { useState } from 'react';
import { useTheme } from '../../lib/ThemeContext';
import { DeltaBadge, IconBtn } from './primitives';

export type FinancialCardProps = {
  label: string;
  value: string;
  sub: string;
  delta?: number;
};

export function FinancialCard({ label, value, sub, delta }: FinancialCardProps) {
  const { tokens: t } = useTheme();
  const [menu, setMenu] = useState(false);
  const [hover, setHover] = useState(false);

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: t.bg,
        border: `1px solid ${hover ? t.borderStrong : t.border}`,
        borderRadius: 10,
        padding: 18,
        position: 'relative',
        transition: 'border-color 140ms ease',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 10,
          right: 10,
          display: 'flex',
          gap: 2,
          opacity: hover ? 1 : 0.3,
          transition: 'opacity 140ms ease',
        }}
      >
        <IconBtn title="Arrastar">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <circle cx="4" cy="3" r="1" fill={t.icon} />
            <circle cx="8" cy="3" r="1" fill={t.icon} />
            <circle cx="4" cy="6" r="1" fill={t.icon} />
            <circle cx="8" cy="6" r="1" fill={t.icon} />
            <circle cx="4" cy="9" r="1" fill={t.icon} />
            <circle cx="8" cy="9" r="1" fill={t.icon} />
          </svg>
        </IconBtn>
        <IconBtn
          title="Opções"
          onClick={(e) => {
            e.stopPropagation();
            setMenu((v) => !v);
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <circle cx="2" cy="6" r="1.1" fill={t.icon} />
            <circle cx="6" cy="6" r="1.1" fill={t.icon} />
            <circle cx="10" cy="6" r="1.1" fill={t.icon} />
          </svg>
        </IconBtn>
        {menu && (
          <div
            style={{
              position: 'absolute',
              top: 26,
              right: 0,
              zIndex: 5,
              width: 140,
              background: t.bgElevated,
              border: `1px solid ${t.border}`,
              borderRadius: 7,
              padding: 4,
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            }}
          >
            {(
              [
                ['Editar bloco', t.text],
                ['Duplicar', t.text],
                ['Remover', t.danger],
              ] as const
            ).map(([l, c]) => (
              <div
                key={l}
                style={{
                  padding: '6px 8px',
                  fontSize: 12,
                  color: c,
                  borderRadius: 4,
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = t.bgHover)}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                {l}
              </div>
            ))}
          </div>
        )}
      </div>

      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '3px 8px',
          borderRadius: 6,
          background: t.goldFaint,
          marginBottom: 14,
        }}
      >
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: t.gold }} />
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 500,
            color: t.gold,
            letterSpacing: 0.3,
          }}
        >
          {label}
        </span>
      </div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 600,
          letterSpacing: -0.8,
          color: t.text,
          lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 10,
          fontSize: 11.5,
        }}
      >
        <span style={{ color: t.textSubtle }}>{sub}</span>
        {delta != null && <DeltaBadge value={delta} />}
      </div>
    </div>
  );
}
