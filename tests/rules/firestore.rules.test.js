// Runs against the Firestore emulator: `npm run test:rules`
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
  Timestamp, arrayRemove, arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, increment,
  query, setDoc, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { newDishDoc, newPotluckDoc, voteWrites } from '../../src/data/builders';
import { DEFAULT_SCORING } from '../../src/lib/formats';

let env;
const PID = 'potluck1';
const CODE = 'HARVEST-7K2Q';

const form = (overrides = {}) => ({
  title: 'Healthy Harvest Cook-Off',
  theme: 'Plant-based comfort food',
  format: 'classic',
  description: 'Bring a dish',
  location: 'Hawthorne Hall rooftop',
  date: '2026-10-18',
  time: '18:30',
  maxGuests: 0,
  inviteCode: CODE,
  scoring: DEFAULT_SCORING,
  dishCategories: [{ id: 'k1', name: 'Mains', needed: 3 }, { id: 'k2', name: 'Sides', needed: 2 }],
  ...overrides,
});

const dishForm = { name: 'Spicy sesame noodles', categoryId: 'k1', ingredients: 'noodles, sesame, soy', steps: 'Boil. Toss.' };

const user = (uid) => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'password' } }).firestore();
const guest = (uid) => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } }).firestore();

async function createPotluck(db, uid, overrides) {
  const b = writeBatch(db);
  b.set(doc(db, 'potlucks', PID), newPotluckDoc(form(overrides), uid));
  b.set(doc(db, 'inviteCodes', overrides?.inviteCode ?? CODE), { potluckId: PID, hostId: uid, createdAt: Timestamp.now() });
  return b.commit();
}

/** Seeds: alice hosts, bob + carol joined, bob and carol each submitted a dish. */
async function seed({ status = 'open', ...extra } = {}) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const p = newPotluckDoc(form(), 'alice');
    await setDoc(doc(db, 'potlucks', PID), { ...p, memberIds: ['alice', 'bob', 'carol'], status, ...extra });
    await setDoc(doc(db, 'potlucks', PID, 'dishes', 'bob'), newDishDoc(dishForm, { uid: 'bob', potluckId: PID }));
    await setDoc(doc(db, 'potlucks', PID, 'dishes', 'carol'), newDishDoc({ ...dishForm, name: 'Brownies' }, { uid: 'carol', potluckId: PID }));
  });
}

function vote(db, voter, dishId, scores, mutate) {
  const w = voteWrites({ uid: voter, dishId, scores });
  const b = writeBatch(db);
  b.set(doc(db, 'potlucks', PID, 'ratings', w.ratingId), w.rating);
  b.update(doc(db, 'potlucks', PID, 'dishes', dishId), mutate ? mutate(w.dishPatch) : w.dishPatch);
  return b.commit();
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-potluck',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
afterAll(() => env?.cleanup());
beforeEach(() => env.clearFirestore());

describe('creating potlucks + invite codes', () => {
  it('lets a signed-in member host a potluck with a unique code', async () => {
    await assertSucceeds(createPotluck(user('alice'), 'alice'));
  });

  it('requires a full account to host (guests can only join)', async () => {
    await assertFails(createPotluck(guest('g1'), 'g1'));
  });

  it('rejects an invite code that is already taken', async () => {
    await createPotluck(user('alice'), 'alice');
    const db = user('dan');
    const b = writeBatch(db);
    b.set(doc(db, 'potlucks', 'other'), newPotluckDoc(form(), 'dan'));
    b.set(doc(db, 'inviteCodes', CODE), { potluckId: 'other', hostId: 'dan', createdAt: Timestamp.now() });
    await assertFails(b.commit());
  });

  it('rejects potlucks created with extra members or a pre-filled podium', async () => {
    const db = user('alice');
    const b = writeBatch(db);
    b.set(doc(db, 'potlucks', PID), { ...newPotluckDoc(form(), 'alice'), memberIds: ['alice', 'bob'] });
    b.set(doc(db, 'inviteCodes', CODE), { potluckId: PID, hostId: 'alice', createdAt: Timestamp.now() });
    await assertFails(b.commit());
  });
});

describe('membership', () => {
  beforeEach(() => seed());

  it('lets invitees preview by id, but only members can list potlucks', async () => {
    await assertSucceeds(getDoc(doc(user('dan'), 'potlucks', PID)));
    await assertFails(getDocs(collection(user('dan'), 'potlucks')));
    await assertSucceeds(getDocs(query(collection(user('bob'), 'potlucks'), where('memberIds', 'array-contains', 'bob'))));
  });

  it('lets people add only themselves', async () => {
    await assertSucceeds(updateDoc(doc(user('dan'), 'potlucks', PID), { memberIds: arrayUnion('dan') }));
    await assertFails(updateDoc(doc(user('erin'), 'potlucks', PID), { memberIds: arrayUnion('frank') }));
  });

  it('enforces max guests', async () => {
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'potlucks', PID), { maxGuests: 3 }));
    await assertFails(updateDoc(doc(user('dan'), 'potlucks', PID), { memberIds: arrayUnion('dan') }));
  });

  it('lets guests leave but not remove others', async () => {
    await assertFails(updateDoc(doc(user('bob'), 'potlucks', PID), { memberIds: arrayRemove('carol') }));
    await assertSucceeds(updateDoc(doc(user('bob'), 'potlucks', PID), { memberIds: arrayRemove('bob') }));
  });

  it('does not let non-hosts edit potluck details', async () => {
    await assertFails(updateDoc(doc(user('bob'), 'potlucks', PID), { title: 'Mine now' }));
    await assertSucceeds(updateDoc(doc(user('alice'), 'potlucks', PID), { title: 'Renamed' }));
  });
});

describe('recipe privacy', () => {
  beforeEach(() => seed());

  it('only attendees can read dishes and recipes', async () => {
    await assertSucceeds(getDoc(doc(user('carol'), 'potlucks', PID, 'dishes', 'bob')));
    await assertSucceeds(getDocs(collection(user('alice'), 'potlucks', PID, 'dishes')));
    await assertFails(getDoc(doc(user('dan'), 'potlucks', PID, 'dishes', 'bob')));
    await assertFails(getDocs(collection(user('dan'), 'potlucks', PID, 'dishes')));
  });

  it('allows one dish per member, keyed by their uid', async () => {
    const db = user('alice');
    await assertFails(setDoc(doc(db, 'potlucks', PID, 'dishes', 'someone-else'), newDishDoc(dishForm, { uid: 'alice', potluckId: PID })));
    await assertSucceeds(setDoc(doc(db, 'potlucks', PID, 'dishes', 'alice'), newDishDoc(dishForm, { uid: 'alice', potluckId: PID })));
    await assertFails(setDoc(doc(user('dan'), 'potlucks', PID, 'dishes', 'dan'), newDishDoc(dishForm, { uid: 'dan', potluckId: PID })));
  });

  it('stops authors from faking scores', async () => {
    await assertFails(updateDoc(doc(user('bob'), 'potlucks', PID, 'dishes', 'bob'), { ratingCount: 99 }));
    await assertSucceeds(updateDoc(doc(user('bob'), 'potlucks', PID, 'dishes', 'bob'), { name: 'Even spicier noodles' }));
  });
});

describe('anonymous voting', () => {
  it('is closed until voting opens', async () => {
    await seed();
    await assertFails(vote(user('carol'), 'carol', 'bob', { c0: 5, c1: 4 }));
  });

  it('opens automatically at the scheduled time', async () => {
    await seed({ votingOpensAt: Timestamp.fromMillis(Date.now() - 60_000) });
    await assertSucceeds(vote(user('carol'), 'carol', 'bob', { c0: 5, c1: 4 }));
  });

  describe('while voting is live', () => {
    beforeEach(() => seed({ status: 'voting' }));

    it('accepts a valid vote and updates the aggregate', async () => {
      await assertSucceeds(vote(user('carol'), 'carol', 'bob', { c0: 5, c1: 4 }));
      const snap = await getDoc(doc(user('alice'), 'potlucks', PID, 'dishes', 'bob'));
      expect(snap.data().ratingCount).toBe(1);
      expect(snap.data().scoreSums).toEqual({ c0: 5, c1: 4 });
    });

    it('rejects voting for your own dish', async () => {
      await assertFails(vote(user('bob'), 'bob', 'bob', { c0: 5, c1: 5 }));
    });

    it('rejects voting twice', async () => {
      await vote(user('carol'), 'carol', 'bob', { c0: 5, c1: 4 });
      await assertFails(vote(user('carol'), 'carol', 'bob', { c0: 5, c1: 4 }));
    });

    it('rejects aggregates that do not match the ballot', async () => {
      await assertFails(vote(user('carol'), 'carol', 'bob', { c0: 1, c1: 1 }, (patch) => ({ ...patch, 'scoreSums.c0': increment(50) })));
    });

    it('rejects out-of-range or missing scores', async () => {
      await assertFails(vote(user('carol'), 'carol', 'bob', { c0: 9, c1: 4 }));
      await assertFails(vote(user('carol'), 'carol', 'bob', { c0: 5 }));
    });

    it('rejects votes from non-attendees', async () => {
      await assertFails(vote(user('dan'), 'dan', 'bob', { c0: 5, c1: 4 }));
    });

    it('keeps ballots private, even from the host', async () => {
      await vote(user('carol'), 'carol', 'bob', { c0: 5, c1: 4 });
      await assertSucceeds(getDoc(doc(user('carol'), 'potlucks', PID, 'ratings', 'bob_carol')));
      await assertFails(getDoc(doc(user('alice'), 'potlucks', PID, 'ratings', 'bob_carol')));
      await assertFails(getDocs(collection(user('alice'), 'potlucks', PID, 'ratings')));
      await assertSucceeds(getDocs(query(collection(user('carol'), 'potlucks', PID, 'ratings'), where('uid', '==', 'carol'))));
    });

    it('locks dish edits once voting starts', async () => {
      await assertFails(updateDoc(doc(user('bob'), 'potlucks', PID, 'dishes', 'bob'), { name: 'Switcheroo' }));
    });

    it('lets members like and unlike, but only as themselves', async () => {
      const ref = doc(user('carol'), 'potlucks', PID, 'dishes', 'bob');
      await assertSucceeds(updateDoc(ref, { likedBy: arrayUnion('carol') }));
      await assertSucceeds(updateDoc(ref, { likedBy: arrayRemove('carol') }));
      await assertFails(updateDoc(ref, { likedBy: arrayUnion('alice') }));
    });
  });
});

describe('results + profile frames', () => {
  beforeEach(() => seed({ status: 'voting' }));

  const close = (db, podium) => updateDoc(doc(db, 'potlucks', PID), { status: 'closed', podium, results: { totalVotes: 2 } });

  it('only the host can publish results', async () => {
    await assertFails(close(user('bob'), ['bob']));
    await assertSucceeds(close(user('alice'), ['bob', 'carol']));
  });

  it('cannot set a podium without closing', async () => {
    await assertFails(updateDoc(doc(user('alice'), 'potlucks', PID), { podium: ['bob'] }));
  });

  it('treats published results as final', async () => {
    await close(user('alice'), ['bob', 'carol']);
    await assertFails(updateDoc(doc(user('alice'), 'potlucks', PID), { podium: ['alice'] }));
    await assertFails(deleteDoc(doc(user('alice'), 'potlucks', PID)));
  });

  it('only lets winners wear the frame they earned', async () => {
    await close(user('alice'), ['bob', 'carol']);
    const profile = (frame) => ({ displayName: 'Someone', photoURL: null, frame, isGuest: false });
    await assertSucceeds(setDoc(doc(user('bob'), 'publicProfiles', 'bob'), profile({ tier: 'gold', potluckId: PID })));
    await assertFails(setDoc(doc(user('carol'), 'publicProfiles', 'carol'), profile({ tier: 'gold', potluckId: PID })));
    await assertSucceeds(setDoc(doc(user('carol'), 'publicProfiles', 'carol'), profile({ tier: 'silver', potluckId: PID })));
    await assertSucceeds(setDoc(doc(user('alice'), 'publicProfiles', 'alice'), profile({ tier: 'host', potluckId: PID })));
    await assertFails(setDoc(doc(user('dan'), 'publicProfiles', 'dan'), profile({ tier: 'bronze', potluckId: PID })));
  });
});

describe('profiles are not browsable', () => {
  it('allows fetching a profile by id but never listing them', async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'publicProfiles', 'bob'), { displayName: 'Bob' }));
    await assertSucceeds(getDoc(doc(user('alice'), 'publicProfiles', 'bob')));
    await assertFails(getDocs(collection(user('alice'), 'publicProfiles')));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'publicProfiles', 'bob')));
  });

  it('keeps private user data private', async () => {
    await assertSucceeds(setDoc(doc(user('bob'), 'users', 'bob'), { email: 'bob@example.com' }));
    await assertFails(getDoc(doc(user('alice'), 'users', 'bob')));
  });
});
