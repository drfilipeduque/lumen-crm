// Form genérico que renderiza configFields vindos do GET /automations/catalog
// pra um determinado subtype (trigger ou action).
//
// Especializa por nome de campo conhecido:
//   - pipelineId / fromPipelineId / toPipelineId / targetPipelineId  → dropdown de pipelines
//   - stageId / fromStageId / toStageId / targetStageId              → dropdown de stages (cascade)
//   - tagId                                                          → dropdown de tags
//   - ownerId / userId                                               → dropdown de users
//   - connectionId                                                   → dropdown de conexões WA
//   - integrationId                                                  → dropdown de IA integrations
//   - cadenceId                                                      → dropdown de cadências
//   - customFieldId / fieldId                                        → dropdown de custom fields
//
// Enums por nome (matchType, direction, connectionType, customFieldStrategy,
// connectionStrategy, preferredType, priority, target).

import { useTheme } from '../../../lib/ThemeContext';
import { usePipelines, usePipeline } from '../../../hooks/usePipelines';
import { useTags } from '../../../hooks/useTags';
import { useTeam } from '../../../hooks/useTeam';
import { useWhatsAppConnections } from '../../../hooks/useWhatsApp';
import { useAIIntegrations } from '../../../hooks/useAIIntegrations';
import { useCustomFields } from '../../../hooks/useCustomFields';
import { useCadences } from '../../../hooks/useCadences';
import type { ConfigField } from '../../../hooks/useAutomations';
import { VariablePicker } from './VariablePicker';

const ENUM_OPTIONS: Record<string, { value: string; label: string }[]> = {
  matchType: [
    { value: 'any', label: 'Qualquer palavra' },
    { value: 'all', label: 'Todas as palavras' },
  ],
  direction: [
    { value: 'CLIENT_WAITING', label: 'Cliente aguardando resposta nossa' },
    { value: 'US_WAITING', label: 'Aguardando resposta do cliente' },
  ],
  connectionType: [
    { value: 'OFFICIAL', label: 'Oficial (Meta)' },
    { value: 'UNOFFICIAL', label: 'Não oficial (Baileys)' },
  ],
  customFieldStrategy: [
    { value: 'KEEP_COMPATIBLE', label: 'Manter campos compatíveis' },
    { value: 'DISCARD_ALL', label: 'Descartar todos' },
    { value: 'MAP', label: 'Mapear manualmente' },
  ],
  connectionStrategy: [
    { value: 'DEFAULT', label: 'Padrão do responsável' },
    { value: 'SPECIFIC', label: 'Conexão específica' },
    { value: 'TYPE_PREFERRED', label: 'Preferir tipo' },
  ],
  preferredType: [
    { value: 'OFFICIAL', label: 'Oficial (Meta)' },
    { value: 'UNOFFICIAL', label: 'Não oficial (Baileys)' },
  ],
  priority: [
    { value: 'LOW', label: 'Baixa' },
    { value: 'MEDIUM', label: 'Média' },
    { value: 'HIGH', label: 'Alta' },
    { value: 'URGENT', label: 'Urgente' },
  ],
  target: [
    { value: 'opportunity', label: 'Oportunidade do contexto' },
    { value: 'contact', label: 'Contato do contexto' },
  ],
};

const PIPELINE_FIELDS = ['pipelineId', 'fromPipelineId', 'toPipelineId', 'targetPipelineId'];
const STAGE_FIELDS = ['stageId', 'fromStageId', 'toStageId', 'targetStageId'];
// Cada stage field se vincula a um pipeline field (cascade).
const STAGE_TO_PIPELINE: Record<string, string> = {
  stageId: 'pipelineId',
  fromStageId: 'fromPipelineId',
  toStageId: 'toPipelineId',
  targetStageId: 'targetPipelineId',
};

export function DynamicConfigForm({
  fields,
  config,
  onChange,
  triggerSubtype,
  previousStepCount,
}: {
  fields: ConfigField[];
  config: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  triggerSubtype: string | null;
  previousStepCount: number;
}) {
  const fieldNames = fields.map((f) => f.name);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {fields.map((f) => (
        <FieldRow
          key={f.name}
          field={f}
          value={config[f.name]}
          allConfig={config}
          fieldNames={fieldNames}
          setValue={(v) => onChange({ ...config, [f.name]: v })}
          setMany={(changes) => onChange({ ...config, ...changes })}
          triggerSubtype={triggerSubtype}
          previousStepCount={previousStepCount}
        />
      ))}
      {fields.length === 0 && (
        <div style={{ fontSize: 11.5, color: '#6b7280' }}>Este nó não tem configurações.</div>
      )}
    </div>
  );
}

function FieldRow({
  field,
  value,
  allConfig,
  fieldNames,
  setValue,
  setMany,
  triggerSubtype,
  previousStepCount,
}: {
  field: ConfigField;
  value: unknown;
  allConfig: Record<string, unknown>;
  fieldNames: string[];
  setValue: (v: unknown) => void;
  setMany: (changes: Record<string, unknown>) => void;
  triggerSubtype: string | null;
  previousStepCount: number;
}) {
  const { tokens: t } = useTheme();
  const pipelines = usePipelines();
  const tags = useTags();
  const team = useTeam();
  const connections = useWhatsAppConnections();
  const integrations = useAIIntegrations();
  const cadences = useCadences({ active: true });
  const customFields = useCustomFields();

  // Cascade: se for um campo de stage, descobre o pipeline associado.
  // Se o campo linkado (ex.: fromPipelineId) não existe nos fields desse trigger,
  // cai pro pipelineId genérico — caso de opportunity_stage_changed, que tem um
  // pipelineId só + fromStageId/toStageId.
  const linkedPipelineFieldRaw = STAGE_TO_PIPELINE[field.name];
  const linkedPipelineField =
    linkedPipelineFieldRaw && fieldNames.includes(linkedPipelineFieldRaw)
      ? linkedPipelineFieldRaw
      : fieldNames.includes('pipelineId')
        ? 'pipelineId'
        : null;
  const linkedPipelineId = linkedPipelineField
    ? ((allConfig[linkedPipelineField] as string | undefined) ?? '')
    : '';
  const cascadePipeline = usePipeline(linkedPipelineId || null);
  const cascadeStages = cascadePipeline.data?.stages ?? [];

  // Pipeline dropdown
  if (PIPELINE_FIELDS.includes(field.name) || field.type === 'pipeline') {
    // Stages que dependem desse pipeline (cascade) — ficam inválidas se trocar
    // de funil. Limpamos junto pra evitar config inconsistente.
    const dependentStages = STAGE_FIELDS.filter((sf) => {
      const explicit = STAGE_TO_PIPELINE[sf];
      if (explicit && fieldNames.includes(explicit)) return explicit === field.name;
      // Stage cai no pipelineId genérico quando o explicit não existe
      return field.name === 'pipelineId';
    });
    return (
      <Wrap label={field.label}>
        <select
          value={(value as string) ?? ''}
          onChange={(e) => {
            const next = e.target.value;
            const changes: Record<string, unknown> = { [field.name]: next };
            if (next !== value) {
              for (const sf of dependentStages) changes[sf] = '';
            }
            setMany(changes);
          }}
          style={input(t)}
        >
          <option value="">{field.required ? '— escolha —' : '— qualquer funil —'}</option>
          {(pipelines.data ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Wrap>
    );
  }

  // Stage dropdown
  if (STAGE_FIELDS.includes(field.name) || field.type === 'stage') {
    const noPipeline = !linkedPipelineId;
    const placeholder = noPipeline
      ? '— selecione um funil primeiro —'
      : field.required
        ? '— escolha —'
        : '— qualquer etapa —';
    return (
      <Wrap label={field.label}>
        <select
          value={(value as string) ?? ''}
          onChange={(e) => setValue(e.target.value)}
          disabled={noPipeline}
          style={{ ...input(t), opacity: noPipeline ? 0.5 : 1 }}
        >
          <option value="">{placeholder}</option>
          {cascadeStages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </Wrap>
    );
  }

  // Tag
  if (field.type === 'tag' || field.name === 'tagId') {
    return (
      <Wrap label={field.label}>
        <select value={(value as string) ?? ''} onChange={(e) => setValue(e.target.value)} style={input(t)}>
          <option value="">— escolha —</option>
          {(tags.data ?? []).map((tg) => (
            <option key={tg.id} value={tg.id}>
              {tg.name}
            </option>
          ))}
        </select>
      </Wrap>
    );
  }

  // User
  if (field.type === 'user' || field.name === 'ownerId' || field.name === 'userId') {
    return (
      <Wrap label={field.label}>
        <select value={(value as string) ?? ''} onChange={(e) => setValue(e.target.value)} style={input(t)}>
          <option value="">— escolha —</option>
          {(team.data ?? []).map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </Wrap>
    );
  }

  // Connection
  if (field.type === 'connection' || field.name === 'connectionId') {
    return (
      <Wrap label={field.label}>
        <select value={(value as string) ?? ''} onChange={(e) => setValue(e.target.value)} style={input(t)}>
          <option value="">— qualquer conexão —</option>
          {(connections.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.type})
            </option>
          ))}
        </select>
      </Wrap>
    );
  }

  // AI Integration
  if (field.name === 'integrationId') {
    return (
      <Wrap label={field.label}>
        <select value={(value as string) ?? ''} onChange={(e) => setValue(e.target.value)} style={input(t)}>
          <option value="">— escolha —</option>
          {(integrations.data ?? []).map((i) => (
            <option key={i.id} value={i.id}>
              {i.name} ({i.provider})
            </option>
          ))}
        </select>
      </Wrap>
    );
  }

  // Cadence
  if (field.name === 'cadenceId') {
    return (
      <Wrap label={field.label}>
        <select value={(value as string) ?? ''} onChange={(e) => setValue(e.target.value)} style={input(t)}>
          <option value="">{field.required ? '— escolha —' : '— qualquer cadência —'}</option>
          {(cadences.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Wrap>
    );
  }

  // Custom field
  if (field.type === 'customField' || field.name === 'customFieldId' || field.name === 'fieldId') {
    return (
      <Wrap label={field.label}>
        <select value={(value as string) ?? ''} onChange={(e) => setValue(e.target.value)} style={input(t)}>
          <option value="">— escolha —</option>
          {(customFields.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Wrap>
    );
  }

  // Enum por nome conhecido
  const enumOpts = ENUM_OPTIONS[field.name];
  if (enumOpts) {
    return (
      <Wrap label={field.label}>
        <select value={(value as string) ?? ''} onChange={(e) => setValue(e.target.value)} style={input(t)}>
          <option value="">— escolha —</option>
          {enumOpts.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Wrap>
    );
  }

  // string[] (chips)
  if (field.type === 'string[]') {
    return (
      <Wrap label={field.label}>
        <input
          type="text"
          value={Array.isArray(value) ? (value as string[]).join(', ') : ''}
          onChange={(e) =>
            setValue(
              e.target.value
                .split(',')
                .map((x) => x.trim())
                .filter(Boolean),
            )
          }
          placeholder="separadas por vírgula"
          style={input(t)}
        />
      </Wrap>
    );
  }

  if (field.type === 'number') {
    return (
      <Wrap label={field.label}>
        <input
          type="number"
          value={(value as number | undefined) ?? ''}
          onChange={(e) => setValue(e.target.value === '' ? undefined : Number(e.target.value))}
          style={input(t)}
        />
      </Wrap>
    );
  }

  if (field.type === 'boolean') {
    return (
      <Wrap label={field.label}>
        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            cursor: 'pointer',
            fontSize: 12.5,
            color: t.text,
          }}
        >
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => setValue(e.target.checked)}
            style={{ accentColor: t.gold }}
          />
          {value ? 'Sim' : 'Não'}
        </label>
      </Wrap>
    );
  }

  // Texto longo (prompt/text/message/finalMessageContent)
  const isLong =
    field.name === 'prompt' ||
    field.name === 'text' ||
    field.name === 'message' ||
    field.name === 'finalMessageContent' ||
    field.name === 'body';
  if (isLong) {
    return (
      <Wrap
        label={field.label}
        action={
          <VariablePicker
            triggerSubtype={triggerSubtype}
            previousStepCount={previousStepCount}
            onInsert={(token) => setValue(((value as string) ?? '') + token)}
          />
        }
      >
        <textarea
          rows={4}
          value={(value as string) ?? ''}
          onChange={(e) => setValue(e.target.value)}
          style={{ ...input(t), resize: 'vertical', fontFamily: 'inherit' }}
        />
      </Wrap>
    );
  }

  // Texto curto default
  return (
    <Wrap label={field.label}>
      <input
        type="text"
        value={(value as string) ?? ''}
        onChange={(e) => setValue(e.target.value)}
        style={input(t)}
      />
    </Wrap>
  );
}

function Wrap({
  label,
  action,
  children,
}: {
  label: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { tokens: t } = useTheme();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <label style={{ fontSize: 11.5, fontWeight: 500, color: t.textDim }}>{label}</label>
        {action}
      </div>
      {children}
    </div>
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
