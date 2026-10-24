/**
 * Leitura de arquivos .ics (Google Agenda).
 * Além dos eventos simples, entende eventos que se repetem (RRULE), datas excluídas (EXDATE)
 * e ocorrências que foram movidas ou editadas (RECURRENCE-ID). Sem isso, um atendimento semanal
 * entraria só uma vez e os outros sumiriam.
 */

export interface IcsEvent {
  title: string;
  description: string;
  date: Date;
  uid: string;
  allDay: boolean;
  durationMin: number;
}

export interface IcsParseResult {
  events: IcsEvent[];
  /** Eventos repetidos com regra que não sei expandir (entram só na primeira data). */
  unsupportedRecurrences: number;
  /** Quantas ocorrências vieram de eventos que se repetem. */
  expandedFromRecurrence: number;
}

interface Prop {
  params: Record<string, string>;
  value: string;
}

interface RawEvent {
  props: Record<string, Prop[]>;
}

const DAY_MS = 86400000;
const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

function unescapeText(s: string): string {
  return s.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
}

function readEvents(text: string): RawEvent[] {
  const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const events: RawEvent[] = [];
  let cur: RawEvent | null = null;
  let alarmDepth = 0;
  for (const line of lines) {
    if (line.startsWith('BEGIN:VEVENT')) { cur = { props: {} }; alarmDepth = 0; continue; }
    if (line.startsWith('END:VEVENT')) { if (cur) events.push(cur); cur = null; continue; }
    if (!cur) continue;
    // Lembretes (VALARM) têm DESCRIPTION próprio, que não pode sobrescrever o do evento
    if (line.startsWith('BEGIN:VALARM')) { alarmDepth++; continue; }
    if (line.startsWith('END:VALARM')) { alarmDepth = Math.max(0, alarmDepth - 1); continue; }
    if (alarmDepth > 0) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const [name, ...paramParts] = line.substring(0, idx).split(';');
    const params: Record<string, string> = {};
    for (const p of paramParts) {
      const eq = p.indexOf('=');
      if (eq !== -1) params[p.substring(0, eq).toUpperCase()] = p.substring(eq + 1);
    }
    const key = name.trim().toUpperCase();
    (cur.props[key] ||= []).push({ params, value: line.substring(idx + 1).trim() });
  }
  return events;
}

/** Diferença (ms) entre o relógio de parede de um fuso e o UTC, naquele instante. */
function tzOffsetMs(utcMs: number, tz: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(utcMs));
    const g = (t: string) => Number(parts.find(p => p.type === t)?.value);
    return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - Math.floor(utcMs / 1000) * 1000;
  } catch {
    return 0;
  }
}

/** Relógio de parede num fuso → instante UTC. */
function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, s: number, tz: string): number {
  const guess = Date.UTC(y, mo, d, h, mi, s);
  let off = tzOffsetMs(guess, tz);
  let result = guess - off;
  const off2 = tzOffsetMs(result, tz);
  if (off2 !== off) { off = off2; result = guess - off; }
  return result;
}

interface Wall { y: number; m: number; d: number; h: number; mi: number; s: number; tz: string | null; utc: boolean; allDay: boolean }

function parseWall(prop: Prop): Wall | null {
  const m = prop.value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const allDay = !m[4];
  return {
    y: +m[1], m: +m[2] - 1, d: +m[3], h: +(m[4] || 0), mi: +(m[5] || 0), s: +(m[6] || 0),
    tz: prop.params.TZID || null, utc: !!m[7], allDay: allDay || prop.params.VALUE === 'DATE',
  };
}

function wallToInstant(w: Wall): number {
  if (w.utc) return Date.UTC(w.y, w.m, w.d, w.h, w.mi, w.s);
  if (w.tz) return zonedToUtc(w.y, w.m, w.d, w.h, w.mi, w.s, w.tz);
  return new Date(w.y, w.m, w.d, w.h, w.mi, w.s).getTime(); // horário "flutuante": o do computador
}

/** Uma data do calendário (ano/mês/dia) com o mesmo horário e fuso do início. */
function instantFor(start: Wall, y: number, m: number, d: number): number {
  return wallToInstant({ ...start, y, m, d });
}

function parseRule(value: string): Record<string, string> {
  const rule: Record<string, string> = {};
  for (const part of value.split(';')) {
    const [k, v] = part.split('=');
    if (k && v !== undefined) rule[k.toUpperCase()] = v;
  }
  return rule;
}

/** Gera os instantes (UTC, em ms) de um evento que se repete, até o limite informado. Devolve null se a regra não é suportada. */
function expandRule(start: Wall, rule: Record<string, string>, horizon: number): number[] | null {
  const freq = rule.FREQ;
  const interval = Math.max(1, parseInt(rule.INTERVAL || '1', 10));
  const count = rule.COUNT ? parseInt(rule.COUNT, 10) : Infinity;
  let until = horizon;
  if (rule.UNTIL) {
    const u = parseWall({ params: {}, value: rule.UNTIL });
    if (u) until = Math.min(horizon, u.utc || u.tz ? wallToInstant(u) : wallToInstant({ ...u, utc: true }) + (u.allDay ? DAY_MS - 1 : 0));
  }
  const first = wallToInstant(start);
  const out: number[] = [];
  const push = (inst: number): boolean => {
    if (inst < first) return true;
    if (inst > until || out.length >= count) return false;
    out.push(inst);
    return out.length < count;
  };
  const startDate = new Date(Date.UTC(start.y, start.m, start.d));
  const MAX_ITER = 5000;

  if (freq === 'DAILY') {
    for (let i = 0; i < MAX_ITER; i++) {
      const d = new Date(startDate.getTime() + i * interval * DAY_MS);
      if (!push(instantFor(start, d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))) break;
    }
    return out;
  }

  if (freq === 'WEEKLY') {
    const wkst = DAY_CODES.indexOf((rule.WKST || 'MO').toUpperCase());
    const byday = (rule.BYDAY ? rule.BYDAY.split(',') : [DAY_CODES[startDate.getUTCDay()]])
      .map(x => DAY_CODES.indexOf(x.replace(/^[+-]?\d+/, '').toUpperCase()))
      .filter(i => i >= 0);
    const weekStart = new Date(startDate.getTime() - ((startDate.getUTCDay() - wkst + 7) % 7) * DAY_MS);
    const order = [...byday].sort((a, b) => ((a - wkst + 7) % 7) - ((b - wkst + 7) % 7));
    for (let w = 0; w < MAX_ITER; w++) {
      const base = weekStart.getTime() + w * interval * 7 * DAY_MS;
      if (base > until + 7 * DAY_MS) break;
      for (const dow of order) {
        const d = new Date(base + ((dow - wkst + 7) % 7) * DAY_MS);
        const inst = instantFor(start, d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
        if (inst < first) continue;
        if (!push(inst)) return out;
      }
    }
    return out;
  }

  if (freq === 'MONTHLY' || freq === 'YEARLY') {
    const step = freq === 'MONTHLY' ? interval : interval * 12;
    for (let i = 0; i < MAX_ITER; i++) {
      const total = start.m + i * step;
      const y = start.y + Math.floor(total / 12);
      const m = ((total % 12) + 12) % 12;
      let day = start.d;
      if (rule.BYMONTHDAY) day = parseInt(rule.BYMONTHDAY.split(',')[0], 10);
      if (rule.BYDAY && freq === 'MONTHLY') {
        const mm = rule.BYDAY.split(',')[0].match(/^([+-]?\d+)?([A-Z]{2})$/);
        const dow = mm ? DAY_CODES.indexOf(mm[2]) : -1;
        if (!mm || dow < 0 || !mm[1]) return null;
        const nth = parseInt(mm[1], 10);
        const dim = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
        const days: number[] = [];
        for (let dd = 1; dd <= dim; dd++) if (new Date(Date.UTC(y, m, dd)).getUTCDay() === dow) days.push(dd);
        day = nth > 0 ? days[nth - 1] : days[days.length + nth];
        if (!day) continue;
      } else if (day > new Date(Date.UTC(y, m + 1, 0)).getUTCDate()) {
        continue; // ex.: dia 31 em mês de 30 dias: o Google pula
      }
      if (!push(instantFor(start, y, m, day))) break;
      if (Date.UTC(y, m, 1) > until + 31 * DAY_MS) break;
    }
    return out;
  }

  return null;
}

/**
 * Lê o texto de um .ics e devolve cada atendimento como evento separado.
 * `horizonMs`: até onde repetições sem fim são expandidas (padrão: 12 meses a partir de hoje).
 */
export function parseIcs(text: string, horizonMs: number = Date.now() + 365 * DAY_MS): IcsParseResult {
  const raw = readEvents(text);
  const cancelled = (e: RawEvent) => (e.props.STATUS?.[0]?.value || '').toUpperCase() === 'CANCELLED';
  const val = (e: RawEvent, k: string) => e.props[k]?.[0];

  const masters = raw.filter(e => !val(e, 'RECURRENCE-ID'));
  const overrides = raw.filter(e => val(e, 'RECURRENCE-ID'));

  // ocorrências substituídas por uma edição: UID + instante original
  const replaced = new Set<string>();
  for (const o of overrides) {
    const rid = val(o, 'RECURRENCE-ID');
    const w = rid && parseWall(rid);
    if (w) replaced.add(`${val(o, 'UID')?.value}|${wallToInstant(w)}`);
  }

  const events: IcsEvent[] = [];
  let unsupported = 0;
  let expanded = 0;

  const emit = (e: RawEvent, inst: number, allDay: boolean) => {
    const ds = val(e, 'DTSTART'); const de = val(e, 'DTEND');
    const w1 = ds && parseWall(ds); const w2 = de && parseWall(de);
    const dur = w1 && w2 ? Math.round((wallToInstant(w2) - wallToInstant(w1)) / 60000) : 0;
    events.push({
      durationMin: dur > 0 ? dur : 60,
      title: unescapeText(val(e, 'SUMMARY')?.value || 'Sem Título'),
      description: unescapeText(val(e, 'DESCRIPTION')?.value || ''),
      date: new Date(inst),
      uid: val(e, 'UID')?.value || '',
      allDay,
    });
  };

  for (const e of masters) {
    if (cancelled(e)) continue;
    const dtstart = val(e, 'DTSTART');
    const start = dtstart && parseWall(dtstart);
    if (!start) continue;
    const uid = val(e, 'UID')?.value || '';
    const rrule = val(e, 'RRULE');
    if (!rrule) { emit(e, wallToInstant(start), start.allDay); continue; }

    const instants = expandRule(start, parseRule(rrule.value), horizonMs);
    if (!instants) { unsupported++; emit(e, wallToInstant(start), start.allDay); continue; }

    const excluded = new Set<number>();
    for (const ex of e.props.EXDATE || []) {
      for (const piece of ex.value.split(',')) {
        const w = parseWall({ params: ex.params, value: piece.trim() });
        if (w) excluded.add(wallToInstant({ ...w, tz: w.tz || start.tz }));
      }
    }
    for (const inst of instants) {
      if (excluded.has(inst) || replaced.has(`${uid}|${inst}`)) continue;
      emit(e, inst, start.allDay);
      expanded++;
    }
  }

  // Ocorrências editadas ou movidas entram na nova data/hora
  for (const o of overrides) {
    if (cancelled(o)) continue;
    const dtstart = val(o, 'DTSTART');
    const w = dtstart && parseWall(dtstart);
    if (w) emit(o, wallToInstant(w), w.allDay);
  }

  return { events, unsupportedRecurrences: unsupported, expandedFromRecurrence: expanded };
}
