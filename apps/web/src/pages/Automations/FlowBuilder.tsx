// Construtor simples de Automações estilo ClickUp.
// Coluna única em 3 seções stack:
//   QUANDO    — gatilho
//   E SE      — condições (opcional, lista AND/OR)
//   ENTÃO     — ações em sequência (drag-and-drop)
//
// Salva como JSON Flow compatível com o engine via builderToFlow.
// Carrega Flow existente via flowToBuilder; estruturas com múltiplas
// branches (geradas pelo editor antigo ReactFlow) caem em modo legado
// e o usuário consegue editar via JSON raw.

import { useEffect, useMemo, useState } from 'react';
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
import { TriggerSection } from './flow-builder/TriggerSection';
import { ActionsSection } from './flow-builder/ActionsSection';
import { DryRunModal } from './flow-builder/DryRunModal';
import { builderToFlow, flowToBuilder, EMPTY_STATE, type BuilderState } from './flow-builder/model';

export function FlowBuilder() {
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
  const [state, setState] = useState<BuilderState>(EMPTY_STATE);
  const [errors, setErrors] = useState<FlowValidationError[]>([]);
  const [dryRunOpen, setDryRunOpen] = useState(false);

  // Carrega o automation existente
  useEffect(() => {
    if (!existing.data) return;
    setName(existing.data.name);
    setActive(existing.data.active);
    setState(flowToBuilder(existing.data.flow));
  }, [existing.data?.id, existing.data?.updatedAt]);

  const flow: Flow = useMemo(() => builderToFlow(state), [state]);
  const triggerSubtype = state.trigger?.subtype ?? null;

  // Validação local mínima
  const localErrors = useMemo(() => {
    const e: FlowValidationError[] = [];
    if (!state.trigger) e.push({ code: 'NO_TRIGGER', message: 'Selecione um gatilho' });
    for (const a of state.actions) {
      if (!a.subtype) e.push({ nodeId: a.id, code: 'EMPTY_ACTION', message: 'Ação sem tipo escolhido' });
    }
    return e;
  }, [state]);

  const allErrors = useMemo(() => [...localErrors, ...errors], [localErrors, errors]);
  const valid = allErrors.length === 0;

  // Roda validação remota (catalog Zod) ao mudar o flow — debounced
  useEffect(() => {
    if (!state.trigger) {
      setErrors([]);
      return;
    }
    const id = setTimeout(async () => {
      try {
        const r = await validateMut.mutateAsync(flow);
        setErrors(r.ok ? [] : r.errors);
      } catch {
        // ignora — mantém local errors
      }
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(flow)]);

  const triggerErrors = allErrors
    .filter((e) => !e.nodeId || e.nodeId === 'trigger')
    .map((e) => e.message);
  const actionErrorMap = state.actions.map((a) => {
    const err = allErrors.find((e) => e.nodeId === a.id);
    return { id: a.id, message: err?.message ?? '' };
  }).filter((x) => x.message);

  const handleSave = async () => {
    if (active && !valid) {
      toast('Corrija os erros antes de salvar como ativo', 'error');
      return;
    }
    try {
      if (isNew) {
        const created = await createMut.mutateAsync({ name, active, flow });
        toast('Fluxo criado', 'success');
        nav(`/automations/flows/${created.id}`, { replace: true });
      } else if (automationId) {
        await updateMut.mutateAsync({ id: automationId, name, active, flow });
        toast('Fluxo salvo', 'success');
      }
    } catch (e) {
      const msg = axios.isAxiosError(e) ? e.response?.data?.message : null;
      toast(msg || 'Falha ao salvar', 'error');
    }
  };

  const handleToggleActive = async () => {
    if (isNew || !automationId) {
      setActive((v) => !v);
      return;
    }
    if (!active && !valid) {
      toast('Corrija os erros antes de ativar', 'error');
      return;
    }
    try {
      await toggleMut.mutateAsync(automationId);
      setActive((v) => !v);
    } catch {
      toast('Falha ao alternar', 'error');
    }
  };

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: t.bg }}>
      {/* HEADER STICKY */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 5,
          background: t.bgElevated,
          borderBottom: `1px solid ${t.border}`,
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <button
          type="button"
          onClick={() => nav('/automations')}
          title="Voltar"
          style={{
            width: 32,
            height: 32,
            background: 'transparent',
            border: `1px solid ${t.border}`,
            borderRadius: 7,
            color: t.textDim,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icons.ChevronL s={14} c={t.textDim} />
        </button>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome do fluxo"
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: t.text,
            fontSize: 16,
            fontWeight: 600,
            fontFamily: 'inherit',
          }}
        />
        <span
          style={{
            padding: '3px 10px',
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 600,
            background: valid ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.18)',
            color: valid ? '#10b981' : '#f59e0b',
          }}
        >
          {valid ? 'Pronto' : `Inválido (${allErrors.length} erro${allErrors.length === 1 ? '' : 's'})`}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: t.textDim }}>
          Ativo
          <Switch checked={active} onChange={handleToggleActive} />
        </div>
        <button
          type="button"
          onClick={() => setDryRunOpen(true)}
          disabled={isNew || !state.trigger}
          style={{
            padding: '7px 12px',
            background: 'transparent',
            border: `1px solid ${t.border}`,
            borderRadius: 7,
            color: t.text,
            fontSize: 12.5,
            cursor: isNew || !state.trigger ? 'not-allowed' : 'pointer',
            opacity: isNew || !state.trigger ? 0.5 : 1,
            fontFamily: 'inherit',
          }}
        >
          Testar fluxo
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={createMut.isPending || updateMut.isPending}
          style={{
            padding: '7px 14px',
            background: t.gold,
            color: '#1a1300',
            border: 'none',
            borderRadius: 7,
            fontSize: 12.5,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {createMut.isPending || updateMut.isPending ? 'Salvando…' : 'Salvar'}
        </button>
      </div>

      {/* CORPO */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div
          style={{
            maxWidth: 800,
            margin: '0 auto',
            padding: '24px 16px 80px',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          {state.legacyFlow && (
            <div
              style={{
                padding: '12px 14px',
                background: 'rgba(245,158,11,0.1)',
                border: '1px solid rgba(245,158,11,0.4)',
                borderRadius: 10,
                fontSize: 12,
                color: t.text,
              }}
            >
              ⚠ Este fluxo foi criado no editor antigo (ReactFlow) e tem uma estrutura
              que não cabe no construtor simples (múltiplas branches ou condições aninhadas).
              Recrie no novo construtor pra editá-lo aqui — a versão original continua
              executando normalmente.
            </div>
          )}

          <TriggerSection
            value={state.trigger}
            onChange={(trigger) => setState((s) => ({ ...s, trigger, legacyFlow: null }))}
            errors={triggerErrors}
          />

          <ActionsSection
            actions={state.actions}
            onChange={(actions) => setState((s) => ({ ...s, actions, legacyFlow: null }))}
            triggerSubtype={triggerSubtype}
            errors={actionErrorMap}
          />

          {allErrors.length > 0 && (
            <div
              style={{
                padding: '12px 14px',
                background: 'rgba(245,158,11,0.1)',
                border: '1px solid rgba(245,158,11,0.4)',
                borderRadius: 10,
                fontSize: 12,
                color: t.text,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <strong style={{ fontSize: 12.5 }}>Pendências:</strong>
              {allErrors.map((e, i) => (
                <div key={i}>· {e.message}</div>
              ))}
            </div>
          )}
        </div>
      </div>

      {dryRunOpen && automationId && state.trigger && (
        <DryRunModal
          automationId={automationId}
          triggerType={state.trigger.subtype}
          onClose={() => setDryRunOpen(false)}
        />
      )}
    </div>
  );
}
