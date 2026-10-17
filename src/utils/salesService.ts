import { collection, doc, getDocs, runTransaction, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseClient';
import type { ReceiptFiscal, ReceiptItem } from './printer';

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
}

const LEGACY_KEY = 'laviola_pdv_sales';

/**
 * Grava a venda e baixa o estoque na MESMA transação: ou acontece tudo, ou nada.
 * (Antes o estoque era baixado item a item com a quantidade lida na tela, e a venda só ia para o localStorage.)
 */
export async function finalizeSale(sale: Omit<Sale, 'id' | 'number'>): Promise<Sale> {
  if (!db) throw new Error('Firebase não configurado.');
  const firestore = db;
  const saleRef = doc(collection(firestore, 'sales'));
  // JSON round-trip remove `undefined`, que o Firestore rejeita.
  const saved: Sale = JSON.parse(JSON.stringify({ ...sale, id: saleRef.id, number: saleRef.id.slice(0, 6).toUpperCase() }));

  // Soma quantidades por produto (o mesmo produto pode aparecer em mais de uma linha).
  const qtyByProduct = new Map<string, number>();
  sale.items.forEach(i => qtyByProduct.set(i.product_id, (qtyByProduct.get(i.product_id) || 0) + i.quantity));

  await runTransaction(firestore, async (tx) => {
    const refs = [...qtyByProduct.keys()].map(id => doc(firestore, 'products', id));
    const snaps = await Promise.all(refs.map(r => tx.get(r)));

    snaps.forEach((snap, idx) => {
      const productId = refs[idx].id;
      if (!snap.exists()) throw new Error('Um dos produtos da venda não existe mais no estoque.');
      const current = Number(snap.data().quantity) || 0;
      const wanted = qtyByProduct.get(productId) || 0;
      if (current < wanted) {
        throw new Error(`Estoque insuficiente de "${snap.data().name}": disponível ${current}, na venda ${wanted}.`);
      }
      tx.update(refs[idx], { quantity: current - wanted });
    });

    tx.set(saleRef, saved);
  });

  return saved;
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
