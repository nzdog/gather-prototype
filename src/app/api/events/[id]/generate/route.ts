// POST /api/events/[id]/generate - Generate plan with AI
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  generatePlan,
  generateSelectiveItems,
  findMissingTeamNames,
  EventParams,
} from '@/lib/ai/generate';
import { resolveGeneratedTeamCoordinatorId } from '@/lib/ai/coordinator-assignment';
import { randomBytes } from 'crypto';
import { requireEventRole } from '@/lib/auth/guards';

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: eventId } = await context.params;

    // SECURITY: Require HOST role for AI generation (high-cost operation)
    const auth = await requireEventRole(eventId, ['HOST']);
    if (auth instanceof NextResponse) return auth;

    // Parse request body to check for selective regeneration and host description
    const body = await _request.json().catch(() => ({}));
    const { keepItemIds, regenerateItemIds, hostDescription } = body as {
      keepItemIds?: string[];
      regenerateItemIds?: string[];
      hostDescription?: string;
    };

    // Verify event exists and get all details
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        days: true,
      },
    });

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Handle selective regeneration
    if (keepItemIds && regenerateItemIds) {
      // Generate new items for the selected items
      const aiResponse = await generateSelectiveItems(eventId, keepItemIds, regenerateItemIds);

      // Validate all AI-generated team names before touching the DB.
      // An unresolvable team name (e.g. 'Unknown' from the mock, or an invented name from Claude)
      // previously caused items to be silently dropped, returning success with 0 items.
      const existingTeams = await prisma.team.findMany({
        where: { eventId },
        select: { name: true },
      });
      const existingTeamNames = existingTeams.map((t) => t.name);
      const missingTeamNames = findMissingTeamNames(aiResponse.items, existingTeamNames);

      if (missingTeamNames.length > 0) {
        console.error(
          '[Generate] AI returned items with unresolvable team names:',
          missingTeamNames
        );
        return NextResponse.json(
          {
            error: 'Regeneration failed: AI returned items for teams that do not exist',
            missingTeamNames,
          },
          { status: 422 }
        );
      }

      // Update kept items to set aiGenerated: true (but NOT userConfirmed yet - wait until final confirmation)
      await prisma.item.updateMany({
        where: {
          id: { in: keepItemIds },
        },
        data: {
          aiGenerated: true,
          userConfirmed: false, // Keep them in review mode until final confirmation
        },
      });

      // Delete items marked for regeneration
      await prisma.item.deleteMany({
        where: {
          id: { in: regenerateItemIds },
        },
      });

      // Insert new AI-generated items
      let itemsCreated = 0;
      const generatedBatchId = `gen_${randomBytes(16).toString('hex')}`;

      for (const itemData of aiResponse.items) {
        // Find the team by name using the pre-fetched map (all names already validated above)
        const team = await prisma.team.findFirst({
          where: {
            eventId,
            name: itemData.teamName,
          },
        });

        if (!team) {
          // Should never reach here after the upfront validation, but guard defensively
          console.error(`[Generate] Team not found after validation: ${itemData.teamName}`);
          continue;
        }

        // Determine quantity state and text
        let quantityState: 'SPECIFIED' | 'PLACEHOLDER';
        let quantityText: string | null = null;

        if (itemData.quantityLabel === 'PLACEHOLDER') {
          quantityState = 'PLACEHOLDER';
          quantityText = itemData.quantityReasoning;
        } else {
          quantityState = 'SPECIFIED';
        }

        await prisma.item.create({
          data: {
            name: itemData.name,
            teamId: team.id,
            quantityAmount: itemData.quantityAmount,
            quantityUnit: itemData.quantityUnit as any,
            quantityState,
            quantityText,
            quantityLabel: itemData.quantityLabel,
            notes: itemData.quantityReasoning,
            critical: itemData.critical,
            criticalReason: itemData.criticalReason,
            vegetarian: itemData.dietaryTags.includes('VEGETARIAN'),
            glutenFree: itemData.dietaryTags.includes('GLUTEN_FREE'),
            dairyFree: itemData.dietaryTags.includes('DAIRY_FREE'),
            source: 'GENERATED',
            generatedBatchId,
            placeholderAcknowledged: false,
            aiGenerated: true,
            userConfirmed: false,
          },
        });

        itemsCreated++;
      }

      return NextResponse.json({
        success: true,
        message: 'Items regenerated successfully',
        kept: keepItemIds.length,
        regenerated: itemsCreated,
        reasoning: aiResponse.reasoning,
      });
    }

    // Build event parameters for AI
    const eventParams: EventParams = {
      occasion: event.occasionType || 'gathering',
      guests: event.guestCount || 10,
      dietary: {
        vegetarian: event.dietaryVegetarian || 0,
        glutenFree: event.dietaryGlutenFree || 0,
        dairyFree: event.dietaryDairyFree || 0,
        nutFree: 0, // Not tracked separately in schema
        other: event.dietaryAllergies || undefined,
      },
      venue: {
        name: event.venueName || 'Unknown venue',
        ovenCount: event.venueOvenCount || undefined,
        bbqAvailable: event.venueBbqAvailable || undefined,
        fridgeSpace: undefined, // Not in schema
      },
      days: event.days.length || 1,
    };

    // Generate plan using Claude AI
    const aiResponse = await generatePlan(eventParams, hostDescription);

    // Generate a unique batch ID for this generation run
    const generatedBatchId = `gen_${randomBytes(16).toString('hex')}`;

    // Log any items that won't be saved due to teamName mismatch
    const allTeamNames = aiResponse.teams.map((t) => t.name);
    const unmatchedItems = aiResponse.items.filter((item) => !allTeamNames.includes(item.teamName));
    if (unmatchedItems.length > 0) {
      console.warn(
        `[Generate] ${unmatchedItems.length} items dropped due to teamName mismatch:`,
        unmatchedItems.map((i) => `"${i.name}" (teamName: "${i.teamName}")`).slice(0, 5)
      );
    }

    // Create teams and items in database
    let teamsCreated = 0;
    let itemsCreated = 0;

    for (let i = 0; i < aiResponse.teams.length; i++) {
      const teamData = aiResponse.teams[i];
      const team = await prisma.team.create({
        data: {
          name: teamData.name,
          scope: teamData.scope,
          domain: teamData.domain as any,
          eventId,
          coordinatorId: resolveGeneratedTeamCoordinatorId(),
          source: 'GENERATED',
          displayOrder: i + 1,
        },
      });

      teamsCreated++;

      // Create items for this team
      const teamItems = aiResponse.items.filter((item) => item.teamName === teamData.name);

      for (const itemData of teamItems) {
        // Determine quantity state and text
        let quantityState: 'SPECIFIED' | 'PLACEHOLDER';
        let quantityText: string | null = null;

        if (itemData.quantityLabel === 'PLACEHOLDER') {
          quantityState = 'PLACEHOLDER';
          quantityText = itemData.quantityReasoning;
        } else {
          quantityState = 'SPECIFIED';
        }

        await prisma.item.create({
          data: {
            name: itemData.name,
            teamId: team.id,
            quantityAmount: itemData.quantityAmount,
            quantityUnit: itemData.quantityUnit as any,
            quantityState,
            quantityText,
            quantityLabel: itemData.quantityLabel,
            notes: itemData.quantityReasoning, // Store reasoning in notes
            critical: itemData.critical,
            criticalReason: itemData.criticalReason,
            vegetarian: itemData.dietaryTags.includes('VEGETARIAN'),
            glutenFree: itemData.dietaryTags.includes('GLUTEN_FREE'),
            dairyFree: itemData.dietaryTags.includes('DAIRY_FREE'),
            source: 'GENERATED',
            generatedBatchId,
            placeholderAcknowledged: false,
            aiGenerated: true,
            userConfirmed: false,
          },
        });

        itemsCreated++;
      }
    }

    // If Claude returned items but none were created, team names in items don't match
    // the team names in the teams array. Surface this as a 422 rather than silent success.
    if (itemsCreated === 0 && aiResponse.items.length > 0) {
      const missingTeamNames = findMissingTeamNames(aiResponse.items, allTeamNames);
      console.error('[Generate] Item mismatch: 0 items created despite AI returning items', {
        aiItemCount: aiResponse.items.length,
        missingTeamNames,
      });
      return NextResponse.json(
        {
          error:
            'Plan generation failed: AI returned items with team names that do not match any created team. Please try again.',
          missingTeamNames,
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Plan generated successfully with Claude AI',
      teams: teamsCreated,
      items: itemsCreated,
      reasoning: aiResponse.reasoning,
    });
  } catch (error) {
    console.error('[Generate] Error generating plan:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate plan',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
