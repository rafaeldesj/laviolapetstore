import { workerCall, workerRaw, WorkerError } from './workerApi';
import type { NfeNote } from './nfeParser';

export interface PurchaseSummary {
  id: string;
  access_key: string;
  number: string;
  series: string;
  issued_at: string | null;
  supplier_name: string;
  supplier_cnpj: string;
  total: number;
  has_pdf: boolean;
  created_at: string;
  items: { name: string; qty: number; result: string }[];
}

export async function listPurchases(): Promise<PurchaseSummary[]> {
  const body = await workerCall<{ purchases: PurchaseSummary[] }>('/compras');
  return body.purchases.map(p => ({ ...p, total: Number(p.total) || 0 }));
}

/** "Código do fornecedor → produto" já conhecidos deste fornecedor (de notas anteriores). */
export async function getSupplierLinks(cnpj: string): Promise<Map<string, string>> {
  const body = await workerCall<{ links: { supplier_code: string; product_id: string }[] }>(`/compras/vinculos?cnpj=${encodeURIComponent(cnpj)}`);
  return new Map(body.links.map(l => [l.supplier_code, l.product_id]));
}

export interface PurchaseLine {
  action: 'link' | 'new' | 'skip';
  product_id?: string;
  supplier_code: string;
  name: string;
  ean: string;
  ncm: string;
  origin: string;
  unit: string;
  category: string;
  qty: number;
  cost: number;
  price: number;
  update_cost: boolean;
  /** Só para produto que já existe: grava o preço de venda novo. */
  update_price?: boolean;
}

export interface PurchaseResult {
  ok: boolean;
  purchase_id?: string;
  created?: number;
  updated?: number;
  skipped?: number;
  duplicate?: boolean;
}

/** Lança a nota: atualiza o estoque e guarda o XML. Se a nota já foi lançada, devolve duplicate=true. */
export async function registerPurchase(note: NfeNote, xml: string, lines: PurchaseLine[]): Promise<PurchaseResult> {
  try {
    return await workerCall<PurchaseResult>('/compras', {
      method: 'POST',
      body: JSON.stringify({
        note: {
          access_key: note.accessKey,
          number: note.number,
          series: note.series,
          issued_at: note.issuedAt,
          supplier_name: note.supplierName,
          supplier_cnpj: note.supplierCnpj,
          total: note.total,
          xml,
          items: lines,
        },
      }),
    });
  } catch (e) {
    if (e instanceof WorkerError && e.status === 409 && e.body?.error === 'duplicate') return { ok: false, duplicate: true };
    throw e;
  }
}

export async function uploadPurchasePdf(purchaseId: string, file: File): Promise<void> {
  await workerRaw(`/compras/${encodeURIComponent(purchaseId)}/pdf`, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: file });
}

async function saveBlob(res: Response, filename: string) {
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function downloadPurchaseXml(p: Pick<PurchaseSummary, 'id' | 'access_key'>): Promise<void> {
  await saveBlob(await workerRaw(`/compras/${encodeURIComponent(p.id)}/xml`), `NFe-${p.access_key}.xml`);
}

/** Abre o PDF (DANFE) numa nova aba. */
export async function openPurchasePdf(purchaseId: string): Promise<void> {
  const res = await workerRaw(`/compras/${encodeURIComponent(purchaseId)}/pdf`);
  const url = URL.createObjectURL(await res.blob());
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
