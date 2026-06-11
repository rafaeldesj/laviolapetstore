import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured =
  supabaseUrl.trim() !== '' &&
  supabaseAnonKey.trim() !== '' &&
  !supabaseUrl.includes('placeholder');

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export type UserRole = 'developer' | 'owner' | 'manager' | 'collaborator';

export interface CollaboratorCategory {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  username: string | null;
  phone: string | null;
  role: UserRole;
  collaborator_category_id: string | null;
  collaborator_category?: CollaboratorCategory;
  is_active: boolean;
  created_at: string;
}

export interface PermissionKey {
  key: string;
  label: string;
  description: string;
  module: string;
}

export interface UserPermission {
  id: string;
  user_id: string;
  permission_key: string;
  granted: boolean;
  granted_by: string | null;
  granted_at: string;
}

export const roleHierarchy: Record<UserRole, number> = {
  developer: 4,
  owner: 3,
  manager: 2,
  collaborator: 1,
};

export const roleLabels: Record<UserRole, string> = {
  developer: 'Desenvolvedor',
  owner: 'Proprietário',
  manager: 'Gerente',
  collaborator: 'Colaborador',
};

export const canManage = (actorRole: UserRole, targetRole: UserRole): boolean => {
  return roleHierarchy[actorRole] > roleHierarchy[targetRole];
};

export const hasPermission = async (userId: string, permissionKey: string): Promise<boolean> => {
  if (!supabase) return true;
  const { data } = await supabase
    .from('user_permissions')
    .select('granted')
    .eq('user_id', userId)
    .eq('permission_key', permissionKey)
    .single();
  return data?.granted === true;
};

export const lookupEmailByIdentifier = async (identifier: string): Promise<string | null> => {
  if (!supabase) return identifier;
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);
  if (isEmail) return identifier;
  const isPhone = /^\+?[\d\s\-()]{8,}$/.test(identifier);
  if (isPhone) {
    const { data } = await supabase
      .from('profiles')
      .select('email')
      .eq('phone', identifier)
      .eq('is_active', true)
      .single();
    return data?.email || null;
  }
  const { data } = await supabase
    .from('profiles')
    .select('email')
    .eq('username', identifier)
    .eq('is_active', true)
    .single();
  return data?.email || null;
};

interface MockPet {
  id: string;
  name: string;
  species: string;
  breed: string;
  age: number;
  owner_id: string;
  created_at: string;
}

const getLocalPets = (): MockPet[] => {
  const data = localStorage.getItem('laviola_pets');
  return data ? JSON.parse(data) : [];
};

const saveLocalPets = (pets: MockPet[]) => {
  localStorage.setItem('laviola_pets', JSON.stringify(pets));
};

export const mockSupabaseDb = {
  getPets: async (userId: string) => {
    const pets = getLocalPets();
    return { data: pets.filter(p => p.owner_id === userId), error: null };
  },
  addPet: async (pet: Omit<MockPet, 'id' | 'created_at' | 'owner_id'>, userId: string) => {
    const pets = getLocalPets();
    const newPet: MockPet = {
      ...pet,
      id: Math.random().toString(36).substring(2, 9),
      owner_id: userId,
      created_at: new Date().toISOString(),
    };
    pets.push(newPet);
    saveLocalPets(pets);
    return { data: newPet, error: null };
  },
  updatePet: async (id: string, updates: Partial<Omit<MockPet, 'id' | 'owner_id' | 'created_at'>>) => {
    const pets = getLocalPets();
    const index = pets.findIndex(p => p.id === id);
    if (index === -1) return { data: null, error: new Error('Pet not found') };
    pets[index] = { ...pets[index], ...updates };
    saveLocalPets(pets);
    return { data: pets[index], error: null };
  },
  deletePet: async (id: string) => {
    const pets = getLocalPets();
    const filtered = pets.filter(p => p.id !== id);
    saveLocalPets(filtered);
    return { error: null };
  },
};
