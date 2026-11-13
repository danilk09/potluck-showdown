import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import {
  deleteImageRef, dishesEditable, fail, getDish, getPotluck, getSessionUser, isMember, potlucksForUser,
  requireMember, requireOwnImage, requirePotluck, requireUser, validateDishForm,
} from "./lib/access";
import { deleteDishCascade } from "./lib/cascade";

const withId = (d: Doc<"dishes">) => ({ id: d._id, ...d });

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
    return await ctx.db.insert("dishes", {
      ...fields,
      potluckId: potluck._id,
      authorId: user._id,
      scoreSums: {},
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
    const user = await requireUser(ctx, args.sessionToken);
    const dish = await getDish(ctx, args.dishId);
    if (!dish) fail("Dish not found.");
    if (dish.authorId !== user._id) fail("Only the dish creator can edit this dish.");
    const potluck = await requirePotluck(ctx, dish.potluckId);
    if (!dishesEditable(potluck)) fail("Voting has started, so dishes are locked.");

    const fields = validateDishForm({ ...dish, ...args.form }, potluck);
    for (const key of ["photo", "recipePhoto"] as const) {
      if (fields[key] !== (dish[key] ?? null)) {
        await requireOwnImage(ctx, fields[key], potluck._id, user._id);
        await deleteImageRef(ctx, dish[key]);
      }
    }
    await ctx.db.patch(dish._id, { ...fields, updatedAt: Date.now() });
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
