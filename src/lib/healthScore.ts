export type ScoringMode = "manual" | "ai";

export function isAiCategory(category: { mode?: string | null } | null | undefined): boolean {
  return category?.mode === "ai";
}

/** Healthiness (and names like it) can switch between guest stars and AI. */
export function supportsAiScoring(name?: string | null): boolean {
  return /health/i.test(name ?? "");
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
