/**
 * GTC-189 SLICE 8a — THE BLOCK. [[GTC-324]]'s three rulings of 2026-09-27, built.
 *
 * Run: npm run test:email-block
 *
 * ── WHAT THIS SUITE HOLDS ─────────────────────────────────────────────────────
 *
 *   Ruling 1  A spam report counts as an unsubscribe from that event (GTC-296's `EmailOptOut`).
 *   Ruling 2  It blocks the ADDRESS for every host, matching Resend's team-wide suppression: text
 *             where there is a usable mobile, otherwise the host's list. Other hosts see neutral
 *             words and never learn of the report.
 *   Ruling 3  The host whose invitation was reported sees the founder's three sentences; every
 *             other host the first and third (D4: "your invitation" means that invitation).
 *   D6        A hard bounce and a suppression record the block too.
 *   F4        Ruling U's "send it again" is withdrawn for a blocked address.
 *   F5        The dispatcher fences a queued EMAIL row to a blocked address.
 *   D3        Ruling 3's sentence reaches the board's person surface, and the address does not.
 *   D7        Zone 9 exists in GATHER-BUILD-CONSTANTS.md.
 *
 * ── NOTHING IS SENT ───────────────────────────────────────────────────────────
 *
 * `globalThis.fetch` is stubbed before any layer that could reach a provider, and the stub
 * records the `to` of every Resend call so an assertion about one person measures that person.
 * Rows created here are tagged `GTC189S8A` and removed in `finally`.
 */

import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();
const TAG = 'GTC189S8A';
const ROOT = join(__dirname, '..');

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

function ok(fn: () => boolean): boolean {
  try {
    return fn();
  } catch {
    return false;
  }
}

/** A layer that throws reports ONE failure and lets the rest run — the RED run needs every layer. */
async function layer(name: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    assert(name, `layer ran to completion (threw: ${(e as Error).message.split('\n')[0]})`, false);
  }
}

const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

// The words, as ruled 2026-09-27. Written out here rather than imported, so a change to the module's
// constants is a failure of this suite and not a change it silently follows.
const W1_WHOLE =
  "I can't email this address anymore. Their email reported your invitation as spam. Text them, or I'll put them on your list.";
const W1_NEUTRAL = "I can't email this address anymore. Text them, or I'll put them on your list.";
const W2 = "I can't email this address anymore, so I'll text them instead.";
const W3 = "I can't email this address anymore, and they've opted out of texts.";
const W5 = "Gather can't email this address anymore.";
const MIDDLE = 'Their email reported your invitation as spam.';
// Ruled 2026-09-27 at the 8a hold.
const REPORTED_OPTED_OUT =
  "I can't email this address anymore. Their email reported your invitation as spam. They've opted out of texts too, so I'll put them on your list.";
const REPORTED_CHILD =
  "Their household's contact can't be emailed anymore. That email reported your invitation as spam.";
const CHASE_REPORTED = "Their email reported your invitation as spam, so I won't chase them.";
const CHASE_BLOCKED = "I can't email them anymore and have no mobile to chase them by.";

const created = {
  users: [] as string[],
  people: [] as string[],
  events: [] as string[],
  personEvents: [] as string[],
  teams: [] as string[],
  items: [] as string[],
  assignments: [] as string[],
  eventRoles: [] as string[],
  wrapUpLinks: [] as string[],
  addresses: [] as string[],
};

// ── The fetch stub: who Resend was asked to send to, and what a poll answers. ──────────────
const realFetch = globalThis.fetch;
let resendTo: string[] = [];
let pollBody: Record<string, unknown> = {};
function stub() {
  resendTo = [];
  globalThis.fetch = (async (url: unknown, init?: { method?: string; body?: string }) => {
    const u = String(url);
    if (u.includes('resend') && (init?.method ?? 'GET').toUpperCase() === 'GET') {
      return new Response(JSON.stringify(pollBody), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (u.includes('resend')) {
      try {
        const body = JSON.parse(init?.body ?? '{}') as { to?: string | string[] };
        resendTo.push(...[body.to ?? []].flat());
      } catch {
        resendTo.push('(unparseable)');
      }
    }
    return new Response(JSON.stringify({ id: `${TAG}-stub-${Date.now()}` }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
}

// ── LAYER A — the words. Pure. ──────────────────────────────────────────────────────────────
async function runWordsLayer() {
  const words = await import('../src/lib/eligibility/email-block-words');
  assert(
    'A',
    "W1 WHOLE — ruling 3, the founder's three sentences, byte-exact",
    words.EMAIL_REPORTED_WORDS === W1_WHOLE
  );
  assert(
    'A',
    'W1 NEUTRAL — the first and third sentences, byte-exact',
    words.EMAIL_BLOCKED_WORDS === W1_NEUTRAL
  );
  assert(
    'A',
    'W2 — a person Gather can still text, byte-exact',
    words.EMAIL_BLOCKED_TEXTING_WORDS === W2
  );
  assert(
    'A',
    'W3 — blocked and opted out of texts, byte-exact',
    words.EMAIL_BLOCKED_SMS_OPTED_OUT_WORDS === W3
  );
  assert(
    'A',
    'the neutral words never carry the middle sentence (ruling 2: other hosts never learn of it)',
    ![W1_NEUTRAL, W2, W3, words.EMAIL_BLOCKED_CHILD_WORDS].some((w) => w.includes(MIDDLE))
  );

  assert(
    'A',
    'the reported, opted-out variant, byte-exact (ruled as proposed)',
    words.EMAIL_REPORTED_SMS_OPTED_OUT_WORDS === REPORTED_OPTED_OUT
  );
  assert(
    'A',
    'the reported child reads "That email", so the report cannot be read as the child\'s (ruled 2026-09-27)',
    words.EMAIL_REPORTED_CHILD_WORDS === REPORTED_CHILD &&
      !words.EMAIL_REPORTED_CHILD_WORDS.includes('Their email')
  );
  assert(
    'A',
    'the two chase refusals, byte-exact',
    words.EMAIL_REPORTED_CHASE_WORDS === CHASE_REPORTED &&
      words.EMAIL_BLOCKED_CHASE_WORDS === CHASE_BLOCKED
  );
  assert(
    'A',
    'the D8 addition is withdrawn: no word anywhere pairs the middle sentence with "I\'ll text them instead"',
    !Object.values(words).some(
      (w) => typeof w === 'string' && w.includes(MIDDLE) && w.includes("I'll text them instead")
    )
  );
  assert(
    'A',
    'every line is ruled, so the module carries no provisional marker',
    !/ANCHOR\(GTC-189\)/.test(read('src/lib/eligibility/email-block-words.ts'))
  );

  const strip = await import('../src/components/glance/strip');
  const red = (textable: boolean) =>
    strip.whyLineFor({ state: 'RED', reasons: ['UNREACHABLE'], items: [], textable } as any);
  assert(
    'A',
    'the strip reads "can\'t email" for an UNREACHABLE person Gather can text',
    red(true) === "can't email"
  );
  assert(
    'A',
    'and "nowhere to send" otherwise — the line ruled for ruling M, unchanged',
    red(false) === 'nowhere to send'
  );
  assert(
    'A',
    'both within the 16-character pin',
    (red(true) ?? '').length <= 16 && (red(false) ?? '').length <= 16
  );

  const n = words.emailNoteFor;
  assert(
    'A',
    'no block → no note',
    n({ state: 'NONE', textable: true, smsOptedOut: false }) === null
  );
  assert(
    'A',
    'BLOCKED + textable → W2',
    n({ state: 'BLOCKED', textable: true, smsOptedOut: false }) === W2
  );
  assert(
    'A',
    'BLOCKED + no mobile → W1 neutral',
    n({ state: 'BLOCKED', textable: false, smsOptedOut: false }) === W1_NEUTRAL
  );
  assert(
    'A',
    'BLOCKED + opted out of texts → W3',
    n({ state: 'BLOCKED', textable: false, smsOptedOut: true }) === W3
  );
  assert(
    'A',
    'REPORTED + textable → W1 WHOLE — the reported event stops the chase on every channel (ruling 1), so Gather will not text them and "Text them" is the host\'s by-hand nudge',
    n({ state: 'REPORTED', textable: true, smsOptedOut: false }) === W1_WHOLE
  );
  assert(
    'A',
    'REPORTED + opted out of texts → the middle sentence, and never "Text them"',
    ok(() => {
      const w = n({ state: 'REPORTED', textable: false, smsOptedOut: true })!;
      return w.includes(MIDDLE) && !w.includes('Text them');
    })
  );
  assert(
    'A',
    'the words module imports nothing, so the client component can read it without pulling a server module into the bundle',
    !/^\s*import\s/m.test(read('src/lib/eligibility/email-block-words.ts'))
  );
}

// ── LAYER B — the chooser. Pure. ────────────────────────────────────────────────────────────
async function runChooserLayer() {
  const ch = await import('../src/lib/eligibility/channel-chooser');
  const mk = (person: Record<string, unknown>, over: Record<string, unknown> = {}) => ({
    id: 'pe-s',
    personId: 'p-s',
    role: 'PARTICIPANT',
    householdId: null,
    householdRole: null,
    nudgeMark: null,
    chaseException: null,
    holdsItems: true,
    person: {
      email: 's@example.test',
      phoneNumber: null,
      smsOptedOut: false,
      emailOptedOut: false,
      emailBlocked: false,
      emailReported: false,
      ...person,
    },
    ...over,
  });
  const ev = (m: any) => ({
    hostId: 'host',
    memberships: [m],
    households: [],
    chaseWhenNoMobileDefault: null,
  });
  const ask = (p: Record<string, unknown>) => {
    const m = mk(p);
    return ch.chooseAskRoute(m as any, ev(m) as any) as any;
  };
  const chase = (p: Record<string, unknown>) => {
    const m = mk(p);
    return ch.chooseChaseRoute(m as any, ev(m) as any) as any;
  };
  const USABLE = '+64211234567';

  assert('B', 'CONTROL — unblocked address: the ask is EMAIL', ask({}).channel === 'EMAIL');
  assert(
    'B',
    'ruling 2 — blocked address, usable mobile: the ask falls to TEXT',
    ok(() => ask({ emailBlocked: true, phoneNumber: USABLE }).channel === 'TEXT')
  );
  assert(
    'B',
    'ruling 2 — blocked address, no mobile: the host\'s list, EMAIL_BLOCKED — never NO_CHANNEL, whose words say "No email"',
    ask({ emailBlocked: true }).why === 'EMAIL_BLOCKED'
  );
  assert(
    'B',
    'blocked address, opted-out mobile: EMAIL_BLOCKED_SMS_OPTED_OUT (Zone 7 only read)',
    ask({ emailBlocked: true, phoneNumber: USABLE, smsOptedOut: true }).why ===
      'EMAIL_BLOCKED_SMS_OPTED_OUT'
  );
  assert(
    'B',
    'blocked address, unusable mobile: EMAIL_BLOCKED',
    ask({ emailBlocked: true, phoneNumber: '+447700900123' }).why === 'EMAIL_BLOCKED'
  );
  assert(
    'B',
    "ruling 1 — REPORTED on this event, with a usable mobile: REFUSED, not texted (correction R1's fall-to-text, refused by name)",
    ask({ emailBlocked: true, emailReported: true, emailOptedOut: true, phoneNumber: USABLE })
      .why === 'EMAIL_REPORTED'
  );
  assert(
    'B',
    'REPORTED and opted out of texts: EMAIL_REPORTED_SMS_OPTED_OUT',
    ask({
      emailBlocked: true,
      emailReported: true,
      emailOptedOut: true,
      phoneNumber: USABLE,
      smsOptedOut: true,
    }).why === 'EMAIL_REPORTED_SMS_OPTED_OUT'
  );

  assert(
    'B',
    'CONTROL — the chase, unblocked and no mobile: EMAIL by the default',
    chase({}).channel === 'EMAIL'
  );
  assert(
    'B',
    'ruling 2 — the chase, blocked address and usable mobile: TEXT',
    ok(() => chase({ emailBlocked: true, phoneNumber: USABLE }).channel === 'TEXT')
  );
  assert(
    'B',
    'ruling 2 — the chase, blocked address and no mobile: NONE EMAIL_BLOCKED, and the resolver is never asked (BY_EMAIL would email the blocked address)',
    ok(() => {
      const r = chase({ emailBlocked: true });
      return r.kind === 'NONE' && r.why === 'EMAIL_BLOCKED';
    })
  );
  assert(
    'B',
    'ruling 1 — the chase on the reported event: NONE on every channel, a usable mobile notwithstanding',
    ok(() => {
      const r = chase({
        emailBlocked: true,
        emailReported: true,
        emailOptedOut: true,
        phoneNumber: USABLE,
      });
      return r.kind === 'NONE' && r.why === 'EMAIL_REPORTED';
    })
  );
  assert(
    'B',
    'Zone 7 keeps the top of the chase ladder: reported AND opted out of texts reports SMS_OPTED_OUT',
    chase({
      emailBlocked: true,
      emailReported: true,
      emailOptedOut: true,
      phoneNumber: USABLE,
      smsOptedOut: true,
    }).why === 'SMS_OPTED_OUT'
  );
  assert(
    'B',
    'ruling U\'s "send to the phone instead" still reaches a blocked person with a usable mobile',
    ch.textAskReachOf(mk({ emailBlocked: true, phoneNumber: USABLE }).person as any).ok === true
  );

  const door = await import('../src/lib/press/resend-door');
  const facts = (addressBlocked: boolean) =>
    ({
      reason: 'NOT_DELIVERED',
      hasAddress: true,
      addressBlocked,
      textReach: { ok: true },
      textingConfigured: true,
    }) as any;
  assert(
    'B',
    'CONTROL — the door offers "send it again" for an unblocked address',
    door.doorActionsFor(facts(false)).includes('AGAIN')
  );
  assert(
    'B',
    'F4 — the door does NOT offer "send it again" for a blocked address, and still offers edit and text',
    ok(() => {
      const a = door.doorActionsFor(facts(true));
      return !a.includes('AGAIN') && a.includes('EDIT') && a.includes('PHONE');
    })
  );
  assert(
    'B',
    "W5 is the door's refusal sentence",
    (door.RESEND_REFUSAL_WORDS as any).ADDRESS_BLOCKED === W5
  );

  const manual = await import('../src/lib/sms/manual-nudge-recipient');
  assert(
    'B',
    'the by-hand nudge treats a blocked address as no address',
    manual.chooseManualNudgeChannel({
      phoneNumber: null,
      smsOptedOut: false,
      email: 'x@example.test',
      emailBlocked: true,
    } as any) === 'none'
  );
  assert(
    'B',
    'CONTROL — the by-hand nudge still emails an unblocked address',
    manual.chooseManualNudgeChannel({
      phoneNumber: null,
      smsOptedOut: false,
      email: 'x@example.test',
      emailBlocked: false,
    } as any) === 'email'
  );
}

// ── The fixture: one host, two events, three guests. ─────────────────────────────────────────
interface Fixture {
  hostId: string;
  eventAId: string;
  eventBId: string;
  /** Has a usable +64 mobile. On A and B. */
  textable: { id: string; email: string; peA: string; peB: string };
  /** No mobile. On A and B. */
  bare: { id: string; email: string; peA: string; peB: string };
  /** Unblocked control. On A and B. */
  control: { id: string; email: string; peA: string; peB: string };
}

async function withFixture(body: (fx: Fixture) => Promise<void>) {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const endDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const user = await prisma.user.create({
    data: { email: `${TAG.toLowerCase()}-host-${stamp}@example.test` },
  });
  created.users.push(user.id);
  const mkPerson = async (label: string, over: Record<string, unknown> = {}) => {
    const p = await prisma.person.create({
      data: {
        name: `${TAG} ${label}`,
        email: `${TAG.toLowerCase()}-${label}-${stamp}@example.test`,
        ...over,
      },
    });
    created.people.push(p.id);
    created.addresses.push(p.email!.toLowerCase());
    return p;
  };
  const host = await mkPerson('host', { email: user.email, userId: user.id });
  const textable = await mkPerson('textable', { phoneNumber: '+64211230001' });
  const bare = await mkPerson('bare');
  const control = await mkPerson('control');

  const mkEvent = async (label: string) => {
    const e = await prisma.event.create({
      data: {
        name: `${TAG} ${label}`,
        startDate: endDate,
        endDate,
        hostId: host.id,
        status: 'CONFIRMING',
        sentAt: new Date(),
      },
    });
    created.events.push(e.id);
    const role = await prisma.eventRole.create({
      data: { eventId: e.id, userId: user.id, role: 'HOST' },
    });
    created.eventRoles.push(role.id);
    const hostPe = await prisma.personEvent.create({
      data: { personId: host.id, eventId: e.id, role: 'HOST' },
    });
    created.personEvents.push(hostPe.id);
    const team = await prisma.team.create({ data: { name: `${TAG} Mains`, eventId: e.id } });
    created.teams.push(team.id);
    return { event: e, team };
  };
  const add = async (eventId: string, teamId: string, personId: string) => {
    const pe = await prisma.personEvent.create({
      data: { personId, eventId, role: 'PARTICIPANT' },
    });
    created.personEvents.push(pe.id);
    const item = await prisma.item.create({
      data: { name: `${TAG} dish`, teamId, status: 'ASSIGNED' },
    });
    created.items.push(item.id);
    const a = await prisma.assignment.create({
      data: { itemId: item.id, personId, response: 'PENDING' },
    });
    created.assignments.push(a.id);
    await prisma.accessToken.create({
      data: {
        token: `${TAG}-${pe.id}`,
        scope: 'PARTICIPANT',
        eventId,
        personId,
        expiresAt: endDate,
      },
    });
    return pe.id;
  };
  const a = await mkEvent('event A');
  const b = await mkEvent('event B');
  const both = async (p: { id: string; email: string | null }) => ({
    id: p.id,
    email: p.email!,
    peA: await add(a.event.id, a.team.id, p.id),
    peB: await add(b.event.id, b.team.id, p.id),
  });
  await body({
    hostId: host.id,
    eventAId: a.event.id,
    eventBId: b.event.id,
    textable: await both(textable),
    bare: await both(bare),
    control: await both(control),
  });
}

/** An accepted EMAIL ask row, as the press leaves it, ready to be polled. */
async function acceptedRow(eventId: string, personEventId: string, label: string) {
  return prisma.outboundMessage.create({
    data: {
      eventId,
      personEventId,
      kind: 'ASK',
      channel: 'EMAIL',
      attemptedAt: new Date(),
      attemptCount: 1,
      acceptedAt: new Date(),
      provider: 'resend',
      providerMessageId: `${TAG}-${label}-${Date.now()}`,
    },
  });
}

async function poll(
  row: { id: string; providerMessageId: string | null; acceptedAt: Date | null },
  lastEvent: string,
  to: string[] | undefined
) {
  const dp = await import('../src/lib/email-delivery/delivery-poll');
  pollBody = {
    id: row.providerMessageId,
    last_event: lastEvent,
    created_at: new Date().toISOString(),
    ...(to ? { to } : {}),
  };
  return dp.pollOne(prisma, {
    id: row.id,
    providerMessageId: row.providerMessageId,
    acceptedAt: row.acceptedAt,
    deliveryCheckedAt: null,
  } as any);
}

const blockOf = (address: string) =>
  prisma.emailBlock.findUnique({ where: { address: address.toLowerCase() } });

// ── LAYERS C–H — against the database. ──────────────────────────────────────────────────────
async function runDatabaseLayers() {
  process.env.NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  process.env.RESEND_API_KEY = `re_${TAG}_sentinel_key_000000000000`;
  process.env.UNSUBSCRIBE_TOKEN_SECRET = process.env.UNSUBSCRIBE_TOKEN_SECRET || `${TAG}-secret`;
  stub();

  // ── C — the poll writes the block, and a complaint writes the event's opt-out. ─────────────
  await layer('C', () =>
    withFixture(async (fx) => {
      const r = await acceptedRow(fx.eventAId, fx.bare.peA, 'complaint');
      // The provider's `to` in a different case from the stored address: the block is on the
      // provider's address, normalised — not on `Person.email` read at poll time.
      await poll(r, 'complained', [fx.bare.email.toUpperCase()]);
      const block = await blockOf(fx.bare.email);
      assert(
        'C',
        'ruling 2 — a complaint writes an address-wide block',
        block?.reason === 'COMPLAINED'
      );
      assert(
        'C',
        'and records the event whose message was reported (D4)',
        block?.eventId === fx.eventAId
      );
      assert('C', 'and the message', block?.outboundMessageId === r.id);
      const optOut = await prisma.emailOptOut.findUnique({
        where: { personId_eventId: { personId: fx.bare.id, eventId: fx.eventAId } },
      });
      assert(
        'C',
        "ruling 1 — and the event's EmailOptOut, the row an unsubscribe click writes",
        !!optOut
      );
      const optOutB = await prisma.emailOptOut.findUnique({
        where: { personId_eventId: { personId: fx.bare.id, eventId: fx.eventBId } },
      });
      assert('C', "CONTROL — and NOT another event's: ruling 1 is per event", !optOutB);
      const after = await prisma.outboundMessage.findUnique({ where: { id: r.id } });
      assert(
        'C',
        'the outcome itself is still recorded on the row',
        after?.deliveryState === 'COMPLAINED'
      );

      const bounce = await acceptedRow(fx.eventAId, fx.textable.peA, 'bounce');
      await poll(bounce, 'bounced', [fx.textable.email]);
      assert(
        'C',
        'D6 — a hard bounce writes the block',
        (await blockOf(fx.textable.email))?.reason === 'BOUNCED'
      );
      assert(
        'C',
        "and writes NO opt-out: a bounce is not a person's no",
        !(await prisma.emailOptOut.findUnique({
          where: { personId_eventId: { personId: fx.textable.id, eventId: fx.eventAId } },
        }))
      );

      const later = await acceptedRow(fx.eventBId, fx.textable.peB, 'upgrade');
      await poll(later, 'complained', [fx.textable.email]);
      const up = await blockOf(fx.textable.email);
      assert(
        'C',
        "a complaint UPGRADES an earlier bounce and takes its event with it — the fact that decides who sees ruling 3's middle sentence",
        up?.reason === 'COMPLAINED' && up?.eventId === fx.eventBId
      );

      const delivered = await acceptedRow(fx.eventAId, fx.control.peA, 'delivered');
      await poll(delivered, 'delivered', [fx.control.email]);
      assert('C', 'CONTROL — a delivery writes no block', !(await blockOf(fx.control.email)));

      const noTo = await acceptedRow(fx.eventAId, fx.control.peA, 'no-to');
      await poll(noTo, 'bounced', undefined);
      assert(
        'C',
        'a response with no `to` writes no block rather than guessing the address from Person.email',
        !(await blockOf(fx.control.email))
      );

      // Restore for the layers below: textable is BLOCKED by a complaint on EVENT B, not A.
      await prisma.emailOptOut.deleteMany({ where: { personId: fx.textable.id } });
      await prisma.emailBlock.update({
        where: { address: fx.textable.email.toLowerCase() },
        data: { reason: 'BOUNCED', eventId: null },
      });

      // ── D — the pre-flight. ──────────────────────────────────────────────────────────────
      const ap = await import('../src/lib/preflight/ask-preview');
      const compose = await import('../src/lib/preflight/ask-preview-compose');
      const a = (await ap.readAskPreview(prisma, fx.eventAId, 'http://localhost:3000'))!;
      const b = (await ap.readAskPreview(prisma, fx.eventBId, 'http://localhost:3000'))!;
      const lineA = a.hostList.find((l) => l.personId === fx.bare.id);
      assert(
        'D',
        "on the REPORTED event the guest is on the host's list as EMAIL_REPORTED",
        lineA?.why === 'EMAIL_REPORTED'
      );
      assert(
        'D',
        'and the host reads ruling 3, all three sentences',
        ok(() => compose.hostListReason(lineA!) === W1_WHOLE)
      );
      const lineB = b.hostList.find((l) => l.personId === fx.bare.id);
      assert(
        'D',
        'on ANOTHER event the same guest is EMAIL_BLOCKED',
        lineB?.why === 'EMAIL_BLOCKED'
      );
      assert(
        'D',
        'and that host reads the neutral pair — the report is never disclosed (ruling 2, D4)',
        ok(() => compose.hostListReason(lineB!) === W1_NEUTRAL)
      );
      assert(
        'D',
        "the middle sentence appears NOWHERE in the other event's preview",
        !JSON.stringify(b).includes(MIDDLE) &&
          !b.hostList.some((l) => compose.hostListReason(l).includes(MIDDLE))
      );
      const recB = b.recipients.find((r) => r.personId === fx.textable.id);
      assert(
        'D',
        'ruling 2 — a blocked guest with a usable mobile is asked by TEXT',
        recB?.channel === 'TEXT'
      );
      assert('D', 'and the recipient row carries W2', recB?.emailNote === W2);
      const ctl = b.recipients.find((r) => r.personId === fx.control.id);
      assert(
        'D',
        'CONTROL — an unblocked guest is still asked by EMAIL, with no note',
        ctl?.channel === 'EMAIL' && ctl?.emailNote === null
      );

      // ── E — the board. ───────────────────────────────────────────────────────────────────
      const glance = await import('../src/lib/glance/read');
      const gA = await glance.readEventGlance(prisma, fx.eventAId);
      const gB = await glance.readEventGlance(prisma, fx.eventBId);
      const everyone = (g: any) => [...g.households.flatMap((h: any) => h.members), ...g.unhoused];
      const bareA = everyone(gA).find((p: any) => p.personId === fx.bare.id);
      const bareB = everyone(gB).find((p: any) => p.personId === fx.bare.id);
      const textB = everyone(gB).find((p: any) => p.personId === fx.textable.id);
      const ctlB = everyone(gB).find((p: any) => p.personId === fx.control.id);
      assert(
        'E',
        "D3 — the reported host's board carries ruling 3's three sentences",
        bareA?.emailNote === W1_WHOLE
      );
      assert(
        'E',
        "another event's board carries the neutral pair",
        bareB?.emailNote === W1_NEUTRAL
      );
      assert('E', "a textable blocked guest's surface carries W2", textB?.emailNote === W2);
      assert('E', 'CONTROL — an unblocked guest carries no note', ctlB?.emailNote === null);
      assert(
        'E',
        "THE ADDRESS NEVER REACHES THE BOARD'S PAYLOAD — a sentence, never the contact detail (slice 7b, founder answer 6)",
        ![fx.bare.email, fx.textable.email, fx.control.email].some(
          (e) =>
            JSON.stringify(gA).toLowerCase().includes(e.toLowerCase()) ||
            JSON.stringify(gB).toLowerCase().includes(e.toLowerCase())
        )
      );

      // ── F — the dispatcher's fence (F5). ─────────────────────────────────────────────────
      const dispatch = await import('../src/lib/press/dispatch');
      const queued = await prisma.outboundMessage.create({
        data: {
          eventId: fx.eventBId,
          personEventId: fx.textable.peB,
          kind: 'ASK',
          channel: 'EMAIL',
        },
      });
      const queuedCtl = await prisma.outboundMessage.create({
        data: {
          eventId: fx.eventBId,
          personEventId: fx.control.peB,
          kind: 'ASK',
          channel: 'EMAIL',
        },
      });
      stub();
      await dispatch.drainOnce(prisma, 500);
      const q = await prisma.outboundMessage.findUnique({ where: { id: queued.id } });
      assert(
        'F',
        'F5 — a queued EMAIL row to a blocked address is WITHHELD, EMAIL_BLOCKED',
        q?.withheldWhy === 'EMAIL_BLOCKED'
      );
      assert(
        'F',
        'and the provider was never asked to send to that address',
        !resendTo.map((t) => t.toLowerCase()).includes(fx.textable.email.toLowerCase())
      );
      assert(
        'F',
        "CONTROL — the unblocked guest's row in the same tick WAS sent",
        resendTo.map((t) => t.toLowerCase()).includes(fx.control.email.toLowerCase())
      );
      assert(
        'F',
        'and the control row was never withheld',
        (await prisma.outboundMessage.findUnique({ where: { id: queuedCtl.id } }))?.withheldAt ===
          null
      );

      // The fenced row is the latest for this guest: the board reads it back as an UNREACHABLE red.
      const strip8a = await import('../src/components/glance/strip');
      const words8a = await import('../src/lib/eligibility/email-block-words');
      const gFenced = await glance.readEventGlance(prisma, fx.eventBId);
      const fenced = everyone(gFenced).find((p: any) => p.personId === fx.textable.id);
      const bareFenced = everyone(gFenced).find((p: any) => p.personId === fx.bare.id);
      assert('F', 'the fenced, textable guest reads RED on the board', fenced?.state === 'RED');
      assert(
        'F',
        'and the strip says "can\'t email", not "nowhere to send" — false of somebody Gather can text (ruled 2026-09-27)',
        ok(() => strip8a.whyLineFor(fenced) === "can't email")
      );
      assert(
        'F',
        'and the person view carries the held-invitation line, not W2 — nothing texts it unless the host does',
        fenced?.emailNote === words8a.EMAIL_BLOCKED_ASK_HELD_WORDS &&
          fenced?.emailNote ===
            "I can't email this address anymore, so their invitation hasn't gone out. You can send it as a text."
      );
      assert(
        'F',
        'CONTROL — a blocked guest with no mobile is not textable',
        bareFenced?.textable === false
      );
      // M17 survived without this: the same guest, opted out of texts (on this test fixture only),
      // is no longer somebody Gather can text, so the ruled line for ruling M's red comes back.
      await prisma.person.update({ where: { id: fx.textable.id }, data: { smsOptedOut: true } });
      const gOpted = await glance.readEventGlance(prisma, fx.eventBId);
      const opted = everyone(gOpted).find((p: any) => p.personId === fx.textable.id);
      assert(
        'F',
        'a fenced guest who has opted out of texts is NOT textable, and reads "nowhere to send"',
        opted?.textable === false && ok(() => strip8a.whyLineFor(opted) === 'nowhere to send')
      );
      await prisma.person.update({ where: { id: fx.textable.id }, data: { smsOptedOut: false } });

      // ── G — ruling U's door. ─────────────────────────────────────────────────────────────
      const resend = await import('../src/lib/press/resend');
      await prisma.outboundMessage.create({
        data: {
          eventId: fx.eventBId,
          personEventId: fx.textable.peB,
          kind: 'ASK',
          channel: 'EMAIL',
          attemptedAt: new Date(),
          attemptCount: 1,
          rejectedAt: new Date(),
          provider: 'resend',
          providerError: `${TAG} refused`,
          createdAt: new Date(Date.now() + 1000),
        },
      });
      const opened: any = await resend.readDoor(
        prisma,
        { eventId: fx.eventBId, personId: fx.textable.id, baseUrl: 'http://localhost:3000' },
        { textingConfiguredFor: () => true }
      );
      assert('G', 'the door opens on the failure', opened?.ok === true);
      assert(
        'G',
        'F4 — and does not offer "send it again" to a blocked address',
        ok(() => !opened.view.actions.includes('AGAIN'))
      );
      assert(
        'G',
        'and for a blocked person with a usable mobile it offers EDIT and PHONE — ruling 2\'s "text if a usable mobile", left to the host',
        ok(() => opened.view.actions.includes('EDIT') && opened.view.actions.includes('PHONE'))
      );
      const actor = { id: fx.hostId, kind: 'HOST' } as any;
      const again: any = await resend.resendToPerson(
        prisma,
        {
          eventId: fx.eventBId,
          personId: fx.textable.id,
          baseUrl: 'http://localhost:3000',
          actor,
          action: 'AGAIN',
        },
        { textingConfiguredFor: () => true }
      );
      assert(
        'G',
        "the door's press refuses AGAIN anyway: ADDRESS_BLOCKED",
        again?.ok === false && again?.code === 'ADDRESS_BLOCKED'
      );
      const moved: any = await resend.resendToPerson(
        prisma,
        {
          eventId: fx.eventBId,
          personId: fx.textable.id,
          baseUrl: 'http://localhost:3000',
          actor,
          action: 'EDIT',
          email: fx.bare.email.toUpperCase(),
        },
        { textingConfiguredFor: () => true }
      );
      assert(
        'G',
        'the door refuses to move a person onto a blocked address',
        moved?.ok === false && moved?.code === 'ADDRESS_BLOCKED'
      );
      assert(
        'G',
        'and the refusal wrote nothing: the address is unchanged',
        (await prisma.person.findUnique({ where: { id: fx.textable.id } }))?.email ===
          fx.textable.email
      );

      // ── H — the wrap-up email leg. ───────────────────────────────────────────────────────
      const wrapUp = await import('../src/lib/wrap-up');
      const old = new Date(Date.now() - 60 * 60 * 1000);
      const link = await prisma.wrapUpLink.create({
        data: {
          token: `${TAG}-wrap-${Date.now()}`,
          eventId: fx.eventBId,
          personId: fx.bare.id,
          guestName: `${TAG} bare`,
          guestEmail: fx.bare.email,
          channel: 'email',
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          createdAt: old,
        },
      });
      created.wrapUpLinks.push(link.id);
      stub();
      await wrapUp.dispatchPendingWrapUpMessages(new Date());
      assert(
        'H',
        'ruling 2 — the wrap-up email leg does not send to a blocked address (on an event with no opt-out)',
        !resendTo.map((t) => t.toLowerCase()).includes(fx.bare.email.toLowerCase())
      );
    })
  );
}

// ── LAYER S — structural. ───────────────────────────────────────────────────────────────────
async function runStructuralLayer() {
  const constants = read('GATHER-BUILD-CONSTANTS.md');
  assert(
    'S',
    'D7 — Zone 9, "Email Opt-Out and Block", is in GATHER-BUILD-CONSTANTS.md',
    /### 9\. Email Opt-Out and Block/.test(constants)
  );
  assert(
    'S',
    'and it names both models',
    /### 9\.[^\n]*EmailOptOut[^\n]*EmailBlock/.test(constants)
  );

  const schema = read('prisma/schema.prisma');
  const model = schema.match(/model EmailBlock \{[\s\S]*?\n\}/)?.[0] ?? '';
  assert('S', 'the EmailBlock model exists', model.length > 0);
  assert('S', 'keyed on the address, unique', /address\s+String\s+@unique/.test(model));
  assert(
    'S',
    'with NO relation to Person — the block outlives the person (ruling 2)',
    !/\bPerson\b[?]?\s+@relation/.test(model.replace(/\/\/\/.*$/gm, ''))
  );
  assert(
    'S',
    'and SET NULL, never cascade, on both parents',
    (model.match(/onDelete: SetNull/g) ?? []).length === 2 &&
      !/Cascade/.test(model.replace(/\/\/\/.*$/gm, ''))
  );

  const migrations = readdirSync(join(ROOT, 'prisma/migrations')).filter((d) =>
    d.includes('slice8a_email_block')
  );
  assert('S', 'the migration exists in its own folder', migrations.length === 1);

  const poll = read('src/lib/email-delivery/delivery-poll.ts');
  assert(
    'S',
    'the poll writes the block inside a transaction with the outcome',
    /\$transaction\(async \(tx\)[\s\S]*recordEmailBlock\(tx/.test(poll)
  );

  const email = read('src/lib/email.ts');
  assert(
    'S',
    'GTC-296 ruling 6 — account mail is untouched: email.ts does not read the block',
    !/email-block/.test(email)
  );

  let diff = '';
  try {
    diff = execSync(
      'git diff HEAD -- prisma/schema.prisma src/lib/sms/opt-out-service.ts src/lib/sms/opt-out-keywords.ts',
      { cwd: ROOT }
    ).toString();
  } catch {
    diff = '(git unavailable)';
  }
  const codeLines = diff
    .split('\n')
    .filter((l) => /^[+-]/.test(l) && !/^[+-]{3}/.test(l) && !/^[+-]\s*\/\/\//.test(l));
  assert(
    'S',
    'Zone 7 untouched — no non-comment schema line touches smsOptedOut or SmsOptOut',
    !codeLines.some((l) => /smsOptedOut|SmsOptOut/.test(l))
  );
  assert(
    'S',
    'Zone 7 untouched — both opt-out modules unchanged',
    !/opt-out-service\.ts|opt-out-keywords\.ts/.test(diff)
  );

  const nudgeRoute = read('src/app/api/events/[id]/people/[personId]/nudge/route.ts');
  assert(
    'S',
    'the by-hand nudge route refuses a blocked address on BOTH email doors — the SMS-opt-out fall-through and the email-only branch',
    (nudgeRoute.match(/person\.email && emailBlocked/g) ?? []).length === 2 &&
      /chooseManualNudgeChannel\(\{ \.\.\.person, emailBlocked \}\)/.test(nudgeRoute)
  );

  const surface = read('src/components/glance/PersonSurface.tsx');
  assert(
    'S',
    'D3 — PersonSurface renders person.emailNote, the served sentence and not a copy',
    /data-email-note[\s\S]{0,80}\{person\.emailNote\}/.test(surface)
  );
  assert('S', 'the note module exists', existsSync(join(ROOT, 'src/lib/glance/email-note.ts')));
}

async function main() {
  console.log('\n=== GTC-189 slice 8a — the block ===\n');
  await layer('A', runWordsLayer);
  await layer('B', runChooserLayer);
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
    await del(() =>
      (prisma as any).emailBlock.deleteMany({ where: { address: { in: created.addresses } } })
    );
    await del(() => prisma.emailOptOut.deleteMany({ where: { eventId: { in: created.events } } }));
    await del(() => prisma.wrapUpLink.deleteMany({ where: { id: { in: created.wrapUpLinks } } }));
    await del(() =>
      prisma.outboundMessage.deleteMany({ where: { eventId: { in: created.events } } })
    );
    await del(() => prisma.assignment.deleteMany({ where: { id: { in: created.assignments } } }));
    await del(() => prisma.item.deleteMany({ where: { id: { in: created.items } } }));
    await del(() => prisma.inviteEvent.deleteMany({ where: { eventId: { in: created.events } } }));
    await del(() => prisma.auditEntry.deleteMany({ where: { eventId: { in: created.events } } }));
    await del(() => prisma.accessToken.deleteMany({ where: { eventId: { in: created.events } } }));
    await del(() => prisma.personEvent.deleteMany({ where: { id: { in: created.personEvents } } }));
    await del(() => prisma.team.deleteMany({ where: { id: { in: created.teams } } }));
    await del(() => prisma.eventRole.deleteMany({ where: { id: { in: created.eventRoles } } }));
    await del(() => prisma.event.deleteMany({ where: { id: { in: created.events } } }));
    await del(() => prisma.person.deleteMany({ where: { id: { in: created.people } } }));
    await del(() => prisma.user.deleteMany({ where: { id: { in: created.users } } }));
    await prisma.$disconnect();
    console.log(`\nTotal tests: ${passed + failed}   Passed: ${passed}   Failed: ${failed}`);
    if (failed > 0) {
      console.log('\nRED:');
      for (const r of redAssertions) console.log(`  ${r}`);
    }
    process.exit(failed > 0 ? 1 : 0);
  });
