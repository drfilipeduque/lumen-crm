// Avalia nós do tipo "condition". Retorna boolean (true → segue branch "true").
//
// Subtypes suportados:
//   pipeline_equals, stage_equals
//   tag_equals, tag_includes_any, tag_includes_all
//   owner_equals
//   priority_equals
//   value_gt, value_lt, value_between
//   business_hours, day_of_week
//   custom_field_equals, custom_field_contains
//   has_active_reminder
//   days_since_creation_gt
//   and / or / not (combinadores — config.children: ConditionNode[])

import { prisma } from '../../../lib/prisma.js';
import type { ExecutionContext } from './context.js';

export type ConditionConfig = Record<string, unknown> & {
  children?: { subtype: string; config: ConditionConfig }[];
};

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

// Brasília: business hours 9h-18h, seg-sex (TZ-aware via ENV poderia ajustar).
function isBusinessHours(d: Date): boolean {
  const day = d.getUTCDay(); // 0=Dom, 6=Sab — TZ negociada com cliente; usamos UTC do servidor.
  const hour = d.getUTCHours() - 3; // BRT (sem horário de verão atual)
  return day >= 1 && day <= 5 && hour >= 9 && hour < 18;
}

export async function evaluateCondition(
  subtype: string,
  config: ConditionConfig,
  ctx: ExecutionContext,
): Promise<boolean> {
  const op = ctx.opportunity;

  switch (subtype) {
    case 'pipeline_equals':
      return !!op && op.pipelineId === config.pipelineId;
    case 'stage_equals':
      return !!op && op.stageId === config.stageId;
    case 'tag_equals': {
      if (!op) return false;
      const tagId = config.tagId as string | undefined;
      return op.tags.some((t) => t.id === tagId);
    }
    case 'tag_includes_any': {
      if (!op) return false;
      const ids = asArray<string>(config.tagIds);
      return op.tags.some((t) => ids.includes(t.id));
    }
    case 'tag_includes_all': {
      if (!op) return false;
      const ids = asArray<string>(config.tagIds);
      return ids.every((id) => op.tags.some((t) => t.id === id));
    }
    case 'owner_equals':
      return !!op && op.ownerId === config.ownerId;
    case 'priority_equals':
      return !!op && op.priority === config.priority;
    case 'value_gt':
      return !!op && op.value > Number(config.value ?? 0);
    case 'value_lt':
      return !!op && op.value < Number(config.value ?? 0);
    case 'value_between': {
      if (!op) return false;
      const min = Number(config.min ?? -Infinity);
      const max = Number(config.max ?? Infinity);
      return op.value >= min && op.value <= max;
    }
    case 'business_hours':
      return isBusinessHours(new Date());
    case 'day_of_week': {
      const days = asArray<number>(config.days);
      return days.includes(new Date().getUTCDay());
    }
    case 'custom_field_equals': {
      if (!op) return false;
      const name = config.fieldName as string | undefined;
      const value = String(config.value ?? '');
      if (!name) return false;
      return op.customFields[name] === value;
    }
    case 'custom_field_contains': {
      if (!op) return false;
      const name = config.fieldName as string | undefined;
      const value = String(config.value ?? '').toLowerCase();
      if (!name) return false;
      const v = op.customFields[name];
      return typeof v === 'string' && v.toLowerCase().includes(value);
    }
    case 'has_active_reminder': {
      if (!op) return false;
      const c = await prisma.reminder.count({ where: { opportunityId: op.id, completed: false } });
      return c > 0;
    }
    case 'days_since_creation_gt': {
      if (!op) return false;
      const days = Number(config.days ?? 0);
      const diffMs = Date.now() - op.createdAt.getTime();
      return diffMs / 86400000 > days;
    }
    case 'and': {
      const children = config.children ?? [];
      for (const c of children) {
        if (!(await evaluateCondition(c.subtype, c.config, ctx))) return false;
      }
      return true;
    }
    case 'or': {
      const children = config.children ?? [];
      for (const c of children) {
        if (await evaluateCondition(c.subtype, c.config, ctx)) return true;
      }
      return false;
    }
    case 'not': {
      const child = config.children?.[0];
      if (!child) return false;
      return !(await evaluateCondition(child.subtype, child.config, ctx));
    }
    default:
      // Subtype desconhecido: condição NÃO satisfeita (fail-safe pra não disparar ação errada).
      return false;
  }
}
