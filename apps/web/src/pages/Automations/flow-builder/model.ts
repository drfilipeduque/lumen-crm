// Modelo "linear" do construtor estilo ClickUp <-> JSON Flow do engine.
//
// Builder state:
//   - trigger: 1 nó (ou null se ainda não escolhido)
//   - conditions: lista plana de condições combinadas por um único operador
//     top-level (AND ou OR). Edição visual sem aninhamento — pra "(A AND B) OR C"
//     o usuário hoje precisa editar como JSON. Cobre 95% dos casos reais.
//   - actions: sequência linear; edges geradas automaticamente.
//
// JSON Flow (engine):
//   - sempre 1 trigger node
//   - se há condições, 1 condition wrapper com subtype=AND/OR e
//     config.children = [{ subtype, config }, ...]
//   - actions em sequência ligadas por edges sem branch (ou via branch=true
//     quando saem do condition wrapper)
//
// Compatibilidade reversa: ler JSON gerado pelo editor antigo (ReactFlow)
// é best-effort — desambigua estrutura linear simples; estruturas com
// múltiplas branches (cada condição com true/false separado) caem em
// "_legacy" e o usuário precisa editar via JSON raw fallback.

import type { Flow, FlowNode, FlowEdge } from '../../../hooks/useAutomations';

export type BuilderTrigger = {
  subtype: string;
  config: Record<string, unknown>;
};

export type BuilderCondition = {
  id: string;
  subtype: string;
  config: Record<string, unknown>;
};

export type BuilderAction = {
  id: string;
  subtype: string;
  config: Record<string, unknown>;
};

export type ConditionMode = 'AND' | 'OR';

export type BuilderState = {
  trigger: BuilderTrigger | null;
  conditionMode: ConditionMode;
  conditions: BuilderCondition[];
  actions: BuilderAction[];
  // Quando o JSON original não bate com o modelo linear, guardamos o flow
  // bruto pra preservar e o construtor exibe um aviso.
  legacyFlow: Flow | null;
};

export const EMPTY_STATE: BuilderState = {
  trigger: null,
  conditionMode: 'AND',
  conditions: [],
  actions: [],
  legacyFlow: null,
};

export function newId(prefix = 'n'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

// =====================================================================
// Builder → Flow
// =====================================================================

export function builderToFlow(s: BuilderState): Flow {
  if (s.legacyFlow && s.trigger === null && s.actions.length === 0 && s.conditions.length === 0) {
    return s.legacyFlow;
  }

  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];

  if (!s.trigger) {
    return { nodes: [], edges: [] };
  }

  const triggerId = 'trigger';
  nodes.push({ id: triggerId, type: 'trigger', subtype: s.trigger.subtype, config: s.trigger.config });

  let cursor = triggerId;
  let cursorBranch: 'true' | 'false' | undefined;

  if (s.conditions.length > 0) {
    const condId = 'cond';
    const wrapperSubtype = s.conditionMode === 'OR' ? 'or' : 'and';
    nodes.push({
      id: condId,
      type: 'condition',
      subtype: wrapperSubtype,
      config: {
        children: s.conditions.map((c) => ({ subtype: c.subtype, config: c.config })),
      },
    });
    edges.push({ from: triggerId, to: condId });
    cursor = condId;
    cursorBranch = 'true';
  }

  for (const a of s.actions) {
    const id = a.id;
    nodes.push({ id, type: 'action', subtype: a.subtype, config: a.config });
    edges.push({ from: cursor, to: id, ...(cursorBranch ? { branch: cursorBranch } : {}) });
    cursor = id;
    cursorBranch = undefined;
  }

  return { nodes, edges };
}

// =====================================================================
// Flow → Builder
// =====================================================================

export function flowToBuilder(flow: Flow | null | undefined): BuilderState {
  if (!flow || !flow.nodes || flow.nodes.length === 0) {
    return EMPTY_STATE;
  }

  const trigger = flow.nodes.find((n) => n.type === 'trigger');
  if (!trigger) return { ...EMPTY_STATE, legacyFlow: flow };

  // Edges saindo do trigger
  const fromTrigger = flow.edges.filter((e) => e.from === trigger.id);
  if (fromTrigger.length > 1) {
    return {
      trigger: null,
      conditionMode: 'AND',
      conditions: [],
      actions: [],
      legacyFlow: flow,
    };
  }

  const builder: BuilderState = {
    trigger: { subtype: trigger.subtype, config: trigger.config ?? {} },
    conditionMode: 'AND',
    conditions: [],
    actions: [],
    legacyFlow: null,
  };

  if (fromTrigger.length === 0) return builder;

  const next = flow.nodes.find((n) => n.id === fromTrigger[0]!.to);
  if (!next) return builder;

  let actionStartId: string | null = null;

  if (next.type === 'condition') {
    const subtype = next.subtype.toLowerCase();
    if (subtype !== 'and' && subtype !== 'or') {
      // Estrutura de condições aninhadas — não suportada no editor linear
      return { ...EMPTY_STATE, legacyFlow: flow };
    }
    builder.conditionMode = subtype === 'or' ? 'OR' : 'AND';
    const children = ((next.config?.children as unknown[]) ?? []) as {
      subtype: string;
      config: Record<string, unknown>;
    }[];
    // Se algum child for and/or/not, cai em legacy
    if (children.some((c) => ['and', 'or', 'not'].includes(c.subtype.toLowerCase()))) {
      return { ...EMPTY_STATE, legacyFlow: flow };
    }
    builder.conditions = children.map((c) => ({
      id: newId('cond'),
      subtype: c.subtype,
      config: c.config ?? {},
    }));

    // Próximo nó depois do condition: branch true
    const trueEdge = flow.edges.find((e) => e.from === next.id && e.branch === 'true');
    const falseEdge = flow.edges.find((e) => e.from === next.id && e.branch === 'false');
    if (falseEdge) {
      // Branch false existe — não suportado no modelo linear
      return { ...EMPTY_STATE, legacyFlow: flow };
    }
    actionStartId = trueEdge?.to ?? null;
    if (!actionStartId) {
      // Condition sem ações — preserva o que tem
      return builder;
    }
  } else if (next.type === 'action') {
    actionStartId = next.id;
  } else {
    return { ...EMPTY_STATE, legacyFlow: flow };
  }

  // Caminhar pela cadeia de actions (edges sem branch)
  const visited = new Set<string>();
  let cursor: string | null = actionStartId;
  while (cursor) {
    if (visited.has(cursor)) {
      // Loop — bail out
      return { ...EMPTY_STATE, legacyFlow: flow };
    }
    visited.add(cursor);
    const node = flow.nodes.find((n) => n.id === cursor);
    if (!node || node.type !== 'action') {
      return { ...EMPTY_STATE, legacyFlow: flow };
    }
    builder.actions.push({
      id: node.id,
      subtype: node.subtype,
      config: node.config ?? {},
    });
    const nextEdges = flow.edges.filter((e) => e.from === node.id && !e.branch);
    if (nextEdges.length > 1) {
      return { ...EMPTY_STATE, legacyFlow: flow };
    }
    cursor = nextEdges[0]?.to ?? null;
  }

  return builder;
}
