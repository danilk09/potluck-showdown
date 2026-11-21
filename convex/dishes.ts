import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  deleteImageRef, dishesEditable, fail, getDish, getPotluck, getSessionUser, isMember, potlucksForUser,
  requireMember, requireOwnImage, requirePotluck, requireUser, validateDishForm,
} from "./lib/access";
import { deleteDishCascade } from "./lib/cascade";
import { scoredDishArgs } from "./scoredDishArgs";

const withId = (d: Doc<"dishes">) => ({ id: d._id, ...d });

function aiCategoryIds(potluck: Doc<"potlucks">) {
  return potluck.scoring.filter(({ mode }) => mode === "ai").map(({ id }) => id);
}

/** Potlucks with an AI-scored category save dishes through dishHealth.calculateAndSave instead. */
function requireManualScoring(potluck: Doc<"potlucks">) {
  if (aiCategoryIds(potluck).length) fail("Calculate a health score before saving this dish.");
}

/** Dishes (and their recipes) are only visible to that potluck's members. */
export const listByPotluck = query({
  args: { sessionToken: v.string(), potluckId: v.string() },
  handler: async (ctx, args) => {
    const user = await getSessionUser(ctx, args.sessionToken);
    const potluck = await getPotluck(ctx, args.potluckId);
    if (!user || !potluck || !isMember(potluck, user._id)) return [];
    const dishes = await ctx.db
      .query("dishes")
      .withIndex("by_potluckId", (q) => q.eq("potluckId", potluck._id))
      .collect();
    return dishes.map(withId);
  },
});

export const get = query({
  args: { sessionToken: v.string(), dishId: v.string() },
  handler: async (ctx, args) => {
    const user = await getSessionUser(ctx, args.sessionToken);
    const dish = await getDish(ctx, args.dishId);
    const potluck = dish ? await getPotluck(ctx, dish.potluckId) : null;
    if (!user || !dish || !potluck || !isMember(potluck, user._id)) return null;
    return withId(dish);
  },
});

/** The recipe bank: every dish from every potluck the caller belongs to, with its potluck. Live. */
export const recipeBank = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await getSessionUser(ctx, args.sessionToken);
    if (!user) return [];
    const out = [];
    for (const p of await potlucksForUser(ctx, user._id)) {
      const dishes = await ctx.db
        .query("dishes")
        .withIndex("by_potluckId", (q) => q.eq("potluckId", p._id))
        .collect();
      const potluck = { id: p._id, ...p };
      for (const d of dishes) out.push({ ...withId(d), potluck });
    }
    return out;
  },
});

/** Inserts a validated dish for a member while dishes are still editable. */
async function insertDish(
  ctx: MutationCtx,
  potluck: Doc<"potlucks">,
  userId: Id<"users">,
  form: any,
  aiScores?: Record<string, number>,
  clientRequestAt?: number,
) {
  const fields = validateDishForm(form, potluck);
  await requireOwnImage(ctx, fields.photo, potluck._id, userId);
  await requireOwnImage(ctx, fields.recipePhoto, potluck._id, userId);
  const now = Date.now();
  // The dish fills the spot its author was holding (the same category if they held one there).
  const claims = potluck.spotClaims ?? [];
  const held = claims.findIndex((c) => c.userId === userId && c.categoryId === fields.categoryId);
  const any = held >= 0 ? held : claims.findIndex((c) => c.userId === userId);
  if (any >= 0) await ctx.db.patch(potluck._id, { spotClaims: claims.filter((_, i) => i !== any) });
  return await ctx.db.insert("dishes", {
    ...fields,
    potluckId: potluck._id,
    authorId: userId,
    scoreSums: {},
    ...(aiScores ? { aiScores } : {}),
    ratingCount: 0,
    likedBy: [],
    createdAt: now,
    updatedAt: now,
    ...(clientRequestAt !== undefined ? { clientRequestAt } : {}),
  });
}

/** Applies a validated edit, deleting any photo it replaces. */
async function patchDish(
  ctx: MutationCtx,
  potluck: Doc<"potlucks">,
  dish: Doc<"dishes">,
  userId: Id<"users">,
  form: any,
  aiScores?: Record<string, number>,
) {
  const fields = validateDishForm({ ...dish, ...form }, potluck);
  for (const key of ["photo", "recipePhoto"] as const) {
    if (fields[key] !== (dish[key] ?? null)) {
      await requireOwnImage(ctx, fields[key], potluck._id, userId);
      await deleteImageRef(ctx, dish[key]);
    }
  }
  await ctx.db.patch(dish._id, { ...fields, ...(aiScores ? { aiScores } : {}), updatedAt: Date.now() });
  return dish._id;
}

export const claim = mutation({
  args: { sessionToken: v.string(), potluckId: v.string(), form: v.any() },
  returns: v.id("dishes"),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);
    const potluck = await requirePotluck(ctx, args.potluckId);
    requireMember(potluck, user);
    if (!dishesEditable(potluck)) fail("Voting has started, so dishes are locked.");
    requireManualScoring(potluck);
    return await insertDish(ctx, potluck, user._id, args.form);
  },
});

export const update = mutation({
  args: { sessionToken: v.string(), dishId: v.string(), form: v.any() },
  returns: v.id("dishes"),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);
    const dish = await getDish(ctx, args.dishId);
    if (!dish) fail("Dish not found.");
    if (dish.authorId !== user._id) fail("Only the dish creator can edit this dish.");
    const potluck = await requirePotluck(ctx, dish.potluckId);
    if (!dishesEditable(potluck)) fail("Voting has started, so dishes are locked.");
    requireManualScoring(potluck);
    return await patchDish(ctx, potluck, dish, user._id, args.form);
  },
});

// ---------- AI health scoring (see dishHealth.ts) ----------

async function getScoredDishContext(
  ctx: QueryCtx | MutationCtx,
  args: { sessionToken: string; potluckId: Id<"potlucks">; dishId?: Id<"dishes"> },
  now: number,
) {
  const user = await requireUser(ctx, args.sessionToken);
  const potluck = await getPotluck(ctx, args.potluckId);
  if (!potluck || !isMember(potluck, user._id)) fail("Join this potluck first.");
  if (!dishesEditable(potluck, now)) fail("Dishes are locked once voting starts.");
  const categoryIds = aiCategoryIds(potluck);
  if (!categoryIds.length) fail("AI health scoring is no longer enabled for this potluck.");
  const dish = args.dishId ? await ctx.db.get(args.dishId) : null;
  if (args.dishId && (!dish || dish.potluckId !== potluck._id || dish.authorId !== user._id)) {
    fail("Only the dish creator can edit this dish.");
  }
  return { potluck, user, dish, categoryIds };
}

async function findDishByScoreRequest(
  ctx: QueryCtx | MutationCtx,
  potluckId: Id<"potlucks">,
  authorId: Id<"users">,
  clientRequestAt: number,
) {
  return await ctx.db
    .query("dishes")
    .withIndex("by_potluckId_and_authorId_and_clientRequestAt", (q) =>
      q.eq("potluckId", potluckId).eq("authorId", authorId).eq("clientRequestAt", clientRequestAt),
    )
    .unique();
}

const scoreTarget = {
  sessionToken: scoredDishArgs.sessionToken,
  potluckId: scoredDishArgs.potluckId,
  dishId: scoredDishArgs.dishId,
};

export const prepareScoredDish = internalQuery({
  args: { ...scoreTarget, now: v.number() },
  returns: v.object({
    ingredients: v.array(v.string()),
    steps: v.optional(v.string()),
    updatedAt: v.union(v.number(), v.null()),
  }),
  handler: async (ctx, args) => {
    const { dish } = await getScoredDishContext(ctx, args, args.now);
    return {
      ingredients: dish?.ingredients ?? [],
      ...(dish?.steps !== undefined ? { steps: dish.steps } : {}),
      updatedAt: dish?.updatedAt ?? null,
    };
  },
});

export const saveScoredDish = internalMutation({
  args: {
    ...scoredDishArgs,
    score: v.number(),
    expectedUpdatedAt: v.union(v.number(), v.null()),
  },
  returns: v.id("dishes"),
  handler: async (ctx, args) => {
    const { potluck, user, dish, categoryIds } = await getScoredDishContext(ctx, args, Date.now());
    const score = Math.max(0, Math.min(100, Math.round(args.score)));
    const aiScores = Object.fromEntries(categoryIds.map((id) => [id, score]));
    if (dish) {
      if (dish.updatedAt !== args.expectedUpdatedAt) fail("This dish changed during scoring. Please try again.");
      return await patchDish(ctx, potluck, dish, user._id, args.form ?? {}, aiScores);
    }
    if (!args.form) fail("Add dish details before calculating a health score.");
    // Scoring runs outside this transaction. A retry or overlapping attempt
    // still omits dishId, so reuse the dish this request already created.
    const existing = await findDishByScoreRequest(ctx, potluck._id, user._id, args.form.updatedAt);
    if (existing) return existing._id;
    if (args.expectedUpdatedAt !== null) fail("This dish changed during scoring. Please try again.");
    return await insertDish(ctx, potluck, user._id, args.form, aiScores, args.form.updatedAt);
  },
});

export const deleteDish = mutation({
  args: { sessionToken: v.string(), dishId: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);
    const dish = await getDish(ctx, args.dishId);
    if (!dish) return;
    const potluck = await requirePotluck(ctx, dish.potluckId);
    const authorMayDelete = dish.authorId === user._id && dishesEditable(potluck);
    const hostMayDelete = potluck.hostId === user._id && potluck.status !== "closed";
    if (!authorMayDelete && !hostMayDelete) fail("You don’t have permission to delete this dish.");
    await deleteDishCascade(ctx, dish);
  },
});

export const toggleLike = mutation({
  args: { sessionToken: v.string(), dishId: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);
    const dish = await getDish(ctx, args.dishId);
    if (!dish) return false;
    requireMember(await requirePotluck(ctx, dish.potluckId), user);

    const hasLiked = dish.likedBy.includes(user._id);
    await ctx.db.patch(dish._id, {
      likedBy: hasLiked ? dish.likedBy.filter((id) => id !== user._id) : [...dish.likedBy, user._id],
    });
    return !hasLiked;
  },
});

/** Saves a recipe to (or removes it from) the caller's "Saved" list in the recipe bank. */
export const toggleSave = mutation({
  args: { sessionToken: v.string(), dishId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);
    const dish = await getDish(ctx, args.dishId);
    if (!dish) fail("Dish not found.");
    requireMember(await requirePotluck(ctx, dish.potluckId), user);
    const savedBy = dish.savedBy ?? [];
    const saved = savedBy.includes(user._id);
    await ctx.db.patch(dish._id, { savedBy: saved ? savedBy.filter((id) => id !== user._id) : [...savedBy, user._id] });
    return !saved;
  },
});

const REPORT_REASONS = ["Inappropriate photo", "Not food", "Spam or misleading", "Other"];

/** Flags a dish photo for review. One report per person per dish. */
export const report = mutation({
  args: { sessionToken: v.string(), dishId: v.string(), reason: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);
    const dish = await getDish(ctx, args.dishId);
    if (!dish) fail("Dish not found.");
    requireMember(await requirePotluck(ctx, dish.potluckId), user);
    if (!REPORT_REASONS.includes(args.reason)) fail("Pick a reason for the report.");
    const earlier = await ctx.db
      .query("reports")
      .withIndex("by_dishId", (q) => q.eq("dishId", dish._id))
      .collect();
    if (earlier.some((r) => r.reporterId === user._id)) return null;
    await ctx.db.insert("reports", {
      reporterId: user._id, potluckId: dish.potluckId, dishId: dish._id, reason: args.reason, createdAt: Date.now(),
    });
    return null;
  },
});
