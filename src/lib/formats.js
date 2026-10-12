// Competition formats described in the design essay. Each format changes the
// rules participants follow and suggests default dish categories ("brackets").
export const FORMATS = {
  classic: {
    label: 'Classic Showdown',
    emoji: '🍲',
    blurb: 'Bring any home-cooked dish. The best plate wins.',
    detailLabel: null,
    defaultCategories: ['Main dishes', 'Sides', 'Salads', 'Desserts'],
  },
  mystery: {
    label: 'Mystery Basket',
    emoji: '🧺',
    blurb: 'Chopped-style: every dish must use the same required ingredients.',
    detailLabel: 'Required ingredients',
    detailPlaceholder: 'e.g. sweet potato, miso, green apple',
    defaultCategories: ['Savory', 'Sweet'],
  },
  regional: {
    label: 'Regional Cuisine',
    emoji: '🌏',
    blurb: 'Everyone cooks from one region’s cuisine.',
    detailLabel: 'Region or cuisine',
    detailPlaceholder: 'e.g. Mediterranean',
    defaultCategories: ['Mains', 'Sides', 'Desserts'],
  },
  courses: {
    label: 'Course Brackets',
    emoji: '🏆',
    blurb: 'Each course is its own bracket with its own winner.',
    detailLabel: null,
    defaultCategories: ['Appetizers', 'Entrées', 'Desserts'],
  },
};

export const FORMAT_KEYS = Object.keys(FORMATS);

export function formatInfo(key) {
  return FORMATS[key] ?? FORMATS.classic;
}

// Scoring categories. Deliciousness + healthiness are the two the essay calls
// out; hosts can swap in others and change the weights.
export const DEFAULT_SCORING = [
  { id: 'c0', name: 'Deliciousness', description: 'Flavor, taste, and how much you’d want another bite.', weight: 60 },
  { id: 'c1', name: 'Healthiness', description: 'Whole ingredients, balance, and nutrition.', weight: 40 },
];

export const SCORING_SUGGESTIONS = [
  { name: 'Creativity', description: 'Originality and how unique the dish feels.' },
  { name: 'Presentation', description: 'Plating, color, and first impressions.' },
  { name: 'Theme fit', description: 'How well the dish fits the challenge.' },
  { name: 'Healthiness', description: 'Whole ingredients, balance, and nutrition.' },
  { name: 'Deliciousness', description: 'Flavor, taste, and how much you’d want another bite.' },
];

export const MAX_SCORING = 4;
export const SCORING_IDS = ['c0', 'c1', 'c2', 'c3'];

export const DIETARY_LABELS = ['Vegetarian', 'Vegan', 'Gluten-free', 'Dairy-free', 'Nut-free', 'Halal', 'Kosher', 'Low-sugar', 'High-protein', 'Spicy'];
export const COMMON_ALLERGENS = ['Milk', 'Eggs', 'Peanuts', 'Tree nuts', 'Soy', 'Wheat', 'Fish', 'Shellfish', 'Sesame'];
