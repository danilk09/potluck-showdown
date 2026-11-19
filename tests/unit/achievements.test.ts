import { describe, expect, it } from "vitest";
import {
  ACHIEVEMENT_TIERS, EMPTY_STATS, FAMILIES, TOTAL_FRAMES, achievementById, earnedAchievementIds, frameInfo, nextTier,
  otherFramesUnlocked, unlockedFrames,
} from "../../src/lib/achievements";

const stats = (patch: Partial<typeof EMPTY_STATS>) => ({ ...EMPTY_STATS, ...patch });

describe("achievement frames", () => {
  it("unlocks each level once the count reaches it", () => {
    expect(earnedAchievementIds(stats({ votes: 9 }))).not.toContain("critic:1");
    expect(earnedAchievementIds(stats({ votes: 10 }))).toContain("critic:1");
    const many = earnedAchievementIds(stats({ votes: 120 }));
    expect(many).toEqual(expect.arrayContaining(["critic:1", "critic:2", "critic:3"]));
    expect(many).not.toContain("critic:4");
  });

  it("gets rarer as the levels get harder, and short families skip Common", () => {
    expect(achievementById("critic:1")!.rarity).toBe("common");
    expect(achievementById("critic:4")!.rarity).toBe("legendary");
    expect(achievementById("mentor:1")!.rarity).toBe("rare");
    expect(achievementById("mentor:3")!.rarity).toBe("legendary");
  });

  it("counts every frame once and gives each a unique id", () => {
    const ids = ACHIEVEMENT_TIERS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(TOTAL_FRAMES).toBe(4 + ids.length);
  });

  it("the collector frames count the other frames, and the last one needs all of them", () => {
    expect(otherFramesUnlocked(stats({ classic: ["gold", "host"], dishes: 5 }))).toBe(4); // 2 classic + chef 1 & 2
    const maxed = stats({
      attended: 30, dishes: 40, votes: 500, likes: 500, invited: 50, wins: 25, podiums: 25, hosted: 25, mentored: 10,
      classic: ["gold", "silver", "bronze", "host"],
    });
    const earned = earnedAchievementIds(maxed);
    expect(earned).toEqual(expect.arrayContaining(["collector:1", "collector:2", "collector:3"]));
    expect(unlockedFrames(maxed)).toHaveLength(TOTAL_FRAMES);
    // Missing one frame keeps the Completionist locked.
    expect(earnedAchievementIds({ ...maxed, mentored: 9 })).not.toContain("collector:3");
  });

  it("shows what's next in a family", () => {
    const critic = FAMILIES.find((f) => f.key === "critic")!;
    expect(nextTier(critic, stats({ votes: 37 }))).toMatchObject({ count: 37, tier: { id: "critic:2", threshold: 50 } });
    expect(nextTier(critic, stats({ votes: 999 }))).toBeNull();
  });

  it("describes classic and achievement frames alike", () => {
    expect(frameInfo("gold")).toMatchObject({ label: "Champion", rarity: "epic" });
    expect(frameInfo("critic:2")).toMatchObject({ label: "Food Critic", desc: "Rate 50 dishes" });
    expect(frameInfo("collector:3")?.desc).toBe("Unlock every other frame");
    expect(frameInfo("nope")).toBeNull();
  });
});
