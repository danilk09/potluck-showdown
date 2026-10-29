import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    email: v.optional(v.string()),
    password: v.optional(v.string()),
    displayName: v.string(),
    photoURL: v.optional(v.union(v.string(), v.null())),
    frame: v.optional(v.union(v.any(), v.null())),
    isGuest: v.boolean(),
    sessionToken: v.string(),
    createdAt: v.number(),
    lastSeenAt: v.number(),
  })
    .index("by_sessionToken", ["sessionToken"])
    .index("by_email", ["email"]),

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
    .index("by_potluck_dish", ["potluckId", "dishId"]),

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
  }).index("by_potluckId", ["potluckId"]),
});
