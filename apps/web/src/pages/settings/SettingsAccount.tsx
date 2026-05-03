import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useTheme } from '../../lib/ThemeContext';
import { useAuthStore } from '../../stores/useAuthStore';
import { useMePreferences } from '../../hooks/useMePreferences';
import { Modal } from '../../components/ui/Modal';
import { Switch } from '../../components/ui/Switch';
import { toast } from '../../components/ui/Toast';
import { FONT_STACK } from '../../lib/theme';

const MAX_AVATAR_BYTES = 8 * 1024 * 1024;

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '··';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function SettingsAccount() {
  const { tokens: t } = useTheme();
  return (
    <div style={{ padding: '28px 32px 40px', display: 'flex', flexDirection: 'column', gap: 36, color: t.text }}>
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 600, letterSpacing: -0.4, margin: 0, color: t.text }}>
          Minha Conta
        </h2>
        <div style={{ fontSize: 13, color: t.textDim, marginTop: 4 }}>
          Atualize seu perfil, segurança e preferências de notificação.
        </div>
      </div>

      <ProfileSection />
      <SecuritySection />
      <NotificationsSection />
      <ConnectionsSection />
    </div>
  );
}

// ============================================================
// PROFILE
// ============================================================

function ProfileSection() {
  const { tokens: t } = useTheme();
  const user = useAuthStore((s) => s.user);
  const patchProfile = useAuthStore((s) => s.patchProfile);
  const uploadAvatar = useAuthStore((s) => s.uploadAvatar);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name);
      setEmail(user.email);
      setPhone(user.phone ?? '');
    }
  }, [user]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const dirty =
    name.trim() !== (user?.name ?? '').trim() ||
    email.trim() !== (user?.email ?? '').trim() ||
    (phone ?? '').trim() !== (user?.phone ?? '').trim();

  const handlePickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast('Use JPG, PNG ou WEBP', 'error');
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast('Arquivo excede 8MB', 'error');
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    setPendingFile(file);
  };

  const cancelPreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPendingFile(null);
  };

  const confirmAvatar = async () => {
    if (!pendingFile) return;
    setUploading(true);
    try {
      await uploadAvatar(pendingFile);
      toast('Foto atualizada', 'success');
      cancelPreview();
    } catch (e) {
      const msg = axios.isAxiosError(e) ? e.response?.data?.message : null;
      toast(msg || 'Falha ao enviar foto', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await patchProfile({ name: name.trim(), email: email.trim(), phone: phone.trim() || null });
      toast('Perfil salvo', 'success');
    } catch (e) {
      const msg = axios.isAxiosError(e) ? e.response?.data?.message : null;
      toast(msg || 'Falha ao salvar', 'error');
    } finally {
      setSaving(false);
    }
  };

  const avatarSrc = previewUrl ?? (user?.avatar ? `/api${user.avatar}` : null);

  return (
    <Section
      title="Perfil"
      description="Como você aparece para sua equipe e nos relatórios."
    >
      <div style={{ display: 'flex', gap: 28, alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 120,
              height: 120,
              borderRadius: '50%',
              background: avatarSrc ? t.bgInput : 'linear-gradient(135deg,#D4AF37,#8a6c17)',
              border: `1px solid ${t.border}`,
              overflow: 'hidden',
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: 36,
              fontWeight: 600,
            }}
          >
            {avatarSrc ? (
              <img
                src={avatarSrc}
                alt="Avatar"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              initialsOf(user?.name ?? '')
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handlePickFile}
            style={{ display: 'none' }}
          />
          {pendingFile ? (
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                onClick={confirmAvatar}
                disabled={uploading}
                style={{
                  ...buttonGold(t),
                  padding: '6px 12px',
                  fontSize: 11.5,
                  cursor: uploading ? 'wait' : 'pointer',
                }}
              >
                {uploading ? 'Enviando…' : 'Confirmar'}
              </button>
              <button
                type="button"
                onClick={cancelPreview}
                disabled={uploading}
                style={{ ...buttonGhost(t), padding: '6px 12px', fontSize: 11.5 }}
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              style={{ ...buttonGhost(t), padding: '6px 12px', fontSize: 11.5 }}
            >
              Alterar foto
            </button>
          )}
          <div style={{ fontSize: 10.5, color: t.textFaint }}>
            JPG, PNG ou WEBP · até 8MB · será otimizada automaticamente
          </div>
        </div>

        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Nome">
            <input style={inputStyle(t)} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="E-mail">
            <input
              type="email"
              style={inputStyle(t)}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Telefone" full>
            <input
              style={inputStyle(t)}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(11) 9 9999-9999"
            />
          </Field>
          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={handleSave}
              disabled={!dirty || saving}
              style={{
                ...buttonGold(t),
                opacity: !dirty || saving ? 0.55 : 1,
                cursor: !dirty || saving ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? 'Salvando…' : 'Salvar alterações'}
            </button>
          </div>
        </div>
      </div>
    </Section>
  );
}

// ============================================================
// SECURITY
// ============================================================

function SecuritySection() {
  const { tokens: t } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <Section
      title="Segurança"
      description="Mantenha sua conta protegida com uma senha forte."
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: t.text }}>Senha</div>
          <div style={{ fontSize: 12, color: t.textSubtle, marginTop: 2 }}>
            Trocar a senha encerra todas as outras sessões abertas.
          </div>
        </div>
        <button type="button" onClick={() => setOpen(true)} style={buttonGhost(t)}>
          Alterar senha
        </button>
      </div>

      <PasswordModal open={open} onClose={() => setOpen(false)} />
    </Section>
  );
}

function PasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { tokens: t } = useTheme();
  const changePassword = useAuthStore((s) => s.changePassword);
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setCurrent('');
    setNew('');
    setConfirm('');
    setError(null);
  };

  useEffect(() => {
    if (!open) reset();
  }, [open]);

  const validate = (): string | null => {
    if (!currentPassword) return 'Informe a senha atual';
    if (newPassword.length < 8) return 'A nova senha deve ter ao menos 8 caracteres';
    if (!/[a-zA-Z]/.test(newPassword)) return 'Inclua ao menos uma letra';
    if (!/[0-9]/.test(newPassword)) return 'Inclua ao menos um número';
    if (newPassword === currentPassword) return 'A nova senha não pode ser igual à atual';
    if (newPassword !== confirm) return 'A confirmação não confere';
    return null;
  };

  const submit = async () => {
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const r = await changePassword({ currentPassword, newPassword });
      toast(
        r.sessionsClosed > 0
          ? `Senha alterada — ${r.sessionsClosed} outra(s) sessão(ões) encerradas`
          : 'Senha alterada',
        'success',
      );
      onClose();
    } catch (e) {
      const msg = axios.isAxiosError(e) ? e.response?.data?.message : null;
      setError(msg || 'Falha ao alterar senha');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Alterar senha">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Senha atual">
          <input
            type="password"
            style={inputStyle(t)}
            value={currentPassword}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
          />
        </Field>
        <Field label="Nova senha">
          <input
            type="password"
            style={inputStyle(t)}
            value={newPassword}
            onChange={(e) => setNew(e.target.value)}
            autoComplete="new-password"
          />
          <div style={{ fontSize: 11, color: t.textFaint, marginTop: 4 }}>
            Mínimo 8 caracteres, com letras e números.
          </div>
        </Field>
        <Field label="Confirmar nova senha">
          <input
            type="password"
            style={inputStyle(t)}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
          />
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
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <button type="button" onClick={onClose} disabled={saving} style={buttonGhost(t)}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            style={{
              ...buttonGold(t),
              cursor: saving ? 'wait' : 'pointer',
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? 'Salvando…' : 'Confirmar'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ============================================================
// NOTIFICATIONS
// ============================================================

function NotificationsSection() {
  const { notifications, setNotification } = useMePreferences();

  const handleToggle = async (key: 'sound' | 'desktop' | 'email', value: boolean) => {
    if (key === 'desktop' && value) {
      try {
        if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
          const result = await Notification.requestPermission();
          if (result !== 'granted') {
            toast('Permissão de notificação negada pelo navegador', 'error');
            return;
          }
        } else if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
          toast('Permissão de notificação bloqueada — ajuste nas configurações do navegador', 'error');
          return;
        }
      } catch {
        // se Notification não estiver disponível, segue salvando assim mesmo
      }
    }
    try {
      await setNotification(key, value);
    } catch {
      toast('Falha ao salvar preferência', 'error');
    }
  };

  return (
    <Section
      title="Notificações"
      description="Escolha como quer ser avisado de novas mensagens e lembretes."
    >
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <ToggleRow
          title="Som ao receber notificações"
          description="Toca um som curto quando algo nuevo chegar."
          checked={notifications.sound ?? true}
          onChange={(v) => handleToggle('sound', v)}
        />
        <ToggleRow
          title="Notificações no desktop"
          description="Mostra um aviso do sistema mesmo com a aba em segundo plano."
          checked={notifications.desktop ?? true}
          onChange={(v) => handleToggle('desktop', v)}
        />
        <ToggleRow
          title="Receber por e-mail"
          description="Resumos diários e atividades importantes."
          checked={notifications.email ?? true}
          onChange={(v) => handleToggle('email', v)}
        />
      </div>
    </Section>
  );
}

// ============================================================
// CONNECTIONS (placeholder Fase 9)
// ============================================================

function ConnectionsSection() {
  const { tokens: t } = useTheme();
  return (
    <Section
      title="Conexões WhatsApp atribuídas"
      description="As conexões que o admin liberou para você."
    >
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
        Nenhuma conexão atribuída.
      </div>
    </Section>
  );
}

// ============================================================
// PRIMITIVES
// ============================================================

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  const { tokens: t } = useTheme();
  return (
    <section
      style={{
        background: t.bgElevated,
        border: `1px solid ${t.border}`,
        borderRadius: 14,
        padding: 24,
      }}
    >
      <div style={{ marginBottom: 18 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: t.text, margin: 0, letterSpacing: -0.2 }}>
          {title}
        </h3>
        <div style={{ fontSize: 12, color: t.textSubtle, marginTop: 3 }}>{description}</div>
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  full,
  children,
}: {
  label: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  const { tokens: t } = useTheme();
  return (
    <div style={{ gridColumn: full ? '1 / -1' : 'auto' }}>
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

function ToggleRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const { tokens: t } = useTheme();
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        padding: '14px 0',
        borderTop: `1px solid ${t.border}`,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: t.text }}>{title}</div>
        <div style={{ fontSize: 12, color: t.textSubtle, marginTop: 2 }}>{description}</div>
      </div>
      <Switch checked={checked} onChange={onChange} ariaLabel={title} />
    </div>
  );
}

function inputStyle(t: ReturnType<typeof useTheme>['tokens']): React.CSSProperties {
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

function buttonGold(t: ReturnType<typeof useTheme>['tokens']): React.CSSProperties {
  return {
    background: t.gold,
    color: '#1a1300',
    border: 'none',
    borderRadius: 8,
    padding: '9px 16px',
    fontSize: 12.5,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: FONT_STACK,
    transition: 'opacity 120ms ease',
  };
}

function buttonGhost(t: ReturnType<typeof useTheme>['tokens']): React.CSSProperties {
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
