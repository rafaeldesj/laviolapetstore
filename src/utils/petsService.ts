import { workerCall } from './workerApi';

/**
 * Cadastro dos pets: agora mora no Supabase (sem o limite diário de leituras do Firestore, que já travou o sistema
 * mais de uma vez). O navegador fala só com o Worker, que confere login e dono antes de qualquer coisa.
 */

export interface PetDocument {
  id: string;
  /** Pedigree, Documento de identidade, Carteira de vacinação... */
  label: string;
  content_type: string;
  uploaded_at: string;
}

export interface Pet {
  id: string;
  name: string;
  species: string;
  breed: string;
  age: number;
  /** uid do Firebase do tutor; vazio = ainda sem dono vinculado (ex.: pet trazido da agenda antiga). */
  owner_id: string;
  /** Nome do tutor (texto solto, não é conta) — ajuda a equipe a achar quem vincular. */
  tutor_hint?: string;
  imported_from_agenda?: boolean;
  documents?: PetDocument[];
  created_at: string;
}

/** Equipe: todos os pets. Cliente: só os seus. */
export async function listPets(): Promise<Pet[]> {
  const { pets } = await workerCall<{ pets: Pet[] }>('/pets');
  return pets;
}

export interface NewPetInput {
  name: string;
  species?: string;
  breed?: string;
  age?: number;
  /** Só a equipe pode indicar o dono; o cliente sempre cadastra para si mesmo. */
  owner_id?: string;
  tutor_hint?: string;
}

export async function createPet(input: NewPetInput): Promise<Pet> {
  const { pet } = await workerCall<{ pet: Pet }>('/pets', { method: 'POST', body: JSON.stringify(input) });
  return pet;
}

export interface PetPatch {
  name?: string;
  species?: string;
  breed?: string;
  age?: number;
  tutor_hint?: string;
  /** Só a equipe pode mudar o dono (vincular um pet "sem dono" ao cliente certo). */
  owner_id?: string;
}

export async function updatePet(id: string, patch: PetPatch): Promise<Pet> {
  const { pet } = await workerCall<{ pet: Pet }>(`/pets/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) });
  return pet;
}

export async function deletePet(id: string): Promise<void> {
  await workerCall(`/pets/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
