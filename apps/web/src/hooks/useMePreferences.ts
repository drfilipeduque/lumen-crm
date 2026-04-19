import { useCallback } from 'react';
import { useAuthStore } from '../stores/useAuthStore';
import type { Density, Notifications, Preferences, ThemeMode } from '../lib/auth';

export function useMePreferences() {
  const user = useAuthStore((s) => s.user);
  const patchPreferences = useAuthStore((s) => s.patchPreferences);

  const prefs: Preferences = (user?.preferences ?? {}) as Preferences;

  const setTheme = useCallback(
    (theme: ThemeMode) => patchPreferences({ theme }),
    [patchPreferences],
  );
  const setDensity = useCallback(
    (density: Density) => patchPreferences({ density }),
    [patchPreferences],
  );
  const setNotification = useCallback(
    (key: keyof Notifications, value: boolean) =>
      patchPreferences({ notifications: { [key]: value } }),
    [patchPreferences],
  );

  return {
    preferences: prefs,
    theme: prefs.theme ?? 'light',
    density: prefs.density ?? 'standard',
    notifications: prefs.notifications ?? { sound: true, desktop: true, email: true },
    setTheme,
    setDensity,
    setNotification,
  };
}
