import { Timestamp, increment, serverTimestamp } from 'firebase/firestore';

// Builders turn form state into the exact document shapes firestore.rules
// expects. The app's data layer and the rules tests both use them, so the
// tests exercise the real writes.

export function localDateTime(date, time = '00:00') {
  if (!date) return null;
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = (time || '00:00').split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm);
}

function tsOrNull(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : Timestamp.fromDate(d);
}

/** Fields the host controls (shared by create + edit). */
export function potluckFields(form) {
  const scoring = form.scoring.map((c, i) => ({
    id: `c${i}`,
    name: c.name.trim(),
    description: (c.description ?? '').trim(),
    weight: Number(c.weight) || 0,
  }));
  return {
    title: form.title.trim(),
    theme: (form.theme ?? '').trim(),
    format: form.format,
    formatDetail: (form.formatDetail ?? '').trim(),
    description: (form.description ?? '').trim(),
    location: (form.location ?? '').trim(),
    startsAt: Timestamp.fromDate(localDateTime(form.date, form.time)),
    votingOpensAt: tsOrNull(form.votingOpensAt),
    votingClosesAt: tsOrNull(form.votingClosesAt),
    maxGuests: Math.max(0, parseInt(form.maxGuests, 10) || 0),
    scoring,
    categoryIds: scoring.map((c) => c.id),
    dishCategories: form.dishCategories
      .filter((c) => c.name.trim())
      .map((c) => ({ id: c.id, name: c.name.trim(), needed: Math.max(1, parseInt(c.needed, 10) || 1) })),
    coverImage: form.coverImage ?? null,
    updatedAt: serverTimestamp(),
  };
}

export function newPotluckDoc(form, uid) {
  return {
    ...potluckFields(form),
    inviteCode: form.inviteCode,
    hostId: uid,
    memberIds: [uid],
    status: 'open',
    podium: [],
    results: null,
    createdAt: serverTimestamp(),
  };
}

function toInt(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Splits a textarea into a clean list: one item per line, or comma-separated
 * when everything is on a single line ("noodles, sesame, soy").
 */
export function toList(text) {
  const raw = (text ?? '').trim();
  const parts = raw.includes('\n') ? raw.split('\n') : raw.split(',');
  return parts.map((s) => s.replace(/^\s*[-•*]\s*/, '').trim()).filter(Boolean);
}

/** Fields an author controls on their dish. */
export function dishFields(form) {
  return {
    name: form.name.trim(),
    categoryId: form.categoryId,
    serves: (form.serves ?? '').trim(),
    ingredients: toList(form.ingredients),
    steps: (form.steps ?? '').trim(),
    allergens: form.allergens ?? [],
    dietary: form.dietary ?? [],
    prepMinutes: toInt(form.prepMinutes),
    calories: toInt(form.calories),
    photo: form.photo ?? null,
    recipePhoto: form.recipePhoto ?? null,
    usedRequired: Boolean(form.usedRequired),
    updatedAt: serverTimestamp(),
  };
}

export function newDishDoc(form, { uid, potluckId }) {
  return {
    ...dishFields(form),
    authorId: uid,
    potluckId,
    scoreSums: {},
    ratingCount: 0,
    likedBy: [],
    createdAt: serverTimestamp(),
  };
}

/** The two halves of an anonymous vote; they must be committed in one batch. */
export function voteWrites({ uid, dishId, scores }) {
  const dishPatch = { ratingCount: increment(1) };
  for (const [id, v] of Object.entries(scores)) dishPatch[`scoreSums.${id}`] = increment(v);
  return {
    ratingId: `${dishId}_${uid}`,
    rating: { uid, dishId, scores, createdAt: serverTimestamp() },
    dishPatch,
  };
}
