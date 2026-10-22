export type PaymentMethod = 'dinheiro' | 'debito' | 'credito' | 'pix';

/** Como a entrega é paga: já paga, ou a receber do cliente na porta. */
export interface DeliveryPayment {
  status: 'pago' | 'receber';
  method?: PaymentMethod;
  /** Valor a cobrar do cliente. */
  amount?: number;
  /** Só dinheiro: o cliente vai pagar com nota maior e precisa de troco. */
  needs_change?: boolean;
  /** Só dinheiro: valor da nota com que o cliente vai pagar ("troco para quanto"). */
  change_for?: number;
}

export const PAYMENT_METHODS: { id: PaymentMethod; label: string }[] = [
  { id: 'dinheiro', label: 'Dinheiro' },
  { id: 'debito', label: 'Cartão de débito' },
  { id: 'credito', label: 'Cartão de crédito' },
  { id: 'pix', label: 'Pix' },
];

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  dinheiro: 'Dinheiro',
  debito: 'Cartão de débito',
  credito: 'Cartão de crédito',
  pix: 'Pix',
};

/** Formas recebidas na maquininha de cartão (por enquanto o Pix também), então o entregador precisa levá-la. */
export const usesCardMachine = (method?: PaymentMethod): boolean => method === 'debito' || method === 'credito' || method === 'pix';

export const brl = (n: number): string => `R$ ${(n || 0).toFixed(2).replace('.', ',')}`;

/** Parse de "200", "200,50" ou "R$ 1.200,00". */
export function parseMoney(text: string): number {
  const cleaned = text.replace(/[^\d,.-]/g, '');
  const normalized = cleaned.includes(',') ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
}

/** Quanto de troco o entregador deve levar. */
export function changeToGive(p: DeliveryPayment): number {
  if (p.status !== 'receber' || p.method !== 'dinheiro' || !p.needs_change) return 0;
  return Math.max(0, (p.change_for || 0) - (p.amount || 0));
}

/** Texto curto, para a linha de itens e para o registro. */
export function paymentText(p: DeliveryPayment): string {
  if (p.status === 'pago') return 'Já pago';
  const how = p.method ? PAYMENT_METHOD_LABEL[p.method].toLowerCase() : 'forma não informada';
  let text = `A receber na entrega: ${brl(p.amount || 0)} em ${how}`;
  if (p.method === 'dinheiro') {
    text += p.needs_change ? `, troco para ${brl(p.change_for || 0)} (levar ${brl(changeToGive(p))} de troco)` : ', sem troco';
  }
  if (usesCardMachine(p.method)) text += ' (levar a maquininha)';
  return text;
}

/** Devolve o problema (em português) ou null se estiver tudo certo. */
export function validatePayment(p: DeliveryPayment): string | null {
  if (p.status === 'pago') return null;
  if (!p.method) return 'a forma de pagamento (dinheiro, cartão ou Pix)';
  if (!p.amount || p.amount <= 0) return 'o valor a cobrar (adicione os produtos)';
  if (p.method === 'dinheiro' && p.needs_change) {
    if (!p.change_for || p.change_for < p.amount) return `o valor do troco: precisa ser igual ou maior que ${brl(p.amount)}`;
  }
  return null;
}

/** Remove da lista de itens a marca antiga "[PGTO: ...]" quando o pagamento já aparece em destaque. */
export const stripPaymentTag = (items: string): string => items.replace(/\n?\[PGTO:[^\]]*\]/g, '').trim();
