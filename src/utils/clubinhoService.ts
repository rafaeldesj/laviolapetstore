import { workerCall } from './workerApi';

export interface ClubinhoSubscription {
  id: string;
  pet_id: string;
  pet_name: string;
  tutor_name: string;
  /** 'avulso' = atendimento único, sem lógica de renovação (ex.: cliente de passagem cujo status a equipe quer acompanhar). */
  plan_type: 'semanal' | 'quinzenal' | 'avulso';
  weekday: number | null; // 0=domingo .. 6=sábado
  time_of_day: string; // 'HH:MM'
  price: number;
  taxi_dog_fee: number;
  started_at: string; // YYYY-MM-DD
  /** Quando o ciclo ATUAL foi montado/confirmado de verdade — distinto de `renews_at` (a PRÓXIMA renovação). */
  last_renewed_at?: string | null; // YYYY-MM-DD
  renews_at: string; // YYYY-MM-DD
  is_active: boolean;
  /** Marcação feita pela equipe — não há mais cálculo automático por data, toda assinatura ativa precisa de uma
   *  marcação explícita. 'a_confirmar' | 'debito' | 'pago' | 'inadimplente' | 'congelada' | null (null = ainda
   *  não marcada, ex.: assinatura recém-criada). */
  payment_flag: 'a_confirmar' | 'debito' | 'pago' | 'inadimplente' | 'congelada' | null;
  /** Código do lote de agendamentos do próximo ciclo quando o motor automático (ou o Renovar) já montou a
   *  agenda à frente do ciclo atual — null quando não há nada montado além do ciclo corrente. Uso interno do
   *  motor automático (src/utils/clubinhoService.ts `evaluateClubinhoAutoSchedule` no Worker); a tela não precisa
   *  exibir isso, só repassar. */
  current_cycle_series_id?: string | null;
  /** Posição real (1..N) da visita mais relevante (a próxima futura, ou a última já passada) lida diretamente do
   *  agendamento correspondente — não é um cálculo por data. null quando não há nenhum agendamento com a posição
   *  gravada (ex.: assinatura ainda não montada por este mecanismo). Veio junto na listagem (GET /clubinho). */
  real_cycle_position?: number | null;
  /** Último pagamento registrado (detalhes de data/hora/forma/quem recebeu) — vem junto na listagem, não precisa buscar à parte. */
  last_payment?: ClubinhoPayment | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

/**
 * O que o motor automático do Clubinho fez sozinho numa assinatura (2026-10-29, decisão da proprietária/Paloma):
 * monta o próximo ciclo quando a marcação é pago/débito e a renovação já venceu; desmonta (apaga) um ciclo
 * futuro que já tivesse sido montado se a marcação deixar de ser pago/débito antes dele acontecer. A tela usa
 * isso só pra registrar no histórico de auditoria — a cor/datas já vêm atualizadas na própria `assinatura`.
 */
export interface ClubinhoAutoAction {
  tipo: 'montado' | 'aguardando_confirmacao' | 'desmontado';
  assinatura_id?: string;
  pet_name?: string;
  assinatura: ClubinhoSubscription;
  agendamentos_criados?: number;
  agendamentos_removidos?: Array<{ pet_name: string; tutor_name: string; starts_at: string }>;
}

export interface ClubinhoPayment {
  id: string;
  subscription_id: string;
  paid_date: string; // YYYY-MM-DD
  paid_time: string; // HH:MM
  payment_method: 'pix' | 'debito' | 'credito' | 'especie';
  received_by: string;
  /** A qual ciclo esse pagamento se refere (mesmo valor de `last_renewed_at` daquele ciclo) — null em pagamentos
   *  registrados antes dessa amarração existir. */
  cycle_renewal_date?: string | null;
  created_by: string;
  created_at: string;
}

export const PAYMENT_METHOD_LABELS: Record<ClubinhoPayment['payment_method'], string> = {
  pix: 'Pix',
  debito: 'Débito',
  credito: 'Crédito',
  especie: 'Espécie',
};

export type ClubinhoStatus = 'sem-marcacao' | 'a-confirmar' | 'vencido' | 'pago' | 'inadimplente' | 'congelada' | 'inativo';

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

/**
 * Não existe mais cálculo automático por data (decisão da proprietária/Paloma, 2026-10-28: a equipe confia mais
 * na própria avaliação de cada cliente do que numa conta por data). Toda assinatura ativa precisa de uma
 * marcação explícita da equipe; sem marcação, mostra "sem-marcacao" (neutro) até alguém decidir.
 */
export function getClubinhoStatus(sub: Pick<ClubinhoSubscription, 'is_active' | 'payment_flag'>): ClubinhoStatus {
  if (!sub.is_active) return 'inativo';
  if (sub.payment_flag === 'pago') return 'pago';
  if (sub.payment_flag === 'inadimplente') return 'inadimplente';
  if (sub.payment_flag === 'congelada') return 'congelada';
  if (sub.payment_flag === 'debito') return 'vencido';
  if (sub.payment_flag === 'a_confirmar') return 'a-confirmar';
  return 'sem-marcacao';
}

// Cores conforme a convenção que o próprio proprietário já usava: roxo = débito/vencido, azul = a confirmar,
// verde = pago. Mantemos essa convenção dele, mesmo não sendo o padrão "verde = bom, vermelho = ruim".
export const CLUBINHO_STATUS_COLOR: Record<ClubinhoStatus, string> = {
  'sem-marcacao': '#c3c7cf',
  'a-confirmar': 'hsl(210, 85%, 50%)',
  vencido: 'hsl(280, 65%, 50%)',
  pago: 'hsl(142, 60%, 40%)',
  inadimplente: 'hsl(0, 75%, 50%)',
  congelada: 'hsl(200, 70%, 60%)',
  inativo: '#9aa0a6',
};

/**
 * Pra "congelada", mostra um ❄️ no lugar da bolinha colorida (ideia da Paloma): não é nem "bom" nem "ruim", é
 * uma assinatura pausada — o ciclo pago terminou e o cliente não avisou se quer renovar ou não, sem dever nada.
 */
export const CLUBINHO_STATUS_ICON: Partial<Record<ClubinhoStatus, string>> = {
  congelada: '❄️',
};

/** Bolinha/ícone em texto (emoji), pra usar dentro de <option> — essas tags não aceitam elementos/estilo, só texto. */
export const CLUBINHO_STATUS_DOT: Record<ClubinhoStatus, string> = {
  'sem-marcacao': '⚪',
  'a-confirmar': '🔵',
  vencido: '🟣',
  pago: '🟢',
  inadimplente: '🔴',
  congelada: '❄️',
  inativo: '⚫',
};

/** Texto explicativo de cada status — usado como `title` (tooltip) na legenda da Agenda e das Assinaturas. */
export const CLUBINHO_STATUS_TOOLTIP: Record<ClubinhoStatus, string> = {
  'sem-marcacao': 'A equipe ainda não marcou a situação dessa assinatura.',
  'a-confirmar': 'A equipe marcou como "a confirmar" — fica de olho, renovação por vir.',
  vencido: 'A equipe marcou como vencido/débito — está devendo.',
  pago: 'Pagamento confirmado pela equipe, com data, hora, forma de pagamento e quem recebeu.',
  inadimplente: 'Cliente não responde após várias tentativas de contato, ou já avisou que não vai renovar.',
  congelada: 'Cliente completou o ciclo pago e não renovou, sem avisar — não deve nada, só decidiu (ou ainda não decidiu) não continuar.',
  inativo: 'Assinatura cancelada.',
};

/** Rótulo com a contagem de dias (ex.: "Vencido há 8 dias", "A confirmar (em 3 dias)") — usado na tabela de assinaturas. */
export function describeClubinhoStatus(sub: Pick<ClubinhoSubscription, 'renews_at' | 'is_active' | 'payment_flag'>, today: Date = new Date()): string {
  const status = getClubinhoStatus(sub);
  if (status === 'inativo') return 'Inativo';
  if (status === 'pago') return 'Pagamento confirmado';
  if (status === 'inadimplente') return 'Inadimplente (Suspenso)';
  if (status === 'congelada') return 'Congelada';
  if (status === 'sem-marcacao') return 'Sem marcação';
  const renews = new Date(sub.renews_at + 'T00:00:00');
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.round((renews.getTime() - todayStart.getTime()) / 86400000);
  // Chegou aqui só por marcação manual da equipe (não existe mais cálculo automático).
  if (status === 'vencido') {
    if (diffDays < 0) {
      const dias = Math.abs(diffDays);
      return `Vencido há ${dias} ${dias === 1 ? 'dia' : 'dias'}`;
    }
    return 'Vencido';
  }
  if (diffDays > 0) return `A confirmar (em ${diffDays} ${diffDays === 1 ? 'dia' : 'dias'})`;
  if (diffDays === 0) return 'Vence hoje';
  return 'A confirmar';
}

export const CLUBINHO_STATUS_LABEL: Record<ClubinhoStatus, string> = {
  'sem-marcacao': 'Sem marcação',
  'a-confirmar': 'A confirmar',
  vencido: 'Vencido (débito)',
  pago: 'Pagamento realizado',
  inadimplente: 'Inadimplente (Suspenso)',
  congelada: 'Congelada',
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
 * `lockedPosition`: quando o agendamento já tem a posição real gravada (pelo motor automático/Renovar ao criar,
 * ou pela trava de reagendamento), usamos esse valor direto em vez de calcular — é informação real da agenda,
 * não uma conta teórica.
 *
 * Sem isso, cai no cálculo por data — usado só como reserva (ex.: assinaturas/agendamentos antigos, de antes
 * desse mecanismo). Esse cálculo usa `last_renewed_at` (a ÚLTIMA renovação real) como âncora do ciclo, não
 * `started_at`: o início da assinatura pode ser muito antigo (meses), o que afasta demais a conta da realidade
 * — `last_renewed_at` fica sempre próximo do ciclo que está rodando agora (decisão do usuário, 2026-10-31,
 * depois de ver o "(X/N)" ficar fora de sincronia usando `started_at` como base).
 */
export function visitProgressLabel(sub: Pick<ClubinhoSubscription, 'started_at' | 'last_renewed_at' | 'plan_type'> | null | undefined, date: Date, lockedPosition?: number | null): string {
  if (!sub || sub.plan_type === 'avulso') return '(1/1)';
  const total = CYCLE_VISITS[sub.plan_type];
  if (lockedPosition != null) return `(${lockedPosition}/${total})`;
  const intervalDays = sub.plan_type === 'quinzenal' ? 14 : 7;
  const cycleLen = intervalDays * total;
  const anchor = new Date((sub.last_renewed_at || sub.started_at) + 'T00:00:00');
  const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((dayStart.getTime() - anchor.getTime()) / 86400000);
  // Ciclo se repete infinitamente pra frente E pra trás a partir da âncora: datas antigas (de antes da última
  // renovação) também precisam cair na posição certa do ciclo, não travar em 1 só por serem anteriores a ela.
  let mod = diffDays % cycleLen;
  if (mod < 0) mod += cycleLen;
  const current = Math.floor(mod / intervalDays) + 1;
  return `(${current}/${total})`;
}

export const listClubinho = async (): Promise<ClubinhoSubscription[]> => {
  const { assinaturas } = await workerCall<{ assinaturas: ClubinhoSubscription[] }>('/clubinho');
  return assinaturas;
};

/** Igual a `listClubinho`, mas também devolve o que o motor automático fez sozinho nessa chamada (pra a tela
 *  de gestão registrar no histórico de auditoria) — uso exclusivo do ClubinhoManager, que é quem a equipe abre. */
export const listClubinhoWithAutoActions = async (): Promise<{ assinaturas: ClubinhoSubscription[]; autoAcoes: ClubinhoAutoAction[] }> => {
  const { assinaturas, auto_acoes } = await workerCall<{ assinaturas: ClubinhoSubscription[]; auto_acoes?: ClubinhoAutoAction[] }>('/clubinho');
  return { assinaturas, autoAcoes: auto_acoes || [] };
};

export interface NewClubinhoInput {
  petId: string;
  petName: string;
  tutorName: string;
  planType: 'semanal' | 'quinzenal' | 'avulso';
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
  paymentFlag: 'a_confirmar' | 'debito' | 'pago' | 'inadimplente' | 'congelada' | null;
}>): Promise<{ assinatura: ClubinhoSubscription; autoAcao: ClubinhoAutoAction | null }> => {
  const { assinatura, auto_acao } = await workerCall<{ assinatura: ClubinhoSubscription; auto_acao?: ClubinhoAutoAction | null }>(`/clubinho/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) });
  return { assinatura, autoAcao: auto_acao || null };
};

export const renewClubinho = async (id: string, renewsAt: string, createAppointments = true): Promise<{ assinatura: ClubinhoSubscription; agendamentos_criados: number }> =>
  workerCall(`/clubinho/${encodeURIComponent(id)}/renovar`, { method: 'POST', body: JSON.stringify({ renewsAt, createAppointments }) });

export interface NewClubinhoPaymentInput {
  paidDate: string; // YYYY-MM-DD
  paidTime: string; // HH:MM
  paymentMethod: 'pix' | 'debito' | 'credito' | 'especie';
  receivedBy: string;
  /** A qual ciclo esse pagamento confirma (mesmo valor que ficaria em `last_renewed_at`) — por padrão a Última
   *  Renovação atual da assinatura; a equipe pode escolher uma data diferente se o pagamento for de um ciclo
   *  passado, registrado atrasado. */
  cycleRenewalDate?: string;
}

/** Registra um pagamento (data/hora/forma/quem recebeu). Só marca a assinatura como "Pagamento realizado" (e
 *  roda o motor automático) quando `cycleRenewalDate` bate com a Última Renovação atual — pagamento de um ciclo
 *  passado (ex.: preenchendo o histórico) não mexe na cor nem na agenda de agora. */
export const registerClubinhoPayment = async (id: string, input: NewClubinhoPaymentInput): Promise<{ assinatura: ClubinhoSubscription; pagamento: ClubinhoPayment; autoAcao: ClubinhoAutoAction | null }> => {
  const { assinatura, pagamento, auto_acao } = await workerCall<{ assinatura: ClubinhoSubscription; pagamento: ClubinhoPayment; auto_acao?: ClubinhoAutoAction | null }>(`/clubinho/${encodeURIComponent(id)}/pagamento`, { method: 'POST', body: JSON.stringify(input) });
  return { assinatura, pagamento, autoAcao: auto_acao || null };
};

/** Histórico completo de pagamentos de uma assinatura (todos os ciclos), mais as datas de renovação REAIS
 *  conhecidas dela (`cycles`) — pra nunca deixar a equipe digitar uma data qualquer como "a quê ciclo esse
 *  pagamento se refere", só datas que de fato marcam o início de um ciclo. */
export const listClubinhoPayments = async (subscriptionId: string): Promise<{ payments: ClubinhoPayment[]; cycles: string[] }> => {
  const { pagamentos, ciclos } = await workerCall<{ pagamentos: ClubinhoPayment[]; ciclos: string[] }>(`/clubinho/${encodeURIComponent(subscriptionId)}/pagamentos`);
  return { payments: pagamentos, cycles: ciclos || [] };
};

/** Corrige um pagamento já registrado (ex.: data/forma erradas, ou a qual ciclo ele se refere). Nunca mexe
 *  sozinho na cor/agenda da assinatura — isso continua decisão manual da equipe. */
export const updateClubinhoPayment = async (paymentId: string, patch: Partial<NewClubinhoPaymentInput>): Promise<ClubinhoPayment> => {
  const { pagamento } = await workerCall<{ pagamento: ClubinhoPayment }>(`/clubinho/pagamentos/${encodeURIComponent(paymentId)}`, { method: 'PATCH', body: JSON.stringify(patch) });
  return pagamento;
};

export const deleteClubinhoPayment = async (paymentId: string): Promise<void> => {
  await workerCall(`/clubinho/pagamentos/${encodeURIComponent(paymentId)}`, { method: 'DELETE' });
};

export const cancelClubinho = async (id: string): Promise<void> => {
  await workerCall(`/clubinho/${encodeURIComponent(id)}`, { method: 'DELETE' });
};
