import { Platform, Share } from "react-native";
import { isRunningInExpoGo } from "expo";
import Constants from "expo-constants";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";

export const isWeb = Platform.OS === "web";
export const isNative = !isWeb;

/** Public web URL used in invite links, so invitees can join without the app. */
export function webBaseUrl(): string | null {
  const configured = process.env.EXPO_PUBLIC_WEB_URL;
  if (configured && !configured.includes("YOUR-PROJECT")) return configured.replace(/\/$/, "");
  if (isWeb && typeof window !== "undefined") return window.location.origin;
  return null;
}

/**
 * Invite link for a code. With a web URL configured this is https://…/join/CODE
 * (works for anyone). Otherwise it's a link back into this app; in Expo Go
 * that's an exp:// URL other testers on the same network can open.
 * `from` is the sharer's user id, so they get credit when people join through it.
 */
export function inviteLink(code: string, from?: string | null): string {
  const path = `/join/${encodeURIComponent(code)}`;
  const query = from ? `?from=${encodeURIComponent(from)}` : "";
  const base = webBaseUrl();
  if (base) return `${base}${path}${query}`;
  // In Expo Go the app's own scheme isn't registered, so link back through the dev server.
  const hostUri = Constants.expoConfig?.hostUri;
  if (isRunningInExpoGo() && hostUri) return `exp://${hostUri}/--${path}${query}`;
  return Linking.createURL(path, from ? { queryParams: { from } } : undefined);
}

export function androidAppUrl(): string | null {
  return process.env.EXPO_PUBLIC_ANDROID_APP_URL || null;
}

/**
 * Opens the system share sheet (or the Web Share API in supporting browsers)
 * and falls back to copying. Returns 'shared' | 'copied' | 'cancelled'.
 */
export async function shareLink({
  title,
  text,
  url,
}: {
  title?: string;
  text?: string;
  url?: string;
}): Promise<"shared" | "copied" | "cancelled"> {
  const canShare = isNative || (typeof navigator !== "undefined" && Boolean(navigator.share));
  if (canShare) {
    try {
      // iOS and browsers take the link separately (and show it as a preview card); Android only reads `message`.
      const message = url && Platform.OS === "android" ? `${text ?? ""}\n${url}`.trim() : text ?? url;
      // The Web Share API resolves with nothing, so there's no `action` to read on the web.
      const res: any = await Share.share({ title, message: message || "", url }, { dialogTitle: title, subject: title });
      return res?.action === Share.dismissedAction ? "cancelled" : "shared";
    } catch (err: any) {
      if (err?.name === "AbortError" || /cancel/i.test(err?.message ?? "")) return "cancelled";
    }
  }
  await copyText(text && url ? `${text}\n${url}` : url ?? text ?? "");
  return "copied";
}

export function copyText(text: string): Promise<boolean> {
  return Clipboard.setStringAsync(text);
}

export const ImpactStyle = Haptics.ImpactFeedbackStyle;

export function tapFeedback(style: Haptics.ImpactFeedbackStyle = ImpactStyle.Light): void {
  if (isNative) Haptics.impactAsync(style).catch(() => {});
}

/** A maps search for a free-text place ("Campus Center courtyard"), opened in the phone's maps app or browser. */
export function mapsUrl(place: string): string {
  const q = encodeURIComponent(place);
  if (Platform.OS === "ios") return `http://maps.apple.com/?q=${q}`;
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}
