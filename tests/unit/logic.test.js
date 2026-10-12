import { describe, expect, it } from 'vitest';
import { bracketWinners, categoryAwards, overallScore, podiumFrom, rankDishes, resultsSummary } from '../../src/lib/scoring';
import { generateInviteCode, isValidInviteCode, normalizeInviteCode } from '../../src/lib/inviteCode';
import { phaseOf } from '../../src/lib/phase';
import { earnedFrames, winCount } from '../../src/lib/frames';
import { toList } from '../../src/data/builders';

const scoring = [
  { id: 'c0', name: 'Deliciousness', weight: 60 },
  { id: 'c1', name: 'Healthiness', weight: 40 },
];

const dish = (id, sums, count, extra = {}) => ({ id, authorId: id, scoreSums: sums, ratingCount: count, categoryId: 'mains', ...extra });

describe('scoring', () => {
  it('computes a weighted average on a 1-5 scale', () => {
    // avg deliciousness 5, healthiness 3 -> 0.6*5 + 0.4*3 = 4.2
    expect(overallScore(dish('a', { c0: 10, c1: 6 }, 2), scoring)).toBeCloseTo(4.2);
    expect(overallScore(dish('a', {}, 0), scoring)).toBeNull();
  });

  it('falls back to equal weights when none are set', () => {
    const unweighted = scoring.map((c) => ({ ...c, weight: 0 }));
    expect(overallScore(dish('a', { c0: 5, c1: 3 }, 1), unweighted)).toBeCloseTo(4);
  });

  it('ranks rated dishes first and builds a podium of authors', () => {
    const ranked = rankDishes([
      dish('none', {}, 0),
      dish('mid', { c0: 4, c1: 4 }, 1),
      dish('top', { c0: 5, c1: 5 }, 1),
      dish('low', { c0: 2, c1: 1 }, 1, { categoryId: 'desserts' }),
    ], scoring);
    expect(ranked.map((d) => d.id)).toEqual(['top', 'mid', 'low', 'none']);
    expect(podiumFrom(ranked)).toEqual(['top', 'mid', 'low']);
    const brackets = bracketWinners(ranked, [{ id: 'mains', name: 'Mains' }, { id: 'desserts', name: 'Desserts' }, { id: 'sides', name: 'Sides' }]);
    expect(brackets.map((b) => b.dish.id)).toEqual(['top', 'low']);
  });

  it('breaks ties by number of votes', () => {
    const ranked = rankDishes([dish('few', { c0: 5, c1: 5 }, 1), dish('many', { c0: 15, c1: 15 }, 3)], scoring);
    expect(ranked[0].id).toBe('many');
  });

  it('finds the best dish per scoring category', () => {
    const awards = categoryAwards([dish('tasty', { c0: 5, c1: 1 }, 1), dish('healthy', { c0: 2, c1: 5 }, 1)], scoring);
    expect(awards.map((a) => a.dish.id)).toEqual(['tasty', 'healthy']);
  });

  it('summarizes the results', () => {
    const ranked = rankDishes([dish('a', { c0: 10, c1: 10 }, 2), dish('b', { c0: 3, c1: 3 }, 1)], scoring);
    expect(resultsSummary(ranked, 5)).toEqual({ totalVotes: 3, averageRating: 4.3, winningRating: 5, dishCount: 2, guestCount: 5 });
  });
});

describe('invite codes', () => {
  it('generates readable, valid codes', () => {
    const code = generateInviteCode('The Healthy Harvest Cook-Off', () => 0);
    expect(code).toBe('HEALTHY-AAAA');
    expect(isValidInviteCode(code)).toBe(true);
    expect(generateInviteCode('')).toMatch(/^POTLUCK-[A-Z2-9]{4}$/);
  });

  it('normalizes what people type', () => {
    expect(normalizeInviteCode('  harvest 7k2q ')).toBe('HARVEST-7K2Q');
    expect(normalizeInviteCode('pot!luck')).toBe('POTLUCK');
  });
});

describe('phases', () => {
  const now = Date.parse('2026-10-18T19:00:00');
  it('follows the host status and scheduled times', () => {
    expect(phaseOf({ status: 'open' }, now)).toBe('open');
    expect(phaseOf({ status: 'voting' }, now)).toBe('voting');
    expect(phaseOf({ status: 'open', votingOpensAt: now - 1 }, now)).toBe('voting');
    expect(phaseOf({ status: 'open', votingOpensAt: now + 1 }, now)).toBe('open');
    expect(phaseOf({ status: 'voting', votingClosesAt: now - 1 }, now)).toBe('tallying');
    expect(phaseOf({ status: 'closed' }, now)).toBe('closed');
  });
});

describe('frames', () => {
  const potlucks = [
    { id: 'p1', status: 'closed', podium: ['me', 'x'], hostId: 'x' },
    { id: 'p2', status: 'closed', podium: ['x', 'y', 'me'], hostId: 'me' },
    { id: 'p3', status: 'voting', podium: [], hostId: 'me' },
  ];
  it('lists frames backed by closed potlucks', () => {
    expect(earnedFrames('me', potlucks).map((f) => `${f.tier}:${f.potluckId}`)).toEqual(['gold:p1', 'bronze:p2', 'host:p2']);
    expect(winCount('me', potlucks)).toBe(1);
  });
});

describe('toList', () => {
  it('splits by line, or by comma on a single line, keeping quantities', () => {
    expect(toList('2 cups flour\n- 1 egg\n\n• salt')).toEqual(['2 cups flour', '1 egg', 'salt']);
    expect(toList('noodles, sesame,  soy')).toEqual(['noodles', 'sesame', 'soy']);
  });
});
