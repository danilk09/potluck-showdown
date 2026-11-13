// Shared server-side checks. Every public function goes through these, so
// the rules hold even when someone calls the deployment directly instead of
// using the app.
import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type ReadCtx = QueryCtx | MutationCtx;

export const SESSION_TTL_MS = 60 * 24 * 60 * 60 * 1000; // 60 days, extended while in use

export function fail(message: string): never {
  throw new ConvexError(message);
}

// ---------- sessions ----------

/** The signed-in user for a session token, or null if the token is missing, unknown or expired. */
export async function getSessionUser(ctx: ReadCtx, sessionToken?: string | null): Promise<Doc<"users"> | null> {
  if (!sessionToken) return null;
  const session = await ctx.db
    .query("sessions")
    .withIndex("by_token", (q) => q.eq("token", sessionToken))
    .unique();
  if (!session || session.expiresAt <= Date.now()) return null;
  return await ctx.db.get(session.userId);
}

export async function requireUser(ctx: ReadCtx, sessionToken?: string | null): Promise<Doc<"users">> {
  const user = await getSessionUser(ctx, sessionToken);
  if (!user) fail("Please sign in first.");
  return user;
}

// ---------- ids ----------

export async function getPotluck(ctx: ReadCtx, potluckId: string): Promise<Doc<"potlucks"> | null> {
  const id = ctx.db.normalizeId("potlucks", potluckId);
  return id ? await ctx.db.get(id) : null;
}

export async function getDish(ctx: ReadCtx, dishId: string): Promise<Doc<"dishes"> | null> {
  const id = ctx.db.normalizeId("dishes", dishId);
  return id ? await ctx.db.get(id) : null;
}

export async function requirePotluck(ctx: ReadCtx, potluckId: string): Promise<Doc<"potlucks">> {
  const potluck = await getPotluck(ctx, potluckId);
  if (!potluck) fail("Potluck not found.");
  return potluck;
}

export function isMember(potluck: Doc<"potlucks">, userId: Id<"users"> | string): boolean {
  return potluck.memberIds.includes(userId);
}

export function requireMember(potluck: Doc<"potlucks">, user: Doc<"users">) {
  if (!isMember(potluck, user._id)) fail("You need to join this potluck first.");
}

export function requireHost(potluck: Doc<"potlucks">, user: Doc<"users">) {
  if (potluck.hostId !== user._id) fail("Only the host can do that.");
}

/** Potlucks the user belongs to. */
export async function potlucksForUser(ctx: ReadCtx, userId: Id<"users">): Promise<Doc<"potlucks">[]> {
  // memberIds is an array, which Convex can't index, so this scans potlucks.
  // Move membership into its own indexed table if the app grows large.
  const all = await ctx.db.query("potlucks").collect();
  return all.filter((p) => p.memberIds.includes(userId));
}

// ---------- phases (mirror src/lib/phase.ts) ----------

/** Dishes can be added and edited only before voting starts. */
export function dishesEditable(p: Doc<"potlucks">, now = Date.now()): boolean {
  return p.status === "open" && (p.votingOpensAt == null || now < p.votingOpensAt);
}

/** Voting is live when the host opened it, or the scheduled time arrived, and it hasn't closed. */
export function votingLive(p: Doc<"potlucks">, now = Date.now()): boolean {
  if (p.status === "closed") return false;
  const opened = p.status === "voting" || (p.votingOpensAt != null && now >= p.votingOpensAt);
  const closed = p.votingClosesAt != null && now >= p.votingClosesAt;
  return opened && !closed;
}

// ---------- validation ----------

const FORMATS = ["classic", "mystery", "regional", "courses"];
const CATEGORY_IDS = ["c0", "c1", "c2", "c3"];
export const FRAME_TIERS = ["gold", "silver", "bronze", "host"] as const;
export const INVITE_CODE_RE = /^[A-Z0-9-]{4,20}$/;

function str(value: unknown, field: string, min: number, max: number): string {
  if (typeof value !== "string") fail(`${field} is missing.`);
  const s = value.trim();
  if (s.length < min) fail(`${field} is required.`);
  if (s.length > max) fail(`${field} is too long (max ${max} characters).`);
  return s;
}

function optStr(value: unknown, field: string, max: number): string {
  if (value == null) return "";
  return str(value, field, 0, max);
}

function optTime(value: unknown, field: string): number | null {
  if (value == null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) fail(`${field} is not a valid time.`);
  return value;
}

function stringList(value: unknown, field: string, max: number, itemMax: number): string[] {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > max) fail(`${field} has too many entries.`);
  return value.map((v) => str(v, field, 1, itemMax));
}

/** Host-controlled potluck fields, cleaned and checked. */
export function validatePotluckForm(form: any) {
  if (!form || typeof form !== "object") fail("Missing potluck details.");
  if (!FORMATS.includes(form.format)) fail("Unknown potluck format.");
  const startsAt = optTime(form.startsAt, "Start time");
  if (startsAt == null) fail("Start time is required.");

  if (!Array.isArray(form.scoring) || form.scoring.length < 1 || form.scoring.length > 4) {
    fail("Pick between 1 and 4 scoring categories.");
  }
  const scoring = form.scoring.map((c: any, i: number) => {
    const weight = Number(c?.weight);
    if (!Number.isFinite(weight) || weight < 0 || weight > 100) fail("Scoring weights must be between 0 and 100.");
    return {
      id: CATEGORY_IDS[i],
      name: str(c?.name, "Scoring category name", 1, 40),
      description: optStr(c?.description, "Scoring description", 200),
      weight,
    };
  });

  if (!Array.isArray(form.dishCategories) || form.dishCategories.length < 1 || form.dishCategories.length > 12) {
    fail("Add between 1 and 12 dish categories.");
  }
  const dishCategories = form.dishCategories.map((c: any) => {
    const needed = Number(c?.needed);
    if (!Number.isInteger(needed) || needed < 1 || needed > 100) fail("Dish slots must be a whole number from 1 to 100.");
    return { id: str(c?.id, "Dish category id", 1, 40), name: str(c?.name, "Dish category name", 1, 60), needed };
  });

  const maxGuests = Number(form.maxGuests ?? 0);
  if (!Number.isInteger(maxGuests) || maxGuests < 0 || maxGuests > 1000) fail("Max guests must be a whole number.");

  const votingOpensAt = optTime(form.votingOpensAt, "Voting open time");
  const votingClosesAt = optTime(form.votingClosesAt, "Voting close time");
  if (votingOpensAt != null && votingClosesAt != null && votingClosesAt <= votingOpensAt) {
    fail("Voting must close after it opens.");
  }

  return {
    title: str(form.title, "Title", 1, 80),
    theme: optStr(form.theme, "Theme", 120),
    format: form.format as string,
    formatDetail: optStr(form.formatDetail, "Format details", 300),
    description: optStr(form.description, "Description", 1000),
    location: optStr(form.location, "Location", 160),
    startsAt,
    votingOpensAt,
    votingClosesAt,
    maxGuests,
    scoring,
    categoryIds: scoring.map((c: any) => c.id),
    dishCategories,
  };
}

/** Author-controlled dish fields, cleaned and checked against the potluck. */
export function validateDishForm(form: any, potluck: Doc<"potlucks">) {
  if (!form || typeof form !== "object") fail("Missing dish details.");
  if (!potluck.dishCategories.some((c) => c.id === form.categoryId)) fail("Pick one of this potluck's dish categories.");
  const ingredients = stringList(form.ingredients, "Ingredients", 60, 200);
  if (ingredients.length < 1) fail("Add at least one ingredient.");
  const wholeNumber = (v: unknown, field: string) => {
    if (v == null) return null;
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 100000) fail(`${field} must be a whole number.`);
    return v;
  };
  return {
    name: str(form.name, "Dish name", 1, 80),
    categoryId: form.categoryId as string,
    serves: optStr(form.serves, "Serves", 40),
    ingredients,
    steps: optStr(form.steps, "Steps", 8000),
    allergens: stringList(form.allergens, "Allergens", 20, 60),
    dietary: stringList(form.dietary, "Dietary tags", 20, 60),
    prepMinutes: wholeNumber(form.prepMinutes, "Prep time"),
    calories: wholeNumber(form.calories, "Calories"),
    photo: (form.photo ?? null) as string | null,
    recipePhoto: (form.recipePhoto ?? null) as string | null,
    usedRequired: Boolean(form.usedRequired),
  };
}

/** A ballot must score exactly the potluck's categories, each a whole number 1–5. */
export function validateScores(scores: unknown, potluck: Doc<"potlucks">): Record<string, number> {
  if (!scores || typeof scores !== "object" || Array.isArray(scores)) fail("Missing scores.");
  const entries = Object.entries(scores as Record<string, unknown>);
  const keys = entries.map(([k]) => k).sort();
  const expected = [...potluck.categoryIds].sort();
  if (keys.length !== expected.length || keys.some((k, i) => k !== expected[i])) {
    fail("Score every category for this potluck.");
  }
  for (const [, v] of entries) {
    if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > 5) fail("Scores must be whole numbers from 1 to 5.");
  }
  return scores as Record<string, number>;
}

// ---------- frames ----------

/** True if a closed potluck backs the frame (podium place or host). */
export function frameEarned(tier: string, potluck: Doc<"potlucks"> | null, userId: Id<"users">): boolean {
  if (!potluck || potluck.status !== "closed") return false;
  if (tier === "host") return potluck.hostId === userId;
  const place = ["gold", "silver", "bronze"].indexOf(tier);
  return place >= 0 && potluck.podium[place] === userId;
}

// ---------- images ----------

export const IMAGE_REF_PREFIX = "img:";
export const MAX_IMAGE_CHARS = 900_000;
export const IMAGE_DATA_RE = /^data:image\/(jpeg|png|webp);base64,/;

/** The image id inside an `img:<potluckId>/<imageId>` reference, if it's valid. */
export function imageIdFromRef(ctx: ReadCtx, ref?: string | null): Id<"images"> | null {
  if (typeof ref !== "string" || !ref.startsWith(IMAGE_REF_PREFIX)) return null;
  const imageId = ref.slice(IMAGE_REF_PREFIX.length).split("/")[1];
  return imageId ? ctx.db.normalizeId("images", imageId) : null;
}

/** Photos on a dish or potluck must be images the caller uploaded to that potluck. */
export async function requireOwnImage(ctx: ReadCtx, ref: string | null, potluckId: string, userId: Id<"users">) {
  if (ref == null) return;
  const id = imageIdFromRef(ctx, ref);
  const image = id ? await ctx.db.get(id) : null;
  if (!image || image.potluckId !== potluckId || image.ownerId !== userId) fail("That photo couldn't be found.");
}

/** Deletes the image behind a reference (no-op for missing or non-image refs). */
export async function deleteImageRef(ctx: MutationCtx, ref?: string | null) {
  const id = imageIdFromRef(ctx, ref);
  if (id && (await ctx.db.get(id))) await ctx.db.delete(id);
}
