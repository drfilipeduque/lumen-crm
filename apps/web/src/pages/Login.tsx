import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import axios from 'axios';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTheme } from '../lib/ThemeContext';
import { useAuthStore } from '../stores/useAuthStore';
import { FONT_STACK } from '../lib/theme';

const schema = z.object({
  email: z.string().min(1, 'Informe seu e-mail').email('E-mail inválido'),
  password: z.string().min(1, 'Informe sua senha'),
  remember: z.boolean().optional(),
});

type FormData = z.infer<typeof schema>;

export function LoginPage() {
  const { tokens: t, isDark, toggle } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const login = useAuthStore((s) => s.login);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '', remember: true },
  });

  const onSubmit = handleSubmit(async (data) => {
    setServerError(null);
    try {
      await login(data.email, data.password);
      const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
      navigate(from && from !== '/login' ? from : '/dashboard', { replace: true });
    } catch (e) {
      const msg =
        axios.isAxiosError(e) && e.response?.data?.message
          ? String(e.response.data.message)
          : 'Não foi possível entrar. Tente novamente.';
      setServerError(msg);
    }
  });

  const inputBase: React.CSSProperties = {
    width: '100%',
    background: t.bgInput,
    border: `1px solid ${t.border}`,
    borderRadius: 10,
    padding: '11px 13px',
    fontSize: 14,
    color: t.text,
    outline: 'none',
    fontFamily: FONT_STACK,
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: t.bg,
        color: t.text,
        fontFamily: FONT_STACK,
        display: 'flex',
        flexDirection: 'column',
        WebkitFontSmoothing: 'antialiased',
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          padding: '18px 24px',
        }}
      >
        <button
          type="button"
          onClick={toggle}
          aria-label="Alternar tema"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: t.bgElevated,
            border: `1px solid ${t.border}`,
            borderRadius: 8,
            padding: '7px 12px',
            color: t.textDim,
            fontSize: 12,
            cursor: 'pointer',
            fontFamily: FONT_STACK,
          }}
        >
          <span style={{ fontSize: 14, lineHeight: 1 }}>{isDark ? '☀' : '☾'}</span>
          {isDark ? 'Claro' : 'Escuro'}
        </button>
      </header>

      <main
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <div style={{ width: '100%', maxWidth: 380 }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                background: t.gold,
                margin: '0 auto 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 26,
                fontWeight: 700,
                color: '#1a1300',
                letterSpacing: -1,
                boxShadow: '0 6px 18px rgba(212,175,55,0.25)',
              }}
            >
              L
            </div>
            <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.5, color: t.text }}>
              Lumen <span style={{ color: t.gold }}>CRM</span>
            </div>
            <div style={{ fontSize: 13, color: t.textDim, marginTop: 6 }}>
              Acesse sua conta para continuar
            </div>
          </div>

          <form
            onSubmit={onSubmit}
            style={{
              background: t.bgElevated,
              border: `1px solid ${t.border}`,
              borderRadius: 14,
              padding: 24,
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
            noValidate
          >
            {serverError && (
              <div
                role="alert"
                style={{
                  fontSize: 12.5,
                  background: 'rgba(248, 81, 73, 0.08)',
                  border: `1px solid rgba(248, 81, 73, 0.32)`,
                  color: t.danger,
                  padding: '9px 12px',
                  borderRadius: 8,
                }}
              >
                {serverError}
              </div>
            )}

            <Field label="E-mail" error={errors.email?.message}>
              <input
                type="email"
                autoComplete="email"
                placeholder="seu@email.com"
                style={inputBase}
                {...register('email')}
              />
            </Field>

            <Field label="Senha" error={errors.password?.message}>
              <input
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                style={inputBase}
                {...register('password')}
              />
            </Field>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: 12.5,
              }}
            >
              <label style={{ display: 'flex', alignItems: 'center', gap: 7, color: t.textDim, cursor: 'pointer' }}>
                <input type="checkbox" {...register('remember')} style={{ accentColor: t.gold }} />
                Lembrar-me
              </label>
              <a
                href="#"
                onClick={(e) => e.preventDefault()}
                style={{ color: t.gold, textDecoration: 'none', fontWeight: 500 }}
              >
                Esqueci minha senha
              </a>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                marginTop: 4,
                background: isSubmitting ? t.goldFaint : t.gold,
                color: '#1a1300',
                border: 'none',
                borderRadius: 10,
                padding: '12px 14px',
                fontSize: 14,
                fontWeight: 600,
                cursor: isSubmitting ? 'wait' : 'pointer',
                fontFamily: FONT_STACK,
                transition: 'background 120ms ease',
              }}
            >
              {isSubmitting ? 'Entrando…' : 'Entrar'}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: 18, fontSize: 11.5, color: t.textFaint }}>
            © {new Date().getFullYear()} Lumen CRM
          </div>
        </div>
      </main>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  const { tokens: t } = useTheme();
  return (
    <div>
      <label
        style={{
          display: 'block',
          fontSize: 11.5,
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
      {error && (
        <div style={{ fontSize: 11.5, color: t.danger, marginTop: 5 }}>{error}</div>
      )}
    </div>
  );
}
