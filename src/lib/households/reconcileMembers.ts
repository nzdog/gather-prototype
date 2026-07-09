import type { PrismaClient } from '@prisma/client';
import { normalizePhoneNumber } from '@/lib/phone';

/**
 * Household member write path for PUT /api/events/[id]/households/[householdId].
 *
 * Extracted from the route handler so it can be exercised by a DB-level
 * regression test without the requireEventRole cookie context (GTC-159).
 *
 * Behaviour is diff-based: existing non-primary members are matched to the
 * incoming payload by their stable `personEventId` and updated IN PLACE, so
 * `teamId`, RSVP state and NudgeLog history survive an edit. Only members
 * genuinely removed from the payload are deleted; only genuinely new members
 * are created. This replaces the pre-GTC-159 delete-all-then-recreate path,
 * which silently wiped team membership, reset RSVP, cascaded away nudge logs,
 * and duplicated Person rows for members without an email.
 */

export type MemberRole = 'PARTNER' | 'GUEST' | 'CHILD';

export interface MemberInput {
  /** Stable identity of an existing member's PersonEvent row (absent = new member). */
  personEventId?: string;
  name?: string;
  email?: string;
  phone?: string;
}

export interface PrimaryContactInput {
  name: string;
  email?: string;
  phone?: string;
}

export interface ReconcileInput {
  primaryContact: PrimaryContactInput;
  partner?: MemberInput;
  helpers?: MemberInput[];
  littleCount?: number;
  guests?: MemberInput[];
}

/** Minimal shape of the household loaded with members + person. */
export interface LoadedMember {
  id: string;
  personId: string;
  householdRole: string | null;
}
export interface LoadedHousehold {
  id: string;
  members: LoadedMember[];
}

export interface ReconcileContext {
  eventId: string;
  household: LoadedHousehold;
  /** The already-resolved primary-contact member (householdRole PRIMARY_CONTACT). */
  primaryMember: LoadedMember;
  /** Event.inviteSendConfirmedAt — used to anchor invite timing on Person. */
  inviteSendConfirmedAt: Date | null;
  input: ReconcileInput;
}

function reachabilityFor(phone: string | null, email: string | null | undefined) {
  if (phone) return { contactMethod: 'SMS' as const, reachabilityTier: 'DIRECT' as const };
  if (email) return { contactMethod: 'EMAIL' as const, reachabilityTier: 'DIRECT' as const };
  return { contactMethod: 'NONE' as const, reachabilityTier: 'UNTRACKABLE' as const };
}

export async function reconcileHouseholdMembers(
  prisma: PrismaClient,
  ctx: ReconcileContext
): Promise<void> {
  const { eventId, household, primaryMember, inviteSendConfirmedAt, input } = ctx;
  const { primaryContact, partner, helpers, littleCount, guests } = input;

  // --- Primary contact: update Person + PersonEvent in place (unchanged) ---
  const normalizedPrimaryPhone = primaryContact.phone
    ? normalizePhoneNumber(primaryContact.phone)
    : null;

  await prisma.person.update({
    where: { id: primaryMember.personId },
    data: {
      name: primaryContact.name.trim(),
      email: primaryContact.email || null,
      phoneNumber: normalizedPrimaryPhone,
    },
  });

  const primaryReach = reachabilityFor(normalizedPrimaryPhone, primaryContact.email);
  await prisma.personEvent.update({
    where: { id: primaryMember.id },
    data: {
      reachabilityTier: primaryReach.reachabilityTier,
      contactMethod: primaryReach.contactMethod,
    },
  });

  await prisma.household.update({
    where: { id: household.id },
    data: { littleCount: littleCount ?? 0 },
  });

  // --- Non-primary members: diff-based reconcile (GTC-159) -------------------
  // Match incoming members to existing rows by their stable `personEventId` and
  // update in place; create only genuinely new members; delete only members
  // actually removed. teamId / rsvpStatus / NudgeLog are never touched on an
  // in-place update, so they survive an edit.
  const existingNonPrimary = household.members.filter((m) => m.householdRole !== 'PRIMARY_CONTACT');
  const existingById = new Map(existingNonPrimary.map((m) => [m.id, m]));
  const keptIds = new Set<string>();

  // Flatten the incoming payload into (member, role) pairs, named members only.
  const incoming: { member: MemberInput; role: MemberRole }[] = [];
  if (partner?.name?.trim()) incoming.push({ member: partner, role: 'PARTNER' });
  for (const helper of helpers ?? []) {
    if (helper.name?.trim()) incoming.push({ member: helper, role: 'CHILD' });
  }
  for (const guest of guests ?? []) {
    if (guest.name?.trim()) incoming.push({ member: guest, role: 'GUEST' });
  }

  /** Update an existing member's Person + PersonEvent in place; never touches teamId/rsvp/nudge. */
  async function updateExistingMember(
    existing: LoadedMember,
    member: MemberInput,
    role: MemberRole
  ) {
    const normalizedPhone = member.phone ? normalizePhoneNumber(member.phone) : null;
    let person = await prisma.person.update({
      where: { id: existing.personId },
      data: {
        name: member.name!.trim(),
        email: member.email || null,
        phoneNumber: normalizedPhone,
      },
    });
    if (inviteSendConfirmedAt && !person.inviteAnchorAt) {
      person = await prisma.person.update({
        where: { id: person.id },
        data: { inviteAnchorAt: inviteSendConfirmedAt },
      });
    }
    const reach = reachabilityFor(person.phoneNumber, person.email);
    await prisma.personEvent.update({
      where: { id: existing.id },
      data: {
        householdRole: role,
        reachabilityTier: reach.reachabilityTier,
        contactMethod: reach.contactMethod,
      },
    });
  }

  /** Create a genuinely new member (find-or-create Person by email; upsert PersonEvent by (personId,eventId)). */
  async function createNewMember(member: MemberInput, role: MemberRole) {
    const normalizedPhone = member.phone ? normalizePhoneNumber(member.phone) : null;

    let person = member.email
      ? await prisma.person.findUnique({ where: { email: member.email } })
      : null;

    if (!person) {
      person = await prisma.person.create({
        data: {
          name: member.name!.trim(),
          email: member.email || null,
          phoneNumber: normalizedPhone,
          inviteAnchorAt: inviteSendConfirmedAt || null,
        },
      });
    } else if (inviteSendConfirmedAt && !person.inviteAnchorAt) {
      person = await prisma.person.update({
        where: { id: person.id },
        data: { inviteAnchorAt: inviteSendConfirmedAt },
      });
    }

    const reach = reachabilityFor(person.phoneNumber, person.email);

    // A Person may already have a PersonEvent for this event (e.g. re-parented
    // from another household). Reuse it rather than violating the unique
    // (personId,eventId) constraint.
    const existing = await prisma.personEvent.findUnique({
      where: { personId_eventId: { personId: person.id, eventId } },
    });
    if (existing) {
      keptIds.add(existing.id);
      if (!existing.householdId || existing.householdId === household.id) {
        await prisma.personEvent.update({
          where: { id: existing.id },
          data: { householdId: household.id, householdRole: role },
        });
      }
      return;
    }

    await prisma.personEvent.create({
      data: {
        personId: person.id,
        eventId,
        role: 'PARTICIPANT',
        reachabilityTier: reach.reachabilityTier,
        contactMethod: reach.contactMethod,
        householdId: household.id,
        householdRole: role,
      },
    });
  }

  for (const { member, role } of incoming) {
    const matched = member.personEventId ? existingById.get(member.personEventId) : undefined;
    if (matched) {
      keptIds.add(matched.id);
      await updateExistingMember(matched, member, role);
    } else {
      await createNewMember(member, role);
    }
  }

  // Delete members that were present before but are absent from the payload.
  // Their NudgeLog rows cascade — correct, the member is genuinely leaving.
  for (const existing of existingNonPrimary) {
    if (!keptIds.has(existing.id)) {
      await prisma.personEvent.delete({ where: { id: existing.id } });
    }
  }
}
