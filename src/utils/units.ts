/** Unidades de venda. KG e LT permitem frações (ex.: 0,350 kg de ração a granel). */
export type Unit = 'UN' | 'KG' | 'LT';

export const UNIT_OPTIONS: { id: Unit; label: string; short: string }[] = [
  { id: 'UN', label: 'UN - Unidade', short: 'un' },
  { id: 'KG', label: 'KG - Quilograma', short: 'kg' },
  { id: 'LT', label: 'LT - Litro', short: 'L' },
];

export const unitShort = (unit?: string): string => UNIT_OPTIONS.find(u => u.id === unit)?.short ?? 'un';

/** Produto vendido por peso/volume (aceita casas decimais). Sem unidade cadastrada = unidade inteira. */
export const isFractional = (unit?: string | null): boolean => !!unit && unit !== 'UN';

/** Quantidades com 3 casas (ex.: 1,250 kg), sem erros de ponto flutuante. */
export const roundQty = (n: number): number => Math.round((n + Number.EPSILON) * 1000) / 1000;

/** Valor da linha em reais, arredondado ao centavo (é o que a nota fiscal confere). */
export const lineTotal = (price: number, qty: number): number => Math.round((price * qty + Number.EPSILON) * 100) / 100;

/** "1,250 kg" para fracionados; "2" para unidades. */
export function formatQty(qty: number, unit?: string | null): string {
  if (!isFractional(unit)) return String(qty);
  return `${qty.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ${unitShort(unit || undefined)}`;
}

/** "1,250 kg de Ração" ou "2x Ração". */
export function describeItem(qty: number, unit: string | null | undefined, name: string): string {
  return isFractional(unit) ? `${formatQty(qty, unit)} de ${name}` : `${qty}x ${name}`;
}

/** "R$ 9.00 /kg" para fracionados; "R$ 9.00" para unidades. */
export function priceLabel(price: number, unit?: string | null): string {
  return `R$ ${price.toFixed(2)}${isFractional(unit) ? ` /${unitShort(unit || undefined)}` : ''}`;
}

/** Lê "0,5", "0.5" ou "1,250". Devolve NaN se não for um número. */
export function parseQty(text: string): number {
  const cleaned = text.trim().replace(',', '.');
  if (!/^\d*\.?\d*$/.test(cleaned) || cleaned === '' || cleaned === '.') return NaN;
  return roundQty(Number(cleaned));
}
