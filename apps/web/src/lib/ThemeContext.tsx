import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getTokens, type Tokens } from './theme';
import type { ThemeMode } from './auth';

type ThemeContextValue = {
  mode: ThemeMode;
  isDark: boolean;
  toggle: () => void;
  setMode: (m: ThemeMode) => void;
  tokens: Tokens;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const MODE_KEY = 'lumen.theme';

function readStoredMode(defaultMode: ThemeMode): ThemeMode {
  if (typeof window === 'undefined') return defaultMode;
  const v = window.localStorage.getItem(MODE_KEY);
  if (v === 'dark' || v === 'light' || v === 'auto') return v;
  return defaultMode;
}

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function effectiveDark(mode: ThemeMode, system: boolean): boolean {
  if (mode === 'auto') return system;
  return mode === 'dark';
}

export function ThemeProvider({
  children,
  defaultMode = 'light',
}: {
  children: ReactNode;
  defaultMode?: ThemeMode;
}) {
  const [mode, setMode] = useState<ThemeMode>(() => readStoredMode(defaultMode));
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const isDark = effectiveDark(mode, systemDark);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
    try {
      window.localStorage.setItem(MODE_KEY, mode);
    } catch {
      /* ignore */
    }
  }, [isDark, mode]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      isDark,
      setMode,
      toggle: () => setMode((m) => (m === 'dark' ? 'light' : 'dark')),
      tokens: getTokens(isDark),
    }),
    [mode, isDark],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme deve ser usado dentro de <ThemeProvider>');
  return ctx;
}
