// Profile frames are the "flex" system: profiles aren't browsable, but every
// avatar in the app shows the frame its owner chose from the ones they earned.
export const FRAMES: Record<string, { label: string; medal: string; desc: string }> = {
  gold: { label: "Champion", medal: "🥇", desc: "Won 1st place at a showdown" },
  silver: { label: "Runner-up", medal: "🥈", desc: "Finished 2nd at a showdown" },
  bronze: { label: "Podium", medal: "🥉", desc: "Finished 3rd at a showdown" },
  host: { label: "Host", medal: "🎉", desc: "Hosted a completed showdown" },
};

export const FRAME_ORDER = ["gold", "silver", "bronze", "host"] as const;

export interface EarnedFrame {
  tier: string;
  potluckId: string;
  potluck: any;
}

/** Every frame a user has earned, with the potluck that backs it. */
export function earnedFrames(uid?: string | null, potlucks: any[] = []): EarnedFrame[] {
  if (!uid) return [];
  const out: EarnedFrame[] = [];
  for (const p of potlucks) {
    if (p.status !== "closed") continue;
    (p.podium ?? []).forEach((winner: string, i: number) => {
      if (winner === uid && FRAME_ORDER[i]) {
        out.push({ tier: FRAME_ORDER[i], potluckId: p.id, potluck: p });
      }
    });
    if (p.hostId === uid) out.push({ tier: "host", potluckId: p.id, potluck: p });
  }
  return out;
}

export function winCount(uid?: string | null, potlucks: any[] = []): number {
  if (!uid) return 0;
  return potlucks.filter((p) => p.status === "closed" && p.podium?.[0] === uid).length;
}
