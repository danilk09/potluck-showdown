// Catches dietary labels that clash with the ingredient list ("Vegetarian" on a
// dish with pork). Word lists are deliberately short and obvious: this is a
// nudge before saving, not a guarantee.

const MEAT = [
  "pork", "pig", "bacon", "ham", "prosciutto", "pancetta", "chorizo", "sausage", "spam", "lard", "kalua",
  "chicken", "beef", "steak", "lamb", "mutton", "goat", "turkey", "duck", "veal", "venison", "gelatin",
  "fish", "salmon", "tuna", "cod", "tilapia", "mahi", "ahi", "anchovy", "anchovies", "sardine", "sardines",
  "shrimp", "prawn", "prawns", "crab", "lobster", "clam", "clams", "mussel", "mussels", "oyster", "oysters",
  "scallop", "scallops", "squid", "octopus", "tako", "pepperoni", "salami", "hot dog", "hotdog",
];
const ANIMAL = ["milk", "butter", "cheese", "cream", "yogurt", "yoghurt", "ghee", "egg", "eggs", "honey", "mayonnaise", "mayo"];
const DAIRY = ["milk", "butter", "cheese", "cream", "yogurt", "yoghurt", "ghee", "whey", "parmesan", "mozzarella"];
const GLUTEN = ["flour", "wheat", "bread", "breadcrumbs", "panko", "pasta", "noodles", "barley", "rye", "couscous", "tortilla"];
const NUTS = ["peanut", "peanuts", "almond", "almonds", "cashew", "cashews", "walnut", "walnuts", "pecan", "pecans", "macadamia", "pistachio", "hazelnut"];
const PORK = ["pork", "pig", "bacon", "ham", "prosciutto", "pancetta", "chorizo", "spam", "lard", "kalua", "pepperoni"];
const ALCOHOL = ["wine", "beer", "rum", "vodka", "sake", "mirin", "whiskey", "bourbon", "brandy"];

// "Gluten-free flour", "vegan butter", "plant-based milk" and similar don't count.
const SAFE_PREFIX = /\b(gluten[-\s]?free|vegan|plant[-\s]?based|dairy[-\s]?free|non[-\s]?dairy|oat|almond|soy|coconut|rice|nut[-\s]?free|veggie|vegetarian|impossible|beyond)\s+$/i;

const RULES: Record<string, string[]> = {
  Vegetarian: MEAT,
  Vegan: [...MEAT, ...ANIMAL],
  "Dairy-free": DAIRY,
  "Gluten-free": GLUTEN,
  "Nut-free": NUTS,
  Halal: [...PORK, ...ALCOHOL],
  Kosher: [...PORK, "shrimp", "crab", "lobster", "clam", "clams", "mussel", "mussels", "oyster", "oysters", "scallop", "scallops"],
};

function found(ingredient: string, word: string): boolean {
  const re = new RegExp(`(^|[^\\p{L}])${word}(?![\\p{L}])`, "iu");
  const match = re.exec(ingredient);
  if (!match) return false;
  return !SAFE_PREFIX.test(ingredient.slice(0, match.index + match[1].length));
}

/** Each label that clashes with an ingredient, with the word that clashed: [{ label, word }]. */
export function dietaryConflicts(ingredients: string[], labels: string[]): { label: string; word: string }[] {
  const out: { label: string; word: string }[] = [];
  for (const label of labels) {
    const words = RULES[label];
    if (!words) continue;
    const hit = words.find((w) => ingredients.some((i) => found(i, w)));
    if (hit) out.push({ label, word: hit });
  }
  return out;
}
