/**
 * GTC-251 slice 251c — the hand-back: from "gone quiet", 1, 2 or 3 more reminders.
 *
 * Founder rulings: Q3 (2026-09-29) — *"The first goes out next, the rest three days apart, and three
 * days after the last they turn red again if still silent. The cap stops a guest being pestered."*;
 * 4.1 (storage: `PersonEvent.handBackReminders` / `handedBackAt`, and `CHASE_MORE`); 4.4 (the same
 * sweep, chooser and drain; one reminder per run; every mark and opt-out still wins); 4.6 (the
 * panel; no lifetime cap); W2, W3, W4; the new route with Zone 6's route pins moved (2026-09-30).
 *
 * THE LAYERS:
 *  A. the pure due rule — `handBackLegDue`, `nextHandBackLegAt`
 *  B. the words — W3 (email) and W4 (text), byte-exact; the two ruled legs unchanged
 *  C. the surface — `handBackOffered`, the W2 words, the action's request, the panel's guard
 *  D. the server — `handBackPerson`: refusals, the write, the carrier, nothing queued
 *  E. end to end — sweep, queue, drain, the 72-hour spacing, red again, a second hand-back
 *  F. the fences — the mark, pace OFF, an answer, an email opt-out and a block each stop a leg
 *  G. Zone 5 — the migration as approved
 *  S. structure
 *
 * NOTHING IS SENT. `liveBehindTrap` walls the process; Resend's request lands on a stub here; no
 * SMS provider is configured. No cron route is called: the scheduler and the drain are called in
 * process on this file's own event only. Every row is this file's own, removed by id.
 *
 * Run: npx tsx tests/hand-back-test.ts
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync, readdirSync } from 'fs';
import { execFileSync } from 'child_process';
import { join } from 'path';
import { liveBehindTrap, trapCount } from './helpers/provider-trap';

const prisma = new PrismaClient();
const ROOT = join(__dirname, '..');
const TAG = 'GTC251C';
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const BASE = process.env.GATHER_TEST_BASE_URL || 'http://localhost:3000';

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

// The ruled words, typed here so a changed constant fails rather than agreeing with itself.
const W2_LEAD = 'Want me to keep trying?';
const W2_CHOICES = ['1 more reminder', '2 more reminders', '3 more reminders'];
const W2_DONE = "Handed back. I'll send the next one soon.";
const W2_REFUSED = 'The board is catching up.';

type Sent = { to: string[]; subject: string; text: string };
let sent: Sent[] = [];
let nonResendCalls = 0;
const realFetch = globalThis.fetch;
function stub() {
  globalThis.fetch = (async (url: unknown, init?: { body?: string }) => {
    const u = String(url);
    if (u.includes('resend')) {
      const body = JSON.parse(init?.body ?? '{}');
      sent.push({ to: [body.to ?? []].flat(), subject: body.subject, text: body.text });
      return new Response(JSON.stringify({ id: `${TAG}-${sent.length}-${Date.now()}` }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (u.startsWith(BASE)) return realFetch(url as any, init as any);
    nonResendCalls++;
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
  const CE: any = await load('../src/lib/chase-exhaustion');
  const REG: any = await load('../src/lib/messages/chase-register');
  const AC: any = await load('../src/lib/glance/actions');
  // A missing module fails each call as an assertion, never the run — RED and GREEN in one file.
  const HB: any = (await load('../src/lib/chase-hand-back')) ?? {
    handBackPerson: async () => {
      throw new Error('chase-hand-back is missing');
    },
  };
  const R: any = await load('../src/lib/glance/read');
  const SCH: any = await load('../src/lib/sms/nudge-scheduler');
  const DIS: any = await load('../src/lib/press/dispatch');
  const ELIG: any = await load('../src/lib/sms/nudge-eligibility');
  const SEND: any = await load('../src/lib/sms/nudge-sender');

  const created = {
    events: [] as string[],
    persons: [] as string[],
    users: [] as string[],
    addresses: [] as string[],
  };
  const before = {
    outbound: await prisma.outboundMessage.count(),
    inviteEvents: await prisma.inviteEvent.count(),
  };

  try {
    // ══ LAYER A — the pure due rule ══════════════════════════════════════════════════════
    const T0 = new Date('2026-09-01T09:00:00.000Z').getTime();
    const at = (h: number) => new Date(T0 + h * HOUR);
    const leg = (kind: string, c: number, s: number | null) => ({
      kind,
      createdAt: at(c),
      spentAt: s === null ? null : at(s),
    });
    const spent2 = [leg('CHASE_FIRST', 96, 96), leg('CHASE_SECOND', 168, 168)];
    const sp = (legs: any[], hb: any) => ({ cadenceLength: 2, legs, handBack: hb });
    const due = (s: any, h: number) => ok(() => CE.handBackLegDue(s, at(h)) === true);
    const notDue = (s: any, h: number) => ok(() => CE.handBackLegDue(s, at(h)) === false);
    const hb2 = { reminders: 2, at: at(300) };

    assert('A', 'no hand-back → never due', notDue(sp(spent2, null), 5000));
    assert(
      'A',
      'Q3: the first goes out NEXT — due at the hand-back itself',
      due(sp(spent2, hb2), 300)
    );
    assert('A', 'not before the hand-back', notDue(sp(spent2, hb2), 299));
    assert(
      'A',
      'a leg in flight is not followed by another',
      notDue(sp([...spent2, leg('CHASE_MORE', 300, null)], hb2), 5000)
    );
    assert(
      'A',
      'Q3: the next is 72 hours after the last was sent — not at 71',
      notDue(sp([...spent2, leg('CHASE_MORE', 300, 301)], hb2), 301 + 71)
    );
    assert(
      'A',
      'and is due at 72',
      due(sp([...spent2, leg('CHASE_MORE', 300, 301)], hb2), 301 + 72)
    );
    assert(
      'A',
      'THE CAP: all asked-for legs sent → no more',
      notDue(sp([...spent2, leg('CHASE_MORE', 300, 301), leg('CHASE_MORE', 373, 374)], hb2), 9000)
    );
    assert(
      'A',
      'a CHASE_MORE from an EARLIER hand-back does not count toward this one',
      due(sp([...spent2, leg('CHASE_MORE', 250, 251)], { reminders: 1, at: at(300) }), 300)
    );
    assert(
      'A',
      'nextHandBackLegAt: the hand-back instant for the first leg',
      ok(() => CE.nextHandBackLegAt(sp(spent2, hb2), at(300)).getTime() === at(300).getTime())
    );
    assert(
      'A',
      'nextHandBackLegAt: last + 72h for the next',
      ok(
        () =>
          CE.nextHandBackLegAt(
            sp([...spent2, leg('CHASE_MORE', 300, 301)], hb2),
            at(310)
          ).getTime() === at(373).getTime()
      )
    );
    assert(
      'A',
      'nextHandBackLegAt: null once the cap is reached',
      ok(
        () =>
          CE.nextHandBackLegAt(
            sp([...spent2, leg('CHASE_MORE', 300, 301), leg('CHASE_MORE', 373, 374)], hb2),
            at(400)
          ) === null
      )
    );
    assert(
      'A',
      'CONTROL: the exhaustion predicate agrees — exhausted again 72h after the last asked-for leg',
      ok(
        () =>
          CE.isChaseExhausted(
            sp([...spent2, leg('CHASE_MORE', 300, 301), leg('CHASE_MORE', 373, 374)], hb2),
            at(374 + 73)
          ) === true &&
          CE.isChaseExhausted(sp([...spent2, leg('CHASE_MORE', 300, 301)], hb2), at(9000)) === false
      )
    );

    // ══ LAYER B — the words ═════════════════════════════════════════════════════════════
    const base = {
      recipientFirstName: 'Ann',
      hostFirstName: 'Kate',
      eventName: 'Christmas at Kate’s',
      link: 'http://x/p/t',
      itemless: false,
      answeredAnything: false,
      self: { state: 'WHOLE', pendingNames: [] },
      carried: [],
    };
    assert(
      'B',
      'W3: the further reminder by email, byte-exact',
      ok(
        () =>
          REG.composeChase({ ...base, leg: 'MORE' }).text ===
          "Hi Ann - Gather here, checking in again for Kate. I still haven't heard from you. One tap to say yes, no or maybe: http://x/p/t"
      )
    );
    assert(
      'B',
      'W3: its subject is the ask’s',
      ok(
        () =>
          REG.composeChase({ ...base, leg: 'MORE' }).subject === 'Christmas at Kate’s — from Kate'
      )
    );
    assert(
      'B',
      'W3: a guest who answered one dish of two is told what is still open',
      ok(
        () =>
          REG.composeChase({
            ...base,
            leg: 'MORE',
            answeredAnything: true,
            self: { state: 'PARTIAL', pendingNames: ['pavlova'] },
          }).text ===
          "Hi Ann - Gather here, checking in again for Kate. I still haven't heard back about the pavlova. One tap to say yes, no or maybe: http://x/p/t"
      )
    );
    assert(
      'B',
      'W4: the further reminder by text names the event and ends with the STOP line',
      ok(
        () =>
          REG.composeChaseText({ ...base, leg: 'MORE' }) ===
          "Hi Ann - Gather here, checking in again for Kate about Christmas at Kate’s. I still haven't heard from you. One tap to say yes, no or maybe: http://x/p/t\nReply STOP to opt out"
      )
    );
    assert(
      'B',
      'CONTROL: the ruled second leg is unchanged',
      ok(
        () =>
          REG.composeChase({ ...base, leg: 'SECOND' }).text ===
          "Hi Ann - Gather here, checking in once more for Kate. I still haven't heard from you. One tap to say yes, no or maybe: http://x/p/t"
      )
    );

    // ══ LAYER C — the surface ════════════════════════════════════════════════════════════
    const pf = (state: string, reasons: string[]) => ({
      state,
      reasons,
      personId: 'p1',
      name: 'Amelia',
      nudgeMark: null,
    });
    assert(
      'C',
      'the control is offered on "gone quiet"',
      ok(() => AC.handBackOffered(pf('RED', ['EXHAUSTED_SILENCE'])) === true)
    );
    for (const r of [
      'CHASE_UNREACHABLE',
      'NOT_DELIVERED',
      'UNREACHABLE',
      'EMAIL_OPTED_OUT',
      'REVERSAL',
      'DECIDE_BY_EXPIRED',
    ]) {
      assert(
        'C',
        `and on no other red: ${r}`,
        ok(() => AC.handBackOffered(pf('RED', [r])) === false)
      );
    }
    assert(
      'C',
      'nor on amber, green or grey',
      ok(
        () =>
          AC.handBackOffered(pf('AMBER', ['AWAITING_REPLY'])) === false &&
          AC.handBackOffered(pf('GREEN', ['ACCEPTED'])) === false &&
          AC.handBackOffered(pf('NOT_CHASED', ['DONT_CHASE'])) === false
      )
    );
    assert(
      'C',
      'W2, byte-exact: the line, the three choices and the note after',
      ok(
        () =>
          AC.HAND_BACK_LEAD === W2_LEAD &&
          JSON.stringify(AC.HAND_BACK_CHOICES.map((c: any) => c.label)) ===
            JSON.stringify(W2_CHOICES) &&
          JSON.stringify(AC.HAND_BACK_CHOICES.map((c: any) => c.reminders)) === '[1,2,3]' &&
          AC.HAND_BACK_DONE === W2_DONE
      )
    );
    assert(
      'C',
      'the refusal is the ruled "The board is catching up."',
      ok(() => AC.CATCH_UP_NOTE === W2_REFUSED)
    );
    {
      const calls: any[] = [];
      const fetchImpl = (async (url: string, init: any) => {
        calls.push({ url, method: init?.method, body: JSON.parse(init?.body ?? '{}') });
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }) as any;
      let outcome: any = null;
      try {
        outcome = await AC.handBack('ev1', pf('RED', ['EXHAUSTED_SILENCE']), 2, { fetchImpl });
      } catch {
        outcome = null;
      }
      assert(
        'C',
        'the action POSTs {reminders} to the hand-back route, and moves the board',
        ok(
          () =>
            calls.length === 1 &&
            calls[0].url === '/api/events/ev1/people/p1/hand-back' &&
            calls[0].method === 'POST' &&
            calls[0].body.reminders === 2 &&
            outcome.ok === true &&
            outcome.movedBoard === true &&
            outcome.note === W2_DONE
        ),
        JSON.stringify(calls)
      );
    }
    {
      // Imports are declarations, not uses: stripped so the check reads the panel's body only.
      const surface = code('src/components/glance/PersonSurface.tsx').replace(
        /import[\s\S]*?from '[^']+';/g,
        ''
      );
      const fn = surface.slice(surface.indexOf('function handBackSection()'));
      assert(
        'C',
        'THE GUARD GATES: the one function rendering the control opens with `if (!handBackOffered(person)) return null;` (the Ruling 31 lesson)',
        /function handBackSection\(\)\s*\{\s*if \(!handBackOffered\(person\)\) return null;/.test(
          surface
        )
      );
      assert(
        'C',
        'and the control’s words and action appear nowhere else in the panel',
        ok(() => {
          const before = surface.slice(0, surface.indexOf('function handBackSection()'));
          const after = fn.slice(fn.indexOf('\n  }\n'));
          return (
            !/HAND_BACK_CHOICES|handBack\(/.test(before) &&
            !/HAND_BACK_CHOICES|handBack\(/.test(after)
          );
        })
      );
      assert(
        'C',
        'RULING 1: the panel shows no count and no date for it',
        !/handBackReminders|handedBackAt|nextNudgeAt/.test(fn.slice(0, fn.indexOf('\n  }\n') + 1))
      );
    }

    // ══ Fixture (layers D–F) ═══════════════════════════════════════════════════════════════
    const now = new Date();
    const stamp = Date.now();
    const mail = (w: string) => `gtc251c+${w}+${stamp}@example.test`;
    const user = await prisma.user.create({ data: { email: mail('host') } });
    created.users.push(user.id);
    const host = await prisma.person.create({
      data: { name: 'Kate Host', email: user.email, userId: user.id },
    });
    created.persons.push(host.id);
    const endDate = new Date(now.getTime() + 60 * DAY);
    const sentAt = new Date(now.getTime() - 12 * DAY);
    const event = await prisma.event.create({
      data: {
        name: `${TAG} Christmas`,
        startDate: endDate,
        endDate,
        hostId: host.id,
        status: 'CONFIRMING',
        sentAt,
      },
    });
    created.events.push(event.id);
    await prisma.eventRole.create({ data: { eventId: event.id, userId: user.id, role: 'HOST' } });
    await prisma.personEvent.create({
      data: { personId: host.id, eventId: event.id, role: 'HOST' },
    });
    const team = await prisma.team.create({ data: { name: 'Mains', eventId: event.id } });

    async function guest(
      name: string,
      o: { householdId?: string; householdRole?: string; email?: string | null } = {}
    ) {
      const first = name.split(' ')[0].toLowerCase();
      const p = await prisma.person.create({
        data: { name, email: o.email === undefined ? mail(first) : o.email },
      });
      created.persons.push(p.id);
      const pe = await prisma.personEvent.create({
        data: {
          personId: p.id,
          eventId: event.id,
          role: 'PARTICIPANT',
          sentAt,
          householdId: o.householdId ?? null,
          householdRole: o.householdRole ?? null,
        },
      });
      const item = await prisma.item.create({
        data: { name: `${first}'s pavlova`, teamId: team.id, kind: 'ITEM' },
      });
      const a = await prisma.assignment.create({
        data: { itemId: item.id, personId: p.id, response: 'PENDING' },
      });
      await prisma.accessToken.create({
        data: { token: `${TAG}-${pe.id}`, scope: 'PARTICIPANT', eventId: event.id, personId: p.id },
      });
      return { p, pe, assignmentId: a.id };
    }
    async function spent(peId: string) {
      const f = new Date(now.getTime() - 8 * DAY);
      const s = new Date(now.getTime() - 5 * DAY);
      for (const [kind, t] of [
        ['ASK', sentAt],
        ['CHASE_FIRST', f],
        ['CHASE_SECOND', s],
      ] as const) {
        await prisma.outboundMessage.create({
          data: {
            eventId: event.id,
            personEventId: peId,
            kind,
            channel: 'EMAIL',
            createdAt: t,
            attemptedAt: t,
            attemptCount: 1,
            acceptedAt: t,
            provider: 'resend',
            providerMessageId: `${TAG}-${peId}-${kind}`,
          },
        });
      }
      await prisma.personEvent.update({
        where: { id: peId },
        data: { firstNudgeSentAt: f, secondNudgeSentAt: s },
      });
    }

    const sam = await guest('Sam Quiet');
    await spent(sam.pe.id);
    const amy = await guest('Amy Amber');
    const mo = await guest('Mo Latermarked');
    await spent(mo.pe.id);
    const ann = await guest('Ann Answers');
    await spent(ann.pe.id);
    const eli = await guest('Eli Unsubscribes');
    await spent(eli.pe.id);
    const bo = await guest('Bo Bounces');
    await spent(bo.pe.id);
    const hh = await prisma.household.create({ data: { eventId: event.id } });
    const cara = await guest('Cara Carrier', {
      householdId: hh.id,
      householdRole: 'PRIMARY_CONTACT',
    });
    await prisma.household.update({
      where: { id: hh.id },
      data: { contactPersonEventId: cara.pe.id },
    });
    await spent(cara.pe.id);
    const kit = await guest('Kit Kid', { householdId: hh.id, householdRole: 'CHILD', email: null });

    const board = async (t: Date) => {
      const g = await R.readEventGlance(prisma, event.id, t);
      return [...g.households.flatMap((h: any) => h.members), ...g.unhoused];
    };
    const P = async (m: any, t: Date) =>
      (await board(t)).find((x: any) => x.personEventId === m.pe.id) ?? null;
    const moreRows = (m: any) =>
      prisma.outboundMessage.findMany({
        where: { personEventId: m.pe.id, kind: 'CHASE_MORE' as any },
        orderBy: { createdAt: 'asc' },
      });
    const pe = (m: any) =>
      prisma.personEvent.findUnique({
        where: { id: m.pe.id },
        select: { handBackReminders: true, handedBackAt: true },
      });

    // ══ LAYER D — the server ════════════════════════════════════════════════════════════
    const hb = (m: any, n: any) =>
      HB.handBackPerson(prisma, { eventId: event.id, personId: m.p.id, reminders: n });
    let r: any;
    r = await hb(sam, 0).catch(() => null);
    assert(
      'D',
      'Q3’s cap at the server: 0 is refused 400',
      ok(() => r.ok === false && r.status === 400)
    );
    r = await hb(sam, 4).catch(() => null);
    assert(
      'D',
      'and 4 is refused 400',
      ok(() => r.ok === false && r.status === 400)
    );
    r = await hb(sam, '2').catch(() => null);
    assert(
      'D',
      'and a string is refused 400',
      ok(() => r.ok === false && r.status === 400)
    );
    r = await hb(amy, 1).catch(() => null);
    assert(
      'D',
      'an AMBER guest is refused 409 with W2’s refusal — the board moved',
      ok(() => r.ok === false && r.status === 409 && r.error === W2_REFUSED),
      JSON.stringify(r)
    );
    r = await HB?.handBackPerson(prisma, {
      eventId: event.id,
      personId: 'nobody',
      reminders: 1,
    }).catch(() => null);
    assert(
      'D',
      'a person not on the event is refused 404',
      ok(() => r.ok === false && r.status === 404)
    );
    assert('D', 'a refusal writes nothing', (await pe(sam))?.handedBackAt === null);

    const outboundBefore = await prisma.outboundMessage.count({ where: { eventId: event.id } });
    const tHand = new Date();
    r = await hb(sam, 2).catch(() => null);
    const samPe = await pe(sam);
    assert(
      'D',
      '"gone quiet" + 2 → 200, both columns written',
      ok(() => r.ok === true) && samPe?.handBackReminders === 2 && !!samPe?.handedBackAt,
      JSON.stringify(r)
    );
    assert(
      'D',
      'THE ROUTE SENDS NOTHING: no row is queued by the hand-back itself',
      (await prisma.outboundMessage.count({ where: { eventId: event.id } })) === outboundBefore
    );
    r = await hb(kit, 1).catch(() => null);
    const caraPe = await pe(cara);
    assert(
      'D',
      'a CARRIED CHILD’s hand-back is written on the CARRIER, whom the chase messages',
      ok(() => r.ok === true) &&
        caraPe?.handBackReminders === 1 &&
        (await pe(kit))?.handBackReminders === null,
      JSON.stringify(r)
    );

    const samNow = await P(sam, new Date(Date.now() + 60 * 1000));
    assert(
      'D',
      'the board: Sam is AMBER again (Gather is chasing), with a nudge day for the reading panel',
      ok(() => samNow.state === 'AMBER' && typeof samNow.nextNudgeAt === 'string'),
      JSON.stringify(samNow && { state: samNow.state, n: samNow.nextNudgeAt })
    );

    // ══ LAYER E — end to end ═════════════════════════════════════════════════════════════
    const clock = (ms: number) => new Date(Date.now() + ms);
    const tick = async (t: Date) => {
      await SCH.runNudgeScheduler(t, { eventIds: [event.id] });
      return DIS.drainOnce(prisma, 500, t);
    };
    sent = [];
    await tick(clock(60 * 1000));
    let rows = await moreRows(sam);
    assert(
      'E',
      'Q3: the first further reminder goes at the chase’s next run — one row, sent',
      rows.length === 1 && !!rows[0].acceptedAt,
      JSON.stringify(rows.map((x: any) => ({ a: !!x.acceptedAt, w: x.withheldWhy })))
    );
    const toSam = sent.filter((s) => s.to.includes(sam.p.email!));
    assert(
      'E',
      'W3 as sent: "checking in again", with the standard footer',
      ok(
        () =>
          toSam.length === 1 &&
          toSam[0].text.startsWith('Hi Sam - Gather here, checking in again for Kate.') &&
          toSam[0].text.includes('Contact Gather: hello@gatheringtogether.co.nz')
      ),
      toSam[0]?.text
    );
    await tick(clock(2 * 60 * 1000));
    assert(
      'E',
      'ONE PER RUN, AND NOT BEFORE ITS TIME: a second run minutes later queues nothing',
      (await moreRows(sam)).length === 1
    );
    await tick(clock(71 * HOUR));
    assert('E', 'Q3: not at 71 hours', (await moreRows(sam)).length === 1);
    await tick(clock(73 * HOUR));
    rows = await moreRows(sam);
    assert(
      'E',
      'Q3: the second, three days after the first',
      rows.length === 2 && !!rows[1].acceptedAt
    );
    await tick(clock(73 * 2 * HOUR));
    assert('E', 'THE CAP: two asked for, two sent, no third', (await moreRows(sam)).length === 2);
    const lastAt = (await moreRows(sam))[1]?.acceptedAt?.getTime() ?? Date.now();
    const samLate = await P(sam, new Date(lastAt + 71 * HOUR));
    const samRed = await P(sam, new Date(lastAt + 73 * HOUR));
    assert(
      'E',
      'Q3: AMBER 71 hours after the last further reminder',
      ok(() => samLate.state === 'AMBER')
    );
    assert(
      'E',
      'and RED "gone quiet" again at 73, with the same door',
      ok(
        () =>
          samRed.state === 'RED' &&
          samRed.reasons.includes('EXHAUSTED_SILENCE') &&
          AC.handBackOffered(samRed) === true
      )
    );
    assert(
      'E',
      'the carrier’s hand-back reaches the carrier’s inbox (the child’s rows are hers)',
      (await moreRows(cara)).length === 1
    );

    // A second hand-back, from the red again — no lifetime cap (4.6, ruled).
    r = await HB.handBackPerson(prisma, {
      eventId: event.id,
      personId: sam.p.id,
      reminders: 1,
      now: new Date(lastAt + 74 * HOUR),
    }).catch((e: any) => ({ threw: e.message }));
    assert(
      'E',
      'NO LIFETIME CAP: from the red again, a second hand-back is accepted',
      ok(() => r.ok === true),
      JSON.stringify(r)
    );
    await tick(new Date(lastAt + 75 * HOUR));
    assert(
      'E',
      'and its one reminder goes (three CHASE_MORE rows in all)',
      (await moreRows(sam)).length === 3
    );

    // TWO TICKS RACING: the queue's own guard, under its advisory lock, is what keeps "one leg"
    // true when the sweep's answer is stale — the same candidate queued twice writes one row.
    const rae = await guest('Rae Race');
    await spent(rae.pe.id);
    const raeHb = await HB.handBackPerson(prisma, {
      eventId: event.id,
      personId: rae.p.id,
      reminders: 1,
    }).catch(() => null);
    let raeRows = -1;
    try {
      const found = await ELIG.findNudgeCandidatesForEvent(event.id, clock(60 * 1000));
      const cand = found.eligibleMore.find((c: any) => c.personEventId === rae.pe.id);
      await SEND.queueChase({ eligibleFirst: [], eligibleSecond: [], eligibleMore: [cand, cand] });
      await SEND.queueChase({ eligibleFirst: [], eligibleSecond: [], eligibleMore: [cand] });
      raeRows = (await moreRows(rae)).length;
    } catch {
      raeRows = -1;
    }
    assert(
      'E',
      'TWO TICKS RACING: the same further reminder queued three times writes ONE row',
      ok(() => raeHb.ok === true) && raeRows === 1,
      `rows ${raeRows}`
    );

    // ══ LAYER F — the fences ═════════════════════════════════════════════════════════════
    for (const m of [mo, ann, eli, bo]) {
      const x = await HB.handBackPerson(prisma, {
        eventId: event.id,
        personId: m.p.id,
        reminders: 1,
      }).catch(() => null);
      assert(
        'F',
        `${m.p.name}: handed back while gone quiet`,
        ok(() => x.ok === true)
      );
    }
    // Queued by one run, then the fact changes, then the drain runs.
    await SCH.runNudgeScheduler(clock(60 * 1000), { eventIds: [event.id] });
    assert(
      'F',
      'CONTROL: each has one further reminder queued',
      (await Promise.all([mo, ann, eli, bo].map(moreRows))).every((x) => x.length === 1)
    );
    await prisma.personEvent.update({ where: { id: mo.pe.id }, data: { nudgeMark: 'DONT_CHASE' } });
    await prisma.assignment.update({
      where: { id: ann.assignmentId },
      data: { response: 'ACCEPTED' },
    });
    await prisma.emailOptOut.create({ data: { personId: eli.p.id, eventId: event.id } });
    const boAddr = bo.p.email!.toLowerCase();
    await prisma.emailBlock.create({
      data: { address: boAddr, reason: 'BOUNCED', eventId: event.id },
    });
    created.addresses.push(boAddr);
    sent = [];
    await DIS.drainOnce(prisma, 500, clock(2 * 60 * 1000));
    const why = async (m: any) => (await moreRows(m))[0]?.withheldWhy ?? null;
    assert(
      'F',
      'THE MARK WINS at the drain: withheld, not sent',
      (await why(mo)) === 'MARKED_DONT_CHASE' && !sent.some((s) => s.to.includes(mo.p.email!)),
      String(await why(mo))
    );
    assert('F', 'AN ANSWER WINS at the drain: withheld ANSWERED', (await why(ann)) === 'ANSWERED');
    assert(
      'F',
      'AN EMAIL OPT-OUT WINS at the drain (Zone 9)',
      (await why(eli)) === 'EMAIL_OPTED_OUT'
    );
    assert('F', 'A BLOCK WINS at the drain (Zone 9)', (await why(bo)) === 'EMAIL_BLOCKED');
    // At the sweep: a hand-back on a marked guest and on an OFF event queues nothing.
    await prisma.personEvent.update({
      where: { id: mo.pe.id },
      data: { handedBackAt: new Date(), handBackReminders: 1 },
    });
    await SCH.runNudgeScheduler(clock(73 * HOUR), { eventIds: [event.id] });
    assert(
      'F',
      'THE MARK WINS at the sweep: nothing more queued',
      (await moreRows(mo)).length === 1
    );
    const pal = await guest('Pal Paceoff');
    await spent(pal.pe.id);
    const palHb = await HB.handBackPerson(prisma, {
      eventId: event.id,
      personId: pal.p.id,
      reminders: 1,
    }).catch(() => null);
    await prisma.event.update({ where: { id: event.id }, data: { nudgePace: 'OFF' } });
    await SCH.runNudgeScheduler(clock(60 * 1000), { eventIds: [event.id] });
    assert(
      'F',
      'PACE OFF WINS at the sweep: the handed-back guest gets nothing',
      ok(() => palHb.ok === true) && (await moreRows(pal)).length === 0
    );
    await prisma.event.update({ where: { id: event.id }, data: { nudgePace: null } });
    await SCH.runNudgeScheduler(clock(60 * 1000), { eventIds: [event.id] });
    await prisma.event.update({ where: { id: event.id }, data: { nudgePace: 'OFF' } });
    await DIS.drainOnce(prisma, 500, clock(2 * 60 * 1000));
    assert(
      'F',
      'PACE OFF WINS at the drain: a queued further reminder is withheld PACE_OFF',
      (await why(pal)) === 'PACE_OFF',
      String(await why(pal))
    );
    await prisma.event.update({ where: { id: event.id }, data: { nudgePace: null } });

    // Founder ruling, 2026-09-30: pace OFF at the send reaches EVERY chase kind — a first reminder
    // queued before reminders were switched off must not go out after.
    const fia = await guest('Fia Firstleg');
    const firstRow = () =>
      prisma.outboundMessage.findFirst({
        where: { personEventId: fia.pe.id, kind: 'CHASE_FIRST' },
      });
    await SCH.runNudgeScheduler(clock(60 * 1000), { eventIds: [event.id] });
    const fiaQueued = await firstRow();
    await prisma.event.update({ where: { id: event.id }, data: { nudgePace: 'OFF' } });
    sent = [];
    await DIS.drainOnce(prisma, 500, clock(2 * 60 * 1000));
    const fiaRow = await firstRow();
    assert(
      'F',
      'PACE OFF WINS at the drain for a FIRST reminder too: queued before OFF, withheld PACE_OFF, not sent',
      !!fiaQueued &&
        fiaRow?.withheldWhy === 'PACE_OFF' &&
        !fiaRow?.acceptedAt &&
        !sent.some((x) => x.to.includes(fia.p.email!)),
      JSON.stringify({ queued: !!fiaQueued, why: fiaRow?.withheldWhy ?? null })
    );
    await prisma.event.update({ where: { id: event.id }, data: { nudgePace: null } });

    // ══ LAYER G — Zone 5 ════════════════════════════════════════════════════════════════
    const dirs = readdirSync(join(ROOT, 'prisma/migrations')).filter((d) => /gtc251/.test(d));
    const sql = dirs.length === 1 ? read(`prisma/migrations/${dirs[0]}/migration.sql`) : '';
    assert(
      'G',
      'one migration, as approved',
      dirs.length === 1 && dirs[0] === '20260930023440_gtc251_hand_back',
      JSON.stringify(dirs)
    );
    assert(
      'G',
      'it adds CHASE_MORE and two nullable columns, and nothing else',
      sql
        .replace(/--.*\n/g, '')
        .replace(/\s+/g, ' ')
        .trim() ===
        `ALTER TYPE "OutboundKind" ADD VALUE 'CHASE_MORE'; ALTER TABLE "PersonEvent" ADD COLUMN "handBackReminders" INTEGER, ADD COLUMN "handedBackAt" TIMESTAMP(3);`,
      sql
    );

    // ══ LAYER S — structure ══════════════════════════════════════════════════════════════
    let anchors = '';
    try {
      anchors = execFileSync('grep', ['-rn', 'ANCHOR(GTC-251', 'src'], {
        cwd: ROOT,
        encoding: 'utf8',
      });
    } catch {
      anchors = '';
    }
    assert('S', 'every GTC-251 anchor is gone from src', anchors.trim() === '', anchors.trim());
    const routeSrc = code('src/app/api/events/[id]/people/[personId]/hand-back/route.ts');
    assert(
      'S',
      'the route guards HOST first, then asks `handBackPerson`',
      /requireEventRole\(eventId, \['HOST'\]\)/.test(routeSrc) &&
        routeSrc.indexOf('requireEventRole') < routeSrc.indexOf('handBackPerson(')
    );
    assert(
      'S',
      'the route is classified SESSION in route-classifications.json',
      /"filePath": "src\/app\/api\/events\/\[id\]\/people\/\[personId\]\/hand-back\/route\.ts"[\s\S]{0,200}"authType": "SESSION"/.test(
        read('route-classifications.json')
      )
    );
    let live: number | null = null;
    try {
      live = (
        await realFetch(`${BASE}/api/events/none/people/none/hand-back`, {
          method: 'POST',
          body: '{"reminders":1}',
        })
      ).status;
    } catch {
      live = null;
    }
    assert(
      'S',
      'LIVE: with no session the route answers 401 (the dev server must be up)',
      live === 401,
      `status ${live}`
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
        ],
        { cwd: ROOT }
      );
      zoneDiff = '';
    } catch {
      zoneDiff = 'changed';
    }
    assert('S', 'ZONES 7 AND 9 ARE UNEDITED (read only)', zoneDiff === '', zoneDiff);
    assert(
      'S',
      'NOTHING LEFT THE PROCESS but the stubbed Resend requests',
      trapCount() === 0 && nonResendCalls === 0,
      `trap ${trapCount()}, other ${nonResendCalls}`
    );
  } finally {
    globalThis.fetch = realFetch;
    await prisma.inviteEvent.deleteMany({ where: { eventId: { in: created.events } } });
    await prisma.outboundMessage.deleteMany({ where: { eventId: { in: created.events } } });
    await prisma.emailBlock.deleteMany({ where: { address: { in: created.addresses } } });
    await prisma.emailOptOut.deleteMany({ where: { eventId: { in: created.events } } });
    await prisma.accessToken.deleteMany({ where: { eventId: { in: created.events } } });
    await prisma.event.deleteMany({ where: { id: { in: created.events } } });
    await prisma.person.deleteMany({ where: { id: { in: created.persons } } });
    await prisma.user.deleteMany({ where: { id: { in: created.users } } });
    const left =
      (await prisma.event.count({ where: { id: { in: created.events } } })) +
      (await prisma.person.count({ where: { id: { in: created.persons } } })) +
      (await prisma.user.count({ where: { id: { in: created.users } } })) +
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
    for (const x of redAssertions) console.log(`  ${x}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
