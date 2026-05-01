// Tab "Disparos" em /automations.
// Lista de campanhas em cards com ações dependendo do status.

import { useState } from 'react';
import { useTheme } from '../../lib/ThemeContext';
import { Icons } from '../../components/icons';
import { toast } from '../../components/ui/Toast';
import {
  useBroadcasts,
  useStartBroadcast,
  usePauseBroadcast,
  useResumeBroadcast,
  useCancelBroadcast,
  useDeleteBroadcastDraft,
  type Broadcast,
  type BroadcastStatus,
} from '../../hooks/useBroadcasts';
import { BroadcastWizard } from './broadcasts/BroadcastWizard';
import { BroadcastDetail } from './broadcasts/BroadcastDetail';

export function BroadcastsTab() {
  const { tokens: t } = useTheme();
  const [creating, setCreating] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const list = useBroadcasts();

  return (
    <div style={{ padding: '20px 32px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={() => setCreating(true)}
          style={{
            padding: '8px 14px',
            background: t.gold,
            color: '#1a1300',
            border: 'none',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Icons.Plus s={12} c="#1a1300" /> Novo Disparo
        </button>
      </div>

      {list.isLoading ? (
        <div style={{ color: t.textDim }}>Carregando…</div>
      ) : !list.data || list.data.data.length === 0 ? (
        <div
          style={{
            padding: 40,
            textAlign: 'center',
            border: `1px dashed ${t.border}`,
            borderRadius: 12,
            color: t.textDim,
            fontSize: 13,
          }}
        >
          Nenhum disparo cadastrado. Clique em "+ Novo Disparo" pra começar.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 12 }}>
          {list.data.data.map((b) => (
            <BroadcastCard key={b.id} b={b} onView={() => setViewingId(b.id)} />
          ))}
        </div>
      )}

      <BroadcastWizard open={creating} onClose={() => setCreating(false)} />
      <BroadcastDetail id={viewingId} onClose={() => setViewingId(null)} />
    </div>
  );
}

function BroadcastCard({ b, onView }: { b: Broadcast; onView: () => void }) {
  const { tokens: t } = useTheme();
  const start = useStartBroadcast();
  const pause = usePauseBroadcast();
  const resume = useResumeBroadcast();
  const cancel = useCancelBroadcast();
  const del = useDeleteBroadcastDraft();

  const handle = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn();
      toast(msg, 'success');
    } catch {
      toast('Falha na operação', 'error');
    }
  };

  const totalDone = b.sentCount + b.failedCount;
  const pct = b.totalRecipients > 0 ? Math.round((totalDone / b.totalRecipients) * 100) : 0;

  return (
    <div
      style={{
        background: t.bgElevated,
        border: `1px solid ${t.border}`,
        borderRadius: 12,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: t.text }}>{b.name}</div>
          <div style={{ fontSize: 11.5, color: t.textDim, marginTop: 2 }}>
            {b.connection.name} · {b.template.name}
          </div>
        </div>
        <StatusChip status={b.status} />
      </div>

      <div style={{ display: 'flex', gap: 12, fontSize: 11.5, color: t.textDim }}>
        <Stat label="Total" value={b.totalRecipients} />
        <Stat label="Enviados" value={b.sentCount} color="#10b981" />
        <Stat label="Entregues" value={b.deliveredCount} color="#3b82f6" />
        <Stat label="Lidos" value={b.readCount} color="#a855f7" />
        <Stat label="Falhas" value={b.failedCount} color="#ef4444" />
      </div>

      {b.totalRecipients > 0 && (
        <div style={{ height: 6, background: t.bgInput, borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: t.gold, transition: 'width 200ms' }} />
        </div>
      )}

      <div style={{ fontSize: 11, color: t.textDim }}>
        {b.scheduledAt
          ? `Agendado para ${new Date(b.scheduledAt).toLocaleString('pt-BR')}`
          : b.startedAt
            ? `Iniciado em ${new Date(b.startedAt).toLocaleString('pt-BR')}`
            : 'Imediato'}
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button type="button" onClick={onView} style={btnGhost(t)}>
          Detalhes
        </button>
        {b.status === 'DRAFT' && (
          <>
            <button
              type="button"
              onClick={() => handle(() => start.mutateAsync(b.id), 'Iniciado')}
              style={btnGold(t)}
            >
              Iniciar
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirm('Excluir este rascunho?')) {
                  void handle(() => del.mutateAsync(b.id), 'Excluído');
                }
              }}
              style={btnDanger(t)}
            >
              Excluir
            </button>
          </>
        )}
        {b.status === 'SCHEDULED' && (
          <button
            type="button"
            onClick={() => handle(() => cancel.mutateAsync(b.id), 'Cancelado')}
            style={btnDanger(t)}
          >
            Cancelar
          </button>
        )}
        {b.status === 'SENDING' && (
          <button
            type="button"
            onClick={() => handle(() => pause.mutateAsync(b.id), 'Pausado')}
            style={btnGhost(t)}
          >
            Pausar
          </button>
        )}
        {b.status === 'PAUSED' && (
          <>
            <button
              type="button"
              onClick={() => handle(() => resume.mutateAsync(b.id), 'Retomado')}
              style={btnGold(t)}
            >
              Retomar
            </button>
            <button
              type="button"
              onClick={() => handle(() => cancel.mutateAsync(b.id), 'Cancelado')}
              style={btnDanger(t)}
            >
              Cancelar
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function StatusChip({ status }: { status: BroadcastStatus }) {
  const map: Record<BroadcastStatus, { bg: string; fg: string; label: string }> = {
    DRAFT: { bg: 'rgba(148,163,184,0.18)', fg: '#94a3b8', label: 'Rascunho' },
    SCHEDULED: { bg: 'rgba(59,130,246,0.15)', fg: '#3b82f6', label: 'Agendado' },
    SENDING: { bg: 'rgba(212,175,55,0.20)', fg: '#D4AF37', label: 'Enviando' },
    PAUSED: { bg: 'rgba(245,158,11,0.18)', fg: '#f59e0b', label: 'Pausado' },
    COMPLETED: { bg: 'rgba(16,185,129,0.18)', fg: '#10b981', label: 'Concluído' },
    FAILED: { bg: 'rgba(239,68,68,0.18)', fg: '#ef4444', label: 'Falhou' },
    CANCELLED: { bg: 'rgba(148,163,184,0.18)', fg: '#94a3b8', label: 'Cancelado' },
  };
  const m = map[status];
  return (
    <span
      style={{
        fontSize: 10.5,
        padding: '2px 8px',
        borderRadius: 999,
        background: m.bg,
        color: m.fg,
        fontWeight: 600,
      }}
    >
      {m.label}
    </span>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  const { tokens: t } = useTheme();
  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 600, color: color ?? t.text }}>{value}</div>
      <div style={{ fontSize: 9.5, color: t.textFaint, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
    </div>
  );
}

type Tk = ReturnType<typeof useTheme>['tokens'];
const btnGold = (t: Tk) => ({
  padding: '5px 11px',
  background: t.gold,
  color: '#1a1300',
  border: 'none',
  borderRadius: 6,
  fontSize: 11.5,
  fontWeight: 600,
  cursor: 'pointer' as const,
});
const btnGhost = (t: Tk) => ({
  padding: '5px 11px',
  background: 'transparent',
  color: t.text,
  border: `1px solid ${t.border}`,
  borderRadius: 6,
  fontSize: 11.5,
  cursor: 'pointer' as const,
});
const btnDanger = (t: Tk) => ({
  padding: '5px 11px',
  background: 'transparent',
  color: '#ef4444',
  border: `1px solid rgba(239,68,68,0.4)`,
  borderRadius: 6,
  fontSize: 11.5,
  cursor: 'pointer' as const,
});
