// Visão Geral da conexão oficial: dados técnicos, métricas, rotacionar token.

import { useState, type CSSProperties } from 'react';
import axios from 'axios';
import { useTheme } from '../../../lib/ThemeContext';
import { Modal } from '../../../components/ui/Modal';
import { toast } from '../../../components/ui/Toast';
import { Icons } from '../../../components/icons';
import { FONT_STACK } from '../../../lib/theme';
import {
  useConnectionMetrics,
  useUpdateOfficialConnection,
  useVerifyConnection,
  type WAConnection,
} from '../../../hooks/useWhatsApp';

export function OverviewTab({ connection }: { connection: WAConnection }) {
  const { tokens: t } = useTheme();
  const metrics = useConnectionMetrics(connection.id);
  const verify = useVerifyConnection();
  const update = useUpdateOfficialConnection();
  const [rotating, setRotating] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(connection.name);

  const saveName = async () => {
    if (!name.trim() || name === connection.name) {
      setEditingName(false);
      setName(connection.name);
      return;
    }
    try {
      await update.mutateAsync({ id: connection.id, name: name.trim() });
      toast('Nome atualizado', 'success');
      setEditingName(false);
    } catch (e) {
      toast(axiosMsg(e) || 'Falha ao salvar', 'error');
    }
  };

  return (
    <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Cabeçalho com nome editável */}
      <div style={panelStyle(t)}>
        <div style={{ fontSize: 11, color: t.textFaint, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 6 }}>
          Nome de exibição
        </div>
        {editingName ? (
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveName();
                if (e.key === 'Escape') {
                  setEditingName(false);
                  setName(connection.name);
                }
              }}
              style={inputStyle(t)}
            />
            <button type="button" onClick={saveName} style={buttonGold(t)}>
              Salvar
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: t.text }}>{connection.name}</div>
            <button
              type="button"
              onClick={() => setEditingName(true)}
              style={{
                background: 'transparent',
                border: 'none',
                color: t.textDim,
                cursor: 'pointer',
                padding: 4,
                display: 'flex',
                alignItems: 'center',
              }}
              title="Editar"
            >
              <Icons.Edit s={13} />
            </button>
          </div>
        )}
      </div>

      {/* Dados técnicos */}
      <Section title="Dados técnicos">
        <Row label="WABA ID" value={connection.wabaId ?? '—'} mono />
        <Row label="Phone Number ID" value={connection.phoneNumberId ?? '—'} mono />
        <Row label="Número" value={connection.phone ?? '—'} />
        <Row label="Nome verificado" value={connection.profileName ?? '—'} />
        <Row label="Modo" value={connection.coexistenceMode ? 'Coexistência' : 'API Exclusiva'} />
        <Row label="Access Token" value="••••••••••••••••••••••••" mono />
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button
            type="button"
            disabled={verify.isPending}
            onClick={async () => {
              try {
                await verify.mutateAsync(connection.id);
                toast('Credenciais revalidadas', 'success');
              } catch (e) {
                toast(axiosMsg(e) || 'Falha ao revalidar', 'error');
              }
            }}
            style={buttonGhost(t)}
          >
            {verify.isPending ? 'Validando…' : 'Revalidar credenciais'}
          </button>
          <button type="button" onClick={() => setRotating(true)} style={buttonGhost(t)}>
            Rotacionar token
          </button>
        </div>
      </Section>

      {/* Métricas */}
      <Section title="Métricas (últimas 24h)">
        {metrics.isLoading ? (
          <div style={{ color: t.textDim, fontSize: 12.5 }}>Carregando…</div>
        ) : metrics.data ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            <Metric label="Recebidas" value={metrics.data.last24h.received} />
            <Metric label="Enviadas" value={metrics.data.last24h.sent} />
            <Metric label="Conversas abertas" value={metrics.data.openConversations} />
          </div>
        ) : (
          <div style={{ color: t.textDim, fontSize: 12.5 }}>Sem dados.</div>
        )}
        <div style={{ marginTop: 12, fontSize: 11.5, color: t.textSubtle }}>
          Tier de qualidade: <strong style={{ color: t.text }}>{connection.qualityTier ?? 'Não classificado'}</strong>
        </div>
      </Section>

      {rotating && <RotateTokenModal connectionId={connection.id} onClose={() => setRotating(false)} />}
    </div>
  );
}

// =====================================================================
// Rotate token
// =====================================================================

function RotateTokenModal({ connectionId, onClose }: { connectionId: string; onClose: () => void }) {
  const { tokens: t } = useTheme();
  const update = useUpdateOfficialConnection();
  const [token, setToken] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!token.trim() || token.length < 20) {
      return setErr('Cole o novo Access Token completo');
    }
    setErr(null);
    try {
      await update.mutateAsync({ id: connectionId, accessToken: token.trim() });
      toast('Token rotacionado', 'success');
      onClose();
    } catch (e) {
      setErr(axiosMsg(e) || 'Falha ao rotacionar');
    }
  };

  return (
    <Modal open onClose={onClose} title="Rotacionar Access Token" width={460}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 12.5, color: t.textSubtle, lineHeight: 1.5 }}>
          O token atual será substituído. A gente valida o novo na Meta antes de salvar.
        </div>
        <textarea
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Novo Access Token"
          rows={3}
          style={{
            ...inputStyle(t),
            fontFamily: 'ui-monospace, monospace',
            fontSize: 11.5,
            resize: 'vertical',
            minHeight: 80,
          }}
        />
        {err && (
          <div
            style={{
              fontSize: 12,
              background: 'rgba(248,81,73,0.08)',
              border: `1px solid rgba(248,81,73,0.32)`,
              color: t.danger,
              padding: '8px 11px',
              borderRadius: 7,
            }}
          >
            {err}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onClose} style={buttonGhost(t)}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={update.isPending}
            style={{ ...buttonGold(t), opacity: update.isPending ? 0.6 : 1 }}
          >
            {update.isPending ? 'Validando…' : 'Rotacionar'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// =====================================================================
// PRIMITIVES
// =====================================================================

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { tokens: t } = useTheme();
  return (
    <div style={panelStyle(t)}>
      <div
        style={{
          fontSize: 11,
          color: t.textFaint,
          letterSpacing: 0.4,
          textTransform: 'uppercase',
          fontWeight: 600,
          marginBottom: 10,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const { tokens: t } = useTheme();
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '160px 1fr',
        padding: '6px 0',
        fontSize: 12.5,
        borderBottom: `1px solid ${t.borderFaint ?? t.border}`,
      }}
    >
      <div style={{ color: t.textDim }}>{label}</div>
      <div
        style={{
          color: t.text,
          fontFamily: mono ? 'ui-monospace, monospace' : FONT_STACK,
          fontSize: mono ? 11.5 : 12.5,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  const { tokens: t } = useTheme();
  return (
    <div
      style={{
        background: t.bgInput,
        border: `1px solid ${t.border}`,
        borderRadius: 8,
        padding: 12,
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 700, color: t.text }}>{value}</div>
      <div style={{ fontSize: 10.5, color: t.textDim, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {label}
      </div>
    </div>
  );
}

function panelStyle(t: ReturnType<typeof useTheme>['tokens']): CSSProperties {
  return {
    padding: 16,
    background: t.bgElevated,
    border: `1px solid ${t.border}`,
    borderRadius: 10,
  };
}

function inputStyle(t: ReturnType<typeof useTheme>['tokens']): CSSProperties {
  return {
    width: '100%',
    background: t.bgInput,
    border: `1px solid ${t.border}`,
    borderRadius: 8,
    padding: '9px 12px',
    fontSize: 13,
    color: t.text,
    outline: 'none',
    fontFamily: FONT_STACK,
  };
}

function buttonGold(t: ReturnType<typeof useTheme>['tokens']): CSSProperties {
  return {
    background: t.gold,
    color: '#1a1300',
    border: 'none',
    borderRadius: 7,
    padding: '8px 14px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: FONT_STACK,
  };
}

function buttonGhost(t: ReturnType<typeof useTheme>['tokens']): CSSProperties {
  return {
    background: 'transparent',
    color: t.text,
    border: `1px solid ${t.border}`,
    borderRadius: 7,
    padding: '7px 12px',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: FONT_STACK,
  };
}

function axiosMsg(e: unknown): string | null {
  return axios.isAxiosError(e) ? (e.response?.data?.message ?? null) : null;
}
