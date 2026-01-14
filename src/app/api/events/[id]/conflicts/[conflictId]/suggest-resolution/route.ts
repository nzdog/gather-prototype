// POST /api/events/[id]/conflicts/[conflictId]/suggest-resolution - Get AI resolution suggestion
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { callClaudeForJSON, isClaudeAvailable } from '@/lib/ai/claude';

// Type definitions
interface AISuggestion {
  summary: string;
  actions: string[];
  rationale: string;
  executableActions?: any[];
}

// System prompt for resolution suggestions
const RESOLUTION_SYSTEM_PROMPT = `You are an AI assistant helping to resolve conflicts in an event planning system.

When given a conflict, you need to provide:
1. A human-readable summary of the resolution
2. Specific action steps
3. A rationale for why this resolves the conflict
4. Executable actions that can be automatically implemented

You must respond with ONLY a valid JSON object (no markdown, no explanations, just the JSON).

The JSON must follow this exact structure:
{
  "summary": "string",
  "actions": ["string"],
  "rationale": "string",
  "executableActions": [...]
}

For executableActions, use CREATE_TEAM with items array for new teams, or CREATE_ITEM for adding to existing teams.`;

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; conflictId: string }> }
) {
  try {
    const { id: eventId, conflictId } = await context.params;

    // Verify conflict exists and belongs to event
    const conflict = await prisma.conflict.findUnique({
      where: { id: conflictId },
    });

    if (!conflict) {
      return NextResponse.json({ error: 'Conflict not found' }, { status: 404 });
    }

    if (conflict.eventId !== eventId) {
      return NextResponse.json(
        { error: 'Conflict does not belong to this event' },
        { status: 403 }
      );
    }

    // Get event details for context
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        teams: {
          include: {
            items: true,
            members: true,
          },
        },
        days: true,
      },
    });

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Check if Claude is available
    if (!isClaudeAvailable()) {
      console.warn('[AI Resolution] Claude API not available, using fallback');
      return NextResponse.json({
        suggestion: generateFallbackSuggestion(conflict),
        rawResponse: 'Claude API not available',
      });
    }

    // Build prompts
    const systemPrompt = RESOLUTION_SYSTEM_PROMPT;
    const userPrompt = buildResolutionPrompt(conflict, event);

    console.log('[AI Resolution] Calling Claude API...');

    // Call Claude and parse JSON response
    const suggestion = await callClaudeForJSON<AISuggestion>(systemPrompt, userPrompt, {
      maxTokens: 2000,
      temperature: 0.7,
    });

    console.log('[AI Resolution] Successfully generated resolution');
    console.log('[AI Resolution] Executable Actions Count:', suggestion.executableActions?.length || 0);

    return NextResponse.json({
      suggestion,
      rawResponse: JSON.stringify(suggestion, null, 2),
    });
  } catch (error) {
    console.error('Error generating resolution suggestion:', error);
    return NextResponse.json(
      { error: 'Failed to generate resolution suggestion' },
      { status: 500 }
    );
  }
}

function buildResolutionPrompt(conflict: any, event: any): string {
  const conflictInfo = `
Conflict Type: ${conflict.type}
Severity: ${conflict.severity}
Title: ${conflict.title}
Description: ${conflict.description}

Event Details:
- Occasion: ${event.occasionType}
- Guest Count: ${event.guestCount || 'Unknown'}
- Dietary Requirements: ${event.dietaryVegan} vegetarian, ${event.dietaryVegan} vegan, ${event.dietaryGlutenFree} gluten-free, ${event.dietaryDairyFree} dairy-free
- Venue: ${event.venueName || 'Unknown'}
- Kitchen: ${event.venueOvenCount} oven(s), ${event.venueStoretopBurners || 0} burners

Current Teams: ${event.teams.map((t: any) => `${t.name} (id: ${t.id}, ${t.items.length} items)`).join(', ')}
`;

  return `You are helping resolve a conflict in an event planning system. You need to provide BOTH a human-readable summary AND executable actions that will be automatically implemented.

${conflictInfo}

Please respond with a JSON object in this exact format:

{
  "summary": "Brief 1-2 sentence summary of what will be done",
  "actions": [
    "Human readable action step 1",
    "Human readable action step 2"
  ],
  "rationale": "1-2 sentences explaining why this resolves the conflict",
  "executableActions": [
    // OPTION 1: Add items to existing team
    {
      "type": "CREATE_ITEM",
      "teamId": "existing_team_id_from_above",
      "data": {
        "name": "Specific item name",
        "description": "What this item is",
        "critical": false,
        "quantityAmount": 4,
        "quantityUnit": "SERVINGS",
        "vegetarian": true,
        "glutenFree": false,
        "dairyFree": false
      }
    },
    // OPTION 2: Create new team WITH items
    {
      "type": "CREATE_TEAM",
      "data": {
        "name": "Team Name",
        "scope": "What this team handles",
        "domain": "PROTEINS|SIDES|DESSERTS|DRINKS|STARTERS|CUSTOM",
        "items": [
          {
            "name": "Specific item name 1",
            "description": "What this item is",
            "critical": false,
            "quantityAmount": 4,
            "quantityUnit": "SERVINGS",
            "vegetarian": true,
            "glutenFree": false,
            "dairyFree": false
          },
          {
            "name": "Specific item name 2",
            "description": "What this item is",
            "critical": false,
            "quantityAmount": 4,
            "quantityUnit": "SERVINGS",
            "vegetarian": true,
            "glutenFree": false,
            "dairyFree": false
          }
        ]
      }
    }
  ]
}

CRITICAL REQUIREMENTS:
- For dietary gaps: If no suitable team exists, use CREATE_TEAM with 2-3 complete item objects in the "items" array
- For dietary gaps: If a suitable team exists, use multiple CREATE_ITEM actions (one per item needed)
- For coverage gaps: Always use CREATE_TEAM with "domain" field and 2-3 complete items in the "items" array
- ALL items MUST have: name, description, quantityAmount, quantityUnit, and dietary flags
- For vegetarian items: set "vegetarian": true (covers vegan too)
- For gluten-free items: set "glutenFree": true
- For dairy-free items: set "dairyFree": true
- Available dietary flags: vegetarian, glutenFree, dairyFree (no vegan field)
- QuantityUnit options: "SERVINGS", "KG", "G", "L", "ML", "COUNT"

Examples:
- Vegetarian gap: CREATE_TEAM with domain "PROTEINS" or null, include 2 vegetarian main dishes with vegetarian:true
- Coverage gap (missing DESSERTS): CREATE_TEAM with domain "DESSERTS", include 2-3 dessert items

Return ONLY the JSON object, no markdown formatting, no other text.`;
}

/**
 * Generate fallback suggestion when Claude is not available
 */
function generateFallbackSuggestion(conflict: any): AISuggestion {
  console.log('[AI Resolution] Generating fallback suggestion');

  return {
    summary: 'Add appropriate items to resolve this conflict.',
    actions: ['Review the conflict details and make necessary adjustments'],
    rationale: 'This will address the identified gap in the plan.',
    executableActions: [],
  };
}
