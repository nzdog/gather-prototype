// POST /api/events/[id]/regenerate - Regenerate plan with modifier
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createRevision } from '@/lib/workflow';
import { regeneratePlan, RegenerationParams } from '@/lib/ai/generate';
import { randomBytes } from 'crypto';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: eventId } = await context.params;
    const body = await request.json();
    const { modifier = '', preserveProtected = true, actorId, preGeneratedPlan } = body;

    // Verify event exists and get all details
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        teams: {
          include: {
            items: true,
          },
        },
        days: true,
      },
    });

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // PHASE 6: Create revision before regeneration to preserve pre-regenerate state
    let revisionId: string | null = null;
    if (actorId) {
      try {
        revisionId = await createRevision(
          eventId,
          actorId,
          `Before regeneration: ${modifier || 'no modifier'}`
        );
      } catch (revisionError) {
        console.error('Warning: Failed to create pre-regeneration revision:', revisionError);
        // Continue with regeneration even if revision fails
      }
    }

    // RULE A: Selective regeneration - preserve host-added and host-edited items
    // Get items to preserve (host-added, host-edited, or explicitly protected)
    let preservedItems: any[] = [];
    if (preserveProtected) {
      preservedItems = await prisma.item.findMany({
        where: {
          team: { eventId },
          OR: [
            { source: 'MANUAL' }, // Host-added items
            { source: 'HOST_EDITED' }, // Host-edited items (preserve customizations)
            { isProtected: true }, // Explicitly protected items (backward compatibility)
          ],
        },
        include: {
          team: true,
        },
      });

      console.log('[Regenerate] Rule A - Preserving items:', {
        total: preservedItems.length,
        manual: preservedItems.filter((i) => i.source === 'MANUAL').length,
        hostEdited: preservedItems.filter((i) => i.source === 'HOST_EDITED').length,
        protected: preservedItems.filter((i) => i.isProtected).length,
      });

      // Delete only GENERATED items (safe to overwrite)
      const deleteResult = await prisma.item.deleteMany({
        where: {
          team: { eventId },
          source: 'GENERATED', // Only delete AI-generated items that haven't been edited
          isProtected: false, // Don't delete protected items even if generated
        },
      });

      console.log('[Regenerate] Rule A - Deleted GENERATED items:', deleteResult.count);

      // Delete teams that have no items left and are not protected
      const teams = await prisma.team.findMany({
        where: { eventId },
        include: { _count: { select: { items: true } } },
      });

      for (const team of teams) {
        if (team._count.items === 0 && !team.isProtected) {
          await prisma.team.delete({ where: { id: team.id } });
        }
      }
    } else {
      // Delete all items and teams (preserveProtected=false means full regeneration)
      await prisma.item.deleteMany({
        where: { team: { eventId } },
      });
      await prisma.team.deleteMany({
        where: { eventId },
      });
    }

    // Build regeneration parameters for AI
    const regenerationParams: RegenerationParams = {
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
      },
      days: event.days.length || 1,
      modifier,
      protectedItems: preservedItems.map((item: any) => ({
        name: item.name,
        team: item.team?.name || 'Unknown',
        quantity: item.quantityText || `${item.quantityAmount} ${item.quantityUnit}`,
      })),
    };

    // Use pre-generated plan if provided (from preview), otherwise call AI
    let aiResponse;
    if (preGeneratedPlan) {
      console.log('[Regenerate] Using pre-generated plan from preview');
      aiResponse = preGeneratedPlan;
    } else {
      console.log(
        '[Regenerate] Calling AI with params:',
        JSON.stringify(regenerationParams, null, 2)
      );

      // Generate new plan using Claude AI
      aiResponse = await regeneratePlan(regenerationParams);

      console.log('[Regenerate] AI response received:', {
        teams: aiResponse.teams.length,
        items: aiResponse.items.length,
      });
    }

    // Generate a unique batch ID for this regeneration run
    const generatedBatchId = `regen_${randomBytes(16).toString('hex')}`;
    console.log('[Regenerate] Batch ID:', generatedBatchId);

    // Create teams and items
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
      const teamItems = aiResponse.items.filter((item: any) => item.teamName === teamData.name);

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
          },
        });

        itemsCreated++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Plan regenerated with Claude AI: "${modifier}"`,
      modifier,
      preservedItems: preservedItems.length,
      preservedBreakdown: {
        manual: preservedItems.filter((i) => i.source === 'MANUAL').length,
        hostEdited: preservedItems.filter((i) => i.source === 'HOST_EDITED').length,
        protected: preservedItems.filter((i) => i.isProtected).length,
      },
      teamsCreated,
      itemsCreated,
      revisionId,
      reasoning: aiResponse.reasoning,
    });
  } catch (error) {
    console.error('[Regenerate] Error regenerating plan:', error);
    return NextResponse.json(
      {
        error: 'Failed to regenerate plan',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
