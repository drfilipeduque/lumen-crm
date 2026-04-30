// Helper de horário comercial.
// businessHoursStart/End são "HH:MM" (TZ America/Sao_Paulo).
// businessDays é array com DOW (0=Dom, 6=Sáb) — ex: [1,2,3,4,5] (seg-sex).

const BRT_OFFSET_MIN = -180; // BRT = UTC-3 (sem horário de verão atual)

function parseHM(s: string): { h: number; m: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s ?? '');
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return { h, m: min };
}

function toBRT(d: Date): Date {
  // d (UTC) → mesma instante representada como Date "fake" cujos getters em
  // UTC valem como BRT. É só pra cálculos de hora/dow — voltamos pra UTC no
  // retorno calculando diff e somando.
  return new Date(d.getTime() + BRT_OFFSET_MIN * 60_000);
}

function fromBRT(localDate: Date): Date {
  return new Date(localDate.getTime() - BRT_OFFSET_MIN * 60_000);
}

// Retorna true se `d` (UTC) está dentro do horário comercial em BRT.
export function isWithinBusinessHours(
  d: Date,
  start: string,
  end: string,
  days: number[],
): boolean {
  const s = parseHM(start);
  const e = parseHM(end);
  if (!s || !e) return true; // config inválida → não bloqueia
  const local = toBRT(d);
  const dow = local.getUTCDay();
  if (!days.includes(dow)) return false;
  const hour = local.getUTCHours();
  const min = local.getUTCMinutes();
  const cur = hour * 60 + min;
  const startMin = s.h * 60 + s.m;
  const endMin = e.h * 60 + e.m;
  return cur >= startMin && cur < endMin;
}

// Próximo instante (UTC) válido pra disparar — se `d` já está dentro da janela,
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

  // Avança em BRT até achar o próximo businessDay e zera no horário inicial.
  const local = toBRT(d);
  // Tenta hoje primeiro — se estivermos antes do start de hoje e hoje for um businessDay.
  let candidate = new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), s.h, s.m, 0, 0),
  );
  if (
    candidate.getTime() <= local.getTime() ||
    !days.includes(candidate.getUTCDay())
  ) {
    // Avança dia a dia até bater
    do {
      candidate = new Date(candidate.getTime() + 86_400_000);
      candidate.setUTCHours(s.h, s.m, 0, 0);
    } while (!days.includes(candidate.getUTCDay()));
  }
  return fromBRT(candidate);
}
