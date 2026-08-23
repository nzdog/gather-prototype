/**
 * AI Conflict Detection
 * Detects timing conflicts, dietary gaps, and coverage gaps
 */

import {
  PrismaClient,
  Item,
  ConflictType,
  ConflictSeverity,
  ClaimType,
  ResolutionClass,
} from '@prisma/client';

const prisma = new PrismaClient();

interface ConflictData {
  fingerprint: string;
  type: ConflictType;
  severity: ConflictSeverity;
  claimType: ClaimType;
  resolutionClass: ResolutionClass;
  title: string;
  description: string;
  affectedItems?: string[];
  affectedDays?: string[];
  equipment?: string;
  timeSlot?: string;
  capacityAvailable?: number;
  capacityRequired?: number;
  dietaryType?: string;
  guestCount?: number;
  category?: string;
  currentCoverage?: number;
  minimumNeeded?: number;
  affectedParties?: string[];
  canDelegate?: boolean;
}

/**
 * Detect all conflicts for an event
 */
export async function detectConflicts(eventId: string): Promise<ConflictData[]> {
  const conflicts: ConflictData[] = [];

  // Get event with all related data
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      teams: {
        include: {
          coordinator: true,
          items: {
            include: {
              day: true,
              assignment: true,
            },
          },
        },
      },
      days: true,
      setup: true,
    },
  });

  if (!event) {
    throw new Error('Event not found');
  }

  // 1. Detect placeholder quantity conflicts
  const placeholderConflicts = await detectPlaceholderConflicts(event);
  conflicts.push(...placeholderConflicts);

  // 2. Detect timing conflicts (oven/equipment overlaps)
  const timingConflicts = await detectTimingConflicts(event);
  conflicts.push(...timingConflicts);

  // 3. Detect dietary gaps
  const dietaryConflicts = await detectDietaryGaps(event);
  conflicts.push(...dietaryConflicts);

  // 4. Detect coverage gaps (missing expected domains)
  const coverageConflicts = await detectCoverageGaps(event);
  conflicts.push(...coverageConflicts);

  // 5. Detect teams without coordinators
  const coordinatorConflicts = await detectMissingCoordinators(event);
  conflicts.push(...coordinatorConflicts);

  // 6. Detect items with no assignee
  const unassignedConflicts = await detectUnassignedItems(event);
  conflicts.push(...unassignedConflicts);

  return conflicts;
}

/**
 * Detect critical items with placeholder quantities
 */
async function detectPlaceholderConflicts(event: any): Promise<ConflictData[]> {
  const conflicts: ConflictData[] = [];

  const criticalPlaceholders = await prisma.item.findMany({
    where: {
      team: { eventId: event.id },
      critical: true,
      quantityState: 'PLACEHOLDER',
      placeholderAcknowledged: false,
    },
  });

  if (criticalPlaceholders.length > 0) {
    conflicts.push({
      fingerprint: `placeholder-quantities-${event.id}`,
      type: 'QUANTITY_MISSING',
      severity: 'CRITICAL',
      claimType: 'CONSTRAINT',
      resolutionClass: 'DECISION_REQUIRED',
      title: 'Critical Items Have Placeholder Quantities',
      description: `${criticalPlaceholders.length} critical item(s) have placeholder quantities that need to be specified or acknowledged before transitioning.`,
      affectedItems: criticalPlaceholders.map((i) => i.id),
    });
  }

  return conflicts;
}

/**
 * Detect timing conflicts (equipment overlaps)
 */
async function detectTimingConflicts(event: any): Promise<ConflictData[]> {
  const conflicts: ConflictData[] = [];

  // Get items that need oven and have timing info
  const allItems = await prisma.item.findMany({
    where: {
      team: { eventId: event.id },
    },
  });

  // Filter items that have equipment needs
  const ovenItems = allItems.filter((item) => item.equipmentNeeds !== null);

  // Group by time slot and check oven capacity
  const ovenCapacity = event.venueOvenCount || 1;
  const timeSlots = new Map<string, Item[]>();

  for (const item of ovenItems) {
    const equipment = item.equipmentNeeds as any;
    if (equipment && equipment.oven && item.serveTime) {
      const timeKey = item.serveTime;
      if (!timeSlots.has(timeKey)) {
        timeSlots.set(timeKey, []);
      }
      timeSlots.get(timeKey)!.push(item);
    }
  }

  // Check for conflicts
  for (const [timeSlot, items] of timeSlots.entries()) {
    if (items.length > ovenCapacity) {
      conflicts.push({
        fingerprint: `timing-oven-${event.id}-${timeSlot}`,
        type: 'TIMING',
        severity: 'SIGNIFICANT',
        claimType: 'CONSTRAINT',
        resolutionClass: 'FIX_IN_PLAN',
        title: 'Oven Capacity Exceeded',
        description: `${items.length} items need the oven at ${timeSlot}, but only ${ovenCapacity} oven(s) available.`,
        affectedItems: items.map((i) => i.id),
        equipment: 'oven',
        timeSlot,
        capacityAvailable: ovenCapacity,
        capacityRequired: items.length,
      });
    }
  }

  return conflicts;
}

/**
 * Detect dietary gaps
 */
async function detectDietaryGaps(event: any): Promise<ConflictData[]> {
  const conflicts: ConflictData[] = [];

  // Check vegetarian coverage
  if (event.dietaryVegetarian > 0) {
    const vegetarianItems = await prisma.item.findMany({
      where: {
        team: { eventId: event.id },
        vegetarian: true,
      },
    });

    if (vegetarianItems.length === 0) {
      conflicts.push({
        fingerprint: `dietary-vegetarian-${event.id}`,
        type: 'DIETARY_GAP',
        severity: 'CRITICAL',
        claimType: 'CONSTRAINT',
        resolutionClass: 'FIX_IN_PLAN',
        title: 'No Vegetarian Options',
        description: `Event has ${event.dietaryVegetarian} vegetarian guest(s) but no vegetarian items in the plan.`,
        dietaryType: 'vegetarian',
        guestCount: event.dietaryVegetarian,
        currentCoverage: 0,
        minimumNeeded: 1,
      });
    }
  }

  // Check gluten-free coverage
  if (event.dietaryGlutenFree > 0) {
    const gfItems = await prisma.item.findMany({
      where: {
        team: { eventId: event.id },
        glutenFree: true,
      },
    });

    if (gfItems.length === 0) {
      conflicts.push({
        fingerprint: `dietary-gluten-free-${event.id}`,
        type: 'DIETARY_GAP',
        severity: 'CRITICAL',
        claimType: 'CONSTRAINT',
        resolutionClass: 'FIX_IN_PLAN',
        title: 'No Gluten-Free Options',
        description: `Event has ${event.dietaryGlutenFree} gluten-free guest(s) but no gluten-free items in the plan.`,
        dietaryType: 'gluten-free',
        guestCount: event.dietaryGlutenFree,
        currentCoverage: 0,
        minimumNeeded: 1,
      });
    }
  }

  return conflicts;
}

/**
 * Detect coverage gaps (missing expected domains for occasion)
 */
async function detectCoverageGaps(event: any): Promise<ConflictData[]> {
  const conflicts: ConflictData[] = [];

  // Define expected domains for different occasion types
  const expectedDomains: Record<string, string[]> = {
    CHRISTMAS: ['PROTEINS', 'SIDES', 'DESSERTS', 'DRINKS'],
    THANKSGIVING: ['PROTEINS', 'SIDES', 'DESSERTS', 'DRINKS'],
    BIRTHDAY: ['DESSERTS', 'DRINKS'],
    WEDDING: ['PROTEINS', 'SIDES', 'DESSERTS', 'DRINKS', 'STARTERS'],
  };

  if (event.occasionType && expectedDomains[event.occasionType]) {
    const expected = expectedDomains[event.occasionType];

    const teams = await prisma.team.findMany({
      where: { eventId: event.id },
      select: { domain: true },
    });

    const presentDomains = new Set(teams.map((t) => t.domain).filter(Boolean) as string[]);
    const missing = expected.filter((d) => !presentDomains.has(d));

    if (missing.length > 0) {
      conflicts.push({
        fingerprint: `coverage-domains-${event.id}`,
        type: 'COVERAGE_GAP',
        severity: 'SIGNIFICANT',
        claimType: 'PATTERN',
        resolutionClass: 'FIX_IN_PLAN',
        title: 'Missing Expected Food Categories',
        description: `For a ${event.occasionType} event, typically you'd have: ${missing.join(', ')}. Currently missing from the plan.`,
        category: event.occasionType,
      });
    }
  }

  return conflicts;
}

/**
 * Detect teams without coordinators
 */
async function detectMissingCoordinators(event: any): Promise<ConflictData[]> {
  const conflicts: ConflictData[] = [];

  // Check each team for a coordinator
  const teamsWithoutCoordinators = event.teams.filter((team: any) => {
    // GTC-171 (B2): task teams ("Set up" / "Clean up" / "Other jobs") hold only day-of
    // job rows and are host-assigned by design — they have no coordinator scope, so
    // flagging them would emit a permanent, unfixable conflict card on every check.
    const hasItemRows = (team.items ?? []).some((item: any) => item.kind === 'ITEM');
    if (!hasItemRows) return false;

    // A team needs a coordinator if it exists
    return !team.coordinator || !team.coordinatorId;
  });

  for (const team of teamsWithoutCoordinators) {
    conflicts.push({
      fingerprint: `missing-coordinator-${event.id}-${team.id}`,
      type: 'STRUCTURAL_IMBALANCE',
      severity: 'SIGNIFICANT',
      claimType: 'PATTERN',
      resolutionClass: 'FIX_IN_PLAN',
      title: `Team "${team.name}" Needs a Coordinator`,
      description: `The "${team.name}" team doesn't have a coordinator assigned. Each team should have a coordinator to manage responsibilities and track progress.`,
      affectedParties: [team.name],
    });
  }

  return conflicts;
}

/**
 * Detect all items with no assignee
 */
async function detectUnassignedItems(event: any): Promise<ConflictData[]> {
  const conflicts: ConflictData[] = [];

  for (const team of event.teams) {
    for (const item of team.items) {
      if (!item.assignment) {
        const isCritical = item.critical === true;
        conflicts.push({
          fingerprint: `unassigned-item-${event.id}-${item.id}`,
          type: 'QUANTITY_MISSING',
          severity: isCritical ? 'CRITICAL' : 'ADVISORY',
          claimType: 'RISK',
          resolutionClass: 'FIX_IN_PLAN',
          title: `"${item.name}" has no assignee`,
          description: isCritical
            ? `This item is marked critical but hasn't been assigned to anyone. It may not get brought to the event.`
            : `This item hasn't been assigned to anyone.`,
          affectedParties: [team.name],
          canDelegate: false,
        });
      }
    }
  }

  return conflicts;
}

/**
 * Save or update conflicts in database
 */
export async function saveConflicts(eventId: string, conflicts: ConflictData[]): Promise<void> {
  // Clean up legacy unassigned-critical-item fingerprints
  await prisma.conflict.updateMany({
    where: {
      eventId,
      fingerprint: { startsWith: 'unassigned-critical-item-' },
      status: { in: ['OPEN', 'ACKNOWLEDGED', 'DELEGATED'] },
    },
    data: {
      status: 'RESOLVED',
      resolvedAt: new Date(),
      resolvedBy: 'system',
    },
  });

  for (const conflict of conflicts) {
    const existing = await prisma.conflict.findFirst({
      where: {
        eventId,
        fingerprint: conflict.fingerprint,
      },
    });

    if (!existing) {
      await prisma.conflict.create({
        data: {
          eventId,
          ...conflict,
          affectedItems: conflict.affectedItems as any,
          affectedDays: conflict.affectedDays as any,
          affectedParties: conflict.affectedParties as any,
        },
      });
    } else if (
      existing.status === 'OPEN' ||
      existing.status === 'ACKNOWLEDGED' ||
      existing.status === 'DELEGATED'
    ) {
      // Update existing active conflict with new data
      await prisma.conflict.update({
        where: { id: existing.id },
        data: {
          description: conflict.description,
          affectedItems: conflict.affectedItems as any,
          affectedDays: conflict.affectedDays as any,
          affectedParties: conflict.affectedParties as any,
        },
      });
    } else if (existing.status === 'RESOLVED' || existing.status === 'DISMISSED') {
      // Reopen previously resolved/dismissed conflicts if they're detected again
      await prisma.conflict.update({
        where: { id: existing.id },
        data: {
          status: 'OPEN',
          description: conflict.description,
          affectedItems: conflict.affectedItems as any,
          affectedDays: conflict.affectedDays as any,
          affectedParties: conflict.affectedParties as any,
          resolvedBy: null,
          resolvedAt: null,
          dismissedAt: null,
          delegatedTo: null,
          delegatedAt: null,
        },
      });
    }
  }

  // Auto-resolve active conflicts that were not detected in this check run
  const detectedFingerprints = conflicts.map((c) => c.fingerprint);

  await prisma.conflict.updateMany({
    where: {
      eventId,
      status: { in: ['OPEN', 'ACKNOWLEDGED', 'DELEGATED'] },
      fingerprint: { notIn: detectedFingerprints },
    },
    data: {
      status: 'RESOLVED',
      resolvedAt: new Date(),
      resolvedBy: 'system',
    },
  });
}
