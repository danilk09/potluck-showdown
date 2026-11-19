// Achievement frames: collectible profile frames earned from a user's stats,
// in tiers from Common to Legendary. Shared by the app (to show progress) and
// the server (to check a frame is earned before it can be worn).
import { FRAMES, FRAME_ORDER } from "./frames";

/** What the server counts for each user (convex/lib/stats.ts). */
export interface UserStats {
  /** Finished potlucks the user was part of (hosting included). */
  attended: number;
  /** 1st-place finishes. */
  wins: number;
  /** Top-3 finishes. */
  podiums: number;
  /** Finished potlucks the user hosted. */
  hosted: number;
  /** Dishes the user has rated. */
  votes: number;
  /** Dishes the user has brought. */
  dishes: number;
  /** Likes from other people on the user's dishes. */
  likes: number;
  /** People who joined a potluck through the user's invite link. */
  invited: number;
  /** People who first joined the app through the user's link and went on to host a finished potluck. */
  mentored: number;
  /** Classic frames (gold, silver, bronze, host) backed by a finished potluck. */
  classic: string[];
}

export const EMPTY_STATS: UserStats = {
  attended: 0, wins: 0, podiums: 0, hosted: 0, votes: 0, dishes: 0, likes: 0, invited: 0, mentored: 0, classic: [],
};

export const RARITIES = ["common", "rare", "epic", "legendary"] as const;
export type Rarity = (typeof RARITIES)[number];

export const RARITY_INFO: Record<Rarity, { label: string; color: string; soft: string }> = {
  common: { label: "Common", color: "#6f7d72", soft: "#eef2ee" },
  rare: { label: "Rare", color: "#2b7bb9", soft: "#e3f0fb" },
  epic: { label: "Epic", color: "#6b4fd3", soft: "#eee8fd" },
  legendary: { label: "Legendary", color: "#d98a00", soft: "#fff1cc" },
};

type StatKey = Exclude<keyof UserStats, "classic">;

export interface Family {
  key: string;
  /** The stat it counts, or "frames" for the collector family. */
  stat: StatKey | "frames";
  label: string;
  emoji: string;
  /** Ring colors: [light, deep]. */
  colors: [string, string];
  /** Numbers to reach. "all" means every other frame in the app. */
  levels: (number | "all")[];
  /** One name per level, easiest first. */
  names: string[];
  /** "Rate 50 dishes" etc. */
  goal: (n: number) => string;
  /** How the current count reads: "37 votes". */
  unit: (n: number) => string;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const FAMILIES: Family[] = [
  {
    key: "regular", stat: "attended", label: "Potlucks attended", emoji: "🍽️", colors: ["#9be3bb", "#2f8f5b"],
    levels: [1, 5, 15, 30], names: ["First Bite", "Regular", "Potluck Pro", "Legend of the Table"],
    goal: (n) => `Finish ${plural(n, "potluck")}`, unit: (n) => plural(n, "potluck"),
  },
  {
    key: "chef", stat: "dishes", label: "Dishes brought", emoji: "👩‍🍳", colors: ["#ffcf9e", "#e0702a"],
    levels: [1, 5, 15, 40], names: ["Home Cook", "Line Cook", "Sous Chef", "Executive Chef"],
    goal: (n) => `Bring ${plural(n, "dish", "dishes")}`, unit: (n) => plural(n, "dish", "dishes"),
  },
  {
    key: "critic", stat: "votes", label: "Votes cast", emoji: "⭐", colors: ["#c9bbff", "#6b4fd3"],
    levels: [10, 50, 100, 500], names: ["Taste Tester", "Food Critic", "Head Judge", "Grand Gourmand"],
    goal: (n) => `Rate ${plural(n, "dish", "dishes")}`, unit: (n) => plural(n, "vote"),
  },
  {
    key: "favorite", stat: "likes", label: "Likes received", emoji: "❤️", colors: ["#ffb0cf", "#c2417a"],
    levels: [10, 50, 150, 500], names: ["Crowd Pleaser", "Fan Favorite", "Viral Plate", "Icon"],
    goal: (n) => `Get ${plural(n, "like")} on your dishes`, unit: (n) => plural(n, "like"),
  },
  {
    key: "connector", stat: "invited", label: "People invited", emoji: "🤝", colors: ["#9fd2ff", "#2b7bb9"],
    levels: [1, 5, 20, 50], names: ["Plus One", "Connector", "Social Butterfly", "Life of the Party"],
    goal: (n) => `${plural(n, "person", "people")} join through your invite link`, unit: (n) => `${plural(n, "person", "people")} joined`,
  },
  {
    key: "champion", stat: "wins", label: "Showdown wins", emoji: "🏆", colors: ["#ffe08a", "#e8a10f"],
    levels: [2, 5, 10, 25], names: ["Back-to-Back", "Five-Time Champ", "Dynasty", "Hall of Flame"],
    goal: (n) => `Win 1st place ${plural(n, "time")}`, unit: (n) => plural(n, "win"),
  },
  {
    key: "podium", stat: "podiums", label: "Top-3 finishes", emoji: "🎖️", colors: ["#f3c49b", "#b5703b"],
    levels: [3, 10, 25], names: ["Podium Regular", "Medal Collector", "Trophy Cabinet"],
    goal: (n) => `Finish in the top 3 ${plural(n, "time")}`, unit: (n) => plural(n, "top-3 finish", "top-3 finishes"),
  },
  {
    key: "hosting", stat: "hosted", label: "Potlucks hosted", emoji: "🎉", colors: ["#ffab92", "#f2553a"],
    levels: [3, 10, 25], names: ["Party Starter", "Super Host", "Host with the Most"],
    goal: (n) => `Host ${plural(n, "finished potluck")}`, unit: (n) => plural(n, "potluck") + " hosted",
  },
  {
    key: "mentor", stat: "mentored", label: "New hosts you brought in", emoji: "🌱", colors: ["#9ee6d8", "#1f8a7a"],
    levels: [1, 3, 10], names: ["Spark", "Mentor", "Trailblazer"],
    goal: (n) => `${plural(n, "person", "people")} you brought to the app host their own potluck`,
    unit: (n) => `${plural(n, "new host")}`,
  },
  {
    key: "collector", stat: "frames", label: "Frames collected", emoji: "💎", colors: ["#d4c8ff", "#22b8d4"],
    levels: [10, 25, "all"], names: ["Collector", "Curator", "Completionist"],
    goal: (n) => `Unlock ${n} other frames`, unit: (n) => plural(n, "frame"),
  },
];

export interface AchievementTier {
  /** Stored on the profile as `frame.tier`, e.g. "critic:3". */
  id: string;
  family: Family;
  /** 1-based. */
  level: number;
  threshold: number;
  name: string;
  rarity: Rarity;
}

const tiersOf = (f: Family): AchievementTier[] =>
  f.levels.map((lvl, i) => ({
    id: `${f.key}:${i + 1}`,
    family: f,
    level: i + 1,
    threshold: lvl === "all" ? OTHER_FRAME_COUNT : lvl,
    name: f.names[i],
    // Families with fewer levels skip Common: their first level is already hard.
    rarity: RARITIES[RARITIES.length - f.levels.length + i],
  }));

// Every frame except the collector ones: the classic four plus each achievement level.
const OTHER_FRAME_COUNT =
  FRAME_ORDER.length + FAMILIES.filter((f) => f.stat !== "frames").reduce((n, f) => n + f.levels.length, 0);

export const ACHIEVEMENT_TIERS: AchievementTier[] = FAMILIES.flatMap(tiersOf);

/** All frames in the app: classic + achievements. */
export const TOTAL_FRAMES = FRAME_ORDER.length + ACHIEVEMENT_TIERS.length;

/** "Rate 50 dishes", or "Unlock every other frame" for the top collector level. */
export function tierGoal(t: AchievementTier): string {
  return t.family.levels[t.level - 1] === "all" ? "Unlock every other frame" : t.family.goal(t.threshold);
}

export function achievementById(id?: string | null): AchievementTier | undefined {
  return ACHIEVEMENT_TIERS.find((t) => t.id === id);
}

/** The current count for a family. */
export function familyCount(f: Family, stats: UserStats, otherFramesUnlocked = 0): number {
  return f.stat === "frames" ? otherFramesUnlocked : stats[f.stat];
}

/** Ids of every achievement frame the stats unlock (collector included). */
export function earnedAchievementIds(stats: UserStats): string[] {
  const out: string[] = [];
  for (const t of ACHIEVEMENT_TIERS) {
    if (t.family.stat !== "frames" && stats[t.family.stat] >= t.threshold) out.push(t.id);
  }
  const others = new Set(stats.classic.filter((c) => (FRAME_ORDER as readonly string[]).includes(c))).size + out.length;
  for (const t of ACHIEVEMENT_TIERS) {
    if (t.family.stat === "frames" && others >= t.threshold) out.push(t.id);
  }
  return out;
}

/** Number of non-collector frames unlocked (what the collector family counts). */
export function otherFramesUnlocked(stats: UserStats): number {
  const classic = new Set(stats.classic.filter((c) => (FRAME_ORDER as readonly string[]).includes(c))).size;
  return classic + earnedAchievementIds(stats).filter((id) => !id.startsWith("collector:")).length;
}

/** Every frame id the user can wear: classic tiers they hold plus earned achievements. */
export function unlockedFrames(stats: UserStats): string[] {
  const classic = FRAME_ORDER.filter((c) => stats.classic.includes(c));
  return [...classic, ...earnedAchievementIds(stats)];
}

/** The next level to reach in a family, or null when every level is done. */
export function nextTier(f: Family, stats: UserStats): { tier: AchievementTier; count: number } | null {
  const count = familyCount(f, stats, otherFramesUnlocked(stats));
  const tier = ACHIEVEMENT_TIERS.find((t) => t.family === f && count < t.threshold);
  return tier ? { tier, count } : null;
}

const CLASSIC_RARITY: Record<string, Rarity> = { gold: "epic", silver: "rare", bronze: "common", host: "common" };

/** Display details for any frame id (classic or achievement). */
export function frameInfo(tier?: string | null): { label: string; badge: string; desc: string; rarity: Rarity } | null {
  if (!tier) return null;
  const classic = FRAMES[tier];
  if (classic) return { label: classic.label, badge: classic.medal, desc: classic.desc, rarity: CLASSIC_RARITY[tier] ?? "common" };
  const a = achievementById(tier);
  if (!a) return null;
  return { label: a.name, badge: a.family.emoji, desc: tierGoal(a), rarity: a.rarity };
}
