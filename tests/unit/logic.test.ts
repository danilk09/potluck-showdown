import { describe, expect, it } from "vitest";
import { bracketWinners, categoryAwards, overallScore, podiumFrom, rankDishes, resultsSummary } from "../../src/lib/scoring";
import { generateInviteCode, isValidInviteCode, normalizeInviteCode } from "../../src/lib/inviteCode";
import { phaseOf } from "../../src/lib/phase";
import { earnedFrames, winCount } from "../../src/lib/frames";
import { dishFields, potluckFields, toList } from "../../src/data/builders";
import { aiScoreOnFive, healthPoints, supportsAiScoring } from "../../src/lib/healthScore";
import { inviteMessage } from "../../src/lib/inviteMessage";
import { formatServes } from "../../src/lib/formats";

const scoring = [
  { id: "c0", name: "Deliciousness", weight: 60 },
  { id: "c1", name: "Healthiness", weight: 40 },
];

const dish = (id: string, sums: Record<string, number>, count: number, extra: any = {}) => ({
  id,
  authorId: id,
  scoreSums: sums,
  ratingCount: count,
  categoryId: "mains",
  ...extra,
});

describe("scoring", () => {
  it("computes a weighted average on a 1-5 scale", () => {
    expect(overallScore(dish("a", { c0: 10, c1: 6 }, 2), scoring)).toBeCloseTo(4.2);
    expect(overallScore(dish("a", {}, 0), scoring)).toBeNull();
  });

  it("falls back to equal weights when none are set", () => {
    const unweighted = scoring.map((c) => ({ ...c, weight: 0 }));
    expect(overallScore(dish("a", { c0: 5, c1: 3 }, 1), unweighted)).toBeCloseTo(4);
  });

  it("ranks rated dishes first and builds a podium of authors", () => {
    const ranked = rankDishes(
      [
        dish("none", {}, 0),
        dish("mid", { c0: 4, c1: 4 }, 1),
        dish("top", { c0: 5, c1: 5 }, 1),
        dish("low", { c0: 2, c1: 1 }, 1, { categoryId: "desserts" }),
      ],
      scoring
    );
    expect(ranked.map((d) => d.id)).toEqual(["top", "mid", "low", "none"]);
    expect(podiumFrom(ranked)).toEqual(["top", "mid", "low"]);
    const brackets = bracketWinners(ranked, [
      { id: "mains", name: "Mains" },
      { id: "desserts", name: "Desserts" },
      { id: "sides", name: "Sides" },
    ]);
    expect(brackets.map((b) => b.dish.id)).toEqual(["top", "low"]);
  });

  it("breaks ties by number of votes", () => {
    const ranked = rankDishes([dish("few", { c0: 5, c1: 5 }, 1), dish("many", { c0: 15, c1: 15 }, 3)], scoring);
    expect(ranked[0].id).toBe("many");
  });

  it("finds the best dish per scoring category", () => {
    const awards = categoryAwards([dish("tasty", { c0: 5, c1: 1 }, 1), dish("healthy", { c0: 2, c1: 5 }, 1)], scoring);
    expect(awards.map((a) => a.dish.id)).toEqual(["tasty", "healthy"]);
  });

  it("uses a stored AI health score instead of votes for that category", () => {
    const mixed = [
      { id: "c0", name: "Deliciousness", weight: 60, mode: "manual" },
      { id: "c1", name: "Healthiness", weight: 40, mode: "ai" },
    ];
    const scored = dish("a", { c0: 5 }, 1, { aiScores: { c1: 80 } });
    expect(overallScore(scored, mixed)).toBeCloseTo(4.6);
    expect(overallScore(dish("a", { c0: 5 }, 1), mixed)).toBeNull();
    const awards = categoryAwards(
      [scored, dish("b", { c0: 3 }, 1, { aiScores: { c1: 95 } })],
      mixed
    );
    expect(awards.map((a) => a.dish.id)).toEqual(["a", "b"]);
  });

  it("ranks dishes on AI scores alone when every category is calculated", () => {
    const only = [{ id: "c1", name: "Healthiness", weight: 100, mode: "ai" }];
    const ranked = rankDishes(
      [
        dish("low", {}, 0, { aiScores: { c1: 40 } }),
        dish("high", {}, 0, { aiScores: { c1: 90 } }),
        dish("none", {}, 0),
      ],
      only
    );
    expect(ranked.map((d) => d.id)).toEqual(["high", "low", "none"]);
    expect(ranked[0].overall).toBeCloseTo(4.5);
    expect(ranked[2].overall).toBeNull();
  });

  it("summarizes the results", () => {
    const ranked = rankDishes([dish("a", { c0: 10, c1: 10 }, 2), dish("b", { c0: 3, c1: 3 }, 1)], scoring);
    expect(resultsSummary(ranked, 5)).toEqual({
      totalVotes: 3,
      averageRating: 4.3,
      winningRating: 5,
      dishCount: 2,
      guestCount: 5,
    });
  });
});

describe("invite codes", () => {
  it("generates readable, valid codes", () => {
    const code = generateInviteCode("The Healthy Harvest Cook-Off", () => 0);
    expect(code).toBe("HEALTHY-AAAA");
    expect(isValidInviteCode(code)).toBe(true);
    expect(generateInviteCode("")).toMatch(/^POTLUCK-[A-Z2-9]{4}$/);
  });

  it("normalizes what people type", () => {
    expect(normalizeInviteCode("  harvest 7k2q ")).toBe("HARVEST-7K2Q");
    expect(normalizeInviteCode("pot!luck")).toBe("POTLUCK");
  });
});

describe("phases", () => {
  const now = Date.parse("2026-10-18T19:00:00");
  it("follows the host status and scheduled times", () => {
    expect(phaseOf({ status: "open" }, now)).toBe("open");
    expect(phaseOf({ status: "voting" }, now)).toBe("voting");
    expect(phaseOf({ status: "open", votingOpensAt: now - 1 }, now)).toBe("voting");
    expect(phaseOf({ status: "open", votingOpensAt: now + 1 }, now)).toBe("open");
    expect(phaseOf({ status: "voting", votingClosesAt: now - 1 }, now)).toBe("tallying");
    expect(phaseOf({ status: "closed" }, now)).toBe("closed");
  });
});

describe("frames", () => {
  const potlucks = [
    { id: "p1", status: "closed", podium: ["me", "x"], hostId: "x" },
    { id: "p2", status: "closed", podium: ["x", "y", "me"], hostId: "me" },
    { id: "p3", status: "voting", podium: [], hostId: "me" },
  ];
  it("lists frames backed by closed potlucks", () => {
    expect(earnedFrames("me", potlucks).map((f) => `${f.tier}:${f.potluckId}`)).toEqual([
      "gold:p1",
      "bronze:p2",
      "host:p2",
    ]);
    expect(winCount("me", potlucks)).toBe(1);
  });
});

describe("health scores", () => {
  it("converts stored health points to the five-star scale", () => {
    expect(aiScoreOnFive(80)).toBe(4);
    expect(healthPoints({ aiScores: { c1: 82.4 } }, "c1")).toBe(82);
    expect(healthPoints({ aiScores: {} }, "c1")).toBeNull();
  });

  it("offers AI scoring for health categories", () => {
    expect(supportsAiScoring("Healthiness")).toBe(true);
    expect(supportsAiScoring("healthy swaps")).toBe(true);
    expect(supportsAiScoring("Deliciousness")).toBe(false);
  });

  it("stores the scoring mode and leaves scores out of client dish fields", () => {
    const fields = potluckFields({
      title: "Harvest",
      date: "2026-10-29",
      time: "18:30",
      format: "classic",
      scoring: [
        { name: "Deliciousness", weight: 60 },
        { name: "Healthiness", weight: 40, mode: "ai" },
      ],
      dishCategories: [],
    });
    expect(fields.scoring.map((c: any) => c.mode ?? "manual")).toEqual(["manual", "ai"]);
    expect(dishFields({ name: "Soup", categoryId: "k", aiScores: { c1: 80 } })).not.toHaveProperty("aiScores");
  });
});

describe("toList", () => {
  it("splits by line, or by comma on a single line, keeping quantities", () => {
    expect(toList("2 cups flour\n- 1 egg\n\n• salt")).toEqual(["2 cups flour", "1 egg", "salt"]);
    expect(toList("noodles, sesame,  soy")).toEqual(["noodles", "sesame", "soy"]);
  });
});

describe("invite message", () => {
  it("reads like an invitation and includes the details guests need", () => {
    const text = inviteMessage({ title: "Taco Night", startsAt: new Date(2026, 10, 20, 18, 30).getTime(), location: "Maya’s place", theme: "Street food", inviteCode: "TACO-7K2Q" });
    expect(text).toContain("Come join my potluck, “Taco Night”!");
    expect(text).toContain("📍 Maya’s place");
    expect(text).toContain("Theme: Street food");
    expect(text).toContain("Invite code: TACO-7K2Q");
  });

  it("leaves out details the host didn't fill in", () => {
    const text = inviteMessage({ title: "Brunch", inviteCode: "BRUNCH-1234" });
    expect(text).not.toContain("📍");
    expect(text).not.toContain("📅");
    expect(text).not.toContain("Theme");
  });
});

describe("serves", () => {
  it("shows a number of people, keeping older free-text values", () => {
    expect(formatServes("8")).toBe("8 people");
    expect(formatServes("1")).toBe("1 person");
    expect(formatServes("12 squares")).toBe("12 squares");
    expect(formatServes("")).toBe("—");
  });
});
