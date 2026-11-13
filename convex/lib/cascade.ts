// Deletes that clean up everything hanging off a record, so nothing is left
// behind in the database.
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { deleteImageRef, potlucksForUser } from "./access";

/** A dish, its photos, and every ballot cast for it. */
export async function deleteDishCascade(ctx: MutationCtx, dish: Doc<"dishes">) {
  await deleteImageRef(ctx, dish.photo);
  await deleteImageRef(ctx, dish.recipePhoto);
  const ballots = await ctx.db
    .query("ballots")
    .withIndex("by_dish_user", (q) => q.eq("dishId", dish._id))
    .collect();
  for (const b of ballots) await ctx.db.delete(b._id);
  await ctx.db.delete(dish._id);
}

/** A potluck with its dishes, ballots, images and invite code. */
export async function deletePotluckCascade(ctx: MutationCtx, potluck: Doc<"potlucks">) {
  const dishes = await ctx.db
    .query("dishes")
    .withIndex("by_potluckId", (q) => q.eq("potluckId", potluck._id))
    .collect();
  for (const d of dishes) await deleteDishCascade(ctx, d);

  const images = await ctx.db
    .query("images")
    .withIndex("by_potluckId", (q) => q.eq("potluckId", potluck._id))
    .collect();
  for (const img of images) await ctx.db.delete(img._id);

  const invite = await ctx.db
    .query("inviteCodes")
    .withIndex("by_code", (q) => q.eq("code", potluck.inviteCode))
    .unique();
  if (invite) await ctx.db.delete(invite._id);

  await ctx.db.delete(potluck._id);
}

/**
 * Everything a user owns. Unfinished potlucks they host are cancelled;
 * finished ones keep their published results for the other guests.
 */
export async function deleteUserCascade(ctx: MutationCtx, userId: Id<"users">) {
  // Their votes. While a potluck is still running, take the scores back out
  // of the dish totals too; published results stay as they were.
  const ballots = await ctx.db
    .query("ballots")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();
  for (const b of ballots) {
    const dishId = ctx.db.normalizeId("dishes", b.dishId);
    const dish = dishId ? await ctx.db.get(dishId) : null;
    const potluckId = ctx.db.normalizeId("potlucks", b.potluckId);
    const potluck = potluckId ? await ctx.db.get(potluckId) : null;
    if (dish && potluck && potluck.status !== "closed") {
      const scoreSums = { ...(dish.scoreSums ?? {}) };
      for (const [id, v] of Object.entries(b.scores as Record<string, number>)) {
        scoreSums[id] = Math.max(0, (scoreSums[id] ?? 0) - v);
      }
      await ctx.db.patch(dish._id, { scoreSums, ratingCount: Math.max(0, dish.ratingCount - 1) });
    }
    await ctx.db.delete(b._id);
  }

  for (const p of await potlucksForUser(ctx, userId)) {
    if (p.hostId === userId && p.status !== "closed") {
      await deletePotluckCascade(ctx, p);
      continue;
    }
    // Drop their likes and membership.
    const dishes = await ctx.db
      .query("dishes")
      .withIndex("by_potluckId", (q) => q.eq("potluckId", p._id))
      .collect();
    for (const d of dishes) {
      if (d.likedBy.includes(userId)) {
        await ctx.db.patch(d._id, { likedBy: d.likedBy.filter((id) => id !== userId) });
      }
    }
    await ctx.db.patch(p._id, { memberIds: p.memberIds.filter((id) => id !== userId) });
  }

  const dishes = await ctx.db
    .query("dishes")
    .withIndex("by_authorId", (q) => q.eq("authorId", userId))
    .collect();
  for (const d of dishes) await deleteDishCascade(ctx, d);

  const images = await ctx.db
    .query("images")
    .withIndex("by_ownerId", (q) => q.eq("ownerId", userId))
    .collect();
  for (const img of images) await ctx.db.delete(img._id);

  const sessions = await ctx.db
    .query("sessions")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();
  for (const s of sessions) await ctx.db.delete(s._id);

  const resets = await ctx.db
    .query("passwordResets")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();
  for (const r of resets) await ctx.db.delete(r._id);

  await ctx.db.delete(userId);
}
