import type { AssignmentResponse, Prisma } from '@prisma/client';
import { logAudit, type AuditLifecycleAction } from '@/lib/workflow';

type Tx = Prisma.TransactionClient;

/**
 * GTC-320 — the one place an item answer is written and recorded.
 *
 * Two routes did this, and they no longer agreed on the second half:
 * `POST /api/p/[token]/ack/[assignmentId]` (the guest's tap, and since GTC-191 a
 * carrier answering on a child's behalf) and `POST /api/c/[token]/ack/[assignmentId]`
 * (a coordinator answering their own item). Measured at `aefa030`, comments stripped:
 * 37 shared non-blank lines, of which the `assignment.update`, the verb ternary and
 * the `logAudit` call were 17 in two blocks. The single line BETWEEN those two blocks
 * is the one that had drifted.
 *
 * ── WHY THE COORDINATOR'S FORM IS THE ONE THAT SURVIVED ───────────────────────
 *
 * The two sentences were:
 *
 *   participant   `${verb} assignment for item ${assignment.itemId}`   <- a cuid
 *   coordinator   `${verb} ${assignment.item.name}`                    <- the name
 *
 * `AuditEntry.details` is rendered to the host at `/h/[token]/audit`
 * (`src/app/h/[token]/audit/page.tsx`), so one of those two was being shown to her
 * unreadable. `prisma/schema.prisma` calls the ledger her memory of what happened, and
 * "Accepted assignment for item cmu6rj7tl000srjfafy14ufnq" is not a memory of anything.
 *
 * ⚠ AND THE CODE DECIDED WHICH ONE, NOT TASTE. The verb's third branch is `'Maybe on'`,
 * not `'Maybe'`. It reads as a sentence in exactly one of the two shapes —
 * "Maybe on the crackers" — and as noise in the other, "Maybe on assignment for item
 * cmu…". The coordinator's was the form the verb was written for; the participant's was
 * the copy that lost the name. `tests/assignment-answer-test.ts` layer D pins that
 * reading as an assertion rather than leaving it as a preference.
 *
 * ⚠ ANCHOR(GTC-320): the two sentences below are HOST-VISIBLE WORDS and are the
 * executor's PROPOSAL, not a founder ruling. Every other word the host reads on this
 * ledger was ruled at its slice. The marker comes off when they are ruled, per the
 * Citations rule that a provisional marker names the ticket that ends it.
 *
 * ── WHAT THIS HELPER DELIBERATELY DOES NOT DO ─────────────────────────────────
 *
 * ⚠ IT DECIDES NOTHING ABOUT WHO MAY ANSWER. GTC-191's `resolveCarriedSubjects`, its
 * carried-vs-own decision and its 403 are a Do-Not-Touch Zone 3 approval given to the
 * participant route and to no other route (founder, 2026-09-18). Moving any of it here
 * would widen a signed approval by refactor, which is what GTC-320's Stop Condition 5
 * names. The caller has already decided; this only writes.
 *
 * It takes `onBehalfOfName` already resolved, for the same reason: a helper that looked
 * the name up would need the resolver, and then it would have the reach.
 */
export async function recordAssignmentAnswer(
  tx: Tx,
  params: {
    eventId: string;
    assignmentId: string;
    /** The item's name, not its id — see above. Read by the caller inside its own transaction. */
    itemName: string;
    response: AssignmentResponse;
    /** Who acted. For a carried answer this is the CARRIER, never the child. */
    actorId: string;
    /**
     * The child's name, where this answer was given on their behalf (GTC-191). Null or
     * absent for an ordinary answer — the phrase must appear only where it is true.
     */
    onBehalfOfName?: string | null;
  }
): Promise<void> {
  const { eventId, assignmentId, itemName, response, actorId, onBehalfOfName } = params;

  await tx.assignment.update({
    where: { id: assignmentId },
    data: { response },
  });

  const verb =
    response === 'ACCEPTED' ? 'Accepted' : response === 'DECLINED' ? 'Declined' : 'Maybe on';

  const actionType: AuditLifecycleAction =
    response === 'ACCEPTED'
      ? 'ACCEPT_ASSIGNMENT'
      : response === 'DECLINED'
        ? 'DECLINE_ASSIGNMENT'
        : 'MAYBE_ASSIGNMENT';

  await logAudit(tx, {
    eventId,
    actorId,
    actionType,
    targetType: 'Assignment',
    targetId: assignmentId,
    /*
     * GTC-191 (a): THE LINE NAMES BOTH PEOPLE where the answer was carried. `actorId` is
     * the carrier — she is who acted — and `targetId` is the child's `Assignment`. Without
     * the name here, a carried answer and her own read identically in the ledger, and the
     * one fact worth keeping about a carried answer is on whose behalf it was given.
     */
    details: onBehalfOfName
      ? `${verb} ${itemName} on behalf of ${onBehalfOfName}`
      : `${verb} ${itemName}`,
  });
}
