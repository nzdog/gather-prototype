/**
 * GTC-192 (J1, PHASE 7) — seed ONE board for LOOKING at the two variants.
 *
 * NOT a test fixture and NOT a measurement. This exists so the amber clock-line and the
 * strip-as-button shape can be looked at cold, in a real browser, as the host, on ONE board
 * with ONE set of data — which is what the ticket's phase 7 line asks for: "a side-by-side on
 * the same seeded event put in front of the founder, then a ruling."
 *
 * ══ WHAT THIS WRITES TO `gather_dev`, STATED BEFORE IT WRITES IT ═══════════════════════════
 *
 *   DELETES   the Event `gtc192-phase7-variants` and everything that cascades from it
 *             (Team, Item, Assignment, Household, PersonEvent, EventRole, AuditEntry,
 *             InviteEvent), and every Person whose email ends `+gtc192phase7@example.com`.
 *   CREATES   that one Event; 2 Teams; 5 Households; 1 HOST EventRole for the EXISTING User
 *             `nigel@mckorbett.co.nz`; 10 Persons under this fixture's own email suffix;
 *             11 PersonEvents; 12 Items; 9 Assignments; and one AuditEntry + one InviteEvent
 *             per tap, plus the pair an attendance answer writes.
 *   REUSES    the existing host Person for `nigel@mckorbett.co.nz` — READ, never written. It
 *             is shared with the phase 6 replay boards and this must not touch it.
 *   TOUCHES   nothing else. No other event, no other person, none of `test:security`'s
 *             fixtures, no schema.
 *
 * ══ THE FIVE FIXTURE RULES FROM THE STANDING WARNING, EACH ANSWERED ════════════════════════
 *
 * 1. EVERY FIXTURE WRITES THE ROWS THE REAL ROUTE WRITES. No `Assignment.response` is set on
 *    this file's own authority: a row carries whatever its LAST TAP said, and every tap writes
 *    the `AuditEntry` the ack route writes inside its transaction plus the fire-and-forget
 *    `InviteEvent{RESPONSE_SUBMITTED}` that sits outside it. The attendance answer writes
 *    `ANSWER_ATTENDANCE` against the PersonEvent exactly as `/api/p/[token]` does.
 * 2. IDEMPOTENT ACROSS RUNS. Every id is derived from the event id, so a re-seed lands on the
 *    same rows and the URLs never change. `--dump` prints a canonical board dump for diffing;
 *    run it twice and diff before trusting a single thing on the board.
 * 3. RE-MEASURED AGAINST AN UNTOUCHED DATABASE — the counts printed below are of THIS event
 *    only, scoped by its own id and its own email suffix, so a `test:security` run before or
 *    after cannot move them.
 * 4. A NEGATIVE RESULT NEEDS A POSITIVE CONTROL. The board's own negatives are paired on the
 *    board itself rather than argued: Minh is an AMBER with NO clock-line, standing two strips
 *    from Chloe, an AMBER with one — so "variant A shows nothing here" is measured against
 *    "variant A shows something there", on the same render, in the same card.
 * 5. A SUITE THAT CANNOT REPORT ITS RED IS NOT A RED — not this file's job, but the reason
 *    `--dump` exists rather than a pile of assertions: this is a board to look at, and its
 *    failure mode should be a printed dump that is wrong, not a throw.
 *
 * ══ THE BOARD DOES NOT REPLAY, AND THAT IS THE DELIVERABLE'S CENTRAL CHOICE ════════════════
 *
 * `glanceSeenAt` is stamped at `now`, so `replay.steps` is EMPTY and the page stamps on
 * arrival. Every load of every variant therefore paints the same board. An armed board would
 * make the first variant looked at the only one that saw a replay, and "one board, one set of
 * data" would be false in the one way that matters — the founder would be comparing two
 * different things and calling it a variant test.
 *
 * ⚠ THE REPLAY CAN BE PUT BACK ON PURPOSE, AND IT IS THE ONLY WAY TO SEE PHASE 6's TWO
 * INHERITED FINDINGS LIVE. Rewinding the mark behind Ray's reversal re-arms it:
 *
 *   psql gather_dev -c "update \"EventRole\" set \"glanceSeenAt\" = (select \"createdAt\" -
 *     interval '48 hours' from \"Event\" where id='gtc192-phase7-variants')
 *     where \"eventId\"='gtc192-phase7-variants';"
 *
 * Ray's decline sits at −30h and Grace's at −26h, both inside a −48h window, so the replay
 * carries Grace's red and Ray's reversal, and the reversal plays last. Add `?replay=manual`
 * and it never stamps, so it can be replayed under each variant in turn. WITHOUT the param the
 * automatic replay stamps itself once and the board returns to the stable state above.
 *
 * ══ THIS FILE IS TRACKED, AND THE OLDER GLANCE SEEDS ARE NOT ═════════════════════════════
 *
 * `scripts/seed-gtc192-replay.ts` and `scripts/seed-gtc192-glance.ts` are untracked, and their
 * documentation is not: `scripts/README-gtc192-replay.md` is in the repository. **That split
 * is the convention this file deliberately breaks, by founder instruction, 2026-09-11:**
 *
 *   "The convention is wrong — a README for a board a fresh clone cannot rebuild is
 *    documentation pointing at nothing."
 *
 * So this seed and `scripts/README-gtc192-phase7.md` are committed together. A clone can
 * rebuild the board the README describes, which is the whole point of the README.
 *
 * ⚠ THE OLDER SEEDS ARE DELIBERATELY NOT RETROFITTED. Ruled in the same instruction — "do not
 * retrofit them here." They belong to [[GTC-192]]'s phase 6 and are its owner's to move; doing
 * it in passing would put two unrelated changes in one commit and would change what a
 * re-running phase 6 walk is measuring. **The divergence is recorded here rather than
 * silently begun**, so the next reader finds a stated decision and not an inconsistency.
 *
 * Run: npx tsx scripts/seed-gtc192-phase7.ts [--dump]
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const HOST_EMAIL = 'nigel@mckorbett.co.nz';
const EVENT_ID = 'gtc192-phase7-variants';
const TAG = 'gtc192phase7';
const EMAIL_SUFFIX = `+${TAG}@example.com`;

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

type Tap = 'ACCEPTED' | 'DECLINED' | 'MAYBE';

interface Row {
  item: string;
  createdAt: number;
  critical?: boolean;
  /**
   * RULING 32's read-only panel shows "quantity and unit, and nothing else", so the board has
   * to carry some — and has to carry the cases that are NOT a plain number and unit, or the
   * panel would be measured only where it happens to work.
   *
   * `[amount, unit]`, where unit is a `QuantityUnit` member, or `[amount, 'CUSTOM', word]`.
   * Omitted entirely on one row on purpose, and set to a PLACEHOLDER on another: BOTH render
   * nothing in the panel and are indistinguishable there. That is the stated cost of the
   * founder's own fence, and it is on the board so he sees it rather than reads about it.
   */
  qty?: [number, string] | [number, 'CUSTOM', string];
  /** Sets `quantityState` to PLACEHOLDER — a quantity nobody has settled. Renders as absent. */
  placeholderQty?: boolean;
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
  /**
   * `PersonEvent.sentAt` — E1's cadence anchor, and THE INPUT VARIANT A IS ABOUT.
   *
   * `nextNudgeAt` counts [4, 7] days from here (STANDARD, the event's default pace), so this
   * column alone decides whether an amber has a clock-line at all and what it says. It is a
   * FIELD on the cast rather than one value for everybody, because a board where every amber
   * says the same thing would tell the founder nothing about the variant.
   */
  sentAt: number | null;
  attendance?: { at: number; answer: 'YES' | 'NO' };
  rows: Row[];
  /** What this person is on the board to show. Printed, never stored. */
  note: string;
}

const HOUSEHOLDS = ['Whittaker', 'Turner', 'Nguyen', 'Dalton', "O'Brien"] as const;

/**
 * ELEVEN PEOPLE, AND EVERY STATE ON THE BOARD AT ONCE.
 *
 * The brief's required mix is at least two ambers, one red, one settled reversal and a
 * critical. This carries FOUR ambers, deliberately: the variant being ruled on is about ambers,
 * and one amber is a sample of one. The four differ in exactly the input the variant reads —
 * `sentAt` — so the clock-line's whole range is on one screen, including the case where there
 * is no line at all.
 */
const CAST: Spec[] = [
  {
    slug: 'nigel',
    name: 'Nigel (host)',
    household: 'Whittaker',
    householdRole: 'PRIMARY_CONTACT',
    isHost: true,
    sentAt: null,
    rows: [],
    note: 'GREEN — the host, holding nothing. GTC-256 Ruling 5: no ask is ever made to her',
  },
  {
    slug: 'rob',
    name: 'Rob Whittaker',
    household: 'Whittaker',
    householdRole: 'PARTNER',
    team: 'Mains',
    sentAt: -14 * DAY,
    rows: [
      {
        item: 'The gravy',
        createdAt: -10 * DAY,
        qty: [2, 'L'],
        taps: [{ at: -8 * DAY, tap: 'ACCEPTED' }],
      },
    ],
    note: 'GREEN — settled, bare in every variant',
  },
  {
    slug: 'amelia',
    name: 'Amelia Turner',
    household: 'Turner',
    householdRole: 'PRIMARY_CONTACT',
    team: 'Mains',
    // Day-4 leg lands two days out — the weekday branch of the clock-line.
    sentAt: -2 * DAY,
    rows: [
      {
        item: 'The pavlova',
        critical: true,
        createdAt: -10 * DAY,
        qty: [1, 'TRAYS'],
        taps: [],
      },
    ],
    note: 'AMBER, clock 2 days out — and holding a CRITICAL, so the amber is the loudest quiet thing',
  },
  {
    slug: 'charlotte',
    name: 'Charlotte Turner',
    household: 'Turner',
    householdRole: 'PARTNER',
    team: 'Mains',
    sentAt: -14 * DAY,
    rows: [
      {
        item: 'The salad',
        createdAt: -10 * DAY,
        qty: [12, 'SERVINGS'],
        taps: [{ at: -8 * DAY, tap: 'ACCEPTED' }],
      },
    ],
    note: 'GREEN — the wall of names Ruling 5 keeps',
  },
  {
    slug: 'chloe',
    name: 'Chloe Nguyen',
    household: 'Nguyen',
    householdRole: 'PRIMARY_CONTACT',
    team: 'Desserts',
    // Day-4 leg already spent, day-7 leg three days out.
    sentAt: -4 * DAY - HOUR,
    rows: [
      {
        item: 'The trifle',
        createdAt: -10 * DAY,
        qty: [1, 'CUSTOM', 'big bowl'],
        taps: [{ at: -3 * DAY, tap: 'MAYBE' }],
      },
    ],
    note: 'AMBER, a LIVE MAYBE — the one person carrying BOTH clocks: nextNudgeAt and decideByAt',
  },
  {
    slug: 'minh',
    name: 'Minh Nguyen',
    household: 'Nguyen',
    householdRole: 'PARTNER',
    team: 'Desserts',
    // Both legs spent. `nextNudgeAt` is null and variant A shows NOTHING.
    sentAt: -11 * DAY,
    rows: [{ item: 'The bread', createdAt: -10 * DAY, qty: [6, 'COUNT'], taps: [] }],
    note: 'AMBER with a SPENT cadence — the negative case, standing beside its own positive control',
  },
  {
    slug: 'grace',
    name: 'Grace Nguyen',
    household: 'Nguyen',
    householdRole: 'GUEST',
    team: 'Desserts',
    sentAt: -14 * DAY,
    rows: [
      {
        item: 'The birthday cake',
        critical: true,
        createdAt: -10 * DAY,
        taps: [
          { at: -7 * DAY, tap: 'ACCEPTED' },
          { at: -26 * HOUR, tap: 'DECLINED' },
        ],
      },
    ],
    note: 'RED — handed a CRITICAL back. The door, the why-line, and §3’s one assistant message',
  },
  {
    slug: 'ray',
    name: 'Ray Dalton',
    household: 'Dalton',
    householdRole: 'PRIMARY_CONTACT',
    team: 'Mains',
    sentAt: -14 * DAY,
    // Itemless and asked outright, before any window — the only way a stored NO sits under an
    // accepted row, and what makes him a REVERSAL rather than a plain decline.
    attendance: { at: -9 * DAY, answer: 'NO' },
    rows: [
      {
        item: 'The ice',
        critical: true,
        createdAt: -6 * DAY,
        taps: [
          { at: -5 * DAY, tap: 'ACCEPTED' },
          { at: -30 * HOUR, tap: 'DECLINED' },
        ],
      },
    ],
    note: 'THE SETTLED REVERSAL — OUT, faded, text included; his critical falls loose to the strip',
  },
  {
    slug: 'sarah',
    name: 'Sarah Dalton',
    household: 'Dalton',
    householdRole: 'PARTNER',
    team: 'Mains',
    // Day-4 leg lands tomorrow — the near branch of the clock-line.
    sentAt: -3 * DAY,
    rows: [{ item: 'The wine', createdAt: -10 * DAY, placeholderQty: true, taps: [] }],
    note: 'AMBER, clock TOMORROW — the reference’s own example person, on the nearest clock',
  },
  {
    slug: 'connor',
    name: 'Connor OBrien',
    household: "O'Brien",
    householdRole: 'PRIMARY_CONTACT',
    team: 'Desserts',
    sentAt: -14 * DAY,
    rows: [
      { item: 'The crackers', createdAt: -10 * DAY, taps: [{ at: -7 * DAY, tap: 'ACCEPTED' }] },
    ],
    note: 'GREEN — settled',
  },
  {
    slug: 'aoife',
    name: 'Aoife OBrien',
    household: "O'Brien",
    householdRole: 'PARTNER',
    team: 'Desserts',
    dontChase: true,
    sentAt: -14 * DAY,
    rows: [{ item: 'The cake', createdAt: -10 * DAY, qty: [1.5, 'KG'], taps: [] }],
    note: 'NOT_CHASED — Ruling 14’s grey, border kept. GTC-179’s trap: her cadence is null too',
  },
];

/** Ruling 8: one ownerless critical to NAME beside Ray's loose one, two ordinary ones to COUNT. */
const LOOSE = [
  { slug: 'ham', name: 'the glazed ham', critical: true },
  { slug: 'cups', name: 'the paper cups', critical: false },
  { slug: 'serviettes', name: 'the serviettes', critical: false },
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

async function wipe() {
  await prisma.event.deleteMany({ where: { id: EVENT_ID } });
  await prisma.person.deleteMany({ where: { email: { endsWith: EMAIL_SUFFIX } } });
}

async function build(user: { id: string }, hostPerson: { id: string }) {
  await wipe();

  const now = new Date();
  const at = (ms: number) => new Date(now.getTime() + ms);

  const event = await prisma.event.create({
    data: {
      id: EVENT_ID,
      name: 'GTC-192 phase 7 — the two variants',
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
      id: `${EVENT_ID}-role-host`,
      userId: user.id,
      eventId: event.id,
      role: 'HOST',
      // STAMPED AT NOW, ON PURPOSE. Nothing replays; see the header.
      glanceSeenAt: now,
    },
  });

  const teams = {
    Mains: await prisma.team.create({
      data: { id: `${EVENT_ID}-team-mains`, eventId: event.id, name: 'Mains' },
    }),
    Desserts: await prisma.team.create({
      data: { id: `${EVENT_ID}-team-desserts`, eventId: event.id, name: 'Desserts' },
    }),
  };

  // Spaced createdAt: the board orders households by it, so Ruling 3's map is the same map on
  // every re-seed and the founder is not comparing two different geographies.
  const households = new Map<string, string>();
  for (const [i, name] of HOUSEHOLDS.entries()) {
    const slug = name.toLowerCase().replace(/[^a-z]/g, '');
    const hh = await prisma.household.create({
      data: {
        id: `${EVENT_ID}-hh-${slug}`,
        eventId: event.id,
        createdAt: at(-10 * DAY + i * 1000),
      },
    });
    households.set(name, hh.id);
  }

  let audits = 0;
  let invites = 0;

  for (const spec of CAST) {
    const person = spec.isHost
      ? hostPerson
      : await prisma.person.create({
          data: {
            id: `${EVENT_ID}-person-${spec.slug}`,
            name: spec.name,
            email: `${spec.slug}${EMAIL_SUFFIX}`,
          },
        });

    const personEvent = await prisma.personEvent.create({
      data: {
        id: `${EVENT_ID}-pe-${spec.slug}`,
        personId: person.id,
        eventId: event.id,
        role: spec.isHost ? 'HOST' : 'PARTICIPANT',
        teamId: spec.isHost ? null : teams[spec.team ?? 'Mains'].id,
        householdId: households.get(spec.household)!,
        householdRole: spec.householdRole,
        nudgeMark: spec.dontChase ? 'DONT_CHASE' : null,
        sentAt: spec.sentAt === null ? null : at(spec.sentAt),
      },
    });

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
          id: `${EVENT_ID}-audit-${spec.slug}-attendance`,
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
          id: `${EVENT_ID}-invite-${spec.slug}-attendance`,
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
          id: `${EVENT_ID}-item-${slug}`,
          teamId: teams[spec.team ?? 'Mains'].id,
          name: row.item,
          kind: 'ITEM',
          critical: row.critical ?? false,
          // RULING 32. Written as the REAL COLUMNS, never as a display string: the panel does
          // the formatting, so the fixture cannot encode a formatting decision the app does
          // not make. A PLACEHOLDER row carries no amount at all — which is what makes it
          // absent in the panel, and is the point of having one on the board.
          quantityAmount: row.placeholderQty ? null : (row.qty?.[0] ?? null),
          quantityUnit: row.placeholderQty ? null : ((row.qty?.[1] as never) ?? null),
          quantityUnitCustom: row.qty?.[1] === 'CUSTOM' ? ((row.qty[2] as string) ?? null) : null,
          quantityState: row.placeholderQty ? 'PLACEHOLDER' : 'SPECIFIED',
          createdAt: at(row.createdAt),
        },
      });
      const assignment = await prisma.assignment.create({
        data: {
          id: `${EVENT_ID}-assign-${slug}`,
          itemId: item.id,
          personId: person.id,
          // THE LEDGER IS THE AUTHORITY — the last tap, or the schema default when there is none.
          response: row.taps.length ? row.taps[row.taps.length - 1].tap : 'PENDING',
          createdAt: at(row.createdAt),
        },
      });

      let previous = 'PENDING';
      for (const { at: tapAt, tap } of row.taps) {
        await prisma.auditEntry.create({
          data: {
            id: `${EVENT_ID}-audit-${slug}-${tap.toLowerCase()}-${Math.abs(tapAt)}`,
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
            id: `${EVENT_ID}-invite-${slug}-${tap.toLowerCase()}-${Math.abs(tapAt)}`,
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

  for (const loose of LOOSE) {
    await prisma.item.create({
      data: {
        id: `${EVENT_ID}-item-${loose.slug}`,
        teamId: teams.Mains.id,
        name: loose.name,
        kind: 'ITEM',
        critical: loose.critical,
        createdAt: at(-10 * DAY),
      },
    });
  }

  const counts = {
    Event: await prisma.event.count({ where: { id: EVENT_ID } }),
    EventRole: await prisma.eventRole.count({ where: { eventId: EVENT_ID } }),
    Team: await prisma.team.count({ where: { eventId: EVENT_ID } }),
    Household: await prisma.household.count({ where: { eventId: EVENT_ID } }),
    PersonEvent: await prisma.personEvent.count({ where: { eventId: EVENT_ID } }),
    Person: await prisma.person.count({ where: { email: { endsWith: EMAIL_SUFFIX } } }),
    Item: await prisma.item.count({ where: { team: { eventId: EVENT_ID } } }),
    Assignment: await prisma.assignment.count({
      where: { item: { team: { eventId: EVENT_ID } } },
    }),
    AuditEntry: await prisma.auditEntry.count({ where: { eventId: EVENT_ID } }),
    InviteEvent: await prisma.inviteEvent.count({ where: { eventId: EVENT_ID } }),
  };

  console.log('\n── GTC-192 phase 7 — the two variants ──');
  console.log('  rows written :', JSON.stringify(counts));
  console.log('  ledger rows  :', audits, 'audit,', invites, 'invite');
  console.log('  glanceSeenAt :', now.toISOString(), '(= createdAt — nothing replays)');
  console.log('');
  for (const spec of CAST) console.log(`  ${spec.name.padEnd(16)} ${spec.note}`);
  console.log('');
  for (const v of ['none', 'a', 'b-red', 'b-all']) {
    console.log(
      `  ?variant=${v.padEnd(6)} http://localhost:3000/plan/${EVENT_ID}/glance?variant=${v}`
    );
  }
}

/**
 * THE IDEMPOTENCE CHECK — a canonical dump, sorted, with every instant made RELATIVE.
 *
 * ⚠ ABSOLUTE TIMESTAMPS CANNOT BE DIFFED ACROSS TWO RUNS and pretending otherwise would make
 * this check vacuous in the loudest possible way: every row would differ every time, so a real
 * difference would be invisible in the noise. Every instant is printed as whole minutes from
 * `Event.createdAt`, which is the anchor the whole fixture is written against — so two runs
 * minutes apart produce byte-identical output if and only if the SHAPE is identical.
 */
async function dump() {
  const event = await prisma.event.findUnique({
    where: { id: EVENT_ID },
    select: { createdAt: true, name: true, status: true, startDate: true, endDate: true },
  });
  if (!event) {
    console.log('NO EVENT');
    return;
  }
  const base = event.createdAt.getTime();
  const rel = (d: Date | null) =>
    d === null ? 'null' : `${Math.round((d.getTime() - base) / MIN)}m`;

  const out: string[] = [];
  out.push(
    `event ${event.name} ${event.status} start=${rel(event.startDate)} end=${rel(event.endDate)}`
  );

  const roles = await prisma.eventRole.findMany({
    where: { eventId: EVENT_ID },
    select: { role: true, glanceSeenAt: true },
    orderBy: { id: 'asc' },
  });
  for (const r of roles) out.push(`role ${r.role} glanceSeenAt=${rel(r.glanceSeenAt)}`);

  const pes = await prisma.personEvent.findMany({
    where: { eventId: EVENT_ID },
    select: {
      id: true,
      role: true,
      householdRole: true,
      nudgeMark: true,
      sentAt: true,
      attendanceAnswer: true,
      attendanceAnsweredAt: true,
      person: { select: { name: true } },
      household: { select: { id: true } },
      team: { select: { name: true } },
    },
    orderBy: { id: 'asc' },
  });
  for (const p of pes) {
    out.push(
      `person ${p.person.name} | ${p.role} ${p.householdRole} hh=${p.household?.id ?? 'none'} ` +
        `team=${p.team?.name ?? 'none'} mark=${p.nudgeMark ?? 'none'} sentAt=${rel(p.sentAt)} ` +
        `attend=${p.attendanceAnswer ?? 'none'}@${rel(p.attendanceAnsweredAt)}`
    );
  }

  const items = await prisma.item.findMany({
    where: { team: { eventId: EVENT_ID } },
    select: {
      id: true,
      name: true,
      critical: true,
      createdAt: true,
      // `Item.assignment` is SINGULAR — one row, optional. Written as `assignments` in the
      // first cut, which Prisma rejects, which threw, which made `--dump` print a STACK TRACE
      // to stderr. Two runs of that produced two byte-identical stack traces and the diff came
      // back clean, so the idempotence check passed while measuring nothing at all. Recorded
      // here rather than quietly fixed: it is the ticket's own vacuous-green family, and the
      // fix is the shape check below, not the field name.
      // RULING 32. In the dump because it is now board state: a quantity that changed
      // between two seeds must show up in the diff, or the check stops covering what the
      // fixture writes.
      quantityAmount: true,
      quantityUnit: true,
      quantityUnitCustom: true,
      quantityState: true,
      assignment: { select: { response: true, person: { select: { name: true } } } },
    },
    orderBy: { id: 'asc' },
  });
  for (const i of items) {
    const a = i.assignment;
    const held = a ? `${a.person.name}=${a.response}` : '';
    const q = `${i.quantityAmount ?? '-'}/${i.quantityUnit ?? '-'}/${i.quantityUnitCustom ?? '-'}/${i.quantityState}`;
    out.push(
      `item ${i.name} critical=${i.critical} qty=${q} created=${rel(i.createdAt)} held=[${held}]`
    );
  }

  const audit = await prisma.auditEntry.findMany({
    where: { eventId: EVENT_ID },
    select: { actionType: true, targetType: true, timestamp: true, details: true },
    orderBy: [{ timestamp: 'asc' }, { actionType: 'asc' }],
  });
  for (const a of audit) {
    out.push(`audit ${rel(a.timestamp)} ${a.actionType} ${a.targetType} :: ${a.details ?? ''}`);
  }

  const invite = await prisma.inviteEvent.findMany({
    where: { eventId: EVENT_ID },
    select: { type: true, createdAt: true, metadata: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  for (const i of invite) {
    out.push(`invite ${rel(i.createdAt)} ${i.type} ${JSON.stringify(i.metadata)}`);
  }

  /*
    ⚠ THE DUMP CHECKS ITS OWN SHAPE BEFORE IT PRINTS, AND THIS EXISTS BECAUSE IT ONCE DID NOT.

    A `--dump` that throws prints a stack trace, and two runs of the same throw are
    byte-identical — so "run it twice and diff" comes back CLEAN while measuring nothing. That
    is exactly the vacuous green the standing warning is about, and it happened here on the
    first cut. A crash must not be able to look like a passing diff, so the dump refuses to
    print unless every kind of line it is supposed to carry is actually present, and prints its
    own census first so a shrunken dump is visible in the diff rather than merely smaller.
  */
  const census = ['event', 'role', 'person', 'item', 'audit', 'invite'].map((kind) => {
    const n = out.filter((l) => l.startsWith(`${kind} `)).length;
    if (n === 0) throw new Error(`DUMP IS INCOMPLETE — no "${kind}" lines. Refusing to print.`);
    return `${kind}=${n}`;
  });
  console.log(`census ${census.join(' ')}`);
  console.log(out.sort().join('\n'));
}

async function main() {
  if (process.argv.includes('--dump')) {
    await dump();
    await prisma.$disconnect();
    return;
  }
  const user = await prisma.user.findUnique({ where: { email: HOST_EMAIL } });
  if (!user) throw new Error(`No User with email ${HOST_EMAIL}`);
  const hostPerson = await prisma.person.findFirst({ where: { email: HOST_EMAIL } });
  if (!hostPerson) throw new Error(`No Person with email ${HOST_EMAIL}`);
  await build(user, hostPerson);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
