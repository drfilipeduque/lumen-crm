// Biblioteca de ícones thin-line (estilo Lucide) — todos os ícones usados pelo CRM.

import type { SVGProps } from 'react';

type IconProps = { s?: number; c?: string } & Omit<SVGProps<SVGSVGElement>, 'stroke' | 'fill'>;

const baseProps = (s: number, c: string | undefined): SVGProps<SVGSVGElement> => ({
  width: s,
  height: s,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: c,
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
});

export const Icons = {
  Home: ({ s = 16, c, ...rest }: IconProps) => (
    <svg {...baseProps(s, c)} {...rest}>
      <path d="M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z" />
    </svg>
  ),
  Pipeline: ({ s = 16, c, ...rest }: IconProps) => (
    <svg {...baseProps(s, c)} {...rest}>
      <rect x="3" y="4" width="5" height="16" rx="1" />
      <rect x="10" y="4" width="5" height="11" rx="1" />
      <rect x="17" y="4" width="4" height="7" rx="1" />
    </svg>
  ),
  Chat: ({ s = 16, c, ...rest }: IconProps) => (
    <svg {...baseProps(s, c)} {...rest}>
      <path d="M21 12a8 8 0 1 1-3.2-6.4L21 4l-1 3.5A7.96 7.96 0 0 1 21 12Z" />
      <path d="M8 11h.01M12 11h.01M16 11h.01" />
    </svg>
  ),
  Users: ({ s = 16, c, ...rest }: IconProps) => (
    <svg {...baseProps(s, c)} {...rest}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  Bell: ({ s = 16, c, ...rest }: IconProps) => (
    <svg {...baseProps(s, c)} {...rest}>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  ),
  Bolt: ({ s = 16, c, ...rest }: IconProps) => (
    <svg {...baseProps(s, c)} {...rest}>
      <path d="M13 2 3 14h9l-1 8 10-12h-9z" />
    </svg>
  ),
  Phone: ({ s = 16, c, ...rest }: IconProps) => (
    <svg {...baseProps(s, c)} {...rest}>
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <path d="M11 18h2" />
    </svg>
  ),
  Gear: ({ s = 16, c, ...rest }: IconProps) => (
    <svg {...baseProps(s, c)} {...rest}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  ),
  Search: ({ s = 16, c, ...rest }: IconProps) => (
    <svg {...baseProps(s, c)} {...rest}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  ),
  Sun: ({ s = 16, c, ...rest }: IconProps) => (
    <svg {...baseProps(s, c)} {...rest}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  ),
  Moon: ({ s = 16, c, ...rest }: IconProps) => (
    <svg {...baseProps(s, c)} {...rest}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  ),
  ChevronL: ({ s = 16, c, ...rest }: IconProps) => (
    <svg {...baseProps(s, c)} {...rest}>
      <path d="m15 18-6-6 6-6" />
    </svg>
  ),
  ChevronR: ({ s = 16, c, ...rest }: IconProps) => (
    <svg {...baseProps(s, c)} {...rest}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  ),
  ChevronD: ({ s = 16, c, ...rest }: IconProps) => (
    <svg {...baseProps(s, c)} {...rest}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  ),
  Plus: ({ s = 16, c, ...rest }: IconProps) => (
    <svg {...baseProps(s, c)} {...rest}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  Check: ({ s = 16, c, w = 1.6, ...rest }: IconProps & { w?: number }) => (
    <svg {...baseProps(s, c)} strokeWidth={w} {...rest}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  ),
  LogOut: ({ s = 16, c, ...rest }: IconProps) => (
    <svg {...baseProps(s, c)} {...rest}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
    </svg>
  ),
  User: ({ s = 16, c, ...rest }: IconProps) => (
    <svg {...baseProps(s, c)} {...rest}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 22c0-4.4 3.6-8 8-8s8 3.6 8 8" />
    </svg>
  ),
  Dot: ({ s = 6, c }: IconProps) => (
    <svg width={s} height={s} viewBox="0 0 6 6">
      <circle cx="3" cy="3" r="3" fill={c} />
    </svg>
  ),
  Help: ({ s = 16, c, ...rest }: IconProps) => (
    <svg {...baseProps(s, c)} {...rest}>
      <circle cx="12" cy="12" r="10" />
      <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01" />
    </svg>
  ),
};

export type IconName = keyof typeof Icons;
