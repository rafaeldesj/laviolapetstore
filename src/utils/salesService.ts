import { collection, doc, getDoc, getDocs, runTransaction, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebaseClient';
import type { ReceiptFiscal, ReceiptItem } from './printer';
import { roundQty } from './units';
import { invalidateProducts } from '../supabaseClient';
import { WorkerError, workerCall } from './workerApi';

export interface SaleItem extends ReceiptItem {
  product_id: string;
  sku: string;
  ncm: string;
  origin: string;
  cfop?: string;
  unit?: string;
}

export interface Sale {
  id: string;
  number: string;
  timestamp: string;
  items: SaleItem[];
  total_items: number;
  subtotal: number;
  payment_method: string;
  amount_paid: number;
  change: number;
  client: { name: string; cpf_cnpj: string };
  operator: string;
  operator_email: string;
  type: 'store' | 'delivery' | null;
  delivery: Record<string, unknown> | null;
  fiscal: ReceiptFiscal | null;
  /** Venda cancelada (ex.: erro de digitação): os produtos voltaram ao estoque e ela não entra nos totais. */
  voided?: boolean;
  voided_at?: string;
  voided_reason?: string;
  voided_by?: string;
}

const LEGACY_KEY = 'laviola_pdv_sales';

interface StockChange { id: string; delta: number }

/**
 * Baixa ou devolve estoque no Supabase, tudo ou nada (a função do banco trava as linhas e recusa estoque negativo).
 * modo "sale": vendendo (recusa se não houver estoque); "void": devolvendo; "undo": desfazendo um ajuste anterior.
 */
async function adjustStock(items: StockChange[], mode: 'sale' | 'void' | 'undo'): Promise<void> {
  try {
    await workerCall('/produtos/estoque', { method: 'POST', body: JSON.stringify({ items, mode }) });
  } catch (e) {
    if (e instanceof WorkerError && e.status === 409 && Array.isArray(e.body?.errors)) {
      const err = e.body.errors[0];
      if (err.error === 'insufficient') {
        const wanted = -(items.find(i => i.id === err.id)?.delta || 0);
        throw new Error(`Estoque insuficiente de "${err.name}": disponível ${err.available}, na venda ${wanted}.`);
      }
      throw new Error('Um dos produtos da venda não existe mais no estoque.');
    }
    throw e;
  }
}

function stockChanges(items: { product_id: string; quantity: number }[], sign: 1 | -1): StockChange[] {
  // Soma quantidades por produto (o mesmo produto pode aparecer em mais de uma linha).
  const qtyByProduct = new Map<string, number>();
  items.forEach(i => qtyByProduct.set(i.product_id, roundQty((qtyByProduct.get(i.product_id) || 0) + i.quantity)));
  return [...qtyByProduct].map(([id, qty]) => ({ id, delta: sign * qty }));
}

/**
 * Baixa o estoque (Supabase) e grava a venda (Firebase). Os dois bancos não têm uma transação em comum, então a ordem
 * é: 1) baixa o estoque, tudo ou nada; 2) grava a venda; se a gravação falhar, devolve o estoque.
 */
export async function finalizeSale(sale: Omit<Sale, 'id' | 'number'>): Promise<Sale> {
  if (!db) throw new Error('Firebase não configurado.');
  const saleRef = doc(collection(db, 'sales'));
  // JSON round-trip remove `undefined`, que o Firestore rejeita.
  const saved: Sale = JSON.parse(JSON.stringify({ ...sale, id: saleRef.id, number: saleRef.id.slice(0, 6).toUpperCase() }));

  const down = stockChanges(sale.items, -1);
  await adjustStock(down, 'sale');
  try {
    await setDoc(saleRef, saved);
  } catch (e) {
    await adjustStock(stockChanges(sale.items, 1), 'undo').catch(() => {}); // venda não gravada: o estoque volta
    throw e;
  } finally {
    invalidateProducts();
  }
  return saved;
}

class AlreadyVoided extends Error {}

/** Cancela a venda e devolve os produtos ao estoque: primeiro devolve (Supabase), depois marca a venda (Firebase). */
export async function voidSale(sale: Sale, reason: string): Promise<Sale> {
  if (!db) throw new Error('Firebase não configurado.');
  const firestore = db;
  const saleRef = doc(firestore, 'sales', sale.id);

  const snap = await getDoc(saleRef);
  if (!snap.exists()) throw new Error('Venda não encontrada.');
  const current = { ...(snap.data() as Sale), id: sale.id };
  if (current.voided) return { ...sale, ...current };

  const back = stockChanges(current.items, 1); // produto removido do estoque depois da venda é ignorado pelo banco
  await adjustStock(back, 'void');

  const patch = {
    voided: true,
    voided_at: new Date().toISOString(),
    voided_reason: reason,
    voided_by: auth?.currentUser?.displayName || auth?.currentUser?.email || '',
  };
  try {
    return await runTransaction(firestore, async (tx) => {
      const again = await tx.get(saleRef);
      if (!again.exists()) throw new Error('Venda não encontrada.');
      if ((again.data() as Sale).voided) throw new AlreadyVoided(); // outra pessoa cancelou ao mesmo tempo
      tx.update(saleRef, patch);
      return { ...sale, ...current, ...patch };
    });
  } catch (e) {
    await adjustStock(stockChanges(current.items, -1), 'undo').catch(() => {}); // não marcou: desfaz a devolução
    if (e instanceof AlreadyVoided) return { ...sale, ...current, voided: true };
    throw e;
  } finally {
    invalidateProducts();
  }
}

export async function updateSaleFiscal(saleId: string, fiscal: ReceiptFiscal): Promise<void> {
  if (!db) return;
  await updateDoc(doc(db, 'sales', saleId), { fiscal: JSON.parse(JSON.stringify(fiscal)) });
}

/** Envia ao Firestore vendas antigas que só existiam no localStorage deste navegador. */
async function migrateLegacySales(): Promise<void> {
  if (!db) return;
  let legacy: Partial<Sale>[];
  try {
    legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]');
  } catch {
    return;
  }
  if (!legacy.length) return;

  try {
    for (const s of legacy) {
      const id = s.id || Math.random().toString(36).substring(2, 9);
      await setDoc(doc(db, 'sales', id), { fiscal: null, ...s, id, number: s.number || id.slice(0, 6).toUpperCase() }, { merge: true });
    }
    localStorage.removeItem(LEGACY_KEY);
  } catch (e) {
    console.warn('Não foi possível migrar vendas antigas do navegador:', e);
  }
}

export async function fetchSales(): Promise<Sale[]> {
  if (!db) return [];
  await migrateLegacySales();
  const snap = await getDocs(collection(db, 'sales'));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() } as Sale))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}
