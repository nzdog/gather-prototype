import { prisma } from '@/lib/prisma';
import { isMessageableRole } from '@/lib/eligibility/child-exclusion';
import { isHostMembership, HOST_NOT_ADDRESSABLE_MESSAGE } from '@/lib/eligibility/host-exclusion';
import { isValidNZNumber } from '@/lib/phone';

/**
 * THE host-triggered nudge recipient decision (GTC-172 / C1).
 *
 * Extracted from POST /api/events/[id]/people/[personId]/nudge so it can be exercised
 * by a DB-level test without the requireEventRole cookie context — the same reason and
 * the same pattern as reconcileHouseholdMembers (GTC-159).
 *
 * The route takes `personId` straight from the URL, so "the host clicked it" is the
 * only thing standing between a CHILD-role person and an SMS. Moment 4 §10.6 is
 * absolute — a CHILD never receives a system message regardless of contact info, and
 * regardless of who asked for it to be sent. A host action is not an exemption.
 */

export interface ManualNudgePerson {
  id: string;
  name: string;
  email: string | null;
  phoneNumber: string | null;
  smsOptedOut: boolean;
}

export type ManualNudgeRecipient =
  | { ok: true; person: ManualNudgePerson }
  | { ok: false; status: number; error: string };

export async function resolveManualNudgeRecipient(
  eventId: string,
  personId: string
): Promise<ManualNudgeRecipient> {
  const person = await prisma.person.findUnique({
    where: { id: personId },
    select: {
      id: true,
      name: true,
      email: true,
      phoneNumber: true,
      smsOptedOut: true,
    },
  });

  if (!person) {
    return { ok: false, status: 404, error: 'Person not found' };
  }

  // GTC-172 (C1): the child rule (§10.6). 403 rather than 404 — the person exists and
  // the host may see them; what is forbidden is messaging them. The host UI omits the
  // nudge control for children, but `personId` comes straight from the URL, so the UI
  // is a courtesy and this is the gate.
  const membership = await prisma.personEvent.findUnique({
    where: { personId_eventId: { personId, eventId } },
    select: { householdRole: true, role: true },
  });

  if (membership && !isMessageableRole(membership.householdRole)) {
    return {
      ok: false,
      status: 403,
      error: 'This person is recorded as a child and cannot be messaged directly.',
    };
  }

  /*
   * GTC-256 (phase 3), RULING 5 — THE HOST MAY NOT BE NUDGED, INCLUDING BY HERSELF.
   *
   * Founder answer, 2026-08-29: "Yes — refuse the manual nudge at the host. 403, matching
   * the child rule's shape in that function." Ruling 5 names five things she never
   * receives; a nudge she presses at her own row is her own ask arriving by the one door
   * the ruling did not enumerate, and "the host is not an addressee" reads across it.
   *
   * NOT A THEORETICAL PATH. `invite-status` returns every membership row, so her own row
   * renders in `InviteStatusSection`, and clicking it opens `PersonInviteDetailModal` →
   * `NudgeComposer` → this route. It was one click, not a crafted request.
   *
   * SAME PLACE AND SAME SHAPE AS THE CHILD GATE ABOVE, for the reason that gate gives:
   * `personId` comes straight from the URL, so the host UI omitting a control is a
   * courtesy and this is the gate. 403 rather than 404 for the same reason too — the
   * person exists and the host may see them; what is forbidden is messaging them. This
   * route is host-authenticated, so unlike the shared-link claim endpoint there is no
   * oracle to protect against.
   *
   * The event is loaded for `hostId` alone. It is a second query rather than a join
   * because the membership lookup above is a `findUnique` on the compound key and adding
   * a relation to it would widen the row every caller pays for.
   */
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { hostId: true },
  });

  if (event && isHostMembership({ personId, role: membership?.role }, event.hostId)) {
    return {
      ok: false,
      status: 403,
      error: HOST_NOT_ADDRESSABLE_MESSAGE,
    };
  }

  return { ok: true, person };
}

/**
 * Which channel a host-triggered nudge takes (GTC-214).
 *
 * Extracted from POST /api/events/[id]/people/[personId]/nudge for the reason this file
 * already exists: so the decision can be asserted without the route's cookie context.
 *
 * WHAT THIS DELIBERATELY DOES NOT CONSULT: provider configuration. The expression this
 * replaces ANDed "the number is a valid NZ number" with `isSmsEnabled()` — the TWILIO
 * predicate — so on a TNZ-only deployment a guest with a perfectly good +64 mobile
 * resolved to 'email', and the host was told the nudge succeeded. Reachability is a
 * property of the recipient; whether a provider can be reached is `sendSms`'s to answer,
 * and it answers per destination. If SMS genuinely cannot be sent the route surfaces a
 * 502 — an honest failure the host can act on, rather than a silent channel switch.
 */
export type ManualNudgeChannel = 'sms' | 'email' | 'none';

export function chooseManualNudgeChannel(person: {
  phoneNumber: string | null;
  smsOptedOut: boolean;
  email: string | null;
}): ManualNudgeChannel {
  // `smsOptedOut` is Do-Not-Touch zone 7 — it outranks the phone number in both
  // directions, asserted in tests/nudge-provider-gate-test.ts case C.
  if (person.phoneNumber && isValidNZNumber(person.phoneNumber) && !person.smsOptedOut) {
    return 'sms';
  }
  if (person.email) return 'email';
  return 'none';
}
