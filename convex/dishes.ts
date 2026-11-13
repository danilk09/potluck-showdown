import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

function cleanAiScores(raw: unknown): Record<string, number> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const n = Number(value);
    if (!key || !Number.isFinite(n)) continue;
    out[key] = Math.max(0, Math.min(100, Math.round(n)));
  }
  return Object.keys(out).length ? out : undefined;
}

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

export const claim = mutation({
  args: { sessionToken: v.string(), potluckId: v.string(), form: v.any() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);
    const potluck = await requirePotluck(ctx, args.potluckId);
    requireMember(potluck, user);
    if (!dishesEditable(potluck)) fail("Voting has started, so dishes are locked.");
    const fields = validateDishForm(args.form, potluck);
    await requireOwnImage(ctx, fields.photo, potluck._id, user._id);
    await requireOwnImage(ctx, fields.recipePhoto, potluck._id, user._id);

    const now = Date.now();
    const aiScores = cleanAiScores(args.form.aiScores);
    const dishId = await ctx.db.insert("dishes", {
      potluckId: args.potluckId,
      authorId: user._id,
      scoreSums: {},
      ...(aiScores ? { aiScores } : {}),
      ratingCount: 0,
      likedBy: [],
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: { sessionToken: v.string(), dishId: v.string(), form: v.any() },
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
    if (args.form.aiScores !== undefined) {
      const aiScores = cleanAiScores(args.form.aiScores);
      if (aiScores) patch.aiScores = { ...(dish.aiScores ?? {}), ...aiScores };
    }

    await ctx.db.patch(dish._id, patch);
    return dish._id;
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
