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
  /** Quando preenchido, é informação REAL confirmada pela equipe (ex.: trazida do calendário antigo do Google,
   *  ou um pagamento registrado à mão) e vale mais que o cálculo por data.
   *  'a_confirmar' | 'debito' | 'pago' | 'inadimplente' | null. */
  payment_flag: 'a_confirmar' | 'debito' | 'pago' | 'inadimplente' | null;
  /** Último pagamento registrado (detalhes de data/hora/forma/quem recebeu) — vem junto na listagem, não precisa buscar à parte. */
  last_payment?: ClubinhoPayment | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ClubinhoPayment {
  id: string;
  subscription_id: string;
  paid_date: string; // YYYY-MM-DD
  paid_time: string; // HH:MM
  payment_method: 'pix' | 'debito' | 'credito' | 'especie';
  received_by: string;
  created_by: string;
  created_at: string;
}

export const PAYMENT_METHOD_LABELS: Record<ClubinhoPayment['payment_method'], string> = {
  pix: 'Pix',
  debito: 'Débito',
  credito: 'Crédito',
  especie: 'Espécie',
};

export type ClubinhoStatus = 'em-dia' | 'a-confirmar' | 'vencido' | 'pago' | 'inadimplente' | 'inativo';

/** Remove acentos, baixa pra minúsculo e tira espaços nas pontas — pra comparar nomes sem depender de digitação idêntica. */
export function normalizeNameForMatch(s: string): string {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function levenshteinDistance(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

/**
 * Dois nomes de tutor "são a mesma pessoa" pra fins de cruzamento com o Clubinho? Tolera variação de acento/grafia
 * (ex.: "Teresinha"/"Terezinha", "Vânia"/"Vania", "Bruna"/"Bruna (Apolo)") mas rejeita nomes claramente diferentes
 * (ex.: "Adriana" vs "Viviane") — importante porque vários pets diferentes usam o mesmo nome (ex.: dois "Pingo",
 * dois "Zoe"), e misturar o histórico de um com a assinatura do outro bagunça a contagem de banhos.
 */
export function tutorNamesMatch(a: string, b: string): boolean {
  const na = normalizeNameForMatch(a);
  const nb = normalizeNameForMatch(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const maxDist = Math.min(na.length, nb.length) >= 7 ? 2 : 1;
  return levenshteinDistance(na, nb) <= maxDist;
}

/** Quantos dias antes da renovação já vale avisar ("a confirmar"), em vez de esperar vencer de vez — "falta uma semana". */
const REMINDER_WINDOW_DAYS = 7;

/**
 * Azul ("a confirmar") não é mais só "falta pouco pra vencer": a proprietária pediu que só vire azul quem
 * já teve um pagamento CONFIRMADO de verdade (via "Marcar: Pagamento realizado", com data/hora/forma/quem
 * recebeu) alguma vez — não basta o cálculo automático por data achar que "deve estar em dia". Quem nunca teve
 * um pagamento confirmado permanece laranja até vencer de vez (ou até a equipe marcar manualmente).
 */
export function getClubinhoStatus(sub: Pick<ClubinhoSubscription, 'renews_at' | 'is_active' | 'payment_flag' | 'last_payment'>, today: Date = new Date()): ClubinhoStatus {
  if (!sub.is_active) return 'inativo';
  if (sub.payment_flag === 'pago') return 'pago';
  if (sub.payment_flag === 'inadimplente') return 'inadimplente';
  if (sub.payment_flag === 'debito') return 'vencido';
  if (sub.payment_flag === 'a_confirmar') return 'a-confirmar';
  const renews = new Date(sub.renews_at + 'T00:00:00');
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.round((renews.getTime() - todayStart.getTime()) / 86400000);
  if (diffDays < 0) return 'vencido';
  if (diffDays <= REMINDER_WINDOW_DAYS && sub.last_payment) return 'a-confirmar';
  return 'em-dia';
}

// Cores conforme a convenção que o próprio proprietário já usava: laranja = pago/em dia, roxo = débito/vencido,
// azul = a confirmar. Mantemos essa convenção dele, mesmo não sendo o padrão "verde = bom, vermelho = ruim".
export const CLUBINHO_STATUS_COLOR: Record<ClubinhoStatus, string> = {
  'em-dia': 'hsl(36, 95%, 45%)',
  'a-confirmar': 'hsl(210, 85%, 50%)',
  vencido: 'hsl(280, 65%, 50%)',
  pago: 'hsl(142, 60%, 40%)',
  inadimplente: 'hsl(0, 75%, 50%)',
  inativo: '#9aa0a6',
};

/** Bolinha colorida em texto (emoji), pra usar dentro de <option> — essas tags não aceitam elementos/estilo, só texto. */
export const CLUBINHO_STATUS_DOT: Record<ClubinhoStatus, string> = {
  'em-dia': '🟠',
  'a-confirmar': '🔵',
  vencido: '🟣',
  pago: '🟢',
  inadimplente: '🔴',
  inativo: '⚪',
};

/** Texto explicativo de cada cor — usado como `title` (tooltip) na legenda da Agenda e das Assinaturas. */
export const CLUBINHO_STATUS_TOOLTIP: Record<ClubinhoStatus, string> = {
  'em-dia': 'Dentro do prazo normal, sem pendência.',
  'a-confirmar': 'Falta cerca de uma semana pra renovar e o último pagamento já foi confirmado pela equipe — hora de lembrar o cliente.',
  vencido: 'Passou da data de renovação, ou a equipe marcou como débito.',
  pago: 'Pagamento confirmado pela equipe, com data, hora, forma de pagamento e quem recebeu.',
  inadimplente: 'Cliente não responde após várias tentativas de contato, ou já avisou que não vai renovar.',
  inativo: 'Assinatura cancelada.',
};

/** Rótulo com a contagem de dias (ex.: "Vencido há 8 dias", "A confirmar (em 3 dias)") — usado na tabela de assinaturas. */
export function describeClubinhoStatus(sub: Pick<ClubinhoSubscription, 'renews_at' | 'is_active' | 'payment_flag' | 'last_payment'>, today: Date = new Date()): string {
  const status = getClubinhoStatus(sub, today);
  if (status === 'inativo') return 'Inativo';
  if (status === 'pago') return 'Pagamento confirmado';
  if (status === 'inadimplente') return 'Inadimplente (Suspenso)';
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
  pago: 'Pagamento realizado',
  inadimplente: 'Inadimplente (Suspenso)',
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

/**
 * `lockedPosition`: quando o atendimento já foi reagendado uma vez (tutor avisou com antecedência), o Worker
 * trava o número de antes de mover a data — aqui só exibimos esse valor travado em vez de recalcular pela nova
 * data, senão o reagendamento faria o número "pular" de novo (o mesmo problema que motivou a trava).
 */
export function visitProgressLabel(sub: Pick<ClubinhoSubscription, 'started_at' | 'plan_type'> | null | undefined, date: Date, lockedPosition?: number | null): string {
  if (!sub) return '(1/1)';
  const total = CYCLE_VISITS[sub.plan_type];
  if (lockedPosition != null) return `(${lockedPosition}/${total})`;
  const intervalDays = sub.plan_type === 'quinzenal' ? 14 : 7;
  const cycleLen = intervalDays * total;
  const started = new Date(sub.started_at + 'T00:00:00');
  const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((dayStart.getTime() - started.getTime()) / 86400000);
  // Ciclo se repete infinitamente pra frente E pra trás a partir da data de início: datas antigas (de antes
  // do cadastro da assinatura, recuperadas da agenda histórica) também precisam cair na posição certa do
  // ciclo, não travar em 1 só porque são anteriores ao "started_at" registrado hoje.
  let mod = diffDays % cycleLen;
  if (mod < 0) mod += cycleLen;
  const current = Math.floor(mod / intervalDays) + 1;
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
  paymentFlag: 'a_confirmar' | 'debito' | 'pago' | 'inadimplente' | null;
}>): Promise<ClubinhoSubscription> => {
  const { assinatura } = await workerCall<{ assinatura: ClubinhoSubscription }>(`/clubinho/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) });
  return assinatura;
};

export const renewClubinho = async (id: string, renewsAt: string, createAppointments = true): Promise<{ assinatura: ClubinhoSubscription; agendamentos_criados: number }> =>
  workerCall(`/clubinho/${encodeURIComponent(id)}/renovar`, { method: 'POST', body: JSON.stringify({ renewsAt, createAppointments }) });

export interface NewClubinhoPaymentInput {
  paidDate: string; // YYYY-MM-DD
  paidTime: string; // HH:MM
  paymentMethod: 'pix' | 'debito' | 'credito' | 'especie';
  receivedBy: string;
}

/** Registra um pagamento (data/hora/forma/quem recebeu) e marca a assinatura como "Pagamento realizado". */
export const registerClubinhoPayment = async (id: string, input: NewClubinhoPaymentInput): Promise<{ assinatura: ClubinhoSubscription; pagamento: ClubinhoPayment }> =>
  workerCall(`/clubinho/${encodeURIComponent(id)}/pagamento`, { method: 'POST', body: JSON.stringify(input) });

export const cancelClubinho = async (id: string): Promise<void> => {
  await workerCall(`/clubinho/${encodeURIComponent(id)}`, { method: 'DELETE' });
};
