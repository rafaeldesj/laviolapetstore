import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebaseClient';

export const checkEmailExists = async (email: string, excludeId?: string): Promise<boolean> => {
  if (!db) return false;
  const q = query(collection(db, 'profiles'), where('email', '==', email.trim()));
  const snap = await getDocs(q);
  if (snap.empty) return false;
  if (excludeId) {
    return snap.docs.some(doc => doc.id !== excludeId);
  }
  return true;
};

export const checkPhoneExists = async (phone: string, excludeId?: string): Promise<boolean> => {
  if (!db) return false;
  const q = query(collection(db, 'profiles'), where('phone', '==', phone.trim()));
  const snap = await getDocs(q);
  if (snap.empty) return false;
  if (excludeId) {
    return snap.docs.some(doc => doc.id !== excludeId);
  }
  return true;
};

export const checkUsernameExists = async (username: string, excludeId?: string): Promise<boolean> => {
  if (!db) return false;
  const q = query(collection(db, 'profiles'), where('username', '==', username.trim()));
  const snap = await getDocs(q);
  if (snap.empty) return false;
  if (excludeId) {
    return snap.docs.some(doc => doc.id !== excludeId);
  }
  return true;
};

export const generateUsernameSuggestions = async (baseUsername: string): Promise<string[]> => {
  const suggestions: string[] = [];
  const base = baseUsername.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
  
  if (!base) return [];

  const candidates = [
    `${base}1`,
    `${base}123`,
    `${base}_pet`,
    `${base}_oficial`,
    `${base}br`,
    `${base}2026`,
    `${base}_${Math.floor(Math.random() * 999)}`
  ];

  for (const candidate of candidates) {
    if (suggestions.length >= 3) break;
    const exists = await checkUsernameExists(candidate);
    if (!exists) {
      suggestions.push(candidate);
    }
  }

  return suggestions;
};
