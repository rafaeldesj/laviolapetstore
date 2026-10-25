import { workerCall } from './workerApi';
import type { UserProfile, UserRole } from '../supabaseClient';

/** O próprio cadastro (Minha Conta / troca de senha obrigatória). */
export const fetchMyProfile = async (): Promise<UserProfile | null> => {
  const { profile } = await workerCall<{ profile: UserProfile | null }>('/auth/me');
  return profile;
};

export const updateMyProfile = async (patch: Partial<Pick<UserProfile, 'full_name' | 'username' | 'phone'>> & { must_change_password?: false }): Promise<UserProfile> => {
  const { profile } = await workerCall<{ profile: UserProfile }>('/auth/me', { method: 'PATCH', body: JSON.stringify(patch) });
  return profile;
};

/** Primeiro acesso: a conta já existe no Firebase Auth, mas ainda não tem linha em 'profiles'. Sempre cria como cliente. */
export const registerMyProfile = async (input: { full_name: string; username: string; phone: string }): Promise<UserProfile> => {
  const { profile } = await workerCall<{ profile: UserProfile }>('/auth/register', { method: 'POST', body: JSON.stringify(input) });
  return profile;
};

/** Painel da equipe: listar/criar/editar/excluir cadastros de outras pessoas. */
export const listUsuarios = async (): Promise<UserProfile[]> => {
  const { usuarios } = await workerCall<{ usuarios: UserProfile[] }>('/usuarios');
  return usuarios;
};

export const createUsuario = async (input: {
  id: string; email: string; full_name: string; username: string; phone: string; role: UserRole; collaborator_specialty?: string;
}): Promise<UserProfile> => {
  const { usuario } = await workerCall<{ usuario: UserProfile }>('/usuarios', { method: 'POST', body: JSON.stringify(input) });
  return usuario;
};

export const updateUsuario = async (id: string, patch: Partial<{
  full_name: string; username: string; phone: string; role: UserRole; collaborator_specialty: string; is_active: boolean;
}>): Promise<UserProfile> => {
  const { usuario } = await workerCall<{ usuario: UserProfile }>(`/usuarios/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) });
  return usuario;
};

export const deleteUsuario = async (id: string): Promise<void> => {
  await workerCall(`/usuarios/${encodeURIComponent(id)}`, { method: 'DELETE' });
};
