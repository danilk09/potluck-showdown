// Data for the think-aloud evaluation, built from ONE spec so the full seed and
// the per-phone reset always agree.
//
//   npm run eval:seed        wipe the local database and load everything
//   npm run eval:reset-a     put phone A's three test accounts back to their starting state
//   npm run eval:reset-b     same for phone B (phone A is untouched)
//
// Everything is internal: only someone with deploy access can run it.
import { v } from "convex/values";
import { internalAction, internalMutation, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { hashPassword } from "./auth";
import { foodPicture, type Art } from "./lib/foodArt";
import { syncMemberships, setMembers } from "./lib/members";
import { deleteDishCascade, deletePotluckCascade } from "./lib/cascade";
import { imageIdFromRef } from "./lib/access";
import { podiumFrom, rankDishes, resultsSummary } from "../src/lib/scoring";

export const EVAL_PASSWORD = "potluck123";

// ---------- people ----------

/** Everyone else at the potlucks (UH Mānoa students). */
const PEOPLE: Record<string, string> = {
  keoni: "Keoni Kahale",
  malia: "Malia Fernandez",
  jason: "Jason Tanaka",
  leilani: "Leilani Akana",
  noa: "Noa Kealoha",
  ashley: "Ashley Domingo",
  tyler: "Tyler Nakamura",
  hana: "Hana Kobayashi",
  marcus: "Marcus Reyes",
  kiana: "Kiana Pua",
  ethan: "Ethan Park",
  sofia: "Sofia Villanueva",
};

/** The accounts participants sign in with: one set per phone, one account per task. */
export const TESTERS = {
  A: { task2: "jordan", task3: "sam", task4: "morgan" },
  B: { task2: "riley", task3: "casey", task4: "taylor" },
} as const;

const TESTER_NAMES: Record<string, string> = {
  jordan: "Jordan Lee",
  riley: "Riley Kim",
  sam: "Sam Ito",
  casey: "Casey Wong",
  morgan: "Morgan Chang",
  taylor: "Taylor Ha",
};

const ALL_NAMES = { ...PEOPLE, ...TESTER_NAMES };
const TESTER_KEYS = new Set(Object.keys(TESTER_NAMES));
export const emailFor = (key: string) => `${key}@example.com`;

// ---------- potlucks ----------

interface DishSpec {
  name: string;
  by: string;
  cat: string;
  serves: string;
  ingredients: string[];
  steps: string;
  allergens?: string[];
  dietary?: string[];
  prep: number;
  cal: number;
  /** AI health score, 0–100. */
  health: number;
  /** Target average guest score per manual category (1–5). */
  q?: Record<string, number>;
  /** How many guests have rated it. */
  votes?: number;
  likes: number;
  art: Art;
}

interface PotluckSpec {
  key: string;
  code: string;
  host: string;
  title: string;
  theme: string;
  format: string;
  formatDetail: string;
  description: string;
  location: string;
  startsAt: number;
  createdAt: number;
  status: "open" | "voting" | "closed";
  publishedAt?: number;
  maxGuests: number;
  scoring: { id: string; name: string; description: string; weight: number; mode?: "ai" | "manual" }[];
  categories: { id: string; name: string; needed: number }[];
  prizes: string[];
  members: string[];
  usedRequired?: boolean;
  cover: string[];
  dishes: DishSpec[];
  /** Ballots the task-3 testers have already cast (dish name → scores). */
  testerBallots?: { voter: string; dish: string; scores: Record<string, number> }[];
  /** Dishes the task-3 testers have already liked. */
  testerLikes?: { voter: string; dish: string }[];
}

const DAY = 86_400_000;

/** A Hawaiʻi (HST, UTC−10) wall-clock time, `dayOffset` days from today. Convex runs in UTC. */
function hst(now: number, dayOffset: number, hour: number, minute = 0) {
  const local = new Date(now - 10 * 3_600_000);
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + dayOffset, hour + 10, minute);
}

const S = {
  delicious: { name: "Deliciousness", description: "Flavor, taste, and how much you’d want another bite." },
  health: { name: "Healthiness", description: "Calculated for each dish from its ingredients.", mode: "ai" as const },
  creativity: { name: "Creativity", description: "Originality and how unique the dish feels." },
  presentation: { name: "Presentation", description: "Plating, color, and first impressions." },
  theme: { name: "Theme fit", description: "How well the dish fits the Pacific Rim theme." },
};

export function buildSpec(now: number): PotluckSpec[] {
  const liveStart = Math.floor((now - 90 * 60_000) / (15 * 60_000)) * 15 * 60_000;
  return [
    // ---- Task 2: upcoming, still claiming dishes ----
    {
      key: "p1",
      code: "OHANA-4KP2",
      host: "keoni",
      title: "Hale Aloha Ohana Potluck",
      theme: "Local comfort food, made a little healthier",
      format: "classic",
      formatDetail: "",
      description:
        "Floor potluck before finals! Bring a local favorite or a family recipe, lightened up if you can. We eat first, then I'll open voting. Rice cooker and serving spoons provided.",
      location: "Hale Aloha Lehua, 2nd-floor lounge",
      startsAt: hst(now, 6, 18, 0),
      createdAt: now - 5 * DAY,
      status: "open",
      maxGuests: 20,
      scoring: [
        { id: "c0", ...S.delicious, weight: 50 },
        { id: "c1", ...S.health, weight: 30 },
        { id: "c2", ...S.creativity, weight: 20 },
      ],
      categories: [
        { id: "k0", name: "Mains", needed: 4 },
        { id: "k1", name: "Sides", needed: 3 },
        { id: "k2", name: "Salads", needed: 2 },
        { id: "k3", name: "Desserts", needed: 3 },
        { id: "k4", name: "Drinks", needed: 1 },
      ],
      prizes: ["$25 Rainbow Drive-In gift card", "Box of Leonard's malasadas", "First pick of the floor snack stash"],
      members: ["keoni", "jason", "tyler", "ashley", "hana", "malia", "noa", "kiana", "ethan"],
      cover: ["#9a6a4f", "#d9776f", "#f2e3b3", "#6fae5b", "#fbf8f0"],
      dishes: [
        {
          name: "Kalua Pig & Cabbage", by: "keoni", cat: "k0", serves: "12",
          ingredients: ["4 lb pork shoulder", "1 tbsp Hawaiian sea salt", "2 tbsp liquid smoke", "1 head green cabbage", "1 cup water"],
          steps: "Rub the pork with sea salt and liquid smoke. Slow-cook on low with the water for 10 hours, then shred. Stir in chopped cabbage for the last 30 minutes.",
          dietary: ["Gluten-free", "Dairy-free", "High-protein"], prep: 30, cal: 380, health: 46, likes: 4,
          art: { kind: "plate", colors: ["#9a6a4f", "#9ccf7a"], garnish: "#4f9a3a" },
        },
        {
          name: "Baked Shoyu Chicken", by: "jason", cat: "k0", serves: "10",
          ingredients: ["3 lb chicken thighs", "1/2 cup low-sodium shoyu", "1/4 cup brown sugar", "4 cloves garlic", "1 thumb ginger", "Green onion"],
          steps: "Simmer shoyu, sugar, garlic and ginger. Pour over the chicken and bake at 375°F for 45 minutes, basting twice. Top with green onion.",
          allergens: ["Soy", "Wheat"], dietary: ["Dairy-free", "High-protein"], prep: 60, cal: 410, health: 52, likes: 3,
          art: { kind: "plate", colors: ["#7a3f1d", "#9ccf7a"], garnish: "#5aa845" },
        },
        {
          name: "Spam Musubi", by: "tyler", cat: "k1", serves: "10",
          ingredients: ["1 can Spam (25% less sodium)", "4 cups cooked white rice", "5 sheets nori", "2 tbsp shoyu", "2 tbsp sugar", "Furikake"],
          steps: "Slice and pan-fry the Spam, then glaze with shoyu and sugar. Press rice in a musubi mold, sprinkle furikake, add Spam and wrap with half a sheet of nori.",
          allergens: ["Soy", "Wheat", "Sesame"], dietary: ["Dairy-free"], prep: 40, cal: 290, health: 24, likes: 6,
          art: { kind: "musubi", colors: ["#d9776f"] },
        },
        {
          name: "Lighter Mac Salad", by: "ashley", cat: "k1", serves: "12",
          ingredients: ["1 lb macaroni", "3/4 cup light mayo", "1/2 cup Greek yogurt", "2 carrots, grated", "1/4 cup milk", "Salt and pepper"],
          steps: "Overcook the macaroni slightly, drain and toss with milk while warm. Fold in mayo, yogurt and carrot. Chill at least 4 hours.",
          allergens: ["Wheat", "Eggs", "Milk"], dietary: ["Vegetarian"], prep: 25, cal: 260, health: 38, likes: 2,
          art: { kind: "bowl", colors: ["#f2e3b3", "#f08a3c", "#f7f1dc"], garnish: "#5aa845" },
        },
        {
          name: "Ogo & Cucumber Namasu", by: "hana", cat: "k2", serves: "8",
          ingredients: ["2 Japanese cucumbers", "1 cup ogo (seaweed)", "1/3 cup rice vinegar", "1 tbsp sugar", "1 tsp toasted sesame seeds"],
          steps: "Thinly slice the cucumbers and salt them for 10 minutes, then squeeze dry. Toss with chopped ogo, vinegar and sugar. Top with sesame seeds.",
          allergens: ["Sesame"], dietary: ["Vegan", "Gluten-free", "Low-sugar"], prep: 20, cal: 45, health: 93, likes: 3,
          art: { kind: "bowl", colors: ["#6fae5b", "#3f7a3a", "#d8eccb"], garnish: "#f1eadb" },
        },
        {
          name: "Haupia Squares", by: "malia", cat: "k3", serves: "16",
          ingredients: ["2 cans coconut milk", "1/2 cup sugar", "1/2 cup cornstarch", "1 cup water"],
          steps: "Whisk cornstarch into the water. Heat coconut milk and sugar, then whisk in the slurry until thick. Pour into a pan, chill 3 hours and cut into squares.",
          dietary: ["Vegan", "Gluten-free", "Dairy-free"], prep: 20, cal: 150, health: 34, likes: 5,
          art: { kind: "bars", colors: ["#fbf8f0", "#e9dcc0"], garnish: "#c9a87a" },
        },
      ],
    },

    // ---- Task 3: voting is live ----
    {
      key: "p2",
      code: "NIGHTMKT-7RW",
      host: "leilani",
      title: "Mānoa Night Market Potluck",
      theme: "Flavors of the Pacific Rim",
      format: "regional",
      formatDetail: "Pacific Rim: Hawaiʻi, Asia & the Pacific Islands",
      description:
        "Our club's end-of-semester potluck. Cook something from your family or culture around the Pacific. Voting is open while we eat, so try everything!",
      location: "Campus Center courtyard",
      startsAt: liveStart,
      createdAt: now - 9 * DAY,
      status: "voting",
      maxGuests: 0,
      scoring: [
        { id: "c0", ...S.delicious, weight: 40 },
        { id: "c1", ...S.health, weight: 30 },
        { id: "c2", ...S.presentation, weight: 15 },
        { id: "c3", ...S.theme, weight: 15 },
      ],
      categories: [
        { id: "k0", name: "Mains", needed: 4 },
        { id: "k1", name: "Sides", needed: 3 },
        { id: "k2", name: "Desserts", needed: 3 },
      ],
      prizes: ["$30 Foodland gift card", "Club t-shirt and a fresh lei", "Box of Hawaiian Host chocolates"],
      members: ["leilani", "noa", "marcus", "hana", "ethan", "jason", "sofia", "kiana", "malia", "tyler", "sam", "casey"],
      cover: ["#2f5a2e", "#d9a14a", "#8a5cc2", "#f2805a", "#f2d58a"],
      testerBallots: [
        { voter: "sam", dish: "Pork & Butterfish Lau Lau", scores: { c0: 5, c2: 4, c3: 5 } },
        { voter: "sam", dish: "Butter Mochi", scores: { c0: 4, c2: 3, c3: 4 } },
        { voter: "casey", dish: "Chicken Adobo", scores: { c0: 5, c2: 3, c3: 4 } },
        { voter: "casey", dish: "Vegetable Gyoza", scores: { c0: 4, c2: 4, c3: 3 } },
      ],
      testerLikes: [
        { voter: "sam", dish: "Butter Mochi" },
        { voter: "casey", dish: "Pork & Butterfish Lau Lau" },
      ],
      dishes: [
        {
          name: "Pork & Butterfish Lau Lau", by: "leilani", cat: "k0", serves: "8",
          ingredients: ["2 lb pork butt", "1/2 lb salted butterfish", "24 luau (taro) leaves", "8 ti leaves", "Hawaiian sea salt"],
          steps: "Wrap cubes of pork and butterfish in luau leaves, then tie in ti leaves. Steam for 4 hours until the leaves are soft and the pork falls apart.",
          allergens: ["Fish"], dietary: ["Gluten-free", "Dairy-free", "High-protein"], prep: 270, cal: 420, health: 61,
          q: { c0: 4.7, c2: 4.0, c3: 4.9 }, votes: 6, likes: 5,
          art: { kind: "plate", colors: ["#2f5a2e", "#7c5bb0"], garnish: "#5aa845" },
        },
        {
          name: "Chicken Adobo", by: "marcus", cat: "k0", serves: "10",
          ingredients: ["3 lb chicken thighs", "1/2 cup vinegar", "1/3 cup shoyu", "1 head garlic", "3 bay leaves", "1 tsp peppercorns"],
          steps: "Marinate the chicken in vinegar, shoyu and garlic for an hour. Simmer with bay leaves and peppercorns for 40 minutes, then reduce the sauce until glossy.",
          allergens: ["Soy", "Wheat"], dietary: ["Dairy-free", "High-protein"], prep: 75, cal: 390, health: 55,
          q: { c0: 4.6, c2: 3.6, c3: 4.5 }, votes: 5, likes: 4,
          art: { kind: "plate", colors: ["#5a3220", "#e9d38a"], garnish: "#e9e2c4" },
        },
        {
          name: "Kalbi & Veggie Rice Bowls", by: "ethan", cat: "k0", serves: "8",
          ingredients: ["2 lb flanken short ribs", "1/2 cup shoyu", "1 Asian pear, grated", "Garlic and sesame oil", "Brown rice", "Spinach, carrots and bean sprouts"],
          steps: "Marinate the ribs overnight in shoyu, pear, garlic and sesame oil. Grill 3 minutes a side. Serve over brown rice with blanched vegetables.",
          allergens: ["Soy", "Wheat", "Sesame"], dietary: ["Dairy-free", "High-protein"], prep: 50, cal: 520, health: 68,
          q: { c0: 4.5, c2: 4.4, c3: 4.2 }, votes: 4, likes: 3,
          art: { kind: "bowl", colors: ["#6b3a26", "#f08a3c", "#f1ece0"], garnish: "#5aa845" },
        },
        {
          name: "North Shore Garlic Shrimp", by: "jason", cat: "k0", serves: "6",
          ingredients: ["2 lb shell-on shrimp", "1 head garlic, minced", "1/2 cup butter", "1 tbsp paprika", "Lemon wedges"],
          steps: "Toss the shrimp in flour and paprika. Cook the garlic gently in butter, add the shrimp and fry until pink. Serve with lemon and two scoops rice.",
          allergens: ["Shellfish", "Milk", "Wheat"], dietary: ["High-protein"], prep: 35, cal: 460, health: 41,
          q: { c0: 4.8, c2: 3.9, c3: 4.4 }, votes: 7, likes: 6,
          art: { kind: "plate", colors: ["#f08060", "#e9d38a"], garnish: "#f3e7b8" },
        },
        {
          name: "Chicken Long Rice", by: "noa", cat: "k1", serves: "10",
          ingredients: ["2 lb chicken thighs", "8 oz bean thread noodles", "6 cups chicken broth", "2-inch piece ginger", "Green onion"],
          steps: "Simmer the chicken with ginger in the broth, then shred. Soak the noodles, cut them short and cook in the broth until clear. Return the chicken and top with green onion.",
          dietary: ["Gluten-free", "Dairy-free"], prep: 60, cal: 280, health: 72,
          q: { c0: 4.2, c2: 3.5, c3: 4.6 }, votes: 5, likes: 2,
          art: { kind: "bowl", colors: ["#f1e6c8", "#e8d9a8", "#efe6cf"], garnish: "#5aa845" },
        },
        {
          name: "Vegetable Gyoza", by: "hana", cat: "k1", serves: "40 pieces",
          ingredients: ["40 gyoza wrappers", "2 cups napa cabbage", "1 cup shiitake", "1 carrot", "1 block firm tofu", "Shoyu-vinegar dipping sauce"],
          steps: "Mix finely chopped cabbage, mushrooms, carrot and crumbled tofu. Fill and pleat the wrappers. Pan-fry until browned, then steam with a splash of water.",
          allergens: ["Wheat", "Soy"], dietary: ["Vegan"], prep: 70, cal: 210, health: 76,
          q: { c0: 4.3, c2: 4.5, c3: 4.1 }, votes: 6, likes: 4,
          art: { kind: "rolls", colors: ["#f0dcb0", "#c98a4a"], garnish: "#5aa845" },
        },
        {
          name: "Lomi Lomi Salmon", by: "sam", cat: "k1", serves: "8",
          ingredients: ["1 lb salted salmon", "4 Roma tomatoes", "1 sweet onion", "4 green onions", "Ice cubes to serve"],
          steps: "Soak the salted salmon for an hour, then dice. Dice tomatoes and onion and massage (lomi) everything together by hand. Chill and serve over ice.",
          allergens: ["Fish"], dietary: ["Gluten-free", "Dairy-free", "Low-sugar"], prep: 80, cal: 140, health: 88,
          q: { c0: 4.1, c2: 4.2, c3: 4.8 }, votes: 5, likes: 3,
          art: { kind: "bowl", colors: ["#f2805a", "#d9344a", "#f3efe6"], garnish: "#5aa845" },
        },
        {
          name: "Butter Mochi", by: "kiana", cat: "k2", serves: "24 squares",
          ingredients: ["1 lb mochiko (sweet rice flour)", "2 cups sugar", "1 can coconut milk", "1/2 cup butter", "4 eggs", "1 tbsp baking powder"],
          steps: "Whisk the wet ingredients, then fold in mochiko, sugar and baking powder. Bake at 350°F for an hour until golden. Cool completely before cutting.",
          allergens: ["Milk", "Eggs"], dietary: ["Vegetarian", "Gluten-free"], prep: 75, cal: 230, health: 18,
          q: { c0: 4.7, c2: 3.8, c3: 4.3 }, votes: 7, likes: 7,
          art: { kind: "bars", colors: ["#f2d58a", "#d9a94e"] },
        },
        {
          name: "Ube Crinkle Cookies", by: "casey", cat: "k2", serves: "24 cookies",
          ingredients: ["2 cups flour", "1/2 cup ube halaya", "1 tsp ube extract", "1/2 cup butter", "1 egg", "Powdered sugar"],
          steps: "Cream butter with ube halaya and extract, then mix in the egg and flour. Chill 1 hour, roll balls in powdered sugar and bake at 350°F for 11 minutes.",
          allergens: ["Wheat", "Milk", "Eggs"], dietary: ["Vegetarian"], prep: 90, cal: 160, health: 22,
          q: { c0: 4.4, c2: 4.7, c3: 4.2 }, votes: 6, likes: 5,
          art: { kind: "cookies", colors: ["#8a5cc2", "#f5f0fa"] },
        },
        {
          name: "Turon (Banana Lumpia)", by: "sofia", cat: "k2", serves: "16",
          ingredients: ["8 saba bananas", "16 lumpia wrappers", "1 cup jackfruit strips", "1 cup brown sugar", "Oil for frying"],
          steps: "Halve the bananas, roll each with jackfruit and brown sugar in a wrapper. Fry until golden, adding a little sugar to the oil so it caramelizes on the outside.",
          allergens: ["Wheat"], dietary: ["Vegan"], prep: 40, cal: 210, health: 26,
          q: { c0: 4.5, c2: 4.1, c3: 4.6 }, votes: 4, likes: 3,
          art: { kind: "rolls", colors: ["#d9a14a", "#f2d16b"], garnish: "#7a4a1f" },
        },
      ],
    },

    // ---- Task 4: finished, results published ----
    {
      key: "p3",
      code: "KICKOFF-9LMQ",
      host: "keoni",
      title: "Fall Kickoff Showdown",
      theme: "Three courses, three brackets",
      format: "courses",
      formatDetail: "",
      description:
        "Welcome-back potluck for the floor. Every course has its own bracket winner, plus an overall champion. Healthiness is scored for each dish automatically.",
      location: "Hale Aloha courtyard",
      startsAt: hst(now, -19, 18, 0),
      createdAt: now - 30 * DAY,
      publishedAt: hst(now, -19, 21, 30),
      status: "closed",
      maxGuests: 16,
      scoring: [
        { id: "c0", ...S.delicious, weight: 50 },
        { id: "c1", ...S.health, weight: 30 },
        { id: "c2", ...S.presentation, weight: 20 },
      ],
      categories: [
        { id: "k0", name: "Appetizers", needed: 3 },
        { id: "k1", name: "Entrées", needed: 5 },
        { id: "k2", name: "Desserts", needed: 3 },
      ],
      prizes: ["$25 Rainbow Drive-In gift card", "Half-dozen Leonard's malasadas", "Hale Aloha mug"],
      members: ["keoni", "malia", "jason", "ashley", "tyler", "hana", "noa", "marcus", "kiana", "morgan", "taylor"],
      cover: ["#d9a14a", "#d9344a", "#eef0e2", "#4a2a1a", "#7fbf5e"],
      dishes: [
        {
          name: "Lemongrass Chicken & Green Papaya Bowls", by: "malia", cat: "k1", serves: "10",
          ingredients: ["3 lb chicken thighs", "3 stalks lemongrass", "1 green papaya, shredded", "Fish sauce and lime", "Fresh mint and basil", "Jasmine rice"],
          steps: "Marinate the chicken in blitzed lemongrass, garlic, fish sauce and a little honey, then grill. Toss shredded papaya with lime and herbs. Serve over rice.",
          allergens: ["Fish"], dietary: ["Gluten-free", "Dairy-free", "High-protein"], prep: 60, cal: 450, health: 82,
          q: { c0: 4.8, c2: 4.6 }, votes: 10, likes: 8,
          art: { kind: "bowl", colors: ["#d9a14a", "#7fbf5e", "#f3efe6"], garnish: "#5aa845" },
        },
        {
          name: "Shoyu Ahi Poke Bowl", by: "morgan", cat: "k1", serves: "8",
          ingredients: ["2 lb sashimi-grade ahi", "1/4 cup shoyu", "1 tbsp sesame oil", "1/2 sweet onion", "Ogo", "Brown rice and edamame"],
          steps: "Cube the ahi and toss with shoyu, sesame oil, onion and ogo. Chill 30 minutes. Serve over brown rice with edamame.",
          allergens: ["Fish", "Soy", "Sesame"], dietary: ["Dairy-free", "High-protein"], prep: 30, cal: 410, health: 84,
          q: { c0: 4.5, c2: 4.3 }, votes: 9, likes: 7,
          art: { kind: "bowl", colors: ["#d9344a", "#f08a3c", "#f3efe6"], garnish: "#4f9a3a" },
        },
        {
          name: "Mango-Mint Fresh Spring Rolls", by: "taylor", cat: "k0", serves: "16 rolls",
          ingredients: ["16 rice paper wrappers", "2 mangoes", "Rice vermicelli", "Mint, basil and cilantro", "Red cabbage", "Peanut-lime dipping sauce"],
          steps: "Soften each wrapper in warm water. Layer noodles, herbs, cabbage and mango, then roll tightly. Serve with the peanut-lime sauce.",
          allergens: ["Peanuts"], dietary: ["Vegan", "Gluten-free"], prep: 45, cal: 150, health: 90,
          q: { c0: 4.1, c2: 4.6 }, votes: 9, likes: 6,
          art: { kind: "rolls", colors: ["#eef0e2", "#f2b13c"], garnish: "#7a4a1f" },
        },
        {
          name: "Loco Moco", by: "jason", cat: "k1", serves: "6",
          ingredients: ["2 lb ground beef", "6 eggs", "Brown gravy", "Rice", "Green onion"],
          steps: "Form and sear beef patties. Make a brown gravy in the same pan. Serve each patty on rice with a fried egg and plenty of gravy.",
          allergens: ["Eggs", "Wheat"], dietary: ["High-protein"], prep: 40, cal: 760, health: 20,
          q: { c0: 4.6, c2: 3.5 }, votes: 9, likes: 5,
          art: { kind: "plate", colors: ["#5a3220", "#f5d34a"] },
        },
        {
          name: "Huli Huli Chicken", by: "marcus", cat: "k1", serves: "10",
          ingredients: ["4 lb chicken thighs", "1/2 cup pineapple juice", "1/3 cup shoyu", "1/4 cup ketchup", "Ginger and garlic"],
          steps: "Marinate the chicken overnight. Grill over medium heat, turning (huli) and basting with the reduced marinade until charred and sticky.",
          allergens: ["Soy", "Wheat"], dietary: ["Dairy-free", "High-protein"], prep: 45, cal: 430, health: 48,
          q: { c0: 4.4, c2: 4.0 }, votes: 8, likes: 4,
          art: { kind: "plate", colors: ["#a84a22", "#9ccf7a"], garnish: "#5aa845" },
        },
        {
          name: "Kalua Pig Sliders", by: "keoni", cat: "k1", serves: "16 sliders",
          ingredients: ["3 lb kalua pig", "16 sweet rolls", "Pineapple slaw", "BBQ sauce"],
          steps: "Warm the kalua pig with a little BBQ sauce. Split and toast the rolls, then pile on the pork and pineapple slaw.",
          allergens: ["Wheat", "Eggs", "Milk"], prep: 25, cal: 340, health: 40,
          q: { c0: 4.3, c2: 3.9 }, votes: 8, likes: 4,
          art: { kind: "cookies", colors: ["#d9a14a", "#9a6a4f"] },
        },
        {
          name: "Furikake Spam Musubi", by: "tyler", cat: "k0", serves: "10",
          ingredients: ["1 can Spam", "4 cups rice", "5 sheets nori", "Furikake", "Shoyu-sugar glaze"],
          steps: "Glaze the fried Spam slices, press rice in a mold with a layer of furikake, top with Spam and wrap in nori.",
          allergens: ["Soy", "Wheat", "Sesame"], dietary: ["Dairy-free"], prep: 35, cal: 300, health: 30,
          q: { c0: 4.2, c2: 3.8 }, votes: 9, likes: 6,
          art: { kind: "musubi", colors: ["#d9776f"] },
        },
        {
          name: "Garlic Edamame", by: "hana", cat: "k0", serves: "8",
          ingredients: ["2 lb edamame in the pod", "6 cloves garlic", "1 tbsp sesame oil", "Chili flakes", "Flaky salt"],
          steps: "Boil the edamame for 4 minutes and drain. Sizzle garlic and chili in sesame oil, toss the edamame through and finish with flaky salt.",
          allergens: ["Soy", "Sesame"], dietary: ["Vegan", "Gluten-free", "High-protein"], prep: 15, cal: 180, health: 88,
          q: { c0: 3.9, c2: 3.7 }, votes: 8, likes: 3,
          art: { kind: "bowl", colors: ["#7fbf5e", "#5a9a3e", "#a5d67c"], garnish: "#f3e7b8" },
        },
        {
          name: "Malasadas", by: "ashley", cat: "k2", serves: "18",
          ingredients: ["4 cups flour", "1 packet yeast", "3 eggs", "1 cup evaporated milk", "1/4 cup butter", "Sugar for rolling"],
          steps: "Make an enriched yeast dough and let it rise twice. Fry spoonfuls at 350°F until puffed and golden, then roll in sugar while hot.",
          allergens: ["Wheat", "Eggs", "Milk"], dietary: ["Vegetarian"], prep: 150, cal: 270, health: 12,
          q: { c0: 4.7, c2: 4.2 }, votes: 10, likes: 9,
          art: { kind: "cookies", colors: ["#e8b56a", "#f7f2ea"] },
        },
        {
          name: "Chocolate Haupia Pie", by: "noa", cat: "k2", serves: "12 slices",
          ingredients: ["Shortbread crust", "2 cans coconut milk", "Dark chocolate", "Cornstarch and sugar", "Whipped cream"],
          steps: "Make haupia, divide it and melt chocolate into half. Layer the chocolate haupia, then the plain haupia in the crust. Chill and top with whipped cream.",
          allergens: ["Wheat", "Milk"], dietary: ["Vegetarian"], prep: 60, cal: 320, health: 22,
          q: { c0: 4.6, c2: 4.4 }, votes: 9, likes: 7,
          art: { kind: "cake", colors: ["#4a2a1a", "#f7f2ea", "#f7f2ea"], garnish: "#f7f2ea" },
        },
        {
          name: "Pineapple Upside-Down Cake", by: "kiana", cat: "k2", serves: "12 slices",
          ingredients: ["1 fresh pineapple", "Brown sugar and butter", "2 cups flour", "3 eggs", "Maraschino cherries"],
          steps: "Caramelize brown sugar and butter in the pan, arrange pineapple rings and cherries, pour over the batter and bake at 350°F for 45 minutes. Flip while warm.",
          allergens: ["Wheat", "Eggs", "Milk"], dietary: ["Vegetarian"], prep: 70, cal: 340, health: 28,
          q: { c0: 4.0, c2: 4.1 }, votes: 8, likes: 3,
          art: { kind: "cake", colors: ["#e8b84a", "#f5d34a", "#c0392b"] },
        },
      ],
    },

    // ---- Task 4 history: an older finished potluck ----
    {
      key: "p4",
      code: "SWEETS-3HJD",
      host: "ashley",
      title: "Sweet Tooth Bake-Off",
      theme: "Mystery basket desserts",
      format: "mystery",
      formatDetail: "lilikoi (passion fruit), coconut, macadamia nuts",
      description: "Every dessert has to use all three basket ingredients. Creativity counts for almost a third of the score.",
      location: "Sinclair Library lanai",
      startsAt: hst(now, -52, 14, 0),
      createdAt: now - 60 * DAY,
      publishedAt: hst(now, -52, 16, 30),
      status: "closed",
      maxGuests: 10,
      usedRequired: true,
      scoring: [
        { id: "c0", ...S.delicious, weight: 50 },
        { id: "c1", ...S.health, weight: 20 },
        { id: "c2", ...S.creativity, weight: 30 },
      ],
      categories: [
        { id: "k0", name: "Bars & Cookies", needed: 3 },
        { id: "k1", name: "Cakes & Cupcakes", needed: 2 },
        { id: "k2", name: "Spoon Desserts & Bites", needed: 2 },
      ],
      prizes: ["Homemade lilikoi butter", "Mac nut sampler", ""],
      members: ["ashley", "taylor", "malia", "morgan", "hana", "ethan", "kiana", "noa"],
      cover: ["#f5d34a", "#e9cf9a", "#f7f2ea", "#c99a5a", "#d9b77a"],
      dishes: [
        {
          name: "Lilikoi Chiffon Cupcakes", by: "taylor", cat: "k1", serves: "18 cupcakes",
          ingredients: ["Cake flour", "6 eggs, separated", "1/2 cup lilikoi juice", "Coconut cream frosting", "Toasted macadamia nuts"],
          steps: "Fold whipped egg whites into a lilikoi chiffon batter and bake at 325°F for 20 minutes. Frost with coconut cream and top with toasted mac nuts.",
          allergens: ["Wheat", "Eggs", "Tree nuts"], dietary: ["Vegetarian", "Dairy-free"], prep: 80, cal: 240, health: 30,
          q: { c0: 4.7, c2: 4.6 }, votes: 7, likes: 6,
          art: { kind: "cookies", colors: ["#f5d34a", "#f7f2ea"] },
        },
        {
          name: "Lilikoi Cheesecake Bars", by: "malia", cat: "k0", serves: "16 bars",
          ingredients: ["Macadamia shortbread crust", "16 oz cream cheese", "2 eggs", "Lilikoi curd", "Toasted coconut"],
          steps: "Press the mac nut crust into a pan and bake 10 minutes. Add the cheesecake layer, swirl in lilikoi curd and bake at 325°F for 35 minutes. Chill overnight.",
          allergens: ["Milk", "Eggs", "Wheat", "Tree nuts"], dietary: ["Vegetarian"], prep: 90, cal: 310, health: 22,
          q: { c0: 4.6, c2: 4.2 }, votes: 6, likes: 5,
          art: { kind: "bars", colors: ["#f5d34a", "#d9b77a"], garnish: "#f7f2ea" },
        },
        {
          name: "Coconut Mac Nut Shortbread", by: "morgan", cat: "k0", serves: "24 cookies",
          ingredients: ["2 cups flour", "1 cup butter", "1/2 cup shredded coconut", "1/2 cup chopped macadamia nuts", "Lilikoi glaze"],
          steps: "Mix a short dough with coconut and mac nuts, roll into a log and chill. Slice, bake at 325°F for 15 minutes and drizzle with lilikoi glaze.",
          allergens: ["Wheat", "Milk", "Tree nuts"], dietary: ["Vegetarian"], prep: 60, cal: 180, health: 28,
          q: { c0: 4.3, c2: 4.1 }, votes: 6, likes: 4,
          art: { kind: "cookies", colors: ["#e9cf9a", "#f5d34a"] },
        },
        {
          name: "Vegan Coconut-Lilikoi Panna Cotta", by: "hana", cat: "k2", serves: "8 cups",
          ingredients: ["2 cans coconut milk", "Agar agar", "Lilikoi pulp", "Maple syrup", "Crushed macadamia nuts"],
          steps: "Simmer coconut milk with agar and maple syrup, pour into cups and set for 2 hours. Top with fresh lilikoi pulp and crushed mac nuts.",
          allergens: ["Tree nuts"], dietary: ["Vegan", "Gluten-free"], prep: 25, cal: 190, health: 55,
          q: { c0: 3.6, c2: 3.8 }, votes: 6, likes: 3,
          art: { kind: "drink", colors: ["#f7f2ea", "#f5d34a"] },
        },
        {
          name: "Mac Nut Coconut Granola Bites", by: "ethan", cat: "k2", serves: "20 bites",
          ingredients: ["Rolled oats", "Macadamia nuts", "Unsweetened coconut", "Dates", "Lilikoi zest"],
          steps: "Pulse dates, nuts and coconut, then mix in oats and zest. Roll into bites and chill until firm.",
          allergens: ["Tree nuts"], dietary: ["Vegan", "Gluten-free"], prep: 20, cal: 120, health: 62,
          q: { c0: 3.7, c2: 3.5 }, votes: 6, likes: 2,
          art: { kind: "cookies", colors: ["#c99a5a", "#f7f2ea"] },
        },
      ],
    },
  ];
}

// ---------- deterministic votes and likes ----------

function hashText(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Members who might vote on or like a dish: not its author, and not a tester while the potluck is still running. */
function crowd(p: PotluckSpec, d: DishSpec, salt: string) {
  const pool = p.members.filter((m) => m !== d.by && (p.status === "closed" || !TESTER_KEYS.has(m)));
  const start = hashText(d.name + salt) % pool.length;
  return [...pool.slice(start), ...pool.slice(0, start)];
}

function manualIds(p: PotluckSpec) {
  return p.scoring.filter((c) => c.mode !== "ai").map((c) => c.id);
}

/** Every ballot on a dish, as voter key → scores. Averages land on the dish's target scores. */
export function ballotsFor(p: PotluckSpec, d: DishSpec): { voter: string; scores: Record<string, number> }[] {
  const voters = crowd(p, d, "votes").slice(0, d.votes ?? 0);
  const n = voters.length;
  const perVoter: Record<string, number>[] = voters.map(() => ({}));
  for (const id of manualIds(p)) {
    const target = d.q?.[id] ?? 4;
    const total = Math.round(target * n);
    const base = Math.floor(total / n);
    const values = voters.map((_, i) => base + (i < total - base * n ? 1 : 0));
    // A little spread, keeping the total: one voter a point higher, another a point lower.
    if (n >= 4 && values[0] < 5 && values[n - 1] > 1) {
      values[0] += 1;
      values[n - 1] -= 1;
    }
    values.forEach((value, i) => (perVoter[i][id] = value));
  }
  const ballots = voters.map((voter, i) => ({ voter, scores: perVoter[i] }));
  for (const b of p.testerBallots ?? []) if (b.dish === d.name) ballots.push({ voter: b.voter, scores: b.scores });
  return ballots;
}

export function likersFor(p: PotluckSpec, d: DishSpec): string[] {
  const likers = crowd(p, d, "likes").slice(0, d.likes);
  for (const l of p.testerLikes ?? []) if (l.dish === d.name) likers.push(l.voter);
  return likers;
}

// ---------- seed ----------

const TABLES = [
  "users", "sessions", "passwordResets", "memberships", "feedback", "potlucks", "dishes", "ballots", "inviteCodes", "images",
] as const;

const imageKey = (p: string, i: number | "cover") => `${p}_${i}`;

/** Draws every picture the seed needs, keyed like `p2_3` / `p2_cover`. */
function drawImages(spec: PotluckSpec[]) {
  const images: Record<string, string> = {};
  for (const p of spec) {
    images[imageKey(p.key, "cover")] = foodPicture({ kind: "spread", colors: p.cover, garnish: "#5aa845" }, p.title);
    p.dishes.forEach((d, i) => (images[imageKey(p.key, i)] = foodPicture(d.art, d.name)));
  }
  return images;
}

/** Wipes the local database and loads the evaluation data. `npm run eval:seed` */
export const run = internalAction({
  args: {},
  handler: async (ctx): Promise<string> => {
    const passwordHash = await hashPassword(EVAL_PASSWORD);
    const images = drawImages(buildSpec(Date.now()));
    return await ctx.runMutation(internal.evalSeed.load, { passwordHash, images });
  },
});

async function userId(ctx: MutationCtx, key: string): Promise<Id<"users">> {
  const user = await ctx.db
    .query("users")
    .withIndex("by_email", (q) => q.eq("email", emailFor(key)))
    .first();
  if (!user) throw new Error(`Missing seeded user ${key}. Run npm run eval:seed first.`);
  return user._id;
}

async function addImage(ctx: MutationCtx, potluckId: Id<"potlucks">, ownerId: string, data: string, createdAt: number) {
  const id = await ctx.db.insert("images", { potluckId, ownerId, data, createdAt });
  return `img:${potluckId}/${id}`;
}

function scoreSums(ballots: { scores: Record<string, number> }[]) {
  const sums: Record<string, number> = {};
  for (const b of ballots) for (const [id, s] of Object.entries(b.scores)) sums[id] = (sums[id] ?? 0) + s;
  return sums;
}

export const load = internalMutation({
  args: { passwordHash: v.string(), images: v.record(v.string(), v.string()) },
  handler: async (ctx, { passwordHash, images }) => {
    for (const table of TABLES) {
      for (const row of await ctx.db.query(table).collect()) await ctx.db.delete(row._id);
    }

    const now = Date.now();
    const ids: Record<string, Id<"users">> = {};
    for (const [key, name] of Object.entries(ALL_NAMES)) {
      const created = now - (90 + (hashText(key) % 200)) * DAY;
      ids[key] = await ctx.db.insert("users", {
        email: emailFor(key),
        passwordHash,
        displayName: name,
        photoURL: null,
        frame: null,
        isGuest: false,
        feedbackPromptedIds: [],
        createdAt: created,
        lastSeenAt: now - (hashText(key) % 5) * DAY,
      });
    }

    for (const p of buildSpec(now)) {
      const potluckId = await ctx.db.insert("potlucks", {
        title: p.title,
        theme: p.theme,
        format: p.format,
        formatDetail: p.formatDetail,
        description: p.description,
        location: p.location,
        startsAt: p.startsAt,
        votingOpensAt: null,
        votingClosesAt: null,
        maxGuests: p.maxGuests,
        scoring: p.scoring,
        categoryIds: p.scoring.map((c) => c.id),
        dishCategories: p.categories,
        coverImage: null,
        prizes: p.prizes,
        inviteCode: p.code,
        hostId: ids[p.host],
        memberIds: p.members.map((m) => ids[m]),
        status: p.status,
        podium: [],
        results: null,
        createdAt: p.createdAt,
        updatedAt: p.publishedAt ?? now,
      });
      await ctx.db.insert("inviteCodes", { code: p.code, potluckId, hostId: ids[p.host], createdAt: p.createdAt });
      await syncMemberships(ctx, potluckId, p.members.map((m) => ids[m]));
      const coverImage = await addImage(ctx, potluckId, ids[p.host], images[imageKey(p.key, "cover")], p.createdAt);
      await ctx.db.patch(potluckId, { coverImage });

      const aiId = p.scoring.find((c) => c.mode === "ai")?.id;
      const span = Math.max(DAY, p.startsAt - p.createdAt);
      const dishDocs: Doc<"dishes">[] = [];
      for (const [i, d] of p.dishes.entries()) {
        const createdAt = p.createdAt + Math.round(((i + 1) / (p.dishes.length + 1)) * Math.min(span, p.startsAt - p.createdAt));
        const photo = await addImage(ctx, potluckId, ids[d.by], images[imageKey(p.key, i)], createdAt);
        const ballots = p.status === "open" ? [] : ballotsFor(p, d);
        const dishId = await ctx.db.insert("dishes", {
          potluckId,
          authorId: ids[d.by],
          name: d.name,
          categoryId: d.cat,
          serves: d.serves,
          ingredients: d.ingredients,
          steps: d.steps,
          allergens: d.allergens ?? [],
          dietary: d.dietary ?? [],
          prepMinutes: d.prep,
          calories: d.cal,
          photo,
          recipePhoto: null,
          usedRequired: Boolean(p.usedRequired),
          scoreSums: scoreSums(ballots),
          ...(aiId ? { aiScores: { [aiId]: d.health } } : {}),
          ratingCount: ballots.length,
          likedBy: likersFor(p, d).map((m) => ids[m]),
          createdAt,
          updatedAt: createdAt,
        });
        for (const [j, b] of ballots.entries()) {
          await ctx.db.insert("ballots", {
            potluckId,
            dishId,
            userId: ids[b.voter],
            scores: b.scores,
            createdAt: Math.min(now, p.startsAt + (j + 1) * 7 * 60_000),
          });
        }
        dishDocs.push((await ctx.db.get(dishId))!);
      }

      if (p.status === "closed") {
        const ranked = rankDishes(dishDocs, p.scoring);
        await ctx.db.patch(potluckId, {
          podium: podiumFrom(ranked),
          results: { ...resultsSummary(ranked, p.members.length), publishedAt: p.publishedAt },
        });
      }
    }
    return "Evaluation data loaded: 4 potlucks, 32 dishes. Every test account uses the password potluck123.";
  },
});

// ---------- per-phone reset ----------

/** Puts one phone's three test accounts back exactly as seeded, without touching anyone else. */
export const resetTesters = internalMutation({
  args: { phone: v.union(v.literal("A"), v.literal("B")), passwordHash: v.string() },
  handler: async (ctx, { phone, passwordHash }) => {
    const spec = buildSpec(Date.now());
    const keys = Object.values(TESTERS[phone]) as string[];

    for (const key of keys) {
      const uid = await userId(ctx, key);

      // Sign the phone out and forget anything the participant changed or sent.
      for (const table of ["sessions", "passwordResets", "feedback"] as const) {
        for (const row of await ctx.db.query(table).withIndex("by_userId", (q) => q.eq("userId", uid)).collect()) {
          await ctx.db.delete(row._id);
        }
      }
      await ctx.db.patch(uid, {
        displayName: TESTER_NAMES[key], photoURL: null, frame: null, isGuest: false, passwordHash, feedbackPromptedIds: [],
      });

      // Potlucks they created during a task.
      for (const p of await ctx.db.query("potlucks").withIndex("by_hostId", (q) => q.eq("hostId", uid)).collect()) {
        await deletePotluckCascade(ctx, p);
      }

      // Dishes they added in potlucks that are still open (seeded dishes are all in running or finished ones).
      const keptPhotos = new Set<string>();
      for (const d of await ctx.db.query("dishes").withIndex("by_authorId", (q) => q.eq("authorId", uid)).collect()) {
        const p = await ctx.db.get(d.potluckId as Id<"potlucks">);
        if (p?.status === "open") {
          await deleteDishCascade(ctx, d);
        } else {
          for (const ref of [d.photo, d.recipePhoto]) {
            const id = imageIdFromRef(ctx, ref);
            if (id) keptPhotos.add(id);
          }
        }
      }
      for (const img of await ctx.db.query("images").withIndex("by_ownerId", (q) => q.eq("ownerId", uid)).collect()) {
        if (!keptPhotos.has(img._id)) await ctx.db.delete(img._id);
      }

      // Votes in potlucks that are still running: take them back out of the totals, then restore the seeded ones.
      for (const b of await ctx.db.query("ballots").withIndex("by_userId", (q) => q.eq("userId", uid)).collect()) {
        const p = await ctx.db.get(b.potluckId as Id<"potlucks">);
        if (p?.status === "closed") continue;
        const dish = await ctx.db.get(b.dishId as Id<"dishes">);
        if (dish) {
          const sums = { ...(dish.scoreSums ?? {}) };
          for (const [id, s] of Object.entries(b.scores as Record<string, number>)) sums[id] = (sums[id] ?? 0) - s;
          await ctx.db.patch(dish._id, { scoreSums: sums, ratingCount: dish.ratingCount - 1 });
        }
        await ctx.db.delete(b._id);
      }

      for (const ps of spec) {
        const potluck = await ctx.db
          .query("potlucks")
          .withIndex("by_inviteCode", (q) => q.eq("inviteCode", ps.code))
          .first();
        if (!potluck) continue;

        // Membership as seeded.
        const seededMember = ps.members.includes(key);
        if (seededMember !== potluck.memberIds.includes(uid)) {
          const memberIds = seededMember ? [...potluck.memberIds, uid] : potluck.memberIds.filter((m) => m !== uid);
          await setMembers(ctx, potluck, memberIds);
        }

        const dishes = await ctx.db
          .query("dishes")
          .withIndex("by_potluckId", (q) => q.eq("potluckId", potluck._id))
          .collect();
        for (const d of dishes) {
          const ds = ps.dishes.find((x) => x.name === d.name);
          // Likes as seeded.
          const shouldLike = Boolean(ds && likersFor(ps, ds).includes(key));
          if (shouldLike !== d.likedBy.includes(uid)) {
            await ctx.db.patch(d._id, { likedBy: shouldLike ? [...d.likedBy, uid] : d.likedBy.filter((m) => m !== uid) });
          }
          // Seeded votes in running potlucks.
          if (!ds || ps.status === "closed") continue;
          const seeded = ballotsFor(ps, ds).find((b) => b.voter === key);
          if (!seeded) continue;
          const fresh = (await ctx.db.get(d._id))!;
          const sums = { ...(fresh.scoreSums ?? {}) };
          for (const [id, s] of Object.entries(seeded.scores)) sums[id] = (sums[id] ?? 0) + s;
          await ctx.db.insert("ballots", { potluckId: potluck._id, dishId: d._id, userId: uid, scores: seeded.scores, createdAt: Date.now() });
          await ctx.db.patch(d._id, { scoreSums: sums, ratingCount: fresh.ratingCount + 1 });
        }
      }
    }
    return `Phone ${phone} reset: ${keys.map((k) => emailFor(k)).join(", ")} are back to their starting state and signed out.`;
  },
});

async function reset(ctx: { runMutation: any }, phone: "A" | "B"): Promise<string> {
  const passwordHash = await hashPassword(EVAL_PASSWORD);
  return await ctx.runMutation(internal.evalSeed.resetTesters, { phone, passwordHash });
}

/** `npm run eval:reset-a` */
export const resetPhoneA = internalAction({ args: {}, handler: async (ctx): Promise<string> => reset(ctx, "A") });

/** `npm run eval:reset-b` */
export const resetPhoneB = internalAction({ args: {}, handler: async (ctx): Promise<string> => reset(ctx, "B") });
