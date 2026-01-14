// POST /api/events/[id]/regenerate/preview - Preview regeneration changes without applying
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { regeneratePlan, RegenerationParams } from '@/lib/ai/generate';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: eventId } = await context.params;
    const body = await request.json();
    const { modifier = '', preserveProtected = true } = body;

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

    // Capture current plan (what would be replaced)
    const currentPlanTeams = await prisma.team.findMany({
      where: {
        eventId,
        source: 'GENERATED',
      },
      include: {
        items: {
          where: {
            source: 'GENERATED',
          },
        },
      },
    });

    // Transform to format expected by AI
    const currentPlan = currentPlanTeams.map((team) => ({
      teamName: team.name,
      teamScope: team.scope || '',
      teamDomain: team.domain || 'CUSTOM',
      items: team.items.map((item) => ({
        name: item.name,
        quantity: item.quantityText || `${item.quantityAmount} ${item.quantityUnit}`,
        critical: item.critical,
        dietaryTags: [
          item.vegetarian ? 'VEGETARIAN' : '',
          item.glutenFree ? 'GLUTEN_FREE' : '',
          item.dairyFree ? 'DAIRY_FREE' : '',
        ].filter(Boolean),
      })),
    }));

    // Get items to preserve (host-added, host-edited, or explicitly protected)
    let preservedItems: any[] = [];
    if (preserveProtected) {
      preservedItems = await prisma.item.findMany({
        where: {
          team: { eventId },
          OR: [
            { source: 'MANUAL' },
            { source: 'HOST_EDITED' },
            { isProtected: true },
          ],
        },
        include: {
          team: true,
        },
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
        nutFree: 0,
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
      currentPlan,
    };

    console.log('[Preview] Calling AI with params for preview');

    // Generate new plan using Claude AI (without saving)
    const aiResponse = await regeneratePlan(regenerationParams);

    console.log('[Preview] AI response received:', {
      teams: aiResponse.teams.length,
      items: aiResponse.items.length,
    });

    // Format the response to show what will change
    const preview = {
      current: {
        teams: currentPlan.map((team) => ({
          name: team.teamName,
          scope: team.teamScope,
          domain: team.teamDomain,
          itemCount: team.items.length,
          items: team.items,
        })),
        totalTeams: currentPlan.length,
        totalItems: currentPlan.reduce((sum, team) => sum + team.items.length, 0),
      },
      proposed: {
        teams: aiResponse.teams.map((team) => ({
          name: team.name,
          scope: team.scope,
          domain: team.domain,
          itemCount: aiResponse.items.filter((item) => item.teamName === team.name).length,
          items: aiResponse.items.filter((item) => item.teamName === team.name),
        })),
        totalTeams: aiResponse.teams.length,
        totalItems: aiResponse.items.length,
      },
      preserved: {
        items: preservedItems.map((item: any) => ({
          name: item.name,
          team: item.team?.name || 'Unknown',
          quantity: item.quantityText || `${item.quantityAmount} ${item.quantityUnit}`,
          source: item.source,
        })),
        count: preservedItems.length,
      },
      modifier,
      reasoning: aiResponse.reasoning,
    };

    return NextResponse.json({
      success: true,
      preview,
      aiResponse: {
        teams: aiResponse.teams,
        items: aiResponse.items,
        reasoning: aiResponse.reasoning,
      },
    });
  } catch (error) {
    console.error('[Preview] Error generating preview:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate preview',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
