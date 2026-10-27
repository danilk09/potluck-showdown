import { ConvexReactClient } from "convex/react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import Constants from "expo-constants";

function resolveConvexUrl(): string {
  const configured = process.env.EXPO_PUBLIC_CONVEX_URL || "http://127.0.0.1:3212";
  if (!configured.includes("127.0.0.1") && !configured.includes("localhost")) {
    return configured;
  }
  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && window.location.hostname) {
      return configured.replace(/127\.0\.0\.1|localhost/, window.location.hostname);
    }
    return configured;
  }
  // Native phone (iOS or Android in Expo Go)
  const hostUri = Constants.expoConfig?.hostUri ?? (Constants as any).expoGoConfig?.debuggerHost ?? "";
  const host = hostUri.split(":")[0];
  if (host) {
    return configured.replace(/127\.0\.0\.1|localhost/, host);
  }
  return Platform.OS === "android" ? configured.replace(/127\.0\.0\.1|localhost/, "10.0.2.2") : configured;
}

export const convex = new ConvexReactClient(resolveConvexUrl(), {
  unsavedChangesWarning: false,
});

const TOKEN_KEY = "potluck_session_token";

export async function getStoredToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setStoredToken(token: string | null): Promise<void> {
  try {
    if (token) {
      await AsyncStorage.setItem(TOKEN_KEY, token);
    } else {
      await AsyncStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // ignore
  }
}
