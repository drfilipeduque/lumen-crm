// Helpers para o filtro de período do dashboard.
// Todas as datas são interpretadas no fuso do servidor (TZ=America/Sao_Paulo).

export type PeriodKey = 'today' | 'yesterday' | 'week' | 'month' | 'year' | 'custom';

export type DateRange = { from: Date; to: Date };

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfWeek(d: Date): Date {
  // Semana começa na segunda-feira.
  const x = startOfDay(d);
  const day = x.getDay(); // 0 = dom
  const diff = (day + 6) % 7;
  x.setDate(x.getDate() - diff);
  return x;
}

export function resolvePeriod(period: PeriodKey, from?: string, to?: string): DateRange {
  const now = new Date();
  switch (period) {
    case 'today': {
      return { from: startOfDay(now), to: now };
    }
    case 'yesterday': {
      const start = startOfDay(now);
      const y = new Date(start);
      y.setDate(y.getDate() - 1);
      return { from: y, to: start };
    }
    case 'week': {
      return { from: startOfWeek(now), to: now };
    }
    case 'month': {
      const x = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: x, to: now };
    }
    case 'year': {
      const x = new Date(now.getFullYear(), 0, 1);
      return { from: x, to: now };
    }
    case 'custom': {
      if (!from || !to) throw new Error('Período custom requer from e to');
      return { from: new Date(from), to: new Date(to) };
    }
  }
}

export function previousRange(range: DateRange): DateRange {
  const ms = range.to.getTime() - range.from.getTime();
  return {
    from: new Date(range.from.getTime() - ms),
    to: new Date(range.from.getTime()),
  };
}
