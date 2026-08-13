import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Check if Firebase is configured
export const isFirebaseConfigured = 
  !!firebaseConfig.apiKey && 
  !!firebaseConfig.projectId;

const app = isFirebaseConfigured && getApps().length === 0 ? initializeApp(firebaseConfig) : (getApps().length > 0 ? getApps()[0] : null);

// Secondary app instance for creating users without logging out the admin
const secondaryApp = isFirebaseConfigured ? initializeApp(firebaseConfig, 'Secondary') : null;

export const db = app ? getFirestore(app) : null;
export const auth = app ? getAuth(app) : null;
export const secondaryAuth = secondaryApp ? getAuth(secondaryApp) : null;
