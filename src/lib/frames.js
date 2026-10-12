// Profile frames are the "flex" system: profiles aren't browsable, but every
// avatar in the app shows the frame its owner chose from the ones they earned.
export const FRAMES = {
  gold: { label: 'Champion', medal: '🥇', desc: 'Won 1st place at a showdown' },
  silver: { label: 'Runner-up', medal: '🥈', desc: 'Finished 2nd at a showdown' },
  bronze: { label: 'Podium', medal: '🥉', desc: 'Finished 3rd at a showdown' },
  host: { label: 'Host', medal: '🎉', desc: 'Hosted a completed showdown' },
};

export const FRAME_ORDER = ['gold', 'silver', 'bronze', 'host'];

/** Every frame a user has earned, with the potluck that backs it (rules verify this). */
export function earnedFrames(uid, potlucks) {
  const out = [];
  for (const p of potlucks) {
    if (p.status !== 'closed') continue;
    (p.podium ?? []).forEach((winner, i) => {
      if (winner === uid) out.push({ tier: FRAME_ORDER[i], potluckId: p.id, potluck: p });
    });
    if (p.hostId === uid) out.push({ tier: 'host', potluckId: p.id, potluck: p });
  }
  return out;
}

export function winCount(uid, potlucks) {
  return potlucks.filter((p) => p.status === 'closed' && p.podium?.[0] === uid).length;
}
