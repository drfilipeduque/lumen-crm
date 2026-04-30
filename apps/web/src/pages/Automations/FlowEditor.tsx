// Editor visual de Automation (página dedicada).
// Rotas: /automations/flows/new e /automations/flows/:id

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Edge,
  type Connection,
  type Node,
  type OnConnect,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import axios from 'axios';
import { useNavigate, useParams } from 'react-router-dom';
import { useTheme } from '../../lib/ThemeContext';
import { Icons } from '../../components/icons';
import { Switch } from '../../components/ui/Switch';
import { toast } from '../../components/ui/Toast';
import {
  useAutomation,
  useCreateAutomation,
  useUpdateAutomation,
  useToggleAutomation,
  useValidateFlow,
  type Flow,
  type FlowValidationError,
} from '../../hooks/useAutomations';
import { FlowLibrary } from './flow-editor/library';
import { FlowProperties } from './flow-editor/properties';
import { NODE_TYPES, type FlowNodeData } from './flow-editor/nodes';
import { autoLayout, flowToReactFlow, newId, reactFlowToFlow } from './flow-editor/util';
import { DryRunModal } from './flow-editor/DryRunModal';

export function FlowEditor() {
  return (
    <ReactFlowProvider>
      <FlowEditorInner />
    </ReactFlowProvider>
  );
}

function FlowEditorInner() {
  const { tokens: t } = useTheme();
  const nav = useNavigate();
  const params = useParams<{ id: string }>();
  const isNew = !params.id || params.id === 'new';
  const automationId = isNew ? null : params.id ?? null;

  const existing = useAutomation(automationId);
  const createMut = useCreateAutomation();
  const updateMut = useUpdateAutomation();
  const toggleMut = useToggleAutomation();
  const validateMut = useValidateFlow();

  const [name, setName] = useState('Novo fluxo');
  const [active, setActive] = useState(false);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<FlowNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [errors, setErrors] = useState<FlowValidationError[]>([]);
  const [dryRunOpen, setDryRunOpen] = useState(false);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const rfRef = useRef<ReactFlowInstance<Node<FlowNodeData>, Edge> | null>(null);

  // Carrega o automation existente.
  useEffect(() => {
    if (!existing.data) return;
    setName(existing.data.name);
    setActive(existing.data.active);
    const r = flowToReactFlow(existing.data.flow);
    setNodes(r.nodes);
    setEdges(r.edges);
  }, [existing.data, setNodes, setEdges]);

  // Marca status visual em cada nó (unconfigured/invalid) com base nos errors.
  useEffect(() => {
    const errByNode = new Map<string, FlowValidationError>();
    for (const e of errors) {
      if (e.nodeId) errByNode.set(e.nodeId, e);
    }
    setNodes((nds) =>
      nds.map((n) => {
        const er = errByNode.get(n.id);
        const hasConfig = !!(n.data.config && Object.keys(n.data.config).length > 0);
        const status: FlowNodeData['status'] = er
          ? 'invalid'
          : hasConfig
            ? 'configured'
            : 'unconfigured';
        return {
          ...n,
          data: { ...n.data, status, errorMessage: er?.message },
        };
      }),
    );
  }, [errors, setNodes]);

  // Conexão entre nós
  const onConnect: OnConnect = useCallback(
    (conn: Connection) => {
      // Em condition, sourceHandle distingue true/false
      const branch = (conn.sourceHandle as 'true' | 'false' | null) ?? undefined;
      const e: Edge = {
        id: `${conn.source}-${conn.target}-${Math.random()}`,
        source: conn.source!,
        target: conn.target!,
        sourceHandle: branch,
        label: branch === 'true' ? 'sim' : branch === 'false' ? 'não' : undefined,
        style: branch === 'false' ? { stroke: '#ef4444' } : branch === 'true' ? { stroke: '#10b981' } : undefined,
      };
      setEdges((eds) => addEdge(e, eds));
    },
    [setEdges],
  );

  // Drop de nó da biblioteca
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const raw = e.dataTransfer.getData('application/reactflow');
      if (!raw) return;
      const { type, subtype } = JSON.parse(raw) as { type: 'trigger' | 'condition' | 'action'; subtype: string };
      // Bloqueia múltiplos triggers
      if (type === 'trigger' && nodes.some((n) => n.type === 'trigger')) {
        toast('Fluxo só pode ter um gatilho', 'error');
        return;
      }
      const inst = rfRef.current;
      if (!inst) return;
      const pos = inst.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const id = newId();
      const newNode: Node<FlowNodeData> = {
        id,
        type,
        position: pos,
        data: { subtype, config: {} },
      };
      setNodes((nds) => [...nds, newNode]);
    },
    [nodes, setNodes],
  );

  // Atualiza config de um nó (chamado pelo Properties)
  const onConfigChange = useCallback(
    (id: string, config: Record<string, unknown>) => {
      setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, config } } : n)));
    },
    [setNodes],
  );

  const onNodeDelete = useCallback(
    (id: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== id));
      setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
      setSelectedId(null);
    },
    [setNodes, setEdges],
  );

  const validate = async () => {
    const flow = reactFlowToFlow(nodes, edges);
    try {
      const r = await validateMut.mutateAsync(flow);
      setErrors(r.errors ?? []);
      if (r.ok) toast('Fluxo válido', 'success');
      else toast(`${r.errors.length} erro(s) encontrados`, 'error');
    } catch {
      toast('Falha na validação', 'error');
    }
  };

  const save = async () => {
    const flow = reactFlowToFlow(nodes, edges);
    try {
      if (isNew) {
        const a = await createMut.mutateAsync({ name, active, flow });
        toast('Fluxo criado', 'success');
        nav(`/automations/flows/${a.id}`, { replace: true });
      } else if (automationId) {
        await updateMut.mutateAsync({ id: automationId, name, active, flow });
        toast('Fluxo salvo', 'success');
      }
      setErrors([]);
    } catch (e) {
      if (axios.isAxiosError(e) && e.response?.status === 400 && Array.isArray(e.response.data?.errors)) {
        setErrors(e.response.data.errors as FlowValidationError[]);
        toast(`Validação: ${e.response.data.errors.length} erro(s)`, 'error');
      } else {
        const msg = axios.isAxiosError(e) ? e.response?.data?.message : null;
        toast(msg || 'Falha ao salvar', 'error');
      }
    }
  };

  const onToggle = async () => {
    if (!automationId) {
      // Novo: só inverte o estado local
      setActive((s) => !s);
      return;
    }
    try {
      const updated = await toggleMut.mutateAsync(automationId);
      setActive(updated.active);
    } catch (e) {
      const msg = axios.isAxiosError(e) ? e.response?.data?.message : null;
      toast(msg || 'Falha ao alternar', 'error');
    }
  };

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedId) ?? null,
    [nodes, selectedId],
  );

  const validationStatus = errors.length === 0 ? 'ok' : 'invalid';

  // Auto-arrumar (toolbar flutuante)
  const onAutoLayout = () => {
    setNodes((nds) => autoLayout(nds, edges));
    setTimeout(() => rfRef.current?.fitView({ padding: 0.2 }), 50);
  };

  const triggerNode = nodes.find((n) => n.type === 'trigger');

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: t.bg, color: t.text }}>
      {/* Header */}
      <div
        style={{
          padding: '12px 20px',
          borderBottom: `1px solid ${t.border}`,
          background: t.bgElevated,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <button
          type="button"
          onClick={() => nav('/automations')}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: t.textDim, padding: 4 }}
          aria-label="Voltar"
        >
          <Icons.ChevronL s={18} c={t.textDim} />
        </button>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{
            background: 'transparent',
            border: 'none',
            color: t.text,
            fontSize: 16,
            fontWeight: 600,
            outline: 'none',
            padding: '4px 8px',
            borderRadius: 6,
            minWidth: 200,
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Switch checked={active} onChange={onToggle} ariaLabel="ativar" />
          <span style={{ fontSize: 12, color: t.textDim }}>{active ? 'Ativo' : 'Inativo'}</span>
        </div>
        <div
          style={{
            padding: '4px 10px',
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 600,
            background: validationStatus === 'ok' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
            color: validationStatus === 'ok' ? '#10b981' : '#ef4444',
          }}
        >
          {validationStatus === 'ok' ? 'Pronto' : `Inválido (${errors.length} erro${errors.length === 1 ? '' : 's'})`}
        </div>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={validate} disabled={validateMut.isPending} style={btnNeutral(t)}>
          {validateMut.isPending ? 'Validando…' : 'Validar'}
        </button>
        {!isNew && triggerNode ? (
          <button type="button" onClick={() => setDryRunOpen(true)} style={btnNeutral(t)}>
            Testar fluxo
          </button>
        ) : null}
        <button type="button" onClick={save} disabled={createMut.isPending || updateMut.isPending} style={btnGold(t)}>
          {createMut.isPending || updateMut.isPending ? 'Salvando…' : 'Salvar'}
        </button>
      </div>

      {/* Body — 3 colunas */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <FlowLibrary />

        <div ref={wrapperRef} style={{ flex: 1, minWidth: 0, position: 'relative' }} onDragOver={onDragOver} onDrop={onDrop}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={(inst) => (rfRef.current = inst)}
            onNodeClick={(_, n) => setSelectedId(n.id)}
            onPaneClick={() => setSelectedId(null)}
            nodeTypes={NODE_TYPES}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background color={t.border} gap={16} />
            <MiniMap
              nodeColor={(n) => (n.type === 'trigger' ? t.gold : t.textDim)}
              style={{ background: t.bgElevated, border: `1px solid ${t.border}` }}
            />
            <Controls />
          </ReactFlow>

          {/* Toolbar flutuante (canto inferior direito, acima dos Controls) */}
          <div
            style={{
              position: 'absolute',
              right: 14,
              bottom: 110,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              zIndex: 10,
            }}
          >
            <FloatBtn t={t} title="Auto-arrumar" onClick={onAutoLayout}>
              <Icons.Pipeline s={14} c={t.text} />
            </FloatBtn>
            <FloatBtn t={t} title="Zoom pra caber" onClick={() => rfRef.current?.fitView({ padding: 0.2 })}>
              <Icons.Search s={14} c={t.text} />
            </FloatBtn>
            <FloatBtn
              t={t}
              title="Limpar canvas"
              onClick={() => {
                if (!confirm('Apagar todos os nós e conexões?')) return;
                setNodes([]);
                setEdges([]);
                setSelectedId(null);
              }}
            >
              <Icons.Trash s={14} c="#ef4444" />
            </FloatBtn>
          </div>
        </div>

        <FlowProperties
          node={selectedNode}
          onChange={onConfigChange}
          onDelete={onNodeDelete}
          onClose={() => setSelectedId(null)}
        />
      </div>

      {/* Lista de erros (rodapé colapsado quando há erros) */}
      {errors.length > 0 ? (
        <div
          style={{
            background: 'rgba(239,68,68,0.08)',
            borderTop: `1px solid rgba(239,68,68,0.3)`,
            padding: '8px 16px',
            color: '#ef4444',
            fontSize: 12,
            maxHeight: 100,
            overflow: 'auto',
          }}
        >
          {errors.map((e, i) => (
            <div key={i}>
              {e.nodeId ? `Nó ${e.nodeId}: ` : ''}
              {e.message}
            </div>
          ))}
        </div>
      ) : null}

      {dryRunOpen && automationId && triggerNode ? (
        <DryRunModal
          automationId={automationId}
          triggerType={triggerNode.data.subtype}
          onClose={() => setDryRunOpen(false)}
        />
      ) : null}
    </div>
  );
}

function FloatBtn({
  t,
  title,
  onClick,
  children,
}: {
  t: ReturnType<typeof useTheme>['tokens'];
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        width: 32,
        height: 32,
        borderRadius: 7,
        background: t.bgElevated,
        border: `1px solid ${t.border}`,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 4px 10px rgba(0,0,0,0.1)',
      }}
    >
      {children}
    </button>
  );
}

type Tk = ReturnType<typeof useTheme>['tokens'];
const btnGold = (t: Tk) => ({
  padding: '7px 14px',
  borderRadius: 8,
  background: t.gold,
  color: '#1a1300',
  border: 'none',
  fontSize: 12.5,
  fontWeight: 600,
  cursor: 'pointer' as const,
});
const btnNeutral = (t: Tk) => ({
  padding: '7px 12px',
  borderRadius: 8,
  background: t.bgInput,
  color: t.text,
  border: `1px solid ${t.border}`,
  fontSize: 12.5,
  cursor: 'pointer' as const,
});

function _useReactFlow(): ReactFlowInstance | null {
  // helper unused — useReactFlow imported above kept for future
  void useReactFlow;
  return null;
}
void _useReactFlow;
