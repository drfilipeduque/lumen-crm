// Helpers de telefone.
// O CRM trabalha com números brasileiros, mas armazena apenas dígitos
// (sem +, espaços, parênteses ou hífens) pra garantir unicidade.

export function normalizePhone(raw: string): string {
  return raw.replace(/\D+/g, '');
}

// Variantes equivalentes do mesmo número — tratam o caso de seeds antigos
// terem armazenado com `+` ou outras formatações.
export function phoneVariants(raw: string): string[] {
  const digits = normalizePhone(raw);
  if (!digits) return [];
  const variants = new Set<string>([digits, `+${digits}`]);
  // 11 dígitos com DDD mas sem 55 → adiciona variante com 55
  if (digits.length === 11 && !digits.startsWith('55')) {
    variants.add(`55${digits}`);
    variants.add(`+55${digits}`);
  }
  // 13 dígitos começando com 55 → também sem o 55
  if (digits.length === 13 && digits.startsWith('55')) {
    const withoutCC = digits.slice(2);
    variants.add(withoutCC);
    variants.add(`+${withoutCC}`);
  }
  return Array.from(variants);
}

// Formata pra exibição. Aceita só dígitos.
export function formatPhoneBR(raw: string): string {
  const d = normalizePhone(raw);
  // 55 + 11 (DDD + 9 + 8 dígitos) = 13
  if (d.length === 13 && d.startsWith('55')) {
    const dd = d.slice(2, 4);
    const a = d.slice(4, 9);
    const b = d.slice(9);
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
