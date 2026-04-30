import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { IMaskInput } from 'react-imask';
import { useTheme } from '../lib/ThemeContext';
import { Drawer } from '../components/ui/Drawer';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Pagination } from '../components/ui/Pagination';
import { toast } from '../components/ui/Toast';
import { Icons } from '../components/icons';
import { FONT_STACK } from '../lib/theme';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/useAuthStore';
import {
  buildContactsQuery,
  useBulkAssign,
  useBulkDelete,
  useBulkTag,
  useContact,
  useContacts,
  useCreateContact,
  useDeleteContact,
  useUpdateContact,
  type ContactFilters,
  type ContactInput,
  type ContactListItem,
} from '../hooks/useContacts';
import { useTags, type Tag } from '../hooks/useTags';
import { useTeam, type TeamMember } from '../hooks/useTeam';
import { StartCadenceForTarget } from '../components/cadences/StartCadenceForTarget';

const PAGE_SIZES = [25, 50, 100];

// ============================================================
// PAGE
// ============================================================

export function LeadsPage() {
  const { tokens: t } = useTheme();
  const me = useAuthStore((s) => s.user);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [ownerId, setOwnerId] = useState<string | undefined>(undefined);
  const [hasOwner, setHasOwner] = useState<boolean | undefined>(undefined);
  const [createdFrom, setCreatedFrom] = useState<string>('');
  const [createdTo, setCreatedTo] = useState<string>('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [sortBy, setSortBy] = useState<'name' | 'phone' | 'createdAt' | 'updatedAt'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);

  // ?focus=<contactId> abre o modal de edição direto (vindo das conversas)
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const focus = searchParams.get('focus');
    if (!focus) return;
    setEditingId(focus);
    const next = new URLSearchParams(searchParams);
    next.delete('focus');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  // Reseta página + seleção quando filtros mudam
  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [debouncedSearch, tagIds, ownerId, hasOwner, createdFrom, createdTo, limit]);

  const filters: ContactFilters = {
    search: debouncedSearch || undefined,
    tagIds: tagIds.length > 0 ? tagIds : undefined,
    ownerId,
    hasOwner,
    createdFrom: createdFrom || undefined,
    createdTo: createdTo || undefined,
    page,
    limit,
    sortBy,
    sortOrder,
  };

  const list = useContacts(filters);
  const tagsQ = useTags();
  const teamQ = useTeam();

  const hasActiveFilters =
    !!debouncedSearch ||
    tagIds.length > 0 ||
    ownerId !== undefined ||
    hasOwner !== undefined ||
    !!createdFrom ||
    !!createdTo;

  const clearFilters = () => {
    setSearch('');
    setTagIds([]);
    setOwnerId(undefined);
    setHasOwner(undefined);
    setCreatedFrom('');
    setCreatedTo('');
  };

  const toggleSort = (field: typeof sortBy) => {
    if (sortBy === field) setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  const exportCsv = async () => {
    try {
      const url = `/contacts/export?${buildContactsQuery({ ...filters, page: undefined, limit: undefined })}`;
      const res = await api.get<Blob>(url, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `contatos-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
    } catch (e) {
      toast(axiosMsg(e) || 'Falha ao exportar', 'error');
    }
  };

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
      <div style={{ padding: '24px 32px 16px', borderBottom: `1px solid ${t.border}` }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 16, gap: 16 }}>
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
              Leads
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.6, margin: 0, color: t.text }}>
              Contatos
            </h1>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={exportCsv} style={buttonGhost(t)}>
              Exportar CSV
            </button>
            <button type="button" onClick={() => setCreating(true)} style={buttonGold(t)}>
              <Icons.Plus s={12} c="#1a1300" /> Adicionar contato
            </button>
          </div>
        </div>

        <Toolbar
          search={search}
          onSearch={setSearch}
          tagIds={tagIds}
          onTagIds={setTagIds}
          ownerId={ownerId}
          hasOwner={hasOwner}
          onOwner={(o, h) => {
            setOwnerId(o);
            setHasOwner(h);
          }}
          createdFrom={createdFrom}
          createdTo={createdTo}
          onDates={(from, to) => {
            setCreatedFrom(from);
            setCreatedTo(to);
          }}
          tags={tagsQ.data ?? []}
          team={teamQ.data ?? []}
          hasActiveFilters={hasActiveFilters}
          onClear={clearFilters}
        />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 32px 24px' }}>
        {list.isLoading && !list.data ? (
          <Skeleton t={t} />
        ) : list.data && list.data.data.length === 0 ? (
          <Empty t={t} hasFilters={hasActiveFilters} onCreate={() => setCreating(true)} onClear={clearFilters} />
        ) : (
          <>
            <ContactsTable
              contacts={list.data?.data ?? []}
              selected={selected}
              onToggle={(id) => {
                const next = new Set(selected);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                setSelected(next);
              }}
              onToggleAll={(allChecked) => {
                if (allChecked) setSelected(new Set());
                else setSelected(new Set((list.data?.data ?? []).map((c) => c.id)));
              }}
              onRowClick={(c) => setViewingId(c.id)}
              onEdit={(c) => setEditingId(c.id)}
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSort={toggleSort}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
              <PageSizeSelect value={limit} onChange={setLimit} />
              {list.data && (
                <Pagination
                  page={list.data.page}
                  totalPages={list.data.totalPages}
                  total={list.data.total}
                  onChange={setPage}
                />
              )}
            </div>
          </>
        )}
      </div>

      {selected.size > 0 && (
        <BulkBar
          count={selected.size}
          ids={Array.from(selected)}
          tags={tagsQ.data ?? []}
          team={teamQ.data ?? []}
          currentUserId={me?.id ?? ''}
          onClear={() => setSelected(new Set())}
        />
      )}

      <ContactModal
        open={creating || editingId !== null}
        contactId={editingId}
        team={teamQ.data ?? []}
        tags={tagsQ.data ?? []}
        onClose={() => {
          setCreating(false);
          setEditingId(null);
        }}
        onOpenExisting={(id) => {
          setCreating(false);
          setEditingId(null);
          setViewingId(id);
        }}
      />

      <ContactDetailDrawer
        contactId={viewingId}
        onClose={() => setViewingId(null)}
        onEdit={(id) => {
          setViewingId(null);
          setEditingId(id);
        }}
      />
    </div>
  );
}

// ============================================================
// TOOLBAR
// ============================================================

function Toolbar({
  search,
  onSearch,
  tagIds,
  onTagIds,
  ownerId,
  hasOwner,
  onOwner,
  createdFrom,
  createdTo,
  onDates,
  tags,
  team,
  hasActiveFilters,
  onClear,
}: {
  search: string;
  onSearch: (v: string) => void;
  tagIds: string[];
  onTagIds: (v: string[]) => void;
  ownerId: string | undefined;
  hasOwner: boolean | undefined;
  onOwner: (o: string | undefined, h: boolean | undefined) => void;
  createdFrom: string;
  createdTo: string;
  onDates: (from: string, to: string) => void;
  tags: Tag[];
  team: TeamMember[];
  hasActiveFilters: boolean;
  onClear: () => void;
}) {
  const { tokens: t } = useTheme();
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flex: '1 1 280px',
          minWidth: 240,
          background: t.bgInput,
          border: `1px solid ${t.border}`,
          borderRadius: 8,
          padding: '0 12px',
          height: 36,
        }}
      >
        <Icons.Search s={14} c={t.icon} />
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Buscar por nome ou telefone…"
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: t.text,
            fontSize: 13,
            fontFamily: FONT_STACK,
          }}
        />
      </div>

      <TagsFilterChip selected={tagIds} onChange={onTagIds} tags={tags} />
      <OwnerFilterChip ownerId={ownerId} hasOwner={hasOwner} onChange={onOwner} team={team} />
      <DateRangeChip from={createdFrom} to={createdTo} onChange={onDates} />

      {hasActiveFilters && (
        <button type="button" onClick={onClear} style={{ ...buttonGhost(t), height: 36, fontSize: 12 }}>
          Limpar filtros
        </button>
      )}
    </div>
  );
}

function TagsFilterChip({
  selected,
  onChange,
  tags,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
  tags: Tag[];
}) {
  const { tokens: t } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);

  const label =
    selected.length === 0
      ? 'Tags'
      : selected.length === 1
        ? tags.find((tag) => tag.id === selected[0])?.name ?? '1 tag'
        : `${selected.length} tags`;

  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <ChipButton t={t} active={selected.length > 0} onClick={() => setOpen((v) => !v)}>
        {label}
        <Icons.ChevronD s={11} c={selected.length > 0 ? t.gold : t.textSubtle} />
      </ChipButton>
      {open && (
        <Popover>
          <div style={{ padding: 8, fontSize: 11, color: t.textFaint, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Tags
          </div>
          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
            {tags.length === 0 ? (
              <div style={{ padding: 12, fontSize: 12, color: t.textSubtle }}>Nenhuma tag cadastrada.</div>
            ) : (
              tags.map((tag) => {
                const checked = selected.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggle(tag.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '7px 10px',
                      width: '100%',
                      background: checked ? t.bgHover : 'transparent',
                      border: 'none',
                      borderRadius: 6,
                      cursor: 'pointer',
                      color: t.text,
                      fontSize: 12.5,
                      fontFamily: FONT_STACK,
                    }}
                  >
                    <Checkbox checked={checked} />
                    <span style={{ width: 7, height: 7, borderRadius: 2, background: tag.color }} />
                    {tag.name}
                  </button>
                );
              })
            )}
          </div>
          {selected.length > 0 && (
            <div style={{ borderTop: `1px solid ${t.border}`, padding: 6 }}>
              <button
                type="button"
                onClick={() => onChange([])}
                style={{ ...buttonGhost(t), width: '100%', padding: '6px 10px', fontSize: 11.5 }}
              >
                Limpar seleção
              </button>
            </div>
          )}
        </Popover>
      )}
    </div>
  );
}

function OwnerFilterChip({
  ownerId,
  hasOwner,
  onChange,
  team,
}: {
  ownerId: string | undefined;
  hasOwner: boolean | undefined;
  onChange: (o: string | undefined, h: boolean | undefined) => void;
  team: TeamMember[];
}) {
  const { tokens: t } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);

  const label = hasOwner === false
    ? 'Sem responsável'
    : ownerId
      ? team.find((u) => u.id === ownerId)?.name ?? 'Responsável'
      : 'Responsável';

  const active = !!ownerId || hasOwner !== undefined;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <ChipButton t={t} active={active} onClick={() => setOpen((v) => !v)}>
        {label}
        <Icons.ChevronD s={11} c={active ? t.gold : t.textSubtle} />
      </ChipButton>
      {open && (
        <Popover>
          <Row
            t={t}
            label="Sem responsável"
            active={hasOwner === false}
            onClick={() => {
              onChange(undefined, false);
              setOpen(false);
            }}
          />
          <div style={{ borderTop: `1px solid ${t.border}`, margin: '4px 0' }} />
          {team.length === 0 ? (
            <div style={{ padding: 12, fontSize: 12, color: t.textSubtle }}>—</div>
          ) : (
            team.map((u) => (
              <Row
                key={u.id}
                t={t}
                label={u.name}
                active={ownerId === u.id}
                onClick={() => {
                  onChange(u.id, undefined);
                  setOpen(false);
                }}
              />
            ))
          )}
          {(ownerId || hasOwner !== undefined) && (
            <div style={{ borderTop: `1px solid ${t.border}`, padding: 6, marginTop: 4 }}>
              <button
                type="button"
                onClick={() => {
                  onChange(undefined, undefined);
                  setOpen(false);
                }}
                style={{ ...buttonGhost(t), width: '100%', padding: '6px 10px', fontSize: 11.5 }}
              >
                Limpar
              </button>
            </div>
          )}
        </Popover>
      )}
    </div>
  );
}

function DateRangeChip({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  const { tokens: t } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);

  const active = !!from || !!to;
  const label = !active
    ? 'Período'
    : from && to
      ? `${formatDateBR(from)} → ${formatDateBR(to)}`
      : from
        ? `Desde ${formatDateBR(from)}`
        : `Até ${formatDateBR(to)}`;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <ChipButton t={t} active={active} onClick={() => setOpen((v) => !v)}>
        {label}
        <Icons.ChevronD s={11} c={active ? t.gold : t.textSubtle} />
      </ChipButton>
      {open && (
        <Popover wide>
          <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Field label="De">
              <input
                type="date"
                value={from}
                onChange={(e) => onChange(e.target.value, to)}
                style={inputStyle(t)}
              />
            </Field>
            <Field label="Até">
              <input
                type="date"
                value={to}
                onChange={(e) => onChange(from, e.target.value)}
                style={inputStyle(t)}
              />
            </Field>
            {active && (
              <button
                type="button"
                onClick={() => onChange('', '')}
                style={{ ...buttonGhost(t), padding: '6px 10px', fontSize: 11.5 }}
              >
                Limpar
              </button>
            )}
          </div>
        </Popover>
      )}
    </div>
  );
}

function ChipButton({
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
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 36,
        padding: '0 12px',
        background: active ? t.goldFaint : t.bgInput,
        border: `1px solid ${active ? t.gold : t.border}`,
        borderRadius: 8,
        color: active ? t.gold : t.text,
        fontSize: 12.5,
        fontWeight: 500,
        cursor: 'pointer',
        fontFamily: FONT_STACK,
      }}
    >
      {children}
    </button>
  );
}

function Popover({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  const { tokens: t } = useTheme();
  return (
    <div
      style={{
        position: 'absolute',
        top: 42,
        left: 0,
        zIndex: 30,
        width: wide ? 240 : 200,
        background: t.bgElevated,
        border: `1px solid ${t.border}`,
        borderRadius: 10,
        boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
        padding: 4,
      }}
    >
      {children}
    </div>
  );
}

function Row({
  t,
  label,
  active,
  onClick,
}: {
  t: ReturnType<typeof useTheme>['tokens'];
  label: string;
  active: boolean;
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
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        padding: '8px 10px',
        background: hover || active ? t.bgHover : 'transparent',
        border: 'none',
        borderRadius: 6,
        color: active ? t.gold : t.text,
        fontSize: 12.5,
        cursor: 'pointer',
        fontFamily: FONT_STACK,
        textAlign: 'left',
      }}
    >
      {label}
      {active && <Icons.Check s={12} c="currentColor" />}
    </button>
  );
}

function Checkbox({ checked }: { checked: boolean }) {
  const { tokens: t } = useTheme();
  return (
    <span
      style={{
        width: 14,
        height: 14,
        borderRadius: 3,
        border: `1.5px solid ${checked ? t.gold : t.borderStrong}`,
        background: checked ? t.gold : 'transparent',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {checked && (
        <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
          <path d="M2.5 6.2 5 8.7l4.5-5" stroke="#1a1300" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}

// ============================================================
// TABLE
// ============================================================

const GRID = '36px 2.2fr 1.4fr 80px 1.6fr 130px 130px 130px 60px';

function ContactsTable({
  contacts,
  selected,
  onToggle,
  onToggleAll,
  onRowClick,
  onEdit,
  sortBy,
  sortOrder,
  onSort,
}: {
  contacts: ContactListItem[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (allChecked: boolean) => void;
  onRowClick: (c: ContactListItem) => void;
  onEdit: (c: ContactListItem) => void;
  sortBy: 'name' | 'phone' | 'createdAt' | 'updatedAt';
  sortOrder: 'asc' | 'desc';
  onSort: (f: 'name' | 'phone' | 'createdAt' | 'updatedAt') => void;
}) {
  const { tokens: t } = useTheme();
  const allChecked = contacts.length > 0 && contacts.every((c) => selected.has(c.id));
  return (
    <div style={{ background: t.bgElevated, border: `1px solid ${t.border}`, borderRadius: 12, overflow: 'hidden' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: GRID,
          alignItems: 'center',
          gap: 12,
          padding: '12px 16px',
          background: t.bgInput,
          borderBottom: `1px solid ${t.border}`,
        }}
      >
        <button
          type="button"
          onClick={() => onToggleAll(allChecked)}
          aria-label="Selecionar todos"
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}
        >
          <Checkbox checked={allChecked} />
        </button>
        <SortHead t={t} active={sortBy === 'name'} order={sortOrder} onClick={() => onSort('name')}>Nome</SortHead>
        <SortHead t={t} active={sortBy === 'phone'} order={sortOrder} onClick={() => onSort('phone')}>Telefone</SortHead>
        <HeadCell t={t}>Oport.</HeadCell>
        <HeadCell t={t}>Tags</HeadCell>
        <HeadCell t={t}>Responsável</HeadCell>
        <HeadCell t={t}>Último contato</HeadCell>
        <SortHead t={t} active={sortBy === 'createdAt'} order={sortOrder} onClick={() => onSort('createdAt')}>
          Cadastro
        </SortHead>
        <HeadCell t={t} align="right">Ações</HeadCell>
      </div>
      {contacts.map((c) => (
        <ContactRow
          key={c.id}
          contact={c}
          isSelected={selected.has(c.id)}
          onToggle={() => onToggle(c.id)}
          onClick={() => onRowClick(c)}
          onEdit={() => onEdit(c)}
        />
      ))}
    </div>
  );
}

function HeadCell({
  t,
  align,
  children,
}: {
  t: ReturnType<typeof useTheme>['tokens'];
  align?: 'right';
  children: React.ReactNode;
}) {
  return (
    <span
      style={{
        fontSize: 10.5,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
        color: t.textFaint,
        fontWeight: 500,
        textAlign: align ?? 'left',
      }}
    >
      {children}
    </span>
  );
}

function SortHead({
  t,
  active,
  order,
  onClick,
  children,
}: {
  t: ReturnType<typeof useTheme>['tokens'];
  active: boolean;
  order: 'asc' | 'desc';
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        padding: 0,
        color: active ? t.text : t.textFaint,
        fontSize: 10.5,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
        fontWeight: 500,
        fontFamily: FONT_STACK,
      }}
    >
      {children}
      {active && (
        <span style={{ fontSize: 9 }}>{order === 'asc' ? '↑' : '↓'}</span>
      )}
    </button>
  );
}

function ContactRow({
  contact,
  isSelected,
  onToggle,
  onClick,
  onEdit,
}: {
  contact: ContactListItem;
  isSelected: boolean;
  onToggle: () => void;
  onClick: () => void;
  onEdit: () => void;
}) {
  const { tokens: t } = useTheme();
  const remove = useDeleteContact();
  const [hover, setHover] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [cadenceModal, setCadenceModal] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useClickOutside(menuRef, () => setMenuOpen(false), menuOpen);

  const handleDelete = async () => {
    try {
      await remove.mutateAsync(contact.id);
      toast(`${contact.name} removido`, 'success');
      setConfirmDelete(false);
    } catch (e) {
      toast(axiosMsg(e) || 'Falha ao excluir', 'error');
    }
  };

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
      style={{
        display: 'grid',
        gridTemplateColumns: GRID,
        alignItems: 'center',
        gap: 12,
        padding: '14px 16px',
        background: isSelected ? t.goldFaint : hover ? t.bgHover : 'transparent',
        borderBottom: `1px solid ${t.border}`,
        cursor: 'pointer',
      }}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}
        aria-label="Selecionar"
      >
        <Checkbox checked={isSelected} />
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <Avatar name={contact.name} size={30} />
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: t.text,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {contact.name}
          </div>
          {contact.email && (
            <div style={{ fontSize: 11, color: t.textFaint, marginTop: 1 }}>{contact.email}</div>
          )}
        </div>
      </div>
      <div style={{ fontSize: 12.5, color: t.textDim, fontVariantNumeric: 'tabular-nums' }}>
        {formatPhone(contact.phone)}
      </div>
      <div style={{ fontSize: 12.5, color: t.text, fontVariantNumeric: 'tabular-nums', textAlign: 'left' }}>
        {contact.opportunityCount}
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {contact.tags.length === 0 ? (
          <span style={{ fontSize: 11, color: t.textFaint }}>—</span>
        ) : (
          contact.tags.slice(0, 3).map((tag) => (
            <span
              key={tag.id}
              title={tag.name}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 7px',
                background: hexAlpha(tag.color, 0.14),
                color: tag.color,
                border: `1px solid ${hexAlpha(tag.color, 0.4)}`,
                borderRadius: 999,
                fontSize: 10.5,
                fontWeight: 500,
                whiteSpace: 'nowrap',
              }}
            >
              {tag.name}
            </span>
          ))
        )}
        {contact.tags.length > 3 && (
          <span style={{ fontSize: 11, color: t.textSubtle }}>+{contact.tags.length - 3}</span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        {contact.ownerName ? (
          <>
            <Avatar name={contact.ownerName} size={22} />
            <span
              style={{
                fontSize: 12,
                color: t.textDim,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {contact.ownerName}
            </span>
          </>
        ) : (
          <span style={{ fontSize: 11.5, color: t.textFaint, fontStyle: 'italic' }}>Sem dono</span>
        )}
      </div>
      <div style={{ fontSize: 11.5, color: t.textSubtle }}>
        {contact.lastInteractionAt ? formatRelative(contact.lastInteractionAt) : '—'}
      </div>
      <div style={{ fontSize: 11.5, color: t.textSubtle }}>{formatDateBR(contact.createdAt)}</div>
      <div ref={menuRef} style={{ position: 'relative', display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
          aria-label="Ações"
          style={{
            width: 26,
            height: 26,
            background: 'transparent',
            border: `1px solid ${t.border}`,
            borderRadius: 6,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
          }}
        >
          <Icons.Dot s={4} c={t.textDim} />
          <Icons.Dot s={4} c={t.textDim} />
          <Icons.Dot s={4} c={t.textDim} />
        </button>
        {menuOpen && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              right: 0,
              top: 28,
              width: 140,
              background: t.bgElevated,
              border: `1px solid ${t.border}`,
              borderRadius: 8,
              boxShadow: '0 10px 24px rgba(0,0,0,0.2)',
              padding: 4,
              zIndex: 20,
            }}
          >
            <MenuItem label="Editar" onClick={() => { setMenuOpen(false); onEdit(); }} />
            <MenuItem label="Iniciar cadência" onClick={() => { setMenuOpen(false); setCadenceModal(true); }} />
            <MenuItem label="Excluir" danger onClick={() => { setMenuOpen(false); setConfirmDelete(true); }} />
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Excluir contato?"
        description={
          <>
            <strong>{contact.name}</strong> e todas as oportunidades, conversas e mensagens vinculadas
            serão apagadas permanentemente.
          </>
        }
        confirmLabel="Excluir"
        danger
        onConfirm={handleDelete}
        onClose={() => setConfirmDelete(false)}
      />

      <StartCadenceForTarget
        open={cadenceModal}
        onClose={() => setCadenceModal(false)}
        target={{ kind: 'contact', contactId: contact.id, label: contact.name }}
      />
    </div>
  );
}

function MenuItem({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  const { tokens: t } = useTheme();
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: '100%',
        textAlign: 'left',
        padding: '7px 10px',
        background: hover ? t.bgHover : 'transparent',
        border: 'none',
        borderRadius: 6,
        fontSize: 12,
        color: danger ? t.danger : t.text,
        cursor: 'pointer',
        fontFamily: FONT_STACK,
      }}
    >
      {label}
    </button>
  );
}

function PageSizeSelect({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const { tokens: t } = useTheme();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: t.textSubtle }}>
      Por página:
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          background: t.bgInput,
          border: `1px solid ${t.border}`,
          borderRadius: 6,
          padding: '4px 8px',
          fontSize: 12,
          color: t.text,
          fontFamily: FONT_STACK,
          cursor: 'pointer',
        }}
      >
        {PAGE_SIZES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </div>
  );
}

// ============================================================
// BULK BAR
// ============================================================

function BulkBar({
  count,
  ids,
  tags,
  team,
  onClear,
}: {
  count: number;
  ids: string[];
  tags: Tag[];
  team: TeamMember[];
  currentUserId: string;
  onClear: () => void;
}) {
  const { tokens: t } = useTheme();
  const assign = useBulkAssign();
  const tag = useBulkTag();
  const remove = useBulkDelete();
  const [confirm, setConfirm] = useState(false);

  const [ownerOpen, setOwnerOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState<'add' | 'remove' | null>(null);
  const ownerRef = useRef<HTMLDivElement>(null);
  const tagRef = useRef<HTMLDivElement>(null);
  useClickOutside(ownerRef, () => setOwnerOpen(false), ownerOpen);
  useClickOutside(tagRef, () => setTagOpen(null), tagOpen !== null);

  const assignTo = async (ownerId: string | null) => {
    setOwnerOpen(false);
    try {
      const r = await assign.mutateAsync({ ids, ownerId });
      toast(`${r.affected} contato(s) atribuído(s)`, 'success');
      onClear();
    } catch (e) {
      toast(axiosMsg(e) || 'Falha ao atribuir', 'error');
    }
  };

  const tagAction = async (mode: 'add' | 'remove', tagId: string) => {
    setTagOpen(null);
    try {
      const r = await tag.mutateAsync({ ids, tagIds: [tagId], mode });
      toast(`${r.affected} contato(s) ${mode === 'add' ? 'tagueado(s)' : 'destagueado(s)'}`, 'success');
      onClear();
    } catch (e) {
      toast(axiosMsg(e) || 'Falha ao etiquetar', 'error');
    }
  };

  const handleDelete = async () => {
    try {
      const r = await remove.mutateAsync(ids);
      toast(`${r.affected} contato(s) excluído(s)`, 'success');
      setConfirm(false);
      onClear();
    } catch (e) {
      toast(axiosMsg(e) || 'Falha ao excluir', 'error');
    }
  };

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 14px',
        background: t.bgElevated,
        border: `1px solid ${t.borderStrong}`,
        borderRadius: 12,
        boxShadow: '0 12px 32px rgba(0,0,0,0.3)',
        zIndex: 25,
      }}
    >
      <span style={{ fontSize: 12.5, color: t.text, fontWeight: 500, marginRight: 4 }}>
        {count} contato{count === 1 ? '' : 's'} selecionado{count === 1 ? '' : 's'}
      </span>

      <div ref={ownerRef} style={{ position: 'relative' }}>
        <BulkBtn t={t} onClick={() => setOwnerOpen((v) => !v)}>Atribuir responsável</BulkBtn>
        {ownerOpen && (
          <div
            style={{
              position: 'absolute',
              bottom: 38,
              left: 0,
              width: 220,
              background: t.bgElevated,
              border: `1px solid ${t.border}`,
              borderRadius: 8,
              boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
              padding: 4,
              maxHeight: 280,
              overflowY: 'auto',
            }}
          >
            <Row t={t} label="Sem responsável" active={false} onClick={() => assignTo(null)} />
            <div style={{ borderTop: `1px solid ${t.border}`, margin: '4px 0' }} />
            {team.map((u) => (
              <Row key={u.id} t={t} label={u.name} active={false} onClick={() => assignTo(u.id)} />
            ))}
          </div>
        )}
      </div>

      <div ref={tagRef} style={{ position: 'relative' }}>
        <BulkBtn t={t} onClick={() => setTagOpen('add')}>Adicionar tag</BulkBtn>
        {tagOpen === 'add' && (
          <TagPicker tags={tags} onPick={(id) => tagAction('add', id)} />
        )}
      </div>
      <div style={{ position: 'relative' }}>
        <BulkBtn
          t={t}
          onClick={() => setTagOpen((s) => (s === 'remove' ? null : 'remove'))}
        >
          Remover tag
        </BulkBtn>
        {tagOpen === 'remove' && (
          <TagPicker tags={tags} onPick={(id) => tagAction('remove', id)} />
        )}
      </div>
      <BulkBtn t={t} danger onClick={() => setConfirm(true)}>
        Excluir
      </BulkBtn>
      <div style={{ width: 1, height: 22, background: t.border, margin: '0 4px' }} />
      <BulkBtn t={t} onClick={onClear}>Desmarcar todos</BulkBtn>

      <ConfirmDialog
        open={confirm}
        title={`Excluir ${count} contato${count === 1 ? '' : 's'}?`}
        description={
          <>
            Os contatos selecionados e tudo o que está vinculado (oportunidades, conversas, mensagens)
            serão apagados <strong>permanentemente</strong>.
          </>
        }
        confirmLabel="Excluir tudo"
        danger
        onConfirm={handleDelete}
        onClose={() => setConfirm(false)}
      />
    </div>
  );
}

function BulkBtn({
  t,
  onClick,
  danger,
  children,
}: {
  t: ReturnType<typeof useTheme>['tokens'];
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: hover ? t.bgHover : 'transparent',
        border: `1px solid ${danger ? hexAlpha('#f85149', 0.4) : t.border}`,
        color: danger ? t.danger : t.text,
        borderRadius: 7,
        padding: '6px 12px',
        fontSize: 12,
        fontWeight: 500,
        cursor: 'pointer',
        fontFamily: FONT_STACK,
      }}
    >
      {children}
    </button>
  );
}

function TagPicker({ tags, onPick }: { tags: Tag[]; onPick: (id: string) => void }) {
  const { tokens: t } = useTheme();
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 38,
        left: 0,
        width: 220,
        background: t.bgElevated,
        border: `1px solid ${t.border}`,
        borderRadius: 8,
        boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
        padding: 4,
        maxHeight: 280,
        overflowY: 'auto',
      }}
    >
      {tags.length === 0 ? (
        <div style={{ padding: 12, fontSize: 12, color: t.textSubtle }}>Nenhuma tag.</div>
      ) : (
        tags.map((tag) => (
          <button
            key={tag.id}
            type="button"
            onClick={() => onPick(tag.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              padding: '8px 10px',
              background: 'transparent',
              border: 'none',
              borderRadius: 6,
              color: t.text,
              fontSize: 12.5,
              cursor: 'pointer',
              fontFamily: FONT_STACK,
              textAlign: 'left',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = t.bgHover)}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <span style={{ width: 8, height: 8, borderRadius: 2, background: tag.color }} />
            {tag.name}
          </button>
        ))
      )}
    </div>
  );
}

// ============================================================
// MODAL — CREATE / EDIT
// ============================================================

const PHONE_MASKS = [
  { mask: '(00) 00000-0000' },
  { mask: '(00) 0000-0000' },
];

function ContactModal({
  open,
  contactId,
  team,
  tags,
  onClose,
  onOpenExisting,
}: {
  open: boolean;
  contactId: string | null;
  team: TeamMember[];
  tags: Tag[];
  onClose: () => void;
  onOpenExisting: (id: string) => void;
}) {
  const { tokens: t } = useTheme();
  const detail = useContact(contactId);
  const create = useCreateContact();
  const update = useUpdateContact();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [cpf, setCpf] = useState('');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [ownerId, setOwnerId] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [duplicateId, setDuplicateId] = useState<string | null>(null);
  const [showAddress, setShowAddress] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setDuplicateId(null);
    if (contactId && detail.data) {
      const d = detail.data;
      setName(d.name);
      setPhone(d.phone);
      setEmail(d.email ?? '');
      setBirthDate(d.birthDate ? d.birthDate.slice(0, 10) : '');
      setCpf(d.cpf ?? '');
      const a = d.address ?? {};
      setStreet(a.street ?? '');
      setNumber(a.number ?? '');
      setCity(a.city ?? '');
      setState(a.state ?? '');
      setZip(a.zip ?? '');
      setOwnerId(d.ownerId ?? '');
      setNotes(d.notes ?? '');
      setTagIds(d.tags.map((tag) => tag.id));
      setShowAddress(!!(a.street || a.city || a.zip));
    } else if (!contactId) {
      setName('');
      setPhone('');
      setEmail('');
      setBirthDate('');
      setCpf('');
      setStreet('');
      setNumber('');
      setCity('');
      setState('');
      setZip('');
      setOwnerId('');
      setNotes('');
      setTagIds([]);
      setShowAddress(false);
    }
  }, [open, contactId, detail.data]);

  const validate = (): string | null => {
    if (!name.trim()) return 'Nome obrigatório';
    if (!phone.replace(/\D/g, '')) return 'Telefone obrigatório';
    if (email && !/^\S+@\S+\.\S+$/.test(email)) return 'E-mail inválido';
    return null;
  };

  const submit = async () => {
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setError(null);
    setDuplicateId(null);

    const address =
      street || number || city || state || zip
        ? { street, number, city, state, zip }
        : null;

    const payload: ContactInput = {
      name: name.trim(),
      phone,
      email: email.trim() || null,
      birthDate: birthDate || null,
      cpf: cpf.replace(/\D/g, '') || null,
      address,
      notes: notes.trim() || null,
      ownerId: ownerId || null,
      tagIds,
    };

    try {
      if (contactId) {
        await update.mutateAsync({ id: contactId, ...payload });
        toast('Contato atualizado', 'success');
      } else {
        await create.mutateAsync(payload);
        toast('Contato criado', 'success');
      }
      onClose();
    } catch (e) {
      const msg = axiosMsg(e);
      const data = axios.isAxiosError(e) ? e.response?.data : null;
      if (data?.error === 'PHONE_IN_USE' && data?.contactId) {
        setDuplicateId(String(data.contactId));
      }
      setError(msg || 'Falha ao salvar');
    }
  };

  const isPending = create.isPending || update.isPending;

  return (
    <Modal open={open} onClose={onClose} title={contactId ? 'Editar contato' : 'Novo contato'} width={680}>
      {contactId && detail.isLoading ? (
        <div style={{ padding: 24, color: t.textDim }}>Carregando…</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Nome *">
              <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle(t)} autoFocus />
            </Field>
            <Field label="Telefone *">
              <IMaskInput
                mask={PHONE_MASKS}
                value={phone}
                onAccept={(v: unknown) => setPhone(String(v))}
                placeholder="(11) 99999-9999"
                style={inputStyle(t)}
              />
            </Field>
            <Field label="E-mail">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={inputStyle(t)}
                placeholder="contato@email.com"
              />
            </Field>
            <Field label="Data de nascimento">
              <input
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                style={inputStyle(t)}
              />
            </Field>
            <Field label="CPF">
              <IMaskInput
                mask="000.000.000-00"
                value={cpf}
                onAccept={(v: unknown) => setCpf(String(v))}
                placeholder="000.000.000-00"
                style={inputStyle(t)}
              />
            </Field>
            <Field label="Tags">
              <TagsMultiSelect tags={tags} selected={tagIds} onChange={setTagIds} />
            </Field>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <button
                type="button"
                onClick={() => setShowAddress((v) => !v)}
                style={{
                  display: 'flex',
                  width: '100%',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 12px',
                  background: t.bgInput,
                  border: `1px solid ${t.border}`,
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontSize: 12.5,
                  color: t.text,
                  fontFamily: FONT_STACK,
                }}
              >
                Endereço
                <span style={{ color: t.textSubtle }}>{showAddress ? '−' : '+'}</span>
              </button>
              {showAddress && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
                    <input
                      placeholder="Rua"
                      value={street}
                      onChange={(e) => setStreet(e.target.value)}
                      style={inputStyle(t)}
                    />
                    <input
                      placeholder="Número"
                      value={number}
                      onChange={(e) => setNumber(e.target.value)}
                      style={inputStyle(t)}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
                    <input
                      placeholder="Cidade"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      style={inputStyle(t)}
                    />
                    <input
                      placeholder="UF"
                      maxLength={2}
                      value={state}
                      onChange={(e) => setState(e.target.value.toUpperCase())}
                      style={inputStyle(t)}
                    />
                  </div>
                  <IMaskInput
                    mask="00000-000"
                    value={zip}
                    onAccept={(v: unknown) => setZip(String(v))}
                    placeholder="CEP"
                    style={inputStyle(t)}
                  />
                </div>
              )}
            </div>

            <Field label="Responsável">
              <select
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                style={{ ...inputStyle(t), cursor: 'pointer' }}
              >
                <option value="">Sem responsável</option>
                {team.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Observações">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={5}
                maxLength={2000}
                style={{ ...inputStyle(t), resize: 'vertical' }}
              />
            </Field>
          </div>

          {error && (
            <div style={{ gridColumn: '1 / -1' }}>
              <div
                style={{
                  fontSize: 12.5,
                  background: 'rgba(248,81,73,0.08)',
                  border: `1px solid rgba(248,81,73,0.32)`,
                  color: t.danger,
                  padding: '10px 12px',
                  borderRadius: 7,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <span>{error}</span>
                {duplicateId && (
                  <button
                    type="button"
                    onClick={() => onOpenExisting(duplicateId)}
                    style={{
                      background: t.danger,
                      color: '#fff',
                      border: 'none',
                      borderRadius: 6,
                      padding: '5px 10px',
                      fontSize: 11.5,
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontFamily: FONT_STACK,
                    }}
                  >
                    Abrir existente
                  </button>
                )}
              </div>
            </div>
          )}

          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" onClick={onClose} style={buttonGhost(t)}>
              Cancelar
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={submit}
              style={{ ...buttonGold(t), opacity: isPending ? 0.6 : 1 }}
            >
              {isPending ? 'Salvando…' : contactId ? 'Salvar' : 'Criar contato'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function TagsMultiSelect({
  tags,
  selected,
  onChange,
}: {
  tags: Tag[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const { tokens: t } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          ...inputStyle(t),
          textAlign: 'left',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          flexWrap: 'wrap',
          minHeight: 38,
        }}
      >
        {selected.length === 0 ? (
          <span style={{ color: t.textFaint }}>Selecione tags…</span>
        ) : (
          tags
            .filter((tag) => selected.includes(tag.id))
            .map((tag) => (
              <span
                key={tag.id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '2px 7px',
                  background: hexAlpha(tag.color, 0.14),
                  color: tag.color,
                  border: `1px solid ${hexAlpha(tag.color, 0.4)}`,
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 500,
                }}
              >
                {tag.name}
              </span>
            ))
        )}
      </button>
      {open && (
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
            maxHeight: 220,
            overflowY: 'auto',
            boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
            padding: 4,
          }}
        >
          {tags.length === 0 ? (
            <div style={{ padding: 12, fontSize: 12, color: t.textSubtle }}>Sem tags cadastradas.</div>
          ) : (
            tags.map((tag) => {
              const checked = selected.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggle(tag.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '7px 10px',
                    width: '100%',
                    background: checked ? t.bgHover : 'transparent',
                    border: 'none',
                    borderRadius: 6,
                    cursor: 'pointer',
                    color: t.text,
                    fontSize: 12.5,
                    fontFamily: FONT_STACK,
                  }}
                >
                  <Checkbox checked={checked} />
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: tag.color }} />
                  {tag.name}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// DETAIL DRAWER
// ============================================================

function ContactDetailDrawer({
  contactId,
  onClose,
  onEdit,
}: {
  contactId: string | null;
  onClose: () => void;
  onEdit: (id: string) => void;
}) {
  return (
    <Drawer open={contactId !== null} onClose={onClose} width={560}>
      {contactId && <DrawerInner contactId={contactId} onClose={onClose} onEdit={onEdit} />}
    </Drawer>
  );
}

function DrawerInner({ contactId, onClose, onEdit }: { contactId: string; onClose: () => void; onEdit: (id: string) => void }) {
  const { tokens: t } = useTheme();
  const detail = useContact(contactId);
  const [tab, setTab] = useState<'data' | 'opps' | 'history'>('data');

  if (detail.isLoading || !detail.data) {
    return <div style={{ padding: 24, color: t.textDim }}>Carregando…</div>;
  }
  const c = detail.data;
  const a = c.address ?? {};

  return (
    <>
      <div
        style={{
          padding: '20px 22px',
          borderBottom: `1px solid ${t.border}`,
          display: 'flex',
          alignItems: 'center',
          gap: 14,
        }}
      >
        <Avatar name={c.name} size={56} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: t.text, letterSpacing: -0.3 }}>
            {c.name}
          </div>
          <div style={{ fontSize: 12.5, color: t.textDim, marginTop: 2 }}>
            {formatPhone(c.phone)}
          </div>
        </div>
        <button type="button" onClick={() => onEdit(contactId)} style={buttonGold(t)}>
          Editar
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          style={{
            width: 30,
            height: 30,
            background: 'transparent',
            border: 'none',
            color: t.textDim,
            cursor: 'pointer',
            padding: 0,
          }}
        >
          <Icons.X s={16} c="currentColor" />
        </button>
      </div>

      <div style={{ display: 'flex', borderBottom: `1px solid ${t.border}`, padding: '0 22px' }}>
        {(['data', 'opps', 'history'] as const).map((k) => {
          const label = k === 'data' ? 'Dados' : k === 'opps' ? `Oportunidades (${c.opportunities.length})` : 'Histórico';
          const active = tab === k;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              style={{
                background: 'transparent',
                border: 'none',
                color: active ? t.gold : t.textDim,
                fontSize: 12.5,
                fontWeight: active ? 600 : 500,
                padding: '12px 14px',
                cursor: 'pointer',
                borderBottom: `2px solid ${active ? t.gold : 'transparent'}`,
                fontFamily: FONT_STACK,
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 22 }}>
        {tab === 'data' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <DataRow label="Nome" value={c.name} />
            <DataRow label="Telefone" value={formatPhone(c.phone)} />
            <DataRow label="E-mail" value={c.email || '—'} />
            <DataRow label="Data de nascimento" value={c.birthDate ? formatDateBR(c.birthDate) : '—'} />
            <DataRow label="CPF" value={c.cpf ? formatCpf(c.cpf) : '—'} />
            <DataRow
              label="Endereço"
              value={
                a.street || a.city
                  ? [`${a.street ?? ''}${a.number ? ', ' + a.number : ''}`, a.city, a.state, a.zip ? `CEP ${a.zip}` : '']
                      .filter(Boolean)
                      .join(' · ')
                  : '—'
              }
            />
            <DataRow label="Responsável" value={c.ownerName ?? 'Sem dono'} />
            <DataRow
              label="Tags"
              value={
                c.tags.length === 0 ? (
                  '—'
                ) : (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {c.tags.map((tag) => (
                      <span
                        key={tag.id}
                        style={{
                          padding: '2px 8px',
                          background: hexAlpha(tag.color, 0.14),
                          color: tag.color,
                          border: `1px solid ${hexAlpha(tag.color, 0.4)}`,
                          borderRadius: 999,
                          fontSize: 11,
                        }}
                      >
                        {tag.name}
                      </span>
                    ))}
                  </div>
                )
              }
            />
            <DataRow label="Observações" value={c.notes || '—'} multiline />
            <DataRow label="Cadastrado em" value={formatDateBR(c.createdAt)} />
          </div>
        )}
        {tab === 'opps' && (
          <div>
            {c.opportunities.length === 0 ? (
              <div style={{ fontSize: 13, color: t.textSubtle, padding: 12 }}>
                Nenhuma oportunidade vinculada.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {c.opportunities.map((o) => (
                  <div
                    key={o.id}
                    style={{
                      padding: '12px 14px',
                      background: t.bgInput,
                      border: `1px solid ${t.border}`,
                      borderRadius: 8,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: t.text, fontWeight: 500 }}>{o.title}</div>
                      <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 2 }}>
                        {o.stageName} · {formatDateBR(o.createdAt)}
                      </div>
                    </div>
                    <div style={{ fontSize: 13, color: t.gold, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                      R$ {o.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {tab === 'history' && (
          <div
            style={{
              padding: 24,
              background: t.bgInput,
              border: `1px dashed ${t.border}`,
              borderRadius: 10,
              color: t.textSubtle,
              fontSize: 13,
              textAlign: 'center',
            }}
          >
            Histórico de interações virá quando o módulo de conversas estiver pronto.
          </div>
        )}
      </div>
    </>
  );
}

function DataRow({
  label,
  value,
  multiline,
}: {
  label: string;
  value: React.ReactNode;
  multiline?: boolean;
}) {
  const { tokens: t } = useTheme();
  return (
    <div>
      <div
        style={{
          fontSize: 10.5,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          color: t.textFaint,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 13,
          color: t.text,
          whiteSpace: multiline ? 'pre-wrap' : 'normal',
          wordBreak: 'break-word',
        }}
      >
        {value}
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

function Avatar({ name, size = 30 }: { name: string; size?: number }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
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
        fontSize: size <= 22 ? 9.5 : size <= 36 ? 11 : 16,
        fontWeight: 600,
        flexShrink: 0,
      }}
    >
      {initials || '··'}
    </div>
  );
}

function Skeleton({ t }: { t: ReturnType<typeof useTheme>['tokens'] }) {
  return (
    <div style={{ background: t.bgElevated, border: `1px solid ${t.border}`, borderRadius: 12, padding: 16, opacity: 0.6 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} style={{ height: 30, background: t.bgHover, borderRadius: 6, marginBottom: 10 }} />
      ))}
    </div>
  );
}

function Empty({
  t,
  hasFilters,
  onCreate,
  onClear,
}: {
  t: ReturnType<typeof useTheme>['tokens'];
  hasFilters: boolean;
  onCreate: () => void;
  onClear: () => void;
}) {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: 60,
        background: t.bgElevated,
        border: `1px dashed ${t.border}`,
        borderRadius: 12,
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: t.bgInput,
          margin: '0 auto 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icons.Users s={24} c={t.gold} />
      </div>
      <div style={{ fontSize: 15, color: t.text, marginBottom: 6, fontWeight: 500 }}>
        {hasFilters ? 'Nenhum contato encontrado' : 'Nenhum contato cadastrado'}
      </div>
      <div style={{ fontSize: 12.5, color: t.textSubtle, marginBottom: 18 }}>
        {hasFilters
          ? 'Tente ajustar os filtros pra ampliar a busca.'
          : 'Cadastre seu primeiro contato pra começar a organizar seus leads.'}
      </div>
      {hasFilters ? (
        <button type="button" onClick={onClear} style={buttonGhost(t)}>
          Limpar filtros
        </button>
      ) : (
        <button type="button" onClick={onCreate} style={buttonGold(t)}>
          <Icons.Plus s={12} c="#1a1300" /> Cadastrar primeiro contato
        </button>
      )}
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
    padding: '10px 12px',
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
    padding: '8px 14px',
    fontSize: 12.5,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: FONT_STACK,
  };
}

function formatPhone(raw: string): string {
  if (raw.startsWith('lid:')) return 'Telefone oculto';
  const d = raw.replace(/\D/g, '');
  if (d.length === 13 && d.startsWith('55')) {
    return `+55 (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  }
  if (d.length === 12 && d.startsWith('55')) {
    return `+55 (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  }
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return raw;
}

function formatCpf(raw: string): string {
  const d = raw.replace(/\D/g, '');
  if (d.length !== 11) return raw;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function formatDateBR(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR');
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}m atrás`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h atrás`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d atrás`;
  return d.toLocaleDateString('pt-BR');
}

function hexAlpha(hex: string, alpha: number): string {
  if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return `rgba(128,128,128,${alpha})`;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function axiosMsg(e: unknown): string | null {
  return axios.isAxiosError(e) ? (e.response?.data?.message ?? null) : null;
}
