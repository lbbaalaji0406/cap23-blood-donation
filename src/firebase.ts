import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getDatabase, connectDatabaseEmulator } from 'firebase/database';
import { getStorage } from 'firebase/storage';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';

const processEnv = typeof globalThis !== 'undefined' && (globalThis as any).process && (globalThis as any).process.env
  ? (globalThis as any).process.env
  : {};

const env = (typeof import.meta !== 'undefined' && (import.meta as any).env)
  ? (import.meta as any).env
  : processEnv;

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || 'mock-api-key',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || 'localhost',
  databaseURL: env.VITE_FIREBASE_DATABASE_URL || 'http://127.0.0.1:9000/?ns=cap23-blood-donation-default-rtdb',
  projectId: env.VITE_FIREBASE_PROJECT_ID || 'cap23-blood-donation',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: env.VITE_FIREBASE_APP_ID || ''
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);

// Connect to emulator if running locally
if (env.DEV) {
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectDatabaseEmulator(db, '127.0.0.1', 9000);
}

// Expose auth to window for easy console debugging and REST API testing
if (typeof window !== 'undefined') {
  (window as any).__auth = auth;
}
