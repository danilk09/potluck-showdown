import { v } from "convex/values";

export const scoredDishArgs = {
  sessionToken: v.string(),
  potluckId: v.id("potlucks"),
  dishId: v.optional(v.id("dishes")),
  form: v.optional(v.object({
    name: v.string(),
    categoryId: v.string(),
    serves: v.string(),
    ingredients: v.array(v.string()),
    steps: v.string(),
    allergens: v.array(v.string()),
    dietary: v.array(v.string()),
    prepMinutes: v.union(v.number(), v.null()),
    calories: v.union(v.number(), v.null()),
    protein: v.optional(v.union(v.number(), v.null())),
    photo: v.union(v.string(), v.null()),
    recipePhoto: v.union(v.string(), v.null()),
    usedRequired: v.boolean(),
    updatedAt: v.number(),
  })),
};
