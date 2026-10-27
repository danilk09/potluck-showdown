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

export const listMyRatings = query({
  args: {
    userId: v.optional(v.union(v.string(), v.null())),
    potluckId: v.string(),
  },
  handler: async (ctx, args) => {
    if (!args.userId || !args.potluckId) return [];
    const ballots = await ctx.db
      .query("ballots")
      .withIndex("by_potluck_user", (q) =>
        q.eq("potluckId", args.potluckId).eq("userId", args.userId!)
      )
      .collect();
    return ballots.map((b) => ({ id: b._id, dishId: b.dishId, scores: b.scores }));
  },
});

export const submitBallot = mutation({
  args: {
    sessionToken: v.string(),
    potluckId: v.string(),
    dishId: v.string(),
    scores: v.any(), // Record<string, number>
  },
  handler: async (ctx, args) => {
    const user = await getUserByToken(ctx, args.sessionToken);
    const potluck = await ctx.db.get(args.potluckId as Id<"potlucks">);
    if (!potluck) throw new Error("Potluck not found.");
    if (potluck.status !== "voting") {
      throw new Error("Voting is not currently open for this potluck.");
    }

    const dish = await ctx.db.get(args.dishId as Id<"dishes">);
    if (!dish) throw new Error("Dish not found.");
    if (dish.authorId === user._id) {
      throw new Error("You cannot vote for your own dish.");
    }

    // Check if user already voted on this dish
    const existing = await ctx.db
      .query("ballots")
      .withIndex("by_potluck_user", (q) =>
        q.eq("potluckId", args.potluckId).eq("userId", user._id)
      )
      .filter((q) => q.eq(q.field("dishId"), args.dishId))
      .first();

    if (existing) {
      throw new Error("You have already rated this dish.");
    }

    // Insert ballot
    await ctx.db.insert("ballots", {
      potluckId: args.potluckId,
      dishId: args.dishId,
      userId: user._id,
      scores: args.scores,
      createdAt: Date.now(),
    });

    // Atomically increment dish score sums and rating count
    const scoreSums = { ...(dish.scoreSums || {}) };
    for (const [catId, val] of Object.entries(args.scores)) {
      scoreSums[catId] = (scoreSums[catId] || 0) + Number(val);
    }

    await ctx.db.patch(dish._id, {
      scoreSums,
      ratingCount: (dish.ratingCount || 0) + 1,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});
