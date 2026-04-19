import { useTheme } from '../../lib/ThemeContext';
import { Card, CardHead, CardSkeleton, EmptyHint } from './primitives';
import type { Funnel as FunnelData } from '../../hooks/useDashboard';

export function Funnel({
  loading,
  data,
}: {
  loading: boolean;
  data: FunnelData | undefined;
}) {
  const { tokens: t } = useTheme();
  const stages = data?.stages ?? [];
  const max = stages.length > 0 ? Math.max(...stages.map((s) => s.count), 1) : 1;
  const first = stages[0]?.count ?? 0;
  const last = stages[stages.length - 1]?.count ?? 0;
  const totalConv = first === 0 ? 0 : (last / first) * 100;

  return (
    <Card pad={20}>
      <CardHead
        title="Funil de conversão"
        right={
          <span style={{ fontSize: 11, color: t.textFaint }}>
            {data?.pipelineName ?? '—'}
          </span>
        }
      />
      {loading ? (
        <CardSkeleton lines={6} />
      ) : stages.length === 0 ? (
        <EmptyHint>Sem etapas para exibir.</EmptyHint>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}>
            {stages.map((s, i) => {
              const pct = (s.count / max) * 100;
              const conv = s.conversionFromPrevious;
              return (
                <div key={s.stageId} style={{ position: 'relative' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 4,
                      fontSize: 11.5,
                    }}
                  >
                    <span style={{ color: t.textDim }}>{s.stageName}</span>
                    <span style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                      {conv !== null && (
                        <span
                          style={{
                            color: t.textFaint,
                            fontSize: 10.5,
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {conv.toFixed(0)}% ↓
                        </span>
                      )}
                      <span
                        style={{
                          color: t.text,
                          fontWeight: 500,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {s.count}
                      </span>
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <div
                      style={{
                        width: `${Math.max(pct, 1)}%`,
                        height: 26,
                        background: `linear-gradient(90deg, rgba(212,175,55,${Math.max(0.1, 0.35 - i * 0.05)}), rgba(212,175,55,${Math.max(0.2, 0.7 - i * 0.1)}))`,
                        border: `1px solid rgba(212,175,55,${Math.max(0.15, 0.5 - i * 0.08)})`,
                        borderRadius: 4,
                        transition: 'width 200ms ease',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div
            style={{
              marginTop: 14,
              paddingTop: 14,
              borderTop: `1px solid ${t.border}`,
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 11.5,
            }}
          >
            <span style={{ color: t.textSubtle }}>Conversão total</span>
            <span
              style={{
                color: t.gold,
                fontWeight: 600,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {totalConv.toFixed(1)}% · {last} de {first}
            </span>
          </div>
        </>
      )}
    </Card>
  );
}
