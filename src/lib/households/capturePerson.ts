import type { Person, Prisma, PrismaClient } from '@prisma/client';
import { isDemoEvent } from '@/lib/demo/send-wall';

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
 *
 * [[GTC-392]] Q4 — ON A SAMPLE EVENT the match looks only at people already on that sample, so a
 * stranger typing a real guest's address and first name makes a NEW person and never reaches the
 * real one's record. Real events keep the rule above, narrowed by GTC-465 below.
 *
 * [[GTC-441]] T2 — THE SAMPLE MARKER. A person made on a sample carries `sampleEventId`, that
 * sample's id, and a real event's match leaves every such person out (`sampleEventId: null`), so a
 * real event never reaches a person made in a sample. "Sample" means `isDemoEvent`, the send wall's
 * meaning. It is read before the address branch, so a person typed with no address is marked too.
 *
 * [[GTC-465]] — MATCHING A TYPED GUEST TO AN EXISTING RECORD (17 Nov 2026; see
 * docs/tickets/GTC-465.md). The typed address is trimmed and compared as plain text. On a real
 * event an existing record is reused only among the same host's own people (`Event.hostId`): the
 * host, the people on that host's real events, and those with an email opt-out on one of them.
 * Samples keep their own scope; only the trim and the plain-text comparison are new there.
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

/** [[GTC-465]]: equal as plain text, outer spaces off and capitals ignored. */
function sameAddress(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * [[GTC-465]]: on a real event, the records a typed row may reuse — the event's own host, anyone
 * on one of that host's real events, and anyone with an email opt-out on one of them (an opt-out
 * is kept per record and per event, so it still holds when a removed guest is typed back). Never
 * a person made in a sample ([[GTC-441]]). No such event: nobody.
 */
async function sameHostScope(db: Db, eventId: string): Promise<Prisma.PersonWhereInput> {
  const event = await db.event.findUnique({ where: { id: eventId }, select: { hostId: true } });
  if (!event) return { id: { in: [] } };
  const hostsRealEvent = { hostId: event.hostId, isDemo: false };
  return {
    sampleEventId: null,
    OR: [
      { id: event.hostId },
      { eventMemberships: { some: { event: hostsRealEvent } } },
      { emailOptOuts: { some: { event: hostsRealEvent } } },
    ],
  };
}

export async function findOrCreateCapturedPerson(
  db: Db,
  input: CapturedPersonInput
): Promise<Person> {
  const name = input.name.trim();
  const email = input.email?.trim() || null;
  const sample = await isDemoEvent(db, input.eventId);

  let person: Person | null = null;
  if (email) {
    const scope: Prisma.PersonWhereInput = sample
      ? { eventMemberships: { some: { eventId: input.eventId } } }
      : await sameHostScope(db, input.eventId);
    const candidates = await db.person.findMany({
      where: { email: { equals: email, mode: 'insensitive' }, ...scope },
      include: { eventMemberships: { where: { eventId: input.eventId }, select: { id: true } } },
      orderBy: { id: 'asc' },
    });
    const first = firstNameOf(name);
    // [[GTC-465]]: the address (as plain text) and the first name decide.
    const matching = candidates.filter(
      (c) => c.email !== null && sameAddress(c.email, email) && firstNameOf(c.name) === first
    );
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
        sampleEventId: sample ? input.eventId : null,
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
