// Builders turn form state into the exact document shapes the backend expects.

export function localDateTime(date?: string | null, time: string = "00:00"): Date | null {
  if (!date) return null;
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = (time || "00:00").split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm);
}

function toEpoch(value: any): number | null {
  if (!value) return null;
  if (typeof value === "number") return value;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

/** Fields the host controls (shared by create + edit). */
export function potluckFields(form: any) {
  const scoring = (form.scoring || []).map((c: any, i: number) => ({
    id: `c${i}`,
    name: (c.name || "").trim(),
    description: (c.description ?? "").trim(),
    weight: Number(c.weight) || 0,
    ...(c.mode === "ai" ? { mode: "ai" as const } : {}),
  }));
  const startsAtDate = localDateTime(form.date, form.time);
  return {
    title: (form.title || "").trim(),
    theme: (form.theme ?? "").trim(),
    format: form.format,
    formatDetail: (form.formatDetail ?? "").trim(),
    description: (form.description ?? "").trim(),
    location: (form.location ?? "").trim(),
    startsAt: startsAtDate ? startsAtDate.getTime() : Date.now(),
    votingOpensAt: toEpoch(form.votingOpensAt),
    votingClosesAt: toEpoch(form.votingClosesAt),
    maxGuests: Math.max(0, parseInt(form.maxGuests, 10) || 0),
    scoring,
    categoryIds: scoring.map((c: any) => c.id),
    dishCategories: (form.dishCategories || [])
      .filter((c: any) => (c.name || "").trim())
      .map((c: any) => ({
        id: c.id,
        name: (c.name || "").trim(),
        needed: Math.max(1, parseInt(c.needed, 10) || 1),
      })),
    coverImage: form.coverImage ?? null,
    updatedAt: Date.now(),
  };
}

export function newPotluckDoc(form: any, uid: string) {
  return {
    ...potluckFields(form),
    inviteCode: form.inviteCode,
    hostId: uid,
    memberIds: [uid],
    status: "open",
    podium: [],
    results: null,
    createdAt: Date.now(),
  };
}

function toInt(v: any): number | null {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Splits a textarea into a clean list: one item per line, or comma-separated
 * when everything is on a single line ("noodles, sesame, soy").
 */
export function toList(text?: string | null): string[] {
  const raw = (text ?? "").trim();
  const parts = raw.includes("\n") ? raw.split("\n") : raw.split(",");
  return parts.map((s) => s.replace(/^\s*[-•*]\s*/, "").trim()).filter(Boolean);
}

/** Fields an author controls on their dish. */
export function dishFields(form: any) {
  return {
    name: (form.name || "").trim(),
    categoryId: form.categoryId,
    serves: (form.serves ?? "").trim(),
    ingredients: Array.isArray(form.ingredients) ? form.ingredients : toList(form.ingredients),
    steps: (form.steps ?? "").trim(),
    allergens: form.allergens ?? [],
    dietary: form.dietary ?? [],
    prepMinutes: toInt(form.prepMinutes),
    calories: toInt(form.calories),
    photo: form.photo ?? null,
    recipePhoto: form.recipePhoto ?? null,
    usedRequired: Boolean(form.usedRequired),
    updatedAt: Date.now(),
    ...(form.aiScores && typeof form.aiScores === "object" ? { aiScores: form.aiScores } : {}),
  };
}

export function newDishDoc(form: any, { uid, potluckId }: { uid: string; potluckId: string }) {
  return {
    ...dishFields(form),
    authorId: uid,
    potluckId,
    scoreSums: {},
    ratingCount: 0,
    likedBy: [],
    createdAt: Date.now(),
  };
}
