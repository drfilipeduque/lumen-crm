// Importação de contatos via CSV.
//
// Parser próprio (sem dependência) que cobre o caso brasileiro padrão:
//   - separador: vírgula ou ponto-e-vírgula (auto-detectado pela 1a linha)
//   - aspas duplas pra escapar valores com vírgula/quebra
//   - aspas duplas escapadas como "" dentro de campo cotado
//   - BOM UTF-8 ignorado
//
// O fluxo aplica `mapping` (col CSV → campo do sistema) e tipos diferentes
// de duplicateStrategy. Pra evitar long transactions, processa em chunks
// de 100 contatos.

import { prisma, Prisma } from '../../lib/prisma.js';
import { normalizePhone } from '../../lib/phone.js';

export type DuplicateStrategy = 'SKIP' | 'UPDATE' | 'CREATE_ANYWAY';

export type ImportMapping = Record<string, string>; // { "Telefone": "phone", "Cidade": "address.city" }

export type ImportOptions = {
  mapping: ImportMapping;
  tagIds?: string[];
  ownerId?: string | null;
  duplicateStrategy?: DuplicateStrategy;
};

export type ImportRowError = { row: number; reason: string; data?: Record<string, string> };

export type ImportReport = {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  errorRows: ImportRowError[];
};

const SUPPORTED_FIELDS = new Set([
  'name',
  'phone',
  'email',
  'cpf',
  'birthDate',
  'notes',
  'address.street',
  'address.number',
  'address.city',
  'address.state',
  'address.zip',
  'address.complement',
]);

// =====================================================================
// Parser CSV
// =====================================================================

export function parseCsv(text: string): string[][] {
  // Remove BOM se presente
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  // Detecta separador pela primeira linha (até a primeira quebra)
  const headerEnd = text.search(/\r?\n/);
  const headerLine = headerEnd >= 0 ? text.slice(0, headerEnd) : text;
  const sep = (headerLine.split(';').length > headerLine.split(',').length ? ';' : ',') as ',' | ';';

  const rows: string[][] = [];
  let cur: string[] = [];
  let cell = '';
  let i = 0;
  let inQuotes = false;
  while (i < text.length) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      cell += ch;
      i++;
    } else {
      if (ch === '"' && cell === '') {
        inQuotes = true;
        i++;
        continue;
      }
      if (ch === sep) {
        cur.push(cell);
        cell = '';
        i++;
        continue;
      }
      if (ch === '\n' || ch === '\r') {
        cur.push(cell);
        cell = '';
        rows.push(cur);
        cur = [];
        // Pula \n após \r
        if (ch === '\r' && text[i + 1] === '\n') i++;
        i++;
        continue;
      }
      cell += ch;
      i++;
    }
  }
  if (cell !== '' || cur.length > 0) {
    cur.push(cell);
    rows.push(cur);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

// =====================================================================
// Auto-detect mapping
// =====================================================================

const HEURISTICS: Record<string, string> = {
  nome: 'name',
  'nome completo': 'name',
  contato: 'name',
  telefone: 'phone',
  celular: 'phone',
  whatsapp: 'phone',
  fone: 'phone',
  email: 'email',
  'e-mail': 'email',
  cpf: 'cpf',
  documento: 'cpf',
  nascimento: 'birthDate',
  'data de nascimento': 'birthDate',
  'data nascimento': 'birthDate',
  endereço: 'address.street',
  endereco: 'address.street',
  rua: 'address.street',
  numero: 'address.number',
  número: 'address.number',
  cidade: 'address.city',
  estado: 'address.state',
  uf: 'address.state',
  cep: 'address.zip',
  observações: 'notes',
  observacoes: 'notes',
  obs: 'notes',
};

export function autoDetectMapping(headers: string[]): ImportMapping {
  const out: ImportMapping = {};
  for (const h of headers) {
    const norm = h.toLowerCase().trim();
    if (HEURISTICS[norm]) out[h] = HEURISTICS[norm]!;
  }
  return out;
}

// =====================================================================
// Importer
// =====================================================================

export async function importContactsCsv(
  csvText: string,
  options: ImportOptions,
): Promise<ImportReport> {
  const rows = parseCsv(csvText);
  if (rows.length < 2) {
    return { total: 0, created: 0, updated: 0, skipped: 0, errors: 0, errorRows: [] };
  }
  const headers = rows[0]!.map((h) => h.trim());
  const dataRows = rows.slice(1);

  const mapping = options.mapping;
  // Valida que campos do mapping existem
  for (const target of Object.values(mapping)) {
    if (!SUPPORTED_FIELDS.has(target)) {
      throw new Error(`Campo "${target}" não suportado`);
    }
  }
  const hasNameMap = Object.values(mapping).includes('name');
  const hasPhoneMap = Object.values(mapping).includes('phone');
  if (!hasNameMap || !hasPhoneMap) {
    throw new Error('Mapeamento precisa incluir "name" e "phone"');
  }

  const colIndex: Record<string, number> = {};
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i]!;
    if (mapping[h]) colIndex[mapping[h]!] = i;
  }

  const strategy: DuplicateStrategy = options.duplicateStrategy ?? 'SKIP';
  const tagIds = options.tagIds ?? [];

  type Parsed = {
    rowNumber: number;
    name: string;
    phone: string;
    fields: Record<string, unknown>;
    address: Record<string, string>;
  };

  const errorRows: ImportRowError[] = [];
  const parsedRows: Parsed[] = [];

  dataRows.forEach((row, idx) => {
    const rowNumber = idx + 2; // +2 = +1 pra cabeçalho, +1 pra base 1
    const get = (target: string): string => {
      const i = colIndex[target];
      return i === undefined ? '' : (row[i] ?? '').trim();
    };

    const name = get('name');
    const phoneRaw = get('phone');
    if (!name && !phoneRaw) return; // linha vazia: ignora silenciosamente
    if (!name) {
      errorRows.push({ row: rowNumber, reason: 'Nome obrigatório' });
      return;
    }
    if (!phoneRaw) {
      errorRows.push({ row: rowNumber, reason: 'Telefone obrigatório' });
      return;
    }
    const phone = normalizePhone(phoneRaw);
    if (phone.length < 10 || phone.length > 13) {
      errorRows.push({ row: rowNumber, reason: 'Telefone inválido' });
      return;
    }

    const fields: Record<string, unknown> = {};
    const email = get('email');
    if (email) fields.email = email;
    const cpf = get('cpf');
    if (cpf) fields.cpf = cpf;
    const birth = get('birthDate');
    if (birth) {
      const d = parseDate(birth);
      if (d) fields.birthDate = d;
    }
    const notes = get('notes');
    if (notes) fields.notes = notes;

    const address: Record<string, string> = {};
    for (const f of ['street', 'number', 'city', 'state', 'zip', 'complement']) {
      const v = get(`address.${f}`);
      if (v) address[f] = v;
    }

    parsedRows.push({ rowNumber, name, phone, fields, address });
  });

  // Pré-busca contatos existentes por phone
  const phones = parsedRows.map((p) => p.phone);
  const existing = await prisma.contact.findMany({
    where: { phone: { in: phones } },
    select: { id: true, phone: true },
  });
  const existingByPhone = new Map(existing.map((e) => [e.phone, e.id]));

  let created = 0;
  let updated = 0;
  let skipped = 0;

  // Processa em chunks de 100
  for (let i = 0; i < parsedRows.length; i += 100) {
    const chunk = parsedRows.slice(i, i + 100);
    await prisma.$transaction(async (tx) => {
      for (const p of chunk) {
        const existsId = existingByPhone.get(p.phone);
        const data: Prisma.ContactCreateInput = {
          name: p.name,
          phone: p.phone,
          ...(p.fields.email ? { email: String(p.fields.email) } : {}),
          ...(p.fields.cpf ? { cpf: String(p.fields.cpf) } : {}),
          ...(p.fields.birthDate ? { birthDate: p.fields.birthDate as Date } : {}),
          ...(p.fields.notes ? { notes: String(p.fields.notes) } : {}),
          ...(Object.keys(p.address).length > 0 ? { address: p.address as Prisma.InputJsonValue } : {}),
          ...(options.ownerId ? { owner: { connect: { id: options.ownerId } } } : {}),
          ...(tagIds.length > 0 ? { tags: { connect: tagIds.map((id) => ({ id })) } } : {}),
        };

        if (existsId) {
          if (strategy === 'SKIP') {
            skipped++;
            continue;
          }
          if (strategy === 'UPDATE') {
            const updateData: Prisma.ContactUpdateInput = {
              name: p.name,
              ...(p.fields.email ? { email: String(p.fields.email) } : {}),
              ...(p.fields.cpf ? { cpf: String(p.fields.cpf) } : {}),
              ...(p.fields.birthDate ? { birthDate: p.fields.birthDate as Date } : {}),
              ...(p.fields.notes ? { notes: String(p.fields.notes) } : {}),
              ...(Object.keys(p.address).length > 0 ? { address: p.address as Prisma.InputJsonValue } : {}),
              ...(options.ownerId ? { owner: { connect: { id: options.ownerId } } } : {}),
              ...(tagIds.length > 0 ? { tags: { connect: tagIds.map((id) => ({ id })) } } : {}),
            };
            await tx.contact.update({ where: { id: existsId }, data: updateData });
            updated++;
            continue;
          }
          // CREATE_ANYWAY: vai falhar pelo @unique, reporta e segue
          errorRows.push({ row: p.rowNumber, reason: 'Telefone já cadastrado' });
          continue;
        }

        try {
          await tx.contact.create({ data });
          created++;
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Falha ao criar';
          errorRows.push({ row: p.rowNumber, reason: msg });
        }
      }
    });
  }

  return {
    total: parsedRows.length + errorRows.filter((e) => e.row).length,
    created,
    updated,
    skipped,
    errors: errorRows.length,
    errorRows: errorRows.slice(0, 200),
  };
}

function parseDate(s: string): Date | null {
  // Aceita DD/MM/YYYY, YYYY-MM-DD ou outros parseable pelo Date
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) {
    const [, d, m, y] = br;
    const dt = new Date(Number(y), Number(m) - 1, Number(d));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  const dt = new Date(s);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

// =====================================================================
// CSV template
// =====================================================================

export function buildImportTemplate(): string {
  const headers = ['Nome', 'Telefone', 'Email', 'CPF', 'Data Nascimento', 'Cidade', 'Estado', 'CEP', 'Observações'];
  const example = ['Maria Souza', '11999990000', 'maria@exemplo.com', '', '15/03/1990', 'São Paulo', 'SP', '01310-100', ''];
  return [headers.join(','), example.join(',')].join('\n');
}
