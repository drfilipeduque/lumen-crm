// Listagem de Cadências + drawer create/edit + executions screen.

import { useMemo, useState } from 'react';
import axios from 'axios';
import { useTheme } from '../../lib/ThemeContext';
import { Icons } from '../../components/icons';
import { Switch } from '../../components/ui/Switch';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { toast } from '../../components/ui/Toast';
import {
  useCadences,
  useCadenceStats,
  useDeleteCadence,
  useDuplicateCadence,
  useToggleCadence,
  type Cadence,
  type CadenceScope,
} from '../../hooks/useCadences';
import { CadenceDrawer } from './CadenceDrawer';
import { CadenceExecutionsScreen } from './CadenceExecutionsScreen';
import { StartCadenceModal } from './StartCadenceModal';

export function CadencesTab() {
  const { tokens: t } = useTheme();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Cadence | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Cadence | null>(null);
  const [executions, setExecutions] = useState<Cadence | null>(null);
  const [starting, setStarting] = useState<Cadence | null>(null);

  const { data, isLoading } = useCadences();
  const del = useDeleteCadence();
  const filtered = useMemo(() => {
    const all = data ?? [];
    if (!search.trim()) return all;
    const q = search.toLowerCase();
    return all.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.description ?? '').toLowerCase().includes(q),
    );
  }, [data, search]);

  return (
    <div style={{ padding: '24px 32px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar cadências…"
          style={{
            flex: 1,
            maxWidth: 320,
            padding: '8px 12px',
            background: t.bgInput,
            border: `1px solid ${t.border}`,
            borderRadius: 8,
            color: t.text,
            fontSize: 13,
            outline: 'none',
          }}
        />
        <div style={{ flex: 1 }} />
        <button type="button" onClick={() => setCreating(true)} style={btnGold(t)}>
          <Icons.Plus s={12} c="#1a1300" /> Nova Cadência
        </button>
      </div>

      {isLoading ? (
        <div style={{ color: t.textFaint, fontSize: 13 }}>Carregando…</div>
      ) : filtered.length === 0 ? (
        <Empty t={t} onCreate={() => setCreating(true)} />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
            gap: 14,
          }}
        >
          {filtered.map((c) => (
            <CadenceCard
              key={c.id}
              cadence={c}
              onEdit={() => setEditing(c)}
              onDelete={() => setDeleting(c)}
              onExecutions={() => setExecutions(c)}
              onStartManual={() => setStarting(c)}
            />
          ))}
        </div>
      )}

      <CadenceDrawer
        open={creating || editing !== null}
        editing={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        title="Remover cadência?"
        description={`Remover "${deleting?.name}" também CANCELA todas as execuções ativas/pausadas. Não dá pra desfazer.`}
        confirmLabel="Remover"
        danger
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await del.mutateAsync(deleting.id);
            toast(`"${deleting.name}" removida`, 'success');
          } catch (e) {
            const msg = axios.isAxiosError(e) ? e.response?.data?.message : null;
            toast(msg || 'Falha ao remover', 'error');
          }
          setDeleting(null);
        }}
      />

      {executions ? (
        <CadenceExecutionsScreen cadence={executions} onClose={() => setExecutions(null)} />
      ) : null}

      {starting ? (
        <StartCadenceModal cadence={starting} onClose={() => setStarting(null)} />
      ) : null}
    </div>
  );
}

// =================================================================
// CARD
// =================================================================

const SCOPE_LABEL: Record<CadenceScope, string> = {
  PIPELINE: 'Pipeline',
  STAGE: 'Etapa',
  OPPORTUNITY: 'Oportunidade (manual)',
  CONTACT: 'Contato (manual)',
  GROUP: 'Grupo filtrado',
};

function CadenceCard({
  cadence: c,
  onEdit,
  onDelete,
  onExecutions,
  onStartManual,
}: {
  cadence: Cadence;
  onEdit: () => void;
  onDelete: () => void;
  onExecutions: () => void;
  onStartManual: () => void;
}) {
  const { tokens: t } = useTheme();
  const toggle = useToggleCadence();
  const dup = useDuplicateCadence();
  const stats = useCadenceStats(c.id);
  const [menuOpen, setMenuOpen] = useState(false);

  const onToggle = async (next: boolean) => {
    void next; // toggle endpoint não recebe valor — apenas inverte
    try {
      await toggle.mutateAsync(c.id);
    } catch {
      toast('Falha ao atualizar', 'error');
    }
  };

  const onDuplicate = async () => {
    try {
      await dup.mutateAsync(c.id);
      toast('Cadência duplicada', 'success');
    } catch {
      toast('Falha ao duplicar', 'error');
    }
    setMenuOpen(false);
  };

  const isManual = c.scope === 'OPPORTUNITY' || c.scope === 'CONTACT' || c.scope === 'GROUP';
  const replyPct = stats.data ? Math.round(stats.data.replyRate * 100) : null;

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
          <div style={{ fontWeight: 600, fontSize: 14, color: t.text }}>{c.name}</div>
          {c.description ? (
            <div
              style={{
                fontSize: 12,
                color: t.textDim,
                marginTop: 2,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {c.description}
            </div>
          ) : null}
        </div>
        <Switch checked={c.active} onChange={onToggle} ariaLabel="ativar" />
        <button
          type="button"
          onClick={() => setMenuOpen((s) => !s)}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: 4,
            borderRadius: 6,
            color: t.textDim,
          }}
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
            <MenuItem t={t} label="Duplicar" onClick={onDuplicate} />
            <MenuItem t={t} label="Ver execuções" onClick={onExecutions} />
            {isManual ? <MenuItem t={t} label="Iniciar manualmente…" onClick={onStartManual} /> : null}
            <MenuItem t={t} label="Excluir" onClick={onDelete} danger />
          </div>
        ) : null}
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <Chip t={t} label={SCOPE_LABEL[c.scope]} />
        {c.connection ? (
          <Chip t={t} label={`${c.connection.type === 'OFFICIAL' ? 'Oficial' : 'Não Oficial'} · ${c.connection.name}`} />
        ) : (
          <Chip t={t} label="Sem conexão fixa" />
        )}
        <Chip t={t} label={`${c.messageCount ?? c.messages?.length ?? 0} mensagens`} />
      </div>

      <div style={{ fontSize: 11, color: t.textDim }}>
        {(c.activeExecutions ?? 0) > 0
          ? `Ativa em ${c.activeExecutions} ${c.activeExecutions === 1 ? 'lead' : 'leads'}`
          : 'Sem leads ativos'}
        {replyPct !== null ? ` · ${replyPct}% taxa de resposta` : ''}
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

function Chip({ t, label }: { t: ReturnType<typeof useTheme>['tokens']; label: string }) {
  return (
    <span
      style={{
        fontSize: 10.5,
        padding: '3px 8px',
        borderRadius: 999,
        background: t.bgInput,
        color: t.textDim,
        border: `1px solid ${t.border}`,
      }}
    >
      {label}
    </span>
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
      <div style={{ fontSize: 14, color: t.text, marginBottom: 6 }}>Nenhuma cadência criada</div>
      <div style={{ fontSize: 12, marginBottom: 16 }}>
        Crie sequências programadas de mensagens com gatilhos automáticos ou manuais.
      </div>
      <button type="button" onClick={onCreate} style={btnGold(t)}>
        <Icons.Plus s={12} c="#1a1300" /> Criar primeira cadência
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
