import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useTheme } from '../../lib/ThemeContext';
import { Modal } from '../../components/ui/Modal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Switch } from '../../components/ui/Switch';
import { toast } from '../../components/ui/Toast';
import { Icons, type IconName } from '../../components/icons';
import { FONT_STACK } from '../../lib/theme';
import {
  useCreateCustomField,
  useCustomFields,
  useDeleteCustomField,
  useReorderCustomFields,
  useUpdateCustomField,
  type CustomField,
  type CustomFieldInput,
  type CustomFieldType,
  type FieldOption,
} from '../../hooks/useCustomFields';

const TYPE_META: Record<CustomFieldType, { label: string; icon: IconName; description: string }> = {
  TEXT:         { label: 'Texto curto',     icon: 'Type',        description: 'Uma linha (até 200)' },
  LONG_TEXT:    { label: 'Texto longo',     icon: 'AlignLeft',   description: 'Várias linhas' },
  NUMBER:       { label: 'Número',          icon: 'Hash',        description: 'Inteiro ou decimal' },
  CURRENCY:     { label: 'Moeda',           icon: 'DollarSign',  description: 'Valor em R$' },
  DATE:         { label: 'Data',            icon: 'Calendar',    description: 'Data isolada' },
  SELECT:       { label: 'Seleção única',   icon: 'List',        description: 'Lista suspensa' },
  MULTI_SELECT: { label: 'Seleção múltipla',icon: 'ListChecks',  description: 'Várias opções' },
  BOOLEAN:      { label: 'Sim/Não',         icon: 'ToggleLeft',  description: 'Toggle' },
  URL:          { label: 'URL',             icon: 'Link',        description: 'Link externo' },
};

const TYPE_ORDER: CustomFieldType[] = [
  'TEXT', 'LONG_TEXT', 'NUMBER', 'CURRENCY', 'DATE',
  'SELECT', 'MULTI_SELECT', 'BOOLEAN', 'URL',
];

const NEEDS_OPTIONS = (t: CustomFieldType) => t === 'SELECT' || t === 'MULTI_SELECT';

export function SettingsCustomFields() {
  const { tokens: t } = useTheme();
  const fields = useCustomFields();
  const reorder = useReorderCustomFields();
  const update = useUpdateCustomField();
  const remove = useDeleteCustomField();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<CustomField | null>(null);
  const [deleting, setDeleting] = useState<{ field: CustomField; force: boolean } | null>(null);
  const [items, setItems] = useState<CustomField[]>([]);

  useEffect(() => {
    if (fields.data) setItems(fields.data);
  }, [fields.data]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const ids = useMemo(() => items.map((i) => i.id), [items]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const newItems = arrayMove(items, oldIndex, newIndex);
    setItems(newItems);
    reorder.mutate(newItems.map((i) => i.id), {
      onError: () => {
        toast('Falha ao reordenar', 'error');
        if (fields.data) setItems(fields.data);
      },
    });
  };

  const toggleActive = async (field: CustomField, active: boolean) => {
    try {
      await update.mutateAsync({
        id: field.id,
        name: field.name,
        type: field.type,
        options: field.options ?? undefined,
        required: field.required,
        active,
      });
    } catch {
      toast('Falha ao atualizar', 'error');
    }
  };

  const handleDeleteClick = (field: CustomField) => {
    setDeleting({ field, force: field.valueCount > 0 });
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await remove.mutateAsync({ id: deleting.field.id, force: deleting.force });
      toast(`Campo "${deleting.field.name}" excluído`, 'success');
      setDeleting(null);
    } catch (e) {
      const msg = axios.isAxiosError(e) ? e.response?.data?.message : null;
      toast(msg || 'Falha ao excluir', 'error');
    }
  };

  return (
    <div style={{ padding: '28px 32px 40px', color: t.text }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ maxWidth: 540 }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, letterSpacing: -0.4, margin: 0, color: t.text }}>
            Campos personalizados
          </h2>
          <div style={{ fontSize: 13, color: t.textDim, marginTop: 4, lineHeight: 1.5 }}>
            Adicione informações extras às oportunidades — origem do lead, valor estimado, observações.
            Arraste para reordenar a exibição nos formulários.
          </div>
        </div>
        <button type="button" onClick={() => setCreating(true)} style={buttonGold(t)}>
          <Icons.Plus s={12} c="#1a1300" /> Novo campo
        </button>
      </div>

      {fields.isLoading ? (
        <Skeleton t={t} />
      ) : items.length === 0 ? (
        <Empty t={t} onCreate={() => setCreating(true)} />
      ) : (
        <div
          style={{
            background: t.bgElevated,
            border: `1px solid ${t.border}`,
            borderRadius: 12,
            overflow: 'hidden',
          }}
        >
          <TableHeader t={t} />
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
              {items.map((field) => (
                <SortableRow
                  key={field.id}
                  field={field}
                  onEdit={() => setEditing(field)}
                  onDelete={() => handleDeleteClick(field)}
                  onToggleActive={(v) => toggleActive(field, v)}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      )}

      <FieldModal
        open={creating || editing !== null}
        field={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        title={deleting?.force ? 'Excluir campo com valores?' : 'Excluir campo?'}
        description={
          deleting?.force ? (
            <>
              <strong>{deleting.field.name}</strong> tem{' '}
              <strong>{deleting.field.valueCount}</strong> valor(es) preenchido(s) em
              oportunidades. Confirmando, todos os valores serão apagados e o campo removido.
            </>
          ) : (
            <>
              Tem certeza que deseja excluir <strong>{deleting?.field.name}</strong>?
            </>
          )
        }
        confirmLabel="Excluir"
        danger
        onConfirm={confirmDelete}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}

// ============================================================
// TABLE
// ============================================================

function TableHeader({ t }: { t: ReturnType<typeof useTheme>['tokens'] }) {
  const cell: React.CSSProperties = {
    fontSize: 10.5,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: t.textFaint,
    fontWeight: 500,
  };
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '36px 1fr 200px 100px 80px 90px',
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        borderBottom: `1px solid ${t.border}`,
        background: t.bgInput,
      }}
    >
      <span />
      <span style={cell}>Nome</span>
      <span style={cell}>Tipo</span>
      <span style={cell}>Obrigatório</span>
      <span style={cell}>Ativo</span>
      <span style={{ ...cell, textAlign: 'right' }}>Ações</span>
    </div>
  );
}

function SortableRow({
  field,
  onEdit,
  onDelete,
  onToggleActive,
}: {
  field: CustomField;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: (v: boolean) => void;
}) {
  const { tokens: t } = useTheme();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.id,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    background: isDragging ? t.bgHover : 'transparent',
  };
  const meta = TYPE_META[field.type];
  const Icon = Icons[meta.icon];

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        display: 'grid',
        gridTemplateColumns: '36px 1fr 200px 100px 80px 90px',
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        borderBottom: `1px solid ${t.border}`,
      }}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        title="Arrastar para reordenar"
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'grab',
          padding: 4,
          color: t.textFaint,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <Icons.Grip s={14} c="currentColor" />
      </button>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: t.text }}>{field.name}</div>
        {!field.active && (
          <div style={{ fontSize: 11, color: t.textFaint, marginTop: 2 }}>Inativo</div>
        )}
        {field.valueCount > 0 && (
          <div style={{ fontSize: 11, color: t.textSubtle, marginTop: 2 }}>
            {field.valueCount} valor(es) preenchido(s)
          </div>
        )}
      </div>
      <div>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 9px',
            background: t.goldFaint,
            color: t.gold,
            borderRadius: 6,
            fontSize: 11.5,
            fontWeight: 500,
          }}
        >
          <Icon s={12} c="currentColor" />
          {meta.label}
        </span>
      </div>
      <div>
        {field.required ? (
          <span style={{ fontSize: 12, color: t.gold, fontWeight: 500 }}>Sim</span>
        ) : (
          <span style={{ fontSize: 12, color: t.textFaint }}>Não</span>
        )}
      </div>
      <Switch checked={field.active} onChange={onToggleActive} ariaLabel="Ativo" />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
        <IconBtn title="Editar" onClick={onEdit}>
          <Icons.Edit s={13} c={t.textDim} />
        </IconBtn>
        <IconBtn title="Excluir" onClick={onDelete}>
          <Icons.Trash s={13} c={t.danger} />
        </IconBtn>
      </div>
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
}) {
  const { tokens: t } = useTheme();
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        width: 28,
        height: 28,
        background: 'transparent',
        border: `1px solid ${t.border}`,
        borderRadius: 6,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = t.bgHover)}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {children}
    </button>
  );
}

// ============================================================
// MODAL
// ============================================================

function FieldModal({
  open,
  field,
  onClose,
}: {
  open: boolean;
  field: CustomField | null;
  onClose: () => void;
}) {
  const { tokens: t } = useTheme();
  const create = useCreateCustomField();
  const update = useUpdateCustomField();

  const [name, setName] = useState('');
  const [type, setType] = useState<CustomFieldType>('TEXT');
  const [options, setOptions] = useState<FieldOption[]>([]);
  const [required, setRequired] = useState(false);
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(field?.name ?? '');
      setType(field?.type ?? 'TEXT');
      setOptions(field?.options ?? []);
      setRequired(field?.required ?? false);
      setActive(field?.active ?? true);
      setError(null);
    }
  }, [open, field]);

  const optionsOk =
    !NEEDS_OPTIONS(type) ||
    (options.length > 0 &&
      options.every((o) => o.label.trim() && o.value.trim()) &&
      new Set(options.map((o) => o.value.trim())).size === options.length);
  const nameOk = name.trim().length > 0;
  const canSave = nameOk && optionsOk && !create.isPending && !update.isPending;

  const submit = async () => {
    if (!canSave) return;
    setError(null);
    const payload: CustomFieldInput = {
      name: name.trim(),
      type,
      required,
      active,
      options: NEEDS_OPTIONS(type)
        ? options.map((o) => ({ label: o.label.trim(), value: o.value.trim() }))
        : undefined,
    };
    try {
      if (field) {
        await update.mutateAsync({ id: field.id, ...payload });
        toast('Campo atualizado', 'success');
      } else {
        await create.mutateAsync(payload);
        toast('Campo criado', 'success');
      }
      onClose();
    } catch (e) {
      const msg = axios.isAxiosError(e) ? e.response?.data?.message : null;
      setError(msg || 'Falha ao salvar');
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={field ? 'Editar campo' : 'Novo campo'} width={620}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <Label t={t}>Nome do campo</Label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            style={inputStyle(t)}
            placeholder="Ex.: Origem do lead"
          />
        </div>

        <div>
          <Label t={t}>Tipo</Label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {TYPE_ORDER.map((k) => (
              <TypeCard key={k} kind={k} active={type === k} onPick={() => setType(k)} />
            ))}
          </div>
        </div>

        {NEEDS_OPTIONS(type) && (
          <div>
            <Label t={t}>Opções</Label>
            <OptionsEditor options={options} onChange={setOptions} />
          </div>
        )}

        <div style={{ display: 'flex', gap: 24 }}>
          <ToggleField label="Obrigatório" checked={required} onChange={setRequired} />
          <ToggleField label="Ativo" checked={active} onChange={setActive} />
        </div>

        <div>
          <Label t={t}>Pré-visualização</Label>
          <FieldPreview type={type} name={name || 'Nome do campo'} options={options} required={required} />
        </div>

        {error && (
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
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onClose} style={buttonGhost(t)}>
            Cancelar
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={submit}
            style={{
              ...buttonGold(t),
              cursor: canSave ? 'pointer' : 'not-allowed',
              opacity: canSave ? 1 : 0.5,
            }}
          >
            {create.isPending || update.isPending ? 'Salvando…' : field ? 'Salvar' : 'Criar'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function TypeCard({
  kind,
  active,
  onPick,
}: {
  kind: CustomFieldType;
  active: boolean;
  onPick: () => void;
}) {
  const { tokens: t } = useTheme();
  const meta = TYPE_META[kind];
  const Icon = Icons[meta.icon];
  return (
    <button
      type="button"
      onClick={onPick}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 6,
        padding: '10px 12px',
        background: active ? t.bgActive : t.bgInput,
        border: `1.5px solid ${active ? t.gold : t.border}`,
        borderRadius: 8,
        cursor: 'pointer',
        fontFamily: FONT_STACK,
        textAlign: 'left',
        color: t.text,
      }}
    >
      <Icon s={16} c={active ? t.gold : t.icon} />
      <div style={{ fontSize: 12.5, fontWeight: 500 }}>{meta.label}</div>
      <div style={{ fontSize: 10.5, color: t.textSubtle }}>{meta.description}</div>
    </button>
  );
}

// ---------- Options editor (sortable) ----------

function OptionsEditor({
  options,
  onChange,
}: {
  options: FieldOption[];
  onChange: (next: FieldOption[]) => void;
}) {
  const { tokens: t } = useTheme();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  // dnd precisa de id estável — usa o índice como sufixo se label vazio
  const items = options.map((o, i) => ({ ...o, _id: `${i}-${o.value || o.label}` }));
  const ids = items.map((i) => i._id);

  const handleEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i._id === active.id);
    const newIndex = items.findIndex((i) => i._id === over.id);
    onChange(arrayMove(options, oldIndex, newIndex));
  };

  const update = (idx: number, patch: Partial<FieldOption>) => {
    onChange(options.map((o, i) => (i === idx ? { ...o, ...patch } : o)));
  };
  const remove = (idx: number) => onChange(options.filter((_, i) => i !== idx));
  const add = () => onChange([...options, { label: '', value: '' }]);

  const valueCounts = new Map<string, number>();
  options.forEach((o) => valueCounts.set(o.value.trim(), (valueCounts.get(o.value.trim()) ?? 0) + 1));

  return (
    <div
      style={{
        background: t.bgInput,
        border: `1px solid ${t.border}`,
        borderRadius: 8,
        padding: 10,
      }}
    >
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {items.map((opt, i) => (
            <SortableOption
              key={opt._id}
              id={opt._id}
              option={opt}
              dupValue={opt.value.trim() !== '' && (valueCounts.get(opt.value.trim()) ?? 0) > 1}
              onChange={(p) => update(i, p)}
              onRemove={() => remove(i)}
            />
          ))}
        </SortableContext>
      </DndContext>
      <button
        type="button"
        onClick={add}
        style={{
          marginTop: 8,
          background: 'transparent',
          border: `1px dashed ${t.border}`,
          color: t.text,
          fontSize: 12,
          padding: '7px 12px',
          borderRadius: 7,
          cursor: 'pointer',
          fontFamily: FONT_STACK,
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        }}
      >
        <Icons.Plus s={11} c="currentColor" /> Adicionar opção
      </button>
      {options.length === 0 && (
        <div style={{ fontSize: 11, color: t.textFaint, marginTop: 6, textAlign: 'center' }}>
          Adicione ao menos uma opção
        </div>
      )}
    </div>
  );
}

function SortableOption({
  id,
  option,
  dupValue,
  onChange,
  onRemove,
}: {
  id: string;
  option: FieldOption;
  dupValue: boolean;
  onChange: (patch: Partial<FieldOption>) => void;
  onRemove: () => void;
}) {
  const { tokens: t } = useTheme();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    display: 'grid',
    gridTemplateColumns: '20px 1fr 1fr 28px',
    gap: 8,
    alignItems: 'center',
    padding: '6px 0',
  };
  return (
    <div ref={setNodeRef} style={style}>
      <button
        type="button"
        {...attributes}
        {...listeners}
        title="Arrastar"
        style={{ background: 'transparent', border: 'none', cursor: 'grab', padding: 0, color: t.textFaint }}
      >
        <Icons.Grip s={12} c="currentColor" />
      </button>
      <input
        value={option.label}
        onChange={(e) => onChange({ label: e.target.value })}
        placeholder="Rótulo"
        style={{ ...inputStyle(t), padding: '7px 10px', fontSize: 12.5 }}
      />
      <input
        value={option.value}
        onChange={(e) => onChange({ value: e.target.value })}
        placeholder="valor"
        style={{
          ...inputStyle(t),
          padding: '7px 10px',
          fontSize: 12.5,
          borderColor: dupValue ? t.danger : t.border,
        }}
      />
      <button
        type="button"
        onClick={onRemove}
        title="Remover"
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: t.textDim,
          padding: 4,
        }}
      >
        <Icons.X s={13} c="currentColor" />
      </button>
    </div>
  );
}

// ---------- Toggle field ----------

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const { tokens: t } = useTheme();
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
      <Switch checked={checked} onChange={onChange} ariaLabel={label} />
      <span style={{ fontSize: 12.5, color: t.text }}>{label}</span>
    </label>
  );
}

// ---------- Live preview ----------

function FieldPreview({
  type,
  name,
  options,
  required,
}: {
  type: CustomFieldType;
  name: string;
  options: FieldOption[];
  required: boolean;
}) {
  const { tokens: t } = useTheme();
  const labelEl = (
    <Label t={t}>
      {name}
      {required && <span style={{ color: t.danger, marginLeft: 4 }}>*</span>}
    </Label>
  );
  return (
    <div
      style={{
        background: t.bgInput,
        border: `1px solid ${t.border}`,
        borderRadius: 8,
        padding: '14px 16px',
      }}
    >
      {labelEl}
      <PreviewControl type={type} options={options} />
    </div>
  );
}

function PreviewControl({ type, options }: { type: CustomFieldType; options: FieldOption[] }) {
  const { tokens: t } = useTheme();
  const ctrl: React.CSSProperties = { ...inputStyle(t), pointerEvents: 'none' };
  switch (type) {
    case 'TEXT':
      return <input style={ctrl} placeholder="Texto curto" readOnly />;
    case 'LONG_TEXT':
      return <textarea style={{ ...ctrl, minHeight: 64, resize: 'none' }} placeholder="Texto longo…" readOnly />;
    case 'NUMBER':
      return <input style={ctrl} placeholder="0" readOnly />;
    case 'CURRENCY':
      return <input style={ctrl} placeholder="R$ 0,00" readOnly />;
    case 'DATE':
      return <input style={ctrl} placeholder="dd/mm/aaaa" readOnly />;
    case 'URL':
      return <input style={ctrl} placeholder="https://" readOnly />;
    case 'BOOLEAN':
      return <Switch checked={false} onChange={() => {}} ariaLabel="preview" />;
    case 'SELECT':
      return (
        <select style={ctrl} disabled>
          <option>{options[0]?.label ?? '— escolha —'}</option>
        </select>
      );
    case 'MULTI_SELECT':
      return (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {options.length === 0 && <span style={{ fontSize: 12, color: t.textFaint }}>Adicione opções</span>}
          {options.slice(0, 4).map((o, i) => (
            <span
              key={i}
              style={{
                background: t.goldFaint,
                color: t.gold,
                padding: '3px 9px',
                borderRadius: 999,
                fontSize: 11.5,
              }}
            >
              {o.label || '—'}
            </span>
          ))}
        </div>
      );
  }
}

// ============================================================
// FALLBACKS
// ============================================================

function Skeleton({ t }: { t: ReturnType<typeof useTheme>['tokens'] }) {
  return (
    <div
      style={{
        background: t.bgElevated,
        border: `1px solid ${t.border}`,
        borderRadius: 12,
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        opacity: 0.6,
      }}
    >
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} style={{ height: 22, background: t.bgHover, borderRadius: 6 }} />
      ))}
    </div>
  );
}

function Empty({ t, onCreate }: { t: ReturnType<typeof useTheme>['tokens']; onCreate: () => void }) {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: 40,
        background: t.bgElevated,
        border: `1px dashed ${t.border}`,
        borderRadius: 12,
      }}
    >
      <div style={{ fontSize: 14, color: t.text, marginBottom: 6 }}>Sem campos personalizados</div>
      <div style={{ fontSize: 12.5, color: t.textSubtle, marginBottom: 16 }}>
        Crie um campo para capturar dados específicos do seu funil.
      </div>
      <button type="button" onClick={onCreate} style={buttonGold(t)}>
        <Icons.Plus s={12} c="#1a1300" /> Criar primeiro campo
      </button>
    </div>
  );
}

// ============================================================
// PRIMITIVES
// ============================================================

function Label({ children, t }: { children: React.ReactNode; t: ReturnType<typeof useTheme>['tokens'] }) {
  return (
    <label
      style={{
        display: 'block',
        fontSize: 11,
        letterSpacing: 0.4,
        textTransform: 'uppercase',
        color: t.textSubtle,
        marginBottom: 6,
        fontWeight: 500,
      }}
    >
      {children}
    </label>
  );
}

function inputStyle(t: ReturnType<typeof useTheme>['tokens']): React.CSSProperties {
  return {
    width: '100%',
    background: t.bgInput,
    border: `1px solid ${t.border}`,
    borderRadius: 8,
    padding: '10px 12px',
    fontSize: 13,
    color: t.text,
    outline: 'none',
    fontFamily: FONT_STACK,
  };
}

function buttonGold(t: ReturnType<typeof useTheme>['tokens']): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    background: t.gold,
    color: '#1a1300',
    border: 'none',
    borderRadius: 8,
    padding: '9px 16px',
    fontSize: 12.5,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: FONT_STACK,
  };
}

function buttonGhost(t: ReturnType<typeof useTheme>['tokens']): React.CSSProperties {
  return {
    background: 'transparent',
    color: t.text,
    border: `1px solid ${t.border}`,
    borderRadius: 8,
    padding: '8px 14px',
    fontSize: 12.5,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: FONT_STACK,
  };
}
