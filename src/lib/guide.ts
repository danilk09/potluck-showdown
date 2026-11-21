import AsyncStorage from "@react-native-async-storage/async-storage";

// The "How it works" walkthrough opens once, right after someone creates an
// account (or a guest pass) on this device. Signing in to an existing account
// never shows it; it stays available from Home → How it works.
const KEY = "ps-guide-new-account";

export function markNewAccount(): Promise<void> {
  return AsyncStorage.setItem(KEY, "1").catch(() => {});
}

/** True once for a brand-new account, then never again. */
export async function takeNewAccountGuide(): Promise<boolean> {
  try {
    const pending = await AsyncStorage.getItem(KEY);
    if (pending) await AsyncStorage.removeItem(KEY);
    return Boolean(pending);
  } catch {
    return false;
  }
}

/** Forget the flag (a sign-up that failed shouldn't open the walkthrough later). */
export function clearNewAccount(): Promise<void> {
  return AsyncStorage.removeItem(KEY).catch(() => {});
}
