// Drawer de detalhes da campanha: cards de stats em tempo real + tabela
// de recipients com filtro por status e exportação CSV.

import { useState } from 'react';
import { Drawer } from '../../../components/ui/Drawer';
import { useTheme } from '../../../lib/ThemeContext';
import {
  useBroadcast,
  useBroadcastRecipients,
  type BroadcastRecipientStatus,
} from '../../../hooks/useBroadcasts';

export function BroadcastDetail({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { tokens: t } = useTheme();
  const detail = useBroadcast(id);
  const [statusFilter, setStatusFilter] = useState<BroadcastRecipientStatus | ''>('');
  const recipients = useBroadcastRecipients(id, { status: statusFilter || undefined });

  if (!id) return null;
  const b = detail.data;

  const exportCsv = () => {
    if (!recipients.data) return;
    const rows = [['Nome', 'Telefone', 'Status', 'Enviado em', 'Entregue em', 'Lido em', 'Erro']];
    for (const r of recipients.data.data) {
      rows.push([
        r.contact.name,
        r.contact.phone,
        r.status,
        r.sentAt ? new Date(r.sentAt).toLocaleString('pt-BR') : '',
        r.deliveredAt ? new Date(r.deliveredAt).toLocaleString('pt-BR') : '',
        r.readAt ? new Date(r.readAt).toLocaleString('pt-BR') : '',
        r.error ?? '',
      ]);
    }
    const csv = rows
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `disparo-${b?.name ?? id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Drawer open={!!id} onClose={onClose} width={780}>
      {!b ? (
        <div style={{ padding: 20, color: t.textDim }}>Carregando…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: t.text }}>{b.name}</div>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: t.textDim,
                cursor: 'pointer',
                fontSize: 16,
              }}
            >
              ✕
            </button>
          </div>
          <div style={{ fontSize: 11.5, color: t.textDim }}>
            {b.connection.name} · {b.template.name} · Criado por {b.createdBy.name}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
            <Stat label="Total" value={b.totalRecipients} />
            <Stat label="Enviados" value={b.sentCount} color="#10b981" />
            <Stat label="Entregues" value={b.deliveredCount} color="#3b82f6" />
            <Stat label="Lidos" value={b.readCount} color="#a855f7" />
            <Stat label="Falhas" value={b.failedCount} color="#ef4444" />
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as BroadcastRecipientStatus | '')}
              style={input(t)}
            >
              <option value="">Todos os status</option>
              {(['PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'SKIPPED'] as const).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <button type="button" onClick={exportCsv} style={btnGhost(t)}>
              Exportar CSV
            </button>
          </div>

          <div
            style={{
              border: `1px solid ${t.border}`,
              borderRadius: 8,
              overflow: 'auto',
              maxHeight: 480,
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead style={{ background: t.bgInput, position: 'sticky', top: 0 }}>
                <tr>
                  <th style={th(t)}>Contato</th>
                  <th style={th(t)}>Telefone</th>
                  <th style={th(t)}>Status</th>
                  <th style={th(t)}>Enviado</th>
                  <th style={th(t)}>Entregue</th>
                  <th style={th(t)}>Lido</th>
                  <th style={th(t)}>Erro</th>
                </tr>
              </thead>
              <tbody>
                {(recipients.data?.data ?? []).map((r) => (
                  <tr key={r.id} style={{ borderTop: `1px solid ${t.border}` }}>
                    <td style={td(t)}>{r.contact.name}</td>
                    <td style={td(t)}>{r.contact.phone}</td>
                    <td style={td(t)}>{r.status}</td>
                    <td style={td(t)}>{r.sentAt ? new Date(r.sentAt).toLocaleString('pt-BR') : '—'}</td>
                    <td style={td(t)}>{r.deliveredAt ? new Date(r.deliveredAt).toLocaleString('pt-BR') : '—'}</td>
                    <td style={td(t)}>{r.readAt ? new Date(r.readAt).toLocaleString('pt-BR') : '—'}</td>
                    <td style={{ ...td(t), color: r.error ? '#ef4444' : t.text }}>{r.error ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Drawer>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  const { tokens: t } = useTheme();
  return (
    <div
      style={{
        background: t.bgElevated,
        border: `1px solid ${t.border}`,
        borderRadius: 10,
        padding: '10px 12px',
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 700, color: color ?? t.text }}>{value}</div>
      <div style={{ fontSize: 10, color: t.textDim, textTransform: 'uppercase' }}>{label}</div>
    </div>
  );
}

type Tk = ReturnType<typeof useTheme>['tokens'];
const input = (t: Tk) => ({
  padding: '6px 10px',
  borderRadius: 6,
  background: t.bgInput,
  color: t.text,
  border: `1px solid ${t.border}`,
  fontSize: 12.5,
  outline: 'none' as const,
});
const btnGhost = (t: Tk) => ({
  padding: '6px 12px',
  borderRadius: 6,
  background: 'transparent',
  border: `1px solid ${t.border}`,
  color: t.text,
  fontSize: 12,
  cursor: 'pointer' as const,
});
const th = (t: Tk) => ({
  textAlign: 'left' as const,
  padding: '8px 10px',
  fontSize: 10.5,
  textTransform: 'uppercase' as const,
  color: t.textFaint,
  fontWeight: 600,
});
const td = (t: Tk) => ({
  padding: '8px 10px',
  fontSize: 12,
  color: t.text,
});
