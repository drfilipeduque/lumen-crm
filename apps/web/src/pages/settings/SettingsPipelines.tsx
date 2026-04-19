import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useTheme } from '../../lib/ThemeContext';
import { Modal } from '../../components/ui/Modal';
import { Drawer } from '../../components/ui/Drawer';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Switch } from '../../components/ui/Switch';
import { StageColorPicker } from '../../components/ui/StageColorPicker';
import { toast } from '../../components/ui/Toast';
import { Icons, type IconName } from '../../components/icons';
import { FONT_STACK } from '../../lib/theme';
import {
  useCreatePipeline,
  useCreateStage,
  useDeletePipeline,
  useDeleteStage,
  usePipeline,
  usePipelines,
  useReorderStages,
  useSetPipelineCustomFields,
  useUpdatePipeline,
  useUpdateStage,
  type PipelineDetail,
  type PipelineListItem,
  type StageDetail,
} from '../../hooks/usePipelines';
import { useCustomFields, type CustomField } from '../../hooks/useCustomFields';

// ============================================================
// PAGE
// ============================================================

export function SettingsPipelines() {
  const { tokens: t } = useTheme();
  const pipelines = usePipelines();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<{ pipeline: PipelineListItem; force: boolean } | null>(null);
  const remove = useDeletePipeline();
  const update = useUpdatePipeline();

  const handleDeleteClick = (p: PipelineListItem) => {
    setDeleting({ pipeline: p, force: p.opportunityCount > 0 });
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await remove.mutateAsync({ id: deleting.pipeline.id, force: deleting.force });
      toast(`Funil "${deleting.pipeline.name}" excluído`, 'success');
      setDeleting(null);
    } catch (e) {
      toast(axiosMsg(e) || 'Falha ao excluir', 'error');
    }
  };

  const toggleActive = async (p: PipelineListItem) => {
    try {
      await update.mutateAsync({ id: p.id, active: !p.active });
      toast(p.active ? 'Funil desativado' : 'Funil ativado', 'success');
    } catch {
      toast('Falha ao atualizar', 'error');
    }
  };

  return (
    <div style={{ padding: '28px 32px 40px', color: t.text }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 22 }}>
        <div style={{ maxWidth: 540 }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, letterSpacing: -0.4, margin: 0, color: t.text }}>
            Pipelines
          </h2>
          <div style={{ fontSize: 13, color: t.textDim, marginTop: 4, lineHeight: 1.5 }}>
            Configure os funis comerciais e suas etapas. Cada funil pode ter campos personalizados
            visíveis e marcações de Ganho / Perdido.
          </div>
        </div>
        <button type="button" onClick={() => setCreating(true)} style={buttonGold(t)}>
          <Icons.Plus s={12} c="#1a1300" /> Novo funil
        </button>
      </div>

      {pipelines.isLoading ? (
        <SkeletonList t={t} />
      ) : !pipelines.data || pipelines.data.length === 0 ? (
        <Empty t={t} onCreate={() => setCreating(true)} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
          {pipelines.data.map((p) => (
            <PipelineCard
              key={p.id}
              pipeline={p}
              onEdit={() => setEditingId(p.id)}
              onDelete={() => handleDeleteClick(p)}
              onToggleActive={() => toggleActive(p)}
            />
          ))}
        </div>
      )}

      <PipelineCreateModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(id) => {
          setCreating(false);
          setEditingId(id);
        }}
      />

      <PipelineEditDrawer
        pipelineId={editingId}
        onClose={() => setEditingId(null)}
      />

      <ConfirmDialog
        open={deleting !== null}
        title={deleting?.force ? 'Excluir funil com oportunidades?' : 'Excluir funil?'}
        description={
          deleting?.force ? (
            <>
              <strong>{deleting.pipeline.name}</strong> tem{' '}
              <strong>{deleting.pipeline.opportunityCount}</strong> oportunidade(s) ativa(s).
              Confirmando, todas serão apagadas e o funil removido permanentemente.
            </>
          ) : (
            <>
              Tem certeza que deseja excluir <strong>{deleting?.pipeline.name}</strong>?
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
// CARD
// ============================================================

function PipelineCard({
  pipeline,
  onEdit,
  onDelete,
  onToggleActive,
}: {
  pipeline: PipelineListItem;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: () => void;
}) {
  const { tokens: t } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const id = setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener('mousedown', handler);
    };
  }, [menuOpen]);

  return (
    <div
      style={{
        background: t.bgElevated,
        border: `1px solid ${t.border}`,
        borderRadius: 12,
        padding: 18,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        opacity: pipeline.active ? 1 : 0.65,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <h3
              style={{
                margin: 0,
                fontSize: 14.5,
                fontWeight: 600,
                color: t.text,
                letterSpacing: -0.2,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {pipeline.name}
            </h3>
            <Badge active={pipeline.active} t={t} />
          </div>
          <p
            style={{
              margin: 0,
              fontSize: 12.5,
              color: t.textSubtle,
              lineHeight: 1.45,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              minHeight: 36,
            }}
          >
            {pipeline.description || 'Sem descrição'}
          </p>
        </div>
        <div ref={menuRef} style={{ position: 'relative' }}>
          <IconBtn title="Ações" onClick={() => setMenuOpen((v) => !v)}>
            <Icons.Dot s={4} c={t.textDim} />
            <Icons.Dot s={4} c={t.textDim} />
            <Icons.Dot s={4} c={t.textDim} />
          </IconBtn>
          {menuOpen && (
            <div
              style={{
                position: 'absolute',
                right: 0,
                top: 32,
                width: 180,
                background: t.bgElevated,
                border: `1px solid ${t.border}`,
                borderRadius: 8,
                boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
                padding: 4,
                zIndex: 20,
              }}
            >
              <MenuItem
                label={pipeline.active ? 'Desativar' : 'Ativar'}
                onClick={() => {
                  setMenuOpen(false);
                  onToggleActive();
                }}
              />
              <MenuItem
                label="Excluir"
                danger
                onClick={() => {
                  setMenuOpen(false);
                  onDelete();
                }}
              />
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 18, alignItems: 'center', fontSize: 12, color: t.textSubtle }}>
        <span>
          <strong style={{ color: t.text }}>{pipeline.stageCount}</strong>{' '}
          {pipeline.stageCount === 1 ? 'etapa' : 'etapas'}
        </span>
        <span style={{ width: 1, height: 12, background: t.border }} />
        <span>
          <strong style={{ color: t.text }}>{pipeline.opportunityCount}</strong> ativa
          {pipeline.opportunityCount === 1 ? '' : 's'}
        </span>
      </div>

      <button type="button" onClick={onEdit} style={{ ...buttonGhost(t), marginTop: 4 }}>
        Editar
      </button>
    </div>
  );
}

function Badge({ active, t }: { active: boolean; t: ReturnType<typeof useTheme>['tokens'] }) {
  return (
    <span
      style={{
        fontSize: 10.5,
        padding: '2px 7px',
        borderRadius: 999,
        background: active ? t.goldFaint : t.bgHover,
        color: active ? t.gold : t.textSubtle,
        fontWeight: 500,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
      }}
    >
      {active ? 'Ativo' : 'Inativo'}
    </span>
  );
}

function MenuItem({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
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
        padding: '8px 10px',
        background: hover ? t.bgHover : 'transparent',
        border: 'none',
        borderRadius: 6,
        fontSize: 12.5,
        color: danger ? t.danger : t.text,
        cursor: 'pointer',
        fontFamily: FONT_STACK,
      }}
    >
      {label}
    </button>
  );
}

// ============================================================
// CREATE MODAL
// ============================================================

function PipelineCreateModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { tokens: t } = useTheme();
  const create = useCreatePipeline();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [stages, setStages] = useState<{ name: string; color: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName('');
      setDescription('');
      setStages([
        { name: 'Novo Lead', color: '#3b82f6' },
        { name: 'Em Andamento', color: '#f59e0b' },
        { name: 'Fechado', color: '#22c55e' },
      ]);
      setError(null);
    }
  }, [open]);

  const ok = name.trim().length > 0 && stages.length >= 2 && stages.every((s) => s.name.trim());

  const submit = async () => {
    if (!ok) return;
    setError(null);
    try {
      const r = await create.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        stages: stages.map((s) => ({ name: s.name.trim(), color: s.color })),
      });
      toast('Funil criado', 'success');
      onCreated(r.id);
    } catch (e) {
      setError(axiosMsg(e) || 'Falha ao criar');
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Novo funil" width={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <Label t={t}>Nome</Label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            style={inputStyle(t)}
            placeholder="Ex.: Funil Pós-venda"
            autoFocus
          />
        </div>
        <div>
          <Label t={t}>Descrição (opcional)</Label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            rows={2}
            style={{ ...inputStyle(t), resize: 'vertical' }}
          />
        </div>
        <div>
          <Label t={t}>Etapas iniciais</Label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {stages.map((s, idx) => (
              <div
                key={idx}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}
              >
                <StageColorPicker
                  color={s.color}
                  onChange={(c) =>
                    setStages((all) => all.map((st, i) => (i === idx ? { ...st, color: c } : st)))
                  }
                />
                <input
                  value={s.name}
                  onChange={(e) =>
                    setStages((all) => all.map((st, i) => (i === idx ? { ...st, name: e.target.value } : st)))
                  }
                  placeholder={`Etapa ${idx + 1}`}
                  style={{ ...inputStyle(t), padding: '8px 10px', fontSize: 12.5 }}
                />
                {stages.length > 2 && (
                  <button
                    type="button"
                    onClick={() => setStages((all) => all.filter((_, i) => i !== idx))}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      color: t.textDim,
                      padding: 4,
                    }}
                    title="Remover"
                  >
                    <Icons.X s={13} c="currentColor" />
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() => setStages((all) => [...all, { name: '', color: '#94a3b8' }])}
              style={{
                background: 'transparent',
                border: `1px dashed ${t.border}`,
                color: t.text,
                fontSize: 12,
                padding: '8px 12px',
                borderRadius: 7,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                fontFamily: FONT_STACK,
              }}
            >
              <Icons.Plus s={11} c="currentColor" /> Adicionar etapa
            </button>
          </div>
          <div style={{ fontSize: 11, color: t.textFaint, marginTop: 6 }}>
            Você poderá editar cores, marcações de Ganho/Perdido e adicionar mais etapas depois.
          </div>
        </div>
        {error && <ErrorBox t={t}>{error}</ErrorBox>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onClose} style={buttonGhost(t)}>
            Cancelar
          </button>
          <button
            type="button"
            disabled={!ok || create.isPending}
            onClick={submit}
            style={{
              ...buttonGold(t),
              opacity: ok && !create.isPending ? 1 : 0.5,
              cursor: ok && !create.isPending ? 'pointer' : 'not-allowed',
            }}
          >
            {create.isPending ? 'Criando…' : 'Criar funil'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ============================================================
// EDIT DRAWER
// ============================================================

function PipelineEditDrawer({
  pipelineId,
  onClose,
}: {
  pipelineId: string | null;
  onClose: () => void;
}) {
  return (
    <Drawer open={pipelineId !== null} onClose={onClose}>
      {pipelineId && <DrawerInner key={pipelineId} pipelineId={pipelineId} onClose={onClose} />}
    </Drawer>
  );
}

function DrawerInner({ pipelineId, onClose }: { pipelineId: string; onClose: () => void }) {
  const { tokens: t } = useTheme();
  const detail = usePipeline(pipelineId);
  const fields = useCustomFields();
  const update = useUpdatePipeline();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [active, setActive] = useState(true);
  const [savedSnapshot, setSavedSnapshot] = useState<{ name: string; description: string; active: boolean } | null>(null);

  useEffect(() => {
    if (detail.data) {
      const snap = {
        name: detail.data.name,
        description: detail.data.description ?? '',
        active: detail.data.active,
      };
      setName(snap.name);
      setDescription(snap.description);
      setActive(snap.active);
      setSavedSnapshot(snap);
    }
  }, [detail.data?.id, detail.data?.updatedAt]);

  const dirty =
    savedSnapshot !== null &&
    (name.trim() !== savedSnapshot.name ||
      description.trim() !== savedSnapshot.description ||
      active !== savedSnapshot.active);

  const saveInfo = async () => {
    try {
      await update.mutateAsync({
        id: pipelineId,
        name: name.trim(),
        description: description.trim() || null,
        active,
      });
      toast('Informações salvas', 'success');
    } catch (e) {
      toast(axiosMsg(e) || 'Falha ao salvar', 'error');
    }
  };

  const cancelInfo = () => {
    if (savedSnapshot) {
      setName(savedSnapshot.name);
      setDescription(savedSnapshot.description);
      setActive(savedSnapshot.active);
    }
  };

  if (detail.isLoading || !detail.data) {
    return (
      <div style={{ padding: 24, color: t.textDim }}>Carregando…</div>
    );
  }

  return (
    <>
      <div
        style={{
          padding: '18px 22px',
          borderBottom: `1px solid ${t.border}`,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            fontSize: 17,
            fontWeight: 600,
            color: t.text,
            letterSpacing: -0.3,
            fontFamily: FONT_STACK,
          }}
        />
        <button type="button" onClick={dirty ? cancelInfo : onClose} style={buttonGhost(t)}>
          {dirty ? 'Cancelar' : 'Fechar'}
        </button>
        <button
          type="button"
          disabled={!dirty || update.isPending}
          onClick={saveInfo}
          style={{
            ...buttonGold(t),
            opacity: !dirty || update.isPending ? 0.4 : 1,
            cursor: !dirty || update.isPending ? 'not-allowed' : 'pointer',
          }}
        >
          {update.isPending ? 'Salvando…' : 'Salvar'}
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '22px 22px 32px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <SectionInfo
          description={description}
          setDescription={setDescription}
          active={active}
          setActive={setActive}
        />

        <SectionStages pipeline={detail.data} />

        <SectionCustomFields pipeline={detail.data} customFields={fields.data ?? []} />
      </div>
    </>
  );
}

// ---------- SectionInfo ----------

function SectionInfo({
  description,
  setDescription,
  active,
  setActive,
}: {
  description: string;
  setDescription: (v: string) => void;
  active: boolean;
  setActive: (v: boolean) => void;
}) {
  const { tokens: t } = useTheme();
  return (
    <Section title="Informações" description="Nome aparece no header. Desative para parar de receber novos leads neste funil.">
      <Label t={t}>Descrição</Label>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
        maxLength={500}
        style={{ ...inputStyle(t), resize: 'vertical' }}
        placeholder="Ex.: leads vindos da landing page de pós-venda"
      />
      <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Switch checked={active} onChange={setActive} ariaLabel="Ativo" />
        <span style={{ fontSize: 13, color: t.text }}>Funil ativo</span>
      </div>
    </Section>
  );
}

// ---------- SectionStages ----------

function SectionStages({ pipeline }: { pipeline: PipelineDetail }) {
  const { tokens: t } = useTheme();
  const reorder = useReorderStages();
  const create = useCreateStage();
  const remove = useDeleteStage();

  const [items, setItems] = useState(pipeline.stages);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#94a3b8');
  const [deletingStage, setDeletingStage] = useState<{ stage: StageDetail; force: boolean } | null>(null);

  useEffect(() => setItems(pipeline.stages), [pipeline.stages]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const ids = items.map((s) => s.id);

  const handleEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(items, oldIndex, newIndex);
    setItems(next);
    reorder.mutate(
      { pipelineId: pipeline.id, ids: next.map((s) => s.id) },
      { onError: () => { setItems(pipeline.stages); toast('Falha ao reordenar', 'error'); } },
    );
  };

  const submitAdd = async () => {
    if (!newName.trim()) return;
    try {
      await create.mutateAsync({
        pipelineId: pipeline.id,
        name: newName.trim(),
        color: newColor,
      });
      setNewName('');
      setAdding(false);
      toast('Etapa adicionada', 'success');
    } catch (e) {
      toast(axiosMsg(e) || 'Falha ao adicionar', 'error');
    }
  };

  const confirmDeleteStage = async () => {
    if (!deletingStage) return;
    try {
      await remove.mutateAsync({ id: deletingStage.stage.id, force: deletingStage.force });
      toast('Etapa excluída', 'success');
      setDeletingStage(null);
    } catch (e) {
      toast(axiosMsg(e) || 'Falha ao excluir', 'error');
    }
  };

  return (
    <Section
      title="Etapas"
      description="Arraste para reordenar. Marque como Ganho ou Perdido para indicar onde a oportunidade encerra. Mínimo 2 etapas."
    >
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {items.map((stage) => (
              <StageRow
                key={stage.id}
                stage={stage}
                pipelineId={pipeline.id}
                onDelete={() => setDeletingStage({ stage, force: stage.opportunityCount > 0 })}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {adding ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
          <StageColorPicker color={newColor} onChange={setNewColor} />
          <input
            value={newName}
            autoFocus
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitAdd();
              if (e.key === 'Escape') {
                setAdding(false);
                setNewName('');
              }
            }}
            placeholder="Nome da nova etapa"
            style={{ ...inputStyle(t), padding: '8px 10px', fontSize: 12.5 }}
          />
          <button type="button" onClick={submitAdd} style={{ ...buttonGold(t), padding: '7px 12px', fontSize: 12 }}>
            Adicionar
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding(false);
              setNewName('');
            }}
            style={{ ...buttonGhost(t), padding: '7px 12px', fontSize: 12 }}
          >
            Cancelar
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          style={{
            background: 'transparent',
            border: `1px dashed ${t.border}`,
            color: t.text,
            fontSize: 12.5,
            padding: '9px 12px',
            borderRadius: 7,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            marginTop: 10,
            fontFamily: FONT_STACK,
            width: '100%',
          }}
        >
          <Icons.Plus s={12} c="currentColor" /> Adicionar etapa
        </button>
      )}

      <ConfirmDialog
        open={deletingStage !== null}
        title={deletingStage?.force ? 'Excluir etapa com oportunidades?' : 'Excluir etapa?'}
        description={
          deletingStage?.force ? (
            <>
              <strong>{deletingStage.stage.name}</strong> tem{' '}
              <strong>{deletingStage.stage.opportunityCount}</strong> oportunidade(s). Confirmando, todas
              serão apagadas e a etapa removida.
            </>
          ) : (
            <>
              Tem certeza que deseja excluir <strong>{deletingStage?.stage.name}</strong>?
            </>
          )
        }
        confirmLabel="Excluir"
        danger
        onConfirm={confirmDeleteStage}
        onClose={() => setDeletingStage(null)}
      />
    </Section>
  );
}

// ---------- StageRow (sortable) ----------

type StageMode = 'open' | 'won' | 'lost';

function modeOf(s: StageDetail): StageMode {
  if (s.isClosedWon) return 'won';
  if (s.isClosedLost) return 'lost';
  return 'open';
}

function StageRow({
  stage,
  pipelineId: _pipelineId,
  onDelete,
}: {
  stage: StageDetail;
  pipelineId: string;
  onDelete: () => void;
}) {
  const { tokens: t } = useTheme();
  const update = useUpdateStage();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stage.id });
  const [name, setName] = useState(stage.name);

  useEffect(() => setName(stage.name), [stage.name]);

  const persistName = () => {
    if (name.trim() === stage.name || !name.trim()) {
      setName(stage.name);
      return;
    }
    update.mutate({ id: stage.id, name: name.trim() });
  };

  const setColor = (c: string) => update.mutate({ id: stage.id, color: c });

  const setMode = (m: StageMode) => {
    update.mutate({
      id: stage.id,
      isClosedWon: m === 'won',
      isClosedLost: m === 'lost',
    });
  };

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
    background: isDragging ? t.bgHover : t.bgInput,
    border: `1px solid ${t.border}`,
    borderRadius: 8,
    padding: '8px 10px',
    display: 'grid',
    gridTemplateColumns: '20px 22px 1fr auto auto auto',
    alignItems: 'center',
    gap: 10,
  };

  const mode = modeOf(stage);

  return (
    <div ref={setNodeRef} style={style}>
      <button
        type="button"
        {...attributes}
        {...listeners}
        title="Arrastar"
        style={{ background: 'transparent', border: 'none', cursor: 'grab', padding: 0, color: t.textFaint }}
      >
        <Icons.Grip s={13} c="currentColor" />
      </button>
      <StageColorPicker color={stage.color} onChange={setColor} />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={persistName}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setName(stage.name);
            (e.target as HTMLInputElement).blur();
          }
        }}
        style={{
          background: 'transparent',
          border: 'none',
          outline: 'none',
          color: t.text,
          fontSize: 13,
          fontFamily: FONT_STACK,
          padding: 4,
        }}
      />
      <ModePicker value={mode} onChange={setMode} />
      <span
        title="Oportunidades atualmente nesta etapa"
        style={{
          fontSize: 11,
          color: t.textSubtle,
          padding: '2px 8px',
          background: t.bgHover,
          borderRadius: 4,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {stage.opportunityCount}
      </span>
      <button
        type="button"
        onClick={onDelete}
        title="Excluir etapa"
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

function ModePicker({ value, onChange }: { value: StageMode; onChange: (m: StageMode) => void }) {
  const { tokens: t } = useTheme();
  const opts: { key: StageMode; label: string }[] = [
    { key: 'open', label: 'Aberta' },
    { key: 'won', label: 'Ganho' },
    { key: 'lost', label: 'Perdido' },
  ];
  return (
    <div
      style={{
        display: 'inline-flex',
        background: t.bg,
        border: `1px solid ${t.border}`,
        borderRadius: 6,
        padding: 2,
      }}
    >
      {opts.map((o) => {
        const active = o.key === value;
        const color =
          o.key === 'won' ? t.success : o.key === 'lost' ? t.danger : t.gold;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            style={{
              padding: '3px 10px',
              border: 'none',
              borderRadius: 4,
              background: active ? color : 'transparent',
              color: active ? (o.key === 'won' || o.key === 'lost' ? '#fff' : '#1a1300') : t.textDim,
              fontSize: 11,
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

// ---------- SectionCustomFields ----------

function SectionCustomFields({
  pipeline,
  customFields,
}: {
  pipeline: PipelineDetail;
  customFields: CustomField[];
}) {
  const { tokens: t } = useTheme();
  const setFields = useSetPipelineCustomFields();

  // Combina ALL custom fields globais + a config atual deste pipeline
  type Row = { customFieldId: string; name: string; type: string; visible: boolean; order: number };
  const initial = useMemo<Row[]>(() => {
    const byId = new Map(pipeline.customFields.map((p) => [p.customFieldId, p] as const));
    const known = customFields.map((cf, idx) => {
      const existing = byId.get(cf.id);
      return existing
        ? { customFieldId: cf.id, name: cf.name, type: cf.type, visible: existing.visible, order: existing.order }
        : { customFieldId: cf.id, name: cf.name, type: cf.type, visible: false, order: 1000 + idx };
    });
    // Visíveis primeiro (por ordem), depois invisíveis (por nome)
    return known.sort((a, b) => {
      if (a.visible !== b.visible) return a.visible ? -1 : 1;
      if (a.visible) return a.order - b.order;
      return a.name.localeCompare(b.name);
    });
  }, [pipeline.customFields, customFields]);

  const [rows, setRows] = useState<Row[]>(initial);
  useEffect(() => setRows(initial), [initial]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const persist = (next: Row[]) => {
    const payload = next
      .filter((r) => r.visible)
      .map((r, idx) => ({ customFieldId: r.customFieldId, visible: true, order: idx }))
      .concat(
        next
          .filter((r) => !r.visible)
          .map((r) => ({ customFieldId: r.customFieldId, visible: false, order: 0 })),
      );
    setFields.mutate(
      { pipelineId: pipeline.id, rows: payload },
      { onError: () => toast('Falha ao salvar', 'error') },
    );
  };

  const toggle = (id: string) => {
    const next = rows.map((r) => (r.customFieldId === id ? { ...r, visible: !r.visible } : r));
    setRows(next);
    persist(next);
  };

  const handleEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = rows.findIndex((r) => r.customFieldId === active.id);
    const newIndex = rows.findIndex((r) => r.customFieldId === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    // Só reordena entre os visíveis
    if (!rows[oldIndex]!.visible || !rows[newIndex]!.visible) return;
    const next = arrayMove(rows, oldIndex, newIndex);
    setRows(next);
    persist(next);
  };

  if (customFields.length === 0) {
    return (
      <Section title="Campos personalizados visíveis" description="Configure quais campos extras aparecem ao editar oportunidades neste funil.">
        <div
          style={{
            background: t.bgInput,
            border: `1px dashed ${t.border}`,
            borderRadius: 8,
            padding: 18,
            color: t.textSubtle,
            fontSize: 13,
            textAlign: 'center',
          }}
        >
          Nenhum campo personalizado cadastrado ainda.
        </div>
      </Section>
    );
  }

  const visibleIds = rows.filter((r) => r.visible).map((r) => r.customFieldId);

  return (
    <Section title="Campos personalizados visíveis" description="Marque quais campos aparecem nos formulários deste funil. Arraste os visíveis para mudar a ordem.">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleEnd}>
        <SortableContext items={visibleIds} strategy={verticalListSortingStrategy}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {rows.map((r) => (
              <CustomFieldRow key={r.customFieldId} row={r} sortable={r.visible} onToggle={() => toggle(r.customFieldId)} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </Section>
  );
}

const TYPE_ICON: Record<string, IconName> = {
  TEXT: 'Type', LONG_TEXT: 'AlignLeft', NUMBER: 'Hash', CURRENCY: 'DollarSign',
  DATE: 'Calendar', SELECT: 'List', MULTI_SELECT: 'ListChecks', BOOLEAN: 'ToggleLeft', URL: 'Link',
};
const TYPE_LABEL: Record<string, string> = {
  TEXT: 'Texto', LONG_TEXT: 'Texto longo', NUMBER: 'Número', CURRENCY: 'Moeda',
  DATE: 'Data', SELECT: 'Seleção', MULTI_SELECT: 'Múltipla', BOOLEAN: 'Sim/Não', URL: 'URL',
};

function CustomFieldRow({
  row,
  sortable,
  onToggle,
}: {
  row: { customFieldId: string; name: string; type: string; visible: boolean };
  sortable: boolean;
  onToggle: () => void;
}) {
  const { tokens: t } = useTheme();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.customFieldId,
    disabled: !sortable,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : row.visible ? 1 : 0.65,
    background: isDragging ? t.bgHover : t.bgInput,
    border: `1px solid ${t.border}`,
    borderRadius: 8,
    padding: '9px 10px',
    display: 'grid',
    gridTemplateColumns: '20px 1fr auto auto',
    alignItems: 'center',
    gap: 10,
  };
  const Icon = Icons[TYPE_ICON[row.type] ?? 'Type'];
  return (
    <div ref={setNodeRef} style={style}>
      {sortable ? (
        <button
          type="button"
          {...attributes}
          {...listeners}
          style={{ background: 'transparent', border: 'none', cursor: 'grab', padding: 0, color: t.textFaint }}
        >
          <Icons.Grip s={13} c="currentColor" />
        </button>
      ) : (
        <div />
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <Icon s={14} c={row.visible ? t.gold : t.icon} />
        <span style={{ fontSize: 13, color: t.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {row.name}
        </span>
      </div>
      <span style={{ fontSize: 10.5, color: t.textSubtle, padding: '2px 8px', background: t.bgHover, borderRadius: 4 }}>
        {TYPE_LABEL[row.type] ?? row.type}
      </span>
      <Switch checked={row.visible} onChange={onToggle} ariaLabel={`Mostrar ${row.name}`} />
    </div>
  );
}

// ============================================================
// PRIMITIVES
// ============================================================

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  const { tokens: t } = useTheme();
  return (
    <section
      style={{
        background: t.bg,
        border: `1px solid ${t.border}`,
        borderRadius: 12,
        padding: 18,
      }}
    >
      <div style={{ marginBottom: 14 }}>
        <h3 style={{ fontSize: 13.5, fontWeight: 600, color: t.text, margin: 0, letterSpacing: -0.2 }}>
          {title}
        </h3>
        <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 3, lineHeight: 1.5 }}>{description}</div>
      </div>
      {children}
    </section>
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
      <div style={{ fontSize: 14, color: t.text, marginBottom: 6 }}>Sem funis ainda</div>
      <div style={{ fontSize: 12.5, color: t.textSubtle, marginBottom: 16 }}>
        Crie um funil para organizar suas oportunidades em etapas.
      </div>
      <button type="button" onClick={onCreate} style={buttonGold(t)}>
        <Icons.Plus s={12} c="#1a1300" /> Criar primeiro funil
      </button>
    </div>
  );
}

function SkeletonList({ t }: { t: ReturnType<typeof useTheme>['tokens'] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          style={{
            background: t.bgElevated,
            border: `1px solid ${t.border}`,
            borderRadius: 12,
            height: 140,
            opacity: 0.6,
          }}
        />
      ))}
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
        gap: 2,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = t.bgHover)}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {children}
    </button>
  );
}

function ErrorBox({ children, t }: { children: React.ReactNode; t: ReturnType<typeof useTheme>['tokens'] }) {
  return (
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
      {children}
    </div>
  );
}

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

function axiosMsg(e: unknown): string | null {
  return axios.isAxiosError(e) ? e.response?.data?.message ?? null : null;
}
