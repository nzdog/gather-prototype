import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUser } from '@/lib/auth/session';

/**
 * GET /api/memory
 *
 * Get Host memory summary (events stored, patterns learned, defaults set).
 * SECURITY: Now uses session authentication instead of query param
 */
export async function GET(_request: NextRequest) {
  // SECURITY: Require authenticated user session
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const hostId = user.id; // Use authenticated user's ID

  // Get or create HostMemory
  let hostMemory = await prisma.hostMemory.findUnique({
    where: { hostId },
    include: {
      patterns: true,
      defaults: true,
      dismissedSuggestions: true,
    },
  });

  if (!hostMemory) {
    // Create with default settings (learningEnabled: false, aggregateContributionConsent: false)
    hostMemory = await prisma.hostMemory.create({
      data: {
        hostId,
        learningEnabled: false,
        aggregateContributionConsent: false,
        useHistoryByDefault: false,
      },
      include: {
        patterns: true,
        defaults: true,
        dismissedSuggestions: true,
      },
    });
  }

  // Count events stored (completed events by this host)
  const completedEventsCount = await prisma.event.count({
    where: {
      hostId,
      status: 'COMPLETE',
    },
  });

  // Count templates saved
  const templatesCount = await prisma.structureTemplate.count({
    where: {
      hostId,
      templateSource: 'HOST',
    },
  });

  return NextResponse.json({
    hostMemory,
    stats: {
      completedEvents: completedEventsCount,
      templatesSaved: templatesCount,
      patternsLearned: hostMemory.patterns.length,
      defaultsSet: hostMemory.defaults.length,
    },
  });
}

/**
 * DELETE /api/memory
 *
 * Delete all Host memory.
 * Creates a DeletionReceipt for transparency.
 * SECURITY: Now uses session authentication instead of query param
 */
export async function DELETE(_request: NextRequest) {
  // SECURITY: Require authenticated user session
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const hostId = user.id; // Use authenticated user's ID

  const hostMemory = await prisma.hostMemory.findUnique({
    where: { hostId },
    include: {
      patterns: true,
      defaults: true,
      dismissedSuggestions: true,
    },
  });

  if (!hostMemory) {
    return NextResponse.json({ error: 'Host memory not found' }, { status: 404 });
  }

  // Collect IDs for deletion receipt
  const patternIds = hostMemory.patterns.map((p) => p.id);
  const defaultIds = hostMemory.defaults.map((d) => d.id);
  const dismissedIds = hostMemory.dismissedSuggestions.map((d) => d.id);

  // Delete templates
  await prisma.structureTemplate.deleteMany({
    where: {
      hostId,
      templateSource: 'HOST',
    },
  });

  // Delete quantities profiles
  await prisma.quantitiesProfile.deleteMany({
    where: { hostId },
  });

  // Delete host memory (cascades to patterns, defaults, dismissedSuggestions)
  await prisma.hostMemory.delete({
    where: { hostId },
  });

  // Create deletion receipt
  const receipt = await prisma.deletionReceipt.create({
    data: {
      hostId,
      deletedAt: new Date(),
      scope: 'ALL',
      targetIds: {
        patterns: patternIds,
        defaults: defaultIds,
        dismissedSuggestions: dismissedIds,
      },
      derivedArtifactsRemoved: true,
      aggregateContributionPurged: hostMemory.aggregateContributionConsent,
    },
  });

  return NextResponse.json({
    message: 'Host memory deleted successfully',
    receipt,
  });
}
