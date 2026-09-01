/**
 * GTC-175 (D2) — The maybe's decide-by clock.
 *
 * Hinge §8 rules a maybe "a decision to decide later": not a silence and not a claim.
 * "The silence cadence asks *did you see this?*; wrong question — he saw it. A maybe
 * needs *time to decide*." So a maybe gets no nudge cadence. It gets a decide-by point,
 * "derived by the system from item logistics and event date, with Kate able to override
 * per item", one follow-up near that point, and red if it passes unanswered.
 *
 * THIS MODULE IS THE SHARED HELPER. Moment 4 §10.2 rules "one derivation, two clocks" —
 * the red-by-time line (§8.1, GTC-180 / E3) and this. GTC-180's Stop Condition 10 exists
 * to stop a second implementation being written. E3 extends what is here; it does not
 * fork it.
 *
 * WHAT IS STORED AND WHAT IS NOT.
 *
 *   STORED   Item.decideByOffsetHours, Event.decideByOffsetHours — the two override
 *            INPUTS, both nullable, both plain hour counts.
 *   DERIVED  the decide-by INSTANT, and the expired state.
 *
 * There is deliberately no `decideByAt` column. A stored instant drifts from the
 * `dropOffAt` / `endDate` it was computed from the moment either moves — and `endDate`
 * does move (it is a MATERIAL_EVENT_FIELD, ledger.ts:65). That is the Item.status
 * mistake (architecture-contract §6), and what it would make lie is a deadline the
 * system texted to a guest. D1 took the same line with attendance.
 *
 * `neededBy()` (lifecycle.ts:117) is consumed EXACTLY as it stands. The offset is not
 * written into it: that function is the anchor both clocks share, and baking D2's
 * constant in would hand E3 a pre-shifted number it cannot un-shift.
 *
 * Client-safe: the only imports are pure functions and types, so the host and guest UI
 * can render the same clock the sweep enforces. One definition, not a server one and a
 * client one that drift.
 */

import { neededBy, isSent, type LifecycleEvent } from './lifecycle';
import type { ResponseBearing } from './attendance';

const HOUR_MS = 60 * 60 * 1000;

/**
 * The system default: 5 days. Founder-signed-off for GTC-175 on 2026-08-05, satisfying
 * Stop Condition 9 ("no founder sign-off exists yet for the derivation constant — stop
 * and request it rather than picking a number").
 *
 * Moment 4 §10.2: "real-event data will correct it." When it is corrected, it is
 * corrected here, once.
 *
 * The host-facing "decide faster" control is not a second constant — it is
 * `Event.decideByOffsetHours` set to 48. See that field's schema comment.
 */
export const DEFAULT_DECIDE_BY_OFFSET_HOURS = 120;

/**
 * How far before the decide-by the single follow-up may go out, as a fraction of the
 * RESOLVED offset — 0.2, so 24h at the 120h default.
 *
 * WHY A FRACTION AND NOT A SECOND CONSTANT. §8 puts the follow-up "near the decide-by"
 * and red "if the decide-by passes unanswered": two distinct instants, so a lead is
 * genuinely required. But a fixed lead breaks the moment Kate overrides — a fixed 24h
 * against a 12h offset would open the window before the clock meant anything. A
 * fraction keeps ONE host-adjustable knob and one number for real-event data to correct.
 */
export const DECIDE_BY_FOLLOWUP_LEAD_FRACTION = 0.2;

/**
 * The lead never drops below this, because quiet hours (21:00–08:00 NZ,
 * quiet-hours.ts:33-39) can defer a batch by up to ~11 hours. A shorter lead could push
 * the follow-up PAST the decide-by and text a guest a deadline that had already expired.
 */
export const DECIDE_BY_FOLLOWUP_LEAD_FLOOR_HOURS = 12;

/** Anything carrying an offset override. Structural, so a narrow `select` works. */
export interface DecideByOffsetSource {
  decideByOffsetHours: number | null;
}

/** The item half of the derivation: `neededBy`'s input plus the layer-1 override. */
export interface DecideByItem extends DecideByOffsetSource {
  dropOffAt: Date | null;
}

/** The event half: the lifecycle facts plus the layer-2 default. */
export interface DecideByEvent extends LifecycleEvent, DecideByOffsetSource {}

/**
 * The offset, resolved in precedence: per-ITEM override, else per-EVENT default, else
 * the system default.
 *
 * A PARAMS OBJECT, NOT POSITIONAL ARGUMENTS — deliberately. Moment 4 §10.2 rules a
 * third axis Kate can set, per-PERSON, which E3 (GTC-180) owns and D2 does not build.
 * When E3 adds it, it adds a key here; every existing call site keeps compiling.
 *
 * Note the `!= null` checks rather than truthiness: ZERO is a legitimate override
 * meaning "decide by the needed-by itself", and `if (item.decideByOffsetHours)` would
 * silently discard it and fall through to five days.
 */
export function resolveDecideByOffsetHours(sources: {
  item?: DecideByOffsetSource | null;
  event?: DecideByOffsetSource | null;
}): number {
  if (sources.item?.decideByOffsetHours != null) return sources.item.decideByOffsetHours;
  if (sources.event?.decideByOffsetHours != null) return sources.event.decideByOffsetHours;
  return DEFAULT_DECIDE_BY_OFFSET_HOURS;
}

/**
 * When must this maybe be decided by?
 *
 * §10.2's formula: keyed to needed-by — the item's drop-off time where one exists, else
 * the event date — "landing far enough before needed-by for a nudge or a reassignment to
 * realistically work". The offset is that runway.
 */
export function decideBy(item: DecideByItem, event: DecideByEvent): Date {
  const offsetHours = resolveDecideByOffsetHours({ item, event });
  return new Date(neededBy(item, event).getTime() - offsetHours * HOUR_MS);
}

/**
 * The follow-up lead, in hours: a fraction of the resolved offset, floored so quiet
 * hours cannot overrun it, and capped at the offset itself so the window can never open
 * before the maybe's runway begins.
 */
export function decideByFollowupLeadHours(item: DecideByItem, event: DecideByEvent): number {
  const offsetHours = resolveDecideByOffsetHours({ item, event });
  const scaled = Math.max(
    offsetHours * DECIDE_BY_FOLLOWUP_LEAD_FRACTION,
    DECIDE_BY_FOLLOWUP_LEAD_FLOOR_HOURS
  );
  return Math.min(scaled, offsetHours);
}

/** The instant the single follow-up becomes eligible to send. */
export function decideByFollowupOpensAt(item: DecideByItem, event: DecideByEvent): Date {
  return new Date(
    decideBy(item, event).getTime() - decideByFollowupLeadHours(item, event) * HOUR_MS
  );
}

/**
 * Has this maybe's clock run out?
 *
 * GTC-175 RULING (a): D2 makes expiry a CORRECT, DERIVABLE STATE and pins it with tests.
 * D2 does NOT surface it. The "standard door" Hinge §8 sends an expired maybe through —
 * exhausted-silence red (GTC-178 / E1) and the person-grid colour encoding (GTC-192 /
 * J1) — does not exist yet. Both tickets are open, both are told this predicate is here
 * waiting, and neither is reached into from D2. The state is expressible and correct;
 * the red is theirs to render when they build the door.
 *
 * Gated on `isSent`: a maybe on an unsent event cannot have run out of time, because its
 * clock has not started. Reachable — the ack routes carry no lifecycle gate by design
 * (GTC-169), and restoreRevision can put a MAYBE back onto a re-drafted event.
 *
 * Strict `>`, mirroring `isComplete` (lifecycle.ts:75): the maybe is due AT the
 * decide-by; it is late only once we are past it.
 */
export function isDecideByExpired(
  assignment: ResponseBearing,
  item: DecideByItem,
  event: DecideByEvent,
  now: Date = new Date()
): boolean {
  if (assignment.response !== 'MAYBE') return false;
  if (!isSent(event)) return false;
  return now.getTime() > decideBy(item, event).getTime();
}

/**
 * Is the single follow-up due right now?
 *
 * Open at `decideBy − lead`, closed the instant the decide-by passes.
 *
 * THE CLOSED HALF IS A RULING, NOT AN OVERSIGHT. A maybe whose decide-by is already
 * behind us gets NO text. This is not an edge case: `Item.dropOffAt` is not host-settable
 * today (the host item PATCH allowlist accepts dropOffLocation and dropOffNote but not
 * dropOffAt), so `neededBy()` collapses to `event.endDate` for essentially every item —
 * and any host who presses send within five days of their event date lands every one of
 * their guests here, born already expired. Texting them "Kate needs to know by
 * <a date last week>" is worse than silence. The state still reads correctly as expired
 * through isDecideByExpired; it simply is not chased.
 */
export function isDecideByFollowupDue(
  assignment: ResponseBearing,
  item: DecideByItem,
  event: DecideByEvent,
  now: Date = new Date()
): boolean {
  if (assignment.response !== 'MAYBE') return false;
  const deadline = decideBy(item, event).getTime();
  if (now.getTime() > deadline) return false;
  return now.getTime() >= decideByFollowupOpensAt(item, event).getTime();
}
