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
import {
  BEHAVIOUR_DENYLIST,
  REPLY_FENCE_DENYLIST,
  REWIND_DENYLIST,
  REWIND_EXEMPT_NAMES,
  collectKeys,
  code,
  raw,
} from './glance-fence';

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

    /*
     * ── GTC-189 SLICE 7a — THE FOURTH AND FIFTH REDS ─────────────────────────
     *
     * `NOT_DELIVERED` (ruling S and the fourth red) and `UNREACHABLE` (ruling M), both taking a
     * per-person DELIVERY FACT exactly the way the exhaustion fact above is taken — a decision
     * handed in, not telemetry, with NULL claiming nothing.
     *
     * ⚠ THE FACT'S SOURCE IS THE ROW THE PRESS WROTE, which is what keeps the board and the press
     * from being able to disagree. See `read.ts`.
     */
    /*
     * ⚠ 5 → 6, AND THE PIN DID EXACTLY WHAT IT SAID IT WOULD. Its own label asked for a sixth to
     * be *"a deliberate edit"*, and [[GTC-296]] is one: `EMAIL_OPTED_OUT` joins the vocabulary so
     * that `WHY_LINES` has somewhere to keep its words (correction R7). It is DECLARED WITH NO
     * PRODUCER, the arrangement `EXHAUSTED_SILENCE` has held since GTC-192 — correction R6 maps
     * the withheld code to `null`, so nothing turns a strip this colour today. [[GTC-327]] is the
     * one edit that gives it a producer.
     *
     * ⚠ 6 → 7, [[GTC-251]] Q5 (founder, 2026-09-29) — the deliberate edit this pin asks for.
     * `CHASE_UNREACHABLE` is a channel lost AFTER the ask. It shares `UNREACHABLE`'s words and not
     * its door, which would answer `NOTHING_FAILED` for an ask that did not fail.
     *
     * ⚠ 7 → 8, [[GTC-350]] Q1 (founder, 2026-10-02) — the deliberate edit this pin asks for.
     * `REPLIED`: a guest's text reply ended Gather's chase, and only the host can read what they said.
     */
    assert(
      'item state',
      '⚠ THE RED VOCABULARY IS EIGHT — the fourth and fifth reds joined DECIDE_BY_EXPIRED, REVERSAL ' +
        'and EXHAUSTED_SILENCE, GTC-296 added the sixth, GTC-251 Q5 the seventh, GTC-350 the ' +
        'eighth, and the count stays pinned so a ninth is a deliberate edit',
      ok(
        () =>
          S.RED_REASONS.length === 8 &&
          S.RED_REASONS.includes('REPLIED') &&
          S.RED_REASONS.includes('NOT_DELIVERED') &&
          S.RED_REASONS.includes('UNREACHABLE') &&
          S.RED_REASONS.includes('EMAIL_OPTED_OUT') &&
          S.RED_REASONS.includes('CHASE_UNREACHABLE')
      )
    );
    assert(
      'item state',
      'a NOT_DELIVERED fact turns a PENDING ask RED — the message did not arrive and the board says so',
      ok(() => {
        const r = itemState('PENDING', liveItem, { delivery: { failure: 'NOT_DELIVERED' } });
        return r.state === 'RED' && r.reason === 'NOT_DELIVERED';
      })
    );
    assert(
      'item state',
      'and an UNREACHABLE fact turns it RED with its OWN reason — ruling M: "red already means Gather ' +
        'is out of moves and this is yours, and a person nobody can reach is exactly that"',
      ok(() => {
        const r = itemState('PENDING', liveItem, { delivery: { failure: 'UNREACHABLE' } });
        return r.state === 'RED' && r.reason === 'UNREACHABLE';
      })
    );
    assert(
      'item state',
      '⚠ AND NO DELIVERY FACT LEAVES IT AMBER, and a fact with a NULL failure does too — the same ' +
        'null-is-not-false discipline the exhaustion fact has: before the press there is no row, and ' +
        'this module claims nothing rather than claiming the message arrived',
      ok(
        () =>
          itemState('PENDING', liveItem, { delivery: null }).state === 'AMBER' &&
          itemState('PENDING', liveItem, { delivery: { failure: null } }).state === 'AMBER'
      )
    );
    assert(
      'item state',
      '⚠ AN ANSWERED ROW IS NOT REDDENED BY A DELIVERY FAILURE, in all three shapes — an answer is ' +
        'proof the ask arrived (or that they answered another way), so ACCEPTED stays GREEN, a live ' +
        'MAYBE stays AMBER, and DECLINED keeps REVERSAL rather than being relabelled',
      ok(() => {
        const failed = { delivery: { failure: 'NOT_DELIVERED' } };
        return (
          itemState('ACCEPTED', liveItem, failed).state === 'GREEN' &&
          itemState('MAYBE', liveItem, failed).state === 'AMBER' &&
          itemState('DECLINED', liveItem, failed).reason === 'REVERSAL'
        );
      })
    );
    assert(
      'item state',
      "⚠ AND THE HOST'S OWN ROW STAYS GREEN even with a delivery failure on it — GTC-256 ruling 5 says " +
        "she never receives her own ask, and ruling S sends a carrier bounce to the CHILD's rows, not " +
        'to hers',
      ok(
        () =>
          itemState('PENDING', liveItem, {
            isHost: true,
            delivery: { failure: 'NOT_DELIVERED' },
          }).state === 'GREEN'
      )
    );
    assert(
      'item state',
      '⚠ DELIVERY BEATS EXHAUSTION FOR THE REASON, and the reason is the why-line: "gone quiet" is ' +
        'FALSE of somebody who never got the message. Both are red; the one that explains the silence ' +
        'is the one to say',
      ok(() => {
        const r = itemState('PENDING', liveItem, {
          exhaustion: { exhausted: true },
          delivery: { failure: 'NOT_DELIVERED' },
        });
        return r.state === 'RED' && r.reason === 'NOT_DELIVERED';
      })
    );
    assert(
      'item state',
      "✅ AND RULING 14 GREYS BOTH WITHOUT A CODE CHANGE — `worst !== 'GREEN'` was written so \"any red " +
        'source added later" is displaced, and rulings T and M both want exactly that: grey means she ' +
        'has taken him, and nothing puts a taken thing back on the board',
      ok(() =>
        ['NOT_DELIVERED', 'UNREACHABLE'].every((failure) => {
          const r = S.derivePersonState(
            {
              isHost: false,
              exhaustion: null,
              delivery: { failure },
              nudgeMark: 'DONT_CHASE',
              attendanceAnswer: null,
              items: [
                {
                  response: 'PENDING',
                  item: liveItem,
                  critical: false,
                  itemId: 'i',
                  assignmentId: 'a',
                  name: 'n',
                } as any,
              ],
            } as any,
            event,
            NOW
          );
          return r.state === 'NOT_CHASED' && r.reasons.includes('DONT_CHASE');
        })
      )
    );
    assert(
      'item state',
      '✅ AND THE SUMMARY COUNTS THEM AS "NEEDS YOU" WITH NO CHANGE — summarisePeople keys on the ' +
        "STATE and never on the reason, so ruling 2's sentence absorbs a new red for free",
      ok(() => S.summarisePeople(['RED', 'RED', 'AMBER']).needYou === 2)
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
      'three counts of PEOPLE — "3 need you. I’m looking after 9. 28 settled."',
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

    // ── PHASE 4 — the keys the action layer needs, and no others ─────────
    //
    // Every one is a JOIN KEY or a HOSTING DECISION, never a guest behaviour: `nudgeMark`
    // is a mark Kate set (§10.3), and `role`/`teamId`/`kind` are the inputs the two SHARED
    // rules already take — `mayHoldRow` (src/lib/assignment/same-team.ts) and `isChaseable`
    // (src/lib/eligibility/nudge-mark.ts). They are carried so the surface can CALL those
    // rules rather than write its own; the denylist below is unchanged and still holds.
    const allPeople = [...payload.households.flatMap((h: any) => h.members), ...payload.unhoused];
    assert(
      'phase 4 payload',
      'the payload names the host — TAKE OVER has a target that is not guessed from the cards',
      ok(() => payload.hostPersonId === dbEvent.hostId)
    );
    assert(
      'phase 4 payload',
      'every person carries the mark, the role and the team — isChaseable and mayHoldRow’s inputs',
      ok(
        () =>
          allPeople.length > 0 &&
          allPeople.every(
            (p: any) =>
              'nudgeMark' in p && 'role' in p && 'teamId' in p && typeof p.role === 'string'
          )
      )
    );
    assert(
      'phase 4 payload',
      'and the mark is the DECISION Kate set — the don’t-chase person reports it, not a colour',
      ok(() => allPeople.some((p: any) => p.nudgeMark === 'DONT_CHASE'))
    );
    assert(
      'phase 4 payload',
      'every item carries its kind and its team — the two halves of the same-team rule’s subject',
      ok(() => {
        const items = allPeople.flatMap((p: any) => p.items);
        return (
          items.length > 0 &&
          items.every((i: any) => typeof i.kind === 'string' && typeof i.teamId === 'string')
        );
      })
    );

    /*
      PHASE 7 / RULING 32 — the three quantity fields reach the payload, and they are NOT
      colour inputs.

      ⚠ THE FIRST ASSERTION IS WHAT MAKES THE FENCE BELOW MEAN ANYTHING FOR THEM. `collectKeys`
      scans what is there; three fields that never arrived are three fields the denylist
      trivially does not find. So their presence is asserted as a POSITIVE before the scan, on
      a board that actually has quantities, exactly as §5 layer 1 gates its runtime pass on a
      non-empty replay.
    */
    assert(
      'Ruling 32 payload',
      'quantity, unit and the custom unit reach every row — the three fields the reading panel formats',
      ok(() => {
        const items = allPeople.flatMap((p: any) => p.items);
        return (
          items.length > 0 &&
          items.every(
            (i: any) => 'quantityAmount' in i && 'quantityUnit' in i && 'quantityUnitCustom' in i
          )
        );
      })
    );
    assert(
      'Ruling 32 payload',
      'and they are NOT colour inputs — `deriveItemState` does not take them, so no quantity can move a tint',
      ok(() => {
        const src = code('src/lib/glance/state.ts');
        const body = /export function deriveItemState[\s\S]*?\n\}/.exec(src)?.[0] ?? '';
        return body.length > 0 && !/quantity/i.test(body);
      })
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
    const assistantSrc = code('src/components/glance/assistant.ts');
    // Phase 4 puts an action layer and a tapped surface in the tree. Ruling 1's fence
    // follows them: a behaviour field is no less present for arriving behind a tap.
    const actionsSrc = code('src/lib/glance/actions.ts');
    const surfaceSrc = code('src/components/glance/PersonSurface.tsx');

    // ⚠ THE EXISTENCE GATE MOVED IN 6e, AND THE REASON IS THAT IT WAS A SECOND LIST.
    // It enumerated ten sources by hand while `glanceSources` below enumerated thirteen, and a
    // source added to one and not the other would be scanned without being gated — the fence
    // weakened in one copy with nothing failing, which is the exact hazard `glance-fence.ts`
    // was extracted to end. It is now asserted ONCE, on `glanceSources` itself, immediately
    // after that list is built. One list, gated and scanned.
    // Phase 6 slice 6a puts the pure replay and its one door in the tree. Ruling 1's fence
    // follows them UNCHANGED: neither reads a ledger, so neither is exempt from anything.
    const replaySrc = code('src/lib/glance/replay.ts');
    const entrySrc = code('src/lib/glance/replay-entry.ts');
    // Phase 6 slice 6b puts the stamp route in the tree. Ruling 1's fence follows it
    // UNCHANGED: it writes the host's own mark and reads no guest behaviour, so it is
    // exempt from nothing.
    const seenSrc = code('src/app/api/events/[id]/glance/seen/route.ts');
    // Phase 6 slice 6c puts the replay's ISLAND in the tree, and it is the one glance source
    // that ships to a browser as a bundle. Ruling 1's fence follows it UNCHANGED — an
    // animation is no licence to carry behaviour, and "absent from the payload, not merely
    // unrendered" applies hardest to the module whose whole job is rendering.
    const islandSrc = code('src/components/glance/GlanceReplay.tsx');
    // Phase 6 slice 6e puts THREE more sources in the tree, and every one of them ships to a
    // browser or is read by something that does. Ruling 1's fence follows them UNCHANGED — they
    // are exempt from nothing:
    //   `live.ts`        the pure live diff — the module that decides what a poll SHOWS her;
    //   `paint.ts`       the shared DOM painters, read by both islands;
    //   `GlanceLive.tsx` the poller itself, which is the only glance source that repeatedly
    //                    reads a payload off the wire. "Absent from the payload, not merely
    //                    unrendered" applies hardest to the module that fetches it every 20s.
    const liveSrc = code('src/lib/glance/live.ts');
    const paintSrc = code('src/components/glance/paint.ts');
    const liveIslandSrc = code('src/components/glance/GlanceLive.tsx');
    // ⚠ AND THE DEV PREVIEW JOINS TOO, WHICH IS A GAP 6e CLOSED RATHER THAN CREATED.
    // `GlanceReplayPreview.tsx` has been in the tree since the preview landed and was never in
    // this list, so Ruling 1's fence has never been run over it. It is a control, not a data
    // surface, so nothing was leaking — but "the fence follows every glance source" was not
    // true, and a fence with a hole in it is the thing this ticket keeps catching.
    const previewSrc = code('src/components/glance/GlanceReplayPreview.tsx');
    // PHASE 7 / RULING 32 puts the READING PANEL in the tree, and it ships to a browser as a
    // bundle. Ruling 1's fence follows it UNCHANGED — it is exempt from nothing. It is the one
    // glance source whose whole content is a second payload, so "absent from the payload, not
    // merely unrendered" is the sentence it exists to satisfy: it takes `ReadingPanel`, which
    // has no date-shaped field at any depth, and never a `GlancePerson`, which has two.
    const readingSrc = code('src/components/glance/GlancePersonReading.tsx');
    // ⚠ AND ITS PURE MODEL, WHICH IS THE ONE GLANCE SOURCE THAT NOW READS A CADENCE INSTANT ON
    // PURPOSE. RULING 34 carves the nudge day out of the no-timestamp rule — "a nudge day is
    // the system's own promise about what IT will do next, which is a different fact about a
    // different actor". Ruling 1's fence follows this file UNCHANGED and it is exempt from
    // NOTHING: `nextNudgeAt` was never on the denylist, because `PersonEvent.sentAt` — the
    // anchor it counts from — records when GATHER SENT and not what the guest did.
    const readingModelSrc = code('src/components/glance/reading.ts');
    const glanceSources = [
      stateSrc,
      readSrc,
      routeSrc,
      pageSrc,
      boardSrc,
      stripSrc,
      assistantSrc,
      actionsSrc,
      surfaceSrc,
      replaySrc,
      entrySrc,
      seenSrc,
      islandSrc,
      liveSrc,
      paintSrc,
      liveIslandSrc,
      previewSrc,
      readingSrc,
      readingModelSrc,
    ];
    const sourcesExist = glanceSources.every((src) => src.length > 0);
    assert(
      'Ruling 1 source',
      'EVERY GLANCE SOURCE EXISTS — the modules, the route, the page, the view, the actions, both islands, the painters, the preview, the reading panel and its model; the gate and the scan are ONE list, so neither can be widened without the other',
      sourcesExist && glanceSources.length === 19
    );
    for (const banned of BEHAVIOUR_DENYLIST) {
      const re = new RegExp(`\\b${banned}\\b`);
      assert(
        'Ruling 1 source',
        `no glance source names "${banned}" — the fence is on the select, not the render`,
        sourcesExist && !glanceSources.some((src) => re.test(src))
      );
    }
    // [[GTC-350]] Q2 — the fence relaxed for text replies only: a reply crosses as its words and a
    // written line, and nothing else of it may be named by any glance source (tests/glance-fence.ts).
    for (const banned of REPLY_FENCE_DENYLIST) {
      assert(
        'Ruling 1 source / GTC-350',
        `no glance source names "${banned}" — a reply crosses as words and a written line, never its row, ids, instants or number`,
        sourcesExist && !glanceSources.some((src) => new RegExp(`\\b${banned}\\b`).test(src))
      );
    }
    assert(
      'Ruling 1 source',
      'nothing in the glance uses `include:` — no whole row can spread in behind the select',
      sourcesExist && !glanceSources.some((src) => /\binclude\s*:/.test(src))
    );

    // ── RULING 21 (2026-09-09) — THE FENCE AMENDMENT ─────────────────────
    //
    // "The rewind reads AuditEntry and never InviteEvent, so the table carrying LINK_OPENED is
    // not touched at all rather than touched and guarded. Exempt exactly the two names
    // auditEntry/AuditEntry, for exactly one file, and assert BOTH: that the exemption is two
    // names wide, and that it applies to one file. Two names loose across the codebase is a
    // different thing from two names loose in one module."
    //
    // ONE LIST, TWO SCANS. `REWIND_DENYLIST` is a DERIVATION of `BEHAVIOUR_DENYLIST`
    // (tests/glance-fence.ts), not a second list that could be edited independently — which is
    // why the width assertion below can be a set difference rather than a hand-counted literal.
    const rewindSrc = code('src/lib/glance/rewind.ts');
    const EXEMPT_FILES = ['src/lib/glance/rewind.ts'];

    assert(
      'Ruling 21',
      'the exemption is TWO NAMES WIDE — the set difference between the two scans is exactly auditEntry/AuditEntry',
      BEHAVIOUR_DENYLIST.filter((n) => !REWIND_DENYLIST.includes(n)).join(',') ===
        REWIND_EXEMPT_NAMES.join(',') && REWIND_EXEMPT_NAMES.length === 2
    );
    assert(
      'Ruling 21',
      'and it applies to EXACTLY ONE FILE — two names loose in one module, never loose across the codebase',
      EXEMPT_FILES.length === 1 && EXEMPT_FILES[0] === 'src/lib/glance/rewind.ts'
    );
    assert(
      'Ruling 21',
      'the exempted file exists — the exemption is not a licence granted to nothing',
      rewindSrc.length > 0
    );
    for (const banned of REWIND_DENYLIST) {
      assert(
        'Ruling 21',
        `the rewind still answers to "${banned}" — everything but the two exempt names applies to it too`,
        rewindSrc.length > 0 && !new RegExp(`\\b${banned}\\b`).test(rewindSrc)
      );
    }
    for (const exempt of REWIND_EXEMPT_NAMES) {
      assert(
        'Ruling 21',
        `"${exempt}" is loose in the rewind and NOWHERE ELSE in the glance — the exemption does not travel`,
        sourcesExist && !glanceSources.some((src) => new RegExp(`\\b${exempt}\\b`).test(src))
      );
    }
    assert(
      'Ruling 21',
      'and phase 5’s glanceSeenAt is still not caught by `seenAt` — case-sensitive \\bseenAt\\b, measured not assumed',
      !/\bseenAt\b/.test('glanceSeenAt') && BEHAVIOUR_DENYLIST.includes('seenAt')
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

    // ⚠ MOVED BY [[GTC-251]] slice 251a: the anchor marked where E6 would plug in, and the
    // template says it is deleted when the owning ticket lands. What it guarded is now that the
    // seam is fed by the SHARED predicate — `exhaustionFor` — and not left null.
    assert(
      'GTC-251 seam',
      'the seam is fed at the point E6 plugged into — `exhaustionFor`, the anchor gone as landed',
      /exhaustion:\s*exhaustionFor\(/.test(readSrc) &&
        !/ANCHOR\(GTC-251\)/.test(raw('src/lib/glance/read.ts'))
    );
    assert(
      'GTC-251 seam',
      'and the reader writes no exhaustion predicate of its own in the meantime',
      readSrc.length > 0 && !/exhausted\s*[:=]\s*(true|false|[a-z].*[<>=])/.test(readSrc)
    );

    // ══ RULING 23's SECOND HALF — "FALL LOOSE", ON ITS OWN BOARD ═════════
    //
    // "Fall loose: derived too — widen the empty-strip predicate to include rows held by a
    // reversed person. No unassignment, no write."
    //
    // ⚠ THIS OVERRIDES PHASE 3'S DECISION, DELIBERATELY, AND PHASE 3'S REASON IS QUOTED SO THE
    // OVERRIDE IS VISIBLE AT THE SITE. Phase 3 declined to build this and said why: *"the
    // strip's test is 'no Assignment row' and theirs still has one… building half of it now
    // would put a second definition of 'loose' in the tree."* THE REASON IS ANSWERED RATHER
    // THAN IGNORED: there is still exactly ONE predicate for loose, and it now reads *no
    // Assignment row, OR an Assignment row held by a person who is OUT*. One site, one meaning,
    // two limbs. What is NOT answered is the wider worry phase 3 raised in the neighbouring
    // note — that "critical without an ACCEPTED assignment" is *"a wider set and a different
    // fact"*. That is still true, and this widening is deliberately NOT that set: a person who
    // merely declined is not loose, which is what the five-way differential below pins.
    //
    // ⚠ A BOARD OF ITS OWN, DELIBERATELY. Hanging this off the mixed fixture would have moved
    // the ownerless counts every other assertion in this file reads, and a fixture edited to
    // make a new assertion pass is how a suite stops measuring what it says it measures.
    const looseHost = await prisma.person.create({
      data: { name: 'GTC192-6d Host', email: `gtc192+${stamp}+6dhost@example.com` },
    });
    createdPersonIds.push(looseHost.id);
    const looseEvent = await prisma.event.create({
      data: {
        name: 'GTC-192 6d — fall loose',
        startDate: new Date(NOW.getTime() + 100 * HOUR),
        endDate: new Date(NOW.getTime() + 130 * HOUR),
        hostId: looseHost.id,
        status: 'CONFIRMING',
        sentAt: new Date(NOW.getTime() - 10 * DAY),
      },
    });
    createdEventIds.push(looseEvent.id);
    const looseTeam = await prisma.team.create({
      data: { eventId: looseEvent.id, name: '6d Mains' },
    });

    /** One guest in one state, holding one critical and one ordinary row. */
    async function stater(
      name: string,
      response: 'PENDING' | 'ACCEPTED' | 'DECLINED',
      answer: 'YES' | 'NO' | null,
      mark: 'DONT_CHASE' | null,
      /** The ordinary row's own response, so a reversed person can hold a row he never answered. */
      ordResponse: 'PENDING' | 'ACCEPTED' | 'DECLINED' = response
    ) {
      const person = await prisma.person.create({
        data: { name, email: `gtc192+${stamp}+${name.replace(/\W/g, '')}@example.com` },
      });
      createdPersonIds.push(person.id);
      await prisma.personEvent.create({
        data: {
          personId: person.id,
          eventId: looseEvent.id,
          role: 'PARTICIPANT',
          sentAt: new Date(NOW.getTime() - 10 * DAY),
          attendanceAnswer: answer,
          nudgeMark: mark,
        },
      });
      const crit = await prisma.item.create({
        data: { teamId: looseTeam.id, name: `${name} critical`, kind: 'ITEM', critical: true },
      });
      const ord = await prisma.item.create({
        data: { teamId: looseTeam.id, name: `${name} ordinary`, kind: 'ITEM', critical: false },
      });
      await prisma.assignment.create({
        data: { itemId: crit.id, personId: person.id, response },
      });
      await prisma.assignment.create({
        data: { itemId: ord.id, personId: person.id, response: ordResponse },
      });
      return { person, crit, ord };
    }

    // OUT — attendance answered NO with nothing accepted. Ruling 6's reversed person.
    // ⚠ HIS TWO ROWS CARRY DIFFERENT RESPONSES ON PURPOSE — the critical is a withdrawn claim,
    // the ordinary was never answered at all. Ruling 6 says "items the person held fall loose",
    // not "declined items", and a fixture where both rows were DECLINED could not tell the two
    // readings apart.
    const gone = await stater('Ray6d', 'DECLINED', 'NO', null, 'PENDING');
    // RED — a withdrawn claim (§8.6) with attendance never answered: UNKNOWN, so NOT out.
    const withdrew = await stater('Sarah6d', 'DECLINED', null, null);
    // AMBER — never tapped. GREEN — accepted. NOT_CHASED — the mark over a withdrawn claim.
    const waiting = await stater('Minh6d', 'PENDING', null, null);
    const settled = await stater('Rob6d', 'ACCEPTED', null, null);
    const unbothered = await stater('Aoife6d', 'DECLINED', null, 'DONT_CHASE');
    // And the original half of the predicate, unchanged: an item with NO Assignment row.
    const ownerless = await prisma.item.create({
      data: { teamId: looseTeam.id, name: 'the glazed ham 6d', kind: 'ITEM', critical: true },
    });

    const loosePayload = R ? await R.readEventGlance(prisma, looseEvent.id, NOW) : null;
    const looseIds: string[] = (loosePayload?.unassignedCritical ?? []).map((i: any) => i.itemId);
    const stateOf = (personId: string) =>
      [...(loosePayload?.households ?? []), { members: loosePayload?.unhoused ?? [] }]
        .flatMap((h: any) => h.members)
        .find((p: any) => p.personId === personId)?.state ?? null;

    // THE POSITIVE CONTROL FIRST. Every claim below is about a board whose five people must
    // actually be in the five states the fixture intends; if the fixture drifted, the
    // differential would be measuring something else.
    assert(
      'Ruling 23 control',
      'THE FIVE STATES ARE ON THE BOARD — OUT, RED, AMBER, GREEN and NOT_CHASED, one guest each, so the differential below is between real states',
      loosePayload !== null &&
        ok(
          () =>
            stateOf(gone.person.id) === 'OUT' &&
            stateOf(withdrew.person.id) === 'RED' &&
            stateOf(waiting.person.id) === 'AMBER' &&
            stateOf(settled.person.id) === 'GREEN' &&
            stateOf(unbothered.person.id) === 'NOT_CHASED'
        )
    );
    assert(
      'Ruling 23',
      'A REVERSED PERSON’S CRITICAL FALLS LOOSE — it is in `unassignedCritical` even though its Assignment row is untouched',
      loosePayload !== null && looseIds.includes(gone.crit.id)
    );
    assert(
      'Ruling 23',
      'and the ownerless critical is still there too — the original limb of the predicate is widened, not replaced',
      loosePayload !== null && looseIds.includes(ownerless.id)
    );
    // ⭐ THE WRONG-SET DIFFERENTIAL. This is the assertion a predicate widened one notch too
    // far fails, and it is why the fixture holds five people rather than one.
    assert(
      'Ruling 23',
      '⭐ AND NOBODY ELSE’S DOES — a withdrawn claim, a silence, a settled row and a don’t-chase row are all still HELD; only OUT is loose',
      loosePayload !== null &&
        looseIds.includes(gone.crit.id) &&
        !looseIds.includes(withdrew.crit.id) &&
        !looseIds.includes(waiting.crit.id) &&
        !looseIds.includes(settled.crit.id) &&
        !looseIds.includes(unbothered.crit.id)
    );
    assert(
      'Ruling 23',
      'THE ORDINARY ROWS COUNT TOO — one predicate for loose, not one for the named criticals and another for the door’s N',
      loosePayload !== null && loosePayload.unassignedOrdinaryCount === 1 && looseIds.length === 2
    );
    assert(
      'Ruling 23',
      'ALL of a reversed person’s rows are loose, not only the declined one — the row he NEVER ANSWERED is loose too, because he is not coming and nothing he holds is covered',
      loosePayload !== null &&
        ok(() => {
          const him = [...loosePayload.households, { members: loosePayload.unhoused }]
            .flatMap((h: any) => h.members)
            .find((p: any) => p.personId === gone.person.id);
          // The ordinary row is PENDING on him and is still counted in the door's N.
          return (
            !!him &&
            him.items.some((i: any) => i.itemId === gone.ord.id && i.state === 'AMBER') &&
            loosePayload.unassignedOrdinaryCount === 1
          );
        })
    );
    // §10.8 stands: the row is in BOTH places, because nothing was unassigned.
    assert(
      'Ruling 23',
      'AND IT IS STILL ON HIM — the same row is under the person AND in the strip: "no unassignment, no write" costs exactly this, and it is asserted rather than discovered',
      loosePayload !== null &&
        looseIds.includes(gone.crit.id) &&
        ok(() => {
          const him = [...loosePayload.households, { members: loosePayload.unhoused }]
            .flatMap((h: any) => h.members)
            .find((p: any) => p.personId === gone.person.id);
          return !!him && him.items.some((i: any) => i.itemId === gone.crit.id);
        })
    );
    // DERIVED, NEVER A WRITE — read back after the read, not argued from the source.
    const afterRead = await prisma.assignment.findMany({
      where: { item: { team: { eventId: looseEvent.id } } },
      select: { personId: true, response: true },
      orderBy: [{ personId: 'asc' }, { response: 'asc' }],
    });
    assert(
      'Ruling 23',
      'THE READ WROTE NOTHING — all ten Assignment rows still carry their own person and their own response after the board was assembled',
      loosePayload !== null &&
        looseIds.includes(gone.crit.id) &&
        afterRead.length === 10 &&
        afterRead.filter((a) => a.response === 'DECLINED').length === 5 &&
        afterRead.filter((a) => a.response === 'PENDING').length === 3 &&
        afterRead.filter((a) => a.response === 'ACCEPTED').length === 2
    );

    /*
     * ══ GTC-189 SLICE 7a — THE DELIVERY FACT, OVER A THIRD FIXTURE ══════════════════
     *
     * A separate event rather than more states on the shared one, which is this suite's own pattern
     * (the loose fixture above) and keeps every existing assertion measuring the board it was written
     * for.
     *
     * ⚠ THE FACT COMES OFF THE ROW THE PRESS WROTE. Founder ruling: the press already recorded both
     * facts per person, so the board reads them back rather than re-deriving them, and the two cannot
     * disagree by construction. Five people, five different row shapes, one board.
     */
    const dEvent = await prisma.event.create({
      data: {
        name: 'GTC-189 slice 7a delivery fixture',
        startDate: new Date(NOW.getTime() + 100 * HOUR),
        endDate: new Date(NOW.getTime() + 130 * HOUR),
        hostId: hostPerson.id,
        status: 'CONFIRMING',
        sentAt,
      },
    });
    createdEventIds.push(dEvent.id);
    const dTeam = await prisma.team.create({ data: { eventId: dEvent.id, name: 'Mains' } });
    const dHh = await prisma.household.create({ data: { eventId: dEvent.id } });

    async function dPerson(
      name: string,
      role: string,
      opts: { items?: boolean; email?: string | null; phone?: string | null } = {}
    ) {
      const person = await prisma.person.create({
        data: {
          name,
          email:
            opts.email !== undefined
              ? opts.email
              : `gtc189s7a+${stamp}+${name.replace(/\W/g, '')}@example.com`,
          phoneNumber: opts.phone ?? null,
        },
      });
      createdPersonIds.push(person.id);
      const pe = await prisma.personEvent.create({
        data: {
          personId: person.id,
          eventId: dEvent.id,
          role: 'PARTICIPANT',
          householdId: dHh.id,
          householdRole: role,
          sentAt,
        },
      });
      if (opts.items !== false) {
        const item = await prisma.item.create({
          data: { teamId: dTeam.id, name: `${name}'s dish`, kind: 'ITEM' },
        });
        await prisma.assignment.create({
          data: { itemId: item.id, personId: person.id, response: 'PENDING' },
        });
      }
      return { person, pe };
    }

    // Sarah carries the household. Her message BOUNCED, so ruling S sends her failure to Ollie.
    const sarah = await dPerson('Sarah Carrier', 'PRIMARY_CONTACT');
    const ollie = await dPerson('Ollie Child', 'CHILD');
    // Nina has no way to be reached at all — the chooser said so at the press.
    const nina = await dPerson('Nina Nochannel', 'GUEST');
    // Tom's text was stopped by Gather's own setup (no SMS provider, or the live switch off). Not a
    // fact about Tom. [[GTC-340]]: a text guest — no email, a +64 mobile — so the chooser texts him
    // and his row is the TEXT row the drain writes, not an email row no drain could write.
    const tom = await dPerson('Tom Smsdisabled', 'GUEST', { email: null, phone: '+64211340901' });
    // Ida's ask failed once and the second attempt did not. The latest row is the fact.
    const ida = await dPerson('Ida Resent', 'GUEST');
    // Pia holds NOTHING and her message bounced — ruling 16's itemless amber, with no row to carry
    // a colour.
    const pia = await dPerson('Pia Empty', 'GUEST', { items: false });
    await prisma.household.update({
      where: { id: dHh.id },
      data: { contactPersonEventId: sarah.pe.id },
    });

    async function askRow(personEventId: string, data: Record<string, unknown>) {
      return prisma.outboundMessage.create({
        data: {
          eventId: dEvent.id,
          personEventId,
          kind: 'ASK',
          channel: 'EMAIL',
          ...data,
        },
        select: { id: true },
      });
    }
    await askRow(sarah.pe.id, {
      acceptedAt: sentAt,
      attemptedAt: sentAt,
      attemptCount: 1,
      provider: 'resend',
      providerMessageId: `s7a-sarah-${stamp}`,
      deliveryState: 'BOUNCED',
      providerLastEvent: 'bounced',
      deliveryCheckedAt: sentAt,
      deliveryPollDoneAt: sentAt,
    });
    await askRow(nina.pe.id, { withheldAt: sentAt, withheldWhy: 'NO_CHANNEL' });
    await askRow(tom.pe.id, { channel: 'TEXT', withheldAt: sentAt, withheldWhy: 'SMS_DISABLED' });
    await askRow(ida.pe.id, {
      createdAt: new Date(sentAt.getTime() - 2 * HOUR),
      attemptedAt: sentAt,
      attemptCount: 1,
      provider: 'resend',
      rejectedAt: sentAt,
      providerError: 'The from address is not verified',
      providerErrorCode: 'invalid_from_address',
    });
    await askRow(ida.pe.id, {
      createdAt: sentAt,
      acceptedAt: sentAt,
      attemptedAt: sentAt,
      attemptCount: 1,
      provider: 'resend',
      providerMessageId: `s7a-ida-${stamp}`,
      deliveryState: 'PROVIDER_REPORTS_DELIVERED',
      providerLastEvent: 'delivered',
      deliveryCheckedAt: sentAt,
    });
    await askRow(pia.pe.id, {
      acceptedAt: sentAt,
      attemptedAt: sentAt,
      attemptCount: 1,
      provider: 'resend',
      providerMessageId: `s7a-pia-${stamp}`,
      deliveryState: 'BOUNCED',
      providerLastEvent: 'bounced',
      deliveryCheckedAt: sentAt,
      deliveryPollDoneAt: sentAt,
    });

    const dPayload = R ? await R.readEventGlance(prisma, dEvent.id, NOW) : null;
    const dPeople: any[] = [
      ...(dPayload?.households ?? []).flatMap((h: any) => h.members),
      ...(dPayload?.unhoused ?? []),
    ];
    const dRead = (personId: string) => dPeople.find((p: any) => p.personId === personId) ?? null;

    assert(
      'slice 7a control',
      '⚠ CONTROL: the delivery board assembled and holds its SIX guests — and the host is NOT among ' +
        'them, because she has no membership on this event, which is what the count caught when the ' +
        'label said seven. Without this every claim below could pass against an empty payload',
      dPayload !== null && dPeople.length === 6
    );
    assert(
      'slice 7a',
      "⚠ A BOUNCED ASK TURNS THE RECIPIENT'S ROWS RED, read off the row the press wrote rather than " +
        're-derived — so the board and the press cannot disagree about who was reached',
      ok(() => {
        const r = dRead(sarah.person.id);
        return r.state === 'RED' && r.reasons.includes('NOT_DELIVERED');
      })
    );
    assert(
      'slice 7a',
      "✅ RULING S: OLLIE'S STRIP GOES RED WHEN THE MESSAGE CARRYING HIS ASK BOUNCED. The fact is the " +
        "CARRIER's and the rows it reddens are the CHILD's — and it overturns Moment 4 §8.7, whose " +
        "own words are that a child's row CANNOT go red. The banner is on the spec",
      ok(() => {
        const r = dRead(ollie.person.id);
        return r.state === 'RED' && r.reasons.includes('NOT_DELIVERED');
      })
    );
    assert(
      'slice 7a',
      '⚠ AND NINA IS UNREACHABLE, NOT NOT_DELIVERED — two different facts: one message was sent and ' +
        'did not arrive, the other was never sendable. The withheld code the chooser wrote at the ' +
        'press is what tells them apart',
      ok(() => {
        const r = dRead(nina.person.id);
        return r.state === 'RED' && r.reasons.includes('UNREACHABLE');
      })
    );
    assert(
      'slice 7a',
      '⚠ [[GTC-340]] — TOM IS RED, "never got it" (NOT_DELIVERED), AND NEVER UNREACHABLE: his text ' +
        "was stopped by GATHER's own setup before it left (no SMS provider, or the live switch off). " +
        'Founder ruling 2026-10-01: texts join emails — he never got it, which is true, and the door ' +
        'lets the host send it again. Painting him "nowhere to send" would still be a falsehood about ' +
        'a guest holding a live number',
      ok(() => {
        const r = dRead(tom.person.id);
        return (
          r.state === 'RED' &&
          JSON.stringify(r.reasons) === JSON.stringify(['NOT_DELIVERED']) &&
          !r.reasons.includes('UNREACHABLE')
        );
      })
    );
    assert(
      'slice 7a',
      '⚠ IDA IS NOT RED EITHER — THE LATEST ROW IS THE FACT. Her first ask was rejected and her ' +
        'second was delivered. Reading "any row ever failed" would make slice 7b\'s door unable to ' +
        'clear the red it opens: the host resends, it works, and the board still says it never arrived',
      ok(() => {
        const r = dRead(ida.person.id);
        return r.state === 'AMBER' && !r.reasons.includes('NOT_DELIVERED');
      })
    );
    assert(
      'slice 7a',
      '⚠ AND PIA IS RED WITH NO ROWS AT ALL — an itemless person has nothing to carry a colour, so ' +
        'the fact is applied at the PERSON level too. Ruling 16 makes an itemless undecided person ' +
        'amber, and amber for somebody who never got the message is exactly the falsehood ruling J ' +
        'called wrong',
      ok(() => {
        const r = dRead(pia.person.id);
        return r.state === 'RED' && r.reasons.includes('NOT_DELIVERED') && r.items.length === 0;
      })
    );
    assert(
      'slice 7a',
      '⚠ AND THE READ DID NOT GROW A QUERY PER CHILD: it reads the carrier off the chooser walk it ' +
        'already runs rather than resolveCarriedSubjects, whose wrapper runs five queries per ' +
        'carrier and hauls the whole event each time',
      ok(() => {
        const factSrc = code('src/lib/glance/delivery-fact.ts');
        return (
          readSrc.length > 0 &&
          factSrc.length > 0 &&
          // [[GTC-336]] Q2: the read asks the translator, and the translator reads the route the
          // preview's walk already recorded (was: the household rule, which is not the chooser's).
          // The query count itself is measured in `tests/carried-child-door-test.ts` layer E.
          /carrierOfAsk\(\s*preview\?\.askRoutes\[/.test(readSrc) &&
          /export function carrierOfAsk/.test(factSrc) &&
          // and neither reaches for the five-query wrapper
          !/resolveCarriedSubjects/.test(readSrc) &&
          !/resolveCarriedSubjects/.test(factSrc)
        );
      })
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
