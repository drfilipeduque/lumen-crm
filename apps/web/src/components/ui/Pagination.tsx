import { useTheme } from '../../lib/ThemeContext';
import { Icons } from '../icons';
import { FONT_STACK } from '../../lib/theme';

export function Pagination({
  page,
  totalPages,
  total,
  onChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  onChange: (next: number) => void;
}) {
  const { tokens: t } = useTheme();
  if (totalPages <= 1) {
    return (
      <div style={{ fontSize: 11.5, color: t.textFaint, padding: '12px 0', textAlign: 'right' }}>
        {total} {total === 1 ? 'resultado' : 'resultados'}
      </div>
    );
  }

  const goto = (n: number) => onChange(Math.min(Math.max(1, n), totalPages));

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 0 4px',
      }}
    >
      <div style={{ fontSize: 11.5, color: t.textFaint }}>
        Página <strong style={{ color: t.text }}>{page}</strong> de{' '}
        <strong style={{ color: t.text }}>{totalPages}</strong> · {total}{' '}
        {total === 1 ? 'resultado' : 'resultados'}
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        <NavBtn t={t} disabled={page <= 1} onClick={() => goto(page - 1)} title="Anterior">
          <Icons.ChevronL s={13} c="currentColor" />
        </NavBtn>
        <NavBtn t={t} disabled={page >= totalPages} onClick={() => goto(page + 1)} title="Próxima">
          <Icons.ChevronR s={13} c="currentColor" />
        </NavBtn>
      </div>
    </div>
  );
}

function NavBtn({
  t,
  disabled,
  onClick,
  title,
  children,
}: {
  t: ReturnType<typeof useTheme>['tokens'];
  disabled?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: 30,
        height: 30,
        background: 'transparent',
        border: `1px solid ${t.border}`,
        borderRadius: 6,
        cursor: disabled ? 'not-allowed' : 'pointer',
        color: disabled ? t.textFaint : t.textDim,
        opacity: disabled ? 0.5 : 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: FONT_STACK,
      }}
    >
      {children}
    </button>
  );
}
