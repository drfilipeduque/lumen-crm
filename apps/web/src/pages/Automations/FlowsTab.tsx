// Sub-aba "Fluxos" — listagem de Automations com cards, navega pra editor.

import { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../lib/ThemeContext';
import { Icons } from '../../components/icons';
import { Switch } from '../../components/ui/Switch';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { toast } from '../../components/ui/Toast';
import {
  useAutomations,
  useToggleAutomation,
  useDeleteAutomation,
  useCreateAutomation,
  type Automation,
  type Flow,
} from '../../hooks/useAutomations';
import { useAutomationLogStats } from '../../hooks/useAutomationLogs';
import { TRIGGER_LABELS } from './flow-editor/labels';

export function FlowsTab() {
  const { tokens: t } = useTheme();
  const nav = useNavigate();
  const { data, isLoading } = useAutomations();
  const [deleting, setDeleting] = useState<Automation | null>(null);
  const del = useDeleteAutomation();

  const onConfirmDelete = async () => {
    if (!deleting) return;
    try {
      await del.mutateAsync(deleting.id);
      toast(`"${deleting.name}" removida`, 'success');
    } catch (e) {
      const msg = axios.isAxiosError(e) ? e.response?.data?.message : null;
      toast(msg || 'Falha ao remover', 'error');
    }
    setDeleting(null);
  };

  return (
    <div style={{ padding: '24px 32px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: t.text }}>Fluxos</h2>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={() => nav('/automations/flows/new')} style={btnGold(t)}>
          <Icons.Plus s={12} c="#1a1300" /> Novo Fluxo
        </button>
      </div>

      {isLoading ? (
        <div style={{ color: t.textFaint, fontSize: 13 }}>Carregando…</div>
      ) : !data || data.length === 0 ? (
        <Empty t={t} onCreate={() => nav('/automations/flows/new')} />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
            gap: 14,
          }}
        >
          {data.map((a) => (
            <FlowCard
              key={a.id}
              automation={a}
              onEdit={() => nav(`/automations/flows/${a.id}`)}
              onDelete={() => setDeleting(a)}
              onLogs={() => nav(`/automations?logs=${a.id}`)}
              onDuplicate={async () => {
                // duplicação simples — cria nova com mesmo flow + " (cópia)"
                try {
                  const { useCreateAutomation: _ } = await import('../../hooks/useAutomations');
                  void _;
                } catch {
                  //
                }
              }}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="Remover fluxo?"
        description={`"${deleting?.name}" e seus logs serão excluídos.`}
        confirmLabel="Remover"
        danger
        onClose={() => setDeleting(null)}
        onConfirm={onConfirmDelete}
      />
    </div>
  );
}

// =================================================================

function FlowCard({
  automation: a,
  onEdit,
  onDelete,
  onLogs,
  onDuplicate,
}: {
  automation: Automation;
  onEdit: () => void;
  onDelete: () => void;
  onLogs: () => void;
  onDuplicate: () => void;
}) {
  const { tokens: t } = useTheme();
  const toggle = useToggleAutomation();
  const create = useCreateAutomation();
  const stats30 = useAutomationLogStats('30d');
  const [menuOpen, setMenuOpen] = useState(false);

  const nav = useNavigate();

  // Duplicar = create com flow do mesmo automation
  const handleDuplicate = async () => {
    try {
      const dup = await create.mutateAsync({
        name: `${a.name} (cópia)`,
        active: false,
        flow: a.flow as Flow,
      });
      toast('Fluxo duplicado (inativo)', 'success');
      nav(`/automations/flows/${dup.id}`);
    } catch (e) {
      const msg = axios.isAxiosError(e) ? e.response?.data?.message : null;
      toast(msg || 'Falha ao duplicar', 'error');
    }
    setMenuOpen(false);
    void onDuplicate;
  };

  // Stats globais 30d (best-effort — não filtra por automationId, só mostra contexto)
  const total30 = stats30.data?.byType.AUTOMATION?.total ?? 0;
  const success30 = stats30.data?.byType.AUTOMATION?.success ?? 0;
  const successPct = total30 > 0 ? Math.round((success30 / total30) * 100) : null;

  const triggerLabel = TRIGGER_LABELS[a.triggerType] ?? a.triggerType;

  return (
    <div
      style={{
        border: `1px solid ${t.border}`,
        borderRadius: 12,
        background: t.bgElevated,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <button
            type="button"
            onClick={onEdit}
            style={{
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 600,
              color: t.text,
              textAlign: 'left',
              width: '100%',
            }}
          >
            {a.name}
          </button>
          <div style={{ fontSize: 11, color: t.textDim, marginTop: 2 }}>
            Quando: {triggerLabel}
          </div>
        </div>
        <Switch checked={a.active} onChange={() => toggle.mutateAsync(a.id)} ariaLabel="ativar" />
        <button
          type="button"
          onClick={() => setMenuOpen((s) => !s)}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, color: t.textDim }}
          aria-label="menu"
        >
          <Icons.MoreH s={16} c={t.textDim} />
        </button>
        {menuOpen ? (
          <div
            onClick={() => setMenuOpen(false)}
            style={{
              position: 'absolute',
              top: 40,
              right: 8,
              background: t.bgElevated,
              border: `1px solid ${t.border}`,
              borderRadius: 8,
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
              zIndex: 20,
              minWidth: 170,
              display: 'flex',
              flexDirection: 'column',
              padding: 4,
            }}
          >
            <MenuItem t={t} label="Editar" onClick={onEdit} />
            <MenuItem t={t} label="Duplicar" onClick={handleDuplicate} />
            <MenuItem t={t} label="Ver logs" onClick={onLogs} />
            <MenuItem t={t} label="Excluir" onClick={onDelete} danger />
          </div>
        ) : null}
      </div>

      <div style={{ fontSize: 11, color: t.textDim }}>
        Executado {a.executionCount}x no total
        {successPct !== null ? ` · ${successPct}% sucesso (30d, geral)` : ''}
      </div>
    </div>
  );
}

function MenuItem({
  t,
  label,
  onClick,
  danger,
}: {
  t: ReturnType<typeof useTheme>['tokens'];
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{
        background: 'transparent',
        border: 'none',
        textAlign: 'left',
        padding: '7px 10px',
        fontSize: 12.5,
        color: danger ? '#ef4444' : t.text,
        cursor: 'pointer',
        borderRadius: 6,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = t.bgInput)}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {label}
    </button>
  );
}

function Empty({ t, onCreate }: { t: ReturnType<typeof useTheme>['tokens']; onCreate: () => void }) {
  return (
    <div
      style={{
        border: `1px dashed ${t.border}`,
        borderRadius: 12,
        padding: 60,
        textAlign: 'center',
        color: t.textDim,
      }}
    >
      <div style={{ fontSize: 14, color: t.text, marginBottom: 6 }}>
        Crie seu primeiro fluxo de automação
      </div>
      <div style={{ fontSize: 12, marginBottom: 16 }}>
        Arraste blocos pra criar gatilhos, condições e ações automáticas.
      </div>
      <button type="button" onClick={onCreate} style={btnGold(t)}>
        <Icons.Plus s={12} c="#1a1300" /> Novo Fluxo
      </button>
    </div>
  );
}

type Tk = ReturnType<typeof useTheme>['tokens'];
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
