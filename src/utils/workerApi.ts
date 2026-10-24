import { auth } from '../firebaseClient';

/**
 * Fala com o Worker (Cloudflare), que é a única porta de entrada para o banco de produtos e da agenda (Supabase).
 * O Worker confere o login (token do Firebase) e o cargo antes de qualquer coisa.
 */

export class WorkerError extends Error {
  status: number;
  body: any;
  constructor(message: string, status = 0, body: any = null) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

// O endereço do Worker normalmente vem de Configurações > Nota Fiscal (dá pra trocar sem alterar código, se um dia
// o Worker for redeployado noutro endereço). Mas essa configuração mora no Firestore, e o documento só pode ser lido
// por quem já está logado como equipe — antes do login (achar o e-mail pelo apelido, checar duplicidade no cadastro)
// ninguém tem essa permissão ainda. Por isso existe este valor de reserva: sem ele, logar pela primeira vez num
// aparelho novo (sem nada salvo ainda) ficava impossível. O endereço do Worker não é segredo — é a mesma URL pública
// que todo navegador logado já chama o tempo todo.
const FALLBACK_WORKER_BASE = 'https://laviola-fiscal.laviolapetstore.workers.dev';

let baseMemo: string | null = null;
async function workerBase(): Promise<string> {
  if (baseMemo) return baseMemo;
  try {
    const { getFiscalSettings } = await import('./fiscal');
    const settings = await getFiscalSettings(); // o endereço do Worker é o mesmo configurado para a nota fiscal
    if (settings.endpoint) {
      baseMemo = settings.endpoint.replace(/\/$/, '');
      return baseMemo;
    }
  } catch { /* sem acesso ainda (ex.: antes do login): usa a reserva abaixo */ }
  baseMemo = FALLBACK_WORKER_BASE;
  return baseMemo;
}

/**
 * Como workerCall, mas para as rotas que precisam funcionar ANTES do login (achar o e-mail pelo apelido/celular,
 * conferir duplicidade no cadastro). Não manda o token do Firebase, porque a pessoa ainda não está logada.
 */
export async function workerCallPublic<T = any>(path: string): Promise<T> {
  const res = await fetch(`${await workerBase()}${path}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new WorkerError(body.mensagem || `Erro ${res.status} ao falar com o servidor.`, res.status, body);
  return body as T;
}

export async function workerCall<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new WorkerError('Você precisa estar logado.');
  const res = await fetch(`${await workerBase()}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new WorkerError(body.mensagem || `Erro ${res.status} ao falar com o servidor.`, res.status, body);
  return body as T;
}

/** Como workerCall, mas devolve a resposta crua (arquivos: XML, PDF). Lança erro se não vier 200. */
export async function workerRaw(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new WorkerError('Você precisa estar logado.');
  const res = await fetch(`${await workerBase()}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new WorkerError(body.mensagem || `Erro ${res.status} ao falar com o servidor.`, res.status, body);
  }
  return res;
}
