// Invite codes look like HARVEST-7K2Q: a readable word from the title plus a
// random suffix, so they're easy to say out loud but hard to guess.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

export function randomSuffix(len = 4, rand = Math.random) {
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[Math.floor(rand() * ALPHABET.length)];
  return out;
}

export function generateInviteCode(title = '', rand = Math.random) {
  const word = (title.toUpperCase().match(/[A-Z]{3,}/g) ?? [])
    .find((w) => !['THE', 'AND', 'FOR'].includes(w));
  const prefix = (word ?? 'POTLUCK').slice(0, 8);
  return `${prefix}-${randomSuffix(4, rand)}`;
}

/** Normalizes what people type ("harvest 7k2q ") into the stored form ("HARVEST-7K2Q"). */
export function normalizeInviteCode(input = '') {
  return input
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '-')
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 20);
}

export function isValidInviteCode(code) {
  return /^[A-Z0-9-]{4,20}$/.test(code);
}
