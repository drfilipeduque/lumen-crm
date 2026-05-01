// Modal pra criar/editar uma mensagem agendada (texto/template/script).
// Usado em popup de Oportunidade e drawer de Contato.

import { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { useTheme } from '../../lib/ThemeContext';
import { useWhatsAppConnections } from '../../hooks/useWhatsApp';
import { useTemplates } from '../../hooks/useTemplates';
import { useScripts } from '../../hooks/useScripts';
import axios from 'axios';
import { toast } from '../ui/Toast';

function axiosMsg(e: unknown): string | null {
  if (axios.isAxiosError(e)) {
    return e.response?.data?.message ?? e.message ?? null;
  }
  return null;
}
import {
  useCreateScheduledMessage,
  useUpdateScheduledMessage,
  type ScheduledMessage,
} from '../../hooks/useScheduledMessages';

type Props = {
  open: boolean;
  onClose: () => void;
  contactId: string;
  opportunityId?: string | null;
  editing?: ScheduledMessage | null;
};

const PRESETS: { label: string; offsetMin: number }[] = [
  { label: 'Daqui 1h', offsetMin: 60 },
  { label: 'Hoje às 18h', offsetMin: -1 }, // calculado dinamicamente
  { label: 'Amanhã às 9h', offsetMin: -2 },
  { label: 'Próxima segunda às 9h', offsetMin: -3 },
];

function applyPreset(p: number): Date {
  const d = new Date();
  if (p === -1) {
    d.setHours(18, 0, 0, 0);
    if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
    return d;
  }
  if (p === -2) {
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d;
  }
  if (p === -3) {
    const targetDay = 1; // segunda
    const today = d.getDay();
    const diff = (targetDay - today + 7) % 7 || 7;
    d.setDate(d.getDate() + diff);
    d.setHours(9, 0, 0, 0);
    return d;
  }
  return new Date(Date.now() + p * 60_000);
}

function toLocalInput(d: Date): string {
  // YYYY-MM-DDTHH:mm pra <input type="datetime-local">
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ScheduledMessageModal({ open, onClose, contactId, opportunityId, editing }: Props) {
  const { tokens: t } = useTheme();
  const create = useCreateScheduledMessage();
  const update = useUpdateScheduledMessage();
  const connections = useWhatsAppConnections();
  const scripts = useScripts();

  const [contentType, setContentType] = useState<'TEXT' | 'TEMPLATE' | 'SCRIPT'>('TEXT');
  const [connectionId, setConnectionId] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [text, setText] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [templateVars, setTemplateVars] = useState<Record<string, string>>({});
  const [scriptId, setScriptId] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');

  // Reset ao abrir / preencher se editando
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setContentType(editing.contentType);
      setConnectionId(editing.connectionId);
      setScheduledAt(toLocalInput(new Date(editing.scheduledAt)));
      if (editing.contentType === 'TEXT') setText(editing.content);
      if (editing.contentType === 'TEMPLATE') setTemplateId(editing.content);
      if (editing.contentType === 'SCRIPT') setScriptId(editing.content);
      setTemplateVars(editing.templateVariables ?? {});
      setMediaUrl(editing.mediaUrl ?? '');
    } else {
      setContentType('TEXT');
      setConnectionId('');
      const d = new Date(Date.now() + 60 * 60_000);
      setScheduledAt(toLocalInput(d));
      setText('');
      setTemplateId('');
      setTemplateVars({});
      setScriptId('');
      setMediaUrl('');
    }
  }, [open, editing]);

  const selectedConn = connections.data?.find((c) => c.id === connectionId);
  const isOfficial = selectedConn?.type === 'OFFICIAL';
  const templates = useTemplates(isOfficial ? connectionId : null);
  // Quando muda pra Não Oficial, força contentType pra TEXT/SCRIPT
  useEffect(() => {
    if (selectedConn && selectedConn.type !== 'OFFICIAL' && contentType === 'TEMPLATE') {
      setContentType('TEXT');
    }
  }, [selectedConn?.id, contentType]);

  const submit = async () => {
    if (!connectionId) return toast('Escolha uma conexão', 'error');
    if (!scheduledAt) return toast('Defina data e hora', 'error');
    let content = '';
    if (contentType === 'TEXT') content = text.trim();
    else if (contentType === 'TEMPLATE') content = templateId;
    else if (contentType === 'SCRIPT') content = scriptId;
    if (!content) return toast('Conteúdo obrigatório', 'error');

    const payload = {
      contactId,
      opportunityId: opportunityId ?? null,
      connectionId,
      scheduledAt: new Date(scheduledAt).toISOString(),
      contentType,
      content,
      templateVariables: contentType === 'TEMPLATE' ? templateVars : undefined,
      mediaUrl: contentType === 'TEXT' && mediaUrl ? mediaUrl : undefined,
    };

    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, ...payload });
        toast('Mensagem atualizada', 'success');
      } else {
        await create.mutateAsync(payload);
        toast('Mensagem agendada', 'success');
      }
      onClose();
    } catch (e) {
      toast(axiosMsg(e) || 'Falha ao agendar', 'error');
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Editar mensagem agendada' : 'Agendar mensagem'} width={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Conexão WhatsApp">
          <select
            value={connectionId}
            onChange={(e) => setConnectionId(e.target.value)}
            style={input(t)}
          >
            <option value="">— escolha —</option>
            {(connections.data ?? [])
              .filter((c) => c.active)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.type === 'OFFICIAL' ? '(Oficial)' : '(Não oficial)'}
                </option>
              ))}
          </select>
          {selectedConn && selectedConn.type !== 'OFFICIAL' && (
            <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 4 }}>
              ⚠ Conexão não oficial pode ter instabilidades
            </div>
          )}
        </Field>

        <Field label="Tipo de conteúdo">
          <div style={{ display: 'flex', gap: 6 }}>
            {(
              [
                { value: 'TEXT', label: 'Texto livre' },
                { value: 'TEMPLATE', label: 'Template oficial', requireOfficial: true },
                { value: 'SCRIPT', label: 'Script existente' },
              ] as const
            ).map((opt) => {
              const disabled = opt.requireOfficial && !isOfficial;
              return (
                <button
                  key={opt.value}
                  type="button"
                  disabled={disabled}
                  onClick={() => setContentType(opt.value)}
                  style={{
                    padding: '6px 12px',
                    fontSize: 12,
                    borderRadius: 6,
                    border: `1px solid ${contentType === opt.value ? t.gold : t.border}`,
                    background: contentType === opt.value ? t.goldFaint : t.bgInput,
                    color: t.text,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled ? 0.4 : 1,
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </Field>

        {contentType === 'TEXT' && (
          <>
            <Field label="Texto (suporta {{contact.name}}, {{contact.firstName}})">
              <textarea
                rows={4}
                value={text}
                onChange={(e) => setText(e.target.value)}
                style={{ ...input(t), resize: 'vertical', fontFamily: 'inherit' }}
                placeholder="Olá {{contact.firstName}}, como vai?"
              />
            </Field>
            <Field label="URL de mídia (opcional)">
              <input
                type="text"
                value={mediaUrl}
                onChange={(e) => setMediaUrl(e.target.value)}
                style={input(t)}
                placeholder="https://..."
              />
            </Field>
          </>
        )}

        {contentType === 'TEMPLATE' && (
          <Field label="Template">
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              style={input(t)}
              disabled={!isOfficial}
            >
              <option value="">— escolha —</option>
              {(templates.data ?? [])
                .filter((tt) => tt.status === 'APPROVED')
                .map((tt) => (
                  <option key={tt.id} value={tt.id}>
                    {tt.name} ({tt.language})
                  </option>
                ))}
            </select>
            {!isOfficial && (
              <div style={{ fontSize: 11, color: t.textDim, marginTop: 4 }}>
                Selecione uma conexão Oficial pra escolher template.
              </div>
            )}
          </Field>
        )}

        {contentType === 'SCRIPT' && (
          <Field label="Script">
            <select value={scriptId} onChange={(e) => setScriptId(e.target.value)} style={input(t)}>
              <option value="">— escolha —</option>
              {(scripts.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label="Data e hora">
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            style={input(t)}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => setScheduledAt(toLocalInput(applyPreset(p.offsetMin)))}
                style={{
                  padding: '4px 10px',
                  fontSize: 11,
                  background: t.bgInput,
                  border: `1px solid ${t.border}`,
                  borderRadius: 5,
                  color: t.textDim,
                  cursor: 'pointer',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </Field>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <button type="button" onClick={onClose} style={btnGhost(t)}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={create.isPending || update.isPending}
            style={btnGold(t)}
          >
            {create.isPending || update.isPending ? 'Salvando…' : editing ? 'Salvar' : 'Agendar'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const { tokens: t } = useTheme();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 11.5, fontWeight: 500, color: t.textDim }}>{label}</label>
      {children}
    </div>
  );
}

type Tk = ReturnType<typeof useTheme>['tokens'];
const input = (t: Tk) => ({
  width: '100%',
  padding: '8px 10px',
  borderRadius: 7,
  background: t.bgInput,
  color: t.text,
  border: `1px solid ${t.border}`,
  fontSize: 13,
  outline: 'none' as const,
  fontFamily: 'inherit',
});
const btnGold = (t: Tk) => ({
  padding: '8px 14px',
  borderRadius: 8,
  background: t.gold,
  color: '#1a1300',
  border: 'none',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer' as const,
});
const btnGhost = (t: Tk) => ({
  padding: '8px 14px',
  borderRadius: 8,
  background: 'transparent',
  border: `1px solid ${t.border}`,
  color: t.text,
  fontSize: 13,
  cursor: 'pointer' as const,
});
