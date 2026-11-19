// @vitest-environment edge-runtime
/// <reference types="vite/client" />
// Checks the evaluation data does what the task cards promise.
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { buildSpec, EVAL_PASSWORD, emailFor } from "./evalSeed";
import { MAX_IMAGE_CHARS, validateDishForm, validatePotluckForm } from "./lib/access";
import { phaseOf } from "../src/lib/phase";

const modules = import.meta.glob("./**/*.ts");

const newBackend = () => convexTest(schema, modules);
let t: ReturnType<typeof newBackend>;

const signIn = async (key: string) =>
  (await t.action(api.auth.signIn, { email: emailFor(key), password: EVAL_PASSWORD })).sessionToken;
const uidOf = async (key: string) =>
  (await t.run((ctx) => ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", emailFor(key))).first()))!._id;
const byCode = async (code: string) =>
  (await t.run((ctx) => ctx.db.query("potlucks").withIndex("by_inviteCode", (q) => q.eq("inviteCode", code)).first()))!;
const dishNamed = async (potluckId: string, name: string) =>
  (await t.run((ctx) => ctx.db.query("dishes").withIndex("by_potluckId", (q) => q.eq("potluckId", potluckId)).collect())).find(
    (d) => d.name === name,
  )!;

beforeAll(async () => {
  t = newBackend();
  await t.action(internal.evalSeed.run, {});
}, 120_000);

describe("evaluation seed", () => {
  test("every potluck and dish passes the same checks the app applies to edits", async () => {
    for (const p of await t.run((ctx) => ctx.db.query("potlucks").collect())) {
      expect(() => validatePotluckForm(p)).not.toThrow();
      expect(p.scoring.find((c) => c.name === "Healthiness")?.mode).toBe("ai");
      const dishes = await t.run((ctx) => ctx.db.query("dishes").withIndex("by_potluckId", (q) => q.eq("potluckId", p._id)).collect());
      for (const d of dishes) {
        expect(() => validateDishForm(d, p)).not.toThrow();
        expect(d.photo).toMatch(/^img:/);
        expect(Object.values(d.aiScores ?? {})).toHaveLength(1);
      }
    }
    const images = await t.run((ctx) => ctx.db.query("images").collect());
    expect(images).toHaveLength(32 + 4);
    for (const img of images) {
      expect(img.data).toMatch(/^data:image\/png;base64,iVBORw0KGgo/);
      expect(img.data.length).toBeLessThan(MAX_IMAGE_CHARS);
    }
  });

  test("task 2: the upcoming potluck is open, has open dish slots, and the tester isn't in it yet", async () => {
    const p = await byCode("OHANA-4KP2");
    expect(phaseOf(p)).toBe("open");
    expect(p.prizes?.filter(Boolean)).toHaveLength(3);
    const dishes = await t.run((ctx) => ctx.db.query("dishes").withIndex("by_potluckId", (q) => q.eq("potluckId", p._id)).collect());
    const open = p.dishCategories.map((c) => c.needed - dishes.filter((d) => d.categoryId === c.id).length);
    expect(open).toEqual([2, 1, 1, 2, 1]);

    const jordan = await signIn("jordan");
    expect(await t.query(api.potlucks.listMyPotlucks, { sessionToken: jordan })).toEqual([]);
    const preview = await t.query(api.potlucks.lookupByInvite, { sessionToken: jordan, code: "ohana-4kp2" });
    expect(preview?.title).toBe("Hale Aloha Ohana Potluck");
    await t.mutation(api.potlucks.join, { sessionToken: jordan, potluckId: p._id });
    await t.mutation(api.dishes.claim, {
      sessionToken: jordan,
      potluckId: p._id,
      form: { name: "Iced Lilikoi Tea", categoryId: "k4", ingredients: ["tea", "lilikoi"], allergens: [], dietary: [] },
    });
  });

  test("task 3: voting is live, the tester has two votes to change and seven dishes left to rate", async () => {
    const p = await byCode("NIGHTMKT-7RW");
    expect(phaseOf(p)).toBe("voting");
    const sam = await signIn("sam");
    const mine = await t.query(api.voting.listMyRatings, { sessionToken: sam, potluckId: p._id });
    expect(mine).toHaveLength(2);
    const dishes = await t.query(api.dishes.listByPotluck, { sessionToken: sam, potluckId: p._id });
    const samId = await uidOf("sam");
    expect(dishes.filter((d) => d.authorId !== samId && !mine.some((r) => r.dishId === d.id))).toHaveLength(7);
    // Every dish already has some votes, and the participant can't rate their own.
    expect(dishes.every((d) => d.ratingCount >= 4)).toBe(true);
    const own = dishes.find((d) => d.authorId === samId)!;
    await expect(
      t.mutation(api.voting.submitBallot, { sessionToken: sam, potluckId: p._id, dishId: own.id, scores: { c0: 5, c2: 5, c3: 5 } }),
    ).rejects.toThrow(/own dish/);
  });

  test("task 4: results are published with the intended podium and prizes", async () => {
    const p3 = await byCode("KICKOFF-9LMQ");
    const p4 = await byCode("SWEETS-3HJD");
    expect(p3.status).toBe("closed");
    expect(p3.podium).toEqual([await uidOf("malia"), await uidOf("morgan"), await uidOf("taylor")]);
    expect(p4.podium).toEqual([await uidOf("taylor"), await uidOf("malia"), await uidOf("morgan")]);
    expect(p3.results).toMatchObject({ dishCount: 11, guestCount: 11 });
  });

  test("task 4: both phones' accounts can see a full recipe bank and equip the frames they earned", async () => {
    for (const [key, tiers] of [["morgan", ["silver", "bronze"]], ["taylor", ["bronze", "gold"]]] as const) {
      const token = await signIn(key);
      const bank = await t.query(api.dishes.recipeBank, { sessionToken: token });
      expect(bank).toHaveLength(16);
      const [kickoff, sweets] = [await byCode("KICKOFF-9LMQ"), await byCode("SWEETS-3HJD")];
      await t.mutation(api.users.updateProfile, { sessionToken: token, patch: { frame: { tier: tiers[0], potluckId: kickoff._id } } });
      await t.mutation(api.users.updateProfile, { sessionToken: token, patch: { frame: { tier: tiers[1], potluckId: sweets._id } } });
      const me = await t.query(api.users.currentUser, { sessionToken: token });
      expect(me?.feedbackPromptedIds).toEqual([]); // so the feedback popup shows
    }
  });

  test("resetting phone A undoes phone A's tasks and leaves phone B alone", async () => {
    const p1 = await byCode("OHANA-4KP2");
    const p2 = await byCode("NIGHTMKT-7RW");
    const laulau = await dishNamed(p2._id, "Pork & Butterfish Lau Lau");
    const shrimp = await dishNamed(p2._id, "North Shore Garlic Shrimp");

    // Phone A: Jordan already joined and added a drink (test above). Sam changes a vote, votes again, likes something.
    const sam = await signIn("sam");
    await t.mutation(api.voting.submitBallot, { sessionToken: sam, potluckId: p2._id, dishId: laulau._id, scores: { c0: 1, c2: 1, c3: 1 } });
    await t.mutation(api.voting.submitBallot, { sessionToken: sam, potluckId: p2._id, dishId: shrimp._id, scores: { c0: 5, c2: 5, c3: 5 } });
    await t.mutation(api.dishes.toggleLike, { sessionToken: sam, dishId: shrimp._id });
    const morgan = await signIn("morgan");
    await t.mutation(api.feedback.submit, { sessionToken: morgan, source: "form", rating: 4 });

    // Phone B does task 2 at the same time.
    const riley = await signIn("riley");
    await t.mutation(api.potlucks.join, { sessionToken: riley, potluckId: p1._id });

    await t.action(internal.evalSeed.resetPhoneA, {});

    const p1After = await byCode("OHANA-4KP2");
    expect(p1After.memberIds).not.toContain(await uidOf("jordan"));
    expect(p1After.memberIds).toContain(await uidOf("riley")); // phone B untouched
    expect(await dishNamed(p1._id, "Iced Lilikoi Tea")).toBeUndefined();

    const seeded = buildSpec(Date.now()).find((p) => p.key === "p2")!;
    const laulauAfter = await dishNamed(p2._id, "Pork & Butterfish Lau Lau");
    const shrimpAfter = await dishNamed(p2._id, "North Shore Garlic Shrimp");
    expect(laulauAfter.ratingCount).toBe(laulau.ratingCount);
    expect(laulauAfter.scoreSums).toEqual(laulau.scoreSums);
    expect(shrimpAfter.ratingCount).toBe(shrimp.ratingCount);
    expect(shrimpAfter.scoreSums).toEqual(shrimp.scoreSums);
    expect(shrimpAfter.likedBy).toEqual(shrimp.likedBy);
    expect(seeded.testerBallots?.filter((b) => b.voter === "sam")).toHaveLength(2);

    // Signed out, and the feedback is gone; the account still signs in with the same password.
    expect(await t.query(api.users.currentUser, { sessionToken: sam })).toBeNull();
    expect(await t.run((ctx) => ctx.db.query("feedback").collect())).toEqual([]);
    const samAgain = await signIn("sam");
    expect(await t.query(api.voting.listMyRatings, { sessionToken: samAgain, potluckId: p2._id })).toHaveLength(2);
  });
});
