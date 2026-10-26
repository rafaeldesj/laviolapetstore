// Feriados nacionais + os do município/estado do Rio de Janeiro (onde fica a loja), pra aparecer na
// visão de Mês da agenda. Não depende de nenhuma lista externa: os fixos são hardcoded e os móveis
// (que mudam todo ano por causa da Páscoa) são calculados pelo algoritmo clássico de Gauss/Meeus.
export interface Holiday {
  date: string; // YYYY-MM-DD
  name: string;
}

function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = março, 4 = abril
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function getHolidays(year: number): Holiday[] {
  const easter = easterSunday(year);
  return [
    { date: `${year}-01-01`, name: 'Confraternização Universal' },
    { date: `${year}-01-20`, name: 'São Sebastião (feriado municipal do Rio de Janeiro)' },
    { date: fmt(addDays(easter, -48)), name: 'Carnaval' },
    { date: fmt(addDays(easter, -47)), name: 'Carnaval' },
    { date: fmt(addDays(easter, -2)), name: 'Sexta-feira Santa' },
    { date: `${year}-04-21`, name: 'Tiradentes' },
    { date: `${year}-04-23`, name: 'São Jorge (feriado estadual/municipal do Rio de Janeiro)' },
    { date: `${year}-05-01`, name: 'Dia do Trabalho' },
    { date: fmt(addDays(easter, 60)), name: 'Corpus Christi' },
    { date: `${year}-09-07`, name: 'Independência do Brasil' },
    { date: `${year}-10-12`, name: 'Nossa Senhora Aparecida' },
    { date: `${year}-11-02`, name: 'Finados' },
    { date: `${year}-11-15`, name: 'Proclamação da República' },
    { date: `${year}-11-20`, name: 'Consciência Negra' },
    { date: `${year}-12-25`, name: 'Natal' },
  ];
}

/** Mapa data (YYYY-MM-DD) -> feriado, pra consulta rápida por dia numa grade de calendário. */
export function buildHolidayMap(years: number[]): Map<string, Holiday> {
  const map = new Map<string, Holiday>();
  for (const y of Array.from(new Set(years))) {
    for (const h of getHolidays(y)) map.set(h.date, h);
  }
  return map;
}

export const toDateKey = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
