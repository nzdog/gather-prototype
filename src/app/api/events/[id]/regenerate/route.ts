// POST /api/events/[id]/regenerate - Regenerate plan with modifier
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createRevision } from '@/lib/workflow';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await context.params;
    const body = await request.json();
    const { modifier = '', preserveProtected = true, actorId } = body;

    // Verify event exists
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        teams: {
          include: {
            items: true,
          },
        },
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

    // Get protected items if preserveProtected is true
    let protectedItems: any[] = [];
    if (preserveProtected) {
      protectedItems = await prisma.item.findMany({
        where: {
          team: { eventId },
          isProtected: true,
        },
      });
    }

    // Delete non-protected items and teams
    if (preserveProtected) {
      // Delete only non-protected items
      await prisma.item.deleteMany({
        where: {
          team: { eventId },
          isProtected: false,
        },
      });

      // Delete teams that have no items left
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
      // Delete all items and teams
      await prisma.item.deleteMany({
        where: { team: { eventId } },
      });
      await prisma.team.deleteMany({
        where: { eventId },
      });
    }

    // Generate new plan based on modifier
    const generatedData = await generatePlanWithModifier(event, modifier);

    // Create teams and items
    let teamsCreated = 0;
    let itemsCreated = 0;

    for (const teamData of generatedData.teams) {
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

      for (const itemData of teamData.items) {
        await prisma.item.create({
          data: {
            name: itemData.name,
            teamId: team.id,
            quantityAmount: itemData.quantityAmount,
            quantityUnit: itemData.quantityUnit as any,
            quantityState: (itemData.quantityState || 'SPECIFIED') as any,
            critical: itemData.critical || false,
            vegetarian: Boolean((itemData as any).vegetarian),
            glutenFree: Boolean((itemData as any).glutenFree),
            dairyFree: Boolean((itemData as any).dairyFree),
            source: 'GENERATED',
          },
        });

        itemsCreated++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Plan regenerated with modifier: "${modifier}"`,
      modifier,
      preservedItems: protectedItems.length,
      teamsCreated,
      itemsCreated,
      revisionId, // Include revision ID in response
    });
  } catch (error) {
    console.error('Error regenerating plan:', error);
    return NextResponse.json(
      {
        error: 'Failed to regenerate plan',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * Generate plan based on modifier
 * In production, this would call AI API
 */
async function generatePlanWithModifier(event: any, modifier: string) {
  // Parse modifier to determine what to generate
  const isVegetarianFocus = modifier.toLowerCase().includes('vegetarian');
  const isGlutenFreeFocus = modifier.toLowerCase().includes('gluten');

  const teams = [];

  // Main Dishes team
  teams.push({
    name: 'Main Dishes',
    scope: 'Responsible for main course items',
    domain: 'PROTEINS',
    items: [
      {
        name: isVegetarianFocus ? 'Vegetable Wellington' : 'Roast Turkey',
        quantityAmount: 1,
        quantityUnit: 'COUNT',
        quantityState: 'SPECIFIED',
        critical: true,
        vegetarian: isVegetarianFocus,
      },
      {
        name: 'Stuffing',
        quantityAmount: 5,
        quantityUnit: 'KG',
        quantityState: 'SPECIFIED',
        critical: false,
      },
    ],
  });

  // Add vegetarian team if modifier requests it
  if (isVegetarianFocus || event.dietaryVegetarian > 0) {
    teams.push({
      name: 'Vegetarian Options',
      scope: 'Vegetarian dishes for dietary requirements',
      domain: 'VEGETARIAN_MAINS',
      items: [
        {
          name: 'Mushroom Risotto',
          quantityAmount: 3,
          quantityUnit: 'SERVINGS',
          quantityState: 'SPECIFIED',
          critical: true,
          vegetarian: true,
        },
        {
          name: 'Grilled Vegetable Platter',
          quantityAmount: 2,
          quantityUnit: 'TRAYS',
          quantityState: 'SPECIFIED',
          critical: false,
          vegetarian: true,
        },
      ],
    });
  }

  // Add gluten-free options if modifier requests it
  if (isGlutenFreeFocus && event.dietaryGlutenFree > 0) {
    teams.push({
      name: 'Gluten-Free Options',
      scope: 'Gluten-free dishes',
      domain: 'SIDES',
      items: [
        {
          name: 'GF Bread Rolls',
          quantityAmount: event.dietaryGlutenFree,
          quantityUnit: 'COUNT',
          quantityState: 'SPECIFIED',
          critical: true,
          glutenFree: true,
        },
        {
          name: 'Rice Salad',
          quantityAmount: 1,
          quantityUnit: 'TRAYS',
          quantityState: 'SPECIFIED',
          critical: false,
          glutenFree: true,
        },
      ],
    });
  }

  // Desserts team
  teams.push({
    name: 'Desserts',
    scope: 'Sweet treats and desserts',
    domain: 'DESSERTS',
    items: [
      {
        name: 'Pavlova',
        quantityAmount: 2,
        quantityUnit: 'COUNT',
        quantityState: 'SPECIFIED',
        critical: true,
      },
      {
        name: 'Ice Cream',
        quantityAmount: 3,
        quantityUnit: 'L',
        quantityState: 'SPECIFIED',
        critical: false,
      },
    ],
  });

  return { teams };
}
