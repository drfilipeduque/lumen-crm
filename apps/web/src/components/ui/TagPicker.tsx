import { useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '../../lib/ThemeContext';
import { Icons } from '../icons';
import { FONT_STACK } from '../../lib/theme';
import { useCreateTag, type Tag } from '../../hooks/useTags';
import { toast } from './Toast';

const DEFAULT_COLOR = '#94a3b8';

export function TagPicker({
  tags,
  selected,
  onChange,
  placeholder = 'Buscar ou criar tag…',
}: {
  tags: Tag[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const { tokens: t } = useTheme();
  const create = useCreateTag();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    const id = setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener('mousedown', handler);
    };
  }, [open]);

  const tagById = useMemo(() => new Map(tags.map((tg) => [tg.id, tg] as const)), [tags]);
  const selectedTags = selected.map((id) => tagById.get(id)).filter((x): x is Tag => !!x);

  const trimmed = query.trim();
  const lower = trimmed.toLowerCase();
  const exactMatch = tags.find((tg) => tg.name.toLowerCase() === lower);
  const suggestions = useMemo(() => {
    if (!trimmed) {
      return tags.filter((tg) => !selected.includes(tg.id)).slice(0, 8);
    }
    return tags
      .filter(
        (tg) =>
          !selected.includes(tg.id) &&
          tg.name.toLowerCase().includes(lower),
      )
      .slice(0, 8);
  }, [tags, selected, trimmed, lower]);

  const remove = (id: string) => onChange(selected.filter((x) => x !== id));
  const add = (id: string) => {
    if (!selected.includes(id)) onChange([...selected, id]);
  };

  const handleCreate = async () => {
    if (!trimmed || exactMatch) return;
    try {
      const created = await create.mutateAsync({ name: trimmed, color: DEFAULT_COLOR });
      add(created.id);
      setQuery('');
      inputRef.current?.focus();
    } catch (e) {
      const err = e as { response?: { data?: { message?: string; error?: string } } };
      const code = err.response?.data?.error;
      if (code === 'NAME_IN_USE') {
        toast('Essa tag já existe — tente buscar pelo nome', 'error');
      } else {
        toast(err.response?.data?.message || 'Falha ao criar tag', 'error');
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !query && selected.length > 0) {
      remove(selected[selected.length - 1]!);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (suggestions.length > 0) {
        add(suggestions[0]!.id);
        setQuery('');
        return;
      }
      if (trimmed && !exactMatch) {
        void handleCreate();
      }
    }
    if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
    }
  };

  const showCreate = !!trimmed && !exactMatch;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div
        onClick={() => {
          setOpen(true);
          inputRef.current?.focus();
        }}
        style={{
          minHeight: 38,
          background: t.bgInput,
          border: `1px solid ${open ? t.borderFocus : t.border}`,
          borderRadius: 8,
          padding: '5px 8px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          flexWrap: 'wrap',
          cursor: 'text',
          transition: 'border-color 120ms ease',
        }}
      >
        {selectedTags.map((tag) => (
          <span
            key={tag.id}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '3px 4px 3px 9px',
              background: hexAlpha(tag.color, 0.15),
              color: tag.color,
              border: `1px solid ${hexAlpha(tag.color, 0.4)}`,
              borderRadius: 999,
              fontSize: 11.5,
              fontWeight: 500,
            }}
          >
            <span style={{ width: 5, height: 5, borderRadius: 999, background: tag.color }} />
            {tag.name}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                remove(tag.id);
              }}
              aria-label={`Remover ${tag.name}`}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'currentColor',
                padding: 2,
                display: 'inline-flex',
                opacity: 0.7,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.7')}
            >
              <Icons.X s={10} c="currentColor" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => setOpen(true)}
          placeholder={selectedTags.length === 0 ? placeholder : ''}
          style={{
            flex: '1 1 120px',
            minWidth: 80,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: t.text,
            fontSize: 12.5,
            fontFamily: FONT_STACK,
            padding: '4px 2px',
          }}
        />
      </div>

      {open && (suggestions.length > 0 || showCreate) && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 4,
            zIndex: 30,
            background: t.bgElevated,
            border: `1px solid ${t.border}`,
            borderRadius: 8,
            boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
            padding: 4,
            maxHeight: 220,
            overflowY: 'auto',
          }}
        >
          {suggestions.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => {
                add(tag.id);
                setQuery('');
                inputRef.current?.focus();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '7px 10px',
                width: '100%',
                background: 'transparent',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                color: t.text,
                fontSize: 12.5,
                fontFamily: FONT_STACK,
                textAlign: 'left',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = t.bgHover)}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ width: 7, height: 7, borderRadius: 2, background: tag.color }} />
              {tag.name}
            </button>
          ))}
          {showCreate && (
            <>
              {suggestions.length > 0 && (
                <div style={{ height: 1, background: t.border, margin: '4px 0' }} />
              )}
              <button
                type="button"
                onClick={() => {
                  void handleCreate();
                }}
                disabled={create.isPending}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 10px',
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: 6,
                  cursor: create.isPending ? 'wait' : 'pointer',
                  color: t.gold,
                  fontSize: 12.5,
                  fontFamily: FONT_STACK,
                  textAlign: 'left',
                  opacity: create.isPending ? 0.6 : 1,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = t.bgHover)}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <Icons.Plus s={11} c="currentColor" />
                {create.isPending ? 'Criando…' : `Criar tag "${trimmed}"`}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function hexAlpha(hex: string, alpha: number): string {
  const m = hex.match(/^#?([0-9A-Fa-f]{6})$/);
  if (!m) return `rgba(128,128,128,${alpha})`;
  const v = m[1]!;
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
