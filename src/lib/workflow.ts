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
