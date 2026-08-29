import type { Prisma } from '@prisma/client';
import {
  reconcileHouseholdMembers,
  type MemberInput,
  type ReconcileInput,
} from '@/lib/households/reconcileMembers';

/**
 * GTC-256 (phase 2) — THE HOST'S OWN HOUSEHOLD. "The host is at her own party."
 *
 * Ruling 1 (candidate D): Moment 1 opens with the host's own household, because it is
 * the only shape that makes the system's picture match reality. Writing a membership row
 * at event creation (A) or recognising her at read time (C) both leave her absent from
 * her own guest list; linking a captured Person back to the host User (B) needs a rule
 * for detecting which captured person is the host, and no such rule exists.
 *
 * Ruling 10: her PersonEvent points at `Event.hostId`'s EXISTING Person — not a new row.
 * THE FLOW KNOWS WHO IS SIGNED IN, so there is nothing to detect. That is also what
 * makes `wrap-up.ts`'s path-1 filter and `PeopleSection`'s host badge start working with
 * no code change: both key on `personId === Event.hostId`.
 *
 * Ruling 7: she is the PRIMARY_CONTACT of whatever household she is in. Ruling 8: her
 * row carries `role: HOST`, so she gets no PARTICIPANT token and no guest-side page —
 * she is not being invited.
 *
 * ⚠ THIS IS A CREATE PATH FOR NEW EVENTS ONLY. Existing events are phase 5 and are
 * gated on the backfill question (open question 3), because re-roling a row that
 * already holds a PARTICIPANT token requires REVOKING that token — `ensureEventTokens`
 * prunes COORDINATOR tokens only, so a stale PARTICIPANT token is never revoked and
 * would re-open both the sites Ruling 8 closes by construction. Rather than silently
 * doing half of that here, the pre-existing-row cases below refuse.
 */

export class HostHouseholdError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'HostHouseholdError';
    this.status = status;
  }
}

type Tx = Prisma.TransactionClient;

export interface HostHouseholdInput {
  /**
   * Ruling 2: "I'm hosting alone" is an EXPLICIT CHOICE, and taking it makes her a
   * HOUSEHOLD OF ONE, NOT ABSENT — she is still eating. "No household" and "a household
   * containing only me" are different facts and only the second survives Ruling 3.
   */
  alone: boolean;
  /** Her own name. Editable — `POST /api/events` seeds it as `email.split('@')[0]`. */
  name?: string;
  /** Her own phone. Editable, and usually unset until now. */
  phone?: string;
  partner?: MemberInput;
  helpers?: MemberInput[];
  littleCount?: number;
  guests?: MemberInput[];
  /**
   * Ruling 6: whether her household's messages send. `undefined` leaves it unchosen,
   * which resolves to MUTED for her household — see resolveHouseholdMuted.
   */
  messagesMuted?: boolean | null;
}

export interface HostHouseholdContext {
  eventId: string;
  /** `Event.hostId` — a **Person** id, not a User id (schema.prisma, "EventHost"). */
  hostPersonId: string;
  /** `Event.sentAt` — the mini-send clock anchor (GTC-168 A2). */
  sentAt: Date | null;
  input: HostHouseholdInput;
}

/**
 * Create the host's household and her membership row, then reconcile the rest of it.
 *
 * WHY THE MEMBERS GO THROUGH `reconcileHouseholdMembers` RATHER THAN A SECOND COPY OF
 * `createMember`: that function already does find-or-create by email, the young-person
 * roling of §10.6, the reachability derivation, the mini-send stamp and the (personId,
 * eventId) collision handling, and it is the path three regression tests already cover.
 * A second implementation of household capture is how the two drift. This route's own
 * job is the part reconcile cannot do — deciding WHICH Person the primary is, and
 * stamping `role: HOST` on her.
 *
 * ⚠ HER EMAIL IS NEVER TAKEN FROM THE CLIENT. `Person.email` is `@unique` and is what
 * joins her Person to her User; `reconcileHouseholdMembers` writes
 * `email: primaryContact.email || null` on the primary, so passing a client value here
 * would let a blank field silently null her account link, and a typo silently collide
 * with another Person. It is read from the row and passed straight back.
 */
export async function createHostHousehold(prisma: Tx, ctx: HostHouseholdContext) {
  const { eventId, hostPersonId, sentAt, input } = ctx;

  const hostPerson = await prisma.person.findUnique({ where: { id: hostPersonId } });
  if (!hostPerson) {
    throw new HostHouseholdError('Host person not found for this event', 404);
  }

  const existing = await prisma.personEvent.findUnique({
    where: { personId_eventId: { personId: hostPersonId, eventId } },
  });

  if (existing?.householdId) {
    throw new HostHouseholdError('You already have a household on this event', 409);
  }
  if (existing && existing.role !== 'HOST') {
    // The third state, or an event a backfill would have to re-role. Re-roling here
    // without revoking the PARTICIPANT token it may already hold would re-open the
    // auto-nudge finder and the shared-link claim list — build decision 3, phase 5.
    throw new HostHouseholdError(
      'This event already has a membership for the host that is not a host row. GTC-256 Ruling 12 rules no backfill, so this event is not repaired — reseed it rather than patching it.',
      409
    );
  }

  const household = await prisma.household.create({
    data: { eventId, littleCount: 0 },
  });

  // Ruling 8 (`role: HOST`) and Ruling 7 (`householdRole: PRIMARY_CONTACT`). Reachability
  // is left at the column defaults here and set by the reconcile below, so there is one
  // derivation of it and not two.
  //
  // GTC-196: the mini-send clock, same treatment every other capture path gives it.
  const hostMembership = existing
    ? await prisma.personEvent.update({
        where: { id: existing.id },
        data: { householdId: household.id, householdRole: 'PRIMARY_CONTACT' },
      })
    : await prisma.personEvent.create({
        data: {
          personId: hostPersonId,
          eventId,
          role: 'HOST',
          householdId: household.id,
          householdRole: 'PRIMARY_CONTACT',
          sentAt: sentAt ?? null,
        },
      });

  // Ruling 2: "I'm hosting alone" is a household of one — no partner, no helpers, no
  // guests, no littles. Not absent, and not a special kind of household: an ordinary
  // household with one member in it.
  const reconcileInput: ReconcileInput = input.alone
    ? {
        primaryContact: {
          name: (input.name ?? hostPerson.name).trim(),
          email: hostPerson.email ?? undefined,
          phone: input.phone || undefined,
        },
        littleCount: 0,
      }
    : {
        primaryContact: {
          name: (input.name ?? hostPerson.name).trim(),
          email: hostPerson.email ?? undefined,
          phone: input.phone || undefined,
        },
        partner: input.partner,
        helpers: input.helpers,
        littleCount: input.littleCount ?? 0,
        guests: input.guests,
      };

  await reconcileHouseholdMembers(prisma, {
    eventId,
    household: {
      id: household.id,
      members: [
        {
          id: hostMembership.id,
          personId: hostMembership.personId,
          householdRole: hostMembership.householdRole,
        },
      ],
    },
    primaryMember: {
      id: hostMembership.id,
      personId: hostMembership.personId,
      householdRole: hostMembership.householdRole,
    },
    sentAt,
    input: reconcileInput,
  });

  // Ruling 6. `undefined` leaves it unchosen, which resolveHouseholdMuted reads as MUTED
  // for her household — the default the ruling intends, reached without storing it.
  if (input.messagesMuted !== undefined) {
    await prisma.household.update({
      where: { id: household.id },
      data: { messagesMuted: input.messagesMuted },
    });
  }

  return { householdId: household.id, hostPersonEventId: hostMembership.id };
}

/**
 * Does this event's host already have a membership row?
 *
 * THE SEQUENCE GUARANTEE (GTC-256, Ruling 1 read as a sequence and not a screen order).
 * Her row must exist BEFORE any other household can be entered. `createMember` in the
 * households POST does an email lookup and then, when no PersonEvent is found, creates
 * one with a hard-coded `role: 'PARTICIPANT'` — so a host who reaches another household
 * first, and whose email is in it, gets filed as a participant against the correct
 * Person. Once her own row exists the same branch is a complete no-op, because
 * `existing.householdId` is set. The whole difference between those two outcomes is
 * ordering, which is why the ordering is enforced on the server and not only in the UI.
 */
export async function hostHasMembership(prisma: Tx, eventId: string, hostPersonId: string) {
  const row = await prisma.personEvent.findUnique({
    where: { personId_eventId: { personId: hostPersonId, eventId } },
    select: { id: true },
  });
  return row !== null;
}
