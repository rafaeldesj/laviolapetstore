import { collection, deleteDoc, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { auth, db } from '../firebaseClient';
import { getFiscalSettings } from './fiscal';

/** Chave pública do push (a privada fica no Worker). */
export const VAPID_PUBLIC_KEY = 'BH3HIMpCblEGh9EFzIQ2nMtKYQPpmHuyajU2hORiI54F7fC7FPch2R8W7ak4iKU-OEXpl5GgRgrvy4JUgT8i29k';

export type PushState = 'unsupported' | 'denied' | 'off' | 'on';

export const isPushSupported = (): boolean =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const toUint8 = (base64Url: string): Uint8Array<ArrayBuffer> => {
  const pad = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const raw = atob((base64Url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
};

/** Identificador estável por aparelho, derivado do endereço de push. */
async function subscriptionId(endpoint: string): Promise<string> {
  const bytes = new TextEncoder().encode(endpoint);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 40);
}

async function registration(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.register('/sw.js');
}

export async function getPushState(): Promise<PushState> {
  if (!isPushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission !== 'granted') return 'off';
  const reg = await navigator.serviceWorker.getRegistration('/sw.js');
  const sub = await reg?.pushManager.getSubscription();
  return sub ? 'on' : 'off';
}

/** Pede permissão, assina o push neste aparelho e grava a inscrição para o gerente poder avisar. */
export async function enablePush(uid: string, name: string): Promise<void> {
  if (!isPushSupported()) throw new Error('Este navegador não suporta avisos.');
  if (!db) throw new Error('Firebase não configurado.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Permissão negada. Libere as notificações nas configurações do navegador.');

  const reg = await registration();
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toUint8(VAPID_PUBLIC_KEY) }));

  const id = await subscriptionId(sub.endpoint);
  await setDoc(doc(db, 'push_subscriptions', id), {
    uid,
    name,
    endpoint: sub.endpoint,
    user_agent: navigator.userAgent.slice(0, 160),
    created_at: new Date().toISOString(),
  });
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration('/sw.js');
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  if (db) await deleteDoc(doc(db, 'push_subscriptions', await subscriptionId(sub.endpoint))).catch(() => {});
  await sub.unsubscribe();
}

async function workerUrl(): Promise<string | null> {
  const settings = await getFiscalSettings(); // o endereço do Worker é o mesmo usado pela nota fiscal
  return settings.endpoint ? settings.endpoint.replace(/\/$/, '') : null;
}

/** Manda o aviso de "nova entrega" para todos os aparelhos do entregador. Nunca lança erro: avisar é um extra. */
export async function notifyDriver(driverUid: string): Promise<{ sent: number }> {
  try {
    if (!db || !driverUid) return { sent: 0 };
    const base = await workerUrl();
    const token = await auth?.currentUser?.getIdToken();
    if (!base || !token) return { sent: 0 };

    const snap = await getDocs(query(collection(db, 'push_subscriptions'), where('uid', '==', driverUid)));
    let sent = 0;
    await Promise.all(snap.docs.map(async (d) => {
      const res = await fetch(`${base}/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ endpoint: d.data().endpoint }),
      });
      const body = await res.json().catch(() => ({}));
      if (body.ok) sent++;
      if (body.gone) await deleteDoc(d.ref).catch(() => {}); // aparelho que cancelou os avisos
    }));
    return { sent };
  } catch (err) {
    console.warn('Não foi possível enviar o aviso ao entregador:', err);
    return { sent: 0 };
  }
}
