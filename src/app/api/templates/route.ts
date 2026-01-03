import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/templates?hostId={hostId}
 *
 * Returns Host's saved templates.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const hostId = searchParams.get('hostId');

  if (!hostId) {
    return NextResponse.json({ error: 'hostId is required' }, { status: 400 });
  }

  const templates = await prisma.structureTemplate.findMany({
    where: {
      hostId,
      templateSource: 'HOST'
    },
    orderBy: {
      createdAt: 'desc'
    }
  });

  return NextResponse.json({ templates });
}

/**
 * POST /api/templates
 *
 * Create template from completed event.
 * Extracts structure (teams, items, days) but NOT dates, assignments, acknowledgements, or quantities.
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { hostId, eventId, name } = body;

  if (!hostId || !eventId || !name) {
    return NextResponse.json({ error: 'hostId, eventId, and name are required' }, { status: 400 });
  }

  // Fetch the event with all structure
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      teams: {
        include: {
          items: true
        }
      },
      days: true
    }
  });

  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  if (event.hostId !== hostId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // Extract structure template data (names, scopes, domains - NO dates, assignments, quantities)
  const teamsData = event.teams.map(team => ({
    name: team.name,
    scope: team.scope,
    domain: team.domain,
    displayOrder: team.displayOrder,
    items: team.items.map(item => ({
      name: item.name,
      description: item.description,
      dietaryTags: item.dietaryTags,
      equipmentNeeds: item.equipmentNeeds,
      critical: item.critical,
      criticalReason: item.criticalReason,
      // Do NOT include: quantity, assignments, acknowledgements
    }))
  }));

  const daysData = event.days.map(day => ({
    name: day.name,
    // Do NOT include: date (that's event-specific)
  }));

  // Create StructureTemplate
  const template = await prisma.structureTemplate.create({
    data: {
      hostId,
      templateSource: 'HOST',
      name,
      occasionType: event.occasionType || 'OTHER',
      teams: teamsData,
      items: [], // Items are nested in teams
      days: daysData,
      createdFrom: eventId
    }
  });

  // Optionally create QuantitiesProfile if guestCountConfidence is HIGH or MEDIUM
  let quantitiesProfile = null;
  if (event.guestCount && (event.guestCountConfidence === 'HIGH' || event.guestCountConfidence === 'MEDIUM')) {
    // Extract quantity ratios
    const allItems = event.teams.flatMap(t => t.items);
    const itemQuantities = allItems
      .filter(item => item.quantityAmount !== null)
      .map(item => ({
        itemName: item.name,
        quantity: item.quantityAmount,
        unit: item.quantityUnit,
        scalingRule: 'LINEAR', // Simple linear scaling by default
      }));

    const ratios = {
      baseGuestCount: event.guestCount,
      // Could derive ratios like proteinPerPerson, drinksPerPerson here
      // For now, just store the base guest count
    };

    quantitiesProfile = await prisma.quantitiesProfile.create({
      data: {
        hostId,
        occasionType: event.occasionType || 'OTHER',
        derivedFrom: { eventId, guestCount: event.guestCount },
        ratios,
        itemQuantities,
        overrides: {}
      }
    });
  }

  return NextResponse.json({
    template,
    quantitiesProfile,
    message: 'Template created successfully'
  });
}
