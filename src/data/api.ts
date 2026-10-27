import { convex, getStoredToken } from "../convex";
import { api } from "../../convex/_generated/api";
import { dishFields, potluckFields } from "./builders";
import { IMAGE_REF_PREFIX, isImageRef } from "../lib/images";
import { podiumFrom, rankDishes, resultsSummary } from "../lib/scoring";
import { normalizeInviteCode } from "../lib/inviteCode";

async function token(): Promise<string> {
  const t = await getStoredToken();
  if (!t) throw new Error("Please sign in first.");
  return t;
}

export function friendlyError(err: any): string {
  const message = err?.message || String(err);
  if (message.includes("permission-denied") || message.includes("Unauthorized")) {
    return "You don’t have permission to do that right now.";
  }
  if (message.includes("unavailable") || message.includes("offline")) {
    return "You appear to be offline. Try again when you’re connected.";
  }
  return message.replace(/^Error:\s*/, "") || "Something went wrong.";
}

// ---------- profiles ----------

export async function ensureProfile(_user: any, _displayName?: string) {
  // Handled by Convex auth mutations
}

export async function updateMyProfile(patch: any) {
  const t = await token();
  return await convex.mutation(api.users.updateProfile, { sessionToken: t, patch });
}

// ---------- images ----------

export async function uploadImage(potluckId: string, dataUrl: string): Promise<string> {
  const t = await token();
  return await convex.mutation(api.images.upload, {
    sessionToken: t,
    potluckId,
    data: dataUrl,
  });
}

const imageCache = new Map<string, Promise<string | null>>();

/** Resolves an `img:<potluck>/<id>` reference (or plain URL) to something an <img> can show. */
export function loadImage(ref?: string | null): Promise<string | null> {
  if (!ref) return Promise.resolve(null);
  if (!isImageRef(ref)) return Promise.resolve(ref);
  if (!imageCache.has(ref)) {
    const [, imageId] = ref.slice(IMAGE_REF_PREFIX.length).split("/");
    imageCache.set(
      ref,
      convex
        .query(api.images.get, { imageId })
        .catch((err) => {
          imageCache.delete(ref);
          throw err;
        })
    );
  }
  return imageCache.get(ref)!;
}

async function deleteImage(ref?: string | null) {
  if (!ref || !isImageRef(ref)) return;
  imageCache.delete(ref);
}

// ---------- potlucks ----------

export async function createPotluck(form: any): Promise<string> {
  const t = await token();
  const code = normalizeInviteCode(form.inviteCode);
  let coverImage = form.coverImage ?? null;
  const potluckId = await convex.mutation(api.potlucks.create, {
    sessionToken: t,
    form: { ...potluckFields(form), inviteCode: code, coverImage: null },
  });

  if (form.coverData) {
    coverImage = await uploadImage(potluckId, form.coverData);
    await convex.mutation(api.potlucks.update, {
      sessionToken: t,
      potluckId,
      form: { coverImage },
    });
  }
  return potluckId;
}

export async function updatePotluck(potluck: any, form: any): Promise<void> {
  const t = await token();
  let coverImage = form.coverImage ?? null;
  if (form.coverData) {
    coverImage = await uploadImage(potluck.id, form.coverData);
    if (potluck.coverImage) deleteImage(potluck.coverImage);
  }
  await convex.mutation(api.potlucks.update, {
    sessionToken: t,
    potluckId: potluck.id,
    form: { ...potluckFields({ ...form, coverImage }) },
  });
}

/** Looks up an invite code and returns the potluck (or null). */
export async function lookupInvite(rawCode: string): Promise<any | null> {
  const code = normalizeInviteCode(rawCode);
  if (!code) return null;
  return await convex.query(api.potlucks.lookupByInvite, { code });
}

export async function joinPotluck(potluckId: string): Promise<void> {
  const t = await token();
  await convex.mutation(api.potlucks.join, { sessionToken: t, potluckId });
}

export async function leavePotluck(potluckId: string): Promise<void> {
  const t = await token();
  await convex.mutation(api.potlucks.leave, { sessionToken: t, potluckId });
}

export async function removeGuest(potluckId: string, guestId: string): Promise<void> {
  const t = await token();
  await convex.mutation(api.potlucks.removeGuest, { sessionToken: t, potluckId, guestId });
}

export async function deletePotluck(potluck: any): Promise<void> {
  const t = await token();
  if (potluck.coverImage) await deleteImage(potluck.coverImage);
  await convex.mutation(api.potlucks.deletePotluck, { sessionToken: t, potluckId: potluck.id });
}

export async function openVoting(potluck: any): Promise<void> {
  const t = await token();
  await convex.mutation(api.potlucks.openVoting, { sessionToken: t, potluckId: potluck.id });
}

/**
 * Closes voting and records the podium.
 */
export async function publishResults(potluck: any): Promise<void> {
  const t = await token();
  const dishes = await convex.query(api.dishes.listByPotluck, { potluckId: potluck.id });
  const ranked = rankDishes(dishes, potluck.scoring);
  const podium = podiumFrom(ranked);
  const results = {
    ...resultsSummary(ranked, potluck.memberIds?.length || 0),
    publishedAt: Date.now(),
  };
  await convex.mutation(api.potlucks.closeVoting, {
    sessionToken: t,
    potluckId: potluck.id,
    podium,
    results,
  });
}

// ---------- dishes ----------

export async function saveDish(potluckId: string, form: any, existing?: any): Promise<void> {
  const t = await token();
  const values = { ...form };
  for (const key of ["photo", "recipePhoto"]) {
    const pending = form[`${key}Data`];
    if (pending) {
      values[key] = await uploadImage(potluckId, pending);
      if (existing?.[key]) deleteImage(existing[key]);
    } else if (form[key] === null && existing?.[key]) {
      deleteImage(existing[key]);
    }
  }

  const fields = dishFields(values);
  if (existing) {
    await convex.mutation(api.dishes.update, {
      sessionToken: t,
      dishId: existing.id,
      form: fields,
    });
  } else {
    await convex.mutation(api.dishes.claim, {
      sessionToken: t,
      potluckId,
      form: fields,
    });
  }
}

export async function deleteDish(potluckId: string, dish: any): Promise<void> {
  const t = await token();
  await convex.mutation(api.dishes.deleteDish, { sessionToken: t, dishId: dish.id });
  if (dish.photo) await deleteImage(dish.photo);
  if (dish.recipePhoto) await deleteImage(dish.recipePhoto);
}

export async function toggleLike(potluckId: string, dishId: string, _liked: boolean): Promise<boolean> {
  const t = await token();
  return (await convex.mutation(api.dishes.toggleLike, { sessionToken: t, dishId })) ?? false;
}

/** Anonymous vote */
export async function submitRating(potluckId: string, dishId: string, scores: Record<string, number>): Promise<void> {
  const t = await token();
  await convex.mutation(api.voting.submitBallot, {
    sessionToken: t,
    potluckId,
    dishId,
    scores,
  });
}

/** Every dish from every potluck the user attended (the recipe bank). */
export async function loadRecipeBank(potlucks: any[]): Promise<any[]> {
  const lists = await Promise.all(
    potlucks.map(async (p) => {
      const dishes = await convex.query(api.dishes.listByPotluck, { potluckId: p.id });
      return dishes.map((d: any) => ({ ...d, potluck: p }));
    })
  );
  return lists.flat();
}

// ---------- account ----------

export async function deleteMyData(): Promise<void> {
  const t = await token();
  await convex.mutation(api.users.deleteAccount, { sessionToken: t });
}
