import { prisma } from './prisma';
import type { Item, Assignment, Person, EventStatus, Prisma } from '@prisma/client';

// Type for items with assignment + person included
type ItemWithAssignmentAndPerson = Item & {
  assignment: (Assignment & { person: Person }) | null;
};

// Use Prisma's built-in transaction client type
type Tx = Prisma.TransactionClient;

/**
 * Computes team status from assignment data directly.
 * Does NOT use cached Item.status - queries assignment existence.
 * Use this in all GET routes. Pure synchronous function.
 *
 * CRITICAL: This is SYNCHRONOUS (no async/await)
 */
export function computeTeamStatusFromItems(
  items: ItemWithAssignmentAndPerson[]
): 'SORTED' | 'GAP' | 'CRITICAL_GAP' {
  const hasCriticalGap = items.some(i => i.critical && i.assignment === null);
  const hasGap = items.some(i => i.assignment === null);

  if (hasCriticalGap) return 'CRITICAL_GAP';
  if (hasGap) return 'GAP';
  return 'SORTED';
}

/**
 * Repairs Item.status to match Assignment existence.
 * ONLY call this after assignment mutations, within the same transaction.
 *
 * CRITICAL: Call this AFTER creating or deleting assignments.
 * Do NOT call this in GET routes (no mutations in GET).
 */
export async function repairItemStatusAfterMutation(
  tx: Tx,
  itemId: string
): Promise<void> {
  const item = await tx.item.findUnique({
    where: { id: itemId },
    include: { assignment: true }
  });

  if (!item) return;

  const shouldBe = item.assignment !== null ? 'ASSIGNED' : 'UNASSIGNED';

  if (item.status !== shouldBe) {
    await tx.item.update({
      where: { id: itemId },
      data: { status: shouldBe },
    });
  }
}

/**
 * Returns true if event can be frozen.
 * Freeze blocked if ANY critical item lacks assignment.
 * Queries Assignment directly, NOT Item.status.
 *
 * CRITICAL: This queries assignment: null, NOT Item.status.
 * The freeze gate is safety-critical and must not trust cached state.
 */
export async function canFreeze(eventId: string): Promise<boolean> {
  const criticalUnassignedCount = await prisma.item.count({
    where: {
      team: { eventId },
      critical: true,
      assignment: null,
    },
  });

  return criticalUnassignedCount === 0;
}

/**
 * Returns the count of critical items blocking freeze.
 * Used for UI messaging ("Cannot freeze: N critical gaps").
 *
 * CRITICAL: Queries assignment: null, NOT Item.status.
 */
export async function getCriticalGapCount(eventId: string): Promise<number> {
  return prisma.item.count({
    where: {
      team: { eventId },
      critical: true,
      assignment: null,
    },
  });
}

/**
 * Validates event status transitions.
 * State machine from spec Section 6:
 *   DRAFT → CONFIRMING : Always allowed
 *   CONFIRMING → FROZEN : Blocked if critical gaps (checked separately)
 *   FROZEN → CONFIRMING : Allowed (override, logged)
 *   FROZEN → COMPLETE : Allowed
 *   COMPLETE → * : Never allowed
 */
export function canTransition(fromStatus: EventStatus, toStatus: EventStatus): boolean {
  if (fromStatus === toStatus) return true;
  if (fromStatus === 'COMPLETE') return false;

  const validTransitions: Record<EventStatus, EventStatus[]> = {
    DRAFT: ['CONFIRMING'],
    CONFIRMING: ['FROZEN'],
    FROZEN: ['CONFIRMING', 'COMPLETE'],
    COMPLETE: []
  };

  return validTransitions[fromStatus].includes(toStatus);
}

/**
 * Mutation gating from spec Section 6 MUTATION_RULES.
 *
 * @param eventStatus - Current event status
 * @param action - The mutation action to check
 * @param itemCritical - For deleteItem action, whether the item is critical
 * @returns true if mutation is allowed
 */
export function canMutate(
  eventStatus: EventStatus,
  action: 'createItem' | 'editItem' | 'deleteItem' | 'assignItem' | 'addPerson' | 'removePerson',
  itemCritical?: boolean
): boolean {
  if (eventStatus === 'COMPLETE') return false;
  if (eventStatus === 'FROZEN') return false;

  if (eventStatus === 'CONFIRMING') {
    if (action === 'deleteItem' && itemCritical) {
      return false;
    }
    return true;
  }

  // DRAFT: all mutations allowed
  return true;
}

/**
 * Audit helper: logs action to AuditEntry within transaction.
 *
 * CRITICAL: All audit logging must happen inside transactions.
 */
export async function logAudit(
  tx: Tx,
  params: {
    eventId: string;
    actorId: string;
    actionType: string;
    targetType: string;
    targetId: string;
    details?: string;
  }
): Promise<void> {
  await tx.auditEntry.create({
    data: {
      eventId: params.eventId,
      actorId: params.actorId,
      actionType: params.actionType,
      targetType: params.targetType,
      targetId: params.targetId,
      details: params.details || '',
      timestamp: new Date()
    }
  });
}

/**
 * Removes a person from an event.
 * Appends person.name to previouslyAssignedTo (human-readable).
 * Logs REMOVE_PERSON and UNASSIGN_ITEM audit entries.
 *
 * CRITICAL: Must be called in exact order:
 * 1. Log REMOVE_PERSON
 * 2. For each assignment:
 *    a. Update item (set previouslyAssignedTo)
 *    b. Delete assignment
 *    c. Repair item status
 *    d. Log UNASSIGN_ITEM
 * 3. Delete access tokens
 * 4. Delete PersonEvent
 *
 * @param personId - The person to remove
 * @param eventId - The event context
 * @param actorId - The person performing the removal (for audit logging)
 */
export async function removePerson(
  personId: string,
  eventId: string,
  actorId: string
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const person = await tx.person.findUnique({
      where: { id: personId },
      select: { name: true }
    });

    if (!person) throw new Error('Person not found');

    // Log REMOVE_PERSON action first
    await logAudit(tx, {
      eventId,
      actorId,
      actionType: 'REMOVE_PERSON',
      targetType: 'PersonEvent',
      targetId: personId,
      details: `Removed person ${person.name} from event`
    });

    const assignments = await tx.assignment.findMany({
      where: {
        personId,
        item: { team: { eventId } }
      },
      include: { item: true }
    });

    for (const assignment of assignments) {
      // Update item: set previouslyAssignedTo
      await tx.item.update({
        where: { id: assignment.itemId },
        data: {
          previouslyAssignedTo: assignment.item.previouslyAssignedTo
            ? `${assignment.item.previouslyAssignedTo}, ${person.name}`
            : person.name,
        }
      });

      // Delete assignment
      await tx.assignment.delete({
        where: { id: assignment.id }
      });

      // Repair Item.status after assignment deletion
      await repairItemStatusAfterMutation(tx, assignment.itemId);

      // Log UNASSIGN_ITEM action for each item
      await logAudit(tx, {
        eventId,
        actorId,
        actionType: 'UNASSIGN_ITEM',
        targetType: 'Item',
        targetId: assignment.itemId,
        details: `Unassigned item due to removing person ${person.name}`
      });
    }

    await tx.accessToken.deleteMany({
      where: { personId, eventId }
    });

    await tx.personEvent.deleteMany({
      where: { personId, eventId }
    });
  });
}

// ============================================
// PHASE 4: GATE CHECK & TRANSITION
// ============================================

export type GateBlockCode =
  | 'CRITICAL_CONFLICT_UNACKNOWLEDGED'
  | 'CRITICAL_PLACEHOLDER_UNACKNOWLEDGED'
  | 'STRUCTURAL_MINIMUM_TEAMS'
  | 'STRUCTURAL_MINIMUM_ITEMS'
  | 'UNSAVED_DRAFT_CHANGES';

export interface GateBlock {
  code: GateBlockCode;
  reason: string;
  count?: number;
  resolution?: string;
}

export interface GateCheckResult {
  passed: boolean;
  blocks: GateBlock[];
}

/**
 * Runs the gate check to determine if event can transition to CONFIRMING.
 * Only 5 blocking codes per Section 5.1:
 * - CRITICAL_CONFLICT_UNACKNOWLEDGED
 * - CRITICAL_PLACEHOLDER_UNACKNOWLEDGED
 * - STRUCTURAL_MINIMUM_TEAMS
 * - STRUCTURAL_MINIMUM_ITEMS
 * - UNSAVED_DRAFT_CHANGES
 *
 * @param eventId - Event to check
 * @returns GateCheckResult with passed boolean and array of blocks
 */
export async function runGateCheck(eventId: string): Promise<GateCheckResult> {
  const blocks: GateBlock[] = [];

  // Check 1: CRITICAL_CONFLICT_UNACKNOWLEDGED
  // Critical conflicts that have no acknowledgements
  const criticalConflictsWithoutAck = await prisma.conflict.count({
    where: {
      eventId,
      severity: 'CRITICAL',
      status: {
        in: ['OPEN', 'DELEGATED'] // Not resolved or dismissed
      },
      acknowledgements: {
        none: {} // No acknowledgements at all
      }
    }
  });

  if (criticalConflictsWithoutAck > 0) {
    blocks.push({
      code: 'CRITICAL_CONFLICT_UNACKNOWLEDGED',
      reason: `${criticalConflictsWithoutAck} critical conflict(s) must be acknowledged before transitioning`,
      count: criticalConflictsWithoutAck,
      resolution: 'Review and acknowledge all critical conflicts in the Check Plan view'
    });
  }

  // Check 2: CRITICAL_PLACEHOLDER_UNACKNOWLEDGED
  // Critical items with placeholder quantities that haven't been acknowledged
  const criticalPlaceholdersUnacked = await prisma.item.count({
    where: {
      team: { eventId },
      critical: true,
      quantityState: 'PLACEHOLDER',
      placeholderAcknowledged: false
    }
  });

  if (criticalPlaceholdersUnacked > 0) {
    blocks.push({
      code: 'CRITICAL_PLACEHOLDER_UNACKNOWLEDGED',
      reason: `${criticalPlaceholdersUnacked} critical item(s) have placeholder quantities that must be acknowledged`,
      count: criticalPlaceholdersUnacked,
      resolution: 'Either specify exact quantities or acknowledge the placeholder status for critical items'
    });
  }

  // Check 3: STRUCTURAL_MINIMUM_TEAMS
  // At least 1 team must exist
  const teamCount = await prisma.team.count({
    where: { eventId }
  });

  if (teamCount < 1) {
    blocks.push({
      code: 'STRUCTURAL_MINIMUM_TEAMS',
      reason: 'At least 1 team must exist before transitioning',
      count: teamCount,
      resolution: 'Create at least one team with a coordinator'
    });
  }

  // Check 4: STRUCTURAL_MINIMUM_ITEMS
  // At least 1 item must exist
  const itemCount = await prisma.item.count({
    where: {
      team: { eventId }
    }
  });

  if (itemCount < 1) {
    blocks.push({
      code: 'STRUCTURAL_MINIMUM_ITEMS',
      reason: 'At least 1 item must exist before transitioning',
      count: itemCount,
      resolution: 'Add items to your teams before confirming the plan'
    });
  }

  // Check 5: UNSAVED_DRAFT_CHANGES
  // Verify event status is DRAFT (transition should only happen from DRAFT to CONFIRMING)
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { status: true }
  });

  if (!event) {
    throw new Error('Event not found');
  }

  if (event.status !== 'DRAFT') {
    blocks.push({
      code: 'UNSAVED_DRAFT_CHANGES',
      reason: `Event must be in DRAFT status to transition (current status: ${event.status})`,
      resolution: 'Event can only transition to CONFIRMING from DRAFT status'
    });
  }

  return {
    passed: blocks.length === 0,
    blocks
  };
}

export interface TransitionResult {
  success: boolean;
  snapshotId?: string;
  blocks?: GateBlock[];
  error?: string;
}

/**
 * Creates a plan snapshot capturing current event state.
 * Stores: teams, items, days, criticalFlags, acknowledgements
 *
 * @param eventId - Event to snapshot
 * @returns Snapshot ID
 */
async function createPlanSnapshot(tx: Tx, eventId: string): Promise<string> {
  // Fetch all data to snapshot
  const teams = await tx.team.findMany({
    where: { eventId },
    include: {
      coordinator: { select: { id: true, name: true } },
      members: {
        include: {
          person: { select: { id: true, name: true } }
        }
      }
    }
  });

  const items = await tx.item.findMany({
    where: {
      team: { eventId }
    },
    include: {
      assignment: {
        include: {
          person: { select: { id: true, name: true } }
        }
      },
      team: { select: { id: true, name: true } },
      day: { select: { id: true, name: true } }
    }
  });

  const days = await tx.day.findMany({
    where: { eventId }
  });

  // Extract critical items
  const criticalFlags = items
    .filter(item => item.critical)
    .map(item => ({
      itemId: item.id,
      itemName: item.name,
      teamId: item.teamId,
      teamName: item.team.name,
      criticalReason: item.criticalReason,
      criticalSource: item.criticalSource,
      assigned: !!item.assignment,
      assignedTo: item.assignment?.person.name || null
    }));

  // Get all conflict acknowledgements
  const acknowledgements = await tx.acknowledgement.findMany({
    where: { eventId },
    include: {
      conflict: {
        select: {
          id: true,
          type: true,
          severity: true,
          title: true
        }
      }
    }
  });

  // Create the snapshot
  const snapshot = await tx.planSnapshot.create({
    data: {
      eventId,
      phase: 'CONFIRMING',
      teams: teams as any,
      items: items as any,
      days: days as any,
      criticalFlags: criticalFlags as any,
      acknowledgements: acknowledgements as any
    }
  });

  return snapshot.id;
}

/**
 * Transitions event from DRAFT to CONFIRMING.
 * - Runs gate check first
 * - If passed: creates PlanSnapshot, updates event status, sets structureMode to LOCKED
 * - Records transitionAttempt with result
 *
 * @param eventId - Event to transition
 * @param actorId - Person performing the transition (for audit logging)
 * @returns TransitionResult
 */
export async function transitionToConfirming(
  eventId: string,
  actorId: string
): Promise<TransitionResult> {
  // Run gate check first
  const gateCheck = await runGateCheck(eventId);

  if (!gateCheck.passed) {
    // Record failed transition attempt
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { transitionAttempts: true }
    });

    const attempts = Array.isArray(event?.transitionAttempts) ? event.transitionAttempts as any[] : [];

    await prisma.event.update({
      where: { id: eventId },
      data: {
        transitionAttempts: [
          ...attempts,
          {
            attemptedAt: new Date().toISOString(),
            attemptedBy: actorId,
            passed: false,
            blocks: gateCheck.blocks as any
          }
        ] as any
      }
    });

    return {
      success: false,
      blocks: gateCheck.blocks
    };
  }

  // Gate check passed - perform transition in transaction
  try {
    const result = await prisma.$transaction(async (tx) => {
      // Create plan snapshot
      const snapshotId = await createPlanSnapshot(tx, eventId);

      // Get existing attempts
      const currentEvent = await tx.event.findUnique({
        where: { id: eventId },
        select: { transitionAttempts: true }
      });

      const attempts = Array.isArray(currentEvent?.transitionAttempts) ? currentEvent.transitionAttempts as any[] : [];

      // Update event
      const event = await tx.event.update({
        where: { id: eventId },
        data: {
          status: 'CONFIRMING',
          structureMode: 'LOCKED',
          planSnapshotIdAtConfirming: snapshotId,
          transitionedToConfirmingAt: new Date(),
          transitionAttempts: [
            ...attempts,
            {
              attemptedAt: new Date().toISOString(),
              attemptedBy: actorId,
              passed: true,
              snapshotId
            }
          ] as any
        }
      });

      // Log transition
      await logAudit(tx, {
        eventId,
        actorId,
        actionType: 'TRANSITION_TO_CONFIRMING',
        targetType: 'Event',
        targetId: eventId,
        details: `Transitioned event to CONFIRMING status with snapshot ${snapshotId}`
      });

      return { snapshotId };
    });

    return {
      success: true,
      snapshotId: result.snapshotId
    };
  } catch (error) {
    console.error('Error during transition:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during transition'
    };
  }
}
