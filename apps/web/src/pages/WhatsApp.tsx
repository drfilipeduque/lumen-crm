import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import axios from 'axios';
import { useTheme } from '../lib/ThemeContext';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Switch } from '../components/ui/Switch';
import { toast } from '../components/ui/Toast';
import { Icons } from '../components/icons';
import { FONT_STACK } from '../lib/theme';
import {
  useConnectionQr,
  useCreateUnofficialConnection,
  useDeleteConnection,
  useEntryRules,
  useRestartConnection,
  useUpdateEntryRule,
  useWhatsAppConnections,
  type EntryRuleSummary,
  type WAConnection,
} from '../hooks/useWhatsApp';
import { usePipeline, usePipelines } from '../hooks/usePipelines';
import { ScriptsTab } from './whatsapp/ScriptsTab';
import { OfficialTab } from './whatsapp/OfficialTab';
import { RoutingTab } from './whatsapp/RoutingTab';

type Tab = 'official' | 'unofficial' | 'scripts' | 'rules' | 'routing';

const TABS: { key: Tab; label: string }[] = [
  { key: 'official', label: 'API Oficial' },
  { key: 'unofficial', label: 'API Não Oficial' },
  { key: 'scripts', label: 'Scripts' },
  { key: 'rules', label: 'Regras de Entrada' },
  { key: 'routing', label: 'Roteamento' },
];

// ============================================================
// PAGE
// ============================================================

export function WhatsAppPage() {
  const { tokens: t } = useTheme();
  const [tab, setTab] = useState<Tab>('unofficial');

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        background: t.bg,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '24px 28px 0',
          borderBottom: `1px solid ${t.border}`,
        }}
      >
        <div style={{ marginBottom: 16 }}>
          <div
            style={{
              fontSize: 11.5,
              letterSpacing: 1,
              textTransform: 'uppercase',
              color: t.textFaint,
              fontWeight: 500,
              marginBottom: 6,
            }}
          >
            WhatsApp
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.6, margin: 0, color: t.text }}>
            Conexões e atendimento
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {TABS.map((opt) => {
            const active = tab === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setTab(opt.key)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: active ? t.gold : t.textDim,
                  fontSize: 13,
                  fontWeight: active ? 600 : 500,
                  padding: '12px 16px',
                  cursor: 'pointer',
                  borderBottom: `2px solid ${active ? t.gold : 'transparent'}`,
                  fontFamily: FONT_STACK,
                  marginBottom: -1,
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {tab === 'official' && <OfficialTab />}
        {tab === 'unofficial' && <UnofficialTab />}
        {tab === 'scripts' && <ScriptsTab />}
        {tab === 'rules' && <RulesTab />}
        {tab === 'routing' && <RoutingTab />}
      </div>
    </div>
  );
}

// ============================================================
// UNOFFICIAL TAB
// ============================================================

function UnofficialTab() {
  const { tokens: t } = useTheme();
  const list = useWhatsAppConnections('UNOFFICIAL');
  const remove = useDeleteConnection();
  const restart = useRestartConnection();
  const [creating, setCreating] = useState(false);
  const [qrFor, setQrFor] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<WAConnection | null>(null);

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

  const handleRestart = async (id: string) => {
    try {
      await restart.mutateAsync(id);
      toast('Reconectando…', 'info');
      setQrFor(id);
    } catch (e) {
      toast(axiosMsg(e) || 'Falha ao reconectar', 'error');
    }
  };

  return (
    <div style={{ padding: '20px 28px 32px' }}>
      <div
        style={{
          padding: '12px 14px',
          background: '#fef9c3',
          color: '#92400e',
          border: '1px solid #fde68a',
          borderRadius: 10,
          fontSize: 12.5,
          marginBottom: 18,
          lineHeight: 1.5,
        }}
      >
        ⚠️ <strong>Conexões não oficiais</strong> usam o WhatsApp Web. Elas são instáveis e podem
        resultar no banimento do número. Use sob sua responsabilidade.
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: t.textDim }}>
          {list.data?.length ?? 0} conexão(ões) cadastrada(s)
        </div>
        <button type="button" onClick={() => setCreating(true)} style={buttonGold(t)}>
          <Icons.Plus s={12} c="#1a1300" /> Nova conexão
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
          Nenhuma conexão cadastrada ainda.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
          {(list.data ?? []).map((c) => (
            <ConnectionCard
              key={c.id}
              c={c}
              onShowQr={() => setQrFor(c.id)}
              onRestart={() => handleRestart(c.id)}
              onDelete={() => setConfirmDelete(c)}
            />
          ))}
        </div>
      )}

      {creating && <NewConnectionModal onClose={() => setCreating(false)} onCreated={(id) => setQrFor(id)} />}
      {qrFor && <QrModal connectionId={qrFor} onClose={() => setQrFor(null)} />}

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Remover conexão?"
        description={
          <>
            <strong>{confirmDelete?.name}</strong> será desconectada e removida. Conversas e
            mensagens permanecem no banco.
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

function ConnectionCard({
  c,
  onShowQr,
  onRestart,
  onDelete,
}: {
  c: WAConnection;
  onShowQr: () => void;
  onRestart: () => void;
  onDelete: () => void;
}) {
  const { tokens: t } = useTheme();
  const statusColor: Record<string, string> = {
    CONNECTED: t.success,
    DISCONNECTED: t.textFaint,
    WAITING_QR: t.gold,
    ERROR: t.danger,
  };
  const color = statusColor[c.status] ?? t.textFaint;
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
        <ConnectionAvatar avatar={c.avatar} status={c.status} />
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
            {c.profileName && <span style={{ color: t.textDim, fontWeight: 500 }}>{c.profileName}{c.phone ? ' · ' : ''}</span>}
            {c.phone ? formatPhoneDisplay(c.phone) : (!c.profileName ? 'Sem número vinculado' : '')}
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
            background: hexAlpha(color, 0.15),
            color,
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: 0.4,
            textTransform: 'uppercase',
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: 999,
              background: color,
              animation: c.status === 'WAITING_QR' ? 'lumen-pulse 1.4s ease-in-out infinite' : undefined,
            }}
          />
          {labelStatus(c.status)}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11.5 }}>
        <div style={{ color: t.textFaint }}>Atualizado {relative(c.updatedAt)}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: -4 }}>
          {c.users.slice(0, 3).map((u, i) => (
            <div
              key={u.id}
              title={u.name}
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #D4AF37 0%, #8a6c17 100%)',
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
          {c.users.length > 3 && (
            <div
              style={{
                marginLeft: -8,
                padding: '0 6px',
                height: 22,
                borderRadius: 11,
                background: t.bgInput,
                color: t.textDim,
                fontSize: 10,
                display: 'flex',
                alignItems: 'center',
                fontWeight: 600,
              }}
            >
              +{c.users.length - 3}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {c.status === 'WAITING_QR' && (
          <button type="button" onClick={onShowQr} style={{ ...buttonGold(t), padding: '6px 12px', fontSize: 12 }}>
            Ver QR
          </button>
        )}
        {(c.status === 'DISCONNECTED' || c.status === 'ERROR') && (
          <button type="button" onClick={onRestart} style={{ ...buttonGhost(t), padding: '6px 12px', fontSize: 12 }}>
            Reconectar
          </button>
        )}
        {c.status === 'CONNECTED' && (
          <button type="button" onClick={onShowQr} style={{ ...buttonGhost(t), padding: '6px 12px', fontSize: 12 }}>
            Ver QR
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          style={{
            background: 'transparent',
            color: t.danger,
            border: `1px solid ${hexAlpha('#f85149', 0.4)}`,
            borderRadius: 7,
            padding: '6px 12px',
            fontSize: 12,
            fontWeight: 500,
            cursor: 'pointer',
            fontFamily: FONT_STACK,
          }}
        >
          Remover
        </button>
      </div>
      <style>{`@keyframes lumen-pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.4 } }`}</style>
    </div>
  );
}

// ============================================================
// NEW CONNECTION MODAL
// ============================================================

function ConnectionAvatar({ avatar }: { avatar: string | null; status: WAConnection['status'] }) {
  const [loadFailed, setLoadFailed] = useState(false);
  const showImage = !!avatar && !loadFailed;

  useEffect(() => {
    setLoadFailed(false);
  }, [avatar]);

  return (
    <div
      style={{
        width: 44,
        height: 44,
        borderRadius: 12,
        background: showImage ? '#000' : hexAlpha('#22c55e', 0.12),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#22c55e',
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      {showImage ? (
        <img
          src={avatar}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setLoadFailed(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <Icons.Phone s={20} c="currentColor" />
      )}
    </div>
  );
}

function NewConnectionModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { tokens: t } = useTheme();
  const create = useCreateUnofficialConnection();
  const [name, setName] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim()) return setError('Informe o nome');
    setError(null);
    try {
      const created = await create.mutateAsync({
        name: name.trim(),
        webhookUrl: webhookUrl.trim() || null,
      });
      toast('Conexão criada — aguardando QR', 'success');
      onCreated(created.id);
      onClose();
    } catch (e) {
      setError(axiosMsg(e) || 'Falha ao criar');
    }
  };

  return (
    <Modal open onClose={onClose} title="Nova conexão WhatsApp" width={460}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Nome descritivo">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Recepção, Comercial Ana"
            style={inputStyle(t)}
          />
        </Field>
        <Field label="Webhook URL (opcional)">
          <input
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://..."
            style={inputStyle(t)}
          />
        </Field>
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
            {create.isPending ? 'Criando…' : 'Gerar QR Code'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ============================================================
// QR MODAL
// ============================================================

function QrModal({ connectionId, onClose }: { connectionId: string; onClose: () => void }) {
  const { tokens: t } = useTheme();
  const list = useWhatsAppConnections('UNOFFICIAL');
  const conn = list.data?.find((c) => c.id === connectionId);
  const qr = useConnectionQr(connectionId, conn?.status !== 'CONNECTED');
  const closeTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Fecha automaticamente 2s após conectar
  useEffect(() => {
    if (conn?.status === 'CONNECTED') {
      closeTimerRef.current = setTimeout(onClose, 2000);
    }
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, [conn?.status, onClose]);

  return (
    <Modal open onClose={onClose} title={`QR Code — ${conn?.name ?? '...'}`} width={620}>
      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 24, alignItems: 'flex-start' }}>
        <div>
          <div
            style={{
              width: 240,
              height: 240,
              background: '#fff',
              border: `1px solid ${t.border}`,
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 8,
            }}
          >
            {conn?.status === 'CONNECTED' ? (
              <div style={{ textAlign: 'center', color: t.success, fontSize: 13 }}>
                <Icons.Check s={36} c={t.success} />
                <div style={{ marginTop: 8, fontWeight: 600 }}>Conectado!</div>
              </div>
            ) : qr.data ? (
              <img src={qr.data} alt="QR Code" style={{ width: '100%', height: '100%' }} />
            ) : (
              <div style={{ color: t.textDim, fontSize: 12 }}>Gerando QR…</div>
            )}
          </div>
          <div
            style={{
              marginTop: 10,
              fontSize: 11.5,
              color:
                conn?.status === 'CONNECTED'
                  ? t.success
                  : conn?.status === 'WAITING_QR'
                    ? t.gold
                    : t.textDim,
              textAlign: 'center',
              fontWeight: 500,
            }}
          >
            {conn?.status === 'WAITING_QR' && '🟡 Aguardando você escanear…'}
            {conn?.status === 'CONNECTED' && '✓ Conectado!'}
            {conn?.status === 'DISCONNECTED' && 'Desconectado'}
            {conn?.status === 'ERROR' && 'Erro — tente recriar'}
          </div>
        </div>

        <div style={{ fontSize: 13, color: t.text, lineHeight: 1.6 }}>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>Como conectar:</div>
          <ol style={{ paddingLeft: 18, margin: 0, color: t.textDim }}>
            <li>Abra o WhatsApp no seu celular</li>
            <li>Toque no menu <strong style={{ color: t.text }}>(Android)</strong> ou em <strong style={{ color: t.text }}>Configurações (iOS)</strong></li>
            <li>Toque em <strong style={{ color: t.text }}>Aparelhos conectados</strong></li>
            <li>Toque em <strong style={{ color: t.text }}>Conectar um aparelho</strong></li>
            <li>Aponte seu celular pra esta tela</li>
          </ol>
          <div style={{ marginTop: 16, fontSize: 11.5, color: t.textFaint }}>
            O QR atualiza sozinho a cada poucos segundos. Mantenha esta janela aberta até conectar.
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ============================================================
// RULES TAB
// ============================================================

function RulesTab() {
  const { tokens: t } = useTheme();
  const rules = useEntryRules();
  const [editing, setEditing] = useState<EntryRuleSummary | null>(null);

  return (
    <div style={{ padding: '20px 28px 32px' }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 17, fontWeight: 600, color: t.text, margin: 0 }}>
          Regras de entrada por conexão
        </h2>
        <div style={{ fontSize: 12.5, color: t.textDim, marginTop: 4 }}>
          Define o que acontece quando uma nova conversa chega numa conexão.
        </div>
      </div>

      {rules.isLoading ? (
        <div style={{ color: t.textDim, fontSize: 12.5 }}>Carregando…</div>
      ) : !rules.data || rules.data.length === 0 ? (
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
          Nenhuma conexão ativa. Crie uma na aba <strong style={{ color: t.text }}>API Não Oficial</strong>.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rules.data.map((r) => (
            <RuleRow key={r.connectionId} r={r} onEdit={() => setEditing(r)} />
          ))}
        </div>
      )}

      {editing && <RuleEditModal entry={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function RuleRow({ r, onEdit }: { r: EntryRuleSummary; onEdit: () => void }) {
  const { tokens: t } = useTheme();
  const pipeline = usePipeline(r.rule?.pipelineId ?? null);
  const stage = pipeline.data?.stages.find((s) => s.id === r.rule?.stageId);

  const description = !r.rule
    ? 'Modo Manual (padrão)'
    : r.rule.mode === 'MANUAL'
      ? 'Modo Manual'
      : `Modo Automático → ${pipeline.data?.name ?? '…'} / ${stage?.name ?? '…'}`;

  return (
    <div
      style={{
        padding: '14px 16px',
        background: t.bgElevated,
        border: `1px solid ${t.border}`,
        borderRadius: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{r.name}</div>
          <span
            style={{
              fontSize: 10,
              padding: '2px 7px',
              borderRadius: 999,
              background: r.type === 'OFFICIAL' ? hexAlpha('#3b82f6', 0.15) : hexAlpha('#22c55e', 0.15),
              color: r.type === 'OFFICIAL' ? '#3b82f6' : '#22c55e',
              fontWeight: 600,
              letterSpacing: 0.4,
              textTransform: 'uppercase',
            }}
          >
            {r.type}
          </span>
        </div>
        <div style={{ fontSize: 12, color: t.textSubtle, marginTop: 4 }}>{description}</div>
      </div>
      <button type="button" onClick={onEdit} style={{ ...buttonGhost(t), padding: '6px 12px', fontSize: 12 }}>
        Editar
      </button>
    </div>
  );
}

function RuleEditModal({ entry, onClose }: { entry: EntryRuleSummary; onClose: () => void }) {
  const { tokens: t } = useTheme();
  const update = useUpdateEntryRule();
  const pipelines = usePipelines();
  const [auto, setAuto] = useState(entry.rule?.mode === 'AUTO');
  const [pipelineId, setPipelineId] = useState(entry.rule?.pipelineId ?? '');
  const [stageId, setStageId] = useState(entry.rule?.stageId ?? '');
  const pipeline = usePipeline(pipelineId || null);

  // Reseta stageId se mudar o pipeline pra um diferente
  useEffect(() => {
    if (pipeline.data) {
      const exists = pipeline.data.stages.some((s) => s.id === stageId);
      if (!exists) setStageId(pipeline.data.stages[0]?.id ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipelineId, pipeline.data?.id]);

  const submit = async () => {
    try {
      if (auto && (!pipelineId || !stageId)) {
        toast('Selecione funil e etapa para modo automático', 'error');
        return;
      }
      await update.mutateAsync({
        connectionId: entry.connectionId,
        mode: auto ? 'AUTO' : 'MANUAL',
        pipelineId: auto ? pipelineId : undefined,
        stageId: auto ? stageId : undefined,
      });
      toast('Regra salva', 'success');
      onClose();
    } catch (e) {
      toast(axiosMsg(e) || 'Falha ao salvar', 'error');
    }
  };

  return (
    <Modal open onClose={onClose} title={`Regra — ${entry.name}`} width={500}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Switch checked={auto} onChange={setAuto} ariaLabel="Modo automático" />
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: t.text }}>
              Criação automática de oportunidade
            </div>
            <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 2 }}>
              {auto
                ? 'Toda nova conversa cria uma oportunidade no funil/etapa abaixo.'
                : 'Apenas o contato e a conversa serão criados.'}
            </div>
          </div>
        </div>

        {auto && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Funil">
              <select
                value={pipelineId}
                onChange={(e) => setPipelineId(e.target.value)}
                style={{ ...inputStyle(t), cursor: 'pointer' }}
              >
                <option value="">— escolha —</option>
                {pipelines.data?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Etapa">
              <select
                value={stageId}
                onChange={(e) => setStageId(e.target.value)}
                disabled={!pipeline.data}
                style={{ ...inputStyle(t), cursor: 'pointer' }}
              >
                <option value="">— escolha —</option>
                {pipeline.data?.stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}

        <div
          style={{
            background: t.bgInput,
            border: `1px solid ${t.border}`,
            borderRadius: 8,
            padding: 12,
            fontSize: 11.5,
            color: t.textSubtle,
            lineHeight: 1.5,
          }}
        >
          <strong style={{ color: t.text }}>Modo Manual</strong> — você decide quando converter
          conversa em oportunidade.
          <br />
          <strong style={{ color: t.text }}>Modo Automático</strong> — toda conversa nova de um
          contato inédito vira oportunidade no funil/etapa configurados.
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onClose} style={buttonGhost(t)}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={update.isPending}
            style={{ ...buttonGold(t), opacity: update.isPending ? 0.6 : 1 }}
          >
            {update.isPending ? 'Salvando…' : 'Salvar regra'}
          </button>
        </div>
      </div>
    </Modal>
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

// helpers
function labelStatus(s: string): string {
  switch (s) {
    case 'CONNECTED':
      return 'Conectado';
    case 'DISCONNECTED':
      return 'Desconectado';
    case 'WAITING_QR':
      return 'Aguardando QR';
    case 'ERROR':
      return 'Erro';
    default:
      return s;
  }
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '··';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function formatPhoneDisplay(raw: string): string {
  const d = raw.replace(/\D/g, '');
  if (d.length === 13 && d.startsWith('55')) {
    return `+55 (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  }
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return raw;
}

function relative(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `há ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `há ${days}d`;
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
