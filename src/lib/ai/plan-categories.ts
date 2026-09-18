// GTC-236: canonical food-category vocabulary — key ↔ label ↔ emoji. Pure data, no
// server imports, so client components (plan-view regenerate triggers) can share the
// same definition the API routes use instead of duplicating the maps.

export const CATEGORY_EMOJIS: Record<string, string> = {
  mains: '🍖',
  sides_salads: '🥗',
  entree_starters: '🥟',
  dessert: '🍰',
  drinks_alcoholic: '🍷',
  drinks_non_alcoholic: '🥤',
  table_snacks: '🥨',
  breakfast_brunch: '🍳',
  cake: '🎂',
  other: '📝',
};

export const CATEGORY_LABELS: Record<string, string> = {
  mains: 'Mains',
  sides_salads: 'Sides & Salads',
  entree_starters: 'Entrée & Starters',
  dessert: 'Dessert',
  drinks_alcoholic: 'Alcoholic Drinks',
  drinks_non_alcoholic: 'Non-Alcoholic Drinks',
  table_snacks: 'Table Snacks',
  breakfast_brunch: 'Breakfast & Brunch',
  cake: 'Cake',
  other: 'Other',
};

// Order in which food categories appear in the modal (and so in the plan).
export const FOOD_CATEGORY_ORDER = [
  'mains',
  'entree_starters',
  'sides_salads',
  'dessert',
  'cake',
  'drinks_alcoholic',
  'drinks_non_alcoholic',
  'table_snacks',
  'breakfast_brunch',
] as const;
