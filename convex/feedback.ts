// App feedback: the quick rating popup shown after each finished potluck,
// and the full form under Profile → Give feedback. Read it in the Convex dashboard.
import { mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { fail, requireUser } from "./lib/access";

const POPUP_REASONS = ["Easy to use", "Fun challenges", "Voting was unclear", "App issues"];
const FEATURE_ANSWERS = ["hard", "okay", "easy", "unclear", "clear", "na"];

/** Remembers which finished potlucks have already shown the popup, so it isn't shown again for them. */
async function markPrompted(ctx: any, user: Doc<"users">, potluckIds: string[]) {
  const prompted = user.feedbackPromptedIds ?? [];
  const added = potluckIds.filter((id) => id && !prompted.includes(id)).slice(0, 200);
  if (added.length) await ctx.db.patch(user._id, { feedbackPromptedIds: [...prompted, ...added] });
}

export const submit = mutation({
  args: {
    sessionToken: v.string(),
    source: v.union(v.literal("popup"), v.literal("form")),
    potluckId: v.optional(v.string()),
    // Every finished potluck this popup answers for (it covers all pending ones at once).
    promptedIds: v.optional(v.array(v.string())),
    rating: v.number(),
    reasons: v.optional(v.array(v.string())),
    features: v.optional(
      v.object({
        creating: v.optional(v.string()),
        joining: v.optional(v.string()),
        addingDish: v.optional(v.string()),
        voting: v.optional(v.string()),
      }),
    ),
    comment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);
    if (!Number.isInteger(args.rating) || args.rating < 1 || args.rating > 5) fail("Pick a rating from 1 to 5.");
    const reasons = (args.reasons ?? []).filter((r) => POPUP_REASONS.includes(r));
    for (const answer of Object.values(args.features ?? {})) {
      if (answer !== undefined && !FEATURE_ANSWERS.includes(answer)) fail("Unknown answer.");
    }
    const comment = (args.comment ?? "").trim();
    if (comment.length > 2000) fail("Feedback is too long (max 2000 characters).");

    await ctx.db.insert("feedback", {
      userId: user._id,
      source: args.source,
      ...(args.potluckId ? { potluckId: args.potluckId } : {}),
      rating: args.rating,
      ...(reasons.length ? { reasons } : {}),
      ...(args.features ? { features: args.features } : {}),
      ...(comment ? { comment } : {}),
      createdAt: Date.now(),
    });
    await markPrompted(ctx, user, [...(args.promptedIds ?? []), ...(args.potluckId ? [args.potluckId] : [])]);
  },
});

/** "Not now" on the popup. */
export const dismissPrompt = mutation({
  args: { sessionToken: v.string(), potluckIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);
    await markPrompted(ctx, user, args.potluckIds);
  },
});
