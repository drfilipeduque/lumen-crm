import { useEffect, useRef, useState } from 'react';
import { useTheme } from '../../lib/ThemeContext';
import { FONT_STACK } from '../../lib/theme';

const PALETTE = [
  '#94a3b8', '#3b82f6', '#22c55e', '#eab308',
  '#f97316', '#ef4444', '#a855f7', '#ec4899',
  '#D4AF37', '#15803d',
];

const HEX = /^#[0-9A-Fa-f]{6}$/;

export function StageColorPicker({
  color,
  onChange,
  size = 22,
}: {
  color: string;
  onChange: (next: string) => void;
  size?: number;
}) {
  const { tokens: t } = useTheme();
  const [open, setOpen] = useState(false);
  const [hex, setHex] = useState(color);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHex(color);
  }, [color]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const id = setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener('mousedown', handler);
    };
  }, [open]);

  const apply = (next: string) => {
    if (!HEX.test(next)) return;
    onChange(next);
    setOpen(false);
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        aria-label="Cor da etapa"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: size,
          height: size,
          borderRadius: 6,
          background: color,
          border: `1px solid ${t.borderStrong}`,
          cursor: 'pointer',
          padding: 0,
        }}
      />
      {open && (
        <div
          style={{
            position: 'absolute',
            top: size + 6,
            left: 0,
            zIndex: 30,
            background: t.bgElevated,
            border: `1px solid ${t.border}`,
            borderRadius: 10,
            padding: 10,
            boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
            width: 168,
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => apply(c)}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 6,
                  background: c,
                  border:
                    color.toLowerCase() === c.toLowerCase()
                      ? `2px solid ${t.text}`
                      : `1px solid ${t.border}`,
                  cursor: 'pointer',
                  padding: 0,
                }}
              />
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
            <input
              value={hex}
              onChange={(e) => setHex(e.target.value.startsWith('#') ? e.target.value : '#' + e.target.value)}
              maxLength={7}
              placeholder="#RRGGBB"
              style={{
                flex: 1,
                background: t.bgInput,
                border: `1px solid ${HEX.test(hex) ? t.border : t.danger}`,
                borderRadius: 6,
                padding: '6px 8px',
                fontSize: 11.5,
                color: t.text,
                outline: 'none',
                fontFamily: '"SF Mono", monospace',
              }}
            />
            <button
              type="button"
              onClick={() => apply(hex)}
              disabled={!HEX.test(hex) || hex.toLowerCase() === color.toLowerCase()}
              style={{
                background: t.gold,
                border: 'none',
                borderRadius: 6,
                padding: '6px 10px',
                fontSize: 11,
                fontWeight: 600,
                color: '#1a1300',
                cursor: 'pointer',
                fontFamily: FONT_STACK,
                opacity: HEX.test(hex) && hex.toLowerCase() !== color.toLowerCase() ? 1 : 0.5,
              }}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
