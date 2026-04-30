// Popover de variáveis disponíveis com base no contexto do trigger.
// Variáveis sempre disponíveis vs. dependentes do trigger vs. outputs de
// steps anteriores (na ordem da lista de actions). Click insere o token
// na posição do cursor do alvo.

import { useEffect, useRef, useState } from 'react';
import { useTheme } from '../../../lib/ThemeContext';

type Group = { label: string; vars: { token: string; hint?: string }[] };

const ALWAYS: Group = {
  label: 'Sempre',
  vars: [
    { token: '{{contact.name}}', hint: 'Nome do contato' },
    { token: '{{contact.phone}}', hint: 'Telefone' },
    { token: '{{contact.email}}', hint: 'E-mail' },
    { token: '{{user.name}}', hint: 'Usuário que disparou' },
    { token: '{{date.today}}', hint: 'Data de hoje' },
    { token: '{{time.now}}', hint: 'Hora atual' },
  ],
};

const OPP_GROUP: Group = {
  label: 'Oportunidade',
  vars: [
    { token: '{{opportunity.title}}' },
    { token: '{{opportunity.value}}' },
    { token: '{{opportunity.priority}}' },
    { token: '{{opportunity.stageName}}' },
    { token: '{{opportunity.dueDate}}' },
  ],
};

const MSG_GROUP: Group = {
  label: 'Mensagem',
  vars: [
    { token: '{{message.content}}' },
    { token: '{{message.fromMe}}' },
    { token: '{{message.type}}' },
  ],
};

// Mapeia trigger subtype → grupos disponíveis além de ALWAYS
function groupsForTrigger(triggerSubtype: string | null): Group[] {
  const out: Group[] = [ALWAYS];
  if (!triggerSubtype) return out;
  const isOpp =
    triggerSubtype.startsWith('opportunity_') ||
    triggerSubtype === 'tag_added' ||
    triggerSubtype === 'tag_removed' ||
    triggerSubtype === 'custom_field_changed' ||
    triggerSubtype === 'owner_changed' ||
    triggerSubtype === 'due_date_approaching';
  if (isOpp) out.push(OPP_GROUP);
  const isMsg =
    triggerSubtype === 'message_received' ||
    triggerSubtype === 'message_sent' ||
    triggerSubtype === 'keyword_detected' ||
    triggerSubtype === 'message_unanswered';
  if (isMsg) out.push(MSG_GROUP);
  return out;
}

export function VariablePicker({
  onInsert,
  triggerSubtype,
  previousStepCount,
}: {
  onInsert: (token: string) => void;
  triggerSubtype: string | null;
  // Número de actions ANTES desta na lista (pra oferecer step.1.output…step.N.output)
  previousStepCount: number;
}) {
  const { tokens: t } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as HTMLElement)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const groups = groupsForTrigger(triggerSubtype);
  if (previousStepCount > 0) {
    groups.push({
      label: 'Outputs de etapas anteriores',
      vars: Array.from({ length: previousStepCount }).map((_, i) => ({
        token: `{{step.${i + 1}.output}}`,
        hint: `Saída da ação ${i + 1}`,
      })),
    });
  }

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          background: 'transparent',
          border: 'none',
          color: t.gold,
          fontSize: 11,
          cursor: 'pointer',
          textDecoration: 'underline',
          padding: 0,
        }}
      >
        {'{{ }} Inserir variável'}
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 22,
            zIndex: 50,
            width: 280,
            maxHeight: 320,
            overflowY: 'auto',
            background: t.bgElevated,
            border: `1px solid ${t.border}`,
            borderRadius: 10,
            boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
            padding: 6,
          }}
        >
          {groups.map((g) => (
            <div key={g.label} style={{ marginBottom: 4 }}>
              <div
                style={{
                  fontSize: 10,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  color: t.textFaint,
                  fontWeight: 700,
                  padding: '6px 8px 2px',
                }}
              >
                {g.label}
              </div>
              {g.vars.map((v) => (
                <button
                  key={v.token}
                  type="button"
                  onClick={() => {
                    onInsert(v.token);
                    setOpen(false);
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '6px 10px',
                    background: 'transparent',
                    border: 'none',
                    fontSize: 11.5,
                    color: t.text,
                    cursor: 'pointer',
                    borderRadius: 6,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = t.bgInput)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <code style={{ fontFamily: 'monospace', color: t.gold }}>{v.token}</code>
                  {v.hint && (
                    <div style={{ fontSize: 10.5, color: t.textDim, marginTop: 1 }}>{v.hint}</div>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
