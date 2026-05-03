// Helper de horário comercial.
// businessHoursStart/End são "HH:MM" (TZ America/Sao_Paulo).
// businessDays é array com DOW (0=Dom, 6=Sáb) — ex: [1,2,3,4,5] (seg-sex).
// Process.env.TZ=America/Sao_Paulo é setado no boot (env.ts), então
// getDay/getHours já retornam horário de Brasília.

function parseHM(s: string): { h: number; m: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s ?? '');
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return { h, m: min };
}

export function isWithinBusinessHours(
  d: Date,
  start: string,
  end: string,
  days: number[],
): boolean {
  const s = parseHM(start);
  const e = parseHM(end);
  if (!s || !e) return true; // config inválida → não bloqueia
  const dow = d.getDay();
  if (!days.includes(dow)) return false;
  const cur = d.getHours() * 60 + d.getMinutes();
  const startMin = s.h * 60 + s.m;
  const endMin = e.h * 60 + e.m;
  return cur >= startMin && cur < endMin;
}

// Próximo instante válido pra disparar — se `d` já está dentro da janela,
// retorna `d`. Senão avança até o próximo `start` em um businessDay.
export function computeNextValidExecution(
  d: Date,
  start: string,
  end: string,
  days: number[],
): Date {
  if (days.length === 0) return d; // config sem dias = sempre permitido
  if (isWithinBusinessHours(d, start, end, days)) return d;

  const s = parseHM(start);
  if (!s) return d;

  // Tenta hoje no horário de início; se já passou ou hoje não é businessDay,
  // avança dia a dia até bater.
  const candidate = new Date(d);
  candidate.setHours(s.h, s.m, 0, 0);
  if (candidate.getTime() <= d.getTime() || !days.includes(candidate.getDay())) {
    do {
      candidate.setDate(candidate.getDate() + 1);
      candidate.setHours(s.h, s.m, 0, 0);
    } while (!days.includes(candidate.getDay()));
  }
  return candidate;
}
