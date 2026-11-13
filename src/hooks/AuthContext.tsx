import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { convex, getStoredToken, setStoredToken } from "../convex";
import { primeProfile } from "./useProfiles";

export interface User {
  uid: string;
  email: string | null;
  displayName: string;
  photoURL: string | null;
  frame: any;
  isAnonymous: boolean;
  isGuest: boolean;
  createdAt: number;
}

export interface Profile {
  displayName: string;
  photoURL: string | null;
  frame: any;
  isGuest: boolean;
}

export interface AuthContextType {
  user: User | null | undefined;
  /** Sent with every Convex call so the server knows who is asking. */
  sessionToken: string | null;
  profile: Profile | null;
  loading: boolean;
  isGuest: boolean;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  resetPassword: (email: string, code: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  signInGuest: (name?: string) => Promise<void>;
  upgradeGuest: (email: string, password: string) => Promise<void>;
  deleteAccount: (password?: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [sessionToken, setSessionTokenState] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    getStoredToken().then((token) => {
      setSessionTokenState(token ?? null);
    });
  }, []);

  const currentUser = useQuery(
    api.users.currentUser,
    sessionToken ? { sessionToken } : "skip"
  );

  const user: User | null | undefined =
    sessionToken === undefined
      ? undefined
      : sessionToken === null
      ? null
      : currentUser === undefined
      ? undefined
      : (currentUser as any);

  const profile: Profile | null = useMemo(() => {
    if (!user) return null;
    return {
      displayName: user.displayName,
      photoURL: user.photoURL,
      frame: user.frame,
      isGuest: user.isGuest,
    };
  }, [user]);

  // Keep the session alive while the app is in use; a dead token signs out.
  useEffect(() => {
    if (sessionToken) convex.mutation(api.users.refreshSession, { sessionToken }).catch(() => {});
  }, [sessionToken]);

  // An expired or signed-out token already makes `user` null; forget it on the device too.
  useEffect(() => {
    if (sessionToken && currentUser === null) setStoredToken(null);
  }, [sessionToken, currentUser]);

  useEffect(() => {
    if (user && profile) {
      primeProfile(user.uid, profile);
    }
  }, [user, profile]);

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      sessionToken: sessionToken ?? null,
      profile,
      loading: sessionToken === undefined || (sessionToken !== null && currentUser === undefined),
      isGuest: Boolean(user?.isGuest),

      async signUp(name, email, password) {
        const res = await convex.action(api.auth.signUp, {
          email,
          password,
          displayName: name,
        });
        await setStoredToken(res.sessionToken);
        setSessionTokenState(res.sessionToken);
      },

      async signIn(email, password) {
        const res = await convex.action(api.auth.signIn, {
          email,
          password,
        });
        await setStoredToken(res.sessionToken);
        setSessionTokenState(res.sessionToken);
      },

      async requestPasswordReset(email) {
        await convex.action(api.auth.requestPasswordReset, { email });
      },

      async resetPassword(email, code, password) {
        const res = await convex.action(api.auth.resetPassword, { email, code, password });
        await setStoredToken(res.sessionToken);
        setSessionTokenState(res.sessionToken);
      },

      async signOut() {
        if (sessionToken) await convex.mutation(api.users.signOut, { sessionToken }).catch(() => {});
        await setStoredToken(null);
        setSessionTokenState(null);
      },

      async signInGuest(name) {
        const res = await convex.action(api.auth.signInGuest, {
          displayName: name,
        });
        await setStoredToken(res.sessionToken);
        setSessionTokenState(res.sessionToken);
      },

      async upgradeGuest(email, password) {
        if (!sessionToken) throw new Error("No active session.");
        await convex.action(api.auth.upgradeGuest, {
          sessionToken,
          email,
          password,
        });
      },

      async deleteAccount(password) {
        if (!sessionToken) return;
        await convex.action(api.auth.deleteAccount, { sessionToken, password });
        await setStoredToken(null);
        setSessionTokenState(null);
      },
    }),
    [user, profile, sessionToken, currentUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export function authErrorMessage(err: any): string {
  // Server checks throw ConvexError, whose readable message is in `data`.
  if (typeof err?.data === "string") return err.data;
  const msg = err?.message || String(err);
  if (msg.includes("don’t match") || msg.includes("password")) {
    return "That email and password don’t match.";
  }
  if (msg.includes("already uses that email") || msg.includes("already in use")) {
    return "An account already uses that email. Try signing in instead.";
  }
  return msg.replace(/^Error:\s*/, "") || "Something went wrong.";
}
