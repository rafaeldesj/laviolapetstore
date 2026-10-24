import { workerCall, workerRaw, WorkerError } from './workerApi';
import type { PetDocument } from './petsService';

/**
 * Foto e documentos do pet (pedigree, documento de identidade, carteira de vacinação...).
 * Os arquivos ficam no Supabase Storage, servidos só pelo Worker: cada pedido confere se quem está pedindo
 * é o próprio tutor do pet ou a equipe, nunca entrega o arquivo de um pet de outra pessoa.
 */

async function blobUrl(res: Response): Promise<string> {
  return URL.createObjectURL(await res.blob());
}

/** Busca a foto do pet. Devolve null se o pet ainda não tiver foto (não é erro). */
export async function fetchPetPhotoUrl(petId: string): Promise<string | null> {
  try {
    const res = await workerRaw(`/pets/${encodeURIComponent(petId)}/photo`);
    return await blobUrl(res);
  } catch (e) {
    if (e instanceof WorkerError && e.status === 404) return null;
    throw e;
  }
}

export async function uploadPetPhoto(petId: string, file: File): Promise<void> {
  await workerRaw(`/pets/${encodeURIComponent(petId)}/photo`, { method: 'PUT', headers: { 'Content-Type': file.type || 'image/jpeg' }, body: file });
}

export async function deletePetPhoto(petId: string): Promise<void> {
  await workerCall(`/pets/${encodeURIComponent(petId)}/photo`, { method: 'DELETE' });
}

/** Sobe o documento e já devolve a lista de documentos do pet atualizada (o Worker guarda o rótulo junto). */
export async function uploadPetDocument(petId: string, docId: string, file: File, label: string): Promise<PetDocument[]> {
  const res = await workerRaw(`/pets/${encodeURIComponent(petId)}/docs/${encodeURIComponent(docId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-Doc-Label': label },
    body: file,
  });
  return ((await res.json()) as { documents: PetDocument[] }).documents;
}

export async function deletePetDocument(petId: string, docId: string): Promise<PetDocument[]> {
  const body = await workerCall<{ documents: PetDocument[] }>(`/pets/${encodeURIComponent(petId)}/docs/${encodeURIComponent(docId)}`, { method: 'DELETE' });
  return body.documents;
}

/** Abre o documento numa aba nova (PDF) ou devolve a URL para mostrar (imagem). */
export async function openPetDocument(petId: string, docId: string): Promise<void> {
  const res = await workerRaw(`/pets/${encodeURIComponent(petId)}/docs/${encodeURIComponent(docId)}`);
  const url = await blobUrl(res);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export const newDocId = (): string => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
