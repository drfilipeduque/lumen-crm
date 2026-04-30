// Sub-aba "Logs" — stats cards + filtros + tabela com expansão + retry.

import { useState } from 'react';
import axios from 'axios';
import { useTheme } from '../../lib/ThemeContext';
import { Icons } from '../../components/icons';
import { toast } from '../../components/ui/Toast';
import {
  useAutomationLogStats,
  useAutomationLogs,
  useRetryAutomationLog,
  type AutomationLog,
  type LogStatus,
  type LogType,
} from '../../hooks/useAutomationLogs';

const STATUS_COLORS: Record<LogStatus, { fg: string; bg: string }> = {
  SUCCESS: { fg: '#10b981', bg: 'rgba(16,185,129,0.15)' },
  FAILED: { fg: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
  RUNNING: { fg: '#3b82f6', bg: 'rgba(59,130,246,0.15)' },
  PARTIAL: { fg: '#eab308', bg: 'rgba(234,179,8,0.15)' },
};

const STATUS_LABEL: Record<LogStatus, string> = {
  SUCCESS: 'Sucesso',
  FAILED: 'Falha',
  RUNNING: 'Rodando',
  PARTIAL: 'Parcial',
};

const TYPE_LABEL: Record<LogType, string> = {
  AUTOMATION: 'Automação',
  CADENCE: 'Cadência',
  WEBHOOK: 'Webhook',
};

export function LogsTab() {
  const { tokens: t } = useTheme();
  const [type, setType] = useState<LogType | ''>('');
  const [status, setStatus] = useState<LogStatus | ''>('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [period, setPeriod] = useState<'24h' | '7d' | '30d'>('24h');
  const [expanded, setExpanded] = useState<string | null>(null);

  const stats24h = useAutomationLogStats('24h');
  const stats7d = useAutomationLogStats('7d');
  const stats30d = useAutomationLogStats('30d');

  const list = useAutomationLogs({
    type: type || undefined,
    status: status || undefined,
    search: search || undefined,
    page,
    limit: 30,
  });
  const retry = useRetryAutomationLog();

  const onRetry = async (id: string) => {
    try {
      await retry.mutateAsync(id);
      toast('Reexecução enfileirada', 'success');
    } catch (e) {
      const msg = axios.isAxiosError(e) ? e.response?.data?.message : null;
      toast(msg || 'Falha ao reexecutar', 'error');
    }
  };

  const periodStats = period === '24h' ? stats24h : period === '7d' ? stats7d : stats30d;

  return (
    <div style={{ padding: '20px 32px 40px' }}>
      {/* Stats cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        <StatsCard
          t={t}
          label="Sucesso 24h"
          value={stats24h.data ? `${Math.round(stats24h.data.successRate * 100)}%` : '—'}
          subtitle={stats24h.data ? `${stats24h.data.success}/${stats24h.data.total}` : ''}
        />
        <StatsCard
          t={t}
          label="Sucesso 7d"
          value={stats7d.data ? `${Math.round(stats7d.data.successRate * 100)}%` : '—'}
          subtitle={stats7d.data ? `${stats7d.data.success}/${stats7d.data.total}` : ''}
        />
        <StatsCard
          t={t}
          label="Sucesso 30d"
          value={stats30d.data ? `${Math.round(stats30d.data.successRate * 100)}%` : '—'}
          subtitle={stats30d.data ? `${stats30d.data.success}/${stats30d.data.total}` : ''}
        />
        <StatsCard
          t={t}
          label={`Total ${period}`}
          value={periodStats.data ? String(periodStats.data.total) : '—'}
          subtitle={periodStats.data ? `${periodStats.data.failed} falhas` : ''}
          accent
          rightAction={
            <select value={period} onChange={(e) => setPeriod(e.target.value as '24h' | '7d' | '30d')} style={smallSelect(t)}>
              <option value="24h">24h</option>
              <option value="7d">7d</option>
              <option value="30d">30d</option>
            </select>
          }
        />
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <select
          value={type}
          onChange={(e) => {
            setPage(1);
            setType(e.target.value as LogType | '');
          }}
          style={selectStyle(t)}
        >
          <option value="">Todos os tipos</option>
          <option value="AUTOMATION">Automação</option>
          <option value="CADENCE">Cadência</option>
          <option value="WEBHOOK">Webhook</option>
        </select>
        <select
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value as LogStatus | '');
          }}
          style={selectStyle(t)}
        >
          <option value="">Todos status</option>
          <option value="SUCCESS">Sucesso</option>
          <option value="FAILED">Falha</option>
          <option value="PARTIAL">Parcial</option>
          <option value="RUNNING">Rodando</option>
        </select>
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
          placeholder="Buscar trigger/erro…"
          style={{ ...selectStyle(t), minWidth: 240 }}
        />
      </div>

      {/* Tabela */}
      {list.isLoading ? (
        <div style={{ color: t.textFaint, fontSize: 13, padding: 24 }}>Carregando…</div>
      ) : !list.data || list.data.data.length === 0 ? (
        <div
          style={{
            border: `1px dashed ${t.border}`,
            borderRadius: 10,
            padding: 60,
            textAlign: 'center',
            color: t.textDim,
            fontSize: 13,
          }}
        >
          Nenhuma execução registrada.
        </div>
      ) : (
        <div style={{ border: `1px solid ${t.border}`, borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: t.bgElevated }}>
                <Th t={t}>Data</Th>
                <Th t={t}>Origem</Th>
                <Th t={t}>Tipo</Th>
                <Th t={t}>Trigger</Th>
                <Th t={t}>Status</Th>
                <Th t={t}>Tempo</Th>
                <Th t={t}>Ações</Th>
              </tr>
            </thead>
            <tbody>
              {list.data.data.map((log) => (
                <LogRow
                  key={log.id}
                  log={log}
                  expanded={expanded === log.id}
                  onToggle={() => setExpanded((cur) => (cur === log.id ? null : log.id))}
                  onRetry={() => onRetry(log.id)}
                  retrying={retry.isPending}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Paginação */}
      {list.data && list.data.totalPages > 1 ? (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 14 }}>
          <button type="button" disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))} style={btnSmall(t)}>
            ← Anterior
          </button>
          <span style={{ fontSize: 12, color: t.textDim, alignSelf: 'center' }}>
            Página {list.data.page} de {list.data.totalPages}
          </span>
          <button
            type="button"
            disabled={list.data && page >= list.data.totalPages}
            onClick={() => setPage((p) => p + 1)}
            style={btnSmall(t)}
          >
            Próxima →
          </button>
        </div>
      ) : null}
    </div>
  );
}

// =================================================================

function LogRow({
  log,
  expanded,
  onToggle,
  onRetry,
  retrying,
}: {
  log: AutomationLog;
  expanded: boolean;
  onToggle: () => void;
  onRetry: () => void;
  retrying: boolean;
}) {
  const { tokens: t } = useTheme();
  const c = STATUS_COLORS[log.status];
  const automationName = log.automation?.name ?? (log.type === 'WEBHOOK' ? 'Webhook' : log.type === 'CADENCE' ? 'Cadência' : log.entityId);

  return (
    <>
      <tr
        onClick={onToggle}
        style={{
          borderTop: `1px solid ${t.border}`,
          cursor: 'pointer',
          background: expanded ? t.bgElevated : 'transparent',
        }}
      >
        <Td t={t}>
          <span title={new Date(log.startedAt).toLocaleString('pt-BR')}>{formatRel(log.startedAt)}</span>
        </Td>
        <Td t={t}>
          <span style={{ fontSize: 12, fontWeight: 500, color: t.text }}>{automationName}</span>
        </Td>
        <Td t={t}>
          <span
            style={{
              fontSize: 10,
              padding: '2px 7px',
              borderRadius: 999,
              background: t.bgInput,
              color: t.textDim,
              border: `1px solid ${t.border}`,
            }}
          >
            {TYPE_LABEL[log.type]}
          </span>
        </Td>
        <Td t={t}>
          <span style={{ fontFamily: 'monospace', fontSize: 11, color: t.textDim }}>{log.trigger}</span>
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
            {STATUS_LABEL[log.status]}
          </span>
        </Td>
        <Td t={t}>{log.executionTime ? `${log.executionTime}ms` : '—'}</Td>
        <Td t={t}>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRetry();
              }}
              disabled={retrying}
              style={btnSmall(t)}
              title="Reexecutar"
            >
              ↻
            </button>
            <button type="button" onClick={onToggle} style={btnSmall(t)} title="Detalhes">
              {expanded ? '▼' : '▶'}
            </button>
          </div>
        </Td>
      </tr>
      {expanded ? (
        <tr style={{ borderTop: `1px solid ${t.border}`, background: t.bgElevated }}>
          <td colSpan={7} style={{ padding: '14px 18px' }}>
            <LogDetails log={log} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function LogDetails({ log }: { log: AutomationLog }) {
  const { tokens: t } = useTheme();
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      {/* Steps */}
      <div>
        <SectionTitle t={t}>Steps</SectionTitle>
        {!log.steps || log.steps.length === 0 ? (
          <div style={{ fontSize: 11.5, color: t.textFaint }}>Nenhum step registrado.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {log.steps.map((s, i) => {
              const ok = s.status === 'success';
              const failed = s.status === 'failed';
              return (
                <div
                  key={`${s.nodeId}-${i}`}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 6,
                    background: ok ? 'rgba(16,185,129,0.10)' : failed ? 'rgba(239,68,68,0.10)' : t.bg,
                    border: `1px solid ${t.border}`,
                    fontSize: 11.5,
                  }}
                >
                  <div style={{ fontWeight: 600, color: t.text }}>
                    {s.subtype} <span style={{ color: t.textFaint, fontWeight: 400 }}>({s.type})</span>
                  </div>
                  <div style={{ fontSize: 10.5, color: t.textDim, marginTop: 2 }}>
                    Status: <span style={{ color: ok ? '#10b981' : failed ? '#ef4444' : t.text }}>{s.status}</span>
                    {' · '}
                    {s.durationMs}ms
                  </div>
                  {s.error ? (
                    <div style={{ fontSize: 10.5, color: '#ef4444', marginTop: 2 }}>{s.error}</div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {/* Input/Output/Error */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <CodeBlock t={t} label="Input" content={log.input} />
        <CodeBlock t={t} label="Output" content={log.output} />
        {log.error ? (
          <div>
            <SectionTitle t={t}>Erro</SectionTitle>
            <pre
              style={{
                margin: 0,
                padding: 8,
                fontSize: 11,
                fontFamily: 'monospace',
                color: '#ef4444',
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.25)',
                borderRadius: 6,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                maxHeight: 200,
                overflow: 'auto',
              }}
            >
              {log.error}
            </pre>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CodeBlock({ t, label, content }: { t: ReturnType<typeof useTheme>['tokens']; label: string; content: unknown }) {
  if (content === null || content === undefined) return null;
  const txt = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
  return (
    <div>
      <SectionTitle t={t}>{label}</SectionTitle>
      <pre
        style={{
          margin: 0,
          padding: 8,
          fontSize: 10.5,
          fontFamily: 'monospace',
          color: t.text,
          background: t.bgInput,
          border: `1px solid ${t.border}`,
          borderRadius: 6,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          maxHeight: 200,
          overflow: 'auto',
        }}
      >
        {txt}
      </pre>
    </div>
  );
}

function SectionTitle({ t, children }: { t: ReturnType<typeof useTheme>['tokens']; children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10.5,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        color: t.textFaint,
        fontWeight: 600,
        marginBottom: 4,
      }}
    >
      {children}
    </div>
  );
}

function StatsCard({
  t,
  label,
  value,
  subtitle,
  accent,
  rightAction,
}: {
  t: ReturnType<typeof useTheme>['tokens'];
  label: string;
  value: string;
  subtitle?: string;
  accent?: boolean;
  rightAction?: React.ReactNode;
}) {
  return (
    <div
      style={{
        border: `1px solid ${accent ? t.gold : t.border}`,
        borderRadius: 10,
        background: t.bgElevated,
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 10.5, color: t.textFaint, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</span>
        {rightAction}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: t.text }}>{value}</div>
      {subtitle ? <div style={{ fontSize: 11, color: t.textDim }}>{subtitle}</div> : null}
    </div>
  );
}

function Th({ t, children }: { t: ReturnType<typeof useTheme>['tokens']; children: React.ReactNode }) {
  return (
    <th
      style={{
        padding: '10px 12px',
        textAlign: 'left',
        fontSize: 10.5,
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
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return 'agora';
  if (diff < 3_600_000) return `há ${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `há ${Math.floor(diff / 3_600_000)}h`;
  if (diff < 30 * 86_400_000) return `há ${Math.floor(diff / 86_400_000)}d`;
  return d.toLocaleDateString('pt-BR');
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
const smallSelect = (t: Tk) => ({
  padding: '2px 6px',
  borderRadius: 5,
  background: t.bgInput,
  color: t.text,
  border: `1px solid ${t.border}`,
  fontSize: 10.5,
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

void Icons;
