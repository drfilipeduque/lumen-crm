import type { CSSProperties, ReactNode } from 'react';
import { useTheme } from '../../lib/ThemeContext';
import type { PeriodKey } from '../../hooks/useDashboard';

export const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: 'today', label: 'Hoje' },
  { key: 'yesterday', label: 'Ontem' },
  { key: 'week', label: 'Esta semana' },
  { key: 'month', label: 'Este mês' },
  { key: 'year', label: 'Este ano' },
];

export function PeriodFilter({
  value,
  onChange,
}: {
  value: PeriodKey;
  onChange: (next: PeriodKey) => void;
}) {
  const { tokens: t } = useTheme();
  return (
    <div
      style={{
        display: 'inline-flex',
        padding: 3,
        background: t.bgElevated,
        border: `1px solid ${t.border}`,
        borderRadius: 9,
        gap: 1,
      }}
    >
      {PERIOD_OPTIONS.map(({ key, label }) => {
        const active = key === value;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            onMouseEnter={(e) => {
              if (!active) e.currentTarget.style.color = t.text;
            }}
            onMouseLeave={(e) => {
              if (!active) e.currentTarget.style.color = t.textDim;
            }}
            style={{
              height: 28,
              padding: '0 12px',
              borderRadius: 6,
              border: 'none',
              background: active ? t.gold : 'transparent',
              color: active ? '#0a0a0a' : t.textDim,
              fontSize: 12,
              fontWeight: active ? 600 : 500,
              cursor: 'pointer',
              fontFamily: 'inherit',
              letterSpacing: -0.05,
              transition: 'all 120ms ease',
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  const { tokens: t } = useTheme();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          style={{
            height: i === 0 ? 22 : 10,
            width: i === 0 ? '40%' : `${70 - i * 10}%`,
            background: t.bgHover,
            borderRadius: 5,
            animation: 'lumen-pulse 1.4s ease-in-out infinite',
          }}
        />
      ))}
      <style>{`@keyframes lumen-pulse { 0%, 100% { opacity: 0.55 } 50% { opacity: 1 } }`}</style>
    </div>
  );
}

export function EmptyHint({ children }: { children: ReactNode }) {
  const { tokens: t } = useTheme();
  return (
    <div style={{ fontSize: 12, color: t.textSubtle, padding: '6px 0' }}>{children}</div>
  );
}

export function formatDuration(minutes: number): { value: string; unit: string } {
  if (!Number.isFinite(minutes) || minutes <= 0) return { value: '—', unit: '' };
  if (minutes < 60) return { value: minutes.toFixed(0), unit: 'min' };
  const hours = minutes / 60;
  if (hours < 24) return { value: hours.toFixed(1), unit: 'h' };
  const days = hours / 24;
  return { value: days.toFixed(1), unit: 'dias' };
}

export function Card({
  children,
  pad = 18,
  style,
}: {
  children: ReactNode;
  pad?: number;
  style?: CSSProperties;
}) {
  const { tokens: t } = useTheme();
  return (
    <div
      style={{
        background: t.bg,
        border: `1px solid ${t.border}`,
        borderRadius: 10,
        padding: pad,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function CardHead({
  title,
  hint,
  right,
}: {
  title: string;
  hint?: string;
  right?: ReactNode;
}) {
  const { tokens: t } = useTheme();
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 14,
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: t.textDim,
            letterSpacing: -0.05,
          }}
        >
          {title}
        </span>
        {hint && (
          <span
            style={{
              fontSize: 10.5,
              color: t.textFaint,
              padding: '1px 6px',
              borderRadius: 10,
              background: t.bgHover,
            }}
          >
            {hint}
          </span>
        )}
      </div>
      {right}
    </div>
  );
}

export function DeltaBadge({ value, positive }: { value: number; positive?: boolean }) {
  const { tokens: t } = useTheme();
  const good = positive ?? value >= 0;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        fontSize: 11,
        fontWeight: 600,
        color: good ? t.success : t.danger,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
        <path d={good ? 'M6 2 L10 7 L2 7 Z' : 'M6 10 L2 5 L10 5 Z'} fill="currentColor" />
      </svg>
      {Math.abs(value)}%
    </span>
  );
}

export function IconBtn({
  children,
  onClick,
  title,
}: {
  children: ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  title?: string;
}) {
  const { tokens: t } = useTheme();
  return (
    <button
      onClick={onClick}
      title={title}
      onMouseEnter={(e) => (e.currentTarget.style.background = t.bgHover)}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      style={{
        width: 22,
        height: 22,
        border: 'none',
        background: 'transparent',
        borderRadius: 4,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </button>
  );
}
