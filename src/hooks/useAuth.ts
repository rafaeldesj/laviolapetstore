import { useState, useEffect } from 'react';
import { auth, db, isFirebaseConfigured } from '../firebaseClient';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { logAction } from '../supabaseClient'; // We'll keep logAction in supabaseClient for now, but it will use Firebase
import type { UserProfile } from '../supabaseClient'; // Types will stay in supabaseClient or be moved

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  profile: UserProfile | null;
}

export const useAuth = () => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = async (userId: string, email: string, name: string): Promise<AuthUser> => {
    if (!isFirebaseConfigured || !db) return { id: userId, email, name, profile: null };
    
    try {
      const docRef = doc(db, 'profiles', userId);
      const docSnap = await getDoc(docRef);
      let profile = docSnap.exists() ? (docSnap.data() as UserProfile) : null;
      
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

  const lookupEmailByIdentifier = async (identifier: string): Promise<string | null> => {
    if (identifier.toLowerCase() === 'admin') return 'admin@laviola.com';
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);
    if (isEmail) return identifier;

    const cleanInput = identifier.trim();
    if (!db) return identifier;

    const qUsername = query(collection(db, 'profiles'), where('username', '==', cleanInput));
    const snapUser = await getDocs(qUsername);
    if (!snapUser.empty) return snapUser.docs[0].data().email;
    
    return null;
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
      throw new Error(err.message || 'Erro ao fazer login.');
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
