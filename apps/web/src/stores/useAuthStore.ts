import { create } from 'zustand';
import axios from 'axios';
import {
  loadRefreshToken,
  saveRefreshToken,
  type AuthUser,
  type Density,
  type Notifications,
  type ThemeMode,
} from '../lib/auth';

export type PreferencesPatch = {
  theme?: ThemeMode;
  density?: Density;
  notifications?: Notifications;
};

export type ProfilePatch = { name?: string; email?: string; phone?: string | null };

export type PasswordChange = { currentPassword: string; newPassword: string };

type AuthState = {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  status: 'idle' | 'loading' | 'authenticated' | 'unauthenticated';

  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  bootstrap: () => Promise<void>;
  setAccessToken: (token: string | null) => void;
  patchPreferences: (patch: PreferencesPatch) => Promise<void>;
  patchProfile: (patch: ProfilePatch) => Promise<AuthUser>;
  changePassword: (args: PasswordChange) => Promise<{ sessionsClosed: number }>;
  uploadAvatar: (file: File) => Promise<AuthUser>;
  clear: () => void;
};

const httpRaw = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  refreshToken: loadRefreshToken(),
  status: 'idle',

  setAccessToken: (token) => set({ accessToken: token }),

  patchPreferences: async (patch) => {
    const { accessToken } = get();
    if (!accessToken) return;
    const { data } = await httpRaw.patch<AuthUser>(
      '/auth/me/preferences',
      patch,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    set({ user: data });
  },

  patchProfile: async (patch) => {
    const { accessToken } = get();
    if (!accessToken) throw new Error('Sessão expirada');
    const { data } = await httpRaw.patch<AuthUser>(
      '/auth/me',
      patch,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    set({ user: data });
    return data;
  },

  changePassword: async (args) => {
    const { accessToken } = get();
    if (!accessToken) throw new Error('Sessão expirada');
    const { data } = await httpRaw.patch<{ ok: true; sessionsClosed: number }>(
      '/auth/me/password',
      args,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return { sessionsClosed: data.sessionsClosed };
  },

  uploadAvatar: async (file) => {
    const { accessToken } = get();
    if (!accessToken) throw new Error('Sessão expirada');
    const form = new FormData();
    form.append('file', file);
    const { data } = await httpRaw.post<AuthUser>('/auth/me/avatar', form, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    set({ user: data });
    return data;
  },

  clear: () => {
    saveRefreshToken(null);
    set({ user: null, accessToken: null, refreshToken: null, status: 'unauthenticated' });
  },

  login: async (email, password) => {
    set({ status: 'loading' });
    const { data } = await httpRaw.post<{
      accessToken: string;
      refreshToken: string;
      user: AuthUser;
    }>('/auth/login', { email, password });
    saveRefreshToken(data.refreshToken);
    set({
      user: data.user,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      status: 'authenticated',
    });
  },

  logout: async () => {
    const { accessToken, refreshToken } = get();
    if (accessToken) {
      await httpRaw
        .post(
          '/auth/logout',
          { refreshToken },
          { headers: { Authorization: `Bearer ${accessToken}` } },
        )
        .catch(() => {});
    }
    get().clear();
  },

  bootstrap: async () => {
    const refreshToken = get().refreshToken ?? loadRefreshToken();
    if (!refreshToken) {
      set({ status: 'unauthenticated' });
      return;
    }
    set({ status: 'loading' });
    try {
      const refreshRes = await httpRaw.post<{ accessToken: string; user: AuthUser }>(
        '/auth/refresh',
        { refreshToken },
      );
      set({
        user: refreshRes.data.user,
        accessToken: refreshRes.data.accessToken,
        refreshToken,
        status: 'authenticated',
      });
    } catch {
      saveRefreshToken(null);
      set({ user: null, accessToken: null, refreshToken: null, status: 'unauthenticated' });
    }
  },
}));
