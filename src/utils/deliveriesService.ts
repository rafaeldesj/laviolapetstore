import { collection, deleteDoc, doc, onSnapshot, query, setDoc, updateDoc, where } from 'firebase/firestore';
import type { Unsubscribe } from 'firebase/firestore';
import { db } from '../firebaseClient';
import type { DeliveryItem } from '../components/Delivery';

// O Firestore rejeita `undefined`; o round-trip em JSON remove esses campos.
const clean = <T>(value: T): T => JSON.parse(JSON.stringify(value));

/**
 * Entregas em tempo real. A equipe (dono, gerente, entregador) recebe todas;
 * o cliente recebe só as dele (as regras do Firestore também exigem isso).
 */
export function subscribeDeliveries(
  opts: { uid: string; staff: boolean },
  onData: (list: DeliveryItem[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (!db) {
    onData([]);
    return () => {};
  }
  const col = collection(db, 'deliveries');
  const q = opts.staff ? col : query(col, where('client_id', '==', opts.uid));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map(d => ({ ...(d.data() as DeliveryItem), id: d.id }));
      list.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
      onData(list);
    },
    (err) => onError?.(err)
  );
}

export async function addDelivery(delivery: DeliveryItem): Promise<void> {
  if (!db) throw new Error('Firebase não configurado.');
  await setDoc(doc(db, 'deliveries', delivery.id), clean(delivery));
}

/** Atualiza só alguns campos (ex.: a posição do GPS do entregador). */
export async function patchDelivery(id: string, patch: Partial<DeliveryItem>): Promise<void> {
  if (!db) throw new Error('Firebase não configurado.');
  await updateDoc(doc(db, 'deliveries', id), clean(patch));
}

/** Grava no Firestore só o que mudou entre a lista anterior e a nova (inclusões, alterações e remoções). */
export async function syncDeliveries(previous: DeliveryItem[], next: DeliveryItem[]): Promise<void> {
  if (!db) throw new Error('Firebase não configurado.');
  const firestore = db;
  const before = new Map(previous.map(d => [d.id, JSON.stringify(clean(d))]));
  const nextIds = new Set(next.map(d => d.id));
  const writes: Promise<void>[] = [];

  next.forEach(d => {
    if (before.get(d.id) !== JSON.stringify(clean(d))) {
      writes.push(setDoc(doc(firestore, 'deliveries', d.id), clean(d)));
    }
  });
  previous.forEach(d => {
    if (!nextIds.has(d.id)) writes.push(deleteDoc(doc(firestore, 'deliveries', d.id)));
  });
  await Promise.all(writes);
}
