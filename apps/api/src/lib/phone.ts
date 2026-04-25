// Helpers de telefone.
// O CRM trabalha com números brasileiros, mas armazena apenas dígitos
// (sem +, espaços, parênteses ou hífens) pra garantir unicidade.

export function normalizePhone(raw: string): string {
  return raw.replace(/\D+/g, '');
}

// Variantes equivalentes do mesmo número — tratam o caso de seeds antigos
// terem armazenado com `+` ou outras formatações, e o "9 problem" do BR.
export function phoneVariants(raw: string): string[] {
  const digits = normalizePhone(raw);
  if (!digits) return [];
  const variants = new Set<string>([digits, `+${digits}`]);

  // 11 dígitos com DDD mas sem 55 → adiciona variante com 55
  if (digits.length === 11 && !digits.startsWith('55')) {
    variants.add(`55${digits}`);
    variants.add(`+55${digits}`);
  }
  // 10 dígitos (DDD + 8) sem 55 → adiciona com 55
  if (digits.length === 10 && !digits.startsWith('55')) {
    variants.add(`55${digits}`);
    variants.add(`+55${digits}`);
  }
  // 13 dígitos começando com 55 → também sem o 55
  if (digits.length === 13 && digits.startsWith('55')) {
    const withoutCC = digits.slice(2);
    variants.add(withoutCC);
    variants.add(`+${withoutCC}`);
  }
  // 12 dígitos começando com 55 → também sem o 55
  if (digits.length === 12 && digits.startsWith('55')) {
    const withoutCC = digits.slice(2);
    variants.add(withoutCC);
    variants.add(`+${withoutCC}`);
  }

  // "9 problem" — celulares BR podem aparecer com ou sem o 9 inicial.
  // Considera DDDs 11..99 (móveis começam tipicamente com 6/7/8/9).
  // Caso A: 13 dígitos 55+DD+9+8 → também sem o 9 → 12 dígitos
  if (digits.length === 13 && digits.startsWith('55') && digits[4] === '9') {
    const without9 = `55${digits.slice(2, 4)}${digits.slice(5)}`;
    variants.add(without9);
    variants.add(`+${without9}`);
    variants.add(without9.slice(2));
    variants.add(`+${without9.slice(2)}`);
  }
  // Caso B: 11 dígitos DD+9+8 → também sem o 9 → 10 dígitos
  if (digits.length === 11 && digits[2] === '9') {
    const without9 = `${digits.slice(0, 2)}${digits.slice(3)}`;
    variants.add(without9);
    variants.add(`55${without9}`);
    variants.add(`+55${without9}`);
  }
  // Caso C: 12 dígitos 55+DD+8 → adiciona o 9 → 13 dígitos
  if (digits.length === 12 && digits.startsWith('55')) {
    const with9 = `55${digits.slice(2, 4)}9${digits.slice(4)}`;
    variants.add(with9);
    variants.add(`+${with9}`);
    variants.add(with9.slice(2));
    variants.add(`+${with9.slice(2)}`);
  }
  // Caso D: 10 dígitos DD+8 → adiciona o 9 → 11 dígitos
  if (digits.length === 10) {
    const with9 = `${digits.slice(0, 2)}9${digits.slice(2)}`;
    variants.add(with9);
    variants.add(`55${with9}`);
    variants.add(`+55${with9}`);
  }

  return Array.from(variants);
}

// Formata pra exibição. Aceita só dígitos.
export function formatPhoneBR(raw: string): string {
  const d = normalizePhone(raw);
  // 55 + 11 (DDD + 9 + 8 dígitos) = 13 — celular moderno
  if (d.length === 13 && d.startsWith('55')) {
    const dd = d.slice(2, 4);
    const a = d.slice(4, 9);
    const b = d.slice(9);
    return `+55 (${dd}) ${a}-${b}`;
  }
  // 55 + 10 (DDD + 8 dígitos) = 12 — fixo BR ou celular antigo sem o 9
  if (d.length === 12 && d.startsWith('55')) {
    const dd = d.slice(2, 4);
    const a = d.slice(4, 8);
    const b = d.slice(8);
    return `+55 (${dd}) ${a}-${b}`;
  }
  // 11 (DDD + 9 + 8 dígitos)
  if (d.length === 11) {
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }
  // 10 (fixo)
  if (d.length === 10) {
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  }
  return raw;
}
