import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { toMillis } from '../lib/scoring';
import { useAuth } from './AuthContext';

const withId = (snap) => ({ id: snap.id, ...snap.data({ serverTimestamps: 'estimate' }) });

/** Live document by path ("potlucks/abc"). `null` path = idle. */
export function useDocData(path) {
  const [state, setState] = useState({ data: undefined, loading: Boolean(path), error: null, path });
  useEffect(() => {
    if (!path) return undefined;
    return onSnapshot(
      doc(db, path),
      (snap) => setState({ data: snap.exists() ? withId(snap) : null, loading: false, error: null, path }),
      (error) => setState({ data: null, loading: false, error, path }),
    );
  }, [path]);
  if (!path) return { data: null, loading: false, error: null };
  // Avoid flashing the previous document's data while a new path loads.
  return state.path === path ? state : { data: undefined, loading: true, error: null };
}

/** Live query. `key` identifies the query for re-subscription; `build` returns the Query or null. */
export function useQueryData(key, build) {
  const [state, setState] = useState({ data: [], loading: Boolean(key), error: null, key });
  useEffect(() => {
    if (!key) return undefined;
    const q = build();
    return onSnapshot(
      q,
      (snap) => setState({ data: snap.docs.map(withId), loading: false, error: null, key }),
      (error) => setState({ data: [], loading: false, error, key }),
    );
    // `build` is intentionally keyed by `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!key) return { data: [], loading: false, error: null };
  return state.key === key ? state : { data: [], loading: true, error: null };
}

/** All potlucks the signed-in user belongs to, soonest first. */
export function useMyPotlucks() {
  const { user } = useAuth();
  const uid = user?.uid;
  const res = useQueryData(uid && `mine:${uid}`, () =>
    query(collection(db, 'potlucks'), where('memberIds', 'array-contains', uid)));
  const data = useMemo(
    () => [...res.data].sort((a, b) => toMillis(a.startsAt) - toMillis(b.startsAt)),
    [res.data],
  );
  return { ...res, data };
}

export function usePotluck(potluckId) {
  return useDocData(potluckId ? `potlucks/${potluckId}` : null);
}

/** Dishes are only readable by members, so pass `enabled` once membership is known. */
export function useDishes(potluckId, enabled = true) {
  return useQueryData(potluckId && enabled ? `dishes:${potluckId}` : null, () =>
    collection(db, 'potlucks', potluckId, 'dishes'));
}

/** Set of dish ids the current user already rated in this potluck. */
export function useMyRatings(potluckId, enabled = true) {
  const { user } = useAuth();
  const uid = user?.uid;
  const res = useQueryData(potluckId && uid && enabled ? `ratings:${potluckId}:${uid}` : null, () =>
    query(collection(db, 'potlucks', potluckId, 'ratings'), where('uid', '==', uid)));
  const ratings = useMemo(() => new Map(res.data.map((r) => [r.dishId, r])), [res.data]);
  return { ...res, ratings };
}

/** Re-renders periodically so time-based phases (scheduled voting) update on their own. */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
