import JSZip from 'jszip';
import { getNfceXmls } from './fiscal';
import type { FiscalSettings } from './fiscal';
import type { Sale } from './salesService';

export interface MonthlyPackage {
  blob: Blob;
  fileName: string;
  count: number;
  failed: string[];
}

const text = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
/** `="..."` faz o Excel tratar números longos (chave, CPF) como texto, sem virar 3,3E+43. */
const asText = (v: string) => (v ? `="${v}"` : '');
const money = (n: number) => (n || 0).toFixed(2).replace('.', ',');

const STATUS_LABEL: Record<string, string> = { autorizada: 'Emitida', cancelada: 'Cancelada' };

export function buildSummaryCsv(sales: Sale[]): string {
  const header = ['Data', 'Hora', 'Venda', 'Nº da nota', 'Série', 'Chave de acesso', 'Situação', 'Cliente', 'CPF/CNPJ', 'Forma de pagamento', 'Valor (R$)'];
  const rows = sales
    .slice()
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .map(s => {
      const d = new Date(s.timestamp);
      return [
        text(d.toLocaleDateString('pt-BR')),
        text(d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })),
        text(s.number),
        text(s.fiscal?.numero ?? ''),
        text(s.fiscal?.serie ?? ''),
        asText(s.fiscal?.chave || ''),
        text(STATUS_LABEL[s.fiscal?.status || ''] || s.fiscal?.status || 'Sem nota'),
        text(s.client?.name || ''),
        asText((s.client?.cpf_cnpj || '').replace(/\D/g, '')),
        text(s.payment_method),
        text(money(s.subtotal)),
      ].join(';');
    });
  return '﻿' + [header.map(text).join(';'), ...rows].join('\r\n');
}

const monthKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/** Total vendido no mês (vendas canceladas não contam). */
export function monthTotal(sales: Sale[], month: string): { total: number; count: number } {
  const list = sales.filter(s => !s.voided && monthKey(s.timestamp) === month);
  return { total: list.reduce((a, s) => a + s.subtotal, 0), count: list.length };
}

function buildTotalCsv(sales: Sale[], month: string): string {
  const { total } = monthTotal(sales, month);
  const [y, m] = month.split('-');
  return '\uFEFF' + [
    ['Mês', 'Total das vendas (R$)'].map(text).join(';'),
    [text(`${m}/${y}`), text(money(total))].join(';'),
  ].join('\r\n');
}

/** A planilha que o contador pediu: só o total vendido no mês. */
export function buildTotalSheet(sales: Sale[], month: string): MonthlyPackage {
  const { count } = monthTotal(sales, month);
  const csv = buildTotalCsv(sales, month);
  return { blob: new Blob([csv], { type: 'text/csv;charset=utf-8' }), fileName: `total-vendas-${month}.csv`, count, failed: [] };
}

/** Roda `fn` sobre os itens com no máximo `limit` chamadas ao mesmo tempo. */
async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await fn(items[next++]);
  }));
}

/**
 * Monta o pacote do mês para o contador: um ZIP com os XMLs (pasta XML) e o resumo em planilha,
 * ou só a planilha. `month` no formato AAAA-MM.
 */
export async function buildMonthlyPackage(
  sales: Sale[],
  cfg: FiscalSettings,
  month: string,
  withXml: boolean,
  onProgress: (done: number, total: number) => void
): Promise<MonthlyPackage> {
  const notes = sales.filter(s => {
    const st = s.fiscal?.status;
    if (st !== 'autorizada' && st !== 'cancelada') return false;
    const d = new Date(s.timestamp);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === month;
  });
  const base = `notas-${month}`;

  if (!withXml) {
    return { blob: new Blob([buildSummaryCsv(notes)], { type: 'text/csv;charset=utf-8' }), fileName: `${base}-resumo.csv`, count: notes.length, failed: [] };
  }

  const zip = new JSZip();
  const failed: string[] = [];
  let done = 0;
  onProgress(0, notes.length);

  await pool(notes, 4, async (sale) => {
    const label = `venda #${sale.number}`;
    try {
      const { xml, xmlCancelamento } = await getNfceXmls(sale, cfg);
      const key = sale.fiscal?.chave || `venda-${sale.number}`;
      if (xml) zip.file(`XML/${key}.xml`, xml);
      if (xmlCancelamento) zip.file(`XML/${key}-cancelamento.xml`, xmlCancelamento);
    } catch {
      failed.push(label);
    }
    onProgress(++done, notes.length);
  });

  zip.file('resumo.csv', buildSummaryCsv(notes));
  zip.file('total-do-mes.csv', buildTotalCsv(sales, month));
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  return { blob, fileName: `${base}.zip`, count: notes.length, failed };
}

export function downloadBlob(blob: Blob, fileName: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(a.href);
}
