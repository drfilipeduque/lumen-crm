// Form especializado pra ação send_whatsapp_message no construtor.
// Estrutura em 2 seções: Conteúdo, Conexão.

import { useRef, useState } from 'react';
import axios from 'axios';
import { useTheme } from '../../../lib/ThemeContext';
import { useWhatsAppConnections } from '../../../hooks/useWhatsApp';
import { useUploadAutomationMedia } from '../../../hooks/useAutomations';
import { toast } from '../../../components/ui/Toast';
import { VariablePicker } from './VariablePicker';

export function SendWhatsAppActionForm({
  config,
  onChange,
  triggerSubtype,
  previousStepCount,
}: {
  config: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  triggerSubtype: string | null;
  previousStepCount: number;
}) {
  const { tokens: t } = useTheme();
  const connections = useWhatsAppConnections();
  const strategy = (config.connectionStrategy as string | undefined) ?? 'DEFAULT';
  const setField = (k: string, v: unknown) => onChange({ ...config, [k]: v });

  // Preview do caminho
  const path: string[] = [];
  if (strategy === 'SPECIFIC' && config.connectionId) {
    const c = connections.data?.find((x) => x.id === config.connectionId);
    path.push(`Tenta: ${c?.name ?? config.connectionId}`);
  } else if (strategy === 'TYPE_PREFERRED') {
    path.push(`Tenta: tipo ${(config.preferredType as string) ?? 'OFFICIAL'} primeiro`);
  } else {
    path.push('Tenta: conexão padrão (do responsável ou config global)');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Group label="Conteúdo">
        <Field
          label="Texto"
          action={
            <VariablePicker
              triggerSubtype={triggerSubtype}
              previousStepCount={previousStepCount}
              onInsert={(token) => setField('text', ((config.text as string) ?? '') + token)}
            />
          }
        >
          <textarea
            rows={3}
            value={(config.text as string) ?? ''}
            onChange={(e) => setField('text', e.target.value)}
            style={{ ...input(t), resize: 'vertical', fontFamily: 'inherit' }}
            placeholder="Olá {{contact.name}}, ..."
          />
        </Field>
        <Field label="Script (alternativa)">
          <input
            type="text"
            value={(config.scriptId as string) ?? ''}
            onChange={(e) => setField('scriptId', e.target.value || undefined)}
            placeholder="ID de script (opcional)"
            style={input(t)}
          />
        </Field>
        <Field label="Mídia (opcional)">
          <MediaInput
            value={(config.mediaUrl as string) ?? ''}
            mediaType={(config.mediaType as MediaType | undefined) ?? null}
            onChange={(url, type) => {
              const next: Record<string, unknown> = { ...config, mediaUrl: url || undefined };
              if (type) next.mediaType = type;
              else delete next.mediaType;
              onChange(next);
            }}
          />
        </Field>
      </Group>

      <Group label="Conexão de envio">
        <Field label="Estratégia">
          <select
            value={strategy}
            onChange={(e) => setField('connectionStrategy', e.target.value)}
            style={input(t)}
          >
            <option value="DEFAULT">Padrão do responsável (recomendado)</option>
            <option value="SPECIFIC">Conexão específica</option>
            <option value="TYPE_PREFERRED">Preferir tipo</option>
          </select>
        </Field>
        {strategy === 'SPECIFIC' && (
          <Field label="Conexão">
            <select
              value={(config.connectionId as string) ?? ''}
              onChange={(e) => setField('connectionId', e.target.value)}
              style={input(t)}
            >
              <option value="">— escolha —</option>
              {(connections.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.type})
                </option>
              ))}
            </select>
          </Field>
        )}
        {strategy === 'TYPE_PREFERRED' && (
          <Field label="Tipo preferido">
            <select
              value={(config.preferredType as string) ?? 'OFFICIAL'}
              onChange={(e) => setField('preferredType', e.target.value)}
              style={input(t)}
            >
              <option value="OFFICIAL">Oficial (Meta)</option>
              <option value="UNOFFICIAL">Não oficial (Baileys)</option>
            </select>
          </Field>
        )}
      </Group>

      <div
        style={{
          padding: 10,
          borderRadius: 8,
          background: t.bgInput,
          border: `1px solid ${t.border}`,
          fontSize: 11,
          color: t.textDim,
        }}
      >
        <div style={{ fontWeight: 600, color: t.text, marginBottom: 4, fontSize: 11.5 }}>
          Caminho previsto:
        </div>
        <ol style={{ margin: 0, paddingLeft: 16 }}>
          {path.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ol>
      </div>
    </div>
  );
}

type MediaType = 'IMAGE' | 'AUDIO' | 'VIDEO' | 'DOCUMENT';

function MediaInput({
  value,
  mediaType,
  onChange,
}: {
  value: string;
  mediaType: MediaType | null;
  onChange: (url: string, type: MediaType | null) => void;
}) {
  const { tokens: t } = useTheme();
  const upload = useUploadAutomationMedia();
  const fileRef = useRef<HTMLInputElement>(null);
  const isUploaded = value.startsWith('/uploads/');
  const [mode, setMode] = useState<'url' | 'upload'>(isUploaded ? 'upload' : 'url');

  const pickFile = () => fileRef.current?.click();

  const onFile = async (file: File | null) => {
    if (!file) return;
    try {
      const r = await upload.mutateAsync(file);
      onChange(r.url, r.type);
      toast('Mídia enviada', 'success');
    } catch (e) {
      const msg = axios.isAxiosError(e) ? e.response?.data?.message : null;
      toast(msg || 'Falha no upload', 'error');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 4 }}>
        <Tab t={t} active={mode === 'url'} onClick={() => setMode('url')}>URL</Tab>
        <Tab t={t} active={mode === 'upload'} onClick={() => setMode('upload')}>Upload</Tab>
      </div>

      {mode === 'url' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value, mediaType)}
            placeholder="https://…"
            style={input(t)}
          />
          <select
            value={mediaType ?? ''}
            onChange={(e) => onChange(value, (e.target.value || null) as MediaType | null)}
            style={input(t)}
          >
            <option value="">Tipo (auto: imagem se vazio)</option>
            <option value="IMAGE">Imagem</option>
            <option value="VIDEO">Vídeo</option>
            <option value="AUDIO">Áudio</option>
            <option value="DOCUMENT">Documento</option>
          </select>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input
            ref={fileRef}
            type="file"
            style={{ display: 'none' }}
            accept="image/*,audio/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
            onChange={(e) => {
              onFile(e.target.files?.[0] ?? null);
              if (e.target) e.target.value = '';
            }}
          />
          {isUploaded ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '7px 10px',
                background: t.bgInput,
                border: `1px solid ${t.border}`,
                borderRadius: 7,
                fontSize: 11.5,
                color: t.text,
                gap: 8,
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                {value.split('/').pop()}
              </span>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button type="button" onClick={pickFile} style={btnGhost(t)} disabled={upload.isPending}>
                  Trocar
                </button>
                <button type="button" onClick={() => onChange('', null)} style={btnGhost(t)}>
                  Remover
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={pickFile}
              disabled={upload.isPending}
              style={{
                ...input(t),
                cursor: 'pointer',
                textAlign: 'center',
                padding: '12px 10px',
                borderStyle: 'dashed',
                color: t.textDim,
              }}
            >
              {upload.isPending ? 'Enviando…' : 'Selecionar arquivo (até 20MB)'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Tab({
  t,
  active,
  onClick,
  children,
}: {
  t: ReturnType<typeof useTheme>['tokens'];
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '4px 10px',
        borderRadius: 6,
        border: `1px solid ${active ? t.gold : t.border}`,
        background: active ? t.goldFaint : 'transparent',
        color: active ? t.text : t.textDim,
        fontSize: 11,
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  const { tokens: t } = useTheme();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: t.textFaint,
          textTransform: 'uppercase',
          letterSpacing: 1,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function Field({ label, action, children }: { label: string; action?: React.ReactNode; children: React.ReactNode }) {
  const { tokens: t } = useTheme();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <label style={{ fontSize: 11.5, fontWeight: 500, color: t.textDim }}>{label}</label>
        {action}
      </div>
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
  fontSize: 12.5,
  outline: 'none' as const,
  fontFamily: 'inherit',
});
const btnGhost = (t: Tk) => ({
  padding: '4px 9px',
  borderRadius: 5,
  background: 'transparent',
  color: t.text,
  border: `1px solid ${t.border}`,
  fontSize: 10.5,
  cursor: 'pointer' as const,
});
