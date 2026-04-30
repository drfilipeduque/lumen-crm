import { useEffect, useMemo, useState } from 'react';
import { Modal } from './ui/Modal';
import { useTheme } from '../lib/ThemeContext';
import { usePipeline, usePipelines } from '../hooks/usePipelines';
import { useOpportunity, useTransferOpportunity, type TransferStrategy } from '../hooks/useOpportunities';
import { toast } from './ui/Toast';

type Props = {
  open: boolean;
  onClose: () => void;
  opportunityId: string | null;
  onTransferred?: () => void;
};

export function TransferOpportunityModal({ open, onClose, opportunityId, onTransferred }: Props) {
  const { tokens: t } = useTheme();
  const detail = useOpportunity(opportunityId);
  const pipelines = usePipelines();
  const transfer = useTransferOpportunity();

  const [targetPipelineId, setTargetPipelineId] = useState('');
  const [targetStageId, setTargetStageId] = useState('');
  const [strategy, setStrategy] = useState<TransferStrategy>('KEEP_COMPATIBLE');
  const [keepTags, setKeepTags] = useState(true);
  const [keepReminders, setKeepReminders] = useState(true);
  const [keepFiles, setKeepFiles] = useState(true);
  const [confirming, setConfirming] = useState(false);

  // Sempre que abrir/trocar a oportunidade, reset.
  useEffect(() => {
    if (!open) return;
    setTargetPipelineId('');
    setTargetStageId('');
    setStrategy('KEEP_COMPATIBLE');
    setKeepTags(true);
    setKeepReminders(true);
    setKeepFiles(true);
    setConfirming(false);
  }, [open, opportunityId]);

  const sourcePipeline = usePipeline(detail.data?.pipelineId ?? null);
  const targetPipeline = usePipeline(targetPipelineId || null);

  // Preview: campos personalizados que o destino não tem (KEEP_COMPATIBLE) ou todos (DISCARD_ALL)
  const previewRemoved = useMemo(() => {
    const oppFields = detail.data?.customFields ?? [];
    if (strategy === 'DISCARD_ALL') {
      const map = new Map(sourcePipeline.data?.customFields.map((f) => [f.customFieldId, f.name]));
      return oppFields.map((f) => map.get(f.customFieldId) ?? f.customFieldId);
    }
    if (strategy === 'KEEP_COMPATIBLE' && targetPipeline.data) {
      const targetVisible = new Set(
        targetPipeline.data.customFields.filter((f) => f.visible).map((f) => f.customFieldId),
      );
      const map = new Map(sourcePipeline.data?.customFields.map((f) => [f.customFieldId, f.name]));
      return oppFields
        .filter((f) => !targetVisible.has(f.customFieldId))
        .map((f) => map.get(f.customFieldId) ?? f.customFieldId);
    }
    return [];
  }, [strategy, detail.data, sourcePipeline.data, targetPipeline.data]);

  if (!opportunityId) return null;

  const samePipeline = detail.data && detail.data.pipelineId === targetPipelineId;
  const canSubmit =
    !!targetPipelineId &&
    !!targetStageId &&
    !samePipeline &&
    !transfer.isPending;

  const handleConfirm = async () => {
    if (!opportunityId) return;
    try {
      await transfer.mutateAsync({
        id: opportunityId,
        targetPipelineId,
        targetStageId,
        customFieldStrategy: strategy,
        keepTags,
        keepReminders,
        keepFiles,
      });
      toast('Oportunidade transferida', 'success');
      onTransferred?.();
      onClose();
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message;
      toast(msg ?? 'Falha ao transferir', 'error');
    }
  };

  const targetPipelineName =
    pipelines.data?.find((p) => p.id === targetPipelineId)?.name ?? 'Funil';
  const targetStageName =
    targetPipeline.data?.stages.find((s) => s.id === targetStageId)?.name ?? 'Etapa';

  return (
    <Modal open={open} onClose={onClose} title="Transferir para outro funil" width={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13 }}>
        <div style={{ fontSize: 11.5, color: t.textDim }}>
          Atual: <strong style={{ color: t.text }}>{sourcePipeline.data?.name ?? '—'}</strong>
        </div>

        <Field label="Funil destino">
          <select
            value={targetPipelineId}
            onChange={(e) => {
              setTargetPipelineId(e.target.value);
              setTargetStageId('');
            }}
            style={input(t)}
          >
            <option value="">— escolha —</option>
            {(pipelines.data ?? [])
              .filter((p) => p.active && p.id !== detail.data?.pipelineId)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </Field>

        <Field label="Etapa destino">
          <select
            value={targetStageId}
            onChange={(e) => setTargetStageId(e.target.value)}
            disabled={!targetPipelineId}
            style={{ ...input(t), opacity: targetPipelineId ? 1 : 0.5 }}
          >
            <option value="">
              {targetPipelineId ? '— escolha —' : '— selecione um funil primeiro —'}
            </option>
            {(targetPipeline.data?.stages ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Campos personalizados">
          <select
            value={strategy}
            onChange={(e) => setStrategy(e.target.value as TransferStrategy)}
            style={input(t)}
          >
            <option value="KEEP_COMPATIBLE">Manter campos compatíveis (recomendado)</option>
            <option value="DISCARD_ALL">Descartar todos os campos personalizados</option>
            <option value="MAP">Mapear campos manualmente (em breve)</option>
          </select>
        </Field>

        {strategy === 'MAP' && (
          <div style={{ fontSize: 11.5, color: t.textDim }}>
            O mapeamento manual ainda não tem editor visual. Configure direto na action do
            fluxo de automação ou abra um chamado.
          </div>
        )}

        {previewRemoved.length > 0 && (
          <div
            style={{
              padding: 10,
              background: t.bgInput,
              borderRadius: 8,
              border: `1px solid ${t.border}`,
              fontSize: 11.5,
            }}
          >
            <div style={{ color: t.textDim, marginBottom: 4 }}>
              Os campos abaixo serão removidos:
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, color: t.text }}>
              {previewRemoved.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          </div>
        )}

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <Toggle label="Manter tags" checked={keepTags} onChange={setKeepTags} />
          <Toggle label="Manter lembretes" checked={keepReminders} onChange={setKeepReminders} />
          <Toggle label="Manter arquivos" checked={keepFiles} onChange={setKeepFiles} />
        </div>

        {samePipeline && (
          <div style={{ color: t.danger, fontSize: 11.5 }}>
            O funil destino não pode ser igual ao atual.
          </div>
        )}

        {!confirming ? (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <button type="button" onClick={onClose} style={btnGhost(t)}>
              Cancelar
            </button>
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => setConfirming(true)}
              style={{ ...btnGold(t), opacity: canSubmit ? 1 : 0.5 }}
            >
              Continuar
            </button>
          </div>
        ) : (
          <div
            style={{
              marginTop: 8,
              padding: 12,
              borderRadius: 10,
              background: t.bgInput,
              border: `1px solid ${t.border}`,
            }}
          >
            <div style={{ fontSize: 12.5, color: t.text, marginBottom: 8 }}>
              Confirmar a transferência para <strong>{targetPipelineName}</strong> /{' '}
              <strong>{targetStageName}</strong>? Esta ação fica registrada no histórico.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" onClick={() => setConfirming(false)} style={btnGhost(t)}>
                Voltar
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={transfer.isPending}
                style={{ ...btnGold(t), opacity: transfer.isPending ? 0.6 : 1 }}
              >
                {transfer.isPending ? 'Transferindo…' : 'Transferir'}
              </button>
            </div>
          </div>
        )}
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

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const { tokens: t } = useTheme();
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: t.text }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ accentColor: t.gold }}
      />
      {label}
    </label>
  );
}

type Tk = ReturnType<typeof useTheme>['tokens'];
const input = (t: Tk) => ({
  width: '100%',
  padding: '9px 12px',
  borderRadius: 8,
  background: t.bgInput,
  color: t.text,
  border: `1px solid ${t.border}`,
  fontSize: 13,
  outline: 'none' as const,
});
const btnGhost = (t: Tk) => ({
  padding: '8px 14px',
  background: 'transparent',
  border: `1px solid ${t.border}`,
  borderRadius: 8,
  color: t.text,
  fontSize: 12.5,
  cursor: 'pointer' as const,
});
const btnGold = (t: Tk) => ({
  padding: '8px 14px',
  background: t.gold,
  border: 'none',
  borderRadius: 8,
  color: '#1a1300',
  fontSize: 12.5,
  fontWeight: 600,
  cursor: 'pointer' as const,
});
