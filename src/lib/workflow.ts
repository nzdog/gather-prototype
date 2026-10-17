import { prisma } from './prisma';
import type { Item, Assignment, Person, EventStatus, Prisma } from '@prisma/client';
import { isSent } from './lifecycle';
import { recordChange, type ActorKind } from './ledger';

// Type for items with assignment + person included
type ItemWithAssignmentAndPerson = Item & {
  assignment: (Assignment & { person: Person }) | null;
};

// Use Prisma's built-in transaction client type
type Tx = Prisma.TransactionClient;

/**
 * UI Status Labels - Consistent status naming for UI display
 * Use these constants throughout the UI to ensure consistent terminology
 */
// GTC-197 (A3c): the enum values FROZEN/COMPLETE survive for legacy rows until
// GTC-199 drops them, but nothing shows a host the word "FROZEN" any more — the key
// is legacy, the label is not. COMPLETE is the calendar's word, not a state she moved
// the plan into.
export const STATUS_LABELS = {
  DRAFT: 'DRAFT',
  CONFIRMING: 'CONFIRMING',
  /** Legacy key. Displayed as the send, because that is what it now means. */
  FROZEN: 'SENT',
  COMPLETE: 'PAST',
} as const;

/**
 * Computes team status from assignment data directly.
 * Does NOT use cached Item.status - queries assignment existence and response.
 * Use this in all GET routes. Pure synchronous function.
 *
 * CRITICAL: This is SYNCHRONOUS (no async/await)
 *
 * Note: Declined assignments are treated as gaps because they indicate
 * items that need attention (participant won't bring them).
 *
 * GTC-174 (D1) — A MAYBE IS NOT A GAP. DO NOT "FIX" THIS.
 * Hinge §8: the item is held softly. "It stays the guest's — a maybe is more claim than
 * silence, and treating it as loose would make tapping maybe worse than saying nothing."
 * A maybe is yellow, never red. The predicates below key on DECLINED, so MAYBE already
 * falls on the correct side; that is deliberate, not an oversight, and
 * tests/guest-response-model-test.ts pins it. Nothing here blocks Kate from
 * reassigning a maybe'd item — that is D3's (GTC-176) release-notification path, not a
 * gap classification.
 */
export function computeTeamStatusFromItems(
  items: ItemWithAssignmentAndPerson[]
): 'SORTED' | 'GAP' | 'CRITICAL_GAP' {
  const hasCriticalGap = items.some(
    (i) => i.critical && (i.assignment === null || i.assignment.response === 'DECLINED')
  );
  const hasGap = items.some((i) => i.assignment === null || i.assignment?.response === 'DECLINED');

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
export async function repairItemStatusAfterMutation(tx: Tx, itemId: string): Promise<void> {
  const item = await tx.item.findUnique({
    where: { id: itemId },
    include: { assignment: true },
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
 * Clears the existing plan ahead of a regeneration.
 *
 * Extracted verbatim from the regenerate route (GTC-171/B2) so this data-loss-critical
 * path can be asserted behaviourally — `requireEventRole` reads a session cookie, so the
 * host route itself cannot be driven in-process (see tests/security-validation.ts:454).
 *
 * @param preserveProtected true → drop only GENERATED, unprotected rows and sweep the
 *   teams left empty. false → full regeneration, drop everything.
 */
export async function clearPlanForRegeneration(
  eventId: string,
  preserveProtected: boolean
): Promise<void> {
  if (preserveProtected) {
    // Delete only GENERATED items (safe to overwrite)
    await prisma.item.deleteMany({
      where: {
        team: { eventId },
        kind: 'ITEM', // GTC-171 (B2): regenerate is the V1 food path — it never
        // reproduces task rows, so anything it drops is lost for good.
        source: 'GENERATED', // Only delete AI-generated items that haven't been edited
        isProtected: false, // Don't delete protected items even if generated
      },
    });

    // Delete teams that have no items left and are not protected.
    // Task teams keep their TASK rows, so this sweep leaves them standing.
    const teams = await prisma.team.findMany({
      where: { eventId },
      include: { _count: { select: { items: true } } },
    });

    for (const team of teams) {
      if (team._count.items === 0 && !team.isProtected) {
        await prisma.team.delete({ where: { id: team.id } });
      }
    }
  } else {
    // Delete all items and teams (preserveProtected=false means full regeneration)
    await prisma.item.deleteMany({
      where: { team: { eventId }, kind: 'ITEM' },
    });
    // GTC-171 (B2): `Item.team` is onDelete: Cascade, so an unscoped delete here would
    // cascade away the task rows the statement above just spared — filtering the item
    // delete alone is NOT sufficient. Only teams left with no rows at all may go.
    await prisma.team.deleteMany({
      where: { eventId, items: { none: {} } },
    });
  }
}

/**
 * ============================================
 * EPIC 4: FREEZE WARNINGS
 * ============================================
 */

export interface FreezeWarning {
  type: 'LOW_COMPLIANCE' | 'CRITICAL_GAPS' | 'UNASSIGNED_ITEMS';
  message: string;
  details: string[];
}

export interface SendReadinessResult {
  warnings: FreezeWarning[];
  complianceRate: number; // 0-100
  criticalGaps: {
    itemId: string;
    itemName: string;
  }[];
}

/**
 * Sweeps the plan for gaps ahead of the send, and returns WARNINGS ONLY.
 *
 * GTC-169 (A3a): renamed from checkFreezeReadiness. There is no freeze to be ready
 * for — this is the Hinge §1 pre-flight's "hunt for absence", and its final form is
 * GTC-188 (I1). Nothing here blocks: Moment 4 §2 refuses readiness scores and
 * thresholds outright, and §7 forbids the product contesting the host. The old
 * canFreeze field (hardcoded true) is gone; the <80%-compliance-requires-a-reason
 * rule went with it, because demanding justification at a threshold is exactly what
 * §7 forbids.
 *
 * Compliance calculation:
 * - Numerator: Assignments with status = ACCEPTED where assignee has reachabilityTier != UNTRACKABLE
 * - Denominator: Total assignments where assignee has reachabilityTier != UNTRACKABLE
 * - Exclude untrackable from both — can't measure what you can't reach
 *
 * Warning triggers:
 * - Any items unassigned: UNASSIGNED_ITEMS warning
 * - complianceRate < 80: LOW_COMPLIANCE warning
 * - Any critical item with no accepted assignment: CRITICAL_GAPS warning
 */
export async function checkSendReadiness(eventId: string): Promise<SendReadinessResult> {
  const warnings: FreezeWarning[] = [];

  // Check for unassigned items
  const unassignedItems = await prisma.item.findMany({
    where: {
      team: { eventId },
      assignment: null,
    },
    select: {
      id: true,
      name: true,
    },
  });

  if (unassignedItems.length > 0) {
    warnings.push({
      type: 'UNASSIGNED_ITEMS',
      message: `${unassignedItems.length} item(s) are not yet assigned`,
      details: unassignedItems.map((item) => item.name),
    });
  }

  // Get all assignments for trackable guests
  const allAssignments = await prisma.assignment.findMany({
    where: {
      item: {
        team: { eventId },
      },
      person: {
        eventMemberships: {
          some: {
            eventId,
            reachabilityTier: {
              not: 'UNTRACKABLE',
            },
          },
        },
      },
    },
    include: {
      person: {
        select: {
          id: true,
          name: true,
          eventMemberships: {
            where: { eventId },
            select: { reachabilityTier: true },
          },
        },
      },
    },
  });

  // Calculate compliance rate
  const totalTrackable = allAssignments.length;
  const acceptedCount = allAssignments.filter((a) => a.response === 'ACCEPTED').length;
  const complianceRate =
    totalTrackable === 0 ? 100 : Math.round((acceptedCount / totalTrackable) * 100);

  // Check for low compliance
  //
  // GTC-174 (D1) — A MAYBE MUST BLOCK FREEZE-READINESS. This is the mirror of the
  // not-a-gap ruling above, and the two are not in tension: a maybe is not LOOSE
  // (Hinge §8 — the item is still the guest's, so it is no gap), but neither is it a
  // CONFIRMATION. `acceptedCount` above already counts only ACCEPTED, so a maybe
  // correctly depresses the rate; this filter is what puts the guest's name in front of
  // Kate as still-to-answer. Omitting MAYBE here would report a maybe as sorted.
  if (complianceRate < 80 && totalTrackable > 0) {
    const pendingAssignments = allAssignments.filter(
      (a) => a.response === 'PENDING' || a.response === 'DECLINED' || a.response === 'MAYBE'
    );
    const details = pendingAssignments.map(
      (a) => `${a.person.name} (${a.response.toLowerCase().replace('_', ' ')})`
    );

    warnings.push({
      type: 'LOW_COMPLIANCE',
      message: `Only ${complianceRate}% of guests have confirmed`,
      details,
    });
  }

  // Check for critical gaps
  const criticalItems = await prisma.item.findMany({
    where: {
      team: { eventId },
      critical: true,
    },
    include: {
      assignment: true,
    },
  });

  const criticalGaps = criticalItems
    .filter((item) => !item.assignment || item.assignment.response !== 'ACCEPTED')
    .map((item) => ({
      itemId: item.id,
      itemName: item.name,
    }));

  if (criticalGaps.length > 0) {
    warnings.push({
      type: 'CRITICAL_GAPS',
      message: `${criticalGaps.length} critical item(s) have no owner`,
      details: criticalGaps.map((g) => g.itemName),
    });
  }

  return {
    warnings,
    complianceRate,
    criticalGaps,
  };
}

/**
 * Validates event status transitions.
 *
 * GTC-169 (A3a): only ONE authored transition survives the send-lock reconciliation.
 *
 *   DRAFT → CONFIRMING : always allowed — real, load-bearing work (gate check,
 *                        PlanSnapshot, structureMode LOCKED, AccessToken generation)
 *   CONFIRMING → *     : nothing. The press is not a transition, it is a timestamp
 *                        (Event.sentAt), and COMPLETE is derived from the calendar
 *                        (Moment 4 §10.1 — "no one declares it").
 *
 * FROZEN is gone as a destination: it was a second, later ceremony bolted on after
 * the send that already existed. FROZEN → CONFIRMING (unfreeze) is gone with it —
 * Hinge §2 rules out recall at the mechanism level; recovery from a bad send runs
 * through the material-change machinery (GTC-183 / F1), not an undo.
 */
export function canTransition(fromStatus: EventStatus, toStatus: EventStatus): boolean {
  if (fromStatus === toStatus) return true;

  const validTransitions: Record<EventStatus, EventStatus[]> = {
    DRAFT: ['CONFIRMING'],
    CONFIRMING: [],
    // Legacy rows only — no code path produces these statuses after A3a, and nothing
    // may transition out of them. GTC-199 (A4) drops both enum values.
    FROZEN: [],
    COMPLETE: [],
  };

  return validTransitions[fromStatus].includes(toStatus);
}

/*
 * canMutate() was DELETED by GTC-169 (A3a).
 *
 * It denied every mutation on FROZEN and COMPLETE events, and denied deleting a
 * critical item while CONFIRMING. The send-lock model removes the first two (the lock
 * is a ledger, not a wall — Moment 4 §7), and the third was unreachable dead code: its
 * only caller passed itemCritical: false unconditionally.
 *
 * With all three gone the function returned true for every input. A gate that always
 * passes is worse than no gate — it reads as protection while providing none, which is
 * exactly why the unwired canFreeze() was removed in GTC-154.
 *
 * Authority still comes from requireEventRole / requireTokenScope / requireTeamAccess.
 * Accountability comes from src/lib/ledger.ts. Neither is a lifecycle gate.
 */

/**
 * Lifecycle and housekeeping audit lines — things that happen TO an event rather than
 * changes to the plan inside it.
 *
 * GTC-196 (A3b) — WHY THIS IS A TS UNION AND NOT A POSTGRES ENUM.
 *
 * A2 deferred the `AuditActionType` enum to this ticket, on the grounds that the
 * writer set would be known once the routes were wired. It now is, and it turns out to
 * be TWO vocabularies, not one:
 *
 *   - `recordChange()` writes plan changes, typed by `ChangeAction` in ledger.ts.
 *   - `logAudit()` writes lifecycle lines — this union.
 *
 * Freezing both into a single Postgres enum now would cement that conflation in the
 * schema at exactly the moment logAudit is mid-retirement (its plan-change callers
 * moved to recordChange in this ticket; what remains is lifecycle-only). It would also
 * need a text→enum cast, which fails on any historical value outside the enum — a
 * one-way migration risk taken for something already solved.
 *
 * Because the real prize was compile-time safety, and this union plus `ChangeAction`
 * delivers it on both paths with zero migration risk: a typo is a type error today.
 * The Postgres enum belongs with logAudit's retirement, not ahead of it.
 */
export type AuditLifecycleAction =
  | 'TRANSITION_TO_CONFIRMING'
  | 'CREATE_REVISION'
  | 'RESTORE_REVISION'
  | 'WRAP_UP_SENT'
  | 'EDIT_EVENT'
  | 'REMOVE_PERSON'
  | 'UNASSIGN_ITEM'
  | 'ACCEPT_ASSIGNMENT'
  | 'DECLINE_ASSIGNMENT'
  // GTC-174 (D1): the third way (Hinge §3) and the attendance answer given on the
  // no-follow-up / itemless paths. Both are guest decisions, not plan changes, so they
  // belong here rather than in the ledger's recordChange().
  | 'MAYBE_ASSIGNMENT'
  | 'ANSWER_ATTENDANCE'
  | 'CREATE_ITEM'
  | 'EDIT_ITEM'
  | 'DELETE_ITEM'
  | 'ASSIGN_ITEM'
  | 'REASSIGN_ITEM';

/**
 * Audit helper: logs action to AuditEntry within transaction.
 *
 * CRITICAL: All audit logging must happen inside transactions.
 *
 * For PLAN CHANGES use recordChange() in src/lib/ledger.ts instead — it allocates a
 * version, groups the changeSet, and applies the why-scope rule. This helper writes
 * lifecycle lines that are not versions of the plan.
 */
export async function logAudit(
  tx: Tx,
  params: {
    eventId: string;
    actorId: string;
    actionType: AuditLifecycleAction;
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
      timestamp: new Date(),
    },
  });
}

/*
 * removePerson() was DELETED by GTC-202 (A3c-2).
 *
 * It had ZERO callers. The host dashboard removes people through PeopleSection, which
 * calls DELETE /api/events/[id]/people/[personId] — a route that performs its removal
 * inline and carries its own T2 recordChange() (GTC-201).
 *
 * GTC-196 wired T2 in here "so every caller inherits it": a true sentence about an
 * empty set. Keeping both left two implementations of person-removal, one unreachable
 * and free to drift from the one that runs. That is the same reasoning that removed the
 * unwired canFreeze() in GTC-154 and the always-true canMutate() in GTC-169 — dead
 * machinery that reads as coverage while providing none.
 *
 * The surviving implementation is the route's, and it is the one the GTC-200 review
 * verified end-to-end. If a domain-level helper is ever wanted again, it should be
 * extracted FROM that route, not restored from here.
 */

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
 * Blocking codes (DRAFT → CONFIRMING):
 * - CRITICAL_CONFLICT_UNACKNOWLEDGED
 * - CRITICAL_PLACEHOLDER_UNACKNOWLEDGED
 * - STRUCTURAL_MINIMUM_TEAMS
 * - STRUCTURAL_MINIMUM_ITEMS
 * - UNSAVED_DRAFT_CHANGES
 *
 * Note: ALL_ITEMS_ASSIGNED is NOT required for DRAFT → CONFIRMING.
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
        in: ['OPEN', 'DELEGATED'], // Not resolved or dismissed
      },
      acknowledgements: {
        none: {}, // No acknowledgements at all
      },
    },
  });

  if (criticalConflictsWithoutAck > 0) {
    blocks.push({
      code: 'CRITICAL_CONFLICT_UNACKNOWLEDGED',
      reason: `${criticalConflictsWithoutAck} critical conflict(s) must be acknowledged before transitioning`,
      count: criticalConflictsWithoutAck,
      resolution: 'Review and acknowledge all critical conflicts in the Check Plan view',
    });
  }

  // Check 2: CRITICAL_PLACEHOLDER_UNACKNOWLEDGED
  // Critical items with placeholder quantities that haven't been acknowledged
  const criticalPlaceholdersUnacked = await prisma.item.count({
    where: {
      team: { eventId },
      critical: true,
      quantityState: 'PLACEHOLDER',
      placeholderAcknowledged: false,
    },
  });

  if (criticalPlaceholdersUnacked > 0) {
    blocks.push({
      code: 'CRITICAL_PLACEHOLDER_UNACKNOWLEDGED',
      reason: `${criticalPlaceholdersUnacked} critical item(s) have placeholder quantities that must be acknowledged`,
      count: criticalPlaceholdersUnacked,
      resolution:
        'Either specify exact quantities or acknowledge the placeholder status for critical items',
    });
  }

  // [[GTC-374]] (item 14) — INVITES ONLY: an event she chose to send with no plan holds with no team
  // and no item. These two structural checks, and only these, are lifted, and only for an event
  // whose `EventSetup.invitesOnly` is set; checks 1, 2 and 5 stand for every event. A V1 event has no
  // EventSetup, so it reads false and is checked as before.
  const invitesOnly =
    (
      await prisma.eventSetup.findUnique({
        where: { eventId },
        select: { invitesOnly: true },
      })
    )?.invitesOnly === true;

  // Check 3: STRUCTURAL_MINIMUM_TEAMS
  // At least 1 team must exist
  const teamCount = await prisma.team.count({
    where: { eventId },
  });

  if (teamCount < 1 && !invitesOnly) {
    blocks.push({
      code: 'STRUCTURAL_MINIMUM_TEAMS',
      reason: 'At least 1 team must exist before transitioning',
      count: teamCount,
      resolution: 'Create at least one team with a coordinator',
    });
  }

  // Check 4: STRUCTURAL_MINIMUM_ITEMS
  // At least 1 item must exist
  // GTC-171 (B2): ITEM rows only — a plan consisting solely of day-of task rows is not
  // a plan, and must not satisfy "the event has something in it".
  const itemCount = await prisma.item.count({
    where: {
      kind: 'ITEM',
      team: { eventId },
    },
  });

  if (itemCount < 1 && !invitesOnly) {
    blocks.push({
      code: 'STRUCTURAL_MINIMUM_ITEMS',
      reason: 'At least 1 item must exist before transitioning',
      count: itemCount,
      resolution: 'Add items to your teams before confirming the plan',
    });
  }

  // Check 5: UNSAVED_DRAFT_CHANGES
  // Verify event status is DRAFT (transition should only happen from DRAFT to CONFIRMING)
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { status: true },
  });

  if (!event) {
    throw new Error('Event not found');
  }

  if (event.status !== 'DRAFT') {
    blocks.push({
      code: 'UNSAVED_DRAFT_CHANGES',
      reason: `Event must be in DRAFT status to transition (current status: ${event.status})`,
      resolution: 'Event can only transition to CONFIRMING from DRAFT status',
    });
  }

  // Note: ALL_ITEMS_ASSIGNED check removed from DRAFT → CONFIRMING gate
  // Assignment coverage is never enforced as a gate — checkSendReadiness warns only.

  return {
    passed: blocks.length === 0,
    blocks,
  };
}

export interface TransitionResult {
  success: boolean;
  snapshotId?: string;
  tokenCount?: number;
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
          person: { select: { id: true, name: true } },
        },
      },
    },
  });

  const items = await tx.item.findMany({
    where: {
      team: { eventId },
    },
    include: {
      assignment: {
        include: {
          person: { select: { id: true, name: true } },
        },
      },
      team: { select: { id: true, name: true } },
      day: { select: { id: true, name: true } },
    },
  });

  const days = await tx.day.findMany({
    where: { eventId },
  });

  // Extract critical items
  const criticalFlags = items
    .filter((item) => item.critical)
    .map((item) => ({
      itemId: item.id,
      itemName: item.name,
      teamId: item.teamId,
      teamName: item.team.name,
      criticalReason: item.criticalReason,
      criticalSource: item.criticalSource,
      assigned: !!item.assignment,
      assignedTo: item.assignment?.person.name || null,
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
          title: true,
        },
      },
    },
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
      acknowledgements: acknowledgements as any,
    },
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
      select: { transitionAttempts: true },
    });

    const attempts = Array.isArray(event?.transitionAttempts)
      ? (event.transitionAttempts as any[])
      : [];

    await prisma.event.update({
      where: { id: eventId },
      data: {
        transitionAttempts: [
          ...attempts,
          {
            attemptedAt: new Date().toISOString(),
            attemptedBy: actorId,
            passed: false,
            blocks: gateCheck.blocks as any,
          },
        ] as any,
      },
    });

    return {
      success: false,
      blocks: gateCheck.blocks,
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
        select: { transitionAttempts: true },
      });

      const attempts = Array.isArray(currentEvent?.transitionAttempts)
        ? (currentEvent.transitionAttempts as any[])
        : [];

      // Update event
      await tx.event.update({
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
              snapshotId,
            },
          ] as any,
        },
      });

      // Ensure all access tokens exist (idempotent)
      const { ensureEventTokens } = await import('./tokens');
      await ensureEventTokens(eventId, tx);

      // Count tokens created
      const tokenCount = await tx.accessToken.count({
        where: { eventId },
      });

      // Log transition
      await logAudit(tx, {
        eventId,
        actorId,
        actionType: 'TRANSITION_TO_CONFIRMING',
        targetType: 'Event',
        targetId: eventId,
        details: `Transitioned event to CONFIRMING status with snapshot ${snapshotId}. Generated/verified ${tokenCount} access tokens.`,
      });

      return { snapshotId, tokenCount };
    });

    return {
      success: true,
      snapshotId: result.snapshotId,
      tokenCount: result.tokenCount,
    };
  } catch (error) {
    console.error('Error during transition:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during transition',
    };
  }
}

/**
 * ============================================
 * PHASE 6: REVISION SYSTEM
 * ============================================
 */

/**
 * Creates a manual revision snapshot of the current event state
 * @param eventId - Event to snapshot
 * @param actorId - Person creating the revision
 * @param reason - Reason for creating the revision
 * @returns The created revision ID
 */
export async function createRevision(
  eventId: string,
  actorId: string,
  reason?: string
): Promise<string> {
  return await prisma.$transaction((tx) => snapshotPlan(tx, eventId, actorId, reason));
}

/**
 * [[GTC-375]] (C6) — `createRevision`'s body, taking the transaction, so putting a plan away can save
 * it and clear it in one step that cannot half-happen. `createRevision` is this in a transaction of
 * its own, exactly as before.
 *
 * Each team carries its members' ids too (GTC-375 Q12): only a bring-back reads them, to put a
 * membership back on the new team of the same name. The old dashboard's restore never reads them.
 */
async function snapshotPlan(
  tx: Tx,
  eventId: string,
  actorId: string,
  reason?: string
): Promise<string> {
  // Get current revision number
  const latestRevision = await tx.planRevision.findFirst({
    where: { eventId },
    orderBy: { revisionNumber: 'desc' },
    select: { revisionNumber: true },
  });

  const revisionNumber = (latestRevision?.revisionNumber ?? 0) + 1;

  // Capture current state
  const teams = await tx.team.findMany({
    where: { eventId },
    include: {
      coordinator: { select: { id: true, name: true } },
      members: { select: { personId: true } },
      items: {
        include: {
          assignment: {
            include: {
              person: { select: { id: true, name: true } },
            },
          },
          day: { select: { id: true, name: true, date: true } },
        },
      },
    },
  });

  const days = await tx.day.findMany({
    where: { eventId },
  });

  const conflicts = await tx.conflict.findMany({
    where: { eventId },
  });

  const acknowledgements = await tx.acknowledgement.findMany({
    where: { eventId },
  });

  // Create revision
  const revision = await tx.planRevision.create({
    data: {
      eventId,
      revisionNumber,
      createdAt: new Date(),
      createdBy: actorId,
      reason: reason || 'Manual revision',
      teams: teams as any,
      items: teams.flatMap((t) => t.items) as any,
      days: days as any,
      conflicts: conflicts as any,
      acknowledgements: acknowledgements as any,
    },
  });

  // Update event's currentRevisionId
  await tx.event.update({
    where: { id: eventId },
    data: { currentRevisionId: revision.id },
  });

  // Log audit entry
  await logAudit(tx, {
    eventId,
    actorId,
    actionType: 'CREATE_REVISION',
    targetType: 'PlanRevision',
    targetId: revision.id,
    details: `Created revision #${revisionNumber}: ${reason || 'Manual revision'}`,
  });

  return revision.id;
}

/**
 * Restores event to a previous revision state
 * - Replaces current teams/items/days with revision snapshot
 * - Clears conflicts (will be re-detected on next Check Plan)
 * - Updates event.currentRevisionId
 * - Logs audit entry
 *
 * @param eventId - Event to restore
 * @param revisionId - Revision to restore to
 * @param actorId - Person performing the restore
 */
export async function restoreFromRevision(
  eventId: string,
  revisionId: string,
  actorId: string,
  opts: { actorKind?: ActorKind; reason?: string | null } = {}
): Promise<void> {
  // GTC-196 (A3b) — THE CONVERSION. A3a refused this on a sent event; that refusal
  // was interim scaffolding, not doctrine (recorded in GTC-196 and by founder ruling
  // 2026-08-03).
  //
  // Post-send restore is the SAME SPECIES as post-send regeneration, which was ruled
  // allowed: a bulk change that carries a checkpoint, a ledger changeSet and a why —
  // not a thing to forbid. A3a refused it only because the gate came off before the
  // recording went in, and an UNRECORDED bulk rewrite of a sent plan is the one thing
  // worse than either. The recording now exists, so the refusal converts:
  //
  //   refused  →  allowed-as-recorded-changeSet
  //
  // A checkpoint of the pre-restore state goes in FIRST — nothing is lost by moving
  // forward, which is exactly what makes no-undo safe to live with (Hinge §2) — and
  // the restore itself lands as one changeSet carrying the host's why.
  //
  // The UI consequence line ("this replaces the plan people have claimed against") is
  // GTC-197 (A3c)'s and must merge with this.
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: eventId },
    select: { status: true, sentAt: true, endDate: true },
  });
  const wasSent = isSent(event);

  // The pre-restore plan is worth keeping whole: a restore replaces every team and
  // item, so a per-field ledger of it would be hundreds of entries describing a state
  // no longer reachable any other way.
  if (wasSent) {
    await createRevision(eventId, actorId, 'Checkpoint before restore');
  }

  await prisma.$transaction((tx) => rebuildPlan(tx, eventId, revisionId, actorId, opts));
}

/**
 * [[GTC-375]] (C6) — `restoreFromRevision`'s transaction, taking the transaction, so a bring-back can
 * put a plan back and clear the invites-only flag in one step. For the old dashboard's restore it does
 * exactly what it did, apart from carrying the five columns C2 found dropped.
 *
 * `bringBack` (GTC-375 Q9, Q12) — only `bringBackPlan` sets it. Someone no longer on the event gets
 * nothing back: an item they held comes back with nobody holding it (counted, for W5), and a team
 * they looked after comes back with no coordinator, so no link is ever minted for them. Members still
 * on the event are put back on the new team of the same name, where they are on no team now. Roles
 * are never touched, and no AccessToken row is written (Q10).
 */
async function rebuildPlan(
  tx: Tx,
  eventId: string,
  revisionId: string,
  actorId: string,
  opts: { actorKind?: ActorKind; reason?: string | null; bringBack?: boolean }
): Promise<{ notBroughtBack: number }> {
  // Get the revision
  const revision = await tx.planRevision.findUnique({
    where: { id: revisionId },
  });

  if (!revision) {
    throw new Error('Revision not found');
  }

  if (revision.eventId !== eventId) {
    throw new Error('Revision does not belong to this event');
  }

  const onEvent = opts.bringBack
    ? new Set(
        (await tx.personEvent.findMany({ where: { eventId }, select: { personId: true } })).map(
          (pe) => pe.personId
        )
      )
    : null;
  /** Always true for a plain restore; in a bring-back, whether they are still on the event. */
  const stillHere = (personId: string | null | undefined) =>
    !onEvent || (!!personId && onEvent.has(personId));
  let notBroughtBack = 0;

  // Delete current items (assignments cascade)
  await tx.item.deleteMany({
    where: { team: { eventId } },
  });

  // Delete current teams
  await tx.team.deleteMany({
    where: { eventId },
  });

  // Delete current days
  await tx.day.deleteMany({
    where: { eventId },
  });

  // Clear conflicts (will be re-detected on next Check Plan)
  await tx.conflict.deleteMany({
    where: { eventId },
  });

  // Restore days from revision
  const days = revision.days as any[];
  const dayIdMap = new Map<string, string>(); // old ID -> new ID

  for (const dayData of days) {
    const newDay = await tx.day.create({
      data: {
        name: dayData.name,
        date: new Date(dayData.date),
        eventId,
      },
    });
    dayIdMap.set(dayData.id, newDay.id);
  }

  // Restore teams from revision
  const teams = revision.teams as any[];
  const teamIdMap = new Map<string, string>(); // old ID -> new ID
  // TODO: Revision system - person ID mapping for restored team memberships (Section 9 of build spec)
  // Will need: const personIdMap = new Map<string, string>(); when implementing person restoration

  for (const teamData of teams) {
    const newTeam = await tx.team.create({
      data: {
        name: teamData.name,
        scope: teamData.scope,
        domain: teamData.domain,
        domainConfidence: teamData.domainConfidence,
        displayOrder: teamData.displayOrder,
        source: teamData.source,
        isProtected: teamData.isProtected,
        eventId,
        coordinatorId: stillHere(teamData.coordinatorId) ? teamData.coordinatorId : null,
      },
    });
    teamIdMap.set(teamData.id, newTeam.id);

    if (opts.bringBack) {
      for (const member of (teamData.members ?? []) as Array<{ personId: string }>) {
        if (!stillHere(member.personId)) continue;
        await tx.personEvent.updateMany({
          where: { eventId, personId: member.personId, teamId: null },
          data: { teamId: newTeam.id },
        });
      }
    }

    // Restore items for this team
    const teamItems = teamData.items || [];
    for (const itemData of teamItems) {
      const held = Boolean(itemData.assignment) && stillHere(itemData.assignment?.personId);
      if (itemData.assignment && !held) notBroughtBack++;
      const newItem = await tx.item.create({
        data: {
          name: itemData.name,
          // GTC-171 (B2): this list is explicit, so an omitted column silently falls
          // back to its schema default — `kind` would restore every task row as an item.
          kind: itemData.kind ?? 'ITEM',
          quantity: itemData.quantity,
          description: itemData.description,
          critical: itemData.critical,
          status: itemData.assignment && !held ? 'UNASSIGNED' : itemData.status,
          previouslyAssignedTo: itemData.previouslyAssignedTo,
          quantityAmount: itemData.quantityAmount,
          quantityUnit: itemData.quantityUnit,
          quantityUnitCustom: itemData.quantityUnitCustom,
          quantityText: itemData.quantityText,
          quantityState: itemData.quantityState,
          quantityLabel: itemData.quantityLabel,
          quantitySource: itemData.quantitySource,
          quantityDerivedFromTemplate: itemData.quantityDerivedFromTemplate,
          placeholderAcknowledged: itemData.placeholderAcknowledged,
          quantityDeferredTo: itemData.quantityDeferredTo,
          criticalReason: itemData.criticalReason,
          criticalSource: itemData.criticalSource,
          criticalOverride: itemData.criticalOverride,
          glutenFree: itemData.glutenFree,
          dairyFree: itemData.dairyFree,
          vegetarian: itemData.vegetarian,
          dietaryTags: itemData.dietaryTags,
          equipmentNeeds: itemData.equipmentNeeds,
          equipmentLoad: itemData.equipmentLoad,
          durationMinutes: itemData.durationMinutes,
          notes: itemData.notes,
          prepStartTime: itemData.prepStartTime,
          prepEndTime: itemData.prepEndTime,
          serveTime: itemData.serveTime,
          dropOffAt: itemData.dropOffAt ? new Date(itemData.dropOffAt) : null,
          // GTC-175 (D2): omit this and a plan restore silently resets Kate's per-item
          // decide-by override to the event default — the exact failure the GTC-171
          // note above warns about.
          decideByOffsetHours: itemData.decideByOffsetHours ?? null,
          dropOffLocation: itemData.dropOffLocation,
          dropOffNote: itemData.dropOffNote,
          source: itemData.source,
          isProtected: itemData.isProtected,
          lastEditedBy: itemData.lastEditedBy,
          // GTC-375 (C2): this list is explicit, so these five fell back to their defaults and a
          // restored plan came back out of order. The snapshot is a whole row; carry them.
          displayOrder: itemData.displayOrder ?? null,
          aiGenerated: itemData.aiGenerated ?? false,
          userConfirmed: itemData.userConfirmed ?? false,
          generatedBatchId: itemData.generatedBatchId ?? null,
          ...(itemData.createdAt ? { createdAt: new Date(itemData.createdAt) } : {}),
          teamId: newTeam.id,
          dayId: itemData.dayId ? dayIdMap.get(itemData.dayId) : null,
        },
      });

      // Restore assignment if it existed (and, in a bring-back, its holder is still here)
      if (held) {
        await tx.assignment.create({
          data: {
            itemId: newItem.id,
            personId: itemData.assignment.personId,
            response: itemData.assignment.response,
            createdAt: new Date(itemData.assignment.createdAt),
            // GTC-175 (D2): the follow-up sent-stamp MUST survive a restore. This
            // block runs after `item.deleteMany` above, so every Assignment row is
            // destroyed and rebuilt with a fresh id — omit the stamp and the restored
            // MAYBEs all read "never followed up", and the next sweep texts every one
            // of them a second time. "Exactly one follow-up" is only true if it
            // survives the revision machinery.
            decideByFollowupSentAt: itemData.assignment.decideByFollowupSentAt
              ? new Date(itemData.assignment.decideByFollowupSentAt)
              : null,
          },
        });
      }
    }
  }

  // Update event's currentRevisionId
  await tx.event.update({
    where: { id: eventId },
    data: { currentRevisionId: revisionId },
  });

  // Log audit entry
  await logAudit(tx, {
    eventId,
    actorId,
    actionType: 'RESTORE_REVISION',
    targetType: 'PlanRevision',
    targetId: revisionId,
    details: `Restored event to revision #${revision.revisionNumber}`,
  });

  // The restore itself, as one recorded step. It is a bulk change — the whole plan
  // moved — so it lands as a single changeSet carrying the why, exactly like a
  // post-send regenerate. Pre-send it is versioned and never interrogated.
  await recordChange(tx, {
    eventId,
    actor: { id: actorId, kind: opts.actorKind ?? 'HOST', name: null },
    reason: opts.reason ?? null,
    changes: [
      {
        action: 'REGENERATE_PLAN',
        targetType: 'Event',
        targetId: eventId,
        before: { restoredFrom: 'current plan' },
        after: { revisionId, revisionNumber: revision.revisionNumber },
      },
    ],
  });

  return { notBroughtBack };
}

/**
 * ============================================
 * [[GTC-375]]: INVITES ONLY ONCE A PLAN EXISTS
 * ============================================
 *
 * The founder at scoping (2026-10-09): *"Put it away, bring it back (Recommended)": "Gather saves her
 * plan exactly as it is, then clears it, so the invitations only ask whether people can come. If she
 * switches back before Send, her plan comes back as she left it. It reuses the save-and-restore the
 * old dashboard already has, rather than new machinery."* Both run inside the setup route's own
 * transaction, with the flag, so neither can half-happen (Q5). Nothing here writes an AccessToken
 * (Q10): a coordinator's link loses its team with the team, and `ensureEventTokens` replaces it at the
 * next hold or Send.
 */

/** The reason a put-away revision carries: how a waiting plan is found (Q6). */
export const PUT_AWAY_REASON = 'Put away: invites only';

/**
 * Puts the plan away: saves it (the same snapshot as `createRevision`), then clears it: every team
 * (its rows, jobs included, and their assignments go with it), the days and the conflicts (their
 * acknowledgements with them; C1). People, households, roles, "Just attending" marks, Moment 2's
 * answers, `planApprovedAt` and `aiCallsUsed` stay. Nothing to put away writes nothing: an event
 * with no row and no team keeps its conflicts, so a flagged event's clash still holds it back.
 * Answers whether anything was put away.
 */
export async function putAwayPlan(tx: Tx, eventId: string, actorId: string): Promise<boolean> {
  const [rows, teams] = await Promise.all([
    tx.item.count({ where: { team: { eventId } } }),
    tx.team.count({ where: { eventId } }),
  ]);
  if (rows === 0 && teams === 0) return false;
  await snapshotPlan(tx, eventId, actorId, PUT_AWAY_REASON);
  await tx.item.deleteMany({ where: { team: { eventId } } });
  await tx.team.deleteMany({ where: { eventId } });
  await tx.day.deleteMany({ where: { eventId } });
  await tx.conflict.deleteMany({ where: { eventId } });
  return true;
}

/**
 * The plan waiting to come back: the latest put-away revision not yet restored (Q6). A bring-back's
 * restore writes RESTORE_REVISION against it, so a plan comes back once. No column, no migration.
 */
export async function waitingPlanRevisionId(
  db: Tx | typeof prisma,
  eventId: string
): Promise<string | null> {
  const latest = await db.planRevision.findFirst({
    where: { eventId, reason: PUT_AWAY_REASON },
    orderBy: { revisionNumber: 'desc' },
    select: { id: true },
  });
  if (!latest) return null;
  const restored = await db.auditEntry.count({
    where: { eventId, actionType: 'RESTORE_REVISION', targetId: latest.id },
  });
  return restored > 0 ? null : latest.id;
}

/**
 * Brings the waiting plan back, as she left it (Q8, Q9). Anything on the event now (only the old
 * dashboard can add it while the plan is away) is saved first, so nothing is lost by the restore's
 * clear. With nothing waiting it does nothing.
 */
export async function bringBackPlan(
  tx: Tx,
  eventId: string,
  actorId: string
): Promise<{ broughtBack: boolean; notBroughtBack: number }> {
  const revisionId = await waitingPlanRevisionId(tx, eventId);
  if (!revisionId) return { broughtBack: false, notBroughtBack: 0 };
  const [rows, teams] = await Promise.all([
    tx.item.count({ where: { team: { eventId } } }),
    tx.team.count({ where: { eventId } }),
  ]);
  if (rows > 0 || teams > 0) {
    await snapshotPlan(tx, eventId, actorId, 'Checkpoint before bringing the plan back');
  }
  const { notBroughtBack } = await rebuildPlan(tx, eventId, revisionId, actorId, {
    bringBack: true,
  });
  return { broughtBack: true, notBroughtBack };
}
