// Pure scoring helpers shared by the results page, feed, and publishing step.
// Each dish stores per-category score sums plus a vote count, so averages and
// weighted totals can be derived without exposing individual (anonymous) votes.

export function categoryAverage(dish: any, categoryId: string): number | null {
  if (!dish?.ratingCount) return null;
  return (dish.scoreSums?.[categoryId] ?? 0) / dish.ratingCount;
}

/** Weighted overall score on a 1–5 scale, or null if nobody rated the dish. */
export function overallScore(dish: any, scoring: any[]): number | null {
  if (!dish?.ratingCount || !scoring?.length) return null;
  const weights = scoring.map((c: any) => Number(c.weight) || 0);
  const total = weights.reduce((a: number, b: number) => a + b, 0);
  // Fall back to equal weights if none were set.
  const w = total > 0 ? weights : scoring.map(() => 1);
  const wTotal = total > 0 ? total : scoring.length;
  return (
    scoring.reduce((s: number, c: any, i: number) => s + (categoryAverage(dish, c.id) ?? 0) * w[i], 0) /
    wTotal
  );
}

/** Dishes sorted best-first. Unrated dishes go last. Ties: more votes, then earlier submission. */
export function rankDishes(dishes: any[], scoring: any[]): any[] {
  return dishes
    .map((d: any) => ({ ...d, overall: overallScore(d, scoring) }))
    .sort((a: any, b: any) => {
      if (a.overall == null && b.overall == null) return 0;
      if (a.overall == null) return 1;
      if (b.overall == null) return -1;
      if (b.overall !== a.overall) return b.overall - a.overall;
      if ((b.ratingCount ?? 0) !== (a.ratingCount ?? 0)) return (b.ratingCount ?? 0) - (a.ratingCount ?? 0);
      return toMillis(a.createdAt) - toMillis(b.createdAt);
    });
}

/** Top-3 author ids for profile frames (gold/silver/bronze). */
export function podiumFrom(ranked: any[]): string[] {
  return ranked
    .filter((d: any) => d.overall != null)
    .slice(0, 3)
    .map((d: any) => d.authorId);
}

/** Best dish in every dish category ("bracket") that received votes. */
export function bracketWinners(ranked: any[], dishCategories: any[]): any[] {
  return (dishCategories ?? [])
    .map((cat: any) => ({
      category: cat,
      dish: ranked.find((d: any) => d.categoryId === cat.id && d.overall != null),
    }))
    .filter((x: any) => x.dish);
}

/** Best dish for each scoring category, e.g. "Top Healthiness". */
export function categoryAwards(dishes: any[], scoring: any[]): any[] {
  return (scoring ?? [])
    .map((cat: any) => {
      let best: any = null;
      for (const d of dishes) {
        const avg = categoryAverage(d, cat.id);
        if (avg != null && (!best || avg > best.avg)) best = { dish: d, avg };
      }
      return best && { category: cat, ...best };
    })
    .filter(Boolean);
}

export function resultsSummary(ranked: any[], guestCount?: number): any {
  const rated = ranked.filter((d: any) => d.overall != null);
  const totalVotes = ranked.reduce((s: number, d: any) => s + (d.ratingCount ?? 0), 0);
  const weightedSum = rated.reduce((s: number, d: any) => s + d.overall * (d.ratingCount || 0), 0);
  return {
    totalVotes,
    averageRating: totalVotes ? round1(weightedSum / totalVotes) : 0,
    winningRating: rated.length ? round1(rated[0].overall) : 0,
    dishCount: ranked.length,
    guestCount: guestCount ?? 0,
  };
}

export function weightsTotal(scoring: any[]): number {
  return scoring.reduce((s: number, c: any) => s + (Number(c.weight) || 0), 0);
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function toMillis(t: any): number {
  if (!t) return 0;
  if (typeof t === "number") return t;
  if (t instanceof Date) return t.getTime();
  if (typeof t.toMillis === "function") return t.toMillis();
  if (typeof t.seconds === "number") return t.seconds * 1000;
  return 0;
}
