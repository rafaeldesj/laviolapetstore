import { workerCall } from './workerApi';

export interface ClubinhoSubscription {
  id: string;
  pet_id: string;
  pet_name: string;
  tutor_name: string;
  plan_type: 'semanal' | 'quinzenal';
  weekday: number | null; // 0=domingo .. 6=sábado
  time_of_day: string; // 'HH:MM'
  price: number;
  taxi_dog_fee: number;
  started_at: string; // YYYY-MM-DD
  renews_at: string; // YYYY-MM-DD
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type ClubinhoStatus = 'em-dia' | 'a-confirmar' | 'vencido' | 'inativo';

/** Quantos dias antes da renovação já vale avisar ("a confirmar"), em vez de esperar vencer de vez. */
const REMINDER_WINDOW_DAYS = 5;

export function getClubinhoStatus(sub: Pick<ClubinhoSubscription, 'renews_at' | 'is_active'>, today: Date = new Date()): ClubinhoStatus {
  if (!sub.is_active) return 'inativo';
  const renews = new Date(sub.renews_at + 'T00:00:00');
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.round((renews.getTime() - todayStart.getTime()) / 86400000);
  if (diffDays < 0) return 'vencido';
  if (diffDays <= REMINDER_WINDOW_DAYS) return 'a-confirmar';
  return 'em-dia';
}

// Cores conforme a convenção que o próprio proprietário já usava: laranja = pago/em dia, roxo = débito/vencido,
// azul = a confirmar. Mantemos essa convenção dele, mesmo não sendo o padrão "verde = bom, vermelho = ruim".
export const CLUBINHO_STATUS_COLOR: Record<ClubinhoStatus, string> = {
  'em-dia': 'hsl(36, 95%, 45%)',
  'a-confirmar': 'hsl(210, 85%, 50%)',
  vencido: 'hsl(280, 65%, 50%)',
  inativo: '#9aa0a6',
};

export const CLUBINHO_STATUS_LABEL: Record<ClubinhoStatus, string> = {
  'em-dia': 'Em dia (pago)',
  'a-confirmar': 'A confirmar',
  vencido: 'Vencido (débito)',
  inativo: 'Inativo',
};

export const WEEKDAY_LABELS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export const listClubinho = async (): Promise<ClubinhoSubscription[]> => {
  const { assinaturas } = await workerCall<{ assinaturas: ClubinhoSubscription[] }>('/clubinho');
  return assinaturas;
};

export interface NewClubinhoInput {
  petId: string;
  petName: string;
  tutorName: string;
  planType: 'semanal' | 'quinzenal';
  weekday: number | null;
  timeOfDay: string;
  price: number;
  taxiDogFee: number;
  startedAt: string;
  renewsAt: string;
}

export const createClubinho = async (input: NewClubinhoInput): Promise<ClubinhoSubscription> => {
  const { assinatura } = await workerCall<{ assinatura: ClubinhoSubscription }>('/clubinho', { method: 'POST', body: JSON.stringify(input) });
  return assinatura;
};

export const updateClubinho = async (id: string, patch: Partial<{
  planType: string; weekday: number | null; timeOfDay: string; price: number; taxiDogFee: number; tutorName: string; renewsAt: string; isActive: boolean;
}>): Promise<ClubinhoSubscription> => {
  const { assinatura } = await workerCall<{ assinatura: ClubinhoSubscription }>(`/clubinho/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) });
  return assinatura;
};

export const renewClubinho = async (id: string, renewsAt: string, createAppointments = true): Promise<{ assinatura: ClubinhoSubscription; agendamentos_criados: number }> =>
  workerCall(`/clubinho/${encodeURIComponent(id)}/renovar`, { method: 'POST', body: JSON.stringify({ renewsAt, createAppointments }) });

export const cancelClubinho = async (id: string): Promise<void> => {
  await workerCall(`/clubinho/${encodeURIComponent(id)}`, { method: 'DELETE' });
};
