import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  IMAGE_DATA_RE, IMAGE_REF_PREFIX, MAX_IMAGE_CHARS, fail, getPotluck, getSessionUser, imageIdFromRef, isMember,
  requireMember, requirePotluck, requireUser,
} from "./lib/access";

/** Stores a compressed photo for a potluck the caller belongs to. Returns an `img:` reference. */
export const upload = mutation({
  args: { sessionToken: v.string(), potluckId: v.string(), data: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);
    const potluck = await requirePotluck(ctx, args.potluckId);
    requireMember(potluck, user);
    if (args.data.length >= MAX_IMAGE_CHARS) fail("That photo is too large. Try a smaller one.");
    if (!IMAGE_DATA_RE.test(args.data)) fail("Only JPEG, PNG or WebP photos can be uploaded.");

    const imageId = await ctx.db.insert("images", {
      potluckId: potluck._id,
      ownerId: user._id,
      data: args.data,
      createdAt: Date.now(),
    });
    return `${IMAGE_REF_PREFIX}${potluck._id}/${imageId}`;
  },
});

/** Photo data, for members of the potluck it belongs to. */
export const get = query({
  args: { sessionToken: v.string(), imageId: v.string() },
  handler: async (ctx, args) => {
    const user = await getSessionUser(ctx, args.sessionToken);
    const id = ctx.db.normalizeId("images", args.imageId);
    const image = id ? await ctx.db.get(id) : null;
    const potluck = image ? await getPotluck(ctx, image.potluckId) : null;
    if (!user || !image || !potluck || !isMember(potluck, user._id)) return null;
    return image.data;
  },
});

/** Deletes a photo the caller uploaded (e.g. one picked but never saved). */
export const remove = mutation({
  args: { sessionToken: v.string(), ref: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);
    const id = imageIdFromRef(ctx, args.ref);
    const image = id ? await ctx.db.get(id) : null;
    if (image && image.ownerId === user._id) await ctx.db.delete(image._id);
  },
});
