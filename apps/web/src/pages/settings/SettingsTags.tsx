import { useEffect, useState } from 'react';
import axios from 'axios';
import { useTheme } from '../../lib/ThemeContext';
import { Modal } from '../../components/ui/Modal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { toast } from '../../components/ui/Toast';
import { Icons } from '../../components/icons';
import { FONT_STACK } from '../../lib/theme';
import { useCreateTag, useDeleteTag, useTags, useUpdateTag, type Tag } from '../../hooks/useTags';

const PALETTE = [
  '#D4AF37', '#a855f7', '#ec4899', '#eab308',
  '#3b82f6', '#22c55e', '#f97316', '#ef4444',
  '#06b6d4', '#7c5dfa', '#10b981', '#94a3b8',
];

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

export function SettingsTags() {
  const { tokens: t } = useTheme();
  const tags = useTags();
  const [editing, setEditing] = useState<Tag | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<{ tag: Tag; force: boolean } | null>(null);
  const deleteTag = useDeleteTag();

  const handleDeleteClick = (tag: Tag) => {
    setDeleting({ tag, force: tag.usageCount > 0 });
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await deleteTag.mutateAsync({ id: deleting.tag.id, force: deleting.force });
      toast(`Tag "${deleting.tag.name}" excluída`, 'success');
      setDeleting(null);
    } catch (e) {
      const msg = axios.isAxiosError(e) ? e.response?.data?.message : null;
      toast(msg || 'Falha ao excluir', 'error');
    }
  };

  return (
    <div style={{ padding: '28px 32px 40px', color: t.text }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 600, letterSpacing: -0.4, margin: 0, color: t.text }}>
            Tags
          </h2>
          <div style={{ fontSize: 13, color: t.textDim, marginTop: 4 }}>
            Categorize seus leads com etiquetas coloridas.
          </div>
        </div>
        <button type="button" onClick={() => setCreating(true)} style={buttonGold(t)}>
          <Icons.Plus s={12} c="#1a1300" /> Nova tag
        </button>
      </div>

      {tags.isLoading ? (
        <Skeleton t={t} />
      ) : !tags.data || tags.data.length === 0 ? (
        <Empty t={t} onCreate={() => setCreating(true)} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {tags.data.map((tag) => (
            <TagCard key={tag.id} tag={tag} onEdit={() => setEditing(tag)} onDelete={() => handleDeleteClick(tag)} />
          ))}
        </div>
      )}

      <TagModal
        open={creating || editing !== null}
        tag={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        title={deleting?.force ? 'Excluir tag em uso?' : 'Excluir tag?'}
        description={
          deleting?.force ? (
            <>
              <strong>{deleting.tag.name}</strong> está em uso por{' '}
              <strong>{deleting.tag.usageCount}</strong> oportunidade(s). Confirmando, ela será
              removida de todas e excluída permanentemente.
            </>
          ) : (
            <>
              Tem certeza que deseja excluir <strong>{deleting?.tag.name}</strong>?
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

function TagCard({ tag, onEdit, onDelete }: { tag: Tag; onEdit: () => void; onDelete: () => void }) {
  const { tokens: t } = useTheme();
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: t.bgElevated,
        border: `1px solid ${hover ? t.borderStrong : t.border}`,
        borderRadius: 12,
        padding: 14,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        transition: 'border-color 120ms ease',
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          padding: '5px 12px',
          background: hexAlpha(tag.color, 0.14),
          color: tag.color,
          border: `1px solid ${hexAlpha(tag.color, 0.4)}`,
          borderRadius: 999,
          fontSize: 12.5,
          fontWeight: 500,
          flexShrink: 0,
        }}
      >
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: tag.color }} />
        {tag.name}
      </span>
      <div style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: t.textSubtle }}>
        {tag.usageCount === 0
          ? 'Sem uso'
          : `Em ${tag.usageCount} oportunidade${tag.usageCount > 1 ? 's' : ''}`}
      </div>
      <div
        style={{
          display: 'flex',
          gap: 4,
          opacity: hover ? 1 : 0,
          transition: 'opacity 120ms ease',
        }}
      >
        <IconButton title="Editar" onClick={onEdit}>
          <Icons.Edit s={13} c={t.textDim} />
        </IconButton>
        <IconButton title="Excluir" onClick={onDelete}>
          <Icons.Trash s={13} c={t.danger} />
        </IconButton>
      </div>
    </div>
  );
}

function IconButton({
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

function TagModal({ open, tag, onClose }: { open: boolean; tag: Tag | null; onClose: () => void }) {
  const { tokens: t } = useTheme();
  const create = useCreateTag();
  const update = useUpdateTag();

  const [name, setName] = useState(tag?.name ?? '');
  const [color, setColor] = useState(tag?.color ?? PALETTE[0]!);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(tag?.name ?? '');
      setColor(tag?.color ?? PALETTE[0]!);
      setError(null);
    }
  }, [open, tag]);

  const colorValid = HEX_RE.test(color);
  const nameValid = name.trim().length > 0 && name.trim().length <= 50;
  const canSave = colorValid && nameValid && !create.isPending && !update.isPending;

  const submit = async () => {
    if (!canSave) return;
    setError(null);
    try {
      if (tag) {
        await update.mutateAsync({ id: tag.id, name: name.trim(), color });
        toast('Tag atualizada', 'success');
      } else {
        await create.mutateAsync({ name: name.trim(), color });
        toast('Tag criada', 'success');
      }
      onClose();
    } catch (e) {
      const msg = axios.isAxiosError(e) ? e.response?.data?.message : null;
      setError(msg || 'Falha ao salvar');
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={tag ? 'Editar tag' : 'Nova tag'}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <Label t={t}>Nome</Label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={50}
            style={inputStyle(t)}
            placeholder="Ex.: Botox"
          />
        </div>

        <div>
          <Label t={t}>Cor</Label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`Cor ${c}`}
                style={{
                  height: 32,
                  borderRadius: 8,
                  background: c,
                  border:
                    color.toLowerCase() === c.toLowerCase()
                      ? `2px solid ${t.text}`
                      : `1px solid ${t.border}`,
                  cursor: 'pointer',
                  padding: 0,
                }}
              />
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
            <input
              value={color}
              onChange={(e) => setColor(e.target.value.startsWith('#') ? e.target.value : '#' + e.target.value)}
              maxLength={7}
              style={{ ...inputStyle(t), width: 110, fontFamily: '"SF Mono", monospace' }}
            />
            <span style={{ fontSize: 11, color: t.textFaint }}>
              {colorValid ? '' : 'use #RRGGBB'}
            </span>
          </div>
        </div>

        <div>
          <Label t={t}>Pré-visualização</Label>
          <div style={{ padding: '12px 14px', background: t.bgInput, borderRadius: 8, border: `1px solid ${t.border}` }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                padding: '6px 14px',
                background: colorValid ? hexAlpha(color, 0.14) : t.bgHover,
                color: colorValid ? color : t.textSubtle,
                border: `1px solid ${colorValid ? hexAlpha(color, 0.4) : t.border}`,
                borderRadius: 999,
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: colorValid ? color : t.textSubtle,
                }}
              />
              {name.trim() || 'Nome da tag'}
            </span>
          </div>
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

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
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
            {create.isPending || update.isPending ? 'Salvando…' : tag ? 'Salvar' : 'Criar'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ============================================================
// HELPERS
// ============================================================

function Skeleton({ t }: { t: ReturnType<typeof useTheme>['tokens'] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          style={{
            background: t.bgElevated,
            border: `1px solid ${t.border}`,
            borderRadius: 12,
            height: 56,
            opacity: 0.6,
            animation: 'lumen-pulse 1.4s ease-in-out infinite',
          }}
        />
      ))}
      <style>{`@keyframes lumen-pulse { 0%, 100% { opacity: 0.5 } 50% { opacity: 0.85 } }`}</style>
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
      <div style={{ fontSize: 14, color: t.text, marginBottom: 6 }}>Nenhuma tag ainda</div>
      <div style={{ fontSize: 12.5, color: t.textSubtle, marginBottom: 16 }}>
        Crie etiquetas pra agrupar seus leads por procedimento, prioridade ou origem.
      </div>
      <button type="button" onClick={onCreate} style={buttonGold(t)}>
        <Icons.Plus s={12} c="#1a1300" /> Criar primeira tag
      </button>
    </div>
  );
}

function hexAlpha(hex: string, alpha: number): string {
  if (!HEX_RE.test(hex)) return `rgba(128,128,128,${alpha})`;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
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
