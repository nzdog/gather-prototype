/**
 * GTC-168 (A2) — Event lifecycle: the single source of truth.
 *
 * The send-lock model replaces two authored states with one stored fact and one
 * calendar predicate. Plan of record:
 * `docs/04_roadmap/send-lock-reconciliation-plan.md` §1–§3.
 *
 *   DRAFT       status = DRAFT                              authored
 *   CONFIRMING  status = CONFIRMING and sentAt IS NULL      authored
 *   SENT        sentAt IS NOT NULL and now <= endDate       stamped by the press
 *   COMPLETE    now > endDate                               the calendar does it
 *
 * `EventStatus` keeps exactly the two values a human ever chooses. FROZEN and
 * COMPLETE stop being authored states and become, respectively, a timestamp and a
 * derived predicate.
 *
 * WHY DERIVED AND NOT WRITTEN (Moment 4 §10.1): "no one declares it. The calendar
 * does the transition, silently." A cron sweep that *writes* COMPLETE can drift —
 * twenty minutes of downtime past an event's end and a nudge fires after the event,
 * which §10.1 forbids outright. A derived predicate makes that class of bug
 * structurally impossible rather than merely unlikely. A sweep may still CREATE WORK
 * at the boundary (the thank-you offer, GTC-186); it may never SET THE PHASE.
 *
 * NOTHING ELSE IN THE CODEBASE MAY COMPARE event.status TO 'FROZEN' OR 'COMPLETE'
 * after GTC-169..198. This module is the one place the compat shim lives, which is
 * what makes the rollback in plan §9 cost one line.
 *
 * A2 SCOPE: this module is additive. No caller reads it yet — GTC-169 (A3a) flips
 * the consumers.
 */

import type { EventStatus } from '@prisma/client';

export type EventPhase = 'DRAFT' | 'CONFIRMING' | 'SENT' | 'COMPLETE';

/**
 * The minimum an event must carry to have a phase. Deliberately structural rather
 * than the full Prisma `Event` so callers can pass a narrow `select`, and so tests
 * need no database.
 */
export interface LifecycleEvent {
  status: EventStatus;
  sentAt: Date | null;
  endDate: Date;
}

/** The per-person send clock (mini-sends, Hinge §2 gap #5). */
export interface LifecyclePersonEvent {
  sentAt: Date | null;
}

/**
 * Has the press happened?
 *
 * COMPAT SHIM — the `status === 'FROZEN'` clause exists ONLY for events frozen
 * before this migration, and ONLY for the duration of Epic A. GTC-199 (A4) does the
 * one-way data migration and deletes the clause, at which point this is
 * `event.sentAt !== null`. Keeping the shim in exactly one function is what lets
 * every Epic A commit be reverted with `git revert` alone.
 */
export function isSent(event: LifecycleEvent): boolean {
  return event.sentAt !== null || event.status === 'FROZEN';
}

/**
 * Is the event past?
 *
 * The event date passing IS the state change (Moment 4 §10.1). Both sides are UTC
 * instants, so there is no timezone ambiguity in the comparison — `src/lib/timezone.ts`
 * is for display, not for this.
 *
 * Boundary: `now === endDate` is NOT complete. The event ends AT endDate; it is past
 * only once we are beyond it. Strict `>` keeps that honest and is asserted in tests.
 */
export function isComplete(event: LifecycleEvent, now: Date = new Date()): boolean {
  return now.getTime() > event.endDate.getTime();
}

/**
 * The event's phase. SENT and COMPLETE are derived; DRAFT and CONFIRMING are read
 * from the authored status.
 *
 * COMPLETE wins over SENT: a past event is complete whether or not it was ever sent
 * (an event whose date passed without a send is still over). This is also what makes
 * GTC-199's data migration safe — a past event reads COMPLETE regardless of the
 * stored status, so moving those rows to CONFIRMING loses nothing.
 */
export function getEventPhase(event: LifecycleEvent, now: Date = new Date()): EventPhase {
  if (isComplete(event, now)) return 'COMPLETE';
  if (isSent(event)) return 'SENT';
  if (event.status === 'DRAFT') return 'DRAFT';
  return 'CONFIRMING';
}

/**
 * Was this person a mini-send — added after the press, on their own clock?
 *
 * Hinge §2 gap #5. No stored flag is needed: a later personal send date IS the fact.
 * Their nudge cadence and red-by-time run from `personEvent.sentAt` (GTC-178 / E1,
 * GTC-180 / E3), truncated by the event date, so "a Bob added three days out may pass
 * straight to Kate's line" falls out of the arithmetic with no special case.
 */
export function isMiniSend(personEvent: LifecyclePersonEvent, event: LifecycleEvent): boolean {
  if (personEvent.sentAt === null || event.sentAt === null) return false;
  return personEvent.sentAt.getTime() > event.sentAt.getTime();
}

/**
 * When is this ask needed by? The shared derivation behind the red-by-time line
 * (Moment 4 §8.1) and the maybe's decide-by (Hinge §8), per §10.2: "keyed to
 * needed-by — the item's drop-off time where one exists, else the event date."
 *
 * The offset constant that turns needed-by into those two clocks is deliberately NOT
 * here: §10.2 defers it to ticket time with founder sign-off (GTC-180 / E3). This
 * function supplies only the anchor both clocks share.
 */
export function neededBy(item: { dropOffAt: Date | null }, event: LifecycleEvent): Date {
  return item.dropOffAt ?? event.endDate;
}

/**
 * The same event as it arrives over the wire, with dates as ISO strings.
 *
 * GTC-197 (A3c): the host UI needs the identical predicates the server uses — a
 * screen that disagrees with the server about whether a plan is sent is how the old
 * FROZEN divergence started. These adapters exist so there is ONE definition of sent
 * and complete, not a server one and a client one that drift.
 *
 * This module stays client-safe: its only import is a type, which erases at build.
 */
export interface SerialisedEvent {
  status: string;
  sentAt: string | null;
  endDate: string;
}

function parse(event: SerialisedEvent): LifecycleEvent {
  return {
    status: event.status as EventStatus,
    sentAt: event.sentAt ? new Date(event.sentAt) : null,
    endDate: new Date(event.endDate),
  };
}

export function isSentJson(event: SerialisedEvent): boolean {
  return isSent(parse(event));
}

export function isCompleteJson(event: SerialisedEvent, now?: Date): boolean {
  return isComplete(parse(event), now);
}

export function getEventPhaseJson(event: SerialisedEvent, now?: Date): EventPhase {
  return getEventPhase(parse(event), now);
}

/**
 * Prisma `where` fragments, so cron and eligibility queries filter in SQL rather than
 * loading every row and filtering in JS.
 *
 * GTC-169 (A3a) swaps `nudge-eligibility.ts`'s `status: 'CONFIRMING'` for
 * SENT_AND_LIVE. Today, freezing STOPS the nudges — exactly backwards from the ruled
 * model, where the send is when the chasing starts (plan §0.2).
 *
 * Note these read `sentAt` only, with no FROZEN shim: a legacy FROZEN event has its
 * `sentAt` backfilled by this same migration, so the column alone is sufficient at
 * the SQL layer.
 */
export const SENT_AND_LIVE = (now: Date = new Date()) => ({
  sentAt: { not: null },
  endDate: { gt: now },
});

export const COMPLETE_WHERE = (now: Date = new Date()) => ({
  endDate: { lte: now },
});

export const NOT_YET_SENT_WHERE = () => ({
  sentAt: null,
});
