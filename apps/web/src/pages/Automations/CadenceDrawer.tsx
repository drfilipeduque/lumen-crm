// Drawer largo (800px) pra criar/editar Cadência.
// Seções: Informações, Escopo, Conexão, Comportamento, Mensagens (timeline).

import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useTheme } from '../../lib/ThemeContext';
import { Drawer } from '../../components/ui/Drawer';
import { Switch } from '../../components/ui/Switch';
import { Icons } from '../../components/icons';
import { toast } from '../../components/ui/Toast';
import { usePipelines, usePipeline } from '../../hooks/usePipelines';
import { useTags } from '../../hooks/useTags';
import { useTeam } from '../../hooks/useTeam';
import { useWhatsAppConnections } from '../../hooks/useWhatsApp';
import { useScripts } from '../../hooks/useScripts';
import {
  useCreateCadence,
  useUpdateCadence,
  type Cadence,
  type CadenceMessage,
  type CadenceScope,
  type CadenceUnit,
} from '../../hooks/useCadences';

const SCOPE_OPTIONS: { value: CadenceScope; label: string; hint: string }[] = [
  { value: 'PIPELINE', label: 'Aplicar em todas oportunidades de um funil', hint: 'Auto-start ao criar oportunidade no funil escolhido.' },
  { value: 'STAGE', label: 'Aplicar em uma etapa específica', hint: 'Auto-start ao mover oportunidade para a etapa.' },
  { value: 'OPPORTUNITY', label: 'Aplicar manualmente em oportunidades selecionadas', hint: 'Você dispara via menu na oportunidade.' },
  { value: 'CONTACT', label: 'Aplicar manualmente em contatos selecionados', hint: 'Você dispara via menu no contato.' },
  { value: 'GROUP', label: 'Aplicar em grupo filtrado (tags, responsável, etc.)', hint: 'Auto-start em oportunidades que casam com filtros.' },
];

const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

type EditableMessage = CadenceMessage & { _local: number };

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function defaultMessage(order: number): EditableMessage {
  return {
    _local: Math.random(),
    id: uid(),
    order,
    content: '',
    delay: { value: order === 0 ? 0 : 1, unit: 'days' },
  };
}

export function CadenceDrawer({
  open,
  editing,
  onClose,
}: {
  open: boolean;
  editing: Cadence | null;
  onClose: () => void;
}) {
  const { tokens: t } = useTheme();
  const create = useCreateCadence();
  const update = useUpdateCadence();
  const isEdit = editing !== null;

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [active, setActive] = useState(true);
  const [scope, setScope] = useState<CadenceScope>('PIPELINE');
  const [scopeConfig, setScopeConfig] = useState<Record<string, unknown>>({});
  const [connectionId, setConnectionId] = useState<string>('');
  const [pauseOnReply, setPauseOnReply] = useState(true);
  const [respectBH, setRespectBH] = useState(true);
  const [bhStart, setBhStart] = useState('09:00');
  const [bhEnd, setBhEnd] = useState('18:00');
  const [bhDays, setBhDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [messages, setMessages] = useState<EditableMessage[]>([defaultMessage(0)]);

  const pipelines = usePipelines();
  const selectedPipelineId = (scopeConfig.pipelineId as string | undefined) ?? '';
  const pipelineDetail = usePipeline(scope === 'STAGE' ? selectedPipelineId : null);
  const tags = useTags();
  const team = useTeam();
  const connections = useWhatsAppConnections();
  const scripts = useScripts();

  // Reseta ao abrir.
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setDescription(editing.description ?? '');
      setActive(editing.active);
      setScope(editing.scope);
      setScopeConfig((editing.scopeConfig as Record<string, unknown>) ?? {});
      setConnectionId(editing.connectionId ?? '');
      setPauseOnReply(editing.pauseOnReply);
      setRespectBH(editing.respectBusinessHours);
      setBhStart(editing.businessHoursStart);
      setBhEnd(editing.businessHoursEnd);
      setBhDays(editing.businessDays ?? [1, 2, 3, 4, 5]);
      setMessages(
        (editing.messages ?? []).map((m, i) => ({ ...m, _local: Math.random(), order: i })),
      );
    } else {
      setName('');
      setDescription('');
      setActive(true);
      setScope('PIPELINE');
      setScopeConfig({});
      setConnectionId('');
      setPauseOnReply(true);
      setRespectBH(true);
      setBhStart('09:00');
      setBhEnd('18:00');
      setBhDays([1, 2, 3, 4, 5]);
      setMessages([defaultMessage(0)]);
    }
  }, [open, editing]);

  const stages = pipelineDetail.data?.stages ?? [];

  const canSave = useMemo(() => {
    if (!name.trim()) return false;
    if (scope === 'PIPELINE' && !scopeConfig.pipelineId) return false;
    if (scope === 'STAGE' && (!scopeConfig.pipelineId || !scopeConfig.stageId)) return false;
    if (messages.length === 0) return false;
    if (messages.some((m) => !(m.content?.trim() || m.scriptId))) return false;
    return true;
  }, [name, scope, scopeConfig, messages]);

  const submit = async () => {
    if (!canSave) return toast('Preencha nome, escopo e ao menos 1 mensagem', 'error');
    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      active,
      scope,
      scopeConfig,
      connectionId: connectionId || null,
      pauseOnReply,
      respectBusinessHours: respectBH,
      businessHoursStart: bhStart,
      businessHoursEnd: bhEnd,
      businessDays: bhDays,
      messages: messages.map((m, i) => {
        const { _local: _, ...rest } = m;
        return { ...rest, order: i };
      }),
    };
    try {
      if (isEdit && editing) {
        await update.mutateAsync({ id: editing.id, ...payload });
        toast('Cadência atualizada', 'success');
      } else {
        await create.mutateAsync(payload);
        toast('Cadência criada', 'success');
      }
      onClose();
    } catch (e) {
      const msg = axios.isAxiosError(e) ? e.response?.data?.message : null;
      toast(msg || 'Falha ao salvar', 'error');
    }
  };

  if (!open) return null;

  return (
    <Drawer open={open} onClose={onClose} width={820}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: t.bg, color: t.text }}>
        <div
          style={{
            padding: '20px 24px',
            borderBottom: `1px solid ${t.border}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h2 style={{ fontSize: 16, margin: 0, fontWeight: 600 }}>
            {isEdit ? 'Editar cadência' : 'Nova cadência'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: t.textDim }}
          >
            <Icons.X s={16} c={t.textDim} />
          </button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px 16px', display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Informações */}
          <Section title="Informações">
            <Field label="Nome">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Boas-vindas" style={input(t)} />
            </Field>
            <Field label="Descrição">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Para que serve essa cadência? (opcional)"
                style={{ ...input(t), resize: 'vertical' }}
              />
            </Field>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Switch checked={active} onChange={setActive} ariaLabel="ativa" />
              <span style={{ fontSize: 13 }}>Ativa</span>
            </div>
          </Section>

          {/* Escopo */}
          <Section title="Escopo">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {SCOPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setScope(opt.value);
                    setScopeConfig({});
                  }}
                  style={{
                    textAlign: 'left',
                    padding: '12px 14px',
                    borderRadius: 10,
                    border: `1px solid ${scope === opt.value ? t.gold : t.border}`,
                    background: scope === opt.value ? t.goldFaint : t.bgElevated,
                    color: t.text,
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{opt.label}</div>
                  <div style={{ fontSize: 11, color: t.textDim, marginTop: 2 }}>{opt.hint}</div>
                </button>
              ))}
            </div>

            {/* Config dinâmica por escopo */}
            {scope === 'PIPELINE' || scope === 'STAGE' ? (
              <Field label="Funil">
                <select
                  value={(scopeConfig.pipelineId as string) ?? ''}
                  onChange={(e) =>
                    setScopeConfig((c) => ({ ...c, pipelineId: e.target.value, stageId: undefined }))
                  }
                  style={input(t)}
                >
                  <option value="">— escolha —</option>
                  {(pipelines.data ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}

            {scope === 'STAGE' && selectedPipelineId ? (
              <Field label="Etapa">
                <select
                  value={(scopeConfig.stageId as string) ?? ''}
                  onChange={(e) => setScopeConfig((c) => ({ ...c, stageId: e.target.value }))}
                  style={input(t)}
                >
                  <option value="">— escolha —</option>
                  {stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}

            {scope === 'GROUP' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Field label="Tags (qualquer uma)">
                  <select
                    multiple
                    value={(scopeConfig.tagIds as string[]) ?? []}
                    onChange={(e) =>
                      setScopeConfig((c) => ({
                        ...c,
                        tagIds: Array.from(e.target.selectedOptions).map((o) => o.value),
                      }))
                    }
                    style={{ ...input(t), height: 100 }}
                  >
                    {(tags.data ?? []).map((tg) => (
                      <option key={tg.id} value={tg.id}>
                        {tg.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <Field label="Responsável">
                    <select
                      value={(scopeConfig.ownerId as string) ?? ''}
                      onChange={(e) => setScopeConfig((c) => ({ ...c, ownerId: e.target.value || undefined }))}
                      style={input(t)}
                    >
                      <option value="">— qualquer —</option>
                      {(team.data ?? []).map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Prioridade">
                    <select
                      value={(scopeConfig.priority as string) ?? ''}
                      onChange={(e) => setScopeConfig((c) => ({ ...c, priority: e.target.value || undefined }))}
                      style={input(t)}
                    >
                      <option value="">— qualquer —</option>
                      <option value="LOW">Baixa</option>
                      <option value="MEDIUM">Média</option>
                      <option value="HIGH">Alta</option>
                      <option value="URGENT">Urgente</option>
                    </select>
                  </Field>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <Field label="Valor mín (R$)">
                    <input
                      type="number"
                      value={(scopeConfig.valueMin as number | undefined) ?? ''}
                      onChange={(e) => setScopeConfig((c) => ({ ...c, valueMin: e.target.value ? Number(e.target.value) : undefined }))}
                      style={input(t)}
                    />
                  </Field>
                  <Field label="Valor máx (R$)">
                    <input
                      type="number"
                      value={(scopeConfig.valueMax as number | undefined) ?? ''}
                      onChange={(e) => setScopeConfig((c) => ({ ...c, valueMax: e.target.value ? Number(e.target.value) : undefined }))}
                      style={input(t)}
                    />
                  </Field>
                </div>
              </div>
            ) : null}
          </Section>

          {/* Conexão */}
          <Section title="Conexão WhatsApp">
            <Field label="Conexão (opcional — pode escolher na execução)">
              <select value={connectionId} onChange={(e) => setConnectionId(e.target.value)} style={input(t)}>
                <option value="">— escolher na execução —</option>
                {(connections.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.type === 'OFFICIAL' ? '★ Oficial · ' : '• Não Oficial · '}
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          </Section>

          {/* Comportamento */}
          <Section title="Comportamento">
            <Row>
              <Switch checked={pauseOnReply} onChange={setPauseOnReply} ariaLabel="pausar resposta" />
              <span style={{ fontSize: 13 }}>Pausar quando o lead responder</span>
            </Row>
            <Row>
              <Switch checked={respectBH} onChange={setRespectBH} ariaLabel="horário comercial" />
              <span style={{ fontSize: 13 }}>Respeitar horário comercial</span>
            </Row>
            {respectBH ? (
              <div style={{ paddingLeft: 48, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <Field label="Início" inline>
                    <input
                      type="time"
                      value={bhStart}
                      onChange={(e) => setBhStart(e.target.value)}
                      style={{ ...input(t), width: 120 }}
                    />
                  </Field>
                  <Field label="Fim" inline>
                    <input
                      type="time"
                      value={bhEnd}
                      onChange={(e) => setBhEnd(e.target.value)}
                      style={{ ...input(t), width: 120 }}
                    />
                  </Field>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {DAY_LABELS.map((d, idx) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() =>
                        setBhDays((days) => (days.includes(idx) ? days.filter((x) => x !== idx) : [...days, idx]))
                      }
                      style={{
                        padding: '6px 12px',
                        borderRadius: 8,
                        border: `1px solid ${bhDays.includes(idx) ? t.gold : t.border}`,
                        background: bhDays.includes(idx) ? t.goldFaint : t.bgElevated,
                        color: t.text,
                        fontSize: 11.5,
                        cursor: 'pointer',
                      }}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </Section>

          {/* Mensagens */}
          <Section title="Mensagens">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {messages.map((m, idx) => (
                <MessageCard
                  key={m._local}
                  index={idx}
                  total={messages.length}
                  message={m}
                  scripts={scripts.data ?? []}
                  onChange={(next) =>
                    setMessages((arr) => arr.map((x, i) => (i === idx ? { ...next, _local: x._local } : x)))
                  }
                  onMoveUp={() =>
                    setMessages((arr) => {
                      if (idx === 0) return arr;
                      const a = [...arr];
                      [a[idx - 1]!, a[idx]!] = [a[idx]!, a[idx - 1]!];
                      return a;
                    })
                  }
                  onMoveDown={() =>
                    setMessages((arr) => {
                      if (idx === arr.length - 1) return arr;
                      const a = [...arr];
                      [a[idx]!, a[idx + 1]!] = [a[idx + 1]!, a[idx]!];
                      return a;
                    })
                  }
                  onRemove={() => setMessages((arr) => arr.filter((_, i) => i !== idx))}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => setMessages((arr) => [...arr, defaultMessage(arr.length)])}
              style={{
                ...btnNeutral(t),
                marginTop: 10,
                alignSelf: 'flex-start',
              }}
            >
              <Icons.Plus s={12} c={t.text} /> Adicionar mensagem
            </button>
          </Section>
        </div>

        <div
          style={{
            padding: '14px 24px',
            borderTop: `1px solid ${t.border}`,
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            background: t.bgElevated,
          }}
        >
          <button type="button" onClick={onClose} style={btnNeutral(t)}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSave || create.isPending || update.isPending}
            style={{ ...btnGold(t), opacity: !canSave ? 0.6 : 1 }}
          >
            {create.isPending || update.isPending ? 'Salvando…' : isEdit ? 'Salvar' : 'Criar Cadência'}
          </button>
        </div>
      </div>
    </Drawer>
  );
}

// =================================================================
// MESSAGE CARD
// =================================================================

function MessageCard({
  index,
  total,
  message: m,
  scripts,
  onChange,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  index: number;
  total: number;
  message: EditableMessage;
  scripts: { id: string; name: string }[];
  onChange: (next: EditableMessage) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}) {
  const { tokens: t } = useTheme();
  const [mode, setMode] = useState<'text' | 'script'>(m.scriptId ? 'script' : 'text');

  const headerLabel =
    index === 0
      ? 'Mensagem 1 · Imediato'
      : `Mensagem ${index + 1} · após ${m.delay.value} ${unitLabel(m.delay.unit, m.delay.value)}`;

  return (
    <div
      style={{
        border: `1px solid ${t.border}`,
        borderRadius: 10,
        background: t.bgElevated,
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ fontWeight: 600, fontSize: 12.5, flex: 1 }}>{headerLabel}</div>
        <button
          type="button"
          onClick={onMoveUp}
          disabled={index === 0}
          style={{ ...btnIcon(t), opacity: index === 0 ? 0.4 : 1 }}
          aria-label="Mover acima"
        >
          ↑
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={index === total - 1}
          style={{ ...btnIcon(t), opacity: index === total - 1 ? 0.4 : 1 }}
          aria-label="Mover abaixo"
        >
          ↓
        </button>
        <button
          type="button"
          onClick={onRemove}
          disabled={total === 1}
          style={{ ...btnIcon(t), opacity: total === 1 ? 0.4 : 1, color: '#ef4444' }}
          aria-label="Remover"
        >
          <Icons.Trash s={12} c="#ef4444" />
        </button>
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <ToggleBtn t={t} active={mode === 'text'} onClick={() => setMode('text')}>
          Texto livre
        </ToggleBtn>
        <ToggleBtn t={t} active={mode === 'script'} onClick={() => setMode('script')}>
          Usar Script existente
        </ToggleBtn>
      </div>

      {mode === 'text' ? (
        <textarea
          value={m.content ?? ''}
          onChange={(e) => onChange({ ...m, content: e.target.value, scriptId: undefined })}
          rows={3}
          placeholder="Digite a mensagem… use {{primeiro_nome}}, {{titulo_oportunidade}}, etc."
          style={{ ...input(t), resize: 'vertical' }}
        />
      ) : (
        <select
          value={m.scriptId ?? ''}
          onChange={(e) => onChange({ ...m, scriptId: e.target.value || undefined, content: '' })}
          style={input(t)}
        >
          <option value="">— escolha um script —</option>
          {scripts.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      )}

      {mode === 'text' ? (
        <input
          type="text"
          value={m.mediaUrl ?? ''}
          onChange={(e) => onChange({ ...m, mediaUrl: e.target.value || undefined })}
          placeholder="URL de mídia (opcional)"
          style={input(t)}
        />
      ) : null}

      {/* Delay (não exibido na primeira) */}
      {index > 0 ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: t.textDim }}>Disparar após</span>
          <input
            type="number"
            min={1}
            value={m.delay.value}
            onChange={(e) =>
              onChange({ ...m, delay: { ...m.delay, value: Math.max(0, Number(e.target.value || 0)) } })
            }
            style={{ ...input(t), width: 80 }}
          />
          <select
            value={m.delay.unit}
            onChange={(e) => onChange({ ...m, delay: { ...m.delay, unit: e.target.value as CadenceUnit } })}
            style={{ ...input(t), width: 130 }}
          >
            <option value="minutes">Minutos</option>
            <option value="hours">Horas</option>
            <option value="days">Dias</option>
            <option value="weeks">Semanas</option>
          </select>
          <span style={{ fontSize: 12, color: t.textDim }}>da mensagem anterior</span>
        </div>
      ) : null}
    </div>
  );
}

// =================================================================
// HELPERS
// =================================================================

function unitLabel(u: CadenceUnit, v: number) {
  const plural = v !== 1;
  switch (u) {
    case 'minutes':
      return plural ? 'minutos' : 'minuto';
    case 'hours':
      return plural ? 'horas' : 'hora';
    case 'days':
      return plural ? 'dias' : 'dia';
    case 'weeks':
      return plural ? 'semanas' : 'semana';
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { tokens: t } = useTheme();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h3
        style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: 1,
          margin: 0,
          color: t.textFaint,
        }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

function Field({
  label,
  children,
  inline,
}: {
  label: string;
  children: React.ReactNode;
  inline?: boolean;
}) {
  const { tokens: t } = useTheme();
  return (
    <div style={{ display: 'flex', flexDirection: inline ? 'row' : 'column', gap: 6, alignItems: inline ? 'center' : 'flex-start' }}>
      <label style={{ fontSize: 12, fontWeight: 500, color: t.textDim }}>{label}</label>
      {children}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>{children}</div>;
}

function ToggleBtn({
  t,
  active,
  onClick,
  children,
}: {
  t: ReturnType<typeof useTheme>['tokens'];
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '5px 10px',
        borderRadius: 6,
        border: `1px solid ${active ? t.gold : t.border}`,
        background: active ? t.goldFaint : t.bgInput,
        color: t.text,
        fontSize: 11.5,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

type Tk = ReturnType<typeof useTheme>['tokens'];
const input = (t: Tk) => ({
  width: '100%',
  padding: '9px 12px',
  borderRadius: 8,
  background: t.bgInput,
  color: t.text,
  border: `1px solid ${t.border}`,
  fontSize: 13,
  outline: 'none' as const,
});
const btnGold = (t: Tk) => ({
  display: 'flex' as const,
  alignItems: 'center' as const,
  gap: 6,
  padding: '8px 14px',
  borderRadius: 8,
  background: t.gold,
  color: '#1a1300',
  border: 'none',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer' as const,
});
const btnNeutral = (t: Tk) => ({
  display: 'flex' as const,
  alignItems: 'center' as const,
  gap: 4,
  padding: '7px 12px',
  borderRadius: 8,
  background: t.bgInput,
  color: t.text,
  border: `1px solid ${t.border}`,
  fontSize: 12,
  cursor: 'pointer' as const,
});
const btnIcon = (t: Tk) => ({
  ...btnNeutral(t),
  padding: '4px 8px',
  fontSize: 12,
});
