import { useState } from 'react';
import { useTheme } from '../../../lib/ThemeContext';
import { Icons } from '../../../components/icons';
import { Card, Header } from './TriggerSection';
import { CONDITION_CATEGORIES, CONDITION_FIELDS, findItem } from './sections';
import { DynamicConfigForm } from './DynamicConfigForm';
import { newId, type BuilderCondition, type ConditionMode } from './model';
import type { ConfigField } from '../../../hooks/useAutomations';

export function ConditionsSection({
  mode,
  onModeChange,
  conditions,
  onChange,
  triggerSubtype,
}: {
  mode: ConditionMode;
  onModeChange: (m: ConditionMode) => void;
  conditions: BuilderCondition[];
  onChange: (next: BuilderCondition[]) => void;
  triggerSubtype: string | null;
}) {
  const { tokens: t } = useTheme();
  const [open, setOpen] = useState(conditions.length > 0);

  const setItem = (idx: number, patch: Partial<BuilderCondition>) => {
    const next = conditions.slice();
    next[idx] = { ...next[idx]!, ...patch };
    onChange(next);
  };
  const removeItem = (idx: number) => {
    const next = conditions.slice();
    next.splice(idx, 1);
    onChange(next);
  };
  const addItem = () => {
    onChange([...conditions, { id: newId('c'), subtype: '', config: {} }]);
    setOpen(true);
  };

  return (
    <Card>
      <Header
        open={open}
        onToggle={() => setOpen((s) => !s)}
        emoji="🔍"
        title="E SE (opcional)"
        subtitle={
          conditions.length === 0
            ? 'Filtra quando esta automação dispara'
            : `${conditions.length} condição${conditions.length === 1 ? '' : 'es'} (${mode === 'AND' ? 'todas devem ser verdadeiras' : 'qualquer uma'})`
        }
      />
      {open && (
        <div style={{ padding: '14px 18px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {conditions.length === 0 ? (
            <div
              style={{
                padding: 16,
                textAlign: 'center',
                background: t.bg,
                border: `1px dashed ${t.border}`,
                borderRadius: 10,
                fontSize: 12.5,
                color: t.textDim,
              }}
            >
              Sem condições — esta automação dispara sempre que o gatilho ocorrer.
            </div>
          ) : (
            <>
              {/* Operador AND/OR — exibido entre o trigger e a 1a condição */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 11.5, color: t.textDim }}>Combinar condições com</div>
                <select
                  value={mode}
                  onChange={(e) => onModeChange(e.target.value as ConditionMode)}
                  style={{
                    padding: '4px 8px',
                    borderRadius: 6,
                    background: t.bgInput,
                    color: t.text,
                    border: `1px solid ${t.border}`,
                    fontSize: 11.5,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <option value="AND">E (AND)</option>
                  <option value="OR">OU (OR)</option>
                </select>
              </div>

              {conditions.map((c, idx) => (
                <ConditionRow
                  key={c.id}
                  condition={c}
                  onChange={(patch) => setItem(idx, patch)}
                  onRemove={() => removeItem(idx)}
                  triggerSubtype={triggerSubtype}
                />
              ))}
            </>
          )}

          <button
            type="button"
            onClick={addItem}
            style={{
              alignSelf: 'flex-start',
              padding: '8px 12px',
              background: 'transparent',
              border: `1px dashed ${t.border}`,
              borderRadius: 8,
              color: t.gold,
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Icons.Plus s={11} c={t.gold} /> Adicionar condição
          </button>
        </div>
      )}
    </Card>
  );
}

function ConditionRow({
  condition,
  onChange,
  onRemove,
  triggerSubtype,
}: {
  condition: BuilderCondition;
  onChange: (patch: Partial<BuilderCondition>) => void;
  onRemove: () => void;
  triggerSubtype: string | null;
}) {
  const { tokens: t } = useTheme();
  const found = condition.subtype ? findItem(CONDITION_CATEGORIES, condition.subtype) : null;
  const fields: ConfigField[] = (CONDITION_FIELDS[condition.subtype] ?? []) as ConfigField[];

  return (
    <div
      style={{
        padding: 12,
        borderRadius: 10,
        background: t.bg,
        border: `1px solid ${t.border}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <select
          value={condition.subtype}
          onChange={(e) =>
            onChange({ subtype: e.target.value, config: {} })
          }
          style={{
            flex: 1,
            padding: '7px 10px',
            borderRadius: 7,
            background: t.bgInput,
            color: t.text,
            border: `1px solid ${t.border}`,
            fontSize: 12.5,
            outline: 'none',
            fontFamily: 'inherit',
          }}
        >
          <option value="">— escolha uma condição —</option>
          {CONDITION_CATEGORIES.map((cat) => (
            <optgroup key={cat.label} label={`${cat.emoji} ${cat.label}`}>
              {cat.items.map((it) => (
                <option key={it.subtype} value={it.subtype}>
                  {it.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <button
          type="button"
          onClick={onRemove}
          title="Remover condição"
          style={{
            width: 28,
            height: 28,
            background: 'transparent',
            border: `1px solid ${t.border}`,
            borderRadius: 6,
            color: t.textDim,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icons.X s={11} c={t.textDim} />
        </button>
      </div>

      {found && fields.length > 0 && (
        <DynamicConfigForm
          fields={fields}
          config={condition.config}
          onChange={(next) => onChange({ config: next })}
          triggerSubtype={triggerSubtype}
          previousStepCount={0}
        />
      )}
    </div>
  );
}
