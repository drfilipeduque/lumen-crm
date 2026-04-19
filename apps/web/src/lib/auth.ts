// Persistência do refreshToken com ofuscação leve.
// NOTA: localStorage não é seguro contra XSS — esta camada apenas dificulta
// leitura casual. Em produção, prefira httpOnly cookie pra refresh token.

const STORAGE_KEY = 'lumen.rt';
const OBFUSCATION_KEY = 'lumen-crm:v1';

function xor(input: string, key: string): string {
  let out = '';
  for (let i = 0; i < input.length; i++) {
    out += String.fromCharCode(input.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return out;
}

export function saveRefreshToken(token: string | null): void {
  if (!token) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  const obf = xor(token, OBFUSCATION_KEY);
  localStorage.setItem(STORAGE_KEY, btoa(obf));
}

export function loadRefreshToken(): string | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return xor(atob(raw), OBFUSCATION_KEY);
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export type UserRole = 'ADMIN' | 'COMMERCIAL' | 'RECEPTION';

export type ThemeMode = 'light' | 'dark' | 'auto';
export type Density = 'compact' | 'standard' | 'spacious';

export type Notifications = { sound?: boolean; desktop?: boolean; email?: boolean };

export type Preferences = {
  theme?: ThemeMode;
  density?: Density;
  notifications?: Notifications;
};

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar: string | null;
  phone: string | null;
  preferences: Preferences | null;
};
