// Fills the local Firebase emulators with demo data so a single tester on one
// Android emulator can try every part of the app (claiming, voting, results).
//
//   npm run emulators   (terminal 1, leave running)
//   npm run seed        (terminal 2)
//
// Every write goes through the real security rules, signed in as each demo user.
// Re-running the seed wipes the emulators first.
import sharp from 'sharp';
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, updateProfile } from 'firebase/auth';
import {
  addDoc, arrayUnion, collection, connectFirestoreEmulator, doc, getDocs, getFirestore, serverTimestamp,
  setDoc, updateDoc, writeBatch,
} from 'firebase/firestore';
import { newDishDoc, newPotluckDoc, voteWrites } from '../src/data/builders.js';
import { DEFAULT_SCORING } from '../src/lib/formats.js';
import { podiumFrom, rankDishes, resultsSummary } from '../src/lib/scoring.js';

const PROJECT = 'demo-potluck';
const HOST = '127.0.0.1';
const PASSWORD = 'password123';

const PEOPLE = {
  you: { name: 'Alex Rivera', email: 'you@example.com' },
  maya: { name: 'Maya Chen', email: 'maya@example.com' },
  leo: { name: 'Leo Martinez', email: 'leo@example.com' },
  priya: { name: 'Priya Shah', email: 'priya@example.com' },
};

async function wipe() {
  const ok = await fetch(`http://${HOST}:9099/`).then(() => true, () => false);
  if (!ok) {
    console.error('\n✖ The Firebase emulators are not running. Start them first with:  npm run emulators\n');
    process.exit(1);
  }
  await fetch(`http://${HOST}:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  await fetch(`http://${HOST}:9099/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
}

/** One Firebase app per person, so each acts with their own login. */
async function signUp(key) {
  const app = initializeApp({ apiKey: 'demo-key', projectId: PROJECT, authDomain: `${PROJECT}.firebaseapp.com` }, key);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${HOST}:9099`, { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, HOST, 8080);
  const { user } = await createUserWithEmailAndPassword(auth, PEOPLE[key].email, PASSWORD);
  await updateProfile(user, { displayName: PEOPLE[key].name });
  await setDoc(doc(db, 'publicProfiles', user.uid), {
    displayName: PEOPLE[key].name, photoURL: null, frame: null, isGuest: false, updatedAt: serverTimestamp(),
  });
  await setDoc(doc(db, 'users', user.uid), { email: PEOPLE[key].email, createdAt: serverTimestamp() });
  return { key, uid: user.uid, db };
}

/** A simple plated-food photo, so the feed doesn't look empty. */
async function photo(rim, food, garnish) {
  const dots = Array.from({ length: 14 }, (_, i) => {
    const a = (i / 14) * Math.PI * 2;
    const r = 70 + (i % 3) * 35;
    return `<circle cx="${400 + Math.cos(a) * r}" cy="${260 + Math.sin(a) * r * 0.8}" r="${14 + (i % 4) * 4}" fill="${garnish}"/>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="520">
    <rect width="800" height="520" fill="#5b3a29"/>
    <ellipse cx="400" cy="260" rx="290" ry="230" fill="${rim}"/>
    <ellipse cx="400" cy="260" rx="215" ry="170" fill="${food}"/>${dots}</svg>`;
  const jpg = await sharp(Buffer.from(svg)).jpeg({ quality: 78 }).toBuffer();
  return `data:image/jpeg;base64,${jpg.toString('base64')}`;
}

function day(offsetDays, hour = 18) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const pad = (n) => String(n).padStart(2, '0');
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(hour)}:30` };
}

async function createPotluck(host, form) {
  const ref = doc(collection(host.db, 'potlucks'));
  const batch = writeBatch(host.db);
  batch.set(ref, newPotluckDoc(form, host.uid));
  batch.set(doc(host.db, 'inviteCodes', form.inviteCode), { potluckId: ref.id, hostId: host.uid, createdAt: serverTimestamp() });
  await batch.commit();
  return ref.id;
}

const join = (person, pid) => updateDoc(doc(person.db, 'potlucks', pid), { memberIds: arrayUnion(person.uid) });

async function addDish(person, pid, dish, img) {
  let photoRef = null;
  if (img) {
    const ref = await addDoc(collection(person.db, 'potlucks', pid, 'images'), { ownerId: person.uid, data: img, createdAt: serverTimestamp() });
    photoRef = `img:${pid}/${ref.id}`;
  }
  await setDoc(doc(person.db, 'potlucks', pid, 'dishes', person.uid), newDishDoc({ ...dish, photo: photoRef }, { uid: person.uid, potluckId: pid }));
}

async function vote(person, pid, dishOwner, scores) {
  const w = voteWrites({ uid: person.uid, dishId: dishOwner.uid, scores });
  const batch = writeBatch(person.db);
  batch.set(doc(person.db, 'potlucks', pid, 'ratings', w.ratingId), w.rating);
  batch.update(doc(person.db, 'potlucks', pid, 'dishes', dishOwner.uid), w.dishPatch);
  await batch.commit();
}

const DISHES = {
  noodles: { name: 'Spicy Sesame Noodles', ingredients: '8 oz wheat noodles\n2 tbsp sesame paste\n1 tbsp soy sauce\n2 scallions\n1 tsp chili crisp', steps: '1. Boil the noodles and rinse with cold water.\n2. Whisk sesame paste, soy sauce, and chili crisp.\n3. Toss everything and top with scallions.', dietary: ['Vegan'], allergens: ['Sesame', 'Soy', 'Wheat'], prepMinutes: 15, calories: 320, serves: '6 people' },
  salad: { name: 'Rainbow Crunch Salad', ingredients: 'kale, red cabbage, carrots, edamame, peanut dressing', steps: 'Chop everything finely, toss with the dressing, and let it sit 10 minutes.', dietary: ['Vegan', 'Gluten-free'], allergens: ['Peanuts', 'Soy'], prepMinutes: 20, calories: 210, serves: '8 people' },
  brownies: { name: 'Brown Butter Brownies', ingredients: '1 cup butter\n3/4 cup cocoa\n1 cup sugar\n2 eggs\n1/2 cup flour', steps: 'Brown the butter, whisk in cocoa and sugar, add eggs, fold in flour. Bake 25 minutes at 350°F.', dietary: ['Vegetarian'], allergens: ['Milk', 'Eggs', 'Wheat'], prepMinutes: 40, calories: 420, serves: '12 squares' },
  shakshuka: { name: 'Green Shakshuka', ingredients: 'spinach, leeks, 6 eggs, feta, cumin, olive oil', steps: 'Sauté leeks, wilt the spinach, make wells, crack in eggs, cover until set. Finish with feta.', dietary: ['Vegetarian', 'Gluten-free'], allergens: ['Eggs', 'Milk'], prepMinutes: 30, calories: 280, serves: '6 people' },
  waffles: { name: 'Berry Oat Waffles', ingredients: 'oat flour, oat milk, banana, baking powder, mixed berries', steps: 'Blend the batter, rest 5 minutes, cook in a hot waffle iron, top with berries.', dietary: ['Vegan', 'Dairy-free'], allergens: [], prepMinutes: 25, calories: 300, serves: '8 waffles' },
  hummus: { name: 'Roasted Beet Hummus', ingredients: 'chickpeas, roasted beets, tahini, lemon, garlic', steps: 'Blend everything until silky. Drizzle with olive oil.', dietary: ['Vegan', 'Gluten-free'], allergens: ['Sesame'], prepMinutes: 15, calories: 180, serves: '10 people' },
  tacos: { name: 'Crispy Chickpea Tacos', ingredients: 'chickpeas, corn tortillas, avocado, lime, slaw', steps: 'Roast spiced chickpeas until crisp, pile into warm tortillas with slaw and avocado.', dietary: ['Vegan'], allergens: [], prepMinutes: 35, calories: 350, serves: '8 tacos' },
};

const categories = (names) => names.map((name, i) => ({ id: `k${i}`, name, needed: 2 }));

async function main() {
  console.log('Resetting the emulators…');
  await wipe();

  console.log('Creating demo accounts…');
  const you = await signUp('you');
  const maya = await signUp('maya');
  const leo = await signUp('leo');
  const priya = await signUp('priya');
  const everyone = [you, maya, leo, priya];

  const img = {
    noodles: await photo('#f3efe9', '#d98b3a', '#4f8a3a'),
    salad: await photo('#f3efe9', '#7cc25b', '#c2417a'),
    brownies: await photo('#f3efe9', '#4a2c1d', '#e8d3b8'),
    shakshuka: await photo('#2b2b2b', '#5d8f3a', '#fff7d6'),
    waffles: await photo('#f3efe9', '#e2b36a', '#6b4fd3'),
    hummus: await photo('#f3efe9', '#b3335a', '#f2d16b'),
    tacos: await photo('#f3efe9', '#e9c46a', '#2a9d8f'),
  };

  // 1) Finished showdown you hosted and won: unlocks your Champion + Host frames.
  console.log('Potluck 1/3: finished showdown (results published)…');
  const p1 = await createPotluck(you, {
    title: 'Healthy Harvest Cook-Off', theme: 'Plant-based comfort food', format: 'classic', location: 'Hawthorne Hall rooftop',
    description: 'Bring a shareable, healthy dish and compete for the tastiest, most nutritious plate.',
    ...day(-7), inviteCode: 'HARVEST-7K2Q', maxGuests: 0, scoring: DEFAULT_SCORING,
    dishCategories: categories(['Main dishes', 'Salads', 'Desserts']),
  });
  for (const p of [maya, leo, priya]) await join(p, p1);
  await addDish(you, p1, { ...DISHES.shakshuka, categoryId: 'k0' }, img.shakshuka);
  await addDish(maya, p1, { ...DISHES.noodles, categoryId: 'k0' }, img.noodles);
  await addDish(priya, p1, { ...DISHES.salad, categoryId: 'k1' }, img.salad);
  await addDish(leo, p1, { ...DISHES.brownies, categoryId: 'k2' }, img.brownies);
  await updateDoc(doc(you.db, 'potlucks', p1), { status: 'voting' });
  const scoresFor = { [you.uid]: { c0: 5, c1: 5 }, [maya.uid]: { c0: 5, c1: 4 }, [priya.uid]: { c0: 4, c1: 5 }, [leo.uid]: { c0: 4, c1: 2 } };
  for (const voter of everyone) {
    for (const owner of everyone) if (owner !== voter) await vote(voter, p1, owner, scoresFor[owner.uid]);
  }
  const dishes = (await getDocs(collection(you.db, 'potlucks', p1, 'dishes'))).docs.map((d) => ({ id: d.id, ...d.data() }));
  const ranked = rankDishes(dishes, DEFAULT_SCORING);
  await updateDoc(doc(you.db, 'potlucks', p1), {
    status: 'closed', podium: podiumFrom(ranked), results: { ...resultsSummary(ranked, everyone.length), publishedAt: serverTimestamp() },
  });
  // Maya shows off her runner-up frame so you can see frames on other people.
  await setDoc(doc(maya.db, 'publicProfiles', maya.uid), { frame: { tier: 'silver', potluckId: p1 } }, { merge: true });

  // 2) Voting is open right now: you can rate three dishes.
  console.log('Potluck 2/3: voting open…');
  const p2 = await createPotluck(priya, {
    title: 'Sunset Rooftop Supper', theme: 'Mediterranean Challenge', format: 'regional', formatDetail: 'Mediterranean',
    location: 'Kuykendall Hall roof', description: 'Mezze, mains, and sweets from around the Mediterranean.',
    ...day(0, 18), inviteCode: 'SUNSET-4MXR', maxGuests: 12, scoring: [
      { id: 'c0', name: 'Deliciousness', description: 'Flavor, taste, and how much you’d want another bite.', weight: 50 },
      { id: 'c1', name: 'Healthiness', description: 'Whole ingredients, balance, and nutrition.', weight: 30 },
      { id: 'c2', name: 'Creativity', description: 'Originality and how unique the dish feels.', weight: 20 },
    ],
    dishCategories: categories(['Mezze', 'Mains', 'Sweets']),
  });
  for (const p of [you, maya, leo]) await join(p, p2);
  await addDish(maya, p2, { ...DISHES.hummus, categoryId: 'k0' }, img.hummus);
  await addDish(leo, p2, { ...DISHES.tacos, categoryId: 'k1' }, img.tacos);
  await addDish(priya, p2, { ...DISHES.salad, name: 'Fattoush Crunch Salad', categoryId: 'k0' }, img.salad);
  await addDish(you, p2, { ...DISHES.shakshuka, name: 'Classic Shakshuka', categoryId: 'k1' }, img.shakshuka);
  await updateDoc(doc(priya.db, 'potlucks', p2), { status: 'voting' });
  await vote(maya, p2, leo, { c0: 4, c1: 4, c2: 5 });
  await vote(leo, p2, maya, { c0: 5, c1: 5, c2: 4 });

  // 3) Upcoming: claim a dish slot and submit your own recipe.
  console.log('Potluck 3/3: upcoming, open for dishes…');
  const p3 = await createPotluck(maya, {
    title: 'Study Break Brunch', theme: 'Plant-Based Challenge', format: 'courses', location: 'Hale Aloha lounge',
    description: 'Finals fuel! Each course is its own bracket.', ...day(4, 11), inviteCode: 'BRUNCH-9PLT', maxGuests: 10,
    scoring: DEFAULT_SCORING, dishCategories: categories(['Sweet', 'Savory', 'Drinks']),
  });
  for (const p of [you, leo, priya]) await join(p, p3);
  await addDish(maya, p3, { ...DISHES.waffles, categoryId: 'k0' }, img.waffles);
  await addDish(leo, p3, { ...DISHES.tacos, name: 'Breakfast Tacos', categoryId: 'k1' }, img.tacos);

  // 4) A potluck you're NOT in, so you can test joining with an invite code.
  await createPotluck(leo, {
    title: 'Dorm Dumpling Night', theme: 'Mystery Basket', format: 'mystery', formatDetail: 'cabbage, ginger, mushrooms',
    location: 'Frear Hall kitchen', description: 'Every dish must use all three basket ingredients.', ...day(9, 19),
    inviteCode: 'DUMPLING-3QZ', maxGuests: 0, scoring: DEFAULT_SCORING, dishCategories: categories(['Dumplings', 'Sides']),
  });

  console.log(`
✔ Demo data ready.

  Sign in on the emulator as:   you@example.com   /  ${PASSWORD}
  (Other accounts: maya@, leo@, priya@example.com, same password.)

  What to try:
   • Feed → "Sunset Rooftop Supper" is in voting: rate Maya's, Leo's, and Priya's dishes.
   • Events → "Study Break Brunch" is open: submit your own dish.
   • Events → Past → "Healthy Harvest Cook-Off": you won. Equip your Champion frame in Profile.
   • Join Potluck with code DUMPLING-3QZ to test joining.
   • Recipes: search "kale" or filter Vegan.
`);
  process.exit(0);
}

main().catch((err) => {
  console.error('\n✖ Seeding failed:', err.message);
  process.exit(1);
});
