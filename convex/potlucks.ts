import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import {
  INVITE_CODE_RE, deleteImageRef, dishesEditable, fail, getPotluck, getSessionUser, isMember, potlucksForUser,
  requireHost, requireOwnImage, requirePotluck, requireUser, validatePotluckForm,
} from "./lib/access";
import { deletePotluckCascade } from "./lib/cascade";
import { podiumFrom, rankDishes, resultsSummary } from "../src/lib/scoring";

const withId = (p: Doc<"potlucks">) => ({ id: p._id, ...p });

/**
 * Any signed-in user may fetch a potluck by id: ids are random and only shared
 * through invite codes, and invitees need to preview before joining. Dishes,
 * ballots and photos stay members-only.
 */
export const get = query({
  args: { sessionToken: v.string(), potluckId: v.string() },
  handler: async (ctx, args) => {
    if (!(await getSessionUser(ctx, args.sessionToken))) return null;
    const potluck = await getPotluck(ctx, args.potluckId);
    return potluck ? withId(potluck) : null;
  },
});

/** The caller's own potlucks. */
export const listMyPotlucks = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await getSessionUser(ctx, args.sessionToken);
    if (!user) return [];
    return (await potlucksForUser(ctx, user._id)).map(withId);
  },
});

export const lookupByInvite = query({
  args: { sessionToken: v.string(), code: v.string() },
  handler: async (ctx, args) => {
    if (!(await getSessionUser(ctx, args.sessionToken))) return null;
    const code = args.code.trim().toUpperCase();
    if (!INVITE_CODE_RE.test(code)) return null;
    const invite = await ctx.db
      .query("inviteCodes")
      .withIndex("by_code", (q) => q.eq("code", code))
      .unique();
    const potluck = invite ? await getPotluck(ctx, invite.potluckId) : null;
    return potluck ? withId(potluck) : null;
  },
});

export const create = mutation({
  args: { sessionToken: v.string(), form: v.any() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);
    if (user.isGuest) fail("Save your account (email and password) before hosting a potluck.");
    const fields = validatePotluckForm(args.form);
    const code = String(args.form.inviteCode ?? "").trim().toUpperCase();
    if (!INVITE_CODE_RE.test(code)) fail("Invite codes are 4–20 letters, numbers or dashes.");

    const taken = await ctx.db
      .query("inviteCodes")
      .withIndex("by_code", (q) => q.eq("code", code))
      .unique();
    if (taken) fail(`The invite code ${code} is taken. Generate a new one.`);

    const now = Date.now();
    const potluckId = await ctx.db.insert("potlucks", {
      ...fields,
      coverImage: null, // uploaded after creation, then set with `update`
      inviteCode: code,
      hostId: user._id,
      memberIds: [user._id],
      status: "open",
      podium: [],
      results: null,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("inviteCodes", { code, potluckId, hostId: user._id, createdAt: now });
    return potluckId;
  },
});

export const update = mutation({
  args: { sessionToken: v.string(), potluckId: v.string(), form: v.any() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);
    const potluck = await requirePotluck(ctx, args.potluckId);
    requireHost(potluck, user);
    if (potluck.status === "closed") fail("Results are final, so this potluck can’t be edited.");

    // Fill in anything the client left out, then validate the whole thing.
    const fields = validatePotluckForm({ ...potluck, ...args.form });

    const scoringChanged =
      JSON.stringify(fields.scoring) !== JSON.stringify(potluck.scoring) ||
      JSON.stringify(fields.categoryIds) !== JSON.stringify(potluck.categoryIds);
    if (scoringChanged && !dishesEditable(potluck)) fail("Scoring can’t change once voting has started.");
    if (fields.maxGuests > 0 && potluck.memberIds.length > fields.maxGuests) {
      fail(`${potluck.memberIds.length} people have already joined. Remove guests or raise the limit.`);
    }

    const coverImage = args.form.coverImage !== undefined ? (args.form.coverImage as string | null) : potluck.coverImage ?? null;
    if (coverImage !== (potluck.coverImage ?? null)) {
      await requireOwnImage(ctx, coverImage, potluck._id, user._id);
      await deleteImageRef(ctx, potluck.coverImage);
    }

    await ctx.db.patch(potluck._id, { ...fields, coverImage, updatedAt: Date.now() });
    return args.potluckId;
  },
});

export const join = mutation({
  args: { sessionToken: v.string(), potluckId: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);
    const potluck = await requirePotluck(ctx, args.potluckId);
    if (isMember(potluck, user._id)) return { success: true };
    if (potluck.status === "closed") fail("This showdown has already ended.");
    if (potluck.maxGuests > 0 && potluck.memberIds.length >= potluck.maxGuests) fail("This potluck is full.");
    await ctx.db.patch(potluck._id, { memberIds: [...potluck.memberIds, user._id], updatedAt: Date.now() });
    return { success: true };
  },
});

export const leave = mutation({
  args: { sessionToken: v.string(), potluckId: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);
    const potluck = await requirePotluck(ctx, args.potluckId);
    if (!isMember(potluck, user._id)) return;
    if (potluck.hostId === user._id) fail("Hosts can’t leave their own potluck. Delete it instead.");
    if (potluck.status !== "open") fail("You can’t leave once voting has started.");

    const dishes = await ctx.db
      .query("dishes")
      .withIndex("by_potluckId", (q) => q.eq("potluckId", potluck._id))
      .collect();
    for (const d of dishes) {
      if (d.authorId === user._id) {
        await deleteImageRef(ctx, d.photo);
        await deleteImageRef(ctx, d.recipePhoto);
        await ctx.db.delete(d._id);
      }
    }
    await ctx.db.patch(potluck._id, {
      memberIds: potluck.memberIds.filter((id) => id !== user._id),
      updatedAt: Date.now(),
    });
  },
});

export const removeGuest = mutation({
  args: { sessionToken: v.string(), potluckId: v.string(), guestId: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);
    const potluck = await requirePotluck(ctx, args.potluckId);
    requireHost(potluck, user);
    if (potluck.status === "closed") fail("Results are final, so the guest list can’t change.");
    if (args.guestId === potluck.hostId) fail("The host can’t be removed.");
    await ctx.db.patch(potluck._id, {
      memberIds: potluck.memberIds.filter((id) => id !== args.guestId),
      updatedAt: Date.now(),
    });
  },
});

/** Hosts may cancel an event; finished potlucks are kept for the recipe bank. */
export const deletePotluck = mutation({
  args: { sessionToken: v.string(), potluckId: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);
    const potluck = await getPotluck(ctx, args.potluckId);
    if (!potluck) return;
    requireHost(potluck, user);
    if (potluck.status === "closed") fail("Finished potlucks are kept so everyone keeps the recipes.");
    await deletePotluckCascade(ctx, potluck);
  },
});

export const openVoting = mutation({
  args: { sessionToken: v.string(), potluckId: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);
    const potluck = await requirePotluck(ctx, args.potluckId);
    requireHost(potluck, user);
    if (potluck.status === "closed") fail("Results are already published.");
    const now = Date.now();
    await ctx.db.patch(potluck._id, {
      status: "voting",
      // A closing time already in the past would end voting immediately.
      ...(potluck.votingClosesAt != null && potluck.votingClosesAt <= now ? { votingClosesAt: null } : {}),
      updatedAt: now,
    });
  },
});

/** Closes voting and records the podium, calculated here from the vote totals. */
export const publishResults = mutation({
  args: { sessionToken: v.string(), potluckId: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);
    const potluck = await requirePotluck(ctx, args.potluckId);
    requireHost(potluck, user);
    if (potluck.status === "closed") fail("Results are already published.");

    const dishes = await ctx.db
      .query("dishes")
      .withIndex("by_potluckId", (q) => q.eq("potluckId", potluck._id))
      .collect();
    const ranked = rankDishes(dishes, potluck.scoring);
    const now = Date.now();
    await ctx.db.patch(potluck._id, {
      status: "closed",
      podium: podiumFrom(ranked),
      results: { ...resultsSummary(ranked, potluck.memberIds.length), publishedAt: now },
      updatedAt: now,
    });
  },
});
