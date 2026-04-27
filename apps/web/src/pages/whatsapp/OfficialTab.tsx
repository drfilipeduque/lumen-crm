// Aba "API Oficial" (Meta Cloud API) da página /whatsapp.
// Lista cards de conexões OFFICIAL, abre modal pra criar nova,
// e drawer de gerenciamento pra cada conexão.

import { useState, type CSSProperties } from 'react';
import axios from 'axios';
import { useTheme } from '../../lib/ThemeContext';
import { Modal } from '../../components/ui/Modal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Switch } from '../../components/ui/Switch';
import { toast } from '../../components/ui/Toast';
import { Icons } from '../../components/icons';
import { FONT_STACK } from '../../lib/theme';
import {
  useCreateOfficialConnection,
  useDeleteConnection,
  useVerifyConnection,
  useWhatsAppConnections,
  type WAConnection,
} from '../../hooks/useWhatsApp';
import { OfficialConnectionDrawer } from './OfficialConnectionDrawer';

export function OfficialTab() {
  const { tokens: t } = useTheme();
  const list = useWhatsAppConnections('OFFICIAL');
  const [creating, setCreating] = useState(false);
  const [credentialsHelp, setCredentialsHelp] = useState(false);
  const [manageId, setManageId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<WAConnection | null>(null);
  const remove = useDeleteConnection();

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await remove.mutateAsync(confirmDelete.id);
      toast('Conexão removida', 'success');
      setConfirmDelete(null);
    } catch (e) {
      toast(axiosMsg(e) || 'Falha ao remover', 'error');
    }
  };

  return (
    <div style={{ padding: '20px 28px 32px' }}>
      <div
        style={{
          padding: '12px 14px',
          background: 'rgba(59,130,246,0.08)',
          color: t.text,
          border: '1px solid rgba(59,130,246,0.32)',
          borderRadius: 10,
          fontSize: 12.5,
          marginBottom: 18,
          lineHeight: 1.5,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ color: '#3b82f6', flexShrink: 0, marginTop: 1 }}>
            <Icons.Help s={14} />
          </div>
          <div>
            <strong>Conexões via Meta Cloud API.</strong> Maior estabilidade, suporte a templates e
            modo de coexistência. Requer credenciais da WhatsApp Business Account (WABA).
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: t.textDim }}>
          {list.data?.length ?? 0} conexão(ões) cadastrada(s)
        </div>
        <button type="button" onClick={() => setCreating(true)} style={buttonGold(t)}>
          <Icons.Plus s={12} c="#1a1300" /> Nova conexão oficial
        </button>
      </div>

      {list.isLoading ? (
        <div style={{ color: t.textDim, fontSize: 12.5 }}>Carregando…</div>
      ) : list.data && list.data.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: 40,
            background: t.bgElevated,
            border: `1px dashed ${t.border}`,
            borderRadius: 12,
            fontSize: 13,
            color: t.textSubtle,
          }}
        >
          Nenhuma conexão oficial ainda. Clique em <strong style={{ color: t.text }}>Nova
          conexão oficial</strong> pra começar.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }}>
          {(list.data ?? []).map((c) => (
            <OfficialConnectionCard
              key={c.id}
              c={c}
              onManage={() => setManageId(c.id)}
              onDelete={() => setConfirmDelete(c)}
            />
          ))}
        </div>
      )}

      {creating && (
        <NewOfficialConnectionModal
          onClose={() => setCreating(false)}
          onCreated={(id) => setManageId(id)}
          onShowHelp={() => setCredentialsHelp(true)}
        />
      )}
      {credentialsHelp && <CredentialsHelpModal onClose={() => setCredentialsHelp(false)} />}
      {manageId && <OfficialConnectionDrawer connectionId={manageId} onClose={() => setManageId(null)} />}

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Remover conexão oficial?"
        description={
          <>
            <strong>{confirmDelete?.name}</strong> será removida do sistema. Conversas e templates
            permanecem no banco local; o número e o app na Meta não são afetados.
          </>
        }
        confirmLabel="Remover"
        danger
        onConfirm={handleDelete}
        onClose={() => setConfirmDelete(null)}
      />
    </div>
  );
}

// ============================================================
// CARD
// ============================================================

function OfficialConnectionCard({
  c,
  onManage,
  onDelete,
}: {
  c: WAConnection;
  onManage: () => void;
  onDelete: () => void;
}) {
  const { tokens: t } = useTheme();
  const verify = useVerifyConnection();

  const [menuOpen, setMenuOpen] = useState(false);

  const tier = parseTier(c.qualityTier);
  const statusInfo = officialStatus(c.status);

  const handleVerify = async () => {
    try {
      await verify.mutateAsync(c.id);
      toast('Credenciais revalidadas', 'success');
    } catch (e) {
      toast(axiosMsg(e) || 'Falha ao revalidar', 'error');
    }
  };

  return (
    <div
      style={{
        padding: 16,
        background: t.bgElevated,
        border: `1px solid ${t.border}`,
        borderRadius: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: 'rgba(59,130,246,0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#3b82f6',
            position: 'relative',
            flexShrink: 0,
          }}
        >
          <Icons.Phone s={20} c="currentColor" />
          <span
            style={{
              position: 'absolute',
              bottom: -3,
              right: -3,
              background: '#3b82f6',
              color: '#fff',
              fontSize: 7.5,
              fontWeight: 700,
              padding: '2px 4px',
              borderRadius: 4,
              letterSpacing: 0.4,
            }}
          >
            OFICIAL
          </span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: t.text,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {c.name}
          </div>
          <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 2 }}>
            {c.profileName && (
              <span style={{ color: t.textDim, fontWeight: 500 }}>
                {c.profileName} ·{' '}
              </span>
            )}
            {c.phone || 'Sem número'}
          </div>
        </div>
        <span
          title={c.status}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '3px 9px',
            borderRadius: 999,
            background: hexAlpha(statusInfo.color, 0.15),
            color: statusInfo.color,
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: 0.4,
            textTransform: 'uppercase',
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: 999, background: statusInfo.color }} />
          {statusInfo.label}
        </span>
      </div>

      {/* Tier de qualidade */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: t.textDim, marginBottom: 5 }}>
          <span>Tier de qualidade</span>
          <span style={{ color: tier.color, fontWeight: 600 }}>
            {tier.label}
          </span>
        </div>
        <div style={{ height: 4, background: t.bgInput, borderRadius: 2, overflow: 'hidden' }}>
          <div
            style={{
              width: `${tier.progress}%`,
              height: '100%',
              background: tier.color,
              transition: 'width 200ms',
            }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <span
            style={{
              fontSize: 9.5,
              padding: '3px 7px',
              borderRadius: 4,
              background: c.coexistenceMode ? hexAlpha('#22c55e', 0.15) : hexAlpha('#f59e0b', 0.15),
              color: c.coexistenceMode ? '#22c55e' : '#f59e0b',
              fontWeight: 600,
              letterSpacing: 0.3,
              textTransform: 'uppercase',
            }}
          >
            {c.coexistenceMode ? 'Coexistência' : 'API Exclusiva'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {c.users.slice(0, 3).map((u, i) => (
            <div
              key={u.id}
              title={u.name}
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #3b82f6 0%, #1e40af 100%)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 9,
                fontWeight: 600,
                border: `2px solid ${t.bgElevated}`,
                marginLeft: i > 0 ? -8 : 0,
              }}
            >
              {initials(u.name)}
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, position: 'relative' }}>
        <button
          type="button"
          onClick={onManage}
          style={{ ...buttonGold(t), padding: '7px 14px', fontSize: 12, flex: 1, justifyContent: 'center' }}
        >
          Gerenciar
        </button>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          style={{
            background: 'transparent',
            border: `1px solid ${t.border}`,
            borderRadius: 7,
            padding: '7px 10px',
            color: t.textDim,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
          }}
          title="Mais ações"
        >
          <Icons.MoreH s={14} />
        </button>
        {menuOpen && (
          <div
            onMouseLeave={() => setMenuOpen(false)}
            style={{
              position: 'absolute',
              top: 'calc(100% + 4px)',
              right: 0,
              background: t.bgElevated,
              border: `1px solid ${t.borderStrong}`,
              borderRadius: 8,
              boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
              minWidth: 180,
              zIndex: 5,
              overflow: 'hidden',
            }}
          >
            <MenuItem
              onClick={() => {
                setMenuOpen(false);
                handleVerify();
              }}
              disabled={verify.isPending}
            >
              {verify.isPending ? 'Validando…' : 'Revalidar credenciais'}
            </MenuItem>
            <MenuItem
              danger
              onClick={() => {
                setMenuOpen(false);
                onDelete();
              }}
            >
              Remover
            </MenuItem>
          </div>
        )}
      </div>
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  danger,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  const { tokens: t } = useTheme();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        background: 'transparent',
        border: 'none',
        padding: '9px 14px',
        fontSize: 12.5,
        color: danger ? t.danger : t.text,
        cursor: disabled ? 'default' : 'pointer',
        fontFamily: FONT_STACK,
        opacity: disabled ? 0.5 : 1,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = t.bgHover)}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {children}
    </button>
  );
}

// ============================================================
// NEW CONNECTION MODAL
// ============================================================

type ValidatePhase = 'idle' | 'validating' | 'subscribing' | 'done';

function NewOfficialConnectionModal({
  onClose,
  onCreated,
  onShowHelp,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
  onShowHelp: () => void;
}) {
  const { tokens: t } = useTheme();
  const create = useCreateOfficialConnection();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [coexistenceMode, setCoexistenceMode] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<ValidatePhase>('idle');

  const submit = async () => {
    setError(null);
    if (!name.trim()) return setError('Informe o nome de exibição');
    if (!wabaId.trim()) return setError('Informe o WABA ID');
    if (!phoneNumberId.trim()) return setError('Informe o Phone Number ID');
    if (!accessToken.trim()) return setError('Informe o Access Token');

    setPhase('validating');
    try {
      // Backend faz: validar credenciais → inscrever app → criar conexão.
      // Aqui só refletimos o feedback enquanto a chamada está em voo.
      setTimeout(() => setPhase('subscribing'), 800);
      const created = await create.mutateAsync({
        name: name.trim(),
        wabaId: wabaId.trim(),
        phoneNumberId: phoneNumberId.trim(),
        accessToken: accessToken.trim(),
        phone: phone.trim() || undefined,
        coexistenceMode,
      });
      setPhase('done');
      toast('Conexão oficial criada', 'success');
      onCreated(created.id);
      onClose();
    } catch (e) {
      setPhase('idle');
      setError(axiosMsg(e) || 'Falha ao conectar');
    }
  };

  return (
    <Modal open onClose={onClose} title="Nova conexão oficial (Meta Cloud API)" width={560}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Nome de exibição">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Recepção Clínica"
            style={inputStyle(t)}
          />
        </Field>

        <Field label="Número de telefone (opcional)">
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+55 11 91234-5678 — preenchido automaticamente se em branco"
            style={inputStyle(t)}
          />
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="WABA ID">
            <input
              value={wabaId}
              onChange={(e) => setWabaId(e.target.value)}
              placeholder="123456789012345"
              style={inputStyle(t)}
            />
          </Field>
          <Field label="Phone Number ID">
            <input
              value={phoneNumberId}
              onChange={(e) => setPhoneNumberId(e.target.value)}
              placeholder="987654321098765"
              style={inputStyle(t)}
            />
          </Field>
        </div>

        <Field label="Access Token (System User permanente)">
          <textarea
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            placeholder="EAAB..."
            rows={3}
            style={{
              ...inputStyle(t),
              fontFamily: 'ui-monospace, monospace',
              fontSize: 11.5,
              resize: 'vertical',
              minHeight: 80,
            }}
          />
        </Field>

        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
            padding: 12,
            background: t.bgInput,
            border: `1px solid ${t.border}`,
            borderRadius: 8,
          }}
        >
          <Switch checked={coexistenceMode} onChange={setCoexistenceMode} ariaLabel="Coexistência" />
          <div>
            <div style={{ fontSize: 12.5, color: t.text, fontWeight: 500 }}>Modo Coexistência</div>
            <div style={{ fontSize: 11, color: t.textSubtle, marginTop: 2, lineHeight: 1.5 }}>
              Permite usar o WhatsApp Business App junto com a API. Recomendado.
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onShowHelp}
          style={{
            background: 'transparent',
            border: 'none',
            color: t.gold,
            cursor: 'pointer',
            fontSize: 12,
            textAlign: 'left',
            padding: 0,
            fontFamily: FONT_STACK,
            textDecoration: 'underline',
          }}
        >
          Como obter essas credenciais?
        </button>

        {phase !== 'idle' && (
          <div
            style={{
              fontSize: 12.5,
              padding: '10px 12px',
              background: t.bgInput,
              border: `1px solid ${t.border}`,
              borderRadius: 8,
              color: t.text,
            }}
          >
            {phase === 'validating' && 'Validando credenciais com a Meta…'}
            {phase === 'subscribing' && 'Registrando webhook na WABA…'}
            {phase === 'done' && '✓ Conectado!'}
          </div>
        )}

        {error && <ErrorBox t={t}>{error}</ErrorBox>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onClose} style={buttonGhost(t)}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={create.isPending}
            style={{ ...buttonGold(t), opacity: create.isPending ? 0.6 : 1 }}
          >
            {create.isPending ? 'Conectando…' : 'Validar e conectar'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ============================================================
// CREDENTIALS HELP MODAL
// ============================================================

function CredentialsHelpModal({ onClose }: { onClose: () => void }) {
  const { tokens: t } = useTheme();
  return (
    <Modal open onClose={onClose} title="Como obter as credenciais da Meta" width={620}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontSize: 13, color: t.text, lineHeight: 1.6 }}>
        <div style={{ color: t.textDim, fontSize: 12.5 }}>
          Você precisa de um app Meta com produto WhatsApp ativado e uma WhatsApp Business Account
          (WABA) verificada.
        </div>

        <Step n={1} title="Acesse o Business Manager">
          Vá em <code style={codeStyle(t)}>business.facebook.com</code> e entre com a conta que
          gerencia a WABA.
        </Step>

        <Step n={2} title="Configurações → Contas WhatsApp Business">
          Selecione a WABA da clínica. O <strong>WABA ID</strong> aparece no topo da página.
        </Step>

        <Step n={3} title="Adicione um número de telefone">
          Em <strong>Números de telefone</strong>, adicione/verifique o número que vai usar.
          Anote o <strong>Phone Number ID</strong> exibido ao lado.
        </Step>

        <Step n={4} title="Crie um System User permanente">
          Em <strong>Usuários do sistema</strong>, crie um usuário com função
          <strong> Admin</strong>. Atribua a ele os ativos: o app Meta + a WABA.
        </Step>

        <Step n={5} title="Gere o Access Token">
          Em <strong>Gerar token</strong>, escolha:
          <ul style={{ margin: '6px 0', paddingLeft: 18, color: t.textDim }}>
            <li>App: o app Meta com produto WhatsApp</li>
            <li>Validade: <strong>Nunca expira</strong></li>
            <li>Permissões: <code style={codeStyle(t)}>whatsapp_business_management</code> e <code style={codeStyle(t)}>whatsapp_business_messaging</code></li>
          </ul>
          Copie o token gerado (você não verá ele de novo).
        </Step>

        <Step n={6} title="Configure o webhook">
          No app Meta, vá em <strong>WhatsApp → Configuração → Webhook</strong>. Use:
          <ul style={{ margin: '6px 0', paddingLeft: 18, color: t.textDim }}>
            <li>URL de callback: <code style={codeStyle(t)}>{`{PUBLIC_API_URL}/webhooks/meta/{connectionId}`}</code></li>
            <li>Verify token: o valor de <code style={codeStyle(t)}>META_WEBHOOK_VERIFY_TOKEN</code></li>
            <li>Inscreva-se em: <strong>messages</strong></li>
          </ul>
          O <code style={codeStyle(t)}>connectionId</code> aparece após criar a conexão aqui.
        </Step>

        <Step n={7} title="Cole no Lumen">
          Volte aqui e cole o <strong>WABA ID</strong>, <strong>Phone Number ID</strong> e
          <strong> Access Token</strong>. A gente valida em tempo real e cria a conexão.
        </Step>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={buttonGold(t)}>
            Entendi
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  const { tokens: t } = useTheme();
  return (
    <div style={{ display: 'flex', gap: 12 }}>
      <div
        style={{
          width: 26,
          height: 26,
          borderRadius: '50%',
          background: t.gold,
          color: '#1a1300',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 700,
          fontSize: 12,
          flexShrink: 0,
        }}
      >
        {n}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: t.text, marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 12.5, color: t.textSubtle, lineHeight: 1.6 }}>{children}</div>
      </div>
    </div>
  );
}

// ============================================================
// HELPERS
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

function codeStyle(t: ReturnType<typeof useTheme>['tokens']): CSSProperties {
  return {
    background: t.bgInput,
    padding: '1px 6px',
    borderRadius: 4,
    fontFamily: 'ui-monospace, monospace',
    fontSize: 11,
    color: t.gold,
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
    padding: '9px 16px',
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
    padding: '8px 14px',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: FONT_STACK,
  };
}

function officialStatus(s: WAConnection['status']): { label: string; color: string } {
  if (s === 'CONNECTED') return { label: 'Ativa', color: '#22c55e' };
  if (s === 'ERROR') return { label: 'Erro', color: '#f85149' };
  if (s === 'WAITING_QR') return { label: 'Atenção', color: '#f59e0b' };
  return { label: 'Inativa', color: '#94a3b8' };
}

function parseTier(t: string | null): { label: string; progress: number; color: string } {
  if (!t) return { label: 'Não classificado', progress: 8, color: '#94a3b8' };
  // Tiers da Meta: TIER_50, TIER_250, TIER_1K, TIER_10K, TIER_100K, UNLIMITED
  const map: Record<string, { label: string; progress: number; color: string }> = {
    TIER_50: { label: '50 conv./24h', progress: 12, color: '#94a3b8' },
    TIER_250: { label: '250 conv./24h', progress: 25, color: '#94a3b8' },
    TIER_1K: { label: '1K conv./24h', progress: 45, color: '#3b82f6' },
    TIER_10K: { label: '10K conv./24h', progress: 70, color: '#3b82f6' },
    TIER_100K: { label: '100K conv./24h', progress: 90, color: '#22c55e' },
    UNLIMITED: { label: 'Ilimitado', progress: 100, color: '#22c55e' },
  };
  return map[t] ?? { label: t, progress: 30, color: '#94a3b8' };
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '··';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
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
