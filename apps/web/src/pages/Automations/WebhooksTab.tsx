// Sub-aba "Webhooks" — duas seções (OUTBOUND e INBOUND).

import { useEffect, useState } from 'react';
import axios from 'axios';
import { useTheme } from '../../lib/ThemeContext';
import { Modal } from '../../components/ui/Modal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Switch } from '../../components/ui/Switch';
import { Icons } from '../../components/icons';
import { toast } from '../../components/ui/Toast';
import {
  useCreateWebhook,
  useDeleteWebhook,
  useRotateWebhookToken,
  useTestWebhook,
  useToggleWebhook,
  useUpdateWebhook,
  useWebhooks,
  type Webhook,
  type WebhookType,
} from '../../hooks/useWebhooks';

const OUTBOUND_EVENTS = [
  'opportunity.created',
  'opportunity.updated',
  'opportunity.stage_changed',
  'opportunity.won',
  'opportunity.lost',
  'opportunity.tag_added',
  'opportunity.tag_removed',
  'opportunity.owner_changed',
  'opportunity.field_updated',
  'opportunity.priority_changed',
  'opportunity.value_changed',
  'opportunity.deleted',
  'contact.created',
  'contact.updated',
  'message.received',
  'message.sent',
  'reminder.created',
  'reminder.completed',
  'automation.executed',
  'cadence.completed',
];

const INBOUND_ACTIONS: { value: string; label: string }[] = [
  { value: 'create_opportunity', label: 'Criar oportunidade' },
  { value: 'create_contact', label: 'Criar contato' },
  { value: 'trigger_automation', label: 'Disparar automação' },
  { value: 'add_tag', label: 'Adicionar tag' },
  { value: 'add_note', label: 'Adicionar nota' },
];

export function WebhooksTab() {
  const { tokens: t } = useTheme();
  const [section, setSection] = useState<WebhookType>('OUTBOUND');

  return (
    <div style={{ padding: '20px 32px 40px' }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 18 }}>
        <SubTab t={t} active={section === 'OUTBOUND'} onClick={() => setSection('OUTBOUND')}>
          Saída (OUTBOUND)
        </SubTab>
        <SubTab t={t} active={section === 'INBOUND'} onClick={() => setSection('INBOUND')}>
          Entrada (INBOUND)
        </SubTab>
      </div>
      {section === 'OUTBOUND' ? <OutboundSection /> : <InboundSection />}
    </div>
  );
}

function SubTab({
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
        padding: '8px 14px',
        borderRadius: 7,
        background: active ? t.goldFaint : 'transparent',
        color: active ? t.text : t.textDim,
        border: `1px solid ${active ? t.gold : t.border}`,
        fontSize: 12.5,
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

// =================================================================
// OUTBOUND
// =================================================================

function OutboundSection() {
  const { tokens: t } = useTheme();
  const list = useWebhooks('OUTBOUND');
  const [editing, setEditing] = useState<Webhook | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Webhook | null>(null);
  const del = useDeleteWebhook();

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: t.text }}>Webhooks de Saída</h3>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={() => setCreating(true)} style={btnGold(t)}>
          <Icons.Plus s={12} c="#1a1300" /> Novo Webhook
        </button>
      </div>

      {list.isLoading ? (
        <div style={{ color: t.textFaint, fontSize: 13 }}>Carregando…</div>
      ) : !list.data || list.data.length === 0 ? (
        <Empty t={t} text="Nenhum webhook de saída ainda." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {list.data.map((w) => (
            <OutboundCard
              key={w.id}
              webhook={w}
              onEdit={() => setEditing(w)}
              onDelete={() => setDeleting(w)}
            />
          ))}
        </div>
      )}

      <OutboundEditor
        open={creating || editing !== null}
        editing={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        title="Remover webhook?"
        description={`"${deleting?.name}" — esta ação não pode ser desfeita.`}
        confirmLabel="Remover"
        danger
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await del.mutateAsync(deleting.id);
            toast(`"${deleting.name}" removido`, 'success');
          } catch {
            toast('Falha ao remover', 'error');
          }
          setDeleting(null);
        }}
      />
    </div>
  );
}

function OutboundCard({
  webhook: w,
  onEdit,
  onDelete,
}: {
  webhook: Webhook;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { tokens: t } = useTheme();
  const toggle = useToggleWebhook();
  const test = useTestWebhook();

  const onTest = async () => {
    try {
      const r = await test.mutateAsync({ id: w.id });
      if (r.ok) toast(`OK — HTTP ${r.status} (${r.durationMs}ms)`, 'success');
      else toast(`Falhou: ${r.error ?? 'HTTP ' + r.status}`, 'error');
    } catch {
      toast('Erro no teste', 'error');
    }
  };

  return (
    <div
      style={{
        border: `1px solid ${t.border}`,
        borderRadius: 10,
        background: t.bgElevated,
        padding: 14,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: t.text }}>{w.name}</div>
        <div
          style={{
            fontSize: 11,
            color: t.textDim,
            marginTop: 2,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            fontFamily: 'monospace',
          }}
        >
          {w.method ?? 'POST'} {w.url ?? ''}
        </div>
        <div style={{ marginTop: 8, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {(w.events ?? []).slice(0, 4).map((ev) => (
            <span
              key={ev}
              style={{
                fontSize: 10,
                padding: '2px 7px',
                borderRadius: 999,
                background: t.bgInput,
                border: `1px solid ${t.border}`,
                color: t.textDim,
                fontFamily: 'monospace',
              }}
            >
              {ev}
            </span>
          ))}
          {(w.events ?? []).length > 4 ? (
            <span style={{ fontSize: 10, color: t.textFaint }}>+{(w.events ?? []).length - 4}</span>
          ) : null}
        </div>
      </div>
      <Switch checked={w.active} onChange={() => toggle.mutateAsync(w.id)} ariaLabel="ativar" />
      <div style={{ display: 'flex', gap: 4 }}>
        <button type="button" onClick={onTest} disabled={test.isPending} style={btnNeutral(t)}>
          {test.isPending ? '…' : 'Testar'}
        </button>
        <button type="button" onClick={onEdit} style={btnNeutral(t)}>
          <Icons.Edit s={12} c={t.text} />
        </button>
        <button type="button" onClick={onDelete} style={{ ...btnNeutral(t), color: '#ef4444' }}>
          <Icons.Trash s={12} c="#ef4444" />
        </button>
      </div>
    </div>
  );
}

function OutboundEditor({
  open,
  editing,
  onClose,
}: {
  open: boolean;
  editing: Webhook | null;
  onClose: () => void;
}) {
  const { tokens: t } = useTheme();
  const create = useCreateWebhook();
  const update = useUpdateWebhook();
  const test = useTestWebhook();
  const isEdit = editing !== null;

  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [method, setMethod] = useState<'POST' | 'PUT' | 'PATCH' | 'GET' | 'DELETE'>('POST');
  const [headers, setHeaders] = useState<{ key: string; value: string }[]>([]);
  const [events, setEvents] = useState<Set<string>>(new Set());
  const [payload, setPayload] = useState('{}');
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setUrl(editing.url ?? '');
      setMethod((editing.method as 'POST' | 'PUT' | 'PATCH' | 'GET' | 'DELETE' | undefined) ?? 'POST');
      setHeaders(Object.entries(editing.headers ?? {}).map(([key, value]) => ({ key, value })));
      setEvents(new Set(editing.events ?? []));
      setPayload(JSON.stringify(editing.payloadTemplate ?? null, null, 2));
      setActive(editing.active);
    } else {
      setName('');
      setUrl('');
      setMethod('POST');
      setHeaders([]);
      setEvents(new Set());
      setPayload('{\n  "event": "{{eventType}}",\n  "data": "{{event}}"\n}');
      setActive(true);
    }
  }, [open, editing]);

  if (!open) return null;

  const submit = async () => {
    if (!name.trim() || !url.trim()) return toast('Nome e URL obrigatórios', 'error');
    if (events.size === 0) return toast('Selecione pelo menos 1 evento', 'error');
    let parsedPayload: unknown = null;
    try {
      parsedPayload = JSON.parse(payload);
    } catch {
      toast('Payload JSON inválido', 'error');
      return;
    }
    const headersObj: Record<string, string> = {};
    for (const h of headers) {
      if (h.key.trim()) headersObj[h.key.trim()] = h.value;
    }
    const body = {
      type: 'OUTBOUND' as const,
      name: name.trim(),
      url: url.trim(),
      method,
      headers: headersObj,
      events: [...events],
      payloadTemplate: parsedPayload,
      active,
    };
    try {
      if (isEdit && editing) {
        await update.mutateAsync({ id: editing.id, ...body });
        toast('Webhook atualizado', 'success');
      } else {
        await create.mutateAsync(body);
        toast('Webhook criado', 'success');
      }
      onClose();
    } catch (e) {
      const msg = axios.isAxiosError(e) ? e.response?.data?.message : null;
      toast(msg || 'Falha ao salvar', 'error');
    }
  };

  const onTest = async () => {
    if (!isEdit || !editing) return toast('Salve primeiro pra testar', 'info');
    try {
      const r = await test.mutateAsync({ id: editing.id });
      if (r.ok) toast(`OK — HTTP ${r.status}`, 'success');
      else toast(`Falhou: ${r.error ?? 'HTTP ' + r.status}`, 'error');
    } catch {
      toast('Erro no teste', 'error');
    }
  };

  const insertVar = (token: string) => setPayload((s) => s + token);

  return (
    <Modal open onClose={onClose} title={isEdit ? 'Editar webhook' : 'Novo webhook (saída)'} width={620}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Nome">
          <input value={name} onChange={(e) => setName(e.target.value)} style={input(t)} />
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 10 }}>
          <Field label="URL">
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" style={input(t)} />
          </Field>
          <Field label="Método">
            <select value={method} onChange={(e) => setMethod(e.target.value as typeof method)} style={input(t)}>
              {['POST', 'PUT', 'PATCH', 'GET', 'DELETE'].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field
          label="Headers"
          action={
            <button
              type="button"
              onClick={() => setHeaders((h) => [...h, { key: '', value: '' }])}
              style={linkBtn(t)}
            >
              + adicionar
            </button>
          }
        >
          {headers.length === 0 ? (
            <div style={{ fontSize: 11, color: t.textFaint }}>Nenhum header</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {headers.map((h, i) => (
                <div key={i} style={{ display: 'flex', gap: 6 }}>
                  <input
                    value={h.key}
                    onChange={(e) => {
                      const v = e.target.value;
                      setHeaders((arr) => arr.map((x, idx) => (idx === i ? { ...x, key: v } : x)));
                    }}
                    placeholder="X-Foo"
                    style={{ ...input(t), flex: 1 }}
                  />
                  <input
                    value={h.value}
                    onChange={(e) => {
                      const v = e.target.value;
                      setHeaders((arr) => arr.map((x, idx) => (idx === i ? { ...x, value: v } : x)));
                    }}
                    placeholder="valor"
                    style={{ ...input(t), flex: 2 }}
                  />
                  <button
                    type="button"
                    onClick={() => setHeaders((arr) => arr.filter((_, idx) => idx !== i))}
                    style={{ ...btnNeutral(t), color: '#ef4444' }}
                  >
                    <Icons.X s={11} c="#ef4444" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Field>

        <Field label="Eventos">
          <div
            style={{
              border: `1px solid ${t.border}`,
              borderRadius: 8,
              background: t.bgInput,
              maxHeight: 160,
              overflow: 'auto',
              padding: 6,
            }}
          >
            {OUTBOUND_EVENTS.map((ev) => (
              <label
                key={ev}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '3px 4px',
                  fontSize: 11.5,
                  cursor: 'pointer',
                  fontFamily: 'monospace',
                  color: t.text,
                }}
              >
                <input
                  type="checkbox"
                  checked={events.has(ev)}
                  onChange={() =>
                    setEvents((s) => {
                      const n = new Set(s);
                      if (n.has(ev)) n.delete(ev);
                      else n.add(ev);
                      return n;
                    })
                  }
                  style={{ accentColor: t.gold }}
                />
                {ev}
              </label>
            ))}
          </div>
        </Field>

        <Field
          label="Payload (JSON com {{vars}})"
          action={
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" onClick={() => insertVar('{{eventType}}')} style={linkBtn(t)}>
                {'{{eventType}}'}
              </button>
              <button type="button" onClick={() => insertVar('{{event}}')} style={linkBtn(t)}>
                {'{{event}}'}
              </button>
              <button type="button" onClick={() => insertVar('{{entityId}}')} style={linkBtn(t)}>
                {'{{entityId}}'}
              </button>
            </div>
          }
        >
          <textarea
            value={payload}
            onChange={(e) => setPayload(e.target.value)}
            rows={6}
            spellCheck={false}
            style={{ ...input(t), fontFamily: 'monospace', fontSize: 11.5, resize: 'vertical' }}
          />
        </Field>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Switch checked={active} onChange={setActive} ariaLabel="ativo" />
          <span style={{ fontSize: 13 }}>Ativo</span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
          <button type="button" onClick={onTest} disabled={!isEdit || test.isPending} style={{ ...btnNeutral(t), opacity: !isEdit ? 0.5 : 1 }}>
            {test.isPending ? 'Testando…' : 'Testar disparo'}
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={onClose} style={btnNeutral(t)}>
              Cancelar
            </button>
            <button type="button" onClick={submit} style={btnGold(t)}>
              Salvar
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// =================================================================
// INBOUND
// =================================================================

function InboundSection() {
  const { tokens: t } = useTheme();
  const list = useWebhooks('INBOUND');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Webhook | null>(null);
  const [deleting, setDeleting] = useState<Webhook | null>(null);
  const [showCreated, setShowCreated] = useState<{ webhook: Webhook; token: string } | null>(null);
  const [rotating, setRotating] = useState<Webhook | null>(null);
  const del = useDeleteWebhook();

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: t.text }}>Webhooks de Entrada</h3>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={() => setCreating(true)} style={btnGold(t)}>
          <Icons.Plus s={12} c="#1a1300" /> Novo Webhook de Entrada
        </button>
      </div>

      {list.isLoading ? (
        <div style={{ color: t.textFaint, fontSize: 13 }}>Carregando…</div>
      ) : !list.data || list.data.length === 0 ? (
        <Empty t={t} text="Nenhum webhook de entrada ainda." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {list.data.map((w) => (
            <InboundCard
              key={w.id}
              webhook={w}
              onEdit={() => setEditing(w)}
              onDelete={() => setDeleting(w)}
              onRotate={() => setRotating(w)}
            />
          ))}
        </div>
      )}

      <InboundEditor
        open={creating || editing !== null}
        editing={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onCreatedToken={(webhook, token) => setShowCreated({ webhook, token })}
      />

      {showCreated ? (
        <Modal open onClose={() => setShowCreated(null)} title="Webhook criado" width={460}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 12, color: t.textDim }}>
              Anote o token agora — ele só será exibido uma vez. Use cabeçalho{' '}
              <code style={{ background: t.bgInput, padding: '2px 4px', borderRadius: 3 }}>X-Auth-Token</code>.
            </div>
            <CopyField t={t} label="URL única" value={`/api/webhooks/inbound/${showCreated.webhook.uniqueUrl ?? ''}`} />
            <CopyField t={t} label="Token (anote agora)" value={showCreated.token} mono dangerColor />
            <CurlSnippet t={t} uniqueUrl={showCreated.webhook.uniqueUrl ?? ''} token={showCreated.token} />
          </div>
        </Modal>
      ) : null}

      {rotating ? (
        <RotateTokenModal webhook={rotating} onClose={() => setRotating(null)} />
      ) : null}

      <ConfirmDialog
        open={deleting !== null}
        title="Remover webhook?"
        description={`"${deleting?.name}" — esta ação não pode ser desfeita.`}
        confirmLabel="Remover"
        danger
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await del.mutateAsync(deleting.id);
            toast(`"${deleting.name}" removido`, 'success');
          } catch {
            toast('Falha ao remover', 'error');
          }
          setDeleting(null);
        }}
      />
    </div>
  );
}

function InboundCard({
  webhook: w,
  onEdit,
  onDelete,
  onRotate,
}: {
  webhook: Webhook;
  onEdit: () => void;
  onDelete: () => void;
  onRotate: () => void;
}) {
  const { tokens: t } = useTheme();
  const toggle = useToggleWebhook();
  const fullUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/inbound/${w.uniqueUrl ?? ''}`;
  const action = INBOUND_ACTIONS.find((a) => a.value === w.actionType)?.label ?? w.actionType ?? '—';

  return (
    <div
      style={{
        border: `1px solid ${t.border}`,
        borderRadius: 10,
        background: t.bgElevated,
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: t.text }}>{w.name}</div>
          <div style={{ fontSize: 11, color: t.textDim, marginTop: 2 }}>Ação: {action}</div>
        </div>
        <Switch checked={w.active} onChange={() => toggle.mutateAsync(w.id)} ariaLabel="ativar" />
      </div>

      <CopyField t={t} label="URL única" value={fullUrl} compact />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 10.5, color: t.textFaint, textTransform: 'uppercase', letterSpacing: 0.5 }}>Token</span>
        <code style={{ fontSize: 11, color: t.text, fontFamily: 'monospace' }}>{w.authTokenMask ?? '—'}</code>
        <button type="button" onClick={onRotate} style={linkBtn(t)}>
          rotacionar
        </button>
      </div>

      <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
        <button type="button" onClick={onEdit} style={btnNeutral(t)}>
          <Icons.Edit s={12} c={t.text} /> Editar
        </button>
        <button type="button" onClick={onDelete} style={{ ...btnNeutral(t), color: '#ef4444' }}>
          <Icons.Trash s={12} c="#ef4444" />
        </button>
      </div>
    </div>
  );
}

function InboundEditor({
  open,
  editing,
  onClose,
  onCreatedToken,
}: {
  open: boolean;
  editing: Webhook | null;
  onClose: () => void;
  onCreatedToken: (webhook: Webhook, token: string) => void;
}) {
  const { tokens: t } = useTheme();
  const create = useCreateWebhook();
  const update = useUpdateWebhook();
  const isEdit = editing !== null;

  const [name, setName] = useState('');
  const [actionType, setActionType] = useState<string>('create_opportunity');
  const [actionConfig, setActionConfig] = useState<Record<string, unknown>>({});
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setActionType(editing.actionType ?? 'create_opportunity');
      setActionConfig((editing.actionConfig as Record<string, unknown>) ?? {});
      setActive(editing.active);
    } else {
      setName('');
      setActionType('create_opportunity');
      setActionConfig({});
      setActive(true);
    }
  }, [open, editing]);

  if (!open) return null;

  const submit = async () => {
    if (!name.trim()) return toast('Nome obrigatório', 'error');
    const body = { type: 'INBOUND' as const, name: name.trim(), actionType, actionConfig, active };
    try {
      if (isEdit && editing) {
        await update.mutateAsync({ id: editing.id, name: body.name, actionType, actionConfig, active });
        toast('Webhook atualizado', 'success');
      } else {
        const created = await create.mutateAsync(body);
        if (created._authTokenOnce) onCreatedToken(created, created._authTokenOnce);
        toast('Webhook criado', 'success');
      }
      onClose();
    } catch (e) {
      const msg = axios.isAxiosError(e) ? e.response?.data?.message : null;
      toast(msg || 'Falha ao salvar', 'error');
    }
  };

  return (
    <Modal open onClose={onClose} title={isEdit ? 'Editar webhook' : 'Novo webhook (entrada)'} width={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Nome">
          <input value={name} onChange={(e) => setName(e.target.value)} style={input(t)} />
        </Field>

        <Field label="Ação ao receber">
          <select
            value={actionType}
            onChange={(e) => {
              setActionType(e.target.value);
              setActionConfig({});
            }}
            style={input(t)}
          >
            {INBOUND_ACTIONS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </Field>

        <ActionConfigForm actionType={actionType} config={actionConfig} setConfig={setActionConfig} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Switch checked={active} onChange={setActive} ariaLabel="ativo" />
          <span style={{ fontSize: 13 }}>Ativo</span>
        </div>

        {isEdit && editing ? (
          <CurlSnippet t={t} uniqueUrl={editing.uniqueUrl ?? ''} token="<X-Auth-Token>" />
        ) : null}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onClose} style={btnNeutral(t)}>
            Cancelar
          </button>
          <button type="button" onClick={submit} style={btnGold(t)}>
            Salvar
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ActionConfigForm({
  actionType,
  config,
  setConfig,
}: {
  actionType: string;
  config: Record<string, unknown>;
  setConfig: (c: Record<string, unknown>) => void;
}) {
  const { tokens: t } = useTheme();
  const set = (k: string, v: unknown) => setConfig({ ...config, [k]: v });

  if (actionType === 'create_opportunity') {
    return (
      <>
        <Field label="ID do Pipeline">
          <input value={(config.pipelineId as string) ?? ''} onChange={(e) => set('pipelineId', e.target.value)} style={input(t)} />
        </Field>
        <Field label="ID da Etapa">
          <input value={(config.stageId as string) ?? ''} onChange={(e) => set('stageId', e.target.value)} style={input(t)} />
        </Field>
        <Field label="Caminho do nome no payload (ex: data.contact.name)">
          <input value={(config.namePath as string) ?? ''} onChange={(e) => set('namePath', e.target.value)} style={input(t)} />
        </Field>
        <Field label="Caminho do telefone (ex: data.contact.phone)">
          <input value={(config.phonePath as string) ?? ''} onChange={(e) => set('phonePath', e.target.value)} style={input(t)} />
        </Field>
        <Field label="Caminho do valor (opcional)">
          <input value={(config.valuePath as string) ?? ''} onChange={(e) => set('valuePath', e.target.value)} style={input(t)} />
        </Field>
      </>
    );
  }
  if (actionType === 'create_contact') {
    return (
      <>
        <Field label="Caminho do nome">
          <input value={(config.namePath as string) ?? ''} onChange={(e) => set('namePath', e.target.value)} style={input(t)} />
        </Field>
        <Field label="Caminho do telefone">
          <input value={(config.phonePath as string) ?? ''} onChange={(e) => set('phonePath', e.target.value)} style={input(t)} />
        </Field>
      </>
    );
  }
  if (actionType === 'trigger_automation') {
    return (
      <Field label="ID da Automação">
        <input value={(config.automationId as string) ?? ''} onChange={(e) => set('automationId', e.target.value)} style={input(t)} />
      </Field>
    );
  }
  if (actionType === 'add_tag') {
    return (
      <>
        <Field label="ID da Tag">
          <input value={(config.tagId as string) ?? ''} onChange={(e) => set('tagId', e.target.value)} style={input(t)} />
        </Field>
        <Field label="Caminho do opportunityId no payload">
          <input value={(config.opportunityIdPath as string) ?? ''} onChange={(e) => set('opportunityIdPath', e.target.value)} style={input(t)} />
        </Field>
      </>
    );
  }
  if (actionType === 'add_note') {
    return (
      <>
        <Field label="Caminho do opportunityId">
          <input value={(config.opportunityIdPath as string) ?? ''} onChange={(e) => set('opportunityIdPath', e.target.value)} style={input(t)} />
        </Field>
        <Field label="Caminho do texto">
          <input value={(config.textPath as string) ?? ''} onChange={(e) => set('textPath', e.target.value)} style={input(t)} />
        </Field>
      </>
    );
  }
  return null;
}

function RotateTokenModal({ webhook, onClose }: { webhook: Webhook; onClose: () => void }) {
  const { tokens: t } = useTheme();
  const rotate = useRotateWebhookToken();
  const [newToken, setNewToken] = useState<string | null>(null);

  const fire = async () => {
    try {
      const r = await rotate.mutateAsync(webhook.id);
      setNewToken(r.authToken);
    } catch {
      toast('Falha ao rotacionar', 'error');
    }
  };

  return (
    <Modal open onClose={onClose} title={`Rotacionar token — ${webhook.name}`} width={460}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {newToken ? (
          <>
            <div style={{ fontSize: 12, color: '#10b981' }}>Novo token gerado. Anote agora — só será exibido uma vez.</div>
            <CopyField t={t} label="Token" value={newToken} mono dangerColor />
            <button type="button" onClick={onClose} style={btnGold(t)}>
              Fechar
            </button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 12.5, color: t.text }}>
              Ao rotacionar, o <strong>token antigo deixa de funcionar imediatamente</strong>. Aplicações
              que usam esse token vão começar a receber 401.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" onClick={onClose} style={btnNeutral(t)}>
                Cancelar
              </button>
              <button type="button" onClick={fire} disabled={rotate.isPending} style={btnGold(t)}>
                {rotate.isPending ? 'Rotacionando…' : 'Confirmar rotação'}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

// =================================================================
// SHARED
// =================================================================

function CopyField({
  t,
  label,
  value,
  mono,
  compact,
  dangerColor,
}: {
  t: ReturnType<typeof useTheme>['tokens'];
  label: string;
  value: string;
  mono?: boolean;
  compact?: boolean;
  dangerColor?: boolean;
}) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast('Copiado', 'success');
    } catch {
      toast('Falha ao copiar', 'error');
    }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 10.5, color: t.textFaint, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</span>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          readOnly
          value={value}
          style={{
            flex: 1,
            padding: compact ? '5px 8px' : '8px 10px',
            background: t.bgInput,
            border: `1px solid ${t.border}`,
            borderRadius: 6,
            color: dangerColor ? '#ef4444' : t.text,
            fontSize: 11.5,
            fontFamily: mono ? 'monospace' : 'inherit',
            outline: 'none',
          }}
          onClick={(e) => (e.target as HTMLInputElement).select()}
        />
        <button type="button" onClick={copy} style={btnNeutral(t)} title="Copiar">
          <Icons.Hash s={12} c={t.text} />
        </button>
      </div>
    </div>
  );
}

function CurlSnippet({ t, uniqueUrl, token }: { t: ReturnType<typeof useTheme>['tokens']; uniqueUrl: string; token: string }) {
  const url = `${typeof window !== 'undefined' ? window.location.origin : 'https://crm.example.com'}/api/webhooks/inbound/${uniqueUrl}`;
  const cmd = `curl -X POST "${url}" \\\n  -H "Content-Type: application/json" \\\n  -H "X-Auth-Token: ${token}" \\\n  -d '{"data": {"contact": {"name": "Maria", "phone": "11999999999"}}}'`;
  return (
    <div>
      <div style={{ fontSize: 10.5, color: t.textFaint, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
        Exemplo cURL
      </div>
      <pre
        style={{
          margin: 0,
          padding: 10,
          background: t.bgInput,
          border: `1px solid ${t.border}`,
          borderRadius: 6,
          fontSize: 10.5,
          color: t.text,
          fontFamily: 'monospace',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}
      >
        {cmd}
      </pre>
      <button
        type="button"
        onClick={() => navigator.clipboard.writeText(cmd).then(() => toast('Copiado', 'success'))}
        style={{ ...linkBtn(t), marginTop: 4 }}
      >
        Copiar comando
      </button>
    </div>
  );
}

function Field({ label, action, children }: { label: string; action?: React.ReactNode; children: React.ReactNode }) {
  const { tokens: t } = useTheme();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <label style={{ fontSize: 11.5, fontWeight: 500, color: t.textDim }}>{label}</label>
        {action}
      </div>
      {children}
    </div>
  );
}

function Empty({ t, text }: { t: ReturnType<typeof useTheme>['tokens']; text: string }) {
  return (
    <div
      style={{
        border: `1px dashed ${t.border}`,
        borderRadius: 10,
        padding: 30,
        textAlign: 'center',
        color: t.textDim,
        fontSize: 12.5,
      }}
    >
      {text}
    </div>
  );
}

type Tk = ReturnType<typeof useTheme>['tokens'];
const input = (t: Tk) => ({
  width: '100%',
  padding: '8px 12px',
  borderRadius: 7,
  background: t.bgInput,
  color: t.text,
  border: `1px solid ${t.border}`,
  fontSize: 12.5,
  outline: 'none' as const,
});
const btnGold = (t: Tk) => ({
  display: 'flex' as const,
  alignItems: 'center' as const,
  gap: 6,
  padding: '7px 14px',
  borderRadius: 7,
  background: t.gold,
  color: '#1a1300',
  border: 'none',
  fontSize: 12.5,
  fontWeight: 600,
  cursor: 'pointer' as const,
});
const btnNeutral = (t: Tk) => ({
  display: 'flex' as const,
  alignItems: 'center' as const,
  gap: 4,
  padding: '6px 10px',
  borderRadius: 7,
  background: t.bgInput,
  color: t.text,
  border: `1px solid ${t.border}`,
  fontSize: 11.5,
  cursor: 'pointer' as const,
});
const linkBtn = (t: Tk) => ({
  background: 'transparent' as const,
  border: 'none' as const,
  color: t.gold,
  fontSize: 11,
  cursor: 'pointer' as const,
  textDecoration: 'underline' as const,
  padding: 0,
});
