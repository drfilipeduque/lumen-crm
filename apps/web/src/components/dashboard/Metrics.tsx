import { useTheme } from '../../lib/ThemeContext';
import { Card, CardHead, CardSkeleton, EmptyHint, formatDuration } from './primitives';
import type { Metrics } from '../../hooks/useDashboard';

const NUMERIC: React.CSSProperties = {
  fontSize: 30,
  fontWeight: 600,
  letterSpacing: -0.8,
  lineHeight: 1,
  fontVariantNumeric: 'tabular-nums',
};

export function MetricTotalLeads({
  loading,
  total,
}: {
  loading: boolean;
  total: number | undefined;
}) {
  const { tokens: t } = useTheme();
  return (
    <Card>
      <CardHead title="Total de leads" />
      {loading ? (
        <CardSkeleton />
      ) : (
        <>
          <div style={{ ...NUMERIC, color: t.text }}>{(total ?? 0).toLocaleString('pt-BR')}</div>
          <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 6 }}>no período</div>
        </>
      )}
    </Card>
  );
}

export function MetricByStage({
  loading,
  data,
}: {
  loading: boolean;
  data: Metrics['leadsByStage'] | undefined;
}) {
  const { tokens: t } = useTheme();
  return (
    <Card>
      <CardHead title="Leads por etapa" />
      {loading ? (
        <CardSkeleton lines={5} />
      ) : !data || data.length === 0 ? (
        <EmptyHint>Sem leads no período.</EmptyHint>
      ) : (
        <Bars
          items={data.map((s) => ({ label: s.stageName, value: s.count }))}
          color={t.gold}
        />
      )}
    </Card>
  );
}

export function MetricAvgTime({
  loading,
  minutes,
}: {
  loading: boolean;
  minutes: number | undefined;
}) {
  const { tokens: t } = useTheme();
  const d = formatDuration(minutes ?? 0);
  return (
    <Card>
      <CardHead title="Tempo médio entre etapas" />
      {loading ? (
        <CardSkeleton />
      ) : (
        <>
          <div style={{ ...NUMERIC, color: t.text }}>
            {d.value}
            {d.unit && (
              <span style={{ fontSize: 16, fontWeight: 500, color: t.textDim, marginLeft: 4 }}>
                {d.unit}
              </span>
            )}
          </div>
          <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 6 }}>
            {minutes && minutes > 0
              ? 'Entre transições registradas'
              : 'Ainda sem transições no período'}
          </div>
        </>
      )}
    </Card>
  );
}

export function MetricByUser({
  loading,
  data,
}: {
  loading: boolean;
  data: Metrics['leadsByUser'] | undefined;
}) {
  const { tokens: t } = useTheme();
  return (
    <Card>
      <CardHead
        title="Leads por usuário"
        right={
          <span style={{ fontSize: 11, color: t.textFaint }}>
            {data ? `${data.length} ${data.length === 1 ? 'ativo' : 'ativos'}` : ''}
          </span>
        }
      />
      {loading ? (
        <CardSkeleton lines={4} />
      ) : !data || data.length === 0 ? (
        <EmptyHint>Sem leads atribuídos no período.</EmptyHint>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {data.map((u) => (
            <UserRow key={u.userId} name={u.userName} count={u.count} max={data[0]!.count} />
          ))}
        </div>
      )}
    </Card>
  );
}

export function MetricConversion({
  loading,
  rate,
}: {
  loading: boolean;
  rate: number | undefined;
}) {
  const { tokens: t } = useTheme();
  return (
    <Card>
      <CardHead title="Taxa de conversão" />
      {loading ? (
        <CardSkeleton />
      ) : (
        <>
          <div style={{ ...NUMERIC, color: t.text }}>
            {(rate ?? 0).toFixed(1)}
            <span style={{ fontSize: 18, color: t.textDim, marginLeft: 1 }}>%</span>
          </div>
          <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 6 }}>
            Fechados ganhos no período
          </div>
        </>
      )}
    </Card>
  );
}

export function MetricInactive({
  loading,
  count,
}: {
  loading: boolean;
  count: number | undefined;
}) {
  const { tokens: t } = useTheme();
  const value = count ?? 0;
  return (
    <Card>
      <CardHead
        title="Leads inativos"
        right={
          value > 0 && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 10.5,
                fontWeight: 500,
                padding: '2px 7px',
                borderRadius: 10,
                background: 'rgba(212,175,55,0.12)',
                color: t.gold,
              }}
            >
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: t.gold }} />
              Requer ação
            </span>
          )
        }
      />
      {loading ? (
        <CardSkeleton />
      ) : (
        <>
          <div style={{ ...NUMERIC, color: value > 0 ? t.text : t.textDim }}>{value}</div>
          <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 6 }}>
            Sem interação há mais de 7 dias
          </div>
        </>
      )}
    </Card>
  );
}

// ---------- Helpers visuais ----------

function Bars({ items, color }: { items: { label: string; value: number }[]; color: string }) {
  const { tokens: t } = useTheme();
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {items.map((s, i) => (
        <div key={`${s.label}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 100,
              fontSize: 11.5,
              color: t.textDim,
              flexShrink: 0,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {s.label}
          </div>
          <div
            style={{
              flex: 1,
              height: 6,
              background: t.bgHover,
              borderRadius: 3,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${(s.value / max) * 100}%`,
                height: '100%',
                background: i === 0 ? color : `rgba(212,175,55,${Math.max(0.3, 0.85 - i * 0.12)})`,
                borderRadius: 3,
              }}
            />
          </div>
          <div
            style={{
              fontSize: 11.5,
              fontWeight: 500,
              color: t.text,
              width: 32,
              textAlign: 'right',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {s.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function UserRow({ name, count, max }: { name: string; count: number; max: number }) {
  const { tokens: t } = useTheme();
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div
        style={{
          width: 24,
          height: 24,
          borderRadius: '50%',
          background: 'linear-gradient(135deg,#D4AF37,#8a6c17)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 10,
          fontWeight: 600,
          flexShrink: 0,
        }}
      >
        {initials || '··'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            color: t.text,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {name}
        </div>
        <div style={{ height: 3, background: t.bgHover, borderRadius: 2, marginTop: 4 }}>
          <div
            style={{
              width: `${(count / Math.max(max, 1)) * 100}%`,
              height: '100%',
              background: t.gold,
              borderRadius: 2,
              opacity: 0.75,
            }}
          />
        </div>
      </div>
      <div
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: t.text,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {count}
      </div>
    </div>
  );
}
