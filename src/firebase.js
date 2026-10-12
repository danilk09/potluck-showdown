import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, indexedDBLocalPersistence, initializeAuth } from 'firebase/auth';
import {
  connectFirestoreEmulator, initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
} from 'firebase/firestore';
import { Capacitor } from '@capacitor/core';

const env = import.meta.env;

const config = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

// Without real credentials, run fully local against the Firebase emulators.
export const usingEmulators = !config.apiKey;

const app = initializeApp(
  usingEmulators ? { apiKey: 'demo-key', projectId: 'demo-potluck', authDomain: 'demo-potluck.firebaseapp.com' } : config,
);

// Inside the Android WebView the default popup/redirect resolver isn't usable,
// so native builds use IndexedDB persistence directly.
export const auth = Capacitor.isNativePlatform()
  ? initializeAuth(app, { persistence: indexedDBLocalPersistence })
  : getAuth(app);

// Persistent cache lets attended-potluck recipes load offline (see essay).
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

// 10.0.2.2 is how the Android emulator reaches the computer running it.
export const emulatorHost = env.VITE_EMULATOR_HOST || (Capacitor.getPlatform() === 'android' ? '10.0.2.2' : '127.0.0.1');

if (usingEmulators) {
  connectAuthEmulator(auth, `http://${emulatorHost}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, emulatorHost, 8080);
}

/** True if the local Auth emulator answers (only meaningful when usingEmulators). */
export async function emulatorsReachable(timeoutMs = 3000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    await fetch(`http://${emulatorHost}:9099/`, { mode: 'no-cors', signal: ctrl.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
