/**
 * GTC-191 (a) — who a recipient's message carries, resolved for the guest page.
 *
 * WHAT THIS ANSWERS. [[GTC-189]]'s founder ruling (2026-09-13) routes a child's item through
 * their household contact: "A child's item is carried in their household contact's message.
 * That is the only case where a message carries someone else's ask." Ruling D item 3 then
 * found the other half missing — the page that link opens returned only the link holder's own
 * assignments, so the message asked a question the page could not take an answer to.
 *
 * ⚠ DO-NOT-TOUCH ZONE 3, ENTERED UNDER APPROVAL (founder, 2026-09-18, for exactly five
 * things: the three route changes, the separated GET field, the audit line naming both
 * people, the 403, and the security fence — "no issuance, no scope, no schema"). Nothing here
 * issues, revokes or widens a token. `AccessToken.scope` is unchanged, `ensureEventTokens` is
 * unchanged, and the `@@unique([eventId, personId, scope, teamId])` constraint is untouched.
 * What changes is what a PARTICIPANT token may READ and WRITE, and this module is the whole
 * of that decision.
 *
 * ── THE PREDICATE IS THE CHOOSER, RE-RUN. THAT IS THE DESIGN. ─────────────────
 *
 * `chooseAskRoute` in `./channel-chooser.ts` is the function that decided to put the child's
 * ask in her message. This asks it again, at the moment of the read or the write, and admits
 * exactly the children it answers `CARRIED` for with her membership as the recipient.
 *
 * So the fence is the chooser's own ladder rather than a second set of checks, and five
 * refusals hold by construction rather than by inspection:
 *
 *   - an ADULT is never carried          `resolveCarrier` runs only for a non-messageable
 *                                        `householdRole`
 *   - a child of a household that did    the carrier is `contactPersonEventId`, else the
 *     not pick her                       PRIMARY_CONTACT, and nobody else resolves
 *   - a child of the HOST'S OWN          refused `HOST_HOUSEHOLD_CHILD` before the contact is
 *     household                          resolved (ruling A, as corrected)
 *   - a child of a MUTED household       refused `HOUSEHOLD_MUTED` — a closed carrier route
 *                                        closes the answer with it
 *   - a child holding nothing            `CHILD_WITHOUT_ITEM`, not a recipient at all
 *
 * A HOUSEHOLD LOOKUP WOULD BE A SECOND READING OF RULING A2, and the header of
 * `src/lib/preflight/ask-preview.ts` records what that costs: its mirror of
 * `ensureEventTokens` had to move with [[GTC-294]] or the screen would have gone on
 * contradicting the database. One predicate, two callers.
 *
 * ⚠ TWO CONSTRUCTIONS OF THE CHOOSER CONTEXT EXIST, DELIBERATELY AND TEMPORARILY.
 * `readAskPreview` builds its own `ChooserEvent` from rows it already needs for other
 * purposes. This module builds a second one rather than editing that file, because
 * [[GTC-189]] slice 5 owns `ask-preview.ts` next — the founder ordered its `LinkState` change
 * BEFORE this ticket — and editing it from under that work would be a conflict for no gain.
 * The two are held in agreement by a test rather than by a comment:
 * `tests/carried-answer-test.ts` layer X runs both over every recipient of one event and
 * fails if they name different children. Whoever merges them later deletes that layer.
 *
 * READS ONLY. Takes a client so a transaction or a test can drive it.
 */

import type { Prisma } from '@prisma/client';
import { chooseAskRoute, type ChooserEvent } from './channel-chooser';
import { firstNameOf } from '@/lib/messages/ask-register';

type Db = Prisma.TransactionClient;

/** A child whose ask this recipient's message carries. */
export interface CarriedSubject {
  personEventId: string;
  personId: string;
  name: string;
  firstName: string;
}

/**
 * Everyone this person's ask message carries on this event.
 *
 * Empty for almost everybody, which is the point: a recipient who carries nobody is handed an
 * empty list and the route behaves exactly as it did before this ticket.
 *
 * Keyed on `personId` because that is what a token resolves to. The membership is looked up
 * here so no caller has to, and a person with no membership on the event carries nobody.
 */
export async function resolveCarriedSubjects(
  db: Db,
  eventId: string,
  carrierPersonId: string
): Promise<CarriedSubject[]> {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { hostId: true },
  });
  if (!event) return [];

  const [memberships, households, assignments] = await Promise.all([
    db.personEvent.findMany({
      where: { eventId },
      select: {
        id: true,
        personId: true,
        role: true,
        householdId: true,
        householdRole: true,
        nudgeMark: true,
        person: {
          select: { name: true, email: true, phoneNumber: true, smsOptedOut: true },
        },
      },
    }),
    db.household.findMany({
      where: { eventId },
      select: { id: true, contactPersonEventId: true, messagesMuted: true },
    }),
    db.assignment.findMany({
      where: { item: { team: { eventId } } },
      select: { personId: true },
    }),
  ]);

  const carrier = memberships.find((m) => m.personId === carrierPersonId);
  if (!carrier) return [];

  const holders = new Set(assignments.map((a) => a.personId));

  const phones = memberships.map((m) => m.person.phoneNumber).filter((n): n is string => !!n);
  // [[GTC-301]], the fact slice 1 answer 6 requires each caller to name: opted out if EITHER
  // `Person.smsOptedOut` is true OR an `SmsOptOut` row exists for the number under THIS
  // event's host. Read per host because that is what `checkOptOut` refuses on today; the
  // widening to account-wide is [[GTC-288]]'s. Same fact `readAskPreview` passes.
  const optedOutNumbers = new Set(
    phones.length === 0
      ? []
      : (
          await db.smsOptOut.findMany({
            where: { hostId: event.hostId, phoneNumber: { in: phones } },
            select: { phoneNumber: true },
          })
        ).map((o) => o.phoneNumber)
  );

  const chooserEvent: ChooserEvent = {
    hostId: event.hostId,
    households,
    memberships: memberships.map((m) => ({
      id: m.id,
      personId: m.personId,
      role: m.role,
      householdId: m.householdId,
      householdRole: m.householdRole,
      nudgeMark: m.nudgeMark,
      // A row of EITHER kind. A child holding only a job holds something — the rule
      // `readAskPreview`'s header states and `tests/ask-preview-test.ts` layer J pins.
      holdsItems: holders.has(m.personId),
      person: {
        email: m.person.email,
        phoneNumber: m.person.phoneNumber,
        smsOptedOut:
          m.person.smsOptedOut ||
          (!!m.person.phoneNumber && optedOutNumbers.has(m.person.phoneNumber)),
      },
    })),
  };

  const byId = new Map(memberships.map((m) => [m.id, m]));
  const carried: CarriedSubject[] = [];

  for (const subject of chooserEvent.memberships) {
    const route = chooseAskRoute(subject, chooserEvent);
    if (route.kind !== 'CARRIED' || route.recipientId !== carrier.id) continue;
    const m = byId.get(subject.id)!;
    carried.push({
      personEventId: m.id,
      personId: m.personId,
      name: m.person.name,
      firstName: firstNameOf(m.person.name),
    });
  }

  return carried.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * May this person answer that person's row on this event?
 *
 * The write path's form of the same question. Kept beside the read's so there is one place
 * to change if the ruling ever widens — and so a reader cannot conclude that the page and the
 * route ask different things.
 */
export async function mayAnswerFor(
  db: Db,
  eventId: string,
  carrierPersonId: string,
  subjectPersonId: string
): Promise<boolean> {
  if (carrierPersonId === subjectPersonId) return true;
  const carried = await resolveCarriedSubjects(db, eventId, carrierPersonId);
  return carried.some((c) => c.personId === subjectPersonId);
}
