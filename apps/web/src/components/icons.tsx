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
  // Tipos de campo personalizado
  Type: ({ s = 16, c, ...rest }: IconProps) => (
    <svg {...baseProps(s, c)} {...rest}>
      <path d="M4 7V5h16v2M9 5v14M15 19h-6" />
    </svg>
  ),
  AlignLeft: ({ s = 16, c, ...rest }: IconProps) => (
    <svg {...baseProps(s, c)} {...rest}>
      <path d="M4 6h16M4 12h12M4 18h16M4 24" />
    </svg>
  ),
  Hash: ({ s = 16, c, ...rest }: IconProps) => (
    <svg {...baseProps(s, c)} {...rest}>
      <path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" />
    </svg>
  ),
  DollarSign: ({ s = 16, c, ...rest }: IconProps) => (
    <svg {...baseProps(s, c)} {...rest}>
      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  ),
  Calendar: ({ s = 16, c, ...rest }: IconProps) => (
    <svg {...baseProps(s, c)} {...rest}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  ),
  List: ({ s = 16, c, ...rest }: IconProps) => (
    <svg {...baseProps(s, c)} {...rest}>
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  ),
  ListChecks: ({ s = 16, c, ...rest }: IconProps) => (
    <svg {...baseProps(s, c)} {...rest}>
      <path d="M11 6h10M11 12h10M11 18h10M3 6l1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17" />
    </svg>
  ),
  ToggleLeft: ({ s = 16, c, ...rest }: IconProps) => (
    <svg {...baseProps(s, c)} {...rest}>
      <rect x="2" y="6" width="20" height="12" rx="6" />
      <circle cx="8" cy="12" r="3" />
    </svg>
  ),
  Link: ({ s = 16, c, ...rest }: IconProps) => (
    <svg {...baseProps(s, c)} {...rest}>
      <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5" />
      <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5" />
    </svg>
  ),
  // Ações
  Edit: ({ s = 16, c, ...rest }: IconProps) => (
    <svg {...baseProps(s, c)} {...rest}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z" />
    </svg>
  ),
  Trash: ({ s = 16, c, ...rest }: IconProps) => (
    <svg {...baseProps(s, c)} {...rest}>
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6" />
    </svg>
  ),
  Grip: ({ s = 16, c, ...rest }: IconProps) => (
    <svg {...baseProps(s, c)} {...rest}>
      <circle cx="9" cy="6" r="1" />
      <circle cx="9" cy="12" r="1" />
      <circle cx="9" cy="18" r="1" />
      <circle cx="15" cy="6" r="1" />
      <circle cx="15" cy="12" r="1" />
      <circle cx="15" cy="18" r="1" />
    </svg>
  ),
  X: ({ s = 16, c, ...rest }: IconProps) => (
    <svg {...baseProps(s, c)} {...rest}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  ),

  // Conversations
  Send: ({ s = 16, c, ...rest }: IconProps) => (
    <svg {...baseProps(s, c)} {...rest}>
      <path d="m22 2-7 20-4-9-9-4 20-7Z" />
    </svg>
  ),
  Mic: ({ s = 16, c, ...rest }: IconProps) => (
    <svg {...baseProps(s, c)} {...rest}>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M19 11a7 7 0 0 1-14 0M12 18v4M8 22h8" />
    </svg>
  ),
  Image: ({ s = 16, c, ...rest }: IconProps) => (
    <svg {...baseProps(s, c)} {...rest}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  ),
  Paperclip: ({ s = 16, c, ...rest }: IconProps) => (
    <svg {...baseProps(s, c)} {...rest}>
      <path d="M21.4 11 12 20.5a6 6 0 0 1-8.5-8.5l9.5-9.5a4 4 0 0 1 5.7 5.7L8.7 17.7a2 2 0 0 1-2.8-2.8L14.5 6.3" />
    </svg>
  ),
  File: ({ s = 16, c, ...rest }: IconProps) => (
    <svg {...baseProps(s, c)} {...rest}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M9 13h6M9 17h6" />
    </svg>
  ),
  Play: ({ s = 16, c, ...rest }: IconProps) => (
    <svg {...baseProps(s, c)} {...rest}>
      <path d="M6 4v16l13-8z" fill={c} />
    </svg>
  ),
  Pause: ({ s = 16, c, ...rest }: IconProps) => (
    <svg {...baseProps(s, c)} {...rest}>
      <rect x="6" y="4" width="4" height="16" rx="1" fill={c} />
      <rect x="14" y="4" width="4" height="16" rx="1" fill={c} />
    </svg>
  ),
  Download: ({ s = 16, c, ...rest }: IconProps) => (
    <svg {...baseProps(s, c)} {...rest}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
    </svg>
  ),
  MoreH: ({ s = 16, c, ...rest }: IconProps) => (
    <svg {...baseProps(s, c)} {...rest}>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </svg>
  ),
  Filter: ({ s = 16, c, ...rest }: IconProps) => (
    <svg {...baseProps(s, c)} {...rest}>
      <path d="M22 3H2l8 9.5V19l4 2v-8.5L22 3z" />
    </svg>
  ),
  ArrowDown: ({ s = 16, c, ...rest }: IconProps) => (
    <svg {...baseProps(s, c)} {...rest}>
      <path d="M12 5v14M19 12l-7 7-7-7" />
    </svg>
  ),
  CheckCheck: ({ s = 16, c, ...rest }: IconProps) => (
    <svg {...baseProps(s, c)} {...rest}>
      <path d="M2 13l4 4 8-8M10 13l4 4 8-12" />
    </svg>
  ),
};

export type IconName = keyof typeof Icons;
