import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { toMillis } from "../lib/scoring";
import { useAuth } from "./AuthContext";

/** All potlucks the signed-in user belongs to, soonest first. */
export function useMyPotlucks() {
  const { user } = useAuth();
  const uid = user?.uid;
  const potlucks = useQuery(api.potlucks.listMyPotlucks, uid ? { userId: uid } : "skip");
  const data = useMemo(() => {
    if (!potlucks) return [];
    return [...potlucks].sort((a, b) => toMillis(a.startsAt) - toMillis(b.startsAt));
  }, [potlucks]);

  return {
    data,
    loading: potlucks === undefined && Boolean(uid),
    error: null,
  };
}

export function usePotluck(potluckId?: string | null) {
  const potluck = useQuery(api.potlucks.get, potluckId ? { potluckId } : "skip");
  return {
    data: potluck ?? null,
    loading: potluck === undefined && Boolean(potluckId),
    error: null,
  };
}

export function useDish(dishId?: string | null) {
  const dish = useQuery(api.dishes.get, dishId ? { dishId } : "skip");
  return {
    data: dish ?? null,
    loading: dish === undefined && Boolean(dishId),
    error: null,
  };
}

export function useDocData(path?: string | null): { data: any; loading: boolean; error: any } {
  const isDish = Boolean(path?.includes('/dishes/'));
  const dishId = isDish ? path!.split('/dishes/')[1] : null;
  const potluckId = !isDish && path?.startsWith('potlucks/') ? path.replace('potlucks/', '') : null;

  const dish = useQuery(api.dishes.get, dishId ? { dishId } : "skip");
  const potluck = useQuery(api.potlucks.get, potluckId ? { potluckId } : "skip");

  const data = isDish ? (dish ?? null) : (potluck ?? null);
  const loading = isDish ? dish === undefined && Boolean(dishId) : potluck === undefined && Boolean(potluckId);

  return {
    data,
    loading,
    error: null,
  };
}

/** Dishes are only readable by members, so pass `enabled` once membership is known. */
export function useDishes(potluckId?: string | null, enabled: boolean = true) {
  const dishes = useQuery(
    api.dishes.listByPotluck,
    potluckId && enabled ? { potluckId } : "skip"
  );
  return {
    data: dishes ?? [],
    loading: dishes === undefined && Boolean(potluckId && enabled),
    error: null,
  };
}

/** Set of dish ids the current user already rated in this potluck. */
export function useMyRatings(potluckId?: string | null, enabled: boolean = true) {
  const { user } = useAuth();
  const uid = user?.uid;
  const res = useQuery(
    api.voting.listMyRatings,
    potluckId && uid && enabled ? { userId: uid, potluckId } : "skip"
  );
  const ratings = useMemo(() => {
    if (!res) return new Map<string, any>();
    return new Map(res.map((r: any) => [r.dishId, r]));
  }, [res]);

  return {
    data: res ?? [],
    ratings,
    loading: res === undefined && Boolean(potluckId && uid && enabled),
    error: null,
  };
}

/** Re-renders periodically so time-based phases (scheduled voting) update on their own. */
export function useNow(intervalMs: number = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
