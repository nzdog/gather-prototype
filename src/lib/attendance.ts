/**
 * GTC-174 (D1) — The guest response model: the single source of truth.
 *
 * Hinge §3 (ruled gap #10, 3 Aug 2026) collapsed two guest-facing questions into one:
 * **the tap is the item ask, and attendance is inferred from it.** Yes-to-the-pavlova
 * is yes-to-coming — nobody brings a dessert to a party they're skipping.
 *
 *   YES    any item accepted                        attending
 *   NO     answered "not coming" when asked          not attending
 *   UNKNOWN engaged, attendance undetermined         a maybe, or an unanswered no
 *   PENDING never engaged                            no tap at all
 *
 * WHY DERIVED AND NOT STORED. `PersonEvent.rsvpStatus` used to hold this answer and is
 * retained-but-unwritten as of D1. A stored answer to a derived question is the
 * `Item.status` mistake again (architecture-contract §6): it drifts the moment any
 * write path forgets to repair it, and what it makes lie is the host's headcount. The
 * same reasoning retired the written COMPLETE status in GTC-168 — "a derived predicate
 * makes that class of bug structurally impossible rather than merely unlikely"
 * (src/lib/lifecycle.ts). This module is that predicate for attendance.
 *
 * `Attendance` is a TYPE, not a Prisma enum, deliberately — exactly as `EventPhase` is.
 * There is no column to add, so no cache can form.
 *
 * WHAT IS STILL STORED, and why it must be. Attendance cannot be derived all the way
 * down: the conditional no-follow-up and the itemless degenerate case ask a question
 * whose answer no item response encodes. That answer — and only that answer — lands in
 * `PersonEvent.attendanceAnswer`. The rule is narrow: store what was genuinely ASKED,
 * derive everything else.
 *
 * This module is client-safe: its only Prisma import is a type, which erases at build,
 * so the guest page and the server share ONE definition rather than drifting apart.
 *
 * D1 SCOPE: `Item.status` is untouched. Response nuance lives on `Assignment.response`
 * and `Item.status` remains a presence-cache that is never consulted for status
 * (architecture-contract §6) — `repairItemStatusAfterMutation` is not called from here
 * and its contract does not change.
 */

import type { AssignmentResponse } from '@prisma/client';

/** The derived answer to "are they coming?". Never stored. */
export type Attendance = 'PENDING' | 'YES' | 'NO' | 'UNKNOWN';

/** `PersonEvent.attendanceAnswer` as it comes off the row. NULL = never asked. */
export type StoredAttendanceAnswer = 'YES' | 'NO' | null;

/**
 * Structural rather than the full Prisma `Assignment`, so callers can pass a narrow
 * `select` and tests need no database — the same shape `LifecycleEvent` takes.
 */
export interface ResponseBearing {
  response: string;
}

const has = (assignments: ResponseBearing[], response: string): boolean =>
  assignments.some((a) => a.response === response);

/**
 * Is attendance a question we are entitled to ask this guest?
 *
 * TRUE in exactly two situations, both from Hinge §3:
 *   - the guest has no items at all — the attendance-only degenerate case
 *   - every item is declined — the conditional no-follow-up, "no worries, still coming?"
 *
 * FALSE everywhere else, and each false matters:
 *   - an accepted item already answers it (§3's axiom) — asking again would be asking
 *     for effort where a decision was already given
 *   - a pending item means the ask is not finished
 *   - a MAYBE raises no attendance question at all (§8): a maybe is purely an
 *     item-maybe, and attendance stays unknown until D2's decide-by resolves it
 *
 * This is also the server's guard on the attendance write. Keeping it here rather than
 * in the page is what makes "guests are never asked attendance directly" structural
 * instead of a UI convention that the next screen can quietly break.
 *
 * "Exactly one conditional follow-up" (the acceptance wording) needs no stored counter:
 * the beat shows while this is true AND `attendanceAnswer` is null. Answering ends it.
 * Abandoning and returning re-presents the SAME unanswered question — not a second one.
 */
export function isAttendanceAskable(assignments: ResponseBearing[]): boolean {
  return (
    !has(assignments, 'ACCEPTED') && !has(assignments, 'PENDING') && !has(assignments, 'MAYBE')
  );
}

/**
 * The derived answer to "are they coming?", in precedence order.
 *
 * 1. Any accepted item wins. §3's axiom is absolute: yes-to-the-pavlova is yes-to-coming.
 * 2. Otherwise an explicit answer, where one was given — the follow-up or the itemless ask.
 * 3. Otherwise a maybe leaves it UNKNOWN. §8: a maybe is a decision to decide later; it
 *    is not a silence and not a claim, and it says nothing about attendance until D2's
 *    decide-by resolves it.
 * 4. Otherwise an all-declined guest who never answered the follow-up is UNKNOWN — the
 *    no was ambiguous ("can't bring that" vs "can't come") and the ambiguity stands.
 * 5. Otherwise PENDING: no tap at all.
 *
 * UNKNOWN and PENDING are deliberately distinct. Both read yellow to a host, but D2's
 * clock and E1's cadence must tell an engaged maybe apart from a silence — Hinge §6's
 * whole rule ("decisions surface; behaviour stays the system's business") turns on it.
 *
 * DOCUMENTED CORNER — rule 1 outranks rule 2, so an ACCEPTED assignment alongside a
 * stored NO reads YES. That pairing is unreachable through the guest flow: the
 * follow-up is only ever offered when nothing is accepted (see isAttendanceAskable).
 * It can only arise from a host manual-override writing ACCEPTED, where YES is the
 * right reading anyway. Do not add precedence machinery for it.
 */
export function deriveAttendance(
  assignments: ResponseBearing[],
  attendanceAnswer: StoredAttendanceAnswer
): Attendance {
  if (has(assignments, 'ACCEPTED')) return 'YES';
  if (attendanceAnswer !== null) return attendanceAnswer;
  if (has(assignments, 'MAYBE')) return 'UNKNOWN';
  if (assignments.length > 0 && assignments.every((a) => a.response === 'DECLINED')) {
    return 'UNKNOWN';
  }
  return 'PENDING';
}

/**
 * Validate a guest's item tap. One tap, three ways (Hinge §3).
 *
 * PENDING is rejected on purpose: it is the absence of an answer, not an answer, and a
 * guest may not un-answer. Returns null for anything else so callers 400 rather than
 * coercing.
 */
export function parseAssignmentResponse(value: unknown): AssignmentResponse | null {
  if (value === 'ACCEPTED' || value === 'DECLINED' || value === 'MAYBE') return value;
  return null;
}

/**
 * Validate an attendance answer body: `{ attending: boolean }`.
 *
 * The superseded contract was `{ rsvpStatus: 'YES' | 'NO' | 'NOT_SURE' }`, and it is
 * rejected here rather than translated. Two reasons it must not be translated:
 * `rsvpStatus` is retained-but-unwritten, and NOT_SURE has no target — Hinge §8 abolishes
 * the attendance-maybe outright, because a maybe belongs to the item, not the person.
 */
export function parseAttendanceBody(body: unknown): 'YES' | 'NO' | null {
  if (typeof body !== 'object' || body === null) return null;
  const attending = (body as { attending?: unknown }).attending;
  if (attending === true) return 'YES';
  if (attending === false) return 'NO';
  return null;
}
