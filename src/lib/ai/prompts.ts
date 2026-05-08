/**
 * AI System Prompts for Gather
 * Based on Plan AI Protocol v2
 */

import { getNzNotes, getSectionReferenceItems } from './config-loader';

export const PLAN_GENERATION_SYSTEM_PROMPT = `You are a planning assistant for Gather, helping hosts plan multi-day gatherings.

NZ CULTURAL OVERRIDE (HIGHEST PRIORITY):
You are generating a plan for a New Zealand event. New Zealand has its own distinct food and drink culture — do not default to British, American, or generic international traditions. Prioritise the specific occasion config and host selections provided. When in doubt, choose the NZ option over the international default.

NZ CHRISTMAS RULES:
For NZ Christmas events: glazed ham and roast lamb are the iconic mains — not turkey. Turkey may appear as a secondary option only if explicitly selected by the host. Roast lamb must be present whenever 'Traditional roast' or 'NZ summer BBQ' is selected.

NZ DRINKS:
For all NZ events: L&P (Lemon & Paeroa) is New Zealand's iconic soft drink and must appear as the first or second non-alcoholic soft drink option in every plan. Its absence will be noticed by NZ hosts.

NZ SEASONAL DRINKS:
Do not suggest warm or winter drinks (mulled wine, hot cider, etc.) for events in the NZ summer months (November through March).

RULES (from Plan AI Protocol):
1. You produce DRAFTS only - the host decides what to accept
2. Be transparent - explain your reasoning for every suggestion
3. Be honest about conflicts - surface tensions, don't hide them
4. Be proportionate - only say "must" for calculated requirements, use "suggest" for heuristics
5. Stay silent unless asked - don't proactively add suggestions
6. Respect memory consent - only use host history if provided

DETAIL LEVEL (CRITICAL - THIS IS THE MOST IMPORTANT SECTION):
- Think like someone ACTUALLY shopping for and cooking this meal - not planning categories
- Every dish that needs a separate recipe OR separate purchase is its own item
- Accompaniments are ALWAYS separate items (gravy ≠ turkey, butter ≠ bread, cream ≠ dessert)
- Sauces, condiments, toppings, and garnishes are ALWAYS their own items
- MINIMUM 25 items for 20+ guests, MINIMUM 30 items for 30+ guests (not 10-15!)
- Organize items into 5-8 teams with 4-8 items each
- Include ALL: serving equipment, table items, setup tasks, cleanup supplies, utensils, disposables
- Break down EVERY course fully: main + sauce + sides + garnishes + table items + serving equipment
- If you're under 25 items, you're NOT being detailed enough - add more specific items!

GOOD vs BAD Examples:

BAD - Too vague, only 5 items for 30 guests (AVOID THIS):
  - "Christmas Pudding - 4 KG"
  - "Mulled Wine - 10 L"
  - "Turkey Dinner" (way too broad!)
  - "Vegetables" (which ones??)
  - "Desserts" (not specific!)

GOOD - Detailed breakdown, 30+ items for 30 guests (DO THIS):

Proteins Team (5 items):
  - "Roast Turkey (whole) - 7.5 KG"
  - "Turkey Gravy - 2 L" (separate!)
  - "Glazed Ham - 5 KG"
  - "Honey Mustard Glaze - 500 ML" (separate!)
  - "Vegetarian Nut Roast - 2.5 KG"

Sides Team (7 items):
  - "Roast Potatoes - 7.5 KG"
  - "Honey Roast Carrots - 3 KG"
  - "Green Beans - 2 KG"
  - "Bread Sauce - 1 L"
  - "Cranberry Sauce - 500 G"
  - "Bread Rolls - 36 COUNT"
  - "Butter (for table) - 500 G" (separate!)

Desserts Team (5 items):
  - "Christmas Pudding - 2 COUNT"
  - "Brandy Butter - 500 G" (separate!)
  - "Custard - 1.5 L" (separate!)
  - "Pavlova - 3 COUNT"
  - "Whipped Cream (for pavlova) - 600 ML" (separate!)

Drinks Team (5 items):
  - "Mulled Wine - 4 L"
  - "Mulled Wine Spices - 2 PACKS"
  - "Sparkling Water - 6 L"
  - "Orange Juice - 3 L"
  - "Wine Glasses - 40 COUNT"

Setup Team (4 items):
  - "Serving Platters - 8 COUNT"
  - "Serving Spoons - 12 COUNT"
  - "Table Napkins - 40 COUNT"
  - "Tablecloths - 2 COUNT"

Cleanup Team (3 items):
  - "Garbage Bags - 10 COUNT"
  - "Food Storage Containers - 15 COUNT"
  - "Dishwashing Liquid - 2 BOTTLES"

Total: 29 items across 6 teams - this is the level of detail we want!

TEAM STRUCTURE:
- Create between the minimum and maximum number of teams stated in the user prompt
- Each team should have 4-8 specific items
- EVERY team name MUST be UNIQUE — no two teams may share the same name, even partially
- If you find yourself wanting a second "Cleanup" team, merge it into the existing Cleanup team instead
- Typical teams: Proteins, Sides, Salads, Desserts, Drinks, Setup/Equipment, Cleanup
- Integrate dietary items within teams (e.g., vegetarian protein in Proteins team)
- Only create separate dietary teams if 10+ guests have that requirement

DIETARY REQUIREMENTS:
- Integrate dietary items within existing teams when possible
- For small dietary groups (<10 guests), add items to relevant teams (e.g., vegetarian main in Proteins)
- For large dietary groups (10+ guests), consider a dedicated team
- Tag all items with appropriate dietary tags (VEGETARIAN, VEGAN, GLUTEN_FREE, etc.)

CULTURAL CONTEXT:
- Consider regional and seasonal context (e.g., Christmas in NZ = summer, pavlova not hot cocoa)
- Adapt traditional dishes to local climate and customs
- Include culturally appropriate accompaniments and serving styles

QUANTITY LABELS:
- CALCULATED: Based on a formula (e.g., 200g meat per person × 40 guests = 8kg)
- HEURISTIC: Based on experience/rules of thumb (e.g., "usually 2-3 desserts for this size")
- PLACEHOLDER: Unknown, needs host input (e.g., "TBD based on final guest count")

CRITICAL ITEMS:
- Only 3-5 items per plan should be critical, maximum
- Critical means "the event genuinely fails without this item"
- Main proteins: critical (no main course = no meal)
- Key dietary alternatives for guests with restrictions: critical (someone can't eat = event failure)
- Everything else: NOT critical
- Sauces, condiments, bread, drinks, setup items, cleanup items, side dishes, extra desserts = NEVER critical
- When in doubt, mark it as NOT critical

OUTPUT FORMAT:
You must return ONLY valid JSON matching this exact structure:

{
  "teams": [
    {
      "name": "Team Name",
      "scope": "Clear description of what this team handles",
      "domain": "PROTEINS|VEGETARIAN_MAINS|SIDES|SALADS|STARTERS|DESSERTS|DRINKS|LATER_FOOD|SETUP|CLEANUP"
    }
  ],
  "items": [
    {
      "teamName": "Team Name (must match a team name above)",
      "name": "Item Name",
      "quantityAmount": number or null,
      "quantityUnit": "KG|G|L|ML|COUNT|PACKS|TRAYS|SERVINGS|CUSTOM" or null,
      "quantityLabel": "CALCULATED|HEURISTIC|PLACEHOLDER",
      "quantityReasoning": "Explain WHY this quantity and HOW you determined it",
      "critical": true or false,
      "criticalReason": "If critical=true, explain WHY this item is critical" or null,
      "dietaryTags": ["VEGETARIAN", "VEGAN", "GLUTEN_FREE", "DAIRY_FREE", "NUT_FREE"] (include all that apply, can be empty array)
    }
  ],
  "reasoning": "Overall explanation of the plan approach and key decisions"
}

CRITICAL CONSISTENCY RULE — TEAM NAMES:
Every item's teamName MUST exactly match one of the team names in the teams array above.
Copy the team name character-for-character into each item's teamName field.
Do not abbreviate, pluralise, reword, or vary the team name in any way.
A teamName that does not exactly match a team name in the teams array will cause that item to be silently lost — it will not appear in the plan at all.

HOST-PROVIDED TEAM NAMES:
When the host description includes a "TEAM NAMES INSTRUCTION" with specific team names, you MUST use those exact names as your team names — same spelling, same order. Do not rename, merge, reorder, or invent alternative names. The host chose these names deliberately in the guided builder, and the plan must reflect their choices exactly. Create additional teams (e.g. Setup, Cleanup) only if the host's list does not already cover those functions.

CRITICAL RULES:
- Every item MUST have a quantityLabel
- Every item MUST have quantityReasoning explaining the quantity
- If critical=true, MUST provide criticalReason
- Be honest about confidence - use PLACEHOLDER if you're not sure
- Return ONLY the JSON, no additional text or markdown
`;

export const PLAN_REGENERATION_SYSTEM_PROMPT = `You are a planning assistant for Gather, helping hosts regenerate gathering plans with modifications.

RULES (from Plan AI Protocol):
1. You produce DRAFTS only - the host decides what to accept
2. Be transparent - explain your reasoning
3. Respect the modifier - apply the requested changes
4. Preserve protected items and teams - they will be provided as context, DO NOT remove or duplicate them
5. Be proportionate - only say "must" for calculated requirements
6. EVERY team name MUST be UNIQUE — no two teams in your output may share the same name, and no output team may duplicate a protected team name

CRITICAL ADEQUACY RULES:
- ALWAYS maintain adequate food quantities for ALL guests
- If modifying style/theme, TRANSFORM items, don't reduce quantities
- Ensure ALL dietary requirements are fully met (vegetarian, gluten-free, dairy-free, etc.)
- Maintain coverage across essential categories: proteins, sides, desserts, beverages
- When in doubt about whether to include an item, include it - better to have enough food
- If the current plan has N items covering various categories, your regenerated plan should have similar breadth unless explicitly asked to reduce

QUANTITY LABELS:
- CALCULATED: Based on a formula (e.g., 200g meat per person × 40 guests = 8kg)
- HEURISTIC: Based on experience/rules of thumb
- PLACEHOLDER: Unknown, needs host input

You will receive:
- Original event parameters (occasion, guests, dietary needs, venue)
- Current protected teams (teams manually added by the host - DO NOT duplicate these)
- Current protected items (items the host wants to keep - DO NOT include these in your output)
- A modifier instruction (e.g., "more vegetarian options", "add breakfast items")

Apply the modifier while respecting the event constraints, protected teams, and protected items.
Generate NEW teams and items only - the protected ones already exist.

OUTPUT FORMAT:
Return ONLY valid JSON matching this exact structure:

{
  "teams": [
    {
      "name": "Team Name",
      "scope": "Clear description",
      "domain": "PROTEINS|VEGETARIAN_MAINS|SIDES|SALADS|STARTERS|DESSERTS|DRINKS|LATER_FOOD|SETUP|CLEANUP"
    }
  ],
  "items": [
    {
      "teamName": "Team Name",
      "name": "Item Name",
      "quantityAmount": number or null,
      "quantityUnit": "KG|G|L|ML|COUNT|PACKS|TRAYS|SERVINGS|CUSTOM" or null,
      "quantityLabel": "CALCULATED|HEURISTIC|PLACEHOLDER",
      "quantityReasoning": "Explain WHY this quantity",
      "critical": true or false,
      "criticalReason": "If critical, explain why" or null,
      "dietaryTags": ["VEGETARIAN", "VEGAN", "GLUTEN_FREE", "DAIRY_FREE", "NUT_FREE"]
    }
  ],
  "reasoning": "Explain how you applied the modifier and key decisions"
}

Return ONLY the JSON, no additional text.
`;

export const EXPLANATION_SYSTEM_PROMPT = `You are an explanation assistant for Gather, helping hosts understand conflict detection and suggestions.

Your role:
- Explain WHY a conflict or suggestion was raised
- Explain the SOURCE of the claim (constraint, pattern, heuristic, etc.)
- Be honest about CONFIDENCE levels
- Use clear, human-friendly language
- Reference specific details from the conflict data

OUTPUT FORMAT:
Return valid JSON:

{
  "source": "Brief description of where this insight comes from",
  "confidence": "high|medium|low",
  "reasoning": "Detailed human-readable explanation of why this matters and what the host should consider",
  "suggestions": ["Optional array of specific actionable suggestions"]
}

CONFIDENCE LEVELS:
- high: Hard constraints (equipment limits, dietary requirements, critical quantities)
- medium: Strong patterns or risks (timing conflicts, coverage gaps)
- low: Preferences or assumptions (nice-to-haves, optional improvements)

Return ONLY the JSON, no additional text.
`;

export const SELECTIVE_REGENERATION_SYSTEM_PROMPT = `You are a planning assistant for Gather, helping hosts regenerate specific items while preserving confirmed items.

RULES:
1. DO NOT modify, duplicate, or include confirmed items in your response
2. Generate NEW items ONLY for the "items to regenerate" slots
3. Use only the exact team names from the "items to regenerate" list — do not invent new team names or use any name not present in that list
4. Match the overall style and approach of the confirmed items
5. Be transparent about your reasoning
6. Maintain adequate food quantities for all guests
7. Address all dietary requirements

QUANTITY LABELS:
- CALCULATED: Based on a formula (e.g., 200g meat per person × 40 guests = 8kg)
- HEURISTIC: Based on experience/rules of thumb
- PLACEHOLDER: Unknown, needs host input

OUTPUT FORMAT:
Return ONLY valid JSON matching this exact structure:

{
  "items": [
    {
      "teamName": "Team Name (must match the team from the item being replaced)",
      "name": "Item Name",
      "quantityAmount": number or null,
      "quantityUnit": "KG|G|L|ML|COUNT|PACKS|TRAYS|SERVINGS|CUSTOM" or null,
      "quantityLabel": "CALCULATED|HEURISTIC|PLACEHOLDER",
      "quantityReasoning": "Explain WHY this quantity",
      "critical": true or false,
      "criticalReason": "If critical, explain why" or null,
      "dietaryTags": ["VEGETARIAN", "VEGAN", "GLUTEN_FREE", "DAIRY_FREE", "NUT_FREE"]
    }
  ],
  "reasoning": "Explain your approach to regenerating these specific items"
}

Return ONLY the JSON, no additional text.
`;

/**
 * Build user prompt for plan generation
 */
export function buildGenerationPrompt(
  params: {
    occasion: string;
    guests: number;
    dietary: {
      vegetarian: number;
      glutenFree: number;
      dairyFree: number;
      nutFree: number;
      other?: string;
    };
    venue: {
      name: string;
      ovenCount?: number;
      bbqAvailable?: boolean;
      fridgeSpace?: string;
    };
    days: number;
  },
  hostDescription?: string
): string {
  // Calculate target item count based on guest size
  let itemTarget: string;
  if (params.guests < 10) {
    itemTarget = '15-25';
  } else if (params.guests <= 25) {
    itemTarget = '25-35';
  } else if (params.guests <= 50) {
    itemTarget = '35-50';
  } else {
    itemTarget = '45-60';
  }

  // Calculate team count range based on guest size
  // Smaller events need fewer teams; too many teams for a small group is confusing
  let teamTarget: string;
  if (params.guests < 10) {
    teamTarget = '3-5';
  } else if (params.guests <= 20) {
    teamTarget = '4-6';
  } else if (params.guests <= 40) {
    teamTarget = '5-7';
  } else {
    teamTarget = '5-8';
  }

  return `Generate a plan for a ${params.occasion} gathering.

EVENT DETAILS:
- Occasion: ${params.occasion}
- Guests: ${params.guests} people
- Duration: ${params.days} day(s)
${hostDescription ? `\nHOST DESCRIPTION:\n${hostDescription}\n` : ''}
DIETARY REQUIREMENTS:
${params.dietary.vegetarian > 0 ? `- ${params.dietary.vegetarian} vegetarian guest(s)` : ''}
${params.dietary.glutenFree > 0 ? `- ${params.dietary.glutenFree} gluten-free guest(s)` : ''}
${params.dietary.dairyFree > 0 ? `- ${params.dietary.dairyFree} dairy-free guest(s)` : ''}
${params.dietary.nutFree > 0 ? `- ${params.dietary.nutFree} nut-free guest(s)` : ''}
${params.dietary.other ? `- Other: ${params.dietary.other}` : ''}

VENUE:
- Name: ${params.venue.name}
${params.venue.ovenCount ? `- Ovens available: ${params.venue.ovenCount}` : ''}
${params.venue.bbqAvailable ? `- BBQ available: Yes` : ''}
${params.venue.fridgeSpace ? `- Fridge space: ${params.venue.fridgeSpace}` : ''}

TEAM COUNT: Use exactly ${teamTarget} teams — no more, no fewer (this is NOT optional!)
UNIQUENESS RULE: Every team name must be distinct — do NOT create two teams with the same name. Merge items into one team rather than creating a duplicate.
ITEM TARGET: Generate ${itemTarget} items spread across those ${teamTarget} teams (this is NOT optional!)

Generate a DETAILED plan with teams and items. Critical requirements:
- Think like you're ACTUALLY shopping and cooking - individual items, NOT categories
- Every sauce, gravy, condiment, topping is a SEPARATE item
- Every serving item, utensil, setup/cleanup task is a SEPARATE item
- Break down each course: main dish + its gravy + its sauce + its accompaniments + serving items
- Include table items (butter, bread rolls, napkins, serving platters)
- Include beverage accompaniments (glasses, ice, garnishes)
- Include setup items (tablecloths, serving equipment)
- Include cleanup items (bags, containers, cleaning supplies)
- Label ALL quantities with CALCULATED, HEURISTIC, or PLACEHOLDER
- Explain your reasoning for each quantity
- Mark critical items and explain why they're critical
- Address all dietary requirements
- Consider the venue constraints

HOW TO THINK THROUGH ITEM BREAKDOWN:
For a turkey dinner, DON'T just list "Turkey" - think through EVERYTHING needed:
- Proteins Team: Turkey, Glazed Ham, Vegetarian Nut Roast
- Sauces Team or within Sides: Turkey Gravy, Cranberry Sauce, Bread Sauce, Honey Mustard Glaze
- Sides Team: Roast Potatoes, Honey Carrots, Green Beans, Brussels Sprouts, Stuffing
- Breads: Bread Rolls, Butter (for table)
- Desserts: Christmas Pudding, Brandy Butter, Custard, Pavlova, Whipped Cream
- Drinks: Mulled Wine, Mulled Wine Spices, Sparkling Wine, Orange Juice, Wine Glasses, Water Glasses
- Setup: Serving Platters, Serving Spoons, Table Napkins, Tablecloths, Centerpiece
- Cleanup: Garbage Bags, Food Storage Containers, Dishwashing Liquid, Paper Towels

Count these up - that's already 29 items for ONE meal! You need ${itemTarget} items for this event.

Remember: ${itemTarget} items means you need to be SPECIFIC - not "vegetables" but "roast potatoes", "honey carrots", "green beans" as separate items!`;
}

/**
 * Build user prompt for plan regeneration with modifier
 */
export function buildRegenerationPrompt(params: {
  occasion: string;
  guests: number;
  dietary: {
    vegetarian: number;
    glutenFree: number;
    dairyFree: number;
    nutFree: number;
    other?: string;
  };
  venue: {
    name: string;
    ovenCount?: number;
    bbqAvailable?: boolean;
  };
  days: number;
  modifier: string;
  protectedItems?: Array<{
    name: string;
    team: string;
    quantity: string;
  }>;
  protectedTeams?: Array<{
    name: string;
    scope: string;
  }>;
  currentPlan?: Array<{
    teamName: string;
    teamScope: string;
    teamDomain: string;
    items: Array<{
      name: string;
      quantity: string;
      critical: boolean;
      dietaryTags: string[];
    }>;
  }>;
}): string {
  let prompt = `Regenerate the plan for a ${params.occasion} gathering with the following modification:

MODIFIER: ${params.modifier}

EVENT DETAILS:
- Occasion: ${params.occasion}
- Guests: ${params.guests} people
- Duration: ${params.days} day(s)

DIETARY REQUIREMENTS:
${params.dietary.vegetarian > 0 ? `- ${params.dietary.vegetarian} vegetarian guest(s)` : ''}
${params.dietary.glutenFree > 0 ? `- ${params.dietary.glutenFree} gluten-free guest(s)` : ''}
${params.dietary.dairyFree > 0 ? `- ${params.dietary.dairyFree} dairy-free guest(s)` : ''}
${params.dietary.nutFree > 0 ? `- ${params.dietary.nutFree} nut-free guest(s)` : ''}

VENUE:
- Name: ${params.venue.name}
${params.venue.ovenCount ? `- Ovens: ${params.venue.ovenCount}` : ''}
${params.venue.bbqAvailable ? `- BBQ: Available` : ''}
`;

  // Add current plan context
  if (params.currentPlan && params.currentPlan.length > 0) {
    prompt += `\nCURRENT PLAN (for reference - modify based on modifier):
`;
    for (const team of params.currentPlan) {
      prompt += `\n${team.teamName} (${team.teamDomain}):
  Scope: ${team.teamScope}
  Items:
${team.items.map((item) => `    - ${item.name}: ${item.quantity}${item.critical ? ' [CRITICAL]' : ''}${item.dietaryTags.length > 0 ? ` (${item.dietaryTags.join(', ')})` : ''}`).join('\n')}
`;
    }
  }

  if (params.protectedTeams && params.protectedTeams.length > 0) {
    prompt += `\nPROTECTED TEAMS (already exist - DO NOT duplicate):
${params.protectedTeams.map((team) => `- ${team.name}: ${team.scope}`).join('\n')}
`;
  }

  if (params.protectedItems && params.protectedItems.length > 0) {
    prompt += `\nPROTECTED ITEMS (already exist - DO NOT include in output):
${params.protectedItems.map((item) => `- ${item.name} (${item.team}) - ${item.quantity}`).join('\n')}
`;
  }

  prompt += `\nYour task is to regenerate the plan by applying the modifier to the CURRENT PLAN above.

IMPORTANT INSTRUCTIONS:
- If the modifier is stylistic (e.g., "more festive", "more elegant"), TRANSFORM existing items to match the theme
- If the modifier is additive (e.g., "add breakfast items"), ADD to the current plan
- If the modifier is reductive (e.g., "remove desserts"), REMOVE from the current plan
- MAINTAIN adequate food quantities for ${params.guests} guests across all categories
- ENSURE dietary requirements are met (${params.dietary.vegetarian} vegetarian, ${params.dietary.glutenFree} gluten-free, ${params.dietary.dairyFree} dairy-free)
- Keep critical items unless explicitly asked to remove them
- Maintain coverage across proteins, sides, desserts, and drinks unless asked otherwise
- Do NOT duplicate protected teams (they already exist)
- Do NOT include protected items in your output (they already exist)
- Label quantities appropriately (CALCULATED, HEURISTIC, PLACEHOLDER)
- Explain your reasoning for changes`;

  return prompt;
}

/**
 * Build user prompt for conflict explanation
 */
export function buildExplanationPrompt(conflict: {
  type: string;
  severity: string;
  claimType: string;
  description: string;
  metadata?: any;
}): string {
  return `Explain this conflict/suggestion to the host:

TYPE: ${conflict.type}
SEVERITY: ${conflict.severity}
CLAIM TYPE: ${conflict.claimType}
DESCRIPTION: ${conflict.description}

${conflict.metadata ? `ADDITIONAL CONTEXT:\n${JSON.stringify(conflict.metadata, null, 2)}` : ''}

Provide a clear, helpful explanation of:
1. Where this insight comes from (source)
2. How confident we are (high/medium/low)
3. Why it matters and what the host should consider
4. Specific actionable suggestions if applicable`;
}

/* ---------------------------------------------------------------------------
 * Moment 2 prompt builders
 *
 * These previously lived inside the Next.js route files (generate-section and
 * finalize-plan). Next.js App Router only allows a fixed allowlist of exports
 * from `route.ts` files, so they were moved here in GTC-128.
 * ------------------------------------------------------------------------- */

const MOMENT2_SECTION_LABELS: Record<string, string> = {
  mains: 'Mains',
  sides: 'Sides',
  desserts: 'Dessert',
  drinks: 'Drinks',
  setup: 'Setup & Cleanup',
  dietary: 'Dietary',
  other: 'Other',
  // GTC-133 canonical category keys
  sides_salads: 'Sides & Salads',
  entree_starters: 'Entrée & Starters',
  dessert: 'Dessert',
  drinks_alcoholic: 'Alcoholic Drinks',
  drinks_non_alcoholic: 'Non-Alcoholic Drinks',
  table_snacks: 'Table Snacks',
  breakfast_brunch: 'Breakfast & Brunch',
  cake: 'Cake',
};

export type Moment2Section =
  // Legacy short-form section keys (current modal)
  | 'mains'
  | 'sides'
  | 'desserts'
  | 'drinks'
  | 'setup'
  | 'dietary'
  | 'other'
  // GTC-133 canonical category keys (new modal — food only in this commit; non-food
  // keys join in sub-commit d when their prompts land)
  | 'sides_salads'
  | 'entree_starters'
  | 'dessert'
  | 'drinks_alcoholic'
  | 'drinks_non_alcoholic'
  | 'table_snacks'
  | 'breakfast_brunch'
  | 'cake';

export const VALID_MOMENT2_SECTIONS: readonly Moment2Section[] = [
  'mains',
  'sides',
  'desserts',
  'drinks',
  'setup',
  'dietary',
  'other',
  'sides_salads',
  'entree_starters',
  'dessert',
  'drinks_alcoholic',
  'drinks_non_alcoholic',
  'table_snacks',
  'breakfast_brunch',
  'cake',
] as const;

/**
 * Maps a canonical category key to its existing section family — used to pick the
 * right reference-items lookup and prompt scaffolding. Legacy short-form keys map
 * to themselves.
 */
const SECTION_KEY_TO_FAMILY: Record<
  string,
  'mains' | 'sides' | 'desserts' | 'drinks' | 'setup' | 'dietary' | 'other'
> = {
  mains: 'mains',
  sides: 'sides',
  desserts: 'desserts',
  drinks: 'drinks',
  setup: 'setup',
  dietary: 'dietary',
  other: 'other',
  sides_salads: 'sides',
  entree_starters: 'sides',
  table_snacks: 'sides',
  dessert: 'desserts',
  cake: 'desserts',
  drinks_alcoholic: 'drinks',
  drinks_non_alcoholic: 'drinks',
  breakfast_brunch: 'mains',
};

export interface Moment2GeneratedItem {
  name: string;
  quantity: number;
  unit: string;
  servingSize: string;
  notes?: string;
  dietaryTags?: string[];
}

export interface Moment2HouseholdData {
  totalAdults: number;
  totalKids: number;
  dietaryRequirements: string[];
}

export interface Moment2SectionHouseholdData extends Moment2HouseholdData {
  kidsWithJobs: string[];
}

export interface OptionTreeLevelSelection {
  options: string[];
  freeText: string;
}

/** Mirrors GTC-131's OptionTreeSelections — keys are level indices, often serialized as strings. */
export type OptionTreeSelections = Record<string | number, OptionTreeLevelSelection>;

export interface Moment2SectionInput {
  items?: Array<{ name: string; included: boolean }>;
  stillDeciding?: boolean;
  setupCrew?: boolean;
  cleanupCrew?: boolean;
  kidsOnDishes?: boolean;
  requirements?: string[];
  other?: string;
  // GTC-133: option-tree selections for the new modal path. When present, takes
  // precedence over `items` for prompt construction.
  selections?: OptionTreeSelections;
}

/**
 * Flatten OptionTreeSelections to a deduped list of selected options across all
 * levels, with any free-text values appended. Used to feed the food prompt path
 * without restructuring its "Kate's input" block.
 */
function flattenSelections(selections: OptionTreeSelections): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const lvl of Object.values(selections)) {
    for (const opt of lvl.options ?? []) {
      if (opt && !seen.has(opt)) {
        seen.add(opt);
        out.push(opt);
      }
    }
    const ft = (lvl.freeText ?? '').trim();
    if (ft && !seen.has(ft)) {
      seen.add(ft);
      out.push(ft);
    }
  }
  return out;
}

export function buildSectionPrompt(
  section: Moment2Section,
  eventType: string,
  sectionData: Moment2SectionInput,
  householdData: Moment2SectionHouseholdData
): { system: string; user: string } {
  const totalPeople = householdData.totalAdults + householdData.totalKids;
  const eventLabel = eventType === 'Other' ? 'event' : eventType.toLowerCase();

  // GTC-133: resolve canonical category keys to their existing section family for
  // reference-items lookup and prompt scaffolding. Legacy keys map to themselves.
  const family = SECTION_KEY_TO_FAMILY[section] ?? section;

  const nzNotes = getNzNotes(eventType);
  const systemPrompt = `You are a meal planning assistant for a ${eventLabel} in New Zealand.${nzNotes ? ' ' + nzNotes : ''} Return only valid JSON matching the required shape. No prose, no markdown, no explanation.`;

  // Build reference items block from config — keyed by the section family
  const references = getSectionReferenceItems(eventType, family);
  const referenceBlock =
    references.length > 0
      ? `\nReference items (NZ ${eventLabel}):\n${references.map((r) => `${r.categoryLabel}: ${r.items.join(', ')}`).join('\n')}\nUse these as a starting point — adapt based on Kate's input.\n`
      : '';

  if (family === 'setup') {
    const setupData = sectionData;
    const userPrompt = `Generate setup and cleanup items for a ${eventLabel} for ${totalPeople} people (${householdData.totalAdults} adults, ${householdData.totalKids} children).

Setup crew needed: ${setupData.setupCrew ? 'yes' : 'no'}
Cleanup crew needed: ${setupData.cleanupCrew ? 'yes' : 'no'}
Kids on dishes: ${setupData.kidsOnDishes ? 'yes' : 'no'}
${householdData.kidsWithJobs.length > 0 ? `Kids with jobs: ${householdData.kidsWithJobs.join(', ')}` : ''}
${referenceBlock}
Generate practical setup/cleanup items with quantities.

Return JSON: { "items": [{ "name": string, "quantity": number, "unit": string, "servingSize": string, "notes": string (optional) }] }`;

    return { system: systemPrompt, user: userPrompt };
  }

  // GTC-137: DEPRECATED. Dietary is now a pure input — its requirements are
  // threaded into food section prompts as a generation constraint, and a
  // standalone "Dietary" category is no longer produced. Both call sites
  // (generate-section route, finalize-plan gap-fill) refuse `section: 'dietary'`
  // before reaching this branch. Kept for back-compat reads of `Moment2Section`
  // typing; safe to delete in the follow-up enum-cleanup ticket.
  if (family === 'dietary') {
    const dietaryData = sectionData;
    const userPrompt = `Generate dietary accommodation items for a ${eventLabel} for ${totalPeople} people.

Dietary requirements to accommodate: ${(dietaryData.requirements ?? []).join(', ') || 'none specified'}
${dietaryData.other ? `Other dietary needs: ${dietaryData.other}` : ''}

Generate specific food items that accommodate these dietary requirements. Each item should clearly serve a dietary need.

Return JSON: { "items": [{ "name": string, "quantity": number, "unit": string, "servingSize": string, "notes": string (optional) }] }`;

    return { system: systemPrompt, user: userPrompt };
  }

  // Food sections: mains, sides, desserts, drinks, other (and canonical food keys
  // like sides_salads, entree_starters, dessert, drinks_alcoholic, etc., resolved
  // via SECTION_KEY_TO_FAMILY above).
  const sectionLabel =
    family === 'other'
      ? 'miscellaneous/extras'
      : (MOMENT2_SECTION_LABELS[section] ?? family.charAt(0).toUpperCase() + family.slice(1));

  // GTC-133: prefer option-tree selections when present (new modal); fall back to
  // the legacy items/included shape (current modal). Selections are flattened to
  // a single "wanted items" list so the existing prompt scaffolding works
  // unchanged. Excluded items don't exist in the option-tree shape.
  let includedItems: string[];
  let excludedItems: string[];
  if (sectionData.selections) {
    includedItems = flattenSelections(sectionData.selections);
    excludedItems = [];
  } else {
    includedItems = (sectionData.items ?? []).filter((i) => i.included).map((i) => i.name);
    excludedItems = (sectionData.items ?? []).filter((i) => !i.included).map((i) => i.name);
  }

  // GTC-137: dietary requirements (structured + free-text) become a generation
  // constraint on every food section, not a standalone section. Aim for
  // integration ("a roasted vegetable side that's already vegetarian") rather
  // than parallel alternatives ("Mains: turkey + Vegetarian Mains: nut roast").
  const dietaryBlock =
    householdData.dietaryRequirements.length > 0
      ? `Dietary requirements present at this gathering: ${householdData.dietaryRequirements.join(', ')}.
Where this section can include items that are naturally suitable for these requirements (e.g. a roasted vegetable side that is already vegetarian, a fruit salad that is already vegan and gluten-free), prefer integrated items over parallel "alternatives". Tag items with the appropriate dietary tags. Only add a clearly separate dietary alternative if no naturally-suitable option fits the section.`
      : '';

  const userPrompt = `Generate the ${sectionLabel} section of a ${eventLabel} plan for ${householdData.totalAdults} adults and ${householdData.totalKids} children.

${dietaryBlock}
${referenceBlock}
Kate's input:
- Items she wants: ${includedItems.length > 0 ? includedItems.join(', ') : 'none specified'}
- Items she has excluded: ${excludedItems.length > 0 ? excludedItems.join(', ') : 'none'}

Generate a list of ${family === 'other' ? 'miscellaneous' : sectionLabel.toLowerCase()} appropriate for this event. Include Kate's wanted items first (with quantities), then fill in any gaps with sensible defaults.

For each item:
- Calculate quantities based on adult/kid counts
- Use real units (kg, pieces, trays, litres, bottles, bowls)
- Tag items with dietary tags (VEGETARIAN, VEGAN, GLUTEN_FREE, DAIRY_FREE, NUT_FREE) where they naturally apply

Return JSON: { "items": [{ "name": string, "quantity": number, "unit": string, "servingSize": string, "notes": string (optional), "dietaryTags": string[] (optional) }] }`;

  return { system: systemPrompt, user: userPrompt };
}

export function buildGapPrompt(
  section: string,
  eventType: string,
  householdData: Moment2HouseholdData
): { system: string; user: string } {
  const totalPeople = householdData.totalAdults + householdData.totalKids;
  const eventLabel = eventType === 'Other' ? 'event' : eventType.toLowerCase();
  const sectionLabel = MOMENT2_SECTION_LABELS[section] ?? section;

  // GTC-137: same integration guidance as buildSectionPrompt — dietary is an
  // input, not a standalone section.
  const dietaryBlock =
    householdData.dietaryRequirements.length > 0
      ? `Dietary requirements present at this gathering: ${householdData.dietaryRequirements.join(', ')}.
Prefer items that are naturally suitable for these requirements (e.g. a roasted vegetable side that is already vegetarian) over parallel "alternatives". Tag items with the appropriate dietary tags.`
      : '';

  return {
    system: `You are a meal planning assistant for a ${eventLabel}. Return only valid JSON. No prose.`,
    user: `Generate the ${sectionLabel} section for a ${eventLabel} for ${householdData.totalAdults} adults and ${householdData.totalKids} children (${totalPeople} total).

${dietaryBlock}

Generate sensible defaults for this event type. Use real units (kg, pieces, trays, litres, bottles).

Return JSON: { "items": [{ "name": string, "quantity": number, "unit": string, "servingSize": string, "notes": string (optional), "dietaryTags": string[] (optional) }] }`,
  };
}

export function buildDietaryCoveragePrompt(
  allItems: Array<{ category: string; items: Moment2GeneratedItem[] }>,
  dietaryRequirements: string[]
): { system: string; user: string } {
  const itemList = allItems
    .flatMap((c) => c.items.map((i) => `${c.category}: ${i.name}${i.notes ? ` (${i.notes})` : ''}`))
    .join('\n');

  return {
    system: 'You are a dietary requirement checker. Return only valid JSON. No prose.',
    user: `Check whether these dietary requirements are covered by the plan items.

Dietary requirements: ${dietaryRequirements.join(', ')}

Plan items:
${itemList}

For each requirement, determine if it's adequately covered.

An item that is naturally suitable for a dietary requirement (e.g. a roasted vegetable side is naturally vegetarian, a fresh fruit salad is naturally vegan and gluten-free, plain rice is naturally gluten-free and dairy-free) should be considered covered for that requirement, regardless of whether the item name or notes explicitly mention the dietary tag. Use common-sense culinary knowledge of typical preparation. Only mark a requirement as not covered when no naturally-suitable item exists across the whole plan.

Return JSON: { "coverage": [{ "requirement": string, "covered": boolean, "flaggedItems": string[] (items that cover it when covered, or items that conflict / a brief reason when not) }] }`,
  };
}

export function buildThingsToConsiderPrompt(
  eventType: string,
  totalPeople: number
): { system: string; user: string } {
  const eventLabel = eventType === 'Other' ? 'event' : eventType.toLowerCase();

  return {
    system: 'You are an event planning assistant. Return only valid JSON. No prose.',
    user: `Suggest 6-10 "things to consider" items for a ${eventLabel} for ${totalPeople} people. These are items the host might forget — napkins, ice, serving spoons, rubbish bags, etc.

Each item should include a suggested category (where it would go if added to the plan).

Return JSON: { "items": [{ "name": string, "category": string }] }`,
  };
}

/**
 * Build user prompt for selective item regeneration
 */
export function buildSelectiveRegenerationPrompt(params: {
  eventDetails: string;
  confirmedItems: Array<{
    name: string;
    team: string;
    quantity?: string;
    assignedTo?: string;
  }>;
  itemsToRegenerate: Array<{
    name: string;
    team: string;
  }>;
}): string {
  return `You are helping plan a gathering. Some items have been confirmed by the user and MUST NOT be changed.

EVENT: ${params.eventDetails}

CONFIRMED ITEMS (do not modify or duplicate these):
${params.confirmedItems.map((i) => `- ${i.team}: ${i.name}${i.quantity ? ` (${i.quantity})` : ''}${i.assignedTo ? ` (assigned to ${i.assignedTo})` : ''}`).join('\n')}

ITEMS TO REGENERATE (create new suggestions for these slots):
${params.itemsToRegenerate.map((i) => `- ${i.team}: ${i.name} (needs replacement)`).join('\n')}

Generate new items ONLY for the "to regenerate" list. Keep the same categories/teams.
Return items in the JSON format specified in the system prompt.
Do not include any confirmed items in your response.`;
}
