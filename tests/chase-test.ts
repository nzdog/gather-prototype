/**
 * GTC-189 SLICE 8b — THE CHASE.
 *
 * Run: npm run test:chase
 *
 * ── WHAT THIS SUITE HOLDS ─────────────────────────────────────────────────────
 *
 *   D2      The chase writes OutboundMessage rows (CHASE_FIRST / CHASE_SECOND) and the dispatcher
 *           sends them. The scheduler sends nothing itself.
 *   GTC-311 Line 1: default on, email only, no exception → chased by EMAIL at day four and seven.
 *           Line 2: excepted → chased by nothing.
 *   D5 / F7 Both reminders require that the guest still has not answered.
 *   R       A carried child's ask keeps the CARRIER chased.
 *   O       An SMS opt-out is never chased by email.
 *   W6–W8   The reminder email's words, greeting by name as the ask does.
 *   V / AE  The proxy household reminder is retired; nothing reads PersonEvent.contactMethod.
 *   F2      A chase row never becomes the board's or the door's fact.
 *
 * ── NOTHING IS SENT ───────────────────────────────────────────────────────────
 *
 * `globalThis.fetch` is stubbed before any layer that could reach a provider, and no SMS provider
 * credential is present (the drain's text rows end at SMS_DISABLED before any provider call). The
 * stub records every Resend `to` so an assertion about one guest measures that guest. Rows are
 * tagged `GTC189S8B` and removed in `finally`.
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();
const TAG = 'GTC189S8B';
const ROOT = join(__dirname, '..');
const DAY = 24 * 60 * 60 * 1000;

let passed = 0;
let failed = 0;
const red: string[] = [];
function assert(phase: string, label: string, condition: boolean) {
  if (condition) {
    console.log(`\x1b[32m✓\x1b[0m [${phase}] ${label}`);
    passed++;
  } else {
    console.error(`\x1b[31m✗\x1b[0m [${phase}] ${label}`);
    failed++;
    red.push(`[${phase}] ${label}`);
  }
}
function ok(fn: () => boolean): boolean {
  try {
    return fn();
  } catch {
    return false;
  }
}
async function layer(name: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    assert(name, `layer ran to completion (threw: ${(e as Error).message.split('\n')[0]})`, false);
  }
}
const read = (rel: string) =>
  existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), 'utf8') : '';

// ── Provider stub. ────────────────────────────────────────────────────────────
const realFetch = globalThis.fetch;
let sent: { to: string[]; subject?: string; text?: string; replyTo?: unknown; headers?: any }[] =
  [];
let nonResendCalls = 0;
function stub() {
  sent = [];
  globalThis.fetch = (async (url: unknown, init?: { method?: string; body?: string }) => {
    const u = String(url);
    if (u.includes('resend')) {
      const body = JSON.parse(init?.body ?? '{}');
      sent.push({
        to: [body.to ?? []].flat(),
        subject: body.subject,
        text: body.text,
        replyTo: body.reply_to ?? body.replyTo,
        headers: body.headers,
      });
      return new Response(JSON.stringify({ id: `${TAG}-${sent.length}-${Date.now()}` }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    nonResendCalls++;
    return new Response('{}', { status: 500 });
  }) as typeof fetch;
}

// ── LAYER A — the words (W6–W8). Pure. ───────────────────────────────────────
async function runWordsLayer() {
  const reg = await import('../src/lib/messages/chase-register');
  const ask = await import('../src/lib/messages/ask-register');
  const base = {
    recipientFirstName: 'Ann',
    hostFirstName: 'Kate',
    eventName: 'Christmas at Kate’s',
    link: 'https://x.test/p/tok',
  };
  const WHOLE = (names: string[] = ['pavlova']) => ({
    state: 'WHOLE' as const,
    pendingNames: names,
  });
  const PART = (names: string[]) => ({ state: 'PARTIAL' as const, pendingNames: names });
  const DONE = { state: 'DONE' as const, pendingNames: [] as string[] };
  const kid = (firstName: string, p: any) => ({ firstName, ...p });
  const c = (over: Record<string, unknown>) =>
    reg.composeChase({
      ...base,
      leg: 'FIRST',
      itemless: false,
      answeredAnything: false,
      self: WHOLE(),
      carried: [],
      ...over,
    } as any);
  // The sentence between the opener and the tap line.
  const mid = (over: Record<string, unknown>) =>
    c(over)
      .text.replace(/^Hi Ann - Gather here(?: again)?, [^.]*\. /, '')
      .replace(/ One tap.*$/, '');

  assert(
    'A',
    "W6 — the subject is the ask's subject, so the reminder threads with the invitation",
    c({}).subject === ask.askSubject(base.eventName, 'Kate')
  );
  assert(
    'A',
    'W7 — nothing answered: the ruled first reminder, greeting by name, byte-exact',
    c({}).text ===
      "Hi Ann - Gather here again, helping Kate with this one. I haven't heard from you yet. One tap to say yes, no or maybe: https://x.test/p/tok"
  );
  assert(
    'A',
    'W8 — nothing answered: the ruled second reminder, byte-exact',
    c({ leg: 'SECOND' }).text ===
      "Hi Ann - Gather here, checking in once more for Kate. I still haven't heard from you. One tap to say yes, no or maybe: https://x.test/p/tok"
  );
  assert(
    'A',
    'W7 — itemless: the ruled attendance line',
    c({ itemless: true }).text.endsWith(
      'One tap to say whether you can make it: https://x.test/p/tok'
    )
  );

  // ── THE RULE, 2026-09-27: name only what is still open; never "haven't heard from you" to
  // somebody who has answered anything. Every combination of the recipient and a carried child.
  const combos: [string, Record<string, unknown>, string][] = [
    [
      'own partial (one of two)',
      { answeredAnything: true, self: PART(['pavlova']) },
      "I haven't heard back about the pavlova yet.",
    ],
    [
      'own partial (two still open)',
      { answeredAnything: true, self: PART(['pavlova', 'salad']) },
      "I haven't heard back about the pavlova and the salad yet.",
    ],
    [
      'own none answered + child none (W7, ruled)',
      { self: WHOLE(), carried: [kid('Ollie', WHOLE())] },
      "I haven't heard back about you and Ollie yet.",
    ],
    [
      'own done + child none (W7, ruled)',
      { answeredAnything: true, self: DONE, carried: [kid('Ollie', WHOLE())] },
      "I haven't heard back about Ollie yet.",
    ],
    [
      'own partial + child none',
      { answeredAnything: true, self: PART(['pavlova']), carried: [kid('Ollie', WHOLE())] },
      "I haven't heard back about the pavlova and Ollie yet.",
    ],
    [
      'own partial + child partial',
      {
        answeredAnything: true,
        self: PART(['pavlova']),
        carried: [kid('Ollie', PART(['trifle']))],
      },
      "I haven't heard back about the pavlova and Ollie's trifle yet.",
    ],
    [
      'own done + child partial',
      { answeredAnything: true, self: DONE, carried: [kid('Ollie', PART(['trifle']))] },
      "I haven't heard back about Ollie's trifle yet.",
    ],
    [
      'own none answered + child partial (she answered some of his) — her open rows, not "you"',
      { answeredAnything: true, self: WHOLE(), carried: [kid('Ollie', PART(['trifle']))] },
      "I haven't heard back about the pavlova and Ollie's trifle yet.",
    ],
    [
      'own done + two children',
      { answeredAnything: true, self: DONE, carried: [kid('Ollie', WHOLE()), kid('Mia', WHOLE())] },
      "I haven't heard back about Ollie and Mia yet.",
    ],
    [
      'own none answered, but a carried row answered — her open rows, never "you"',
      { answeredAnything: true, self: WHOLE(['pavlova', 'salad']) },
      "I haven't heard back about the pavlova and the salad yet.",
    ],
    [
      'no rows of her own, answered for Ollie, not said whether she can come (ruling AA)',
      {
        answeredAnything: true,
        self: { state: 'WHOLE', pendingNames: [] },
        carried: [kid('Mia', WHOLE())],
      },
      "I haven't heard back about whether you can make it and Mia yet.",
    ],
  ];
  for (const [label, over, want] of combos) {
    assert('A', `the rule — ${label}: "${want}"`, mid(over) === want);
    const second = mid({ ...over, leg: 'SECOND' });
    const wantSecond = want.replace("I haven't", "I still haven't").replace(/ yet\.$/, '.');
    assert('A', `and its second-reminder form: "${wantSecond}"`, second === wantSecond);
  }
  assert(
    'A',
    'no form given to somebody who answered anything says "heard from you"',
    combos
      .filter(([, o]) => (o as any).answeredAnything)
      .every(
        ([, o]) =>
          !/heard from you/.test(c(o).text) &&
          !/heard from you/.test(c({ ...o, leg: 'SECOND' }).text)
      )
  );
  assert(
    'A',
    'the link ends every variant',
    combos.every(([, o]) => c(o).text.endsWith(base.link))
  );
  assert(
    'A',
    'no "please", no "could" (slice 2 answers 1 and 5)',
    combos.every(([, o]) => !/please|\bcould\b/i.test(c(o).text))
  );
}

// ── Fixture. ──────────────────────────────────────────────────────────────────
interface Guest {
  personId: string;
  peId: string;
  email: string | null;
}
interface Fx {
  eventId: string;
  hostName: string;
  hostEmail: string;
  emailOnly: Guest;
  excepted: Guest;
  answered: Guest;
  texter: Guest;
  optedOut: Guest;
  sarah: Guest;
  ollie: Guest;
  late: Guest;
  itemless: Guest;
  /** Two dishes: answered one, the other still open — the case the 8b-hold rule is about. */
  partial: Guest;
  /** Her own dish open; she has answered her carried child's. She has answered SOMETHING. */
  kim: Guest;
}
const blockedAddresses: string[] = [];
const created = {
  users: [] as string[],
  people: [] as string[],
  events: [] as string[],
  teams: [] as string[],
  items: [] as string[],
};

async function withFixture(now: Date, body: (fx: Fx) => Promise<void>) {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const mail = (l: string) => `${TAG.toLowerCase()}-${l}-${stamp}@example.test`;
  const user = await prisma.user.create({ data: { email: mail('host') } });
  created.users.push(user.id);
  const person = async (label: string, over: Record<string, unknown> = {}) => {
    const p = await prisma.person.create({
      data: { name: `${label} ${TAG}`, email: mail(label.toLowerCase()), ...over },
    });
    created.people.push(p.id);
    return p;
  };
  const host = await person('Kate', { email: user.email, userId: user.id });
  const endDate = new Date(now.getTime() + 30 * DAY);
  const event = await prisma.event.create({
    data: {
      name: `${TAG} Christmas`,
      startDate: endDate,
      endDate,
      hostId: host.id,
      status: 'CONFIRMING',
      sentAt: new Date(now.getTime() - 10 * DAY),
    },
  });
  created.events.push(event.id);
  await prisma.eventRole.create({ data: { eventId: event.id, userId: user.id, role: 'HOST' } });
  await prisma.personEvent.create({ data: { personId: host.id, eventId: event.id, role: 'HOST' } });
  const team = await prisma.team.create({ data: { name: `${TAG} Mains`, eventId: event.id } });
  created.teams.push(team.id);

  const guest = async (
    label: string,
    opts: {
      daysAgo: number;
      person?: Record<string, unknown>;
      pe?: Record<string, unknown>;
      response?: 'PENDING' | 'ACCEPTED' | null;
    }
  ): Promise<Guest> => {
    const p = await person(label, opts.person ?? {});
    const pe = await prisma.personEvent.create({
      data: {
        personId: p.id,
        eventId: event.id,
        role: 'PARTICIPANT',
        sentAt: new Date(now.getTime() - opts.daysAgo * DAY),
        ...(opts.pe ?? {}),
      },
    });
    if (opts.response !== null) {
      const item = await prisma.item.create({
        data: { name: `${label}'s dish`, teamId: team.id, status: 'ASSIGNED' },
      });
      created.items.push(item.id);
      await prisma.assignment.create({
        data: { itemId: item.id, personId: p.id, response: opts.response ?? 'PENDING' },
      });
    }
    await prisma.accessToken.create({
      data: {
        token: `${TAG}-${pe.id}`,
        scope: 'PARTICIPANT',
        eventId: event.id,
        personId: p.id,
        expiresAt: endDate,
      },
    });
    // The ask this guest was sent, accepted — what the chase follows.
    await prisma.outboundMessage.create({
      data: {
        eventId: event.id,
        personEventId: pe.id,
        kind: 'ASK',
        channel: 'EMAIL',
        attemptedAt: pe.sentAt!,
        attemptCount: 1,
        acceptedAt: pe.sentAt!,
        provider: 'resend',
        providerMessageId: `${TAG}-ask-${pe.id}`,
        createdAt: pe.sentAt!,
      },
    });
    return { personId: p.id, peId: pe.id, email: p.email };
  };

  const emailOnly = await guest('Ann', { daysAgo: 5 });
  const excepted = await guest('Ed', { daysAgo: 5, pe: { chaseException: 'HAND_TO_HOST' } });
  const answered = await guest('Ava', { daysAgo: 5, response: 'ACCEPTED' });
  const texter = await guest('Tim', { daysAgo: 5, person: { phoneNumber: '+64211239001' } });
  const optedOut = await guest('Ray', {
    daysAgo: 5,
    person: { phoneNumber: '+64211239002', smsOptedOut: true },
  });
  const late = await guest('Lou', {
    daysAgo: 8,
    pe: { firstNudgeSentAt: new Date(now.getTime() - 4 * DAY) },
  });
  const itemless = await guest('Ivy', { daysAgo: 5, response: null });
  const partial = await guest('Pat', { daysAgo: 5, response: 'ACCEPTED' });
  const patSecond = await prisma.item.create({
    data: { name: 'Pat’s salad', teamId: team.id, status: 'ASSIGNED' },
  });
  created.items.push(patSecond.id);
  await prisma.assignment.create({
    data: { itemId: patSecond.id, personId: partial.personId, response: 'PENDING' },
  });

  // Ruling R: Sarah has answered her own; Ollie, whose ask she carries, has not.
  const household = await prisma.household.create({ data: { eventId: event.id } });
  const sarah = await guest('Sarah', {
    daysAgo: 5,
    response: 'ACCEPTED',
    pe: { householdId: household.id, householdRole: 'PRIMARY_CONTACT' },
  });
  const olliePerson = await person('Ollie', { email: null });
  const olliePe = await prisma.personEvent.create({
    data: {
      personId: olliePerson.id,
      eventId: event.id,
      role: 'PARTICIPANT',
      householdId: household.id,
      householdRole: 'CHILD',
    },
  });
  const ollieItem = await prisma.item.create({
    data: { name: "Ollie's pavlova", teamId: team.id, status: 'ASSIGNED' },
  });
  created.items.push(ollieItem.id);
  await prisma.assignment.create({
    data: { itemId: ollieItem.id, personId: olliePerson.id, response: 'PENDING' },
  });
  await prisma.household.update({
    where: { id: household.id },
    data: { contactPersonEventId: sarah.peId },
  });

  // P3 survived without this: a carrier whose only answer is on her child's behalf.
  const kimHouse = await prisma.household.create({ data: { eventId: event.id } });
  const kim = await guest('Kim', {
    daysAgo: 5,
    pe: { householdId: kimHouse.id, householdRole: 'PRIMARY_CONTACT' },
  });
  const leo = await person('Leo', { email: null });
  await prisma.personEvent.create({
    data: {
      personId: leo.id,
      eventId: event.id,
      role: 'PARTICIPANT',
      householdId: kimHouse.id,
      householdRole: 'CHILD',
    },
  });
  const leoItem = await prisma.item.create({
    data: { name: 'lemonade', teamId: team.id, status: 'ASSIGNED' },
  });
  created.items.push(leoItem.id);
  await prisma.assignment.create({
    data: { itemId: leoItem.id, personId: leo.id, response: 'ACCEPTED' },
  });
  await prisma.household.update({
    where: { id: kimHouse.id },
    data: { contactPersonEventId: kim.peId },
  });

  await body({
    eventId: event.id,
    hostName: host.name,
    hostEmail: user.email,
    emailOnly,
    excepted,
    answered,
    texter,
    optedOut,
    sarah,
    ollie: { personId: olliePerson.id, peId: olliePe.id, email: null },
    late,
    itemless,
    partial,
    kim,
  });
}

// NZ noon, so the drain's quiet hours never decide an assertion.
function nzNoon(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0); // 12:00 or 13:00 NZ, both outside 21:00–08:00
  return d;
}

// ── LAYERS B–F — against the database. ───────────────────────────────────────
async function runDatabaseLayers() {
  process.env.NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
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
  const now = nzNoon();

  await layer('B', () =>
    withFixture(now, async (fx) => {
      const elig = await import('../src/lib/sms/nudge-eligibility');
      const r = await elig.findNudgeCandidatesForEvent(fx.eventId, now);
      const first = (g: Guest) =>
        r.eligibleFirst.find((c: any) => c.personEventId === g.peId) as any;
      const second = (g: Guest) =>
        r.eligibleSecond.find((c: any) => c.personEventId === g.peId) as any;
      const any = (g: Guest) => !!first(g) || !!second(g);

      assert(
        'B',
        'the finder now SEES a person with no phone — the SQL phone-only filter is gone',
        any(fx.emailOnly)
      );
      assert(
        'B',
        'GTC-311 line 1 — default on, email only, no exception: first leg, by EMAIL',
        first(fx.emailOnly)?.channel === 'EMAIL'
      );
      assert('B', 'GTC-311 line 2 — the host excepted him: chased by NOTHING', !any(fx.excepted));
      assert(
        'B',
        'D5 / F7 — a guest who has answered is NOT sent the first reminder (the defect fixed here)',
        !any(fx.answered)
      );
      assert('B', 'a usable mobile is chased by TEXT', first(fx.texter)?.channel === 'TEXT');
      assert(
        'B',
        'ruling O — opted out of texts: not chased, and never by email instead',
        !any(fx.optedOut)
      );
      assert(
        'B',
        "ruling R — Sarah answered her own, Ollie's is pending: SARAH is chased",
        first(fx.sarah)?.channel === 'EMAIL'
      );
      assert('B', 'and the child himself is never a candidate', !any(fx.ollie));
      assert(
        'B',
        'day eight, first leg taken: the SECOND leg, by email',
        second(fx.late)?.channel === 'EMAIL'
      );
      assert(
        'B',
        'an itemless guest who has not said whether they can come is chased',
        any(fx.itemless)
      );
      assert(
        'B',
        'D5 — a guest who answered one dish of two is still chased about the other',
        first(fx.partial)?.channel === 'EMAIL'
      );
      assert(
        'B',
        "the skip reasons still name the host's exception and the opt-out",
        ok(
          () =>
            r.skipped.some((s: any) => /hand/i.test(s.reason)) &&
            r.skipped.some((s: any) => s.reason === 'Opted out')
        )
      );

      // ── C — the scheduler writes rows and sends nothing.
      const sched = await import('../src/lib/sms/nudge-scheduler');
      stub();
      await sched.runNudgeScheduler(now, { eventIds: [fx.eventId] });
      const rows = await prisma.outboundMessage.findMany({
        where: { eventId: fx.eventId, kind: { in: ['CHASE_FIRST', 'CHASE_SECOND'] } },
      });
      const rowFor = (g: Guest, kind: string) =>
        rows.find((x) => x.personEventId === g.peId && x.kind === kind);
      assert(
        'C',
        'D2 — the scheduler wrote a CHASE_FIRST row, EMAIL, for the email-only guest',
        rowFor(fx.emailOnly, 'CHASE_FIRST')?.channel === 'EMAIL'
      );
      assert(
        'C',
        'and a TEXT row for the texter',
        rowFor(fx.texter, 'CHASE_FIRST')?.channel === 'TEXT'
      );
      assert(
        'C',
        'and a CHASE_SECOND row for day eight',
        rowFor(fx.late, 'CHASE_SECOND')?.channel === 'EMAIL'
      );
      assert(
        'C',
        'and NO row for the excepted, the answered or the opted-out',
        !rows.some((x) =>
          [fx.excepted.peId, fx.answered.peId, fx.optedOut.peId].includes(x.personEventId)
        )
      );
      assert(
        'C',
        'D2 — the scheduler itself called no provider',
        sent.length === 0 && nonResendCalls === 0
      );
      await sched.runNudgeScheduler(now, { eventIds: [fx.eventId] });
      const again = await prisma.outboundMessage.count({
        where: { eventId: fx.eventId, kind: { in: ['CHASE_FIRST', 'CHASE_SECOND'] } },
      });
      assert(
        'C',
        'a second tick writes no duplicate: a leg is taken once its row exists',
        again === rows.length
      );

      // N2 and N3 each survived alone: the finder and the queue both refuse a taken leg, so one
      // test covered both. Each is now asserted on its own.
      const after = await elig.findNudgeCandidatesForEvent(fx.eventId, now);
      assert(
        'C',
        'the FINDER no longer offers a leg whose row exists (N2)',
        !after.eligibleFirst.some((c: any) => c.personEventId === fx.emailOnly.peId)
      );
      const sender = await import('../src/lib/sms/nudge-sender');
      const replay = await sender.queueChase({
        eligibleFirst: [first(fx.emailOnly)],
        eligibleSecond: [],
      });
      assert(
        'C',
        'the QUEUE refuses a leg whose row exists, handed the stale candidate directly (N3)',
        replay.length === 1 &&
          replay[0].queued === false &&
          (await prisma.outboundMessage.count({
            where: { personEventId: fx.emailOnly.peId, kind: 'CHASE_FIRST' },
          })) === 1
      );

      // 8a's block reaches a queued reminder: the address is blocked after the tick queued it.
      const blockedGuest = await prisma.outboundMessage.findFirst({
        where: { personEventId: fx.late.peId, kind: 'CHASE_SECOND' },
      });
      await (prisma as any).emailBlock.create({
        data: { address: fx.late.email!.toLowerCase(), reason: 'BOUNCED' },
      });
      blockedAddresses.push(fx.late.email!.toLowerCase());

      // D5 at the send: Ivy says she can come AFTER her reminder was queued.
      const ivyQueued = rowFor(fx.itemless, 'CHASE_FIRST');
      assert(
        'C',
        "the itemless guest's reminder was queued (by email)",
        ivyQueued?.channel === 'EMAIL'
      );
      await prisma.personEvent.update({
        where: { id: fx.itemless.peId },
        data: { attendanceAnswer: 'YES' },
      });

      // ── D — the dispatcher sends them.
      const dispatch = await import('../src/lib/press/dispatch');
      stub();
      await dispatch.drainOnce(prisma, 500, now);
      const toAnn = sent.find((s) => s.to.includes(fx.emailOnly.email!));
      assert('D', 'GTC-311 line 1 — the chase email went to her address', !!toAnn);
      assert(
        'D',
        'W7 — greeting her by name, byte-exact to its link',
        ok(() =>
          toAnn!.text!.startsWith(
            `Hi Ann - Gather here again, helping Kate with this one. I haven't heard from you yet. One tap to say yes, no or maybe: http`
          )
        )
      );
      assert(
        'D',
        "W6 — the ask's subject",
        ok(() => toAnn!.subject === `${TAG} Christmas — from Kate`)
      );
      assert(
        'D',
        'ruling F — replies go to the host',
        ok(() => JSON.stringify(toAnn!.replyTo).includes(fx.hostEmail))
      );
      assert(
        'D',
        'GTC-296 ruling Q — the reminder carries the way out, header and link',
        ok(() => !!toAnn!.headers?.['List-Unsubscribe'] && /unsubscribe/.test(toAnn!.text!))
      );
      const toSarah = sent.find((s) => s.to.includes(fx.sarah.email!));
      assert(
        'D',
        'ruling R — Sarah is chased about Ollie: "I haven\'t heard back about Ollie yet."',
        ok(() => toSarah!.text!.includes("I haven't heard back about Ollie yet."))
      );
      const louRow = await prisma.outboundMessage.findUnique({ where: { id: blockedGuest!.id } });
      assert(
        'D',
        'GTC-324 ruling 2 — a reminder to an address blocked after it was queued is WITHHELD, EMAIL_BLOCKED',
        louRow?.withheldWhy === 'EMAIL_BLOCKED'
      );
      assert(
        'D',
        'and nothing went to that address',
        !sent.some((x) => x.to.includes(fx.late.email!))
      );
      const ann = await prisma.personEvent.findUnique({ where: { id: fx.emailOnly.peId } });
      assert(
        'D',
        "acceptance stamps the membership's first-leg column, as the text path always did",
        !!ann?.firstNudgeSentAt
      );
      const timRow = await prisma.outboundMessage.findFirst({
        where: { personEventId: fx.texter.peId, kind: 'CHASE_FIRST' },
      });
      assert(
        'D',
        'the text row ends at SMS_DISABLED here — withheld before any provider call',
        timRow?.withheldWhy === 'SMS_DISABLED'
      );
      assert('D', 'nothing but the stub was reached', nonResendCalls === 0);
      const toPat = sent.find((x) => x.to.includes(fx.partial.email!));
      assert(
        'D',
        'THE 8b-HOLD RULE, end to end — Pat answered one dish, and her reminder names the open one',
        ok(() => toPat!.text!.includes("I haven't heard back about the Pat’s salad yet."))
      );
      assert(
        'D',
        'and never tells her "I haven\'t heard from you"',
        ok(() => !/heard from you/.test(toPat!.text!))
      );
      const toKim = sent.find((x) => x.to.includes(fx.kim.email!));
      assert(
        'D',
        'a carrier who answered only her child\'s rows has answered SOMETHING — her own open dish by name, never "you" (P3, ruled 2026-09-28)',
        ok(
          () =>
            toKim!.text!.includes("I haven't heard back about the Kim's dish yet.") &&
            !/heard from you/.test(toKim!.text!)
        )
      );
      const ivyRow = await prisma.outboundMessage.findUnique({ where: { id: ivyQueued!.id } });
      assert(
        'D',
        'D5 at the send — she answered between queue and send: WITHHELD, ANSWERED',
        ivyRow?.withheldWhy === 'ANSWERED'
      );
      assert('D', 'and nothing went to her', !sent.some((x) => x.to.includes(fx.itemless.email!)));

      // ── E — the board and the door read the ASK, never a chase row (F2).
      const glance = await import('../src/lib/glance/read');
      await prisma.outboundMessage.updateMany({
        where: { personEventId: fx.itemless.peId, kind: 'ASK' },
        data: { rejectedAt: new Date(now.getTime() - DAY) },
      });
      await prisma.outboundMessage.create({
        data: {
          eventId: fx.eventId,
          personEventId: fx.itemless.peId,
          kind: 'CHASE_FIRST',
          channel: 'EMAIL',
          withheldAt: now,
          withheldWhy: 'HANDED_TO_HOST',
          createdAt: now,
        },
      });
      /*
       * ⚠ PIN MOVED BY [[GTC-305]]'s ITEMLESS-YES RULING (founder, 2026-09-28). Ivy said YES in
       * layer D, and an itemless yes now reads GREEN above a delivery failure — an answer is proof
       * the ask arrived. So F2 is measured on her UNDECIDED, which is the case it is about, and the
       * ruling is asserted beside it rather than silently absorbed.
       */
      const withYes = await glance.readEventGlance(prisma, fx.eventId, now);
      const ivyYes = [
        ...withYes.households.flatMap((h: any) => h.members),
        ...withYes.unhoused,
      ].find((p: any) => p.personId === fx.itemless.personId);
      assert(
        'E',
        'GTC-305 ITEMLESS YES — having said yes, she reads GREEN though her ask failed',
        ivyYes?.state === 'GREEN'
      );
      await prisma.personEvent.update({
        where: { id: fx.itemless.peId },
        data: { attendanceAnswer: null },
      });
      const g = await glance.readEventGlance(prisma, fx.eventId, now);
      const everyone = [...g.households.flatMap((h: any) => h.members), ...g.unhoused];
      const ivy = everyone.find((p: any) => p.personId === fx.itemless.personId);
      assert(
        'E',
        'F2 — a newer chase row does not mask the failed ask: she is still RED',
        ivy?.state === 'RED'
      );
      assert(
        'E',
        "and the door still opens on that ask's failure",
        ok(() => (ivy!.reasons as string[]).includes('NOT_DELIVERED'))
      );
    })
  );
}

// ── LAYER S — structural. ─────────────────────────────────────────────────────
async function runStructuralLayer() {
  const finder = read('src/lib/sms/nudge-eligibility.ts');
  assert(
    'S',
    'the SQL phone-only filter is gone from findNudgeCandidates',
    !/phoneNumber:\s*\{\s*not:\s*null\s*\}/.test(finder)
  );
  assert(
    'S',
    "GTC-296's duplicated gate collapses to one place: the finder asks the chooser, and has no email opt-out check of its own",
    /readAskPreview/.test(finder) && !/emailOptedOutFact|listEmailOptOutsForEvent/.test(finder)
  );
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
    });
  assert(
    'S',
    'ruling V / AE, D2 — the proxy reminder is deleted: its finder and sender are gone',
    !existsSync(join(ROOT, 'src/lib/sms/proxy-nudge-eligibility.ts')) &&
      !existsSync(join(ROOT, 'src/lib/sms/proxy-nudge-sender.ts'))
  );
  assert(
    'S',
    'and the scheduler no longer calls it',
    !/Proxy|proxy/.test(
      read('src/lib/sms/nudge-scheduler.ts').replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '')
    )
  );
  // GTC-295's last read: every remaining mention of contactMethod in src/ is a WRITE, never a read of the column.
  // A READ of the column is a `select` of it or a comparison against it. `reach.contactMethod` in
  // reconcileMembers.ts is a locally computed value being WRITTEN, and must not count.
  const reads = walk(join(ROOT, 'src')).filter((f) => {
    const code = readFileSync(f, 'utf8').replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '');
    return /contactMethod:\s*true/.test(code) || /\.contactMethod\s*[!=]==?/.test(code);
  });
  assert(
    'S',
    `GTC-295 — nothing in src/ reads PersonEvent.contactMethod (found: ${reads.map((f) => f.replace(ROOT + '/', '')).join(', ') || 'none'})`,
    reads.length === 0
  );
  assert(
    'S',
    'F2 — the board reads ASK rows only',
    /kind:\s*'ASK'/.test(read('src/lib/glance/read.ts'))
  );
  assert(
    'S',
    'F2 — the door reads ASK rows only',
    /where:\s*\{\s*personEventId:\s*membership\.id,\s*kind:\s*'ASK'/.test(
      read('src/lib/press/resend.ts')
    )
  );
  assert(
    'S',
    'the chase words live in their own register',
    existsSync(join(ROOT, 'src/lib/messages/chase-register.ts'))
  );
}

async function main() {
  console.log('\n=== GTC-189 slice 8b — the chase ===\n');
  await layer('A', runWordsLayer);
  await runDatabaseLayers();
  await layer('S', runStructuralLayer);
}

main()
  .catch((e) => {
    console.error(e);
    failed++;
  })
  .finally(async () => {
    globalThis.fetch = realFetch;
    const del = async (fn: () => Promise<unknown>) => {
      try {
        await fn();
      } catch (e) {
        console.error('cleanup:', (e as Error).message.split('\n')[0]);
      }
    };
    const ev = { in: created.events };
    await del(() =>
      (prisma as any).emailBlock.deleteMany({ where: { address: { in: blockedAddresses } } })
    );
    await del(() => prisma.emailOptOut.deleteMany({ where: { eventId: ev } }));
    await del(() => prisma.outboundMessage.deleteMany({ where: { eventId: ev } }));
    await del(() => prisma.inviteEvent.deleteMany({ where: { eventId: ev } }));
    await del(() => prisma.auditEntry.deleteMany({ where: { eventId: ev } }));
    await del(() => prisma.assignment.deleteMany({ where: { itemId: { in: created.items } } }));
    await del(() => prisma.item.deleteMany({ where: { id: { in: created.items } } }));
    await del(() => prisma.accessToken.deleteMany({ where: { eventId: ev } }));
    await del(() =>
      prisma.household.updateMany({ where: { eventId: ev }, data: { contactPersonEventId: null } })
    );
    await del(() => prisma.personEvent.deleteMany({ where: { eventId: ev } }));
    await del(() => prisma.household.deleteMany({ where: { eventId: ev } }));
    await del(() => prisma.team.deleteMany({ where: { id: { in: created.teams } } }));
    await del(() => prisma.eventRole.deleteMany({ where: { eventId: ev } }));
    await del(() => prisma.event.deleteMany({ where: { id: ev } }));
    await del(() => prisma.person.deleteMany({ where: { id: { in: created.people } } }));
    await del(() => prisma.user.deleteMany({ where: { id: { in: created.users } } }));
    await prisma.$disconnect();
    console.log(`\nTotal tests: ${passed + failed}   Passed: ${passed}   Failed: ${failed}`);
    if (failed > 0) {
      console.log('\nRED:');
      for (const r of red) console.log(`  ${r}`);
    }
    process.exit(failed > 0 ? 1 : 0);
  });
