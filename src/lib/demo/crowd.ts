import type { PrismaClient } from '@prisma/client';
import { copyEventWhere } from '@/lib/demo/copy';
import { crowdAddress, crowdTagOf } from '@/lib/demo/copy-address';
import { recordChange, type LedgerActor } from '@/lib/ledger';

/**
 * [[GTC-392]] part B — "ADD A CROWD": 30 made-up people in 11 households for a visitor's sample
 * copy. Founder plan rulings, 18 Oct 2026 (QB3, QB4; W16 to W22).
 *
 * Sample copies only (`copyEventWhere`: the old shared sample is a sample but not a copy), once
 * only, and only after her own household is saved, as the households route asks of every
 * household. ONE transaction: a failure part-way writes nothing.
 *
 * Every person is created new, with no lookup at all, so nobody outside the copy is ever reached
 * (GTC-293's rule on real events is untouched). Adults have a made-up address that can never be
 * delivered, tagged with this copy's own tag; Nana June and the kids have none; nobody has a
 * phone. Nothing here sends, queues, mints a link or calls the AI. CLIENT-SAFE (the button reads
 * the words): the database comes in as an argument.
 */

/** W16 to W22. */
export const CROWD_WORDS = {
  /** W16 — the button. */
  BUTTON: 'Add a crowd',
  /** W17 — the line under it. */
  EXPLAIN:
    'Adds 30 made-up people in 11 households, so you can try Gather with a full party. You can change or remove any of them.',
  /** W18 — while it works. */
  WORKING: 'Adding the crowd…',
  /** W19 — done, in the button's place. */
  DONE: 'Added 30 made-up people in 11 households.',
  /** W20 — pressed again. */
  ALREADY: 'The crowd is already here.',
  /** W21 — it failed. */
  FAILED: 'The crowd couldn’t be added. Try again.',
  /** W22 — any event that is not a sample copy (never on screen: the button is not drawn there). */
  NOT_A_SAMPLE: 'A crowd can only be added to a sample event.',
} as const;

/** The households route's own words for "her household first", unchanged. */
const HOST_FIRST =
  'Add your own household first — Moment 1 opens with the host, and everyone else is added after.';

type CrowdRole = 'PRIMARY_CONTACT' | 'PARTNER' | 'GUEST' | 'CHILD';
interface CrowdMember {
  name: string;
  role: CrowdRole;
  /** A made-up address, or none (Nana June, the kids). */
  address: boolean;
}

const m = (name: string, role: CrowdRole, address = role !== 'CHILD'): CrowdMember => ({
  name,
  role,
  address,
});

/** QB4, ruled 18 Oct 2026: 24 people in 11 households, and 6 kids without jobs. */
export const DEMO_CROWD: ReadonlyArray<{ members: CrowdMember[]; littleCount: number }> = [
  {
    members: [
      m('Aroha Ngata', 'PRIMARY_CONTACT'),
      m('Wiremu Ngata', 'PARTNER'),
      m('Mere Ngata', 'CHILD'),
    ],
    littleCount: 1,
  },
  { members: [m('Priya Sharma', 'PRIMARY_CONTACT'), m('Dev Sharma', 'PARTNER')], littleCount: 2 },
  {
    members: [
      m('Tom Brennan', 'PRIMARY_CONTACT'),
      m('Jess Brennan', 'PARTNER'),
      m('Ollie Brennan', 'CHILD'),
    ],
    littleCount: 0,
  },
  {
    members: [
      m('Sione Taufa', 'PRIMARY_CONTACT'),
      m('Lupe Taufa', 'PARTNER'),
      m('Mele Taufa', 'CHILD'),
    ],
    littleCount: 1,
  },
  { members: [m('Grace Liu', 'PRIMARY_CONTACT')], littleCount: 0 },
  // "Nana June": no address, so the pre-flight shows someone Gather leaves to the host.
  {
    members: [m('Hemi Walker', 'PRIMARY_CONTACT'), m('June Walker', 'GUEST', false)],
    littleCount: 0,
  },
  { members: [m('Sophie Martin', 'PRIMARY_CONTACT'), m('Ben Clarke', 'PARTNER')], littleCount: 0 },
  {
    members: [
      m('Raj Mehta', 'PRIMARY_CONTACT'),
      m('Anjali Mehta', 'PARTNER'),
      m('Kiran Mehta', 'CHILD'),
    ],
    littleCount: 0,
  },
  {
    members: [m("Megan O'Neill", 'PRIMARY_CONTACT'), m("Liam O'Neill", 'PARTNER')],
    littleCount: 2,
  },
  { members: [m('Ana Tupou', 'PRIMARY_CONTACT'), m('Josh Ellis', 'GUEST')], littleCount: 0 },
  { members: [m('Chris Taylor', 'PRIMARY_CONTACT')], littleCount: 0 },
];

export type CrowdRefusalCode = 'NOT_A_SAMPLE' | 'HOST_HOUSEHOLD_REQUIRED' | 'ALREADY_ADDED';
export type CrowdOutcome =
  | { ok: true; householdIds: string[] }
  | { ok: false; status: 409; code: CrowdRefusalCode; words: string };

const refuse = (code: CrowdRefusalCode, words: string): CrowdOutcome => ({
  ok: false,
  status: 409,
  code,
  words,
});

export async function addDemoCrowd(
  db: PrismaClient,
  eventId: string,
  actor: LedgerActor
): Promise<CrowdOutcome> {
  const event = await db.event.findFirst({
    where: { id: eventId, ...copyEventWhere() },
    select: { id: true, hostId: true, host: { select: { user: { select: { email: true } } } } },
  });
  const account = event?.host.user?.email;
  if (!event || !account) return refuse('NOT_A_SAMPLE', CROWD_WORDS.NOT_A_SAMPLE);

  const hostRow = await db.personEvent.findUnique({
    where: { personId_eventId: { personId: event.hostId, eventId } },
    select: { id: true },
  });
  if (!hostRow) return refuse('HOST_HOUSEHOLD_REQUIRED', HOST_FIRST);

  const tag = crowdTagOf(account);
  return db.$transaction(
    async (tx) => {
      // The event's row is the lock, so two presses at once cannot both add a crowd.
      await tx.$executeRaw`SELECT id FROM "Event" WHERE id = ${eventId} FOR UPDATE`;
      const already = await tx.personEvent.count({
        where: { eventId, person: { email: { endsWith: `@${tag}.demo-copy.invalid` } } },
      });
      if (already > 0) return refuse('ALREADY_ADDED', CROWD_WORDS.ALREADY);

      const householdIds: string[] = [];
      for (const h of DEMO_CROWD) {
        const household = await tx.household.create({
          data: { eventId, littleCount: h.littleCount },
        });
        householdIds.push(household.id);
        for (const member of h.members) {
          const email = member.address ? crowdAddress(member.name, tag) : null;
          const person = await tx.person.create({ data: { name: member.name, email } });
          await tx.personEvent.create({
            data: {
              personId: person.id,
              eventId,
              role: 'PARTICIPANT',
              reachabilityTier: email ? 'DIRECT' : 'UNTRACKABLE',
              contactMethod: email ? 'EMAIL' : 'NONE',
              householdId: household.id,
              householdRole: member.role,
              isYoungPerson: member.role === 'CHILD',
              sentAt: null,
            },
          });
        }
        // One ledger line per household, as the households route writes one.
        await recordChange(tx, {
          eventId,
          actor,
          changes: [
            {
              action: 'ADD_PERSON',
              targetType: 'Household',
              targetId: household.id,
              before: null,
              after: { primaryContact: h.members[0].name },
            },
          ],
        });
      }
      return { ok: true as const, householdIds };
    },
    { timeout: 30_000, maxWait: 15_000 }
  );
}
