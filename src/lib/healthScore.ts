// Stand-in health scoring. Real AI is not connected: a dish gets one random
// 0–100 score, stored on the dish, and that number is what the results use.

export type ScoringMode = "manual" | "ai";

export function isAiCategory(category: { mode?: string | null } | null | undefined): boolean {
  return category?.mode === "ai";
}

/** Healthiness (and names like it) can switch between guest stars and AI. */
export function supportsAiScoring(name?: string | null): boolean {
  return /health/i.test(name ?? "");
}

/** Integer 0–100. `random` is injectable for tests; Math.random() is [0, 1). */
export function mockHealthScore(random: () => number = Math.random): number {
  const n = Math.floor(random() * 101);
  return Math.max(0, Math.min(100, n));
}

export function healthPoints(dish: { aiScores?: Record<string, number> | null } | null | undefined, categoryId: string): number | null {
  const raw = dish?.aiScores?.[categoryId];
  if (raw == null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Map the 0–100 health score onto the same 0–5 scale as guest stars. */
export function aiScoreOnFive(points: number): number {
  return points / 20;
}
