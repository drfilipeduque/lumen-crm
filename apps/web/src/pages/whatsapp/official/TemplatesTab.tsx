// Lista templates da conexão + editor pra criar/excluir.

import { useMemo, useState, type CSSProperties } from 'react';
import axios from 'axios';
import { useTheme } from '../../../lib/ThemeContext';
import { Modal } from '../../../components/ui/Modal';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { toast } from '../../../components/ui/Toast';
import { Icons } from '../../../components/icons';
import { FONT_STACK } from '../../../lib/theme';
import {
  useCreateTemplate,
  useDeleteTemplate,
  useSyncTemplates,
  useTemplates,
  type CreateTemplateInput,
  type Template,
  type TemplateCategory,
  type TemplateStatus,
} from '../../../hooks/useTemplates';

type StatusFilter = 'ALL' | TemplateStatus;
type CategoryFilter = 'ALL' | TemplateCategory;

export function TemplatesTab({ connectionId }: { connectionId: string }) {
  const { tokens: t } = useTheme();
  const list = useTemplates(connectionId);
  const sync = useSyncTemplates();
  const remove = useDeleteTemplate();
  const [editing, setEditing] = useState<Template | 'new' | null>(null);
  const [confirmDel, setConfirmDel] = useState<Template | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [catFilter, setCatFilter] = useState<CategoryFilter>('ALL');

  const filtered = useMemo(() => {
    const items = list.data ?? [];
    return items.filter(
      (i) =>
        (statusFilter === 'ALL' || i.status === statusFilter) &&
        (catFilter === 'ALL' || i.category === catFilter),
    );
  }, [list.data, statusFilter, catFilter]);

  const handleSync = async () => {
    try {
      const r = await sync.mutateAsync(connectionId);
      toast(`${r.count} template(s) sincronizado(s)`, 'success');
    } catch (e) {
      toast(axiosMsg(e) || 'Falha ao sincronizar', 'error');
    }
  };

  const handleDelete = async () => {
    if (!confirmDel) return;
    try {
      await remove.mutateAsync({ connectionId, templateId: confirmDel.id });
      toast('Template removido', 'success');
      setConfirmDel(null);
    } catch (e) {
      toast(axiosMsg(e) || 'Falha ao remover', 'error');
    }
  };

  return (
    <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" onClick={handleSync} disabled={sync.isPending} style={buttonGhost(t)}>
          {sync.isPending ? 'Sincronizando…' : 'Sincronizar com Meta'}
        </button>
        <div style={{ flex: 1 }} />
        <FilterSelect
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as StatusFilter)}
          options={[
            { value: 'ALL', label: 'Todos status' },
            { value: 'APPROVED', label: 'Aprovado' },
            { value: 'PENDING', label: 'Pendente' },
            { value: 'REJECTED', label: 'Rejeitado' },
          ]}
        />
        <FilterSelect
          value={catFilter}
          onChange={(v) => setCatFilter(v as CategoryFilter)}
          options={[
            { value: 'ALL', label: 'Todas categorias' },
            { value: 'MARKETING', label: 'Marketing' },
            { value: 'UTILITY', label: 'Utility' },
            { value: 'AUTHENTICATION', label: 'Authentication' },
          ]}
        />
        <button type="button" onClick={() => setEditing('new')} style={buttonGold(t)}>
          <Icons.Plus s={12} c="#1a1300" /> Novo template
        </button>
      </div>

      {/* List */}
      {list.isLoading ? (
        <div style={{ color: t.textDim, fontSize: 12.5 }}>Carregando…</div>
      ) : filtered.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: 40,
            background: t.bgElevated,
            border: `1px dashed ${t.border}`,
            borderRadius: 10,
            fontSize: 13,
            color: t.textSubtle,
          }}
        >
          {(list.data?.length ?? 0) === 0
            ? 'Nenhum template ainda. Sincronize com a Meta ou crie um novo.'
            : 'Nenhum template com esse filtro.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 10 }}>
          {filtered.map((tmpl) => (
            <TemplateCard
              key={tmpl.id}
              tmpl={tmpl}
              onView={() => setEditing(tmpl)}
              onDelete={() => setConfirmDel(tmpl)}
            />
          ))}
        </div>
      )}

      {editing && (
        <TemplateEditor
          connectionId={connectionId}
          template={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}

      <ConfirmDialog
        open={confirmDel !== null}
        title="Remover template?"
        description={
          <>
            <strong>{confirmDel?.name}</strong> será removido daqui e da Meta. Templates aprovados
            não podem ser recriados com o mesmo nome por 30 dias.
          </>
        }
        confirmLabel="Remover"
        danger
        onConfirm={handleDelete}
        onClose={() => setConfirmDel(null)}
      />
    </div>
  );
}

// =====================================================================
// CARD
// =====================================================================

function TemplateCard({
  tmpl,
  onView,
  onDelete,
}: {
  tmpl: Template;
  onView: () => void;
  onDelete: () => void;
}) {
  const { tokens: t } = useTheme();
  const sc = statusInfo(tmpl.status);

  return (
    <div
      style={{
        padding: 14,
        background: t.bgElevated,
        border: `1px solid ${t.border}`,
        borderRadius: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div
          style={{
            fontSize: 13.5,
            fontWeight: 600,
            color: t.text,
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontFamily: 'ui-monospace, monospace',
          }}
        >
          {tmpl.name}
        </div>
        <span
          style={{
            fontSize: 9.5,
            padding: '2px 6px',
            borderRadius: 999,
            background: hexAlpha(sc.color, 0.15),
            color: sc.color,
            fontWeight: 600,
            letterSpacing: 0.4,
            textTransform: 'uppercase',
          }}
        >
          {sc.label}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 5 }}>
        <Badge color="#94a3b8" label={tmpl.category} />
        <Badge color="#94a3b8" label={tmpl.language} />
      </div>

      <div
        style={{
          fontSize: 11.5,
          color: t.textDim,
          lineHeight: 1.5,
          maxHeight: 60,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
        }}
      >
        {tmpl.body}
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
        <button type="button" onClick={onView} style={{ ...buttonGhost(t), flex: 1, justifyContent: 'center' }}>
          Visualizar
        </button>
        <button
          type="button"
          onClick={onDelete}
          style={{
            background: 'transparent',
            border: `1px solid ${hexAlpha('#f85149', 0.4)}`,
            color: t.danger,
            borderRadius: 7,
            padding: '7px 10px',
            fontSize: 11.5,
            cursor: 'pointer',
            fontFamily: FONT_STACK,
          }}
          title="Remover"
        >
          <Icons.Trash s={12} />
        </button>
      </div>
    </div>
  );
}

function Badge({ color, label }: { color: string; label: string }) {
  return (
    <span
      style={{
        fontSize: 9.5,
        padding: '2px 6px',
        borderRadius: 4,
        background: hexAlpha(color, 0.15),
        color,
        fontWeight: 600,
        letterSpacing: 0.4,
        textTransform: 'uppercase',
      }}
    >
      {label}
    </span>
  );
}

// =====================================================================
// EDITOR
// =====================================================================

function TemplateEditor({
  connectionId,
  template,
  onClose,
}: {
  connectionId: string;
  template: Template | null;
  onClose: () => void;
}) {
  const { tokens: t } = useTheme();
  const create = useCreateTemplate();
  const isEditing = !!template; // só leitura quando já existe

  const [name, setName] = useState(template?.name ?? '');
  const [category, setCategory] = useState<TemplateCategory>(template?.category ?? 'UTILITY');
  const [language, setLanguage] = useState(template?.language ?? 'pt_BR');
  const [headerText, setHeaderText] = useState(
    typeof template?.header?.text === 'string' ? template.header.text : '',
  );
  const [body, setBody] = useState(template?.body ?? '');
  const [footer, setFooter] = useState(template?.footer ?? '');
  const [examples, setExamples] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);

  const variables = useMemo(() => {
    const m = body.match(/\{\{\d+\}\}/g);
    return Array.from(new Set(m ?? [])).sort();
  }, [body]);

  const insertVariable = () => {
    const next = (variables.length || 0) + 1;
    const token = `{{${next}}}`;
    setBody((b) => `${b}${b.endsWith(' ') || b === '' ? '' : ' '}${token}`);
  };

  const renderedBody = useMemo(() => {
    let r = body;
    for (const v of variables) {
      const idx = v.replace(/[{}]/g, '');
      r = r.replaceAll(v, examples[idx] || v);
    }
    return r;
  }, [body, variables, examples]);

  const submit = async () => {
    setErr(null);
    if (!name.trim()) return setErr('Informe o nome');
    if (!body.trim()) return setErr('Informe o corpo');
    const input: CreateTemplateInput = {
      name: name.trim().toLowerCase(),
      category,
      language: language.trim(),
      body: body.trim(),
      header: headerText.trim() ? { format: 'TEXT', text: headerText.trim() } : null,
      footer: footer.trim() || null,
    };
    try {
      await create.mutateAsync({ connectionId, input });
      toast('Template enviado pra aprovação', 'success');
      onClose();
    } catch (e) {
      setErr(axiosMsg(e) || 'Falha ao criar');
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={isEditing ? `Template — ${template!.name}` : 'Novo template'}
      width={860}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, alignItems: 'flex-start' }}>
        {/* ESQUERDA — Edição */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="Nome (slug, sem espaços)">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isEditing}
              placeholder="boas_vindas_clinica"
              style={{ ...inputStyle(t), fontFamily: 'ui-monospace, monospace' }}
            />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 12 }}>
            <Field label="Categoria">
              <div style={{ display: 'flex', gap: 6 }}>
                {(['MARKETING', 'UTILITY', 'AUTHENTICATION'] as TemplateCategory[]).map((c) => {
                  const active = category === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      disabled={isEditing}
                      onClick={() => setCategory(c)}
                      style={{
                        flex: 1,
                        padding: '8px 6px',
                        background: active ? t.gold : t.bgInput,
                        color: active ? '#1a1300' : t.text,
                        border: `1px solid ${active ? t.gold : t.border}`,
                        borderRadius: 6,
                        fontSize: 11.5,
                        fontWeight: 600,
                        cursor: isEditing ? 'default' : 'pointer',
                        fontFamily: FONT_STACK,
                      }}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
            </Field>
            <Field label="Idioma">
              <input
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                disabled={isEditing}
                style={inputStyle(t)}
              />
            </Field>
          </div>

          <Field label="Header (opcional, texto)">
            <input
              value={headerText}
              onChange={(e) => setHeaderText(e.target.value)}
              disabled={isEditing}
              placeholder="Olá, {{1}}!"
              style={inputStyle(t)}
            />
          </Field>

          <Field label="Body">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={isEditing}
              rows={6}
              style={{ ...inputStyle(t), resize: 'vertical', minHeight: 130, lineHeight: 1.5 }}
              placeholder="Olá {{1}}, sua consulta foi confirmada para {{2}}."
            />
            {!isEditing && (
              <button
                type="button"
                onClick={insertVariable}
                style={{
                  marginTop: 6,
                  background: 'transparent',
                  border: `1px dashed ${t.border}`,
                  borderRadius: 6,
                  padding: '5px 10px',
                  fontSize: 11,
                  color: t.gold,
                  cursor: 'pointer',
                  fontFamily: 'ui-monospace, monospace',
                }}
              >
                + Inserir variável {`{{${variables.length + 1}}}`}
              </button>
            )}
          </Field>

          <Field label="Footer (opcional)">
            <input
              value={footer}
              onChange={(e) => setFooter(e.target.value)}
              disabled={isEditing}
              maxLength={60}
              placeholder="Lumen Clínica"
              style={inputStyle(t)}
            />
          </Field>

          {variables.length > 0 && !isEditing && (
            <Field label="Exemplos pra preview">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {variables.map((v) => {
                  const idx = v.replace(/[{}]/g, '');
                  return (
                    <div key={v} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <code style={{ fontSize: 11, color: t.gold, fontFamily: 'ui-monospace, monospace', minWidth: 40 }}>
                        {v}
                      </code>
                      <input
                        value={examples[idx] ?? ''}
                        onChange={(e) => setExamples((prev) => ({ ...prev, [idx]: e.target.value }))}
                        placeholder="Maria"
                        style={inputStyle(t)}
                      />
                    </div>
                  );
                })}
              </div>
            </Field>
          )}

          {err && (
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
              {err}
            </div>
          )}
        </div>

        {/* DIREITA — Preview */}
        <div>
          <div style={{ fontSize: 11, color: t.textFaint, letterSpacing: 0.4, textTransform: 'uppercase', fontWeight: 500, marginBottom: 8 }}>
            Preview
          </div>
          <div
            style={{
              background: '#0c1410',
              padding: 16,
              borderRadius: 12,
              minHeight: 280,
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'flex-start',
            }}
          >
            <div
              style={{
                background: '#005c4b',
                color: '#fff',
                padding: '8px 10px',
                borderRadius: '12px 12px 12px 4px',
                maxWidth: '95%',
                fontSize: 12.5,
                lineHeight: 1.45,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {headerText && (
                <div style={{ fontWeight: 700, marginBottom: 4 }}>
                  {headerText.replace(/\{\{(\d+)\}\}/g, (_m, idx) => examples[idx] || `{{${idx}}}`)}
                </div>
              )}
              <div>{renderedBody || <span style={{ color: '#7d9b95' }}>Body aparece aqui…</span>}</div>
              {footer && (
                <div style={{ fontSize: 10.5, color: '#7d9b95', marginTop: 6 }}>{footer}</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
        <button type="button" onClick={onClose} style={buttonGhost(t)}>
          {isEditing ? 'Fechar' : 'Cancelar'}
        </button>
        {!isEditing && (
          <button
            type="button"
            onClick={submit}
            disabled={create.isPending}
            style={{ ...buttonGold(t), opacity: create.isPending ? 0.6 : 1 }}
          >
            {create.isPending ? 'Enviando…' : 'Enviar para aprovação'}
          </button>
        )}
      </div>
    </Modal>
  );
}

// =====================================================================
// PRIMITIVES
// =====================================================================

function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const { tokens: t } = useTheme();
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        background: t.bgInput,
        color: t.text,
        border: `1px solid ${t.border}`,
        borderRadius: 7,
        padding: '7px 10px',
        fontSize: 12,
        fontFamily: FONT_STACK,
        cursor: 'pointer',
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

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

function statusInfo(s: TemplateStatus): { label: string; color: string } {
  if (s === 'APPROVED') return { label: 'Aprovado', color: '#22c55e' };
  if (s === 'PENDING') return { label: 'Pendente', color: '#f59e0b' };
  return { label: 'Rejeitado', color: '#f85149' };
}

function inputStyle(t: ReturnType<typeof useTheme>['tokens']): CSSProperties {
  return {
    width: '100%',
    background: t.bgInput,
    border: `1px solid ${t.border}`,
    borderRadius: 8,
    padding: '8px 11px',
    fontSize: 12.5,
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
    borderRadius: 7,
    padding: '8px 14px',
    fontSize: 12,
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
    borderRadius: 7,
    padding: '7px 12px',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: FONT_STACK,
  };
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
