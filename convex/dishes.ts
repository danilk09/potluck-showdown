import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

async function getUserByToken(ctx: any, sessionToken: string) {
  if (!sessionToken) throw new Error("Please sign in first.");
  const user = await ctx.db
    .query("users")
    .withIndex("by_sessionToken", (q: any) => q.eq("sessionToken", sessionToken))
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

export const claim = mutation({
  args: {
    sessionToken: v.string(),
    potluckId: v.string(),
    form: v.any(),
  },
  handler: async (ctx, args) => {
    const user = await getUserByToken(ctx, args.sessionToken);
    const potluck = await ctx.db.get(args.potluckId as Id<"potlucks">);
    if (!potluck) throw new Error("Potluck not found.");

    // Ensure user is in memberIds
    if (!potluck.memberIds.includes(user._id)) {
      await ctx.db.patch(potluck._id, {
        memberIds: [...potluck.memberIds, user._id],
        updatedAt: Date.now(),
      });
    }

    const now = Date.now();
    const dishId = await ctx.db.insert("dishes", {
      potluckId: args.potluckId,
      authorId: user._id,
      name: args.form.name.trim(),
      categoryId: args.form.categoryId,
      serves: (args.form.serves ?? "").trim(),
      ingredients: args.form.ingredients ?? [],
      steps: (args.form.steps ?? "").trim(),
      allergens: args.form.allergens ?? [],
      dietary: args.form.dietary ?? [],
      prepMinutes: args.form.prepMinutes ?? null,
      calories: args.form.calories ?? null,
      photo: args.form.photo ?? null,
      recipePhoto: args.form.recipePhoto ?? null,
      usedRequired: Boolean(args.form.usedRequired),
      scoreSums: {},
      ratingCount: 0,
      likedBy: [],
      createdAt: now,
      updatedAt: now,
    });

    return dishId;
  },
});

export const update = mutation({
  args: {
    sessionToken: v.string(),
    dishId: v.string(),
    form: v.any(),
  },
  handler: async (ctx, args) => {
    const user = await getUserByToken(ctx, args.sessionToken);
    const dish = await ctx.db.get(args.dishId as Id<"dishes">);
    if (!dish) throw new Error("Dish not found.");
    if (dish.authorId !== user._id) throw new Error("Only the dish creator can edit this dish.");

    const now = Date.now();
    const patch: any = {
      name: args.form.name !== undefined ? args.form.name.trim() : dish.name,
      categoryId: args.form.categoryId ?? dish.categoryId,
      serves: args.form.serves !== undefined ? args.form.serves.trim() : dish.serves,
      ingredients: args.form.ingredients ?? dish.ingredients,
      steps: args.form.steps !== undefined ? args.form.steps.trim() : dish.steps,
      allergens: args.form.allergens ?? dish.allergens,
      dietary: args.form.dietary ?? dish.dietary,
      prepMinutes: args.form.prepMinutes !== undefined ? args.form.prepMinutes : dish.prepMinutes,
      calories: args.form.calories !== undefined ? args.form.calories : dish.calories,
      photo: args.form.photo !== undefined ? args.form.photo : dish.photo,
      recipePhoto: args.form.recipePhoto !== undefined ? args.form.recipePhoto : dish.recipePhoto,
      usedRequired: args.form.usedRequired !== undefined ? Boolean(args.form.usedRequired) : dish.usedRequired,
      updatedAt: now,
    };

    await ctx.db.patch(dish._id, patch);
    return dish._id;
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
