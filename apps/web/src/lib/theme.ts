// Tokens visuais do Lumen CRM — paleta preto/branco com acento dourado #D4AF37.

export type Tokens = {
  bg: string;
  bgElevated: string;
  bgSidebar: string;
  bgHeader: string;
  bgHover: string;
  bgActive: string;
  bgInput: string;
  border: string;
  borderStrong: string;
  borderFocus: string;
  text: string;
  textDim: string;
  textSubtle: string;
  textFaint: string;
  icon: string;
  iconActive: string;
  gold: string;
  goldHover: string;
  goldFaint: string;
  success: string;
  danger: string;
  kbdBg: string;
};

const dark: Tokens = {
  bg: '#0a0a0a',
  bgElevated: '#0f0f10',
  bgSidebar: '#0c0c0d',
  bgHeader: 'rgba(10,10,10,0.85)',
  bgHover: 'rgba(255,255,255,0.04)',
  bgActive: 'rgba(212,175,55,0.08)',
  bgInput: '#151517',
  border: 'rgba(255,255,255,0.07)',
  borderStrong: 'rgba(255,255,255,0.12)',
  borderFocus: 'rgba(212,175,55,0.45)',
  text: '#ffffff',
  textDim: 'rgba(255,255,255,0.6)',
  textSubtle: 'rgba(255,255,255,0.4)',
  textFaint: 'rgba(255,255,255,0.28)',
  icon: 'rgba(255,255,255,0.55)',
  iconActive: '#D4AF37',
  gold: '#D4AF37',
  goldHover: '#c29e2a',
  goldFaint: 'rgba(212,175,55,0.12)',
  success: '#3fb950',
  danger: '#f85149',
  kbdBg: 'rgba(255,255,255,0.06)',
};

const light: Tokens = {
  bg: '#ffffff',
  bgElevated: '#fafaf9',
  bgSidebar: '#fafaf9',
  bgHeader: 'rgba(255,255,255,0.85)',
  bgHover: 'rgba(0,0,0,0.035)',
  bgActive: 'rgba(212,175,55,0.09)',
  bgInput: '#ffffff',
  border: 'rgba(0,0,0,0.08)',
  borderStrong: 'rgba(0,0,0,0.14)',
  borderFocus: 'rgba(212,175,55,0.55)',
  text: '#0a0a0a',
  textDim: 'rgba(10,10,10,0.62)',
  textSubtle: 'rgba(10,10,10,0.44)',
  textFaint: 'rgba(10,10,10,0.32)',
  icon: 'rgba(10,10,10,0.5)',
  iconActive: '#a8841f',
  gold: '#D4AF37',
  goldHover: '#b7951f',
  goldFaint: 'rgba(212,175,55,0.14)',
  success: '#27a246',
  danger: '#d1242f',
  kbdBg: 'rgba(0,0,0,0.04)',
};

export function getTokens(isDark: boolean): Tokens {
  return isDark ? dark : light;
}

export const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", Inter, system-ui, sans-serif';
