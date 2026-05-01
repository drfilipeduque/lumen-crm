// Wizard de importação de contatos via CSV em 3 passos:
//   1) Upload do arquivo (com botão pra baixar template)
//   2) Mapeamento de colunas (auto-detecta + permite ajustar)
//   3) Configuração final (tags, owner, estratégia de duplicados)
//
// Modal final mostra relatório (criados/atualizados/pulados/erros) e
// permite baixar CSV de erros.

import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Modal } from '../ui/Modal';
import { useTheme } from '../../lib/ThemeContext';
import { toast } from '../ui/Toast';
import { useTags } from '../../hooks/useTags';
import { useTeam } from '../../hooks/useTeam';
import { api } from '../../lib/api';
import { useQueryClient } from '@tanstack/react-query';

type SystemField = {
  value: string;
  label: string;
  required?: boolean;
};

const SYSTEM_FIELDS: SystemField[] = [
  { value: '', label: '— Não importar —' },
  { value: 'name', label: 'Nome', required: true },
  { value: 'phone', label: 'Telefone', required: true },
  { value: 'email', label: 'Email' },
  { value: 'cpf', label: 'CPF' },
  { value: 'birthDate', label: 'Data de nascimento' },
  { value: 'address.street', label: 'Endereço — Rua' },
  { value: 'address.number', label: 'Endereço — Número' },
  { value: 'address.city', label: 'Endereço — Cidade' },
  { value: 'address.state', label: 'Endereço — Estado/UF' },
  { value: 'address.zip', label: 'Endereço — CEP' },
  { value: 'address.complement', label: 'Endereço — Complemento' },
  { value: 'notes', label: 'Observações' },
];

const HEURISTICS: Record<string, string> = {
  nome: 'name',
  'nome completo': 'name',
  contato: 'name',
  telefone: 'phone',
  celular: 'phone',
  whatsapp: 'phone',
  fone: 'phone',
  email: 'email',
  'e-mail': 'email',
  cpf: 'cpf',
  documento: 'cpf',
  nascimento: 'birthDate',
  'data de nascimento': 'birthDate',
  'data nascimento': 'birthDate',
  endereço: 'address.street',
  endereco: 'address.street',
  rua: 'address.street',
  numero: 'address.number',
  número: 'address.number',
  cidade: 'address.city',
  estado: 'address.state',
  uf: 'address.state',
  cep: 'address.zip',
  observações: 'notes',
  observacoes: 'notes',
  obs: 'notes',
};

type Strategy = 'SKIP' | 'UPDATE' | 'CREATE_ANYWAY';

type ImportReport = {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  errorRows: { row: number; reason: string }[];
};

export function ImportContactsWizard({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone?: () => void;
}) {
  const { tokens: t } = useTheme();
  const tags = useTags();
  const team = useTeam();
  const qc = useQueryClient();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [ownerId, setOwnerId] = useState<string>('');
  const [strategy, setStrategy] = useState<Strategy>('SKIP');
  const [report, setReport] = useState<ImportReport | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset ao abrir
  useEffect(() => {
    if (!open) return;
    setStep(1);
    setFile(null);
    setHeaders([]);
    setPreviewRows([]);
    setMapping({});
    setTagIds([]);
    setOwnerId('');
    setStrategy('SKIP');
    setReport(null);
  }, [open]);

  const handleFile = async (f: File) => {
    setFile(f);
    const text = await f.text();
    const rows = parseCsvBrowser(text);
    if (rows.length === 0) {
      toast('CSV vazio', 'error');
      return;
    }
    const head = rows[0]!.map((h) => h.trim());
    setHeaders(head);
    setPreviewRows(rows.slice(1, 6));
    // Auto-detect mapping
    const auto: Record<string, string> = {};
    for (const h of head) {
      const k = h.toLowerCase().trim();
      if (HEURISTICS[k]) auto[h] = HEURISTICS[k]!;
    }
    setMapping(auto);
  };

  const handleDownloadTemplate = async () => {
    try {
      const r = await api.get('/contacts/import-template', { responseType: 'blob' });
      const blob = new Blob([r.data], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'modelo-contatos.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast('Falha ao baixar modelo', 'error');
    }
  };

  const mappedFields = useMemo(() => new Set(Object.values(mapping).filter(Boolean)), [mapping]);
  const canGoStep3 = mappedFields.has('name') && mappedFields.has('phone');

  const submit = async () => {
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('mapping', JSON.stringify(mapping));
    if (tagIds.length > 0) formData.append('tagIds', JSON.stringify(tagIds));
    if (ownerId) formData.append('ownerId', ownerId);
    formData.append('duplicateStrategy', strategy);

    setSubmitting(true);
    try {
      const r = await api.post<ImportReport>('/contacts/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setReport(r.data);
      setStep(4);
      qc.invalidateQueries({ queryKey: ['contacts'] });
      onDone?.();
    } catch (e) {
      const msg = axios.isAxiosError(e) ? e.response?.data?.message : null;
      toast(msg || 'Falha ao importar', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const downloadErrorsCsv = () => {
    if (!report || report.errorRows.length === 0) return;
    const csv = ['Linha,Motivo', ...report.errorRows.map((e) => `${e.row},"${e.reason.replace(/"/g, '""')}"`)].join(
      '\n',
    );
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'erros-importacao.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const titleByStep = {
    1: 'Importar contatos — Passo 1 de 3',
    2: 'Importar contatos — Passo 2 de 3',
    3: 'Importar contatos — Passo 3 de 3',
    4: 'Resultado da importação',
  };

  return (
    <Modal open={open} onClose={onClose} title={titleByStep[step]} width={680}>
      {step === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 12.5, color: t.textDim }}>
            Selecione um arquivo CSV com seus contatos. Você pode baixar o modelo abaixo.
          </div>
          <button type="button" onClick={handleDownloadTemplate} style={btnGhost(t)}>
            ⬇ Baixar modelo CSV
          </button>
          <div
            onClick={() => inputRef.current?.click()}
            style={{
              padding: 24,
              border: `2px dashed ${file ? t.gold : t.border}`,
              borderRadius: 10,
              textAlign: 'center',
              cursor: 'pointer',
              background: t.bgInput,
              color: t.text,
            }}
          >
            {file ? (
              <>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{file.name}</div>
                <div style={{ fontSize: 11.5, color: t.textDim, marginTop: 4 }}>
                  {(file.size / 1024).toFixed(1)} KB · {previewRows.length} linhas de preview
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 13 }}>Arraste o arquivo CSV ou clique pra selecionar</div>
                <div style={{ fontSize: 11, color: t.textDim, marginTop: 4 }}>Apenas .csv</div>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
            />
          </div>
          {file && previewRows.length > 0 && (
            <div
              style={{
                background: t.bgInput,
                border: `1px solid ${t.border}`,
                borderRadius: 8,
                padding: 8,
                fontSize: 11,
                fontFamily: 'monospace',
                maxHeight: 160,
                overflow: 'auto',
              }}
            >
              <div style={{ fontWeight: 700, color: t.textDim, marginBottom: 4 }}>
                Preview (primeiras 5 linhas):
              </div>
              {[headers, ...previewRows].slice(0, 6).map((row, i) => (
                <div key={i} style={{ borderBottom: i === 0 ? `1px solid ${t.border}` : 'none', padding: 2 }}>
                  {row.join(' | ')}
                </div>
              ))}
            </div>
          )}
          <Footer>
            <button type="button" onClick={onClose} style={btnGhost(t)}>
              Cancelar
            </button>
            <button
              type="button"
              disabled={!file}
              onClick={() => setStep(2)}
              style={{ ...btnGold(t), opacity: !file ? 0.5 : 1 }}
            >
              Próximo
            </button>
          </Footer>
        </div>
      )}

      {step === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 12.5, color: t.textDim }}>
            Mapeie cada coluna do CSV ao campo correspondente. Os campos{' '}
            <strong style={{ color: t.text }}>Nome</strong> e{' '}
            <strong style={{ color: t.text }}>Telefone</strong> são obrigatórios.
          </div>
          <div style={{ maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {headers.map((h) => (
              <div
                key={h}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto 1fr',
                  alignItems: 'center',
                  gap: 8,
                  padding: 8,
                  background: t.bgInput,
                  borderRadius: 7,
                  border: `1px solid ${t.border}`,
                }}
              >
                <div style={{ fontSize: 12.5, color: t.text, fontFamily: 'monospace' }}>{h}</div>
                <div style={{ color: t.textDim }}>→</div>
                <select
                  value={mapping[h] ?? ''}
                  onChange={(e) => setMapping({ ...mapping, [h]: e.target.value })}
                  style={input(t)}
                >
                  {SYSTEM_FIELDS.map((f) => (
                    <option key={f.value || 'none'} value={f.value}>
                      {f.label}
                      {f.required ? ' *' : ''}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          {!canGoStep3 && (
            <div
              style={{
                padding: 8,
                background: 'rgba(245,158,11,0.1)',
                border: '1px solid rgba(245,158,11,0.4)',
                borderRadius: 7,
                fontSize: 11.5,
                color: t.text,
              }}
            >
              ⚠ Mapeie pelo menos os campos obrigatórios: Nome e Telefone.
            </div>
          )}
          <Footer>
            <button type="button" onClick={() => setStep(1)} style={btnGhost(t)}>
              Voltar
            </button>
            <button
              type="button"
              disabled={!canGoStep3}
              onClick={() => setStep(3)}
              style={{ ...btnGold(t), opacity: canGoStep3 ? 1 : 0.5 }}
            >
              Próximo
            </button>
          </Footer>
        </div>
      )}

      {step === 3 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Tags pra aplicar em todos">
            <select
              multiple
              value={tagIds}
              onChange={(e) => {
                const selected = Array.from(e.target.selectedOptions).map((o) => o.value);
                setTagIds(selected);
              }}
              style={{ ...input(t), minHeight: 120 }}
            >
              {(tags.data ?? []).map((tg) => (
                <option key={tg.id} value={tg.id}>
                  {tg.name}
                </option>
              ))}
            </select>
            <div style={{ fontSize: 11, color: t.textDim, marginTop: 2 }}>Segure Ctrl/Cmd pra selecionar várias.</div>
          </Field>
          <Field label="Responsável padrão (opcional)">
            <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} style={input(t)}>
              <option value="">— Sem responsável —</option>
              {(team.data ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Estratégia para duplicados (telefone já cadastrado)">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(
                [
                  { value: 'SKIP', label: 'Pular telefones já cadastrados (recomendado)' },
                  { value: 'UPDATE', label: 'Atualizar dados dos existentes' },
                ] as const
              ).map((opt) => (
                <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    checked={strategy === opt.value}
                    onChange={() => setStrategy(opt.value)}
                    style={{ accentColor: t.gold }}
                  />
                  <span style={{ fontSize: 12.5, color: t.text }}>{opt.label}</span>
                </label>
              ))}
            </div>
          </Field>
          <Footer>
            <button type="button" onClick={() => setStep(2)} style={btnGhost(t)}>
              Voltar
            </button>
            <button type="button" disabled={submitting} onClick={submit} style={btnGold(t)}>
              {submitting ? 'Importando…' : `Importar ${previewRows.length > 0 ? '' : ''}contatos`}
            </button>
          </Footer>
        </div>
      )}

      {step === 4 && report && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            <Stat label="Criados" value={report.created} color="#10b981" t={t} />
            <Stat label="Atualizados" value={report.updated} color="#3b82f6" t={t} />
            <Stat label="Pulados" value={report.skipped} color="#94a3b8" t={t} />
            <Stat label="Erros" value={report.errors} color="#ef4444" t={t} />
          </div>
          {report.errorRows.length > 0 && (
            <>
              <div
                style={{
                  background: t.bgInput,
                  border: `1px solid ${t.border}`,
                  borderRadius: 8,
                  padding: 10,
                  maxHeight: 200,
                  overflowY: 'auto',
                  fontSize: 11.5,
                  fontFamily: 'monospace',
                  color: t.text,
                }}
              >
                {report.errorRows.slice(0, 50).map((er, i) => (
                  <div key={i}>
                    Linha {er.row}: <span style={{ color: '#ef4444' }}>{er.reason}</span>
                  </div>
                ))}
                {report.errorRows.length > 50 && (
                  <div style={{ color: t.textDim, marginTop: 4 }}>
                    + {report.errorRows.length - 50} erros não exibidos
                  </div>
                )}
              </div>
              <button type="button" onClick={downloadErrorsCsv} style={btnGhost(t)}>
                ⬇ Baixar relatório de erros
              </button>
            </>
          )}
          <Footer>
            <button type="button" onClick={onClose} style={btnGold(t)}>
              Fechar
            </button>
          </Footer>
        </div>
      )}
    </Modal>
  );
}

function Stat({
  label,
  value,
  color,
  t,
}: {
  label: string;
  value: number;
  color: string;
  t: ReturnType<typeof useTheme>['tokens'];
}) {
  return (
    <div
      style={{
        background: t.bgElevated,
        border: `1px solid ${t.border}`,
        borderRadius: 10,
        padding: '12px 14px',
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11, color: t.textDim, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
    </div>
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
  return <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>{children}</div>;
}

// CSV parser bem simples no client (mesmas regras do backend)
function parseCsvBrowser(text: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const headerEnd = text.search(/\r?\n/);
  const headerLine = headerEnd >= 0 ? text.slice(0, headerEnd) : text;
  const sep = headerLine.split(';').length > headerLine.split(',').length ? ';' : ',';
  const rows: string[][] = [];
  let cur: string[] = [];
  let cell = '';
  let i = 0;
  let inQuotes = false;
  while (i < text.length) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      cell += ch;
      i++;
    } else {
      if (ch === '"' && cell === '') {
        inQuotes = true;
        i++;
        continue;
      }
      if (ch === sep) {
        cur.push(cell);
        cell = '';
        i++;
        continue;
      }
      if (ch === '\n' || ch === '\r') {
        cur.push(cell);
        cell = '';
        rows.push(cur);
        cur = [];
        if (ch === '\r' && text[i + 1] === '\n') i++;
        i++;
        continue;
      }
      cell += ch;
      i++;
    }
  }
  if (cell !== '' || cur.length > 0) {
    cur.push(cell);
    rows.push(cur);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
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
