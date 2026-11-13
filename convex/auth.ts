// Sign-in actions. Session tokens and salts need real cryptographic
// randomness, which Convex only provides in actions (queries and mutations
// use a deterministic RNG), so these run as actions and hand database work to
// the internal functions in convex/authStore.ts.
import { scryptAsync } from "@noble/hashes/scrypt.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, randomBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { fail } from "./lib/access";

// Convex provides process.env at runtime; this file isn't typed against Node.
declare const process: { env: Record<string, string | undefined> };

const SCRYPT = { N: 16384, r: 8, p: 1 };
const KEY_LEN = 32;
const MIN_PASSWORD = 8;
const RESET_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** `scrypt$N$r$p$salt$hash` (hex). The plain password is never stored. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(utf8ToBytes(password), salt, { ...SCRYPT, dkLen: KEY_LEN });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${bytesToHex(salt)}$${bytesToHex(key)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, N, r, p, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = hexToBytes(hash);
  const key = await scryptAsync(utf8ToBytes(password), hexToBytes(salt), {
    N: Number(N),
    r: Number(r),
    p: Number(p),
    dkLen: expected.length,
  });
  return bytesEqual(key, expected);
}

/** Constant-time comparison, so timing doesn't reveal how much matched. */
function bytesEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function safeEqual(a: string, b: string) {
  return bytesEqual(utf8ToBytes(a), utf8ToBytes(b));
}

function newSessionToken() {
  return bytesToHex(randomBytes(32));
}

function sha256Hex(text: string) {
  return bytesToHex(sha256(utf8ToBytes(text)));
}

function randomCode(length: number) {
  // 256 is a multiple of the 32-letter alphabet, so every letter is equally likely.
  return Array.from(randomBytes(length), (b) => RESET_ALPHABET[b % RESET_ALPHABET.length]).join("");
}

function cleanEmail(email: string) {
  const e = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 254) fail("That email address doesn’t look right.");
  return e;
}

function checkPassword(password: string) {
  if (password.length < MIN_PASSWORD) fail("Please choose a stronger password (at least 8 characters).");
  if (password.length > 200) fail("That password is too long.");
}

function cleanName(name?: string) {
  return (name ?? "").trim().slice(0, 40) || "Potluck guest";
}

export const signUp = action({
  args: { email: v.string(), password: v.string(), displayName: v.string() },
  handler: async (ctx, args): Promise<{ sessionToken: string }> => {
    const email = cleanEmail(args.email);
    checkPassword(args.password);
    const sessionToken = newSessionToken();
    await ctx.runMutation(internal.authStore.createUser, {
      email,
      passwordHash: await hashPassword(args.password),
      displayName: cleanName(args.displayName),
      isGuest: false,
      sessionToken,
    });
    return { sessionToken };
  },
});

export const signIn = action({
  args: { email: v.string(), password: v.string() },
  handler: async (ctx, args): Promise<{ sessionToken: string }> => {
    const email = args.email.trim().toLowerCase();
    const user = await ctx.runQuery(internal.authStore.userByEmail, { email });
    let ok = false;
    if (user?.passwordHash) {
      ok = await verifyPassword(args.password, user.passwordHash);
    } else if (user?.password != null) {
      // Account from before hashing: check the old value once, then upgrade it.
      ok = safeEqual(args.password, user.password);
      if (ok) {
        await ctx.runMutation(internal.authStore.setPasswordHash, {
          userId: user._id,
          passwordHash: await hashPassword(args.password),
        });
      }
    }
    if (!user || !ok) fail("That email and password don’t match.");
    const sessionToken = newSessionToken();
    await ctx.runMutation(internal.authStore.createSession, { userId: user._id, sessionToken });
    return { sessionToken };
  },
});

export const signInGuest = action({
  args: { displayName: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ sessionToken: string }> => {
    const sessionToken = newSessionToken();
    await ctx.runMutation(internal.authStore.createUser, {
      displayName: cleanName(args.displayName),
      isGuest: true,
      sessionToken,
    });
    return { sessionToken };
  },
});

/** Gives a guest an email and password, keeping their id and everything they've done. */
export const upgradeGuest = action({
  args: { sessionToken: v.string(), email: v.string(), password: v.string() },
  handler: async (ctx, args): Promise<null> => {
    const user = await ctx.runQuery(internal.authStore.userBySession, { sessionToken: args.sessionToken });
    if (!user) fail("Please sign in first.");
    const email = cleanEmail(args.email);
    checkPassword(args.password);
    await ctx.runMutation(internal.authStore.upgradeGuest, {
      userId: user._id,
      email,
      passwordHash: await hashPassword(args.password),
    });
    return null;
  },
});

/** Deletes the account and everything it owns. Full accounts must confirm their password. */
export const deleteAccount = action({
  args: { sessionToken: v.string(), password: v.optional(v.string()) },
  handler: async (ctx, args): Promise<null> => {
    const user = await ctx.runQuery(internal.authStore.userBySession, { sessionToken: args.sessionToken });
    if (!user) fail("Please sign in first.");
    if (!user.isGuest) {
      const ok = user.passwordHash
        ? await verifyPassword(args.password ?? "", user.passwordHash)
        : user.password != null && safeEqual(args.password ?? "", user.password);
      if (!ok) fail("That password isn’t right.");
    }
    await ctx.runMutation(internal.authStore.deleteUser, { userId: user._id });
    return null;
  },
});

// ---------- password reset ----------

async function sendResetEmail(to: string, code: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESET_EMAIL_FROM;
  if (!apiKey || !from) {
    // No email provider configured (local development). The code shows up in
    // the Convex dashboard logs, which only project admins can see.
    console.warn(`Password reset code for ${to}: ${code} (set RESEND_API_KEY and RESET_EMAIL_FROM to email it)`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to,
      subject: "Your Potluck Showdown reset code",
      text: `Your password reset code is ${code}\n\nIt expires in 15 minutes. If you didn't ask for this, you can ignore this email.`,
    }),
  });
  if (!res.ok) {
    console.error("Reset email failed", res.status, await res.text());
    fail("We couldn’t send the email. Please try again later.");
  }
}

/** Emails a one-time code. Always succeeds, so it doesn't reveal which emails have accounts. */
export const requestPasswordReset = action({
  args: { email: v.string() },
  handler: async (ctx, args): Promise<null> => {
    const email = args.email.trim().toLowerCase();
    const user = await ctx.runQuery(internal.authStore.userByEmail, { email });
    if (!user || user.isGuest) return null;
    const code = randomCode(8);
    await ctx.runMutation(internal.authStore.storeResetCode, { userId: user._id, codeHash: sha256Hex(code) });
    await sendResetEmail(email, code);
    return null;
  },
});

/** Checks the emailed code, sets the new password and signs in. */
export const resetPassword = action({
  args: { email: v.string(), code: v.string(), password: v.string() },
  handler: async (ctx, args): Promise<{ sessionToken: string }> => {
    checkPassword(args.password);
    const email = args.email.trim().toLowerCase();
    const user = await ctx.runQuery(internal.authStore.userByEmail, { email });
    const reset = user ? await ctx.runQuery(internal.authStore.resetCodeFor, { userId: user._id }) : null;
    if (!user || !reset) fail("That code has expired. Request a new one.");
    const code = args.code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!safeEqual(sha256Hex(code), reset.codeHash)) {
      await ctx.runMutation(internal.authStore.recordResetAttempt, { resetId: reset._id });
      fail("That code isn’t right.");
    }
    const sessionToken = newSessionToken();
    await ctx.runMutation(internal.authStore.completeReset, {
      resetId: reset._id,
      userId: user._id,
      passwordHash: await hashPassword(args.password),
      sessionToken,
    });
    return { sessionToken };
  },
});

// ---------- maintenance ----------

/** One-off: hash every remaining plain-text password. `npx convex run auth:hashLegacyPasswords` */
export const hashLegacyPasswords = internalAction({
  args: {},
  handler: async (ctx): Promise<{ hashed: number }> => {
    const users = await ctx.runQuery(internal.authStore.legacyPasswordUsers, {});
    for (const u of users) {
      await ctx.runMutation(internal.authStore.setPasswordHash, {
        userId: u.userId,
        passwordHash: await hashPassword(u.password),
      });
    }
    return { hashed: users.length };
  },
});
