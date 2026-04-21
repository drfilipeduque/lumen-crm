import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import axios from 'axios';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTheme } from '../lib/ThemeContext';
import { useAuthStore } from '../stores/useAuthStore';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { toast } from '../components/ui/Toast';
import { Icons } from '../components/icons';
import { FONT_STACK } from '../lib/theme';
import { api } from '../lib/api';
import {
  useCompleteReminder,
  useCreateReminder,
  useDeleteReminder,
  useGlobalReminders,
  usePendingCount,
  useSnoozeReminder,
  type Reminder,
  type ReminderListPeriod,
  type ReminderListStatus,
} from '../hooks/useReminders';
import { useTeam } from '../hooks/useTeam';

type Tab = ReminderListStatus;

const TABS: { key: Tab; label: string }[] = [
  { key: 'PENDING', label: 'Pendentes' },
  { key: 'OVERDUE', label: 'Atrasados' },
  { key: 'COMPLETED', label: 'Concluídos' },
  { key: 'ALL', label: 'Todos' },
];

const PERIODS: { key: ReminderListPeriod; label: string }[] = [
  { key: 'today', label: 'Hoje' },
  { key: 'week', label: 'Esta semana' },
  { key: 'month', label: 'Este mês' },
  { key: 'all', label: 'Todos' },
];

// ============================================================
// PAGE
// ============================================================

export function RemindersPage() {
  const { tokens: t } = useTheme();
  const me = useAuthStore((s) => s.user);
  const isAdmin = me?.role === 'ADMIN';
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [tab, setTab] = useState<Tab>('PENDING');
  const [period, setPeriod] = useState<ReminderListPeriod>('all');
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [creating, setCreating] = useState(false);
  const team = useTeam();
  const pending = usePendingCount();

  // Permite abrir o modal de criação direto via /reminders?new=1
  useEffect(() => {
    if (searchParams.get('new') === '1') setCreating(true);
  }, [searchParams]);

  const list = useGlobalReminders({
    status: tab,
    period,
    userId: isAdmin && scope === 'all' ? undefined : me?.id,
  });

  const overdueCount = useMemo(() => {
    if (tab === 'OVERDUE') return list.data?.length ?? 0;
    return 0;
  }, [tab, list.data]);

  const grouped = useMemo(() => groupByDate(list.data ?? []), [list.data]);

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
          padding: '24px 28px 14px',
          borderBottom: `1px solid ${t.border}`,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
          <div>
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
              Lembretes
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.6, margin: 0, color: t.text }}>
              Sua agenda de follow-ups
            </h1>
            <div style={{ fontSize: 12.5, color: t.textDim, marginTop: 4 }}>
              {pending.data ?? 0} pendente(s) no momento
            </div>
          </div>
          <button type="button" onClick={() => setCreating(true)} style={buttonGold(t)}>
            <Icons.Plus s={12} c="#1a1300" /> Novo lembrete
          </button>
        </div>

        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'inline-flex', background: t.bgInput, border: `1px solid ${t.border}`, borderRadius: 8, padding: 2 }}>
            {TABS.map((opt) => {
              const active = tab === opt.key;
              const showOverdueDot = opt.key === 'OVERDUE' && overdueCount === 0 && tab !== 'OVERDUE';
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setTab(opt.key)}
                  style={{
                    position: 'relative',
                    padding: '6px 14px',
                    border: 'none',
                    borderRadius: 6,
                    background: active ? t.gold : 'transparent',
                    color: active ? '#1a1300' : t.textDim,
                    fontSize: 12,
                    fontWeight: active ? 600 : 500,
                    cursor: 'pointer',
                    fontFamily: FONT_STACK,
                  }}
                >
                  {opt.label}
                  {showOverdueDot && (
                    <span
                      style={{
                        position: 'absolute',
                        top: 4,
                        right: 6,
                        width: 6,
                        height: 6,
                        borderRadius: 999,
                        background: t.danger,
                      }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          <div style={{ display: 'inline-flex', background: t.bgInput, border: `1px solid ${t.border}`, borderRadius: 8, padding: 2 }}>
            {PERIODS.map((opt) => {
              const active = period === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setPeriod(opt.key)}
                  style={{
                    padding: '6px 12px',
                    border: 'none',
                    borderRadius: 6,
                    background: active ? t.bgHover : 'transparent',
                    color: active ? t.text : t.textDim,
                    fontSize: 11.5,
                    fontWeight: active ? 600 : 500,
                    cursor: 'pointer',
                    fontFamily: FONT_STACK,
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {isAdmin && (
            <div style={{ display: 'inline-flex', background: t.bgInput, border: `1px solid ${t.border}`, borderRadius: 8, padding: 2 }}>
              {(['mine', 'all'] as const).map((opt) => {
                const active = scope === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setScope(opt)}
                    style={{
                      padding: '6px 12px',
                      border: 'none',
                      borderRadius: 6,
                      background: active ? t.bgHover : 'transparent',
                      color: active ? t.text : t.textDim,
                      fontSize: 11.5,
                      fontWeight: active ? 600 : 500,
                      cursor: 'pointer',
                      fontFamily: FONT_STACK,
                    }}
                  >
                    {opt === 'mine' ? 'Meus' : 'Todos'}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px 32px' }}>
        {list.isLoading && !list.data ? (
          <div style={{ color: t.textDim, fontSize: 12.5 }}>Carregando…</div>
        ) : !list.data || list.data.length === 0 ? (
          <Empty t={t} tab={tab} onCreate={() => setCreating(true)} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 760 }}>
            {grouped.map((group) => (
              <div key={group.label}>
                <div
                  style={{
                    fontSize: 11,
                    letterSpacing: 1,
                    textTransform: 'uppercase',
                    color: t.textFaint,
                    fontWeight: 500,
                    marginBottom: 8,
                    paddingLeft: 4,
                  }}
                >
                  {group.label}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {group.items.map((r) => (
                    <ReminderCard
                      key={r.id}
                      reminder={r}
                      onOpenOpportunity={() => navigate(`/pipeline?opp=${r.opportunityId}`)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {creating && (
        <NewReminderModal
          team={team.data ?? []}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}

// ============================================================
// CARD
// ============================================================

function ReminderCard({
  reminder,
  onOpenOpportunity,
}: {
  reminder: Reminder;
  onOpenOpportunity: () => void;
}) {
  const { tokens: t } = useTheme();
  const complete = useCompleteReminder();
  const remove = useDeleteReminder();
  const snooze = useSnoozeReminder();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setSnoozeOpen(false), snoozeOpen);

  const overdue = !reminder.completed && reminder.overdue;

  return (
    <div
      style={{
        padding: '12px 14px',
        background: t.bgElevated,
        border: `1px solid ${t.border}`,
        borderLeft: overdue ? `3px solid ${t.danger}` : `1px solid ${t.border}`,
        borderRadius: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        opacity: reminder.completed ? 0.65 : 1,
      }}
    >
      <button
        type="button"
        title={reminder.completed ? 'Concluído' : 'Marcar como concluído'}
        onClick={() => {
          if (reminder.completed) return;
          void complete.mutateAsync({ id: reminder.id, opportunityId: reminder.opportunityId });
        }}
        style={{
          width: 22,
          height: 22,
          borderRadius: '50%',
          border: `1.5px solid ${reminder.completed ? t.success : overdue ? t.danger : t.borderStrong}`,
          background: reminder.completed ? t.success : 'transparent',
          cursor: reminder.completed ? 'default' : 'pointer',
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {reminder.completed && <Icons.Check s={12} c="#fff" />}
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: t.text,
            textDecoration: reminder.completed ? 'line-through' : undefined,
          }}
        >
          {reminder.title}
        </div>
        {reminder.description && (
          <div
            style={{
              fontSize: 11.5,
              color: t.textDim,
              marginTop: 2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: 540,
            }}
          >
            {reminder.description}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, fontSize: 11 }}>
          <span title={absoluteDate(reminder.effectiveDueAt)} style={{ color: overdue ? t.danger : t.textFaint }}>
            {relative(reminder.effectiveDueAt)}
          </span>
          {reminder.snoozedUntil && (
            <span style={{ color: t.textFaint }}>· adiado</span>
          )}
          {reminder.opportunity && (
            <>
              <span style={{ color: t.textFaint }}>·</span>
              <button
                type="button"
                onClick={onOpenOpportunity}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: t.gold,
                  cursor: 'pointer',
                  fontSize: 11,
                  fontFamily: FONT_STACK,
                  padding: 0,
                  textDecoration: 'underline',
                  textUnderlineOffset: 2,
                }}
              >
                {reminder.opportunity.contactName} — {reminder.opportunity.title}
              </button>
            </>
          )}
        </div>
      </div>

      {reminder.createdBy && (
        <Avatar name={reminder.createdBy.name} size={22} />
      )}

      {!reminder.completed && (
        <div ref={ref} style={{ position: 'relative' }}>
          <button
            type="button"
            title="Adiar"
            onClick={() => setSnoozeOpen((v) => !v)}
            style={{
              background: 'transparent',
              border: `1px solid ${t.border}`,
              borderRadius: 6,
              padding: '5px 10px',
              fontSize: 11.5,
              color: t.textDim,
              cursor: 'pointer',
              fontFamily: FONT_STACK,
            }}
          >
            ⏰ Adiar
          </button>
          {snoozeOpen && (
            <SnoozePopover
              t={t}
              onPreset={(p) => {
                setSnoozeOpen(false);
                void snooze.mutateAsync({ id: reminder.id, opportunityId: reminder.opportunityId, preset: p });
              }}
              onCustom={(date) => {
                setSnoozeOpen(false);
                void snooze.mutateAsync({ id: reminder.id, opportunityId: reminder.opportunityId, until: date });
              }}
            />
          )}
        </div>
      )}

      <button
        type="button"
        title="Excluir"
        onClick={() => setConfirmDelete(true)}
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: t.danger,
          padding: 5,
          opacity: 0.7,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.7')}
      >
        <Icons.Trash s={13} c="currentColor" />
      </button>

      <ConfirmDialog
        open={confirmDelete}
        title="Excluir lembrete?"
        description={
          <>
            <strong>{reminder.title}</strong> será removido permanentemente.
          </>
        }
        confirmLabel="Excluir"
        danger
        onConfirm={async () => {
          try {
            await remove.mutateAsync({ id: reminder.id, opportunityId: reminder.opportunityId });
            toast('Lembrete excluído', 'success');
          } catch (e) {
            toast(axiosMsg(e) || 'Falha ao excluir', 'error');
          } finally {
            setConfirmDelete(false);
          }
        }}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );
}

function SnoozePopover({
  t,
  onPreset,
  onCustom,
}: {
  t: ReturnType<typeof useTheme>['tokens'];
  onPreset: (p: '1h' | '3h' | 'tomorrow' | 'next-week') => void;
  onCustom: (iso: string) => void;
}) {
  const [custom, setCustom] = useState('');
  return (
    <div
      style={{
        position: 'absolute',
        top: 32,
        right: 0,
        zIndex: 30,
        width: 220,
        background: t.bgElevated,
        border: `1px solid ${t.border}`,
        borderRadius: 8,
        boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
        padding: 6,
      }}
    >
      {(['1h', '3h', 'tomorrow', 'next-week'] as const).map((p) => (
        <PresetRow
          key={p}
          t={t}
          label={p === '1h' ? '1 hora' : p === '3h' ? '3 horas' : p === 'tomorrow' ? 'Amanhã 9h' : 'Próxima semana'}
          onClick={() => onPreset(p)}
        />
      ))}
      <div style={{ borderTop: `1px solid ${t.border}`, marginTop: 6, paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <input
          type="datetime-local"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          style={{
            width: '100%',
            background: t.bgInput,
            border: `1px solid ${t.border}`,
            borderRadius: 6,
            padding: '6px 8px',
            fontSize: 12,
            color: t.text,
            outline: 'none',
            fontFamily: FONT_STACK,
          }}
        />
        <button
          type="button"
          disabled={!custom}
          onClick={() => onCustom(new Date(custom).toISOString())}
          style={{
            ...buttonGold(t),
            padding: '6px 10px',
            fontSize: 11.5,
            opacity: custom ? 1 : 0.5,
            cursor: custom ? 'pointer' : 'not-allowed',
          }}
        >
          Adiar até essa data
        </button>
      </div>
    </div>
  );
}

function PresetRow({
  t,
  label,
  onClick,
}: {
  t: ReturnType<typeof useTheme>['tokens'];
  label: string;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'block',
        width: '100%',
        padding: '7px 10px',
        background: hover ? t.bgHover : 'transparent',
        border: 'none',
        borderRadius: 6,
        color: t.text,
        fontSize: 12.5,
        cursor: 'pointer',
        fontFamily: FONT_STACK,
        textAlign: 'left',
      }}
    >
      {label}
    </button>
  );
}

// ============================================================
// NEW REMINDER MODAL
// ============================================================

const PRESETS = [
  { key: 'today-18', label: 'Hoje às 18h', hours: 18 },
  { key: 'tomorrow-9', label: 'Amanhã às 9h', hours: 9, plusDays: 1 },
  { key: 'next-monday-9', label: 'Próxima segunda 9h', hours: 9, nextMonday: true },
] as const;

function NewReminderModal({ onClose, team: _team }: { onClose: () => void; team: { id: string; name: string }[] }) {
  const { tokens: t } = useTheme();
  const create = useCreateReminder();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [opportunityId, setOpportunityId] = useState<string | null>(null);
  const [opportunityLabel, setOpportunityLabel] = useState('');
  const [oppQuery, setOppQuery] = useState('');
  const [opps, setOpps] = useState<{ id: string; title: string; contactName: string }[]>([]);
  const [oppOpen, setOppOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const oppRef = useRef<HTMLDivElement>(null);
  useClickOutside(oppRef, () => setOppOpen(false), oppOpen);

  // Busca oportunidades pra select (todas as que o user vê via boards de qualquer pipeline — usa busca via /contacts -> nope. Melhor: hit no /pipelines + board do primeiro? Pra simplificar, busca via /opportunities/:id quando o user digitar, ou liste todos via board).
  // Atalho v1: usar a busca de contatos pra encontrar o lead, depois o user picaria a opp na proxima fase. Aqui simplifico usando a primeira opp encontrada via search no board:
  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        // Busca em todos os pipelines: pega o board do primeiro pipeline ativo e filtra opp por search
        // Pra v1: chama /pipelines, pega o primeiro id, e /pipelines/:id/board?search=
        const pipelines = (await api.get<{ id: string; active: boolean }[]>('/pipelines')).data;
        const first = pipelines.find((p) => p.active) ?? pipelines[0];
        if (!first) {
          setOpps([]);
          return;
        }
        const board = (
          await api.get<{
            columns: { opportunities: { id: string; title: string; contactName: string }[] }[];
          }>(`/pipelines/${first.id}/board${oppQuery ? `?search=${encodeURIComponent(oppQuery)}` : ''}`)
        ).data;
        const flat = board.columns.flatMap((c) => c.opportunities).slice(0, 10);
        setOpps(flat);
      } catch {
        setOpps([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [oppQuery]);

  const applyPreset = (key: typeof PRESETS[number]['key']) => {
    const p = PRESETS.find((x) => x.key === key)!;
    const d = new Date();
    if ('plusDays' in p && p.plusDays) d.setDate(d.getDate() + p.plusDays);
    if ('nextMonday' in p && p.nextMonday) {
      const day = d.getDay();
      const diff = (1 - day + 7) % 7 || 7; // próxima segunda
      d.setDate(d.getDate() + diff);
    }
    d.setHours(p.hours, 0, 0, 0);
    setDueAt(toLocalInput(d));
  };

  const submit = async () => {
    setError(null);
    if (!title.trim()) return setError('Informe o título');
    if (!opportunityId) return setError('Vincule a uma oportunidade');
    if (!dueAt) return setError('Defina data e hora');
    setSubmitting(true);
    try {
      const iso = new Date(dueAt).toISOString();
      await create.mutateAsync({
        opportunityId,
        title: title.trim(),
        description: description.trim() || null,
        dueAt: iso,
      });
      toast('Lembrete criado', 'success');
      onClose();
    } catch (e) {
      setError(axiosMsg(e) || 'Falha ao criar');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Novo lembrete" width={460}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Título *">
          <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle(t)} autoFocus />
        </Field>

        <Field label="Descrição (opcional)">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            style={{ ...inputStyle(t), resize: 'vertical' }}
          />
        </Field>

        <Field label="Oportunidade *">
          <div ref={oppRef} style={{ position: 'relative' }}>
            <input
              value={opportunityLabel || oppQuery}
              onChange={(e) => {
                setOppQuery(e.target.value);
                setOpportunityLabel('');
                setOpportunityId(null);
                setOppOpen(true);
              }}
              onFocus={() => setOppOpen(true)}
              placeholder="Buscar título ou contato…"
              style={inputStyle(t)}
            />
            {oppOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: 42,
                  left: 0,
                  right: 0,
                  zIndex: 30,
                  background: t.bgElevated,
                  border: `1px solid ${t.border}`,
                  borderRadius: 8,
                  maxHeight: 240,
                  overflowY: 'auto',
                  boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
                  padding: 4,
                }}
              >
                {opps.length === 0 ? (
                  <div style={{ padding: 12, fontSize: 12, color: t.textSubtle }}>Nenhuma oportunidade.</div>
                ) : (
                  opps.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => {
                        setOpportunityId(o.id);
                        setOpportunityLabel(`${o.title} (${o.contactName})`);
                        setOppOpen(false);
                      }}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        gap: 1,
                        width: '100%',
                        padding: '8px 10px',
                        background: 'transparent',
                        border: 'none',
                        borderRadius: 6,
                        cursor: 'pointer',
                        fontFamily: FONT_STACK,
                        textAlign: 'left',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = t.bgHover)}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <span style={{ fontSize: 12.5, color: t.text }}>{o.title}</span>
                      <span style={{ fontSize: 11, color: t.textFaint }}>{o.contactName}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </Field>

        <Field label="Data e hora *">
          <input
            type="datetime-local"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            style={inputStyle(t)}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => applyPreset(p.key)}
                style={{
                  background: 'transparent',
                  border: `1px dashed ${t.border}`,
                  borderRadius: 6,
                  padding: '4px 9px',
                  fontSize: 11,
                  color: t.textDim,
                  cursor: 'pointer',
                  fontFamily: FONT_STACK,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderStyle = 'solid';
                  e.currentTarget.style.color = t.gold;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderStyle = 'dashed';
                  e.currentTarget.style.color = t.textDim;
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </Field>

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

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onClose} style={buttonGhost(t)}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            style={{ ...buttonGold(t), opacity: submitting ? 0.6 : 1 }}
          >
            {submitting ? 'Criando…' : 'Criar lembrete'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ============================================================
// EMPTY
// ============================================================

function Empty({ t, tab, onCreate }: { t: ReturnType<typeof useTheme>['tokens']; tab: Tab; onCreate: () => void }) {
  const labels: Record<Tab, { title: string; sub: string }> = {
    PENDING: { title: 'Tudo em dia!', sub: 'Você não tem lembretes pendentes no momento.' },
    OVERDUE: { title: 'Sem atrasados', sub: 'Não há lembretes vencidos esperando ação.' },
    COMPLETED: { title: 'Nenhum concluído ainda', sub: 'Marque seus lembretes como concluídos pra vê-los aqui.' },
    ALL: { title: 'Sem lembretes', sub: 'Crie seu primeiro lembrete pra começar.' },
  };
  const m = labels[tab];
  return (
    <div
      style={{
        textAlign: 'center',
        padding: 60,
        background: t.bgElevated,
        border: `1px dashed ${t.border}`,
        borderRadius: 12,
        maxWidth: 520,
      }}
    >
      <div
        style={{
          width: 50,
          height: 50,
          borderRadius: '50%',
          background: t.bgInput,
          margin: '0 auto 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icons.Bell s={22} c={t.gold} />
      </div>
      <div style={{ fontSize: 15, color: t.text, fontWeight: 500, marginBottom: 6 }}>{m.title}</div>
      <div style={{ fontSize: 12.5, color: t.textSubtle, marginBottom: 18 }}>{m.sub}</div>
      <button type="button" onClick={onCreate} style={buttonGold(t)}>
        <Icons.Plus s={12} c="#1a1300" /> Novo lembrete
      </button>
    </div>
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

function Avatar({ name, size = 22 }: { name: string; size?: number }) {
  const initials = name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #D4AF37 0%, #8a6c17 100%)',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 9.5,
        fontWeight: 600,
        flexShrink: 0,
      }}
    >
      {initials || '··'}
    </div>
  );
}

function useClickOutside(
  ref: React.RefObject<HTMLElement | null>,
  cb: () => void,
  active: boolean,
) {
  useEffect(() => {
    if (!active) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) cb();
    };
    const id = setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener('mousedown', handler);
    };
  }, [active, cb, ref]);
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
    padding: '8px 14px',
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
    padding: '7px 14px',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: FONT_STACK,
  };
}

// ============================================================
// HELPERS
// ============================================================

function groupByDate(items: Reminder[]): { label: string; items: Reminder[] }[] {
  const today = startOfDay(new Date());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dayAfter = new Date(today);
  dayAfter.setDate(dayAfter.getDate() + 2);
  const endOfWeek = new Date(today);
  endOfWeek.setDate(endOfWeek.getDate() + 7);

  const buckets: { label: string; items: Reminder[] }[] = [
    { label: 'Atrasados', items: [] },
    { label: 'Hoje', items: [] },
    { label: 'Amanhã', items: [] },
    { label: 'Esta semana', items: [] },
    { label: 'Próximas', items: [] },
    { label: 'Concluídos', items: [] },
  ];

  for (const r of items) {
    const d = new Date(r.effectiveDueAt);
    if (r.completed) {
      buckets[5]!.items.push(r);
      continue;
    }
    if (d < today) buckets[0]!.items.push(r);
    else if (d < tomorrow) buckets[1]!.items.push(r);
    else if (d < dayAfter) buckets[2]!.items.push(r);
    else if (d < endOfWeek) buckets[3]!.items.push(r);
    else buckets[4]!.items.push(r);
  }
  return buckets.filter((b) => b.items.length > 0);
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function relative(iso: string): string {
  const d = new Date(iso);
  const diff = d.getTime() - Date.now();
  const abs = Math.abs(diff);
  const future = diff > 0;
  const mins = Math.floor(abs / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return future ? `em ${mins}m` : `há ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return future ? `em ${hours}h` : `há ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return future ? `em ${days}d` : `há ${days}d`;
  return d.toLocaleDateString('pt-BR');
}

function absoluteDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('pt-BR');
}

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function axiosMsg(e: unknown): string | null {
  return axios.isAxiosError(e) ? (e.response?.data?.message ?? null) : null;
}
