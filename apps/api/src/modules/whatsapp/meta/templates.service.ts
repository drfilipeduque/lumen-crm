// Sincroniza templates com a Meta e formata pra envio.
// O modelo local Template tem só os campos exibíveis; quem envia recompõe
// o objeto components a partir do que está salvo + variáveis.

import { Prisma, prisma } from '../../../lib/prisma.js';
import {
  createTemplate as metaCreate,
  deleteTemplate as metaDelete,
  listTemplates as metaList,
  type CreateTemplateInput,
  type MetaTemplate,
  type MetaTemplateComponent,
} from './meta.service.js';

const MAP_STATUS: Record<MetaTemplate['status'], 'APPROVED' | 'PENDING' | 'REJECTED'> = {
  APPROVED: 'APPROVED',
  PENDING: 'PENDING',
  REJECTED: 'REJECTED',
  IN_APPEAL: 'PENDING',
  PAUSED: 'REJECTED',
  DISABLED: 'REJECTED',
};

function pickBody(components: MetaTemplateComponent[]): string {
  return components.find((c) => c.type === 'BODY')?.text ?? '';
}

function pickHeader(components: MetaTemplateComponent[]) {
  const h = components.find((c) => c.type === 'HEADER');
  if (!h) return null;
  return { format: h.format ?? 'TEXT', text: h.text ?? null };
}

function pickFooter(components: MetaTemplateComponent[]) {
  return components.find((c) => c.type === 'FOOTER')?.text ?? null;
}

function pickButtons(components: MetaTemplateComponent[]) {
  const b = components.find((c) => c.type === 'BUTTONS');
  return b?.buttons ?? null;
}

// Extrai as variáveis ({{1}}, {{2}}…) do body em ordem
function extractVariables(body: string): string[] {
  const m = body.match(/\{\{\d+\}\}/g);
  if (!m) return [];
  return Array.from(new Set(m)).sort();
}

export async function syncTemplates(connectionId: string, wabaId: string, accessToken: string): Promise<{ count: number }> {
  const remote = await metaList(wabaId, accessToken);

  // Estratégia: upsert por (connectionId, externalId). Se um template some
  // remotamente, deletamos local pra refletir.
  const seenIds = new Set<string>();
  for (const t of remote) {
    seenIds.add(t.id);
    const body = pickBody(t.components);
    const headerJson = pickHeader(t.components);
    const buttonsJson = pickButtons(t.components);
    const data = {
      connectionId,
      externalId: t.id,
      name: t.name,
      category: (t.category ?? 'UTILITY') as 'MARKETING' | 'UTILITY' | 'AUTHENTICATION',
      language: t.language ?? 'pt_BR',
      status: MAP_STATUS[t.status] ?? 'PENDING',
      body,
      variables: extractVariables(body) as Prisma.InputJsonValue,
      header: headerJson === null ? Prisma.JsonNull : (headerJson as Prisma.InputJsonValue),
      footer: pickFooter(t.components),
      buttons: buttonsJson === null ? Prisma.JsonNull : (buttonsJson as unknown as Prisma.InputJsonValue),
    };

    const existing = await prisma.template.findFirst({
      where: { connectionId, externalId: t.id },
      select: { id: true },
    });
    if (existing) {
      await prisma.template.update({ where: { id: existing.id }, data });
    } else {
      await prisma.template.create({ data });
    }
  }

  // Remove templates que sumiram remotamente (mantém os PENDING locais
  // que ainda não tem externalId — foram criados aqui e aguardam Meta)
  await prisma.template.deleteMany({
    where: {
      connectionId,
      externalId: { not: null, notIn: [...seenIds] },
    },
  });

  return { count: remote.length };
}

// =====================================================================
// CREATE / DELETE
// =====================================================================

export type LocalTemplateInput = {
  name: string;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  language: string;
  header?: { format: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT'; text?: string } | null;
  body: string;
  footer?: string | null;
  buttons?: Array<{
    type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';
    text: string;
    url?: string;
    phone_number?: string;
  }> | null;
};

function buildComponents(input: LocalTemplateInput): MetaTemplateComponent[] {
  const out: MetaTemplateComponent[] = [];
  if (input.header) {
    const h: MetaTemplateComponent = { type: 'HEADER', format: input.header.format };
    if (input.header.format === 'TEXT' && input.header.text) h.text = input.header.text;
    out.push(h);
  }
  out.push({ type: 'BODY', text: input.body });
  if (input.footer) out.push({ type: 'FOOTER', text: input.footer });
  if (input.buttons && input.buttons.length > 0) {
    out.push({ type: 'BUTTONS', buttons: input.buttons });
  }
  return out;
}

export async function createTemplate(
  connectionId: string,
  wabaId: string,
  accessToken: string,
  input: LocalTemplateInput,
) {
  const components = buildComponents(input);
  const remote = await metaCreate(wabaId, accessToken, {
    name: input.name,
    category: input.category,
    language: input.language,
    components,
  } as CreateTemplateInput);

  // Persiste local com status PENDING — Meta vai aprovar/rejeitar depois.
  // O sync periódico atualiza o status.
  return prisma.template.create({
    data: {
      connectionId,
      externalId: remote.id,
      name: input.name,
      category: input.category,
      language: input.language,
      status: (MAP_STATUS[remote.status as MetaTemplate['status']] ?? 'PENDING') as
        | 'APPROVED'
        | 'PENDING'
        | 'REJECTED',
      body: input.body,
      variables: extractVariables(input.body) as Prisma.InputJsonValue,
      header: (input.header ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      footer: input.footer ?? null,
      buttons: (input.buttons ?? Prisma.JsonNull) as unknown as Prisma.InputJsonValue,
    },
  });
}

export async function deleteTemplate(
  connectionId: string,
  wabaId: string,
  accessToken: string,
  templateId: string,
) {
  const tmpl = await prisma.template.findUnique({ where: { id: templateId } });
  if (!tmpl || tmpl.connectionId !== connectionId) return;
  // Tenta apagar na Meta; se falhar mas o template não existir lá, segue.
  try {
    await metaDelete(wabaId, accessToken, tmpl.name);
  } catch {
    /* ignora — pode não existir mais lá */
  }
  await prisma.template.delete({ where: { id: tmpl.id } });
}

// =====================================================================
// SEND-FORMAT — converte vars { "1": "valor" } pra components da Meta
// =====================================================================

export function buildSendComponents(
  template: { body: string; header?: unknown; buttons?: unknown },
  variables: Record<string, string>,
): unknown[] {
  const out: unknown[] = [];
  const bodyParams = bodyParamsFromVariables(template.body, variables);
  if (bodyParams.length > 0) {
    out.push({ type: 'body', parameters: bodyParams });
  }
  return out;
}

function bodyParamsFromVariables(body: string, vars: Record<string, string>): Array<{ type: 'text'; text: string }> {
  const matches = Array.from(body.matchAll(/\{\{(\d+)\}\}/g)).map((m) => m[1]!);
  const ordered = Array.from(new Set(matches)).sort((a, b) => Number(a) - Number(b));
  return ordered.map((idx) => ({ type: 'text' as const, text: vars[idx] ?? '' }));
}
