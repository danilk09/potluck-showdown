// Who shared the invite link that brought someone here. Kept on the device
// from the moment the link opens until an account (or guest pass) is created,
// so the sharer gets credit toward their Mentor frames.
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "ps-referrer";

export async function rememberReferrer(uid?: string | null): Promise<void> {
  if (!uid) return;
  try {
    // The first link someone opened is the one that brought them here.
    if (!(await AsyncStorage.getItem(KEY))) await AsyncStorage.setItem(KEY, uid);
  } catch {
    // Storage can be unavailable (private browsing); the credit is just skipped.
  }
}

/** The stored referrer, if any. */
export async function storedReferrer(): Promise<string | undefined> {
  try {
    return (await AsyncStorage.getItem(KEY)) ?? undefined;
  } catch {
    return undefined;
  }
}

/** Forget the referrer once an account has been created with it. */
export async function clearReferrer(): Promise<void> {
  await AsyncStorage.removeItem(KEY).catch(() => {});
}
