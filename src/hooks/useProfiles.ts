import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAuth } from "./AuthContext";
import { profileCache as cache } from "./profileCache";

/** Returns a lookup `(uid) => profile | null | undefined` and loads missing ones. */
export function useProfiles(uids?: (string | null | undefined)[]) {
  const { sessionToken } = useAuth();
  const cleanUids = useMemo(
    () => Array.from(new Set((uids ?? []).filter(Boolean) as string[])),
    [uids]
  );

  const profilesMap = useQuery(
    api.users.getProfiles,
    cleanUids.length > 0 && sessionToken ? { sessionToken, userIds: cleanUids } : "skip"
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
