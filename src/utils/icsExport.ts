export interface IcsAppointment {
  id: string;
  pet_name: string;
  service_type: string;
  scheduled_at: string;
  status: string;
  notes?: string;
  tutor_name?: string;
}

const CRLF = '\r\n';

/** Texto de um campo ICS: barra, ponto e vírgula, vírgula e quebra de linha precisam de escape. */
const esc = (s: string): string =>
  s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

const utc = (d: Date): string =>
  `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}T` +
  `${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}${String(d.getUTCSeconds()).padStart(2, '0')}Z`;

/** Linhas do ICS não passam de 75 bytes; o excedente continua na linha seguinte começando com um espaço. */
function fold(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    const limit = parts.length === 0 ? 75 : 74;
    if (bytes + n > limit) {
      parts.push(cur);
      cur = '';
      bytes = 0;
    }
    cur += ch;
    bytes += n;
  }
  parts.push(cur);
  return parts.join(CRLF + ' ');
}

/** Duração do atendimento no calendário (o sistema ainda não guarda a duração). */
const DURATION_MIN: Record<string, number> = {
  'Banho & Tosa': 90,
  'Consulta Veterinária': 45,
  'Vacinação': 30,
  'Hotelzinho / Creche': 480,
};

/**
 * Monta o arquivo .ics (o mesmo formato que o Google Agenda exporta e importa).
 * O título fica "Pet - Tutor" como a agenda atual, e o serviço vai na descrição, para voltar a ser reconhecido na importação.
 */
export function buildIcs(items: IcsAppointment[], calendarName = 'La Viola Petshop'): string {
  const stamp = utc(new Date());
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//La Viola Petshop//Agenda//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(calendarName)}`,
    'X-WR-TIMEZONE:America/Sao_Paulo',
  ];

  for (const a of items) {
    const start = new Date(a.scheduled_at);
    if (isNaN(start.getTime())) continue;
    const end = new Date(start.getTime() + (DURATION_MIN[a.service_type] ?? 60) * 60000);
    const title = a.tutor_name ? `${a.pet_name} - ${a.tutor_name}` : a.pet_name;
    const desc = [
      `Serviço: ${a.service_type}`,
      a.tutor_name ? `Tutor: ${a.tutor_name}` : '',
      `Situação: ${a.status}`,
      a.notes ? `Observações: ${a.notes}` : '',
    ].filter(Boolean).join('\n');

    lines.push(
      'BEGIN:VEVENT',
      `UID:${a.id}@laviolapetstore.web.app`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${utc(start)}`,
      `DTEND:${utc(end)}`,
      `SUMMARY:${esc(title)}`,
      `DESCRIPTION:${esc(desc)}`,
      `STATUS:${a.status === 'Cancelado' ? 'CANCELLED' : 'CONFIRMED'}`,
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return lines.map(fold).join(CRLF) + CRLF;
}

export function downloadIcs(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
