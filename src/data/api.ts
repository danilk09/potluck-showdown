import { convex, getStoredToken } from "../convex";
import { api } from "../../convex/_generated/api";
import { dishFields, potluckFields } from "./builders";
import { IMAGE_REF_PREFIX, isImageRef } from "../lib/images";
import { normalizeInviteCode } from "../lib/inviteCode";

async function token(): Promise<string> {
  const t = await getStoredToken();
  if (!t) throw new Error("Please sign in first.");
  return t;
}

export function friendlyError(err: any): string {
  // Server checks throw ConvexError, whose readable message is in `data`.
  if (typeof err?.data === "string") return err.data;
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
      token()
        .then((sessionToken) => convex.query(api.images.get, { sessionToken, imageId }))
        .catch((err) => {
          imageCache.delete(ref);
          throw err;
        })
    );
  }
  return imageCache.get(ref)!;
}

/** The server deletes replaced photos itself; this just forgets the cached copy. */
function forgetImage(ref?: string | null) {
  if (ref && isImageRef(ref)) imageCache.delete(ref);
}

/** Removes a photo that was uploaded but never saved onto anything. */
async function discardUpload(ref: string) {
  forgetImage(ref);
  await convex.mutation(api.images.remove, { sessionToken: await token(), ref }).catch(() => {});
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
  const uploaded = form.coverData ? await uploadImage(potluck.id, form.coverData) : null;
  if (uploaded) coverImage = uploaded;
  try {
    await convex.mutation(api.potlucks.update, {
      sessionToken: t,
      potluckId: potluck.id,
      form: { ...potluckFields({ ...form, coverImage }) },
    });
  } catch (err) {
    if (uploaded) await discardUpload(uploaded);
    throw err;
  }
  if (coverImage !== potluck.coverImage) forgetImage(potluck.coverImage);
}

/** Looks up an invite code and returns the potluck (or null). */
export async function lookupInvite(rawCode: string): Promise<any | null> {
  const code = normalizeInviteCode(rawCode);
  if (!code) return null;
  return await convex.query(api.potlucks.lookupByInvite, { sessionToken: await token(), code });
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
  await convex.mutation(api.potlucks.deletePotluck, { sessionToken: t, potluckId: potluck.id });
  forgetImage(potluck.coverImage);
}

export async function openVoting(potluck: any): Promise<void> {
  const t = await token();
  await convex.mutation(api.potlucks.openVoting, { sessionToken: t, potluckId: potluck.id });
}

/** Closes voting. The server ranks the dishes and records the podium. */
export async function publishResults(potluck: any): Promise<void> {
  const t = await token();
  await convex.mutation(api.potlucks.publishResults, { sessionToken: t, potluckId: potluck.id });
}

// ---------- dishes ----------

export async function saveDish(potluckId: string, form: any, existing?: any): Promise<void> {
  const t = await token();
  const values = { ...form };
  const uploaded: string[] = [];
  try {
    for (const key of ["photo", "recipePhoto"]) {
      const pending = form[`${key}Data`];
      if (pending) {
        values[key] = await uploadImage(potluckId, pending);
        uploaded.push(values[key]);
      }
    }
    const fields = dishFields(values);
    if (existing) {
      await convex.mutation(api.dishes.update, { sessionToken: t, dishId: existing.id, form: fields });
    } else {
      await convex.mutation(api.dishes.claim, { sessionToken: t, potluckId, form: fields });
    }
  } catch (err) {
    await Promise.all(uploaded.map(discardUpload));
    throw err;
  }
  // The server deleted any photo that was replaced or removed.
  for (const key of ["photo", "recipePhoto"]) {
    if (existing?.[key] && existing[key] !== values[key]) forgetImage(existing[key]);
  }
}

export async function deleteDish(potluckId: string, dish: any): Promise<void> {
  const t = await token();
  await convex.mutation(api.dishes.deleteDish, { sessionToken: t, dishId: dish.id });
  forgetImage(dish.photo);
  forgetImage(dish.recipePhoto);
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
