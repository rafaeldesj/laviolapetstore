import { useState, useEffect } from 'react';
import { auth, isFirebaseConfigured } from '../firebaseClient';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { logAction } from '../supabaseClient'; // We'll keep logAction in supabaseClient for now, but it will use Firebase
import type { UserProfile } from '../supabaseClient'; // Types will stay in supabaseClient or be moved
import { workerCallPublic } from '../utils/workerApi';
import { fetchMyProfile } from '../utils/profilesService';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  profile: UserProfile | null;
  displayName?: string;
  uid?: string;
}

/** Traduz os erros do login (inclusive os do Firebase, em inglês) para mensagens em português. */
const loginErrorMessage = (err: { code?: string; message?: string }): string => {
  const wrongCredentials = [
    'auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found',
    'auth/invalid-email', 'auth/missing-password', 'auth/invalid-login-credentials',
  ];
  if (err.message === 'User not found.' || (err.code && wrongCredentials.includes(err.code))) {
    return 'Usuário ou senha incorretos.';
  }
  if (err.code === 'auth/too-many-requests') return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
  if (err.code === 'auth/user-disabled') return 'Este usuário está desativado. Fale com a administração.';
  if (err.code === 'auth/network-request-failed') return 'Sem conexão com a internet. Verifique e tente de novo.';
  return 'Não foi possível entrar. Tente novamente.';
};

export const useAuth = () => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = async (userId: string, email: string, name: string): Promise<AuthUser> => {
    if (!isFirebaseConfigured) return { id: userId, email, name, profile: null };

    try {
      // O cadastro (cargo, nome, etc.) mora no Supabase; só o Worker fala com ele, e a autocura por e-mail
      // (perfis velhos com outro id) já acontece do lado de lá.
      let profile = await fetchMyProfile();

      // Normalize role (from Portuguese to English) to ensure compatibility
      if (profile && profile.role) {
        if (profile.role as string === 'desenvolvedor') profile.role = 'developer';
        if (profile.role as string === 'proprietaria') profile.role = 'owner';
        if (profile.role as string === 'gerente') profile.role = 'manager';
        if (profile.role as string === 'colaborador') profile.role = 'collaborator';
        if (profile.role as string === 'cliente') profile.role = 'client';
        if (profile.role as string === 'contador') profile.role = 'accountant';
      }

      // A especialidade (ex.: Entregador / Delivery, Estoquista) é gravada no perfil como texto.
      const specialty = (profile as { collaborator_specialty?: string } | null)?.collaborator_specialty;
      if (profile && specialty && !profile.collaborator_category) {
        profile.collaborator_category = { id: '', name: specialty, description: '', is_active: true };
      }
      
      return {
        id: userId,
        email,
        name: profile?.full_name || name || email.split('@')[0],
        profile
      };
    } catch (e) {
      console.error('Error fetching profile', e);
      return { id: userId, email, name, profile: null };
    }
  };

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const authUser = await fetchProfile(
          firebaseUser.uid,
          firebaseUser.email || '',
          firebaseUser.displayName || ''
        );
        setUser(authUser);
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Acha o e-mail pelo apelido/celular digitado no login. Isso passa pelo Worker (não consulta mais o Firestore
  // direto do navegador), porque achar o e-mail de qualquer pessoa exigiria deixar o cadastro de todo mundo
  // com leitura pública. O Worker devolve só o e-mail correspondente, nunca a lista de usuários.
  const lookupEmailByIdentifier = async (identifier: string): Promise<string | null> => {
    try {
      const { email } = await workerCallPublic<{ email: string | null }>(`/auth/resolve-login?id=${encodeURIComponent(identifier.trim())}`);
      return email;
    } catch {
      // Serviço fora do ar: se o que foi digitado já é um e-mail, ainda dá para tentar entrar direto com ele.
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier) ? identifier : null;
    }
  };

  const login = async (identifier: string, password: string) => {
    setError(null);
    if (!isFirebaseConfigured || !auth) throw new Error('Firebase not configured.');
    
    try {
      const email = await lookupEmailByIdentifier(identifier);
      if (!email) throw new Error('User not found.');
      
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      
      if (userCredential.user) {
        const authUser = await fetchProfile(userCredential.user.uid, userCredential.user.email || '', userCredential.user.displayName || '');
        if (authUser.profile?.role !== 'developer') {
          await logAction(authUser.email, authUser.name, 'Login', 'O usuário entrou no sistema.');
        }
      }
    } catch (err: any) {
      throw new Error(loginErrorMessage(err));
    }
  };

  const logout = async () => {
    if (user && user.profile?.role !== 'developer') {
      await logAction(user.email, user.name, 'Logout', 'O usuário saiu do sistema.');
    }
    if (auth) await signOut(auth);
  };

  const setMockUser = (u: AuthUser) => {
    setUser(u);
  };

  return { user, loading, error, login, logout, setMockUser };
};
