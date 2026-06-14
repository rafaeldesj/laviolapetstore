import { useState, useEffect } from 'react';
import {
  supabase,
  isSupabaseConfigured,
  lookupEmailByIdentifier,
  logAction,
} from '../supabaseClient';
import type { UserProfile } from '../supabaseClient';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  profile: UserProfile | null;
}

interface UseAuthReturn {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setMockUser: (u: AuthUser) => void;
}

export const useAuth = (): UseAuthReturn => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = async (userId: string, email: string, name: string): Promise<AuthUser> => {
    if (!supabase) {
      return { id: userId, email, name, profile: null };
    }
    const { data } = await supabase
      .from('profiles')
      .select(`*, collaborator_category:collaborator_categories(id, name, description, is_active)`)
      .eq('id', userId)
      .single();

    const isMockOrDbAdmin = email === 'admin@laviola.com' || name === 'admin';
    let finalProfile = data || (isMockOrDbAdmin ? {
      id: userId,
      email,
      full_name: 'Administrador Master',
      username: 'admin',
      phone: '999999999',
      role: 'developer' as const,
      collaborator_category_id: null,
      is_active: true,
      created_at: new Date().toISOString()
    } : null);

    // Force developer role for the master admin email to override database trigger defaults
    if (finalProfile && (finalProfile.email === 'admin@laviola.com' || email === 'admin@laviola.com')) {
      finalProfile = {
        ...finalProfile,
        role: 'developer' as const
      };
    }

    return {
      id: userId,
      email,
      name: finalProfile?.full_name || name || 'Admin',
      profile: finalProfile,
    };
  };

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      // Seed default mock users if not present
      const existing = localStorage.getItem('laviola_mock_users');
      if (!existing) {
        const defaultUsers = [
          {
            id: 'admin-id-999',
            email: 'admin@laviola.com',
            name: 'Administrador Master',
            username: 'admin',
            phone: '999999999',
            password: 'admin',
            profile: {
              id: 'admin-id-999',
              email: 'admin@laviola.com',
              full_name: 'Administrador Master',
              username: 'admin',
              phone: '999999999',
              role: 'developer',
              collaborator_category_id: null,
              is_active: true,
              created_at: new Date().toISOString()
            }
          },
          {
            id: 'colab-1',
            email: 'joao@laviola.com',
            name: 'João Silva',
            username: 'joao',
            phone: '888888888',
            password: '123',
            profile: {
              id: 'colab-1',
              email: 'joao@laviola.com',
              full_name: 'João Silva',
              username: 'joao',
              phone: '888888888',
              role: 'client',
              collaborator_category_id: null,
              is_active: true,
              created_at: new Date().toISOString()
            }
          },
          {
            id: 'stock-1',
            email: 'estoque@laviola.com',
            name: 'Carlos Estoque',
            username: 'estoque',
            phone: '777777777',
            password: '123',
            profile: {
              id: 'stock-1',
              email: 'estoque@laviola.com',
              full_name: 'Carlos Estoque',
              username: 'estoque',
              phone: '777777777',
              role: 'collaborator',
              collaborator_category_id: 'cat-estoquista',
              collaborator_category: { id: 'cat-estoquista', name: 'Estoquista', description: '', is_active: true },
              is_active: true,
              created_at: new Date().toISOString()
            }
          },
          {
            id: 'colab-2',
            email: 'entregador@laviola.com',
            name: 'Marcos Entregador',
            username: 'entregador',
            phone: '666666666',
            password: '123456',
            profile: {
              id: 'colab-2',
              email: 'entregador@laviola.com',
              full_name: 'Marcos Entregador',
              username: 'entregador',
              phone: '666666666',
              role: 'collaborator',
              collaborator_category_id: 'cat-entregador',
              collaborator_category: { id: 'cat-entregador', name: 'Entregador', description: '', is_active: true },
              is_active: true,
              created_at: new Date().toISOString()
            }
          }
        ];
        localStorage.setItem('laviola_mock_users', JSON.stringify(defaultUsers));
      }

      const saved = localStorage.getItem('laviola_mock_session');
      if (saved) setUser(JSON.parse(saved));
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const authUser = await fetchProfile(
          session.user.id,
          session.user.email || '',
          session.user.user_metadata?.full_name || ''
        );
        setUser(authUser);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        const authUser = await fetchProfile(
          session.user.id,
          session.user.email || '',
          session.user.user_metadata?.full_name || ''
        );
        setUser(authUser);
      } else {
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = async (identifier: string, password: string) => {
    setError(null);

    if (!isSupabaseConfigured || !supabase) {
      const users = JSON.parse(localStorage.getItem('laviola_mock_users') || '[]');
      const id = identifier.trim().toLowerCase();
      const digitsOnly = id.replace(/\D/g, '');
      const found = users.find((u: any) => {
        const byEmail      = u.email?.toLowerCase() === id;
        const byEmailPref  = u.email?.toLowerCase().split('@')[0] === id;
        const byUsername   = u.username?.toLowerCase() === id;
        const byPhone      = u.phone?.trim() === identifier.trim() || (digitsOnly && u.phone?.replace(/\D/g, '').includes(digitsOnly));
        const byName       = u.name?.toLowerCase() === id;
        const byFullName   = u.profile?.full_name?.toLowerCase() === id;
        return byEmail || byEmailPref || byUsername || byPhone || byName || byFullName;
      });

      if (found) {
        if (found.password && found.password !== password) {
          throw new Error('Senha incorreta.');
        }
        const loggedUser: AuthUser = {
          id: found.id,
          email: found.email,
          name: found.name,
          profile: found.profile || null
        };
        localStorage.setItem('laviola_mock_session', JSON.stringify(loggedUser));
        setUser(loggedUser);

        if (loggedUser.profile?.role !== 'developer') {
          await logAction(
            loggedUser.email,
            loggedUser.name,
            'Login',
            `O usuário "${loggedUser.name}" entrou no sistema.`
          );
        }

        return;
      }

      // Special fallback check if they type admin but it wasn't seeded for some reason
      if (identifier === 'admin') {
        if (password !== 'admin') {
          throw new Error('Senha incorreta.');
        }
        const adminUser: AuthUser = {
          id: 'admin-id-999',
          email: 'admin@laviola.com',
          name: 'Administrador Master',
          profile: {
            id: 'admin-id-999',
            email: 'admin@laviola.com',
            full_name: 'Administrador Master',
            username: 'admin',
            phone: '999999999',
            role: 'developer',
            collaborator_category_id: null,
            is_active: true,
            created_at: new Date().toISOString()
          }
        };
        localStorage.setItem('laviola_mock_session', JSON.stringify(adminUser));
        setUser(adminUser);
        return;
      }

      const loggedUser: AuthUser = {
        id: 'mock-user-123',
        email: identifier.includes('@') ? identifier : `${identifier}@laviola.com`,
        name: identifier.split('@')[0],
        profile: null
      };
      localStorage.setItem('laviola_mock_session', JSON.stringify(loggedUser));
      setUser(loggedUser);

      if (loggedUser.profile?.role !== 'developer') {
        await logAction(
          loggedUser.email,
          loggedUser.name,
          'Login',
          `O usuário "${loggedUser.name}" entrou no sistema.`
        );
      }

      return;
    }

    const email = await lookupEmailByIdentifier(identifier);
    if (!email) throw new Error('Usuário não encontrado com esse identificador.');

    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;

    if (signInData.user) {
      const authUser = await fetchProfile(
        signInData.user.id,
        signInData.user.email || '',
        signInData.user.user_metadata?.full_name || ''
      );
      if (authUser.profile?.role !== 'developer') {
        await logAction(
          authUser.email,
          authUser.name,
          'Login',
          `O usuário "${authUser.name}" entrou no sistema.`
        );
      }
    }
  };

  const logout = async () => {
    if (user && user.profile?.role !== 'developer') {
      await logAction(
        user.email,
        user.name,
        'Logout',
        `O usuário "${user.name}" saiu do sistema.`
      );
    }

    if (!isSupabaseConfigured || !supabase) {
      localStorage.removeItem('laviola_mock_session');
      setUser(null);
      return;
    }
    await supabase.auth.signOut();
  };

  const setMockUser = (u: AuthUser) => {
    setUser(u);
    if (!isSupabaseConfigured) {
      localStorage.setItem('laviola_mock_session', JSON.stringify(u));
    }
  };

  return { user, loading, error, login, logout, setMockUser };
};
