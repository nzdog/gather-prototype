import type { Prisma } from '@prisma/client';
import { copyEventWhere, DEMO_COPY_EMAIL_DOMAIN } from '@/lib/demo/copy';
import { crowdAddress, crowdTagOf } from '@/lib/demo/copy-address';
import { firstNameOf } from '@/lib/messages/ask-register';

/**
 * [[GTC-444]] A SAMPLE REACHES THE BOARD; HOST / GUEST. Founder rulings, 1 Nov 2026 (Q4 (A), Q5, Q6,
 * Q16; W42 to W48).
 *
 * A sample reaches the board by a link, and nothing is marked sent (QB2 stands). On a sample copy
 * only, the board says what amber means there and offers the Host view / Guest view pair. The guest
 * is fixed (Q5): Aroha Ngata when the crowd is there, else the first guest she typed who has a
 * PARTICIPANT link. Links exist from the hold (`ensureEventTokens`, run by the transition to
 * CONFIRMING); before it nobody has one and the pair says W47. This module READS a link and never
 * mints, revokes or widens one.
 *
 * CLIENT-SAFE (the pre-flight and the guest page read the words): the database comes in as an
 * argument.
 */

/** W42 to W48, as approved (Q16). */
export const SAMPLE_BOARD_WORDS = {
  /** W42 — beside the pretend list. */
  SEE_THE_BOARD: 'See the board as it would look →',
  /** W43 — top of the board, on a copy. */
  NOTE: 'This is a sample, so nothing was sent. Amber means the guest hasn’t answered yet. In a real event I’d have asked them, and I’d follow up.',
  /** W44 */
  HOST_VIEW: 'Host view',
  /** W45 */
  GUEST_VIEW: 'Guest view',
  /** W47 — no guest with a link. */
  NO_GUEST: 'Add a guest in Moment 1 to see their side.',
  /** W48 — on the guest page, on a copy. */
  BACK_TO_BOARD: '← Back to the board',
} as const;

/** W46 — under the pair. */
export function guestViewLine(name: string, first: string): string {
  return `Guest view opens ${name}’s page, the one their link opens. Answer as ${first}, then come back to see the board change.`;
}

/** Q5 — the crowd's first guest (`DEMO_CROWD` in crowd.ts), found by her made-up address. */
export const SAMPLE_GUEST_NAME = 'Aroha Ngata';

/** Is this event a sample copy (`copyEventWhere`)? A real event, the old shared sample or no id: no. */
export async function isSampleCopy(
  db: Pick<Prisma.TransactionClient, 'event'>,
  eventId: string | null | undefined
): Promise<boolean> {
  if (typeof eventId !== 'string' || eventId.length === 0) return false;
  return (await db.event.count({ where: { AND: [{ id: eventId }, copyEventWhere()] } })) > 0;
}

export interface SampleGuest {
  name: string;
  firstName: string;
  /** Her own page, the one her link opens. */
  href: string;
}

export interface SampleBoardView {
  /** Null: no guest has a link yet (W47). */
  guest: SampleGuest | null;
}

/**
 * What the board shows on a sample copy, or null on any other event (a real event is refused).
 * The guest: Aroha by her crowd address when she has a link; else the first guest she typed (not
 * in a crowd household) with a link, first made first; else none.
 */
export async function readSampleBoardView(
  db: Pick<Prisma.TransactionClient, 'event' | 'accessToken'>,
  eventId: string,
  now: Date = new Date()
): Promise<SampleBoardView | null> {
  if (typeof eventId !== 'string' || eventId.length === 0) return null;
  const event = await db.event.findFirst({
    where: { AND: [{ id: eventId }, copyEventWhere()] },
    select: { hostId: true, host: { select: { user: { select: { email: true } } } } },
  });
  const account = event?.host.user?.email;
  if (!event || !account) return null;
  const tag = crowdTagOf(account);
  const crowdEnd = `@${tag}.${DEMO_COPY_EMAIL_DOMAIN}`;
  const links = await db.accessToken.findMany({
    where: {
      eventId,
      scope: 'PARTICIPANT',
      personId: { not: event.hostId },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      person: { eventMemberships: { some: { eventId, role: { not: 'HOST' } } } },
    },
    select: {
      token: true,
      person: {
        select: {
          id: true,
          name: true,
          email: true,
          eventMemberships: {
            where: { eventId },
            select: {
              household: {
                select: {
                  members: { select: { person: { select: { email: true } } } },
                },
              },
            },
          },
        },
      },
    },
    orderBy: { person: { id: 'asc' } },
  });
  const isCrowd = (email: string | null | undefined) =>
    typeof email === 'string' && email.toLowerCase().endsWith(crowdEnd);
  const aroha = crowdAddress(SAMPLE_GUEST_NAME, tag);
  const typed = (l: (typeof links)[number]) =>
    !isCrowd(l.person.email) &&
    !l.person.eventMemberships.some((m) =>
      (m.household?.members ?? []).some((x) => isCrowd(x.person.email))
    );
  const pick =
    links.find((l) => (l.person.email ?? '').toLowerCase() === aroha) ?? links.find(typed) ?? null;
  if (!pick) return { guest: null };
  return {
    guest: {
      name: pick.person.name,
      firstName: firstNameOf(pick.person.name),
      href: `/p/${pick.token}`,
    },
  };
}
