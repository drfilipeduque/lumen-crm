import { useMemo, useState } from 'react';
import axios from 'axios';
import { useTheme } from '../../lib/ThemeContext';
import { Modal } from '../../components/ui/Modal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Switch } from '../../components/ui/Switch';
import { toast } from '../../components/ui/Toast';
import { Icons } from '../../components/icons';
import {
  CLAUDE_MODELS,
  OPENAI_MODELS,
  modelsFor,
  useAIIntegrations,
  useCreateAIIntegration,
  useDeleteAIIntegration,
  useRotateAIIntegrationKey,
  useTestAIIntegration,
  useTestAIKey,
  useUpdateAIIntegration,
  type AIIntegration,
  type AIProvider,
} from '../../hooks/useAIIntegrations';

export function SettingsIntegrations() {
  const { tokens: t } = useTheme();
  const { data: integrations, isLoading } = useAIIntegrations();
  const [editing, setEditing] = useState<AIIntegration | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<AIIntegration | null>(null);
  const deleteIntegration = useDeleteAIIntegration();

  const onConfirmDelete = async () => {
    if (!deleting) return;
    try {
      await deleteIntegration.mutateAsync(deleting.id);
      toast(`Integração "${deleting.name}" removida`, 'success');
      setDeleting(null);
    } catch (e) {
      const msg = axios.isAxiosError(e) ? e.response?.data?.message : null;
      toast(msg || 'Falha ao remover', 'error');
    }
  };

  return (
    <div style={{ padding: '28px 32px 40px', color: t.text }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 600, letterSpacing: -0.4, margin: 0 }}>
            Integrações de IA
          </h2>
          <div style={{ fontSize: 13, color: t.textDim, marginTop: 4, maxWidth: 560 }}>
            Conecte chaves de IA para usar em automações e ações inteligentes.
          </div>
        </div>
        <button type="button" onClick={() => setCreating(true)} style={buttonGold(t)}>
          <Icons.Plus s={12} c="#1a1300" /> Nova Integração
        </button>
      </div>

      {isLoading ? (
        <div style={{ color: t.textFaint, fontSize: 13 }}>Carregando…</div>
      ) : !integrations || integrations.length === 0 ? (
        <Empty t={t} onCreate={() => setCreating(true)} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
          {integrations.map((i) => (
            <IntegrationCard
              key={i.id}
              integration={i}
              onEdit={() => setEditing(i)}
              onDelete={() => setDeleting(i)}
            />
          ))}
        </div>
      )}

      <IntegrationModal
        open={creating || editing !== null}
        editing={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        title="Remover integração?"
        description={`Tem certeza que deseja remover "${deleting?.name}"? Automações que dependem dela vão falhar.`}
        confirmLabel="Remover"
        onClose={() => setDeleting(null)}
        onConfirm={onConfirmDelete}
        danger
      />
    </div>
  );
}

// =================================================================
// CARD
// =================================================================

function IntegrationCard({
  integration: i,
  onEdit,
  onDelete,
}: {
  integration: AIIntegration;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { tokens: t } = useTheme();
  const update = useUpdateAIIntegration();
  const test = useTestAIIntegration();

  const onToggle = async (next: boolean) => {
    try {
      await update.mutateAsync({ id: i.id, active: next });
    } catch {
      toast('Falha ao atualizar', 'error');
    }
  };

  const onTest = async () => {
    try {
      const res = await test.mutateAsync({ id: i.id });
      if (res.ok) toast(`OK — ${res.result.model}: "${res.result.text.slice(0, 60)}"`, 'success');
      else toast(`Falhou: ${res.error}`, 'error');
    } catch (e) {
      const msg = axios.isAxiosError(e) ? e.response?.data?.message : null;
      toast(msg || 'Erro no teste', 'error');
    }
  };

  return (
    <div
      style={{
        border: `1px solid ${t.border}`,
        borderRadius: 12,
        background: t.bgElevated,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <ProviderBadge provider={i.provider} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: t.text }}>{i.name}</div>
          <div style={{ fontSize: 11, color: t.textFaint, fontFamily: 'monospace' }}>{i.keyMask}</div>
        </div>
        <Switch checked={i.active} onChange={onToggle} ariaLabel="ativar" />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={modelBadge(t)}>{i.defaultModel}</span>
      </div>

      <div style={{ fontSize: 12, color: t.textDim }}>
        {i.usageCount > 0
          ? `Usada ${i.usageCount}× · Última uso ${formatRelative(i.lastUsedAt)}`
          : 'Nunca usada'}
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
        <button type="button" onClick={onTest} disabled={test.isPending} style={buttonNeutral(t)}>
          {test.isPending ? 'Testando…' : 'Testar'}
        </button>
        <button type="button" onClick={onEdit} style={buttonNeutral(t)}>
          <Icons.Edit s={12} c={t.text} /> Editar
        </button>
        <button type="button" onClick={onDelete} style={buttonDanger(t)}>
          <Icons.Trash s={12} c="#ef4444" />
        </button>
      </div>
    </div>
  );
}

function ProviderBadge({ provider }: { provider: AIProvider }) {
  const { tokens: t } = useTheme();
  const label = provider === 'CLAUDE' ? 'Claude' : 'OpenAI';
  const bg = provider === 'CLAUDE' ? '#cc7d3c22' : '#10a37f22';
  const fg = provider === 'CLAUDE' ? '#cc7d3c' : '#10a37f';
  return (
    <div
      style={{
        width: 32,
        height: 32,
        borderRadius: 8,
        background: bg,
        color: fg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 11,
        fontWeight: 700,
      }}
      aria-label={label}
    >
      {provider === 'CLAUDE' ? 'CL' : 'AI'}
      <span style={{ position: 'absolute', clip: 'rect(0 0 0 0)' }}>{label}</span>
      <span style={{ display: 'none' }}>{t.text}</span>
    </div>
  );
}

// =================================================================
// MODAL
// =================================================================

function IntegrationModal({
  open,
  editing,
  onClose,
}: {
  open: boolean;
  editing: AIIntegration | null;
  onClose: () => void;
}) {
  const { tokens: t } = useTheme();
  const create = useCreateAIIntegration();
  const update = useUpdateAIIntegration();
  const rotate = useRotateAIIntegrationKey();
  const testKey = useTestAIKey();

  const isEdit = editing !== null;

  const [name, setName] = useState(editing?.name ?? '');
  const [provider, setProvider] = useState<AIProvider>(editing?.provider ?? 'CLAUDE');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [model, setModel] = useState<string>(editing?.defaultModel ?? CLAUDE_MODELS[1]);
  const [active, setActive] = useState(editing?.active ?? true);
  const [showHelp, setShowHelp] = useState(false);

  // Reseta ao abrir/trocar editing
  useMemo(() => {
    if (open) {
      setName(editing?.name ?? '');
      setProvider(editing?.provider ?? 'CLAUDE');
      setApiKey('');
      setModel(editing?.defaultModel ?? (editing?.provider === 'OPENAI' ? OPENAI_MODELS[0] : CLAUDE_MODELS[1]));
      setActive(editing?.active ?? true);
      setShowHelp(false);
    }
  }, [open, editing]);

  const models = modelsFor(provider);

  const submit = async () => {
    if (!name.trim()) return toast('Nome obrigatório', 'error');
    try {
      if (isEdit && editing) {
        await update.mutateAsync({ id: editing.id, name: name.trim(), defaultModel: model, active });
        if (apiKey.trim()) {
          await rotate.mutateAsync({ id: editing.id, apiKey: apiKey.trim() });
        }
        toast('Integração atualizada', 'success');
      } else {
        if (!apiKey.trim()) return toast('API Key obrigatória', 'error');
        await create.mutateAsync({ name: name.trim(), provider, apiKey: apiKey.trim(), defaultModel: model, active });
        toast('Integração criada', 'success');
      }
      onClose();
    } catch (e) {
      const msg = axios.isAxiosError(e) ? e.response?.data?.message : null;
      toast(msg || 'Falha ao salvar', 'error');
    }
  };

  const onTestKey = async () => {
    if (!apiKey.trim()) return toast('Cole a API key primeiro', 'error');
    try {
      const r = await testKey.mutateAsync({ provider, apiKey: apiKey.trim(), model });
      if (r.ok) toast('Conexão OK', 'success');
      else toast(`Falhou: ${r.error}`, 'error');
    } catch (e) {
      const msg = axios.isAxiosError(e) ? e.response?.data?.message : null;
      toast(msg || 'Erro no teste', 'error');
    }
  };

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Editar integração' : 'Nova integração de IA'} width={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Nome">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ex: Claude Principal"
            style={input(t)}
          />
        </Field>

        <Field label="Provider">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {(['CLAUDE', 'OPENAI'] as const).map((p) => (
              <button
                key={p}
                type="button"
                disabled={isEdit}
                onClick={() => {
                  setProvider(p);
                  setModel(p === 'CLAUDE' ? CLAUDE_MODELS[1] : OPENAI_MODELS[0]);
                }}
                style={{
                  padding: '12px 14px',
                  borderRadius: 10,
                  border: `1px solid ${provider === p ? t.gold : t.border}`,
                  background: provider === p ? t.goldFaint : t.bgElevated,
                  color: t.text,
                  cursor: isEdit ? 'not-allowed' : 'pointer',
                  textAlign: 'left',
                  opacity: isEdit ? 0.6 : 1,
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 13 }}>
                  {p === 'CLAUDE' ? 'Claude (Anthropic)' : 'OpenAI'}
                </div>
                <div style={{ fontSize: 11, color: t.textDim, marginTop: 2 }}>
                  {p === 'CLAUDE' ? 'Opus, Sonnet, Haiku 4.x' : 'GPT-4o, GPT-4o-mini'}
                </div>
              </button>
            ))}
          </div>
        </Field>

        <Field
          label={isEdit ? 'API Key (deixe vazio pra manter atual)' : 'API Key'}
          extra={
            <button type="button" onClick={() => setShowHelp(true)} style={linkButton(t)}>
              Como obter API Key?
            </button>
          }
        >
          <div style={{ position: 'relative' }}>
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={isEdit ? '••••••••' : 'sk-ant-... ou sk-proj-...'}
              style={{ ...input(t), paddingRight: 64 }}
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShowKey((s) => !s)}
              style={{
                position: 'absolute',
                right: 6,
                top: '50%',
                transform: 'translateY(-50%)',
                padding: '4px 8px',
                fontSize: 11,
                background: 'transparent',
                border: 'none',
                color: t.textDim,
                cursor: 'pointer',
              }}
            >
              {showKey ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>
        </Field>

        <Field label="Modelo padrão">
          <select value={model} onChange={(e) => setModel(e.target.value)} style={input(t)}>
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Field>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Switch checked={active} onChange={setActive} ariaLabel="ativo" />
          <span style={{ fontSize: 13, color: t.text }}>Ativa</span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
          <button
            type="button"
            onClick={onTestKey}
            disabled={testKey.isPending || !apiKey.trim()}
            style={{ ...buttonNeutral(t), opacity: !apiKey.trim() ? 0.6 : 1 }}
          >
            {testKey.isPending ? 'Testando…' : 'Testar conexão'}
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={onClose} style={buttonNeutral(t)}>
              Cancelar
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={create.isPending || update.isPending}
              style={buttonGold(t)}
            >
              {isEdit ? 'Salvar' : 'Criar'}
            </button>
          </div>
        </div>
      </div>

      <HelpModal open={showHelp} provider={provider} onClose={() => setShowHelp(false)} />
    </Modal>
  );
}

function HelpModal({ open, provider, onClose }: { open: boolean; provider: AIProvider; onClose: () => void }) {
  const { tokens: t } = useTheme();
  return (
    <Modal open={open} onClose={onClose} title="Como obter API Key" width={460}>
      <div style={{ fontSize: 13, color: t.text, lineHeight: 1.55 }}>
        {provider === 'CLAUDE' ? (
          <>
            <p>1. Acesse <strong>console.anthropic.com</strong> e faça login.</p>
            <p>2. Vá em <strong>Settings → API Keys</strong>.</p>
            <p>3. Clique em <em>Create Key</em>, dê um nome (ex: "Lumen CRM") e copie o valor (começa com <code>sk-ant-</code>).</p>
            <p style={{ color: t.textDim, fontSize: 12 }}>
              A key só é mostrada UMA vez. Se perder, gere uma nova.
            </p>
          </>
        ) : (
          <>
            <p>1. Acesse <strong>platform.openai.com</strong> e faça login.</p>
            <p>2. Vá em <strong>API Keys</strong> no menu.</p>
            <p>3. Clique em <em>Create new secret key</em>, dê um nome e copie o valor (começa com <code>sk-</code>).</p>
            <p style={{ color: t.textDim, fontSize: 12 }}>
              Verifique se há saldo na conta — chamadas requerem crédito.
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}

// =================================================================
// HELPERS
// =================================================================

function Field({ label, extra, children }: { label: string; extra?: React.ReactNode; children: React.ReactNode }) {
  const { tokens: t } = useTheme();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <label style={{ fontSize: 12, fontWeight: 500, color: t.textDim }}>{label}</label>
        {extra}
      </div>
      {children}
    </div>
  );
}

function Empty({ t, onCreate }: { t: ReturnType<typeof useTheme>['tokens']; onCreate: () => void }) {
  return (
    <div
      style={{
        border: `1px dashed ${t.border}`,
        borderRadius: 12,
        padding: 40,
        textAlign: 'center',
        color: t.textDim,
      }}
    >
      <div style={{ fontSize: 14, color: t.text, marginBottom: 6 }}>Nenhuma integração ainda</div>
      <div style={{ fontSize: 12, marginBottom: 16 }}>Adicione uma chave Claude ou OpenAI pra começar a usar IA nas automações.</div>
      <button type="button" onClick={onCreate} style={buttonGold(t)}>
        <Icons.Plus s={12} c="#1a1300" /> Criar primeira integração
      </button>
    </div>
  );
}

function formatRelative(iso: string | null): string {
  if (!iso) return 'nunca';
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return 'agora';
  if (diff < 3_600_000) return `há ${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `há ${Math.floor(diff / 3_600_000)}h`;
  return `há ${Math.floor(diff / 86_400_000)}d`;
}

// styles
type Tk = ReturnType<typeof useTheme>['tokens'];
const buttonGold = (t: Tk) => ({
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
const buttonNeutral = (t: Tk) => ({
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
const buttonDanger = (t: Tk) => ({
  ...buttonNeutral(t),
  border: `1px solid rgba(239,68,68,0.3)`,
  color: '#ef4444',
});
const linkButton = (t: Tk) => ({
  background: 'transparent' as const,
  border: 'none' as const,
  color: t.gold,
  fontSize: 11,
  cursor: 'pointer' as const,
  padding: 0,
  textDecoration: 'underline' as const,
});
const input = (t: Tk) => ({
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  background: t.bgInput,
  color: t.text,
  border: `1px solid ${t.border}`,
  fontSize: 13,
  outline: 'none',
});
const modelBadge = (t: Tk) => ({
  fontSize: 11,
  padding: '3px 8px',
  borderRadius: 999,
  background: t.bgInput,
  color: t.textDim,
  border: `1px solid ${t.border}`,
  fontFamily: 'monospace' as const,
});
