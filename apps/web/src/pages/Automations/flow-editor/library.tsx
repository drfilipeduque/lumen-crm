// Painel esquerdo — biblioteca de nós arrastáveis.
// Drag-and-drop usa o transferData "application/reactflow" pra carregar
// type+subtype; o canvas captura no onDrop.

import { useState } from 'react';
import { useTheme } from '../../../lib/ThemeContext';
import { Icons } from '../../../components/icons';
import { NODE_LIBRARY } from './labels';

export function FlowLibrary() {
  const { tokens: t } = useTheme();
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(NODE_LIBRARY.map((c) => c.category)),
  );
  const toggle = (c: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(c)) n.delete(c);
      else n.add(c);
      return n;
    });

  return (
    <aside
      style={{
        width: 280,
        flexShrink: 0,
        borderRight: `1px solid ${t.border}`,
        background: t.bgElevated,
        overflowY: 'auto',
        padding: '14px 8px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: 1,
          textTransform: 'uppercase',
          color: t.textFaint,
          fontWeight: 600,
          padding: '0 8px',
        }}
      >
        Biblioteca
      </div>
      {NODE_LIBRARY.map((cat) => (
        <div key={cat.category}>
          <button
            type="button"
            onClick={() => toggle(cat.category)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              padding: '6px 8px',
              background: 'transparent',
              border: 'none',
              fontSize: 11.5,
              fontWeight: 600,
              color: t.text,
              cursor: 'pointer',
            }}
          >
            <span>{cat.category}</span>
            <Icons.ChevronD s={10} c={t.textDim} />
          </button>
          {open.has(cat.category) ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {cat.items.map((it) => (
                <DraggableItem
                  key={it.subtype}
                  category={cat.category}
                  type={cat.type}
                  subtype={it.subtype}
                  label={it.label}
                />
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </aside>
  );
}

function DraggableItem({
  category,
  type,
  subtype,
  label,
}: {
  category: string;
  type: 'trigger' | 'condition' | 'action';
  subtype: string;
  label: string;
}) {
  const { tokens: t } = useTheme();
  const isTrigger = category === 'Gatilhos';
  const isAi = category === 'IA';
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/reactflow', JSON.stringify({ type, subtype }));
        e.dataTransfer.effectAllowed = 'move';
      }}
      style={{
        padding: '6px 10px',
        marginLeft: 6,
        marginRight: 4,
        borderRadius: 6,
        border: `1px solid ${t.border}`,
        background: isTrigger ? t.goldFaint : isAi ? t.goldFaint : t.bgInput,
        color: t.text,
        fontSize: 11.5,
        cursor: 'grab',
        userSelect: 'none',
      }}
      title="Arraste pro canvas"
    >
      {label}
    </div>
  );
}
