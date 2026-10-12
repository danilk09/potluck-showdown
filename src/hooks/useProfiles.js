import { useEffect, useReducer } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

// Small shared cache of public profiles (name, avatar, frame). Profiles can
// only be fetched by id (rules forbid listing), which is exactly how avatars
// are rendered: from the author/member ids already on a potluck or dish.
const cache = new Map();
const inflight = new Set();
const listeners = new Set();

function emit() {
  listeners.forEach((l) => l());
}

export function primeProfile(uid, data) {
  cache.set(uid, data);
  emit();
}

function fetchProfile(uid) {
  if (!uid || cache.has(uid) || inflight.has(uid)) return;
  inflight.add(uid);
  getDoc(doc(db, 'publicProfiles', uid))
    .then((s) => cache.set(uid, s.exists() ? s.data() : null))
    .catch(() => cache.set(uid, null))
    .finally(() => {
      inflight.delete(uid);
      emit();
    });
}

/** Returns a lookup `(uid) => profile | null | undefined` and loads missing ones. */
export function useProfiles(uids) {
  const [, rerender] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    listeners.add(rerender);
    return () => listeners.delete(rerender);
  }, []);
  const key = (uids ?? []).filter(Boolean).join(',');
  useEffect(() => {
    key.split(',').forEach(fetchProfile);
  }, [key]);
  return (uid) => cache.get(uid);
}

export function useProfile(uid) {
  return useProfiles(uid ? [uid] : [])(uid);
}
