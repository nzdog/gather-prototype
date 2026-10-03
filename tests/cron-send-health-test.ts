/**
 * [[GTC-339]] — a sending cron reports a failed run when, on either channel, it had sends to make
 * and none of them got out.
 *
 * Founder ruling Q1, 2026-09-30, verbatim as chosen: *"Per channel (Recommended)"* — *"Fails if it
 * tried to send texts and none got out, or tried emails and none got out, so broken texting shows up
 * even while emails go fine. Nothing to send: OK. One bad address among messages that went: OK. A
 * text stopped because texting isn't set up or the live switch is off counts as not got out. Held
 * back for a reason about the guest or you (an opt-out, your mark, an answer, a number that isn't
 * valid) never counts. The security test stays as it is."*
 *
 * THE LAYERS:
 *  P  preconditions — everything each route touches is empty outside this suite's fixtures, or stop
 *  R  the three routes, their `GET` imported and called in process (no HTTP, no dev server)
 *  D  the dispatchers with an injected `now`, so the text channel is deterministic at any hour
 *  U  the rule, pure
 *  S  source: the poll is not an input; success and status come from one verdict
 *
 * ⚠ AN APPROVED EXCEPTION TO "NO CRON AGAINST gather_dev" (founder ruling, GTC-339 plan), on three
 * conditions: layer P covers everything each route touches and stops on any non-zero count outside
 * the fixtures; gather_dev is asserted back as found after every case, by count and by id; and the
 * exception is recorded in GATHER-BUILD-CONSTANTS.md beside test:security's live layer.
 *
 * NOTHING IS SENT. Every ambient provider key is stripped and FAKES are set; `installProviderTrap`
 * walls the process and answers every fetch with a counted fake 200. The gate is closed for every
 * switch-off case; the success legs open it with `liveBehindTrap` (ruling A — the one way GTC-274
 * allows) and close it in their own `finally`. Every case asserts its trap hits exactly, by name.
 *
 * ONE PROCESS SHOWS BOTH CAUSES OF `SMS_DISABLED`: TNZ has a fake token and Twilio has none, so a
 * +64 number with the gate closed stops at the switch and a +1 number stops at configuration.
 *
 * Run: npx tsx tests/cron-send-health-test.ts
 */

import fs from 'fs';
import path from 'path';

// ── The process, before any module that captures configuration is loaded ────────────────────────
for (const k of [
  'TNZ_AUTH_TOKEN',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_PHONE_NUMBER',
  'RESEND_API_KEY',
  'GATHER_LIVE_SENDS',
]) {
  delete process.env[k];
}
process.env.TNZ_AUTH_TOKEN = 'gtc339-fake-tnz-token';
process.env.RESEND_API_KEY = 're_gtc339_fake_key_0000000000000000';
process.env.UNSUBSCRIBE_TOKEN_SECRET = 'gtc339-fake-unsubscribe-secret';
process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
// Read at module scope by each route, so set before the first import (see nudge-provider-gate D).
process.env.CRON_SECRET = 'gtc339-cron-health-test';

const TAG = 'GTC339';
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const RESEND_SEND = 'fetch api.resend.com/emails';
const RESEND_READ = 'fetch api.resend.com/emails/gtc274-fake-id';
const TNZ_SEND = 'fetch api.tnz.co.nz/api/v2.04/send/sms';

let passed = 0;
let failed = 0;
const red: string[] = [];

function assert(layer: string, label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`\x1b[32m✓\x1b[0m [${layer}] ${label}`);
    passed++;
  } else {
    console.error(`\x1b[31m✗\x1b[0m [${layer}] ${label}${detail ? `\n    ${detail}` : ''}`);
    failed++;
    red.push(`[${layer}] ${label}`);
  }
}

function ok(fn: () => boolean): boolean {
  try {
    return fn() === true;
  } catch {
    return false;
  }
}

function code(rel: string): string {
  try {
    return fs
      .readFileSync(path.join(__dirname, '..', rel), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
  } catch {
    return '';
  }
}

const same = (a: string[], b: string[]) => JSON.stringify(a) === JSON.stringify(b);
const sorted = (a: string[]) => [...a].sort();

async function main() {
  const trap = await import('./helpers/provider-trap');
  trap.installProviderTrap();
  const hitsSince = (n: number) =>
    trap
      .trapHits()
      .slice(n)
      .map((h) => `${h.via} ${h.target}`);
  let expectedTotal = 0;
  /** Assert exactly these hits since `from`, and add them to the suite's running total. */
  function expectHits(
    layer: string,
    label: string,
    from: number,
    expected: string[],
    ordered = false
  ) {
    const got = hitsSince(from);
    const match = ordered ? same(got, expected) : same(sorted(got), sorted(expected));
    assert(
      layer,
      `${label} — trap hits exactly ${JSON.stringify(expected)}`,
      match,
      JSON.stringify(got)
    );
    expectedTotal += expected.length;
  }

  const { prisma } = await import('../src/lib/prisma');
  const { SENT_AND_LIVE } = await import('../src/lib/lifecycle');
  const { isQuietHours } = await import('../src/lib/sms/quiet-hours');
  const { readAskPreview, askRowPopulation } = await import('../src/lib/preflight/ask-preview');
  const press: any = await import('../src/lib/press/press');
  const dispatch: any = await import('../src/lib/press/dispatch');
  const wrapUp: any = await import('../src/lib/wrap-up');
  const decideBySender: any = await import('../src/lib/sms/decide-by-sender');
  const outboundRoute: any = await import('../src/app/api/cron/outbound-dispatch/route');
  const wrapUpRoute: any = await import('../src/app/api/cron/wrap-up-dispatch/route');
  const decideByRoute: any = await import('../src/app/api/cron/decide-by-followups/route');
  const { NextRequest } = await import('next/server');

  // Loaded behind a catch: it does not exist before GTC-339, and layer R must still run at HEAD.
  let health: any = null;
  try {
    health = await import('../src/lib/send-health');
  } catch (e) {
    console.error(
      `\x1b[31m!\x1b[0m src/lib/send-health.ts did not load: ${(e as Error).message.split('\n')[0]}`
    );
  }

  // An NZ daytime instant and an NZ quiet-hours instant, found rather than assumed.
  const findHour = (quiet: boolean) => {
    for (let h = 0; h < 48; h++) {
      const t = new Date(Date.now() - h * HOUR);
      if (isQuietHours(t) === quiet) return t;
    }
    throw new Error('no such hour');
  };
  const DAYTIME = findHour(false);
  const NIGHT = findHour(true);

  /** Open the live gate for one case only, behind the trap's walls. */
  async function withGate<T>(fn: () => Promise<T>): Promise<T> {
    const close = trap.liveBehindTrap();
    try {
      return await fn();
    } finally {
      close();
    }
  }

  const drive = async (mod: any, p: string) => {
    const res: Response = await mod.GET(
      new NextRequest(
        `http://localhost:3000${p}?secret=${encodeURIComponent(process.env.CRON_SECRET!)}`
      )
    );
    return { status: res.status, body: (await res.json()) as any };
  };

  // ══ LAYER P — preconditions (founder condition 1) ══════════════════════════════════════════
  // Everything each route touches, counted OUTSIDE the given fixture events.
  async function outside(fx: string[]) {
    const notFx = { notIn: fx };
    const now = new Date();
    const drain =
      (await prisma.outboundMessage.count({
        where: { attemptedAt: null, withheldAt: null, eventId: notFx },
      })) +
      (await prisma.outboundMessage.count({
        where: { nextAttemptAt: { not: null, lte: now }, eventId: notFx },
      }));
    // The mini-send sweep: `enrolMiniSends`' event query, then its own predicate.
    const pressed = await prisma.event.findMany({
      where: { id: notFx, sentAt: { not: null }, outboundMessages: { some: { kind: 'ASK' } } },
      select: { id: true },
    });
    let miniSend = 0;
    for (const e of pressed) {
      const preview = await readAskPreview(prisma as any, e.id, process.env.NEXT_PUBLIC_APP_URL!);
      if (!preview) continue;
      const dealt = new Set(
        (
          await prisma.outboundMessage.findMany({
            where: { eventId: e.id, kind: 'ASK' },
            select: { personEventId: true },
          })
        ).map((r) => r.personEventId)
      );
      miniSend += askRowPopulation(preview.recipients).ready.filter(
        (r) => !dealt.has(r.personEventId)
      ).length;
    }
    // The delivery poll: the union of `retireUnjoinable`, `findNeverChecked`, `findDueForCheck`.
    const poll = await prisma.outboundMessage.count({
      where: {
        channel: 'EMAIL',
        deliveryPollDoneAt: null,
        acceptedAt: { not: null },
        eventId: notFx,
      },
    });
    // test:security suite 12's two counts, verbatim but for the fixture exclusion.
    const wrapUps = await prisma.wrapUpLink.count({ where: { dispatched: false, eventId: notFx } });
    const decideBy = await prisma.assignment.count({
      where: {
        response: 'MAYBE',
        decideByFollowupSentAt: null,
        item: { team: { eventId: notFx, event: SENT_AND_LIVE() } },
        person: { OR: [{ phoneNumber: { not: null } }, { email: { not: null } }] },
      },
    });
    /*
     * [[GTC-258]] (M6, approved 2026-10-02) — the follow-up and thank-you crons now also send one
     * email retry for a text TNZ reported failed. Every retryable outcome, either kind, not yet
     * retried: a superset of what either sweep would take, which is the safe side of a precondition.
     */
    const textRetries = await (prisma as any).outboundMessage.count({
      where: {
        kind: { in: ['DECIDE_BY_FOLLOWUP', 'THANK_YOU'] },
        channel: 'TEXT',
        deliveryState: {
          in: [
            'TEXT_DEAD_CHANNEL',
            'TEXT_OPTED_OUT',
            'TEXT_OUR_FAULT',
            'TEXT_UNDELIVERED',
            'TEXT_FAILED_UNRECOGNISED',
          ],
        },
        retries: { none: {} },
        eventId: notFx,
      },
    });
    return { drain, miniSend, poll, wrapUps, decideBy, textRetries };
  }
  const nonZero = (c: Record<string, number>) =>
    Object.entries(c)
      .filter(([, v]) => v !== 0)
      .map(([k, v]) => `${k}=${v}`);

  const p0 = await outside([]);
  console.log(`\n\x1b[1mP — preconditions on gather_dev\x1b[0m ${JSON.stringify(p0)}\n`);
  assert(
    'P',
    'every count outside the fixtures is zero',
    nonZero(p0).length === 0,
    nonZero(p0).join(', ')
  );
  if (nonZero(p0).length > 0) {
    console.error(
      '\n⚠ STOP — a route would touch rows that are not this suite’s. Nothing was driven.'
    );
    await prisma.$disconnect();
    process.exit(1);
  }
  const before = {
    outbound: await prisma.outboundMessage.count(),
    inviteEvents: await prisma.inviteEvent.count(),
    wrapUps: await prisma.wrapUpLink.count(),
  };

  // ── Fixtures, each removed by id ────────────────────────────────────────────────────────────
  type Fx = {
    events: string[];
    persons: string[];
    users: string[];
    links: string[];
    optOuts: string[];
    addresses: string[];
  };
  const newFx = (): Fx => ({
    events: [],
    persons: [],
    users: [],
    links: [],
    optOuts: [],
    addresses: [],
  });
  let seq = 0;
  const uniq = () => `${Date.now()}-${++seq}`;

  async function teardown(fx: Fx) {
    await prisma.wrapUpLink.deleteMany({ where: { id: { in: fx.links } } });
    await prisma.smsOptOut.deleteMany({ where: { id: { in: fx.optOuts } } });
    await prisma.emailBlock.deleteMany({ where: { address: { in: fx.addresses } } });
    for (const eventId of fx.events) {
      await prisma.emailOptOut.deleteMany({ where: { eventId } });
      await prisma.outboundMessage.deleteMany({ where: { eventId } });
      await prisma.assignment.deleteMany({ where: { item: { team: { eventId } } } });
      await prisma.item.deleteMany({ where: { team: { eventId } } });
      await prisma.accessToken.deleteMany({ where: { eventId } });
      await prisma.inviteEvent.deleteMany({ where: { eventId } });
      await prisma.auditEntry.deleteMany({ where: { eventId } });
      await prisma.personEvent.deleteMany({ where: { eventId } });
      await prisma.team.deleteMany({ where: { eventId } });
      await prisma.eventRole.deleteMany({ where: { eventId } });
      await prisma.event.deleteMany({ where: { id: eventId } });
    }
    await prisma.person.deleteMany({ where: { id: { in: fx.persons } } });
    await prisma.user.deleteMany({ where: { id: { in: fx.users } } });
  }

  /** Founder condition 2: after each run, gather_dev is back as found — by count and by id. */
  async function assertRestored(layer: string, label: string, fx: Fx) {
    const left =
      (await prisma.event.count({ where: { id: { in: fx.events } } })) +
      (await prisma.person.count({ where: { id: { in: fx.persons } } })) +
      (await prisma.user.count({ where: { id: { in: fx.users } } })) +
      (await prisma.wrapUpLink.count({ where: { id: { in: fx.links } } })) +
      (await prisma.smsOptOut.count({ where: { id: { in: fx.optOuts } } })) +
      (await prisma.emailBlock.count({ where: { address: { in: fx.addresses } } }));
    const after = {
      outbound: await prisma.outboundMessage.count(),
      inviteEvents: await prisma.inviteEvent.count(),
      wrapUps: await prisma.wrapUpLink.count(),
    };
    assert(
      layer,
      `${label} — restored: no fixture id survives, and the three counts are as found`,
      left === 0 && same(Object.values(after).map(String), Object.values(before).map(String)),
      `${left} fixture row(s) left; ${JSON.stringify(before)} → ${JSON.stringify(after)}`
    );
  }

  /** Run one case with its own fixture, re-checking layer P outside it first, and restore after. */
  async function caseOf(layer: string, label: string, fn: (fx: Fx) => Promise<void>) {
    const fx = newFx();
    try {
      await fn(fx);
    } catch (e) {
      assert(layer, `${label} — ran without throwing`, false, (e as Error).message.split('\n')[0]);
    } finally {
      await teardown(fx);
      await assertRestored(layer, label, fx);
    }
  }
  async function guard(layer: string, fx: Fx): Promise<boolean> {
    const c = await outside(fx.events);
    const bad = nonZero(c);
    assert(
      layer,
      'precondition re-checked outside this fixture: all zero',
      bad.length === 0,
      bad.join(', ')
    );
    return bad.length === 0;
  }

  /** A host with an account (the reply-to) and an event. */
  async function hostEvent(fx: Fx, o: { sentAt?: Date | null; endDate?: Date } = {}) {
    const id = uniq();
    const user = await prisma.user.create({ data: { email: `gtc339+host-${id}@example.test` } });
    fx.users.push(user.id);
    const host = await prisma.person.create({
      data: { name: `${TAG} Kate ${id}`, email: user.email, userId: user.id },
    });
    fx.persons.push(host.id);
    const endDate = o.endDate ?? new Date(Date.now() + 7 * DAY);
    const event = await prisma.event.create({
      data: {
        name: `${TAG} ${id}`,
        startDate: endDate,
        endDate,
        hostId: host.id,
        status: 'CONFIRMING',
        sentAt: o.sentAt ?? null,
      },
    });
    fx.events.push(event.id);
    await prisma.eventRole.create({ data: { eventId: event.id, userId: user.id, role: 'HOST' } });
    const team = await prisma.team.create({ data: { name: `${TAG} Mains`, eventId: event.id } });
    await prisma.personEvent.create({
      data: { personId: host.id, eventId: event.id, role: 'HOST' },
    });
    return { event, team, host };
  }

  async function guest(
    fx: Fx,
    e: Awaited<ReturnType<typeof hostEvent>>,
    o: {
      email?: boolean;
      phone?: string | null;
      response?: 'PENDING' | 'MAYBE';
      sentAt?: Date;
    } = {}
  ) {
    const id = uniq();
    const p = await prisma.person.create({
      data: {
        name: `${TAG} Guest ${id}`,
        email: o.email === false ? null : `gtc339+guest-${id}@example.test`,
        phoneNumber: o.phone ?? null,
      },
    });
    fx.persons.push(p.id);
    const pe = await prisma.personEvent.create({
      data: { personId: p.id, eventId: e.event.id, role: 'PARTICIPANT', sentAt: o.sentAt ?? null },
    });
    const item = await prisma.item.create({
      data: { name: `${TAG} dish ${id}`, teamId: e.team.id, status: 'ASSIGNED' },
    });
    const a = await prisma.assignment.create({
      data: { itemId: item.id, personId: p.id, response: o.response ?? 'PENDING' },
    });
    return { p, pe, assignmentId: a.id };
  }

  /** A pressed event — its ask rows written by the real writer, `pressSend`. */
  async function pressed(fx: Fx, guests: { email?: boolean; phone?: string | null }[]) {
    const e = await hostEvent(fx);
    const gs = [];
    for (const g of guests) gs.push(await guest(fx, e, g));
    const r = await press.pressSend(prisma, {
      eventId: e.event.id,
      actor: { id: e.host.id, kind: 'HOST' as const, name: e.host.name },
      baseUrl: process.env.NEXT_PUBLIC_APP_URL,
    });
    if (!r?.ok) throw new Error(`fixture press refused: ${JSON.stringify(r)}`);
    return { ...e, guests: gs };
  }

  /** A wrap-up link, old enough to dispatch at `at`. */
  async function wrapLink(
    fx: Fx,
    o: { channel: 'sms' | 'email'; phone?: string | null; email?: boolean; at: Date }
  ) {
    const e = await hostEvent(fx);
    const g = await guest(fx, e, { email: o.email !== false, phone: o.phone ?? null });
    const link = await prisma.wrapUpLink.create({
      data: {
        token: `${TAG}-${uniq()}`,
        eventId: e.event.id,
        personId: g.p.id,
        guestName: g.p.name,
        guestEmail: g.p.email,
        guestPhone: o.phone ?? null,
        channel: o.channel,
        expiresAt: new Date(o.at.getTime() + 30 * DAY),
        createdAt: new Date(o.at.getTime() - 11 * 60 * 1000),
      },
    });
    fx.links.push(link.id);
    return { ...e, g, link };
  }

  /** A decide-by maybe whose follow-up is due now: decide-by 6h out, so inside every lead. */
  async function maybe(fx: Fx, o: { email?: boolean; phone?: string | null }) {
    const D = new Date(Date.now() + 6 * HOUR);
    const e = await hostEvent(fx, {
      sentAt: new Date(Date.now() - 3 * DAY),
      endDate: new Date(D.getTime() + 120 * HOUR),
    });
    const g = await guest(fx, e, {
      ...o,
      response: 'MAYBE',
      sentAt: new Date(Date.now() - 3 * DAY),
    });
    await prisma.accessToken.create({
      data: {
        token: `${TAG}-${uniq()}`,
        scope: 'PARTICIPANT',
        eventId: e.event.id,
        personId: g.p.id,
      },
    });
    return { ...e, g };
  }

  /** A hand-built candidate on real fixture ids, for the sender's own classification. */
  async function candidate(
    fx: Fx,
    o: { channel: 'TEXT' | 'EMAIL'; phone?: string | null; replyTo?: boolean; email?: boolean }
  ) {
    const e = await hostEvent(fx, { sentAt: new Date(Date.now() - 3 * DAY) });
    const g = await guest(fx, e, {
      email: o.email !== false,
      phone: o.phone ?? null,
      response: 'MAYBE',
    });
    return {
      personId: g.p.id,
      personName: g.p.name,
      channel: o.channel,
      phoneNumber: o.channel === 'TEXT' ? (o.phone ?? null) : null,
      email: o.channel === 'EMAIL' ? g.p.email : null,
      replyTo: o.replyTo === false ? null : e.host.email,
      eventId: e.event.id,
      eventName: e.event.name,
      hostId: e.host.id,
      hostName: e.host.name,
      participantToken: `${TAG}-token-${uniq()}`,
      itemName: 'pavlova',
      decideByAt: new Date(Date.now() + 6 * HOUR),
      assignmentIds: [g.assignmentId],
    };
  }

  const verdict = (tally: any) => (health ? health.sendRunHealth(tally) : null);
  const healthOf = (
    layer: string,
    label: string,
    tally: any,
    want: { ok: boolean; failed: string[] }
  ) => {
    const v = verdict(tally);
    assert(
      layer,
      `${label} — ${want.ok ? 'healthy' : `failed: ${want.failed.join(', ')}`}`,
      !!v && v.ok === want.ok && same(v.failedChannels, want.failed),
      `tally ${JSON.stringify(tally)} → ${JSON.stringify(v)}`
    );
  };
  const tallyIs = (
    layer: string,
    label: string,
    tally: any,
    text: [number, number],
    email: [number, number]
  ) =>
    assert(
      layer,
      `${label} — tally text ${text[0]}/${text[1]}, email ${email[0]}/${email[1]} (to send / got out)`,
      ok(
        () =>
          tally.text.toSend === text[0] &&
          tally.text.gotOut === text[1] &&
          tally.email.toSend === email[0] &&
          tally.email.gotOut === email[1]
      ),
      JSON.stringify(tally)
    );
  const routeFailed = (
    layer: string,
    label: string,
    r: { status: number; body: any },
    failedCh: string[]
  ) =>
    assert(
      layer,
      `${label} — 500, success: false, failedChannels ${JSON.stringify(failedCh)}`,
      r.status === 500 &&
        r.body.success === false &&
        same(r.body.health?.failedChannels ?? null, failedCh),
      `status ${r.status}; success ${r.body.success}; health ${JSON.stringify(r.body.health)}`
    );
  const routeHealthy = (layer: string, label: string, r: { status: number; body: any }) =>
    assert(
      layer,
      `${label} — 200, success: true`,
      r.status === 200 && r.body.success === true,
      `status ${r.status}; body ${JSON.stringify(r.body).slice(0, 300)}`
    );
  const wireIsCounts = (layer: string, label: string, r: { body: any }) =>
    assert(
      layer,
      `${label} — the body carries errorCount and no \`errors\` key (GTC-270)`,
      typeof r.body.errorCount === 'number' && !('errors' in r.body),
      Object.keys(r.body).join(', ')
    );

  try {
    // ══ LAYER R — the routes, in process ═════════════════════════════════════════════════════
    console.log('\n\x1b[1mR — the routes, gate closed\x1b[0m\n');

    await caseOf('R1', 'outbound-dispatch, an email the switch stops', async (fx) => {
      await pressed(fx, [{ email: true }]);
      if (!(await guard('R1', fx))) return;
      const n = trap.trapCount();
      const r = await drive(outboundRoute, '/api/cron/outbound-dispatch');
      routeFailed('R1', 'its one email did not get out', r, ['email']);
      wireIsCounts('R1', 'outbound-dispatch', r);
      expectHits('R1', 'gate closed', n, []);
    });

    await caseOf('R2', 'outbound-dispatch, nothing to send', async (fx) => {
      if (!(await guard('R2', fx))) return;
      const n = trap.trapCount();
      const r = await drive(outboundRoute, '/api/cron/outbound-dispatch');
      routeHealthy('R2', 'an idle run is a working run', r);
      expectHits('R2', 'nothing to send', n, []);
    });

    await caseOf('R3', 'decide-by-followups, an email the switch stops', async (fx) => {
      await maybe(fx, { email: true });
      if (!(await guard('R3', fx))) return;
      const n = trap.trapCount();
      const r = await drive(decideByRoute, '/api/cron/decide-by-followups');
      routeFailed('R3', 'its one email did not get out', r, ['email']);
      wireIsCounts('R3', 'decide-by-followups', r);
      expectHits('R3', 'gate closed', n, []);
    });

    await caseOf('R4', 'wrap-up-dispatch, an email the switch stops', async (fx) => {
      await wrapLink(fx, { channel: 'email', at: new Date() });
      if (!(await guard('R4', fx))) return;
      const n = trap.trapCount();
      const quiet = isQuietHours(new Date());
      const r = await drive(wrapUpRoute, '/api/cron/wrap-up-dispatch');
      if (quiet) {
        console.log('   (R4 ran in NZ quiet hours: the whole batch defers)');
        routeHealthy('R4', 'quiet hours: deferring is the machinery working', r);
        assert('R4', 'and it deferred the one link', r.body.deferred === 1, JSON.stringify(r.body));
      } else {
        console.log('   (R4 ran in NZ daytime)');
        routeFailed('R4', 'its one email did not get out', r, ['email']);
      }
      wireIsCounts('R4', 'wrap-up-dispatch', r);
      expectHits('R4', 'gate closed', n, []);
    });

    console.log('\n\x1b[1mR — the routes, gate open (liveBehindTrap)\x1b[0m\n');

    await caseOf(
      'R5',
      'outbound-dispatch, an email accepted, then the poll reads it',
      async (fx) => {
        await pressed(fx, [{ email: true }]);
        if (!(await guard('R5', fx))) return;
        const n = trap.trapCount();
        const r = await withGate(() => drive(outboundRoute, '/api/cron/outbound-dispatch'));
        routeHealthy('R5', 'its one email got out', r);
        assert(
          'R5',
          'health: email 1 to send, 1 got out; text idle',
          ok(
            () =>
              r.body.health.email.toSend === 1 &&
              r.body.health.email.gotOut === 1 &&
              r.body.health.text.toSend === 0
          ),
          JSON.stringify(r.body.health)
        );
        assert(
          'R5',
          'the poll considered one row and read it once — unreadable, as the fake carries no last_event',
          ok(
            () =>
              r.body.poll.considered === 1 && r.body.poll.unreadable === 1 && r.body.poll.read === 0
          ),
          JSON.stringify(r.body.poll)
        );
        expectHits('R5', 'the send, then the poll’s read', n, [RESEND_SEND, RESEND_READ], true);
      }
    );

    await caseOf('R6', 'wrap-up-dispatch, the text fails and the email goes', async (fx) => {
      const w = await wrapLink(fx, {
        channel: 'sms',
        phone: '+12025550139',
        email: true,
        at: new Date(),
      });
      if (!(await guard('R6', fx))) return;
      const n = trap.trapCount();
      const quiet = isQuietHours(new Date());
      const r = await withGate(() => drive(wrapUpRoute, '/api/cron/wrap-up-dispatch'));
      if (quiet) {
        console.log(
          '   (R6 ran in NZ quiet hours: deferred; layer D asserts it with a daytime clock)'
        );
        routeHealthy('R6', 'quiet hours: deferred', r);
        expectHits('R6', 'deferred', n, []);
        return;
      }
      routeFailed('R6', 'the text channel failed although the thank-you arrived by email', r, [
        'text',
      ]);
      assert(
        'R6',
        'health: text 1 to send, 0 got out; email 1 of 1',
        ok(
          () =>
            r.body.health.text.toSend === 1 &&
            r.body.health.text.gotOut === 0 &&
            r.body.health.email.toSend === 1 &&
            r.body.health.email.gotOut === 1
        ),
        JSON.stringify(r.body.health)
      );
      const link = await prisma.wrapUpLink.findUnique({ where: { id: w.link.id } });
      const logged = await prisma.inviteEvent.findMany({
        where: {
          eventId: w.event.id,
          type: { in: ['WRAPUP_MESSAGE_SENT', 'WRAPUP_MESSAGE_FAILED'] },
        },
        select: { type: true },
      });
      assert(
        'R6',
        'only the run’s reading changes: the link is failed: false, logged WRAPUP_MESSAGE_SENT',
        link?.dispatched === true &&
          link?.failed === false &&
          same(
            logged.map((l) => l.type),
            ['WRAPUP_MESSAGE_SENT']
          ),
        JSON.stringify({ link: { dispatched: link?.dispatched, failed: link?.failed }, logged })
      );
      expectHits('R6', 'the email fallback only — the text stopped at configuration', n, [
        RESEND_SEND,
      ]);
    });

    await caseOf('R7', 'decide-by-followups, an email accepted', async (fx) => {
      await maybe(fx, { email: true });
      if (!(await guard('R7', fx))) return;
      const n = trap.trapCount();
      const r = await withGate(() => drive(decideByRoute, '/api/cron/decide-by-followups'));
      routeHealthy('R7', 'its one email got out', r);
      expectHits('R7', 'one send', n, [RESEND_SEND]);
    });

    // ══ LAYER D — the dispatchers, with an injected clock ═══════════════════════════════════
    console.log('\n\x1b[1mD — drainOnce\x1b[0m\n');

    const drainTally = async (fx: Fx, layer: string) => {
      if (!(await guard(layer, fx))) return null;
      const r = await dispatch.drainOnce(prisma, 500, DAYTIME);
      return r?.tally ?? null;
    };

    await caseOf('D1', 'drain: a +64 ask text stopped by the switch counts', async (fx) => {
      const e = await pressed(fx, [{ email: false, phone: '+64211339001' }]);
      const n = trap.trapCount();
      const t = await drainTally(fx, 'D1');
      const row = await prisma.outboundMessage.findFirst({
        where: { eventId: e.event.id, kind: 'ASK' },
        select: { withheldWhy: true },
      });
      assert(
        'D1',
        'the row is withheld SMS_DISABLED',
        row?.withheldWhy === 'SMS_DISABLED',
        JSON.stringify(row)
      );
      tallyIs('D1', 'the text counted as not got out', t, [1, 0], [0, 0]);
      healthOf('D1', 'the text channel failed', t, { ok: false, failed: ['text'] });
      expectHits('D1', 'gate closed', n, []);
    });

    await caseOf('D2', 'drain: a chase row stopped by the switch counts', async (fx) => {
      const e = await pressed(fx, [{ email: false, phone: '+64211339002' }]);
      // The ask is withheld first; then a first reminder is due for a guest sent five days ago.
      if (!(await guard('D2', fx))) return;
      await dispatch.drainOnce(prisma, 500, DAYTIME);
      const pe = e.guests[0].pe;
      await prisma.personEvent.update({
        where: { id: pe.id },
        data: { sentAt: new Date(DAYTIME.getTime() - 5 * DAY) },
      });
      await prisma.outboundMessage.create({
        data: { eventId: e.event.id, personEventId: pe.id, kind: 'CHASE_FIRST', channel: 'TEXT' },
      });
      const n = trap.trapCount();
      const t = await drainTally(fx, 'D2');
      const row = await prisma.outboundMessage.findFirst({
        where: { eventId: e.event.id, kind: 'CHASE_FIRST' },
        select: { withheldWhy: true },
      });
      assert(
        'D2',
        'the reminder is withheld SMS_DISABLED',
        row?.withheldWhy === 'SMS_DISABLED',
        JSON.stringify(row)
      );
      tallyIs('D2', 'the reminder counted as not got out', t, [1, 0], [0, 0]);
      healthOf('D2', 'the text channel failed', t, { ok: false, failed: ['text'] });
      expectHits('D2', 'gate closed', n, []);
    });

    await caseOf(
      'D3',
      'drain: a guest who opted out of texts after the press does not count',
      async (fx) => {
        const e = await pressed(fx, [{ email: false, phone: '+64211339003' }]);
        await prisma.person.update({
          where: { id: e.guests[0].p.id },
          data: { smsOptedOut: true },
        });
        const n = trap.trapCount();
        const t = await drainTally(fx, 'D3');
        const row = await prisma.outboundMessage.findFirst({
          where: { eventId: e.event.id, kind: 'ASK' },
          select: { withheldWhy: true },
        });
        assert(
          'D3',
          'the row is withheld with the chooser’s why, SMS_OPTED_OUT',
          row?.withheldWhy === 'SMS_OPTED_OUT',
          JSON.stringify(row)
        );
        tallyIs('D3', 'nothing counted', t, [0, 0], [0, 0]);
        healthOf('D3', 'healthy on its own', t, { ok: true, failed: [] });
        expectHits('D3', 'gate closed', n, []);
      }
    );

    await caseOf('D4', 'drain: an address blocked after the press does not count', async (fx) => {
      const e = await pressed(fx, [{ email: true }]);
      const addr = e.guests[0].p.email!.toLowerCase();
      await prisma.emailBlock.create({
        data: { address: addr, reason: 'BOUNCED', eventId: e.event.id },
      });
      fx.addresses.push(addr);
      const n = trap.trapCount();
      const t = await drainTally(fx, 'D4');
      const row = await prisma.outboundMessage.findFirst({
        where: { eventId: e.event.id, kind: 'ASK' },
        select: { withheldWhy: true },
      });
      assert(
        'D4',
        'the row is withheld EMAIL_BLOCKED',
        row?.withheldWhy === 'EMAIL_BLOCKED',
        JSON.stringify(row)
      );
      tallyIs('D4', 'nothing counted', t, [0, 0], [0, 0]);
      healthOf('D4', 'healthy on its own', t, { ok: true, failed: [] });
      expectHits('D4', 'gate closed', n, []);
    });

    await caseOf('D5', 'drain, gate open: a text and an email accepted', async (fx) => {
      await pressed(fx, [{ email: false, phone: '+64211339005' }, { email: true }]);
      const n = trap.trapCount();
      const t = await withGate(() => drainTally(fx, 'D5'));
      tallyIs('D5', 'both got out', t, [1, 1], [1, 1]);
      healthOf('D5', 'healthy', t, { ok: true, failed: [] });
      expectHits('D5', 'one text, one email', n, [TNZ_SEND, RESEND_SEND]);
    });

    await caseOf('D6', 'drain: a text in quiet hours defers and does not count', async (fx) => {
      await pressed(fx, [{ email: false, phone: '+64211339006' }]);
      if (!(await guard('D6', fx))) return;
      const n = trap.trapCount();
      const r = await dispatch.drainOnce(prisma, 500, NIGHT);
      assert('D6', 'the drain deferred it', r?.deferred === 1, JSON.stringify(r));
      tallyIs('D6', 'nothing counted', r?.tally, [0, 0], [0, 0]);
      healthOf('D6', 'healthy', r?.tally, { ok: true, failed: [] });
      expectHits('D6', 'deferred', n, []);
    });

    console.log('\n\x1b[1mD — dispatchPendingWrapUpMessages\x1b[0m\n');

    const wrapRun = async (fx: Fx, layer: string, at: Date) => {
      if (!(await guard(layer, fx))) return null;
      return wrapUp.dispatchPendingWrapUpMessages(at);
    };

    await caseOf('W1', 'wrap-up: a +64 text stopped by the switch counts', async (fx) => {
      await wrapLink(fx, { channel: 'sms', phone: '+64211339011', email: false, at: DAYTIME });
      const n = trap.trapCount();
      const r = await wrapRun(fx, 'W1', DAYTIME);
      tallyIs('W1', 'text counted, no email to fall to', r?.tally, [1, 0], [0, 0]);
      healthOf('W1', 'the text channel failed', r?.tally, { ok: false, failed: ['text'] });
      expectHits('W1', 'gate closed', n, []);
    });

    await caseOf(
      'W2',
      'wrap-up: a +1 text stopped by configuration (no Twilio) counts',
      async (fx) => {
        await wrapLink(fx, { channel: 'sms', phone: '+12025550112', email: false, at: DAYTIME });
        const n = trap.trapCount();
        const r = await wrapRun(fx, 'W2', DAYTIME);
        tallyIs('W2', 'text counted', r?.tally, [1, 0], [0, 0]);
        healthOf('W2', 'the text channel failed', r?.tally, { ok: false, failed: ['text'] });
        expectHits('W2', 'gate closed', n, []);
      }
    );

    await caseOf('W3', 'wrap-up: a number that is not valid does not count', async (fx) => {
      await wrapLink(fx, { channel: 'sms', phone: '021 339 013', email: false, at: DAYTIME });
      const n = trap.trapCount();
      const r = await wrapRun(fx, 'W3', DAYTIME);
      tallyIs('W3', 'nothing counted', r?.tally, [0, 0], [0, 0]);
      healthOf('W3', 'healthy on its own', r?.tally, { ok: true, failed: [] });
      expectHits('W3', 'gate closed', n, []);
    });

    await caseOf(
      'W4',
      'wrap-up: a text to a number opted out from this host does not count',
      async (fx) => {
        const w = await wrapLink(fx, {
          channel: 'sms',
          phone: '+64211339014',
          email: false,
          at: DAYTIME,
        });
        const o = await prisma.smsOptOut.create({
          data: { phoneNumber: '+64211339014', hostId: w.host.id },
        });
        fx.optOuts.push(o.id);
        const n = trap.trapCount();
        const r = await wrapRun(fx, 'W4', DAYTIME);
        tallyIs('W4', 'nothing counted', r?.tally, [0, 0], [0, 0]);
        healthOf('W4', 'healthy on its own', r?.tally, { ok: true, failed: [] });
        expectHits('W4', 'gate closed', n, []);
      }
    );

    await caseOf(
      'W5',
      'wrap-up: an email to a guest who opted out of email does not count',
      async (fx) => {
        const w = await wrapLink(fx, { channel: 'email', at: DAYTIME });
        await prisma.emailOptOut.create({ data: { personId: w.g.p.id, eventId: w.event.id } });
        const n = trap.trapCount();
        const r = await wrapRun(fx, 'W5', DAYTIME);
        assert('W5', 'it was suppressed', r?.suppressed === 1, JSON.stringify(r));
        tallyIs('W5', 'nothing counted', r?.tally, [0, 0], [0, 0]);
        healthOf('W5', 'healthy on its own', r?.tally, { ok: true, failed: [] });
        expectHits('W5', 'gate closed', n, []);
      }
    );

    await caseOf('W6', 'wrap-up, gate open: the text fails and the email goes', async (fx) => {
      await wrapLink(fx, { channel: 'sms', phone: '+12025550116', email: true, at: DAYTIME });
      const n = trap.trapCount();
      const r = await withGate(() => wrapRun(fx, 'W6', DAYTIME));
      tallyIs('W6', 'text 1/0, email 1/1', r?.tally, [1, 0], [1, 1]);
      healthOf('W6', 'the text channel failed, though the guest was thanked', r?.tally, {
        ok: false,
        failed: ['text'],
      });
      expectHits('W6', 'the email fallback only', n, [RESEND_SEND]);
    });

    await caseOf(
      'W7',
      'wrap-up, gate open: a number that is not valid, and the email goes',
      async (fx) => {
        await wrapLink(fx, { channel: 'sms', phone: '021 339 017', email: true, at: DAYTIME });
        const n = trap.trapCount();
        const r = await withGate(() => wrapRun(fx, 'W7', DAYTIME));
        tallyIs('W7', 'the text is not counted; email 1/1', r?.tally, [0, 0], [1, 1]);
        healthOf('W7', 'healthy', r?.tally, { ok: true, failed: [] });
        expectHits('W7', 'the email fallback only', n, [RESEND_SEND]);
      }
    );

    await caseOf(
      'W8',
      'wrap-up, gate open: one text got out, one stopped — a partial failure',
      async (fx) => {
        await wrapLink(fx, { channel: 'sms', phone: '+64211339018', email: false, at: DAYTIME });
        await wrapLink(fx, { channel: 'sms', phone: '+12025550118', email: false, at: DAYTIME });
        const n = trap.trapCount();
        const r = await withGate(() => wrapRun(fx, 'W8', DAYTIME));
        tallyIs('W8', 'text 2/1', r?.tally, [2, 1], [0, 0]);
        healthOf('W8', 'healthy — one bad number must not flap the alert', r?.tally, {
          ok: true,
          failed: [],
        });
        expectHits('W8', 'one text', n, [TNZ_SEND]);
      }
    );

    await caseOf('W9', 'wrap-up: quiet hours defer the batch and nothing counts', async (fx) => {
      await wrapLink(fx, { channel: 'sms', phone: '+64211339019', email: false, at: NIGHT });
      const n = trap.trapCount();
      const r = await wrapRun(fx, 'W9', NIGHT);
      assert('W9', 'the batch deferred', r?.deferred === 1, JSON.stringify(r));
      tallyIs('W9', 'nothing counted', r?.tally, [0, 0], [0, 0]);
      healthOf('W9', 'healthy', r?.tally, { ok: true, failed: [] });
      expectHits('W9', 'deferred', n, []);
    });

    await caseOf(
      'W10',
      'wrap-up, gate open: the provider refuses the text (SEND_FAILED)',
      async (fx) => {
        await wrapLink(fx, { channel: 'sms', phone: '+64211339020', email: false, at: DAYTIME });
        const n = trap.trapCount();
        // The trap's fetch still takes (and counts) the request; this wrapper only turns TNZ's answer
        // into a refusal. Nothing leaves the process either way.
        const trapFetch = globalThis.fetch;
        globalThis.fetch = (async (input: any, init?: any) => {
          const res = await trapFetch(input, init);
          const url = typeof input === 'string' ? input : (input?.url ?? String(input));
          return url.includes('api.tnz.co.nz')
            ? new Response('{"Result":"Failed"}', { status: 500 })
            : res;
        }) as typeof fetch;
        let r: any;
        try {
          r = await withGate(() => wrapRun(fx, 'W10', DAYTIME));
        } finally {
          globalThis.fetch = trapFetch;
        }
        tallyIs('W10', 'the refused text counted', r?.tally, [1, 0], [0, 0]);
        healthOf('W10', 'the text channel failed', r?.tally, { ok: false, failed: ['text'] });
        expectHits('W10', 'one text, refused', n, [TNZ_SEND]);
      }
    );

    console.log('\n\x1b[1mD — processDecideByFollowups\x1b[0m\n');

    const followUp = async (fx: Fx, layer: string, cands: any[], at: Date) => {
      if (!(await guard(layer, fx))) return null;
      return decideBySender.processDecideByFollowups(cands, at);
    };

    await caseOf('B1', 'decide-by: a +64 text stopped by the switch counts', async (fx) => {
      const c = await candidate(fx, { channel: 'TEXT', phone: '+64211339021', email: false });
      const n = trap.trapCount();
      const r = await followUp(fx, 'B1', [c], DAYTIME);
      assert(
        'B1',
        'the follow-up records its channel and outcome',
        r?.sent?.[0]?.channel === 'TEXT' && r?.sent?.[0]?.outcome === 'NOT_OUT',
        JSON.stringify(r?.sent?.[0])
      );
      tallyIs('B1', 'text counted', r?.tally, [1, 0], [0, 0]);
      healthOf('B1', 'the text channel failed', r?.tally, { ok: false, failed: ['text'] });
      expectHits('B1', 'gate closed', n, []);
    });

    await caseOf(
      'B2',
      'decide-by: a missing number (INVALID_NUMBER) does not count',
      async (fx) => {
        const c = await candidate(fx, { channel: 'TEXT', phone: null, email: false });
        const n = trap.trapCount();
        const r = await followUp(fx, 'B2', [c], DAYTIME);
        tallyIs('B2', 'nothing counted', r?.tally, [0, 0], [0, 0]);
        healthOf('B2', 'healthy on its own', r?.tally, { ok: true, failed: [] });
        expectHits('B2', 'gate closed', n, []);
      }
    );

    await caseOf('B3', 'decide-by: no reply-to (the host’s) does not count', async (fx) => {
      const c = await candidate(fx, { channel: 'EMAIL', replyTo: false });
      const n = trap.trapCount();
      const r = await followUp(fx, 'B3', [c], DAYTIME);
      tallyIs('B3', 'nothing counted', r?.tally, [0, 0], [0, 0]);
      healthOf('B3', 'healthy on its own', r?.tally, { ok: true, failed: [] });
      expectHits('B3', 'gate closed', n, []);
    });

    await caseOf('B4', 'decide-by: a blocked address does not count', async (fx) => {
      const c = await candidate(fx, { channel: 'EMAIL' });
      const addr = c.email!.toLowerCase();
      await prisma.emailBlock.create({
        data: { address: addr, reason: 'BOUNCED', eventId: c.eventId },
      });
      fx.addresses.push(addr);
      const n = trap.trapCount();
      const r = await followUp(fx, 'B4', [c], DAYTIME);
      tallyIs('B4', 'nothing counted', r?.tally, [0, 0], [0, 0]);
      healthOf('B4', 'healthy on its own', r?.tally, { ok: true, failed: [] });
      expectHits('B4', 'gate closed', n, []);
    });

    await caseOf('B5', 'decide-by: an email the switch stops counts', async (fx) => {
      const c = await candidate(fx, { channel: 'EMAIL' });
      const n = trap.trapCount();
      const r = await followUp(fx, 'B5', [c], DAYTIME);
      tallyIs('B5', 'email counted', r?.tally, [0, 0], [1, 0]);
      healthOf('B5', 'the email channel failed', r?.tally, { ok: false, failed: ['email'] });
      expectHits('B5', 'gate closed', n, []);
    });

    await caseOf('B6', 'decide-by, gate open: a text and an email accepted', async (fx) => {
      const t = await candidate(fx, { channel: 'TEXT', phone: '+64211339026', email: false });
      const m = await candidate(fx, { channel: 'EMAIL' });
      const n = trap.trapCount();
      const r = await withGate(() => followUp(fx, 'B6', [t, m], DAYTIME));
      tallyIs('B6', 'both got out', r?.tally, [1, 1], [1, 1]);
      healthOf('B6', 'healthy', r?.tally, { ok: true, failed: [] });
      expectHits('B6', 'one text, one email', n, [TNZ_SEND, RESEND_SEND]);
    });

    await caseOf('B7', 'decide-by: a text held for quiet hours does not count', async (fx) => {
      const c = await candidate(fx, { channel: 'TEXT', phone: '+64211339027', email: false });
      const n = trap.trapCount();
      const r = await followUp(fx, 'B7', [c], NIGHT);
      assert('B7', 'it was held', r?.deferred === 1, JSON.stringify(r?.deferred));
      tallyIs('B7', 'nothing counted', r?.tally, [0, 0], [0, 0]);
      healthOf('B7', 'healthy', r?.tally, { ok: true, failed: [] });
      expectHits('B7', 'held', n, []);
    });

    // ══ LAYER U — the rule, pure ═════════════════════════════════════════════════════════════
    console.log('\n\x1b[1mU — the rule, pure\x1b[0m\n');
    const T = (text: [number, number], email: [number, number]) => ({
      text: { toSend: text[0], gotOut: text[1] },
      email: { toSend: email[0], gotOut: email[1] },
    });
    healthOf('U', 'idle: nothing to send', T([0, 0], [0, 0]), { ok: true, failed: [] });
    healthOf('U', 'texts all failed while emails went', T([2, 0], [3, 3]), {
      ok: false,
      failed: ['text'],
    });
    healthOf('U', 'emails all failed while texts went', T([1, 1], [2, 0]), {
      ok: false,
      failed: ['email'],
    });
    healthOf('U', 'a partial failure on one channel', T([5, 1], [0, 0]), { ok: true, failed: [] });
    healthOf('U', 'both failed', T([1, 0], [1, 0]), { ok: false, failed: ['text', 'email'] });
    assert(
      'U',
      'tallySend: NOT_COUNTED adds nothing; NOT_OUT adds one to send; GOT_OUT adds one to each',
      ok(() => {
        const t = health.emptyTally();
        health.tallySend(t, 'text', 'NOT_COUNTED');
        health.tallySend(t, 'text', 'NOT_OUT');
        health.tallySend(t, 'email', 'GOT_OUT');
        return same([t.text.toSend, t.text.gotOut, t.email.toSend, t.email.gotOut].map(String), [
          '1',
          '0',
          '1',
          '1',
        ]);
      })
    );
    assert(
      'U',
      // ⚠ MOVED BY [[GTC-258]] (M8, approved 2026-10-02): it read "… OPTED_OUT and INVALID_NUMBER do
      // not" over four entries. `sendSms` gained NUMBER_DEAD — TNZ reported the number cannot receive,
      // a fact about the guest — so the exact match gains it, still exact.
      'SMS_BLOCK_COUNTS: SMS_DISABLED and SEND_FAILED count; OPTED_OUT, INVALID_NUMBER and NUMBER_DEAD (GTC-258) do not',
      ok(() =>
        same(
          Object.entries(health.SMS_BLOCK_COUNTS)
            .sort()
            .map(([k, v]) => `${k}=${v}`),
          [
            'INVALID_NUMBER=false',
            'NUMBER_DEAD=false',
            'OPTED_OUT=false',
            'SEND_FAILED=true',
            'SMS_DISABLED=true',
          ]
        )
      ),
      JSON.stringify(health?.SMS_BLOCK_COUNTS)
    );
    const WHY = [
      'EMAIL_OPTED_OUT',
      'EMAIL_REPORTED',
      'EMAIL_REPORTED_SMS_OPTED_OUT',
      'EMAIL_BLOCKED',
      'EMAIL_BLOCKED_SMS_OPTED_OUT',
      'NO_CHANNEL',
      'SMS_OPTED_OUT',
      'PHONE_UNUSABLE',
      'HOST_HOUSEHOLD_CHILD',
      'NO_CARRIER',
      'HOUSEHOLD_MUTED',
      'HOST_OWN_ASK',
      'CHILD_WITHOUT_ITEM',
      'NOT_THIS_RECIPIENT',
      'NO_LINK',
      'SMS_DISABLED',
      'OPTED_OUT',
      'INVALID_NUMBER',
      'NO_REPLY_TO',
      'MARKED_DONT_CHASE',
      'HOST_AS_CARRIER',
      'HANDED_TO_HOST',
      'ANSWERED',
      'PACE_OFF',
      'PREDATES_SENDER',
      // [[GTC-350]] — a reply in force: the guest is the host's until she hands them back.
      'REPLIED',
    ];
    const counts = dispatch.WITHHELD_COUNTS_FOR_HEALTH ?? {};
    assert(
      'U',
      'WITHHELD_COUNTS_FOR_HEALTH names all 26 withholdings, and only SMS_DISABLED counts',
      same(Object.keys(counts).sort(), [...WHY].sort()) &&
        WHY.every((w) => counts[w] === (w === 'SMS_DISABLED')),
      JSON.stringify(counts)
    );
    assert(
      'U',
      'and it has exactly the members WITHHELD_WHY_IS_TERMINAL has — nothing unclassified',
      same(Object.keys(counts).sort(), Object.keys(dispatch.WITHHELD_WHY_IS_TERMINAL).sort())
    );

    // ══ LAYER S — source ═════════════════════════════════════════════════════════════════════
    console.log('\n\x1b[1mS — source\x1b[0m\n');
    const routes = [
      'src/app/api/cron/outbound-dispatch/route.ts',
      'src/app/api/cron/wrap-up-dispatch/route.ts',
      'src/app/api/cron/decide-by-followups/route.ts',
    ];
    const outboundSrc = code(routes[0]);
    // The whole statement that decides the verdict, not only the call's argument — a verdict that
    // read the poll around `sendRunHealth(...)` would pass an argument-only check.
    const healthStmt = outboundSrc.match(/const health = [^;]*;/)?.[0] ?? null;
    assert(
      'S',
      'outbound-dispatch: the verdict is read from the drain, and nothing in it reads the poll',
      healthStmt !== null && /sendRunHealth\(/.test(healthStmt) && !/poll/i.test(healthStmt),
      String(healthStmt)
    );
    assert(
      'S',
      'and the poll keeps its own try, carrying its reason on the wire',
      ok(() => {
        const around = outboundSrc.slice(
          outboundSrc.indexOf('let poll'),
          outboundSrc.indexOf('sendRunHealth(')
        );
        return /try \{/.test(around) && /catch/.test(around) && /error: message/.test(around);
      })
    );
    for (const rel of routes) {
      const src = code(rel);
      assert(
        'S',
        `${rel}: success and status both come from one health.ok`,
        /success: health\.ok/.test(src) && /status: health\.ok \? 200 : 500/.test(src)
      );
    }
  } finally {
    // ══ The trap, in total ════════════════════════════════════════════════════════════════════
    const all = trap.trapHits();
    const notFetch = all.filter((h) => h.via !== 'fetch');
    assert(
      'Z',
      'no request tried any door but the faked fetch (http, https, dns, net, tls)',
      notFetch.length === 0,
      JSON.stringify(notFetch)
    );
    assert(
      'Z',
      `the suite’s trap total equals the sum of the per-case lists (${expectedTotal})`,
      all.length === expectedTotal,
      `${all.length} hits: ${JSON.stringify(all.map((h) => h.target))}`
    );
    await prisma.$disconnect();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('RED:');
    for (const r of red) console.log(`  ${r}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
