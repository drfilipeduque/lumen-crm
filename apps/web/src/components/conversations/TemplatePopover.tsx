// Popover acima do composer pra escolher template aprovado e preencher variáveis.
// Usado quando a janela de 24h está fechada (ou explicitamente acionado pelo
// botão "Enviar Template" da conexão OFFICIAL).

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import axios from 'axios';
import { useTheme } from '../../lib/ThemeContext';
import { Icons } from '../../components/icons';
import { FONT_STACK } from '../../lib/theme';
import { toast } from '../ui/Toast';
import { useTemplates, useSendTemplate, type Template } from '../../hooks/useTemplates';

export function TemplatePopover({
  conversationId,
  connectionId,
  onClose,
  onSent,
}: {
  conversationId: string;
  connectionId: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const { tokens: t } = useTheme();
  const list = useTemplates(connectionId);
  const send = useSendTemplate();
  const popRef = useRef<HTMLDivElement>(null);
  const [picked, setPicked] = useState<Template | null>(null);
  const [vars, setVars] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!popRef.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [onClose]);

  const approved = useMemo(
    () =>
      (list.data ?? [])
        .filter((t) => t.status === 'APPROVED')
        .filter((t) => !search || t.name.includes(search.toLowerCase()) || t.body.toLowerCase().includes(search.toLowerCase())),
    [list.data, search],
  );

  const variableKeys = useMemo(() => {
    if (!picked) return [];
    const m = picked.body.match(/\{\{(\d+)\}\}/g) ?? [];
    return Array.from(new Set(m.map((x) => x.replace(/[{}]/g, '')))).sort((a, b) => Number(a) - Number(b));
  }, [picked]);

  const renderedPreview = useMemo(() => {
    if (!picked) return '';
    return picked.body.replace(/\{\{(\d+)\}\}/g, (_m, idx) => vars[idx] || `{{${idx}}}`);
  }, [picked, vars]);

  const handleSend = async () => {
    if (!picked) return;
    // Valida vars preenchidas
    for (const k of variableKeys) {
      if (!vars[k]?.trim()) {
        toast(`Preencha a variável {{${k}}}`, 'error');
        return;
      }
    }
    try {
      await send.mutateAsync({ conversationId, templateId: picked.id, variables: vars });
      toast('Template enviado', 'success');
      onSent();
      onClose();
    } catch (e) {
      toast(axiosMsg(e) || 'Falha ao enviar template', 'error');
    }
  };

  return (
    <div
      ref={popRef}
      style={{
        position: 'absolute',
        bottom: 'calc(100% + 8px)',
        left: 0,
        right: 0,
        maxWidth: 460,
        marginInline: 'auto',
        background: t.bgElevated,
        border: `1px solid ${t.borderStrong}`,
        borderRadius: 12,
        boxShadow: '0 16px 40px rgba(0,0,0,0.4)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 30,
        overflow: 'hidden',
        maxHeight: 480,
      }}
    >
      {!picked ? (
        <>
          <div style={{ padding: 10, borderBottom: `1px solid ${t.border}` }}>
            <div style={{ position: 'relative' }}>
              <input
                autoFocus
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar template aprovado…"
                style={{
                  width: '100%',
                  padding: '8px 12px 8px 32px',
                  background: t.bgInput,
                  border: `1px solid ${t.border}`,
                  borderRadius: 8,
                  color: t.text,
                  fontSize: 12.5,
                  fontFamily: FONT_STACK,
                  outline: 'none',
                }}
              />
              <div style={{ position: 'absolute', left: 10, top: 9, color: t.icon }}>
                <Icons.Search s={13} />
              </div>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 6 }}>
            {list.isLoading ? (
              <div style={{ padding: 14, fontSize: 12, color: t.textDim }}>Carregando…</div>
            ) : approved.length === 0 ? (
              <div style={{ padding: 18, fontSize: 12, color: t.textDim, textAlign: 'center' }}>
                {(list.data?.length ?? 0) === 0
                  ? 'Nenhum template ainda. Crie um na aba "Templates" da conexão.'
                  : 'Nenhum template aprovado disponível.'}
              </div>
            ) : (
              approved.map((tmpl) => (
                <button
                  key={tmpl.id}
                  type="button"
                  onClick={() => setPicked(tmpl)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    background: 'transparent',
                    border: 'none',
                    padding: '8px 10px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontFamily: FONT_STACK,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = t.bgHover)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 2 }}>
                    <span style={{ fontSize: 12.5, color: t.text, fontWeight: 600, fontFamily: 'ui-monospace, monospace' }}>
                      {tmpl.name}
                    </span>
                    <span style={badgeStyle(t)}>{tmpl.category}</span>
                  </div>
                  <div
                    style={{
                      fontSize: 11.5,
                      color: t.textDim,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {tmpl.body}
                  </div>
                </button>
              ))
            )}
          </div>
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              padding: '10px 12px',
              borderBottom: `1px solid ${t.border}`,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <button
              type="button"
              onClick={() => setPicked(null)}
              style={{ background: 'transparent', border: 'none', color: t.textDim, cursor: 'pointer', padding: 0, display: 'flex' }}
              title="Voltar"
            >
              <Icons.ChevronL s={16} />
            </button>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: t.text, fontFamily: 'ui-monospace, monospace', flex: 1 }}>
              {picked.name}
            </div>
          </div>

          <div style={{ padding: 12, overflowY: 'auto', maxHeight: 360 }}>
            {/* Preview */}
            <div style={{ fontSize: 10.5, color: t.textFaint, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 6 }}>
              Preview
            </div>
            <div
              style={{
                background: '#0c1410',
                color: '#fff',
                padding: 10,
                borderRadius: 10,
                fontSize: 12.5,
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                marginBottom: 14,
              }}
            >
              {renderedPreview}
            </div>

            {/* Variables */}
            {variableKeys.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {variableKeys.map((k) => (
                  <div key={k}>
                    <label
                      style={{
                        display: 'block',
                        fontSize: 10.5,
                        color: t.textSubtle,
                        marginBottom: 4,
                        fontFamily: 'ui-monospace, monospace',
                      }}
                    >
                      {`{{${k}}}`}
                    </label>
                    <input
                      value={vars[k] ?? ''}
                      onChange={(e) => setVars((p) => ({ ...p, [k]: e.target.value }))}
                      placeholder={`Valor para {{${k}}}`}
                      style={{
                        width: '100%',
                        padding: '7px 10px',
                        background: t.bgInput,
                        border: `1px solid ${t.border}`,
                        borderRadius: 7,
                        color: t.text,
                        fontSize: 12.5,
                        fontFamily: FONT_STACK,
                        outline: 'none',
                      }}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 11.5, color: t.textDim }}>Esse template não tem variáveis.</div>
            )}
          </div>

          <div style={{ padding: 10, borderTop: `1px solid ${t.border}`, display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
            <button type="button" onClick={onClose} style={buttonGhost(t)}>
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={send.isPending}
              style={{ ...buttonGold(t), opacity: send.isPending ? 0.6 : 1 }}
            >
              {send.isPending ? 'Enviando…' : 'Enviar template'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function badgeStyle(t: ReturnType<typeof useTheme>['tokens']): CSSProperties {
  return {
    fontSize: 9,
    padding: '1px 5px',
    borderRadius: 3,
    background: t.bgInput,
    color: t.textDim,
    fontWeight: 600,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  };
}

function buttonGold(t: ReturnType<typeof useTheme>['tokens']): CSSProperties {
  return {
    background: t.gold,
    color: '#1a1300',
    border: 'none',
    borderRadius: 7,
    padding: '7px 12px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: FONT_STACK,
  };
}

function buttonGhost(t: ReturnType<typeof useTheme>['tokens']): CSSProperties {
  return {
    background: 'transparent',
    color: t.text,
    border: `1px solid ${t.border}`,
    borderRadius: 7,
    padding: '6px 11px',
    fontSize: 11.5,
    cursor: 'pointer',
    fontFamily: FONT_STACK,
  };
}

function axiosMsg(e: unknown): string | null {
  return axios.isAxiosError(e) ? (e.response?.data?.message ?? null) : null;
}
