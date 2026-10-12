import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

export const isNative = Capacitor.isNativePlatform();

/** Public web URL used in invite links, so invitees can join without the app. */
export function webBaseUrl() {
  const configured = import.meta.env.VITE_PUBLIC_WEB_URL;
  if (configured && !configured.includes('YOUR-PROJECT')) return configured.replace(/\/$/, '');
  if (!isNative) return window.location.origin;
  return 'https://potluck-showdown.web.app';
}

export function inviteLink(code) {
  return `${webBaseUrl()}/join/${encodeURIComponent(code)}`;
}

export function androidAppUrl() {
  return import.meta.env.VITE_ANDROID_APP_URL || '/download/potluck-showdown.apk';
}

/**
 * Opens the Android share sheet in the app, the Web Share API in supporting
 * browsers, and falls back to copying the link. Returns 'shared' | 'copied' | 'cancelled'.
 */
export async function shareLink({ title, text, url }) {
  try {
    if (isNative) {
      await Share.share({ title, text, url, dialogTitle: title });
      return 'shared';
    }
    if (navigator.share) {
      await navigator.share({ title, text, url });
      return 'shared';
    }
  } catch (err) {
    if (err?.name === 'AbortError' || /cancel/i.test(err?.message ?? '')) return 'cancelled';
  }
  await copyText(url ?? text);
  return 'copied';
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const el = document.createElement('textarea');
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    el.remove();
  }
}

export function tapFeedback(style = ImpactStyle.Light) {
  if (isNative) Haptics.impact({ style }).catch(() => {});
}
