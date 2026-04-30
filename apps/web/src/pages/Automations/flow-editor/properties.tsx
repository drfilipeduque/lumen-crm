// Painel direito — propriedades do nó selecionado.
//
// Renderiza campos dinâmicos baseados no subtype usando metadados das
// "definições" (do catalog endpoint) + alguns campos especializados (
// pipelines/stages/tags/users vêm de hooks dedicados).

import { useState } from 'react';
import { useTheme } from '../../../lib/ThemeContext';
import { Icons } from '../../../components/icons';
import { useAutomationCatalog } from '../../../hooks/useAutomations';
import { usePipelines, usePipeline } from '../../../hooks/usePipelines';
import { useTags } from '../../../hooks/useTags';
import { useTeam } from '../../../hooks/useTeam';
import { useAIIntegrations } from '../../../hooks/useAIIntegrations';
import { useWhatsAppConnections } from '../../../hooks/useWhatsApp';
import { labelFor } from './labels';
import type { Node } from '@xyflow/react';
import type { FlowNodeData } from './nodes';

const VARIABLES = [
  '{{contact.name}}',
  '{{contact.phone}}',
  '{{contact.email}}',
  '{{opportunity.title}}',
  '{{opportunity.value}}',
  '{{opportunity.stageName}}',
  '{{user.name}}',
  '{{message.content}}',
];

export function FlowProperties({
  node,
  onChange,
  onDelete,
  onClose,
}: {
  node: Node<FlowNodeData> | null;
  onChange: (id: string, config: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const { tokens: t } = useTheme();

  if (!node) {
    return (
      <aside
        style={{
          width: 360,
          flexShrink: 0,
          borderLeft: `1px solid ${t.border}`,
          background: t.bgElevated,
          padding: 24,
          color: t.textDim,
          fontSize: 12.5,
        }}
      >
        Selecione um nó pra editar suas propriedades.
      </aside>
    );
  }

  const data = node.data;
  const config = data.config ?? {};
  const setField = (k: string, v: unknown) => onChange(node.id, { ...config, [k]: v });

  return (
    <aside
      style={{
        width: 360,
        flexShrink: 0,
        borderLeft: `1px solid ${t.border}`,
        background: t.bgElevated,
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          padding: '14px 18px',
          borderBottom: `1px solid ${t.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <div style={{ fontSize: 11, color: t.textFaint, textTransform: 'uppercase', letterSpacing: 1 }}>
            {node.type === 'trigger' ? 'Gatilho' : node.type === 'condition' ? 'Condição' : 'Ação'}
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: t.text }}>
            {labelFor(node.type as 'trigger' | 'condition' | 'action', data.subtype)}
          </div>
        </div>
        <button type="button" onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: t.textDim }}>
          <Icons.X s={16} c={t.textDim} />
        </button>
      </div>

      {data.errorMessage ? (
        <div style={{ padding: '8px 18px', background: '#ef444422', color: '#ef4444', fontSize: 11.5 }}>
          {data.errorMessage}
        </div>
      ) : null}

      <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
        <ConfigForm subtype={data.subtype} type={node.type as 'trigger' | 'condition' | 'action'} config={config} setField={setField} />
      </div>

      <div
        style={{
          padding: '12px 18px',
          borderTop: `1px solid ${t.border}`,
          display: 'flex',
          gap: 8,
          justifyContent: 'space-between',
        }}
      >
        <button type="button" onClick={() => onDelete(node.id)} style={btnDanger(t)}>
          <Icons.Trash s={12} c="#ef4444" /> Excluir nó
        </button>
      </div>
    </aside>
  );
}

// ============================================================================
// Form
// ============================================================================

function ConfigForm({
  type,
  subtype,
  config,
  setField,
}: {
  type: 'trigger' | 'condition' | 'action';
  subtype: string;
  config: Record<string, unknown>;
  setField: (k: string, v: unknown) => void;
}) {
  const { tokens: t } = useTheme();
  const catalog = useAutomationCatalog();
  const pipelines = usePipelines();
  const tags = useTags();
  const team = useTeam();
  const integrations = useAIIntegrations();
  const connections = useWhatsAppConnections();

  // Busca a definição no catálogo (server) — pra saber os configFields.
  const def =
    type === 'trigger'
      ? catalog.data?.triggers.find((d) => d.subtype === subtype)
      : catalog.data?.actions.find((d) => d.subtype === subtype);

  const selectedPipelineId = (config.pipelineId as string | undefined) ?? '';
  const pipelineDetail = usePipeline(selectedPipelineId || null);
  const stages = pipelineDetail.data?.stages ?? [];

  // Render genérico baseado nas configFields do catalog.
  if (def) {
    return (
      <>
        {def.configFields.map((f) => {
          const v = config[f.name];
          // Special types -> dropdowns
          if (f.type === 'tag') {
            return (
              <Field key={f.name} label={f.label}>
                <select value={(v as string) ?? ''} onChange={(e) => setField(f.name, e.target.value)} style={input(t)}>
                  <option value="">— escolha —</option>
                  {(tags.data ?? []).map((tg) => (
                    <option key={tg.id} value={tg.id}>
                      {tg.name}
                    </option>
                  ))}
                </select>
              </Field>
            );
          }
          if (f.type === 'pipeline' || f.name === 'pipelineId') {
            return (
              <Field key={f.name} label={f.label}>
                <select value={(v as string) ?? ''} onChange={(e) => setField(f.name, e.target.value)} style={input(t)}>
                  <option value="">— escolha —</option>
                  {(pipelines.data ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
            );
          }
          if (f.type === 'stage' || f.name === 'stageId' || f.name === 'fromStageId' || f.name === 'toStageId') {
            return (
              <Field key={f.name} label={f.label}>
                <select value={(v as string) ?? ''} onChange={(e) => setField(f.name, e.target.value)} style={input(t)}>
                  <option value="">— escolha —</option>
                  {stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
            );
          }
          if (f.type === 'user' || f.name === 'ownerId' || f.name === 'userId') {
            return (
              <Field key={f.name} label={f.label}>
                <select value={(v as string) ?? ''} onChange={(e) => setField(f.name, e.target.value)} style={input(t)}>
                  <option value="">— escolha —</option>
                  {(team.data ?? []).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </Field>
            );
          }
          if (f.type === 'connection' || f.name === 'connectionId') {
            return (
              <Field key={f.name} label={f.label}>
                <select value={(v as string) ?? ''} onChange={(e) => setField(f.name, e.target.value)} style={input(t)}>
                  <option value="">— escolha —</option>
                  {(connections.data ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
            );
          }
          if (f.name === 'integrationId') {
            return (
              <Field key={f.name} label={f.label}>
                <select value={(v as string) ?? ''} onChange={(e) => setField(f.name, e.target.value)} style={input(t)}>
                  <option value="">— escolha —</option>
                  {(integrations.data ?? []).map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} ({i.provider})
                    </option>
                  ))}
                </select>
              </Field>
            );
          }
          if (f.type === 'string[]') {
            return (
              <Field key={f.name} label={f.label}>
                <input
                  type="text"
                  value={Array.isArray(v) ? (v as string[]).join(', ') : ''}
                  onChange={(e) =>
                    setField(
                      f.name,
                      e.target.value
                        .split(',')
                        .map((x) => x.trim())
                        .filter(Boolean),
                    )
                  }
                  placeholder="separados por vírgula"
                  style={input(t)}
                />
              </Field>
            );
          }
          if (f.type === 'number') {
            return (
              <Field key={f.name} label={f.label}>
                <input
                  type="number"
                  value={(v as number | undefined) ?? ''}
                  onChange={(e) => setField(f.name, e.target.value === '' ? undefined : Number(e.target.value))}
                  style={input(t)}
                />
              </Field>
            );
          }
          if (f.type === 'boolean') {
            return (
              <Field key={f.name} label={f.label}>
                <select
                  value={v === true ? 'true' : v === false ? 'false' : ''}
                  onChange={(e) =>
                    setField(f.name, e.target.value === 'true' ? true : e.target.value === 'false' ? false : undefined)
                  }
                  style={input(t)}
                >
                  <option value="">—</option>
                  <option value="true">Sim</option>
                  <option value="false">Não</option>
                </select>
              </Field>
            );
          }
          // String multi-line se for prompt/text
          const isLong = f.name === 'prompt' || f.name === 'text' || f.name === 'message';
          if (isLong) {
            return (
              <Field key={f.name} label={f.label} action={<InsertVarBtn onInsert={(token) => setField(f.name, ((v as string) ?? '') + token)} />}>
                <textarea
                  rows={4}
                  value={(v as string) ?? ''}
                  onChange={(e) => setField(f.name, e.target.value)}
                  style={{ ...input(t), resize: 'vertical' }}
                />
              </Field>
            );
          }
          return (
            <Field key={f.name} label={f.label}>
              <input
                type="text"
                value={(v as string) ?? ''}
                onChange={(e) => setField(f.name, e.target.value)}
                style={input(t)}
              />
            </Field>
          );
        })}
        {def.configFields.length === 0 ? (
          <div style={{ fontSize: 11.5, color: t.textDim }}>Este nó não tem configurações.</div>
        ) : null}
      </>
    );
  }

  // Fallback genérico: textarea JSON
  return (
    <Field label="Config (JSON)">
      <textarea
        rows={8}
        value={JSON.stringify(config, null, 2)}
        onChange={(e) => {
          try {
            const parsed = JSON.parse(e.target.value);
            setField('__raw', undefined);
            for (const [k, val] of Object.entries(parsed)) setField(k, val);
          } catch {
            // mantém estado mas ignora parse
          }
        }}
        style={{ ...input(t), fontFamily: 'monospace', fontSize: 11.5 }}
      />
    </Field>
  );
}

function InsertVarBtn({ onInsert }: { onInsert: (token: string) => void }) {
  const { tokens: t } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        style={{
          background: 'transparent',
          border: 'none',
          color: t.gold,
          fontSize: 11,
          cursor: 'pointer',
          textDecoration: 'underline',
        }}
      >
        Inserir variável
      </button>
      {open ? (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 24,
            zIndex: 30,
            background: t.bgElevated,
            border: `1px solid ${t.border}`,
            borderRadius: 8,
            padding: 4,
            minWidth: 220,
            maxHeight: 200,
            overflow: 'auto',
            boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
          }}
        >
          {VARIABLES.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => {
                onInsert(v);
                setOpen(false);
              }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '6px 10px',
                background: 'transparent',
                border: 'none',
                fontSize: 11.5,
                color: t.text,
                fontFamily: 'monospace',
                cursor: 'pointer',
                borderRadius: 4,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = t.bgInput)}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {v}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, action, children }: { label: string; action?: React.ReactNode; children: React.ReactNode }) {
  const { tokens: t } = useTheme();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <label style={{ fontSize: 12, fontWeight: 500, color: t.textDim }}>{label}</label>
        {action}
      </div>
      {children}
    </div>
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
const btnDanger = (t: Tk) => ({
  display: 'flex' as const,
  alignItems: 'center' as const,
  gap: 4,
  padding: '6px 12px',
  borderRadius: 7,
  background: 'transparent',
  color: '#ef4444',
  border: `1px solid rgba(239,68,68,0.3)`,
  fontSize: 12,
  cursor: 'pointer' as const,
});
