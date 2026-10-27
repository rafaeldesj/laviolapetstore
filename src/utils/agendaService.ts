import type { Appointment } from '../supabaseClient';
import { workerCall } from './workerApi';

/**
 * Agenda de Banho e Tosa / Clubinho. Os agendamentos ficam no Supabase (sem limite diário de leituras, ao contrário
 * do Firestore gratuito) e o navegador fala só com o Worker, que confere login e cargo.
 */

/** Duração (min) de cada serviço, usada ao criar ou trocar o serviço. */
export const SERVICE_DURATION_MIN: Record<string, number> = {
  'Banho & Tosa': 90,
  'Consulta Veterinária': 45,
  'Vacinação': 30,
  'Hotelzinho / Creche': 480,
};
const DEFAULT_DURATION = 60;

export type AgendaScope = 'this' | 'series';

interface AgendaRow {
  id: string;
  series_id: string | null;
  pet_id: string;
  pet_name: string;
  tutor_name: string;
  owner_id: string;
  service_type: string;
  status: string;
  start: string;
  duration_min: number;
  notes: string;
  payment_flag: 'a_confirmar' | 'debito' | null;
  clubinho_cycle_position: number | null;
  cancel_reason: 'aviso_previo' | 'sem_aviso' | null;
  created_at: string;
}

function toAppointment(r: AgendaRow): Appointment {
  return {
    id: r.id,
    pet_id: r.pet_id,
    pet_name: r.pet_name,
    owner_id: r.owner_id,
    service_type: r.service_type,
    scheduled_at: new Date(r.start).toISOString(),
    status: r.status as Appointment['status'],
    notes: r.notes || '',
    created_at: r.created_at,
    tutor_name: r.tutor_name,
    recurringEventId: r.series_id, // série semanal (vazio = atendimento avulso)
    duration_min: r.duration_min,
    payment_flag: r.payment_flag,
    clubinho_cycle_position: r.clubinho_cycle_position,
    cancel_reason: r.cancel_reason,
  };
}

/** Agendamentos de um período (os que se repetem já vêm um por dia). */
export async function listAppointments(from: Date, to: Date): Promise<Appointment[]> {
  const q = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
  const body = await workerCall<{ events: AgendaRow[] }>(`/agenda/events?${q}`);
  return body.events.map(toAppointment);
}

export interface NewAppointmentInput {
  petId?: string;
  petName: string;
  tutorName?: string;
  ownerId?: string;
  serviceType: string;
  startISO: string;
  notes?: string;
  /** Total de ocorrências, repetindo toda semana (1 ou vazio = não repete). */
  repeatCount?: number;
}

export async function createAppointment(input: NewAppointmentInput): Promise<Appointment[]> {
  const body = await workerCall<{ events: AgendaRow[] }>('/agenda/events', {
    method: 'POST',
    body: JSON.stringify({
      petId: input.petId || '',
      petName: input.petName,
      tutorName: input.tutorName || '',
      ownerId: input.ownerId || '',
      serviceType: input.serviceType,
      start: input.startISO,
      durationMin: SERVICE_DURATION_MIN[input.serviceType] ?? DEFAULT_DURATION,
      notes: input.notes || '',
      repeatCount: input.repeatCount,
    }),
  });
  return body.events.map(toAppointment);
}

export interface AppointmentPatch {
  status?: Appointment['status'];
  notes?: string;
  serviceType?: string;
  startISO?: string;
  petName?: string;
  tutorName?: string;
  /** 'a_confirmar' | 'debito' | null (null = remove a marcação). Só a equipe pode mudar isso. */
  paymentFlag?: 'a_confirmar' | 'debito' | null;
  /** Motivo do cancelamento ('aviso_previo' | 'sem_aviso'). Só a equipe pode registrar isso. */
  cancelReason?: 'aviso_previo' | 'sem_aviso' | null;
}

export async function updateAppointmentApi(id: string, patch: AppointmentPatch, scope: AgendaScope = 'this'): Promise<Appointment> {
  const data: Record<string, unknown> = {};
  if (patch.status !== undefined) data.status = patch.status;
  if (patch.notes !== undefined) data.notes = patch.notes;
  if (patch.serviceType !== undefined) {
    data.serviceType = patch.serviceType;
    data.durationMin = SERVICE_DURATION_MIN[patch.serviceType] ?? DEFAULT_DURATION;
  }
  if (patch.startISO !== undefined) data.start = patch.startISO;
  if (patch.petName !== undefined) data.petName = patch.petName;
  if (patch.tutorName !== undefined) data.tutorName = patch.tutorName;
  if (patch.paymentFlag !== undefined) data.paymentFlag = patch.paymentFlag;
  if (patch.cancelReason !== undefined) data.cancelReason = patch.cancelReason;
  const body = await workerCall<{ event: AgendaRow }>(`/agenda/events/${encodeURIComponent(id)}?scope=${scope}`, { method: 'PATCH', body: JSON.stringify(data) });
  return toAppointment(body.event);
}

export async function deleteAppointmentApi(id: string, scope: AgendaScope = 'this'): Promise<void> {
  await workerCall(`/agenda/events/${encodeURIComponent(id)}?scope=${scope}`, { method: 'DELETE' });
}

/** "TOSA Mika - Henri" → pet "Mika", tutor "Henri", prefixo "TOSA". Sem " - ", tudo é o nome do pet. */
export function splitSummary(summary: string): { pet: string; tutor: string; prefix: string } {
  const [first, ...rest] = summary.split(' - ');
  const m = /^(tosa|banho(?: e tosa)?)\s+/i.exec(first);
  const pet = first.replace(/^(tosa|banho(?: e tosa)?)\s+/i, '').trim() || summary.trim();
  return { pet, tutor: rest.join(' - ').trim(), prefix: m ? m[1].toUpperCase() : '' };
}

export function guessService(text: string): string {
  const s = text.toLowerCase();
  if (/banho|tosa/.test(s)) return 'Banho & Tosa';
  if (/consulta|veterin/.test(s)) return 'Consulta Veterinária';
  if (/vacina/.test(s)) return 'Vacinação';
  if (/hotel|creche/.test(s)) return 'Hotelzinho / Creche';
  return 'Banho & Tosa'; // a agenda da loja é a de Banho e Tosa / Clubinho
}

export interface ImportItem {
  petId?: string;
  ownerId?: string;
  petName: string;
  tutorName?: string;
  serviceType: string;
  startISO: string;
  durationMin: number;
  notes?: string;
  status: Appointment['status'];
  /** Atendimentos com a mesma chave pertencem à mesma série semanal. */
  seriesKey?: string | null;
}

/** Grava vários atendimentos de uma vez (importação de arquivo do Google Agenda). Devolve quantos entraram. */
export async function importAppointments(items: ImportItem[]): Promise<number> {
  let total = 0;
  for (let i = 0; i < items.length; i += 400) {
    const body = await workerCall<{ inserted: number }>('/agenda/import', { method: 'POST', body: JSON.stringify({ items: items.slice(i, i + 400) }) });
    total += body.inserted;
  }
  return total;
}
