/**
 * GTC-172 (C1) — the household contact picker (Moment 4 §10.7).
 *
 * "Who should Gather talk to for this household?" — defaulting to the primary contact,
 * any adult addable, CROSS-HOUSEHOLD CAPABLE (Grandma's channel may live in another
 * household), "which requires channel as a Person reference, not a boolean". One
 * decision per household, not a matrix.
 *
 * The reference is `Household.contactPersonEventId` → `PersonEvent`. PersonEvent is a
 * person's identity WITHIN an event, so this is a person reference in the sense §10.7
 * means — the point of the ruling is that a channel names somebody, rather than being
 * a flag on a row. Pointing at PersonEvent rather than Person buys two things a bare
 * Person FK cannot: `householdRole` is co-located, so the child check is one join and
 * not a second lookup; and the database cannot express "the channel is a person who
 * isn't in this event".
 *
 * NULL means "not picked" and resolves to the household's PRIMARY_CONTACT here, at
 * read time. That is why the migration ships with no data backfill — the default is
 * computed, so households created before the picker existed behave correctly and there
 * is no backfilled state to drift.
 */

import { isMessageableRole } from '@/lib/eligibility/child-exclusion';

export interface ChannelCandidate {
  id: string;
  householdRole: string | null;
}

export interface HouseholdWithChannel {
  contactPersonEventId: string | null;
  members: ChannelCandidate[];
}

/**
 * Resolve the household's channel: the picked PersonEvent id, else the primary
 * contact's. Returns null when neither exists.
 *
 * NOTE this returns the picked id EVEN IF it points at a CHILD. Resolution and
 * validation are deliberately separate: callers making a send decision must run the
 * result through the child rule and fail closed (see findProxyNudgeCandidates). If
 * this silently fell back to the primary contact for a bad channel, a corrupt row
 * would send a message to someone the host never picked, and the corruption would
 * never surface.
 */
export function resolveHouseholdChannel(household: HouseholdWithChannel): string | null {
  if (household.contactPersonEventId) return household.contactPersonEventId;
  const primary = household.members.find((m) => m.householdRole === 'PRIMARY_CONTACT');
  return primary?.id ?? null;
}

export type ChannelValidation = { ok: true } | { ok: false; error: string };

/**
 * May this PersonEvent be a household's channel?
 *
 * Cross-household is allowed and is the whole point — this deliberately does NOT check
 * `householdId`. What it does check is that the target is in the same EVENT (a channel
 * pointing outside the event is meaningless and would leak across events), and that it
 * is not a CHILD (§10.6).
 */
export function validateChannelTarget(
  target: { eventId: string; householdRole: string | null } | null,
  eventId: string
): ChannelValidation {
  if (!target) {
    return { ok: false, error: 'Contact person not found in this event' };
  }
  if (target.eventId !== eventId) {
    return { ok: false, error: 'Contact person must belong to the same event' };
  }
  if (!isMessageableRole(target.householdRole)) {
    return {
      ok: false,
      error:
        'A child cannot be a household contact. Role them as an adult at capture if they should be messaged directly.',
    };
  }
  return { ok: true };
}
