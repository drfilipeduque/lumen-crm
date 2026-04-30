// Rota oculta /api-test — só admin.
// Forma rápida de:
//   1. Criar/editar uma Automation colando o JSON da flow
//   2. Disparar trigger fake (POST /:id/test)
//   3. Ver logs recentes
//
// Vai ser substituída pelo construtor visual na Parte 3.

import { useState } from 'react';
import axios from 'axios';
import { useTheme } from '../lib/ThemeContext';
import { api } from '../lib/api';
import { toast } from '../components/ui/Toast';

const SAMPLE_FLOW = JSON.stringify(
  {
    name: 'Tag automática ao mover pra Negociação',
    flow: {
      nodes: [
        {
          id: 'trigger-1',
          type: 'trigger',
          subtype: 'opportunity_stage_changed',
          config: { toStageId: '<COLE_O_ID_DA_ETAPA>' },
        },
        {
          id: 'action-1',
          type: 'action',
          subtype: 'add_tag',
          config: { tagId: '<COLE_O_ID_DA_TAG>' },
        },
      ],
      edges: [{ from: 'trigger-1', to: 'action-1' }],
    },
  },
  null,
  2,
);

export function ApiTestPage() {
  const { tokens: t } = useTheme();
  const [json, setJson] = useState(SAMPLE_FLOW);
  const [createdId, setCreatedId] = useState<string>('');
  const [eventJson, setEventJson] = useState(
    JSON.stringify({ event: { type: 'opportunity.stage_changed', data: { opportunityId: '' } } }, null, 2),
  );
  const [output, setOutput] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    try {
      const body = JSON.parse(json);
      const res = await api.post('/automations', body);
      setCreatedId(res.data.id);
      setOutput(JSON.stringify(res.data, null, 2));
      toast(`Automation criada: ${res.data.id}`, 'success');
    } catch (e) {
      const msg = axios.isAxiosError(e) ? e.response?.data : (e as Error).message;
      setOutput(typeof msg === 'string' ? msg : JSON.stringify(msg, null, 2));
      toast('Falha ao criar', 'error');
    } finally {
      setBusy(false);
    }
  };

  const fireFake = async () => {
    if (!createdId) return toast('Crie uma automation primeiro', 'error');
    setBusy(true);
    try {
      const body = JSON.parse(eventJson);
      const res = await api.post(`/automations/${createdId}/test`, body);
      setOutput(JSON.stringify(res.data, null, 2));
    } catch (e) {
      const msg = axios.isAxiosError(e) ? e.response?.data : (e as Error).message;
      setOutput(typeof msg === 'string' ? msg : JSON.stringify(msg, null, 2));
    } finally {
      setBusy(false);
    }
  };

  const loadLogs = async () => {
    if (!createdId) return toast('Crie uma automation primeiro', 'error');
    setBusy(true);
    try {
      const res = await api.get(`/automations/${createdId}/logs`);
      setOutput(JSON.stringify(res.data, null, 2));
    } catch (e) {
      const msg = axios.isAxiosError(e) ? e.response?.data : (e as Error).message;
      setOutput(typeof msg === 'string' ? msg : JSON.stringify(msg, null, 2));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: '24px 32px', color: t.text, height: '100%', display: 'flex', flexDirection: 'column', gap: 16, overflow: 'auto' }}>
      <div>
        <h2 style={{ fontSize: 18, margin: 0, fontWeight: 600 }}>Automation — Debug</h2>
        <div style={{ fontSize: 12, color: t.textDim, marginTop: 4 }}>
          Rota oculta de dev. Será substituída pelo construtor visual na Parte 3.
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Panel title="1. Criar automation (JSON)">
          <textarea
            value={json}
            onChange={(e) => setJson(e.target.value)}
            style={textarea(t)}
            rows={20}
            spellCheck={false}
          />
          <button type="button" onClick={create} disabled={busy} style={btnGold(t)}>
            POST /automations
          </button>
          {createdId ? (
            <div style={{ fontSize: 11, color: t.textDim, marginTop: 6, fontFamily: 'monospace' }}>
              criada: {createdId}
            </div>
          ) : null}
        </Panel>

        <Panel title="2. Disparar trigger fake (dry-run)">
          <textarea
            value={eventJson}
            onChange={(e) => setEventJson(e.target.value)}
            style={textarea(t)}
            rows={6}
            spellCheck={false}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" onClick={fireFake} disabled={busy} style={btnGold(t)}>
              POST /:id/test
            </button>
            <button type="button" onClick={loadLogs} disabled={busy} style={btnNeutral(t)}>
              Ver logs
            </button>
          </div>
        </Panel>
      </div>

      <Panel title="Output">
        <pre style={{ ...textarea(t), minHeight: 240, whiteSpace: 'pre-wrap', overflow: 'auto' }}>
          {output || '(vazio)'}
        </pre>
      </Panel>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  const { tokens: t } = useTheme();
  return (
    <div
      style={{
        border: `1px solid ${t.border}`,
        borderRadius: 10,
        background: t.bgElevated,
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ fontSize: 12, color: t.textDim, fontWeight: 500 }}>{title}</div>
      {children}
    </div>
  );
}

type Tk = ReturnType<typeof useTheme>['tokens'];
const textarea = (t: Tk) => ({
  width: '100%',
  background: t.bgInput,
  color: t.text,
  border: `1px solid ${t.border}`,
  borderRadius: 8,
  padding: 10,
  fontFamily: 'monospace' as const,
  fontSize: 11.5,
  resize: 'vertical' as const,
  outline: 'none' as const,
});
const btnGold = (t: Tk) => ({
  padding: '7px 14px',
  borderRadius: 8,
  background: t.gold,
  color: '#1a1300',
  border: 'none',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer' as const,
});
const btnNeutral = (t: Tk) => ({
  padding: '7px 14px',
  borderRadius: 8,
  background: t.bgInput,
  color: t.text,
  border: `1px solid ${t.border}`,
  fontSize: 12,
  cursor: 'pointer' as const,
});
