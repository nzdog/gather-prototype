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

/**
 * GTC-256 (Ruling 6, phase 2) — the household message switch.
 *
 * "The host may be her household's contact, AND CHOOSES WHETHER THOSE MESSAGES SEND."
 * This is deliberately NOT Ruling 5. Ruling 5 suppresses the host's OWN ask because of
 * what she is; this is a setting she controls about her HOUSEHOLD's messages. The two
 * are different mechanisms and neither substitutes for the other — the proxy path reads
 * `householdRole` and never `role`, so Ruling 8's `role: HOST` is invisible to it and it
 * requires no PARTICIPANT token to withhold.
 *
 * WHY THIS EXISTS AT ALL — the sequence that makes it blocking (Ruling 11). Ruling 7
 * makes the host the PRIMARY_CONTACT of her own household; `resolveHouseholdChannel`
 * above returns the primary whenever `contactPersonEventId` is null; and null is the
 * state every household starts in. So the host is her own household's proxy channel by
 * default, on every event, with no pick made. `findProxyNudgeCandidates` has no
 * member-count gate, so a host hosting alone under Ruling 2 would be texted
 * "1 person in your group hasn't confirmed yet" ABOUT HERSELF. That is why the switch
 * ships in the same phase as the household and never after it.
 */
export const HOUSEHOLD_MUTED_SKIP_REASON = 'Household messages switched off';

export interface HouseholdMuteState {
  /**
   * GTC-256: NULL = not chosen. Never read this field directly — see the schema
   * docstring on Household.messagesMuted and the resolver below.
   */
  messagesMuted: boolean | null;
  members: { personId: string }[];
}

/**
 * Should this household's channel be silenced?
 *
 * THE DEFAULT IS COMPUTED, NOT STORED, which is the same property GTC-172 bought for
 * `contactPersonEventId` and the reason both ship with no backfill: every existing
 * household is NULL and resolves to exactly today's behaviour.
 *
 *   not the host's household  →  NULL means SENDS   (unchanged, and no control in phase 2)
 *   the host's household      →  NULL means MUTED   (Ruling 6's intent; the switch's
 *                                                    default and Ruling 7's mechanism
 *                                                    disagreed, and this closes the gap)
 *
 * ⚠ AND A HOST HOSTING ALONE CANNOT SWITCH HERS ON (founder ruling, 2026-08-29).
 * A household of one has no household messages — only messages about herself — so a
 * stored `false` is overridden rather than obeyed. This is NOT the general member-count
 * gate on the proxy finder, which would change behaviour for ordinary one-person
 * households too and is a Moment 4 §10.7 question, not this ticket's: it is scoped to
 * the host's OWN household and reaches nothing else. It is a resolution rule rather
 * than a UI rule on purpose — the UI not offering the control is weaker, because she
 * could add a partner, switch it on, and then remove the partner again.
 *
 * COUNTED ON MEMBER ROWS, NOT `littleCount`. Kids without jobs have no PersonEvent, so
 * they are not people the household could be nudged about — and `memberCount` in the
 * proxy candidate is member rows too, so this matches the number the message would say.
 *
 * @param hostPersonId `Event.hostId` — a **Person** id (see schema.prisma,
 *   `host Person @relation("EventHost")`), which under Ruling 10 is exactly the Person
 *   the host's own PersonEvent points at.
 */
export function resolveHouseholdMuted(
  household: HouseholdMuteState,
  hostPersonId: string
): boolean {
  const isHostHousehold = household.members.some((m) => m.personId === hostPersonId);
  if (!isHostHousehold) return household.messagesMuted ?? false;
  if (household.members.length <= 1) return true;
  return household.messagesMuted ?? true;
}
