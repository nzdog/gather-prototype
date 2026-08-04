import { prisma } from '@/lib/prisma';
import { isMessageableRole } from '@/lib/eligibility/child-exclusion';

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
    select: { householdRole: true },
  });

  if (membership && !isMessageableRole(membership.householdRole)) {
    return {
      ok: false,
      status: 403,
      error: 'This person is recorded as a child and cannot be messaged directly.',
    };
  }

  return { ok: true, person };
}
