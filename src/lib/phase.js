import { toMillis } from './scoring';

// Mirrors votingLive()/dishesEditable() in firestore.rules so the UI never
// offers an action the server would reject.
//   open     -> claiming dishes
//   voting   -> rating is live
//   tallying -> voting window ended, waiting on the host to publish
//   closed   -> results published (final)
export function phaseOf(p, now = Date.now()) {
  if (!p) return 'open';
  if (p.status === 'closed') return 'closed';
  const opens = toMillis(p.votingOpensAt);
  const closes = toMillis(p.votingClosesAt);
  const opened = p.status === 'voting' || (opens && now >= opens);
  if (!opened) return 'open';
  if (closes && now >= closes) return 'tallying';
  return 'voting';
}

export const PHASE_LABEL = {
  open: 'Open challenge',
  voting: 'Voting open',
  tallying: 'Tallying votes',
  closed: 'Results are in',
};

export const PHASE_CHIP = {
  open: 'chip-green',
  voting: 'chip-gold',
  tallying: 'chip-peach',
  closed: 'chip-purple',
};
