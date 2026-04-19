import { useEffect, useRef } from 'react';
import { useTheme } from '../lib/ThemeContext';
import { useAuthStore } from '../stores/useAuthStore';
import type { ThemeMode } from '../lib/auth';

// Sincroniza o tema entre o ThemeProvider local e a preferência salva no servidor.
// - Quando o usuário loga (ou troca), aplica a preferência do backend localmente.
// - Quando o mode local muda DEPOIS da sincronização inicial, faz PATCH no backend.
export function ThemeSync() {
  const { mode, setMode } = useTheme();
  const user = useAuthStore((s) => s.user);
  const patchPreferences = useAuthStore((s) => s.patchPreferences);

  const syncedUserId = useRef<string | null>(null);
  const skipNextPersist = useRef(false);

  useEffect(() => {
    if (!user) {
      syncedUserId.current = null;
      return;
    }
    if (syncedUserId.current === user.id) return;
    const serverTheme = user.preferences?.theme as ThemeMode | undefined;
    if (serverTheme && serverTheme !== mode) {
      skipNextPersist.current = true;
      setMode(serverTheme);
    }
    syncedUserId.current = user.id;
  }, [user, mode, setMode]);

  useEffect(() => {
    if (!user) return;
    if (syncedUserId.current !== user.id) return;
    if (skipNextPersist.current) {
      skipNextPersist.current = false;
      return;
    }
    void patchPreferences({ theme: mode });
  }, [mode, user, patchPreferences]);

  return null;
}
