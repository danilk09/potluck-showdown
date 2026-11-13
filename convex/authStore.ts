// Database half of sign-in. Only the actions in convex/auth.ts call these;
// they're internal, so clients can't reach them directly.
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { SESSION_TTL_MS, fail, getSessionUser } from "./lib/access";
import { deleteUserCascade } from "./lib/cascade";

export const RESET_TTL_MS = 15 * 60 * 1000;
export const RESET_MAX_ATTEMPTS = 5;

export const userByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) =>
    await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first(),
});

export const userBySession = internalQuery({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => await getSessionUser(ctx, sessionToken),
});

export const createUser = internalMutation({
  args: {
    email: v.optional(v.string()),
    passwordHash: v.optional(v.string()),
    displayName: v.string(),
    isGuest: v.boolean(),
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.email) {
      const existing = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", args.email))
        .first();
      if (existing) fail("An account already uses that email. Try signing in instead.");
    }
    const now = Date.now();
    const userId = await ctx.db.insert("users", {
      email: args.email,
      passwordHash: args.passwordHash,
      displayName: args.displayName,
      photoURL: null,
      frame: null,
      isGuest: args.isGuest,
      createdAt: now,
      lastSeenAt: now,
    });
    await ctx.db.insert("sessions", { userId, token: args.sessionToken, expiresAt: now + SESSION_TTL_MS, createdAt: now });
    return userId;
  },
});

export const createSession = internalMutation({
  args: { userId: v.id("users"), sessionToken: v.string() },
  handler: async (ctx, { userId, sessionToken }) => {
    const now = Date.now();
    await ctx.db.insert("sessions", { userId, token: sessionToken, expiresAt: now + SESSION_TTL_MS, createdAt: now });
    await ctx.db.patch(userId, { lastSeenAt: now });
  },
});

/** Stores a password hash and clears the legacy plain-text fields. */
export const setPasswordHash = internalMutation({
  args: { userId: v.id("users"), passwordHash: v.string() },
  handler: async (ctx, { userId, passwordHash }) => {
    await ctx.db.patch(userId, { passwordHash, password: undefined, sessionToken: undefined });
  },
});

export const upgradeGuest = internalMutation({
  args: { userId: v.id("users"), email: v.string(), passwordHash: v.string() },
  handler: async (ctx, { userId, email, passwordHash }) => {
    const user = await ctx.db.get(userId);
    if (!user) fail("Please sign in first.");
    if (!user.isGuest) fail("This account already has an email and password.");
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (existing) fail("An account already uses that email.");
    await ctx.db.patch(userId, { email, passwordHash, isGuest: false, lastSeenAt: Date.now() });
  },
});

export const deleteUser = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    if (await ctx.db.get(userId)) await deleteUserCascade(ctx, userId);
  },
});

// ---------- password reset ----------

export const storeResetCode = internalMutation({
  args: { userId: v.id("users"), codeHash: v.string() },
  handler: async (ctx, { userId, codeHash }) => {
    const old = await ctx.db
      .query("passwordResets")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    for (const r of old) await ctx.db.delete(r._id);
    await ctx.db.insert("passwordResets", { userId, codeHash, expiresAt: Date.now() + RESET_TTL_MS, attempts: 0 });
  },
});

export const resetCodeFor = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const reset = await ctx.db
      .query("passwordResets")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
    if (!reset || reset.expiresAt <= Date.now() || reset.attempts >= RESET_MAX_ATTEMPTS) return null;
    return reset;
  },
});

export const recordResetAttempt = internalMutation({
  args: { resetId: v.id("passwordResets") },
  handler: async (ctx, { resetId }) => {
    const reset = await ctx.db.get(resetId);
    if (reset) await ctx.db.patch(resetId, { attempts: reset.attempts + 1 });
  },
});

/** Sets the new password, signs out every device, and starts one new session. */
export const completeReset = internalMutation({
  args: {
    resetId: v.id("passwordResets"),
    userId: v.id("users"),
    passwordHash: v.string(),
    sessionToken: v.string(),
  },
  handler: async (ctx, { resetId, userId, passwordHash, sessionToken }) => {
    await ctx.db.delete(resetId);
    await ctx.db.patch(userId, { passwordHash, password: undefined, sessionToken: undefined });
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    for (const s of sessions) await ctx.db.delete(s._id);
    const now = Date.now();
    await ctx.db.insert("sessions", { userId, token: sessionToken, expiresAt: now + SESSION_TTL_MS, createdAt: now });
  },
});

// ---------- maintenance ----------

/** Users that still have a plain-text password (pre-hashing data). */
export const legacyPasswordUsers = internalQuery({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    return users.filter((u) => u.password != null).map((u) => ({ userId: u._id, password: u.password! }));
  },
});

/** Removes expired sessions and reset codes (run daily from crons.ts). */
export const purgeExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_expiresAt", (q) => q.lt("expiresAt", now))
      .take(500);
    for (const s of sessions) await ctx.db.delete(s._id);
    const resets = await ctx.db
      .query("passwordResets")
      .withIndex("by_expiresAt", (q) => q.lt("expiresAt", now))
      .take(500);
    for (const r of resets) await ctx.db.delete(r._id);
  },
});
