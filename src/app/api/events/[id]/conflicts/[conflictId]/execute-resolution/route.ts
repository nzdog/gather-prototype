// POST /api/events/[id]/conflicts/[conflictId]/execute-resolution - Execute AI resolution actions
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEventRole } from '@/lib/auth/guards';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; conflictId: string }> }
) {
  try {
    const { id: eventId, conflictId } = await context.params;

    // SECURITY: Require HOST role for conflict operations
    const auth = await requireEventRole(eventId, ['HOST']);
    if (auth instanceof NextResponse) return auth;
    const body = await request.json();
    const { executableActions } = body;

    if (!executableActions || !Array.isArray(executableActions)) {
      return NextResponse.json({ error: 'No executable actions provided' }, { status: 400 });
    }

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

    const results = [];

    // Execute each action
    for (const action of executableActions) {
      try {
        const result = await executeAction(eventId, action);
        results.push({ success: true, action: action.type, result });
      } catch (error) {
        console.error(`Error executing action ${action.type}:`, error);
        results.push({
          success: false,
          action: action.type,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Mark conflict as resolved after successful execution
    await prisma.conflict.update({
      where: { id: conflictId },
      data: {
        status: 'RESOLVED',
        resolvedBy: 'AI_ASSISTANT',
        resolvedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      results,
      message: `Successfully executed ${results.filter((r) => r.success).length} of ${results.length} actions`,
    });
  } catch (error) {
    console.error('Error executing resolution:', error);
    return NextResponse.json({ error: 'Failed to execute resolution' }, { status: 500 });
  }
}

async function executeAction(eventId: string, action: any): Promise<any> {
  switch (action.type) {
    case 'CREATE_ITEM':
      return await createItem(eventId, action);

    case 'CREATE_TEAM':
      return await createTeam(eventId, action);

    case 'UPDATE_ITEM':
      return await updateItem(eventId, action);

    default:
      throw new Error(`Unknown action type: ${action.type}`);
  }
}

async function createItem(eventId: string, action: any): Promise<any> {
  const { teamId, data } = action;

  // Verify team exists and belongs to event
  const team = await prisma.team.findFirst({
    where: { id: teamId, eventId },
  });

  if (!team) {
    throw new Error(`Team ${teamId} not found or does not belong to this event`);
  }

  // Create the item
  const item = await prisma.item.create({
    data: {
      teamId,
      name: data.name,
      description: data.description || null,
      critical: data.critical || false,
      quantityState: 'SPECIFIED',
      quantityAmount: data.quantityAmount || null,
      quantityUnit: data.quantityUnit || 'SERVINGS',
      vegetarian: data.vegetarian || false,
      glutenFree: data.glutenFree || false,
      dairyFree: data.dairyFree || false,
      source: 'GENERATED',
    },
  });

  return { itemId: item.id, itemName: item.name, teamName: team.name };
}

async function createTeam(eventId: string, action: any): Promise<any> {
  const { data } = action;

  // Get the event's host as the default coordinator
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { hostId: true },
  });

  if (!event) {
    throw new Error('Event not found');
  }

  // Create the team
  const team = await prisma.team.create({
    data: {
      eventId,
      name: data.name,
      scope: data.scope || `Handles ${data.name.toLowerCase()}`,
      domain: data.domain || null,
      coordinatorId: event.hostId,
      source: 'GENERATED',
    },
  });

  // Create initial items if provided
  const createdItems = [];
  if (data.items && Array.isArray(data.items)) {
    for (const itemData of data.items) {
      const item = await prisma.item.create({
        data: {
          teamId: team.id,
          name: itemData.name,
          description: itemData.description || null,
          critical: itemData.critical || false,
          quantityState: 'SPECIFIED',
          quantityAmount: itemData.quantityAmount || null,
          quantityUnit: itemData.quantityUnit || 'SERVINGS',
          vegetarian: itemData.vegetarian || false,
          glutenFree: itemData.glutenFree || false,
          dairyFree: itemData.dairyFree || false,
          source: 'GENERATED',
        },
      });
      createdItems.push({ id: item.id, name: item.name });
    }
  }

  return {
    teamId: team.id,
    teamName: team.name,
    itemsCreated: createdItems.length,
    items: createdItems,
  };
}

async function updateItem(eventId: string, action: any): Promise<any> {
  const { itemId, data } = action;

  // Verify item exists and belongs to event
  const item = await prisma.item.findFirst({
    where: {
      id: itemId,
      team: { eventId }
    },
    include: {
      team: true,
    },
  });

  if (!item) {
    throw new Error(`Item ${itemId} not found or does not belong to this event`);
  }

  // Build update data object
  const updateData: any = {};

  // Only update fields that are provided
  if (data.serveTime !== undefined) {
    updateData.serveTime = data.serveTime;
  }
  if (data.equipmentNeeds !== undefined) {
    updateData.equipmentNeeds = data.equipmentNeeds;
  }
  if (data.prepStartTime !== undefined) {
    updateData.prepStartTime = data.prepStartTime;
  }
  if (data.prepEndTime !== undefined) {
    updateData.prepEndTime = data.prepEndTime;
  }

  // Update the item
  const updatedItem = await prisma.item.update({
    where: { id: itemId },
    data: updateData,
  });

  return {
    itemId: updatedItem.id,
    itemName: updatedItem.name,
    teamName: item.team.name,
    updates: Object.keys(updateData),
  };
}
