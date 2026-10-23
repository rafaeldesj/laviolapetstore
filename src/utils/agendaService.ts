import { auth } from '../firebaseClient';
import { getFiscalSettings } from './fiscal';
import type { Appointment } from '../supabaseClient';

/**
 * Agenda de Banho e Tosa / Clubinho: os agendamentos ficam no Google Agenda da loja, mas o operador nunca
 * precisa abrir o Google. Esta tela lê e grava tudo por um Worker gratuito do Cloudflare (a conta de serviço
 * do projeto tem acesso à agenda). Isso também tira os agendamentos do limite diário do Firestore.
 */

/** E-mail da conta de serviço que precisa ter acesso à agenda ("Fazer alterações em eventos"). */
export const AGENDA_SERVICE_ACCOUNT = 'agenda-laviola@laviolapetstore-e8de9.iam.gserviceaccount.com';

/** Duração (min) de cada serviço; o Google Agenda precisa de um horário de término. */
export const SERVICE_DURATION_MIN: Record<string, number> = {
  'Banho & Tosa': 90,
  'Consulta Veterinária': 45,
  'Vacinação': 30,
  'Hotelzinho / Creche': 480,
};
const DEFAULT_DURATION = 60;

export type AgendaScope = 'this' | 'series';

export class AgendaError extends Error {
  notShared: boolean;
  constructor(message: string, notShared = false) {
    super(message);
    this.notShared = notShared;
  }
}

let baseMemo: string | null = null;
async function workerBase(): Promise<string> {
  if (baseMemo) return baseMemo;
  const settings = await getFiscalSettings(); // o endereço do Worker é o mesmo configurado para a nota fiscal
  if (!settings.endpoint) throw new AgendaError('O endereço do serviço (Worker) não está configurado em Configurações > Nota Fiscal.');
  baseMemo = settings.endpoint.replace(/\/$/, '');
  return baseMemo;
}

async function call(path: string, init: RequestInit = {}): Promise<any> {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new AgendaError('Você precisa estar logado para ver a agenda.');
  const res = await fetch(`${await workerBase()}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 404 && body.mensagem === 'Erro ao ler a agenda.') {
      throw new AgendaError(`A agenda ainda não foi compartilhada com o sistema. No Google Agenda, compartilhe-a com ${AGENDA_SERVICE_ACCOUNT} (permissão "Fazer alterações em eventos").`, true);
    }
    throw new AgendaError(body.mensagem || `Erro ${res.status} ao falar com a agenda.`);
  }
  return body;
}

/** "TOSA Mika - Henri" → pet "Mika", tutor "Henri". Sem " - ", tudo é o nome do pet. */
export function splitSummary(summary: string): { pet: string; tutor: string } {
  const [first, ...rest] = summary.split(' - ');
  const pet = first.replace(/^(tosa|banho(?: e tosa)?)\s+/i, '').trim() || summary.trim();
  return { pet, tutor: rest.join(' - ').trim() };
}

function guessService(text: string): string {
  const t = text.toLowerCase();
  if (/banho|tosa/.test(t)) return 'Banho & Tosa';
  if (/consulta|veterin/.test(t)) return 'Consulta Veterinária';
  if (/vacina/.test(t)) return 'Vacinação';
  if (/hotel|creche/.test(t)) return 'Hotelzinho / Creche';
  return 'Banho & Tosa'; // a agenda da loja é a de Banho e Tosa / Clubinho
}

interface AgendaEvent {
  id: string;
  recurringEventId: string | null;
  summary: string;
  description: string;
  start: string;
  end: string;
  allDay: boolean;
  pet_id: string;
  owner_id: string;
  service_type: string;
  status: string;
  created?: string;
}

function toAppointment(e: AgendaEvent): Appointment {
  const { pet, tutor } = splitSummary(e.summary);
  const end = new Date(e.end).getTime();
  const status = (e.status as Appointment['status']) || (end < Date.now() ? 'Concluído' : 'Agendado');
  return {
    id: e.id,
    pet_id: e.pet_id,
    pet_name: pet,
    owner_id: e.owner_id,
    service_type: e.service_type || guessService(`${e.summary} ${e.description}`),
    scheduled_at: new Date(e.start).toISOString(),
    status,
    notes: e.description || '',
    created_at: e.created || '',
    tutor_name: tutor,
    recurringEventId: e.recurringEventId,
    duration_min: Math.max(5, Math.round((end - new Date(e.start).getTime()) / 60000)),
  } as Appointment;
}

/** Agendamentos de um período (repetições já vêm separadas, uma por dia). */
export async function listAppointments(from: Date, to: Date): Promise<Appointment[]> {
  const q = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
  const body = await call(`/agenda/events?${q}`);
  return (body.events as AgendaEvent[])
    .filter(e => !e.allDay) // eventos de dia inteiro (feriados etc.) não são atendimentos
    .map(toAppointment);
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

export async function createAppointment(input: NewAppointmentInput): Promise<Appointment> {
  const body = await call('/agenda/events', {
    method: 'POST',
    body: JSON.stringify({
      summary: input.tutorName ? `${input.petName} - ${input.tutorName}` : input.petName,
      description: input.notes || '',
      start: input.startISO,
      durationMin: SERVICE_DURATION_MIN[input.serviceType] ?? DEFAULT_DURATION,
      pet_id: input.petId || '',
      owner_id: input.ownerId || '',
      service_type: input.serviceType,
      status: 'Agendado',
      repeatCount: input.repeatCount,
    }),
  });
  return toAppointment(body.event);
}

export interface AppointmentPatch {
  status?: Appointment['status'];
  notes?: string;
  serviceType?: string;
  startISO?: string;
  petName?: string;
  tutorName?: string;
}

export async function updateAppointmentApi(id: string, patch: AppointmentPatch, scope: AgendaScope = 'this'): Promise<Appointment> {
  const data: Record<string, unknown> = {};
  if (patch.status !== undefined) data.status = patch.status;
  if (patch.notes !== undefined) data.description = patch.notes;
  if (patch.serviceType !== undefined) {
    data.service_type = patch.serviceType;
    data.durationMin = SERVICE_DURATION_MIN[patch.serviceType] ?? DEFAULT_DURATION;
  }
  if (patch.startISO !== undefined) {
    data.start = patch.startISO;
    data.durationMin = data.durationMin ?? DEFAULT_DURATION;
  }
  if (patch.petName !== undefined) data.summary = patch.tutorName ? `${patch.petName} - ${patch.tutorName}` : patch.petName;
  const body = await call(`/agenda/events/${encodeURIComponent(id)}?scope=${scope}`, { method: 'PATCH', body: JSON.stringify(data) });
  return toAppointment(body.event);
}

export async function deleteAppointmentApi(id: string, scope: AgendaScope = 'this'): Promise<void> {
  await call(`/agenda/events/${encodeURIComponent(id)}?scope=${scope}`, { method: 'DELETE' });
}
