/**
 * GTC-192 (J1, phase 1) — the person-keyed read API.
 *
 * Moment 4 §10.8: "the grid is person-primary. People are the boxes; items live inside
 * the person. A person holding items in different states shows the worst colour, with all
 * items visible on tap." The chosen design (`docs/design/moment4-glance-reference.md`)
 * keeps that substance and changes the geometry: card = household = channel, strip =
 * person = state. Phase 1 builds the data shape and nothing else — no UI.
 *
 * FOUR LAYERS, DELIBERATELY:
 *  1. Pure — `src/lib/glance/state.ts` against fixed clocks and literals. No database, so
 *     the decide-by boundary can be hit exactly rather than approximately.
 *  2. DB — `readEventGlance` over a seeded event with a deliberate mix of states. The pure
 *     layer can be right while the reader assembles the wrong shape.
 *  3. Runtime fence — Ruling 1 asserted against the ACTUAL payload keys, and the
 *     no-household-colour rule asserted against the actual household objects.
 *  4. Structural — Ruling 1 asserted against the SOURCE with comments stripped, the way
 *     `tests/nudge-cadence-test.ts` proves the criticality exclusion. A "we don't render
 *     it" assertion is not the fence; the field must be absent from the select.
 *
 * WHY `now` IS INJECTED. `isDecideByExpired` and `nextNudgeAt` are clock predicates, and a
 * test that cannot fix the clock asserts whatever the wall clock happened to be when CI
 * ran. Same shape as `tests/decide-by-clock-test.ts` and `tests/nudge-cadence-test.ts`.
 *
 * NO SMS IS SENT and nothing is written outside this file's own fixture rows.
 *
 * Run: npx tsx tests/glance-read-test.ts
 * Destructive to its own created rows only; cleans up in finally.
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

let passed = 0;
let failed = 0;
const redAssertions: string[] = [];

function assert(phase: string, label: string, condition: boolean) {
  if (condition) {
    console.log(`\x1b[32m✓\x1b[0m [${phase}] ${label}`);
    passed++;
  } else {
    console.error(`\x1b[31m✗\x1b[0m [${phase}] ${label}`);
    failed++;
    redAssertions.push(`[${phase}] ${label}`);
  }
}

/**
 * Evaluate an assertion that may throw before the module under test exists. A missing
 * export must READ as a failed assertion, not as a crashed run — that is what keeps RED
 * and GREEN in one file rather than "the import blew up".
 */
function ok(fn: () => boolean): boolean {
  try {
    return fn() === true;
  } catch {
    return false;
  }
}

/** Source exactly as written. Empty string when the file does not exist yet (the RED run). */
function raw(rel: string): string {
  try {
    return readFileSync(join(__dirname, '..', rel), 'utf8');
  } catch {
    return '';
  }
}

/** Source with comments stripped — naming a thing you excluded must not read as using it. */
function code(rel: string): string {
  try {
    return readFileSync(join(__dirname, '..', rel), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
  } catch {
    return '';
  }
}

/**
 * Ruling 1's fence, as a list of names.
 *
 * > The replay may only ever show state changes (resolutions), never behaviour. No opens,
 * > no views, no hesitations, ever.
 *
 * Ruling 1 states the fence for the replay (phase 6); this ticket applies it from birth,
 * because a payload that already carries the field only needs somebody to render it.
 * Every name below is a real column, model or enum member in `prisma/schema.prisma` that
 * records what a GUEST DID rather than what they DECIDED — `InviteEvent.LINK_OPENED` is
 * the archetype, and `AuditEntry` is the same thing at a different grain.
 *
 * `firstNudgeSentAt` / `secondNudgeSentAt` are in the list for a second reason: they are
 * the raw material an exhaustion count would be derived from, and GTC-251 owns that
 * derivation. Denying them here forces the seam to take a DECISION (`ExhaustionFact`)
 * rather than telemetry it would have to interpret itself.
 *
 * `PersonEvent.sentAt` is deliberately NOT here. It records when GATHER SENT, which is the
 * anchor E1's cadence counts from — system action, not guest behaviour.
 */
const BEHAVIOUR_DENYLIST = [
  'openedAt',
  'viewedAt',
  'lastViewedAt',
  'seenAt',
  'lastSeenAt',
  'inviteEvent',
  'InviteEvent',
  'LINK_OPENED',
  'NAME_CLAIMED',
  'RESPONSE_SUBMITTED',
  'nudgeLog',
  'NudgeLog',
  'auditEntry',
  'AuditEntry',
  'rsvpStatus',
  'rsvpRespondedAt',
  'rsvpFollowupSentAt',
  'attendanceAnsweredAt',
  'claimedViaSharedLink',
  'claimedAt',
  'firstNudgeSentAt',
  'secondNudgeSentAt',
  'decideByFollowupSentAt',
];

/** Every key appearing anywhere in a payload, at any depth. */
function collectKeys(value: unknown, into: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const v of value) collectKeys(v, into);
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      into.add(k);
      collectKeys(v, into);
    }
  }
  return into;
}

/** The declaration body of an exported interface, for asserting what a TYPE does not have. */
function interfaceBody(src: string, name: string): string {
  const m = new RegExp(`export interface ${name}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(src);
  return m ? m[1] : '';
}

/** The body of a named exported function, for asserting how a number is arrived at. */
function functionBody(src: string, name: string): string {
  const m = new RegExp(`export function ${name}[\\s\\S]*?\\n\\}`).exec(src);
  return m ? m[0] : '';
}

async function main() {
  const createdEventIds: string[] = [];
  const createdPersonIds: string[] = [];
  const createdUserIds: string[] = [];

  // The modules under test. Absent before the fix — every assertion below then reads as
  // a failure rather than a crash, which is what makes the RED run legible.
  let S: any = null;
  let R: any = null;
  let RT: any = null;
  let loadError: string | null = null;
  try {
    S = await import('../src/lib/glance/state');
    R = await import('../src/lib/glance/read');
    RT = await import('../src/app/api/events/[id]/glance/route');
  } catch (err) {
    loadError = String((err as Error).message).split('\n')[0];
    console.error(`\x1b[31m!\x1b[0m module load failed: ${loadError}`);
  }

  try {
    // ══ LAYER 1 — the pure derivation ════════════════════════════════════
    //
    // A fixed clock, and events/items as literals. `DecideByEvent` and `DecideByItem` are
    // structural in `src/lib/decide-by.ts`, so no database is needed to hit the boundary.
    const NOW = new Date('2026-08-30T12:00:00.000Z');
    const event = {
      status: 'CONFIRMING' as const,
      sentAt: new Date(NOW.getTime() - 10 * DAY),
      endDate: new Date(NOW.getTime() + 130 * HOUR),
      decideByOffsetHours: null,
      nudgePace: null,
    };
    /** decideBy = endDate − 120h = NOW + 10h. Live. */
    const liveItem = { dropOffAt: null, decideByOffsetHours: null };
    /** decideBy = endDate − 200h = NOW − 70h. Expired. */
    const expiredItem = { dropOffAt: null, decideByOffsetHours: 200 };

    const itemState = (response: string, item: any, extra: any = {}) =>
      S.deriveItemState(
        { response, item, critical: false, itemId: 'i', assignmentId: 'a', name: 'n' },
        event,
        { isHost: false, exhaustion: null, ...extra },
        NOW
      );

    assert(
      'item state',
      'ACCEPTED is GREEN — §3 "Green — nothing is yours"',
      ok(() => itemState('ACCEPTED', liveItem).state === 'GREEN')
    );
    assert(
      'item state',
      'PENDING is AMBER — the cadence is on it, "with Gather"',
      ok(() => itemState('PENDING', liveItem).state === 'AMBER')
    );
    assert(
      'item state',
      'a LIVE maybe is AMBER — Hinge §8, held softly; not a gap',
      ok(() => {
        const r = itemState('MAYBE', liveItem);
        return r.state === 'AMBER' && r.reason === 'MAYBE_LIVE';
      })
    );
    assert(
      'item state',
      'an EXPIRED maybe is RED, and says so — isDecideByExpired, not a second definition',
      ok(() => {
        const r = itemState('MAYBE', expiredItem);
        return r.state === 'RED' && r.reason === 'DECIDE_BY_EXPIRED';
      })
    );
    assert(
      'item state',
      'DECLINED is RED — §8.6, a withdrawn or broken claim reverts red at once',
      ok(() => {
        const r = itemState('DECLINED', liveItem);
        return r.state === 'RED' && r.reason === 'REVERSAL';
      })
    );

    // The decide-by boundary, both sides. Strict `>` in isDecideByExpired: due AT the
    // decide-by, late only once past it.
    assert(
      'Ruling 15',
      'the decide-by boundary is not expired AT the instant, and is one ms later',
      ok(() => {
        const at = S.decideByFor(liveItem, event);
        const still = S.deriveItemState(
          {
            response: 'MAYBE',
            item: liveItem,
            critical: false,
            itemId: 'i',
            assignmentId: 'a',
            name: 'n',
          },
          event,
          { isHost: false, exhaustion: null },
          at
        );
        const past = S.deriveItemState(
          {
            response: 'MAYBE',
            item: liveItem,
            critical: false,
            itemId: 'i',
            assignmentId: 'a',
            name: 'n',
          },
          event,
          { isHost: false, exhaustion: null },
          new Date(at.getTime() + 1)
        );
        return still.state === 'AMBER' && past.state === 'RED';
      })
    );

    // ── The GTC-251 seam ──────────────────────────────────────────────────
    //
    // E6 is OPEN. The door must exist and must be ONE door (§8.1: "the calendar is a
    // second way to exhaust, not a new meaning for red"), and nothing here may claim to
    // know the answer in the meantime.
    assert(
      'GTC-251 seam',
      'EXHAUSTED_SILENCE is in the red vocabulary — one door, not two',
      ok(() => S.RED_REASONS.includes('EXHAUSTED_SILENCE'))
    );
    assert(
      'GTC-251 seam',
      'a supplied exhaustion fact turns a PENDING ask RED — the seam carries weight',
      ok(() => {
        const r = itemState('PENDING', liveItem, { exhaustion: { exhausted: true } });
        return r.state === 'RED' && r.reason === 'EXHAUSTED_SILENCE';
      })
    );
    assert(
      'GTC-251 seam',
      'and NO exhaustion fact leaves it AMBER — absence of a signal is not a "no"',
      ok(() => itemState('PENDING', liveItem, { exhaustion: null }).state === 'AMBER')
    );

    // ── Worst-colour-wins, per PERSON (§10.8) ─────────────────────────────
    assert(
      'worst wins',
      'RED beats AMBER beats GREEN',
      ok(
        () =>
          S.worstItemState(['GREEN', 'AMBER']) === 'AMBER' &&
          S.worstItemState(['AMBER', 'RED']) === 'RED' &&
          S.worstItemState(['GREEN', 'RED', 'AMBER']) === 'RED' &&
          S.worstItemState(['GREEN', 'GREEN']) === 'GREEN'
      )
    );
    assert(
      'worst wins',
      'and no items yields null — an empty hand has no colour of its own',
      ok(() => S.worstItemState([]) === null)
    );

    const person = (overrides: any) =>
      S.derivePersonState(
        {
          isHost: false,
          nudgeMark: null,
          attendanceAnswer: null,
          exhaustion: null,
          items: [],
          ...overrides,
        },
        event,
        NOW
      );
    const held = (response: string, item: any = liveItem) => ({
      response,
      item,
      critical: false,
      itemId: `i-${response}`,
      assignmentId: `a-${response}`,
      name: response,
    });

    assert(
      'person state',
      'a person holding a LIVE maybe and an EXPIRED maybe shows RED (§10.8, worst colour)',
      ok(() => {
        const r = person({
          items: [
            held('MAYBE', liveItem),
            { ...held('MAYBE', expiredItem), itemId: 'i2', assignmentId: 'a2' },
          ],
        });
        return r.state === 'RED' && r.reasons.includes('DECIDE_BY_EXPIRED');
      })
    );
    assert(
      'person state',
      'attendance NO is OUT, not GREEN — Rulings 7 and 11 supersede the reference table',
      ok(() => person({ attendanceAnswer: 'NO' }).state === 'OUT')
    );
    assert(
      'person state',
      'DONT_CHASE displaces AMBER with NOT_CHASED — expected, just unbothered',
      ok(() => person({ nudgeMark: 'DONT_CHASE', items: [held('PENDING')] }).state === 'NOT_CHASED')
    );
    assert(
      'Ruling 14',
      'DONT_CHASE beats the EXPIRED MAYBE — grey wins',
      ok(
        () =>
          person({ nudgeMark: 'DONT_CHASE', items: [held('MAYBE', expiredItem)] }).state ===
          'NOT_CHASED'
      )
    );
    assert(
      'Ruling 14',
      'DONT_CHASE beats the REVERSAL — a broken claim Kate is handling is not the system’s to escalate',
      ok(
        () => person({ nudgeMark: 'DONT_CHASE', items: [held('DECLINED')] }).state === 'NOT_CHASED'
      )
    );
    assert(
      'Ruling 14',
      'DONT_CHASE beats EXHAUSTION — the red door does not reopen the person Kate switched off',
      ok(
        () =>
          person({
            nudgeMark: 'DONT_CHASE',
            exhaustion: { exhausted: true },
            items: [held('PENDING')],
          }).state === 'NOT_CHASED'
      )
    );
    assert(
      'Ruling 14',
      'and beats a red mixed among greens — worst-colour-wins runs first, the mark runs last',
      ok(
        () =>
          person({
            nudgeMark: 'DONT_CHASE',
            items: [
              held('ACCEPTED'),
              { ...held('MAYBE', expiredItem), itemId: 'i9', assignmentId: 'a9' },
            ],
          }).state === 'NOT_CHASED'
      )
    );
    assert(
      'Ruling 14',
      'the mark greys the STRIP, never the row — the red item is still red on tap (§10.8)',
      ok(() => {
        const r = person({ nudgeMark: 'DONT_CHASE', items: [held('MAYBE', expiredItem)] });
        return (
          r.state === 'NOT_CHASED' &&
          r.reasons.length === 1 &&
          r.reasons[0] === 'DONT_CHASE' &&
          itemState('MAYBE', expiredItem).state === 'RED'
        );
      })
    );
    assert(
      'Ruling 14',
      'boundary: a SETTLED person stays GREEN — green is not a red source, and hiding her ' +
        'would empty the wall of names Ruling 5 keeps',
      ok(() => person({ nudgeMark: 'DONT_CHASE', items: [held('ACCEPTED')] }).state === 'GREEN')
    );
    assert(
      'Ruling 14',
      'boundary: an OUT person stays OUT — they answered, and OUT is not a red source either',
      ok(() => person({ nudgeMark: 'DONT_CHASE', attendanceAnswer: 'NO' }).state === 'OUT')
    );
    assert(
      'Ruling 16',
      'the itemless undecided person is AMBER — the ask is real even when the hands are empty',
      ok(() => person({}).state === 'AMBER')
    );
    assert(
      'person state',
      'the HOST is never AMBER by absence of a reply — GTC-256 Ruling 5, no ask is ever made',
      ok(
        () =>
          person({ isHost: true }).state === 'GREEN' &&
          person({ isHost: true, items: [held('PENDING')] }).state === 'GREEN'
      )
    );
    assert(
      'person state',
      'but the host is still RED when something is genuinely hers',
      ok(() => person({ isHost: true, items: [held('DECLINED')] }).state === 'RED')
    );

    // ── The summary sentence (Ruling 2) ───────────────────────────────────
    assert(
      'summary',
      'three counts of PEOPLE — "3 need you. Gather is on 9. 28 settled."',
      ok(() => {
        const s = S.summarisePeople(['RED', 'RED', 'AMBER', 'GREEN', 'GREEN', 'GREEN']);
        return (
          s.needYou === 2 && s.withGather === 1 && s.settled === 3 && Object.keys(s).length === 3
        );
      })
    );
    assert(
      'summary',
      'NOT_CHASED and OUT are counted in none of the three — neither yours, nor moving, nor settled',
      ok(() => {
        const s = S.summarisePeople(['NOT_CHASED', 'OUT']);
        return s.needYou === 0 && s.withGather === 0 && s.settled === 0;
      })
    );
    assert(
      'summary',
      'every count is a whole number of people (Ruling 2 — never a rate, never a proportion)',
      ok(() => {
        const s = S.summarisePeople(['RED', 'AMBER', 'GREEN', 'OUT']);
        return Object.values(s).every((n) => Number.isInteger(n));
      })
    );

    // ══ THE FIXTURE ══════════════════════════════════════════════════════
    //
    // One sent event, five households' worth of people, every state on the board at once.
    const stamp = Date.now();
    const user = await prisma.user.create({ data: { email: `gtc192-p1+${stamp}@example.com` } });
    createdUserIds.push(user.id);

    const hostPerson = await prisma.person.create({
      data: { name: 'Kate Whittaker', email: user.email, userId: user.id },
    });
    createdPersonIds.push(hostPerson.id);

    const sentAt = new Date(NOW.getTime() - 10 * DAY);
    const dbEvent = await prisma.event.create({
      data: {
        name: 'GTC-192 phase 1 glance fixture',
        startDate: new Date(NOW.getTime() + 100 * HOUR),
        endDate: new Date(NOW.getTime() + 130 * HOUR),
        hostId: hostPerson.id,
        status: 'CONFIRMING',
        sentAt,
      },
    });
    createdEventIds.push(dbEvent.id);

    const mains = await prisma.team.create({ data: { eventId: dbEvent.id, name: 'Mains' } });

    /** A household plus its members, in one call, so the fixture reads as a guest list. */
    async function household(
      members: Array<{ name: string; role: any; mark?: any; answer?: any; sentAt?: Date }>
    ) {
      const hh = await prisma.household.create({ data: { eventId: dbEvent.id } });
      const rows = [];
      for (const m of members) {
        const p = await prisma.person.create({
          data: { name: m.name, email: `gtc192+${stamp}+${m.name.replace(/\W/g, '')}@example.com` },
        });
        createdPersonIds.push(p.id);
        rows.push(
          await prisma.personEvent.create({
            data: {
              personId: p.id,
              eventId: dbEvent.id,
              role: 'PARTICIPANT',
              householdId: hh.id,
              householdRole: m.role,
              nudgeMark: m.mark ?? null,
              attendanceAnswer: m.answer ?? null,
              sentAt: m.sentAt ?? sentAt,
            },
          })
        );
      }
      return { householdId: hh.id, rows };
    }

    async function give(
      personId: string,
      name: string,
      response: any,
      offsetHours: number | null = null,
      critical = false
    ) {
      const item = await prisma.item.create({
        data: { teamId: mains.id, name, kind: 'ITEM', critical, decideByOffsetHours: offsetHours },
      });
      await prisma.assignment.create({ data: { itemId: item.id, personId, response } });
      return item;
    }

    // The host's own household: Ruling 3's anchor, and Ruling 5's silent holding.
    const hostHh = await prisma.household.create({ data: { eventId: dbEvent.id } });
    await prisma.personEvent.create({
      data: {
        personId: hostPerson.id,
        eventId: dbEvent.id,
        role: 'HOST',
        householdId: hostHh.id,
        householdRole: 'PRIMARY_CONTACT',
        sentAt,
      },
    });
    await give(hostPerson.id, 'The ham', 'PENDING', null, true);

    // The Turners — the mixed household. Amelia is red, Charlotte is green, and the CARD
    // is neither.
    const turners = await household([
      { name: 'Amelia Turner', role: 'PRIMARY_CONTACT' },
      { name: 'Charlotte Turner', role: 'PARTNER' },
    ]);
    await give(turners.rows[0].personId, 'The trifle', 'MAYBE', null);
    await give(turners.rows[0].personId, 'The pavlova', 'MAYBE', 200, true);
    await give(turners.rows[1].personId, 'The salad', 'ACCEPTED');

    // The O'Briens — Connor chased, Aoife deliberately left alone (the reference's own
    // example). Connor's send clock is 2 days old, so his next nudge is still to come.
    const obriens = await household([
      { name: 'Connor OBrien', role: 'PRIMARY_CONTACT', sentAt: new Date(NOW.getTime() - 2 * DAY) },
      { name: 'Aoife OBrien', role: 'PARTNER', mark: 'DONT_CHASE' },
    ]);
    await give(obriens.rows[0].personId, 'The bread', 'PENDING');
    await give(obriens.rows[1].personId, 'The cheese', 'PENDING');
    // Ruling 14, against real rows: an expired maybe on the person Kate switched off.
    await give(obriens.rows[1].personId, 'The cake', 'MAYBE', 200, true);

    // The Rays — Ray is out; Sarah's claim broke (§8.6, the ankle).
    const rays = await household([
      { name: 'Ray Dalton', role: 'PRIMARY_CONTACT', answer: 'NO' },
      { name: 'Sarah Dalton', role: 'PARTNER' },
    ]);
    await give(rays.rows[1].personId, 'The gravy', 'DECLINED');

    // Ruling 8's subject: items with NO Assignment row at all. The house predicate for
    // "unassigned" is `assignment: null` (pre-flight, the coordinator route, check.ts),
    // never Item.status — that column is a presence cache (architecture-contract §6).
    async function loose(name: string, critical: boolean) {
      await prisma.item.create({
        data: { teamId: mains.id, name, kind: 'ITEM', critical },
      });
    }
    await loose('the glazed ham', true);
    await loose('the marquee', true);
    await loose('the paper cups', false);
    await loose('the serviettes', false);
    await loose('the spare chairs', false);

    // A person with NO household — the V1 shape, and 61 of 93 rows in gather_dev today.
    const loosePerson = await prisma.person.create({
      data: { name: 'Bob Unhoused', email: `gtc192+${stamp}+bob@example.com` },
    });
    createdPersonIds.push(loosePerson.id);
    await prisma.personEvent.create({
      data: { personId: loosePerson.id, eventId: dbEvent.id, role: 'PARTICIPANT', sentAt },
    });
    await give(loosePerson.id, 'The ice', 'ACCEPTED');

    // ══ LAYER 2 — the reader ═════════════════════════════════════════════
    const payload = R ? await R.readEventGlance(prisma, dbEvent.id, NOW) : null;
    const byName = (n: string) =>
      [
        ...(payload?.households ?? []).flatMap((h: any) => h.members),
        ...(payload?.unhoused ?? []),
      ].find((p: any) => p.name === n);

    assert(
      'shape',
      'the payload is PERSON-KEYED — no top-level item collection anywhere',
      ok(() => !('items' in payload) && !('assignments' in payload))
    );
    assert(
      'shape',
      'and items live INSIDE the person (§10.8) — every item reached through a member',
      ok(() =>
        payload.households.every((h: any) => h.members.every((m: any) => Array.isArray(m.items)))
      )
    );
    assert(
      'shape',
      'every person on the event is on the board — including the host and the unhoused',
      ok(() => {
        const names = [
          ...payload.households.flatMap((h: any) => h.members.map((m: any) => m.name)),
          ...payload.unhoused.map((m: any) => m.name),
        ];
        return (
          names.length === 8 && names.includes('Kate Whittaker') && names.includes('Bob Unhoused')
        );
      })
    );

    assert(
      'Ruling 3',
      "the host's own household anchors FIRST — the board is a map, not a queue",
      ok(() => payload.households[0].isHostHousehold === true)
    );
    assert(
      'Ruling 3',
      'and it is the only one so marked',
      ok(() => payload.households.filter((h: any) => h.isHostHousehold).length === 1)
    );
    assert(
      'states',
      'Amelia holds a live maybe and an expired one, and shows RED',
      ok(() => byName('Amelia Turner').state === 'RED')
    );
    assert(
      'states',
      'Charlotte, in the SAME household, is GREEN — per-person, never per-card',
      ok(() => byName('Charlotte Turner').state === 'GREEN')
    );
    assert(
      'states',
      'Connor is AMBER, and carries E1’s next nudge instant for the "nudge in 2 days" line',
      ok(() => {
        const c = byName('Connor OBrien');
        return c.state === 'AMBER' && new Date(c.nextNudgeAt).getTime() === NOW.getTime() + 2 * DAY;
      })
    );
    assert(
      'Ruling 14',
      'Aoife holds an EXPIRED MAYBE and is still NOT_CHASED — grey wins over red, on real rows',
      ok(() => {
        const a = byName('Aoife OBrien');
        return (
          a.state === 'NOT_CHASED' &&
          a.reasons.join() === 'DONT_CHASE' &&
          a.items.some((i: any) => i.state === 'RED' && i.reason === 'DECIDE_BY_EXPIRED')
        );
      })
    );
    assert(
      'states',
      'and her null cadence is NOT read as red either (GTC-179’s inversion)',
      ok(() => byName('Aoife OBrien').nextNudgeAt === null)
    );
    assert(
      'states',
      'Ray is OUT — Ruling 7: a declined guest is not green',
      ok(() => byName('Ray Dalton').state === 'OUT')
    );
    assert(
      'states',
      'Sarah is RED with the reversal’s reason — §8.6, the broken claim',
      ok(() => {
        const s = byName('Sarah Dalton');
        return s.state === 'RED' && s.reasons.includes('REVERSAL');
      })
    );
    assert(
      'states',
      'Kate holds the critical ham on a PENDING row and is GREEN, not AMBER — Ruling 5',
      ok(() => {
        const k = byName('Kate Whittaker');
        return k.isHost === true && k.state === 'GREEN' && k.items[0].critical === true;
      })
    );
    assert(
      'states',
      'Bob has no household and is still on the board, with his own state',
      ok(() => payload.unhoused.length === 1 && payload.unhoused[0].state === 'GREEN')
    );

    assert(
      'Ruling 2',
      'the summary is the three counts the sentence needs: 2 need you, 1 with Gather, 3 settled',
      ok(
        () =>
          payload.summary.needYou === 2 &&
          payload.summary.withGather === 1 &&
          payload.summary.settled === 3
      )
    );
    assert(
      'Ruling 2',
      'and it does not have to add up to the headcount — OUT and NOT_CHASED are in none of the three',
      ok(
        () =>
          payload.summary.needYou + payload.summary.withGather + payload.summary.settled === 6 &&
          payload.households.flatMap((h: any) => h.members).length + payload.unhoused.length === 8
      )
    );

    assert(
      'GTC-170',
      'criticality rides through per item, for J2’s badge to layer on',
      ok(() => byName('Amelia Turner').items.some((i: any) => i.critical === true))
    );
    assert(
      'GTC-175',
      'a live maybe carries its derived decide-by instant, and nothing stores it',
      ok(() => {
        const live = byName('Amelia Turner').items.find((i: any) => i.name === 'The trifle');
        return new Date(live.decideByAt).getTime() === NOW.getTime() + 10 * HOUR;
      })
    );

    // ── Ruling 8: the ownerless criticals reach the payload ───────────────
    assert(
      'Ruling 8',
      'unassigned CRITICALS are carried, named, and are exactly the two that have no owner',
      ok(
        () =>
          payload.unassignedCritical.length === 2 &&
          payload.unassignedCritical
            .map((i: any) => i.name)
            .sort()
            .join('|') === 'the glazed ham|the marquee'
      )
    );
    assert(
      'Ruling 8',
      'ordinary unassigned items are COUNTED, never named — the glance does not nag about them',
      ok(
        () =>
          payload.unassignedOrdinaryCount === 3 &&
          !JSON.stringify(payload).includes('the paper cups')
      )
    );
    assert(
      'Ruling 8',
      'an item held by somebody is not ownerless — assignment state is the whole test',
      ok(
        () =>
          !payload.unassignedCritical.some((i: any) => i.name === 'The pavlova') &&
          !payload.unassignedCritical.some((i: any) => i.name === 'The ham')
      )
    );
    assert(
      'Ruling 8',
      'and the board stays PERSON-KEYED — the strip is the exception Ruling 8 names, not a second grid',
      ok(() => !('items' in payload) && Array.isArray(payload.unassignedCritical))
    );
    assert(
      'architecture §6',
      'unassigned is derived from the ABSENCE OF AN ASSIGNMENT, never from Item.status’s cache',
      ok(() => {
        const src = code('src/lib/glance/read.ts');
        return /assignment:\s*null/.test(src) && !/ItemStatus|'UNASSIGNED'/.test(src);
      })
    );

    // ══ LAYER 3 — the runtime fences ═════════════════════════════════════
    assert(
      'no card colour',
      'NO household carries a state, colour or tint of its own — the card is neutral by ruling',
      ok(() =>
        payload.households.every((h: any) =>
          ['state', 'colour', 'color', 'tint', 'worst', 'status'].every((k) => !(k in h))
        )
      )
    );
    assert(
      'no card colour',
      'and the household merge rule does not exist even as a convenience export',
      ok(
        () =>
          S.worstHouseholdState === undefined &&
          S.householdState === undefined &&
          S.householdColour === undefined
      )
    );

    // A fence that passes on a missing payload is not a fence: every assertion below is
    // gated on the payload actually existing, so deleting the reader cannot turn it green.
    const keys = collectKeys(payload);
    for (const banned of BEHAVIOUR_DENYLIST) {
      assert(
        'Ruling 1 payload',
        `the payload carries no "${banned}"`,
        ok(() => payload !== null && keys.size > 0 && !keys.has(banned))
      );
    }

    // Ruling 3's fixed positions, asserted rather than assumed.
    const second = R ? await R.readEventGlance(prisma, dbEvent.id, NOW) : null;
    assert(
      'Ruling 3',
      'positions are FIXED — two reads of the same event give the same household order',
      ok(
        () =>
          JSON.stringify(payload.households.map((h: any) => h.householdId)) ===
          JSON.stringify(second.households.map((h: any) => h.householdId))
      )
    );

    // ══ LAYER 4 — the structural fences ══════════════════════════════════
    //
    // Comments stripped, so prose about a field cannot satisfy the assertion — the same
    // treatment tests/nudge-cadence-test.ts gives the criticality exclusion.
    const stateSrc = code('src/lib/glance/state.ts');
    const readSrc = code('src/lib/glance/read.ts');
    const routeSrc = code('src/app/api/events/[id]/glance/route.ts');
    // Phase 2 puts a page and a component in the tree. Ruling 1's fence follows them:
    // a behaviour field is no less present for arriving through the view layer.
    const pageSrc = code('src/app/plan/[eventId]/glance/page.tsx');
    const boardSrc = code('src/components/glance/GlanceBoard.tsx');
    const stripSrc = code('src/components/glance/strip.ts');

    assert(
      'Ruling 1 source',
      'every glance source exists — the two modules, the route, the page, the view',
      [stateSrc, readSrc, routeSrc, pageSrc, boardSrc, stripSrc].every((src) => src.length > 0)
    );
    const glanceSources = [stateSrc, readSrc, routeSrc, pageSrc, boardSrc, stripSrc];
    const sourcesExist = glanceSources.every((src) => src.length > 0);
    for (const banned of BEHAVIOUR_DENYLIST) {
      const re = new RegExp(`\\b${banned}\\b`);
      assert(
        'Ruling 1 source',
        `no glance source names "${banned}" — the fence is on the select, not the render`,
        sourcesExist && !glanceSources.some((src) => re.test(src))
      );
    }
    assert(
      'Ruling 1 source',
      'nothing in the glance uses `include:` — no whole row can spread in behind the select',
      sourcesExist && !glanceSources.some((src) => /\binclude\s*:/.test(src))
    );

    // ── The route ─────────────────────────────────────────────────────────
    //
    // Auth asserted on the source, the house pattern (tests/invite-status-auth-test.ts),
    // so route-classifications.json's "SESSION / requireEventRole" entry for this path is
    // held true by a test rather than being an unverified claim in a data file.
    assert(
      'route auth',
      'the glance route is host-scoped through requireEventRole(HOST, COHOST)',
      /requireEventRole\(\s*eventId\s*,\s*\['HOST',\s*'COHOST'\]\s*\)/.test(routeSrc)
    );
    assert(
      'route auth',
      'and it fails closed — the guard’s NextResponse is returned before any read',
      /if\s*\(auth instanceof NextResponse\)\s*return auth;/.test(routeSrc)
    );
    assert(
      'route auth',
      'the glance is READ-ONLY — the route exports GET and no mutating method',
      ok(() => {
        const exported = Object.keys(RT ?? {});
        return (
          exported.includes('GET') &&
          !['POST', 'PATCH', 'PUT', 'DELETE'].some((m) => exported.includes(m))
        );
      })
    );
    assert(
      'route auth',
      'and it assembles nothing of its own — one derivation, called through readEventGlance',
      /readEventGlance\(/.test(routeSrc) && !/derivePersonState|worstItemState/.test(routeSrc)
    );

    assert(
      'no card colour',
      'the GlanceHousehold type declares no state of its own',
      ok(() => {
        const body = interfaceBody(stateSrc, 'GlanceHousehold');
        return body.length > 0 && !/(state|colou?r|tint|worst|status)\s*[?:]/i.test(body);
      })
    );

    assert(
      'Ruling 2 source',
      'the summary is arrived at by counting — no division, no modulo, no percentage',
      ok(() => {
        const body = functionBody(stateSrc, 'summarisePeople');
        return body.length > 0 && !/[/%]/.test(body.replace(/=>/g, ''));
      })
    );
    assert(
      'Ruling 2 source',
      'and neither module names a rate, a percentage, a proportion or a ratio',
      sourcesExist && !/(percent|proportion|\bratio\b|\brate\b)/i.test(stateSrc + readSrc)
    );

    assert(
      'GTC-251 seam',
      'the seam is grep-findable at the point E6 plugs into — ANCHOR(GTC-251)',
      /ANCHOR\(GTC-251\)/.test(raw('src/lib/glance/read.ts'))
    );
    assert(
      'GTC-251 seam',
      'and the reader writes no exhaustion predicate of its own in the meantime',
      readSrc.length > 0 && !/exhausted\s*[:=]\s*(true|false|[a-z].*[<>=])/.test(readSrc)
    );

    assert(
      'client-safe',
      'state.ts holds no database handle — one definition of the colours, not a server and a client one',
      stateSrc.length > 0 && !/PrismaClient|from '@\/lib\/prisma'/.test(stateSrc)
    );
  } finally {
    for (const eventId of createdEventIds) {
      await prisma.assignment.deleteMany({ where: { item: { team: { eventId } } } });
      await prisma.item.deleteMany({ where: { team: { eventId } } });
      await prisma.team.deleteMany({ where: { eventId } });
      await prisma.accessToken.deleteMany({ where: { eventId } });
      await prisma.personEvent.deleteMany({ where: { eventId } });
      await prisma.household.deleteMany({ where: { eventId } });
      await prisma.event.delete({ where: { id: eventId } }).catch(() => {});
    }
    if (createdPersonIds.length) {
      await prisma.person.deleteMany({ where: { id: { in: createdPersonIds } } });
    }
    if (createdUserIds.length) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma.$disconnect();
  }

  console.log(`\n  ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error(`\n\x1b[31mRED — ${failed} assertion(s) failed:\x1b[0m`);
    for (const r of redAssertions) console.error(`  ✗ ${r}`);
    process.exit(1);
  }
  console.log(
    '\x1b[32mGREEN — person-keyed, per-person states, no card colour, no behaviour.\x1b[0m'
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
