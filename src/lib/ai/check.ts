/**
 * AI Conflict Detection
 * Detects timing conflicts, dietary gaps, and coverage gaps
 */

import { PrismaClient, Item, Event, Team, ConflictType, ConflictSeverity, ClaimType, ResolutionClass } from '@prisma/client';

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
  suggestion?: any;
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
          items: {
            include: {
              day: true,
            },
          },
        },
      },
      days: true,
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
      affectedItems: criticalPlaceholders.map(i => i.id),
      suggestion: {
        action: 'specify_quantities',
        items: criticalPlaceholders.map(i => ({
          id: i.id,
          name: i.name,
          currentQuantity: i.quantityText,
        })),
      },
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
  const ovenItems = await prisma.item.findMany({
    where: {
      team: { eventId: event.id },
      equipmentNeeds: { not: null },
    },
  });

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
        affectedItems: items.map(i => i.id),
        equipment: 'oven',
        timeSlot,
        capacityAvailable: ovenCapacity,
        capacityRequired: items.length,
        suggestion: {
          action: 'adjust_timing',
          options: [
            'Stagger cooking times',
            'Use alternative cooking methods (BBQ, stovetop)',
            'Prepare some items in advance',
          ],
        },
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
        suggestion: {
          action: 'add_items',
          dietaryType: 'vegetarian',
          suggestions: [
            'Vegetable lasagna',
            'Mushroom wellington',
            'Vegetarian curry',
            'Grilled vegetable platter',
          ],
        },
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
        suggestion: {
          action: 'add_items',
          dietaryType: 'gluten-free',
          suggestions: [
            'GF bread/buns',
            'Rice-based dishes',
            'Naturally GF proteins',
            'GF dessert options',
          ],
        },
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

    const presentDomains = new Set(teams.map(t => t.domain).filter(Boolean));
    const missing = expected.filter(d => !presentDomains.has(d));

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
        suggestion: {
          action: 'add_teams',
          missingDomains: missing,
          recommendations: missing.map(domain => ({
            domain,
            teamName: `${domain.charAt(0) + domain.slice(1).toLowerCase()}`,
          })),
        },
      });
    }
  }

  return conflicts;
}

/**
 * Save or update conflicts in database
 */
export async function saveConflicts(eventId: string, conflicts: ConflictData[]): Promise<void> {
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
          suggestion: conflict.suggestion as any,
        },
      });
    } else if (existing.status === 'OPEN') {
      // Update existing open conflict with new data
      await prisma.conflict.update({
        where: { id: existing.id },
        data: {
          description: conflict.description,
          affectedItems: conflict.affectedItems as any,
          affectedDays: conflict.affectedDays as any,
          suggestion: conflict.suggestion as any,
        },
      });
    }
    // Don't update resolved/dismissed conflicts
  }
}
