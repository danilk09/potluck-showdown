// @vitest-environment edge-runtime
/// <reference types="vite/client" />
// Runs the real Convex functions against an in-memory backend, as different
// users, including the calls the app would never make on its own.
import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import * as seed from "./seed";
import * as seedDemo from "./seedDemo";

const modules = import.meta.glob("./**/*.ts");

const potluckForm = (overrides: Record<string, unknown> = {}) => ({
  title: "Harvest Showdown",
  theme: "Fall",
  format: "classic",
  formatDetail: "",
  description: "",
  location: "Kitchen",
  startsAt: Date.now() + 86_400_000,
  votingOpensAt: null,
  votingClosesAt: null,
  maxGuests: 0,
  scoring: [
    { id: "c0", name: "Taste", description: "", weight: 60 },
    { id: "c1", name: "Looks", description: "", weight: 40 },
  ],
  categoryIds: ["c0", "c1"],
  dishCategories: [{ id: "k0", name: "Mains", needed: 4 }],
  coverImage: null,
  inviteCode: "HARVEST-7K2Q",
  ...overrides,
});

const dishForm = (overrides: Record<string, unknown> = {}) => ({
  name: "Chili",
  categoryId: "k0",
  serves: "6",
  ingredients: ["beans", "tomato"],
  steps: "Simmer.",
  allergens: [],
  dietary: ["Vegan"],
  prepMinutes: 30,
  calories: null,
  photo: null,
  recipePhoto: null,
  usedRequired: false,
  ...overrides,
});

const PNG = "data:image/png;base64,iVBORw0KGgo=";

async function setup() {
  const t = convexTest(schema, modules);
  const signUp = async (name: string) => {
    const { sessionToken } = await t.action(api.auth.signUp, {
      email: `${name}@example.com`,
      password: "password123",
      displayName: name,
    });
    const me = await t.query(api.users.currentUser, { sessionToken });
    return { token: sessionToken, id: me!.uid as string };
  };
  const host = await signUp("host");
  const guest = await signUp("guest");
  const outsider = await signUp("outsider");
  const potluckId = await t.mutation(api.potlucks.create, { sessionToken: host.token, form: potluckForm() });
  await t.mutation(api.potlucks.join, { sessionToken: guest.token, potluckId });
  return { t, host, guest, outsider, potluckId, signUp };
}

describe("accounts and sessions", () => {
  test("passwords are stored hashed, never as typed", async () => {
    const { t } = await setup();
    const users = await t.run((ctx) => ctx.db.query("users").collect());
    for (const u of users) {
      expect(u.password).toBeUndefined();
      expect(u.passwordHash).toMatch(/^scrypt\$/);
      expect(u.passwordHash).not.toContain("password123");
    }
  });

  test("sign-in checks the password", async () => {
    const { t } = await setup();
    await expect(t.action(api.auth.signIn, { email: "host@example.com", password: "nope-nope" })).rejects.toThrow(
      /don’t match/,
    );
    const { sessionToken } = await t.action(api.auth.signIn, { email: "HOST@example.com ", password: "password123" });
    expect(await t.query(api.users.currentUser, { sessionToken })).toMatchObject({ displayName: "host" });
  });

  test("old plain-text passwords still sign in once, then get hashed", async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) =>
      ctx.db.insert("users", {
        email: "old@example.com",
        password: "legacy-pass",
        sessionToken: "tok_old",
        displayName: "Old",
        isGuest: false,
        createdAt: 0,
        lastSeenAt: 0,
      }),
    );
    // The legacy token no longer works.
    expect(await t.query(api.users.currentUser, { sessionToken: "tok_old" })).toBeNull();
    await t.action(api.auth.signIn, { email: "old@example.com", password: "legacy-pass" });
    const [user] = await t.run((ctx) => ctx.db.query("users").collect());
    expect(user.password).toBeUndefined();
    expect(user.sessionToken).toBeUndefined();
    expect(user.passwordHash).toMatch(/^scrypt\$/);
  });

  test("several devices can be signed in, and sign-out ends the session on the server", async () => {
    const { t, host } = await setup();
    const second = await t.action(api.auth.signIn, { email: "host@example.com", password: "password123" });
    expect(await t.query(api.users.currentUser, { sessionToken: host.token })).not.toBeNull();
    await t.mutation(api.users.signOut, { sessionToken: host.token });
    expect(await t.query(api.users.currentUser, { sessionToken: host.token })).toBeNull();
    expect(await t.query(api.users.currentUser, { sessionToken: second.sessionToken })).not.toBeNull();
  });

  test("expired sessions stop working and get purged", async () => {
    const { t, host } = await setup();
    await t.run(async (ctx) => {
      const s = await ctx.db.query("sessions").withIndex("by_token", (q) => q.eq("token", host.token)).unique();
      await ctx.db.patch(s!._id, { expiresAt: Date.now() - 1 });
    });
    expect(await t.query(api.users.currentUser, { sessionToken: host.token })).toBeNull();
    await t.mutation(internal.authStore.purgeExpired, {});
    const left = await t.run((ctx) => ctx.db.query("sessions").withIndex("by_token", (q) => q.eq("token", host.token)).unique());
    expect(left).toBeNull();
  });

  test("password reset: wrong codes are limited, the right one sets a new password and signs out other devices", async () => {
    const { t, host } = await setup();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await t.action(api.auth.requestPasswordReset, { email: "host@example.com" });
    const code = /code for host@example\.com: ([A-Z0-9]{8})/.exec(warn.mock.calls.map((c) => c.join(" ")).join("\n"))![1];
    warn.mockRestore();

    await expect(
      t.action(api.auth.resetPassword, { email: "host@example.com", code: "WRONG000", password: "brand-new-pass" }),
    ).rejects.toThrow(/isn’t right/);
    const { sessionToken } = await t.action(api.auth.resetPassword, {
      email: "host@example.com",
      code: code.toLowerCase(),
      password: "brand-new-pass",
    });
    expect(await t.query(api.users.currentUser, { sessionToken })).not.toBeNull();
    expect(await t.query(api.users.currentUser, { sessionToken: host.token })).toBeNull();
    await expect(t.action(api.auth.signIn, { email: "host@example.com", password: "password123" })).rejects.toThrow();
    await t.action(api.auth.signIn, { email: "host@example.com", password: "brand-new-pass" });
    // Codes are single use.
    await expect(
      t.action(api.auth.resetPassword, { email: "host@example.com", code, password: "another-pass" }),
    ).rejects.toThrow(/expired/);
  });

  test("reset requests don't reveal whether an email has an account", async () => {
    const { t } = await setup();
    await expect(t.action(api.auth.requestPasswordReset, { email: "nobody@example.com" })).resolves.toBeNull();
  });

  test("the database wipe (seed) is not part of the public API", () => {
    for (const fn of [seed.defaultSeed, seedDemo.run] as any[]) {
      expect(fn.isInternal).toBe(true);
      expect(fn.isPublic).toBeFalsy();
    }
  });

  test("deleting a full account needs the password", async () => {
    const { t, guest } = await setup();
    await expect(t.action(api.auth.deleteAccount, { sessionToken: guest.token, password: "wrong-pass" })).rejects.toThrow();
    await t.action(api.auth.deleteAccount, { sessionToken: guest.token, password: "password123" });
    expect(await t.query(api.users.currentUser, { sessionToken: guest.token })).toBeNull();
  });
});

describe("privacy", () => {
  test("non-members can't read dishes, photos or the recipe bank of a potluck", async () => {
    const { t, guest, outsider, potluckId } = await setup();
    const ref = await t.mutation(api.images.upload, { sessionToken: guest.token, potluckId, data: PNG });
    const dishId = await t.mutation(api.dishes.claim, { sessionToken: guest.token, potluckId, form: dishForm({ photo: ref }) });
    const imageId = ref.split("/")[1];

    expect(await t.query(api.dishes.listByPotluck, { sessionToken: guest.token, potluckId })).toHaveLength(1);
    expect(await t.query(api.dishes.listByPotluck, { sessionToken: outsider.token, potluckId })).toEqual([]);
    expect(await t.query(api.dishes.get, { sessionToken: outsider.token, dishId })).toBeNull();
    expect(await t.query(api.images.get, { sessionToken: outsider.token, imageId })).toBeNull();
    expect(await t.query(api.images.get, { sessionToken: guest.token, imageId })).toBe(PNG);
    expect(await t.query(api.dishes.recipeBank, { sessionToken: outsider.token })).toEqual([]);
    expect(await t.query(api.dishes.recipeBank, { sessionToken: guest.token })).toHaveLength(1);
  });

  test("nothing is readable without a valid session", async () => {
    const { t, potluckId } = await setup();
    expect(await t.query(api.potlucks.get, { sessionToken: "made-up", potluckId })).toBeNull();
    expect(await t.query(api.potlucks.listMyPotlucks, { sessionToken: "made-up" })).toEqual([]);
    expect(await t.query(api.users.getProfiles, { sessionToken: "made-up", userIds: [] })).toEqual({});
  });

  test("people only ever see their own ballots", async () => {
    const { t, host, guest, potluckId } = await setup();
    const dishId = await t.mutation(api.dishes.claim, { sessionToken: host.token, potluckId, form: dishForm() });
    await t.mutation(api.potlucks.openVoting, { sessionToken: host.token, potluckId });
    await t.mutation(api.voting.submitBallot, { sessionToken: guest.token, potluckId, dishId, scores: { c0: 5, c1: 4 } });
    expect(await t.query(api.voting.listMyRatings, { sessionToken: guest.token, potluckId })).toHaveLength(1);
    expect(await t.query(api.voting.listMyRatings, { sessionToken: host.token, potluckId })).toEqual([]);
  });
});

describe("potluck rules", () => {
  test("guests can't host", async () => {
    const t = convexTest(schema, modules);
    const { sessionToken } = await t.action(api.auth.signInGuest, { displayName: "Gus" });
    await expect(t.mutation(api.potlucks.create, { sessionToken, form: potluckForm() })).rejects.toThrow(/before hosting/);
  });

  test("invalid potluck details are rejected", async () => {
    const { t, host } = await setup();
    await expect(
      t.mutation(api.potlucks.create, { sessionToken: host.token, form: potluckForm({ title: "", inviteCode: "OTHER-1234" }) }),
    ).rejects.toThrow(/Title/);
    await expect(
      t.mutation(api.potlucks.create, { sessionToken: host.token, form: potluckForm({ format: "chaos", inviteCode: "OTHER-1234" }) }),
    ).rejects.toThrow(/format/);
  });

  test("joining respects the guest limit and closed potlucks", async () => {
    const { t, host, outsider, signUp } = await setup();
    const small = await t.mutation(api.potlucks.create, {
      sessionToken: host.token,
      form: potluckForm({ inviteCode: "SMALL-1234", maxGuests: 2 }),
    });
    await t.mutation(api.potlucks.join, { sessionToken: outsider.token, potluckId: small });
    const late = await signUp("late");
    await expect(t.mutation(api.potlucks.join, { sessionToken: late.token, potluckId: small })).rejects.toThrow(/full/);

    await t.mutation(api.potlucks.publishResults, { sessionToken: host.token, potluckId: small });
    const other = await signUp("other");
    await expect(t.mutation(api.potlucks.join, { sessionToken: other.token, potluckId: small })).rejects.toThrow(/ended/);
  });

  test("votes: members only, while live, valid scores, not your own dish, once each", async () => {
    const { t, host, guest, outsider, potluckId } = await setup();
    const dishId = await t.mutation(api.dishes.claim, { sessionToken: host.token, potluckId, form: dishForm() });
    const vote = (token: string, scores: Record<string, number>) =>
      t.mutation(api.voting.submitBallot, { sessionToken: token, potluckId, dishId, scores });

    await expect(vote(guest.token, { c0: 5, c1: 5 })).rejects.toThrow(/not currently open/);
    await t.mutation(api.potlucks.openVoting, { sessionToken: host.token, potluckId });

    await expect(vote(outsider.token, { c0: 5, c1: 5 })).rejects.toThrow(/join/);
    await expect(vote(host.token, { c0: 5, c1: 5 })).rejects.toThrow(/own dish/);
    await expect(vote(guest.token, { c0: 99, c1: 5 })).rejects.toThrow(/1 to 5/);
    await expect(vote(guest.token, { c0: 5 })).rejects.toThrow(/every category/);
    await expect(vote(guest.token, { c0: 5, c1: 5, c2: 5 })).rejects.toThrow(/every category/);
    await vote(guest.token, { c0: 5, c1: 3 });
    await expect(vote(guest.token, { c0: 5, c1: 3 })).rejects.toThrow(/already rated/);

    const dish = await t.query(api.dishes.get, { sessionToken: guest.token, dishId });
    expect(dish).toMatchObject({ ratingCount: 1, scoreSums: { c0: 5, c1: 3 } });
  });

  test("scheduled voting times are enforced", async () => {
    const { t, host, guest, potluckId } = await setup();
    const dishId = await t.mutation(api.dishes.claim, { sessionToken: host.token, potluckId, form: dishForm() });
    // Opens on schedule (in the past) and closes in the past: not live.
    await t.mutation(api.potlucks.update, {
      sessionToken: host.token,
      potluckId,
      form: { votingOpensAt: Date.now() - 10_000, votingClosesAt: Date.now() - 5_000 },
    });
    await expect(
      t.mutation(api.voting.submitBallot, { sessionToken: guest.token, potluckId, dishId, scores: { c0: 4, c1: 4 } }),
    ).rejects.toThrow(/not currently open/);
  });

  test("dishes lock once voting starts", async () => {
    const { t, host, guest, potluckId } = await setup();
    const dishId = await t.mutation(api.dishes.claim, { sessionToken: guest.token, potluckId, form: dishForm() });
    await t.mutation(api.potlucks.openVoting, { sessionToken: host.token, potluckId });
    await expect(
      t.mutation(api.dishes.update, { sessionToken: guest.token, dishId, form: { name: "Better chili" } }),
    ).rejects.toThrow(/locked/);
    await expect(t.mutation(api.dishes.claim, { sessionToken: guest.token, potluckId, form: dishForm() })).rejects.toThrow(
      /locked/,
    );
    await expect(t.mutation(api.dishes.deleteDish, { sessionToken: guest.token, dishId })).rejects.toThrow(/permission/);
  });

  test("non-members can't add dishes", async () => {
    const { t, outsider, potluckId } = await setup();
    await expect(t.mutation(api.dishes.claim, { sessionToken: outsider.token, potluckId, form: dishForm() })).rejects.toThrow(
      /join/,
    );
  });

  test("results are calculated on the server and are final", async () => {
    const { t, host, guest, potluckId } = await setup();
    const hostDish = await t.mutation(api.dishes.claim, { sessionToken: host.token, potluckId, form: dishForm() });
    await t.mutation(api.potlucks.openVoting, { sessionToken: host.token, potluckId });
    await t.mutation(api.voting.submitBallot, {
      sessionToken: guest.token,
      potluckId,
      dishId: hostDish,
      scores: { c0: 5, c1: 5 },
    });
    await t.mutation(api.potlucks.publishResults, { sessionToken: host.token, potluckId });

    const p = await t.query(api.potlucks.get, { sessionToken: host.token, potluckId });
    expect(p).toMatchObject({ status: "closed", podium: [host.id] });
    await expect(
      t.mutation(api.potlucks.update, { sessionToken: host.token, potluckId, form: { title: "Changed" } }),
    ).rejects.toThrow(/final/);
    await expect(t.mutation(api.potlucks.deletePotluck, { sessionToken: host.token, potluckId })).rejects.toThrow(/kept/);
  });

  test("frames must be earned", async () => {
    const { t, host, guest, potluckId } = await setup();
    await expect(
      t.mutation(api.users.updateProfile, { sessionToken: guest.token, patch: { frame: { tier: "gold", potluckId } } }),
    ).rejects.toThrow(/earned/);
    await t.mutation(api.potlucks.publishResults, { sessionToken: host.token, potluckId });
    await t.mutation(api.users.updateProfile, { sessionToken: host.token, patch: { frame: { tier: "host", potluckId } } });
    await expect(
      t.mutation(api.users.updateProfile, { sessionToken: guest.token, patch: { frame: { tier: "host", potluckId } } }),
    ).rejects.toThrow(/earned/);
  });

  test("only the host runs the event", async () => {
    const { t, guest, potluckId, host } = await setup();
    await expect(t.mutation(api.potlucks.openVoting, { sessionToken: guest.token, potluckId })).rejects.toThrow(/host/);
    await expect(t.mutation(api.potlucks.publishResults, { sessionToken: guest.token, potluckId })).rejects.toThrow(/host/);
    await expect(
      t.mutation(api.potlucks.removeGuest, { sessionToken: host.token, potluckId, guestId: host.id }),
    ).rejects.toThrow(/can’t be removed/);
  });
});

describe("cleanup", () => {
  test("photos must be valid images and are deleted when replaced", async () => {
    const { t, guest, potluckId } = await setup();
    await expect(
      t.mutation(api.images.upload, { sessionToken: guest.token, potluckId, data: "data:text/html;base64,PHNjcmlwdD4=" }),
    ).rejects.toThrow(/JPEG/);
    await expect(
      t.mutation(api.images.upload, { sessionToken: guest.token, potluckId, data: PNG + "A".repeat(900_000) }),
    ).rejects.toThrow(/too large/);

    const first = await t.mutation(api.images.upload, { sessionToken: guest.token, potluckId, data: PNG });
    const dishId = await t.mutation(api.dishes.claim, { sessionToken: guest.token, potluckId, form: dishForm({ photo: first }) });
    const second = await t.mutation(api.images.upload, { sessionToken: guest.token, potluckId, data: PNG });
    await t.mutation(api.dishes.update, { sessionToken: guest.token, dishId, form: { photo: second } });
    expect(await t.run((ctx) => ctx.db.query("images").collect())).toHaveLength(1);

    await t.mutation(api.dishes.deleteDish, { sessionToken: guest.token, dishId });
    expect(await t.run((ctx) => ctx.db.query("images").collect())).toHaveLength(0);
  });

  test("you can't attach someone else's photo", async () => {
    const { t, host, guest, potluckId } = await setup();
    const hostPhoto = await t.mutation(api.images.upload, { sessionToken: host.token, potluckId, data: PNG });
    await expect(
      t.mutation(api.dishes.claim, { sessionToken: guest.token, potluckId, form: dishForm({ photo: hostPhoto }) }),
    ).rejects.toThrow(/photo/);
  });

  test("deleting an account removes everything it owns", async () => {
    const { t, host, guest, potluckId } = await setup();
    const hostDish = await t.mutation(api.dishes.claim, { sessionToken: host.token, potluckId, form: dishForm() });
    const ref = await t.mutation(api.images.upload, { sessionToken: guest.token, potluckId, data: PNG });
    await t.mutation(api.dishes.claim, { sessionToken: guest.token, potluckId, form: dishForm({ photo: ref }) });
    await t.mutation(api.dishes.toggleLike, { sessionToken: guest.token, dishId: hostDish });
    await t.mutation(api.potlucks.openVoting, { sessionToken: host.token, potluckId });
    await t.mutation(api.voting.submitBallot, {
      sessionToken: guest.token,
      potluckId,
      dishId: hostDish,
      scores: { c0: 4, c1: 2 },
    });

    await t.action(api.auth.deleteAccount, { sessionToken: guest.token, password: "password123" });

    const state = await t.run(async (ctx) => ({
      ballots: await ctx.db.query("ballots").collect(),
      images: await ctx.db.query("images").collect(),
      dishes: await ctx.db.query("dishes").collect(),
      potluck: await ctx.db.query("potlucks").first(),
    }));
    expect(state.ballots).toHaveLength(0);
    expect(state.images).toHaveLength(0);
    expect(state.dishes).toHaveLength(1); // only the host's
    expect(state.dishes[0]).toMatchObject({ likedBy: [], ratingCount: 0, scoreSums: { c0: 0, c1: 0 } });
    expect(state.potluck!.memberIds).toEqual([host.id]);
  });

  test("deleting a host cancels their unfinished potlucks", async () => {
    const { t, host } = await setup();
    await t.action(api.auth.deleteAccount, { sessionToken: host.token, password: "password123" });
    const left = await t.run(async (ctx) => ({
      potlucks: await ctx.db.query("potlucks").collect(),
      invites: await ctx.db.query("inviteCodes").collect(),
    }));
    expect(left).toEqual({ potlucks: [], invites: [] });
  });
});
