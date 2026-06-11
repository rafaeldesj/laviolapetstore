import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = 
  supabaseUrl.trim() !== '' && 
  supabaseAnonKey.trim() !== '' &&
  !supabaseUrl.includes('placeholder') &&
  !supabaseAnonKey.includes('placeholder');

export const supabase = isSupabaseConfigured 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;

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
      created_at: new Date().toISOString()
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
  }
};
