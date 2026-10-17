import type { Person, Prisma, PrismaClient } from '@prisma/client';

/**
 * [[GTC-293]] — WHO A TYPED ROW IS. The one identity rule every capture site shares: the
 * households `POST` (`createMember`), the household edit (`createNewMember` inside
 * `reconcileHouseholdMembers`), and the V1 people and batch-import `POST`s.
 *
 * Each of the four used to find-or-create a `Person` by `Person.email` alone, which was
 * `@unique`. So two people who share one inbox could not both exist: on create the second was
 * never made, and on edit the primary contact was demoted into an uneditable household.
 * GTC-293 dropped the constraint, and the founder ruled what replaces the match (2026-09-29):
 *
 * - Q1 — the ADDRESS AND THE FIRST NAME. "People are typed as 'Kate' one time and 'Kate
 *   Henderson' the next; a full-name match would split them into two people and leave the
 *   first one's opt-outs behind. Mum and Dad at one address still come out as two people."
 *   `EmailOptOut` is keyed on the Person, so a re-typed person must land on the same row.
 * - Q2 — the same first name at the same address is the same person, on this event or
 *   another. Across events that means the name already on that Person shows: the ruled trade.
 * - Q8 — the host's own address follows the same rule. With her first name it is her (and
 *   GTC-256's guards take it from there); with another first name it is somebody who shares
 *   her inbox, and is asked like any other adult (GTC-293 ruling 3: each their own email).
 *
 * `tests/shared-address-test.ts` holds the rule's behaviour.
 */

type Db = Prisma.TransactionClient | PrismaClient;

export interface CapturedPersonInput {
  eventId: string;
  /** `Event.hostId` — Q8: where history left several matches, her own Person is the one. */
  hostPersonId: string | null;
  name: string;
  email?: string | null;
  /** Already normalised by the caller. */
  phoneNumber: string | null;
  /** `Event.sentAt` — anchors `inviteAnchorAt`, as every capture site did before. */
  sentAt: Date | null;
}

/** Q1's "first name". */
export function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
}

export async function findOrCreateCapturedPerson(
  db: Db,
  input: CapturedPersonInput
): Promise<Person> {
  const name = input.name.trim();
  const email = input.email || null;

  let person: Person | null = null;
  if (email) {
    const candidates = await db.person.findMany({
      where: { email: { equals: email, mode: 'insensitive' } },
      include: { eventMemberships: { where: { eventId: input.eventId }, select: { id: true } } },
      orderBy: { id: 'asc' },
    });
    const first = firstNameOf(name);
    const matching = candidates.filter((c) => firstNameOf(c.name) === first);
    // Deterministic where history left more than one (Q8 puts the host first).
    const chosen =
      matching.find((c) => c.id === input.hostPersonId) ??
      matching.find((c) => c.eventMemberships.length > 0) ??
      matching[0];
    if (chosen) {
      const { eventMemberships: _memberships, ...found } = chosen;
      person = found;
    }
  }

  if (!person) {
    return db.person.create({
      data: {
        name,
        email,
        phoneNumber: input.phoneNumber,
        inviteAnchorAt: input.sentAt || null,
      },
    });
  }

  if (input.sentAt && !person.inviteAnchorAt) {
    return db.person.update({
      where: { id: person.id },
      data: { inviteAnchorAt: input.sentAt },
    });
  }
  return person;
}
