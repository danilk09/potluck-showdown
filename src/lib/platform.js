import { Platform, Share } from 'react-native';
import { isRunningInExpoGo } from 'expo';
import Constants from 'expo-constants';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';

export const isWeb = Platform.OS === 'web';
export const isNative = !isWeb;

/** Public web URL used in invite links, so invitees can join without the app. */
export function webBaseUrl() {
  const configured = process.env.EXPO_PUBLIC_WEB_URL;
  if (configured && !configured.includes('YOUR-PROJECT')) return configured.replace(/\/$/, '');
  if (isWeb && typeof window !== 'undefined') return window.location.origin;
  return null;
}

/**
 * Invite link for a code. With a web URL configured this is https://…/join/CODE
 * (works for anyone). Otherwise it's a link back into this app; in Expo Go
 * that's an exp:// URL other testers on the same network can open.
 */
export function inviteLink(code) {
  const path = `/join/${encodeURIComponent(code)}`;
  const base = webBaseUrl();
  if (base) return `${base}${path}`;
  // In Expo Go the app's own scheme isn't registered, so link back through the dev server.
  const hostUri = Constants.expoConfig?.hostUri;
  if (isRunningInExpoGo() && hostUri) return `exp://${hostUri}/--${path}`;
  return Linking.createURL(path);
}

export function androidAppUrl() {
  return process.env.EXPO_PUBLIC_ANDROID_APP_URL || null;
}

/**
 * Opens the system share sheet (or the Web Share API in supporting browsers)
 * and falls back to copying. Returns 'shared' | 'copied' | 'cancelled'.
 */
export async function shareLink({ title, text, url }) {
  const canShare = isNative || (typeof navigator !== 'undefined' && navigator.share);
  if (canShare) {
    try {
      // iOS shows `url` as a link preview; Android only reads `message`.
      const message = url && Platform.OS !== 'ios' ? `${text ?? ''}\n${url}`.trim() : text ?? url;
      const res = await Share.share({ title, message, url }, { dialogTitle: title, subject: title });
      return res.action === Share.dismissedAction ? 'cancelled' : 'shared';
    } catch (err) {
      if (err?.name === 'AbortError' || /cancel/i.test(err?.message ?? '')) return 'cancelled';
    }
  }
  await copyText(url ?? text);
  return 'copied';
}

export function copyText(text) {
  return Clipboard.setStringAsync(text);
}

export const ImpactStyle = Haptics.ImpactFeedbackStyle;

export function tapFeedback(style = ImpactStyle.Light) {
  if (isNative) Haptics.impactAsync(style).catch(() => {});
}
