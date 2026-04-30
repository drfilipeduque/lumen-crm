import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import { useDropzone } from 'react-dropzone';
import axios from 'axios';
import { useTheme } from '../../lib/ThemeContext';
import { useAuthStore } from '../../stores/useAuthStore';
import { toast } from '../ui/Toast';
import { TagPicker } from '../ui/TagPicker';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Icons, type IconName } from '../icons';
import { FONT_STACK } from '../../lib/theme';
import { api } from '../../lib/api';
import {
  useOpportunity,
  useDeleteOpportunity,
  useSetDescription,
  useSetOppCustomFields,
  useSetTags,
  useUpdateOpportunity,
  type Priority,
} from '../../hooks/useOpportunities';
import { usePipeline } from '../../hooks/usePipelines';
import { useTeam } from '../../hooks/useTeam';
import { useTags } from '../../hooks/useTags';
import {
  useCompleteReminder,
  useCreateReminder,
  useDeleteReminder,
  useReminders,
  useSnoozeReminder,
  type Reminder,
} from '../../hooks/useReminders';
import {
  useDeleteFile,
  useFiles,
  useUploadFile,
  type OppFile,
} from '../../hooks/useFiles';
import { useOpportunityHistory, type HistoryEntry, type HistoryFilter } from '../../hooks/useOpportunityHistory';

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

type TabKey = 'geral' | 'descricao' | 'arquivos' | 'historico' | 'lembretes' | 'conversas';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'geral', label: 'Geral' },
  { key: 'descricao', label: 'Descrição' },
  { key: 'arquivos', label: 'Arquivos' },
  { key: 'historico', label: 'Histórico' },
  { key: 'lembretes', label: 'Lembretes' },
  { key: 'conversas', label: 'Conversas' },
];

// ============================================================
// ROOT
// ============================================================

export function OpportunityPopup({
  opportunityId,
  onClose,
}: {
  opportunityId: string;
  onClose: () => void;
}) {
  const { tokens: t } = useTheme();
  const detail = useOpportunity(opportunityId);
  const [tab, setTab] = useState<TabKey>('geral');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const remove = useDeleteOpportunity();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const handleDelete = async () => {
    try {
      await remove.mutateAsync(opportunityId);
      toast('Oportunidade excluída', 'success');
      setConfirmDelete(false);
      onClose();
    } catch (e) {
      toast(axiosMsg(e) || 'Falha ao excluir', 'error');
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(3px)',
        zIndex: 80,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(900px, 100%)',
          maxHeight: '85vh',
          background: t.bgElevated,
          border: `1px solid ${t.border}`,
          borderRadius: 14,
          boxShadow: '0 24px 60px rgba(0,0,0,0.4)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: t.text,
        }}
      >
        {detail.isLoading || !detail.data ? (
          <div style={{ padding: 40, textAlign: 'center', color: t.textDim }}>Carregando…</div>
        ) : (
          <>
            <Header
              detail={detail.data}
              onClose={onClose}
              onDeleteClick={() => setConfirmDelete(true)}
            />
            <TabBar value={tab} onChange={setTab} />
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {tab === 'geral' && <GeralTab detail={detail.data} />}
              {tab === 'descricao' && <DescricaoTab detail={detail.data} />}
              {tab === 'arquivos' && <ArquivosTab opportunityId={opportunityId} />}
              {tab === 'historico' && <HistoricoTab opportunityId={opportunityId} />}
              {tab === 'lembretes' && <LembretesTab opportunityId={opportunityId} />}
              {tab === 'conversas' && <ConversasTab detail={detail.data} />}
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Excluir oportunidade?"
        description={
          <>
            <strong>{detail.data?.title ?? 'Esta oportunidade'}</strong> e todo o seu histórico
            serão apagados permanentemente.
          </>
        }
        confirmLabel="Excluir"
        danger
        onConfirm={handleDelete}
        onClose={() => setConfirmDelete(false)}
      />
    </div>,
    document.body,
  );
}

// ============================================================
// HEADER
// ============================================================

function Header({
  detail,
  onClose,
  onDeleteClick,
}: {
  detail: ReturnType<typeof useOpportunity>['data'] & object;
  onClose: () => void;
  onDeleteClick: () => void;
}) {
  const { tokens: t } = useTheme();
  const update = useUpdateOpportunity();
  const [title, setTitle] = useState(detail.title);
  const [editing, setEditing] = useState(false);

  useEffect(() => setTitle(detail.title), [detail.title]);

  const persistTitle = async () => {
    const next = title.trim();
    setEditing(false);
    if (!next || next === detail.title) {
      setTitle(detail.title);
      return;
    }
    try {
      await update.mutateAsync({ id: detail.id, title: next });
    } catch (e) {
      toast(axiosMsg(e) || 'Falha ao salvar título', 'error');
      setTitle(detail.title);
    }
  };

  return (
    <div
      style={{
        padding: '16px 20px',
        borderBottom: `1px solid ${t.border}`,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        {editing ? (
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={persistTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
              if (e.key === 'Escape') {
                setTitle(detail.title);
                setEditing(false);
              }
            }}
            style={{
              width: '100%',
              background: t.bgInput,
              border: `1px solid ${t.border}`,
              borderRadius: 7,
              padding: '7px 10px',
              fontSize: 18,
              fontWeight: 600,
              color: t.text,
              outline: 'none',
              fontFamily: FONT_STACK,
              letterSpacing: -0.3,
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            title="Clique pra editar"
            style={{
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: 'text',
              fontSize: 18,
              fontWeight: 600,
              color: t.text,
              textAlign: 'left',
              letterSpacing: -0.3,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              width: '100%',
              fontFamily: FONT_STACK,
            }}
          >
            {detail.title}
          </button>
        )}
        <div style={{ fontSize: 11.5, color: t.textFaint, marginTop: 3 }}>
          para <strong style={{ color: t.textDim }}>{detail.contactName}</strong>
        </div>
      </div>

      <StageBadge detail={detail} />
      <ValueBadge detail={detail} />
      <PriorityBadge detail={detail} />
      <ActionsMenu onDeleteClick={onDeleteClick} />

      <button
        type="button"
        onClick={onClose}
        aria-label="Fechar"
        style={{
          width: 32,
          height: 32,
          background: 'transparent',
          border: 'none',
          borderRadius: 6,
          color: t.textDim,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = t.bgHover)}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <Icons.X s={16} c="currentColor" />
      </button>
    </div>
  );
}

function StageBadge({ detail }: { detail: { id: string; pipelineId: string; stageId: string } }) {
  const { tokens: t } = useTheme();
  const pipeline = usePipeline(detail.pipelineId);
  const update = useUpdateOpportunity();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);

  const current = pipeline.data?.stages.find((s) => s.id === detail.stageId);

  const change = async (stageId: string) => {
    setOpen(false);
    try {
      await update.mutateAsync({ id: detail.id, stageId });
      toast('Etapa atualizada', 'success');
    } catch (e) {
      toast(axiosMsg(e) || 'Falha ao mover', 'error');
    }
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 10px',
          background: hexAlpha(current?.color ?? '#94a3b8', 0.14),
          border: `1px solid ${hexAlpha(current?.color ?? '#94a3b8', 0.4)}`,
          borderRadius: 999,
          color: current?.color ?? t.textDim,
          fontSize: 11.5,
          fontWeight: 500,
          cursor: 'pointer',
          fontFamily: FONT_STACK,
        }}
      >
        {current?.name ?? '—'}
        <Icons.ChevronD s={10} c="currentColor" />
      </button>
      {open && pipeline.data && (
        <Popover>
          {pipeline.data.stages.map((s) => (
            <Row
              key={s.id}
              label={s.name}
              active={s.id === detail.stageId}
              onClick={() => change(s.id)}
              color={s.color}
            />
          ))}
        </Popover>
      )}
    </div>
  );
}

function ValueBadge({ detail }: { detail: { id: string; value: number } }) {
  const { tokens: t } = useTheme();
  const update = useUpdateOpportunity();
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState(detail.value > 0 ? String(detail.value).replace('.', ',') : '');
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);

  useEffect(() => {
    setVal(detail.value > 0 ? String(detail.value).replace('.', ',') : '');
  }, [detail.value]);

  const save = async () => {
    const num = Number(val.replace(/[^0-9,.-]/g, '').replace(',', '.'));
    if (!Number.isFinite(num) || num < 0) {
      toast('Valor inválido', 'error');
      return;
    }
    setOpen(false);
    try {
      await update.mutateAsync({ id: detail.id, value: num });
    } catch (e) {
      toast(axiosMsg(e) || 'Falha ao salvar valor', 'error');
    }
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 10px',
          background: hexAlpha(t.gold, 0.12),
          border: `1px solid ${hexAlpha(t.gold, 0.4)}`,
          borderRadius: 999,
          color: t.gold,
          fontSize: 11.5,
          fontWeight: 600,
          cursor: 'pointer',
          fontFamily: FONT_STACK,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {formatBRL(detail.value)}
        <Icons.ChevronD s={10} c="currentColor" />
      </button>
      {open && (
        <Popover>
          <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8, width: 180 }}>
            <input
              value={val}
              onChange={(e) => setVal(e.target.value)}
              placeholder="R$ 0,00"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') save();
                if (e.key === 'Escape') setOpen(false);
              }}
              style={{
                background: t.bgInput,
                border: `1px solid ${t.border}`,
                borderRadius: 7,
                padding: '7px 10px',
                fontSize: 13,
                color: t.text,
                outline: 'none',
                fontFamily: FONT_STACK,
              }}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{ ...buttonGhost(t), padding: '6px 10px', fontSize: 11.5, flex: 1 }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={save}
                style={{ ...buttonGold(t), padding: '6px 10px', fontSize: 11.5, flex: 1 }}
              >
                Salvar
              </button>
            </div>
          </div>
        </Popover>
      )}
    </div>
  );
}

function PriorityBadge({ detail }: { detail: { id: string; priority: string } }) {
  const { tokens: t } = useTheme();
  const update = useUpdateOpportunity();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);
  const prio = detail.priority as Priority;

  const change = async (next: Priority) => {
    setOpen(false);
    try {
      await update.mutateAsync({ id: detail.id, priority: next });
    } catch (e) {
      toast(axiosMsg(e) || 'Falha ao salvar prioridade', 'error');
    }
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 10px',
          background: hexAlpha(PRIORITY_COLOR[prio], 0.14),
          border: `1px solid ${hexAlpha(PRIORITY_COLOR[prio], 0.4)}`,
          borderRadius: 999,
          color: PRIORITY_COLOR[prio],
          fontSize: 11.5,
          fontWeight: 500,
          cursor: 'pointer',
          fontFamily: FONT_STACK,
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: 999, background: PRIORITY_COLOR[prio] }} />
        {PRIORITY_LABEL[prio]}
        <Icons.ChevronD s={10} c="currentColor" />
      </button>
      {open && (
        <Popover>
          <div style={{ padding: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {(['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as Priority[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => change(p)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 10px',
                  background: prio === p ? t.bgHover : 'transparent',
                  border: 'none',
                  borderRadius: 6,
                  color: PRIORITY_COLOR[p],
                  fontSize: 12.5,
                  cursor: 'pointer',
                  fontFamily: FONT_STACK,
                  textAlign: 'left',
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: 999, background: PRIORITY_COLOR[p] }} />
                {PRIORITY_LABEL[p]}
              </button>
            ))}
          </div>
        </Popover>
      )}
    </div>
  );
}

function ActionsMenu({ onDeleteClick }: { onDeleteClick: () => void }) {
  const { tokens: t } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Ações"
        style={{
          width: 30,
          height: 30,
          background: 'transparent',
          border: `1px solid ${t.border}`,
          borderRadius: 6,
          cursor: 'pointer',
          color: t.textDim,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
        }}
      >
        <Icons.Dot s={4} c="currentColor" />
        <Icons.Dot s={4} c="currentColor" />
        <Icons.Dot s={4} c="currentColor" />
      </button>
      {open && (
        <Popover>
          <MenuRow label="Duplicar" onClick={() => { setOpen(false); toast('Duplicar virá na próxima fase', 'info'); }} />
          <MenuRow
            label="Excluir"
            danger
            onClick={() => {
              setOpen(false);
              onDeleteClick();
            }}
          />
        </Popover>
      )}
    </div>
  );
}

// ============================================================
// TABS BAR
// ============================================================

function TabBar({ value, onChange }: { value: TabKey; onChange: (k: TabKey) => void }) {
  const { tokens: t } = useTheme();
  return (
    <div style={{ display: 'flex', borderBottom: `1px solid ${t.border}`, padding: '0 20px', flexShrink: 0 }}>
      {TABS.map((tab) => {
        const active = value === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            style={{
              background: 'transparent',
              border: 'none',
              color: active ? t.gold : t.textDim,
              fontSize: 12.5,
              fontWeight: active ? 600 : 500,
              padding: '12px 14px',
              cursor: 'pointer',
              borderBottom: `2px solid ${active ? t.gold : 'transparent'}`,
              fontFamily: FONT_STACK,
              marginBottom: -1,
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

// ============================================================
// GERAL
// ============================================================

type OppDetail = NonNullable<ReturnType<typeof useOpportunity>['data']>;

function GeralTab({ detail }: { detail: OppDetail }) {
  const { tokens: t } = useTheme();
  const navigate = useNavigate();
  const pipeline = usePipeline(detail.pipelineId);
  const team = useTeam();
  const tagsQ = useTags();
  const update = useUpdateOpportunity();
  const setTags = useSetTags();
  const setCf = useSetOppCustomFields();

  const [valueStr, setValueStr] = useState(
    detail.value > 0 ? String(detail.value).replace('.', ',') : '',
  );
  const [dueDate, setDueDate] = useState(detail.dueDate ? detail.dueDate.slice(0, 10) : '');
  const [cfLocal, setCfLocal] = useState<Record<string, string>>(() => {
    const r: Record<string, string> = {};
    detail.customFields.forEach((c) => (r[c.customFieldId] = c.value));
    return r;
  });
  const cfDebounce = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setValueStr(detail.value > 0 ? String(detail.value).replace('.', ',') : '');
    setDueDate(detail.dueDate ? detail.dueDate.slice(0, 10) : '');
    const r: Record<string, string> = {};
    detail.customFields.forEach((c) => (r[c.customFieldId] = c.value));
    setCfLocal(r);
  }, [detail.id, detail.updatedAt]);

  const persistValue = async () => {
    const num = Number(valueStr.replace(/[^0-9,.-]/g, '').replace(',', '.'));
    if (!Number.isFinite(num) || num === detail.value) return;
    try {
      await update.mutateAsync({ id: detail.id, value: num });
    } catch (e) {
      toast(axiosMsg(e) || 'Falha ao salvar valor', 'error');
    }
  };

  const persistDueDate = async (next: string) => {
    if (next === (detail.dueDate?.slice(0, 10) ?? '')) return;
    try {
      await update.mutateAsync({ id: detail.id, dueDate: next || null });
    } catch (e) {
      toast(axiosMsg(e) || 'Falha ao salvar data', 'error');
    }
  };

  const persistOwner = async (next: string) => {
    try {
      await update.mutateAsync({ id: detail.id, ownerId: next || null });
    } catch (e) {
      toast(axiosMsg(e) || 'Falha ao salvar responsável', 'error');
    }
  };

  const persistPriority = async (next: Priority) => {
    try {
      await update.mutateAsync({ id: detail.id, priority: next });
    } catch (e) {
      toast(axiosMsg(e) || 'Falha ao salvar prioridade', 'error');
    }
  };

  const persistStage = async (next: string) => {
    try {
      await update.mutateAsync({ id: detail.id, stageId: next });
    } catch (e) {
      toast(axiosMsg(e) || 'Falha ao mover', 'error');
    }
  };

  const onTagsChange = async (ids: string[]) => {
    try {
      await setTags.mutateAsync({ id: detail.id, tagIds: ids });
    } catch (e) {
      toast(axiosMsg(e) || 'Falha ao salvar tags', 'error');
    }
  };

  const onCfChange = (customFieldId: string, value: string) => {
    setCfLocal((prev) => ({ ...prev, [customFieldId]: value }));
    if (cfDebounce.current) clearTimeout(cfDebounce.current);
    cfDebounce.current = setTimeout(() => {
      const rows = Object.entries({ ...cfLocal, [customFieldId]: value }).map(([id, v]) => ({
        customFieldId: id,
        value: v,
      }));
      setCf.mutate({ id: detail.id, rows });
    }, 800);
  };

  const customFields = pipeline.data?.customFields.filter((cf) => cf.visible) ?? [];

  return (
    <div style={{ padding: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
      {/* Esquerda */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Label t={t}>Contato</Label>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 12px',
            background: t.bgInput,
            border: `1px solid ${t.border}`,
            borderRadius: 8,
          }}
        >
          <Avatar name={detail.contactName} size={32} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: t.text }}>{detail.contactName}</div>
            <div style={{ fontSize: 11.5, color: t.textFaint, marginTop: 1 }}>ID: {detail.contactId}</div>
          </div>
          <button
            type="button"
            onClick={() => navigate(`/conversations?contactId=${detail.contactId}`)}
            style={{ ...buttonGhost(t), padding: '6px 10px', fontSize: 11.5 }}
          >
            💬 Conversas
          </button>
        </div>

        <Field label="Etapa">
          <select
            value={detail.stageId}
            onChange={(e) => persistStage(e.target.value)}
            style={{ ...inputStyle(t), cursor: 'pointer' }}
          >
            {pipeline.data?.stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Funil">
          <input
            value={pipeline.data?.name ?? ''}
            readOnly
            style={{ ...inputStyle(t), background: t.bgHover, cursor: 'default' }}
          />
        </Field>

        <Field label="Valor">
          <input
            value={valueStr}
            onChange={(e) => setValueStr(e.target.value)}
            onBlur={persistValue}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            placeholder="R$ 0,00"
            style={inputStyle(t)}
          />
        </Field>

        <Field label="Responsável">
          <select
            value={detail.ownerId ?? ''}
            onChange={(e) => persistOwner(e.target.value)}
            style={{ ...inputStyle(t), cursor: 'pointer' }}
          >
            <option value="">Sem responsável</option>
            {team.data?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Prioridade">
          <div style={{ display: 'flex', gap: 6 }}>
            {(['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as Priority[]).map((p) => {
              const active = detail.priority === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => persistPriority(p)}
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

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Criado em">
            <input
              value={formatDateTimeBR(detail.createdAt)}
              readOnly
              style={{ ...inputStyle(t), background: t.bgHover, cursor: 'default' }}
            />
          </Field>
          <Field label="Vencimento">
            <input
              type="date"
              value={dueDate}
              onChange={(e) => {
                setDueDate(e.target.value);
                persistDueDate(e.target.value);
              }}
              style={inputStyle(t)}
            />
          </Field>
        </div>
      </div>

      {/* Direita */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Tags">
          <TagPicker
            tags={tagsQ.data ?? []}
            selected={detail.tags.map((tg) => tg.id)}
            onChange={onTagsChange}
          />
        </Field>

        <div style={{ height: 1, background: t.border, margin: '4px 0' }} />

        <div>
          <div
            style={{
              fontSize: 11,
              letterSpacing: 0.4,
              textTransform: 'uppercase',
              color: t.textSubtle,
              marginBottom: 8,
              fontWeight: 500,
            }}
          >
            Campos personalizados
          </div>
          {customFields.length === 0 ? (
            <div
              style={{
                padding: '14px 16px',
                background: t.bgInput,
                border: `1px dashed ${t.border}`,
                borderRadius: 8,
                fontSize: 12.5,
                color: t.textSubtle,
              }}
            >
              Nenhum campo personalizado visível neste funil.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {customFields.map((cf) => (
                <CustomFieldInput
                  key={cf.customFieldId}
                  field={cf}
                  value={cfLocal[cf.customFieldId] ?? ''}
                  onChange={(v) => onCfChange(cf.customFieldId, v)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CustomFieldInput({
  field,
  value,
  onChange,
}: {
  field: { customFieldId: string; name: string; type: string };
  value: string;
  onChange: (v: string) => void;
}) {
  const { tokens: t } = useTheme();
  // Types: TEXT, LONG_TEXT, NUMBER, CURRENCY, DATE, SELECT, MULTI_SELECT, BOOLEAN, URL
  const baseStyle = inputStyle(t);
  return (
    <Field label={field.name}>
      {field.type === 'LONG_TEXT' ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} style={{ ...baseStyle, resize: 'vertical' }} />
      ) : field.type === 'NUMBER' || field.type === 'CURRENCY' ? (
        <input type="number" value={value} onChange={(e) => onChange(e.target.value)} style={baseStyle} />
      ) : field.type === 'DATE' ? (
        <input type="date" value={value} onChange={(e) => onChange(e.target.value)} style={baseStyle} />
      ) : field.type === 'BOOLEAN' ? (
        <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...baseStyle, cursor: 'pointer' }}>
          <option value="">—</option>
          <option value="true">Sim</option>
          <option value="false">Não</option>
        </select>
      ) : field.type === 'URL' ? (
        <input type="url" value={value} onChange={(e) => onChange(e.target.value)} placeholder="https://" style={baseStyle} />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} style={baseStyle} />
      )}
    </Field>
  );
}

// ============================================================
// DESCRICAO
// ============================================================

function DescricaoTab({ detail }: { detail: OppDetail }) {
  const { tokens: t } = useTheme();
  const setDescription = useSetDescription();
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const savedAt = useRef<number | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: 'Adicione contexto, detalhes do interesse, observações gerais…',
      }),
      Link.configure({ openOnClick: true }),
    ],
    content: detail.description ?? '',
    onUpdate({ editor }) {
      setStatus('saving');
      if (debounceRef.current) clearTimeout(debounceRef.current);
      const html = editor.getHTML();
      const plain = editor.getText().trim();
      const payload = plain ? html : null;
      debounceRef.current = setTimeout(async () => {
        try {
          await setDescription.mutateAsync({ id: detail.id, description: payload });
          savedAt.current = Date.now();
          setStatus('saved');
        } catch {
          setStatus('idle');
          toast('Falha ao salvar descrição', 'error');
        }
      }, 1000);
    },
  });

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Sync se carregar depois
  useEffect(() => {
    if (editor && detail.description !== undefined) {
      const current = editor.getHTML();
      if (current !== (detail.description ?? '')) {
        editor.commands.setContent(detail.description ?? '', false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.id]);

  const statusLabel =
    status === 'saving'
      ? 'Salvando…'
      : status === 'saved' && savedAt.current
        ? `Salvo ${relative(new Date(savedAt.current).toISOString())}`
        : '';

  return (
    <div style={{ padding: 20 }}>
      <div
        style={{
          background: t.bgInput,
          border: `1px solid ${t.border}`,
          borderRadius: 10,
          minHeight: 320,
          overflow: 'hidden',
        }}
      >
        {editor && <EditorToolbar editor={editor} />}
        <div
          style={{
            padding: '14px 16px',
            minHeight: 260,
            fontSize: 13.5,
            color: t.text,
            lineHeight: 1.6,
            fontFamily: FONT_STACK,
          }}
        >
          <EditorContent editor={editor} />
        </div>
      </div>
      <div style={{ fontSize: 11, color: t.textFaint, marginTop: 8, textAlign: 'right', minHeight: 14 }}>
        {statusLabel}
      </div>
      <style>{`
        .ProseMirror { outline: none; }
        .ProseMirror p.is-editor-empty:first-child::before {
          color: ${t.textFaint};
          content: attr(data-placeholder);
          float: left;
          height: 0;
          pointer-events: none;
        }
        .ProseMirror a { color: ${t.gold}; text-decoration: underline; }
        .ProseMirror ul, .ProseMirror ol { padding-left: 22px; }
      `}</style>
    </div>
  );
}

function EditorToolbar({ editor }: { editor: NonNullable<ReturnType<typeof useEditor>> }) {
  const { tokens: t } = useTheme();
  const btn = (active: boolean): CSSProperties => ({
    width: 28,
    height: 28,
    border: `1px solid ${active ? t.gold : t.border}`,
    borderRadius: 6,
    background: active ? t.goldFaint : 'transparent',
    color: active ? t.gold : t.textDim,
    cursor: 'pointer',
    fontFamily: FONT_STACK,
    fontSize: 12,
    fontWeight: 600,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  });
  const setLink = () => {
    const prev = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('URL do link', prev ?? 'https://');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };
  return (
    <div
      style={{
        display: 'flex',
        gap: 5,
        padding: '8px 10px',
        borderBottom: `1px solid ${t.border}`,
        background: t.bgElevated,
      }}
    >
      <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} style={btn(editor.isActive('bold'))}>
        B
      </button>
      <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} style={{ ...btn(editor.isActive('italic')), fontStyle: 'italic' }}>
        I
      </button>
      <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} style={btn(editor.isActive('bulletList'))}>
        •
      </button>
      <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} style={btn(editor.isActive('orderedList'))}>
        1.
      </button>
      <button type="button" onClick={setLink} style={btn(editor.isActive('link'))}>
        <Icons.Link s={12} c="currentColor" />
      </button>
    </div>
  );
}

// ============================================================
// ARQUIVOS
// ============================================================

function ArquivosTab({ opportunityId }: { opportunityId: string }) {
  const { tokens: t } = useTheme();
  const files = useFiles(opportunityId);
  const upload = useUploadFile();
  const remove = useDeleteFile();
  const [lightbox, setLightbox] = useState<OppFile | null>(null);

  const onDrop = async (accepted: File[]) => {
    for (const f of accepted) {
      try {
        await upload.mutateAsync({ opportunityId, file: f });
      } catch (e) {
        toast(axiosMsg(e) || `Falha ao enviar ${f.name}`, 'error');
      }
    }
    if (accepted.length > 0) toast(`${accepted.length} arquivo(s) enviado(s)`, 'success');
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxSize: 20 * 1024 * 1024,
  });

  const handleDelete = async (f: OppFile) => {
    try {
      await remove.mutateAsync({ id: f.id, opportunityId });
      toast('Arquivo removido', 'success');
    } catch (e) {
      toast(axiosMsg(e) || 'Falha ao excluir', 'error');
    }
  };

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div
        {...getRootProps()}
        style={{
          padding: 24,
          background: isDragActive ? hexAlpha('#D4AF37', 0.08) : t.bgInput,
          border: `2px dashed ${isDragActive ? t.gold : t.border}`,
          borderRadius: 12,
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'border-color 120ms, background 120ms',
          color: isDragActive ? t.gold : t.textDim,
          fontSize: 13,
        }}
      >
        <input {...getInputProps()} />
        {isDragActive
          ? 'Solte os arquivos aqui…'
          : 'Arraste arquivos aqui ou clique pra selecionar (imagem, PDF, doc, áudio, vídeo · máx 20MB)'}
      </div>

      {files.isLoading ? (
        <div style={{ color: t.textDim, fontSize: 12.5 }}>Carregando…</div>
      ) : !files.data || files.data.length === 0 ? (
        <div
          style={{
            fontSize: 12.5,
            color: t.textSubtle,
            padding: 20,
            textAlign: 'center',
            border: `1px dashed ${t.border}`,
            borderRadius: 10,
          }}
        >
          Nenhum arquivo ainda.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
          {files.data.map((f) => (
            <FileCard
              key={f.id}
              file={f}
              onDelete={() => handleDelete(f)}
              onOpenImage={() => setLightbox(f)}
            />
          ))}
        </div>
      )}

      {lightbox && <Lightbox file={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}

function FileCard({
  file,
  onDelete,
  onOpenImage,
}: {
  file: OppFile;
  onDelete: () => void;
  onOpenImage: () => void;
}) {
  const { tokens: t } = useTheme();
  const [hover, setHover] = useState(false);
  const isImage = file.mimeType.startsWith('image/');

  const download = async () => {
    try {
      const res = await api.get<Blob>(`/files/${file.id}/download`, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: file.mimeType });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
    } catch {
      toast('Falha ao baixar', 'error');
    }
  };

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: t.bgInput,
        border: `1px solid ${hover ? t.borderStrong : t.border}`,
        borderRadius: 10,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <div
        onClick={isImage ? onOpenImage : download}
        style={{
          height: 120,
          background: t.bg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          cursor: 'pointer',
          borderBottom: `1px solid ${t.border}`,
        }}
      >
        {isImage ? (
          <img
            src={`/api${file.url}`}
            alt={file.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <FileTypeIcon mime={file.mimeType} t={t} />
        )}
      </div>
      <div style={{ padding: '8px 10px' }}>
        <div
          title={file.name}
          style={{
            fontSize: 12,
            color: t.text,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            fontWeight: 500,
          }}
        >
          {file.name}
        </div>
        <div style={{ fontSize: 10.5, color: t.textFaint, marginTop: 2 }}>
          {formatSize(file.size)} · {formatDateBR(file.createdAt)}
        </div>
        {file.uploadedBy && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
            <Avatar name={file.uploadedBy.name} size={16} />
            <span style={{ fontSize: 10, color: t.textFaint }}>{file.uploadedBy.name}</span>
          </div>
        )}
      </div>
      {hover && (
        <div
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            display: 'flex',
            gap: 4,
            background: t.bgElevated,
            border: `1px solid ${t.border}`,
            borderRadius: 6,
            padding: 2,
          }}
        >
          <IconBtn title="Baixar" onClick={download}>
            <Icons.Plus s={12} c={t.textDim} />
          </IconBtn>
          <IconBtn title="Excluir" onClick={onDelete}>
            <Icons.Trash s={12} c={t.danger} />
          </IconBtn>
        </div>
      )}
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
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = t.bgHover)}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {children}
    </button>
  );
}

function FileTypeIcon({ mime, t }: { mime: string; t: ReturnType<typeof useTheme>['tokens'] }) {
  let label = 'FILE';
  if (mime.startsWith('audio/')) label = 'ÁUDIO';
  else if (mime.startsWith('video/')) label = 'VÍDEO';
  else if (mime === 'application/pdf') label = 'PDF';
  else if (mime.includes('word')) label = 'DOC';
  else if (mime.includes('sheet') || mime.includes('excel')) label = 'XLS';
  else if (mime.startsWith('text/')) label = 'TXT';
  return (
    <div
      style={{
        width: 56,
        height: 72,
        background: t.bgElevated,
        border: `1px solid ${t.border}`,
        borderRadius: 6,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 10,
        fontWeight: 700,
        color: t.gold,
        letterSpacing: 0.5,
      }}
    >
      {label}
    </div>
  );
}

function Lightbox({ file, onClose }: { file: OppFile; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.85)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
        cursor: 'zoom-out',
      }}
    >
      <img
        src={`/api${file.url}`}
        alt={file.name}
        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
      />
    </div>,
    document.body,
  );
}

// ============================================================
// HISTORICO
// ============================================================

function HistoricoTab({ opportunityId }: { opportunityId: string }) {
  const { tokens: t } = useTheme();
  const [filter, setFilter] = useState<HistoryFilter>('ALL');
  const history = useOpportunityHistory(opportunityId, filter);

  const options: { value: HistoryFilter; label: string }[] = [
    { value: 'ALL', label: 'Todas as ações' },
    { value: 'STAGE_CHANGED', label: 'Mudanças de etapa' },
    { value: 'FIELD_UPDATED', label: 'Atualização de campos' },
    { value: 'TAG', label: 'Tags' },
    { value: 'OWNER', label: 'Responsável' },
    { value: 'REMINDER', label: 'Lembretes' },
    { value: 'FILE', label: 'Arquivos' },
    { value: 'DESCRIPTION', label: 'Descrição' },
    { value: 'TRANSFER', label: 'Transferências entre funis' },
  ];

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <select
        value={filter}
        onChange={(e) => setFilter(e.target.value as HistoryFilter)}
        style={{
          ...inputStyle(t),
          alignSelf: 'flex-start',
          width: 240,
          cursor: 'pointer',
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      {history.isLoading ? (
        <div style={{ color: t.textDim, fontSize: 12.5 }}>Carregando…</div>
      ) : !history.data || history.data.length === 0 ? (
        <div
          style={{
            fontSize: 12.5,
            color: t.textSubtle,
            padding: 20,
            textAlign: 'center',
            border: `1px dashed ${t.border}`,
            borderRadius: 10,
          }}
        >
          Nenhuma atividade neste filtro.
        </div>
      ) : (
        <div style={{ position: 'relative', paddingLeft: 22 }}>
          <div
            style={{
              position: 'absolute',
              left: 10,
              top: 8,
              bottom: 8,
              width: 1,
              background: t.border,
            }}
          />
          {history.data.map((entry) => (
            <TimelineItem key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}

function TimelineItem({ entry }: { entry: HistoryEntry }) {
  const { tokens: t } = useTheme();
  const { icon, color } = iconForAction(entry.action);
  const Icon = Icons[icon];
  return (
    <div style={{ position: 'relative', padding: '8px 0 12px 16px' }}>
      <div
        style={{
          position: 'absolute',
          left: -12,
          top: 8,
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: hexAlpha(color, 0.15),
          border: `1.5px solid ${hexAlpha(color, 0.5)}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon s={10} c={color} />
      </div>
      <div style={{ fontSize: 13, color: t.text, lineHeight: 1.4 }}>
        <strong>{entry.user?.name ?? 'Sistema'}</strong> {describeAction(entry)}
      </div>
      <div title={new Date(entry.createdAt).toLocaleString('pt-BR')} style={{ fontSize: 11, color: t.textFaint, marginTop: 2 }}>
        {relative(entry.createdAt)}
      </div>
    </div>
  );
}

function iconForAction(action: string): { icon: IconName; color: string } {
  switch (action) {
    case 'CREATED':
      return { icon: 'Plus', color: '#22c55e' };
    case 'STAGE_CHANGE':
      return { icon: 'ChevronR', color: '#eab308' };
    case 'FIELD_UPDATE':
    case 'VALUE_CHANGED':
    case 'PRIORITY_CHANGED':
      return { icon: 'Edit', color: '#3b82f6' };
    case 'TAG_ADDED':
      return { icon: 'Plus', color: '#22c55e' };
    case 'TAG_REMOVED':
      return { icon: 'X', color: '#94a3b8' };
    case 'OWNER_CHANGED':
      return { icon: 'Users', color: '#a855f7' };
    case 'REMINDER_CREATED':
    case 'REMINDER_COMPLETED':
      return { icon: 'Bell', color: '#D4AF37' };
    case 'FILE_UPLOADED':
    case 'FILE_DELETED':
      return { icon: 'Link', color: '#94a3b8' };
    case 'DESCRIPTION_UPDATED':
      return { icon: 'Edit', color: '#3b82f6' };
    case 'TRANSFERRED':
      return { icon: 'ChevronR', color: '#D4AF37' };
    default:
      return { icon: 'Dot', color: '#94a3b8' };
  }
}

function describeAction(e: HistoryEntry): string {
  const m = (e.metadata ?? {}) as Record<string, unknown>;
  switch (e.action) {
    case 'CREATED':
      return 'criou a oportunidade';
    case 'STAGE_CHANGE':
      return `moveu de ${e.fromStageName ? `"${e.fromStageName}"` : '—'} para "${e.toStageName ?? '—'}"`;
    case 'VALUE_CHANGED':
      return `alterou o valor de ${formatBRL(Number(m.from) || 0)} para ${formatBRL(Number(m.to) || 0)}`;
    case 'PRIORITY_CHANGED':
      return `mudou a prioridade de ${PRIORITY_LABEL[m.from as Priority] ?? m.from} para ${PRIORITY_LABEL[m.to as Priority] ?? m.to}`;
    case 'FIELD_UPDATE': {
      const fields = Array.isArray(m.fields) ? (m.fields as string[]).join(', ') : '';
      return `atualizou ${fields || 'campos'}`;
    }
    case 'TAG_ADDED':
      return 'adicionou uma tag';
    case 'TAG_REMOVED':
      return 'removeu uma tag';
    case 'OWNER_CHANGED':
      return 'alterou o responsável';
    case 'REMINDER_CREATED':
      return `criou o lembrete "${m.title ?? '—'}"`;
    case 'REMINDER_COMPLETED':
      return `concluiu o lembrete "${m.title ?? '—'}"`;
    case 'FILE_UPLOADED':
      return `anexou o arquivo "${m.name ?? '—'}"`;
    case 'FILE_DELETED':
      return `removeu o arquivo "${m.name ?? '—'}"`;
    case 'DESCRIPTION_UPDATED':
      return 'atualizou a descrição';
    case 'TRANSFERRED': {
      const fromName = (m.fromPipelineName as string | undefined) ?? '—';
      const toName = (m.toPipelineName as string | undefined) ?? '—';
      const fromStage = e.fromStageName ?? '—';
      const toStage = e.toStageName ?? '—';
      // metadata salva pipelineId, então só temos id pipelineId no payload do
      // backend; usamos fromStageName/toStageName que já vêm via include.
      return `transferiu de "${fromStage}" para "${toStage}" (${fromName} → ${toName})`;
    }
    default:
      return e.action;
  }
}

// ============================================================
// LEMBRETES
// ============================================================

function LembretesTab({ opportunityId }: { opportunityId: string }) {
  const { tokens: t } = useTheme();
  const list = useReminders(opportunityId);
  const create = useCreateReminder();
  const [creating, setCreating] = useState(false);

  const pending = (list.data ?? []).filter((r) => !r.completed);
  const completed = (list.data ?? []).filter((r) => r.completed);

  const [showCompleted, setShowCompleted] = useState(false);

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button" onClick={() => setCreating(true)} style={buttonGold(t)}>
          <Icons.Plus s={12} c="#1a1300" /> Novo lembrete
        </button>
      </div>

      {list.isLoading ? (
        <div style={{ color: t.textDim, fontSize: 12.5 }}>Carregando…</div>
      ) : (
        <>
          {pending.length === 0 ? (
            <div style={{ fontSize: 12.5, color: t.textSubtle, padding: 20, textAlign: 'center', border: `1px dashed ${t.border}`, borderRadius: 10 }}>
              Nenhum lembrete pendente.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pending.map((r) => (
                <ReminderItem key={r.id} reminder={r} opportunityId={opportunityId} />
              ))}
            </div>
          )}

          {completed.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowCompleted((v) => !v)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: t.textDim,
                  fontSize: 12,
                  cursor: 'pointer',
                  padding: '8px 0',
                  fontFamily: FONT_STACK,
                }}
              >
                {showCompleted ? '▾' : '▸'} Concluídos ({completed.length})
              </button>
              {showCompleted && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                  {completed.map((r) => (
                    <ReminderItem key={r.id} reminder={r} opportunityId={opportunityId} />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {creating && (
        <CreateReminderModal
          opportunityId={opportunityId}
          onClose={() => setCreating(false)}
          onSubmit={async (payload) => {
            try {
              await create.mutateAsync({ opportunityId, ...payload });
              toast('Lembrete criado', 'success');
              setCreating(false);
            } catch (e) {
              toast(axiosMsg(e) || 'Falha ao criar', 'error');
            }
          }}
        />
      )}
    </div>
  );
}

function ReminderItem({ reminder, opportunityId }: { reminder: Reminder; opportunityId: string }) {
  const { tokens: t } = useTheme();
  const complete = useCompleteReminder();
  const remove = useDeleteReminder();
  const snooze = useSnoozeReminder();
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setSnoozeOpen(false), snoozeOpen);

  const effective = reminder.snoozedUntil ?? reminder.dueAt;

  return (
    <div
      style={{
        padding: '10px 12px',
        background: t.bgInput,
        border: `1px solid ${reminder.overdue && !reminder.completed ? hexAlpha(t.danger, 0.5) : t.border}`,
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        opacity: reminder.completed ? 0.65 : 1,
      }}
    >
      <button
        type="button"
        title={reminder.completed ? 'Concluído' : 'Marcar como concluído'}
        onClick={() => {
          if (reminder.completed) return;
          void complete.mutateAsync({ id: reminder.id, opportunityId });
        }}
        style={{
          width: 20,
          height: 20,
          borderRadius: '50%',
          border: `1.5px solid ${reminder.completed ? t.success : t.borderStrong}`,
          background: reminder.completed ? t.success : 'transparent',
          cursor: reminder.completed ? 'default' : 'pointer',
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {reminder.completed && <Icons.Check s={11} c="#fff" />}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            color: t.text,
            fontWeight: 500,
            textDecoration: reminder.completed ? 'line-through' : undefined,
          }}
        >
          {reminder.title}
        </div>
        {reminder.description && (
          <div style={{ fontSize: 11.5, color: t.textDim, marginTop: 2 }}>{reminder.description}</div>
        )}
        <div
          title={new Date(effective).toLocaleString('pt-BR')}
          style={{
            fontSize: 11,
            marginTop: 4,
            color: reminder.overdue && !reminder.completed ? t.danger : t.textFaint,
          }}
        >
          {reminder.completed ? 'Concluído ' : ''}
          {relative(effective)}
          {reminder.snoozedUntil && ' (adiado)'}
        </div>
      </div>
      {!reminder.completed && (
        <div ref={ref} style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setSnoozeOpen((v) => !v)}
            title="Adiar"
            style={{
              background: 'transparent',
              border: `1px solid ${t.border}`,
              borderRadius: 6,
              padding: '4px 8px',
              fontSize: 11,
              color: t.textDim,
              cursor: 'pointer',
              fontFamily: FONT_STACK,
            }}
          >
            Adiar
          </button>
          {snoozeOpen && (
            <Popover>
              {(['1h', '3h', 'tomorrow', 'next-week'] as const).map((p) => (
                <Row
                  key={p}
                  label={p === '1h' ? '1 hora' : p === '3h' ? '3 horas' : p === 'tomorrow' ? 'Amanhã 9h' : 'Próxima semana'}
                  active={false}
                  onClick={() => {
                    setSnoozeOpen(false);
                    void snooze.mutateAsync({ id: reminder.id, opportunityId, preset: p });
                  }}
                />
              ))}
            </Popover>
          )}
        </div>
      )}
      <button
        type="button"
        title="Excluir"
        onClick={() => void remove.mutateAsync({ id: reminder.id, opportunityId })}
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: t.danger,
          padding: 4,
          opacity: 0.7,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.7')}
      >
        <Icons.Trash s={13} c="currentColor" />
      </button>
    </div>
  );
}

function CreateReminderModal({
  opportunityId: _oppId,
  onClose,
  onSubmit,
}: {
  opportunityId: string;
  onClose: () => void;
  onSubmit: (p: { title: string; description?: string | null; dueAt: string }) => Promise<void>;
}) {
  const { tokens: t } = useTheme();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!title.trim() || !dueAt) return;
    setSubmitting(true);
    try {
      await onSubmit({ title: title.trim(), description: description.trim() || null, dueAt });
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 90,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 420,
          maxWidth: '100%',
          background: t.bgElevated,
          border: `1px solid ${t.border}`,
          borderRadius: 12,
          padding: 22,
          color: t.text,
        }}
      >
        <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0, marginBottom: 14 }}>Novo lembrete</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="Título">
            <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle(t)} />
          </Field>
          <Field label="Descrição (opcional)">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              style={{ ...inputStyle(t), resize: 'vertical' }}
            />
          </Field>
          <Field label="Data e hora">
            <input
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              style={inputStyle(t)}
            />
          </Field>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
          <button type="button" onClick={onClose} style={buttonGhost(t)}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting || !title.trim() || !dueAt}
            style={{ ...buttonGold(t), opacity: submitting || !title.trim() || !dueAt ? 0.6 : 1 }}
          >
            {submitting ? 'Criando…' : 'Criar'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ============================================================
// CONVERSAS
// ============================================================

function ConversasTab({ detail }: { detail: OppDetail }) {
  const { tokens: t } = useTheme();
  const navigate = useNavigate();
  return (
    <div style={{ padding: 20 }}>
      <div
        style={{
          padding: 40,
          background: t.bgInput,
          border: `1px dashed ${t.border}`,
          borderRadius: 12,
          textAlign: 'center',
          color: t.textSubtle,
          fontSize: 13.5,
        }}
      >
        <Icons.Chat s={28} c={t.gold} />
        <div style={{ marginTop: 12, fontWeight: 500, color: t.text }}>Conversas WhatsApp</div>
        <div style={{ marginTop: 6, fontSize: 12.5 }}>
          As mensagens com este contato estão na página de Conversas em tempo real.
        </div>
        <button
          type="button"
          onClick={() => navigate(`/conversations?contactId=${detail.contactId}`)}
          style={{
            marginTop: 14,
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
          }}
        >
          💬 Ir pra Conversas
        </button>
      </div>
    </div>
  );
}

// ============================================================
// PRIMITIVES
// ============================================================

function Popover({ children }: { children: React.ReactNode }) {
  const { tokens: t } = useTheme();
  return (
    <div
      style={{
        position: 'absolute',
        top: 'calc(100% + 6px)',
        right: 0,
        zIndex: 40,
        minWidth: 180,
        background: t.bgElevated,
        border: `1px solid ${t.border}`,
        borderRadius: 8,
        boxShadow: '0 12px 32px rgba(0,0,0,0.3)',
        padding: 4,
      }}
    >
      {children}
    </div>
  );
}

function Row({
  label,
  active,
  onClick,
  color,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  color?: string;
}) {
  const { tokens: t } = useTheme();
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        padding: '7px 10px',
        background: hover || active ? t.bgHover : 'transparent',
        border: 'none',
        borderRadius: 6,
        color: active ? t.gold : t.text,
        fontSize: 12.5,
        cursor: 'pointer',
        fontFamily: FONT_STACK,
        textAlign: 'left',
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
        {color && <span style={{ width: 7, height: 7, borderRadius: 2, background: color }} />}
        {label}
      </span>
      {active && <Icons.Check s={11} c="currentColor" />}
    </button>
  );
}

function MenuRow({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  const { tokens: t } = useTheme();
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'block',
        width: '100%',
        padding: '7px 10px',
        background: hover ? t.bgHover : 'transparent',
        border: 'none',
        borderRadius: 6,
        color: danger ? t.danger : t.text,
        fontSize: 12.5,
        cursor: 'pointer',
        fontFamily: FONT_STACK,
        textAlign: 'left',
      }}
    >
      {label}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const { tokens: t } = useTheme();
  return (
    <div>
      <Label t={t}>{label}</Label>
      {children}
    </div>
  );
}

function Label({ t, children }: { t: ReturnType<typeof useTheme>['tokens']; children: React.ReactNode }) {
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

function Avatar({ name, size = 24 }: { name: string; size?: number }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
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
        fontSize: size <= 20 ? 8.5 : size <= 30 ? 10.5 : 13,
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
  return v.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function formatDateBR(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR');
}

function formatDateTimeBR(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function relative(iso: string): string {
  const d = new Date(iso);
  const diff = d.getTime() - Date.now();
  const abs = Math.abs(diff);
  const future = diff > 0;
  const mins = Math.floor(abs / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return future ? `em ${mins}m` : `há ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return future ? `em ${hours}h` : `há ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return future ? `em ${days}d` : `há ${days}d`;
  return d.toLocaleDateString('pt-BR');
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
