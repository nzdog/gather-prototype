/**
 * GTC-280 — a Stripe receipt is not proof of identity.
 *
 * Run: npm run test:gtc280
 *
 * THE RULE THIS SUITE HOLDS:
 *
 *   A payment may CREATE an event and ATTACH it to an address. It may never,
 *   on its own, return a credential for an account.
 *
 * Stated as one testable sentence: **POST /api/events never sets a session
 * cookie.** One assertion, one code path. The founder's reason for taking the
 * uniform branch rather than the variant is that "a route with one branch that
 * mints and three that do not is a route someone will later simplify in the
 * wrong direction."
 *
 * ── WHAT IS HERE AND WHAT IS NOT ──────────────────────────────────────────────
 *
 * Layers 1-3 need no Stripe and no network beyond the dev server, and run in
 * the ordinary sweep.
 *
 * The end-to-end proof — a really-paid Checkout Session spent against the real
 * route — cannot run here, because completing a Checkout Session requires
 * Stripe's hosted page and there is no API that fakes one. It lives in
 * `npm run test:gtc280-paid`, is run deliberately with a session id in
 * `GTC280_PAID_SESSION_ID`, and its output is pasted into the ticket. The repo
 * already treats `test:tnz-sms` this way.
 *
 * ⚠ NOTHING IS SENT BY THIS SUITE. Layer 3 stubs `globalThis.fetch` before
 * touching a sender. Layer 2 drives only routes that refuse before reaching a
 * provider.
 *
 * Destructive to its own created rows only; cleans up in `finally`.
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

const prisma = new PrismaClient();

const TAG = 'GTC280';
const BASE = process.env.SECURITY_TEST_BASE_URL ?? 'http://localhost:3000';

let passed = 0;
let failed = 0;
const red: string[] = [];

function assert(phase: string, label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`\x1b[32m✓\x1b[0m [${phase}] ${label}`);
    passed++;
  } else {
    console.error(`\x1b[31m✗\x1b[0m [${phase}] ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
    red.push(`[${phase}] ${label}`);
  }
}

const src = (p: string) => fs.readFileSync(p, 'utf8');

/** Comments stripped, so a tombstone quoting the old code is not read as the code. */
function code(p: string): string {
  return src(p)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

const createdIds = { user: [] as string[], person: [] as string[], magicLink: [] as string[] };

async function main() {
  // ══ LAYER 1 — the invariant, and the shape of the change ════════════════════

  const eventsRoute = code('src/app/api/events/route.ts');
  const verifyRoute = code('src/app/api/auth/verify/route.ts');

  assert(
    'the invariant',
    'POST /api/events sets NO session cookie anywhere in the file — one sentence, one code path',
    !/cookies\s*\.\s*set\s*\(\s*['"`]session['"`]/.test(eventsRoute) &&
      !/\.set\(\s*['"`]session['"`]/.test(eventsRoute)
  );
  assert(
    'the invariant',
    'CONTROL: POST /api/auth/verify STILL sets it — the detector finds a cookie set where one exists, so the absence above means something',
    /\.set\(\s*['"`]session['"`]/.test(verifyRoute)
  );
  assert(
    'the invariant',
    'and no Session row is created by the events route either — the cookie is not the only way to hand one out',
    !/session\s*\.\s*create\s*\(/.test(eventsRoute)
  );
  assert(
    'the invariant',
    'CONTROL: POST /api/auth/verify STILL creates one',
    /session\.create\(/.test(verifyRoute)
  );

  const checkoutRoute = code('src/app/api/billing/checkout/route.ts');
  assert(
    'half 1',
    'POST /api/billing/checkout passes customer_email, so there is ONE address and it is the one she typed',
    /customer_email/.test(checkoutRoute)
  );

  const planNew = src('src/app/plan/new/page.tsx');
  assert(
    'half 1',
    'the email field on /plan/new is REQUIRED — it is the identity field now and cannot stay the only optional one',
    /id="email"[\s\S]{0,300}?required/.test(planNew) ||
      /required[\s\S]{0,300}?id="email"/.test(planNew)
  );
  assert(
    'half 1',
    'gather_prefilled_contact is written nowhere in the tree — collected and discarded is its own bug, and the key had no reader in five months',
    // ⚠ COMMENTS STRIPPED, and `src`/`scripts` only.
    //
    // Two reasons, and both are GTC-267's rule about reading a tombstone as the
    // thing itself. This file names the key in order to assert its absence, so
    // a sweep that read itself could never go green. And `/plan/new` now
    // carries a headed comment explaining why the key was deleted — the
    // explanation of a removal is not the removal undone.
    !/gather_prefilled_contact/.test(
      ['src', 'scripts']
        .flatMap((d) => listFiles(d))
        .map((f) => code(f))
        .join('\n')
    )
  );
  assert(
    'half 1',
    'CONTROL: gather_new_event IS still written and read — the sweep above finds keys where they exist',
    /gather_new_event/.test(planNew)
  );

  const constants = src('GATHER-BUILD-CONSTANTS.md');
  assert(
    'zone 4',
    "Do-Not-Touch Zone 4 names src/app/api/billing/* — the zone's letter and its intent disagreed, and a zone that does not name the files it means gets walked past honestly",
    // The zone is spelled "### 4. Stripe Integration", not "Zone 4" — match the
    // heading the file actually uses, and stop at the next zone heading so a
    // mention under Zone 5 could not satisfy it.
    /### 4\. Stripe Integration[\s\S]*?src\/app\/api\/billing[\s\S]*?### 5\./.test(constants)
  );

  // ══ LAYER 2 — the decision, exhaustively, with no Stripe and no network ═════
  //
  // Extracted so it can be exercised without a cookie context — the same reason
  // and the same pattern as `resolveManualNudgeRecipient` (GTC-172 / C1).

  let resolvePaymentIdentity: unknown;
  try {
    ({ resolvePaymentIdentity } = await import('../src/lib/events/payment-identity'));
  } catch {
    resolvePaymentIdentity = undefined;
  }
  assert(
    'the decision',
    'src/lib/events/payment-identity.ts exports resolvePaymentIdentity',
    typeof resolvePaymentIdentity === 'function'
  );

  if (typeof resolvePaymentIdentity === 'function') {
    const resolve = resolvePaymentIdentity as (
      u: { email: string } | null,
      paid: string
    ) => {
      relation: string;
      alreadySignedIn: boolean;
      needsSignInLink: boolean;
      bindTo: string;
      signedInAs: string | null;
    };

    const PAID = 'sarah@example.com';

    const noSession = resolve(null, PAID);
    assert(
      'branch 3/4',
      'no session → NO_SESSION, a sign-in link is owed, and the event binds to the paid address',
      noSession.relation === 'NO_SESSION' &&
        noSession.needsSignInLink === true &&
        noSession.alreadySignedIn === false &&
        noSession.bindTo === PAID,
      JSON.stringify(noSession)
    );

    const matching = resolve({ email: PAID }, PAID);
    assert(
      'branch 1',
      'a session for the paying address → SESSION_MATCHES, already signed in, NO link owed. This is the honest second event and it must stay frictionless',
      matching.relation === 'SESSION_MATCHES' &&
        matching.alreadySignedIn === true &&
        matching.needsSignInLink === false &&
        matching.bindTo === PAID,
      JSON.stringify(matching)
    );

    const mismatch = resolve({ email: 'someone.else@example.com' }, PAID);
    assert(
      'branch 2',
      'a session for a DIFFERENT user → SESSION_MISMATCH, a link is owed, and the mismatch is reported so it can be said out loud',
      mismatch.relation === 'SESSION_MISMATCH' &&
        mismatch.needsSignInLink === true &&
        mismatch.alreadySignedIn === false &&
        mismatch.signedInAs === 'someone.else@example.com',
      JSON.stringify(mismatch)
    );
    assert(
      'branch 2',
      "and it binds to the PAID address, not the session's — moving someone's event under them is no better than moving their session",
      mismatch.bindTo === PAID
    );

    assert(
      'the decision',
      'case and whitespace do not turn the honest case into the mismatch case',
      resolve({ email: '  SARAH@Example.COM ' }, PAID).relation === 'SESSION_MATCHES'
    );

    assert(
      'the decision',
      'NO input of any relation yields a mint — bindTo is the paid address in all three, and the type carries no field that could mean "hand back a credential"',
      [noSession, matching, mismatch].every((r) => r.bindTo === PAID) &&
        !Object.keys(matching).some((k) => /mint|session(Token)?$|cookie/i.test(k))
    );
  }

  // ══ LAYER 3 — the sign-in email must not claim she is signed in ═════════════
  //
  // Under this fix a signed-out host reaches her paid event ONLY through this
  // link, so the copy that told her "You're currently logged in" is false for
  // exactly the person who now depends on it.

  const realFetch = globalThis.fetch;
  let sentBody = '';
  try {
    process.env.RESEND_API_KEY = 're_GTC280_sentinel_not_a_real_key';
    process.env.EMAIL_FROM = process.env.EMAIL_FROM ?? 'Gather Test <test@gather.invalid>';
    globalThis.fetch = (async (_url: unknown, init: { body?: string } = {}) => {
      sentBody = init.body ?? '';
      return new Response(JSON.stringify({ id: `${TAG}-stub` }), { status: 200 });
    }) as unknown as typeof fetch;

    const { sendWelcomeEmail } = await import('../src/lib/email');
    const addr = `${TAG}-signedout-${Date.now()}@example.com`;
    const out = await (
      sendWelcomeEmail as unknown as (
        e: string,
        n: string,
        i: string,
        o?: { alreadySignedIn?: boolean }
      ) => Promise<{ success: boolean }>
    )(addr, `${TAG} event`, 'evt_x', { alreadySignedIn: false });
    const signedOutCopy = sentBody;
    (await prisma.magicLink.findMany({ where: { email: addr } })).forEach((l) =>
      createdIds.magicLink.push(l.id)
    );

    assert(
      'the copy',
      'the send still reports success through the stub — the copy assertions below are reading a real send',
      out.success === true
    );
    assert(
      'the copy',
      'the signed-OUT email does NOT tell her she is currently logged in — she is not, and this link is the only way in',
      signedOutCopy.length > 0 && !/currently logged in/i.test(signedOutCopy),
      signedOutCopy.slice(0, 160)
    );
    assert(
      'the copy',
      'and it tells her what to do with the link instead',
      /sign in|open your event|get started/i.test(signedOutCopy)
    );

    sentBody = '';
    const addr2 = `${TAG}-signedin-${Date.now()}@example.com`;
    await (
      sendWelcomeEmail as unknown as (
        e: string,
        n: string,
        i: string,
        o?: { alreadySignedIn?: boolean }
      ) => Promise<{ success: boolean }>
    )(addr2, `${TAG} event`, 'evt_x', { alreadySignedIn: true });
    (await prisma.magicLink.findMany({ where: { email: addr2 } })).forEach((l) =>
      createdIds.magicLink.push(l.id)
    );
    assert(
      'the copy',
      'CONTROL: the signed-IN email still says so — the branch is real, not a deletion',
      /currently logged in/i.test(sentBody)
    );

    // ⚠ ZONE 2 CONTROL. The sign-off is call-only: generation, expiry and
    // consumption stay as they are. GTC-282 owns the 30-day number.
    const links = await prisma.magicLink.findMany({ where: { email: addr } });
    assert(
      'Zone 2 control',
      'the MagicLink is still minted by the signed-out path — the flow is CALLED, not changed',
      links.length === 1
    );
    assert(
      'Zone 2 control',
      'and its expiry is still 30 days — GTC-282 owns that number, not this ticket',
      links.length === 1 &&
        Math.abs(links[0].expiresAt.getTime() - (Date.now() + 30 * 24 * 60 * 60 * 1000)) <
          5 * 60 * 1000
    );
  } finally {
    globalThis.fetch = realFetch;
  }

  // ══ LAYER 4 — the route, live, with no charge and no writes ═════════════════

  let probe = 0;
  try {
    probe = (await fetch(`${BASE}/api/events`)).status;
  } catch {
    probe = 0;
  }
  assert(
    'live',
    `the dev server is healthy on ${BASE} — GET /api/events answers 401 with no cookie`,
    probe === 401
  );
  if (probe !== 401) return;

  const sessionsBefore = await prisma.session.count();

  const noBody = await fetch(`${BASE}/api/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  const bogus = await fetch(`${BASE}/api/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stripeSessionId: 'cs_test_gtc280_does_not_exist' }),
  });

  assert(
    'live',
    'a call with no receipt is refused 402 before anything is written',
    noBody.status === 402
  );
  assert('live', 'a call with an unusable receipt is refused 400', bogus.status === 400);
  assert(
    'live',
    'neither refusal set a session cookie',
    !(noBody.headers.get('set-cookie') ?? '').includes('session=') &&
      !(bogus.headers.get('set-cookie') ?? '').includes('session=')
  );
  assert(
    'live',
    'and neither created a Session row — counted, not read off the status code',
    (await prisma.session.count()) === sessionsBefore
  );
}

function listFiles(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) listFiles(p, out);
    else if (/\.(ts|tsx|js|jsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

main()
  .catch((err) => {
    console.error('\x1b[31mSuite crashed:\x1b[0m', err);
    failed++;
    red.push('suite crashed');
  })
  .finally(async () => {
    try {
      if (createdIds.magicLink.length)
        await prisma.magicLink.deleteMany({ where: { id: { in: createdIds.magicLink } } });
      if (createdIds.person.length)
        await prisma.person.deleteMany({ where: { id: { in: createdIds.person } } });
      if (createdIds.user.length)
        await prisma.user.deleteMany({ where: { id: { in: createdIds.user } } });
    } catch (e) {
      console.error('\x1b[31mTEARDOWN FAILED — rows may remain:\x1b[0m', e);
      failed++;
    }
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
