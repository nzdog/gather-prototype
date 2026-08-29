import type { Prisma } from '@prisma/client';

/**
 * GTC-201 (A3b-2): this takes a TRANSACTION CLIENT, not the bare PrismaClient.
 *
 * The function performs six-plus dependent writes — a Person update, a PersonEvent
 * update, a Household update, then per-member updates, creates and deletes. It ran
 * them as sequential awaits with no transaction, so a failure part-way left a
 * household half-reconciled: some members renamed, others not, some deleted with
 * their replacements never created.
 *
 * That was recorded as the residual risk when GTC-159 (commit b73f140) replaced the
 * old delete-and-recreate with this diff — "the reconcile path still runs with no
 * transaction" (discovery report §5, July 2026). Wiring the ledger forces the fix,
 * because recordChange() requires a tx: an entry that survives a rolled-back write
 * describes something that never happened (gather-architecture-contract §7).
 */
type Tx = Prisma.TransactionClient;
import { normalizePhoneNumber } from '@/lib/phone';
import { validateChannelTarget } from '@/lib/households/channel';
import { isMessageableRole } from '@/lib/eligibility/child-exclusion';

/**
 * GTC-172 (C1): thrown when a household contact picker target is invalid (wrong event,
 * or a CHILD). Routes map this to a 400 rather than a 500 — it is a bad request, not a
 * server fault. Thrown inside the transaction, so the whole edit rolls back: a
 * rejected channel must not leave a half-applied member reconcile behind.
 */
export class ChannelValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChannelValidationError';
  }
}

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
  /**
   * GTC-172 (C1): the explicit adult-roling path (Moment 4 §10.6). Only meaningful on
   * a `helpers[]` entry — a kid with a job whom the host has DELIBERATELY decided is
   * old enough to be messaged directly. It stores `householdRole: GUEST` instead of
   * CHILD.
   *
   * This is a payload input, never stored as a flag: there is no "child, but
   * messageable" state on the row, because that is exactly the soft override §10.6
   * forbids. The stored gate remains householdRole alone. It defaults to false, is
   * never pre-set by the UI, and is NEVER inferred from the presence of a phone number
   * or from anything else about the person's data.
   */
  adultRoled?: boolean;
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
  /**
   * GTC-172 (C1): the household contact picker (§10.7). `undefined` leaves the current
   * channel alone; `null` clears it back to "default to the primary contact".
   */
  contactPersonEventId?: string | null;
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
  /** Event.sentAt — used to anchor invite timing on Person. */
  sentAt: Date | null;
  input: ReconcileInput;
}

function reachabilityFor(phone: string | null, email: string | null | undefined) {
  if (phone) return { contactMethod: 'SMS' as const, reachabilityTier: 'DIRECT' as const };
  if (email) return { contactMethod: 'EMAIL' as const, reachabilityTier: 'DIRECT' as const };
  return { contactMethod: 'NONE' as const, reachabilityTier: 'UNTRACKABLE' as const };
}

export async function reconcileHouseholdMembers(prisma: Tx, ctx: ReconcileContext): Promise<void> {
  const { eventId, household, primaryMember, sentAt, input } = ctx;
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
  //
  // GTC-172 (C1): a helper is a "kid with a job". `adultRoled` is the host's explicit
  // decision that this particular one is old enough to be messaged directly (§10.6),
  // and it changes the STORED ROLE rather than adding an override beside CHILD.
  // `isYoungPerson` is carried separately and is DISPLAY ONLY — it keeps a re-roled
  // teenager rendering in the helpers list instead of silently reappearing among the
  // guests on reload, and it never affects eligibility.
  const incoming: { member: MemberInput; role: MemberRole; isYoungPerson: boolean }[] = [];
  if (partner?.name?.trim())
    incoming.push({ member: partner, role: 'PARTNER', isYoungPerson: false });
  for (const helper of helpers ?? []) {
    if (helper.name?.trim()) {
      incoming.push({
        member: helper,
        role: helper.adultRoled ? 'GUEST' : 'CHILD',
        isYoungPerson: true,
      });
    }
  }
  for (const guest of guests ?? []) {
    if (guest.name?.trim()) incoming.push({ member: guest, role: 'GUEST', isYoungPerson: false });
  }

  /** Update an existing member's Person + PersonEvent in place; never touches teamId/rsvp/nudge. */
  async function updateExistingMember(
    existing: LoadedMember,
    member: MemberInput,
    role: MemberRole,
    isYoungPerson: boolean
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
    if (sentAt && !person.inviteAnchorAt) {
      person = await prisma.person.update({
        where: { id: person.id },
        data: { inviteAnchorAt: sentAt },
      });
    }
    const reach = reachabilityFor(person.phoneNumber, person.email);
    await prisma.personEvent.update({
      where: { id: existing.id },
      data: {
        householdRole: role,
        isYoungPerson,
        reachabilityTier: reach.reachabilityTier,
        contactMethod: reach.contactMethod,
      },
    });
  }

  /** Create a genuinely new member (find-or-create Person by email; upsert PersonEvent by (personId,eventId)). */
  async function createNewMember(member: MemberInput, role: MemberRole, isYoungPerson: boolean) {
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
          inviteAnchorAt: sentAt || null,
        },
      });
    } else if (sentAt && !person.inviteAnchorAt) {
      person = await prisma.person.update({
        where: { id: person.id },
        data: { inviteAnchorAt: sentAt },
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

      // GTC-256 (Ruling 7) — THE DEMOTION GUARD. The host's householdRole must never be
      // written to anything but PRIMARY_CONTACT, and her householdId must never be moved.
      //
      // ⚠ THIS CORRECTS AN EARLIER READING RECORDED IN THE TICKET, which said Ruling 7
      // closes the risk by construction and no guard should be written. That is right
      // about DELETION and wrong about DEMOTION, and demotion re-opens deletion. The
      // delete loop below iterates `existingNonPrimary`, so a PRIMARY_CONTACT is never in
      // it — but THIS branch writes `householdRole` directly, and
      // `existing.householdId === household.id` is true whenever the host edits her OWN
      // household. So if her email reaches this payload's partner/helpers/guests arrays —
      // a form bug, a stale client, or her typing it into a guest row — she is demoted to
      // PARTNER/GUEST/CHILD, and three things follow: she lands in `existingNonPrimary`
      // so the NEXT edit that omits her deletes her row and cascades her NudgeLog; the
      // household is left with no PRIMARY_CONTACT, which makes the PUT route 400 and the
      // household UNEDITABLE; and resolveHouseholdChannel returns null for it, so the
      // proxy finder skips it as 'No primary contact'.
      //
      // A TOTAL NO-OP, both arms, deliberately. For her own household there is nothing to
      // write — Ruling 7 already made her its PRIMARY_CONTACT. For any OTHER household,
      // Ruling 7 says she cannot join as a PARTNER, and skipping is what the POST path
      // already does by accident (its condition is `!existing.householdId` alone). Whether
      // the blocked self-add should SAY so is build decision 4 and is not settled; it is
      // not silent in practice here, because the route returns the household as saved and
      // the client re-renders from that response.
      //
      // MATCHED ON `role`, not on a threaded-through hostId: `role: HOST` is the property
      // Ruling 8 stamps and the one Ruling 7 attaches to, and it is already on the row.
      // `updateExistingMember` needs no such guard — it is only reached for members found
      // in `existingById`, which is built from `existingNonPrimary`, and the host is never
      // in that map.
      if (existing.role === 'HOST') return;

      if (!existing.householdId || existing.householdId === household.id) {
        await prisma.personEvent.update({
          where: { id: existing.id },
          data: { householdId: household.id, householdRole: role, isYoungPerson },
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
        isYoungPerson,
        // GTC-196: the mini-send clock — see people/route.ts for the full note.
        sentAt: sentAt ?? null,
      },
    });
  }

  for (const { member, role, isYoungPerson } of incoming) {
    const matched = member.personEventId ? existingById.get(member.personEventId) : undefined;
    if (matched) {
      keptIds.add(matched.id);
      await updateExistingMember(matched, member, role, isYoungPerson);
    } else {
      await createNewMember(member, role, isYoungPerson);
    }
  }

  // Delete members that were present before but are absent from the payload.
  // Their NudgeLog rows cascade — correct, the member is genuinely leaving.
  for (const existing of existingNonPrimary) {
    if (!keptIds.has(existing.id)) {
      await prisma.personEvent.delete({ where: { id: existing.id } });
    }
  }

  // --- Household contact channel (GTC-172 / C1, §10.7) -----------------------
  // Applied AFTER the member reconcile so it validates against post-edit roles, and so
  // a channel whose member was just removed is already NULL via the FK's ON DELETE SET
  // NULL rather than being re-pointed at a deleted row.
  if (input.contactPersonEventId !== undefined) {
    if (input.contactPersonEventId === null) {
      await prisma.household.update({
        where: { id: household.id },
        data: { contactPersonEventId: null },
      });
    } else {
      const target = await prisma.personEvent.findUnique({
        where: { id: input.contactPersonEventId },
        select: { eventId: true, householdRole: true },
      });
      const check = validateChannelTarget(target, eventId);
      if (!check.ok) throw new ChannelValidationError(check.error);
      await prisma.household.update({
        where: { id: household.id },
        data: { contactPersonEventId: input.contactPersonEventId },
      });
    }
  }

  // A member re-roled INTO CHILD while holding the channel would leave a channel the
  // picker would never have allowed. The eligibility layer already fails closed on
  // that (findProxyNudgeCandidates), but leaving the row is silent corruption, so
  // clear it back to the primary-contact default here.
  const current = await prisma.household.findUnique({
    where: { id: household.id },
    select: { contactPersonEventId: true },
  });
  if (current?.contactPersonEventId) {
    const channel = await prisma.personEvent.findUnique({
      where: { id: current.contactPersonEventId },
      select: { householdRole: true },
    });
    if (channel && !isMessageableRole(channel.householdRole)) {
      await prisma.household.update({
        where: { id: household.id },
        data: { contactPersonEventId: null },
      });
    }
  }
}
