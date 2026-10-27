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
  profile: Profile | null;
  loading: boolean;
  isGuest: boolean;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
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

  useEffect(() => {
    if (user && profile) {
      primeProfile(user.uid, profile);
    }
  }, [user, profile]);

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      profile,
      loading: sessionToken === undefined || (sessionToken !== null && currentUser === undefined),
      isGuest: Boolean(user?.isGuest),

      async signUp(name, email, password) {
        const res = await convex.mutation(api.users.signUp, {
          email,
          password,
          displayName: name,
        });
        await setStoredToken(res.sessionToken);
        setSessionTokenState(res.sessionToken);
      },

      async signIn(email, password) {
        const res = await convex.mutation(api.users.signIn, {
          email,
          password,
        });
        await setStoredToken(res.sessionToken);
        setSessionTokenState(res.sessionToken);
      },

      async resetPassword(email) {
        // Placeholder for password reset flow in Convex
        console.log("Password reset requested for:", email);
      },

      async signOut() {
        await setStoredToken(null);
        setSessionTokenState(null);
      },

      async signInGuest(name) {
        const res = await convex.mutation(api.users.signInGuest, {
          displayName: name,
        });
        await setStoredToken(res.sessionToken);
        setSessionTokenState(res.sessionToken);
      },

      async upgradeGuest(email, password) {
        if (!sessionToken) throw new Error("No active session.");
        await convex.mutation(api.users.upgradeGuest, {
          sessionToken,
          email,
          password,
        });
      },

      async deleteAccount() {
        if (!sessionToken) return;
        await convex.mutation(api.users.deleteAccount, { sessionToken });
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
  const msg = err?.message || String(err);
  if (msg.includes("don’t match") || msg.includes("password")) {
    return "That email and password don’t match.";
  }
  if (msg.includes("already uses that email") || msg.includes("already in use")) {
    return "An account already uses that email. Try signing in instead.";
  }
  return msg.replace(/^Error:\s*/, "") || "Something went wrong.";
}
