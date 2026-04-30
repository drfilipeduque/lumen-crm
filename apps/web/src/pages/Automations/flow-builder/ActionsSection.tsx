// Lista de ações em sequência com drag-and-drop via @dnd-kit/sortable.
// Cada ActionCard é expansível e renderiza configs dinâmicas baseadas em
// catalog (com handlers especializados pra send_whatsapp_message e
// transfer_to_pipeline).

import { useState } from 'react';
import { useTheme } from '../../../lib/ThemeContext';
import { Icons } from '../../../components/icons';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card, Header } from './TriggerSection';
import { ACTION_CATEGORIES, findItem } from './sections';
import { DynamicConfigForm } from './DynamicConfigForm';
import { SendWhatsAppActionForm } from './SendWhatsAppActionForm';
import { newId, type BuilderAction } from './model';
import { useAutomationCatalog } from '../../../hooks/useAutomations';

export function ActionsSection({
  actions,
  onChange,
  triggerSubtype,
  errors,
}: {
  actions: BuilderAction[];
  onChange: (next: BuilderAction[]) => void;
  triggerSubtype: string | null;
  errors: { id: string; message: string }[];
}) {
  const { tokens: t } = useTheme();
  const [open, setOpen] = useState(true);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = actions.findIndex((a) => a.id === active.id);
    const newIdx = actions.findIndex((a) => a.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    onChange(arrayMove(actions, oldIdx, newIdx));
  };

  const updateAction = (idx: number, patch: Partial<BuilderAction>) => {
    const next = actions.slice();
    next[idx] = { ...next[idx]!, ...patch };
    onChange(next);
  };
  const removeAction = (idx: number) => {
    const next = actions.slice();
    next.splice(idx, 1);
    onChange(next);
  };
  const moveAction = (idx: number, delta: number) => {
    const j = idx + delta;
    if (j < 0 || j >= actions.length) return;
    onChange(arrayMove(actions, idx, j));
  };
  const addAction = () => {
    onChange([...actions, { id: newId('a'), subtype: '', config: {} }]);
  };

  const errMap = new Map(errors.map((e) => [e.id, e.message]));

  return (
    <Card>
      <Header
        open={open}
        onToggle={() => setOpen((s) => !s)}
        emoji="▶"
        title="ENTÃO FAZER"
        subtitle={
          actions.length === 0
            ? 'Adicione ações que serão executadas em sequência'
            : `${actions.length} ação${actions.length === 1 ? '' : 'ões'} em sequência`
        }
        warning={errors.length > 0}
      />
      {open && (
        <div style={{ padding: '14px 18px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {actions.length === 0 ? (
            <div
              style={{
                padding: 24,
                textAlign: 'center',
                background: t.bg,
                border: `1px dashed ${t.border}`,
                borderRadius: 10,
                fontSize: 12.5,
                color: t.textDim,
              }}
            >
              Sem ações ainda. Adicione a primeira abaixo.
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={actions.map((a) => a.id)} strategy={verticalListSortingStrategy}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {actions.map((a, idx) => (
                    <SortableActionCard
                      key={a.id}
                      action={a}
                      index={idx}
                      previousStepCount={idx}
                      triggerSubtype={triggerSubtype}
                      onUpdate={(patch) => updateAction(idx, patch)}
                      onRemove={() => removeAction(idx)}
                      onMoveUp={() => moveAction(idx, -1)}
                      onMoveDown={() => moveAction(idx, 1)}
                      isFirst={idx === 0}
                      isLast={idx === actions.length - 1}
                      errorMessage={errMap.get(a.id)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          <button
            type="button"
            onClick={addAction}
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
            <Icons.Plus s={11} c={t.gold} /> Adicionar ação
          </button>
        </div>
      )}
    </Card>
  );
}

function SortableActionCard(props: ActionCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.action.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  return (
    <div ref={setNodeRef} style={style}>
      <ActionCard {...props} dragHandleProps={{ ...attributes, ...listeners }} />
    </div>
  );
}

type ActionCardProps = {
  action: BuilderAction;
  index: number;
  previousStepCount: number;
  triggerSubtype: string | null;
  onUpdate: (patch: Partial<BuilderAction>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
  errorMessage?: string;
};

function ActionCard({
  action,
  index,
  previousStepCount,
  triggerSubtype,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
  errorMessage,
  dragHandleProps,
}: ActionCardProps & { dragHandleProps?: Record<string, unknown> }) {
  const { tokens: t } = useTheme();
  const [expanded, setExpanded] = useState(true);
  const catalog = useAutomationCatalog();
  const found = action.subtype ? findItem(ACTION_CATEGORIES, action.subtype) : null;
  const def = action.subtype
    ? catalog.data?.actions.find((d) => d.subtype === action.subtype)
    : null;

  const useSpecialWhatsAppForm = action.subtype === 'send_whatsapp_message';

  return (
    <div
      style={{
        background: t.bgElevated,
        border: `1px solid ${errorMessage ? '#f59e0b' : t.border}`,
        borderRadius: 10,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 12px',
          background: t.bg,
        }}
      >
        <div
          {...dragHandleProps}
          style={{
            cursor: 'grab',
            color: t.textFaint,
            display: 'flex',
            alignItems: 'center',
            padding: 2,
          }}
          title="Arrastar"
        >
          ⋮⋮
        </div>
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            background: t.gold,
            color: '#1a1300',
            fontSize: 11,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {index + 1}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {found && <span style={{ fontSize: 13 }}>{found.category.emoji}</span>}
            <div style={{ fontSize: 13, fontWeight: 600, color: t.text }}>
              {found ? found.item.label : 'Selecione uma ação'}
            </div>
          </div>
          {found && (
            <div style={{ fontSize: 10.5, color: t.textFaint }}>{found.category.label}</div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setExpanded((s) => !s)}
          title={expanded ? 'Recolher' : 'Expandir'}
          style={iconBtn(t)}
        >
          <Icons.ChevronR
            s={11}
            c={t.textDim}
            style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
          />
        </button>
        <button
          type="button"
          onClick={onMoveUp}
          disabled={isFirst}
          title="Mover pra cima"
          style={{ ...iconBtn(t), opacity: isFirst ? 0.3 : 1 }}
        >
          ↑
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={isLast}
          title="Mover pra baixo"
          style={{ ...iconBtn(t), opacity: isLast ? 0.3 : 1 }}
        >
          ↓
        </button>
        <button type="button" onClick={onRemove} title="Remover" style={iconBtn(t)}>
          <Icons.X s={11} c={t.textDim} />
        </button>
      </div>

      {expanded && (
        <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <select
            value={action.subtype}
            onChange={(e) => onUpdate({ subtype: e.target.value, config: {} })}
            style={{
              width: '100%',
              padding: '8px 10px',
              borderRadius: 7,
              background: t.bgInput,
              color: t.text,
              border: `1px solid ${t.border}`,
              fontSize: 12.5,
              outline: 'none',
              fontFamily: 'inherit',
            }}
          >
            <option value="">— escolha uma ação —</option>
            {ACTION_CATEGORIES.map((cat) => (
              <optgroup key={cat.label} label={`${cat.emoji} ${cat.label}`}>
                {cat.items.map((it) => (
                  <option key={it.subtype} value={it.subtype}>
                    {it.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>

          {action.subtype && useSpecialWhatsAppForm ? (
            <SendWhatsAppActionForm
              config={action.config}
              onChange={(next) => onUpdate({ config: next })}
              triggerSubtype={triggerSubtype}
              previousStepCount={previousStepCount}
            />
          ) : action.subtype && def ? (
            <DynamicConfigForm
              fields={def.configFields}
              config={action.config}
              onChange={(next) => onUpdate({ config: next })}
              triggerSubtype={triggerSubtype}
              previousStepCount={previousStepCount}
            />
          ) : null}

          {errorMessage && (
            <div
              style={{
                padding: '6px 10px',
                background: 'rgba(245,158,11,0.1)',
                border: '1px solid rgba(245,158,11,0.4)',
                borderRadius: 6,
                fontSize: 11.5,
                color: t.text,
              }}
            >
              ⚠ {errorMessage}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type Tk = ReturnType<typeof useTheme>['tokens'];
const iconBtn = (t: Tk) => ({
  width: 24,
  height: 24,
  background: 'transparent',
  border: `1px solid ${t.border}`,
  borderRadius: 5,
  color: t.textDim,
  cursor: 'pointer' as const,
  display: 'flex' as const,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  fontSize: 11,
});
