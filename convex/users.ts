import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import {
  FRAME_TIERS, SESSION_TTL_MS, fail, frameEarned, getPotluck, getSessionUser, requireUser,
} from "./lib/access";

const MAX_PROFILE_PHOTO = 120_000;

function publicProfile(user: Doc<"users">) {
  return {
    displayName: user.displayName,
    photoURL: user.photoURL ?? null,
    frame: user.frame ?? null,
    isGuest: user.isGuest,
  };
}

export const currentUser = query({
  args: { sessionToken: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    const user = await getSessionUser(ctx, args.sessionToken);
    if (!user) return null;
    return {
      uid: user._id,
      email: user.email ?? null,
      ...publicProfile(user),
      isAnonymous: user.isGuest,
      createdAt: user.createdAt,
    };
  },
});

/** Names, avatars and frames by id. Signed-in users only, and never a full listing. */
export const getProfiles = query({
  args: { sessionToken: v.string(), userIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    const results: Record<string, ReturnType<typeof publicProfile>> = {};
    if (!(await getSessionUser(ctx, args.sessionToken))) return results;
    for (const uid of args.userIds.slice(0, 200)) {
      const id = ctx.db.normalizeId("users", uid);
      const user = id ? await ctx.db.get(id) : null;
      if (user) results[uid] = publicProfile(user);
    }
    return results;
  },
});

export const updateProfile = mutation({
  args: {
    sessionToken: v.string(),
    patch: v.object({
      displayName: v.optional(v.string()),
      photoURL: v.optional(v.union(v.string(), v.null())),
      frame: v.optional(v.union(v.object({ tier: v.string(), potluckId: v.string() }), v.null())),
    }),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);
    const { displayName, photoURL, frame } = args.patch;
    const update: Partial<Doc<"users">> = { lastSeenAt: Date.now() };

    if (displayName !== undefined) {
      const name = displayName.trim();
      if (name.length < 1 || name.length > 40) fail("Names must be 1 to 40 characters.");
      update.displayName = name;
    }
    if (photoURL !== undefined) {
      if (photoURL !== null && (photoURL.length > MAX_PROFILE_PHOTO || !/^data:image\/(jpeg|png|webp);base64,/.test(photoURL))) {
        fail("That photo is too large or isn’t an image.");
      }
      update.photoURL = photoURL;
    }
    if (frame !== undefined) {
      if (frame !== null) {
        if (!(FRAME_TIERS as readonly string[]).includes(frame.tier)) fail("Unknown frame.");
        if (!frameEarned(frame.tier, await getPotluck(ctx, frame.potluckId), user._id)) {
          fail("You haven’t earned that frame yet.");
        }
      }
      update.frame = frame;
    }

    await ctx.db.patch(user._id, update);
    return { success: true };
  },
});

/** Ends this device's session on the server, not just on the phone. */
export const signOut = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.sessionToken))
      .unique();
    if (session) await ctx.db.delete(session._id);
  },
});

/** Pushes the expiry out while the app is in use (at most once a day). */
export const refreshSession = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.sessionToken))
      .unique();
    const now = Date.now();
    if (!session || session.expiresAt <= now) return;
    if (session.expiresAt - now < SESSION_TTL_MS - 24 * 60 * 60 * 1000) {
      await ctx.db.patch(session._id, { expiresAt: now + SESSION_TTL_MS });
      await ctx.db.patch(session.userId, { lastSeenAt: now });
    }
  },
});
