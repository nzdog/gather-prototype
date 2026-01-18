// POST /api/events/[id]/generate - Generate plan with AI
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generatePlan, generateSelectiveItems, EventParams } from '@/lib/ai/generate';
import { randomBytes } from 'crypto';

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: eventId } = await context.params;

    // Parse request body to check for selective regeneration
    const body = await _request.json().catch(() => ({}));
    const { keepItemIds, regenerateItemIds } = body as {
      keepItemIds?: string[];
      regenerateItemIds?: string[];
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
      console.log('[Generate] Selective regeneration requested');
      console.log('[Generate] Keep items:', keepItemIds.length);
      console.log('[Generate] Regenerate items:', regenerateItemIds.length);

      // Generate new items for the selected items
      const aiResponse = await generateSelectiveItems(eventId, keepItemIds, regenerateItemIds);

      console.log('[Generate] AI selective response received:', {
        items: aiResponse.items.length,
      });

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
        // Find the team by name
        const team = await prisma.team.findFirst({
          where: {
            eventId,
            name: itemData.teamName,
          },
        });

        if (!team) {
          console.warn(`[Generate] Team not found: ${itemData.teamName}, skipping item`);
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

      console.log('[Generate] Selective regeneration complete:', {
        kept: keepItemIds.length,
        regenerated: itemsCreated,
      });

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

    console.log('[Generate] Calling AI with params:', JSON.stringify(eventParams, null, 2));

    // Generate plan using Claude AI
    const aiResponse = await generatePlan(eventParams);

    console.log('[Generate] AI response received:', {
      teams: aiResponse.teams.length,
      items: aiResponse.items.length,
    });

    // Generate a unique batch ID for this generation run
    const generatedBatchId = `gen_${randomBytes(16).toString('hex')}`;
    console.log('[Generate] Batch ID:', generatedBatchId);

    // Create teams and items in database
    let teamsCreated = 0;
    let itemsCreated = 0;

    for (const teamData of aiResponse.teams) {
      const team = await prisma.team.create({
        data: {
          name: teamData.name,
          scope: teamData.scope,
          domain: teamData.domain as any,
          eventId,
          coordinatorId: event.hostId,
          source: 'GENERATED',
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

    console.log('[Generate] Successfully created:', { teamsCreated, itemsCreated });

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
