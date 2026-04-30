// Custom node components pra ReactFlow.
//
// Tipos visuais:
//   - trigger: dourado, com indicador no topo
//   - condition: cinza com 2 saídas (true/false)
//   - action: branco/preto, retângulo arredondado
//   - ai: acento dourado, brilho sutil
//   - wait: tracejado com ícone de relógio
//
// Cada node tem `data: { subtype, config, status?, error? }`.
// `status` é 'configured' | 'unconfigured' | 'invalid' | 'selected' | 'running'.

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Icons } from '../../../components/icons';
import { useTheme } from '../../../lib/ThemeContext';
import { labelFor } from './labels';

export type FlowNodeData = {
  subtype: string;
  config?: Record<string, unknown>;
  status?: 'configured' | 'unconfigured' | 'invalid' | 'running' | 'success' | 'failed';
  errorMessage?: string;
  selected?: boolean;
};

function statusBorder(s: FlowNodeData['status'], gold: string, fallback: string) {
  switch (s) {
    case 'unconfigured':
      return '#eab308';
    case 'invalid':
    case 'failed':
      return '#ef4444';
    case 'running':
      return gold;
    case 'success':
      return '#10b981';
    default:
      return fallback;
  }
}

function NodeBody({
  icon,
  title,
  subtitle,
  bg,
  fg,
  border,
  selected,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  bg: string;
  fg: string;
  border: string;
  selected: boolean;
}) {
  const { tokens: t } = useTheme();
  return (
    <div
      style={{
        minWidth: 200,
        maxWidth: 240,
        padding: '10px 12px',
        background: bg,
        color: fg,
        border: `2px solid ${selected ? t.gold : border}`,
        borderRadius: 10,
        boxShadow: selected ? `0 0 0 3px ${t.goldFaint}` : '0 1px 4px rgba(0,0,0,0.1)',
        fontSize: 12.5,
        fontFamily: 'inherit',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: 5,
            background: 'rgba(255,255,255,0.18)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {icon}
        </div>
        <div style={{ fontWeight: 600 }}>{title}</div>
      </div>
      {subtitle ? (
        <div
          style={{
            marginTop: 4,
            fontSize: 10.5,
            opacity: 0.78,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {subtitle}
        </div>
      ) : null}
    </div>
  );
}

function summarizeConfig(subtype: string, config: Record<string, unknown> | undefined): string {
  if (!config || Object.keys(config).length === 0) return 'Não configurado';
  // Mostra os primeiros 1-2 campos significativos
  const parts: string[] = [];
  for (const [k, v] of Object.entries(config)) {
    if (v == null || v === '') continue;
    if (typeof v === 'object') continue;
    parts.push(`${k}: ${String(v).slice(0, 24)}`);
    if (parts.length >= 2) break;
  }
  return parts.length > 0 ? parts.join(' · ') : 'Config presente';
}

// ============================================================================

export function TriggerNode(props: NodeProps) {
  const data = props.data as FlowNodeData;
  const { tokens: t } = useTheme();
  const label = labelFor('trigger', data.subtype);
  const summary = summarizeConfig(data.subtype, data.config);

  return (
    <>
      <NodeBody
        icon={<Icons.Bolt s={12} c="#1a1300" />}
        title={label}
        subtitle={summary}
        bg={t.gold}
        fg="#1a1300"
        border={statusBorder(data.status, t.gold, t.gold)}
        selected={!!props.selected}
      />
      <Handle type="source" position={Position.Bottom} style={{ background: t.gold }} />
    </>
  );
}

export function ConditionNode(props: NodeProps) {
  const data = props.data as FlowNodeData;
  const { tokens: t } = useTheme();
  const label = labelFor('condition', data.subtype);
  const summary = summarizeConfig(data.subtype, data.config);
  const cardBg = t.bgInput;
  const fg = t.text;

  return (
    <>
      <Handle type="target" position={Position.Top} style={{ background: t.textDim }} />
      <NodeBody
        icon={<Icons.Filter s={12} c={fg} />}
        title={label}
        subtitle={summary}
        bg={cardBg}
        fg={fg}
        border={statusBorder(data.status, t.gold, t.border)}
        selected={!!props.selected}
      />
      {/* Duas saídas: true (esquerda) e false (direita) */}
      <Handle
        id="true"
        type="source"
        position={Position.Bottom}
        style={{ left: '30%', background: '#10b981' }}
      />
      <Handle
        id="false"
        type="source"
        position={Position.Bottom}
        style={{ left: '70%', background: '#ef4444' }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: -20,
          left: '12%',
          fontSize: 9,
          color: '#10b981',
          fontWeight: 600,
        }}
      >
        verdadeiro
      </div>
      <div
        style={{
          position: 'absolute',
          bottom: -20,
          right: '12%',
          fontSize: 9,
          color: '#ef4444',
          fontWeight: 600,
        }}
      >
        falso
      </div>
    </>
  );
}

export function ActionNode(props: NodeProps) {
  const data = props.data as FlowNodeData;
  const { tokens: t } = useTheme();
  const label = labelFor('action', data.subtype);
  const summary = summarizeConfig(data.subtype, data.config);
  const isAi = data.subtype.startsWith('ai_');
  const isWait = data.subtype === 'wait';

  if (isWait) {
    return (
      <>
        <Handle type="target" position={Position.Top} style={{ background: t.textDim }} />
        <div
          style={{
            minWidth: 180,
            padding: '10px 12px',
            background: t.bgElevated,
            border: `2px dashed ${statusBorder(data.status, t.gold, t.border)}`,
            borderRadius: 10,
            color: t.text,
            fontSize: 12.5,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Icons.Calendar s={12} c={t.textDim} />
          <div>
            <div style={{ fontWeight: 600 }}>Aguardar</div>
            <div style={{ fontSize: 10.5, color: t.textDim }}>{summary}</div>
          </div>
        </div>
        <Handle type="source" position={Position.Bottom} style={{ background: t.textDim }} />
      </>
    );
  }

  const bg = isAi ? t.goldFaint : t.bgElevated;
  const fg = t.text;
  const icon = isAi ? <Icons.Bolt s={12} c={t.gold} /> : <Icons.Send s={12} c={fg} />;

  return (
    <>
      <Handle type="target" position={Position.Top} style={{ background: t.textDim }} />
      <NodeBody
        icon={icon}
        title={label}
        subtitle={summary}
        bg={bg}
        fg={fg}
        border={statusBorder(data.status, t.gold, isAi ? t.gold : t.border)}
        selected={!!props.selected}
      />
      <Handle type="source" position={Position.Bottom} style={{ background: t.textDim }} />
    </>
  );
}

export const NODE_TYPES = {
  trigger: TriggerNode,
  condition: ConditionNode,
  action: ActionNode,
};
