import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { useTheme } from '../../lib/ThemeContext';
import { Icons } from '../../components/icons';
import { FONT_STACK } from '../../lib/theme';
import { toast } from '../ui/Toast';
import {
  useRenderScript,
  useScriptFolders,
  useScripts,
  type Script,
  type ScriptMediaType,
} from '../../hooks/useScripts';

export type RenderedScript = {
  id: string;
  content: string;
  mediaType: ScriptMediaType | null;
  mediaUrl: string | null;
};

export function ScriptsPopover({
  contactId,
  opportunityId,
  onPick,
  onClose,
}: {
  contactId?: string;
  opportunityId?: string;
  onPick: (rendered: RenderedScript) => void;
  onClose: () => void;
}) {
  const { tokens: t } = useTheme();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const popRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 200);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => {
    inputRef.current?.focus();
    const onDoc = (e: MouseEvent) => {
      if (!popRef.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [onClose]);

  const folders = useScriptFolders();
  const scripts = useScripts({ search: debounced || undefined });
  const render = useRenderScript();

  const grouped = useMemo(() => {
    const list = scripts.data ?? [];
    const map = new Map<string, { name: string; items: Script[] }>();
    map.set('__none__', { name: 'Sem pasta', items: [] });
    for (const f of folders.data ?? []) {
      map.set(f.id, { name: f.name, items: [] });
    }
    for (const s of list) {
      const key = s.folderId ?? '__none__';
      if (!map.has(key)) map.set(key, { name: s.folderName ?? 'Sem pasta', items: [] });
      map.get(key)!.items.push(s);
    }
    return [...map.entries()]
      .filter(([, v]) => v.items.length > 0)
      .map(([id, v]) => ({ id, name: v.name, items: v.items }));
  }, [scripts.data, folders.data]);

  const handlePick = async (s: Script) => {
    try {
      const r = await render.mutateAsync({
        id: s.id,
        contactId,
        opportunityId,
      });
      onPick(r);
      onClose();
    } catch (e) {
      toast(axiosMsg(e) || 'Falha ao renderizar script', 'error');
    }
  };

  const toggleFolder = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div
      ref={popRef}
      style={{
        position: 'absolute',
        bottom: 'calc(100% + 8px)',
        left: 0,
        width: 380,
        maxHeight: 460,
        background: t.bgElevated,
        border: `1px solid ${t.borderStrong}`,
        borderRadius: 12,
        boxShadow: '0 16px 40px rgba(0,0,0,0.4)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 30,
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: 10, borderBottom: `1px solid ${t.border}` }}>
        <div style={{ position: 'relative' }}>
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar script…"
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
        {scripts.isLoading ? (
          <div style={{ padding: 14, fontSize: 12, color: t.textDim }}>Carregando…</div>
        ) : grouped.length === 0 ? (
          <div style={{ padding: 18, fontSize: 12, color: t.textDim, textAlign: 'center' }}>
            {debounced ? 'Nenhum script encontrado.' : 'Nenhum script cadastrado ainda.'}
          </div>
        ) : (
          grouped.map((g) => {
            const isCollapsed = collapsed.has(g.id);
            return (
              <div key={g.id} style={{ marginBottom: 4 }}>
                <button
                  type="button"
                  onClick={() => toggleFolder(g.id)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'transparent',
                    border: 'none',
                    color: t.textDim,
                    padding: '6px 8px',
                    fontSize: 11,
                    letterSpacing: 0.5,
                    textTransform: 'uppercase',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: FONT_STACK,
                  }}
                >
                  <span>{g.name}</span>
                  <span style={{ fontSize: 10, color: t.textFaint }}>
                    {isCollapsed ? '▸' : '▾'} {g.items.length}
                  </span>
                </button>
                {!isCollapsed &&
                  g.items.map((s) => (
                    <ScriptRow
                      key={s.id}
                      script={s}
                      onClick={() => handlePick(s)}
                      busy={render.isPending}
                    />
                  ))}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function ScriptRow({
  script,
  onClick,
  busy,
}: {
  script: Script;
  onClick: () => void;
  busy: boolean;
}) {
  const { tokens: t } = useTheme();
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        background: hover ? t.bgHover : 'transparent',
        border: 'none',
        padding: '8px 10px',
        borderRadius: 6,
        cursor: busy ? 'default' : 'pointer',
        fontFamily: FONT_STACK,
        opacity: busy ? 0.6 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
        <MediaIcon type={script.mediaType} />
        <span style={{ fontSize: 12.5, color: t.text, fontWeight: 600 }}>{script.name}</span>
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
        {script.content || '(sem conteúdo)'}
      </div>
      {script.variables.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 4 }}>
          {script.variables.slice(0, 3).map((v) => (
            <span
              key={v}
              style={{
                fontSize: 9.5,
                background: t.goldFaint,
                color: t.gold,
                padding: '1px 5px',
                borderRadius: 3,
                fontFamily: 'ui-monospace, monospace',
              }}
            >
              {v}
            </span>
          ))}
          {script.variables.length > 3 && (
            <span style={{ fontSize: 9.5, color: t.textFaint }}>+{script.variables.length - 3}</span>
          )}
        </div>
      )}
    </button>
  );
}

function MediaIcon({ type }: { type: ScriptMediaType | null }) {
  const { tokens: t } = useTheme();
  if (!type) return <Icons.Type s={11} c={t.icon} />;
  if (type === 'IMAGE') return <Icons.Image s={11} c={t.icon} />;
  if (type === 'AUDIO') return <Icons.Mic s={11} c={t.icon} />;
  if (type === 'VIDEO') return <Icons.Play s={11} c={t.icon} />;
  return <Icons.File s={11} c={t.icon} />;
}

function axiosMsg(e: unknown): string | null {
  return axios.isAxiosError(e) ? (e.response?.data?.message ?? null) : null;
}
