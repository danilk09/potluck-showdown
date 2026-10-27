import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

export const upload = mutation({
  args: {
    sessionToken: v.string(),
    potluckId: v.string(),
    data: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_sessionToken", (q) => q.eq("sessionToken", args.sessionToken))
      .first();
    if (!user) throw new Error("Unauthorized");

    const imageId = await ctx.db.insert("images", {
      potluckId: args.potluckId,
      ownerId: user._id,
      data: args.data,
      createdAt: Date.now(),
    });
    return `img:${args.potluckId}/${imageId}`;
  },
});

export const get = query({
  args: { imageId: v.string() },
  handler: async (ctx, args) => {
    try {
      const img = await ctx.db.get(args.imageId as Id<"images">);
      return img ? img.data : null;
    } catch {
      return null;
    }
  },
});
