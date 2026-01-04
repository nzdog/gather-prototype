import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/templates/[id]/clone
 *
 * Clone template to new event.
 * Compares parameters (guest count) and offers quantity scaling if QuantitiesProfile exists.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json();
  const {
    hostId,
    eventName,
    startDate,
    endDate,
    guestCount,
    applyQuantityScaling = false,
    occasionType,
  } = body;

  if (!hostId || !eventName || !startDate || !endDate) {
    return NextResponse.json(
      {
        error: 'hostId, eventName, startDate, and endDate are required',
      },
      { status: 400 }
    );
  }

  // Fetch the template
  const template = await prisma.structureTemplate.findUnique({
    where: { id: params.id },
  });

  if (!template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  // If it's a host template, verify ownership
  if (template.templateSource === 'HOST' && template.hostId !== hostId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // Get host person
  const host = await prisma.person.findUnique({
    where: { id: hostId },
  });

  if (!host) {
    return NextResponse.json({ error: 'Host not found' }, { status: 404 });
  }

  // Look for QuantitiesProfile if scaling is requested
  let quantitiesProfile = null;
  let scalingRatio = 1;

  if (applyQuantityScaling && guestCount) {
    quantitiesProfile = await prisma.quantitiesProfile.findFirst({
      where: {
        hostId,
        occasionType: template.occasionType,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (quantitiesProfile) {
      const derivedFrom = quantitiesProfile.derivedFrom as any;
      const baseGuestCount =
        derivedFrom?.guestCount || (quantitiesProfile.ratios as any)?.baseGuestCount;

      if (baseGuestCount) {
        scalingRatio = guestCount / baseGuestCount;
      }
    }
  }

  // Create new event
  const event = await prisma.event.create({
    data: {
      name: eventName,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      guestCount: guestCount || null,
      occasionType: occasionType || template.occasionType,
      status: 'DRAFT',
      hostId,
      generationPath: 'TEMPLATE',
      clonedFromId: template.createdFrom || null,
    },
  });

  // Create days from template
  const teamsData = template.teams as any[];
  const daysData = template.days as any[];

  const dayMap = new Map<string, string>();

  for (const dayData of daysData) {
    const day = await prisma.day.create({
      data: {
        name: dayData.name,
        date: new Date(startDate), // Default to start date, host can adjust
        eventId: event.id,
      },
    });
    dayMap.set(dayData.name, day.id);
  }

  // Create teams and items from template
  let firstTeamId: string | null = null;

  for (const teamData of teamsData) {
    // First coordinator is the host by default
    const team = await prisma.team.create({
      data: {
        name: teamData.name,
        scope: teamData.scope,
        domain: teamData.domain,
        displayOrder: teamData.displayOrder || 0,
        source: 'TEMPLATE',
        eventId: event.id,
        coordinatorId: hostId, // Host is initial coordinator
      },
    });

    // Store first team ID for PersonEvent creation
    if (!firstTeamId) {
      firstTeamId = team.id;
    }

    // Create items
    for (const itemData of teamData.items) {
      let quantityAmount = null;
      let quantityUnit = null;
      let quantityText = null;

      // Apply quantity scaling if requested
      if (applyQuantityScaling && quantitiesProfile) {
        const itemQuantities = quantitiesProfile.itemQuantities as any[];
        const matchingQuantity = itemQuantities.find((q: any) => q.itemName === itemData.name);

        if (matchingQuantity) {
          quantityAmount = matchingQuantity.quantity * scalingRatio;
          quantityUnit = matchingQuantity.unit;
          quantityText = `${quantityAmount} ${quantityUnit}`;
        }
      }

      await prisma.item.create({
        data: {
          name: itemData.name,
          description: itemData.description,
          critical: itemData.critical,
          criticalReason: itemData.criticalReason,
          dietaryTags: itemData.dietaryTags,
          equipmentNeeds: itemData.equipmentNeeds,
          quantityAmount,
          quantityUnit,
          quantityText,
          quantityDerivedFromTemplate: applyQuantityScaling && quantityAmount !== null,
          source: 'TEMPLATE',
          teamId: team.id,
          status: 'UNASSIGNED',
        },
      });
    }
  }

  // Create PersonEvent for host (only one per event, assigned to first team)
  if (firstTeamId) {
    await prisma.personEvent.create({
      data: {
        personId: hostId,
        eventId: event.id,
        teamId: firstTeamId,
        role: 'HOST',
      },
    });
  }

  return NextResponse.json({
    eventId: event.id,
    event,
    scalingApplied: applyQuantityScaling,
    scalingRatio: applyQuantityScaling ? scalingRatio : null,
    message: 'Template cloned successfully',
  });
}
