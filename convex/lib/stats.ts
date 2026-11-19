// Counts behind the achievement frames (src/lib/achievements.ts). Computed on
// the server so a frame can only be worn once it's really earned.
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { UserStats } from "../../src/lib/achievements";
import { potlucksForUser } from "./access";

type ReadCtx = QueryCtx | MutationCtx;

export async function userStats(ctx: ReadCtx, userId: Id<"users">): Promise<UserStats> {
  const finished = (await potlucksForUser(ctx, userId)).filter((p) => p.status === "closed");
  const classic = new Set<string>();
  let wins = 0;
  let podiums = 0;
  let hosted = 0;
  for (const p of finished) {
    const place = p.podium.slice(0, 3).indexOf(userId);
    if (place >= 0) {
      podiums += 1;
      classic.add(["gold", "silver", "bronze"][place]);
    }
    if (place === 0) wins += 1;
    if (p.hostId === userId) {
      hosted += 1;
      classic.add("host");
    }
  }

  const votes = (await ctx.db.query("ballots").withIndex("by_userId", (q) => q.eq("userId", userId)).collect()).length;

  const dishes = await ctx.db.query("dishes").withIndex("by_authorId", (q) => q.eq("authorId", userId)).collect();
  const likes = dishes.reduce((n, d) => n + d.likedBy.filter((id) => id !== userId).length, 0);

  // Each person counts once, however many potlucks they joined through your links.
  const invitedRows = await ctx.db.query("memberships").withIndex("by_invitedBy", (q) => q.eq("invitedBy", userId)).collect();
  const invited = new Set(invitedRows.map((r) => r.userId).filter((id) => id !== userId)).size;

  // People you brought to the app who have hosted a finished potluck of their own.
  const referred = await ctx.db.query("users").withIndex("by_referredBy", (q) => q.eq("referredBy", userId)).collect();
  let mentored = 0;
  for (const r of referred) {
    const hostedByThem = await ctx.db.query("potlucks").withIndex("by_hostId", (q) => q.eq("hostId", r._id)).collect();
    if (hostedByThem.some((p) => p.status === "closed")) mentored += 1;
  }

  return { attended: finished.length, wins, podiums, hosted, votes, dishes: dishes.length, likes, invited, mentored, classic: [...classic] };
}
