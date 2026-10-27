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
  /** Quando preenchido, é informação REAL confirmada pela equipe (ex.: trazida do calendário antigo do Google)
   *  e vale mais que o cálculo por data. 'a_confirmar' | 'debito' | null. */
  payment_flag: 'a_confirmar' | 'debito' | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type ClubinhoStatus = 'em-dia' | 'a-confirmar' | 'vencido' | 'inativo';

/** Quantos dias antes da renovação já vale avisar ("a confirmar"), em vez de esperar vencer de vez. */
const REMINDER_WINDOW_DAYS = 5;

export function getClubinhoStatus(sub: Pick<ClubinhoSubscription, 'renews_at' | 'is_active' | 'payment_flag'>, today: Date = new Date()): ClubinhoStatus {
  if (!sub.is_active) return 'inativo';
  if (sub.payment_flag === 'debito') return 'vencido';
  if (sub.payment_flag === 'a_confirmar') return 'a-confirmar';
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

/** Rótulo com a contagem de dias (ex.: "Vencido há 8 dias", "A confirmar (em 3 dias)") — usado na tabela de assinaturas. */
export function describeClubinhoStatus(sub: Pick<ClubinhoSubscription, 'renews_at' | 'is_active' | 'payment_flag'>, today: Date = new Date()): string {
  const status = getClubinhoStatus(sub, today);
  if (status === 'inativo') return 'Inativo';
  if (status === 'em-dia') return 'Em dia (pago)';
  const renews = new Date(sub.renews_at + 'T00:00:00');
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.round((renews.getTime() - todayStart.getTime()) / 86400000);
  // Quando a marcação veio confirmada pela equipe (não é só o cálculo por data), deixa isso claro no rótulo.
  const tag = sub.payment_flag ? ' (confirmado)' : '';
  if (status === 'vencido') {
    if (diffDays < 0) {
      const dias = Math.abs(diffDays);
      return `Vencido${tag} há ${dias} ${dias === 1 ? 'dia' : 'dias'}`;
    }
    return `Vencido${tag}`;
  }
  if (diffDays > 0) return `A confirmar${tag} (em ${diffDays} ${diffDays === 1 ? 'dia' : 'dias'})`;
  if (diffDays === 0) return `Vence hoje${tag}`;
  return `A confirmar${tag}`;
}

export const CLUBINHO_STATUS_LABEL: Record<ClubinhoStatus, string> = {
  'em-dia': 'Em dia (pago)',
  'a-confirmar': 'A confirmar',
  vencido: 'Vencido (débito)',
  inativo: 'Inativo',
};

export const WEEKDAY_LABELS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

/**
 * "Banho X de N do ciclo atual" — pra quem opera o caixa/balcão não precisar voltar semana por semana contando.
 * N é fixo por regra do negócio (confirmado com o proprietário): semanal = sempre 4, quinzenal = sempre 2. Não
 * tem "5º banho" — ao chegar no último (4/4 ou 2/2), é o sinal de lembrar o cliente de renovar. N não depende
 * das datas de início/renovação da assinatura (essas só definem QUAL banho é o atual, não quantos existem).
 * Sem assinatura (atendimento avulso) fica sempre (1/1).
 */
const CYCLE_VISITS: Record<'semanal' | 'quinzenal', number> = { semanal: 4, quinzenal: 2 };

export function visitProgressLabel(sub: Pick<ClubinhoSubscription, 'started_at' | 'plan_type'> | null | undefined, date: Date): string {
  if (!sub) return '(1/1)';
  const intervalDays = sub.plan_type === 'quinzenal' ? 14 : 7;
  const total = CYCLE_VISITS[sub.plan_type];
  const started = new Date(sub.started_at + 'T00:00:00');
  const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((dayStart.getTime() - started.getTime()) / 86400000);
  const current = Math.min(Math.max(Math.floor(diffDays / intervalDays) + 1, 1), total);
  return `(${current}/${total})`;
}

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
  planType: string; weekday: number | null; timeOfDay: string; price: number; taxiDogFee: number; tutorName: string; startedAt: string; renewsAt: string; isActive: boolean;
  paymentFlag: 'a_confirmar' | 'debito' | null;
}>): Promise<ClubinhoSubscription> => {
  const { assinatura } = await workerCall<{ assinatura: ClubinhoSubscription }>(`/clubinho/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) });
  return assinatura;
};

export const renewClubinho = async (id: string, renewsAt: string, createAppointments = true): Promise<{ assinatura: ClubinhoSubscription; agendamentos_criados: number }> =>
  workerCall(`/clubinho/${encodeURIComponent(id)}/renovar`, { method: 'POST', body: JSON.stringify({ renewsAt, createAppointments }) });

export const cancelClubinho = async (id: string): Promise<void> => {
  await workerCall(`/clubinho/${encodeURIComponent(id)}`, { method: 'DELETE' });
};
