import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import axios from 'axios';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { OpportunityPopup } from '../components/opportunity/OpportunityPopup';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useTheme } from '../lib/ThemeContext';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { TagPicker } from '../components/ui/TagPicker';
import { toast } from '../components/ui/Toast';
import { Icons, type IconName } from '../components/icons';
import { FONT_STACK } from '../lib/theme';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/useAuthStore';
import { usePipelines } from '../hooks/usePipelines';
import { useTags, type Tag } from '../hooks/useTags';
import { useTeam, type TeamMember } from '../hooks/useTeam';
import { StartCadenceForTarget } from '../components/cadences/StartCadenceForTarget';
import { TransferOpportunityModal } from '../components/TransferOpportunityModal';
import {
  buildBoardExportUrl,
  useBoard,
  useCreateOpportunity,
  useDeleteOpportunity,
  useMoveOpportunity,
  useOpportunity,
  useReorderOpportunity,
  useUpdateOpportunity,
  type BoardCard,
  type BoardColumn,
  type BoardFilters,
  type Priority,
} from '../hooks/useOpportunities';

const PRIORITY_LABEL: Record<Priority, string> = {
  LOW: 'Baixa',
  MEDIUM: 'Média',
  HIGH: 'Alta',
  URGENT: 'Urgente',
};

const PRIORITY_COLOR: Record<Priority, string> = {
  LOW: '#94a3b8',
  MEDIUM: '#3b82f6',
  HIGH: '#f97316',
  URGENT: '#ef4444',
};

// ============================================================
// PAGE
// ============================================================

export function PipelinePage() {
  const { tokens: t } = useTheme();
  const me = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const pipelines = usePipelines();
  const tagsQ = useTags();
  const teamQ = useTeam();

  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const [view, setView] = useState<'kanban' | 'list'>('kanban');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [ownerId, setOwnerId] = useState<string | undefined>(undefined);
  const [priority, setPriority] = useState<Priority | undefined>(undefined);
  const [dueFrom, setDueFrom] = useState('');
  const [dueTo, setDueTo] = useState('');
  const [creating, setCreating] = useState<{ stageId: string | null }>({ stageId: null });
  const [searchParams, setSearchParams] = useSearchParams();
  const editingId = searchParams.get('opp');
  const setEditingId = (id: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (id) next.set('opp', id);
    else next.delete('opp');
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  // Default: primeiro funil ativo
  useEffect(() => {
    if (!pipelineId && pipelines.data && pipelines.data.length > 0) {
      const firstActive = pipelines.data.find((p) => p.active) ?? pipelines.data[0];
      setPipelineId(firstActive!.id);
    }
  }, [pipelines.data, pipelineId]);

  const filters: BoardFilters = {
    search: debouncedSearch || undefined,
    tagIds: tagIds.length > 0 ? tagIds : undefined,
    ownerId,
    priority,
    dueFrom: dueFrom || undefined,
    dueTo: dueTo || undefined,
  };

  const board = useBoard(pipelineId, filters);

  const hasActiveFilters =
    !!debouncedSearch ||
    tagIds.length > 0 ||
    ownerId !== undefined ||
    priority !== undefined ||
    !!dueFrom ||
    !!dueTo;

  const clearFilters = () => {
    setSearch('');
    setTagIds([]);
    setOwnerId(undefined);
    setPriority(undefined);
    setDueFrom('');
    setDueTo('');
  };

  const exportCsv = async () => {
    if (!pipelineId) return;
    try {
      const res = await api.get<Blob>(buildBoardExportUrl(pipelineId, filters), { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `oportunidades-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
    } catch (e) {
      toast(axiosMsg(e) || 'Falha ao exportar', 'error');
    }
  };

  // Edge case: sem pipelines
  if (pipelines.isSuccess && (!pipelines.data || pipelines.data.length === 0)) {
    return <NoPipelinesEmpty t={t} onConfigure={() => navigate('/settings/pipelines')} />;
  }

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        background: t.bg,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <Topbar
        t={t}
        pipelines={pipelines.data ?? []}
        pipelineId={pipelineId}
        onPipelineId={setPipelineId}
        view={view}
        onView={setView}
        search={search}
        onSearch={setSearch}
        tagIds={tagIds}
        onTagIds={setTagIds}
        ownerId={ownerId}
        onOwnerId={setOwnerId}
        priority={priority}
        onPriority={setPriority}
        dueFrom={dueFrom}
        dueTo={dueTo}
        onDates={(f, to) => {
          setDueFrom(f);
          setDueTo(to);
        }}
        tags={tagsQ.data ?? []}
        team={teamQ.data ?? []}
        hasActiveFilters={hasActiveFilters}
        onClear={clearFilters}
        onExport={exportCsv}
      />

      {!pipelineId || board.isLoading ? (
        <div style={{ padding: 40, color: t.textDim, fontSize: 13 }}>Carregando…</div>
      ) : board.data && board.data.columns.every((c) => c.count === 0) && !hasActiveFilters ? (
        <EmptyBoard t={t} onCreate={() => setCreating({ stageId: board.data!.columns[0]?.stageId ?? null })} />
      ) : view === 'kanban' ? (
        <KanbanBoard
          data={board.data!}
          onAddInStage={(stageId) => setCreating({ stageId })}
          onCardClick={(id) => setEditingId(id)}
        />
      ) : (
        <ListView data={board.data!} onRowClick={(id) => setEditingId(id)} />
      )}

      {/* Criação rápida — abre com stageId pré-preenchida */}
      {creating.stageId && pipelineId && (
        <OpportunityModal
          open={!!creating.stageId}
          onClose={() => setCreating({ stageId: null })}
          pipelineId={pipelineId}
          stageId={creating.stageId}
          tags={tagsQ.data ?? []}
          team={teamQ.data ?? []}
          defaultOwnerId={me?.id ?? null}
        />
      )}

      {/* Edição — abre popup central com 6 abas */}
      {editingId && (
        <OpportunityPopup
          key={editingId}
          opportunityId={editingId}
          onClose={() => setEditingId(null)}
        />
      )}
    </div>
  );
}

// ============================================================
// TOPBAR
// ============================================================

function Topbar({
  t,
  pipelines,
  pipelineId,
  onPipelineId,
  view,
  onView,
  search,
  onSearch,
  tagIds,
  onTagIds,
  ownerId,
  onOwnerId,
  priority,
  onPriority,
  dueFrom,
  dueTo,
  onDates,
  tags,
  team,
  hasActiveFilters,
  onClear,
  onExport,
}: {
  t: ReturnType<typeof useTheme>['tokens'];
  pipelines: { id: string; name: string; active: boolean }[];
  pipelineId: string | null;
  onPipelineId: (v: string) => void;
  view: 'kanban' | 'list';
  onView: (v: 'kanban' | 'list') => void;
  search: string;
  onSearch: (v: string) => void;
  tagIds: string[];
  onTagIds: (v: string[]) => void;
  ownerId: string | undefined;
  onOwnerId: (v: string | undefined) => void;
  priority: Priority | undefined;
  onPriority: (v: Priority | undefined) => void;
  dueFrom: string;
  dueTo: string;
  onDates: (from: string, to: string) => void;
  tags: Tag[];
  team: TeamMember[];
  hasActiveFilters: boolean;
  onClear: () => void;
  onExport: () => void;
}) {
  const current = pipelines.find((p) => p.id === pipelineId);
  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        background: t.bg,
        borderBottom: `1px solid ${t.border}`,
        padding: '20px 28px 16px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
        <PipelineSelect
          t={t}
          pipelines={pipelines}
          current={current}
          onSelect={onPipelineId}
        />
        <ViewToggle t={t} value={view} onChange={onView} />
        <div style={{ flex: 1 }} />
        <button type="button" onClick={onExport} style={buttonGhost(t)}>
          Exportar
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flex: '1 1 240px',
            minWidth: 200,
            background: t.bgInput,
            border: `1px solid ${t.border}`,
            borderRadius: 8,
            padding: '0 12px',
            height: 34,
          }}
        >
          <Icons.Search s={13} c={t.icon} />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Buscar por título ou contato…"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: t.text,
              fontSize: 12.5,
              fontFamily: FONT_STACK,
            }}
          />
        </div>
        <FilterChip
          t={t}
          label={tagIds.length === 0 ? 'Tags' : tagIds.length === 1 ? tags.find((tt) => tt.id === tagIds[0])?.name ?? '1 tag' : `${tagIds.length} tags`}
          active={tagIds.length > 0}
          renderPopover={(close) => (
            <TagPickerPopover
              t={t}
              tags={tags}
              selected={tagIds}
              onChange={onTagIds}
              onClear={() => {
                onTagIds([]);
                close();
              }}
            />
          )}
        />
        <FilterChip
          t={t}
          label={ownerId ? team.find((u) => u.id === ownerId)?.name ?? 'Responsável' : 'Responsável'}
          active={!!ownerId}
          renderPopover={(close) => (
            <SelectPopover
              t={t}
              options={[{ value: '', label: 'Todos' }, ...team.map((u) => ({ value: u.id, label: u.name }))]}
              value={ownerId ?? ''}
              onChange={(v) => {
                onOwnerId(v || undefined);
                close();
              }}
            />
          )}
        />
        <FilterChip
          t={t}
          label={priority ? PRIORITY_LABEL[priority] : 'Prioridade'}
          active={!!priority}
          renderPopover={(close) => (
            <SelectPopover
              t={t}
              options={[
                { value: '', label: 'Todas' },
                { value: 'LOW', label: 'Baixa' },
                { value: 'MEDIUM', label: 'Média' },
                { value: 'HIGH', label: 'Alta' },
                { value: 'URGENT', label: 'Urgente' },
              ]}
              value={priority ?? ''}
              onChange={(v) => {
                onPriority((v || undefined) as Priority | undefined);
                close();
              }}
            />
          )}
        />
        <FilterChip
          t={t}
          label={
            !dueFrom && !dueTo
              ? 'Período'
              : dueFrom && dueTo
                ? `${formatDateBR(dueFrom)} → ${formatDateBR(dueTo)}`
                : dueFrom
                  ? `Desde ${formatDateBR(dueFrom)}`
                  : `Até ${formatDateBR(dueTo)}`
          }
          active={!!dueFrom || !!dueTo}
          renderPopover={() => (
            <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Field label="De">
                <input type="date" value={dueFrom} onChange={(e) => onDates(e.target.value, dueTo)} style={inputStyle(t)} />
              </Field>
              <Field label="Até">
                <input type="date" value={dueTo} onChange={(e) => onDates(dueFrom, e.target.value)} style={inputStyle(t)} />
              </Field>
              {(dueFrom || dueTo) && (
                <button
                  type="button"
                  onClick={() => onDates('', '')}
                  style={{ ...buttonGhost(t), padding: '6px 10px', fontSize: 11.5 }}
                >
                  Limpar
                </button>
              )}
            </div>
          )}
        />
        {hasActiveFilters && (
          <button type="button" onClick={onClear} style={{ ...buttonGhost(t), height: 34 }}>
            Limpar filtros
          </button>
        )}
      </div>
    </div>
  );
}

function PipelineSelect({
  t,
  pipelines,
  current,
  onSelect,
}: {
  t: ReturnType<typeof useTheme>['tokens'];
  pipelines: { id: string; name: string; active: boolean }[];
  current: { id: string; name: string } | undefined;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '7px 12px',
          background: t.bgElevated,
          border: `1px solid ${t.border}`,
          borderRadius: 8,
          color: t.text,
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
          fontFamily: FONT_STACK,
          letterSpacing: -0.2,
        }}
      >
        <Icons.Pipeline s={13} c={t.gold} />
        {current?.name ?? 'Selecione um funil'}
        <Icons.ChevronD s={11} c={t.textSubtle} />
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 38,
            left: 0,
            zIndex: 30,
            minWidth: 240,
            background: t.bgElevated,
            border: `1px solid ${t.border}`,
            borderRadius: 8,
            boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
            padding: 4,
          }}
        >
          {pipelines.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                onSelect(p.id);
                setOpen(false);
              }}
              style={{
                display: 'flex',
                width: '100%',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 10px',
                background: current?.id === p.id ? t.bgHover : 'transparent',
                border: 'none',
                borderRadius: 6,
                color: current?.id === p.id ? t.gold : t.text,
                fontSize: 12.5,
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: FONT_STACK,
                textAlign: 'left',
              }}
              onMouseEnter={(e) => {
                if (current?.id !== p.id) e.currentTarget.style.background = t.bgHover;
              }}
              onMouseLeave={(e) => {
                if (current?.id !== p.id) e.currentTarget.style.background = 'transparent';
              }}
            >
              <span>{p.name}</span>
              {!p.active && (
                <span style={{ fontSize: 10, color: t.textFaint, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Inativo
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ViewToggle({
  t,
  value,
  onChange,
}: {
  t: ReturnType<typeof useTheme>['tokens'];
  value: 'kanban' | 'list';
  onChange: (v: 'kanban' | 'list') => void;
}) {
  const opts: { key: 'kanban' | 'list'; label: string }[] = [
    { key: 'kanban', label: 'Kanban' },
    { key: 'list', label: 'Lista' },
  ];
  return (
    <div
      style={{
        display: 'inline-flex',
        background: t.bgInput,
        border: `1px solid ${t.border}`,
        borderRadius: 8,
        padding: 2,
      }}
    >
      {opts.map((o) => {
        const active = value === o.key;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            style={{
              padding: '6px 14px',
              border: 'none',
              borderRadius: 6,
              background: active ? t.gold : 'transparent',
              color: active ? '#1a1300' : t.textDim,
              fontSize: 12,
              fontWeight: active ? 600 : 500,
              cursor: 'pointer',
              fontFamily: FONT_STACK,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function FilterChip({
  t,
  label,
  active,
  renderPopover,
}: {
  t: ReturnType<typeof useTheme>['tokens'];
  label: string;
  active: boolean;
  renderPopover: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          height: 34,
          padding: '0 12px',
          background: active ? t.goldFaint : t.bgInput,
          border: `1px solid ${active ? t.gold : t.border}`,
          borderRadius: 8,
          color: active ? t.gold : t.text,
          fontSize: 12.5,
          fontWeight: 500,
          cursor: 'pointer',
          fontFamily: FONT_STACK,
        }}
      >
        {label}
        <Icons.ChevronD s={11} c={active ? t.gold : t.textSubtle} />
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 40,
            left: 0,
            zIndex: 30,
            minWidth: 220,
            background: t.bgElevated,
            border: `1px solid ${t.border}`,
            borderRadius: 8,
            boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
            padding: 4,
          }}
        >
          {renderPopover(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

function TagPickerPopover({
  t,
  tags,
  selected,
  onChange,
  onClear,
}: {
  t: ReturnType<typeof useTheme>['tokens'];
  tags: Tag[];
  selected: string[];
  onChange: (next: string[]) => void;
  onClear: () => void;
}) {
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  return (
    <>
      <div style={{ maxHeight: 240, overflowY: 'auto' }}>
        {tags.length === 0 ? (
          <div style={{ padding: 12, fontSize: 12, color: t.textSubtle }}>Nenhuma tag.</div>
        ) : (
          tags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => toggle(tag.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '7px 10px',
                width: '100%',
                background: selected.includes(tag.id) ? t.bgHover : 'transparent',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                color: t.text,
                fontSize: 12.5,
                fontFamily: FONT_STACK,
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: 2, background: tag.color }} />
              {tag.name}
              {selected.includes(tag.id) && (
                <Icons.Check s={11} c={t.gold} {...{ style: { marginLeft: 'auto' } }} />
              )}
            </button>
          ))
        )}
      </div>
      {selected.length > 0 && (
        <div style={{ borderTop: `1px solid ${t.border}`, padding: 6 }}>
          <button type="button" onClick={onClear} style={{ ...buttonGhost(t), width: '100%', padding: '6px 10px', fontSize: 11.5 }}>
            Limpar
          </button>
        </div>
      )}
    </>
  );
}

function SelectPopover({
  t,
  options,
  value,
  onChange,
}: {
  t: ReturnType<typeof useTheme>['tokens'];
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ maxHeight: 240, overflowY: 'auto' }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value || '_all'}
            type="button"
            onClick={() => onChange(o.value)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              padding: '8px 10px',
              background: active ? t.bgHover : 'transparent',
              border: 'none',
              borderRadius: 6,
              color: active ? t.gold : t.text,
              fontSize: 12.5,
              cursor: 'pointer',
              fontFamily: FONT_STACK,
              textAlign: 'left',
            }}
            onMouseEnter={(e) => {
              if (!active) e.currentTarget.style.background = t.bgHover;
            }}
            onMouseLeave={(e) => {
              if (!active) e.currentTarget.style.background = 'transparent';
            }}
          >
            {o.label}
            {active && <Icons.Check s={11} c="currentColor" />}
          </button>
        );
      })}
    </div>
  );
}

// ============================================================
// KANBAN
// ============================================================

function KanbanBoard({
  data,
  onAddInStage,
  onCardClick,
}: {
  data: { columns: BoardColumn[] };
  onAddInStage: (stageId: string) => void;
  onCardClick: (id: string) => void;
}) {
  const { tokens: t } = useTheme();
  const move = useMoveOpportunity();
  const reorder = useReorderOpportunity();

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [columns, setColumns] = useState<BoardColumn[]>(data.columns);
  const [activeId, setActiveId] = useState<string | null>(null);
  const dragOriginRef = useRef<{ stageId: string; index: number } | null>(null);

  // Sincroniza estado local com servidor (a menos que esteja arrastando)
  useEffect(() => {
    if (!activeId) setColumns(data.columns);
  }, [data.columns, activeId]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const findContainer = (id: string): string | null => {
    if (columns.some((c) => c.stageId === id)) return id;
    const c = columns.find((col) => col.opportunities.some((o) => o.id === id));
    return c?.stageId ?? null;
  };

  const findCard = (id: string): BoardCard | null => {
    for (const col of columns) {
      const found = col.opportunities.find((o) => o.id === id);
      if (found) return found;
    }
    return null;
  };

  const handleDragStart = (e: DragStartEvent) => {
    const id = String(e.active.id);
    setActiveId(id);
    const container = findContainer(id);
    if (container) {
      const col = columns.find((c) => c.stageId === container)!;
      const index = col.opportunities.findIndex((o) => o.id === id);
      dragOriginRef.current = { stageId: container, index };
    }
  };

  const handleDragOver = (e: DragOverEvent) => {
    const { active, over } = e;
    if (!over) return;
    const activeIdLocal = String(active.id);
    const overIdLocal = String(over.id);
    if (activeIdLocal === overIdLocal) return;

    const activeContainer = findContainer(activeIdLocal);
    const overContainer = findContainer(overIdLocal);
    if (!activeContainer || !overContainer) return;
    if (activeContainer === overContainer) return;

    setColumns((prev) => {
      const activeColumn = prev.find((c) => c.stageId === activeContainer);
      const overColumn = prev.find((c) => c.stageId === overContainer);
      if (!activeColumn || !overColumn) return prev;
      const activeIdx = activeColumn.opportunities.findIndex((o) => o.id === activeIdLocal);
      if (activeIdx < 0) return prev;
      const card = activeColumn.opportunities[activeIdx]!;

      const overIsColumn = overColumn.stageId === overIdLocal;
      const overIdx = overIsColumn
        ? overColumn.opportunities.length
        : overColumn.opportunities.findIndex((o) => o.id === overIdLocal);

      const newActiveOpps = activeColumn.opportunities.filter((_, i) => i !== activeIdx);
      const newOverOpps = [...overColumn.opportunities];
      newOverOpps.splice(overIdx >= 0 ? overIdx : newOverOpps.length, 0, card);

      return prev.map((c) => {
        if (c.stageId === activeContainer)
          return {
            ...c,
            opportunities: newActiveOpps,
            count: newActiveOpps.length,
            totalValue: newActiveOpps.reduce((a, b) => a + b.value, 0),
          };
        if (c.stageId === overContainer)
          return {
            ...c,
            opportunities: newOverOpps,
            count: newOverOpps.length,
            totalValue: newOverOpps.reduce((a, b) => a + b.value, 0),
          };
        return c;
      });
    });
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const origin = dragOriginRef.current;
    setActiveId(null);
    dragOriginRef.current = null;
    const { active, over } = e;
    if (!over || !origin) return;
    const activeIdLocal = String(active.id);
    const overIdLocal = String(over.id);

    const overContainer = findContainer(overIdLocal);
    if (!overContainer) return;

    // Encontra posição final no estado local (já refletindo eventual move via dragOver)
    const finalCol = columns.find((c) => c.stageId === overContainer);
    if (!finalCol) return;

    let finalIdx = finalCol.opportunities.findIndex((o) => o.id === activeIdLocal);

    // Caso o usuário tenha soltado em cima de outro card sem ter ainda triggered o dragOver de cross-column,
    // precisamos calcular indice baseado no over
    if (finalIdx < 0) {
      if (overContainer === overIdLocal) finalIdx = finalCol.opportunities.length;
      else finalIdx = finalCol.opportunities.findIndex((o) => o.id === overIdLocal);
    }
    if (finalIdx < 0) finalIdx = 0;

    const sameContainer = origin.stageId === overContainer;
    if (sameContainer && finalIdx === origin.index) return;

    if (sameContainer) {
      // dragOver não fez swap intra-coluna; agora aplica no estado e dispara reorder
      setColumns((prev) =>
        prev.map((c) => {
          if (c.stageId !== overContainer) return c;
          const opps = [...c.opportunities];
          const fromIdx = opps.findIndex((o) => o.id === activeIdLocal);
          if (fromIdx < 0) return c;
          const [item] = opps.splice(fromIdx, 1);
          opps.splice(finalIdx, 0, item!);
          return { ...c, opportunities: opps };
        }),
      );
      reorder.mutate({ id: activeIdLocal, order: finalIdx }, {
        onError: () => {
          setColumns(data.columns);
          toast('Falha ao reordenar', 'error');
        },
      });
    } else {
      move.mutate(
        { id: activeIdLocal, toStageId: overContainer, order: finalIdx },
        {
          onError: () => {
            setColumns(data.columns);
            toast('Falha ao mover', 'error');
          },
        },
      );
    }
  };

  const handleDragCancel = () => {
    setActiveId(null);
    dragOriginRef.current = null;
    setColumns(data.columns);
  };

  const activeCard = activeId ? findCard(activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowX: 'auto',
          overflowY: 'hidden',
          padding: '16px 28px 28px',
        }}
      >
        <div style={{ display: 'flex', gap: 14, height: '100%' }}>
          {columns.map((col) => (
            <KanbanColumn
              key={col.stageId}
              column={col}
              collapsed={collapsed.has(col.stageId)}
              onToggleCollapse={() => {
                const next = new Set(collapsed);
                if (next.has(col.stageId)) next.delete(col.stageId);
                else next.add(col.stageId);
                setCollapsed(next);
              }}
              onAdd={() => onAddInStage(col.stageId)}
              onCardClick={onCardClick}
            />
          ))}
        </div>
      </div>
      <DragOverlay>
        {activeCard ? <OpportunityCard card={activeCard} dragging /> : null}
      </DragOverlay>
      {/* unused t suppression */}
      <span style={{ display: 'none' }}>{t.bg}</span>
    </DndContext>
  );
}

function KanbanColumn({
  column,
  collapsed,
  onToggleCollapse,
  onAdd,
  onCardClick,
}: {
  column: BoardColumn;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onAdd: () => void;
  onCardClick: (id: string) => void;
}) {
  const { tokens: t } = useTheme();
  const { setNodeRef, isOver } = useDroppable({ id: column.stageId });

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onToggleCollapse}
        title={`${column.stageName} (${column.count})`}
        style={{
          width: 36,
          flexShrink: 0,
          background: t.bgElevated,
          border: `1px solid ${t.border}`,
          borderRadius: 10,
          color: t.text,
          cursor: 'pointer',
          padding: '12px 0',
          fontFamily: FONT_STACK,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span style={{ width: 4, height: 28, borderRadius: 2, background: column.color }} />
        <span
          style={{
            writingMode: 'vertical-rl',
            transform: 'rotate(180deg)',
            fontSize: 11.5,
            letterSpacing: 0.5,
            color: t.textDim,
          }}
        >
          {column.stageName} · {column.count}
        </span>
      </button>
    );
  }

  return (
    <div
      style={{
        width: 320,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        background: t.bgElevated,
        border: `1px solid ${isOver ? t.gold : t.border}`,
        borderRadius: 10,
        overflow: 'hidden',
        transition: 'border-color 120ms ease',
      }}
    >
      <div style={{ height: 3, background: column.color, flexShrink: 0 }} />
      <ColumnHeader column={column} onCollapse={onToggleCollapse} onAdd={onAdd} />
      <SortableContext
        items={column.opportunities.map((o) => o.id)}
        strategy={verticalListSortingStrategy}
      >
        <div
          ref={setNodeRef}
          style={{
            flex: 1,
            minHeight: 80,
            overflowY: 'auto',
            padding: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            background: isOver ? t.bgHover : 'transparent',
            transition: 'background 120ms ease',
          }}
        >
          {column.opportunities.length === 0 ? (
            <div
              style={{
                padding: '20px 10px',
                textAlign: 'center',
                fontSize: 11.5,
                color: t.textFaint,
                border: `1px dashed ${t.border}`,
                borderRadius: 8,
              }}
            >
              Nenhuma oportunidade
              <br />
              <button
                type="button"
                onClick={onAdd}
                style={{
                  marginTop: 6,
                  background: 'transparent',
                  border: 'none',
                  color: t.gold,
                  fontSize: 11.5,
                  cursor: 'pointer',
                  fontFamily: FONT_STACK,
                  textDecoration: 'underline',
                }}
              >
                + Adicionar
              </button>
            </div>
          ) : (
            column.opportunities.map((card) => (
              <SortableCard key={card.id} card={card} onClick={() => onCardClick(card.id)} />
            ))
          )}
        </div>
      </SortableContext>
    </div>
  );
}

function ColumnHeader({
  column,
  onCollapse,
  onAdd,
}: {
  column: BoardColumn;
  onCollapse: () => void;
  onAdd: () => void;
}) {
  const { tokens: t } = useTheme();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setMenuOpen(false), menuOpen);

  return (
    <div
      style={{
        padding: '12px 12px 8px',
        borderBottom: `1px solid ${t.border}`,
        background: t.bgElevated,
        position: 'sticky',
        top: 0,
        zIndex: 2,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              color: t.text,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              letterSpacing: -0.1,
            }}
          >
            {column.stageName}
          </div>
          <span
            style={{
              fontSize: 10.5,
              padding: '1px 7px',
              borderRadius: 999,
              background: t.bgHover,
              color: t.textDim,
              fontVariantNumeric: 'tabular-nums',
              fontWeight: 500,
            }}
          >
            {column.count}
          </span>
          {column.isClosedWon && (
            <span title="Etapa de Ganho" style={{ fontSize: 11, color: t.success }}>✓</span>
          )}
          {column.isClosedLost && (
            <span title="Etapa de Perdido" style={{ fontSize: 11, color: t.danger }}>✕</span>
          )}
        </div>
        <button
          type="button"
          onClick={onAdd}
          title="Adicionar oportunidade"
          style={{
            width: 24,
            height: 24,
            background: 'transparent',
            border: `1px solid ${t.border}`,
            borderRadius: 6,
            cursor: 'pointer',
            color: t.gold,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = t.bgHover)}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <Icons.Plus s={12} c="currentColor" />
        </button>
        <div ref={ref} style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            title="Mais ações"
            style={{
              width: 24,
              height: 24,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: t.textDim,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1,
              padding: 0,
            }}
          >
            <Icons.Dot s={3} c="currentColor" />
            <Icons.Dot s={3} c="currentColor" />
            <Icons.Dot s={3} c="currentColor" />
          </button>
          {menuOpen && (
            <div
              style={{
                position: 'absolute',
                right: 0,
                top: 28,
                width: 170,
                background: t.bgElevated,
                border: `1px solid ${t.border}`,
                borderRadius: 8,
                boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
                padding: 4,
                zIndex: 10,
              }}
            >
              <MenuItem label="Recolher coluna" onClick={() => { setMenuOpen(false); onCollapse(); }} />
              <MenuItem label="Configurar etapa" onClick={() => { setMenuOpen(false); navigate('/settings/pipelines'); }} />
            </div>
          )}
        </div>
      </div>
      <div style={{ fontSize: 11, color: t.textDim, fontVariantNumeric: 'tabular-nums' }}>
        {formatBRL(column.totalValue)}
      </div>
    </div>
  );
}

function MenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  const { tokens: t } = useTheme();
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: '100%',
        textAlign: 'left',
        padding: '7px 10px',
        background: hover ? t.bgHover : 'transparent',
        border: 'none',
        borderRadius: 6,
        fontSize: 12,
        color: t.text,
        cursor: 'pointer',
        fontFamily: FONT_STACK,
      }}
    >
      {label}
    </button>
  );
}

// ============================================================
// CARD
// ============================================================

function SortableCard({ card, onClick }: { card: BoardCard; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <OpportunityCard card={card} onClick={onClick} />
    </div>
  );
}

function OpportunityCard({
  card,
  dragging,
  onClick,
}: {
  card: BoardCard;
  dragging?: boolean;
  onClick?: () => void;
}) {
  const { tokens: t } = useTheme();
  const navigate = useNavigate();
  const [hover, setHover] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [cadenceOpen, setCadenceOpen] = useState(false);

  const accentLeft =
    card.priority === 'URGENT' || card.priority === 'HIGH' ? PRIORITY_COLOR[card.priority] : null;
  const overdueBorder = card.hasOverdueReminder ? hexAlpha(t.danger, 0.55) : null;

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        background: t.bg,
        border: `1px solid ${overdueBorder ?? t.border}`,
        borderLeft: accentLeft ? `3px solid ${accentLeft}` : `1px solid ${overdueBorder ?? t.border}`,
        borderRadius: 8,
        padding: '10px 12px 10px 12px',
        boxShadow: dragging
          ? '0 14px 32px rgba(0,0,0,0.35)'
          : hover
            ? '0 6px 16px rgba(0,0,0,0.12)'
            : 'none',
        transform: hover && !dragging ? 'translateY(-1px)' : undefined,
        transition: 'transform 120ms ease, box-shadow 120ms ease',
        cursor: dragging ? 'grabbing' : 'pointer',
      }}
    >
      <div
        style={{
          fontSize: 12.5,
          fontWeight: 600,
          color: t.text,
          letterSpacing: -0.1,
          lineHeight: 1.35,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          marginBottom: 3,
        }}
      >
        {card.title}
      </div>
      <div
        style={{
          fontSize: 11,
          color: t.textSubtle,
          marginBottom: 6,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {card.contactName}
      </div>
      <div
        style={{
          fontSize: 14.5,
          fontWeight: 600,
          color: t.gold,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: -0.3,
          marginBottom: 9,
        }}
      >
        {formatBRL(card.value)}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        {card.tagsCount > 0 && (
          <div
            title={card.tags.map((tag) => tag.name).join(', ')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              fontSize: 10.5,
              color: t.textDim,
            }}
          >
            🏷 <span style={{ fontVariantNumeric: 'tabular-nums' }}>{card.tagsCount}</span>
          </div>
        )}
        {card.tags.slice(0, 3).map((tag) => (
          <span
            key={tag.id}
            title={tag.name}
            style={{ width: 6, height: 6, borderRadius: 999, background: tag.color, flexShrink: 0 }}
          />
        ))}
        <div style={{ flex: 1 }} />
        {card.ownerName && <Avatar name={card.ownerName} size={20} />}
        <span
          title={`Prioridade: ${PRIORITY_LABEL[card.priority]}`}
          style={{
            width: 7,
            height: 7,
            borderRadius: 999,
            background: PRIORITY_COLOR[card.priority],
          }}
        />
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 10.5,
          color: t.textFaint,
        }}
      >
        <span>há {daysAgo(card.lastActivity)}d</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {card.unreadMessages > 0 && (
            <button
              type="button"
              title="Abrir conversa"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/conversations?contactId=${card.contactId}`);
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
                color: t.gold,
                background: 'transparent',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                fontSize: 'inherit',
                fontFamily: 'inherit',
              }}
            >
              💬 {card.unreadMessages}
            </button>
          )}
          {card.hasActiveReminder && (
            <span
              title={card.hasOverdueReminder ? 'Lembrete atrasado' : 'Lembrete ativo'}
              style={{ color: card.hasOverdueReminder ? t.danger : t.gold }}
            >
              🔔
            </span>
          )}
          {card.scheduledMessagesCount > 0 && (
            <span
              title={`${card.scheduledMessagesCount} mensagem${card.scheduledMessagesCount === 1 ? '' : 's'} agendada${card.scheduledMessagesCount === 1 ? '' : 's'}`}
              style={{ color: t.textDim, fontSize: 12 }}
            >
              🕒 {card.scheduledMessagesCount}
            </span>
          )}
        </div>
      </div>

      {hover && !dragging && (
        <div
          style={{
            position: 'absolute',
            right: 8,
            top: 8,
            display: 'flex',
            gap: 4,
            background: t.bgElevated,
            border: `1px solid ${t.border}`,
            borderRadius: 6,
            padding: 2,
            boxShadow: '0 4px 8px rgba(0,0,0,0.12)',
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <QuickActionBtn icon="Chat" title="Mensagem" onClick={() => toast('Chat ainda não implementado', 'info')} />
          <QuickActionBtn icon="Bell" title="Lembrete" onClick={() => setReminderOpen(true)} />
          <QuickActionBtn icon="Bolt" title="Iniciar cadência" onClick={() => setCadenceOpen(true)} />
        </div>
      )}

      {reminderOpen && (
        <ReminderQuickModal
          opportunityId={card.id}
          opportunityTitle={card.title}
          onClose={() => setReminderOpen(false)}
        />
      )}

      <StartCadenceForTarget
        open={cadenceOpen}
        onClose={() => setCadenceOpen(false)}
        target={{ kind: 'opportunity', opportunityId: card.id, label: card.title }}
      />
    </div>
  );
}

function QuickActionBtn({
  icon,
  title,
  onClick,
}: {
  icon: IconName;
  title: string;
  onClick: () => void;
}) {
  const { tokens: t } = useTheme();
  const Icon = Icons[icon];
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{
        width: 22,
        height: 22,
        background: 'transparent',
        border: 'none',
        borderRadius: 4,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: t.textDim,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = t.bgHover)}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <Icon s={12} c="currentColor" />
    </button>
  );
}

function ReminderQuickModal({
  opportunityId: _opportunityId,
  opportunityTitle,
  onClose,
}: {
  opportunityId: string;
  opportunityTitle: string;
  onClose: () => void;
}) {
  const { tokens: t } = useTheme();
  const [title, setTitle] = useState('');
  const [dueAt, setDueAt] = useState('');
  return (
    <Modal open={true} onClose={onClose} title="Novo lembrete" width={380}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 12, color: t.textDim }}>
          Para: <strong style={{ color: t.text }}>{opportunityTitle}</strong>
        </div>
        <Field label="Título">
          <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle(t)} autoFocus />
        </Field>
        <Field label="Data e hora">
          <input
            type="datetime-local"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            style={inputStyle(t)}
          />
        </Field>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onClose} style={buttonGhost(t)}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => {
              toast('Lembretes serão implementados na Fase de Lembretes', 'info');
              onClose();
            }}
            style={buttonGold(t)}
            disabled={!title.trim() || !dueAt}
          >
            Criar
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ============================================================
// LIST VIEW
// ============================================================

function ListView({
  data,
  onRowClick,
}: {
  data: { columns: BoardColumn[] };
  onRowClick: (id: string) => void;
}) {
  const { tokens: t } = useTheme();
  const all = useMemo(() => {
    const flat: (BoardCard & { stageName: string; stageColor: string })[] = [];
    for (const col of data.columns) {
      for (const o of col.opportunities) {
        flat.push({ ...o, stageName: col.stageName, stageColor: col.color });
      }
    }
    return flat;
  }, [data.columns]);

  if (all.length === 0) {
    return (
      <div style={{ padding: 40, color: t.textSubtle, fontSize: 13 }}>Nenhuma oportunidade.</div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px 28px 28px' }}>
      <div style={{ background: t.bgElevated, border: `1px solid ${t.border}`, borderRadius: 12, overflow: 'hidden' }}>
        <Row t={t} head>
          <Cell>Título</Cell>
          <Cell>Contato</Cell>
          <Cell>Etapa</Cell>
          <Cell align="right">Valor</Cell>
          <Cell>Responsável</Cell>
          <Cell>Prioridade</Cell>
          <Cell>Vencimento</Cell>
          <Cell>Último contato</Cell>
        </Row>
        {all.map((o) => (
          <Row key={o.id} t={t} onClick={() => onRowClick(o.id)}>
            <Cell>{o.title}</Cell>
            <Cell>{o.contactName}</Cell>
            <Cell>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  fontSize: 11,
                  padding: '2px 8px',
                  borderRadius: 999,
                  background: hexAlpha(o.stageColor, 0.14),
                  color: o.stageColor,
                  border: `1px solid ${hexAlpha(o.stageColor, 0.4)}`,
                }}
              >
                {o.stageName}
              </span>
            </Cell>
            <Cell align="right">
              <span style={{ color: t.gold, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                {formatBRL(o.value)}
              </span>
            </Cell>
            <Cell>{o.ownerName ?? '—'}</Cell>
            <Cell>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  fontSize: 11,
                  color: PRIORITY_COLOR[o.priority],
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: 999, background: PRIORITY_COLOR[o.priority] }} />
                {PRIORITY_LABEL[o.priority]}
              </span>
            </Cell>
            <Cell>{o.dueDate ? formatDateBR(o.dueDate) : '—'}</Cell>
            <Cell>há {daysAgo(o.lastActivity)}d</Cell>
          </Row>
        ))}
      </div>
    </div>
  );
}

function Row({
  t,
  head,
  children,
  onClick,
}: {
  t: ReturnType<typeof useTheme>['tokens'];
  head?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'grid',
        gridTemplateColumns: '1.6fr 1.4fr 1fr 1fr 1.2fr 1fr 1fr 1fr',
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        background: head ? t.bgInput : hover ? t.bgHover : 'transparent',
        borderBottom: `1px solid ${t.border}`,
        cursor: head ? 'default' : 'pointer',
      }}
    >
      {children}
    </div>
  );
}

function Cell({ align, children }: { align?: 'right'; children: React.ReactNode }) {
  const { tokens: t } = useTheme();
  return (
    <div
      style={{
        fontSize: 12.5,
        color: t.text,
        textAlign: align ?? 'left',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {children}
    </div>
  );
}

// ============================================================
// QUICK CREATE MODAL
// ============================================================

function OpportunityModal({
  open,
  onClose,
  opportunityId,
  pipelineId,
  stageId,
  tags,
  team,
  defaultOwnerId,
}: {
  open: boolean;
  onClose: () => void;
  opportunityId?: string | null;
  pipelineId: string;
  stageId: string | null;
  tags: Tag[];
  team: TeamMember[];
  defaultOwnerId: string | null;
}) {
  const { tokens: t } = useTheme();
  const isEdit = !!opportunityId;
  const detail = useOpportunity(opportunityId ?? null);
  const create = useCreateOpportunity();
  const update = useUpdateOpportunity();
  const remove = useDeleteOpportunity();

  const [title, setTitle] = useState('');
  const [contactQuery, setContactQuery] = useState('');
  const [contactId, setContactId] = useState<string | null>(null);
  const [contactName, setContactName] = useState('');
  const [valueStr, setValueStr] = useState('');
  const [priority, setPriority] = useState<Priority>('MEDIUM');
  const [dueDate, setDueDate] = useState('');
  const [ownerId, setOwnerId] = useState<string>(defaultOwnerId ?? '');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [contacts, setContacts] = useState<{ id: string; name: string; phone: string }[]>([]);
  const [contactDropdownOpen, setContactDropdownOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const contactRef = useRef<HTMLDivElement>(null);
  useClickOutside(contactRef, () => setContactDropdownOpen(false), contactDropdownOpen);

  useEffect(() => {
    if (!open) return;
    if (isEdit && detail.data) {
      const d = detail.data;
      setTitle(d.title);
      setContactId(d.contactId);
      setContactName(d.contactName);
      setContactQuery('');
      setValueStr(d.value > 0 ? String(d.value).replace('.', ',') : '');
      setPriority(d.priority as Priority);
      setDueDate(d.dueDate ? d.dueDate.slice(0, 10) : '');
      setOwnerId(d.ownerId ?? '');
      setTagIds(d.tags.map((tg) => tg.id));
      setError(null);
    } else if (!isEdit) {
      setTitle('');
      setContactQuery('');
      setContactId(null);
      setContactName('');
      setValueStr('');
      setPriority('MEDIUM');
      setDueDate('');
      setOwnerId(defaultOwnerId ?? '');
      setTagIds([]);
      setError(null);
    }
  }, [open, defaultOwnerId, isEdit, detail.data?.id, detail.data?.updatedAt]);

  // Busca contatos com debounce
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(async () => {
      try {
        const res = await api.get<{ data: { id: string; name: string; phone: string }[] }>(
          `/contacts?limit=10${contactQuery ? `&search=${encodeURIComponent(contactQuery)}` : ''}`,
        );
        setContacts(res.data.data);
      } catch {
        setContacts([]);
      }
    }, 250);
    return () => clearTimeout(id);
  }, [contactQuery, open]);

  const valueNum = Number(valueStr.replace(/[^0-9,.-]/g, '').replace(',', '.'));

  const submit = async () => {
    setError(null);
    if (!title.trim()) return setError('Título obrigatório');
    if (!contactId) return setError('Selecione um contato');
    if (!Number.isFinite(valueNum) || valueNum < 0) return setError('Valor inválido');

    try {
      if (isEdit && opportunityId) {
        await update.mutateAsync({
          id: opportunityId,
          title: title.trim(),
          contactId,
          value: valueNum || 0,
          priority,
          dueDate: dueDate || null,
          ownerId: ownerId || null,
          tagIds,
        });
        toast('Oportunidade atualizada', 'success');
      } else {
        if (!stageId) return setError('Etapa não definida');
        await create.mutateAsync({
          title: title.trim(),
          contactId,
          pipelineId,
          stageId,
          value: valueNum || 0,
          priority,
          dueDate: dueDate || null,
          ownerId: ownerId || null,
          tagIds: tagIds.length > 0 ? tagIds : undefined,
        });
        toast('Oportunidade criada', 'success');
      }
      onClose();
    } catch (e) {
      setError(axiosMsg(e) || 'Falha ao salvar');
    }
  };

  const handleDelete = async () => {
    if (!opportunityId) return;
    try {
      await remove.mutateAsync(opportunityId);
      toast('Oportunidade excluída', 'success');
      setConfirmDelete(false);
      onClose();
    } catch (e) {
      toast(axiosMsg(e) || 'Falha ao excluir', 'error');
    }
  };

  const isPending = create.isPending || update.isPending;

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Editar oportunidade' : 'Nova oportunidade'} width={520}>
      {isEdit && !detail.data ? (
        <div style={{ padding: 24, color: t.textDim, fontSize: 13, textAlign: 'center' }}>Carregando…</div>
      ) : (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Título *">
          <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle(t)} autoFocus />
        </Field>

        <Field label="Contato *">
          <div ref={contactRef} style={{ position: 'relative' }}>
            <input
              value={contactName || contactQuery}
              onChange={(e) => {
                setContactQuery(e.target.value);
                setContactName('');
                setContactId(null);
                setContactDropdownOpen(true);
              }}
              onFocus={() => setContactDropdownOpen(true)}
              placeholder="Buscar por nome ou telefone…"
              style={inputStyle(t)}
            />
            {contactDropdownOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: 42,
                  left: 0,
                  right: 0,
                  zIndex: 30,
                  background: t.bgElevated,
                  border: `1px solid ${t.border}`,
                  borderRadius: 8,
                  maxHeight: 220,
                  overflowY: 'auto',
                  boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
                  padding: 4,
                }}
              >
                {contacts.length === 0 ? (
                  <div style={{ padding: 12, fontSize: 12, color: t.textSubtle }}>Nenhum contato encontrado.</div>
                ) : (
                  contacts.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setContactId(c.id);
                        setContactName(c.name);
                        setContactDropdownOpen(false);
                      }}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        gap: 1,
                        width: '100%',
                        padding: '8px 10px',
                        background: 'transparent',
                        border: 'none',
                        borderRadius: 6,
                        cursor: 'pointer',
                        fontFamily: FONT_STACK,
                        textAlign: 'left',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = t.bgHover)}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <span style={{ fontSize: 12.5, color: t.text }}>{c.name}</span>
                      <span style={{ fontSize: 11, color: t.textFaint }}>{c.phone}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Valor">
            <input
              value={valueStr}
              onChange={(e) => setValueStr(e.target.value)}
              placeholder="R$ 0,00"
              style={inputStyle(t)}
            />
          </Field>
          <Field label="Vencimento">
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              style={inputStyle(t)}
            />
          </Field>
        </div>

        <Field label="Prioridade">
          <div style={{ display: 'flex', gap: 6 }}>
            {(['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as Priority[]).map((p) => {
              const active = priority === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  style={{
                    flex: 1,
                    padding: '7px 10px',
                    background: active ? hexAlpha(PRIORITY_COLOR[p], 0.15) : t.bgInput,
                    border: `1.5px solid ${active ? PRIORITY_COLOR[p] : t.border}`,
                    borderRadius: 7,
                    color: active ? PRIORITY_COLOR[p] : t.textDim,
                    fontSize: 11.5,
                    fontWeight: 500,
                    cursor: 'pointer',
                    fontFamily: FONT_STACK,
                  }}
                >
                  {PRIORITY_LABEL[p]}
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="Responsável">
          <select
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
            style={{ ...inputStyle(t), cursor: 'pointer' }}
          >
            <option value="">Sem responsável</option>
            {team.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Tags">
          <TagPicker tags={tags} selected={tagIds} onChange={setTagIds} />
        </Field>

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

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          {isEdit ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                style={{
                  background: 'transparent',
                  color: t.danger,
                  border: `1px solid ${hexAlpha(t.danger, 0.4)}`,
                  borderRadius: 8,
                  padding: '7px 12px',
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontFamily: FONT_STACK,
                }}
              >
                Excluir
              </button>
              <button
                type="button"
                onClick={() => setTransferOpen(true)}
                style={{
                  background: 'transparent',
                  color: t.text,
                  border: `1px solid ${t.border}`,
                  borderRadius: 8,
                  padding: '7px 12px',
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontFamily: FONT_STACK,
                }}
              >
                Transferir
              </button>
            </div>
          ) : (
            <span />
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={onClose} style={buttonGhost(t)}>
              Cancelar
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={isPending}
              style={{ ...buttonGold(t), opacity: isPending ? 0.6 : 1 }}
            >
              {isPending
                ? isEdit
                  ? 'Salvando…'
                  : 'Criando…'
                : isEdit
                  ? 'Salvar'
                  : 'Criar oportunidade'}
            </button>
          </div>
        </div>
      </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Excluir oportunidade?"
        description={
          <>
            <strong>{title || 'Esta oportunidade'}</strong> e seu histórico serão apagados
            permanentemente.
          </>
        }
        confirmLabel="Excluir"
        danger
        onConfirm={handleDelete}
        onClose={() => setConfirmDelete(false)}
      />

      <TransferOpportunityModal
        open={transferOpen}
        opportunityId={isEdit ? (opportunityId ?? null) : null}
        onClose={() => setTransferOpen(false)}
        onTransferred={() => {
          // Após transferir, a opp não pertence mais ao funil atual — fecha a popup
          onClose();
        }}
      />
    </Modal>
  );
}

// ============================================================
// EMPTY STATES
// ============================================================

function EmptyBoard({ t, onCreate }: { t: ReturnType<typeof useTheme>['tokens']; onCreate: () => void }) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
      }}
    >
      <div
        style={{
          maxWidth: 420,
          textAlign: 'center',
          background: t.bgElevated,
          border: `1px dashed ${t.border}`,
          borderRadius: 14,
          padding: 32,
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            background: t.bgInput,
            margin: '0 auto 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icons.Pipeline s={24} c={t.gold} />
        </div>
        <div style={{ fontSize: 15, color: t.text, marginBottom: 6, fontWeight: 500 }}>
          Nenhuma oportunidade ainda
        </div>
        <div style={{ fontSize: 12.5, color: t.textSubtle, marginBottom: 18 }}>
          Crie sua primeira oportunidade pra começar a gerenciar o pipeline.
        </div>
        <button type="button" onClick={onCreate} style={buttonGold(t)}>
          <Icons.Plus s={12} c="#1a1300" /> Criar oportunidade
        </button>
      </div>
    </div>
  );
}

function NoPipelinesEmpty({
  t,
  onConfigure,
}: {
  t: ReturnType<typeof useTheme>['tokens'];
  onConfigure: () => void;
}) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
        background: t.bg,
      }}
    >
      <div
        style={{
          maxWidth: 440,
          textAlign: 'center',
          background: t.bgElevated,
          border: `1px solid ${t.border}`,
          borderRadius: 14,
          padding: 32,
          color: t.text,
        }}
      >
        <Icons.Pipeline s={32} c={t.gold} />
        <div style={{ fontSize: 16, fontWeight: 600, marginTop: 12 }}>Nenhum funil configurado</div>
        <div style={{ fontSize: 13, color: t.textDim, marginTop: 6, lineHeight: 1.5 }}>
          Configure ao menos um funil em Configurações → Pipelines pra começar a usar o Kanban.
        </div>
        <button type="button" onClick={onConfigure} style={{ ...buttonGold(t), marginTop: 16 }}>
          Configurar funis
        </button>
      </div>
    </div>
  );
}

// ============================================================
// PRIMITIVES
// ============================================================

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const { tokens: t } = useTheme();
  return (
    <div>
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
        {label}
      </label>
      {children}
    </div>
  );
}

function Avatar({ name, size = 22 }: { name: string; size?: number }) {
  const initials = name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #D4AF37 0%, #8a6c17 100%)',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size <= 22 ? 9.5 : size <= 32 ? 11 : 14,
        fontWeight: 600,
        flexShrink: 0,
      }}
    >
      {initials || '··'}
    </div>
  );
}

function useClickOutside(
  ref: React.RefObject<HTMLElement | null>,
  cb: () => void,
  active: boolean,
) {
  useEffect(() => {
    if (!active) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) cb();
    };
    const id = setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener('mousedown', handler);
    };
  }, [active, cb, ref]);
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
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    background: t.gold,
    color: '#1a1300',
    border: 'none',
    borderRadius: 8,
    padding: '8px 14px',
    fontSize: 12.5,
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
    borderRadius: 8,
    padding: '7px 14px',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: FONT_STACK,
  };
}

function formatBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatDateBR(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR');
}

function daysAgo(iso: string): number {
  const d = new Date(iso);
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

function hexAlpha(hex: string, alpha: number): string {
  const m = hex.match(/^#?([0-9A-Fa-f]{6})$/);
  if (!m) return `rgba(128,128,128,${alpha})`;
  const v = m[1]!;
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function axiosMsg(e: unknown): string | null {
  return axios.isAxiosError(e) ? (e.response?.data?.message ?? null) : null;
}
