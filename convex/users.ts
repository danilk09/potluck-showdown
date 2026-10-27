import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

function generateToken() {
  return "tok_" + Math.random().toString(36).substring(2) + Date.now().toString(36);
}

export const currentUser = query({
  args: { sessionToken: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    if (!args.sessionToken) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_sessionToken", (q) => q.eq("sessionToken", args.sessionToken!))
      .first();
    if (!user) return null;
    return {
      uid: user._id,
      email: user.email ?? null,
      displayName: user.displayName,
      photoURL: user.photoURL ?? null,
      frame: user.frame ?? null,
      isAnonymous: user.isGuest,
      isGuest: user.isGuest,
      createdAt: user.createdAt,
    };
  },
});

export const getProfile = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    try {
      const user = await ctx.db.get(args.userId as Id<"users">);
      if (!user) return null;
      return {
        displayName: user.displayName,
        photoURL: user.photoURL ?? null,
        frame: user.frame ?? null,
        isGuest: user.isGuest,
      };
    } catch {
      return null;
    }
  },
});

export const getProfiles = query({
  args: { userIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    const results: Record<string, any> = {};
    for (const uid of args.userIds) {
      if (!uid) continue;
      try {
        const user = await ctx.db.get(uid as Id<"users">);
        if (user) {
          results[uid] = {
            displayName: user.displayName,
            photoURL: user.photoURL ?? null,
            frame: user.frame ?? null,
            isGuest: user.isGuest,
          };
        }
      } catch {
        // ignore invalid ID format
      }
    }
    return results;
  },
});

export const signUp = mutation({
  args: {
    email: v.string(),
    password: v.string(),
    displayName: v.string(),
  },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (existing) {
      throw new Error("An account already uses that email. Try signing in instead.");
    }
    const sessionToken = generateToken();
    const now = Date.now();
    const userId = await ctx.db.insert("users", {
      email,
      password: args.password,
      displayName: args.displayName.trim() || "Potluck guest",
      photoURL: null,
      frame: null,
      isGuest: false,
      sessionToken,
      createdAt: now,
      lastSeenAt: now,
    });
    return {
      userId,
      sessionToken,
      user: {
        uid: userId,
        email,
        displayName: args.displayName.trim() || "Potluck guest",
        photoURL: null,
        frame: null,
        isAnonymous: false,
        isGuest: false,
        createdAt: now,
      },
    };
  },
});

export const signIn = mutation({
  args: {
    email: v.string(),
    password: v.string(),
  },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (!user || user.password !== args.password) {
      throw new Error("That email and password don’t match.");
    }
    const sessionToken = generateToken();
    await ctx.db.patch(user._id, {
      sessionToken,
      lastSeenAt: Date.now(),
    });
    return {
      userId: user._id,
      sessionToken,
      user: {
        uid: user._id,
        email: user.email ?? null,
        displayName: user.displayName,
        photoURL: user.photoURL ?? null,
        frame: user.frame ?? null,
        isAnonymous: user.isGuest,
        isGuest: user.isGuest,
        createdAt: user.createdAt,
      },
    };
  },
});

export const signInGuest = mutation({
  args: {
    displayName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const sessionToken = generateToken();
    const now = Date.now();
    const displayName = (args.displayName ?? "").trim() || "Potluck guest";
    const userId = await ctx.db.insert("users", {
      displayName,
      photoURL: null,
      frame: null,
      isGuest: true,
      sessionToken,
      createdAt: now,
      lastSeenAt: now,
    });
    return {
      userId,
      sessionToken,
      user: {
        uid: userId,
        email: null,
        displayName,
        photoURL: null,
        frame: null,
        isAnonymous: true,
        isGuest: true,
        createdAt: now,
      },
    };
  },
});

export const upgradeGuest = mutation({
  args: {
    sessionToken: v.string(),
    email: v.string(),
    password: v.string(),
    displayName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_sessionToken", (q) => q.eq("sessionToken", args.sessionToken))
      .first();
    if (!user) throw new Error("User session not found.");

    const email = args.email.trim().toLowerCase();
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (existing && existing._id !== user._id) {
      throw new Error("An account already uses that email.");
    }

    const patch: any = {
      email,
      password: args.password,
      isGuest: false,
      lastSeenAt: Date.now(),
    };
    if (args.displayName?.trim()) {
      patch.displayName = args.displayName.trim();
    }
    await ctx.db.patch(user._id, patch);
    return { success: true };
  },
});

export const updateProfile = mutation({
  args: {
    sessionToken: v.string(),
    patch: v.any(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_sessionToken", (q) => q.eq("sessionToken", args.sessionToken))
      .first();
    if (!user) throw new Error("Unauthorized");

    const allowedPatch: any = {};
    if (args.patch.displayName !== undefined) allowedPatch.displayName = args.patch.displayName;
    if (args.patch.photoURL !== undefined) allowedPatch.photoURL = args.patch.photoURL;
    if (args.patch.frame !== undefined) allowedPatch.frame = args.patch.frame;
    allowedPatch.lastSeenAt = Date.now();

    await ctx.db.patch(user._id, allowedPatch);
    return { success: true };
  },
});

export const deleteAccount = mutation({
  args: {
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_sessionToken", (q) => q.eq("sessionToken", args.sessionToken))
      .first();
    if (!user) return;

    // Delete user's dishes
    const dishes = await ctx.db
      .query("dishes")
      .withIndex("by_authorId", (q) => q.eq("authorId", user._id))
      .collect();
    for (const d of dishes) {
      await ctx.db.delete(d._id);
    }

    await ctx.db.delete(user._id);
  },
});
