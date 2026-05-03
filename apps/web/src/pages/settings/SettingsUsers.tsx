import { useEffect, useState } from 'react';
import axios from 'axios';
import { useTheme } from '../../lib/ThemeContext';
import { Modal } from '../../components/ui/Modal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { toast } from '../../components/ui/Toast';
import { Icons } from '../../components/icons';
import { FONT_STACK } from '../../lib/theme';
import { useAuthStore } from '../../stores/useAuthStore';
import {
  useAdminUsers,
  useCreateAdminUser,
  useResetAdminUserPassword,
  useSetUserConnections,
  useUpdateAdminUser,
  useUserConnections,
  type AdminUser,
} from '../../hooks/useAdminUsers';
import { useWhatsAppConnections } from '../../hooks/useWhatsApp';

const ROLE_LABEL: Record<AdminUser['role'], string> = {
  ADMIN: 'Administrador',
  COMMERCIAL: 'Comercial',
  RECEPTION: 'Recepção',
};

const ROLE_COLOR: Record<AdminUser['role'], string> = {
  ADMIN: '#D4AF37',
  COMMERCIAL: '#3b82f6',
  RECEPTION: '#22c55e',
};

function axiosMsg(e: unknown): string | null {
  return axios.isAxiosError(e) ? e.response?.data?.message ?? null : null;
}

export function SettingsUsers() {
  const { tokens: t } = useTheme();
  const me = useAuthStore((s) => s.user);
  const users = useAdminUsers();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [resetting, setResetting] = useState<AdminUser | null>(null);
  const [managingConnections, setManagingConnections] = useState<AdminUser | null>(null);
  const [confirmActive, setConfirmActive] = useState<{ user: AdminUser; activate: boolean } | null>(null);

  const update = useUpdateAdminUser();

  const toggleActive = async () => {
    if (!confirmActive) return;
    try {
      await update.mutateAsync({ id: confirmActive.user.id, active: confirmActive.activate });
      toast(confirmActive.activate ? 'Usuário ativado' : 'Usuário desativado', 'success');
      setConfirmActive(null);
    } catch (e) {
      toast(axiosMsg(e) || 'Falha ao alterar status', 'error');
    }
  };

  return (
    <div style={{ padding: '28px 32px 40px', color: t.text }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 600, letterSpacing: -0.4, margin: 0, color: t.text }}>
            Usuários
          </h2>
          <div style={{ fontSize: 13, color: t.textDim, marginTop: 4 }}>
            Gerencie a equipe que tem acesso ao Lumen CRM.
          </div>
        </div>
        <button type="button" onClick={() => setCreating(true)} style={buttonGold(t)}>
          <Icons.Plus s={12} c="#1a1300" /> Novo usuário
        </button>
      </div>

      {users.isLoading ? (
        <div style={{ color: t.textDim, fontSize: 13, padding: 24 }}>Carregando…</div>
      ) : !users.data || users.data.length === 0 ? (
        <div
          style={{
            border: `1px dashed ${t.border}`,
            borderRadius: 10,
            padding: 60,
            textAlign: 'center',
            color: t.textDim,
            fontSize: 13,
          }}
        >
          Nenhum usuário cadastrado.
        </div>
      ) : (
        <div style={{ border: `1px solid ${t.border}`, borderRadius: 10, overflow: 'hidden', background: t.bgElevated }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: t.bg }}>
                <Th t={t}>Usuário</Th>
                <Th t={t}>Função</Th>
                <Th t={t}>Status</Th>
                <Th t={t}>Último acesso</Th>
                <Th t={t} align="right">Ações</Th>
              </tr>
            </thead>
            <tbody>
              {users.data.map((u) => {
                const isMe = u.id === me?.id;
                return (
                  <tr key={u.id} style={{ borderTop: `1px solid ${t.border}` }}>
                    <Td t={t}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Avatar name={u.name} avatar={u.avatar} t={t} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, color: t.text, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                            {u.name}
                            {isMe && (
                              <span style={{
                                fontSize: 9, padding: '1px 6px', borderRadius: 999,
                                background: 'rgba(212,175,55,0.18)', color: t.gold,
                                fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase',
                              }}>
                                Você
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 11.5, color: t.textDim, marginTop: 2 }}>{u.email}</div>
                        </div>
                      </div>
                    </Td>
                    <Td t={t}>
                      <RoleBadge role={u.role} />
                    </Td>
                    <Td t={t}>
                      <StatusBadge active={u.active} />
                    </Td>
                    <Td t={t}>
                      <span style={{ color: t.textDim, fontSize: 12 }}>
                        {u.lastLogin ? formatRel(u.lastLogin) : '—'}
                      </span>
                    </Td>
                    <Td t={t} align="right">
                      <div style={{ display: 'inline-flex', gap: 4 }}>
                        <button
                          type="button"
                          title="Editar"
                          onClick={() => setEditing(u)}
                          style={iconBtn(t)}
                        >
                          <Icons.Edit s={12} c={t.textDim} />
                        </button>
                        <button
                          type="button"
                          title="Conexões WhatsApp"
                          onClick={() => setManagingConnections(u)}
                          style={iconBtn(t)}
                        >
                          <Icons.Phone s={12} c={t.textDim} />
                        </button>
                        <button
                          type="button"
                          title="Resetar senha"
                          onClick={() => setResetting(u)}
                          style={iconBtn(t)}
                        >
                          <Icons.Key s={12} c={t.textDim} />
                        </button>
                        <button
                          type="button"
                          title={u.active ? 'Desativar' : 'Ativar'}
                          disabled={isMe && u.active}
                          onClick={() => setConfirmActive({ user: u, activate: !u.active })}
                          style={{
                            ...iconBtn(t),
                            opacity: isMe && u.active ? 0.4 : 1,
                            cursor: isMe && u.active ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {u.active ? <Icons.Pause s={12} c={t.danger} /> : <Icons.Play s={12} c={t.success} />}
                        </button>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <UserModal
        open={creating || editing !== null}
        user={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />

      {resetting && (
        <ResetPasswordModal user={resetting} onClose={() => setResetting(null)} />
      )}

      {managingConnections && (
        <ConnectionsModal
          user={managingConnections}
          onClose={() => setManagingConnections(null)}
        />
      )}

      {confirmActive && (
        <ConfirmDialog
          open
          onClose={() => setConfirmActive(null)}
          onConfirm={toggleActive}
          title={confirmActive.activate ? 'Ativar usuário?' : 'Desativar usuário?'}
          description={
            confirmActive.activate
              ? `${confirmActive.user.name} poderá entrar no sistema novamente.`
              : `${confirmActive.user.name} não poderá mais entrar no sistema. Sessões ativas continuam até o token expirar.`
          }
          confirmLabel={confirmActive.activate ? 'Ativar' : 'Desativar'}
          danger={!confirmActive.activate}
        />
      )}
    </div>
  );
}

// =================================================================
// MODAIS
// =================================================================

function UserModal({ open, user, onClose }: { open: boolean; user: AdminUser | null; onClose: () => void }) {
  const { tokens: t } = useTheme();
  const create = useCreateAdminUser();
  const update = useUpdateAdminUser();
  const me = useAuthStore((s) => s.user);

  const editing = user !== null;
  const isMe = user?.id === me?.id;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<AdminUser['role']>('COMMERCIAL');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    if (!open) return;
    if (user) {
      setName(user.name);
      setEmail(user.email);
      setRole(user.role);
      setPhone(user.phone ?? '');
      setPassword('');
    } else {
      setName('');
      setEmail('');
      setPassword('');
      setRole('COMMERCIAL');
      setPhone('');
    }
  }, [open, user]);

  const submit = async () => {
    try {
      if (editing && user) {
        await update.mutateAsync({
          id: user.id,
          name: name.trim(),
          role,
          phone: phone.trim() || null,
        });
        toast('Usuário atualizado', 'success');
      } else {
        await create.mutateAsync({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
          role,
          phone: phone.trim() || null,
        });
        toast('Usuário criado', 'success');
      }
      onClose();
    } catch (e) {
      toast(axiosMsg(e) || 'Falha ao salvar', 'error');
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Editar usuário' : 'Novo usuário'} width={460}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Nome">
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} style={input(t)} />
        </Field>
        <Field label="Email">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={editing}
            style={{ ...input(t), opacity: editing ? 0.6 : 1, cursor: editing ? 'not-allowed' : 'text' }}
          />
          {editing && (
            <div style={{ fontSize: 10.5, color: t.textFaint, marginTop: 4 }}>Email não pode ser alterado.</div>
          )}
        </Field>
        {!editing && (
          <Field label="Senha inicial (mínimo 8 caracteres)">
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={input(t)} />
          </Field>
        )}
        <Field label="Função">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as AdminUser['role'])}
            disabled={isMe}
            style={{ ...input(t), opacity: isMe ? 0.6 : 1 }}
          >
            <option value="ADMIN">Administrador</option>
            <option value="COMMERCIAL">Comercial</option>
            <option value="RECEPTION">Recepção</option>
          </select>
          {isMe && (
            <div style={{ fontSize: 10.5, color: t.textFaint, marginTop: 4 }}>
              Você não pode rebaixar a si mesmo.
            </div>
          )}
        </Field>
        <Field label="Telefone (opcional)">
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+55 11 99999-9999"
            style={input(t)}
          />
        </Field>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
          <button type="button" onClick={onClose} style={buttonGhost(t)}>Cancelar</button>
          <button
            type="button"
            onClick={submit}
            disabled={create.isPending || update.isPending}
            style={buttonGold(t)}
          >
            {create.isPending || update.isPending ? 'Salvando…' : editing ? 'Salvar' : 'Criar'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ResetPasswordModal({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const { tokens: t } = useTheme();
  const reset = useResetAdminUserPassword();
  const me = useAuthStore((s) => s.user);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const submit = async () => {
    if (password.length < 8) return toast('Senha deve ter no mínimo 8 caracteres', 'error');
    if (password !== confirm) return toast('Senhas não conferem', 'error');
    try {
      await reset.mutateAsync({ id: user.id, password });
      toast('Senha redefinida', 'success');
      onClose();
    } catch (e) {
      toast(axiosMsg(e) || 'Falha ao redefinir', 'error');
    }
  };

  const isMe = user.id === me?.id;

  return (
    <Modal open onClose={onClose} title={`Redefinir senha — ${user.name}`} width={420}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 12, color: t.textDim, lineHeight: 1.5 }}>
          {isMe
            ? 'Você está alterando sua própria senha. Sua sessão atual permanece ativa.'
            : 'A nova senha será aplicada imediatamente e todas as sessões ativas desse usuário serão encerradas.'}
        </div>
        <Field label="Nova senha">
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={input(t)} autoFocus />
        </Field>
        <Field label="Confirme">
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} style={input(t)} />
        </Field>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
          <button type="button" onClick={onClose} style={buttonGhost(t)}>Cancelar</button>
          <button type="button" onClick={submit} disabled={reset.isPending} style={buttonGold(t)}>
            {reset.isPending ? 'Salvando…' : 'Redefinir'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ConnectionsModal({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const { tokens: t } = useTheme();
  const allConnections = useWhatsAppConnections();
  const assigned = useUserConnections(user.id);
  const setConnections = useSetUserConnections();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!initialized && assigned.data) {
      setSelected(new Set(assigned.data.map((c) => c.id)));
      setInitialized(true);
    }
  }, [assigned.data, initialized]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = async () => {
    try {
      await setConnections.mutateAsync({ userId: user.id, connectionIds: Array.from(selected) });
      toast(`Conexões atualizadas (${selected.size})`, 'success');
      onClose();
    } catch (e) {
      toast(axiosMsg(e) || 'Falha ao salvar', 'error');
    }
  };

  const list = allConnections.data ?? [];
  const official = list.filter((c) => c.type === 'OFFICIAL');
  const unofficial = list.filter((c) => c.type === 'UNOFFICIAL');

  return (
    <Modal open onClose={onClose} title={`Conexões — ${user.name}`} width={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 12, color: t.textDim, lineHeight: 1.5 }}>
          Marque as conexões WhatsApp que esse usuário pode usar pra enviar e receber mensagens.
          Sem nenhuma conexão marcada, ele não vê conversas. Admins enxergam tudo independente.
        </div>

        {allConnections.isLoading ? (
          <div style={{ fontSize: 12, color: t.textDim, padding: 16 }}>Carregando…</div>
        ) : list.length === 0 ? (
          <div style={{
            border: `1px dashed ${t.border}`, borderRadius: 8,
            padding: 24, textAlign: 'center', fontSize: 12.5, color: t.textDim,
          }}>
            Nenhuma conexão cadastrada. Cadastre em /whatsapp primeiro.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxHeight: 380, overflowY: 'auto' }}>
            {official.length > 0 && (
              <ConnectionGroup
                t={t}
                title="API Oficial (Meta)"
                accent="#D4AF37"
                connections={official}
                selected={selected}
                onToggle={toggle}
              />
            )}
            {unofficial.length > 0 && (
              <ConnectionGroup
                t={t}
                title="Não Oficial (Baileys)"
                accent="#94a3b8"
                connections={unofficial}
                selected={selected}
                onToggle={toggle}
              />
            )}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
          <span style={{ fontSize: 11.5, color: t.textDim }}>
            {selected.size} de {list.length} marcada{selected.size === 1 ? '' : 's'}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={onClose} style={buttonGhost(t)}>Cancelar</button>
            <button
              type="button"
              onClick={submit}
              disabled={setConnections.isPending || !initialized}
              style={buttonGold(t)}
            >
              {setConnections.isPending ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function ConnectionGroup({
  t,
  title,
  accent,
  connections,
  selected,
  onToggle,
}: {
  t: ReturnType<typeof useTheme>['tokens'];
  title: string;
  accent: string;
  connections: { id: string; name: string; phone: string | null; status: string; active: boolean }[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <div>
      <div style={{
        fontSize: 10.5, fontWeight: 700, color: accent,
        textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6,
      }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {connections.map((c) => {
          const checked = selected.has(c.id);
          return (
            <label
              key={c.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px', borderRadius: 7,
                background: checked ? `${accent}14` : 'transparent',
                border: `1px solid ${checked ? `${accent}66` : t.border}`,
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(c.id)}
                style={{ accentColor: accent, margin: 0 }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, color: t.text, fontWeight: 500 }}>
                  {c.name}
                </div>
                <div style={{ fontSize: 11, color: t.textDim, marginTop: 2 }}>
                  {c.phone ?? 'sem número'} · {c.status}
                  {!c.active && ' · INATIVA'}
                </div>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}

// =================================================================
// PRIMITIVES
// =================================================================

function Avatar({ name, avatar, t }: { name: string; avatar: string | null; t: ReturnType<typeof useTheme>['tokens'] }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((p) => p[0] ?? '').join('').toUpperCase();
  // Paths internos (/uploads/...) precisam do prefixo /api pro proxy do Vite.
  // Externos (https://...) passam direto.
  const src = avatar?.startsWith('/uploads/') ? `/api${avatar}` : avatar;
  if (src) {
    return <img src={src} alt={name} style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />;
  }
  return (
    <div style={{
      width: 32, height: 32, borderRadius: '50%',
      background: t.bgInput, color: t.textDim,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 11, fontWeight: 600, flexShrink: 0,
    }}>
      {initials || '··'}
    </div>
  );
}

function RoleBadge({ role }: { role: AdminUser['role'] }) {
  const c = ROLE_COLOR[role];
  return (
    <span style={{
      fontSize: 10.5, padding: '3px 8px', borderRadius: 999,
      background: `${c}26`, color: c, fontWeight: 600,
      letterSpacing: 0.4, textTransform: 'uppercase',
    }}>
      {ROLE_LABEL[role]}
    </span>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  const c = active ? '#10b981' : '#94a3b8';
  return (
    <span style={{
      fontSize: 10.5, padding: '3px 8px', borderRadius: 999,
      background: `${c}26`, color: c, fontWeight: 600,
    }}>
      {active ? 'Ativo' : 'Inativo'}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const { tokens: t } = useTheme();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 11.5, fontWeight: 500, color: t.textDim }}>{label}</label>
      {children}
    </div>
  );
}

function Th({ t, children, align }: { t: ReturnType<typeof useTheme>['tokens']; children: React.ReactNode; align?: 'right' }) {
  return (
    <th style={{
      padding: '10px 14px', textAlign: align ?? 'left',
      fontSize: 10.5, fontWeight: 500, color: t.textDim,
      textTransform: 'uppercase', letterSpacing: 0.5,
    }}>
      {children}
    </th>
  );
}

function Td({ t: _t, children, align }: { t: ReturnType<typeof useTheme>['tokens']; children: React.ReactNode; align?: 'right' }) {
  return <td style={{ padding: '10px 14px', textAlign: align ?? 'left' }}>{children}</td>;
}

function formatRel(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `há ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `há ${days}d`;
  return d.toLocaleDateString('pt-BR');
}

type Tk = ReturnType<typeof useTheme>['tokens'];

const input = (t: Tk) => ({
  width: '100%', padding: '9px 12px', borderRadius: 8,
  background: t.bgInput, color: t.text,
  border: `1px solid ${t.border}`, fontSize: 13,
  outline: 'none' as const, fontFamily: FONT_STACK,
});

const buttonGold = (t: Tk) => ({
  display: 'inline-flex' as const, alignItems: 'center' as const, gap: 6,
  padding: '8px 14px', borderRadius: 8,
  background: t.gold, color: '#1a1300',
  border: 'none', fontSize: 13, fontWeight: 600,
  cursor: 'pointer' as const, fontFamily: FONT_STACK,
});

const buttonGhost = (t: Tk) => ({
  padding: '8px 14px', borderRadius: 8,
  background: 'transparent', color: t.text,
  border: `1px solid ${t.border}`, fontSize: 13,
  cursor: 'pointer' as const, fontFamily: FONT_STACK,
});

const iconBtn = (t: Tk) => ({
  display: 'inline-flex' as const, alignItems: 'center' as const, justifyContent: 'center' as const,
  width: 28, height: 28, borderRadius: 6,
  background: 'transparent', border: `1px solid ${t.border}`,
  cursor: 'pointer' as const,
});
