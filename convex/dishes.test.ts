// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function createTest() {
  return convexTest(schema, modules);
}

type ScoreTest = ReturnType<typeof createTest>;

const now = 1_700_000_000_000;

function dishForm(updatedAt: number) {
  return {
    name: "Lentil soup",
    categoryId: "mains",
    serves: "6",
    ingredients: ["200 g lentils"],
    steps: "Simmer.",
    allergens: [] as string[],
    dietary: [] as string[],
    prepMinutes: 20,
    calories: null,
    photo: null,
    recipePhoto: null,
    usedRequired: false,
    updatedAt,
  };
}

async function seedOpenPotluck(t: ScoreTest) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      displayName: "Alex",
      photoURL: null,
      frame: null,
      isGuest: false,
      sessionToken: "tok_test",
      createdAt: now,
      lastSeenAt: now,
    });
    const potluckId = await ctx.db.insert("potlucks", {
      title: "Harvest",
      format: "classic",
      startsAt: now + 86_400_000,
      votingOpensAt: null,
      votingClosesAt: null,
      maxGuests: 8,
      scoring: [{ id: "health", name: "Healthiness", weight: 100, mode: "ai" }],
      categoryIds: ["health"],
      dishCategories: [{ id: "mains", name: "Mains", needed: 2 }],
      coverImage: null,
      inviteCode: "TEST",
      hostId: userId,
      memberIds: [userId],
      status: "open",
      podium: [],
      results: null,
      createdAt: now,
      updatedAt: now,
    });
    return { potluckId };
  });
}

/** The create path calculateAndSave uses when dishId is omitted: read, then insert. */
async function scoreNewDish(
  t: ScoreTest,
  potluckId: Id<"potlucks">,
  form: ReturnType<typeof dishForm>,
  score: number,
) {
  const previous = await t.query(internal.dishes.prepareScoredDish, {
    sessionToken: "tok_test",
    potluckId,
    now,
  });
  return await t.mutation(internal.dishes.saveScoredDish, {
    sessionToken: "tok_test",
    potluckId,
    form,
    score,
    expectedUpdatedAt: previous.updatedAt,
  });
}

async function dishCount(t: ScoreTest) {
  return await t.run(async (ctx) => (await ctx.db.query("dishes").take(10)).length);
}

describe("scoring a new dish", () => {
  it("keeps a single dish when the same scoring request is retried", async () => {
    const t = createTest();
    const { potluckId } = await seedOpenPotluck(t);
    const form = dishForm(now);

    const first = await scoreNewDish(t, potluckId, form, 70);
    const retried = await scoreNewDish(t, potluckId, form, 90);

    expect(retried).toBe(first);
    expect(await dishCount(t)).toBe(1);
  });

  it("keeps a single dish when the same scoring request runs concurrently", async () => {
    const t = createTest();
    const { potluckId } = await seedOpenPotluck(t);
    const form = dishForm(now);

    const [first, second] = await Promise.all([
      scoreNewDish(t, potluckId, form, 70),
      scoreNewDish(t, potluckId, form, 70),
    ]);

    expect(second).toBe(first);
    expect(await dishCount(t)).toBe(1);
  });

  it("still creates a dish for each distinct scoring request", async () => {
    const t = createTest();
    const { potluckId } = await seedOpenPotluck(t);

    const first = await scoreNewDish(t, potluckId, dishForm(now), 70);
    const second = await scoreNewDish(t, potluckId, dishForm(now + 1), 70);

    expect(second).not.toBe(first);
    expect(await dishCount(t)).toBe(2);
  });
});
