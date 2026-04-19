import { useTheme } from '../../lib/ThemeContext';
import { Card, CardHead, CardSkeleton, EmptyHint } from './primitives';
import type { TagDistribution } from '../../hooks/useDashboard';

export function TagDonut({
  loading,
  data,
}: {
  loading: boolean;
  data: TagDistribution | undefined;
}) {
  const { tokens: t } = useTheme();
  const tags = data ?? [];
  const total = tags.reduce((a, b) => a + b.count, 0);

  const cx = 90;
  const cy = 90;
  const r = 72;
  const inner = 46;
  let acc = -Math.PI / 2;

  const arcs = tags.map((tag) => {
    const ang = total === 0 ? 0 : (tag.count / total) * Math.PI * 2;
    const a0 = acc;
    const a1 = acc + ang;
    acc = a1;
    const large = ang > Math.PI ? 1 : 0;
    const x0 = cx + r * Math.cos(a0);
    const y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    const xi0 = cx + inner * Math.cos(a0);
    const yi0 = cy + inner * Math.sin(a0);
    const xi1 = cx + inner * Math.cos(a1);
    const yi1 = cy + inner * Math.sin(a1);
    const d = `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} L ${xi1} ${yi1} A ${inner} ${inner} 0 ${large} 0 ${xi0} ${yi0} Z`;
    return { d, color: tag.color, name: tag.tagName, count: tag.count };
  });

  return (
    <Card pad={20}>
      <CardHead
        title="Distribuição por tags"
        right={
          <span style={{ fontSize: 11, color: t.textFaint }}>
            {tags.length} {tags.length === 1 ? 'tag' : 'tags'}
          </span>
        }
      />
      {loading ? (
        <CardSkeleton lines={5} />
      ) : tags.length === 0 ? (
        <EmptyHint>Nenhum lead com tag no período.</EmptyHint>
      ) : (
        <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <svg width={180} height={180}>
              {arcs.map((a, i) => (
                <path key={i} d={a.d} fill={a.color} />
              ))}
            </svg>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
              }}
            >
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 600,
                  color: t.text,
                  letterSpacing: -0.6,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {total}
              </div>
              <div style={{ fontSize: 10.5, color: t.textFaint, marginTop: 2 }}>leads</div>
            </div>
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 9 }}>
            {tags.map((tag) => (
              <div key={tag.tagId} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    background: tag.color,
                    flexShrink: 0,
                  }}
                />
                <span style={{ flex: 1, fontSize: 12.5, color: t.text }}>{tag.tagName}</span>
                <span
                  style={{
                    fontSize: 11.5,
                    color: t.textSubtle,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {total === 0 ? '0' : Math.round((tag.count / total) * 100)}%
                </span>
                <span
                  style={{
                    fontSize: 11.5,
                    fontWeight: 500,
                    color: t.text,
                    width: 34,
                    textAlign: 'right',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {tag.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
