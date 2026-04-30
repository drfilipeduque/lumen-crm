// Modal de start manual.
// Multi-select de oportunidades (escopo OPPORTUNITY) ou contatos (escopo CONTACT/GROUP).

import { useMemo, useState } from 'react';
import axios from 'axios';
import { useTheme } from '../../lib/ThemeContext';
import { Modal } from '../../components/ui/Modal';
import { toast } from '../../components/ui/Toast';
import { useContacts } from '../../hooks/useContacts';
import { usePipelines } from '../../hooks/usePipelines';
import { useBoard } from '../../hooks/useOpportunities';
import { useStartCadence, type Cadence } from '../../hooks/useCadences';

export function StartCadenceModal({
  cadence,
  preselectedOpportunityId,
  preselectedContactId,
  onClose,
}: {
  cadence: Cadence;
  preselectedOpportunityId?: string;
  preselectedContactId?: string;
  onClose: () => void;
}) {
  const { tokens: t } = useTheme();
  const start = useStartCadence();

  const targetType = cadence.scope === 'CONTACT' ? 'contact' : 'opportunity';

  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(
    () =>
      new Set(
        preselectedOpportunityId
          ? [preselectedOpportunityId]
          : preselectedContactId
            ? [preselectedContactId]
            : [],
      ),
  );

  // Busca alvos
  const pipelines = usePipelines();
  const firstPipeline = pipelines.data?.[0]?.id ?? null;
  const board = useBoard(targetType === 'opportunity' ? firstPipeline : null, {});
  const contacts = useContacts({ search, page: 1, limit: 50 });

  const items: { id: string; label: string }[] = useMemo(() => {
    if (targetType === 'opportunity') {
      const board2 = board.data;
      const all = (board2?.columns ?? [])
        .flatMap((s) => s.opportunities)
        .map((o) => ({
          id: o.id,
          label: `${o.title} — ${o.contactName ?? ''}`.trim(),
        }));
      if (!search.trim()) return all;
      const q = search.toLowerCase();
      return all.filter((x) => x.label.toLowerCase().includes(q));
    }
    return (contacts.data?.data ?? []).map((c) => ({ id: c.id, label: `${c.name} — ${c.phone}` }));
  }, [board.data, contacts.data, search, targetType]);

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = async () => {
    if (selected.size === 0) return toast('Selecione pelo menos 1 alvo', 'error');
    try {
      const ids = [...selected];
      const r = (await start.mutateAsync({
        id: cadence.id,
        ...(targetType === 'opportunity' ? { opportunityIds: ids } : { contactIds: ids }),
      })) as { started?: number; skipped?: number };
      if (typeof r.started === 'number') {
        toast(`${r.started} iniciadas${r.skipped ? `, ${r.skipped} ignoradas` : ''}`, 'success');
      } else {
        toast('Cadência iniciada', 'success');
      }
      onClose();
    } catch (e) {
      const msg = axios.isAxiosError(e) ? e.response?.data?.message : null;
      toast(msg || 'Falha ao iniciar', 'error');
    }
  };

  return (
    <Modal open onClose={onClose} title={`Iniciar "${cadence.name}"`} width={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 12.5, color: t.textDim }}>
          {targetType === 'opportunity'
            ? 'Selecione as oportunidades onde a cadência vai começar.'
            : 'Selecione os contatos onde a cadência vai começar.'}
        </div>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar…"
          style={{
            padding: '9px 12px',
            borderRadius: 8,
            background: t.bgInput,
            border: `1px solid ${t.border}`,
            color: t.text,
            fontSize: 13,
            outline: 'none',
          }}
        />

        <div
          style={{
            border: `1px solid ${t.border}`,
            borderRadius: 8,
            background: t.bgElevated,
            maxHeight: 280,
            overflow: 'auto',
          }}
        >
          {items.length === 0 ? (
            <div style={{ padding: 20, color: t.textFaint, fontSize: 13, textAlign: 'center' }}>Nada encontrado</div>
          ) : (
            items.map((it) => (
              <label
                key={it.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 12px',
                  borderBottom: `1px solid ${t.border}`,
                  cursor: 'pointer',
                  color: t.text,
                  fontSize: 13,
                }}
              >
                <input
                  type="checkbox"
                  checked={selected.has(it.id)}
                  onChange={() => toggle(it.id)}
                  style={{ accentColor: t.gold }}
                />
                {it.label}
              </label>
            ))
          )}
        </div>

        <div style={{ fontSize: 12, color: t.textDim }}>{selected.size} selecionado(s)</div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              background: t.bgInput,
              color: t.text,
              border: `1px solid ${t.border}`,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={selected.size === 0 || start.isPending}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              background: t.gold,
              color: '#1a1300',
              border: 'none',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              opacity: selected.size === 0 ? 0.6 : 1,
            }}
          >
            {start.isPending ? 'Iniciando…' : `Iniciar em ${selected.size}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
