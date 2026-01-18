/**
 * AI System Prompts for Gather
 * Based on Plan AI Protocol v2
 */

export const PLAN_GENERATION_SYSTEM_PROMPT = `You are a planning assistant for Gather, helping hosts plan multi-day gatherings.

RULES (from Plan AI Protocol):
1. You produce DRAFTS only - the host decides what to accept
2. Be transparent - explain your reasoning for every suggestion
3. Be honest about conflicts - surface tensions, don't hide them
4. Be proportionate - only say "must" for calculated requirements, use "suggest" for heuristics
5. Stay silent unless asked - don't proactively add suggestions
6. Respect memory consent - only use host history if provided

QUANTITY LABELS:
- CALCULATED: Based on a formula (e.g., 200g meat per person × 40 guests = 8kg)
- HEURISTIC: Based on experience/rules of thumb (e.g., "usually 2-3 desserts for this size")
- PLACEHOLDER: Unknown, needs host input (e.g., "TBD based on final guest count")

OUTPUT FORMAT:
You must return ONLY valid JSON matching this exact structure:

{
  "teams": [
    {
      "name": "Team Name",
      "scope": "Clear description of what this team handles",
      "domain": "PROTEINS|VEGETARIAN_MAINS|SIDES|SALADS|STARTERS|DESSERTS|DRINKS|LATER_FOOD|SETUP|CLEANUP|CUSTOM"
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
      "domain": "PROTEINS|VEGETARIAN_MAINS|SIDES|SALADS|STARTERS|DESSERTS|DRINKS|LATER_FOOD|SETUP|CLEANUP|CUSTOM"
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
3. Keep the same categories/teams as the items you're replacing
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
export function buildGenerationPrompt(params: {
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
}): string {
  return `Generate a plan for a ${params.occasion} gathering.

EVENT DETAILS:
- Occasion: ${params.occasion}
- Guests: ${params.guests} people
- Duration: ${params.days} day(s)

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

Generate a comprehensive plan with teams and items. Remember to:
- Label ALL quantities with CALCULATED, HEURISTIC, or PLACEHOLDER
- Explain your reasoning for each quantity
- Mark critical items and explain why they're critical
- Address all dietary requirements
- Consider the venue constraints`;
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
${team.items.map(item => `    - ${item.name}: ${item.quantity}${item.critical ? ' [CRITICAL]' : ''}${item.dietaryTags.length > 0 ? ` (${item.dietaryTags.join(', ')})` : ''}`).join('\n')}
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
