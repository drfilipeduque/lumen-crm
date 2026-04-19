import { useTheme } from '../../lib/ThemeContext';

export function Switch({
  checked,
  onChange,
  disabled,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const { tokens: t } = useTheme();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        width: 38,
        height: 22,
        padding: 2,
        borderRadius: 999,
        border: `1px solid ${checked ? t.gold : t.border}`,
        background: checked ? t.gold : t.bgInput,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'background 140ms ease, border-color 140ms ease',
        display: 'flex',
        alignItems: 'center',
        justifyContent: checked ? 'flex-end' : 'flex-start',
      }}
    >
      <span
        style={{
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: checked ? '#1a1300' : t.text,
          opacity: checked ? 1 : 0.82,
          transition: 'transform 140ms ease',
          boxShadow: checked ? 'none' : '0 1px 2px rgba(0,0,0,0.2)',
        }}
      />
    </button>
  );
}
