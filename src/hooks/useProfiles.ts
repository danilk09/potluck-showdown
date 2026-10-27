import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

const cache = new Map<string, any>();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function primeProfile(uid: string, data: any) {
  cache.set(uid, data);
  emit();
}

/** Returns a lookup `(uid) => profile | null | undefined` and loads missing ones. */
export function useProfiles(uids?: (string | null | undefined)[]) {
  const cleanUids = useMemo(
    () => Array.from(new Set((uids ?? []).filter(Boolean) as string[])),
    [uids]
  );

  const profilesMap = useQuery(
    api.users.getProfiles,
    cleanUids.length > 0 ? { userIds: cleanUids } : "skip"
  );

  return useMemo(() => {
    if (profilesMap) {
      for (const [id, prof] of Object.entries(profilesMap)) {
        cache.set(id, prof);
      }
    }
    return (uid?: string | null) => {
      if (!uid) return null;
      return profilesMap?.[uid] ?? cache.get(uid) ?? null;
    };
  }, [profilesMap]);
}

export function useProfile(uid?: string | null) {
  const lookup = useProfiles(uid ? [uid] : []);
  return lookup(uid);
}
