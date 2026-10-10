/**
 * GTC-350 — a guest's text reply, shown on the board, and the chase it ends.
 *
 * Founder rulings: Q1 to Q5 (SCOPED 2026-10-02) and the PLAN RULINGS of 2026-10-02, verbatim in
 * docs/tickets/GTC-350.md. The rule, in one sentence: a reply puts the guest in the host's hands
 * until she hands them back.
 *
 * THE LAYERS:
 *  A. the pure predicate — `replyInForce`, `replyFactFor`, the R5 time line
 *  B. the derivation — where REPLIED sits among the reds
 *  C. the words — R1 to R6, W2 and the replied lead, Q4 and Q5, the reading room's doors
 *  D. the board on a fixture — the words reach the host, the fence holds, a child, an OUT guest
 *  G. the replay — a reply that turned a card red while she was away plays once
 *  E. the chase stops — the sweep, the drain (guarded), the decide-by follow-up; Zone 7 unwritten
 *  F. the hand-back — from REPLIED, its count, a later reply, a child
 *  P. reminders off — no dead door (plan fix 1)
 *  L. the live poll — the host's room gets the words (plan fix 2)
 *  S. structure and fences
 *
 * NOTHING IS SENT. `liveBehindTrap` walls the process and a fetch stub answers anything that asks;
 * no text provider is configured, so a text stops at `SMS_DISABLED`. TNZ is never called. No cron
 * route is called: the sweep is scoped to this file's event, and `drainOnce` runs only after this
 * file counts zero drain rows outside its own events (Q-J). Every row is this file's own, removed by
 * id; every phone number is unique to the run.
 *
 * Run: npm run test:reply-board
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { join } from 'path';
import { liveBehindTrap, trapCount } from './helpers/provider-trap';
import { BEHAVIOUR_DENYLIST, REPLY_FENCE_DENYLIST, collectKeys } from './glance-fence';

const prisma = new PrismaClient();
const ROOT = join(__dirname, '..');
const TAG = 'GTC350';
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
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

function code(rel: string): string {
  return read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function quiet(paths: string[]): boolean {
  try {
    execFileSync('git', ['diff', '--quiet', 'HEAD', '--', ...paths], { cwd: ROOT, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

// ── The ruled words, typed here so a changed constant fails rather than agreeing with itself ──
const R1 = 'replied by text';
const R2 = 'reply came in';
const R3 = (c: string) =>
  `Their ask is in ${c}'s message, and ${c} replied. You can read it on ${c}'s card.`;
const R4 = 'Their replies';
const R6_OUT = 'Not coming';
const R6_DONT_CHASE = "You're handling them";
const W2_LEAD = 'Want me to keep trying?';
const LEAD_REPLIED = 'Want me to carry on nudging them?';
const W2_REFUSED = 'The board is catching up.';
const PACE_OFF_WORDS = "Nudges are off for this event, so I won't follow them up.";
// The founder's ruling on the RED report, 2026-10-02 ("Say why").
const FOLLOW_UP_SPENT_WORDS =
  "I've already asked them once to decide, so I won't nudge them again.";
const Q4_LINE =
  'Replies to an email come to you@example.com. A text reply usually comes to your board, and I stop nudging whoever sent it.';
const Q5_BULLET =
  "• If you reply to one of our texts, we show your reply to the person who invited you, keep it with the event it was about, and delete it with that event's data.";

/** R5, written independently of the module under test: "Fri 2 Oct, 2:14pm", in NZ time. */
function r5(at: Date): string {
  const parts = new Intl.DateTimeFormat('en-NZ', {
    timeZone: 'Pacific/Auckland',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(at);
  const v = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${v('weekday')} ${v('day')} ${v('month')}, ${v('hour')}:${v('minute')}${v('dayPeriod').toLowerCase()}`;
}

let nonStubCalls = 0;
const realFetch = globalThis.fetch;
function stub() {
  globalThis.fetch = (async (url: unknown) => {
    const u = String(url);
    if (u.includes('resend') || u.includes('tnz')) {
      return new Response(JSON.stringify({ id: `${TAG}-${Date.now()}-${Math.random()}` }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    nonStubCalls++;
    return new Response('{}', { status: 500 });
  }) as typeof fetch;
}

async function main() {
  liveBehindTrap();
  process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
  process.env.RESEND_API_KEY = `re_${TAG}_sentinel_key_000000000000`;
  process.env.UNSUBSCRIBE_TOKEN_SECRET = process.env.UNSUBSCRIBE_TOKEN_SECRET || `${TAG}-secret`;
  for (const k of [
    'TNZ_AUTH_TOKEN',
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN',
    'TWILIO_PHONE_NUMBER',
  ])
    delete process.env[k];
  stub();

  const load = async (p: string) => {
    try {
      return await import(p);
    } catch (err) {
      console.error(`\x1b[31m!\x1b[0m ${p} did not load: ${(err as Error).message.split('\n')[0]}`);
      return null;
    }
  };
  // A missing module fails each call as an assertion, never the run — RED and GREEN in one file.
  const CR: any = (await load('../src/lib/chase-reply')) ?? {};
  const S: any = (await load('../src/lib/glance/state')) ?? {};
  const SP: any = (await load('../src/components/glance/strip')) ?? {};
  const RD: any = (await load('../src/components/glance/reading')) ?? {};
  const AC: any = (await load('../src/lib/glance/actions')) ?? {};
  const LV: any = (await load('../src/lib/glance/live')) ?? {};
  const CF: any = (await load('../src/lib/glance/chase-fact')) ?? {};
  const DF: any = (await load('../src/lib/glance/delivery-fact')) ?? {};
  const R: any = (await load('../src/lib/glance/read')) ?? {};
  const RE: any = (await load('../src/lib/glance/replay-entry')) ?? {};
  const CE: any = (await load('../src/lib/chase-exhaustion')) ?? {};
  const HB: any = (await load('../src/lib/chase-hand-back')) ?? {};
  const ELIG: any = (await load('../src/lib/sms/nudge-eligibility')) ?? {};
  const DBE: any = (await load('../src/lib/sms/decide-by-eligibility')) ?? {};
  const DIS: any = (await load('../src/lib/press/dispatch')) ?? {};
  const APC: any = (await load('../src/lib/preflight/ask-preview-compose')) ?? {};
  const TRC: any = (await load('../src/lib/sms/tnz-reply-contract')) ?? {};
  const TRR: any = (await load('../src/lib/sms/tnz-reply-record')) ?? {};

  const created = { events: [] as string[], persons: [] as string[], users: [] as string[] };
  const phones: string[] = [];
  const before = {
    outbound: await prisma.outboundMessage.count(),
    inviteEvents: await prisma.inviteEvent.count(),
    optOuts: await prisma.smsOptOut.count(),
  };

  try {
    // ══ LAYER A — the pure predicate ═══════════════════════════════════════════════════════
    const T0 = new Date('2026-09-01T09:00:00.000Z').getTime();
    const t = (h: number) => new Date(T0 + h * HOUR);
    const hb = (h: number, reminders = 1) => ({ reminders, at: t(h) });
    assert(
      'A',
      'A1 a reply with no hand-back is in force',
      ok(() => CR.replyInForce([t(1)], null, t(2)) === true)
    );
    assert(
      'A',
      'A2 no reply is not in force',
      ok(() => CR.replyInForce([], null, t(2)) === false)
    );
    assert(
      'A',
      'A3 a reply BEFORE the latest hand-back is not in force — the hand-back started a new chase (note 3)',
      ok(() => CR.replyInForce([t(1)], hb(5), t(6)) === false)
    );
    assert(
      'A',
      'A4 a reply AFTER the hand-back ends that chase too (note 3)',
      ok(() => CR.replyInForce([t(1), t(7)], hb(5), t(8)) === true)
    );
    assert(
      'A',
      'A5 as at `now`: a reply after `now` does not count yet, nor a hand-back after `now`',
      ok(
        () =>
          CR.replyInForce([t(9)], null, t(8)) === false &&
          CR.replyInForce([t(1)], hb(9), t(8)) === true
      )
    );
    {
      const replies = new Map([
        ['pe-carrier', [t(1)]],
        ['pe-back', [t(1)]],
      ]);
      const spend = new Map([['pe-back', { cadenceLength: 2, legs: [], handBack: hb(5) }]]);
      assert(
        'A',
        'A6 replyFactFor: no route → null (the host); NONE → not ended; a CARRIED child reads its carrier; a hand-back since → not ended',
        ok(
          () =>
            CR.replyFactFor(undefined, replies, spend, t(6)) === null &&
            CR.replyFactFor({ kind: 'NONE', why: 'HANDED_TO_HOST' }, replies, spend, t(6)).ended ===
              false &&
            CR.replyFactFor(
              { kind: 'CARRIED', channel: 'TEXT', recipientId: 'pe-carrier' },
              replies,
              spend,
              t(6)
            ).ended === true &&
            CR.replyFactFor(
              { kind: 'DIRECT', channel: 'TEXT', recipientId: 'pe-back' },
              replies,
              spend,
              t(6)
            ).ended === false
        )
      );
    }
    assert(
      'A',
      'A7 chase-reply.ts is pure: no Prisma, no clock of its own',
      ok(() => {
        const src = code('src/lib/chase-reply.ts');
        return src.length > 0 && !/@prisma|prisma\.|new Date\(\)|Date\.now\(/.test(src);
      })
    );
    assert(
      'A',
      'A8 R5 byte-exact, in NZ summer and winter time: "Fri 2 Oct, 2:14pm" and "Tue 16 Jun, 9:05am"',
      ok(
        () =>
          CR.replyWhen(new Date('2026-10-02T01:14:00Z')) === 'Fri 2 Oct, 2:14pm' &&
          CR.replyWhen(new Date('2026-06-15T21:05:00Z')) === 'Tue 16 Jun, 9:05am'
      )
    );

    // ══ LAYER B — the derivation, pure ═════════════════════════════════════════════════════
    const NOW = new Date('2026-09-28T12:00:00.000Z');
    const ev = {
      status: 'CONFIRMING',
      sentAt: new Date(NOW.getTime() - 5 * DAY),
      endDate: new Date(NOW.getTime() + 130 * HOUR),
      decideByOffsetHours: null,
      nudgePace: null,
    };
    const evExpired = { ...ev, endDate: new Date(NOW.getTime() + HOUR) };
    const row = (response: string) => ({
      itemId: `i-${response}`,
      assignmentId: `a-${response}`,
      name: 'pavlova',
      critical: false,
      response,
      kind: 'ITEM',
      teamId: 't',
      quantityAmount: null,
      quantityUnit: null,
      quantityUnitCustom: null,
      item: { dropOffAt: null, decideByOffsetHours: null },
    });
    const replied = { ended: true };
    const P = (o: any = {}) => ({
      isHost: false,
      exhaustion: { exhausted: false },
      delivery: null,
      chase: { standing: null, carrierMarked: false },
      reply: replied,
      nudgeMark: null,
      attendanceAnswer: null,
      items: [],
      ...o,
    });
    const is = (p: any, state: string, reasons: string[], e: any = ev) =>
      ok(() => {
        const d = S.derivePersonState(p, e, NOW);
        return d.state === state && JSON.stringify(d.reasons) === JSON.stringify(reasons);
      });
    assert(
      'B',
      'B1 RED_REASONS carries REPLIED — eight in all',
      ok(() => S.RED_REASONS.length === 8 && S.RED_REASONS.includes('REPLIED'))
    );
    assert(
      'B',
      'B2 a pending row with a reply in force → RED REPLIED',
      is(P({ items: [row('PENDING')] }), 'RED', ['REPLIED'])
    );
    assert(
      'B',
      'B3 CONTROL (Q1): an answered guest with a reply in force stays GREEN',
      is(P({ items: [row('ACCEPTED')] }), 'GREEN', ['ACCEPTED'])
    );
    assert(
      'B',
      'B4 (Q-A) a live maybe with a reply in force → RED REPLIED: the follow-up will not come',
      is(P({ items: [row('MAYBE')] }), 'RED', ['REPLIED'])
    );
    assert(
      'B',
      'B5 CONTROL: an expired maybe stays "maybe timed out"',
      is(P({ items: [row('MAYBE')] }), 'RED', ['DECIDE_BY_EXPIRED'], evExpired)
    );
    assert(
      'B',
      'B6 itemless and unanswered, with a reply in force → RED REPLIED',
      is(P(), 'RED', ['REPLIED'])
    );
    assert(
      'B',
      'B7 CONTROL: an itemless yes stays GREEN',
      is(P({ attendanceAnswer: 'YES' }), 'GREEN', ['ACCEPTED'])
    );
    assert(
      'B',
      'B8 (note 4) replied AND exhausted reads REPLIED, never "gone quiet"',
      is(P({ items: [row('PENDING')], exhaustion: { exhausted: true } }), 'RED', ['REPLIED'])
    );
    assert(
      'B',
      'B9 CONTROL: a message that never arrived still beats a reply — its door can act',
      is(P({ items: [row('PENDING')], delivery: { failure: 'NOT_DELIVERED' } }), 'RED', [
        'NOT_DELIVERED',
      ])
    );
    assert(
      'B',
      'B10 reminders off: a reply still turns the card red (the grey only replaces amber)',
      is(
        P({ items: [row('PENDING')], chase: { standing: 'PACE_OFF', carrierMarked: false } }),
        'RED',
        ['REPLIED']
      )
    );
    assert(
      'B',
      'B11 CONTROL: a reply no longer in force leaves AMBER',
      is(P({ items: [row('PENDING')], reply: { ended: false } }), 'AMBER', ['AWAITING_REPLY'])
    );
    assert(
      'B',
      'B12 CONTROL: the host stays GREEN',
      is(P({ items: [row('PENDING')], isHost: true }), 'GREEN', ['ACCEPTED'])
    );

    // ══ LAYER C — the words ════════════════════════════════════════════════════════════════
    const redPerson = (reasons: string[], o: any = {}) => ({
      state: 'RED',
      reasons,
      items: [],
      householdRole: 'PRIMARY_CONTACT',
      textable: true,
      ...o,
    });
    assert(
      'C',
      'C1 R1 byte-exact: "replied by text"',
      ok(() => SP.whyLineFor(redPerson(['REPLIED'])) === R1)
    );
    assert(
      'C',
      'C2 R2 byte-exact on a child: "reply came in"',
      ok(() => SP.whyLineFor(redPerson(['REPLIED'], { householdRole: 'CHILD' })) === R2)
    );
    assert(
      'C',
      'C3 both lines, as the strip renders them, fit: 16 characters or fewer',
      ok(() =>
        [redPerson(['REPLIED']), redPerson(['REPLIED'], { householdRole: 'CHILD' })].every((p) => {
          const line = SP.whyLineFor(p);
          return typeof line === 'string' && line.length > 0 && line.length <= 16;
        })
      )
    );
    assert(
      'C',
      'C4 (Q-I) on the strip REPLIED speaks before "handed it back"',
      ok(
        () =>
          SP.whyLineFor(
            redPerson(['REVERSAL', 'REPLIED'], {
              items: [{ ...row('DECLINED'), state: 'RED', reason: 'REVERSAL' }],
            })
          ) === R1
      )
    );
    assert(
      'C',
      'C5 R3 byte-exact on a carried child; none without the reason',
      ok(
        () =>
          CR.carriedChildReplyNoteFor({ reasons: ['REPLIED'], carrierName: 'Rua Replies' }) ===
            R3('Rua') &&
          CR.carriedChildReplyNoteFor({
            reasons: ['EXHAUSTED_SILENCE'],
            carrierName: 'Rua Replies',
          }) === null
      )
    );
    assert(
      'C',
      'C6 R4 byte-exact: "Their replies"',
      ok(() => RD.REPLIES_HEADING === R4)
    );
    assert(
      'C',
      'C7a R6 byte-exact: "Not coming" and "You\'re handling them", for a strip opened by its replies',
      ok(
        () =>
          RD.readingStatusWord('OUT', ['ATTENDANCE_NO'], true) === R6_OUT &&
          RD.readingStatusWord('NOT_CHASED', ['DONT_CHASE'], true) === R6_DONT_CHASE
      )
    );
    assert(
      'C',
      'C7b CONTROL: without replies the status word still throws for OUT and the mark',
      ['OUT', 'NOT_CHASED'].every((st) => {
        try {
          RD.readingStatusWord(st, st === 'OUT' ? ['ATTENDANCE_NO'] : ['DONT_CHASE']);
          return false;
        } catch {
          return true;
        }
      })
    );
    assert(
      'C',
      'C8 Q4 byte-exact',
      ok(() => APC.replyToLine('you@example.com') === Q4_LINE)
    );
    assert(
      'C',
      'C9 Q4: the old sentence and its "DO NOT ADD YET" note are gone',
      ok(() => {
        const src = read('src/lib/preflight/ask-preview-compose.ts');
        return src.length > 0 && !/won't reach you/.test(src) && !/DO NOT ADD "YET"/.test(src);
      })
    );
    const privacy = read('src/app/privacy/page.tsx')
      .replace(/&apos;/g, "'")
      .replace(/\s+/g, ' ');
    assert('C', 'C10 Q5 byte-exact on the privacy page', privacy.includes(Q5_BULLET));
    // [[GTC-356]], founder ruling Q12 (2026-10-03): the page moved on again (S5), so the date is
    // pinned as "not before 2 October 2026" — still proving Q5's update reached the page.
    const updated = /Last updated: (\d{1,2} \w+ \d{4})/.exec(privacy)?.[1];
    assert(
      'C',
      'C11 Q5: the old bullet is gone, and "Last updated" is not before 2 October 2026',
      privacy.length > 0 &&
        !privacy.includes('we keep your reply with the event it was about') &&
        !!updated &&
        new Date(`${updated} 00:00 UTC`).getTime() >= Date.UTC(2026, 9, 2)
    );
    const withReplies = [{ words: 'x', when: 'Fri 2 Oct, 2:14pm' }];
    assert(
      'C',
      'C12a (Q-G) an OUT strip with replies opens the reading room',
      ok(
        () =>
          SP.panelFor({ state: 'OUT', reasons: ['ATTENDANCE_NO'], replies: withReplies }) ===
          'reading'
      )
    );
    assert(
      'C',
      'C12b CONTROL: an OUT strip without replies stays sealed (Rulings 7 and 32)',
      ok(() => SP.panelFor({ state: 'OUT', reasons: ['ATTENDANCE_NO'], replies: [] }) === null)
    );
    assert(
      'C',
      "C13a (Q-G) a don't-chase strip with replies opens the reading room",
      ok(
        () =>
          SP.panelFor({ state: 'NOT_CHASED', reasons: ['DONT_CHASE'], replies: withReplies }) ===
          'reading'
      )
    );
    assert(
      'C',
      "C13b CONTROL: a don't-chase strip without replies stays sealed (Ruling 17)",
      ok(() => SP.panelFor({ state: 'NOT_CHASED', reasons: ['DONT_CHASE'], replies: [] }) === null)
    );
    assert(
      'C',
      'C14 (Q-D) the leads: "gone quiet" keeps W2\'s, a reply reads "Want me to carry on nudging them?"',
      ok(
        () =>
          AC.HAND_BACK_LEAD === W2_LEAD &&
          AC.HAND_BACK_LEAD_REPLIED === LEAD_REPLIED &&
          AC.handBackLeadFor(redPerson(['EXHAUSTED_SILENCE'])) === W2_LEAD &&
          AC.handBackLeadFor(redPerson(['REPLIED'])) === LEAD_REPLIED
      )
    );
    assert(
      'C',
      'C15 (Q-D, fix 1) the choices: pending → 1, 2, 3; only a maybe → 1; reminders off → 1 if a follow-up still comes, else none',
      ok(() => {
        const ch = (o: any) =>
          JSON.stringify(
            CR.handBackChoicesFor({
              state: 'RED',
              reasons: ['REPLIED'],
              paceOff: false,
              unanswered: false,
              followUpOwed: false,
              ...o,
            })
          );
        return (
          ch({ unanswered: true }) === '[1,2,3]' &&
          ch({ unanswered: true, followUpOwed: true }) === '[1,2,3]' &&
          ch({ followUpOwed: true }) === '[1]' &&
          ch({}) === '[]' &&
          ch({ paceOff: true, unanswered: true }) === '[]' &&
          ch({ paceOff: true, unanswered: true, followUpOwed: true }) === '[1]' &&
          ch({ reasons: ['EXHAUSTED_SILENCE'], unanswered: true }) === '[1,2,3]' &&
          ch({ state: 'AMBER', unanswered: true }) === '[]'
        );
      })
    );

    // ══ Fixture ════════════════════════════════════════════════════════════════════════════
    const T = new Date();
    const stamp = Date.now();
    let phoneSeq = 0;
    const phone = () => {
      const n = `+6421${String((stamp + phoneSeq++ * 7919) % 10_000_000).padStart(7, '0')}`;
      phones.push(n);
      return n;
    };
    const user = await prisma.user.create({
      data: { email: `gtc350+host+${stamp}@example.test` },
    });
    created.users.push(user.id);
    const host = await prisma.person.create({
      data: { name: 'Hana Host', email: user.email, userId: user.id },
    });
    created.persons.push(host.id);

    async function makeEvent(name: string, nudgePace: string | null) {
      const endDate = new Date(T.getTime() + 130 * HOUR);
      const e = await prisma.event.create({
        data: {
          name: `${TAG} ${name}`,
          startDate: endDate,
          endDate,
          hostId: host.id,
          status: 'CONFIRMING',
          sentAt: new Date(T.getTime() - 5 * DAY),
          ...(nudgePace ? { nudgePace: nudgePace as any } : {}),
        },
      });
      created.events.push(e.id);
      await prisma.eventRole.create({ data: { eventId: e.id, userId: user.id, role: 'HOST' } });
      await prisma.personEvent.create({ data: { personId: host.id, eventId: e.id, role: 'HOST' } });
      const team = await prisma.team.create({ data: { name: 'Mains', eventId: e.id } });
      return { e, team };
    }
    const E1 = await makeEvent('Christmas', null);
    const E2 = await makeEvent('Reminders off', 'OFF');

    async function guest(
      where: { e: { id: string; sentAt: Date | null }; team: { id: string } },
      name: string,
      o: {
        response?: string | null;
        householdId?: string;
        householdRole?: string;
        attendanceAnswer?: string;
        noPhone?: boolean;
        followUpSent?: boolean;
      } = {}
    ) {
      const first = name.split(' ')[0].toLowerCase();
      const ph = o.noPhone ? null : phone();
      const p = await prisma.person.create({ data: { name, email: null, phoneNumber: ph } });
      created.persons.push(p.id);
      const pe = await prisma.personEvent.create({
        data: {
          personId: p.id,
          eventId: where.e.id,
          role: 'PARTICIPANT',
          sentAt: where.e.sentAt,
          householdId: o.householdId ?? null,
          householdRole: (o.householdRole ?? null) as any,
          attendanceAnswer: (o.attendanceAnswer ?? null) as any,
        },
      });
      if (o.response !== null) {
        const item = await prisma.item.create({
          data: { name: `${first}'s pavlova`, teamId: where.team.id, kind: 'ITEM' },
        });
        // createdAt at the press: a row born after the replay's `since` reads as absent then.
        await prisma.assignment.create({
          data: {
            itemId: item.id,
            personId: p.id,
            response: (o.response ?? 'PENDING') as any,
            createdAt: where.e.sentAt!,
            decideByFollowupSentAt: o.followUpSent ? where.e.sentAt! : null,
          },
        });
      }
      await prisma.accessToken.create({
        data: {
          token: `${TAG}-${pe.id}`,
          scope: 'PARTICIPANT',
          eventId: where.e.id,
          personId: p.id,
        },
      });
      if (ph) {
        await prisma.outboundMessage.create({
          data: {
            eventId: where.e.id,
            personEventId: pe.id,
            kind: 'ASK',
            channel: 'TEXT',
            createdAt: where.e.sentAt!,
            attemptedAt: where.e.sentAt!,
            attemptCount: 1,
            acceptedAt: where.e.sentAt!,
            provider: 'tnz',
            providerMessageId: `${TAG}-${stamp}-ask-${pe.id}`,
            destination: ph,
          } as any,
        });
      }
      return { p, pe, phone: ph };
    }
    const reply = (g: { p: { id: string } }, eventId: string, words: string, at: Date) =>
      (prisma as any).textReply.create({
        data: {
          provider: 'tnz',
          providerMessageId: `${TAG}-${stamp}-${Math.random()}`,
          body: words,
          receivedAt: at,
          eventId,
          personId: g.p.id,
        },
      });

    const hh = await prisma.household.create({ data: { eventId: E1.e.id } });
    const rua = await guest(E1, 'Rua Replies', {
      householdId: hh.id,
      householdRole: 'PRIMARY_CONTACT',
    });
    await prisma.household.update({
      where: { id: hh.id },
      data: { contactPersonEventId: rua.pe.id },
    });
    const kid = await guest(E1, 'Kid Carried', {
      householdId: hh.id,
      householdRole: 'CHILD',
      noPhone: true,
    });
    const gil = await guest(E1, 'Gil Green', { response: 'ACCEPTED' });
    const ama = await guest(E1, 'Ama Amber');
    const ola = await guest(E1, 'Ola Out', { response: null, attendanceAnswer: 'NO' });
    const may = await guest(E1, 'May Maybe', { response: 'MAYBE' });
    const mo = await guest(E1, 'Mo Maybe', { response: 'MAYBE' });
    const pia = await guest(E2, 'Pia Paceoff');
    const max = await guest(E2, 'Max Maybe', { response: 'MAYBE' });
    // A maybe whose one follow-up has already gone, then a reply — reminders on, and reminders off.
    const fen = await guest(E1, 'Fen Followedup', { response: 'MAYBE', followUpSent: true });
    const faye = await guest(E2, 'Faye Followedup', { response: 'MAYBE', followUpSent: true });

    const RUA_OLD = 'Running late with the RSVP, sorry';
    const RUA_NEW = 'Can I bring my partner?';
    // D0's reply goes through GTC-288's own recorder; its time is then set so the fixture is exact.
    const parsed = TRC.parseTnzReply
      ? TRC.parseTnzReply({
          Message: RUA_OLD,
          Destination: rua.phone,
          MessageID: `${TAG}-${stamp}-ask-${rua.pe.id}`,
          ReceivedID: `${TAG}-${stamp}-rcv-1`,
        })
      : { ok: false };
    const kept = parsed.ok ? await TRR.recordTnzReply(prisma, parsed.reply) : null;
    await (prisma as any).textReply.updateMany({
      where: { providerReceivedId: `${TAG}-${stamp}-rcv-1` },
      data: { receivedAt: new Date(T.getTime() - 26 * HOUR) },
    });
    await reply(rua, E1.e.id, RUA_NEW, new Date(T.getTime() - 2 * HOUR));
    await reply(gil, E1.e.id, 'See you there!', new Date(T.getTime() - 3 * HOUR));
    await reply(ola, E1.e.id, "Can't make it, sorry", new Date(T.getTime() - 4 * HOUR));
    await reply(may, E1.e.id, "I'll know on Friday", new Date(T.getTime() - 5 * HOUR));
    await reply(pia, E2.e.id, 'Is it at yours?', new Date(T.getTime() - 6 * HOUR));
    await reply(max, E2.e.id, 'Might be away', new Date(T.getTime() - 7 * HOUR));
    await reply(fen, E1.e.id, 'Still not sure', new Date(T.getTime() - 8 * HOUR));
    await reply(faye, E2.e.id, 'Still thinking', new Date(T.getTime() - 9 * HOUR));

    const people = (g: any) => [...g.households.flatMap((h: any) => h.members), ...g.unhoused];
    const boardAt = async (eventId: string, at: Date, opts?: any) => {
      try {
        return opts
          ? await R.readEventGlance(prisma, eventId, at, opts)
          : await R.readEventGlance(prisma, eventId, at);
      } catch {
        return null;
      }
    };
    const find = (g: any, m: any) =>
      g ? (people(g).find((x: any) => x.personEventId === m.pe.id) ?? null) : null;

    // ══ LAYER D — the board ════════════════════════════════════════════════════════════════
    assert(
      'D',
      "D0 CONTROL: Rua's first reply is KEPT by GTC-288's own recorder, and opts nobody out",
      kept?.outcome === 'KEPT' &&
        (await prisma.smsOptOut.count({ where: { phoneNumber: rua.phone! } })) === 0
    );
    const g1 = await boardAt(E1.e.id, T, { replies: true });
    const R_ = find(g1, rua);
    assert(
      'D',
      'D1 Rua reads RED REPLIED, with R1 on her strip',
      ok(() => R_.state === 'RED' && R_.reasons.includes('REPLIED') && SP.whyLineFor(R_) === R1)
    );
    assert(
      'D',
      'D2 her replies: newest first, in her words, each with when it came (R5)',
      ok(
        () =>
          JSON.stringify(R_.replies) ===
          JSON.stringify([
            { words: RUA_NEW, when: r5(new Date(T.getTime() - 2 * HOUR)) },
            { words: RUA_OLD, when: r5(new Date(T.getTime() - 26 * HOUR)) },
          ])
      ),
      JSON.stringify(R_?.replies)
    );
    assert(
      'D',
      'D3 a reply carries exactly two keys, `when` and `words`',
      ok(
        () =>
          R_.replies.length === 2 &&
          people(g1).every((p: any) =>
            p.replies.every(
              (r: any) => JSON.stringify(Object.keys(r).sort()) === '["when","words"]'
            )
          )
      )
    );
    const keys = g1 ? collectKeys(g1) : new Set<string>();
    assert(
      'D',
      'D4 THE FENCE, AT RUNTIME: no reply-fence name and no behaviour name anywhere in the payload — CONTROL: her newest words ARE in it',
      g1 !== null &&
        JSON.stringify(g1).includes(RUA_NEW) &&
        [...REPLY_FENCE_DENYLIST, ...BEHAVIOUR_DENYLIST].every((n) => !keys.has(n)),
      [...REPLY_FENCE_DENYLIST, ...BEHAVIOUR_DENYLIST].filter((n) => keys.has(n)).join(', ')
    );
    assert(
      'D',
      'D5 no ISO-shaped string and no epoch-shaped number inside any replies list',
      ok(() => {
        const all = people(g1).flatMap((p: any) => p.replies ?? []);
        const s = JSON.stringify(all);
        return (
          all.length >= 2 &&
          all.every((r: any) => typeof r?.words === 'string') &&
          !/\d{4}-\d{2}-\d{2}T/.test(s) &&
          !/\b\d{13,}\b/.test(s)
        );
      })
    );
    const G_ = find(g1, gil);
    assert(
      'D',
      'D6 Gil answered: GREEN, and his reading room shows his reply under R4',
      ok(
        () =>
          G_.state === 'GREEN' &&
          SP.panelFor(G_) === 'reading' &&
          JSON.stringify(RD.readingPanelFor(G_, T).replies.map((r: any) => r.words)) ===
            '["See you there!"]'
      )
    );
    assert(
      'D',
      'D7 CONTROL: Ama, no reply, reads AMBER and carries no reply',
      ok(() => find(g1, ama).state === 'AMBER' && !(find(g1, ama).replies?.length > 0))
    );
    const K_ = find(g1, kid);
    assert(
      'D',
      "D8 Kid, carried by Rua: RED REPLIED with R2 and R3 on the card, and no replies of the child's own",
      ok(
        () =>
          K_.state === 'RED' &&
          K_.reasons.includes('REPLIED') &&
          SP.whyLineFor(K_) === R2 &&
          K_.carrierNote === R3('Rua') &&
          K_.replies.length === 0
      )
    );
    const O_ = find(g1, ola);
    assert(
      'D',
      'D9 Ola said she cannot come: OUT, and her strip opens the reading room with her reply and "Not coming"',
      ok(
        () =>
          O_.state === 'OUT' &&
          SP.panelFor(O_) === 'reading' &&
          RD.readingPanelFor(O_, T).status === R6_OUT &&
          RD.readingPanelFor(O_, T).replies.length === 1
      )
    );
    const g1bare = await boardAt(E1.e.id, T);
    assert(
      'D',
      'D10 (Q-F) without the host option every replies list is empty — and Rua is still RED REPLIED',
      ok(
        () =>
          people(g1bare).every((p: any) => Array.isArray(p.replies) && p.replies.length === 0) &&
          find(g1bare, rua).state === 'RED' &&
          find(g1bare, rua).reasons.includes('REPLIED')
      )
    );
    assert(
      'D',
      'D11 (Q-F) the page asks for the words only for the HOST',
      /readEventGlance\([^;]*replies:\s*auth\.role\s*===\s*'HOST'/.test(
        code('src/app/plan/[eventId]/glance/page.tsx')
      )
    );
    const M_ = find(g1, may);
    assert(
      'D',
      'D12 (Q-D) the doors: Rua 1, 2 or 3; May, whose only open answer is a maybe, 1 only, with the replied lead; Gil and Ama none',
      ok(
        () =>
          JSON.stringify(R_.handBackChoices) === '[1,2,3]' &&
          M_.state === 'RED' &&
          M_.reasons.includes('REPLIED') &&
          JSON.stringify(M_.handBackChoices) === '[1]' &&
          AC.handBackOffered(M_) === true &&
          AC.handBackLeadFor(M_) === LEAD_REPLIED &&
          JSON.stringify(G_.handBackChoices) === '[]' &&
          JSON.stringify(find(g1, ama).handBackChoices) === '[]'
      )
    );
    assert(
      'D',
      'D13 CONTROL: Mo, a maybe with no reply, is AMBER MAYBE_LIVE',
      ok(() => find(g1, mo).state === 'AMBER' && find(g1, mo).reasons.includes('MAYBE_LIVE'))
    );

    // ══ LAYER G — the replay ═══════════════════════════════════════════════════════════════
    const glanceEvent = {
      status: 'CONFIRMING',
      sentAt: E1.e.sentAt,
      endDate: E1.e.endDate,
      decideByOffsetHours: null,
      nudgePace: null,
    };
    const replayAt = async (since: Date) => {
      try {
        return await RE.readGlanceReplay(prisma, E1.e.id, since, g1, glanceEvent, T);
      } catch (err) {
        console.error(`    replay threw: ${(err as Error).message.split('\n')[0]}`);
        return null;
      }
    };
    const early = await replayAt(new Date(T.getTime() - 30 * HOUR));
    const ruaStep = early?.steps?.find((s: any) => s.personEventId === rua.pe.id) ?? null;
    assert(
      'G',
      'G1 (note 7) away before her first reply: Rua plays once, AMBER → RED',
      ok(() => ruaStep.from === 'AMBER' && ruaStep.to === 'RED')
    );
    assert(
      'G',
      'G2 the step is exactly four keys and carries no time',
      ok(
        () =>
          JSON.stringify(Object.keys(ruaStep).sort()) ===
          JSON.stringify(['from', 'personEventId', 'spark', 'to'])
      )
    );
    const late = await replayAt(new Date(T.getTime() - HOUR));
    assert(
      'G',
      'G3 away only after her latest reply: nothing plays for Rua (gated on G1)',
      ruaStep !== null && ok(() => !late.steps.some((s: any) => s.personEventId === rua.pe.id))
    );
    assert(
      'G',
      'G4 CONTROL: Gil, green at both ends, plays nothing',
      ok(() => !early.steps.some((s: any) => s.personEventId === gil.pe.id))
    );

    // ══ LAYER E — the chase stops ══════════════════════════════════════════════════════════
    const sweep = async (at: Date) => {
      try {
        return await ELIG.findNudgeCandidatesForEvent(E1.e.id, at);
      } catch {
        return null;
      }
    };
    const inList = (r: any, list: string, m: any) =>
      !!r?.[list]?.some((c: any) => c.personEventId === m.pe.id);
    const anyLeg = (r: any, m: any) =>
      ['eligibleFirst', 'eligibleSecond', 'eligibleMore'].some((l) => inList(r, l, m));
    const s1 = await sweep(T);
    assert(
      'E',
      'E1 the sweep at day 5: Rua is not queued and the skip is recorded; CONTROL Ama is due her first',
      s1 !== null &&
        !anyLeg(s1, rua) &&
        inList(s1, 'eligibleFirst', ama) &&
        s1.skipped.some((s: any) => s.reason === CR.REPLIED_SKIP_REASON)
    );

    // A reminder queued for Rua before the drain, then the drain — guarded (Q-J).
    const queued = await prisma.outboundMessage.create({
      data: {
        eventId: E1.e.id,
        personEventId: rua.pe.id,
        kind: 'CHASE_FIRST',
        channel: 'TEXT',
        createdAt: new Date(T.getTime() - HOUR),
      },
    });
    const outside = await prisma.outboundMessage.count({
      where: {
        eventId: { notIn: created.events },
        OR: [
          { attemptedAt: null, withheldAt: null },
          { nextAttemptAt: { not: null, lte: new Date() } },
        ],
      },
    });
    assert(
      'E',
      "E2 PRECONDITION (Q-J): zero drain rows outside this file's events — else the drain is not driven",
      outside === 0,
      `${outside} outside`
    );
    if (outside === 0 && DIS.drainOnce) await DIS.drainOnce(prisma, 500, new Date());
    const after = await prisma.outboundMessage.findUnique({ where: { id: queued.id } });
    assert(
      'E',
      'E3 the reminder queued before the drain is withheld REPLIED, and never attempted',
      after?.withheldWhy === 'REPLIED' && after?.attemptedAt === null,
      JSON.stringify({ why: after?.withheldWhy, attempted: after?.attemptedAt })
    );
    let dbe: any = null;
    try {
      dbe = await DBE.findDecideByFollowupCandidates(T);
    } catch {
      dbe = null;
    }
    const due = (m: any) =>
      !!dbe?.eligible?.some((c: any) => c.personId === m.p.id && c.eventId === E1.e.id);
    assert(
      'E',
      'E4 (Q-A) the decide-by follow-up: May, who replied, is skipped and recorded; CONTROL Mo is due',
      dbe !== null &&
        !due(may) &&
        due(mo) &&
        dbe.skipped.some((s: any) => s.reason === CR.REPLIED_SKIP_REASON)
    );
    assert(
      'E',
      'E5 ZONE 7 UNWRITTEN: no SmsOptOut row and no opted-out flag for any fixture number',
      (await prisma.smsOptOut.count({ where: { phoneNumber: { in: phones } } })) === 0 &&
        (await prisma.person.count({
          where: { id: { in: created.persons }, smsOptedOut: true },
        })) === 0
    );

    // ══ LAYER F — the hand-back ════════════════════════════════════════════════════════════
    const handBack = (m: any, n: number, at: Date, eventId = E1.e.id) =>
      HB.handBackPerson
        ? HB.handBackPerson(prisma, { eventId, personId: m.p.id, reminders: n, now: at }).catch(
            () => null
          )
        : Promise.resolve(null);
    const cols = (m: any) =>
      prisma.personEvent.findUnique({
        where: { id: m.pe.id },
        select: { handBackReminders: true, handedBackAt: true },
      });
    assert(
      'F',
      'F1 the hand-back is offered on REPLIED',
      ok(() => AC.handBackOffered({ state: 'RED', reasons: ['REPLIED'] }) === true)
    );
    const TH = new Date(T.getTime() + 10 * MIN);
    const f2 = await handBack(rua, 2, TH);
    const f2cols = await cols(rua);
    const f2ok =
      f2?.ok === true &&
      f2cols?.handBackReminders === 2 &&
      f2cols?.handedBackAt?.getTime() === TH.getTime();
    assert(
      'F',
      'F2 Rua is handed back with 2: both columns written on her membership',
      f2ok,
      JSON.stringify(f2)
    );
    const T11 = new Date(T.getTime() + 11 * MIN);
    const f3 = find(await boardAt(E1.e.id, T11), rua);
    assert(
      'F',
      'F3 Rua reads AMBER again (her replies came before the hand-back), with a nudge day',
      f2ok && ok(() => f3.state === 'AMBER' && f3.nextNudgeAt !== null)
    );
    const s2 = await sweep(T11);
    assert(
      'F',
      'F4 the sweep queues ONE further reminder for her — no first and no second leg',
      f2ok &&
        inList(s2, 'eligibleMore', rua) &&
        !inList(s2, 'eligibleFirst', rua) &&
        !inList(s2, 'eligibleSecond', rua)
    );
    await prisma.outboundMessage.create({
      data: {
        eventId: E1.e.id,
        personEventId: rua.pe.id,
        kind: 'CHASE_MORE' as any,
        channel: 'TEXT',
        createdAt: T11,
        attemptedAt: T11,
        attemptCount: 1,
        acceptedAt: T11,
        provider: 'tnz',
        providerMessageId: `${TAG}-${stamp}-more-1`,
      },
    });
    const s3 = await sweep(new Date(T.getTime() + 60 * HOUR));
    assert(
      'F',
      "F5 (Q-C) at day 7½ the cadence's second leg does NOT go — the hand-back's count is all Gather sends",
      f2ok && s3 !== null && !anyLeg(s3, rua)
    );
    {
      const leg = (kind: string, h: number) => ({ kind, createdAt: t(h), spentAt: t(h) });
      const sp = {
        cadenceLength: 2,
        legs: [leg('CHASE_FIRST', 96), leg('CHASE_MORE', 120)],
        handBack: hb(119),
      };
      assert(
        'F',
        'F6 (Q-C) pure: 72 hours after the last further reminder the chase is spent, though the second leg was never sent — CONTROL not at 71',
        ok(
          () =>
            CE.isChaseExhausted(sp, t(120 + 73)) === true &&
            CE.isChaseExhausted(sp, t(120 + 71)) === false
        )
      );
    }
    await reply(rua, E1.e.id, 'Actually, can I bring a salad?', new Date(T.getTime() + 20 * MIN));
    const T21 = new Date(T.getTime() + 21 * MIN);
    const f7 = find(await boardAt(E1.e.id, T21), rua);
    const s4 = await sweep(T21);
    assert(
      'F',
      'F7 (note 3) a reply AFTER the hand-back ends that chase: RED REPLIED again, and not queued',
      f2ok && ok(() => f7.state === 'RED' && f7.reasons.includes('REPLIED')) && !anyLeg(s4, rua)
    );
    const T25 = new Date(T.getTime() + 25 * MIN);
    const f8 = await handBack(kid, 1, T25);
    const f8cols = await cols(rua);
    assert(
      'F',
      "F8 a child's hand-back is written on the carrier, Rua",
      f8?.ok === true &&
        f8cols?.handBackReminders === 1 &&
        f8cols?.handedBackAt?.getTime() === T25.getTime()
    );
    const f9 = await handBack(ama, 1, T25);
    assert(
      'F',
      "F9 CONTROL: an AMBER guest is still refused 409 with W2's refusal",
      ok(() => f9.ok === false && f9.status === 409 && f9.error === W2_REFUSED)
    );

    // ══ LAYER P — reminders off: no dead door (plan fix 1) ═════════════════════════════════
    const g2 = await boardAt(E2.e.id, T, { replies: true });
    const Pi = find(g2, pia);
    const piaRed = ok(() => Pi.state === 'RED' && Pi.reasons.includes('REPLIED'));
    assert(
      'P',
      'P1 Pia, pending, replied, reminders off: RED REPLIED with NO door — nothing would ever be sent',
      piaRed &&
        ok(() => JSON.stringify(Pi.handBackChoices) === '[]' && AC.handBackOffered(Pi) === false)
    );
    assert(
      'P',
      "P2 and her RED room says why, in the existing words (gated on P1's red — a grey already carries them)",
      piaRed &&
        ok(() => Pi.chaseNote === PACE_OFF_WORDS && CF.PACE_OFF_CHASE_NOTE === PACE_OFF_WORDS)
    );
    const p3 = await handBack(pia, 1, T, E2.e.id);
    assert(
      'P',
      "P3 the server agrees: handing Pia back is refused 409 with W2's refusal (gated on P1's red)",
      piaRed && ok(() => p3.ok === false && p3.status === 409 && p3.error === W2_REFUSED)
    );
    const Mx = find(g2, max);
    const maxRed = ok(() => Mx.state === 'RED' && Mx.reasons.includes('REPLIED'));
    assert(
      'P',
      'P4 Max, a maybe, replied, reminders off: RED, and the door offers "1 more nudge" only — his follow-up still comes',
      maxRed &&
        ok(() => JSON.stringify(Mx.handBackChoices) === '[1]' && AC.handBackOffered(Mx) === true)
    );
    const p5a = await handBack(max, 2, T, E2.e.id);
    const p5b = await handBack(max, 1, new Date(T.getTime() + MIN), E2.e.id);
    assert(
      'P',
      'P5 the server agrees: Max with 2 is refused 409; with 1 he is handed back',
      maxRed &&
        ok(() => p5a.ok === false && p5a.status === 409 && p5a.error === W2_REFUSED) &&
        p5b?.ok === true
    );

    {
      const Fe = find(g1, fen);
      const Fy = find(g2, faye);
      assert(
        'P',
        'P6 (ruling on the RED report) a maybe whose one follow-up has gone, then replied: RED, no door, and the room says why — byte-exact, with reminders on AND with them off, where this sentence and not the reminders-off one is shown',
        ok(() =>
          [Fe, Fy].every(
            (p: any) =>
              p.state === 'RED' &&
              p.reasons.includes('REPLIED') &&
              JSON.stringify(p.handBackChoices) === '[]' &&
              AC.handBackOffered(p) === false &&
              p.chaseNote === FOLLOW_UP_SPENT_WORDS
          )
        ),
        JSON.stringify([Fe, Fy].map((p: any) => p && [p.state, p.reasons, p.chaseNote]))
      );
    }

    // ══ LAYER L — the live poll carries the words to the host's room (plan fix 2) ══════════
    assert(
      'L',
      'L1 repliesOf maps every person on a polled board to their replies, housed and unhoused',
      ok(() => {
        const m = LV.repliesOf(g1);
        return (
          JSON.stringify(m[rua.pe.id]) === JSON.stringify(R_.replies) &&
          Array.isArray(m[ama.pe.id]) &&
          m[ama.pe.id].length === 0 &&
          typeof LV.GLANCE_REPLIES_EVENT === 'string'
        );
      })
    );
    const liveIsland = code('src/components/glance/GlanceLive.tsx');
    assert(
      'L',
      "L2 the live island hands every polled board's replies to the rooms, by event",
      /dispatchEvent\(\s*new CustomEvent\(\s*GLANCE_REPLIES_EVENT\s*,\s*\{\s*detail:\s*repliesOf\(glance\)/.test(
        liveIsland
      )
    );
    const rooms = [
      code('src/components/glance/PersonSurface.tsx'),
      code('src/components/glance/GlancePersonReading.tsx'),
    ];
    assert(
      'L',
      "L3 both rooms listen for it, take their own person's replies, and stop listening on close",
      rooms.every(
        (src) =>
          /addEventListener\(\s*GLANCE_REPLIES_EVENT/.test(src) &&
          /removeEventListener\(\s*GLANCE_REPLIES_EVENT/.test(src) &&
          /liveReplies/.test(src)
      )
    );
    assert(
      'L',
      'L4 (Q-F) the poll carries words only for the HOST',
      /readEventGlance\([^;]*replies:\s*auth\.role\s*===\s*'HOST'/.test(
        code('src/app/api/events/[id]/glance/route.ts')
      )
    );

    // ══ LAYER S — structure and fences ═════════════════════════════════════════════════════
    const readSrc = code('src/lib/glance/read.ts');
    assert(
      'S',
      'S1 read.ts takes the decision from replyFactFor and the words from the reader, and names no reply row or instant',
      /replyFactFor\(/.test(readSrc) &&
        /readReplyFacts\(/.test(readSrc) &&
        !/\btextReply\b|\bTextReply\b|\breceivedAt\b/.test(readSrc)
    );
    {
      const dis = code('src/lib/press/dispatch.ts');
      const body = dis.slice(dis.indexOf('async function drainChaseRow'));
      const a = body.indexOf("withhold('ANSWERED')");
      const r = body.indexOf("withhold('REPLIED')");
      assert(
        'S',
        'S2 the drain withholds REPLIED straight after ANSWERED — an answer is the stronger fact',
        a > 0 && r > a
      );
    }
    assert(
      'S',
      'S3 REPLIED is terminal, does not count against send health, and does not mean unreachable',
      ok(
        () =>
          DIS.WITHHELD_WHY_IS_TERMINAL.REPLIED === true &&
          DIS.WITHHELD_COUNTS_FOR_HEALTH.REPLIED === false &&
          DF.WITHHELD_MEANS_UNREACHABLE.REPLIED === null
      )
    );
    assert(
      'S',
      'S4 one predicate: the sweep, the drain and the decide-by finder ask chase-reply, and record its skip',
      ['src/lib/sms/nudge-eligibility.ts', 'src/lib/sms/decide-by-eligibility.ts'].every((f) =>
        /REPLIED_SKIP_REASON/.test(code(f))
      ) &&
        [
          'src/lib/sms/nudge-eligibility.ts',
          'src/lib/sms/decide-by-eligibility.ts',
          'src/lib/press/dispatch.ts',
        ].every((f) => /replyInForce\(|readReplyInForce\(/.test(code(f)))
    );
    assert(
      'S',
      'S5 ZONES 7 AND 9 AND THE SCHEMA ARE UNEDITED',
      quiet([
        'prisma/',
        'src/lib/sms/opt-out-service.ts',
        'src/lib/sms/opt-out-keywords.ts',
        'src/lib/eligibility/email-opt-out.ts',
        'src/lib/eligibility/email-block.ts',
      ])
    );
    assert(
      'S',
      "S6 GTC-288's recorder, contract and webhook route are unedited",
      quiet([
        'src/lib/sms/tnz-reply-record.ts',
        'src/lib/sms/tnz-reply-contract.ts',
        'src/app/api/sms/tnz-webhook/route.ts',
      ])
    );
    assert(
      'S',
      'S7 nudge-cadence.ts is unedited (chase-channel G)',
      quiet(['src/lib/nudge-cadence.ts'])
    );
    assert(
      'S',
      'S8 (Q-J) the constants file lists test:reply-board among the dispatcher callers, guarded, with its precondition',
      /test:reply-board[^\n]*guarded/i.test(read('GATHER-BUILD-CONSTANTS.md'))
    );
    assert(
      'S',
      "S9 NOTHING LEFT THE PROCESS: no trap hit, no request but the stub's",
      trapCount() === 0 && nonStubCalls === 0,
      `trap ${trapCount()}, other ${nonStubCalls}`
    );
  } finally {
    globalThis.fetch = realFetch;
    await prisma.inviteEvent.deleteMany({ where: { eventId: { in: created.events } } });
    await prisma.outboundMessage.deleteMany({ where: { eventId: { in: created.events } } });
    await (prisma as any).textReply
      .deleteMany({ where: { eventId: { in: created.events } } })
      .catch(() => null);
    await prisma.accessToken.deleteMany({ where: { eventId: { in: created.events } } });
    await prisma.assignment.deleteMany({
      where: { item: { team: { eventId: { in: created.events } } } },
    });
    await prisma.event.deleteMany({ where: { id: { in: created.events } } });
    await prisma.person.deleteMany({ where: { id: { in: created.persons } } });
    await prisma.user.deleteMany({ where: { id: { in: created.users } } });
    const left =
      (await prisma.event.count({ where: { id: { in: created.events } } })) +
      (await prisma.person.count({ where: { id: { in: created.persons } } })) +
      (await prisma.user.count({ where: { id: { in: created.users } } }));
    const end = {
      outbound: await prisma.outboundMessage.count(),
      inviteEvents: await prisma.inviteEvent.count(),
      optOuts: await prisma.smsOptOut.count(),
    };
    assert('Z', 'teardown: nothing of this fixture is left, by id', left === 0, `${left} left`);
    assert(
      'Z',
      'teardown: OutboundMessage, InviteEvent and SmsOptOut counts are as found',
      end.outbound === before.outbound &&
        end.inviteEvents === before.inviteEvents &&
        end.optOuts === before.optOuts,
      `${JSON.stringify(before)} → ${JSON.stringify(end)}`
    );
    await prisma.$disconnect();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('RED:');
    for (const x of redAssertions) console.log(`  ${x}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
