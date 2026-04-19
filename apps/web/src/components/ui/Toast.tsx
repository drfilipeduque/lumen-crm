import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';
import { useTheme } from '../../lib/ThemeContext';

type ToastVariant = 'success' | 'error' | 'info';
type Toast = { id: string; message: string; variant: ToastVariant };

type ToastStore = {
  toasts: Toast[];
  push: (msg: string, variant?: ToastVariant) => void;
  dismiss: (id: string) => void;
};

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (message, variant = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    set((s) => ({ toasts: [...s.toasts, { id, message, variant }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4000);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export function toast(message: string, variant?: ToastVariant) {
  useToastStore.getState().push(message, variant);
}

export function ToastViewport() {
  const { tokens: t } = useTheme();
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  useEffect(() => {
    // no-op; placeholder if we ever need lifecycle
  }, []);

  if (toasts.length === 0) return null;
  return createPortal(
    <div
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        zIndex: 90,
        pointerEvents: 'none',
      }}
    >
      {toasts.map((toast) => {
        const accent =
          toast.variant === 'success' ? t.success : toast.variant === 'error' ? t.danger : t.gold;
        return (
          <div
            key={toast.id}
            onClick={() => dismiss(toast.id)}
            style={{
              pointerEvents: 'auto',
              minWidth: 240,
              maxWidth: 380,
              background: t.bgElevated,
              color: t.text,
              border: `1px solid ${t.border}`,
              borderLeft: `3px solid ${accent}`,
              borderRadius: 10,
              padding: '12px 14px',
              fontSize: 13,
              boxShadow: '0 12px 30px rgba(0,0,0,0.25)',
              cursor: 'pointer',
            }}
          >
            {toast.message}
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
