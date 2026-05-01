// Wizard de criação de campanha de disparo em 5 passos.
// Cria como DRAFT no passo 5 (botão "Salvar como rascunho"), ou cria + dispara
// imediatamente (botão "Iniciar disparo").

import { useEffect, useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { useTheme } from '../../../lib/ThemeContext';
import { toast } from '../../../components/ui/Toast';
import { useWhatsAppConnections } from '../../../hooks/useWhatsApp';
import { useTemplates } from '../../../hooks/useTemplates';
import { useTags } from '../../../hooks/useTags';
import { useTeam } from '../../../hooks/useTeam';
import { usePipelines, usePipeline } from '../../../hooks/usePipelines';
import {
  useCreateBroadcast,
  usePreviewAudience,
  useStartBroadcast,
  type AudienceFilters,
  type BroadcastAudienceType,
} from '../../../hooks/useBroadcasts';

export function BroadcastWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { tokens: t } = useTheme();
  const create = useCreateBroadcast();
  const start = useStartBroadcast();

  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [connectionId, setConnectionId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [templateVars, setTemplateVars] = useState<Record<string, string>>({});
  const [audienceType, setAudienceType] = useState<BroadcastAudienceType>('CONTACTS');
  const [filters, setFilters] = useState<AudienceFilters>({});
  const [scheduleNow, setScheduleNow] = useState(true);
  const [scheduledAt, setScheduledAt] = useState('');
  const [intervalSeconds, setIntervalSeconds] = useState(30);
  const [respectBusinessHours, setRespectBusinessHours] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setName('');
    setDescription('');
    setConnectionId('');
    setTemplateId('');
    setTemplateVars({});
    setAudienceType('CONTACTS');
    setFilters({});
    setScheduleNow(true);
    setScheduledAt('');
    setIntervalSeconds(30);
    setRespectBusinessHours(false);
  }, [open]);

  const finalize = async (startNow: boolean) => {
    try {
      const created = await create.mutateAsync({
        name,
        description: description || null,
        connectionId,
        templateId,
        templateVariables: templateVars,
        audienceType,
        audienceFilters: filters,
        intervalSeconds,
        scheduledAt: !scheduleNow && scheduledAt ? new Date(scheduledAt).toISOString() : null,
        respectBusinessHours,
      });
      if (startNow) {
        await start.mutateAsync(created.id);
        toast('Disparo iniciado', 'success');
      } else {
        toast('Rascunho salvo', 'success');
      }
      onClose();
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message;
      toast(msg ?? 'Falha ao salvar', 'error');
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Novo disparo — Passo ${step} de 5`} width={680}>
      {step === 1 && (
        <Step1
          name={name}
          setName={setName}
          description={description}
          setDescription={setDescription}
          onNext={() => setStep(2)}
          onCancel={onClose}
        />
      )}
      {step === 2 && (
        <Step2
          connectionId={connectionId}
          setConnectionId={setConnectionId}
          templateId={templateId}
          setTemplateId={setTemplateId}
          templateVars={templateVars}
          setTemplateVars={setTemplateVars}
          onNext={() => setStep(3)}
          onBack={() => setStep(1)}
        />
      )}
      {step === 3 && (
        <Step3
          audienceType={audienceType}
          setAudienceType={setAudienceType}
          filters={filters}
          setFilters={setFilters}
          onNext={() => setStep(4)}
          onBack={() => setStep(2)}
        />
      )}
      {step === 4 && (
        <Step4
          scheduleNow={scheduleNow}
          setScheduleNow={setScheduleNow}
          scheduledAt={scheduledAt}
          setScheduledAt={setScheduledAt}
          intervalSeconds={intervalSeconds}
          setIntervalSeconds={setIntervalSeconds}
          respectBusinessHours={respectBusinessHours}
          setRespectBusinessHours={setRespectBusinessHours}
          onNext={() => setStep(5)}
          onBack={() => setStep(3)}
        />
      )}
      {step === 5 && (
        <Step5
          name={name}
          intervalSeconds={intervalSeconds}
          scheduleNow={scheduleNow}
          scheduledAt={scheduledAt}
          audienceType={audienceType}
          filters={filters}
          onSaveDraft={() => finalize(false)}
          onStart={() => finalize(true)}
          onBack={() => setStep(4)}
          submitting={create.isPending || start.isPending}
        />
      )}
    </Modal>
  );
}

// ------------------ Step 1 ------------------

function Step1({
  name,
  setName,
  description,
  setDescription,
  onNext,
  onCancel,
}: {
  name: string;
  setName: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  onNext: () => void;
  onCancel: () => void;
}) {
  const { tokens: t } = useTheme();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Field label="Nome da campanha">
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} style={input(t)} />
      </Field>
      <Field label="Descrição (opcional)">
        <textarea
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          style={{ ...input(t), resize: 'vertical' }}
        />
      </Field>
      <Footer>
        <button type="button" onClick={onCancel} style={btnGhost(t)}>
          Cancelar
        </button>
        <button
          type="button"
          disabled={!name.trim()}
          onClick={onNext}
          style={{ ...btnGold(t), opacity: name.trim() ? 1 : 0.5 }}
        >
          Próximo
        </button>
      </Footer>
    </div>
  );
}

// ------------------ Step 2 ------------------

function Step2({
  connectionId,
  setConnectionId,
  templateId,
  setTemplateId,
  templateVars,
  setTemplateVars,
  onNext,
  onBack,
}: {
  connectionId: string;
  setConnectionId: (v: string) => void;
  templateId: string;
  setTemplateId: (v: string) => void;
  templateVars: Record<string, string>;
  setTemplateVars: (v: Record<string, string>) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const { tokens: t } = useTheme();
  const connections = useWhatsAppConnections('OFFICIAL');
  const templates = useTemplates(connectionId || null);
  const tmpl = templates.data?.find((x) => x.id === templateId);
  // Detecta variáveis {{1}}, {{2}}, ... no body
  const varKeys = tmpl
    ? Array.from(new Set([...tmpl.body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => m[1]!)))
    : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Field label="Conexão WhatsApp Oficial (Meta)">
        <select value={connectionId} onChange={(e) => setConnectionId(e.target.value)} style={input(t)}>
          <option value="">— escolha —</option>
          {(connections.data ?? []).filter((c) => c.active).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Template aprovado">
        <select
          value={templateId}
          onChange={(e) => {
            setTemplateId(e.target.value);
            setTemplateVars({});
          }}
          disabled={!connectionId}
          style={{ ...input(t), opacity: connectionId ? 1 : 0.5 }}
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
      </Field>

      {tmpl && (
        <div
          style={{
            padding: 10,
            borderRadius: 8,
            background: t.bgInput,
            border: `1px solid ${t.border}`,
            fontSize: 12,
            color: t.text,
          }}
        >
          <div style={{ fontSize: 10.5, fontWeight: 700, color: t.textFaint, marginBottom: 4 }}>PREVIEW</div>
          {tmpl.body}
        </div>
      )}

      {varKeys.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: t.textDim }}>
            Mapeamento de variáveis do template
          </div>
          {varKeys.map((k) => (
            <div key={k} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 8, alignItems: 'center' }}>
              <code style={{ fontSize: 11, padding: '2px 6px', background: t.bgInput, borderRadius: 4 }}>{`{{${k}}}`}</code>
              <input
                type="text"
                value={templateVars[k] ?? ''}
                onChange={(e) => setTemplateVars({ ...templateVars, [k]: e.target.value })}
                placeholder="{{contact.name}} ou texto fixo"
                style={input(t)}
              />
            </div>
          ))}
          <div style={{ fontSize: 11, color: t.textDim }}>
            Use <code>{'{{contact.name}}'}</code>, <code>{'{{contact.firstName}}'}</code>,{' '}
            <code>{'{{contact.phone}}'}</code> pra preenchimento dinâmico.
          </div>
        </div>
      )}

      <Footer>
        <button type="button" onClick={onBack} style={btnGhost(t)}>
          Voltar
        </button>
        <button
          type="button"
          disabled={!connectionId || !templateId}
          onClick={onNext}
          style={{ ...btnGold(t), opacity: connectionId && templateId ? 1 : 0.5 }}
        >
          Próximo
        </button>
      </Footer>
    </div>
  );
}

// ------------------ Step 3 ------------------

function Step3({
  audienceType,
  setAudienceType,
  filters,
  setFilters,
  onNext,
  onBack,
}: {
  audienceType: BroadcastAudienceType;
  setAudienceType: (v: BroadcastAudienceType) => void;
  filters: AudienceFilters;
  setFilters: (v: AudienceFilters) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const { tokens: t } = useTheme();
  const tags = useTags();
  const team = useTeam();
  const pipelines = usePipelines();
  const firstPipeline = filters.pipelineIds?.[0] ?? null;
  const pipelineDetail = usePipeline(firstPipeline);
  const preview = usePreviewAudience();

  const handlePreview = async () => {
    try {
      await preview.mutateAsync({ audienceType, audienceFilters: filters });
    } catch {
      toast('Falha ao calcular público', 'error');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Field label="Tipo de público">
        <div style={{ display: 'flex', gap: 8 }}>
          {(['CONTACTS', 'OPPORTUNITIES'] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => {
                setAudienceType(opt);
                setFilters({});
              }}
              style={{
                padding: '8px 14px',
                fontSize: 12,
                borderRadius: 7,
                border: `1px solid ${audienceType === opt ? t.gold : t.border}`,
                background: audienceType === opt ? t.goldFaint : t.bgInput,
                color: t.text,
                cursor: 'pointer',
              }}
            >
              {opt === 'CONTACTS' ? 'Contatos' : 'Oportunidades'}
            </button>
          ))}
        </div>
      </Field>

      {audienceType === 'CONTACTS' && (
        <>
          <Field label="Tags incluir (qualquer)">
            <MultiSelect
              options={(tags.data ?? []).map((tt) => ({ value: tt.id, label: tt.name }))}
              value={filters.tagsInclude ?? []}
              onChange={(v) => setFilters({ ...filters, tagsInclude: v })}
            />
          </Field>
          <Field label="Tags excluir">
            <MultiSelect
              options={(tags.data ?? []).map((tt) => ({ value: tt.id, label: tt.name }))}
              value={filters.tagsExclude ?? []}
              onChange={(v) => setFilters({ ...filters, tagsExclude: v })}
            />
          </Field>
          <Field label="Responsável (qualquer um)">
            <MultiSelect
              options={(team.data ?? []).map((u) => ({ value: u.id, label: u.name }))}
              value={filters.ownerIds ?? []}
              onChange={(v) => setFilters({ ...filters, ownerIds: v })}
            />
          </Field>
        </>
      )}

      {audienceType === 'OPPORTUNITIES' && (
        <>
          <Field label="Funis (qualquer um)">
            <MultiSelect
              options={(pipelines.data ?? []).map((p) => ({ value: p.id, label: p.name }))}
              value={filters.pipelineIds ?? []}
              onChange={(v) => setFilters({ ...filters, pipelineIds: v, stageIdsInclude: [] })}
            />
          </Field>
          <Field label="Etapas incluir">
            <MultiSelect
              options={(pipelineDetail.data?.stages ?? []).map((s) => ({ value: s.id, label: s.name }))}
              value={filters.stageIdsInclude ?? []}
              onChange={(v) => setFilters({ ...filters, stageIdsInclude: v })}
            />
          </Field>
          <Field label="Status">
            <select
              value={filters.status ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                setFilters({ ...filters, status: v ? (v as 'ACTIVE' | 'WON' | 'LOST') : undefined });
              }}
              style={input(t)}
            >
              <option value="">Qualquer status</option>
              <option value="ACTIVE">Ativa</option>
              <option value="WON">Ganha</option>
              <option value="LOST">Perdida</option>
            </select>
          </Field>
        </>
      )}

      <button type="button" onClick={handlePreview} disabled={preview.isPending} style={btnGhost(t)}>
        {preview.isPending ? 'Calculando…' : 'Pré-visualizar público'}
      </button>

      {preview.data && (
        <div
          style={{
            padding: 12,
            background: t.bgInput,
            border: `1px solid ${t.border}`,
            borderRadius: 8,
            fontSize: 12.5,
          }}
        >
          <strong style={{ color: t.text }}>{preview.data.count} contatos</strong> serão alcançados.
          {preview.data.sample.length > 0 && (
            <div style={{ marginTop: 6, fontSize: 11.5, color: t.textDim }}>
              Amostra: {preview.data.sample.map((s) => `${s.name} (${s.phone})`).join(', ')}
              {preview.data.count > 5 && ` e mais ${preview.data.count - 5}…`}
            </div>
          )}
        </div>
      )}

      <Footer>
        <button type="button" onClick={onBack} style={btnGhost(t)}>
          Voltar
        </button>
        <button
          type="button"
          disabled={!preview.data || preview.data.count === 0}
          onClick={onNext}
          style={{ ...btnGold(t), opacity: preview.data && preview.data.count > 0 ? 1 : 0.5 }}
        >
          Próximo
        </button>
      </Footer>
    </div>
  );
}

// ------------------ Step 4 ------------------

function Step4({
  scheduleNow,
  setScheduleNow,
  scheduledAt,
  setScheduledAt,
  intervalSeconds,
  setIntervalSeconds,
  respectBusinessHours,
  setRespectBusinessHours,
  onNext,
  onBack,
}: {
  scheduleNow: boolean;
  setScheduleNow: (v: boolean) => void;
  scheduledAt: string;
  setScheduledAt: (v: string) => void;
  intervalSeconds: number;
  setIntervalSeconds: (v: number) => void;
  respectBusinessHours: boolean;
  setRespectBusinessHours: (v: boolean) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const { tokens: t } = useTheme();
  const intervalLevel: 'red' | 'yellow' | 'green' =
    intervalSeconds < 15 ? 'red' : intervalSeconds < 60 ? 'yellow' : 'green';
  const intervalMsg = {
    red: '⚠ Muito agressivo — pode afetar o tier de qualidade.',
    yellow: 'Normal — equilibrado entre velocidade e segurança.',
    green: '✓ Conservador — protege a saúde do número.',
  }[intervalLevel];
  const intervalColor = { red: '#ef4444', yellow: '#f59e0b', green: '#10b981' }[intervalLevel];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Field label="Quando enviar">
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => setScheduleNow(true)}
            style={{
              padding: '8px 14px',
              fontSize: 12,
              borderRadius: 7,
              border: `1px solid ${scheduleNow ? t.gold : t.border}`,
              background: scheduleNow ? t.goldFaint : t.bgInput,
              color: t.text,
              cursor: 'pointer',
            }}
          >
            Imediatamente
          </button>
          <button
            type="button"
            onClick={() => setScheduleNow(false)}
            style={{
              padding: '8px 14px',
              fontSize: 12,
              borderRadius: 7,
              border: `1px solid ${!scheduleNow ? t.gold : t.border}`,
              background: !scheduleNow ? t.goldFaint : t.bgInput,
              color: t.text,
              cursor: 'pointer',
            }}
          >
            Agendar
          </button>
        </div>
      </Field>

      {!scheduleNow && (
        <Field label="Data e hora">
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            style={input(t)}
          />
        </Field>
      )}

      <Field label={`Intervalo entre mensagens: ${intervalSeconds}s`}>
        <input
          type="range"
          min={5}
          max={300}
          step={5}
          value={intervalSeconds}
          onChange={(e) => setIntervalSeconds(Number(e.target.value))}
          style={{ width: '100%', accentColor: t.gold }}
        />
        <div style={{ fontSize: 11.5, color: intervalColor }}>{intervalMsg}</div>
      </Field>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: t.text, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={respectBusinessHours}
          onChange={(e) => setRespectBusinessHours(e.target.checked)}
          style={{ accentColor: t.gold }}
        />
        Respeitar horário comercial (pausa fora dele)
      </label>

      <Footer>
        <button type="button" onClick={onBack} style={btnGhost(t)}>
          Voltar
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!scheduleNow ? !scheduledAt : false}
          style={btnGold(t)}
        >
          Próximo
        </button>
      </Footer>
    </div>
  );
}

// ------------------ Step 5 ------------------

function Step5({
  name,
  intervalSeconds,
  scheduleNow,
  scheduledAt,
  audienceType,
  filters,
  onSaveDraft,
  onStart,
  onBack,
  submitting,
}: {
  name: string;
  intervalSeconds: number;
  scheduleNow: boolean;
  scheduledAt: string;
  audienceType: BroadcastAudienceType;
  filters: AudienceFilters;
  onSaveDraft: () => void;
  onStart: () => void;
  onBack: () => void;
  submitting: boolean;
}) {
  const { tokens: t } = useTheme();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontSize: 12.5, color: t.text }}>
      <div
        style={{
          padding: 14,
          background: t.bgInput,
          border: `1px solid ${t.border}`,
          borderRadius: 8,
        }}
      >
        <Row label="Nome" value={name} />
        <Row label="Tipo de público" value={audienceType === 'CONTACTS' ? 'Contatos' : 'Oportunidades'} />
        <Row
          label="Quando"
          value={scheduleNow ? 'Imediatamente' : `Agendado para ${new Date(scheduledAt).toLocaleString('pt-BR')}`}
        />
        <Row label="Intervalo" value={`${intervalSeconds}s entre mensagens`} />
        <Row label="Filtros" value={JSON.stringify(filters)} />
      </div>

      <div
        style={{
          padding: 10,
          background: 'rgba(245,158,11,0.08)',
          border: '1px solid rgba(245,158,11,0.4)',
          borderRadius: 8,
          fontSize: 11.5,
          color: t.text,
        }}
      >
        ⚠ Você confirma que os destinatários optaram por receber comunicações via WhatsApp?
      </div>

      <Footer>
        <button type="button" onClick={onBack} style={btnGhost(t)}>
          Voltar
        </button>
        <button type="button" onClick={onSaveDraft} disabled={submitting} style={btnGhost(t)}>
          Salvar como rascunho
        </button>
        <button type="button" onClick={onStart} disabled={submitting} style={btnGold(t)}>
          {submitting ? 'Salvando…' : 'Iniciar disparo'}
        </button>
      </Footer>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const { tokens: t } = useTheme();
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', padding: '4px 0', fontSize: 12 }}>
      <span style={{ color: t.textDim }}>{label}</span>
      <span style={{ color: t.text, wordBreak: 'break-word' }}>{value}</span>
    </div>
  );
}

// ------------------ Multi-select compacto ------------------

function MultiSelect({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const { tokens: t } = useTheme();
  return (
    <select
      multiple
      value={value}
      onChange={(e) => {
        const sel = Array.from(e.target.selectedOptions).map((o) => o.value);
        onChange(sel);
      }}
      style={{ ...input(t), minHeight: 90 }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const { tokens: t } = useTheme();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 500, color: t.textDim }}>{label}</label>
      {children}
    </div>
  );
}

function Footer({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>{children}</div>;
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
