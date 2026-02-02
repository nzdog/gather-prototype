/**
 * AI Plan Generation
 * Generates gathering plans using Claude API with fallback to mock data
 */

import { callClaudeForJSON, isClaudeAvailable } from './claude';
import {
  PLAN_GENERATION_SYSTEM_PROMPT,
  PLAN_REGENERATION_SYSTEM_PROMPT,
  EXPLANATION_SYSTEM_PROMPT,
  SELECTIVE_REGENERATION_SYSTEM_PROMPT,
  buildGenerationPrompt,
  buildRegenerationPrompt,
  buildExplanationPrompt,
  buildSelectiveRegenerationPrompt,
} from './prompts';

// Type definitions for AI responses
export interface AITeam {
  name: string;
  scope: string;
  domain: string;
}

export interface AIItem {
  teamName: string;
  name: string;
  quantityAmount: number | null;
  quantityUnit: string | null;
  quantityLabel: 'CALCULATED' | 'HEURISTIC' | 'PLACEHOLDER';
  quantityReasoning: string;
  critical: boolean;
  criticalReason: string | null;
  dietaryTags: string[];
}

export interface AIPlanResponse {
  teams: AITeam[];
  items: AIItem[];
  reasoning: string;
}

export interface AIExplanationResponse {
  source: string;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
  suggestions?: string[];
}

export interface AISelectiveRegenerationResponse {
  items: AIItem[];
  reasoning: string;
}

export interface EventParams {
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
}

export interface RegenerationParams extends EventParams {
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
}

/**
 * Generate initial plan using Claude AI
 */
export async function generatePlan(params: EventParams): Promise<AIPlanResponse> {
  console.log('[AI Generate] Starting plan generation');
  console.log('[AI Generate] Params:', JSON.stringify(params, null, 2));

  // Check if Claude is available
  if (!isClaudeAvailable()) {
    console.warn('[AI Generate] Claude API not available, using fallback mock data');
    return generateMockPlan(params);
  }

  try {
    // Build prompts
    const systemPrompt = PLAN_GENERATION_SYSTEM_PROMPT;
    const userPrompt = buildGenerationPrompt(params);

    console.log('[AI Generate] Calling Claude API...');

    // Call Claude and parse response
    const response = await callClaudeForJSON<AIPlanResponse>(systemPrompt, userPrompt, {
      maxTokens: 8192,
      temperature: 1.0,
    });

    console.log('[AI Generate] Successfully generated plan');
    console.log('[AI Generate] Teams:', response.teams.length);
    console.log('[AI Generate] Items:', response.items.length);

    // Validate response structure
    validatePlanResponse(response);

    return response;
  } catch (error) {
    console.error('[AI Generate] Error generating plan with Claude:', error);
    console.warn('[AI Generate] Falling back to mock data');
    return generateMockPlan(params);
  }
}

/**
 * Regenerate plan with modifier using Claude AI
 */
export async function regeneratePlan(params: RegenerationParams): Promise<AIPlanResponse> {
  console.log('[AI Regenerate] Starting plan regeneration');
  console.log('[AI Regenerate] Modifier:', params.modifier);
  console.log('[AI Regenerate] Protected items:', params.protectedItems?.length || 0);
  console.log('[AI Regenerate] Protected teams:', params.protectedTeams?.length || 0);

  // Check if Claude is available
  if (!isClaudeAvailable()) {
    console.warn('[AI Regenerate] Claude API not available, using fallback mock data');
    return generateMockPlanWithModifier(params);
  }

  try {
    // Build prompts
    const systemPrompt = PLAN_REGENERATION_SYSTEM_PROMPT;
    const userPrompt = buildRegenerationPrompt(params);

    console.log('[AI Regenerate] Calling Claude API...');

    // Call Claude and parse response
    const response = await callClaudeForJSON<AIPlanResponse>(systemPrompt, userPrompt, {
      maxTokens: 8192,
      temperature: 1.0,
    });

    console.log('[AI Regenerate] Successfully regenerated plan');
    console.log('[AI Regenerate] Teams:', response.teams.length);
    console.log('[AI Regenerate] Items:', response.items.length);

    // Validate response structure
    validatePlanResponse(response);

    return response;
  } catch (error) {
    console.error('[AI Regenerate] Error regenerating plan with Claude:', error);
    console.warn('[AI Regenerate] Falling back to mock data');
    return generateMockPlanWithModifier(params);
  }
}

/**
 * Generate explanation using Claude AI
 */
export async function generateExplanation(conflict: {
  type: string;
  severity: string;
  claimType: string;
  description: string;
  metadata?: any;
}): Promise<AIExplanationResponse> {
  console.log('[AI Explain] Generating explanation for conflict:', conflict.type);

  // Check if Claude is available
  if (!isClaudeAvailable()) {
    console.warn('[AI Explain] Claude API not available, using fallback');
    return generateMockExplanation(conflict);
  }

  try {
    // Build prompts
    const systemPrompt = EXPLANATION_SYSTEM_PROMPT;
    const userPrompt = buildExplanationPrompt(conflict);

    console.log('[AI Explain] Calling Claude API...');

    // Call Claude and parse response
    const response = await callClaudeForJSON<AIExplanationResponse>(systemPrompt, userPrompt, {
      maxTokens: 1024,
      temperature: 0.7, // Lower temperature for more consistent explanations
    });

    console.log('[AI Explain] Successfully generated explanation');

    return response;
  } catch (error) {
    console.error('[AI Explain] Error generating explanation with Claude:', error);
    console.warn('[AI Explain] Falling back to mock explanation');
    return generateMockExplanation(conflict);
  }
}

/**
 * Generate selective items using Claude AI
 */
export async function generateSelectiveItems(
  eventId: string,
  keepItemIds: string[],
  regenerateItemIds: string[]
): Promise<AISelectiveRegenerationResponse> {
  console.log('[AI Selective] Starting selective regeneration');
  console.log('[AI Selective] Keep items:', keepItemIds.length);
  console.log('[AI Selective] Regenerate items:', regenerateItemIds.length);

  // Import prisma only when needed to avoid circular dependencies
  const { prisma } = await import('@/lib/prisma');

  // Fetch event details
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      days: true,
      teams: {
        include: {
          items: {
            include: {
              assignment: {
                include: {
                  person: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!event) {
    throw new Error('Event not found');
  }

  // Get kept items from database
  const keptItems = event.teams.flatMap((team) =>
    team.items.filter((item) => keepItemIds.includes(item.id))
  );

  // Get items to regenerate from database
  const itemsToRegenerate = event.teams.flatMap((team) =>
    team.items.filter((item) => regenerateItemIds.includes(item.id))
  );

  // Build event details string
  const eventDetails = `${event.occasionType || 'gathering'} with ${event.guestCount || 10} guests for ${event.days.length || 1} day(s)`;

  // Build confirmed items list
  const confirmedItems = keptItems.map((item) => ({
    name: item.name,
    team: event.teams.find((t) => t.id === item.teamId)?.name || 'Unknown',
    quantity:
      item.quantityAmount && item.quantityUnit
        ? `${item.quantityAmount}${item.quantityUnit}`
        : undefined,
    assignedTo: item.assignment?.person.name,
  }));

  // Build items to regenerate list
  const regenerateList = itemsToRegenerate.map((item) => ({
    name: item.name,
    team: event.teams.find((t) => t.id === item.teamId)?.name || 'Unknown',
  }));

  // Check if Claude is available
  if (!isClaudeAvailable()) {
    console.warn('[AI Selective] Claude API not available, using fallback');
    return generateMockSelectiveItems(itemsToRegenerate);
  }

  try {
    // Build prompts
    const systemPrompt = SELECTIVE_REGENERATION_SYSTEM_PROMPT;
    const userPrompt = buildSelectiveRegenerationPrompt({
      eventDetails,
      confirmedItems,
      itemsToRegenerate: regenerateList,
    });

    console.log('[AI Selective] Calling Claude API...');

    // Call Claude and parse response
    const response = await callClaudeForJSON<AISelectiveRegenerationResponse>(
      systemPrompt,
      userPrompt,
      {
        maxTokens: 2048,
        temperature: 1.0,
      }
    );

    console.log('[AI Selective] Successfully generated items');
    console.log('[AI Selective] Items:', response.items.length);

    return response;
  } catch (error) {
    console.error('[AI Selective] Error generating items with Claude:', error);
    console.warn('[AI Selective] Falling back to mock data');
    return generateMockSelectiveItems(itemsToRegenerate);
  }
}

/**
 * Validate plan response structure
 */
function validatePlanResponse(response: AIPlanResponse): void {
  if (!response.teams || !Array.isArray(response.teams)) {
    throw new Error('Invalid response: teams must be an array');
  }

  if (!response.items || !Array.isArray(response.items)) {
    throw new Error('Invalid response: items must be an array');
  }

  // Validate each team
  for (const team of response.teams) {
    if (!team.name || !team.scope) {
      throw new Error('Invalid team: name and scope are required');
    }
  }

  // Validate each item
  for (const item of response.items) {
    if (!item.teamName || !item.name) {
      throw new Error('Invalid item: teamName and name are required');
    }

    if (!item.quantityLabel) {
      throw new Error('Invalid item: quantityLabel is required');
    }

    if (!item.quantityReasoning) {
      throw new Error('Invalid item: quantityReasoning is required');
    }

    if (item.critical && !item.criticalReason) {
      // Provide a default criticalReason if missing
      console.warn(
        `[AI Validate] Critical item "${item.name}" missing criticalReason, using default`
      );
      item.criticalReason = 'Important item for the event';
    }
  }

  console.log('[AI Validate] Plan response validated successfully');
}

/**
 * Fallback: Generate mock plan when Claude is unavailable
 */
function generateMockPlan(params: EventParams): AIPlanResponse {
  console.log('[AI Mock] Generating mock plan');

  const teams: AITeam[] = [
    {
      name: 'Main Dishes',
      scope: 'Responsible for main course items',
      domain: 'PROTEINS',
    },
    {
      name: 'Sides',
      scope: 'Side dishes and accompaniments',
      domain: 'SIDES',
    },
    {
      name: 'Desserts',
      scope: 'Sweet treats and desserts',
      domain: 'DESSERTS',
    },
  ];

  const items: AIItem[] = [
    {
      teamName: 'Main Dishes',
      name: 'Roast Turkey',
      quantityAmount: Math.ceil(params.guests * 0.2),
      quantityUnit: 'KG',
      quantityLabel: 'CALCULATED',
      quantityReasoning: `Calculated at 200g per person for ${params.guests} guests`,
      critical: true,
      criticalReason: 'Main protein for the meal',
      dietaryTags: [],
    },
    {
      teamName: 'Sides',
      name: 'Roast Potatoes',
      quantityAmount: Math.ceil(params.guests * 0.15),
      quantityUnit: 'KG',
      quantityLabel: 'CALCULATED',
      quantityReasoning: `Calculated at 150g per person for ${params.guests} guests`,
      critical: false,
      criticalReason: null,
      dietaryTags: ['VEGETARIAN', 'VEGAN', 'GLUTEN_FREE'],
    },
    {
      teamName: 'Desserts',
      name: 'Pavlova',
      quantityAmount: Math.ceil(params.guests / 8),
      quantityUnit: 'COUNT',
      quantityLabel: 'HEURISTIC',
      quantityReasoning: 'Typically serves 8-10 people per pavlova',
      critical: true,
      criticalReason: 'Traditional dessert for the occasion',
      dietaryTags: ['VEGETARIAN', 'GLUTEN_FREE'],
    },
  ];

  // Add vegetarian options if needed
  if (params.dietary.vegetarian > 0) {
    items.push({
      teamName: 'Main Dishes',
      name: 'Vegetable Wellington',
      quantityAmount: params.dietary.vegetarian,
      quantityUnit: 'SERVINGS',
      quantityLabel: 'CALCULATED',
      quantityReasoning: `One serving per vegetarian guest (${params.dietary.vegetarian} guests)`,
      critical: true,
      criticalReason: 'Main dish for vegetarian guests',
      dietaryTags: ['VEGETARIAN'],
    });
  }

  return {
    teams,
    items,
    reasoning: `Mock plan generated for ${params.occasion} with ${params.guests} guests. This is fallback data because Claude API is not available.`,
  };
}

/**
 * Fallback: Generate mock plan with modifier
 */
function generateMockPlanWithModifier(params: RegenerationParams): AIPlanResponse {
  console.log('[AI Mock] Generating mock plan with modifier:', params.modifier);

  const mockPlan = generateMockPlan(params);

  // Simple modifier logic
  if (params.modifier.toLowerCase().includes('vegetarian')) {
    mockPlan.items.push({
      teamName: 'Main Dishes',
      name: 'Mushroom Risotto',
      quantityAmount: 3,
      quantityUnit: 'KG',
      quantityLabel: 'HEURISTIC',
      quantityReasoning: 'Additional vegetarian option based on modifier request',
      critical: false,
      criticalReason: null,
      dietaryTags: ['VEGETARIAN'],
    });
  }

  if (params.modifier.toLowerCase().includes('breakfast')) {
    mockPlan.teams.push({
      name: 'Breakfast',
      scope: 'Morning meals and items',
      domain: 'BREAKFAST',
    });

    mockPlan.items.push({
      teamName: 'Breakfast',
      name: 'Eggs',
      quantityAmount: params.guests * 2,
      quantityUnit: 'COUNT',
      quantityLabel: 'CALCULATED',
      quantityReasoning: '2 eggs per person for breakfast',
      critical: true,
      criticalReason: 'Main breakfast protein',
      dietaryTags: ['VEGETARIAN'],
    });
  }

  mockPlan.reasoning = `Mock plan with modifier "${params.modifier}". This is fallback data because Claude API is not available.`;

  return mockPlan;
}

/**
 * Fallback: Generate mock explanation
 */
function generateMockExplanation(conflict: any): AIExplanationResponse {
  console.log('[AI Mock] Generating mock explanation');

  const confidenceMap: Record<string, 'high' | 'medium' | 'low'> = {
    CONSTRAINT: 'high',
    RISK: 'medium',
    PATTERN: 'medium',
    PREFERENCE: 'low',
    ASSUMPTION: 'low',
  };

  return {
    source: `Mock explanation for ${conflict.type}. This is fallback data because Claude API is not available.`,
    confidence: confidenceMap[conflict.claimType] || 'medium',
    reasoning: conflict.description,
    suggestions: ['This is a mock suggestion', 'Consider reviewing the plan'],
  };
}

/**
 * Fallback: Generate mock selective items
 */
function generateMockSelectiveItems(itemsToRegenerate: any[]): AISelectiveRegenerationResponse {
  console.log('[AI Mock] Generating mock selective items');

  const mockItems: AIItem[] = itemsToRegenerate.map((item, index) => ({
    teamName: item.team?.name || 'Unknown',
    name: `Replacement ${item.name} ${index + 1}`,
    quantityAmount: 2,
    quantityUnit: 'KG',
    quantityLabel: 'HEURISTIC' as const,
    quantityReasoning: 'Mock replacement quantity',
    critical: false,
    criticalReason: null,
    dietaryTags: [],
  }));

  return {
    items: mockItems,
    reasoning:
      'Mock selective regeneration. This is fallback data because Claude API is not available.',
  };
}
