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

let baseMemo: string | null = null;
async function workerBase(): Promise<string> {
  if (baseMemo) return baseMemo;
  const { getFiscalSettings } = await import('./fiscal');
  const settings = await getFiscalSettings(); // o endereço do Worker é o mesmo configurado para a nota fiscal
  if (!settings.endpoint) throw new WorkerError('O endereço do serviço (Worker) não está configurado em Configurações > Nota Fiscal.');
  baseMemo = settings.endpoint.replace(/\/$/, '');
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
