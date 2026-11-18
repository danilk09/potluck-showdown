import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    email: v.optional(v.string()),
    // scrypt hash (see convex/auth.ts). Never the plain password.
    passwordHash: v.optional(v.string()),
    // Legacy fields from before hashing and the sessions table. Cleared on the
    // user's next sign-in, or in bulk with `npx convex run auth:hashLegacyPasswords`.
    password: v.optional(v.string()),
    sessionToken: v.optional(v.string()),
    displayName: v.string(),
    photoURL: v.optional(v.union(v.string(), v.null())),
    frame: v.optional(v.union(v.object({ tier: v.string(), potluckId: v.string() }), v.null())),
    isGuest: v.boolean(),
    createdAt: v.number(),
    lastSeenAt: v.number(),
    // Finished potlucks the user has already been asked to rate the app for.
    feedbackPromptedIds: v.optional(v.array(v.string())),
  }).index("by_email", ["email"]),

  // One row per signed-in device. Tokens come from a cryptographic RNG in an
  // action, expire, and are deleted on sign-out.
  sessions: defineTable({
    userId: v.id("users"),
    token: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_userId", ["userId"])
    .index("by_expiresAt", ["expiresAt"]),

  // Short-lived password reset codes. Only a SHA-256 of the code is stored.
  passwordResets: defineTable({
    userId: v.id("users"),
    codeHash: v.string(),
    expiresAt: v.number(),
    attempts: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_expiresAt", ["expiresAt"]),

  potlucks: defineTable({
    title: v.string(),
    theme: v.optional(v.string()),
    format: v.string(),
    formatDetail: v.optional(v.string()),
    description: v.optional(v.string()),
    location: v.optional(v.string()),
    startsAt: v.number(),
    votingOpensAt: v.optional(v.union(v.number(), v.null())),
    votingClosesAt: v.optional(v.union(v.number(), v.null())),
    maxGuests: v.number(),
    scoring: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        description: v.optional(v.string()),
        weight: v.number(),
        mode: v.optional(v.union(v.literal("manual"), v.literal("ai"))),
      })
    ),
    categoryIds: v.array(v.string()),
    dishCategories: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        needed: v.number(),
      })
    ),
    coverImage: v.optional(v.union(v.string(), v.null())),
    // Optional physical prizes the host provides, for 1st/2nd/3rd place ("" = none).
    prizes: v.optional(v.array(v.string())),
    inviteCode: v.string(),
    hostId: v.string(),
    memberIds: v.array(v.string()),
    status: v.string(), // 'open' | 'voting' | 'closed'
    podium: v.array(v.any()),
    results: v.optional(v.union(v.any(), v.null())),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_inviteCode", ["inviteCode"])
    .index("by_hostId", ["hostId"]),

  // Mirror of potlucks.memberIds, so "my potlucks" is an index lookup instead
  // of a scan. Kept in sync by convex/lib/members.ts.
  memberships: defineTable({
    userId: v.string(),
    potluckId: v.id("potlucks"),
  })
    .index("by_userId", ["userId"])
    .index("by_potluck_user", ["potluckId", "userId"]),

  dishes: defineTable({
    potluckId: v.string(),
    authorId: v.string(),
    name: v.string(),
    categoryId: v.string(),
    serves: v.optional(v.string()),
    ingredients: v.array(v.string()),
    steps: v.optional(v.string()),
    allergens: v.array(v.string()),
    dietary: v.array(v.string()),
    prepMinutes: v.optional(v.union(v.number(), v.null())),
    calories: v.optional(v.union(v.number(), v.null())),
    photo: v.optional(v.union(v.string(), v.null())),
    recipePhoto: v.optional(v.union(v.string(), v.null())),
    usedRequired: v.boolean(),
    scoreSums: v.any(),
    aiScores: v.optional(v.any()),
    ratingCount: v.number(),
    likedBy: v.array(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_potluckId", ["potluckId"])
    .index("by_authorId", ["authorId"]),

  ballots: defineTable({
    potluckId: v.string(),
    dishId: v.string(),
    userId: v.string(),
    scores: v.any(),
    createdAt: v.number(),
  })
    .index("by_potluck_user", ["potluckId", "userId"])
    .index("by_potluck_dish", ["potluckId", "dishId"])
    .index("by_dish_user", ["dishId", "userId"])
    .index("by_userId", ["userId"]),

  inviteCodes: defineTable({
    code: v.string(),
    potluckId: v.string(),
    hostId: v.string(),
    createdAt: v.number(),
  }).index("by_code", ["code"]),

  images: defineTable({
    potluckId: v.string(),
    ownerId: v.string(),
    data: v.string(),
    createdAt: v.number(),
  })
    .index("by_potluckId", ["potluckId"])
    .index("by_ownerId", ["ownerId"]),

  // App feedback: the quick popup after a finished potluck, or the full form from Profile.
  feedback: defineTable({
    userId: v.id("users"),
    source: v.union(v.literal("popup"), v.literal("form")),
    potluckId: v.optional(v.string()),
    rating: v.number(), // 1–5, required
    reasons: v.optional(v.array(v.string())),
    // Feature questions from the full form; "na" = not applicable.
    features: v.optional(
      v.object({
        creating: v.optional(v.string()),
        joining: v.optional(v.string()),
        addingDish: v.optional(v.string()),
        voting: v.optional(v.string()),
      }),
    ),
    comment: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_userId", ["userId"]),
});
