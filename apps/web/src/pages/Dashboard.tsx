import { useState } from 'react';
import { useTheme } from '../lib/ThemeContext';
import { Icons } from '../components/icons';
import { PeriodFilter } from '../components/dashboard/primitives';
import {
  MetricTotalLeads,
  MetricByStage,
  MetricAvgTime,
  MetricByUser,
  MetricConversion,
  MetricInactive,
} from '../components/dashboard/Metrics';
import { TagDonut } from '../components/dashboard/TagDonut';
import { Funnel } from '../components/dashboard/Funnel';
import { FinancialCard } from '../components/dashboard/FinancialCard';
import { useAuthStore } from '../stores/useAuthStore';
import {
  useFunnel,
  useMetrics,
  useTagDistribution,
  type PeriodKey,
} from '../hooks/useDashboard';

function GhostButton({ children }: { children: React.ReactNode }) {
  const { tokens: t } = useTheme();
  return (
    <button
      style={{
        height: 32,
        padding: '0 12px',
        background: 'transparent',
        border: `1px solid ${t.border}`,
        color: t.textDim,
        borderRadius: 7,
        fontSize: 12,
        fontWeight: 500,
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = t.bgHover;
        e.currentTarget.style.color = t.text;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = t.textDim;
      }}
    >
      {children}
    </button>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

export function DashboardPage() {
  const { tokens: t } = useTheme();
  const user = useAuthStore((s) => s.user);
  const [period, setPeriod] = useState<PeriodKey>('month');

  const metrics = useMetrics({ period });
  const tags = useTagDistribution({ period });
  const funnel = useFunnel({ period });

  const firstName = (user?.name ?? 'Usuário').split(/\s+/)[0]!;
  const updatedAt = metrics.dataUpdatedAt
    ? new Date(metrics.dataUpdatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : '—';

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        overflow: 'auto',
        background: t.bg,
      }}
    >
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 5,
          background: t.bg,
          borderBottom: `1px solid ${t.border}`,
          padding: '24px 32px 20px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            marginBottom: 18,
            gap: 24,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11.5,
                letterSpacing: 1,
                textTransform: 'uppercase',
                color: t.textFaint,
                fontWeight: 500,
                marginBottom: 6,
              }}
            >
              Dashboard
            </div>
            <h1
              style={{
                fontSize: 26,
                fontWeight: 600,
                letterSpacing: -0.6,
                margin: 0,
                color: t.text,
              }}
            >
              {greeting()}, {firstName}
            </h1>
            <div style={{ fontSize: 13, color: t.textDim, marginTop: 4 }}>
              Visão geral do desempenho — atualizado às{' '}
              <span style={{ color: t.text }}>{updatedAt}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <GhostButton>Exportar</GhostButton>
            <GhostButton>Compartilhar</GhostButton>
          </div>
        </div>
        <PeriodFilter value={period} onChange={setPeriod} />
      </div>

      <div
        style={{
          padding: '24px 32px 40px',
          display: 'flex',
          flexDirection: 'column',
          gap: 28,
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 16,
          }}
        >
          <MetricTotalLeads loading={metrics.isLoading} total={metrics.data?.totalLeads} />
          <MetricByStage loading={metrics.isLoading} data={metrics.data?.leadsByStage} />
          <MetricAvgTime
            loading={metrics.isLoading}
            minutes={metrics.data?.avgTimeBetweenStages}
          />
          <MetricByUser loading={metrics.isLoading} data={metrics.data?.leadsByUser} />
          <MetricConversion loading={metrics.isLoading} rate={metrics.data?.conversionRate} />
          <MetricInactive loading={metrics.isLoading} count={metrics.data?.inactiveLeads} />
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '5fr 7fr',
            gap: 16,
          }}
        >
          <TagDonut loading={tags.isLoading} data={tags.data} />
          <Funnel loading={funnel.isLoading} data={funnel.data} />
        </div>

        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 14,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: t.text,
                  letterSpacing: -0.2,
                }}
              >
                Métricas personalizadas
              </div>
              <div style={{ fontSize: 12, color: t.textSubtle, marginTop: 2 }}>
                Configure agregações sobre seus campos personalizados (em breve)
              </div>
            </div>
            <button
              disabled
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                height: 30,
                padding: '0 11px',
                background: 'transparent',
                border: `1px dashed ${t.borderStrong}`,
                color: t.textSubtle,
                borderRadius: 7,
                fontSize: 12,
                fontWeight: 500,
                cursor: 'not-allowed',
                fontFamily: 'inherit',
                opacity: 0.7,
              }}
            >
              <Icons.Plus s={12} c="currentColor" /> Adicionar bloco
            </button>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 16,
            }}
          >
            <FinancialCard label="VALOR TOTAL EM PIPELINE" value="—" sub="Configure um bloco" />
            <FinancialCard label="TICKET MÉDIO" value="—" sub="Configure um bloco" />
            <FinancialCard label="VALOR FECHADO" value="—" sub="Configure um bloco" />
          </div>
        </div>
      </div>
    </div>
  );
}
