/**
 * GTC-280 — the end-to-end proof, driven against a really-paid Checkout Session.
 *
 * Run: GTC280_PAID_SESSION_ID=cs_test_... \
 *      GTC265_PROBE_KEY=<resend key> \
 *      STRIPE_SECRET_KEY=<stripe test key> \
 *        npm run test:gtc280-paid
 *
 * ⚠ ALL THREE MUST BE PASSED IN, and STRIPE_SECRET_KEY is the one that
 * surprises people. Next loads `.env.local`; `tsx` does not, and this repo
 * keeps the Stripe key only in `.env.local`. `src/lib/stripe.ts` THROWS at
 * import when it is unset, so a run without it dies before any assertion —
 * which is what happened on this suite's first real run. It is now a named
 * precondition rather than a stack trace.
 *
 * ⚠ THIS IS NOT IN THE ORDINARY SWEEP AND MUST NOT BE. It needs a Checkout
 * Session that has actually been paid, and Stripe has no API that fakes one —
 * completing a session requires the hosted page. The repo already treats
 * `test:tnz-sms` this way: run deliberately, never casually.
 *
 * ── WHAT IT WRITES, AND WHY IT IS ONE CHARGE RATHER THAN THREE ────────────────
 *
 * The duplicate-payment check in `POST /api/events` is
 * `event.findFirst({ where: { stripePaymentIntentId } })` — it keys on an EVENT
 * existing, not on the session having been seen. So deleting the Event created
 * by one spend genuinely re-arms the same paid session, and three branches can
 * be driven on one test-mode charge. Each spend is cleaned up before the next.
 *
 * Per spend: one `Event`, one `EventRole`, one `MagicLink`. Zero `Session`
 * rows — that absence is the finding. Branch 2 additionally creates one
 * throwaway `User` + `Session` to be the mismatched caller, and deletes both.
 *
 * ── SAFETY, ASSERTED RATHER THAN ASSUMED ──────────────────────────────────────
 *
 * The route sends a real email through Resend on every success. Two
 * preconditions are checked before anything is driven, and the suite refuses to
 * proceed if either fails — as a FAILURE, never a silent skip (GTC-267):
 *
 *   1. Stripe is in test mode (`sk_test`), so the charge is not real money.
 *   2. The Resend key is REJECTED, proven by a read-only `GET /domains` probe
 *      that sends nothing. The same precondition GTC-265's layer 4 uses.
 *
 * ⚠ Precondition 2 is a PRECONDITION, not a control. If the key is ever made
 * live, this suite must not be run without deciding where the mail goes.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const BASE = process.env.SECURITY_TEST_BASE_URL ?? 'http://localhost:3000';
const PAID_SESSION_ID = process.env.GTC280_PAID_SESSION_ID;
const TAG = 'GTC280PAID';

let passed = 0;
let failed = 0;
const red: string[] = [];

function assert(phase: string, label: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`\x1b[32m✓\x1b[0m [${phase}] ${label}`);
    passed++;
  } else {
    console.error(`\x1b[31m✗\x1b[0m [${phase}] ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
    red.push(`[${phase}] ${label}`);
  }
}

const mask = (e: string) => `${e.slice(0, 1)}•••@${e.split('@')[1] ?? '?'}`;

interface Spend {
  status: number;
  setCookie: string;
  body: {
    event?: { id: string; name: string; hostId: string };
    alreadySignedIn?: boolean;
    relation?: string;
    signInEmailSentTo?: string | null;
    signedInAs?: string | null;
  };
}

async function spend(cookie?: string): Promise<Spend> {
  const res = await fetch(`${BASE}/api/events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify({ stripeSessionId: PAID_SESSION_ID }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, setCookie: res.headers.get('set-cookie') ?? '', body };
}

/** Deletes the Event a spend created, which re-arms the paid session. */
async function unspend(eventId: string | undefined, email: string) {
  if (eventId) {
    await prisma.inviteEvent.deleteMany({ where: { eventId } });
    await prisma.personEvent.deleteMany({ where: { eventId } });
    await prisma.eventRole.deleteMany({ where: { eventId } });
    await prisma.event.deleteMany({ where: { id: eventId } });
  }
  await prisma.magicLink.deleteMany({ where: { email, createdAt: { gte: startedAt } } });
}

const startedAt = new Date();

async function main() {
  // ══ PRECONDITIONS ═══════════════════════════════════════════════════════════

  assert(
    'precondition',
    'GTC280_PAID_SESSION_ID is supplied — this suite proves nothing without a really-paid session',
    !!PAID_SESSION_ID
  );
  if (!PAID_SESSION_ID) return;

  const probeKey = process.env.GTC265_PROBE_KEY;
  let resendStatus = 0;
  if (probeKey) {
    try {
      resendStatus = (
        await fetch('https://api.resend.com/domains', {
          headers: { Authorization: `Bearer ${probeKey}` },
        })
      ).status;
    } catch {
      resendStatus = 0;
    }
  }
  const providerRejects = [400, 401, 403].includes(resendStatus);
  assert(
    'precondition',
    `the mail provider REJECTS this key (read-only probe returned ${resendStatus}) — every spend below triggers a real send attempt and none of them can leave the machine`,
    providerRejects
  );
  if (!providerRejects) {
    console.error(
      '\x1b[31m✗\x1b[0m [precondition] HALTED. Driving the paid path with a live key would email a real person.'
    );
    return;
  }

  const key = process.env.STRIPE_SECRET_KEY ?? '';
  assert(
    'precondition',
    'STRIPE_SECRET_KEY is present in THIS process — `tsx` does not load `.env.local`, and `src/lib/stripe.ts` throws at import without it',
    key.length > 0
  );
  if (!key) return;
  assert(
    'precondition',
    'Stripe is in TEST mode — the charge is not real money',
    key.startsWith('sk_test')
  );
  if (!key.startsWith('sk_test')) return;

  const { stripe } = await import('../src/lib/stripe');

  const session = await stripe.checkout.sessions.retrieve(PAID_SESSION_ID);
  const paidEmail = session.customer_details?.email ?? '';
  assert(
    'precondition',
    'the supplied Checkout Session is PAID',
    session.payment_status === 'paid'
  );
  assert(
    'precondition',
    'it carries an email and the event metadata',
    !!paidEmail && !!session.metadata?.eventName
  );
  if (session.payment_status !== 'paid' || !paidEmail) return;

  const owner = await prisma.user.findUnique({ where: { email: paidEmail } });
  assert(
    'precondition',
    `the paid address ${mask(paidEmail)} ALREADY has a User — that is the whole finding, and without it this drives branch 4 instead of branch 3`,
    !!owner
  );
  if (!owner) return;

  const ownerRolesBefore = await prisma.eventRole.count({ where: { userId: owner.id } });
  const sessionsBefore = await prisma.session.count();
  const ownerSessionsBefore = await prisma.session.count({ where: { userId: owner.id } });
  console.log(
    `\n  baseline — Session rows: ${sessionsBefore}, owner's sessions: ${ownerSessionsBefore}, owner's roles: ${ownerRolesBefore}\n`
  );

  let created: string | undefined;

  try {
    // ══ SPEND 1 — BRANCH 3: no session, and the address already has an account ══
    //
    // This is the vulnerability's own path. Before the fix it returned
    // Set-Cookie with a 30-day session for `owner`.

    const s1 = await spend();
    created = s1.body.event?.id;

    assert(
      'branch 3',
      'the event is created and the payment is honoured',
      s1.status === 200 && !!created
    );
    assert(
      'branch 3',
      '⚠ NO session cookie comes back. This is the fix: a receipt proves a payment, never an identity',
      !s1.setCookie.includes('session='),
      s1.setCookie.slice(0, 120)
    );
    assert(
      'branch 3',
      'and NO Session row was created — counted, not read off the header',
      (await prisma.session.count()) === sessionsBefore
    );
    assert(
      'branch 3',
      "the owner's own live sessions are untouched",
      (await prisma.session.count({ where: { userId: owner.id } })) === ownerSessionsBefore
    );
    assert(
      'branch 3',
      'POSITIVE CONTROL: the event is attached to the paid address as HOST, so the payment bought something',
      (await prisma.eventRole.count({
        where: { userId: owner.id, eventId: created, role: 'HOST' },
      })) === 1
    );
    assert(
      'branch 3',
      'POSITIVE CONTROL: a sign-in link was issued to the paid address',
      (await prisma.magicLink.count({
        where: { email: paidEmail, createdAt: { gte: startedAt } },
      })) >= 1
    );
    assert(
      'branch 3',
      'and the response says so, masked, so the screen can tell her where to look',
      s1.body.relation === 'NO_SESSION' &&
        s1.body.alreadySignedIn === false &&
        !!s1.body.signInEmailSentTo
    );

    await unspend(created, paidEmail);
    created = undefined;

    // ══ SPEND 2 — BRANCH 1: signed in AS the paying address ════════════════════
    //
    // The founder's constraint made executable: a host who legitimately pays for
    // her second event must still get in, with no extra step.

    const ownerToken = `${TAG}-owner-${Date.now()}`;
    await prisma.session.create({
      data: {
        userId: owner.id,
        token: ownerToken,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    const withOwner = await prisma.session.count();

    const s2 = await spend(`session=${ownerToken}`);
    created = s2.body.event?.id;

    assert('branch 1', 'the event is created', s2.status === 200 && !!created);
    assert(
      'branch 1',
      'she is told she is already signed in, so the client sends her straight to setup — NO extra step, NO email',
      s2.body.alreadySignedIn === true && s2.body.relation === 'SESSION_MATCHES'
    );
    assert(
      'branch 1',
      'no NEW session row was minted — her own is what she keeps using',
      (await prisma.session.count()) === withOwner
    );
    assert(
      'branch 1',
      'and no cookie was set over the top of hers',
      !s2.setCookie.includes('session=')
    );

    await unspend(created, paidEmail);
    created = undefined;
    await prisma.session.deleteMany({ where: { token: ownerToken } });

    // ══ SPEND 3 — BRANCH 2: signed in as SOMEONE ELSE ══════════════════════════
    //
    // The silent switch is the thing that must not survive. Moving someone's
    // event under them is no better than moving their session, so neither is
    // done: the event goes to the paid address and the session is left alone.

    const other = await prisma.user.create({
      data: { email: `${TAG}-other-${Date.now()}@example.com` },
    });
    const otherToken = `${TAG}-other-${Date.now()}`;
    await prisma.session.create({
      data: {
        userId: other.id,
        token: otherToken,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    const withOther = await prisma.session.count();

    const s3 = await spend(`session=${otherToken}`);
    created = s3.body.event?.id;

    assert(
      'branch 2',
      'the event is still created — the payment is honoured either way',
      s3.status === 200 && !!created
    );
    assert(
      'branch 2',
      'it is attached to the PAID address, not to the session holder',
      (await prisma.eventRole.count({ where: { userId: owner.id, eventId: created } })) === 1 &&
        (await prisma.eventRole.count({ where: { userId: other.id, eventId: created } })) === 0
    );
    assert(
      'branch 2',
      "⚠ the other user's session is NOT clobbered — no cookie came back at all, so the silent switch cannot happen",
      !s3.setCookie.includes('session=') &&
        (await prisma.session.count({ where: { token: otherToken } })) === 1
    );
    assert('branch 2', 'no new Session row anywhere', (await prisma.session.count()) === withOther);
    assert(
      'branch 2',
      'and the mismatch is reported, masked, so the screen can say it out loud',
      s3.body.relation === 'SESSION_MISMATCH' && !!s3.body.signedInAs && !!s3.body.signInEmailSentTo
    );

    await unspend(created, paidEmail);
    created = undefined;
    await prisma.session.deleteMany({ where: { token: otherToken } });
    await prisma.user.deleteMany({ where: { id: other.id } });
  } finally {
    // ── Row accounting. GTC-269's rule: no unexplained credential row survives.
    await unspend(created, paidEmail);
    await prisma.session.deleteMany({ where: { token: { startsWith: TAG } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: TAG } } });

    const sessionsAfter = await prisma.session.count();
    const rolesAfter = await prisma.eventRole.count({ where: { userId: owner?.id ?? '' } });
    const strayLinks = await prisma.magicLink.count({
      where: { email: paidEmail, createdAt: { gte: startedAt } },
    });
    assert(
      'row accounting',
      `Session rows are back to the baseline (${sessionsBefore})`,
      sessionsAfter === sessionsBefore,
      `now ${sessionsAfter}`
    );
    assert(
      'row accounting',
      `the owner holds the same number of EventRoles as before (${ownerRolesBefore})`,
      rolesAfter === ownerRolesBefore,
      `now ${rolesAfter}`
    );
    assert(
      'row accounting',
      'no MagicLink issued by this run survives',
      strayLinks === 0,
      `${strayLinks} remain`
    );
  }
}

main()
  .catch((err) => {
    console.error('\x1b[31mSuite crashed:\x1b[0m', err);
    failed++;
    red.push('suite crashed');
  })
  .finally(async () => {
    await prisma.$disconnect();
    console.log(`\n\x1b[1m\x1b[33m=== Test Summary ===\x1b[0m`);
    console.log(`Total tests: ${passed + failed}`);
    console.log(`\x1b[32mPassed: ${passed}\x1b[0m`);
    console.log(`\x1b[31mFailed: ${failed}\x1b[0m`);
    if (failed) {
      console.log('\n\x1b[31mRED:\x1b[0m');
      red.forEach((r) => console.log(`  ${r}`));
    }
    process.exit(failed > 0 ? 1 : 0);
  });
