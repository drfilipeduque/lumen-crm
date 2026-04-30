// Drawer com tabela de execuções de uma Cadência.
// Filtros por status, ações pause/resume/cancel.

import { useState } from 'react';
import axios from 'axios';
import { useTheme } from '../../lib/ThemeContext';
import { Drawer } from '../../components/ui/Drawer';
import { Icons } from '../../components/icons';
import { toast } from '../../components/ui/Toast';
import {
  useCadenceExecutions,
  useCadenceStats,
  useCancelExecution,
  usePauseExecution,
  useResumeExecution,
  type Cadence,
  type CadenceExecStatus,
} from '../../hooks/useCadences';

const STATUS_OPTIONS: { value: CadenceExecStatus | ''; label: string }[] = [
  { value: '', label: 'Todas' },
  { value: 'ACTIVE', label: 'Ativas' },
  { value: 'PAUSED', label: 'Pausadas' },
  { value: 'COMPLETED', label: 'Concluídas' },
  { value: 'CANCELLED', label: 'Canceladas' },
  { value: 'FAILED', label: 'Falhas' },
];

const STATUS_COLORS: Record<CadenceExecStatus, { fg: string; bg: string }> = {
  ACTIVE: { fg: '#10b981', bg: '#10b98122' },
  PAUSED: { fg: '#eab308', bg: '#eab30822' },
  COMPLETED: { fg: '#3b82f6', bg: '#3b82f622' },
  CANCELLED: { fg: '#94a3b8', bg: '#94a3b822' },
  FAILED: { fg: '#ef4444', bg: '#ef444422' },
};

const STATUS_LABEL: Record<CadenceExecStatus, string> = {
  ACTIVE: 'Ativa',
  PAUSED: 'Pausada',
  COMPLETED: 'Concluída',
  CANCELLED: 'Cancelada',
  FAILED: 'Falhou',
};

export function CadenceExecutionsScreen({
  cadence,
  onClose,
}: {
  cadence: Cadence;
  onClose: () => void;
}) {
  const { tokens: t } = useTheme();
  const [status, setStatus] = useState<CadenceExecStatus | ''>('');
  const [page, setPage] = useState(1);
  const { data, isLoading, refetch } = useCadenceExecutions(cadence.id, {
    status: status || undefined,
    page,
    limit: 20,
  });
  const stats = useCadenceStats(cadence.id);
  const pause = usePauseExecution();
  const resume = useResumeExecution();
  const cancel = useCancelExecution();

  const onPause = async (id: string) => {
    try {
      await pause.mutateAsync(id);
      toast('Execução pausada', 'success');
    } catch (e) {
      const msg = axios.isAxiosError(e) ? e.response?.data?.message : null;
      toast(msg || 'Falha ao pausar', 'error');
    }
  };
  const onResume = async (id: string) => {
    try {
      await resume.mutateAsync(id);
      toast('Execução retomada', 'success');
    } catch (e) {
      const msg = axios.isAxiosError(e) ? e.response?.data?.message : null;
      toast(msg || 'Falha ao retomar', 'error');
    }
  };
  const onCancel = async (id: string) => {
    try {
      await cancel.mutateAsync(id);
      toast('Execução cancelada', 'success');
    } catch (e) {
      const msg = axios.isAxiosError(e) ? e.response?.data?.message : null;
      toast(msg || 'Falha ao cancelar', 'error');
    }
  };

  const cancelAllActive = async () => {
    if (!data) return;
    if (!confirm('Cancelar TODAS as execuções ativas e pausadas?')) return;
    let ok = 0;
    for (const ex of data.data) {
      if (ex.status === 'ACTIVE' || ex.status === 'PAUSED') {
        try {
          await cancel.mutateAsync(ex.id);
          ok++;
        } catch {
          //
        }
      }
    }
    toast(`${ok} execuções canceladas`, 'success');
    refetch();
  };

  return (
    <Drawer open onClose={onClose} width={780}>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: t.bg, color: t.text }}>
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: 16, margin: 0, fontWeight: 600 }}>Execuções — {cadence.name}</h2>
            {stats.data ? (
              <div style={{ fontSize: 12, color: t.textDim, marginTop: 4 }}>
                {stats.data.totalStarted} iniciadas · {stats.data.active} ativas · {stats.data.paused} pausadas ·{' '}
                {stats.data.completed} concluídas · {Math.round(stats.data.replyRate * 100)}% taxa de resposta
              </div>
            ) : null}
          </div>
          <button type="button" onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: t.textDim }}>
            <Icons.X s={16} c={t.textDim} />
          </button>
        </div>

        <div style={{ padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: `1px solid ${t.border}` }}>
          <select value={status} onChange={(e) => { setPage(1); setStatus(e.target.value as CadenceExecStatus | ''); }} style={selectStyle(t)}>
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <div style={{ flex: 1 }} />
          <button type="button" onClick={cancelAllActive} style={btnDanger(t)}>
            Cancelar todas ativas
          </button>
        </div>

        <div style={{ flex: 1, overflow: 'auto' }}>
          {isLoading ? (
            <div style={{ padding: 40, color: t.textFaint, fontSize: 13 }}>Carregando…</div>
          ) : !data || data.data.length === 0 ? (
            <div style={{ padding: 40, color: t.textDim, fontSize: 13 }}>Nenhuma execução por enquanto.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ background: t.bgElevated }}>
                  <Th t={t}>Contato</Th>
                  <Th t={t}>Oportunidade</Th>
                  <Th t={t}>Step</Th>
                  <Th t={t}>Status</Th>
                  <Th t={t}>Próxima</Th>
                  <Th t={t}>Iniciada</Th>
                  <Th t={t}>Pausa</Th>
                  <Th t={t}>Ações</Th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((ex) => {
                  const total = cadence.messages?.length ?? 0;
                  const c = STATUS_COLORS[ex.status];
                  return (
                    <tr key={ex.id} style={{ borderTop: `1px solid ${t.border}` }}>
                      <Td t={t}>{ex.contact?.name ?? '—'}</Td>
                      <Td t={t}>{ex.opportunity?.title ?? '—'}</Td>
                      <Td t={t}>
                        {ex.currentStep + (ex.status === 'COMPLETED' ? 0 : 1)}/{total}
                      </Td>
                      <Td t={t}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: 999,
                            fontSize: 10.5,
                            color: c.fg,
                            background: c.bg,
                            fontWeight: 600,
                          }}
                        >
                          {STATUS_LABEL[ex.status]}
                        </span>
                      </Td>
                      <Td t={t}>{ex.nextExecutionAt ? formatRel(ex.nextExecutionAt) : '—'}</Td>
                      <Td t={t}>{formatRel(ex.createdAt)}</Td>
                      <Td t={t}>
                        <span style={{ color: t.textDim, fontSize: 11 }}>{ex.pauseReason ?? ''}</span>
                      </Td>
                      <Td t={t}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {ex.status === 'ACTIVE' ? (
                            <button type="button" onClick={() => onPause(ex.id)} style={btnSmall(t)}>
                              Pausar
                            </button>
                          ) : null}
                          {ex.status === 'PAUSED' ? (
                            <button type="button" onClick={() => onResume(ex.id)} style={btnSmall(t)}>
                              Retomar
                            </button>
                          ) : null}
                          {(ex.status === 'ACTIVE' || ex.status === 'PAUSED') ? (
                            <button type="button" onClick={() => onCancel(ex.id)} style={{ ...btnSmall(t), color: '#ef4444' }}>
                              Cancelar
                            </button>
                          ) : null}
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {data && data.totalPages > 1 ? (
          <div style={{ padding: 12, display: 'flex', justifyContent: 'center', gap: 8, borderTop: `1px solid ${t.border}` }}>
            <button type="button" disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))} style={btnSmall(t)}>
              ← Anterior
            </button>
            <span style={{ fontSize: 12, color: t.textDim, alignSelf: 'center' }}>
              Página {data.page} de {data.totalPages}
            </span>
            <button type="button" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)} style={btnSmall(t)}>
              Próxima →
            </button>
          </div>
        ) : null}
      </div>
    </Drawer>
  );
}

function Th({ t, children }: { t: ReturnType<typeof useTheme>['tokens']; children: React.ReactNode }) {
  return (
    <th
      style={{
        padding: '10px 12px',
        textAlign: 'left',
        fontSize: 11,
        fontWeight: 500,
        color: t.textDim,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
      }}
    >
      {children}
    </th>
  );
}
function Td({ t: _t, children }: { t: ReturnType<typeof useTheme>['tokens']; children: React.ReactNode }) {
  return <td style={{ padding: '8px 12px' }}>{children}</td>;
}

function formatRel(iso: string): string {
  const d = new Date(iso);
  const diff = d.getTime() - Date.now();
  const abs = Math.abs(diff);
  const past = diff < 0;
  if (abs < 60_000) return past ? 'agora' : 'em segundos';
  if (abs < 3_600_000) {
    const m = Math.round(abs / 60_000);
    return past ? `há ${m}m` : `em ${m}m`;
  }
  if (abs < 86_400_000) {
    const h = Math.round(abs / 3_600_000);
    return past ? `há ${h}h` : `em ${h}h`;
  }
  const days = Math.round(abs / 86_400_000);
  return past ? `há ${days}d` : `em ${days}d`;
}

type Tk = ReturnType<typeof useTheme>['tokens'];
const selectStyle = (t: Tk) => ({
  padding: '7px 10px',
  borderRadius: 7,
  background: t.bgInput,
  color: t.text,
  border: `1px solid ${t.border}`,
  fontSize: 12,
  outline: 'none' as const,
});
const btnSmall = (t: Tk) => ({
  padding: '4px 8px',
  fontSize: 11,
  borderRadius: 6,
  background: t.bgInput,
  color: t.text,
  border: `1px solid ${t.border}`,
  cursor: 'pointer' as const,
});
const btnDanger = (t: Tk) => ({
  padding: '6px 12px',
  borderRadius: 7,
  background: 'transparent',
  color: '#ef4444',
  border: `1px solid rgba(239,68,68,0.3)`,
  fontSize: 12,
  cursor: 'pointer' as const,
});
