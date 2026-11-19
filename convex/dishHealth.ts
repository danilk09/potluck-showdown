/// <reference types="node" />
"use node";

import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action } from "./_generated/server";
import { calculateHealthScore } from "./nutrition";
import { scoredDishArgs } from "./scoredDishArgs";

export const calculateAndSave = action({
  args: scoredDishArgs,
  returns: v.id("dishes"),
  handler: async (ctx, { sessionToken, potluckId, dishId, form }): Promise<Id<"dishes">> => {
    if (!dishId && !form) throw new ConvexError("Add dish details before calculating a health score.");
    const target = { sessionToken, potluckId, ...(dishId ? { dishId } : {}) };
    const previous = await ctx.runQuery(internal.dishes.prepareScoredDish, { ...target, now: Date.now() });
    const privateKey = process.env.PRIVATE_MODE_API_KEY;
    const usdaKey = process.env.USDA_API_KEY;
    if (!privateKey) throw new ConvexError("AI health scoring is not configured on this server.");

    const score = await calculateHealthScore(
      {
        ingredients: form?.ingredients ?? previous.ingredients,
        steps: (form?.steps ?? previous.steps)?.trim(),
      },
      { privateKey, usdaKey },
    );
    return await ctx.runMutation(internal.dishes.saveScoredDish, {
      ...target,
      ...(form ? { form } : {}),
      expectedUpdatedAt: previous.updatedAt,
      score,
    });
  },
});
