// Aba "Roteamento" — configura defaults globais usados pelas actions de envio
// de WhatsApp em automações quando não há override no fluxo.

import { useEffect, useState } from 'react';
import { useTheme } from '../../lib/ThemeContext';
import { useWhatsAppConnections } from '../../hooks/useWhatsApp';
import { useTemplates } from '../../hooks/useTemplates';
import {
  useRoutingConfig,
  useUpdateRoutingConfig,
  type RoutingStrategy,
} from '../../hooks/useWhatsAppRouting';
import { useAuthStore } from '../../stores/useAuthStore';
import { toast } from '../../components/ui/Toast';
import { FONT_STACK } from '../../lib/theme';

const STRATEGY_DESCRIPTIONS: Record<RoutingStrategy, string> = {
  OFFICIAL_FIRST:
    'Tenta primeiro pela conexão Oficial (Meta) e cai pra não oficial se falhar.',
  UNOFFICIAL_FIRST:
    'Tenta primeiro pela conexão Não Oficial (Baileys) e cai pra Oficial se falhar.',
  OFFICIAL_ONLY: 'Usa apenas conexões Oficiais (Meta).',
  UNOFFICIAL_ONLY: 'Usa apenas conexões Não Oficiais (Baileys).',
};

export function RoutingTab() {
  const { tokens: t } = useTheme();
  const me = useAuthStore((s) => s.user);
  const isAdmin = me?.role === 'ADMIN';
  const config = useRoutingConfig();
  const update = useUpdateRoutingConfig();
  const connections = useWhatsAppConnections();
  const officialConnections = (connections.data ?? []).filter((c) => c.type === 'OFFICIAL');

  const [defaultConnectionId, setDefaultConnectionId] = useState<string>('');
  const [strategy, setStrategy] = useState<RoutingStrategy>('OFFICIAL_FIRST');
  const [fallbackTemplateId, setFallbackTemplateId] = useState<string>('');
  const [autoMarkAsRead, setAutoMarkAsRead] = useState(false);
  const [businessHoursOnly, setBusinessHoursOnly] = useState(false);

  const fallbackConn =
    officialConnections.find((c) => c.id === defaultConnectionId) ?? officialConnections[0];
  const templates = useTemplates(fallbackConn?.id ?? null);

  useEffect(() => {
    if (!config.data) return;
    setDefaultConnectionId(config.data.defaultConnectionId ?? '');
    setStrategy(config.data.defaultStrategy);
    setFallbackTemplateId(config.data.fallbackTemplateId ?? '');
    setAutoMarkAsRead(config.data.autoMarkAsRead);
    setBusinessHoursOnly(config.data.businessHoursOnly);
  }, [config.data]);

  const handleSave = async () => {
    try {
      await update.mutateAsync({
        defaultConnectionId: defaultConnectionId || null,
        defaultStrategy: strategy,
        fallbackTemplateId: fallbackTemplateId || null,
        autoMarkAsRead,
        businessHoursOnly,
      });
      toast('Configurações salvas', 'success');
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message;
      toast(msg ?? 'Falha ao salvar', 'error');
    }
  };

  if (config.isLoading) {
    return (
      <div style={{ padding: 28, color: t.textDim, fontSize: 13 }}>Carregando…</div>
    );
  }

  return (
    <div style={{ padding: 28, maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <div style={{ fontSize: 16, fontWeight: 600, color: t.text }}>
          Roteamento padrão de WhatsApp
        </div>
        <div style={{ fontSize: 12.5, color: t.textDim, marginTop: 4 }}>
          Define os defaults que as automações usam quando a action de envio
          não preenche estratégia de conexão.
        </div>
      </div>

      <Row label="Conexão padrão para automações">
        <select
          value={defaultConnectionId}
          onChange={(e) => setDefaultConnectionId(e.target.value)}
          disabled={!isAdmin}
          style={inputStyle(t)}
        >
          <option value="">— sem default (usa conexão da conversa) —</option>
          {(connections.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.type})
            </option>
          ))}
        </select>
      </Row>

      <Row label="Estratégia padrão">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(['OFFICIAL_FIRST', 'UNOFFICIAL_FIRST', 'OFFICIAL_ONLY', 'UNOFFICIAL_ONLY'] as RoutingStrategy[]).map(
            (s) => (
              <label
                key={s}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  cursor: isAdmin ? 'pointer' : 'not-allowed',
                  opacity: isAdmin ? 1 : 0.6,
                }}
              >
                <input
                  type="radio"
                  checked={strategy === s}
                  onChange={() => setStrategy(s)}
                  disabled={!isAdmin}
                  style={{ accentColor: t.gold, marginTop: 2 }}
                />
                <span>
                  <span style={{ fontSize: 13, color: t.text }}>{labelFor(s)}</span>
                  <div style={{ fontSize: 11.5, color: t.textDim }}>{STRATEGY_DESCRIPTIONS[s]}</div>
                </span>
              </label>
            ),
          )}
        </div>
      </Row>

      <Row label="Template de fallback (janela 24h fechada)">
        <select
          value={fallbackTemplateId}
          onChange={(e) => setFallbackTemplateId(e.target.value)}
          disabled={!isAdmin || officialConnections.length === 0}
          style={inputStyle(t)}
        >
          <option value="">— sem template default —</option>
          {(templates.data ?? [])
            .filter((tt) => tt.status === 'APPROVED')
            .map((tt) => (
              <option key={tt.id} value={tt.id}>
                {tt.name} ({tt.language})
              </option>
            ))}
        </select>
        {officialConnections.length === 0 && (
          <div style={{ fontSize: 11.5, color: t.textDim, marginTop: 6 }}>
            Conecte uma conta Meta Oficial pra escolher templates.
          </div>
        )}
      </Row>

      <CheckRow
        label="Marcar conversa como lida automaticamente quando IA responder"
        checked={autoMarkAsRead}
        disabled={!isAdmin}
        onChange={setAutoMarkAsRead}
      />
      <CheckRow
        label="Enviar apenas em horário comercial"
        checked={businessHoursOnly}
        disabled={!isAdmin}
        onChange={setBusinessHoursOnly}
      />

      {isAdmin ? (
        <div>
          <button
            type="button"
            onClick={handleSave}
            disabled={update.isPending}
            style={{
              padding: '10px 18px',
              background: t.gold,
              color: '#1a1300',
              border: 'none',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: FONT_STACK,
              opacity: update.isPending ? 0.6 : 1,
            }}
          >
            {update.isPending ? 'Salvando…' : 'Salvar configurações'}
          </button>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: t.textDim }}>
          Apenas administradores podem alterar essas configurações.
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  const { tokens: t } = useTheme();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: t.textDim }}>{label}</label>
      {children}
    </div>
  );
}

function CheckRow({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  const { tokens: t } = useTheme();
  return (
    <label
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 13,
        color: t.text,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        style={{ accentColor: t.gold }}
      />
      {label}
    </label>
  );
}

function labelFor(s: RoutingStrategy): string {
  return s === 'OFFICIAL_FIRST'
    ? 'Oficial primeiro'
    : s === 'UNOFFICIAL_FIRST'
      ? 'Não oficial primeiro'
      : s === 'OFFICIAL_ONLY'
        ? 'Apenas Oficial'
        : 'Apenas Não Oficial';
}

type Tk = ReturnType<typeof useTheme>['tokens'];
const inputStyle = (t: Tk) => ({
  width: '100%',
  padding: '9px 12px',
  borderRadius: 8,
  background: t.bgInput,
  color: t.text,
  border: `1px solid ${t.border}`,
  fontSize: 13,
  outline: 'none' as const,
});
