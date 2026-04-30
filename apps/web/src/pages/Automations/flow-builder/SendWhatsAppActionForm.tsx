// Form especializado pra ação send_whatsapp_message no construtor.
// Estrutura em 3 seções: Conteúdo, Conexão, Fallback.

import { useTheme } from '../../../lib/ThemeContext';
import { useWhatsAppConnections } from '../../../hooks/useWhatsApp';
import { useTemplates } from '../../../hooks/useTemplates';
import { VariablePicker } from './VariablePicker';

export function SendWhatsAppActionForm({
  config,
  onChange,
  triggerSubtype,
  previousStepCount,
}: {
  config: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  triggerSubtype: string | null;
  previousStepCount: number;
}) {
  const { tokens: t } = useTheme();
  const connections = useWhatsAppConnections();
  const strategy = (config.connectionStrategy as string | undefined) ?? 'DEFAULT';
  const fallback = (config.fallback as Record<string, unknown> | undefined) ?? {};
  const setField = (k: string, v: unknown) => onChange({ ...config, [k]: v });
  const setFallback = (k: string, v: unknown) => onChange({ ...config, fallback: { ...fallback, [k]: v } });

  const fallbackEnabled = Boolean(fallback.enabled);
  const useTemplate = Boolean(fallback.useTemplateIfWindowClosed);
  const fallbackToOther = Boolean(fallback.fallbackToOtherConnection);
  const officialConn =
    (config.connectionId as string | undefined) ||
    (connections.data ?? []).find((c) => c.type === 'OFFICIAL')?.id ||
    null;
  const templates = useTemplates(officialConn);

  // Preview do caminho
  const path: string[] = [];
  if (strategy === 'SPECIFIC' && config.connectionId) {
    const c = connections.data?.find((x) => x.id === config.connectionId);
    path.push(`Tenta: ${c?.name ?? config.connectionId}`);
  } else if (strategy === 'TYPE_PREFERRED') {
    path.push(`Tenta: tipo ${(config.preferredType as string) ?? 'OFFICIAL'} primeiro`);
  } else {
    path.push('Tenta: conexão padrão (do responsável ou config global)');
  }
  if (fallbackEnabled && useTemplate && fallback.fallbackTemplateId) {
    const tmpl = templates.data?.find((x) => x.id === fallback.fallbackTemplateId);
    path.push(`Se janela 24h fechada → template "${tmpl?.name ?? fallback.fallbackTemplateId}"`);
  }
  if (fallbackEnabled && fallbackToOther) {
    path.push('Se ainda falhar → próxima conexão ativa');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Group label="Conteúdo">
        <Field
          label="Texto"
          action={
            <VariablePicker
              triggerSubtype={triggerSubtype}
              previousStepCount={previousStepCount}
              onInsert={(token) => setField('text', ((config.text as string) ?? '') + token)}
            />
          }
        >
          <textarea
            rows={3}
            value={(config.text as string) ?? ''}
            onChange={(e) => setField('text', e.target.value)}
            style={{ ...input(t), resize: 'vertical', fontFamily: 'inherit' }}
            placeholder="Olá {{contact.name}}, ..."
          />
        </Field>
        <Field label="Script (alternativa)">
          <input
            type="text"
            value={(config.scriptId as string) ?? ''}
            onChange={(e) => setField('scriptId', e.target.value || undefined)}
            placeholder="ID de script (opcional)"
            style={input(t)}
          />
        </Field>
        <Field label="URL de mídia (opcional)">
          <input
            type="text"
            value={(config.mediaUrl as string) ?? ''}
            onChange={(e) => setField('mediaUrl', e.target.value || undefined)}
            style={input(t)}
          />
        </Field>
      </Group>

      <Group label="Conexão de envio">
        <Field label="Estratégia">
          <select
            value={strategy}
            onChange={(e) => setField('connectionStrategy', e.target.value)}
            style={input(t)}
          >
            <option value="DEFAULT">Padrão do responsável (recomendado)</option>
            <option value="SPECIFIC">Conexão específica</option>
            <option value="TYPE_PREFERRED">Preferir tipo</option>
          </select>
        </Field>
        {strategy === 'SPECIFIC' && (
          <Field label="Conexão">
            <select
              value={(config.connectionId as string) ?? ''}
              onChange={(e) => setField('connectionId', e.target.value)}
              style={input(t)}
            >
              <option value="">— escolha —</option>
              {(connections.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.type})
                </option>
              ))}
            </select>
          </Field>
        )}
        {strategy === 'TYPE_PREFERRED' && (
          <Field label="Tipo preferido">
            <select
              value={(config.preferredType as string) ?? 'OFFICIAL'}
              onChange={(e) => setField('preferredType', e.target.value)}
              style={input(t)}
            >
              <option value="OFFICIAL">Oficial (Meta)</option>
              <option value="UNOFFICIAL">Não oficial (Baileys)</option>
            </select>
          </Field>
        )}
      </Group>

      <Group label="Fallback">
        <Toggle
          label="Ativar fallback se falhar"
          checked={fallbackEnabled}
          onChange={(v) => setFallback('enabled', v)}
        />
        {fallbackEnabled && (
          <>
            <Toggle
              label="Usar template se janela 24h fechada (Meta)"
              checked={useTemplate}
              onChange={(v) => setFallback('useTemplateIfWindowClosed', v)}
            />
            {useTemplate && (
              <Field label="Template de fallback">
                <select
                  value={(fallback.fallbackTemplateId as string) ?? ''}
                  onChange={(e) => setFallback('fallbackTemplateId', e.target.value)}
                  style={input(t)}
                >
                  <option value="">— escolha —</option>
                  {(templates.data ?? [])
                    .filter((tt) => tt.status === 'APPROVED')
                    .map((tt) => (
                      <option key={tt.id} value={tt.id}>
                        {tt.name} ({tt.language})
                      </option>
                    ))}
                </select>
              </Field>
            )}
            <Toggle
              label="Tentar outra conexão se a primeira falhar"
              checked={fallbackToOther}
              onChange={(v) => setFallback('fallbackToOtherConnection', v)}
            />
          </>
        )}
      </Group>

      <div
        style={{
          padding: 10,
          borderRadius: 8,
          background: t.bgInput,
          border: `1px solid ${t.border}`,
          fontSize: 11,
          color: t.textDim,
        }}
      >
        <div style={{ fontWeight: 600, color: t.text, marginBottom: 4, fontSize: 11.5 }}>
          Caminho previsto:
        </div>
        <ol style={{ margin: 0, paddingLeft: 16 }}>
          {path.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  const { tokens: t } = useTheme();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: t.textFaint,
          textTransform: 'uppercase',
          letterSpacing: 1,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function Field({ label, action, children }: { label: string; action?: React.ReactNode; children: React.ReactNode }) {
  const { tokens: t } = useTheme();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <label style={{ fontSize: 11.5, fontWeight: 500, color: t.textDim }}>{label}</label>
        {action}
      </div>
      {children}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  const { tokens: t } = useTheme();
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: t.text }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ accentColor: t.gold }} />
      {label}
    </label>
  );
}

type Tk = ReturnType<typeof useTheme>['tokens'];
const input = (t: Tk) => ({
  width: '100%',
  padding: '8px 10px',
  borderRadius: 7,
  background: t.bgInput,
  color: t.text,
  border: `1px solid ${t.border}`,
  fontSize: 12.5,
  outline: 'none' as const,
  fontFamily: 'inherit',
});
