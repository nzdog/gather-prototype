/**
 * GTC-192 (J1, phase 6) — seed ONE event for WATCHING the arrival replay.
 *
 * NOT a test fixture and NOT a measurement: this exists so the replay can be looked at in a
 * real browser, as the host, cold.
 *
 * ── IT WRITES THE ROWS THE REAL ROUTE WRITES ─────────────────────────────────────────────
 *
 * The standing warning at the head of this ticket's phase 6: "every glance fixture writes the
 * rows the real route writes", because a fixture that builds state directly encodes its own
 * model of how the state got there — and 6c's did, twice. So nothing here sets an
 * `Assignment.response` on its own authority. A response is the LAST TAP in a person's ledger,
 * and every tap writes the `AuditEntry` the ack route writes (`logAudit`, inside the response
 * transaction) plus the fire-and-forget `InviteEvent{RESPONSE_SUBMITTED}` that sits outside it.
 * The one attendance answer writes `ANSWER_ATTENDANCE` against `PersonEvent`, exactly as
 * `/api/p/[token]` does. State and ledger cannot disagree here, because the state is DERIVED
 * FROM the ledger below rather than declared beside it.
 *
 * ── IDEMPOTENT, AND THE IDS ARE THE REASON ───────────────────────────────────────────────
 *
 * Every id is fixed, so a re-seed lands on the same event id and the URL never changes.
 * `wipe()` deletes this event (everything else cascades from it) and the people tagged with
 * this fixture's own email suffix — nothing owned by `seed-gtc192-glance.ts` (whose events are
 * named `GTC-192 glance …`, which this name deliberately does not match) and nothing owned by
 * `test:security`.
 *
 * ── THE ANCHOR ───────────────────────────────────────────────────────────────────────────
 *
 * `glanceSeenAt` = `Event.createdAt − 48h`. Every setup tap is at −5d or older and every tap
 * inside the window is at −40h or newer, so the anchor sits in an 8-hour gap that nothing can
 * drift into, and every assignment predates it — `absentAt` stays empty, so the board never
 * predates the data it is rewound to. Derived from `Event.createdAt` rather than hardcoded, so
 * the same formula in SQL rewinds it correctly after any re-seed.
 *
 * ── TWO BOARDS, ONE BUILDER ──────────────────────────────────────────────────────────────
 *
 *   arrival   — the mixed board: three sparks, a quiet red, and a reversal that lands last.
 *   all green — every guest accepted while she was away. Ten sparks and nothing else.
 *
 * The second is not a different fixture, it is a different CAST through the same builder, for
 * the reason the rest of this ticket gives everywhere else: two builders would be free to
 * drift, and the one that drifted would be the one nobody re-measured. It is also the board
 * Ruling 1 describes the feature by — "the replay exists to deliver the SHOULDER-DROP, proof
 * she didn't need to watch" — so it is worth being able to look at on purpose.
 *
 * ⚠ TEN SPARKS IS NOT TEN FAKE ONES. Every one of them has its own ACCEPT_ASSIGNMENT row
 * inside the window, so each is a change that positively happened. A board where everything
 * sparks because nothing was logged is the exact bug Ruling 28 removed, and this is its
 * opposite: everything sparks because everything genuinely moved.
 *
 * ── THE ORDER IS SCATTERED IN THE DATA, NEVER IN THE CODE ────────────────────────────────
 *
 * `deriveReplay` sorts the steps by when each one actually happened — "everything else keeps
 * the order it actually happened in" — so the replay's sequence is a fact about the guests,
 * not a presentation choice. The first cut of these boards handed out accept times in the
 * order the cast is listed, which is also the order the strips are laid out, so the replay
 * swept left-to-right down the board like a progress bar instead of landing where the news
 * landed.
 *
 * ⚠ THE FIX IS THE TIMES, AND IT HAS TO BE. Shuffling inside the derivation would make the
 * replay lie about the sequence — a host watching it would be told a false story about who
 * answered first — and it would put a random number generator inside a pure function this
 * ticket keeps deterministic on purpose. Guests do not answer in seating order, so the
 * FIXTURE was the thing that was wrong. Each board's taps are now spread across households so
 * that consecutive steps land in different columns, and the chronology is still the honest
 * source of the order.
 *
 * Run: npx tsx scripts/seed-gtc192-replay.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const HOST_EMAIL = 'nigel@mckorbett.co.nz';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const ANCHOR_BEFORE_MS = 48 * HOUR;

type Tap = 'ACCEPTED' | 'DECLINED' | 'MAYBE';

interface Row {
  item: string;
  /** When the row was created — before the anchor for everyone here, so nothing is `absentAt`. */
  createdAt: number;
  critical?: boolean;
  /** The guest's taps, oldest first. The LAST one is the response the row carries now. */
  taps: Array<{ at: number; tap: Tap }>;
}

interface Spec {
  slug: string;
  name: string;
  household: string;
  householdRole: 'PRIMARY_CONTACT' | 'PARTNER' | 'GUEST' | 'CHILD';
  isHost?: boolean;
  team?: 'Mains' | 'Desserts';
  dontChase?: boolean;
  /** The conditional/itemless attendance ask, answered. Before the anchor, or she is ambiguous. */
  attendance?: { at: number; answer: 'YES' | 'NO' };
  rows: Row[];
  /** What this person is here to show. Printed, never stored. */
  note: string;
}

const HOUSEHOLDS = ['Whittaker', 'Turner', 'Nguyen', 'Dalton', "O'Brien"] as const;

const CAST: Spec[] = [
  {
    slug: 'nigel',
    name: 'Nigel (host)',
    household: 'Whittaker',
    householdRole: 'PRIMARY_CONTACT',
    isHost: true,
    rows: [],
    note: 'the host, holding nothing — green, and still green',
  },
  {
    slug: 'rob',
    name: 'Rob Whittaker',
    household: 'Whittaker',
    householdRole: 'PARTNER',
    team: 'Mains',
    rows: [{ item: 'The gravy', createdAt: -10 * DAY, taps: [{ at: -8 * DAY, tap: 'ACCEPTED' }] }],
    note: 'settled long before she looked — no step (branch 1)',
  },
  {
    slug: 'amelia',
    name: 'Amelia Turner',
    household: 'Turner',
    householdRole: 'PRIMARY_CONTACT',
    team: 'Mains',
    rows: [
      {
        item: 'The pavlova',
        critical: true,
        createdAt: -10 * DAY,
        taps: [{ at: -22 * HOUR, tap: 'ACCEPTED' }],
      },
    ],
    note: 'SPARK — pending when she looked, accepted while she was away (branch 2)',
  },
  {
    slug: 'charlotte',
    name: 'Charlotte Turner',
    household: 'Turner',
    householdRole: 'PARTNER',
    team: 'Mains',
    rows: [{ item: 'The salad', createdAt: -10 * DAY, taps: [{ at: -8 * DAY, tap: 'ACCEPTED' }] }],
    note: 'settled before the anchor — no step',
  },
  {
    slug: 'chloe',
    name: 'Chloe Nguyen',
    household: 'Nguyen',
    householdRole: 'PRIMARY_CONTACT',
    team: 'Desserts',
    rows: [
      {
        item: 'The trifle',
        createdAt: -10 * DAY,
        taps: [
          { at: -9 * DAY, tap: 'MAYBE' },
          { at: -40 * HOUR, tap: 'ACCEPTED' },
        ],
      },
    ],
    note: 'SPARK — a LIVE maybe at the anchor, accepted since (branch 1 + Ruling 27 clockAt)',
  },
  {
    slug: 'minh',
    name: 'Minh Nguyen',
    household: 'Nguyen',
    householdRole: 'PARTNER',
    team: 'Desserts',
    rows: [{ item: 'The bread', createdAt: -10 * DAY, taps: [] }],
    note: 'never tapped — amber, and still amber (branch 3, the Ruling 28 silence)',
  },
  {
    slug: 'grace',
    name: 'Grace Nguyen',
    household: 'Nguyen',
    householdRole: 'GUEST',
    team: 'Desserts',
    rows: [
      { item: 'The cheese', createdAt: -10 * DAY, taps: [{ at: -28 * HOUR, tap: 'DECLINED' }] },
    ],
    note: 'THE QUIET RED — declined while she was away, no spark',
  },
  {
    slug: 'sarah',
    name: 'Sarah Dalton',
    household: 'Dalton',
    householdRole: 'PARTNER',
    team: 'Mains',
    rows: [{ item: 'The wine', createdAt: -10 * DAY, taps: [{ at: -34 * HOUR, tap: 'ACCEPTED' }] }],
    note: 'SPARK — the third piece of good news, and not the last one shown',
  },
  {
    slug: 'ray',
    name: 'Ray Dalton',
    household: 'Dalton',
    householdRole: 'PRIMARY_CONTACT',
    team: 'Mains',
    // Itemless and asked outright, nine days ago — the degenerate attendance case, which is
    // the ONLY way a stored NO can sit under an accepted row. Before the anchor, so the rewind
    // carries it forward instead of marking him ambiguous.
    attendance: { at: -9 * DAY, answer: 'NO' },
    rows: [
      {
        item: 'The ice',
        createdAt: -6 * DAY,
        taps: [
          { at: -5 * DAY, tap: 'ACCEPTED' },
          { at: -8 * HOUR, tap: 'DECLINED' },
        ],
      },
    ],
    note: 'THE REVERSAL — out, then in (accepted outranks the stored NO), now out again. Plays LAST',
  },
  {
    slug: 'connor',
    name: 'Connor OBrien',
    household: "O'Brien",
    householdRole: 'PRIMARY_CONTACT',
    team: 'Desserts',
    rows: [
      { item: 'The crackers', createdAt: -10 * DAY, taps: [{ at: -7 * DAY, tap: 'ACCEPTED' }] },
    ],
    note: 'settled before the anchor — no step',
  },
  {
    slug: 'aoife',
    name: 'Aoife OBrien',
    household: "O'Brien",
    householdRole: 'PARTNER',
    team: 'Desserts',
    dontChase: true,
    rows: [{ item: 'The cake', createdAt: -10 * DAY, taps: [] }],
    note: 'DONT_CHASE — grey, and stays grey (Ruling 14)',
  },
];

/** Ruling 8: one ownerless critical to NAME, two ordinary ones to COUNT. */
const LOOSE = [
  { slug: 'ham', name: 'the glazed ham', critical: true },
  { slug: 'cups', name: 'the paper cups', critical: false },
  { slug: 'serviettes', name: 'the serviettes', critical: false },
];

/**
 * BOARD TWO — every guest accepted while she was away.
 *
 * The same eleven people standing in the same five households, so the two boards can be put
 * side by side and only the story differs. Each guest holds one row that was PENDING when she
 * last looked and carries a single ACCEPT_ASSIGNMENT inside the window: the canonical spark,
 * ten times over, each on its own evidence.
 *
 * The host holds nothing and is green throughout — GTC-256 Ruling 5 is that PENDING on her own
 * row is settled rather than awaited, so she has no amber to leave and cannot spark. That is
 * correct rather than a gap: Ruling 22 says her own state is not news to her.
 *
 * NO LOOSE CRITICALS on this board, deliberately. An ownerless critical puts a red alert strip
 * above a board whose whole point is that nothing is left for her.
 */
const ALL_GREEN_CAST: Spec[] = [
  {
    slug: 'nigel',
    name: 'Nigel (host)',
    household: 'Whittaker',
    householdRole: 'PRIMARY_CONTACT',
    isHost: true,
    rows: [],
    note: 'the host, holding nothing — green before and after',
  },
  ...(
    [
      // The last column is the hour the accept landed, and it is what orders the replay. Read
      // them sorted and the sparks go 3 → 1 → 4 → 2 → 5 → 3 → 5 → 2 → 4 → 3 across the five
      // households: no two in a row in the same column, and never twice down the same card.
      ['rob', 'Rob Whittaker', 'Whittaker', 'PARTNER', 'Mains', 'The gravy', -38],
      ['amelia', 'Amelia Turner', 'Turner', 'PRIMARY_CONTACT', 'Mains', 'The pavlova', -34],
      ['charlotte', 'Charlotte Turner', 'Turner', 'PARTNER', 'Mains', 'The salad', -26],
      ['chloe', 'Chloe Nguyen', 'Nguyen', 'PRIMARY_CONTACT', 'Desserts', 'The trifle', -22],
      ['minh', 'Minh Nguyen', 'Nguyen', 'PARTNER', 'Desserts', 'The bread', -30],
      ['grace', 'Grace Nguyen', 'Nguyen', 'GUEST', 'Desserts', 'The cheese', -40],
      ['ray', 'Ray Dalton', 'Dalton', 'PRIMARY_CONTACT', 'Mains', 'The ice', -24],
      ['sarah', 'Sarah Dalton', 'Dalton', 'PARTNER', 'Mains', 'The wine', -36],
      ['connor', 'Connor OBrien', "O'Brien", 'PRIMARY_CONTACT', 'Desserts', 'The crackers', -32],
      ['aoife', 'Aoife OBrien', "O'Brien", 'PARTNER', 'Desserts', 'The cake', -28],
    ] as const
  ).map(([slug, name, household, householdRole, team, item, hoursAgo]) => ({
    slug,
    name,
    household,
    householdRole: householdRole as Spec['householdRole'],
    team: team as Spec['team'],
    rows: [
      {
        item,
        createdAt: -10 * DAY,
        taps: [{ at: hoursAgo * HOUR, tap: 'ACCEPTED' as Tap }],
      },
    ],
    note: `SPARK — pending when she looked, accepted ${-hoursAgo}h ago`,
  })),
];

interface Board {
  eventId: string;
  /** The half of the event name after the em dash. */
  label: string;
  /** Keeps this board's people out of the other board's wipe. */
  tag: string;
  cast: Spec[];
  loose: typeof LOOSE;
}

const BOARDS: Board[] = [
  {
    eventId: 'gtc192-replay-arrival',
    label: 'arrival',
    tag: 'gtc192replay',
    cast: CAST,
    loose: LOOSE,
  },
  {
    eventId: 'gtc192-replay-allgreen',
    label: 'all green',
    tag: 'gtc192allgreen',
    cast: ALL_GREEN_CAST,
    loose: [],
  },
];

const ACTION_BY_TAP: Record<Tap, string> = {
  ACCEPTED: 'ACCEPT_ASSIGNMENT',
  DECLINED: 'DECLINE_ASSIGNMENT',
  MAYBE: 'MAYBE_ASSIGNMENT',
};
const VERB_BY_TAP: Record<Tap, string> = {
  ACCEPTED: 'Accepted',
  DECLINED: 'Declined',
  MAYBE: 'Maybe on',
};

async function wipe(board: Board) {
  // The event cascades to teams → items → assignments, households, personEvents, eventRoles,
  // auditLog and inviteEvents. The people go after it, because their audit and invite rows
  // reference them and only the cascade clears those.
  await prisma.event.deleteMany({ where: { id: board.eventId } });
  await prisma.person.deleteMany({ where: { email: { endsWith: `+${board.tag}@example.com` } } });
}

async function buildBoard(
  board: Board,
  user: { id: string },
  hostPerson: { id: string }
): Promise<void> {
  await wipe(board);

  const emailSuffix = `+${board.tag}@example.com`;
  const now = new Date();
  const at = (ms: number) => new Date(now.getTime() + ms);
  const anchor = at(-ANCHOR_BEFORE_MS);

  const event = await prisma.event.create({
    data: {
      id: board.eventId,
      name: `GTC-192 replay — ${board.label}`,
      // Set explicitly so the anchor formula below is exact in SQL as well as here.
      createdAt: now,
      startDate: at(10 * DAY),
      endDate: at(10 * DAY + 4 * HOUR),
      status: 'CONFIRMING',
      sentAt: at(-14 * DAY),
      hostId: hostPerson.id,
    },
  });

  await prisma.eventRole.create({
    data: {
      id: `${board.eventId}-role-host`,
      userId: user.id,
      eventId: event.id,
      role: 'HOST',
      // Rewound at birth, so the first visit has something to play.
      glanceSeenAt: anchor,
    },
  });

  const teams = {
    Mains: await prisma.team.create({
      data: { id: `${board.eventId}-team-mains`, eventId: event.id, name: 'Mains' },
    }),
    Desserts: await prisma.team.create({
      data: { id: `${board.eventId}-team-desserts`, eventId: event.id, name: 'Desserts' },
    }),
  };

  // Spaced createdAt, because the board orders households by it — so the wall of names is the
  // same wall on every re-seed.
  const households = new Map<string, string>();
  for (const [i, name] of HOUSEHOLDS.entries()) {
    const slug = name.toLowerCase().replace(/[^a-z]/g, '');
    const hh = await prisma.household.create({
      data: {
        id: `${board.eventId}-hh-${slug}`,
        eventId: event.id,
        createdAt: at(-10 * DAY + i * 1000),
      },
    });
    households.set(name, hh.id);
  }

  let audits = 0;
  let invites = 0;

  for (const spec of board.cast) {
    const person = spec.isHost
      ? hostPerson
      : await prisma.person.create({
          data: {
            id: `${board.eventId}-person-${spec.slug}`,
            name: spec.name,
            email: `${spec.slug}${emailSuffix}`,
          },
        });

    const personEvent = await prisma.personEvent.create({
      data: {
        id: `${board.eventId}-pe-${spec.slug}`,
        personId: person.id,
        eventId: event.id,
        role: spec.isHost ? 'HOST' : 'PARTICIPANT',
        // The host stays on no team, by design (src/lib/assignment/same-team.ts).
        teamId: spec.isHost ? null : teams[spec.team ?? 'Mains'].id,
        householdId: households.get(spec.household)!,
        householdRole: spec.householdRole,
        nudgeMark: spec.dontChase ? 'DONT_CHASE' : null,
        sentAt: spec.isHost ? null : at(-14 * DAY),
      },
    });

    // The attendance answer, written the way `/api/p/[token]` writes it: the column, the
    // answered-at stamp, and the ANSWER_ATTENDANCE row against the PersonEvent.
    if (spec.attendance) {
      await prisma.personEvent.update({
        where: { id: personEvent.id },
        data: {
          attendanceAnswer: spec.attendance.answer,
          attendanceAnsweredAt: at(spec.attendance.at),
        },
      });
      await prisma.auditEntry.create({
        data: {
          id: `${board.eventId}-audit-${spec.slug}-attendance`,
          eventId: event.id,
          actorId: person.id,
          actionType: 'ANSWER_ATTENDANCE',
          targetType: 'PersonEvent',
          targetId: personEvent.id,
          details:
            spec.attendance.answer === 'YES' ? 'Answered still coming' : 'Answered not coming',
          timestamp: at(spec.attendance.at),
        },
      });
      audits += 1;
      await prisma.inviteEvent.create({
        data: {
          id: `${board.eventId}-invite-${spec.slug}-attendance`,
          eventId: event.id,
          personId: person.id,
          type: 'RESPONSE_SUBMITTED',
          metadata: { attendanceAnswer: spec.attendance.answer, itemless: true },
          createdAt: at(spec.attendance.at),
        },
      });
      invites += 1;
    }

    for (const row of spec.rows) {
      const slug = row.item.toLowerCase().replace(/[^a-z]/g, '');
      const item = await prisma.item.create({
        data: {
          id: `${board.eventId}-item-${slug}`,
          teamId: teams[spec.team ?? 'Mains'].id,
          name: row.item,
          kind: 'ITEM',
          critical: row.critical ?? false,
          createdAt: at(row.createdAt),
        },
      });
      const assignment = await prisma.assignment.create({
        data: {
          id: `${board.eventId}-assign-${slug}`,
          itemId: item.id,
          personId: person.id,
          // THE LEDGER IS THE AUTHORITY. The row carries what the last tap said, and where
          // there is no tap it carries the schema default — never a value set beside the log.
          response: row.taps.length ? row.taps[row.taps.length - 1].tap : 'PENDING',
          createdAt: at(row.createdAt),
        },
      });

      let previous = 'PENDING';
      for (const { at: tapAt, tap } of row.taps) {
        await prisma.auditEntry.create({
          data: {
            id: `${board.eventId}-audit-${slug}-${tap.toLowerCase()}-${Math.abs(tapAt)}`,
            eventId: event.id,
            actorId: person.id,
            actionType: ACTION_BY_TAP[tap],
            targetType: 'Assignment',
            targetId: assignment.id,
            details: `${VERB_BY_TAP[tap]} assignment for item ${item.id}`,
            timestamp: at(tapAt),
          },
        });
        audits += 1;
        await prisma.inviteEvent.create({
          data: {
            id: `${board.eventId}-invite-${slug}-${tap.toLowerCase()}-${Math.abs(tapAt)}`,
            eventId: event.id,
            personId: person.id,
            type: 'RESPONSE_SUBMITTED',
            metadata: {
              itemId: item.id,
              itemName: item.name,
              response: tap,
              previousResponse: previous,
            },
            createdAt: at(tapAt),
          },
        });
        invites += 1;
        previous = tap;
      }
    }
  }

  for (const loose of board.loose) {
    await prisma.item.create({
      data: {
        id: `${board.eventId}-item-${loose.slug}`,
        teamId: teams.Mains.id,
        name: loose.name,
        kind: 'ITEM',
        critical: loose.critical,
        createdAt: at(-10 * DAY),
      },
    });
  }

  const counts = {
    Event: await prisma.event.count({ where: { id: board.eventId } }),
    EventRole: await prisma.eventRole.count({ where: { eventId: board.eventId } }),
    Team: await prisma.team.count({ where: { eventId: board.eventId } }),
    Household: await prisma.household.count({ where: { eventId: board.eventId } }),
    PersonEvent: await prisma.personEvent.count({ where: { eventId: board.eventId } }),
    Person: await prisma.person.count({ where: { email: { endsWith: emailSuffix } } }),
    Item: await prisma.item.count({ where: { team: { eventId: board.eventId } } }),
    Assignment: await prisma.assignment.count({
      where: { item: { team: { eventId: board.eventId } } },
    }),
    AuditEntry: await prisma.auditEntry.count({ where: { eventId: board.eventId } }),
    InviteEvent: await prisma.inviteEvent.count({ where: { eventId: board.eventId } }),
  };

  console.log(`\n── ${board.label} ──`);
  console.log('  rows written :', JSON.stringify(counts));
  console.log('  ledger rows  :', audits, 'audit,', invites, 'invite');
  console.log('  createdAt    :', now.toISOString());
  console.log('  glanceSeenAt :', anchor.toISOString(), '(createdAt − 48h)');
  console.log('  url          : http://localhost:3000/plan/' + board.eventId + '/glance');
}

async function main() {
  const user = await prisma.user.findUnique({ where: { email: HOST_EMAIL } });
  if (!user) throw new Error(`No User with email ${HOST_EMAIL}`);
  const hostPerson = await prisma.person.findFirst({ where: { email: HOST_EMAIL } });
  if (!hostPerson) throw new Error(`No Person with email ${HOST_EMAIL}`);

  for (const board of BOARDS) await buildBoard(board, user, hostPerson);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
