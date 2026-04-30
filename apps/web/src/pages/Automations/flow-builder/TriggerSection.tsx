import { useState } from 'react';
import { useTheme } from '../../../lib/ThemeContext';
import { Icons } from '../../../components/icons';
import { useAutomationCatalog } from '../../../hooks/useAutomations';
import { TRIGGER_CATEGORIES, findItem } from './sections';
import { DynamicConfigForm } from './DynamicConfigForm';
import type { BuilderTrigger } from './model';

export function TriggerSection({
  value,
  onChange,
  errors,
}: {
  value: BuilderTrigger | null;
  onChange: (next: BuilderTrigger | null) => void;
  errors: string[];
}) {
  const { tokens: t } = useTheme();
  const [open, setOpen] = useState(true);
  const catalog = useAutomationCatalog();
  const found = value ? findItem(TRIGGER_CATEGORIES, value.subtype) : null;

  const def = value
    ? catalog.data?.triggers.find((d) => d.subtype === value.subtype)
    : null;

  return (
    <Card>
      <Header
        open={open}
        onToggle={() => setOpen((s) => !s)}
        emoji="⚡"
        title="QUANDO"
        subtitle={
          value
            ? found
              ? `Gatilho: ${found.item.label}`
              : `Gatilho: ${value.subtype}`
            : 'Selecione um gatilho'
        }
        accent={t.gold}
        warning={errors.length > 0}
      />
      {open && (
        <div style={{ padding: '14px 18px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <select
            value={value?.subtype ?? ''}
            onChange={(e) => {
              const subtype = e.target.value;
              if (!subtype) onChange(null);
              else onChange({ subtype, config: {} });
            }}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 8,
              background: t.bgInput,
              color: t.text,
              border: `1px solid ${t.border}`,
              fontSize: 13,
              outline: 'none',
              fontFamily: 'inherit',
            }}
          >
            <option value="">— escolha um gatilho —</option>
            {TRIGGER_CATEGORIES.map((cat) => (
              <optgroup key={cat.label} label={`${cat.emoji} ${cat.label}`}>
                {cat.items.map((it) => (
                  <option key={it.subtype} value={it.subtype}>
                    {it.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>

          {value && def && (
            <div
              style={{
                padding: '14px 16px',
                background: t.bg,
                borderRadius: 10,
                border: `1px solid ${t.border}`,
              }}
            >
              <div style={{ fontSize: 11, color: t.textFaint, marginBottom: 10, fontWeight: 600, letterSpacing: 0.6 }}>
                CONFIGURAÇÃO DO GATILHO
              </div>
              <DynamicConfigForm
                fields={def.configFields}
                config={value.config}
                onChange={(next) => onChange({ subtype: value.subtype, config: next })}
                triggerSubtype={value.subtype}
                previousStepCount={0}
              />
            </div>
          )}

          {errors.length > 0 && (
            <div
              style={{
                padding: '8px 10px',
                background: 'rgba(245,158,11,0.1)',
                border: '1px solid rgba(245,158,11,0.4)',
                borderRadius: 8,
                fontSize: 11.5,
                color: t.text,
              }}
            >
              {errors.map((e, i) => (
                <div key={i}>⚠ {e}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export function Card({ children }: { children: React.ReactNode }) {
  const { tokens: t } = useTheme();
  return (
    <div
      style={{
        background: t.bgElevated,
        border: `1px solid ${t.border}`,
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      {children}
    </div>
  );
}

export function Header({
  open,
  onToggle,
  emoji,
  title,
  subtitle,
  accent,
  warning,
}: {
  open: boolean;
  onToggle: () => void;
  emoji: string;
  title: string;
  subtitle: string;
  accent?: string;
  warning?: boolean;
}) {
  const { tokens: t } = useTheme();
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        width: '100%',
        background: 'transparent',
        border: 'none',
        padding: '14px 18px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        cursor: 'pointer',
        textAlign: 'left',
        borderBottom: open ? `1px solid ${t.border}` : 'none',
      }}
    >
      <Icons.ChevronR
        s={14}
        c={t.textDim}
        style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 120ms' }}
      />
      <div style={{ fontSize: 18 }}>{emoji}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 11,
            letterSpacing: 1,
            textTransform: 'uppercase',
            fontWeight: 700,
            color: accent ?? t.text,
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: 12.5,
            color: t.textDim,
            marginTop: 2,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {subtitle}
        </div>
      </div>
      {warning && (
        <span
          style={{
            fontSize: 10.5,
            padding: '3px 8px',
            borderRadius: 999,
            background: 'rgba(245,158,11,0.18)',
            color: '#f59e0b',
            fontWeight: 600,
          }}
        >
          configure
        </span>
      )}
    </button>
  );
}
