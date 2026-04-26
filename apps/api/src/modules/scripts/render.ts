export type RenderContext = {
  contact?: {
    name?: string | null;
    phone?: string | null;
    email?: string | null;
  } | null;
  opportunity?: {
    title?: string | null;
    value?: number | string | null;
    stage?: { name?: string | null } | null;
  } | null;
  user?: {
    name?: string | null;
  } | null;
};

const DAYS_PT = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
];

function firstName(full: string | null | undefined): string {
  if (!full) return '';
  const trimmed = full.trim();
  if (!trimmed) return '';
  return trimmed.split(/\s+/)[0] ?? '';
}

function formatBRL(value: number | string | null | undefined): string {
  if (value == null) return '';
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return '';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  }).format(n);
}

function formatDateBR(d: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  }).format(d);
}

function formatTimeBR(d: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(d);
}

export type VariableDef = {
  key: string;
  category: 'contato' | 'oportunidade' | 'usuario' | 'data';
  label: string;
  description: string;
  example: string;
};

export const VARIABLES: VariableDef[] = [
  { key: 'nome_contato', category: 'contato', label: 'Nome do contato', description: 'Nome completo do contato', example: 'Maria Souza' },
  { key: 'primeiro_nome', category: 'contato', label: 'Primeiro nome', description: 'Primeiro nome do contato', example: 'Maria' },
  { key: 'telefone', category: 'contato', label: 'Telefone', description: 'Telefone do contato', example: '(11) 91234-5678' },
  { key: 'email', category: 'contato', label: 'E-mail', description: 'E-mail do contato', example: 'maria@email.com' },
  { key: 'valor_oportunidade', category: 'oportunidade', label: 'Valor', description: 'Valor da oportunidade em BRL', example: 'R$ 1.500,00' },
  { key: 'titulo_oportunidade', category: 'oportunidade', label: 'Título', description: 'Título da oportunidade', example: 'Pacote Botox' },
  { key: 'etapa', category: 'oportunidade', label: 'Etapa', description: 'Etapa atual no pipeline', example: 'Negociação' },
  { key: 'nome_usuario', category: 'usuario', label: 'Nome do usuário', description: 'Seu nome no sistema', example: 'Ana Atendente' },
  { key: 'primeiro_nome_usuario', category: 'usuario', label: 'Primeiro nome (usuário)', description: 'Seu primeiro nome', example: 'Ana' },
  { key: 'data_atual', category: 'data', label: 'Data atual', description: 'Data de hoje (DD/MM/AAAA)', example: '26/04/2026' },
  { key: 'hora_atual', category: 'data', label: 'Hora atual', description: 'Hora agora (HH:MM)', example: '14:30' },
  { key: 'dia_semana', category: 'data', label: 'Dia da semana', description: 'Dia da semana atual em português', example: 'domingo' },
];

export function buildValues(ctx: RenderContext): Record<string, string> {
  const now = new Date();
  return {
    nome_contato: ctx.contact?.name ?? '',
    primeiro_nome: firstName(ctx.contact?.name),
    telefone: ctx.contact?.phone ?? '',
    email: ctx.contact?.email ?? '',
    valor_oportunidade: formatBRL(ctx.opportunity?.value ?? null),
    titulo_oportunidade: ctx.opportunity?.title ?? '',
    etapa: ctx.opportunity?.stage?.name ?? '',
    nome_usuario: ctx.user?.name ?? '',
    primeiro_nome_usuario: firstName(ctx.user?.name),
    data_atual: formatDateBR(now),
    hora_atual: formatTimeBR(now),
    dia_semana: DAYS_PT[now.getDay()] ?? '',
  };
}

const VAR_RE = /\{\{\s*([a-z0-9_]+)\s*(?:\|([^}]*))?\}\}/gi;

export function renderTemplate(content: string, values: Record<string, string>): string {
  return content.replace(VAR_RE, (_match, rawKey: string, rawFallback?: string) => {
    const key = rawKey.toLowerCase();
    const fallback = rawFallback?.trim() ?? '';
    const v = values[key];
    if (v && v.length > 0) return v;
    return fallback;
  });
}

export function renderScript(content: string, ctx: RenderContext): string {
  return renderTemplate(content, buildValues(ctx));
}

export function extractVariables(content: string): string[] {
  const found = new Set<string>();
  for (const m of content.matchAll(VAR_RE)) {
    const key = m[1]?.toLowerCase();
    if (key) found.add(key);
  }
  return [...found];
}

export function buildExampleValues(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const v of VARIABLES) out[v.key] = v.example;
  return out;
}
