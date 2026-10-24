/**
 * Leitura do XML da nota fiscal de compra (NF-e / NFC-e). O XML é o arquivo que o fornecedor manda junto com o DANFE (PDF).
 * Funciona no navegador (DOMParser) e independe do prefixo de namespace que o emissor usar.
 */

export interface NfeItem {
  /** Código do produto no cadastro do fornecedor. */
  supplierCode: string;
  /** Código de barras (GTIN) válido, ou vazio quando a nota diz "SEM GTIN". */
  ean: string;
  name: string;
  ncm: string;
  cfop: string;
  /** Origem da mercadoria (0 a 8), do ICMS. */
  origin: string;
  /** Unidade do sistema: UN, KG ou LT. */
  unit: 'UN' | 'KG' | 'LT';
  /** Unidade escrita na nota (CX, PCT, KG...). */
  noteUnit: string;
  qty: number;
  /** Custo unitário já com frete, seguro, outras despesas, IPI e ICMS-ST, menos o desconto. */
  cost: number;
  /** Valor unitário como está na nota (só o produto). */
  unitValue: number;
  /** Valor total da linha como está na nota. */
  lineValue: number;
}

export interface NfeNote {
  accessKey: string;
  number: string;
  series: string;
  issuedAt: string; // ISO
  supplierName: string;
  supplierCnpj: string;
  total: number;
  items: NfeItem[];
}

const num = (s: string): number => {
  const n = Number(String(s).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

const round = (n: number, d: number): number => {
  const f = 10 ** d;
  return Math.round((n + Number.EPSILON) * f) / f;
};

function first(el: Element | Document, name: string): Element | null {
  return el.getElementsByTagNameNS('*', name)[0] ?? null;
}

function text(el: Element | Document | null, name: string): string {
  if (!el) return '';
  return (first(el, name)?.textContent ?? '').trim();
}

const validGtin = (v: string): string => (/^\d{8,14}$/.test(v) && !/^0+$/.test(v) ? v : '');

function mapUnit(u: string): NfeItem['unit'] {
  const x = u.trim().toUpperCase();
  if (x === 'KG' || x === 'KGS' || x === 'QUILO') return 'KG';
  if (x === 'LT' || x === 'L' || x === 'LTS' || x === 'LITRO') return 'LT';
  return 'UN';
}

export function parseNfeXml(xmlText: string): NfeNote {
  const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) throw new Error('Este arquivo não é um XML válido.');

  if (first(doc, 'procEventoNFe') || first(doc, 'retEvento') || first(doc, 'evento')) {
    throw new Error('Este XML é de um evento (cancelamento, carta de correção...), não da nota. Use o XML da própria nota fiscal.');
  }
  const inf = first(doc, 'infNFe');
  if (!inf) throw new Error('Este XML não parece ser de uma nota fiscal eletrônica (NF-e).');

  const accessKey = (inf.getAttribute('Id') || text(doc, 'chNFe')).replace(/\D/g, '');
  if (accessKey.length !== 44) throw new Error('Não encontrei a chave de acesso (44 dígitos) neste XML.');

  const ide = first(inf, 'ide');
  const emit = first(inf, 'emit');
  const issued = text(ide, 'dhEmi') || text(ide, 'dEmi');
  const issuedAt = issued ? new Date(issued.length === 10 ? `${issued}T12:00:00-03:00` : issued).toISOString() : '';

  const items: NfeItem[] = [];
  for (const det of Array.from(inf.getElementsByTagNameNS('*', 'det'))) {
    const prod = first(det, 'prod');
    if (!prod) continue;
    const qty = num(text(prod, 'qCom'));
    const lineValue = num(text(prod, 'vProd'));
    // Provisório (frete, seguro, outras despesas, IPI, ICMS-ST e desconto desta linha); abaixo é refeito com o total da nota.
    const extras =
      num(text(prod, 'vFrete')) + num(text(prod, 'vSeg')) + num(text(prod, 'vOutro')) - num(text(prod, 'vDesc')) +
      num(text(det, 'vIPI')) + num(text(det, 'vICMSST'));
    const noteUnit = text(prod, 'uCom');
    items.push({
      supplierCode: text(prod, 'cProd'),
      ean: validGtin(text(prod, 'cEAN')) || validGtin(text(prod, 'cEANTrib')),
      name: text(prod, 'xProd'),
      ncm: text(prod, 'NCM').replace(/\D/g, ''),
      cfop: text(prod, 'CFOP'),
      origin: text(first(det, 'imposto') ?? det, 'orig') || '0',
      unit: mapUnit(noteUnit),
      noteUnit,
      qty,
      cost: qty > 0 ? round((lineValue + extras) / qty, 4) : 0,
      unitValue: num(text(prod, 'vUnCom')),
      lineValue,
    });
  }
  if (items.length === 0) throw new Error('Não encontrei produtos neste XML.');

  // Tudo o que a nota soma além dos produtos (frete, seguro, IPI, ICMS-ST, FCP...) menos descontos é custo da compra.
  // Dividimos esse valor entre os itens na proporção do valor de cada um, assim o custo total fecha com o total da nota.
  const totalNf = num(text(first(inf, 'ICMSTot'), 'vNF'));
  const sumProd = items.reduce((a, i) => a + i.lineValue, 0);
  if (totalNf > 0 && sumProd > 0) {
    const extra = totalNf - sumProd;
    for (const it of items) {
      if (it.qty > 0) it.cost = round((it.lineValue + extra * (it.lineValue / sumProd)) / it.qty, 4);
    }
  }

  const doc14 = text(emit, 'CNPJ') || text(emit, 'CPF');
  return {
    accessKey,
    number: text(ide, 'nNF'),
    series: text(ide, 'serie'),
    issuedAt,
    supplierName: text(emit, 'xNome') || text(emit, 'xFant'),
    supplierCnpj: doc14.replace(/\D/g, ''),
    total: num(text(first(inf, 'ICMSTot'), 'vNF')) || round(items.reduce((a, i) => a + i.lineValue, 0), 2),
    items,
  };
}

/** Nome do arquivo de PDF costuma ter a chave de 44 dígitos ou o número da nota; devolve a chave se achar. */
export function keyFromFileName(name: string): string {
  return /\d{44}/.exec(name)?.[0] ?? '';
}
