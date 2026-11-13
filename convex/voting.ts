import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  fail, getDish, getSessionUser, requireMember, requirePotluck, requireUser, validateScores, votingLive,
} from "./lib/access";

/** The caller's own ballots in a potluck. Nobody else's votes are ever returned. */
export const listMyRatings = query({
  args: { sessionToken: v.string(), potluckId: v.string() },
  handler: async (ctx, args) => {
    const user = await getSessionUser(ctx, args.sessionToken);
    if (!user || !args.potluckId) return [];
    const ballots = await ctx.db
      .query("ballots")
      .withIndex("by_potluck_user", (q) => q.eq("potluckId", args.potluckId).eq("userId", user._id))
      .collect();
    return ballots.map((b) => ({ id: b._id, dishId: b.dishId, scores: b.scores }));
  },
});

/** Records a ballot and adds it to the dish's running totals in one transaction. */
export const submitBallot = mutation({
  args: {
    sessionToken: v.string(),
    potluckId: v.string(),
    dishId: v.string(),
    scores: v.record(v.string(), v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);
    const potluck = await requirePotluck(ctx, args.potluckId);
    requireMember(potluck, user);
    if (!votingLive(potluck)) fail("Voting is not currently open for this potluck.");

    const dish = await getDish(ctx, args.dishId);
    if (!dish || dish.potluckId !== potluck._id) fail("Dish not found.");
    if (dish.authorId === user._id) fail("You cannot vote for your own dish.");
    const scores = validateScores(args.scores, potluck);

    const existing = await ctx.db
      .query("ballots")
      .withIndex("by_dish_user", (q) => q.eq("dishId", dish._id).eq("userId", user._id))
      .first();
    if (existing) fail("You have already rated this dish.");

    await ctx.db.insert("ballots", {
      potluckId: potluck._id,
      dishId: dish._id,
      userId: user._id,
      scores,
      createdAt: Date.now(),
    });
    const scoreSums = { ...(dish.scoreSums ?? {}) };
    for (const [id, value] of Object.entries(scores)) scoreSums[id] = (scoreSums[id] ?? 0) + value;
    await ctx.db.patch(dish._id, { scoreSums, ratingCount: dish.ratingCount + 1 });
    return { success: true };
  },
});
