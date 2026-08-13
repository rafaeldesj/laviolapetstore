import { useState, useEffect } from 'react';
import {
  supabase,
  isSupabaseConfigured,
  lookupEmailByIdentifier,
} from '../supabaseClient';
import type { UserProfile } from '../supabaseClient';
import { logAction } from '../supabaseClient';

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

    const profile = data as UserProfile | null;
    
    // Normalize role (from Portuguese to English) to ensure compatibility
    if (profile && profile.role) {
      if (profile.role as string === 'desenvolvedor') profile.role = 'developer';
      if (profile.role as string === 'proprietaria') profile.role = 'owner';
      if (profile.role as string === 'gerente') profile.role = 'manager';
      if (profile.role as string === 'colaborador') profile.role = 'collaborator';
      if (profile.role as string === 'cliente') profile.role = 'client';
    }

    return {
      id: userId,
      email,
      name: data?.full_name || name,
      profile: profile,
    };
  };

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
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
      const found = users.find((u: any) =>
        u.email === identifier || u.username === identifier || u.phone === identifier
      );
      const loggedUser: AuthUser = found
        ? { id: found.id, email: found.email, name: found.name, profile: null }
        : { id: 'mock-user-123', email: identifier, name: identifier.split('@')[0], profile: null };
      localStorage.setItem('laviola_mock_session', JSON.stringify(loggedUser));
      setUser(loggedUser);
      return;
    }

    const email = await lookupEmailByIdentifier(identifier);
    if (!email) throw new Error('Usuário não encontrado com esse identificador.');

    const { error: signInError, data } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;
    
    if (data.user) {
      const authUser = await fetchProfile(data.user.id, data.user.email || '', data.user.user_metadata?.full_name || '');
      if (authUser.profile?.role !== 'developer') {
        await logAction(authUser.email, authUser.name, 'Login', 'O usuário entrou no sistema.');
      }
    }
  };

  const logout = async () => {
    if (user && user.profile?.role !== 'developer') {
      await logAction(user.email, user.name, 'Logout', 'O usuário saiu do sistema.');
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
