import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { scoredDishArgs } from "./scoredDishArgs";

async function getUserByToken(ctx: QueryCtx | MutationCtx, sessionToken: string) {
  if (!sessionToken) throw new Error("Please sign in first.");
  const user = await ctx.db
    .query("users")
    .withIndex("by_sessionToken", (q) => q.eq("sessionToken", sessionToken))
    .first();
  if (!user) throw new Error("Please sign in first.");
  return user;
}

export const listByPotluck = query({
  args: { potluckId: v.string() },
  handler: async (ctx, args) => {
    if (!args.potluckId) return [];
    const dishes = await ctx.db
      .query("dishes")
      .withIndex("by_potluckId", (q) => q.eq("potluckId", args.potluckId))
      .collect();
    return dishes.map((d) => ({ id: d._id, ...d }));
  },
});

export const get = query({
  args: { dishId: v.string() },
  handler: async (ctx, args) => {
    if (!args.dishId) return null;
    try {
      const dish = await ctx.db.get(args.dishId as Id<"dishes">);
      if (!dish) return null;
      return { id: dish._id, ...dish };
    } catch {
      return null;
    }
  },
});

export const listAllForUser = query({
  args: { userId: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    if (!args.userId) return [];
    const potlucks = await ctx.db.query("potlucks").collect();
    const myPotluckIds = new Set(
      potlucks.filter((p) => p.memberIds?.includes(args.userId!)).map((p) => p._id.toString())
    );
    const allDishes = await ctx.db.query("dishes").collect();
    const accessible = allDishes.filter((d) => myPotluckIds.has(d.potluckId));
    return accessible.map((d) => ({ id: d._id, ...d }));
  },
});

function aiCategoryIds(potluck: Doc<"potlucks">) {
  return potluck.scoring.filter(({ mode }) => mode === "ai").map(({ id }) => id);
}

async function insertDish(
  ctx: MutationCtx, potluck: Doc<"potlucks">, userId: Id<"users">, form: any, aiScores?: Record<string, number>
) {
  const now = Date.now();
  if (!potluck.memberIds.includes(userId)) {
    await ctx.db.patch(potluck._id, { memberIds: [...potluck.memberIds, userId], updatedAt: now });
  }
  return await ctx.db.insert("dishes", {
    potluckId: potluck._id,
    authorId: userId,
    name: form.name.trim(),
    categoryId: form.categoryId,
    serves: (form.serves ?? "").trim(),
    ingredients: form.ingredients ?? [],
    steps: (form.steps ?? "").trim(),
    allergens: form.allergens ?? [],
    dietary: form.dietary ?? [],
    prepMinutes: form.prepMinutes ?? null,
    calories: form.calories ?? null,
    photo: form.photo ?? null,
    recipePhoto: form.recipePhoto ?? null,
    usedRequired: Boolean(form.usedRequired),
    ...(aiScores ? { aiScores } : {}),
    scoreSums: {},
    ratingCount: 0,
    likedBy: [],
    createdAt: now,
    updatedAt: now,
  });
}

async function patchDish(ctx: MutationCtx, dish: Doc<"dishes">, form: any, aiScores?: Record<string, number>) {
  await ctx.db.patch(dish._id, {
    name: form.name !== undefined ? form.name.trim() : dish.name,
    categoryId: form.categoryId ?? dish.categoryId,
    serves: form.serves !== undefined ? form.serves.trim() : dish.serves,
    ingredients: form.ingredients ?? dish.ingredients,
    steps: form.steps !== undefined ? form.steps.trim() : dish.steps,
    allergens: form.allergens ?? dish.allergens,
    dietary: form.dietary ?? dish.dietary,
    prepMinutes: form.prepMinutes !== undefined ? form.prepMinutes : dish.prepMinutes,
    calories: form.calories !== undefined ? form.calories : dish.calories,
    photo: form.photo !== undefined ? form.photo : dish.photo,
    recipePhoto: form.recipePhoto !== undefined ? form.recipePhoto : dish.recipePhoto,
    usedRequired: form.usedRequired !== undefined ? Boolean(form.usedRequired) : dish.usedRequired,
    ...(aiScores ? { aiScores } : {}),
    updatedAt: Date.now(),
  });
  return dish._id;
}

function requireManualScoring(potluck: Doc<"potlucks">) {
  if (aiCategoryIds(potluck).length) throw new ConvexError("Calculate a health score before saving this dish.");
}

export const claim = mutation({
  args: { sessionToken: v.string(), potluckId: v.string(), form: v.any() },
  returns: v.id("dishes"),
  handler: async (ctx, args) => {
    const user = await getUserByToken(ctx, args.sessionToken);
    const potluck = await ctx.db.get(args.potluckId as Id<"potlucks">);
    if (!potluck) throw new Error("Potluck not found.");
    requireManualScoring(potluck);
    return await insertDish(ctx, potluck, user._id, args.form);
  },
});

export const update = mutation({
  args: { sessionToken: v.string(), dishId: v.string(), form: v.any() },
  returns: v.id("dishes"),
  handler: async (ctx, args) => {
    const user = await getUserByToken(ctx, args.sessionToken);
    const dish = await ctx.db.get(args.dishId as Id<"dishes">);
    if (!dish) throw new Error("Dish not found.");
    if (dish.authorId !== user._id) throw new Error("Only the dish creator can edit this dish.");
    const potluck = await ctx.db.get(dish.potluckId as Id<"potlucks">);
    if (!potluck) throw new Error("Potluck not found.");
    requireManualScoring(potluck);
    return await patchDish(ctx, dish, args.form);
  },
});

async function getScoredDishContext(ctx: QueryCtx | MutationCtx, args: {
  sessionToken: string;
  potluckId: Id<"potlucks">;
  dishId?: Id<"dishes">;
}, now: number) {
  const user = await getUserByToken(ctx, args.sessionToken);
  const potluck = await ctx.db.get(args.potluckId);
  if (!potluck || !potluck.memberIds.includes(user._id)) throw new ConvexError("Join this potluck first.");
  if (potluck.status !== "open" || (potluck.votingOpensAt && potluck.votingOpensAt <= now)) {
    throw new ConvexError("Dishes are locked once voting starts.");
  }
  const categoryIds = aiCategoryIds(potluck);
  if (!categoryIds.length) throw new ConvexError("AI health scoring is no longer enabled for this potluck.");
  const dish = args.dishId ? await ctx.db.get(args.dishId) : null;
  if (args.dishId && (!dish || dish.potluckId !== potluck._id || dish.authorId !== user._id)) {
    throw new ConvexError("Only the dish creator can edit this dish.");
  }
  return { potluck, user, dish, categoryIds };
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
    if ((dish?.updatedAt ?? null) !== args.expectedUpdatedAt) {
      throw new ConvexError("This dish changed during scoring. Please try again.");
    }
    const aiScores = Object.fromEntries(categoryIds.map((id) => [id, args.score]));
    if (dish) return await patchDish(ctx, dish, args.form ?? {}, aiScores);
    if (!args.form) throw new ConvexError("Add dish details before calculating a health score.");
    return await insertDish(ctx, potluck, user._id, args.form, aiScores);
  },
});

export const deleteDish = mutation({
  args: {
    sessionToken: v.string(),
    dishId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getUserByToken(ctx, args.sessionToken);
    const dish = await ctx.db.get(args.dishId as Id<"dishes">);
    if (!dish) return;
    if (dish.authorId !== user._id) {
      // Also allow potluck host to delete
      const potluck = await ctx.db.get(dish.potluckId as Id<"potlucks">);
      if (!potluck || potluck.hostId !== user._id) {
        throw new Error("You don’t have permission to delete this dish.");
      }
    }
    await ctx.db.delete(dish._id);
  },
});

export const toggleLike = mutation({
  args: {
    sessionToken: v.string(),
    dishId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getUserByToken(ctx, args.sessionToken);
    const dish = await ctx.db.get(args.dishId as Id<"dishes">);
    if (!dish) return;

    const likedBy = dish.likedBy ?? [];
    const hasLiked = likedBy.includes(user._id);
    const newLikedBy = hasLiked ? likedBy.filter((id) => id !== user._id) : [...likedBy, user._id];

    await ctx.db.patch(dish._id, {
      likedBy: newLikedBy,
      updatedAt: Date.now(),
    });
    return !hasLiked;
  },
});
