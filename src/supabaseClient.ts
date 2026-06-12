import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = false; // Temporarily disabled for verification


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

const getLocalPets = (): MockPet[] => {
  const data = localStorage.getItem('laviola_pets');
  return data ? JSON.parse(data) : [];
};

const saveLocalPets = (pets: MockPet[]) => {
  localStorage.setItem('laviola_pets', JSON.stringify(pets));
};

const getLocalAppointments = (): MockAppointment[] => {
  const data = localStorage.getItem('laviola_appointments');
  return data ? JSON.parse(data) : [];
};

const saveLocalAppointments = (appointments: MockAppointment[]) => {
  localStorage.setItem('laviola_appointments', JSON.stringify(appointments));
};

interface MockProduct {
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

const getLocalProducts = (): MockProduct[] => {
  const data = localStorage.getItem('laviola_products');
  if (data) return JSON.parse(data);

  const defaultProducts: MockProduct[] = [
    {
      id: 'prod-1',
      name: 'Ração Golden Cães Adultos 15kg',
      category: 'Ração / Alimentos',
      brand: 'Premier Golden',
      price: 155.90,
      cost_price: 105.00,
      quantity: 8,
      min_stock: 3,
      sku: '7891011121314',
      created_at: new Date().toISOString()
    },
    {
      id: 'prod-2',
      name: 'Shampoo Anticoceira Pet 500ml',
      category: 'Higiene & Beleza',
      brand: 'Pet Clean',
      price: 38.50,
      cost_price: 22.00,
      quantity: 2,
      min_stock: 5,
      sku: '7891011121315',
      created_at: new Date().toISOString()
    },
    {
      id: 'prod-3',
      name: 'Anti-pulgas NexGard 10-25kg',
      category: 'Medicamentos / Farmácia',
      brand: 'Merial',
      price: 95.00,
      cost_price: 60.00,
      quantity: 0,
      min_stock: 2,
      sku: '7891011121316',
      created_at: new Date().toISOString()
    },
    {
      id: 'prod-4',
      name: 'Coleira Ajustável Azul M',
      category: 'Acessórios',
      brand: 'Petz',
      price: 25.00,
      cost_price: 12.50,
      quantity: 15,
      min_stock: 2,
      sku: '7891011121317',
      created_at: new Date().toISOString()
    },
    {
      id: 'prod-5',
      name: 'Brinquedo Mordedor Ossinho',
      category: 'Brinquedos',
      brand: 'Kong',
      price: 15.00,
      cost_price: 6.00,
      quantity: 20,
      min_stock: 5,
      sku: '7891011121318',
      created_at: new Date().toISOString()
    }
  ];
  localStorage.setItem('laviola_products', JSON.stringify(defaultProducts));
  return defaultProducts;
};

const saveLocalProducts = (products: MockProduct[]) => {
  localStorage.setItem('laviola_products', JSON.stringify(products));
};

export const mockSupabaseDb = {
  getPets: async (userId: string) => {
    const pets = getLocalPets();
    return { data: pets.filter(p => p.owner_id === userId), error: null };
  },
  getAllPets: async () => {
    const pets = getLocalPets();
    return { data: pets, error: null };
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
  getAppointments: async (userId: string, isStaff: boolean) => {
    const appointments = getLocalAppointments();
    if (isStaff) {
      return { data: appointments, error: null };
    }
    return { data: appointments.filter(a => a.owner_id === userId), error: null };
  },
  addAppointment: async (appointment: Omit<MockAppointment, 'id' | 'created_at'>) => {
    const appointments = getLocalAppointments();
    const newAppointment: MockAppointment = {
      ...appointment,
      id: Math.random().toString(36).substring(2, 9),
      created_at: new Date().toISOString(),
    };
    appointments.push(newAppointment);
    saveLocalAppointments(appointments);
    return { data: newAppointment, error: null };
  },
  updateAppointment: async (id: string, updates: Partial<Omit<MockAppointment, 'id' | 'owner_id' | 'created_at'>>) => {
    const appointments = getLocalAppointments();
    const index = appointments.findIndex(a => a.id === id);
    if (index === -1) return { data: null, error: new Error('Appointment not found') };
    appointments[index] = { ...appointments[index], ...updates };
    saveLocalAppointments(appointments);
    return { data: appointments[index], error: null };
  },
  deleteAppointment: async (id: string) => {
    const appointments = getLocalAppointments();
    const filtered = appointments.filter(a => a.id !== id);
    saveLocalAppointments(filtered);
    return { error: null };
  },
  getProducts: async () => {
    const products = getLocalProducts();
    return { data: products, error: null };
  },
  addProduct: async (product: Omit<MockProduct, 'id' | 'created_at'>) => {
    const products = getLocalProducts();
    const newProduct: MockProduct = {
      ...product,
      id: Math.random().toString(36).substring(2, 9),
      created_at: new Date().toISOString(),
    };
    products.push(newProduct);
    saveLocalProducts(products);
    return { data: newProduct, error: null };
  },
  updateProduct: async (id: string, updates: Partial<Omit<MockProduct, 'id' | 'created_at'>>) => {
    const products = getLocalProducts();
    const index = products.findIndex(p => p.id === id);
    if (index === -1) return { data: null, error: new Error('Product not found') };
    products[index] = { ...products[index], ...updates };
    saveLocalProducts(products);
    return { data: products[index], error: null };
  },
  deleteProduct: async (id: string) => {
    const products = getLocalProducts();
    const filtered = products.filter(p => p.id !== id);
    saveLocalProducts(filtered);
    return { error: null };
  },
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

export const logAction = async (
  userEmail: string,
  userName: string,
  action: string,
  details: string
): Promise<void> => {
  const timestamp = new Date().toISOString();
  try {
    if (!supabase) {
      const localLogs: AuditLog[] = JSON.parse(localStorage.getItem('laviola_audit_logs') || '[]');
      localLogs.push({
        id: Math.random().toString(36).substring(2, 9),
        user_email: userEmail,
        user_name: userName,
        action,
        details,
        created_at: timestamp,
      });
      localStorage.setItem('laviola_audit_logs', JSON.stringify(localLogs));
      return;
    }

    const { error } = await supabase.from('audit_logs').insert({
      user_email: userEmail,
      user_name: userName,
      action,
      details,
      created_at: timestamp,
    });

    if (error) {
      console.warn('Erro ao inserir log no Supabase, caindo no localStorage:', error);
      const localLogs: AuditLog[] = JSON.parse(localStorage.getItem('laviola_audit_logs') || '[]');
      localLogs.push({
        id: Math.random().toString(36).substring(2, 9),
        user_email: userEmail,
        user_name: userName,
        action,
        details,
        created_at: timestamp,
      });
      localStorage.setItem('laviola_audit_logs', JSON.stringify(localLogs));
    }
  } catch (err) {
    console.error('Falha ao registrar log:', err);
  }
};

export const fetchLogs = async (): Promise<AuditLog[]> => {
  const localLogs: AuditLog[] = JSON.parse(localStorage.getItem('laviola_audit_logs') || '[]');
  if (!supabase) {
    return localLogs.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  try {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Erro ao buscar logs do Supabase, retornando locais:', error);
      return localLogs.sort((a, b) => b.created_at.localeCompare(a.created_at));
    }

    // Merge both local and Supabase logs
    const combined = [...(data || []), ...localLogs];
    return combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  } catch (err) {
    console.error('Falha ao obter logs:', err);
    return localLogs.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
};

