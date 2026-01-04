// GET /api/events/[id]/summary
// Returns plan summary for transition modal

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: eventId } = await context.params;

    // Get team count
    const teamCount = await prisma.team.count({
      where: { eventId },
    });

    // Get item counts
    const itemCount = await prisma.item.count({
      where: {
        team: { eventId },
      },
    });

    const criticalItemCount = await prisma.item.count({
      where: {
        team: { eventId },
        critical: true,
      },
    });

    const criticalAssignedCount = await prisma.item.count({
      where: {
        team: { eventId },
        critical: true,
        assignment: {
          isNot: null,
        },
      },
    });

    const criticalUnassignedCount = criticalItemCount - criticalAssignedCount;

    // Get acknowledged conflicts count
    const acknowledgedConflictsCount = await prisma.conflict.count({
      where: {
        eventId,
        severity: 'CRITICAL',
        status: 'ACKNOWLEDGED',
      },
    });

    // Get critical items with placeholder quantities
    const criticalPlaceholderCount = await prisma.item.count({
      where: {
        team: { eventId },
        critical: true,
        quantityState: 'PLACEHOLDER',
        placeholderAcknowledged: false,
      },
    });

    return NextResponse.json({
      teamCount,
      itemCount,
      criticalItemCount,
      criticalAssignedCount,
      criticalUnassignedCount,
      acknowledgedConflictsCount,
      criticalPlaceholderCount,
    });
  } catch (error) {
    console.error('Error fetching event summary:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch event summary',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
