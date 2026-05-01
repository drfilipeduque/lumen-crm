// Lista de mensagens agendadas pra um contato ou oportunidade.
// Pendentes ficam expandidas; enviadas/canceladas ficam atrás de um collapse.

import { useState } from 'react';
import { useTheme } from '../../lib/ThemeContext';
import { Icons } from '../../components/icons';
import { toast } from '../ui/Toast';
import {
  useCancelScheduledMessage,
  useScheduledMessages,
  type ScheduledMessage,
  type ScheduledStatus,
} from '../../hooks/useScheduledMessages';
import { ScheduledMessageModal } from './ScheduledMessageModal';

export function ScheduledMessagesList({
  contactId,
  opportunityId,
}: {
  contactId: string;
  opportunityId?: string | null;
}) {
  const { tokens: t } = useTheme();
  const list = useScheduledMessages(opportunityId ? { opportunityId } : { contactId });
  const cancel = useCancelScheduledMessage();
  const [showHistory, setShowHistory] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ScheduledMessage | null>(null);

  const all = list.data?.data ?? [];
  const pending = all.filter((m) => m.status === 'PENDING');
  const history = all.filter((m) => m.status !== 'PENDING');

  const handleCancel = async (id: string) => {
    if (!confirm('Cancelar essa mensagem agendada?')) return;
    try {
      await cancel.mutateAsync(id);
      toast('Mensagem cancelada', 'success');
    } catch {
      toast('Falha ao cancelar', 'error');
    }
  };

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={() => setCreating(true)}
          style={{
            padding: '7px 12px',
            background: t.gold,
            color: '#1a1300',
            border: 'none',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Icons.Plus s={11} c="#1a1300" /> Agendar mensagem
        </button>
      </div>

      {list.isLoading ? (
        <div style={{ fontSize: 12, color: t.textDim }}>Carregando…</div>
      ) : pending.length === 0 && history.length === 0 ? (
        <div
          style={{
            padding: 20,
            textAlign: 'center',
            border: `1px dashed ${t.border}`,
            borderRadius: 10,
            fontSize: 12.5,
            color: t.textSubtle,
          }}
        >
          Nenhuma mensagem agendada.
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pending.map((m) => (
                <Card
                  key={m.id}
                  m={m}
                  onEdit={() => setEditing(m)}
                  onCancel={() => handleCancel(m.id)}
                />
              ))}
            </div>
          )}
          {history.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                type="button"
                onClick={() => setShowHistory((v) => !v)}
                style={{
                  alignSelf: 'flex-start',
                  background: 'transparent',
                  border: 'none',
                  color: t.textDim,
                  fontSize: 11.5,
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                {showHistory ? '▾' : '▸'} Histórico ({history.length})
              </button>
              {showHistory &&
                history.map((m) => <Card key={m.id} m={m} historical />)}
            </div>
          )}
        </>
      )}

      <ScheduledMessageModal
        open={creating || !!editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        contactId={contactId}
        opportunityId={opportunityId ?? null}
        editing={editing}
      />
    </div>
  );
}

function Card({
  m,
  historical,
  onEdit,
  onCancel,
}: {
  m: ScheduledMessage;
  historical?: boolean;
  onEdit?: () => void;
  onCancel?: () => void;
}) {
  const { tokens: t } = useTheme();
  return (
    <div
      style={{
        padding: 12,
        borderRadius: 10,
        background: t.bgElevated,
        border: `1px solid ${t.border}`,
        opacity: historical ? 0.7 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 14 }}>{typeIcon(m.contentType)}</span>
        <div style={{ flex: 1, fontSize: 12.5, color: t.text }}>{previewLabel(m)}</div>
        <StatusChip status={m.status} />
      </div>
      <div style={{ fontSize: 11.5, color: t.text, marginBottom: 4 }}>
        {previewContent(m)}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: t.textDim }}>
        <span>{relativeFromNow(m.scheduledAt)}</span>
        <span>·</span>
        <span style={{ fontFamily: 'monospace' }}>{m.connection.name}</span>
        <span
          style={{
            fontSize: 10,
            padding: '1px 6px',
            borderRadius: 999,
            background: m.connection.type === 'OFFICIAL' ? 'rgba(212,175,55,0.15)' : 'rgba(148,163,184,0.18)',
            color: m.connection.type === 'OFFICIAL' ? '#D4AF37' : t.textDim,
            fontWeight: 600,
          }}
        >
          {m.connection.type === 'OFFICIAL' ? 'OFICIAL' : 'NÃO OFICIAL'}
        </span>
        {m.error && (
          <span title={m.error} style={{ color: '#ef4444' }}>· erro: {truncate(m.error, 40)}</span>
        )}
      </div>
      {!historical && (onEdit || onCancel) && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              style={{
                padding: '5px 10px',
                background: 'transparent',
                border: `1px solid ${t.border}`,
                borderRadius: 6,
                fontSize: 11,
                color: t.text,
                cursor: 'pointer',
              }}
            >
              Editar
            </button>
          )}
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: '5px 10px',
                background: 'transparent',
                border: `1px solid rgba(239,68,68,0.4)`,
                borderRadius: 6,
                fontSize: 11,
                color: '#ef4444',
                cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function StatusChip({ status }: { status: ScheduledStatus }) {
  const map: Record<ScheduledStatus, { label: string; bg: string; fg: string }> = {
    PENDING: { label: 'Pendente', bg: 'rgba(59,130,246,0.15)', fg: '#3b82f6' },
    SENT: { label: 'Enviada', bg: 'rgba(16,185,129,0.15)', fg: '#10b981' },
    FAILED: { label: 'Falhou', bg: 'rgba(239,68,68,0.15)', fg: '#ef4444' },
    CANCELLED: { label: 'Cancelada', bg: 'rgba(148,163,184,0.18)', fg: '#94a3b8' },
  };
  const m = map[status];
  return (
    <span
      style={{
        fontSize: 10.5,
        padding: '1px 8px',
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

function typeIcon(t: ScheduledMessage['contentType']): string {
  if (t === 'TEMPLATE') return '📋';
  if (t === 'SCRIPT') return '📜';
  return '💬';
}

function previewLabel(m: ScheduledMessage): string {
  if (m.contentType === 'TEMPLATE') return 'Template oficial';
  if (m.contentType === 'SCRIPT') return 'Script';
  return 'Texto livre';
}

function previewContent(m: ScheduledMessage): string {
  if (m.contentType === 'TEXT') return truncate(m.content, 120);
  return m.contentType === 'TEMPLATE' ? `ID: ${m.content}` : `Script: ${m.content}`;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function relativeFromNow(iso: string): string {
  const d = new Date(iso);
  const diffMs = d.getTime() - Date.now();
  const past = diffMs < 0;
  const abs = Math.abs(diffMs);
  const min = Math.round(abs / 60_000);
  const h = Math.round(abs / 3_600_000);
  const day = Math.round(abs / 86_400_000);
  let rel: string;
  if (abs < 60_000) rel = past ? 'há menos de 1min' : 'em menos de 1min';
  else if (min < 60) rel = past ? `há ${min}min` : `em ${min}min`;
  else if (h < 24) rel = past ? `há ${h}h` : `em ${h}h`;
  else rel = past ? `há ${day}d` : `em ${day}d`;
  const stamp = d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  return `${past ? 'Era pra' : 'Será enviada'} ${rel} (${stamp})`;
}
