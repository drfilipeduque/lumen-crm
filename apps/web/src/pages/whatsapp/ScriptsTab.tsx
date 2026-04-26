import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import axios from 'axios';
import { useDropzone } from 'react-dropzone';
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
import { toast } from '../../components/ui/Toast';
import { Icons } from '../../components/icons';
import { FONT_STACK } from '../../lib/theme';
import {
  useCreateFolder,
  useCreateScript,
  useDeleteFolder,
  useDeleteScript,
  useDuplicateScript,
  useRemoveScriptMedia,
  useReorderFolders,
  useScriptFolders,
  useScriptVariables,
  useScripts,
  useUpdateFolder,
  useUpdateScript,
  useUploadScriptMedia,
  type Script,
  type ScriptFolder,
  type ScriptMediaType,
  type ScriptVariable,
} from '../../hooks/useScripts';

// ============================================================
// PAGE
// ============================================================

export function ScriptsTab() {
  const { tokens: t } = useTheme();
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null); // null = Todos
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [editing, setEditing] = useState<Script | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Script | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(id);
  }, [search]);

  const folders = useScriptFolders();
  const scripts = useScripts({ folderId: selectedFolder, search: debouncedSearch });
  const duplicate = useDuplicateScript();

  const handleDuplicate = async (s: Script) => {
    try {
      await duplicate.mutateAsync(s.id);
      toast('Script duplicado', 'success');
    } catch (e) {
      toast(axiosMsg(e) || 'Falha ao duplicar', 'error');
    }
  };

  const initialFolderId = selectedFolder ?? folders.data?.[0]?.id ?? null;

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0, color: t.text }}>
      <FolderSidebar
        folders={folders.data ?? []}
        selected={selectedFolder}
        onSelect={setSelectedFolder}
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div
          style={{
            padding: '20px 28px',
            borderBottom: `1px solid ${t.border}`,
            display: 'flex',
            gap: 12,
            alignItems: 'center',
          }}
        >
          <div style={{ position: 'relative', flex: 1, maxWidth: 480 }}>
            <input
              type="text"
              placeholder="Buscar por nome ou conteúdo…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px 10px 36px',
                background: t.bgInput,
                border: `1px solid ${t.border}`,
                borderRadius: 10,
                color: t.text,
                fontSize: 13,
                fontFamily: FONT_STACK,
                outline: 'none',
              }}
            />
            <div style={{ position: 'absolute', left: 12, top: 11, color: t.icon }}>
              <Icons.Search s={14} />
            </div>
          </div>
          <button
            type="button"
            onClick={() => setCreating(true)}
            style={{
              background: t.gold,
              color: '#0a0a0a',
              border: 'none',
              borderRadius: 10,
              padding: '10px 16px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontFamily: FONT_STACK,
            }}
          >
            <Icons.Plus s={14} c="#0a0a0a" />
            Novo Script
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {scripts.isLoading ? (
            <div style={{ color: t.textDim, fontSize: 13 }}>Carregando…</div>
          ) : !scripts.data || scripts.data.length === 0 ? (
            <EmptyState onCreate={() => setCreating(true)} />
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: 14,
              }}
            >
              {scripts.data.map((s) => (
                <ScriptCard
                  key={s.id}
                  script={s}
                  onClick={() => setEditing(s)}
                  onDuplicate={() => handleDuplicate(s)}
                  onDelete={() => setDeleting(s)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {creating && (
        <ScriptEditor
          mode="create"
          initialFolderId={initialFolderId}
          folders={folders.data ?? []}
          onClose={() => setCreating(false)}
        />
      )}
      {editing && (
        <ScriptEditor
          mode="edit"
          script={editing}
          folders={folders.data ?? []}
          onClose={() => setEditing(null)}
        />
      )}
      <DeleteScriptDialog script={deleting} onClose={() => setDeleting(null)} />
    </div>
  );
}

// ============================================================
// SIDEBAR DE PASTAS
// ============================================================

function FolderSidebar({
  folders,
  selected,
  onSelect,
}: {
  folders: ScriptFolder[];
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const { tokens: t } = useTheme();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ScriptFolder | null>(null);
  const [deleting, setDeleting] = useState<ScriptFolder | null>(null);
  const [items, setItems] = useState<ScriptFolder[]>([]);

  useEffect(() => setItems(folders), [folders]);

  const reorder = useReorderFolders();
  const remove = useDeleteFolder();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const ids = useMemo(() => items.map((i) => i.id), [items]);

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(items, oldIndex, newIndex);
    setItems(next);
    reorder.mutate(next.map((n) => n.id), {
      onError: (e) => {
        setItems(items);
        toast(axiosMsg(e) || 'Falha ao reordenar', 'error');
      },
    });
  };

  const handleDelete = async (f: ScriptFolder) => {
    try {
      await remove.mutateAsync(f.id);
      if (selected === f.id) onSelect(null);
      toast(`Pasta "${f.name}" excluída — scripts movidos para "Sem pasta"`, 'success');
    } catch (e) {
      toast(axiosMsg(e) || 'Falha ao excluir pasta', 'error');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div
      style={{
        width: 240,
        borderRight: `1px solid ${t.border}`,
        background: t.bgElevated,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          padding: '18px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: `1px solid ${t.border}`,
        }}
      >
        <div
          style={{
            fontSize: 11,
            letterSpacing: 1,
            textTransform: 'uppercase',
            color: t.textFaint,
            fontWeight: 600,
          }}
        >
          Pastas
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          title="Nova pasta"
          style={{
            background: 'transparent',
            border: `1px solid ${t.border}`,
            color: t.text,
            borderRadius: 8,
            padding: '4px 8px',
            cursor: 'pointer',
            fontSize: 12,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <Icons.Plus s={12} />
          Nova
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
        <FolderItem
          name="Todos os scripts"
          count={items.reduce((acc, f) => acc + f.scriptCount, 0)}
          active={selected === null}
          onClick={() => onSelect(null)}
        />
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            {items.map((f) => (
              <SortableFolderRow
                key={f.id}
                folder={f}
                active={selected === f.id}
                onSelect={() => onSelect(f.id)}
                onEdit={() => setEditing(f)}
                onDelete={() => setDeleting(f)}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>

      {creating && <FolderModal onClose={() => setCreating(false)} />}
      {editing && <FolderModal folder={editing} onClose={() => setEditing(null)} />}

      <ConfirmDialog
        open={!!deleting}
        title={`Excluir pasta "${deleting?.name}"?`}
        description={
          <>
            Os {deleting?.scriptCount ?? 0} script(s) dentro dela serão movidos para <b>Sem pasta</b>. Esta
            ação não pode ser desfeita.
          </>
        }
        confirmLabel="Excluir pasta"
        danger
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (deleting) await handleDelete(deleting);
        }}
      />
    </div>
  );
}

function FolderItem({
  name,
  count,
  active,
  onClick,
  rightSlot,
  drag,
}: {
  name: string;
  count: number;
  active: boolean;
  onClick: () => void;
  rightSlot?: React.ReactNode;
  drag?: React.ReactNode;
}) {
  const { tokens: t } = useTheme();
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 10px',
        borderRadius: 8,
        cursor: 'pointer',
        background: active ? t.bgActive : hover ? t.bgHover : 'transparent',
        color: active ? t.gold : t.text,
        fontSize: 13,
        fontWeight: active ? 600 : 500,
        marginBottom: 2,
        transition: 'background 80ms',
      }}
    >
      {drag}
      <div style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {name}
      </div>
      <div
        style={{
          fontSize: 11,
          color: active ? t.gold : t.textFaint,
          background: active ? 'transparent' : t.bgInput,
          borderRadius: 6,
          padding: '1px 6px',
          minWidth: 18,
          textAlign: 'center',
        }}
      >
        {count}
      </div>
      {hover && rightSlot}
    </div>
  );
}

function SortableFolderRow({
  folder,
  active,
  onSelect,
  onEdit,
  onDelete,
}: {
  folder: ScriptFolder;
  active: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { tokens: t } = useTheme();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: folder.id,
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  return (
    <div ref={setNodeRef} style={style}>
      <FolderItem
        name={folder.name}
        count={folder.scriptCount}
        active={active}
        onClick={onSelect}
        drag={
          <div
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
            style={{ cursor: 'grab', color: t.icon, display: 'flex' }}
          >
            <Icons.Grip s={12} />
          </div>
        }
        rightSlot={
          <div style={{ display: 'flex', gap: 2 }} onClick={(e) => e.stopPropagation()}>
            <IconBtn title="Renomear" onClick={onEdit}>
              <Icons.Edit s={12} />
            </IconBtn>
            <IconBtn title="Excluir" onClick={onDelete}>
              <Icons.Trash s={12} />
            </IconBtn>
          </div>
        }
      />
    </div>
  );
}

function IconBtn({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const { tokens: t } = useTheme();
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        background: 'transparent',
        border: 'none',
        color: t.icon,
        cursor: 'pointer',
        padding: 4,
        borderRadius: 6,
        display: 'inline-flex',
      }}
    >
      {children}
    </button>
  );
}

function FolderModal({ folder, onClose }: { folder?: ScriptFolder; onClose: () => void }) {
  const { tokens: t } = useTheme();
  const [name, setName] = useState(folder?.name ?? '');
  const [busy, setBusy] = useState(false);
  const create = useCreateFolder();
  const update = useUpdateFolder();

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      if (folder) await update.mutateAsync({ id: folder.id, name: trimmed });
      else await create.mutateAsync({ name: trimmed });
      toast(folder ? 'Pasta renomeada' : 'Pasta criada', 'success');
      onClose();
    } catch (e) {
      toast(axiosMsg(e) || 'Falha ao salvar pasta', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={busy ? () => {} : onClose} title={folder ? 'Renomear pasta' : 'Nova pasta'}>
      <div style={{ padding: 18 }}>
        <label style={{ display: 'block', fontSize: 12, color: t.textDim, marginBottom: 6 }}>
          Nome
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          maxLength={80}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          style={{
            width: '100%',
            padding: '10px 12px',
            background: t.bgInput,
            border: `1px solid ${t.border}`,
            borderRadius: 8,
            color: t.text,
            fontSize: 13,
            fontFamily: FONT_STACK,
            outline: 'none',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{
              background: 'transparent',
              border: `1px solid ${t.border}`,
              color: t.text,
              borderRadius: 8,
              padding: '8px 14px',
              fontSize: 13,
              cursor: busy ? 'default' : 'pointer',
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || !name.trim()}
            style={{
              background: t.gold,
              color: '#0a0a0a',
              border: 'none',
              borderRadius: 8,
              padding: '8px 14px',
              fontSize: 13,
              fontWeight: 600,
              cursor: busy || !name.trim() ? 'default' : 'pointer',
              opacity: busy || !name.trim() ? 0.6 : 1,
            }}
          >
            Salvar
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ============================================================
// CARDS DE SCRIPT
// ============================================================

function ScriptCard({
  script,
  onClick,
  onDuplicate,
  onDelete,
}: {
  script: Script;
  onClick: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const { tokens: t } = useTheme();
  const [hover, setHover] = useState(false);

  const copyContent = async () => {
    try {
      await navigator.clipboard.writeText(script.content);
      toast('Conteúdo copiado', 'success');
    } catch {
      toast('Não foi possível copiar', 'error');
    }
  };

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: t.bgElevated,
        border: `1px solid ${hover ? t.borderStrong : t.border}`,
        borderRadius: 12,
        padding: 14,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        transition: 'border-color 80ms',
        position: 'relative',
        minHeight: 180,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <MediaTypeIcon type={script.mediaType} />
        <div
          style={{
            fontSize: 13.5,
            fontWeight: 600,
            color: t.text,
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {script.name}
        </div>
      </div>

      <div
        style={{
          fontSize: 12.5,
          color: t.textDim,
          lineHeight: 1.45,
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          flex: 1,
          whiteSpace: 'pre-wrap',
        }}
      >
        {script.content || '(sem conteúdo)'}
      </div>

      {script.variables.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {script.variables.slice(0, 4).map((v) => (
            <span
              key={v}
              style={{
                fontSize: 10.5,
                background: t.goldFaint,
                color: t.gold,
                padding: '2px 6px',
                borderRadius: 4,
                fontFamily: 'ui-monospace, monospace',
              }}
            >
              {`{{${v}}}`}
            </span>
          ))}
          {script.variables.length > 4 && (
            <span style={{ fontSize: 10.5, color: t.textFaint }}>+{script.variables.length - 4}</span>
          )}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 11,
          color: t.textFaint,
          paddingTop: 8,
          borderTop: `1px solid ${t.border}`,
        }}
      >
        <span>{script.folderName ?? 'Sem pasta'}</span>
        <span>{formatDate(script.updatedAt)}</span>
      </div>

      {hover && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            display: 'flex',
            gap: 2,
            background: t.bgElevated,
            border: `1px solid ${t.border}`,
            borderRadius: 8,
            padding: 2,
          }}
        >
          <IconBtn title="Copiar conteúdo" onClick={copyContent}>
            <Icons.Paperclip s={12} />
          </IconBtn>
          <IconBtn title="Duplicar" onClick={onDuplicate}>
            <Icons.Plus s={12} />
          </IconBtn>
          <IconBtn title="Editar" onClick={onClick}>
            <Icons.Edit s={12} />
          </IconBtn>
          <IconBtn title="Excluir" onClick={onDelete}>
            <Icons.Trash s={12} />
          </IconBtn>
        </div>
      )}
    </div>
  );
}

function MediaTypeIcon({ type }: { type: ScriptMediaType | null }) {
  const { tokens: t } = useTheme();
  if (!type) return <Icons.Type s={14} c={t.icon} />;
  if (type === 'IMAGE') return <Icons.Image s={14} c={t.icon} />;
  if (type === 'AUDIO') return <Icons.Mic s={14} c={t.icon} />;
  if (type === 'VIDEO') return <Icons.Play s={14} c={t.icon} />;
  return <Icons.File s={14} c={t.icon} />;
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  const { tokens: t } = useTheme();
  return (
    <div
      style={{
        maxWidth: 420,
        margin: '40px auto 0',
        textAlign: 'center',
        background: t.bgElevated,
        border: `1px dashed ${t.border}`,
        borderRadius: 14,
        padding: 32,
      }}
    >
      <div style={{ fontSize: 32, marginBottom: 10 }}>📝</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: t.text, marginBottom: 6 }}>
        Nenhum script ainda
      </div>
      <div style={{ fontSize: 13, color: t.textDim, marginBottom: 18 }}>
        Crie mensagens prontas com variáveis dinâmicas para acelerar o atendimento.
      </div>
      <button
        type="button"
        onClick={onCreate}
        style={{
          background: t.gold,
          color: '#0a0a0a',
          border: 'none',
          borderRadius: 10,
          padding: '10px 18px',
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Criar primeiro script
      </button>
    </div>
  );
}

// ============================================================
// EDITOR DE SCRIPT
// ============================================================

function ScriptEditor({
  mode,
  script,
  initialFolderId,
  folders,
  onClose,
}: {
  mode: 'create' | 'edit';
  script?: Script;
  initialFolderId?: string | null;
  folders: ScriptFolder[];
  onClose: () => void;
}) {
  const { tokens: t } = useTheme();
  const [name, setName] = useState(script?.name ?? '');
  const [folderId, setFolderId] = useState<string | null>(script?.folderId ?? initialFolderId ?? null);
  const [content, setContent] = useState(script?.content ?? '');
  const [mediaUrl, setMediaUrl] = useState<string | null>(script?.mediaUrl ?? null);
  const [mediaType, setMediaType] = useState<ScriptMediaType | null>(script?.mediaType ?? null);
  const [busy, setBusy] = useState(false);
  const [varOpen, setVarOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const create = useCreateScript();
  const update = useUpdateScript();
  const upload = useUploadScriptMedia();
  const removeMedia = useRemoveScriptMedia();
  const variables = useScriptVariables();

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 320) + 'px';
  }, [content]);

  const insertVariable = (key: string) => {
    const el = textareaRef.current;
    const insert = `{{${key}}}`;
    if (!el) {
      setContent((c) => c + insert);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = content.slice(0, start) + insert + content.slice(end);
    setContent(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + insert.length, start + insert.length);
    });
  };

  const submit = async () => {
    const trimmedName = name.trim();
    const trimmedContent = content.trim();
    if (!trimmedName) {
      toast('Informe um nome', 'error');
      return;
    }
    if (!trimmedContent) {
      toast('Informe o conteúdo', 'error');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'create') {
        const created = await create.mutateAsync({
          name: trimmedName,
          folderId: folderId,
          content: trimmedContent,
          mediaType,
          mediaUrl,
        });
        toast('Script criado', 'success');
        // Se tem mídia "fantasma" (mediaUrl preenchido por upload prévio? não há nessa etapa) — ignora
        onClose();
        return;
      }
      if (script) {
        await update.mutateAsync({
          id: script.id,
          name: trimmedName,
          folderId,
          content: trimmedContent,
          mediaType,
          mediaUrl,
        });
        toast('Script atualizado', 'success');
        onClose();
      }
    } catch (e) {
      toast(axiosMsg(e) || 'Falha ao salvar', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleUpload = async (file: File) => {
    if (mode === 'create') {
      // Precisa criar primeiro o script para anexar mídia (porque endpoint é por id)
      try {
        const created = await create.mutateAsync({
          name: name.trim() || 'Sem nome',
          folderId,
          content: content.trim() || ' ',
        });
        const updated = await upload.mutateAsync({ id: created.id, file });
        setMediaType(updated.mediaType);
        setMediaUrl(updated.mediaUrl);
        toast('Mídia anexada — script salvo', 'success');
        onClose();
      } catch (e) {
        toast(axiosMsg(e) || 'Falha ao anexar mídia', 'error');
      }
      return;
    }
    if (!script) return;
    try {
      const updated = await upload.mutateAsync({ id: script.id, file });
      setMediaType(updated.mediaType);
      setMediaUrl(updated.mediaUrl);
      toast('Mídia anexada', 'success');
    } catch (e) {
      toast(axiosMsg(e) || 'Falha ao anexar mídia', 'error');
    }
  };

  const handleRemoveMedia = async () => {
    if (!script) {
      setMediaType(null);
      setMediaUrl(null);
      return;
    }
    try {
      await removeMedia.mutateAsync(script.id);
      setMediaType(null);
      setMediaUrl(null);
      toast('Mídia removida', 'success');
    } catch (e) {
      toast(axiosMsg(e) || 'Falha ao remover', 'error');
    }
  };

  const grouped = useMemo(() => {
    const out: Record<string, ScriptVariable[]> = {};
    for (const v of variables.data ?? []) {
      (out[v.category] ??= []).push(v);
    }
    return out;
  }, [variables.data]);

  return (
    <Modal open onClose={busy ? () => {} : onClose} title={mode === 'create' ? 'Novo script' : 'Editar script'} width={860}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 0,
          minHeight: 480,
        }}
      >
        {/* COLUNA EDIÇÃO */}
        <div
          style={{
            padding: 20,
            borderRight: `1px solid ${t.border}`,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            minWidth: 0,
          }}
        >
          <Field label="Título">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              placeholder="Ex.: Saudação inicial"
              style={inputStyle(t)}
            />
          </Field>

          <Field label="Pasta">
            <select
              value={folderId ?? ''}
              onChange={(e) => setFolderId(e.target.value || null)}
              style={{ ...inputStyle(t), padding: '9px 10px' }}
            >
              <option value="">Sem pasta</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Conteúdo">
            <div style={{ position: 'relative' }}>
              <textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Escreva sua mensagem. Use {{nome_contato}} para variáveis."
                style={{
                  ...inputStyle(t),
                  resize: 'none',
                  minHeight: 140,
                  lineHeight: 1.5,
                  fontFamily: FONT_STACK,
                  paddingBottom: 32,
                }}
              />
              <div style={{ position: 'absolute', bottom: 6, right: 6 }}>
                <VariableButton open={varOpen} onToggle={() => setVarOpen((o) => !o)} />
                {varOpen && (
                  <VariableDropdown
                    grouped={grouped}
                    onPick={(k) => {
                      insertVariable(k);
                      setVarOpen(false);
                    }}
                    onClose={() => setVarOpen(false)}
                  />
                )}
              </div>
            </div>
            <div style={{ fontSize: 11, color: t.textFaint, marginTop: 4 }}>
              Dica: use <code style={{ fontFamily: 'ui-monospace, monospace' }}>{`{{nome|fallback}}`}</code> para
              valor padrão quando faltar dado.
            </div>
          </Field>

          <MediaSection
            mediaUrl={mediaUrl}
            mediaType={mediaType}
            onUpload={handleUpload}
            onRemove={handleRemoveMedia}
          />
        </div>

        {/* COLUNA PREVIEW */}
        <PreviewColumn content={content} mediaUrl={mediaUrl} mediaType={mediaType} variables={variables.data ?? []} />
      </div>

      {/* FOOTER */}
      <div
        style={{
          padding: '14px 20px',
          borderTop: `1px solid ${t.border}`,
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8,
        }}
      >
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          style={{
            background: 'transparent',
            border: `1px solid ${t.border}`,
            color: t.text,
            borderRadius: 8,
            padding: '8px 16px',
            fontSize: 13,
            cursor: busy ? 'default' : 'pointer',
          }}
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          style={{
            background: t.gold,
            color: '#0a0a0a',
            border: 'none',
            borderRadius: 8,
            padding: '8px 18px',
            fontSize: 13,
            fontWeight: 600,
            cursor: busy ? 'default' : 'pointer',
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const { tokens: t } = useTheme();
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11.5, color: t.textDim, marginBottom: 6, fontWeight: 500 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function inputStyle(t: ReturnType<typeof useTheme>['tokens']): CSSProperties {
  return {
    width: '100%',
    padding: '9px 12px',
    background: t.bgInput,
    border: `1px solid ${t.border}`,
    borderRadius: 8,
    color: t.text,
    fontSize: 13,
    fontFamily: FONT_STACK,
    outline: 'none',
    boxSizing: 'border-box',
  };
}

function VariableButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { tokens: t } = useTheme();
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        background: open ? t.goldFaint : t.bgInput,
        border: `1px solid ${open ? t.gold : t.border}`,
        color: open ? t.gold : t.textDim,
        borderRadius: 6,
        padding: '4px 8px',
        fontSize: 11.5,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontFamily: FONT_STACK,
      }}
    >
      <Icons.Plus s={11} />
      Inserir variável
    </button>
  );
}

function VariableDropdown({
  grouped,
  onPick,
  onClose,
}: {
  grouped: Record<string, ScriptVariable[]>;
  onPick: (key: string) => void;
  onClose: () => void;
}) {
  const { tokens: t } = useTheme();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [onClose]);

  const order: { key: string; label: string }[] = [
    { key: 'contato', label: 'Contato' },
    { key: 'oportunidade', label: 'Oportunidade' },
    { key: 'usuario', label: 'Usuário' },
    { key: 'data', label: 'Data e Hora' },
  ];

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        right: 0,
        bottom: 'calc(100% + 6px)',
        width: 320,
        maxHeight: 360,
        overflowY: 'auto',
        background: t.bgElevated,
        border: `1px solid ${t.borderStrong}`,
        borderRadius: 10,
        boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
        zIndex: 10,
      }}
    >
      {order.map((g) => {
        const items = grouped[g.key] ?? [];
        if (items.length === 0) return null;
        return (
          <div key={g.key}>
            <div
              style={{
                padding: '8px 12px 4px',
                fontSize: 10.5,
                letterSpacing: 1,
                textTransform: 'uppercase',
                color: t.textFaint,
                fontWeight: 600,
              }}
            >
              {g.label}
            </div>
            {items.map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => onPick(v.key)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  background: 'transparent',
                  border: 'none',
                  color: t.text,
                  padding: '8px 12px',
                  cursor: 'pointer',
                  borderRadius: 6,
                  fontSize: 12.5,
                  fontFamily: FONT_STACK,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = t.bgHover)}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontFamily: 'ui-monospace, monospace', color: t.gold }}>{`{{${v.key}}}`}</span>
                  <span style={{ fontSize: 10.5, color: t.textFaint }}>{v.example}</span>
                </div>
                <div style={{ fontSize: 11, color: t.textDim, marginTop: 2 }}>{v.description}</div>
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function MediaSection({
  mediaUrl,
  mediaType,
  onUpload,
  onRemove,
}: {
  mediaUrl: string | null;
  mediaType: ScriptMediaType | null;
  onUpload: (file: File) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const { tokens: t } = useTheme();
  const [busy, setBusy] = useState(false);

  const onDrop = async (accepted: File[]) => {
    const file = accepted[0];
    if (!file) return;
    setBusy(true);
    try {
      await onUpload(file);
    } finally {
      setBusy(false);
    }
  };
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    maxSize: 20 * 1024 * 1024,
  });

  if (mediaUrl) {
    return (
      <div>
        <label style={{ display: 'block', fontSize: 11.5, color: t.textDim, marginBottom: 6, fontWeight: 500 }}>
          Mídia anexada
        </label>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: 10,
            background: t.bgInput,
            border: `1px solid ${t.border}`,
            borderRadius: 8,
          }}
        >
          <MediaPreviewSmall url={mediaUrl} type={mediaType} />
          <div style={{ flex: 1, fontSize: 12, color: t.textDim, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {mediaType ?? 'Arquivo'} · {mediaUrl.split('/').pop()}
          </div>
          <button
            type="button"
            onClick={async () => {
              setBusy(true);
              try {
                await onRemove();
              } finally {
                setBusy(false);
              }
            }}
            disabled={busy}
            style={{
              background: 'transparent',
              border: `1px solid ${t.border}`,
              color: t.danger,
              borderRadius: 6,
              padding: '4px 10px',
              fontSize: 11.5,
              cursor: busy ? 'default' : 'pointer',
            }}
          >
            Remover
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <label style={{ display: 'block', fontSize: 11.5, color: t.textDim, marginBottom: 6, fontWeight: 500 }}>
        Anexar mídia (opcional)
      </label>
      <div
        {...getRootProps()}
        style={{
          padding: 14,
          background: isDragActive ? t.goldFaint : t.bgInput,
          border: `1.5px dashed ${isDragActive ? t.gold : t.border}`,
          borderRadius: 8,
          textAlign: 'center',
          cursor: 'pointer',
          color: isDragActive ? t.gold : t.textDim,
          fontSize: 12,
        }}
      >
        <input {...getInputProps()} />
        {busy
          ? 'Enviando…'
          : isDragActive
            ? 'Solte o arquivo aqui…'
            : 'Arraste ou clique para anexar imagem, áudio, vídeo ou documento (até 20MB)'}
      </div>
    </div>
  );
}

function MediaPreviewSmall({ url, type }: { url: string | null; type: ScriptMediaType | null }) {
  const { tokens: t } = useTheme();
  if (!url) return null;
  if (type === 'IMAGE') {
    return (
      <img
        src={url}
        alt="preview"
        style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6 }}
      />
    );
  }
  return (
    <div
      style={{
        width: 48,
        height: 48,
        borderRadius: 6,
        background: t.bgElevated,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: t.icon,
      }}
    >
      <MediaTypeIcon type={type} />
    </div>
  );
}

// ============================================================
// PREVIEW
// ============================================================

function PreviewColumn({
  content,
  mediaUrl,
  mediaType,
  variables,
}: {
  content: string;
  mediaUrl: string | null;
  mediaType: ScriptMediaType | null;
  variables: ScriptVariable[];
}) {
  const { tokens: t } = useTheme();

  const rendered = useMemo(() => {
    const exampleMap: Record<string, string> = {};
    for (const v of variables) exampleMap[v.key] = v.example;
    return renderWithExamples(content, exampleMap);
  }, [content, variables]);

  return (
    <div
      style={{
        padding: 20,
        background: t.bg,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ fontSize: 11.5, color: t.textDim, fontWeight: 500 }}>Preview no WhatsApp</div>
      <div
        style={{
          background: '#0b141a',
          flex: 1,
          borderRadius: 12,
          padding: 18,
          minHeight: 320,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          backgroundImage:
            'radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)',
          backgroundSize: '14px 14px',
        }}
      >
        <div
          style={{
            background: '#005c4b',
            color: '#e9edef',
            padding: 10,
            borderRadius: 10,
            maxWidth: '90%',
            alignSelf: 'flex-end',
            fontSize: 13,
            lineHeight: 1.45,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            boxShadow: '0 1px 0.5px rgba(0,0,0,0.13)',
          }}
        >
          {mediaUrl && mediaType === 'IMAGE' && (
            <img
              src={mediaUrl}
              alt="preview"
              style={{ display: 'block', maxWidth: '100%', borderRadius: 6, marginBottom: 6 }}
            />
          )}
          {mediaUrl && mediaType === 'VIDEO' && (
            <video
              src={mediaUrl}
              controls
              style={{ display: 'block', maxWidth: '100%', borderRadius: 6, marginBottom: 6 }}
            />
          )}
          {mediaUrl && mediaType === 'AUDIO' && (
            <audio src={mediaUrl} controls style={{ width: '100%', marginBottom: 6 }} />
          )}
          {mediaUrl && mediaType === 'DOCUMENT' && (
            <div
              style={{
                display: 'flex',
                gap: 8,
                background: 'rgba(255,255,255,0.06)',
                padding: 8,
                borderRadius: 6,
                marginBottom: 6,
                fontSize: 12,
              }}
            >
              <Icons.File s={20} c="#e9edef" />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {mediaUrl.split('/').pop()}
              </span>
            </div>
          )}
          <div>{rendered || <span style={{ opacity: 0.5 }}>(sua mensagem aqui)</span>}</div>
          <div style={{ textAlign: 'right', fontSize: 10, color: 'rgba(233,237,239,0.6)', marginTop: 4 }}>
            agora
          </div>
        </div>
      </div>
      <div style={{ fontSize: 11, color: t.textFaint, lineHeight: 1.4 }}>
        Os valores reais (nome do contato, oportunidade, etc.) serão substituídos no momento do envio.
      </div>
    </div>
  );
}

function renderWithExamples(content: string, examples: Record<string, string>): string {
  return content.replace(/\{\{\s*([a-z0-9_]+)\s*(?:\|([^}]*))?\}\}/gi, (_m, raw: string, fb?: string) => {
    const k = raw.toLowerCase();
    return examples[k] ?? fb?.trim() ?? '';
  });
}

// ============================================================
// DELETE
// ============================================================

function DeleteScriptDialog({
  script,
  onClose,
}: {
  script: Script | null;
  onClose: () => void;
}) {
  const remove = useDeleteScript();
  const handleConfirm = async () => {
    if (!script) return;
    try {
      await remove.mutateAsync(script.id);
      toast('Script excluído', 'success');
      onClose();
    } catch (e) {
      toast(axiosMsg(e) || 'Falha ao excluir', 'error');
    }
  };
  return (
    <ConfirmDialog
      open={!!script}
      title={`Excluir script "${script?.name}"?`}
      description={<>Esta ação não pode ser desfeita.</>}
      confirmLabel="Excluir"
      danger
      onClose={onClose}
      onConfirm={handleConfirm}
    />
  );
}

// ============================================================
// HELPERS
// ============================================================

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function axiosMsg(e: unknown): string | null {
  return axios.isAxiosError(e) ? (e.response?.data?.message ?? null) : null;
}
