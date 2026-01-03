import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * PATCH /api/memory/settings
 *
 * Update learningEnabled, aggregateContributionConsent settings.
 * Follows Theme 6 consent posture:
 * - Host memory ON by default with clear disclosure
 * - Aggregate contribution OFF by default, requires explicit opt-in
 */
export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { hostId, learningEnabled, aggregateContributionConsent, useHistoryByDefault } = body;

  if (!hostId) {
    return NextResponse.json({ error: 'hostId is required' }, { status: 400 });
  }

  // Get or create HostMemory
  let hostMemory = await prisma.hostMemory.findUnique({
    where: { hostId }
  });

  if (!hostMemory) {
    // Create with provided settings or defaults
    hostMemory = await prisma.hostMemory.create({
      data: {
        hostId,
        learningEnabled: learningEnabled ?? false,
        aggregateContributionConsent: aggregateContributionConsent ?? false,
        useHistoryByDefault: useHistoryByDefault ?? false
      }
    });
  } else {
    // Update settings
    const updateData: any = {};

    if (learningEnabled !== undefined) {
      updateData.learningEnabled = learningEnabled;
    }

    if (aggregateContributionConsent !== undefined) {
      updateData.aggregateContributionConsent = aggregateContributionConsent;
    }

    if (useHistoryByDefault !== undefined) {
      updateData.useHistoryByDefault = useHistoryByDefault;
    }

    hostMemory = await prisma.hostMemory.update({
      where: { hostId },
      data: updateData
    });
  }

  return NextResponse.json({
    hostMemory,
    message: 'Settings updated successfully'
  });
}
