// Shared cache of public profiles. Kept apart from AuthContext and useProfiles
// so those two don't import each other.
export const profileCache = new Map<string, any>();

export function primeProfile(uid: string, data: any) {
  profileCache.set(uid, data);
}
