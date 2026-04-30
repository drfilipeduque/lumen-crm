// Helpers de conversão Flow ↔ ReactFlow + auto-layout simples.

import type { Node, Edge } from '@xyflow/react';
import type { Flow, FlowNode, FlowEdge } from '../../../hooks/useAutomations';
import type { FlowNodeData } from './nodes';

// Flow (do backend) → Nodes/Edges (do ReactFlow)
export function flowToReactFlow(flow: Flow): { nodes: Node<FlowNodeData>[]; edges: Edge[] } {
  const nodes: Node<FlowNodeData>[] = flow.nodes.map((n) => ({
    id: n.id,
    type: n.type,
    position: n.position ?? { x: 0, y: 0 },
    data: { subtype: n.subtype, config: n.config ?? {} },
  }));
  const edges: Edge[] = flow.edges.map((e, i) => ({
    id: `${e.from}-${e.to}-${i}`,
    source: e.from,
    target: e.to,
    sourceHandle: e.branch ?? null,
    type: 'default',
    animated: false,
    label: e.branch === 'true' ? 'sim' : e.branch === 'false' ? 'não' : undefined,
    style: e.branch === 'false' ? { stroke: '#ef4444' } : e.branch === 'true' ? { stroke: '#10b981' } : undefined,
  }));
  return { nodes, edges };
}

// ReactFlow nodes/edges → Flow (do backend)
export function reactFlowToFlow(nodes: Node<FlowNodeData>[], edges: Edge[]): Flow {
  const fnodes: FlowNode[] = nodes.map((n) => ({
    id: n.id,
    type: (n.type ?? 'action') as 'trigger' | 'condition' | 'action',
    subtype: n.data.subtype,
    config: n.data.config ?? {},
    position: { x: n.position.x, y: n.position.y },
  }));
  const fedges: FlowEdge[] = edges.map((e) => ({
    from: e.source,
    to: e.target,
    branch: (e.sourceHandle as 'true' | 'false' | null | undefined) ?? undefined,
  }));
  return { nodes: fnodes, edges: fedges };
}

// Auto-layout BFS: organiza por níveis a partir do trigger.
export function autoLayout(nodes: Node<FlowNodeData>[], edges: Edge[]): Node<FlowNodeData>[] {
  const ROW = 140;
  const COL = 280;
  const trigger = nodes.find((n) => n.type === 'trigger');
  if (!trigger) return nodes;

  const out = new Map<string, string[]>();
  for (const e of edges) {
    if (!out.has(e.source)) out.set(e.source, []);
    out.get(e.source)!.push(e.target);
  }

  const level = new Map<string, number>();
  level.set(trigger.id, 0);
  const stack = [trigger.id];
  while (stack.length > 0) {
    const id = stack.shift()!;
    const cur = level.get(id) ?? 0;
    for (const next of out.get(id) ?? []) {
      const proposed = cur + 1;
      if ((level.get(next) ?? -1) < proposed) {
        level.set(next, proposed);
        stack.push(next);
      }
    }
  }

  // Agrupa por nível
  const byLevel = new Map<number, string[]>();
  for (const [id, lv] of level.entries()) {
    if (!byLevel.has(lv)) byLevel.set(lv, []);
    byLevel.get(lv)!.push(id);
  }

  const positions = new Map<string, { x: number; y: number }>();
  for (const [lv, ids] of byLevel.entries()) {
    ids.forEach((id, i) => {
      positions.set(id, { x: (i - (ids.length - 1) / 2) * COL, y: lv * ROW });
    });
  }

  return nodes.map((n) => {
    const p = positions.get(n.id);
    return p ? { ...n, position: p } : n;
  });
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}
