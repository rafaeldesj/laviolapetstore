// Importação em lote do NCM por planilha (CSV). O usuário baixa a planilha com os produtos dele,
// preenche a coluna do NCM no Excel/Google Planilhas e envia de volta.

export interface ImportableProduct {
  id: string;
  name: string;
  sku?: string;
  ncm?: string;
  origin?: string;
}

export interface NcmChange {
  product: ImportableProduct;
  ncm: string;
  origin: string;
}

export interface NcmImportReport {
  changes: NcmChange[];
  unchanged: number;
  skippedEmpty: number;
  invalid: { line: number; name: string; value: string }[];
  notFound: { line: number; name: string }[];
}

const COLUMNS = ['ID', 'Código de barras', 'Nome do produto', 'NCM (8 números)', 'Origem (0 = fabricado no Brasil)'];

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const digits = (s: string) => s.replace(/\D/g, '');

const csvCell = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;

/** Planilha com os produtos atuais. `;` + BOM para o Excel em português abrir certinho. */
export function buildProductsCsv(products: ImportableProduct[]): string {
  const rows = products
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    .map(p => [p.id, p.sku || '', p.name, p.ncm || '', p.origin || '0'].map(csvCell).join(';'));
  return '﻿' + [COLUMNS.map(csvCell).join(';'), ...rows].join('\r\n');
}

/** Lê CSV com `;` ou `,`, aspas e quebras de linha dentro de aspas. */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, '');
  const firstLine = clean.split(/\r?\n/, 1)[0] || '';
  const delim = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ';' : ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (quoted) {
      if (c === '"' && clean[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && clean[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(x => x.trim() !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some(x => x.trim() !== '')) rows.push(row);
  return rows;
}

function findColumn(header: string[], ...keys: string[]): number {
  return header.findIndex(h => keys.some(k => norm(h).startsWith(k)));
}

/** Converte as células de uma planilha Excel em texto (números inteiros sem casas, datas ignoradas). */
export function excelRowsToText(rows: unknown[][]): string[][] {
  return rows.map(r => r.map(v => (v === null || v === undefined ? '' : v instanceof Date ? '' : String(v))));
}

export function analyzeNcmSheet(text: string, products: ImportableProduct[]): NcmImportReport {
  return analyzeNcmRows(parseCsv(text), products);
}

export function analyzeNcmRows(allRows: string[][], products: ImportableProduct[]): NcmImportReport {
  const report: NcmImportReport = { changes: [], unchanged: 0, skippedEmpty: 0, invalid: [], notFound: [] };

  // Planilhas de outros sistemas costumam ter título/linhas em branco antes do cabeçalho: procuramos a linha da coluna NCM.
  const headerAt = allRows.slice(0, 15).findIndex(r => r.some(h => norm(h || '').startsWith('ncm')));
  const rows = headerAt > 0 ? allRows.slice(headerAt) : allRows;
  if (rows.length < 2) throw new Error('A planilha está vazia ou não tem uma coluna "NCM". Use a planilha baixada pelo botão "Baixar planilha dos meus produtos" ou a exportação do sistema atual.');

  const header = rows[0];
  const iId = findColumn(header, 'id');
  const iCode = findColumn(header, 'codigo', 'cod', 'sku');
  const iName = findColumn(header, 'nome', 'produto', 'descricao');
  const iNcm = findColumn(header, 'ncm');
  const iOrigin = findColumn(header, 'origem');
  if (iNcm < 0 || (iId < 0 && iCode < 0 && iName < 0)) {
    throw new Error('Não encontrei as colunas da planilha. Baixe o modelo novamente e preencha só a coluna do NCM.');
  }

  const byId = new Map(products.map(p => [p.id, p]));
  const byCode = new Map(products.filter(p => p.sku).map(p => [digits(p.sku!) || p.sku!.trim(), p]));
  const byName = new Map<string, ImportableProduct | null>();
  products.forEach(p => {
    const k = norm(p.name);
    byName.set(k, byName.has(k) ? null : p); // nome repetido = ambíguo, não usa
  });

  const get = (r: string[], i: number) => (i >= 0 ? (r[i] || '').trim() : '');

  rows.slice(1).forEach((r, idx) => {
    const line = idx + 2;
    const rawNcm = get(r, iNcm);
    const name = get(r, iName);

    if (!rawNcm) { report.skippedEmpty++; return; }

    const id = get(r, iId);
    const code = get(r, iCode);
    const product =
      (id && byId.get(id)) ||
      (code && (byCode.get(digits(code) || code) || undefined)) ||
      (name && (byName.get(norm(name)) || undefined)) ||
      undefined;

    if (!product) { report.notFound.push({ line, name: name || code || id || '(sem nome)' }); return; }

    // Excel guarda NCM como número e perde o zero da frente (ex.: 5119900 → 05119900).
    const ncm = digits(rawNcm).length === 7 ? `0${digits(rawNcm)}` : digits(rawNcm);
    if (ncm.length !== 8) { report.invalid.push({ line, name: product.name, value: rawNcm }); return; }

    const origin = get(r, iOrigin) || product.origin || '0';
    if (!['0', '1', '2'].includes(origin)) { report.invalid.push({ line, name: product.name, value: `origem ${origin}` }); return; }

    if (product.ncm === ncm && (product.origin || '0') === origin) report.unchanged++;
    else report.changes.push({ product, ncm, origin });
  });

  return report;
}
