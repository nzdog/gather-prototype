import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/memory?hostId={hostId}
 *
 * Get Host memory summary (events stored, patterns learned, defaults set).
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const hostId = searchParams.get('hostId');

  if (!hostId) {
    return NextResponse.json({ error: 'hostId is required' }, { status: 400 });
  }

  // Get or create HostMemory
  let hostMemory = await prisma.hostMemory.findUnique({
    where: { hostId },
    include: {
      patterns: true,
      defaults: true,
      dismissedSuggestions: true
    }
  });

  if (!hostMemory) {
    // Create with default settings (learningEnabled: false, aggregateContributionConsent: false)
    hostMemory = await prisma.hostMemory.create({
      data: {
        hostId,
        learningEnabled: false,
        aggregateContributionConsent: false,
        useHistoryByDefault: false
      },
      include: {
        patterns: true,
        defaults: true,
        dismissedSuggestions: true
      }
    });
  }

  // Count events stored (completed events by this host)
  const completedEventsCount = await prisma.event.count({
    where: {
      hostId,
      status: 'COMPLETE'
    }
  });

  // Count templates saved
  const templatesCount = await prisma.structureTemplate.count({
    where: {
      hostId,
      templateSource: 'HOST'
    }
  });

  return NextResponse.json({
    hostMemory,
    stats: {
      completedEvents: completedEventsCount,
      templatesSaved: templatesCount,
      patternsLearned: hostMemory.patterns.length,
      defaultsSet: hostMemory.defaults.length
    }
  });
}

/**
 * DELETE /api/memory?hostId={hostId}
 *
 * Delete all Host memory.
 * Creates a DeletionReceipt for transparency.
 */
export async function DELETE(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const hostId = searchParams.get('hostId');

  if (!hostId) {
    return NextResponse.json({ error: 'hostId is required' }, { status: 400 });
  }

  const hostMemory = await prisma.hostMemory.findUnique({
    where: { hostId },
    include: {
      patterns: true,
      defaults: true,
      dismissedSuggestions: true
    }
  });

  if (!hostMemory) {
    return NextResponse.json({ error: 'Host memory not found' }, { status: 404 });
  }

  // Collect IDs for deletion receipt
  const patternIds = hostMemory.patterns.map(p => p.id);
  const defaultIds = hostMemory.defaults.map(d => d.id);
  const dismissedIds = hostMemory.dismissedSuggestions.map(d => d.id);

  // Delete templates
  await prisma.structureTemplate.deleteMany({
    where: {
      hostId,
      templateSource: 'HOST'
    }
  });

  // Delete quantities profiles
  await prisma.quantitiesProfile.deleteMany({
    where: { hostId }
  });

  // Delete host memory (cascades to patterns, defaults, dismissedSuggestions)
  await prisma.hostMemory.delete({
    where: { hostId }
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
        dismissedSuggestions: dismissedIds
      },
      derivedArtifactsRemoved: true,
      aggregateContributionPurged: hostMemory.aggregateContributionConsent
    }
  });

  return NextResponse.json({
    message: 'Host memory deleted successfully',
    receipt
  });
}
