import { useTheme } from '../../lib/ThemeContext';
import { useMePreferences } from '../../hooks/useMePreferences';
import { toast } from '../../components/ui/Toast';
import { FONT_STACK } from '../../lib/theme';
import type { Density, ThemeMode } from '../../lib/auth';

export function SettingsAppearance() {
  const { tokens: t } = useTheme();
  return (
    <div
      style={{
        padding: '28px 32px 40px',
        display: 'flex',
        flexDirection: 'column',
        gap: 36,
        color: t.text,
      }}
    >
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 600, letterSpacing: -0.4, margin: 0, color: t.text }}>
          Aparência
        </h2>
        <div style={{ fontSize: 13, color: t.textDim, marginTop: 4 }}>
          Personalize tema, densidade e cor de acento.
        </div>
      </div>

      <ThemeBlock />
      <DensityBlock />
      <AccentBlock />
    </div>
  );
}

// ============================================================
// THEME
// ============================================================

const THEME_OPTIONS: { key: ThemeMode; label: string; description: string }[] = [
  { key: 'light', label: 'Claro', description: 'Visual claro o tempo todo.' },
  { key: 'dark', label: 'Escuro', description: 'Visual escuro o tempo todo.' },
  { key: 'auto', label: 'Automático', description: 'Acompanha o sistema operacional.' },
];

function ThemeBlock() {
  const { tokens: t, setMode, mode } = useTheme();
  const { setTheme } = useMePreferences();

  const handlePick = async (next: ThemeMode) => {
    setMode(next);
    try {
      await setTheme(next);
    } catch {
      toast('Falha ao salvar tema', 'error');
    }
  };

  return (
    <Section title="Tema" description="Escolha o visual padrão para sua interface.">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        {THEME_OPTIONS.map((opt) => {
          const active = mode === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => handlePick(opt.key)}
              style={{
                background: t.bgInput,
                border: `1.5px solid ${active ? t.gold : t.border}`,
                borderRadius: 12,
                padding: 14,
                textAlign: 'left',
                cursor: 'pointer',
                fontFamily: FONT_STACK,
                color: t.text,
                transition: 'border-color 140ms ease',
              }}
            >
              <ThemePreview kind={opt.key} />
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginTop: 10,
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{opt.label}</div>
                  <div style={{ fontSize: 11, color: t.textSubtle, marginTop: 2 }}>
                    {opt.description}
                  </div>
                </div>
                <Radio checked={active} />
              </div>
            </button>
          );
        })}
      </div>
    </Section>
  );
}

function ThemePreview({ kind }: { kind: ThemeMode }) {
  const dark = kind === 'dark';
  const auto = kind === 'auto';
  const bg = dark ? '#0a0a0a' : '#ffffff';
  const surface = dark ? '#15151a' : '#f5f5f4';
  const text = dark ? '#fff' : '#0a0a0a';
  const dim = dark ? 'rgba(255,255,255,0.45)' : 'rgba(10,10,10,0.45)';

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: 88,
        borderRadius: 8,
        overflow: 'hidden',
        background: bg,
        border: `1px solid rgba(0,0,0,0.06)`,
        display: 'flex',
      }}
    >
      <div
        style={{
          width: 26,
          background: surface,
          padding: 6,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        <div style={{ height: 6, borderRadius: 2, background: '#D4AF37' }} />
        <div style={{ height: 4, borderRadius: 2, background: dim }} />
        <div style={{ height: 4, borderRadius: 2, background: dim }} />
      </div>
      <div style={{ flex: 1, padding: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ height: 6, width: '60%', borderRadius: 2, background: text, opacity: 0.85 }} />
        <div style={{ height: 4, width: '90%', borderRadius: 2, background: dim }} />
        <div style={{ height: 4, width: '78%', borderRadius: 2, background: dim }} />
      </div>
      {auto && (
        <div
          style={{
            position: 'absolute',
            bottom: 6,
            right: 6,
            fontSize: 9,
            padding: '1px 5px',
            borderRadius: 4,
            background: 'rgba(212,175,55,0.18)',
            color: '#a8841f',
            fontWeight: 600,
          }}
        >
          AUTO
        </div>
      )}
    </div>
  );
}

// ============================================================
// DENSITY
// ============================================================

const DENSITY_OPTIONS: { key: Density; label: string; description: string }[] = [
  { key: 'compact', label: 'Compacta', description: 'Mais informação na tela.' },
  { key: 'standard', label: 'Padrão', description: 'Equilíbrio entre conforto e densidade.' },
  { key: 'spacious', label: 'Espaçada', description: 'Mais respiração entre os elementos.' },
];

function DensityBlock() {
  const { tokens: t } = useTheme();
  const { density, setDensity } = useMePreferences();

  const handlePick = async (next: Density) => {
    try {
      await setDensity(next);
    } catch {
      toast('Falha ao salvar densidade', 'error');
    }
  };

  return (
    <Section
      title="Densidade"
      description="A aplicação visual completa virá em breve; por ora salvamos sua escolha."
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        {DENSITY_OPTIONS.map((opt) => {
          const active = density === opt.key;
          const padding = opt.key === 'compact' ? 4 : opt.key === 'standard' ? 8 : 14;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => handlePick(opt.key)}
              style={{
                background: t.bgInput,
                border: `1.5px solid ${active ? t.gold : t.border}`,
                borderRadius: 12,
                padding: 14,
                textAlign: 'left',
                cursor: 'pointer',
                fontFamily: FONT_STACK,
                color: t.text,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: padding,
                  height: 56,
                  justifyContent: 'center',
                  padding: `${padding}px 0`,
                }}
              >
                {[80, 60, 70].map((w) => (
                  <div
                    key={w}
                    style={{
                      height: 4,
                      width: `${w}%`,
                      borderRadius: 2,
                      background: t.border,
                    }}
                  />
                ))}
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginTop: 10,
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{opt.label}</div>
                  <div style={{ fontSize: 11, color: t.textSubtle, marginTop: 2 }}>
                    {opt.description}
                  </div>
                </div>
                <Radio checked={active} />
              </div>
            </button>
          );
        })}
      </div>
    </Section>
  );
}

// ============================================================
// ACCENT (placeholder)
// ============================================================

function AccentBlock() {
  const { tokens: t } = useTheme();
  const colors = [
    { c: '#D4AF37', label: 'Dourado', enabled: true },
    { c: '#7c5dfa', label: 'Lilás', enabled: false },
    { c: '#3fb950', label: 'Verde', enabled: false },
    { c: '#f0883e', label: 'Âmbar', enabled: false },
    { c: '#3b82f6', label: 'Azul', enabled: false },
    { c: '#ec4899', label: 'Rosa', enabled: false },
  ];

  return (
    <Section title="Cor de acento" description="Mais cores em breve.">
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {colors.map((c) => (
          <button
            key={c.c}
            type="button"
            disabled={!c.enabled}
            title={c.enabled ? c.label : `${c.label} — em breve`}
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: c.c,
              border: c.enabled ? `2px solid ${t.gold}` : `1px solid ${t.border}`,
              cursor: c.enabled ? 'default' : 'not-allowed',
              opacity: c.enabled ? 1 : 0.35,
              padding: 0,
              boxShadow: c.enabled ? `0 0 0 2px ${t.bg}, 0 0 0 4px ${t.gold}` : 'none',
            }}
          />
        ))}
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

function Radio({ checked }: { checked: boolean }) {
  const { tokens: t } = useTheme();
  return (
    <div
      style={{
        width: 16,
        height: 16,
        borderRadius: '50%',
        border: `2px solid ${checked ? t.gold : t.borderStrong}`,
        background: 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {checked && (
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: t.gold }} />
      )}
    </div>
  );
}
