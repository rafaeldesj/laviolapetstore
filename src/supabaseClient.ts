// @ts-nocheck
import { db } from './firebaseClient';
import { collection, addDoc, getDocs, updateDoc, deleteDoc, doc, query, where } from 'firebase/firestore';
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

export type UserRole = 'developer' | 'owner' | 'manager' | 'collaborator' | 'client';

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
  clientAddress?: any;
  name?: string;
  pagbank_card_token?: string;
  pagbank_card_brand?: string;
  pagbank_card_last_digits?: string;
  phoneNumber?: string;
  cpf?: string;
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
  client: 0,
};

export const roleLabels: Record<UserRole, string> = {
  developer: 'Desenvolvedor',
  owner: 'Proprietário',
  manager: 'Gerente',
  collaborator: 'Colaborador',
  client: 'Cliente',
};

export const canManage = (actorRole: UserRole, targetRole: UserRole): boolean => {
  return roleHierarchy[actorRole] > roleHierarchy[targetRole];
};

export const hasPermission = async (userId: string, permissionKey: string): Promise<boolean> => {
  if (!db) return true;
  try {
    const q = query(collection(db, 'user_permissions'), where('user_id', '==', userId), where('permission_key', '==', permissionKey));
    const snap = await getDocs(q);
    if (!snap.empty) {
      return snap.docs[0].data().granted === true;
    }
    return false;
  } catch(e) {
    console.error(e);
    return false;
  }
};
export const lookupEmailByIdentifier = async (identifier: string): Promise<string | null> => {
  if (identifier.toLowerCase() === 'admin') return 'admin@laviola.com';
  if (!supabase) return identifier;
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);
  if (isEmail) return identifier;

  const cleanInput = identifier.trim();
  const digitsOnly = cleanInput.replace(/\D/g, '');

  try {
    let orFilter = `username.ilike."${cleanInput}",full_name.ilike."${cleanInput}",email.ilike."${cleanInput}",email.ilike."${cleanInput}@%"`;
    if (cleanInput) {
      orFilter += `,phone.eq."${cleanInput}"`;
    }
    if (digitsOnly) {
      orFilter += `,phone.like."%${digitsOnly}%"`;
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('email')
      .or(orFilter)
      .eq('is_active', true);

    if (error) {
      console.error('Erro na busca de e-mail por identificador:', error);
      return null;
    }

    if (data && data.length > 0) {
      return data[0].email;
    }
  } catch (err) {
    console.error('Falha ao buscar e-mail:', err);
  }

  return null;
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

export interface Appointment {
  id: string;
  pet_id: string;
  pet_name: string;
  owner_id: string;
  service_type: string;
  scheduled_at: string;
  status: 'Agendado' | 'Em Andamento' | 'Concluído' | 'Cancelado';
  notes: string;
  created_at: string;
}

export interface MockAppointment {
  id: string;
  pet_id: string;
  pet_name: string;
  owner_id: string;
  service_type: string;
  scheduled_at: string;
  status: 'Agendado' | 'Em Andamento' | 'Concluído' | 'Cancelado';
  notes: string;
  created_at: string;
}


export interface MockProduct {
  id: string;
  name: string;
  category: string;
  brand: string;
  price: number;
  cost_price: number;
  quantity: number;
  min_stock: number;
  sku: string;
  created_at: string;
}

export const mockSupabaseDb = {
  getPets: async (userId: string) => {
    if (!db) return { data: [], error: null };
    try {
      const q = query(collection(db, 'pets'), where('owner_id', '==', userId));
      const snap = await getDocs(q);
      const data = snap.docs.map((d: any) => ({ id: d.id, ...d.data() } as MockPet));
      return { data, error: null };
    } catch(e: unknown) { return { data: null, error: e as Error }; }
  },
  getAllPets: async () => {
    if (!db) return { data: [], error: null };
    try {
      const snap = await getDocs(collection(db, 'pets'));
      const data = snap.docs.map((d: any) => ({ id: d.id, ...d.data() } as MockPet));
      return { data, error: null };
    } catch(e: unknown) { return { data: null, error: e as Error }; }
  },
  addPet: async (pet: Omit<MockPet, 'id' | 'created_at' | 'owner_id'>, userId: string) => {
    if (!db) return { data: null, error: new Error('Firebase missing') };
    try {
      const newPet = { ...pet, owner_id: userId, created_at: new Date().toISOString() };
      const docRef = await addDoc(collection(db, 'pets'), newPet);
      return { data: { id: docRef.id, ...newPet }, error: null };
    } catch(e: unknown) { return { data: null, error: e as Error }; }
  },
  updatePet: async (id: string, updates: Partial<Omit<MockPet, 'id' | 'owner_id' | 'created_at'>>) => {
    if (!db) return { data: null, error: new Error('Firebase missing') };
    try {
      await updateDoc(doc(db, 'pets', id), updates);
      return { data: { id, ...updates }, error: null }; // Mock return
    } catch(e: unknown) { return { data: null, error: e as Error }; }
  },
  deletePet: async (id: string) => {
    if (!db) return { error: new Error('Firebase missing') };
    try {
      await deleteDoc(doc(db, 'pets', id));
      return { error: null };
    } catch(e: unknown) { return { error: e as Error }; }
  },
  getAppointments: async (userId: string, isStaff: boolean) => {
    if (!db) return { data: [], error: null };
    try {
      const q = isStaff ? collection(db, 'appointments') : query(collection(db, 'appointments'), where('owner_id', '==', userId));
      const snap = await getDocs(q);
      const data = snap.docs.map((d: any) => ({ id: d.id, ...d.data() } as MockAppointment));
      return { data, error: null };
    } catch(e: unknown) { return { data: null, error: e as Error }; }
  },
  addAppointment: async (appointment: Omit<MockAppointment, 'id' | 'created_at'>) => {
    if (!db) return { data: null, error: new Error('Firebase missing') };
    try {
      const newApp = { ...appointment, created_at: new Date().toISOString() };
      const docRef = await addDoc(collection(db, 'appointments'), newApp);
      return { data: { id: docRef.id, ...newApp }, error: null };
    } catch(e: unknown) { return { data: null, error: e as Error }; }
  },
  updateAppointment: async (id: string, updates: Partial<Omit<MockAppointment, 'id' | 'owner_id' | 'created_at'>>) => {
    if (!db) return { data: null, error: new Error('Firebase missing') };
    try {
      await updateDoc(doc(db, 'appointments', id), updates);
      return { data: { id, ...updates }, error: null };
    } catch(e: unknown) { return { data: null, error: e as Error }; }
  },
  deleteAppointment: async (id: string) => {
    if (!db) return { error: new Error('Firebase missing') };
    try {
      await deleteDoc(doc(db, 'appointments', id));
      return { error: null };
    } catch(e: unknown) { return { error: e as Error }; }
  },
  getProducts: async () => {
    if (!db) return { data: [], error: null };
    try {
      const snap = await getDocs(collection(db, 'products'));
      const data = snap.docs.map((d: any) => ({ id: d.id, ...d.data() } as MockProduct));
      return { data, error: null };
    } catch(e: unknown) { return { data: null, error: e as Error }; }
  },
  addProduct: async (product: Omit<MockProduct, 'id' | 'created_at'>) => {
    if (!db) return { data: null, error: new Error('Firebase missing') };
    try {
      const newProd = { ...product, created_at: new Date().toISOString() };
      const docRef = await addDoc(collection(db, 'products'), newProd);
      return { data: { id: docRef.id, ...newProd }, error: null };
    } catch(e: unknown) { return { data: null, error: e as Error }; }
  },
  updateProduct: async (id: string, updates: Partial<Omit<MockProduct, 'id' | 'created_at'>>) => {
    if (!db) return { data: null, error: new Error('Firebase missing') };
    try {
      await updateDoc(doc(db, 'products', id), updates);
      return { data: { id, ...updates }, error: null };
    } catch(e: unknown) { return { data: null, error: e as Error }; }
  },
  deleteProduct: async (id: string) => {
    if (!db) return { error: new Error('Firebase missing') };
    try {
      await deleteDoc(doc(db, 'products', id));
      return { error: null };
    } catch(e: unknown) { return { error: e as Error }; }
  }
};
export interface AuditLog {
  id: string;
  user_email: string;
  user_name: string;
  action: string;
  details: string;
  created_at: string;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  brand: string;
  price: number;
  cost_price: number;
  quantity: number;
  min_stock: number;
  sku: string;
  created_at: string;
}

export const logAction = async (userEmail: string, userName: string, action: string, details: string): Promise<void> => {
  const timestamp = new Date().toISOString();
  if (!db) return;
  try {
    await addDoc(collection(db, 'audit_logs'), {
      user_email: userEmail,
      user_name: userName,
      action,
      details,
      created_at: timestamp
    });
  } catch(e) {
    console.error(e);
  }
};
export const fetchLogs = async (): Promise<AuditLog[]> => {
  if (!db) return [];
  try {
    const snap = await getDocs(collection(db, 'audit_logs'));
    const logs = snap.docs.map((d: any) => ({ id: d.id, ...d.data() } as AuditLog));
    return logs.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  } catch(e) {
    console.error(e);
    return [];
  }
};
