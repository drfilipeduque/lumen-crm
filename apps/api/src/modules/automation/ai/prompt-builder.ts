// Substitui {{caminho.no.contexto}} dentro de strings (prompt, mensagem, etc).
// Não é um template engine completo — só lookup por dot-path. Mantém literais
// se a variável não existir (com warning logado pelo chamador, opcional).

export type Scope = Record<string, unknown>;

const VAR_RE = /\{\{\s*([\w.]+)\s*\}\}/g;

function getPath(scope: Scope, path: string): unknown {
  const parts = path.split('.');
  let cur: unknown = scope;
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined;
    if (typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function stringify(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof Date) return v.toISOString();
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

// Substitui todas as ocorrências de {{path}} no template usando o scope.
// Variáveis ausentes viram string vazia.
export function renderTemplate(template: string, scope: Scope): string {
  return template.replace(VAR_RE, (_m, path: string) => stringify(getPath(scope, path)));
}

// Lista paths referenciados (útil pra debug / validação no construtor visual).
export function extractVariables(template: string): string[] {
  const out = new Set<string>();
  for (const m of template.matchAll(VAR_RE)) {
    if (m[1]) out.add(m[1]);
  }
  return [...out];
}
