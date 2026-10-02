/**
 * GTC-251 slice 251a — the board tells the truth after the chase has no next move.
 *
 * GTC-305's principle: amber means Gather is chasing someone, and nobody else is amber. Slice 8's
 * reminders end, and until this slice the board went on reading AMBER. The founder's rulings of
 * 2026-09-29 and 2026-09-30 (Q2, Q4a, Q5; the plan's 4.2, 4.3, 4.6 and 4.7) say what it reads
 * instead.
 *
 * THE LAYERS:
 *  A. the predicate, pure — `isChaseExhausted` over a cadence of 0, 1 or 2 legs plus a hand-back,
 *     the 72-hour wait at its boundary, "as at" an instant
 *  B. the derivation, pure — "gone quiet" on a row and on an itemless person, and what beats it;
 *     Q5's red; the live maybe with nothing coming; pace OFF's grey
 *  C. the words and the doors — W1, W6, the why-lines, the panels, Remind and the resend door
 *  D. the read path — `readEventGlance` over real rows at STANDARD, GENTLE, RELAXED and OFF
 *  E. the replay — no step when nothing changed; going quiet while she was away plays once
 *  S. structure — the anchors gone, the stamps kept out of the glance, Zones 7 and 9 unedited
 *
 * NOTHING IS SENT. `installProviderTrap` walls the process, no cron is run, nothing is queued
 * or drained, and every row written here is this file's own fixture, removed by id in `finally`.
 *
 * Run: npx tsx tests/gone-quiet-test.ts
 */

import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import { installProviderTrap, trapCount } from './helpers/provider-trap';

installProviderTrap();

const prisma = new PrismaClient();
const ROOT = join(__dirname, '..');
const TAG = 'GTC251';
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

let passed = 0;
let failed = 0;
const redAssertions: string[] = [];

function assert(layer: string, label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`\x1b[32m✓\x1b[0m [${layer}] ${label}`);
    passed++;
  } else {
    console.error(`\x1b[31m✗\x1b[0m [${layer}] ${label}${detail ? `\n    ${detail}` : ''}`);
    failed++;
    redAssertions.push(`[${layer}] ${label}`);
  }
}

/** A missing export reads as a failed assertion, not a crashed run — RED and GREEN in one file. */
function ok(fn: () => boolean): boolean {
  try {
    return fn() === true;
  } catch {
    return false;
  }
}

function read(rel: string): string {
  try {
    return readFileSync(join(ROOT, rel), 'utf8');
  } catch {
    return '';
  }
}

/** Source with comments stripped, so an assertion about CODE cannot be satisfied by prose. */
function code(rel: string): string {
  return read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

// The ruled words, typed here rather than imported, so a changed constant fails rather than
// agreeing with itself.
const W1_GONE_QUIET = 'gone quiet';
const W6_PACE_OFF = "Reminders are off for this event, so I won't chase them.";
const W_HANDED = "You're handling them yourself, so I won't chase them.";
const W_SMS = "They've opted out of texts — so I won't chase them at all.";

async function main() {
  let S: any = null;
  let R: any = null;
  let SP: any = null;
  let RD: any = null;
  let AC: any = null;
  let RE: any = null;
  let CF: any = null;
  let CE: any = null;
  let CER: any = null;
  try {
    S = await import('../src/lib/glance/state');
    R = await import('../src/lib/glance/read');
    SP = await import('../src/components/glance/strip');
    RD = await import('../src/components/glance/reading');
    AC = await import('../src/lib/glance/actions');
    RE = await import('../src/lib/glance/replay-entry');
    CF = await import('../src/lib/glance/chase-fact');
  } catch (err) {
    console.error(`\x1b[31m!\x1b[0m module load failed: ${(err as Error).message.split('\n')[0]}`);
  }
  try {
    CE = await import('../src/lib/chase-exhaustion');
  } catch (err) {
    console.error(
      `\x1b[31m!\x1b[0m chase-exhaustion did not load: ${(err as Error).message.split('\n')[0]}`
    );
  }
  try {
    CER = await import('../src/lib/chase-exhaustion-read');
  } catch (err) {
    console.error(
      `\x1b[31m!\x1b[0m chase-exhaustion-read did not load: ${(err as Error).message.split('\n')[0]}`
    );
  }

  const created = { events: [] as string[], persons: [] as string[], addresses: [] as string[] };
  const before = {
    outbound: await prisma.outboundMessage.count(),
    inviteEvents: await prisma.inviteEvent.count(),
  };

  try {
    // ══ LAYER A — the predicate, pure ════════════════════════════════════════════════════
    const T0 = new Date('2026-09-01T09:00:00.000Z').getTime();
    const at = (h: number) => new Date(T0 + h * HOUR);
    const leg = (kind: string, createdH: number, spentH: number | null) => ({
      kind,
      createdAt: at(createdH),
      spentAt: spentH === null ? null : at(spentH),
    });
    const spend = (cadenceLength: number, legs: any[], handBack: any = null) => ({
      cadenceLength,
      legs,
      handBack,
    });
    const ex = (s: any, h: number) => ok(() => CE.isChaseExhausted(s, at(h)) === true);
    const notEx = (s: any, h: number) => ok(() => CE.isChaseExhausted(s, at(h)) === false);

    assert(
      'A',
      'THE WAIT IS 72 HOURS, one constant (Q2)',
      ok(() => CE.GONE_QUIET_AFTER_HOURS === 72)
    );

    const two = spend(2, [leg('CHASE_FIRST', 96, 96), leg('CHASE_SECOND', 168, 168)]);
    assert(
      'A',
      'STANDARD, both legs spent: 72h minus 1ms after the last is NOT exhausted',
      ok(() => CE.isChaseExhausted(two, new Date(T0 + 240 * HOUR - 1)) === false)
    );
    assert(
      'A',
      'STANDARD: exactly 72h after the last is NOT exhausted (strictly after, as isDecideByExpired)',
      notEx(two, 240)
    );
    assert(
      'A',
      'STANDARD: 72h plus 1ms after the last IS exhausted',
      ok(() => CE.isChaseExhausted(two, new Date(T0 + 240 * HOUR + 1)) === true)
    );
    assert(
      'A',
      'STANDARD: one leg of two spent is not exhausted, however long ago',
      notEx(spend(2, [leg('CHASE_FIRST', 96, 96)]), 2000)
    );
    assert(
      'A',
      'GENTLE, one leg of one spent: exhausted 72h after it',
      ex(spend(1, [leg('CHASE_FIRST', 120, 120)]), 193)
    );
    assert('A', 'GENTLE: not before', notEx(spend(1, [leg('CHASE_FIRST', 120, 120)]), 191));

    for (const [label, s] of [
      ['NO CADENCE, NO ROWS (DONT_CHASE, pace OFF)', spend(0, [])],
      [
        'NO CADENCE, and rows exist from before the mark (GTC-179: no cadence is not a spent one)',
        spend(0, [leg('CHASE_FIRST', 96, 96), leg('CHASE_SECOND', 168, 168)]),
      ],
    ] as const) {
      assert('A', `${label} → never exhausted`, notEx(s, 5000));
    }
    assert(
      'A',
      'no spend at all (undefined) → not exhausted',
      ok(() => CE.isChaseExhausted(undefined, at(5000)) === false)
    );
    assert(
      'A',
      'a PENDING leg (no terminal instant) is not spent → not exhausted',
      notEx(spend(2, [leg('CHASE_FIRST', 96, 96), leg('CHASE_SECOND', 168, null)]), 5000)
    );
    assert(
      'A',
      'AS AT AN INSTANT: a leg spent AFTER the instant was still pending then',
      notEx(spend(2, [leg('CHASE_FIRST', 96, 96), leg('CHASE_SECOND', 168, 400)]), 399)
    );
    {
      const later = spend(1, [leg('CHASE_FIRST', 96, 96), leg('CHASE_SECOND', 500, 500)]);
      assert(
        'A',
        'AS AT AN INSTANT: a leg created after the instant did not exist then (exhausted at 400, not at 520)',
        ex(later, 400) && notEx(later, 520)
      );
    }
    assert(
      'A',
      'MID-FLIGHT PACE CHANGE: cadence now 1, but a second leg was sent — the wait counts from the LATEST reminder the guest got',
      notEx(spend(1, [leg('CHASE_FIRST', 96, 96), leg('CHASE_SECOND', 168, 168)]), 200) &&
        ex(spend(1, [leg('CHASE_FIRST', 96, 96), leg('CHASE_SECOND', 168, 168)]), 241)
    );

    // The hand-back, pure (its storage is slice 251c's; the predicate is whole now).
    const spent2 = [leg('CHASE_FIRST', 96, 96), leg('CHASE_SECOND', 168, 168)];
    for (const n of [1, 2, 3]) {
      const hb = { reminders: n, at: at(300) };
      const more = Array.from({ length: n }, (_, i) =>
        leg('CHASE_MORE', 300 + 72 * i, 301 + 72 * i)
      );
      const last = 301 + 72 * (n - 1);
      assert(
        'A',
        `HAND-BACK OF ${n}: amber while its legs are unsent`,
        notEx(spend(2, spent2, hb), 299 + 1)
      );
      assert(
        'A',
        `HAND-BACK OF ${n}: ${n - 1} of ${n} sent is not exhausted`,
        notEx(spend(2, [...spent2, ...more.slice(0, n - 1)], hb), 5000)
      );
      assert(
        'A',
        `HAND-BACK OF ${n}: all sent, 72h after the last → exhausted again`,
        ex(spend(2, [...spent2, ...more], hb), last + 73) &&
          notEx(spend(2, [...spent2, ...more], hb), last + 71)
      );
    }
    assert(
      'A',
      'HAND-BACK: a CHASE_MORE row from an EARLIER hand-back does not count toward the new one',
      notEx(spend(2, [...spent2, leg('CHASE_MORE', 250, 251)], { reminders: 1, at: at(300) }), 5000)
    );
    assert(
      'A',
      'HAND-BACK recorded after the instant is not in force at it',
      ex(spend(2, spent2, { reminders: 2, at: at(600) }), 500)
    );
    assert(
      'A',
      'a REJECTED leg is terminal: it counts as spent (the known limit, 4.2)',
      ex(spend(1, [leg('CHASE_FIRST', 96, 97)]), 170)
    );

    // exhaustionFor — the chooser gates it.
    assert(
      'A',
      'exhaustionFor: no route (the host) → null, no signal',
      ok(() => CE.exhaustionFor(undefined, new Map(), at(5000)) === null)
    );
    assert(
      'A',
      'exhaustionFor: a NONE route → exhausted:false, whatever the rows say',
      ok(() => {
        const m = new Map([['pe1', two]]);
        const f = CE.exhaustionFor({ kind: 'NONE', why: 'HANDED_TO_HOST' }, m, at(5000));
        return f !== null && f.exhausted === false;
      })
    );
    assert(
      'A',
      'exhaustionFor: a DIRECT route reads its recipient’s spend',
      ok(() => {
        const m = new Map([['pe1', two]]);
        return (
          CE.exhaustionFor({ kind: 'DIRECT', channel: 'EMAIL', recipientId: 'pe1' }, m, at(5000))
            .exhausted === true
        );
      })
    );
    assert(
      'A',
      'exhaustionFor: a CARRIED child reads the CARRIER’s spend (ruling S’s shape)',
      ok(() => {
        const m = new Map([['carrier', two]]);
        return (
          CE.exhaustionFor(
            { kind: 'CARRIED', channel: 'EMAIL', recipientId: 'carrier' },
            m,
            at(5000)
          ).exhausted === true
        );
      })
    );

    // ══ LAYER B — the derivation, pure ═══════════════════════════════════════════════════
    const NOW = new Date('2026-09-30T12:00:00.000Z');
    const event = {
      status: 'CONFIRMING' as const,
      sentAt: new Date(NOW.getTime() - 12 * DAY),
      endDate: new Date(NOW.getTime() + 200 * HOUR),
      decideByOffsetHours: null,
      nudgePace: null,
    };
    const liveClock = { dropOffAt: null, decideByOffsetHours: null };
    const expiredClock = { dropOffAt: new Date(NOW.getTime() - HOUR), decideByOffsetHours: 0 };
    let seq = 0;
    const row = (response: string, clock = liveClock) => {
      seq++;
      return {
        itemId: `i${seq}`,
        assignmentId: `a${seq}`,
        name: `Dish ${seq}`,
        critical: false,
        response,
        kind: 'ITEM',
        teamId: 't',
        quantityAmount: null,
        quantityUnit: null,
        quantityUnitCustom: null,
        item: clock,
      };
    };
    const chase = (standing: string | null, carrierMarked = false) => ({ standing, carrierMarked });
    const quiet = { exhausted: true };
    const person = (o: {
      items?: any[];
      chase?: any;
      delivery?: any;
      exhaustion?: any;
      mark?: string | null;
      attendance?: string | null;
    }) => ({
      isHost: false,
      exhaustion: o.exhaustion ?? null,
      delivery: o.delivery ?? null,
      chase: o.chase ?? null,
      nudgeMark: o.mark ?? null,
      attendanceAnswer: o.attendance ?? null,
      items: o.items ?? [],
    });
    const is = (p: any, state: string, reasons?: string[]) =>
      ok(() => {
        const d = S.derivePersonState(p, event, NOW);
        return (
          d.state === state &&
          (reasons === undefined || JSON.stringify(d.reasons) === JSON.stringify(reasons))
        );
      });

    assert(
      'B',
      'CONTROL: a pending row, no facts → AMBER AWAITING_REPLY',
      is(person({ items: [row('PENDING')] }), 'AMBER', ['AWAITING_REPLY'])
    );
    assert(
      'B',
      'exhausted, a pending row → RED EXHAUSTED_SILENCE',
      is(person({ items: [row('PENDING')], exhaustion: quiet }), 'RED', ['EXHAUSTED_SILENCE'])
    );
    assert(
      'B',
      'ITEMLESS AND EXHAUSTED → RED EXHAUSTED_SILENCE (the hole state.ts recorded for this ticket)',
      is(person({ exhaustion: quiet }), 'RED', ['EXHAUSTED_SILENCE'])
    );
    assert(
      'B',
      'itemless, not exhausted → AMBER (Ruling 16 unchanged)',
      is(person({ exhaustion: { exhausted: false } }), 'AMBER', ['AWAITING_REPLY'])
    );
    assert(
      'B',
      'an ANSWER beats it: accepted rows stay GREEN',
      is(person({ items: [row('ACCEPTED')], exhaustion: quiet }), 'GREEN')
    );
    assert(
      'B',
      'an itemless YES stays GREEN',
      is(person({ exhaustion: quiet, attendance: 'YES' }), 'GREEN')
    );
    assert(
      'B',
      'RULING 14: the mark greys it — NOT_CHASED [DONT_CHASE]',
      is(person({ items: [row('PENDING')], exhaustion: quiet, mark: 'DONT_CHASE' }), 'NOT_CHASED', [
        'DONT_CHASE',
      ])
    );
    assert(
      'B',
      'RULING 14, itemless: the mark greys it',
      is(person({ exhaustion: quiet, mark: 'DONT_CHASE' }), 'NOT_CHASED', ['DONT_CHASE'])
    );
    assert(
      'B',
      'a DELIVERY failure beats it (the explaining reason wins)',
      is(
        person({
          items: [row('PENDING')],
          exhaustion: quiet,
          delivery: { failure: 'NOT_DELIVERED' },
        }),
        'RED',
        ['NOT_DELIVERED']
      )
    );
    assert(
      'B',
      '"opted out" beats it',
      is(
        person({ items: [row('PENDING')], exhaustion: quiet, chase: chase('EMAIL_OPTED_OUT') }),
        'RED',
        ['EMAIL_OPTED_OUT']
      )
    );

    // Q5 — unreachable after the ask.
    assert(
      'B',
      'Q5: CHASE_UNREACHABLE, a pending row → RED CHASE_UNREACHABLE at once',
      is(person({ items: [row('PENDING')], chase: chase('CHASE_UNREACHABLE') }), 'RED', [
        'CHASE_UNREACHABLE',
      ])
    );
    assert(
      'B',
      'Q5, itemless → RED CHASE_UNREACHABLE',
      is(person({ chase: chase('CHASE_UNREACHABLE') }), 'RED', ['CHASE_UNREACHABLE'])
    );
    assert(
      'B',
      'Q5: a delivery failure on the ask still wins over it (the ask’s own door)',
      is(
        person({
          items: [row('PENDING')],
          chase: chase('CHASE_UNREACHABLE'),
          delivery: { failure: 'NOT_DELIVERED' },
        }),
        'RED',
        ['NOT_DELIVERED']
      )
    );
    assert(
      'B',
      'Q5: it beats "gone quiet" — the silence has a cause',
      is(
        person({ items: [row('PENDING')], chase: chase('CHASE_UNREACHABLE'), exhaustion: quiet }),
        'RED',
        ['CHASE_UNREACHABLE']
      )
    );
    assert(
      'B',
      'Q5: the mark still greys it (Ruling 14)',
      is(
        person({ items: [row('PENDING')], chase: chase('CHASE_UNREACHABLE'), mark: 'DONT_CHASE' }),
        'NOT_CHASED',
        ['DONT_CHASE']
      )
    );
    assert(
      'B',
      'Q5: an answered row shows its answer',
      is(person({ items: [row('ACCEPTED')], chase: chase('CHASE_UNREACHABLE') }), 'GREEN')
    );
    assert(
      'B',
      'Q5: a LIVE MAYBE with no way to reach them → RED CHASE_UNREACHABLE (no follow-up can come)',
      is(person({ items: [row('MAYBE')], chase: chase('CHASE_UNREACHABLE') }), 'RED', [
        'CHASE_UNREACHABLE',
      ])
    );
    assert(
      'B',
      'Q5: an EXPIRED maybe stays "maybe timed out"',
      is(
        person({ items: [row('MAYBE', expiredClock)], chase: chase('CHASE_UNREACHABLE') }),
        'RED',
        ['DECIDE_BY_EXPIRED']
      )
    );

    // The live maybe with nothing coming (GTC-305 R1, given to this ticket; Q4a).
    for (const grey of [
      'HANDED_TO_HOST',
      'SMS_OPTED_OUT',
      'HOST_AS_CARRIER',
      'HOST_HOUSEHOLD_CHILD',
    ]) {
      assert(
        'B',
        `${grey}: a live maybe alone → NOT_CHASED [${grey}] (no follow-up comes)`,
        is(person({ items: [row('MAYBE')], chase: chase(grey) }), 'NOT_CHASED', [grey])
      );
    }
    assert(
      'B',
      'Q4a: text-opted-out, a live maybe beside a pending row → NOT_CHASED [SMS_OPTED_OUT]',
      is(
        person({ items: [row('MAYBE'), row('PENDING')], chase: chase('SMS_OPTED_OUT') }),
        'NOT_CHASED',
        ['SMS_OPTED_OUT']
      )
    );
    assert(
      'B',
      'handed over, an EXPIRED maybe → still RED DECIDE_BY_EXPIRED (the grey replaces amber only)',
      is(person({ items: [row('MAYBE', expiredClock)], chase: chase('HANDED_TO_HOST') }), 'RED', [
        'DECIDE_BY_EXPIRED',
      ])
    );
    assert(
      'B',
      'CONTROL: a chaseable person’s live maybe stays AMBER MAYBE_LIVE',
      is(person({ items: [row('MAYBE')] }), 'AMBER', ['MAYBE_LIVE'])
    );

    // Pace OFF (4.7).
    assert(
      'B',
      'PACE OFF: a pending row → NOT_CHASED [PACE_OFF]',
      is(person({ items: [row('PENDING')], chase: chase('PACE_OFF') }), 'NOT_CHASED', ['PACE_OFF'])
    );
    assert(
      'B',
      'PACE OFF, itemless → NOT_CHASED [PACE_OFF]',
      is(person({ chase: chase('PACE_OFF') }), 'NOT_CHASED', ['PACE_OFF'])
    );
    assert(
      'B',
      'PACE OFF: a live maybe stays AMBER — its decide-by follow-up still comes',
      is(person({ items: [row('MAYBE')], chase: chase('PACE_OFF') }), 'AMBER', ['MAYBE_LIVE'])
    );
    assert(
      'B',
      'PACE OFF: a delivery failure still reads red',
      is(
        person({
          items: [row('PENDING')],
          chase: chase('PACE_OFF'),
          delivery: { failure: 'NOT_DELIVERED' },
        }),
        'RED',
        ['NOT_DELIVERED']
      )
    );
    assert(
      'B',
      'PACE OFF opens the reading room (READING_GREYS)',
      ok(() => S.READING_GREYS.includes('PACE_OFF'))
    );
    assert(
      'B',
      // ⚠ 7 → 8 at [[GTC-350]] (founder Q1, 2026-10-02): REPLIED is the eighth. CHASE_UNREACHABLE stays.
      'RED_REASONS gained exactly one here, CHASE_UNREACHABLE — eight since GTC-350 added REPLIED',
      ok(
        () =>
          S.RED_REASONS.length === 8 &&
          S.RED_REASONS.includes('CHASE_UNREACHABLE') &&
          S.RED_REASONS.includes('REPLIED')
      )
    );

    // chase-fact: the map and the pace.
    for (const why of ['EMAIL_BLOCKED', 'NO_CHANNEL', 'PHONE_UNUSABLE']) {
      assert(
        'B',
        `CHASE_REFUSAL_MEANS.${why} → CHASE_UNREACHABLE (Q5)`,
        ok(() => CF.CHASE_REFUSAL_MEANS[why] === 'CHASE_UNREACHABLE')
      );
    }
    assert(
      'B',
      'chaseFactFrom: a chaseable route on an OFF event → PACE_OFF',
      ok(
        () =>
          CF.chaseFactFrom(
            { kind: 'DIRECT', channel: 'EMAIL', recipientId: 'x' },
            new Map(),
            false,
            true
          ).standing === 'PACE_OFF'
      )
    );
    assert(
      'B',
      'chaseFactFrom: a refusal on an OFF event keeps the refusal’s own standing',
      ok(
        () =>
          CF.chaseFactFrom({ kind: 'NONE', why: 'HANDED_TO_HOST' }, new Map(), false, true)
            .standing === 'HANDED_TO_HOST'
      )
    );
    assert(
      'B',
      'CONTROL: chaseFactFrom on a paced event → null standing',
      ok(
        () =>
          CF.chaseFactFrom(
            { kind: 'DIRECT', channel: 'EMAIL', recipientId: 'x' },
            new Map(),
            false,
            false
          ).standing === null
      )
    );

    // ══ LAYER C — the words and the doors ════════════════════════════════════════════════
    const pf = (state: string, reasons: string[], extra: any = {}) => ({
      personEventId: 'pe',
      personId: 'p',
      name: 'Amelia',
      isHost: false,
      householdRole: null,
      role: 'PARTICIPANT',
      teamId: null,
      nudgeMark: null,
      state,
      reasons,
      nextNudgeAt: null,
      items: [],
      emailNote: null,
      textable: false,
      chase: null,
      chaseNote: null,
      ...extra,
    });
    assert(
      'C',
      `W1: "gone quiet" is the why-line, byte-exact`,
      ok(() => SP.whyLineFor(pf('RED', ['EXHAUSTED_SILENCE'])) === W1_GONE_QUIET)
    );
    assert(
      'C',
      'Q5: CHASE_UNREACHABLE says "nowhere to send" for someone Gather cannot text',
      ok(() => SP.whyLineFor(pf('RED', ['CHASE_UNREACHABLE'])) === 'nowhere to send')
    );
    assert(
      'C',
      'Q5: and "can\'t email" for someone it can',
      ok(
        () => SP.whyLineFor(pf('RED', ['CHASE_UNREACHABLE'], { textable: true })) === "can't email"
      )
    );
    assert(
      'C',
      'Q5: no resend door — the ask did not fail (GTC-336’s defect is not re-opened)',
      ok(() => AC.doorOffered(pf('RED', ['CHASE_UNREACHABLE'])) === false)
    );
    assert(
      'C',
      'Q5: Remind is withdrawn, as it is for UNREACHABLE',
      ok(() => AC.remindOffered(pf('RED', ['CHASE_UNREACHABLE'])) === false)
    );
    assert(
      'C',
      'CONTROL: "gone quiet" keeps Remind (Ruling 31)',
      ok(() => AC.remindOffered(pf('RED', ['EXHAUSTED_SILENCE'])) === true)
    );
    assert(
      'C',
      'PACE OFF opens the reading panel',
      ok(() => SP.panelFor(pf('NOT_CHASED', ['PACE_OFF'])) === 'reading')
    );
    assert(
      'C',
      'W6, byte-exact, is the chase-fact constant',
      ok(() => CF.PACE_OFF_CHASE_NOTE === W6_PACE_OFF)
    );
    assert(
      'C',
      'chaseNoteFor: the OFF grey carries W6',
      ok(
        () =>
          CF.chaseNoteFor({
            state: 'NOT_CHASED',
            reasons: ['PACE_OFF'],
            route: { kind: 'DIRECT', channel: 'EMAIL', recipientId: 'pe' },
            isChild: false,
            carrierName: null,
          }) === W6_PACE_OFF
      )
    );
    assert(
      'C',
      'chaseNoteFor: the Q5 red carries no chase sentence',
      ok(
        () =>
          CF.chaseNoteFor({
            state: 'RED',
            reasons: ['CHASE_UNREACHABLE'],
            route: { kind: 'NONE', why: 'EMAIL_BLOCKED' },
            isChild: false,
            carrierName: null,
          }) === null
      )
    );
    assert(
      'C',
      'the OFF grey’s reading panel reads "No answer yet" and shows W6',
      ok(() => {
        const panel = RD.readingPanelFor(
          pf('NOT_CHASED', ['PACE_OFF'], { chaseNote: W6_PACE_OFF }),
          NOW
        );
        return (
          panel.status === 'No answer yet' &&
          JSON.stringify(panel.notes) === JSON.stringify([W6_PACE_OFF])
        );
      })
    );

    // ══ LAYER D — the read path, real rows ═══════════════════════════════════════════════
    const now = new Date();
    const stamp = Date.now();
    const sentAt = new Date(now.getTime() - 16 * DAY);

    async function mkEvent(label: string, pace: 'STANDARD' | 'RELAXED' | 'OFF' | null) {
      const host = await prisma.person.create({
        data: {
          name: `${label} Host`,
          email: `gtc251+${label.toLowerCase()}+host+${stamp}@example.test`,
        },
      });
      created.persons.push(host.id);
      const ev = await prisma.event.create({
        data: {
          name: `${TAG} ${label}`,
          startDate: new Date(now.getTime() + 196 * HOUR),
          endDate: new Date(now.getTime() + 200 * HOUR),
          hostId: host.id,
          status: 'CONFIRMING',
          sentAt,
          nudgePace: pace,
        },
      });
      created.events.push(ev.id);
      const team = await prisma.team.create({ data: { eventId: ev.id, name: 'Mains' } });
      const hostPe = await prisma.personEvent.create({
        data: { personId: host.id, eventId: ev.id, role: 'HOST' },
      });
      return { ev, team, host, hostPe };
    }
    type Ev = Awaited<ReturnType<typeof mkEvent>>;

    async function mkMember(
      e: Ev,
      name: string,
      o: {
        email?: string | null;
        phone?: string | null;
        smsOptedOut?: boolean;
        items?: number;
        response?: string;
        mark?: 'DONT_CHASE' | 'GENTLE' | null;
        exception?: 'HAND_TO_HOST' | null;
        householdId?: string | null;
        householdRole?: string;
      } = {}
    ) {
      const child = o.householdRole === 'CHILD';
      const p = await prisma.person.create({
        data: {
          name,
          email:
            o.email !== undefined
              ? o.email
              : child
                ? null
                : `gtc251+${name.split(' ')[0].toLowerCase()}+${stamp}@example.test`,
          phoneNumber: o.phone ?? null,
          smsOptedOut: o.smsOptedOut ?? false,
        },
      });
      created.persons.push(p.id);
      const pe = await prisma.personEvent.create({
        data: {
          personId: p.id,
          eventId: e.ev.id,
          role: 'PARTICIPANT',
          householdId: o.householdId ?? null,
          householdRole: o.householdRole ?? (o.householdId ? 'GUEST' : null),
          nudgeMark: o.mark ?? null,
          chaseException: o.exception ?? null,
          sentAt: child ? null : sentAt,
        },
      });
      for (let i = 0; i < (o.items ?? 1); i++) {
        const item = await prisma.item.create({
          data: { teamId: e.team.id, name: `${name}'s dish ${i + 1}`, kind: 'ITEM' },
        });
        await prisma.assignment.create({
          data: { itemId: item.id, personId: p.id, response: o.response ?? 'PENDING' },
        });
      }
      return { p, pe };
    }
    async function outRow(
      e: Ev,
      personEventId: string,
      kind: string,
      fate: 'accepted' | 'rejected' | 'pending',
      atT: Date
    ) {
      await prisma.outboundMessage.create({
        data: {
          eventId: e.ev.id,
          personEventId,
          kind: kind as any,
          channel: 'EMAIL',
          createdAt: atT,
          attemptedAt: atT,
          attemptCount: 1,
          ...(fate === 'accepted'
            ? {
                acceptedAt: atT,
                provider: 'resend',
                providerMessageId: `${TAG}-${personEventId}-${kind}`,
              }
            : {}),
          ...(fate === 'rejected'
            ? { rejectedAt: atT, provider: 'resend', providerError: 'fixture' }
            : {}),
          ...(fate === 'pending' ? { nextAttemptAt: new Date(now.getTime() + DAY) } : {}),
        },
      });
    }
    const ago = (h: number) => new Date(now.getTime() - h * HOUR);
    async function asked(e: Ev, peId: string) {
      await outRow(e, peId, 'ASK', 'accepted', sentAt);
    }
    async function standardSpent(e: Ev, peId: string, lastAgoH: number) {
      await asked(e, peId);
      await outRow(e, peId, 'CHASE_FIRST', 'accepted', ago(lastAgoH + 72));
      await outRow(e, peId, 'CHASE_SECOND', 'accepted', ago(lastAgoH));
    }

    // Event 1 — STANDARD (pace unset).
    const e1 = await mkEvent('E1', null);
    const sam = await mkMember(e1, 'Sam Spent');
    await standardSpent(e1, sam.pe.id, 120);
    const sid = await mkMember(e1, 'Sid Seventyone');
    await standardSpent(e1, sid.pe.id, 71);
    const pia = await mkMember(e1, 'Pia Pending');
    await asked(e1, pia.pe.id);
    await outRow(e1, pia.pe.id, 'CHASE_FIRST', 'accepted', ago(200));
    await outRow(e1, pia.pe.id, 'CHASE_SECOND', 'pending', ago(120));
    const rex = await mkMember(e1, 'Rex Rejected');
    await asked(e1, rex.pe.id);
    await outRow(e1, rex.pe.id, 'CHASE_FIRST', 'accepted', ago(200));
    await outRow(e1, rex.pe.id, 'CHASE_SECOND', 'rejected', ago(120));
    const gia = await mkMember(e1, 'Gia Gentle', { mark: 'GENTLE' });
    await asked(e1, gia.pe.id);
    await outRow(e1, gia.pe.id, 'CHASE_FIRST', 'accepted', ago(100));
    const lee = await mkMember(e1, 'Lee Legacy');
    await asked(e1, lee.pe.id);
    await prisma.personEvent.update({
      where: { id: lee.pe.id },
      data: { firstNudgeSentAt: ago(200), secondNudgeSentAt: ago(120) },
    });
    const ida = await mkMember(e1, 'Ida Itemless', { items: 0 });
    await standardSpent(e1, ida.pe.id, 120);
    const ana = await mkMember(e1, 'Ana Answered', { response: 'ACCEPTED' });
    await standardSpent(e1, ana.pe.id, 120);
    const mo = await mkMember(e1, 'Mo Marked', { mark: 'DONT_CHASE' });
    await standardSpent(e1, mo.pe.id, 120);
    const hal = await mkMember(e1, 'Hal Handed', { exception: 'HAND_TO_HOST' });
    await standardSpent(e1, hal.pe.id, 120);
    const bea = await mkMember(e1, 'Bea Blocked');
    await asked(e1, bea.pe.id);
    const beaAddress = bea.p.email!.toLowerCase();
    // [[GTC-335]] — first seen two hours ago, so layer E's `since = ago(1)` is a visit with nothing
    // changed, and `since = ago(3)` a visit from before the block.
    await prisma.emailBlock.create({
      data: { address: beaAddress, reason: 'BOUNCED', eventId: e1.ev.id, firstSeenAt: ago(2) },
    });
    created.addresses.push(beaAddress);
    const nia = await mkMember(e1, 'Nia Nochannel');
    await asked(e1, nia.pe.id);
    await prisma.person.update({ where: { id: nia.p.id }, data: { email: null } });
    const pho = await mkMember(e1, 'Pho Unusable', { email: null, phone: '+15550100222' });
    await asked(e1, pho.pe.id);
    const mae = await mkMember(e1, 'Mae Handedmaybe', {
      exception: 'HAND_TO_HOST',
      response: 'MAYBE',
    });
    await asked(e1, mae.pe.id);
    const tom = await mkMember(e1, 'Tom Textsoffmaybe', {
      phone: '+64211230251',
      smsOptedOut: true,
      response: 'MAYBE',
    });
    await asked(e1, tom.pe.id);
    const hh = await prisma.household.create({ data: { eventId: e1.ev.id } });
    const cara = await mkMember(e1, 'Cara Carrier', {
      householdId: hh.id,
      householdRole: 'PRIMARY_CONTACT',
    });
    await prisma.household.update({
      where: { id: hh.id },
      data: { contactPersonEventId: cara.pe.id },
    });
    await standardSpent(e1, cara.pe.id, 120);
    const kit = await mkMember(e1, 'Kit Kid', { householdId: hh.id, householdRole: 'CHILD' });

    // Event 2 — RELAXED [6, 12].
    const e2 = await mkEvent('E2', 'RELAXED');
    const rae = await mkMember(e2, 'Rae Relaxed');
    await asked(e2, rae.pe.id);
    await outRow(e2, rae.pe.id, 'CHASE_FIRST', 'accepted', ago(240));
    await outRow(e2, rae.pe.id, 'CHASE_SECOND', 'accepted', ago(96));
    const roy = await mkMember(e2, 'Roy Relaxedone');
    await asked(e2, roy.pe.id);
    await outRow(e2, roy.pe.id, 'CHASE_FIRST', 'accepted', ago(240));

    // Event 3 — OFF.
    const e3 = await mkEvent('E3', 'OFF');
    const oli = await mkMember(e3, 'Oli Off');
    await asked(e3, oli.pe.id);
    const oma = await mkMember(e3, 'Oma Offmaybe', { response: 'MAYBE' });
    await asked(e3, oma.pe.id);

    const glances: Record<string, any> = {};
    try {
      for (const e of [e1, e2, e3])
        glances[e.ev.id] = await R.readEventGlance(prisma, e.ev.id, now);
    } catch (err) {
      console.error(
        `\x1b[31m!\x1b[0m readEventGlance threw: ${(err as Error).message.split('\n')[0]}`
      );
    }
    const P = (e: Ev, m: { pe: { id: string } }) => {
      const g = glances[e.ev.id];
      if (!g) return null;
      return (
        [...g.households.flatMap((h: any) => h.members), ...g.unhoused].find(
          (x: any) => x.personEventId === m.pe.id
        ) ?? null
      );
    };
    const reads = (e: Ev, m: any, state: string, reasons?: string[]) =>
      ok(() => {
        const x = P(e, m);
        return (
          !!x &&
          x.state === state &&
          (reasons === undefined || JSON.stringify(x.reasons) === JSON.stringify(reasons))
        );
      });
    const show = (e: Ev, m: any) => {
      const x = P(e, m);
      return x ? `${x.state} ${JSON.stringify(x.reasons)}` : 'absent';
    };

    assert(
      'D',
      'STANDARD, both reminders sent 5 days ago → RED "gone quiet"',
      reads(e1, sam, 'RED', ['EXHAUSTED_SILENCE']) &&
        ok(() => SP.whyLineFor(P(e1, sam)) === W1_GONE_QUIET),
      show(e1, sam)
    );
    assert(
      'D',
      'STANDARD, the last reminder 71 hours ago → still AMBER (it is still working)',
      reads(e1, sid, 'AMBER', ['AWAITING_REPLY']),
      show(e1, sid)
    );
    assert(
      'D',
      'a second reminder still pending (a retry scheduled) → AMBER',
      reads(e1, pia, 'AMBER', ['AWAITING_REPLY']),
      show(e1, pia)
    );
    assert(
      'D',
      'a second reminder finally REJECTED → counts as spent → RED (the known limit, 4.2)',
      reads(e1, rex, 'RED', ['EXHAUSTED_SILENCE']),
      show(e1, rex)
    );
    assert(
      'D',
      'GENTLE, its one reminder sent 100 hours ago → RED',
      reads(e1, gia, 'RED', ['EXHAUSTED_SILENCE']),
      show(e1, gia)
    );
    assert(
      'D',
      'LEGACY: stamps with no rows still count as sent → RED',
      reads(e1, lee, 'RED', ['EXHAUSTED_SILENCE']),
      show(e1, lee)
    );
    assert(
      'D',
      'ITEMLESS, spent → RED "gone quiet"',
      reads(e1, ida, 'RED', ['EXHAUSTED_SILENCE']),
      show(e1, ida)
    );
    assert('D', 'ANSWERED, spent → GREEN', reads(e1, ana, 'GREEN'), show(e1, ana));
    assert(
      'D',
      'MARKED, rows from before the mark → NOT_CHASED [DONT_CHASE], never red',
      reads(e1, mo, 'NOT_CHASED', ['DONT_CHASE']),
      show(e1, mo)
    );
    assert(
      'D',
      'HANDED OVER, rows from before → NOT_CHASED [HANDED_TO_HOST], never red',
      reads(e1, hal, 'NOT_CHASED', ['HANDED_TO_HOST']),
      show(e1, hal)
    );
    assert(
      'D',
      'Q5: blocked after the ask, no mobile → RED CHASE_UNREACHABLE, "nowhere to send"',
      reads(e1, bea, 'RED', ['CHASE_UNREACHABLE']) &&
        ok(() => SP.whyLineFor(P(e1, bea)) === 'nowhere to send'),
      show(e1, bea)
    );
    assert(
      'D',
      'Q5: the address removed after the ask → RED CHASE_UNREACHABLE',
      reads(e1, nia, 'RED', ['CHASE_UNREACHABLE']),
      show(e1, nia)
    );
    assert(
      'D',
      'Q5: a number that cannot take texts, no email → RED CHASE_UNREACHABLE',
      reads(e1, pho, 'RED', ['CHASE_UNREACHABLE']),
      show(e1, pho)
    );
    assert(
      'D',
      'Q5: no resend door on any of the three',
      ok(() => [bea, nia, pho].every((m) => AC.doorOffered(P(e1, m)) === false))
    );
    assert(
      'D',
      'handed over, a live maybe → NOT_CHASED [HANDED_TO_HOST], with the ruled sentence',
      reads(e1, mae, 'NOT_CHASED', ['HANDED_TO_HOST']) &&
        ok(() => P(e1, mae).chaseNote === W_HANDED),
      show(e1, mae)
    );
    assert(
      'D',
      'Q4a: text-opted-out, a live maybe → NOT_CHASED [SMS_OPTED_OUT], with the ruled sentence',
      reads(e1, tom, 'NOT_CHASED', ['SMS_OPTED_OUT']) && ok(() => P(e1, tom).chaseNote === W_SMS),
      show(e1, tom)
    );
    assert(
      'D',
      'the carrier, spent → RED',
      reads(e1, cara, 'RED', ['EXHAUSTED_SILENCE']),
      show(e1, cara)
    );
    assert(
      'D',
      'the CARRIED CHILD follows the carrier’s reminders → RED',
      reads(e1, kit, 'RED', ['EXHAUSTED_SILENCE']),
      show(e1, kit)
    );
    assert(
      'D',
      'RELAXED, both sent, the last 4 days ago → RED',
      reads(e2, rae, 'RED', ['EXHAUSTED_SILENCE']),
      show(e2, rae)
    );
    assert(
      'D',
      'RELAXED, one of two sent 10 days ago → AMBER (the second is still to come)',
      reads(e2, roy, 'AMBER', ['AWAITING_REPLY']),
      show(e2, roy)
    );
    assert(
      'D',
      'OFF: a silent guest → NOT_CHASED [PACE_OFF], opening the reading room with W6',
      reads(e3, oli, 'NOT_CHASED', ['PACE_OFF']) &&
        ok(() => P(e3, oli).chaseNote === W6_PACE_OFF && SP.panelFor(P(e3, oli)) === 'reading'),
      show(e3, oli)
    );
    assert(
      'D',
      'OFF: a live maybe stays AMBER (its follow-up still comes)',
      reads(e3, oma, 'AMBER', ['MAYBE_LIVE']),
      show(e3, oma)
    );
    assert(
      'D',
      'the summary counts "gone quiet" as needing her',
      ok(() => glances[e1.ev.id].summary.needYou >= 9)
    );
    assert(
      'D',
      'THE WIRE CARRIES NO SEND INSTANT: no stamp name and no ISO date beyond the ones already ruled',
      ok(() => {
        const s = JSON.stringify(glances[e1.ev.id]);
        return !/firstNudgeSentAt|secondNudgeSentAt|acceptedAt|spentAt|handedBackAt/.test(s);
      })
    );

    // ══ LAYER E — the replay ═════════════════════════════════════════════════════════════
    const e1Event = {
      status: 'CONFIRMING',
      sentAt,
      endDate: new Date(now.getTime() + 200 * HOUR),
      decideByOffsetHours: null,
      nudgePace: null,
    };
    const stepFor = async (seen: Date, m: any) => {
      const replay = await RE.readGlanceReplay(
        prisma,
        e1.ev.id,
        seen,
        glances[e1.ev.id],
        e1Event,
        now
      );
      return replay.steps.find((s: any) => s.personEventId === m.pe.id) ?? null;
    };
    let quietStep: any = 'unread';
    let settledStep: any = 'unread';
    let blockedStep: any = 'unread';
    let blockedWhileAwayStep: any = 'unread';
    try {
      quietStep = await stepFor(ago(60), sam);
      settledStep = await stepFor(ago(1), sam);
      blockedStep = await stepFor(ago(1), bea);
      blockedWhileAwayStep = await stepFor(ago(3), bea);
    } catch (err) {
      console.error(
        `\x1b[31m!\x1b[0m readGlanceReplay threw: ${(err as Error).message.split('\n')[0]}`
      );
    }
    assert(
      'E',
      'NOTHING CHANGED since she looked (Sam was already quiet) → no step',
      settledStep === null,
      JSON.stringify(settledStep)
    );
    assert(
      'E',
      'Sam went quiet while she was away → AMBER → RED plays, once',
      ok(() => quietStep !== null && quietStep.from === 'AMBER' && quietStep.to === 'RED'),
      JSON.stringify(quietStep)
    );
    assert(
      'E',
      // [[GTC-335]]: relabelled — the chase fact IS rewound now, by the block's own recorded time.
      'the Q5 red plays no step when nothing changed (the block was first seen before she looked)',
      blockedStep === null,
      JSON.stringify(blockedStep)
    );
    assert(
      'E',
      '[[GTC-335]] the Q5 red plays ONCE, AMBER → RED, when the block was first seen while she was away',
      ok(
        () =>
          blockedWhileAwayStep !== null &&
          blockedWhileAwayStep !== 'unread' &&
          blockedWhileAwayStep.from === 'AMBER' &&
          blockedWhileAwayStep.to === 'RED'
      ),
      JSON.stringify(blockedWhileAwayStep)
    );

    // ══ LAYER S — structure ══════════════════════════════════════════════════════════════
    let anchors = '';
    try {
      anchors = execFileSync('grep', ['-rn', 'ANCHOR(GTC-251)', 'src'], {
        cwd: ROOT,
        encoding: 'utf8',
      });
    } catch {
      anchors = '';
    }
    assert(
      'S',
      'ANCHOR(GTC-251) is gone from src — the ticket that owned it has landed',
      anchors.trim() === '',
      anchors.trim()
    );
    assert(
      'S',
      'chase-exhaustion.ts is pure: no Prisma, no clock of its own',
      ok(() => {
        const src = code('src/lib/chase-exhaustion.ts');
        return src.length > 0 && !/@prisma|prisma\.|new Date\(\)|Date\.now\(/.test(src);
      })
    );
    assert(
      'S',
      'read.ts takes the DECISION from the shared predicate (exhaustionFor), and names no send stamp',
      ok(() => {
        const src = code('src/lib/glance/read.ts');
        return (
          /exhaustionFor\(/.test(src) &&
          /readChaseSpend\(/.test(src) &&
          !/firstNudgeSentAt|secondNudgeSentAt/.test(src)
        );
      })
    );
    assert(
      'S',
      'the replay asks the same predicate at `since` (no second definition)',
      ok(() => /exhaustionFor\(/.test(code('src/lib/glance/replay-entry.ts')))
    );
    assert(
      'S',
      'the reader exists and is the only place the stamps are read for this',
      ok(
        () =>
          typeof CER.readChaseSpend === 'function' &&
          /firstNudgeSentAt/.test(code('src/lib/chase-exhaustion-read.ts'))
      )
    );
    assert(
      'S',
      'decide-by.ts cites GTC-251 as the owner of the door, not GTC-178',
      ok(() => {
        const src = read('src/lib/decide-by.ts');
        return /GTC-251/.test(src) && !/exhausted-silence red \(GTC-178 \/ E1\)/.test(src);
      })
    );
    let zoneDiff = 'unread';
    try {
      execFileSync(
        'git',
        [
          'diff',
          '--quiet',
          'HEAD',
          '--',
          'src/lib/sms/opt-out-service.ts',
          'src/lib/eligibility/email-opt-out.ts',
          'src/lib/eligibility/email-block.ts',
          'prisma/',
        ],
        { cwd: ROOT }
      );
      zoneDiff = '';
    } catch {
      zoneDiff = 'changed';
    }
    assert('S', 'ZONES 7 AND 9 AND THE SCHEMA ARE UNEDITED (read only)', zoneDiff === '', zoneDiff);
    assert('S', 'NOTHING LEFT THE PROCESS', trapCount() === 0, `trap hits: ${trapCount()}`);
  } finally {
    await prisma.outboundMessage.deleteMany({ where: { eventId: { in: created.events } } });
    await prisma.emailBlock.deleteMany({ where: { address: { in: created.addresses } } });
    await prisma.accessToken.deleteMany({ where: { eventId: { in: created.events } } });
    await prisma.event.deleteMany({ where: { id: { in: created.events } } });
    await prisma.person.deleteMany({ where: { id: { in: created.persons } } });
    const left =
      (await prisma.event.count({ where: { id: { in: created.events } } })) +
      (await prisma.person.count({ where: { id: { in: created.persons } } })) +
      (await prisma.emailBlock.count({ where: { address: { in: created.addresses } } }));
    const after = {
      outbound: await prisma.outboundMessage.count(),
      inviteEvents: await prisma.inviteEvent.count(),
    };
    assert('Z', 'teardown: nothing of this fixture is left, by id', left === 0, `${left} left`);
    assert(
      'Z',
      'teardown: OutboundMessage and InviteEvent counts are as found',
      after.outbound === before.outbound && after.inviteEvents === before.inviteEvents,
      `${JSON.stringify(before)} → ${JSON.stringify(after)}`
    );
    await prisma.$disconnect();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('RED:');
    for (const r of redAssertions) console.log(`  ${r}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
