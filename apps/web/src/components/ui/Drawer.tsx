import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '../../lib/ThemeContext';

export function Drawer({
  open,
  onClose,
  width = 700,
  children,
}: {
  open: boolean;
  onClose: () => void;
  width?: number;
  children: ReactNode;
}) {
  const { tokens: t } = useTheme();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 70,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        justifyContent: 'flex-end',
        backdropFilter: 'blur(2px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width,
          maxWidth: '100vw',
          height: '100%',
          background: t.bgElevated,
          borderLeft: `1px solid ${t.border}`,
          color: t.text,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-12px 0 40px rgba(0,0,0,0.3)',
          animation: 'lumen-drawer-in 200ms ease-out',
        }}
      >
        {children}
      </div>
      <style>{`
        @keyframes lumen-drawer-in {
          from { transform: translateX(40px); opacity: 0; }
          to   { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>,
    document.body,
  );
}
