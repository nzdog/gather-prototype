/**
 * GTC-265 — Resend errors are never inspected.
 *
 * Run: npm run test:email-send-result
 *
 * THE RULE THIS SUITE HOLDS, and it is GTC-265's central rule:
 *
 *   A sender RETURNS its result and does not DECIDE what to do about a failure.
 *   Each caller decides. `POST /api/auth/magic-link` and `POST /api/auth/claim`
 *   stay byte-identical whatever happens, because that is enumeration
 *   protection. The post-payment send fails loudly, because the payer typed the
 *   address herself and there is nothing to enumerate.
 *
 * ── WHY THE FIXTURE SETS A KEY, WHICH LOOKS BACKWARDS ─────────────────────────
 *
 * `new Resend(undefined)` THROWS ("Missing API key"). Under `tsx`, `.env.local`
 * is not loaded, so `RESEND_API_KEY` is unset and `getResendClient()` throws —
 * which the senders' own `try/catch` turns into `{ success: false }` all by
 * itself. A suite that left the key unset would therefore go GREEN against the
 * UNFIXED code and prove nothing.
 *
 * So layer 2 sets a syntactically-valid sentinel key, lets the client construct,
 * and stubs `globalThis.fetch` to hand back Resend's own failure envelope. That
 * is the real defect: the SDK RETURNS its error rather than throwing it. The
 * constructor-throw path is asserted separately so that nobody later "fixes"
 * this by leaning on the throw.
 *
 * ── NOTHING IS SENT BY THIS SUITE ─────────────────────────────────────────────
 *
 * Layers 1-3 stub `globalThis.fetch`; no request leaves the process.
 *
 * Layer 4 drives the real nudge route over HTTP, because `requireEventRole`
 * reads a session cookie and cannot be driven in process. That server holds a
 * real `RESEND_API_KEY`. Its safety is asserted, not assumed: the suite refuses
 * to run layer 4 unless a read-only probe of `GET /domains` shows the key is
 * rejected. See `assertProviderCannotSend`. ⚠ That is a PRECONDITION, not a
 * control — see GTC-274, which is where the general problem lives.
 *
 * Destructive to its own created rows only; cleans up in `finally`.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TAG = 'GTC265';
const BASE = process.env.GTC265_TEST_BASE_URL ?? 'http://localhost:3000';

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

// ── The stub ──────────────────────────────────────────────────────────────────
//
// Resend's transport is `globalThis.fetch` and its failure envelope is built by
// reading `response.ok`, then `response.text()`, then `JSON.parse`. A real
// `Response` satisfies all three, so the stub hands back real ones rather than
// a hand-rolled shape that could drift from what the SDK actually reads.

const RESEND_401_BODY = {
  statusCode: 401,
  name: 'validation_error',
  message: 'API key is invalid',
};

const realFetch = globalThis.fetch;
let fetchCalls = 0;

function stubFetchFailing() {
  fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls++;
    return new Response(JSON.stringify(RESEND_401_BODY), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
}

function stubFetchSucceeding() {
  fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls++;
    return new Response(JSON.stringify({ id: `${TAG}-stub-message-id` }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
}

function restoreFetch() {
  globalThis.fetch = realFetch;
}

// Resend's own `logError` writes to console.error on every failure, and the
// senders are required to record server-side. Both land here; the suite reads
// the buffer to prove the record exists rather than trusting that it does.
const realConsoleError = console.error;
let errorLog: string[] = [];
function captureConsoleError() {
  errorLog = [];
  console.error = (...args: unknown[]) => {
    errorLog.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
  };
}
function restoreConsoleError() {
  console.error = realConsoleError;
}

// ── Fixture bookkeeping ───────────────────────────────────────────────────────
const createdMagicLinkIds: string[] = [];
const createdPersonIds: string[] = [];
const createdUserIds: string[] = [];
const createdEventIds: string[] = [];

async function magicLinkCount(email: string) {
  return prisma.magicLink.count({ where: { email } });
}

/**
 * ⚠ THE PRECONDITION FOR LAYER 4, AND IT IS MEASURED RATHER THAN ASSUMED.
 *
 * Read-only. `GET /domains` creates nothing and sends nothing. If the key is
 * live this returns 200, layer 4 is skipped as a FAILED assertion rather than a
 * silent pass, and no email is risked. An unrun check must never read as a pass
 * (GTC-267).
 */
async function assertProviderCannotSend(): Promise<boolean> {
  const key = process.env.GTC265_PROBE_KEY;
  if (!key) {
    // The dev server's key is not visible to `tsx` (it lives in `.env.local`).
    // The runner passes it in explicitly so this probe can be performed.
    assert(
      'layer 4 precondition',
      'GTC265_PROBE_KEY is supplied so the provider state can be MEASURED before any route that could send is driven',
      false
    );
    return false;
  }
  let status = 0;
  try {
    const res = await realFetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${key}` },
    });
    status = res.status;
  } catch {
    status = 0;
  }
  const rejected = status === 400 || status === 401 || status === 403;
  assert(
    'layer 4 precondition',
    `the provider REJECTS this key (read-only probe returned ${status}) — so no route driven below can send anything`,
    rejected
  );
  return rejected;
}

async function main() {
  // Force the sentinel BEFORE the module is loaded, so the cached client
  // constructs. See the header: an unset key makes the constructor throw and
  // the whole suite passes against unfixed code.
  process.env.RESEND_API_KEY = 're_GTC265_sentinel_not_a_real_key';
  process.env.EMAIL_FROM = process.env.EMAIL_FROM ?? 'Gather Test <test@gather.invalid>';

  const email = await import('../src/lib/email');
  const { sendNudgeEmail, sendMagicLinkEmail, sendWelcomeEmail } = email;

  // ══ LAYER 1 — the rule is written where the next person will meet it ════════
  const fs = await import('fs');
  const emailSrc = fs.readFileSync('src/lib/email.ts', 'utf8');
  assert(
    'the rule',
    "src/lib/email.ts records the return-don't-decide rule in its own header, not only in the ticket",
    /returns? its result/i.test(emailSrc) && /does not decide|not\s+decide/i.test(emailSrc)
  );
  assert(
    'the rule',
    'and it names the asymmetry it exists for — enumeration protection on one side, a loud failure on the other',
    /enumerat/i.test(emailSrc)
  );

  // ══ LAYER 2 — the senders, against a stubbed provider ═══════════════════════
  //
  // Every assertion here is paired: a failure must be reported as a failure AND
  // a success must still be reported as a success. A sender that returns
  // `{ success: false }` unconditionally would pass half of this layer.

  stubFetchFailing();
  captureConsoleError();
  const nudgeFail = await sendNudgeEmail({
    to: `${TAG}-nudge@example.com`,
    subject: 'x',
    body: 'y',
    eventId: 'x',
    personId: 'y',
  });
  restoreConsoleError();

  assert(
    'stub',
    'CONTROL: the stub was actually reached — a green here means nothing if fetch was never called',
    fetchCalls === 1
  );
  assert(
    'sendNudgeEmail',
    'reports FAILURE when Resend returns an error envelope — the SDK returns its error rather than throwing it',
    nudgeFail.success === false
  );
  assert(
    'sendNudgeEmail',
    "and surfaces Resend's own message so the caller can log something useful",
    typeof nudgeFail.error === 'string' && /API key is invalid/.test(nudgeFail.error!)
  );

  stubFetchSucceeding();
  const nudgeOk = await sendNudgeEmail({
    to: `${TAG}-nudge@example.com`,
    subject: 'x',
    body: 'y',
    eventId: 'x',
    personId: 'y',
  });
  assert(
    'sendNudgeEmail',
    'CONTROL: a SUCCESSFUL send is still reported as success — the fix must not report every send as failed',
    nudgeOk.success === true
  );

  // sendMagicLinkEmail — Zone 2, and it returns rather than decides.
  stubFetchFailing();
  captureConsoleError();
  const magicFail = await sendMagicLinkEmail(`${TAG}-magic@example.com`, `${TAG}-token-a`);
  const magicFailLog = errorLog.join('\n');
  restoreConsoleError();
  assert(
    'sendMagicLinkEmail',
    'returns a result instead of void, and reports FAILURE — the caller cannot decide about something it never sees',
    !!magicFail && magicFail.success === false
  );
  // ⚠ THIS ASSERTION WAS WEAKER THAN IT LOOKED, AND THE HISTORY IS RECORDED
  // BECAUSE THE FIRST MUTATION RUN LIED.
  //
  // It first matched /resend|email|send/i. Resend's OWN internal `logError`
  // writes "[Resend API Error]:" to console.error, which satisfies /resend/i —
  // so deleting the sender's record would have changed nothing.
  //
  // Mutation M3 (delete the record) was run against that weak form and reported
  // ZERO failures. That reading was worthless: the substitution had silently
  // failed to apply and the code under test was unmutated. Re-applied properly,
  // M3 failed three assertions. A controlled re-run then put the ORIGINAL weak
  // assertions back alongside the real mutation, and only ONE of the three
  // failed — the NODE_ENV=production one below, which did not exist before. So
  // the weakness was real and the strengthening is not decoration.
  //
  // The rule this leaves behind, and it is GTC-267's with a new instance: a
  // mutation that reports no failures has made two claims, not one — that the
  // assertion is weak, AND that the mutation applied. Verify the second before
  // believing the first.
  //
  // The assertion now requires the sender's own prefix, and the one below runs
  // the same call under NODE_ENV=production — where the SDK's log goes silent —
  // so that Resend's logging cannot stand in for ours.
  assert(
    'sendMagicLinkEmail',
    "RECORDS the failure server-side under the SENDER's own prefix — the gap GTC-265 Unknown 1 names is that nobody, not even the server, knows",
    /\[Email\]/.test(magicFailLog) && /REJECTED/.test(magicFailLog)
  );

  const savedNodeEnv = process.env.NODE_ENV;
  stubFetchFailing();
  captureConsoleError();
  (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
  await sendMagicLinkEmail(`${TAG}-prod@example.com`, `${TAG}-token-prod`);
  (process.env as Record<string, string | undefined>).NODE_ENV = savedNodeEnv;
  const prodLog = errorLog.join('\n');
  restoreConsoleError();
  assert(
    'sendMagicLinkEmail',
    "and the record survives NODE_ENV=production, where Resend's own logError goes silent — the record must be ours, not the SDK's",
    /\[Email\]/.test(prodLog) && /REJECTED/.test(prodLog) && !/Resend API Error/.test(prodLog)
  );

  stubFetchSucceeding();
  const magicOk = await sendMagicLinkEmail(`${TAG}-magic@example.com`, `${TAG}-token-b`);
  assert(
    'sendMagicLinkEmail',
    'CONTROL: a successful send still reports success',
    !!magicOk && magicOk.success === true
  );

  // sendWelcomeEmail — Zone 2 as well, because it mints a MagicLink.
  const welcomeAddr = `${TAG}-welcome-${Date.now()}@example.com`;
  const beforeLinks = await magicLinkCount(welcomeAddr);
  stubFetchFailing();
  captureConsoleError();
  const welcomeFail = await sendWelcomeEmail(welcomeAddr, `${TAG} event`, 'evt_x');
  restoreConsoleError();
  const afterLinks = await magicLinkCount(welcomeAddr);
  const welcomeLinks = await prisma.magicLink.findMany({ where: { email: welcomeAddr } });
  welcomeLinks.forEach((l) => createdMagicLinkIds.push(l.id));

  assert(
    'sendWelcomeEmail',
    'returns a result instead of void, and reports FAILURE — this is the sender GTC-280 depends on',
    !!welcomeFail && welcomeFail.success === false
  );

  // ⚠ ZONE 2 CONTROL. The sign-off for this ticket is "inspect the result,
  // record the failure, return it" and explicitly NOT "change generation,
  // expiry or consumption". These two assertions are what makes that
  // checkable rather than merely promised.
  assert(
    'Zone 2 control',
    'the MagicLink is still minted — generation is untouched by this ticket',
    afterLinks === beforeLinks + 1
  );
  assert(
    'Zone 2 control',
    'and its expiry is still 30 days — GTC-282 owns that number, not this ticket',
    welcomeLinks.length === 1 &&
      Math.abs(welcomeLinks[0].expiresAt.getTime() - (Date.now() + 30 * 24 * 60 * 60 * 1000)) <
        5 * 60 * 1000
  );

  stubFetchSucceeding();
  const welcomeAddr2 = `${TAG}-welcome2-${Date.now()}@example.com`;
  const welcomeOk = await sendWelcomeEmail(welcomeAddr2, `${TAG} event`, 'evt_x');
  (await prisma.magicLink.findMany({ where: { email: welcomeAddr2 } })).forEach((l) =>
    createdMagicLinkIds.push(l.id)
  );
  assert(
    'sendWelcomeEmail',
    'CONTROL: a successful send still reports success',
    !!welcomeOk && welcomeOk.success === true
  );

  // ⚠ THE CONSTRUCTOR PATH, ASSERTED SO NOBODY LEANS ON IT.
  //
  // `new Resend(undefined)` throws. That throw is why an unset key makes the
  // UNFIXED senders look correct, and it is a real path in production too — an
  // env var can go missing. Both doors must report failure, and this assertion
  // stops a future reader concluding the throw was the whole fix.
  restoreFetch();
  const savedKey = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  // A fresh module instance, so the cached client is rebuilt without a key.
  const emailNoKey = await import(`../src/lib/email?nokey=${Date.now()}`);
  captureConsoleError();
  const thrownPath = await emailNoKey.sendNudgeEmail({
    to: `${TAG}-nokey@example.com`,
    subject: 'x',
    body: 'y',
    eventId: 'x',
    personId: 'y',
  });
  restoreConsoleError();
  process.env.RESEND_API_KEY = savedKey;
  assert(
    'both doors',
    'a MISSING key is also reported as failure — the throw path and the returned-error path agree',
    thrownPath.success === false
  );

  // ══ LAYER 3 — the auth callers stay byte-identical ══════════════════════════
  //
  // The senders now return a result. The two enumeration-protected callers must
  // go on ignoring it in their RESPONSE while recording it on the server. Driven
  // in process: neither route reads a cookie.

  stubFetchFailing();
  const magicRoute = await import('../src/app/api/auth/magic-link/route');
  const enumAddr = `${TAG}-enum-${Date.now()}@example.com`;

  captureConsoleError();
  const failRes = await magicRoute.POST(
    new Request('http://localhost/api/auth/magic-link', {
      method: 'POST',
      body: JSON.stringify({ email: enumAddr }),
    })
  );
  const failBody = await failRes.text();
  const failLog = errorLog.join('\n');
  restoreConsoleError();

  stubFetchSucceeding();
  const okRes = await magicRoute.POST(
    new Request('http://localhost/api/auth/magic-link', {
      method: 'POST',
      body: JSON.stringify({ email: enumAddr }),
    })
  );
  const okBody = await okRes.text();

  (await prisma.magicLink.findMany({ where: { email: enumAddr } })).forEach((l) =>
    createdMagicLinkIds.push(l.id)
  );

  assert(
    'enumeration protection',
    'POST /api/auth/magic-link answers IDENTICALLY whether the send failed or succeeded — same status, same bytes',
    failRes.status === okRes.status && failBody === okBody
  );
  assert(
    'enumeration protection',
    'and it is still the generic success body — the protection is intact, not merely unchanged',
    failBody === JSON.stringify({ ok: true })
  );
  assert(
    'enumeration protection',
    "but the SERVER knows: a failed magic-link send is recorded under the sender's own prefix. The response shape was never the gap — the gap was that nobody knew at all",
    /\[Email\]/.test(failLog) && /REJECTED/.test(failLog)
  );

  restoreFetch();
  restoreConsoleError();

  // ══ LAYER 4 — the nudge route, over HTTP ════════════════════════════════════
  //
  // GTC-265's three most important assertions live here: the 502, the absent
  // NUDGE_SENT_HOST, and the un-started cooldown. They are only observable
  // through the real route, because the cooldown reads rows the route writes.

  const safe = await assertProviderCannotSend();
  if (!safe) {
    console.error(
      '\x1b[31m✗\x1b[0m [layer 4] NOT RUN — the provider precondition was not met. ' +
        'Layer 4 drives a route that would send a real email if the key were live. ' +
        'This is a FAILURE, not a skip: an unrun check must not read as a pass.'
    );
    failed++;
    redAssertions.push('[layer 4] NOT RUN — provider precondition unmet');
    return;
  }

  let probeStatus = 0;
  try {
    probeStatus = (await fetch(`${BASE}/api/events/none/glance`)).status;
  } catch {
    probeStatus = 0;
  }
  assert(
    'layer 4',
    `the dev server is healthy on ${BASE} — a guarded sibling answers 401, not 500 or ECONNREFUSED`,
    probeStatus === 401
  );
  if (probeStatus !== 401) return;

  const now = new Date();
  const DAY = 24 * 60 * 60 * 1000;

  const hostUser = await prisma.user.create({
    data: { email: `${TAG}-host-${Date.now()}@example.com` },
  });
  createdUserIds.push(hostUser.id);
  const sessionToken = `${TAG}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  await prisma.session.create({
    data: { userId: hostUser.id, token: sessionToken, expiresAt: new Date(Date.now() + DAY) },
  });

  const hostPerson = await prisma.person.create({
    data: { name: `${TAG} Host`, email: `${TAG}-hostperson-${Date.now()}@example.com` },
  });
  createdPersonIds.push(hostPerson.id);

  const event = await prisma.event.create({
    data: {
      name: `${TAG} email-leg event`,
      startDate: new Date(now.getTime() + 7 * DAY),
      endDate: new Date(now.getTime() + 8 * DAY),
      status: 'CONFIRMING',
      hostId: hostPerson.id,
      sentAt: new Date(now.getTime() - 3 * DAY),
    },
  });
  createdEventIds.push(event.id);
  await prisma.eventRole.create({
    data: { userId: hostUser.id, eventId: event.id, role: 'HOST' },
  });

  // ⚠ EMAIL-ONLY, AND THAT IS THE WHOLE FIXTURE. `chooseManualNudgeChannel`
  // picks SMS whenever a valid +64 number is present, which is why
  // tests/glance-actions-test.ts never reaches this leg at all.
  const emailOnly = await prisma.person.create({
    data: {
      name: `${TAG} EmailOnly`,
      email: `${TAG}-emailonly-${Date.now()}@example.com`,
      phoneNumber: null,
    },
  });
  createdPersonIds.push(emailOnly.id);
  await prisma.personEvent.create({
    data: {
      personId: emailOnly.id,
      eventId: event.id,
      role: 'PARTICIPANT',
      householdRole: 'GUEST',
      sentAt: new Date(now.getTime() - 3 * DAY),
    },
  });
  await prisma.personEvent.create({
    data: {
      personId: hostPerson.id,
      eventId: event.id,
      role: 'PARTICIPANT',
      householdRole: 'GUEST',
      sentAt: new Date(now.getTime() - 3 * DAY),
    },
  });

  const NUDGE = `${BASE}/api/events/${event.id}/people/${emailOnly.id}/nudge`;
  const headers = {
    'Content-Type': 'application/json',
    Cookie: `session=${sessionToken}`,
  };
  const body = JSON.stringify({ template: 'warm', message: 'a nudge that will not be sent' });

  const first = await fetch(NUDGE, { method: 'POST', headers, body });
  const firstJson = (await first.json().catch(() => null)) as { error?: string } | null;

  assert(
    'layer 4',
    'a failed EMAIL send is refused with 502, exactly as the SMS leg already is — the route never had two behaviours, it had one and was being lied to',
    first.status === 502
  );
  assert(
    'layer 4',
    'and it reached the provider rather than being refused earlier — a 403 or 400 here would prove a different gate, not this one',
    first.status !== 403 && first.status !== 400 && first.status !== 401
  );

  const logged = await prisma.inviteEvent.count({
    where: { eventId: event.id, personId: emailOnly.id, type: 'NUDGE_SENT_HOST' },
  });
  assert(
    'layer 4',
    'NO NUDGE_SENT_HOST row is written for a send that never left — the row is what the audit trail shows the host',
    logged === 0
  );

  const second = await fetch(NUDGE, { method: 'POST', headers, body });
  assert(
    'layer 4',
    'and the 24-hour cooldown never started, so an immediate retry is NOT 429 — she is not locked out of retrying a message that was never sent',
    second.status !== 429
  );
  assert(
    'layer 4',
    'the retry fails the same way it did the first time — 502, not a new error',
    second.status === 502
  );

  void firstJson;

  // ══ LAYER 5 — THE SECOND CONSUMER, and what the fix DOES to it ══════════════
  //
  // `sendNudgeEmail` has a consumer GTC-265 never named: `src/lib/wrap-up.ts`,
  // reached by the `/api/cron/wrap-up-dispatch` cron. It already reads
  // `emailResult.success`, already sets `failed`/`failReason`, and already logs
  // `WRAPUP_MESSAGE_FAILED`. It was written for a truthful sender and was being
  // lied to.
  //
  // ⚠ THIS WILL LOOK LIKE A REGRESSION AND IT IS THE FIX WORKING. On a machine
  // whose key is present but rejected — the dev server, and production — rows
  // that used to read WRAPUP_MESSAGE_SENT now read WRAPUP_MESSAGE_FAILED. Those
  // messages were never sent. The dispatcher wrote SENT because the sender told
  // it the send had succeeded.
  //
  // ⚠ AND IT IS INVISIBLE TO THE THREE WRAP-UP SUITES, WHICH IS WHY THIS LAYER
  // EXISTS. They run under `tsx`, where `.env.local` is not loaded, so
  // RESEND_API_KEY is unset, so `getResendClient()` THROWS and the unfixed
  // sender already returned `{ success: false }`. Those suites were green
  // before this fix and are green after it because they never saw the defect at
  // all. Only a key-present, provider-rejecting environment shows it — which is
  // the environment that matters and the one no suite had.
  //
  // Safe to run: `dispatchPendingWrapUpMessages` scans WrapUpLink rows GLOBALLY
  // rather than by event, so this layer first asserts that the only pending rows
  // are its own. Nothing can send — fetch is stubbed for the email leg and this
  // link is `channel: 'email'`.

  const wrapPerson = await prisma.person.create({
    data: {
      name: `${TAG} WrapGuest`,
      email: `${TAG}-wrapguest-${Date.now()}@example.com`,
    },
  });
  createdPersonIds.push(wrapPerson.id);
  await prisma.personEvent.create({
    data: {
      personId: wrapPerson.id,
      eventId: event.id,
      role: 'PARTICIPANT',
      householdRole: 'GUEST',
      sentAt: new Date(now.getTime() - 3 * DAY),
    },
  });

  const strayPending = await prisma.wrapUpLink.count({ where: { dispatched: false } });
  assert(
    'layer 5 precondition',
    "no OTHER pending WrapUpLink rows exist — the dispatcher scans globally, so this layer must not be able to touch anyone else's",
    strayPending === 0
  );

  if (strayPending === 0) {
    // ⚠ THE CLOCK IS DERIVED FROM THE INJECTED `now`, NOT FROM THE REAL ONE.
    //
    // `dispatchPendingWrapUpMessages(now)` selects rows with
    // `createdAt <= now - DISPATCH_DELAY_MINUTES` and defers the whole batch
    // during NZ quiet hours (21:00-08:00). Those two constraints pull in
    // opposite directions if the fixture uses the wall clock for one and an
    // injected time for the other: a `now` pinned to NZ midday can land in the
    // past relative to a row stamped `Date.now()`, and the batch comes back
    // empty. It did, on the first run. Both timestamps now come from the same
    // chosen instant.
    const middayNZ = new Date();
    middayNZ.setUTCHours(1, 0, 0, 0); // NZ 13:00 — outside the quiet window
    const link = await prisma.wrapUpLink.create({
      data: {
        token: `${TAG}-wrap-${Date.now()}`,
        eventId: event.id,
        personId: wrapPerson.id,
        guestName: `${TAG} WrapGuest`,
        guestEmail: wrapPerson.email,
        channel: 'email',
        // Older than DISPATCH_DELAY_MINUTES (10) relative to `middayNZ`.
        createdAt: new Date(middayNZ.getTime() - 30 * 60 * 1000),
        expiresAt: new Date(middayNZ.getTime() + 30 * DAY),
      },
    });

    stubFetchFailing();
    captureConsoleError();
    const { dispatchPendingWrapUpMessages } = await import('../src/lib/wrap-up');
    const result = await dispatchPendingWrapUpMessages(middayNZ);
    restoreConsoleError();
    restoreFetch();

    const after = await prisma.wrapUpLink.findUnique({ where: { id: link.id } });
    const failedLog = await prisma.inviteEvent.count({
      where: { eventId: event.id, personId: wrapPerson.id, type: 'WRAPUP_MESSAGE_FAILED' },
    });
    const sentLog = await prisma.inviteEvent.count({
      where: { eventId: event.id, personId: wrapPerson.id, type: 'WRAPUP_MESSAGE_SENT' },
    });

    assert(
      'layer 5',
      'the dispatcher attempted exactly this one link — the batch was not empty and was not wider than its fixture',
      result.total === 1 && result.deferred === 0
    );
    assert(
      'layer 5',
      'a rejected email send is now counted as FAILED by the wrap-up dispatcher, not as sent',
      result.failed === 1 && result.sent === 0
    );
    assert(
      'layer 5',
      'the WrapUpLink row records failed=true with a reason — the row the retry route reads',
      after?.failed === true && typeof after?.failReason === 'string' && !!after?.failReason
    );
    assert(
      'layer 5',
      'and the audit trail says WRAPUP_MESSAGE_FAILED, not WRAPUP_MESSAGE_SENT. ⚠ This is the fix working: before it, this row said SENT for a message that never left',
      failedLog === 1 && sentLog === 0
    );

    await prisma.wrapUpLink.deleteMany({ where: { id: link.id } });
  }
}

main()
  .catch((err) => {
    restoreFetch();
    restoreConsoleError();
    console.error('\x1b[31mSuite crashed:\x1b[0m', err);
    failed++;
    redAssertions.push('suite crashed');
  })
  .finally(async () => {
    restoreFetch();
    restoreConsoleError();
    // Teardown, in dependency order.
    try {
      if (createdEventIds.length) {
        await prisma.inviteEvent.deleteMany({ where: { eventId: { in: createdEventIds } } });
        await prisma.personEvent.deleteMany({ where: { eventId: { in: createdEventIds } } });
        await prisma.eventRole.deleteMany({ where: { eventId: { in: createdEventIds } } });
        await prisma.event.deleteMany({ where: { id: { in: createdEventIds } } });
      }
      if (createdPersonIds.length) {
        await prisma.person.deleteMany({ where: { id: { in: createdPersonIds } } });
      }
      if (createdUserIds.length) {
        await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
        await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      }
      if (createdMagicLinkIds.length) {
        await prisma.magicLink.deleteMany({ where: { id: { in: createdMagicLinkIds } } });
      }
    } catch (cleanupErr) {
      console.error('\x1b[31mTEARDOWN FAILED — rows may remain:\x1b[0m', cleanupErr);
      failed++;
    }
    await prisma.$disconnect();

    console.log('\n\x1b[1m\x1b[33m=== Test Summary ===\x1b[0m');
    console.log(`Total tests: ${passed + failed}`);
    console.log(`\x1b[32mPassed: ${passed}\x1b[0m`);
    console.log(`\x1b[31mFailed: ${failed}\x1b[0m`);
    if (failed > 0) {
      console.log('\n\x1b[31mRED:\x1b[0m');
      redAssertions.forEach((a) => console.log(`  ${a}`));
    }
    process.exit(failed > 0 ? 1 : 0);
  });
