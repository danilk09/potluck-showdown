// potlucks.memberIds stays the source of truth for the rules; the memberships
// table mirrors it so a user's potlucks can be found through an index.
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/** Makes the memberships rows for a potluck match `memberIds`. */
export async function syncMemberships(ctx: MutationCtx, potluckId: Id<"potlucks">, memberIds: string[]) {
  const rows = await ctx.db
    .query("memberships")
    .withIndex("by_potluck_user", (q) => q.eq("potluckId", potluckId))
    .collect();
  const have = new Set(rows.map((r) => r.userId));
  for (const r of rows) if (!memberIds.includes(r.userId)) await ctx.db.delete(r._id);
  for (const userId of memberIds) if (!have.has(userId)) await ctx.db.insert("memberships", { userId, potluckId });
}

/** Updates a potluck's member list and its memberships rows together. */
export async function setMembers(ctx: MutationCtx, potluck: Doc<"potlucks">, memberIds: string[]) {
  await ctx.db.patch(potluck._id, { memberIds, updatedAt: Date.now() });
  await syncMemberships(ctx, potluck._id, memberIds);
}
