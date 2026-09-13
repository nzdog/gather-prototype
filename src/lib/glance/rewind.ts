/**
 * GTC-192 (J1, phase 6, slice 6a) — the rewind: what the glance's inputs were at `since`.
 *
 * THE ONLY GLANCE MODULE THAT TOUCHES A LEDGER, and the only one exempt from two names of
 * Ruling 1's fence. Everything it returns is a PAST INPUT — a response, an attendance answer,
 * an ordering key. It returns no ledger row, no colour, and no time that reaches a payload.
 *
 * ── RULING 21 (2026-09-09), and why the source table moved ───────────────────────────────
 *
 * The phase 5 gate recorded the replay's source as the invite ledger, and recorded the fence
 * test as load-bearing for exactly that reason: that table carries the two behaviour rows
 * Ruling 1 forbids, so the forbidden thing sat one enum value away from the thing phase 6
 * reads. Ruling 21 removes the adjacency at the root rather than guarding it:
 *
 *   "The rewind reads AuditEntry and never InviteEvent, so the table carrying LINK_OPENED is
 *    not touched at all rather than touched and guarded."
 *
 * The fence did not weaken in the move; it relocated — from guarding a read to proving there
 * is no read. `tests/glance-replay-test.ts` asserts this module names none of the 18 members
 * of that enum and never the identifier itself.
 *
 * ⚠ AND THE MOVE IS TO THE MORE RELIABLE RECORD, WHICH IS THE HALF THE PHASE 5 NOTE GOT
 * WRONG. Both ack routes write ACCEPT/DECLINE/MAYBE through `logAudit(tx, …)` INSIDE the
 * response transaction; the invite-ledger write sits OUTSIDE it, fire-and-forget, its failure
 * swallowed by a `.catch`. So a response that was recorded is here; one that was recorded may
 * or may not be there.
 *
 * ── WHAT IS DELIBERATELY NOT SELECTED ────────────────────────────────────────────────────
 *
 * Four columns, and no more: `targetId`, `actionType`, `timestamp`, `targetType`. Not
 * `details` (free text), not `before`/`after` (arbitrary JSON), not the actor's id or name.
 * Any of those could carry anything at all into this process, and a field that is fetched and
 * unused is one careless edit from being returned.
 *
 * ── THE PRICE OF THAT, PAID HONESTLY ─────────────────────────────────────────────────────
 *
 * The attendance answer lives ONLY in the columns above that are excluded. So an attendance
 * row inside the window tells us THAT it changed and never WHAT TO. Rather than guess, the
 * person is marked `ambiguous` and the replay drops them entirely. That is the fail-safe
 * direction: it fails to silence, not to noise.
 *
 * ── RULING 28 (2026-09-09) — AND THE SAME RULE NOW GOVERNS RESPONSES ─────────────────────
 *
 * Until slice 6a-fix this module applied positive evidence to attendance and an ASSUMPTION to
 * responses: no ledger row meant `PENDING`. That asymmetry was the bug. A response written by
 * any path that does not log one read as a change that never happened, so the replay invented
 * good news and repeated it on every visit for ever — the fake-fireworks case Ruling 1 forbids,
 * arriving through the rewind rather than through the animation. Found by the 6c browser walk,
 * which is the first thing that ever looked at a real board: 25 of the 26 events in `gather_dev`
 * carry no response ledger row at all. The rule is now one rule, and it is stated at its site.
 */

import type { Prisma } from '@prisma/client';
import type { DecideByItem } from '../decide-by';

/**
 * Accepts a client or a transaction — `Prisma.TransactionClient`, the same handle
 * `readEventGlance` takes and the house pattern for a DB-bound module here. A hand-rolled
 * structural interface was tried first and was wrong twice over: it did not accept a real
 * `PrismaClient` (the generic `findMany` is not assignable to a fixed row type), and it hid the
 * inference that makes the nested `select` below type-check itself.
 */
export type RewindDb = Prisma.TransactionClient;

/** A response as it stood at `since`. `PENDING` is the schema default, not a guess. */
export type PastResponse = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'MAYBE';

/**
 * THE ALLOWLIST, PINNED AND EXACTLY THREE.
 *
 * A positive list rather than a filter: the query can only ever see the three verbs a guest's
 * own tap writes. `tests/glance-replay-test.ts` asserts its CONTENTS, not merely its shape, so
 * widening it by one member fails the suite rather than quietly enlarging what the replay can
 * learn about a person.
 */
export const REWIND_RESPONSE_ACTIONS = [
  'ACCEPT_ASSIGNMENT',
  'DECLINE_ASSIGNMENT',
  'MAYBE_ASSIGNMENT',
] as const;

/**
 * The attendance probe. A SINGLE EQUALITY, deliberately NOT a member of the allowlist above:
 * it is asked a different question (did this change at all?) against a different target type,
 * and folding it in would make the allowlist four wide for no gain.
 */
const ATTENDANCE_ACTION = 'ANSWER_ATTENDANCE';

const RESPONSE_BY_ACTION: Record<string, PastResponse> = {
  ACCEPT_ASSIGNMENT: 'ACCEPTED',
  DECLINE_ASSIGNMENT: 'DECLINED',
  MAYBE_ASSIGNMENT: 'MAYBE',
};

export interface GlanceRewind {
  /**
   * The response each assignment carried at `since`, on POSITIVE EVIDENCE ONLY (Ruling 28).
   *
   * Three ways a row earns an entry, and no fourth: the latest ledger row at or before `since`;
   * `PENDING` where a dated FIRST change falls inside the window; otherwise the row's CURRENT
   * response, because nothing is recorded as having changed. ⚠ **Never `PENDING` by default** —
   * that inferred a past value from the absence of a row, and it is what let the replay
   * manufacture good news. See the rule itself, below, for the measurement.
   */
  responseAt: Map<string, PastResponse>;
  /** Assignments created AFTER `since` — she held no such row then. Not the same as PENDING. */
  absentAt: Set<string>;
  /**
   * The ordering key: when this row last moved inside the window.
   *
   * SERVER-SIDE ONLY. It is used to sort the steps and is then DISCARDED — no timestamp of any
   * kind crosses the wire. The payload carries order, not time.
   */
  changedSince: Map<string, number>;
  /**
   * RULING 27 (2026-09-09) — each row's decide-by CLOCK INPUTS, so a maybe that was live or
   * expired at `since` can be told apart.
   *
   * PLAN DATA, NOT GUEST BEHAVIOUR. `Item.dropOffAt` and `Item.decideByOffsetHours` are what
   * the host set, not anything a guest did, so Ruling 1's fence is untouched by carrying them.
   *
   * ⚠ AND IT IS STILL A TIME, SO IT STOPS HERE. The instant is consumed server-side by the
   * shared predicate and never reaches a `ReplayStep`; layer 3's no-timestamp-in-the-payload
   * rule is asserted against a replay that actually used it.
   *
   * WHY THIS FIELD EXISTS AT ALL: `GlanceItem.decideByAt` is DISPLAY data, non-null only for a
   * row that is a maybe NOW. A row that was a maybe at `since` and is not one now carries no
   * instant on the wire, and 6a first dropped the whole PERSON in that case — silencing every
   * other piece of good news they had. Ruling 27 recovers it from the plan instead.
   */
  clockAt: Map<string, DecideByItem>;
  /** The attendance answer at `since`, carried forward where nothing contradicts it. */
  attendanceAt: Map<string, 'YES' | 'NO' | null>;
  /** People whose past state cannot be established. Excluded from the replay, silently. */
  ambiguous: Set<string>;
}

/**
 * The glance's inputs as they stood at `since`.
 *
 * `since` is the viewer's own high-water mark. NULL IS NOT EPOCH and is not this function's
 * problem: the door (`replay-entry.ts`) branches on null before ever calling here, because
 * treating null as a baseline would replay the entire history of the event on a host's first
 * ever visit — the maximum fake-fireworks case, fired on the one visit where she has never
 * been away.
 */
export async function rewindGlanceInputs(
  db: RewindDb,
  eventId: string,
  since: Date
): Promise<GlanceRewind> {
  const responseRows = await db.auditEntry.findMany({
    where: {
      eventId,
      targetType: 'Assignment',
      actionType: { in: [...REWIND_RESPONSE_ACTIONS] },
    },
    select: { targetId: true, actionType: true, timestamp: true, targetType: true },
    orderBy: { timestamp: 'asc' },
  });

  const attendanceRows = await db.auditEntry.findMany({
    where: {
      eventId,
      targetType: 'PersonEvent',
      actionType: ATTENDANCE_ACTION,
      timestamp: { gt: since },
    },
    select: { targetId: true, actionType: true, timestamp: true, targetType: true },
  });

  const assignments = await db.assignment.findMany({
    where: { item: { team: { eventId } } },
    select: {
      id: true,
      createdAt: true,
      // RULING 28. The row's response NOW, which is the past response of any row the ledger
      // does not record as having changed. A decision, not behaviour — the same value
      // `responseAt` already carries, read from the row instead of from the ledger.
      response: true,
      item: { select: { dropOffAt: true, decideByOffsetHours: true } },
    },
  });

  const people = await db.personEvent.findMany({
    where: { eventId },
    select: { id: true, attendanceAnswer: true },
  });

  const responseAt = new Map<string, PastResponse>();
  const changedSince = new Map<string, number>();
  const sinceMs = since.getTime();

  // Rows arrive oldest-first, so the last write at-or-before `since` wins: the LATEST value,
  // not the first. Anything after `since` is movement inside the window and contributes the
  // ordering key instead.
  for (const row of responseRows) {
    const value = RESPONSE_BY_ACTION[row.actionType];
    if (value === undefined) continue;
    const at = row.timestamp.getTime();
    if (at <= sinceMs) {
      responseAt.set(row.targetId, value);
    } else {
      const seen = changedSince.get(row.targetId);
      if (seen === undefined || at > seen) changedSince.set(row.targetId, at);
    }
  }

  // ── RULING 28 (2026-09-09) — POSITIVE EVIDENCE ONLY, FOR RESPONSES TOO ──────────────────
  //
  // ⚠ THE RULE THIS REPLACES WAS A BUG, AND ITS SHAPE IS WORTH KEEPING VISIBLE. It read: an
  // assignment with no ledger row was never responded to, so its past value is `PENDING`. That
  // infers a past value from the ABSENCE of a row, and §5's rule is that no change is ever
  // inferred from a difference alone. Where the inference is wrong — any response written by a
  // path that does not log one — the replay ASSERTS A CHANGE THAT NEVER HAPPENED: a row that is
  // ACCEPTED now reads AMBER at `since`, sparks, and does it again on every visit, for ever.
  // Measured on the 6c browser walk: `since = now − 1 second` produced seven steps, and 25 of
  // the 26 events in `gather_dev` carried no response ledger row at all.
  //
  //   "Responses follow the same positive-evidence rule as attendance."  — Ruling 28
  //
  // Attendance's rule, a few lines below, is: with no row inside the window the answer cannot
  // have changed, so the CURRENT value IS the past value. Applied to responses, that is branch
  // 3. The asymmetry between the two — evidence for one, an assumption for the other — was the
  // whole of the bug.
  //
  // ⚠ IT FAILS TO SILENCE, WHICH IS THE ACCEPTED CONSEQUENCE. On a board whose responses were
  // never logged, nothing replays: `from` equals `to` and the step is dropped. Manufactured
  // good news is the one failure this feature cannot have.
  //
  // ⚠ AND IT DOES NOT SILENCE THE CANONICAL SPARK — branch 2, which is why the rule is three
  // branches and not two. A row whose FIRST ledger entry falls inside the window has a DATED
  // first change, and that positively establishes that at `since` it had never been changed:
  // `PENDING`, the creation default. That is evidence, not the absence the old rule leant on.
  // Pending-when-she-looked, accepted-while-she-was-away is the case the feature exists for,
  // and a rule that silenced it would be worse than the bug it fixes. Asserted as its own case.
  const absentAt = new Set<string>();
  const clockAt = new Map<string, DecideByItem>();
  for (const a of assignments) {
    clockAt.set(a.id, {
      dropOffAt: a.item.dropOffAt,
      decideByOffsetHours: a.item.decideByOffsetHours,
    });
    if (a.createdAt.getTime() > sinceMs) {
      absentAt.add(a.id);
      continue;
    }
    // (1) A dated row at or before `since` already answered it, above.
    if (responseAt.has(a.id)) continue;
    // (2) A dated FIRST change inside the window: it had never changed at `since`.
    if (changedSince.has(a.id)) {
      responseAt.set(a.id, 'PENDING');
      continue;
    }
    // (3) Nothing recorded as having changed, so nothing changed.
    responseAt.set(a.id, a.response as PastResponse);
  }

  const ambiguous = new Set<string>(attendanceRows.map((r) => r.targetId));

  // POSITIVE EVIDENCE ONLY. With no row inside the window the answer cannot have changed, so
  // the current value IS the past value. With a row inside the window it changed, and what it
  // changed to lives in columns this module refuses to read — so the person is dropped rather
  // than guessed at.
  const attendanceAt = new Map<string, 'YES' | 'NO' | null>();
  for (const p of people) {
    if (ambiguous.has(p.id)) continue;
    attendanceAt.set(p.id, (p.attendanceAnswer as 'YES' | 'NO' | null) ?? null);
  }

  return { responseAt, absentAt, changedSince, clockAt, attendanceAt, ambiguous };
}
