import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp } from 'firebase/app';
// getReactNativePersistence comes from Firebase's React Native build, which
// Metro picks automatically (the web typings just don't declare it).
import { connectAuthEmulator, getAuth, getReactNativePersistence, initializeAuth } from 'firebase/auth';
import {
  connectFirestoreEmulator, initializeFirestore, memoryLocalCache, persistentLocalCache, persistentMultipleTabManager,
} from 'firebase/firestore';

const env = process.env;

const config = {
  apiKey: env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

// Without real credentials, run fully local against the Firebase emulators.
export const usingEmulators = !config.apiKey;

const app = initializeApp(
  usingEmulators ? { apiKey: 'demo-key', projectId: 'demo-potluck', authDomain: 'demo-potluck.firebaseapp.com' } : config,
);

const isWeb = Platform.OS === 'web';

// On phones, sign-ins persist in AsyncStorage; browsers use IndexedDB.
export const auth = isWeb ? getAuth(app) : initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });

// IndexedDB (offline cache) only exists in browsers; phones keep an in-memory cache.
export const db = initializeFirestore(app, {
  localCache: isWeb ? persistentLocalCache({ tabManager: persistentMultipleTabManager() }) : memoryLocalCache(),
  experimentalAutoDetectLongPolling: true,
});

/**
 * Where the emulators run. Expo Go loads the app from the dev computer, so
 * that computer's address (from the dev server URL) also reaches the emulators.
 */
function detectEmulatorHost() {
  if (env.EXPO_PUBLIC_EMULATOR_HOST) return env.EXPO_PUBLIC_EMULATOR_HOST;
  if (isWeb) return typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1';
  const hostUri = Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost ?? '';
  const host = hostUri.split(':')[0];
  if (host) return host;
  return Platform.OS === 'android' ? '10.0.2.2' : '127.0.0.1';
}

export const emulatorHost = detectEmulatorHost();

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
