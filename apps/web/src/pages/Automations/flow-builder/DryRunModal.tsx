// Modal "Testar fluxo": escolhe contexto (opportunity existente ou JSON
// custom) e dispara POST /:id/test. Mostra steps coloridos por status.

import { useState } from 'react';
import axios from 'axios';
import { useTheme } from '../../../lib/ThemeContext';
import { Modal } from '../../../components/ui/Modal';
import { toast } from '../../../components/ui/Toast';
import { useTestAutomation } from '../../../hooks/useAutomations';
import { useSearchOpportunities, type OpportunitySearchHit } from '../../../hooks/useOpportunities';
import { TRIGGER_CATEGORIES, ACTION_CATEGORIES, CONDITION_CATEGORIES, findItem } from './sections';

function labelFor(type: 'trigger' | 'condition' | 'action', subtype: string): string {
  const cats = type === 'trigger' ? TRIGGER_CATEGORIES : type === 'action' ? ACTION_CATEGORIES : CONDITION_CATEGORIES;
  return findItem(cats, subtype)?.item.label ?? subtype;
}

export function DryRunModal({
  automationId,
  triggerType,
  onClose,
}: {
  automationId: string;
  triggerType: string;
  onClose: () => void;
}) {
  const { tokens: t } = useTheme();
  const test = useTestAutomation();
  const [picked, setPicked] = useState<OpportunitySearchHit | null>(null);
  const [customJson, setCustomJson] = useState('{\n  "data": {}\n}');
  const [mode, setMode] = useState<'opportunity' | 'custom'>('opportunity');

  const fire = async () => {
    let event: { type: string; data?: Record<string, unknown> } | undefined;
    if (mode === 'opportunity' && picked) {
      event = {
        type: triggerType.startsWith('message_') ? 'message.received' : 'opportunity.stage_changed',
        data: { opportunityId: picked.id },
      };
    } else if (mode === 'custom') {
      try {
        const parsed = JSON.parse(customJson);
        event = { type: parsed.type ?? 'opportunity.created', data: parsed.data ?? {} };
      } catch {
        toast('JSON inválido', 'error');
        return;
      }
    }
    try {
      const r = await test.mutateAsync({ id: automationId, event });
      toast(
        `Dry-run OK (${r.steps.length} steps, ${r.steps.filter((s) => s.status === 'success').length} ok)`,
        'success',
      );
    } catch (e) {
      const msg = axios.isAxiosError(e) ? e.response?.data?.message : null;
      toast(msg || 'Falha no dry-run', 'error');
    }
  };

  return (
    <Modal open onClose={onClose} title="Testar fluxo (dry-run)" width={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 12, color: t.textDim }}>
          Trigger: <strong style={{ color: t.text }}>{labelFor('trigger', triggerType)}</strong>. Dry-run
          NÃO persiste mudanças nem envia mensagens reais.
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          <Tab t={t} active={mode === 'opportunity'} onClick={() => setMode('opportunity')}>
            Oportunidade existente
          </Tab>
          <Tab t={t} active={mode === 'custom'} onClick={() => setMode('custom')}>
            Payload custom
          </Tab>
        </div>

        {mode === 'opportunity' ? (
          <OpportunityPicker picked={picked} onPick={setPicked} />
        ) : (
          <textarea
            value={customJson}
            onChange={(e) => setCustomJson(e.target.value)}
            rows={8}
            style={{ ...input(t), fontFamily: 'monospace', fontSize: 11.5 }}
            spellCheck={false}
          />
        )}

        {test.data ? (
          <div
            style={{
              border: `1px solid ${t.border}`,
              borderRadius: 8,
              background: t.bgElevated,
              maxHeight: 220,
              overflow: 'auto',
              padding: 8,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            {test.data.steps.map((s, i) => (
              <div
                key={`${s.nodeId}-${i}`}
                style={{
                  fontSize: 11.5,
                  padding: '4px 8px',
                  borderRadius: 4,
                  background:
                    s.status === 'success'
                      ? 'rgba(16,185,129,0.12)'
                      : s.status === 'failed'
                        ? 'rgba(239,68,68,0.12)'
                        : 'transparent',
                  color: t.text,
                }}
              >
                <strong>{labelFor(s.type as 'trigger' | 'condition' | 'action', s.subtype)}</strong>{' '}
                <span style={{ color: t.textDim }}>· {s.status}</span>
                {s.error ? <span style={{ color: '#ef4444' }}> — {s.error}</span> : null}
              </div>
            ))}
          </div>
        ) : null}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
          <button type="button" onClick={onClose} style={btnNeutral(t)}>
            Fechar
          </button>
          <button type="button" onClick={fire} disabled={test.isPending} style={btnGold(t)}>
            {test.isPending ? 'Executando…' : 'Executar dry-run'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function OpportunityPicker({
  picked,
  onPick,
}: {
  picked: OpportunitySearchHit | null;
  onPick: (o: OpportunitySearchHit | null) => void;
}) {
  const { tokens: t } = useTheme();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const list = useSearchOpportunities(search);

  if (picked) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '9px 12px',
          background: t.bgInput,
          border: `1px solid ${t.border}`,
          borderRadius: 8,
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, color: t.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {picked.title}
          </div>
          <div style={{ fontSize: 11, color: t.textDim, marginTop: 2 }}>
            {picked.contactName} · {picked.pipelineName} → {picked.stageName}
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            onPick(null);
            setSearch('');
            setOpen(false);
          }}
          style={{
            background: 'transparent',
            border: 'none',
            color: t.textDim,
            cursor: 'pointer',
            fontSize: 11,
            padding: 4,
          }}
        >
          Trocar
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        type="text"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Buscar por nome da oportunidade ou contato…"
        style={input(t)}
      />
      {open ? (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            background: t.bgElevated,
            border: `1px solid ${t.border}`,
            borderRadius: 8,
            maxHeight: 240,
            overflow: 'auto',
            zIndex: 10,
            boxShadow: '0 6px 20px rgba(0,0,0,0.25)',
          }}
        >
          {list.isLoading ? (
            <div style={{ padding: 12, fontSize: 12, color: t.textDim }}>Carregando…</div>
          ) : !list.data || list.data.length === 0 ? (
            <div style={{ padding: 12, fontSize: 12, color: t.textDim }}>
              {search.trim() ? 'Nenhum resultado.' : 'Comece a digitar pra buscar.'}
            </div>
          ) : (
            list.data.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => {
                  onPick(o);
                  setOpen(false);
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  background: 'transparent',
                  border: 'none',
                  padding: '8px 12px',
                  cursor: 'pointer',
                  borderBottom: `1px solid ${t.border}`,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = t.bgInput)}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{ fontSize: 12.5, color: t.text, fontWeight: 600 }}>{o.title}</div>
                <div style={{ fontSize: 11, color: t.textDim, marginTop: 2 }}>
                  {o.contactName} · {o.pipelineName} → {o.stageName}
                </div>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function Tab({
  t,
  active,
  onClick,
  children,
}: {
  t: ReturnType<typeof useTheme>['tokens'];
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '6px 12px',
        borderRadius: 6,
        border: `1px solid ${active ? t.gold : t.border}`,
        background: active ? t.goldFaint : t.bgInput,
        color: t.text,
        fontSize: 11.5,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

type Tk = ReturnType<typeof useTheme>['tokens'];
const input = (t: Tk) => ({
  width: '100%',
  padding: '9px 12px',
  borderRadius: 8,
  background: t.bgInput,
  color: t.text,
  border: `1px solid ${t.border}`,
  fontSize: 13,
  outline: 'none' as const,
});
const btnGold = (t: Tk) => ({
  padding: '8px 14px',
  borderRadius: 8,
  background: t.gold,
  color: '#1a1300',
  border: 'none',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer' as const,
});
const btnNeutral = (t: Tk) => ({
  padding: '8px 14px',
  borderRadius: 8,
  background: t.bgInput,
  color: t.text,
  border: `1px solid ${t.border}`,
  fontSize: 13,
  cursor: 'pointer' as const,
});
