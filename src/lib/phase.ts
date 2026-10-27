import { toMillis } from "./scoring";

//   open     -> claiming dishes
//   voting   -> rating is live
//   tallying -> voting window ended, waiting on the host to publish
//   closed   -> results published (final)
export type Phase = "open" | "voting" | "tallying" | "closed";

export function phaseOf(p: any, now: number = Date.now()): Phase {
  if (!p) return "open";
  if (p.status === "closed") return "closed";
  const opens = toMillis(p.votingOpensAt);
  const closes = toMillis(p.votingClosesAt);
  const opened = p.status === "voting" || (opens && now >= opens);
  if (!opened) return "open";
  if (closes && now >= closes) return "tallying";
  return "voting";
}

export const PHASE_LABEL: Record<Phase, string> = {
  open: "Open challenge",
  voting: "Voting open",
  tallying: "Tallying votes",
  closed: "Results are in",
};

export const PHASE_CHIP: Record<Phase, string> = {
  open: "green",
  voting: "gold",
  tallying: "peach",
  closed: "purple",
};
