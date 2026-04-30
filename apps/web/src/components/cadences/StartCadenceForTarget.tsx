// Modal compacto: usuário no card da oportunidade ou linha de contato
// quer iniciar UMA cadência manual nesse alvo. Lista cadências ativas
// (escopo manual) e inicia direto no clique — sem multi-select.

import { useState } from 'react';
import axios from 'axios';
import { useTheme } from '../../lib/ThemeContext';
import { Modal } from '../ui/Modal';
import { toast } from '../ui/Toast';
import { useManualCadences, useStartCadence } from '../../hooks/useCadences';

export function StartCadenceForTarget({
  open,
  onClose,
  target,
}: {
  open: boolean;
  onClose: () => void;
  target: { kind: 'opportunity'; opportunityId: string; label?: string } | { kind: 'contact'; contactId: string; label?: string };
}) {
  const { tokens: t } = useTheme();
  const cads = useManualCadences();
  const start = useStartCadence();
  const [busyId, setBusyId] = useState<string | null>(null);

  const fire = async (cadenceId: string) => {
    setBusyId(cadenceId);
    try {
      await start.mutateAsync({
        id: cadenceId,
        ...(target.kind === 'opportunity'
          ? { opportunityId: target.opportunityId }
          : { contactId: target.contactId }),
      });
      toast('Cadência iniciada', 'success');
      onClose();
    } catch (e) {
      const msg = axios.isAxiosError(e) ? e.response?.data?.message : null;
      toast(msg || 'Falha ao iniciar', 'error');
    } finally {
      setBusyId(null);
    }
  };

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} title="Iniciar cadência" width={380}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {target.label ? (
          <div style={{ fontSize: 12, color: t.textDim }}>
            Alvo: <strong style={{ color: t.text }}>{target.label}</strong>
          </div>
        ) : null}

        {cads.isLoading ? (
          <div style={{ color: t.textFaint, fontSize: 13, padding: 16 }}>Carregando…</div>
        ) : !cads.data || cads.data.length === 0 ? (
          <div style={{ color: t.textDim, fontSize: 12.5, padding: 16, textAlign: 'center' }}>
            Nenhuma cadência manual ativa.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 320, overflow: 'auto' }}>
            {cads.data.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => fire(c.id)}
                disabled={busyId !== null}
                style={{
                  textAlign: 'left',
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: t.bgElevated,
                  border: `1px solid ${t.border}`,
                  color: t.text,
                  cursor: 'pointer',
                  opacity: busyId === c.id ? 0.6 : 1,
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</div>
                {c.description ? (
                  <div style={{ fontSize: 11, color: t.textDim, marginTop: 2 }}>{c.description}</div>
                ) : null}
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
