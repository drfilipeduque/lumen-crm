import { useState } from 'react';
import { Modal } from './Modal';
import { useTheme } from '../../lib/ThemeContext';
import { FONT_STACK } from '../../lib/theme';

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
}) {
  const { tokens: t } = useTheme();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} title={title} width={420}>
      <div style={{ fontSize: 13, color: t.textDim, lineHeight: 1.55 }}>{description}</div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          style={{
            background: 'transparent',
            color: t.text,
            border: `1px solid ${t.border}`,
            borderRadius: 8,
            padding: '8px 14px',
            fontSize: 12.5,
            cursor: busy ? 'not-allowed' : 'pointer',
            fontFamily: FONT_STACK,
          }}
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={run}
          disabled={busy}
          style={{
            background: danger ? t.danger : t.gold,
            color: danger ? '#fff' : '#1a1300',
            border: 'none',
            borderRadius: 8,
            padding: '8px 16px',
            fontSize: 12.5,
            fontWeight: 600,
            cursor: busy ? 'wait' : 'pointer',
            fontFamily: FONT_STACK,
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? 'Aguarde…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
