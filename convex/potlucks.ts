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

export const get = query({
  args: { potluckId: v.string() },
  handler: async (ctx, args) => {
    if (!args.potluckId) return null;
    try {
      const potluck = await ctx.db.get(args.potluckId as Id<"potlucks">);
      if (!potluck) return null;
      return { id: potluck._id, ...potluck };
    } catch {
      return null;
    }
  },
});

export const listMyPotlucks = query({
  args: { userId: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    if (!args.userId) return [];
    const all = await ctx.db.query("potlucks").collect();
    const mine = all.filter((p) => p.memberIds?.includes(args.userId!));
    return mine.map((p) => ({ id: p._id, ...p }));
  },
});

export const lookupByInvite = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const code = args.code.trim().toUpperCase();
    if (!code) return null;
    const invite = await ctx.db
      .query("inviteCodes")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first();
    if (!invite) return null;
    const potluck = await ctx.db.get(invite.potluckId as Id<"potlucks">);
    if (!potluck) return null;
    return { id: potluck._id, ...potluck };
  },
});

export const create = mutation({
  args: {
    sessionToken: v.string(),
    form: v.any(),
  },
  handler: async (ctx, args) => {
    const user = await getUserByToken(ctx, args.sessionToken);
    const code = (args.form.inviteCode || "").trim().toUpperCase();

    const existingInvite = await ctx.db
      .query("inviteCodes")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first();
    if (existingInvite) {
      throw new Error(`The invite code ${code} is taken. Generate a new one.`);
    }

    const now = Date.now();
    const potluckId = await ctx.db.insert("potlucks", {
      title: args.form.title.trim(),
      theme: (args.form.theme ?? "").trim(),
      format: args.form.format,
      formatDetail: (args.form.formatDetail ?? "").trim(),
      description: (args.form.description ?? "").trim(),
      location: (args.form.location ?? "").trim(),
      startsAt: args.form.startsAt || now,
      votingOpensAt: args.form.votingOpensAt ?? null,
      votingClosesAt: args.form.votingClosesAt ?? null,
      maxGuests: Math.max(0, parseInt(args.form.maxGuests, 10) || 0),
      scoring: args.form.scoring || [],
      categoryIds: args.form.categoryIds || [],
      dishCategories: args.form.dishCategories || [],
      coverImage: args.form.coverImage ?? null,
      inviteCode: code,
      hostId: user._id,
      memberIds: [user._id],
      status: "open",
      podium: [],
      results: null,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("inviteCodes", {
      code,
      potluckId,
      hostId: user._id,
      createdAt: now,
    });

    return potluckId;
  },
});

export const update = mutation({
  args: {
    sessionToken: v.string(),
    potluckId: v.string(),
    form: v.any(),
  },
  handler: async (ctx, args) => {
    const user = await getUserByToken(ctx, args.sessionToken);
    const potluck = await ctx.db.get(args.potluckId as Id<"potlucks">);
    if (!potluck) throw new Error("Potluck not found.");
    if (potluck.hostId !== user._id) throw new Error("Only the host can edit this potluck.");

    const now = Date.now();
    const patch: any = {
      title: args.form.title?.trim() ?? potluck.title,
      theme: args.form.theme !== undefined ? args.form.theme.trim() : potluck.theme,
      format: args.form.format ?? potluck.format,
      formatDetail: args.form.formatDetail !== undefined ? args.form.formatDetail.trim() : potluck.formatDetail,
      description: args.form.description !== undefined ? args.form.description.trim() : potluck.description,
      location: args.form.location !== undefined ? args.form.location.trim() : potluck.location,
      startsAt: args.form.startsAt ?? potluck.startsAt,
      votingOpensAt: args.form.votingOpensAt !== undefined ? args.form.votingOpensAt : potluck.votingOpensAt,
      votingClosesAt: args.form.votingClosesAt !== undefined ? args.form.votingClosesAt : potluck.votingClosesAt,
      maxGuests: args.form.maxGuests !== undefined ? Math.max(0, parseInt(args.form.maxGuests, 10) || 0) : potluck.maxGuests,
      scoring: args.form.scoring ?? potluck.scoring,
      categoryIds: args.form.categoryIds ?? potluck.categoryIds,
      dishCategories: args.form.dishCategories ?? potluck.dishCategories,
      coverImage: args.form.coverImage !== undefined ? args.form.coverImage : potluck.coverImage,
      updatedAt: now,
    };

    await ctx.db.patch(potluck._id, patch);
    return args.potluckId;
  },
});

export const join = mutation({
  args: {
    sessionToken: v.string(),
    potluckId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getUserByToken(ctx, args.sessionToken);
    const potluck = await ctx.db.get(args.potluckId as Id<"potlucks">);
    if (!potluck) throw new Error("Potluck not found.");

    if (!potluck.memberIds.includes(user._id)) {
      await ctx.db.patch(potluck._id, {
        memberIds: [...potluck.memberIds, user._id],
        updatedAt: Date.now(),
      });
    }
    return { success: true };
  },
});

export const leave = mutation({
  args: {
    sessionToken: v.string(),
    potluckId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getUserByToken(ctx, args.sessionToken);
    const potluck = await ctx.db.get(args.potluckId as Id<"potlucks">);
    if (!potluck) return;

    // Delete user's dishes in this potluck
    const dishes = await ctx.db
      .query("dishes")
      .withIndex("by_potluckId", (q) => q.eq("potluckId", args.potluckId))
      .collect();
    for (const d of dishes) {
      if (d.authorId === user._id) {
        await ctx.db.delete(d._id);
      }
    }

    await ctx.db.patch(potluck._id, {
      memberIds: potluck.memberIds.filter((id) => id !== user._id),
      updatedAt: Date.now(),
    });
  },
});

export const removeGuest = mutation({
  args: {
    sessionToken: v.string(),
    potluckId: v.string(),
    guestId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getUserByToken(ctx, args.sessionToken);
    const potluck = await ctx.db.get(args.potluckId as Id<"potlucks">);
    if (!potluck) return;
    if (potluck.hostId !== user._id) throw new Error("Only the host can remove guests.");

    await ctx.db.patch(potluck._id, {
      memberIds: potluck.memberIds.filter((id) => id !== args.guestId),
      updatedAt: Date.now(),
    });
  },
});

export const deletePotluck = mutation({
  args: {
    sessionToken: v.string(),
    potluckId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getUserByToken(ctx, args.sessionToken);
    const potluck = await ctx.db.get(args.potluckId as Id<"potlucks">);
    if (!potluck) return;
    if (potluck.hostId !== user._id) throw new Error("Only the host can delete this potluck.");

    // Delete all dishes in the potluck
    const dishes = await ctx.db
      .query("dishes")
      .withIndex("by_potluckId", (q) => q.eq("potluckId", args.potluckId))
      .collect();
    for (const d of dishes) {
      await ctx.db.delete(d._id);
    }

    // Delete invite code
    const invite = await ctx.db
      .query("inviteCodes")
      .withIndex("by_code", (q) => q.eq("code", potluck.inviteCode))
      .first();
    if (invite) await ctx.db.delete(invite._id);

    // Delete images
    const images = await ctx.db
      .query("images")
      .withIndex("by_potluckId", (q) => q.eq("potluckId", args.potluckId))
      .collect();
    for (const img of images) {
      await ctx.db.delete(img._id);
    }

    await ctx.db.delete(potluck._id);
  },
});

export const openVoting = mutation({
  args: {
    sessionToken: v.string(),
    potluckId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getUserByToken(ctx, args.sessionToken);
    const potluck = await ctx.db.get(args.potluckId as Id<"potlucks">);
    if (!potluck) throw new Error("Potluck not found.");
    if (potluck.hostId !== user._id) throw new Error("Only the host can open voting.");

    await ctx.db.patch(potluck._id, {
      status: "voting",
      updatedAt: Date.now(),
    });
  },
});

export const closeVoting = mutation({
  args: {
    sessionToken: v.string(),
    potluckId: v.string(),
    podium: v.array(v.any()),
    results: v.any(),
  },
  handler: async (ctx, args) => {
    const user = await getUserByToken(ctx, args.sessionToken);
    const potluck = await ctx.db.get(args.potluckId as Id<"potlucks">);
    if (!potluck) throw new Error("Potluck not found.");
    if (potluck.hostId !== user._id) throw new Error("Only the host can close voting.");

    await ctx.db.patch(potluck._id, {
      status: "closed",
      podium: args.podium,
      results: args.results,
      updatedAt: Date.now(),
    });
  },
});
