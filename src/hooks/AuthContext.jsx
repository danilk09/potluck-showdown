import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  EmailAuthProvider, createUserWithEmailAndPassword, deleteUser, linkWithCredential, onAuthStateChanged,
  reauthenticateWithCredential, sendPasswordResetEmail, signInAnonymously, signInWithEmailAndPassword,
  signOut, updateProfile,
} from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { deleteMyData, ensureProfile, updateMyProfile } from '../data/api';
import { primeProfile } from './useProfiles';

// Passwords are handled entirely by Firebase Authentication (salted + hashed
// server-side by Google); the app never stores or sees them after sign-in.
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = still loading
  const [profile, setProfile] = useState(null);
  // Name typed during sign-up / guest join. The auth listener below is the one
  // place that creates profiles, so there is no race between two writers.
  const pendingName = useRef(null);
  // Bumped when the same user object changes in place (guest -> full account).
  const [userVersion, setUserVersion] = useState(0);

  useEffect(() => onAuthStateChanged(auth, (u) => {
    setUser(u);
    if (u) ensureProfile(u, pendingName.current).catch(() => {}).finally(() => { pendingName.current = null; });
  }), []);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      return undefined;
    }
    return onSnapshot(doc(db, 'publicProfiles', user.uid), (snap) => {
      // undefined (not null) while the profile is still being created.
      const data = snap.exists() ? snap.data() : undefined;
      setProfile(data);
      if (data) primeProfile(user.uid, data);
    }, () => {});
  }, [user]);

  const value = useMemo(() => ({
    user,
    profile,
    loading: user === undefined,
    isGuest: Boolean(user?.isAnonymous),

    async signUp(name, email, password) {
      pendingName.current = name;
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: name });
    },
    signIn: (email, password) => signInWithEmailAndPassword(auth, email, password),
    resetPassword: (email) => sendPasswordResetEmail(auth, email),
    signOut: () => signOut(auth),

    /** Browser invitees can take part without making an account. */
    async signInGuest(name) {
      pendingName.current = name;
      await signInAnonymously(auth);
    },

    /** Turns a guest into a full account, keeping their uid (and all their potlucks). */
    async upgradeGuest(email, password) {
      const cred = await linkWithCredential(auth.currentUser, EmailAuthProvider.credential(email, password));
      await updateMyProfile({ isGuest: false });
      await ensureProfile(cred.user);
      setUserVersion((v) => v + 1);
    },

    /** Required for Play Store apps with accounts: users can delete theirs in-app. */
    async deleteAccount(password) {
      const u = auth.currentUser;
      if (!u.isAnonymous && password) {
        await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, password));
      }
      await deleteMyData();
      await deleteUser(u);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [user, profile, userVersion]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

export function authErrorMessage(err) {
  switch (err?.code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'That email and password don’t match.';
    case 'auth/email-already-in-use':
    case 'auth/credential-already-in-use':
      return 'An account already uses that email. Try signing in instead.';
    case 'auth/weak-password':
    case 'auth/password-does-not-meet-requirements':
      return 'Please choose a stronger password (at least 8 characters).';
    case 'auth/invalid-email':
      return 'That email address doesn’t look right.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a minute and try again.';
    case 'auth/requires-recent-login':
      return 'Please enter your password again to confirm.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection.';
    case 'auth/admin-restricted-operation':
    case 'auth/operation-not-allowed':
      return 'This sign-in method isn’t enabled for this app yet.';
    default:
      return err?.message?.replace(/^Firebase:\s*/, '') ?? 'Something went wrong.';
  }
}
