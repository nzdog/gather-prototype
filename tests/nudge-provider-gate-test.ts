/**
 * GTC-214 — The nudge paths must not gate on a Twilio credential check.
 *
 * `isSmsEnabled` (twilio-client.ts) is the TWILIO predicate: three env vars, none of them
 * TNZ's. `sendSms` routes `+64`/`+61` to TNZ and consults `isSmsEnabled` only in its Twilio
 * arm, so it is correct. Three CALLERS check `isSmsEnabled` before ever reaching it, and on
 * a TNZ-only deployment each fails differently: `runNudgeScheduler` early-returns before its
 * `try` (killing all three nudge families), `POST` in trigger-nudges/route.ts 400s, and the
 * `canSms` expression in people/[personId]/nudge/route.ts silently reroutes a valid NZ mobile
 * to email while reporting `success: true`.
 *
 * WHY THE ENVIRONMENT IS THE FIXTURE, AND WHY THIS FILE CREATES NO ROWS.
 * `isSmsEnabled` and `isTnzEnabled` both close over a module-scope `isConfigured` computed
 * once at import. They cannot be changed after import, only before it — so every module
 * under test is loaded with `await import()` AFTER `process.env` is stripped. Nothing else
 * can control them. Consequently this file needs no database fixtures at all: it creates
 * nothing, deletes nothing, and has no cleanup, because the condition under test is the
 * process environment rather than any row.
 *
 * NOTHING IS SENT, ON ANY PATH, IN RED OR IN GREEN. Three independent reasons, and the test
 * depends on all three:
 *
 *  1. BOTH providers are stripped, not just Twilio. `sendSms` then fails closed at its
 *     configuration check — before `sendViaTnz` and before `client.messages.create`. A
 *     placeholder `TNZ_AUTH_TOKEN` would NOT be safe: with a `+64` destination it makes a
 *     real POST to api.tnz.co.nz. Do not "fix" this file by setting one.
 *  2. The nudge senders have NO email fallback. `processNudges` and `processProxyNudges`
 *     reach `sendSms` and stop; nothing in `src/lib/sms/` imports
 *     `sendNudgeEmail`. This matters because `RESEND_API_KEY` is live in `.env` and an email
 *     fallback would make a genuine Resend call (the hazard wrap-up-quiet-hours-test.ts
 *     records). `chooseManualNudgeChannel` is asserted as a pure function precisely so the
 *     route's email branch is never entered.
 *  3. `sendSms` writes an InviteEvent for INVALID_NUMBER and for send outcomes, but NOT on
 *     the SMS_DISABLED return, and `sendNudge` stamps `nudge24hSentAt` only on success. With
 *     both providers absent the scheduler run is therefore read-only. The one exception is
 *     quiet hours (21:00-08:00 NZ), where the senders log NUDGE_DEFERRED_QUIET rows for real
 *     candidates; the assertions below are written to hold on either branch.
 *
 * THE POSITIVE CONTROL RUNS IN A CHILD PROCESS. Module-scope config means one process gets
 * one answer, so "the cron still reports healthy when a provider IS configured" cannot be
 * asserted in the same process as "it reports unhealthy when none is". The child re-runs
 * this file with the ambient `.env` (Twilio configured locally). That child is safe for the
 * same reason the ticket exists: every nudge candidate is `isValidNZNumber`-gated, so all of
 * them route to the TNZ arm, which is unconfigured locally and fails closed. Twilio cannot
 * be reached from the nudge scheduler even when Twilio is configured.
 *
 * Run: npx tsx tests/nudge-provider-gate-test.ts
 * ⚠ Since [[GTC-189]] slice 8b, layer B creates ONE tagged fixture event, because the scheduler now
 * writes reminder rows; it removes the fixture and everything under it, and asserts the outbound
 * count is back where it started (founder ruling D1). Nothing else creates rows.
 */

import { execFileSync } from 'child_process';
import { prisma } from '../src/lib/prisma';

// Captured BEFORE stripping, so the child process can run with the real configuration.
const AMBIENT_ENV = { ...process.env };

const IS_POSITIVE_CONTROL = process.argv.includes('--positive-control');

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

/** Strip every SMS provider credential so both predicates compute false at import. */
function stripProviderCredentials() {
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
  delete process.env.TWILIO_PHONE_NUMBER;
  delete process.env.TNZ_AUTH_TOKEN;
  // Falsy CRON_SECRET makes `GET` skip its auth guard, so the cron route can be exercised
  // directly without minting a secret into the test.
  delete process.env.CRON_SECRET;
}

// ──────────────────────────────────────────────────────────────────────────────
// The positive control (child process): ambient .env, provider configured.
// ──────────────────────────────────────────────────────────────────────────────
/*
 * ⚠ THE LIVE-SMS GUARD — founder ruling, 2026-09-27 (GTC-189 slice 8's gate). ENDED BY [[GTC-274]].
 *
 * This layer drives the real nudge cron against the real database with the AMBIENT environment,
 * so on a machine holding a TNZ token it would text real guests ([[GTC-270]]'s finding, filed as
 * GTC-274). The gate is now every `test:*` script, so the day a provider credential lands on a
 * machine that runs it, this layer refuses — red and loud — instead of sending. An explicit
 * opt-in is the only way past it. GTC-274 replaces the ambient provider with a stubbed one and
 * removes this guard.
 */
export const LIVE_SMS_OPT_IN = 'GATHER_ALLOW_LIVE_SMS_TEST';
const PROVIDER_CREDENTIALS = [
  'TNZ_AUTH_TOKEN',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_PHONE_NUMBER',
] as const;

async function positiveControl() {
  const present = PROVIDER_CREDENTIALS.filter((k) => !!process.env[k]);
  if (present.length > 0 && process.env[LIVE_SMS_OPT_IN] !== '1') {
    console.error(
      `\n\x1b[41m\x1b[1m REFUSED — SMS PROVIDER CREDENTIALS ARE PRESENT (${present.join(', ')}). \x1b[0m\n` +
        `\x1b[31mThis layer drives the real nudge cron against the real database and would send real\n` +
        `texts to real guests. It will not run unless ${LIVE_SMS_OPT_IN}=1 is set explicitly.\n` +
        `The fix that retires this guard is GTC-274 (a stubbed provider).\x1b[0m\n`
    );
    assert(
      'CONTROL',
      `REFUSED: provider credentials present and ${LIVE_SMS_OPT_IN} is not set — nothing was sent (GTC-274)`,
      false
    );
    return;
  }

  console.log('\n\x1b[1mPositive control — a provider IS configured\x1b[0m\n');

  delete process.env.CRON_SECRET;

  const { isSmsEnabled } = await import('../src/lib/sms/twilio-client');
  const { isTnzEnabled } = await import('../src/lib/sms/tnz-client');

  const configured = isSmsEnabled() || isTnzEnabled();
  assert(
    'CONTROL',
    'at least one provider is configured in the ambient environment (else this control proves nothing)',
    configured
  );
  if (!configured) return;

  // GTC-270: the cron routes now REFUSE when CRON_SECRET is unset, and this process
  // loads `.env` (tsx does not load `.env.local`), so it has none. Set one and supply
  // it, so this section goes on testing what it was written to test — the provider
  // gate — instead of stopping at the auth guard.
  //
  // SET BEFORE THE IMPORT. The route reads CRON_SECRET at module scope, so the value
  // has to be in place before the module is first loaded; a later assignment is
  // invisible to it. The `||` keeps the value stable across both call sites, because
  // the second import is served from the module cache and inherits the first one's view.
  process.env.CRON_SECRET = process.env.CRON_SECRET || 'gtc270-nudge-provider-gate-test';

  const { GET } = await import('../src/app/api/cron/nudges/route');
  const { NextRequest } = await import('next/server');

  const res = await GET(
    new NextRequest(
      `http://localhost:3000/api/cron/nudges?secret=${encodeURIComponent(process.env.CRON_SECRET)}`
    )
  );
  const body = await res.json();

  assert('CONTROL', 'cron reports smsConfigured: true', body.smsConfigured === true);
  assert(
    'CONTROL',
    'no nudge reached Twilio even though Twilio IS configured (every candidate is +64 → TNZ arm)',
    (body.results?.succeeded ?? 0) === 0
  );

  // THE SCENARIO THE TIGHTENING EXISTS FOR, observed live rather than argued.
  // Local dev is Twilio-configured and TNZ-absent, so `smsConfigured` is true while every
  // +64 nudge fails at the TNZ arm. Before the tightening this returned 200 / success:true
  // — a monitor's-eye view of a cron that had sent nothing.
  const attempted = body.results?.sent ?? 0;
  if (attempted > 0 && (body.results?.succeeded ?? 0) === 0) {
    assert(
      'CONTROL',
      `all ${attempted} sends failed → cron does NOT return 200 despite smsConfigured: true`,
      res.status !== 200 && body.success !== true && body.ok === false
    );
  } else {
    assert(
      'CONTROL',
      'nothing failed wholesale → cron returns 200 / success: true',
      res.status === 200 && body.success === true && body.ok === true
    );
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// The main suite: no provider configured at all.
// ──────────────────────────────────────────────────────────────────────────────
async function main() {
  stripProviderCredentials();

  // ── A. Control: provider selection is `sendSms`'s job, and it does it correctly ──────
  // Passes RED and GREEN — `sendSms` is not modified by this ticket. It is here because
  // "delete the caller gates and let sendSms route" is only safe if sendSms really does
  // route, and each arm's distinct error string proves which arm was taken with no network
  // call and no database write.
  console.log('\n\x1b[1mA — provider routing belongs to sendSms\x1b[0m\n');

  const { isSmsEnabled } = await import('../src/lib/sms/twilio-client');
  const { isTnzEnabled } = await import('../src/lib/sms/tnz-client');

  assert('A', 'isSmsEnabled() is false — Twilio credentials stripped', isSmsEnabled() === false);
  assert('A', 'isTnzEnabled() is false — TNZ credential stripped', isTnzEnabled() === false);

  const { sendSms } = await import('../src/lib/sms/send-sms');

  const nz = await sendSms({
    to: '+64211234567',
    message: 'GTC-214 probe — never dispatched',
    eventId: 'gtc214-no-such-event',
    personId: 'gtc214-no-such-person',
  });
  assert('A', '+64 destination is blocked as SMS_DISABLED', nz.blocked === 'SMS_DISABLED');
  assert(
    'A',
    '+64 took the TNZ arm — error names TNZ, not Twilio',
    (nz.error ?? '').includes('TNZ')
  );

  const us = await sendSms({
    to: '+12025551234',
    message: 'GTC-214 probe — never dispatched',
    eventId: 'gtc214-no-such-event',
    personId: 'gtc214-no-such-person',
  });
  assert('A', 'non-+64 destination is blocked as SMS_DISABLED', us.blocked === 'SMS_DISABLED');
  assert(
    'A',
    'non-+64 took the Twilio arm — error names Twilio, not TNZ',
    (us.error ?? '').includes('Twilio')
  );

  // ── B. The scheduler must run its finders regardless of Twilio ──────────────────────
  console.log('\n\x1b[1mB — runNudgeScheduler must not early-return on a Twilio check\x1b[0m\n');

  const { runNudgeScheduler } = await import('../src/lib/sms/nudge-scheduler');

  /*
   * ⚠ SCOPED TO ITS OWN FIXTURE, AND IT LEAVES NOTHING BEHIND — founder ruling D1, 2026-09-27.
   *
   * Since [[GTC-189]] slice 8b the scheduler WRITES a row per reminder instead of attempting a send.
   * Run unscoped here it queued reminders on real `gather_dev` boards (two were found on the security
   * fixture's live event), and any later unscoped drain with a working key or a TNZ token would have
   * sent them. So the run is scoped to one tagged event holding one due guest, the rows it writes are
   * counted, and the fixture and everything under it is removed — gather_dev is restored exactly,
   * which is asserted against the counts taken before, the way the other suites restore it.
   */
  const outboundTotal = () => prisma.outboundMessage.count();
  const beforeTotal = await outboundTotal();
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const DAY = 24 * 60 * 60 * 1000;
  const fxHost = await prisma.person.create({ data: { name: `GTC214 gate host ${stamp}` } });
  const fxGuest = await prisma.person.create({
    data: { name: `GTC214 gate guest ${stamp}`, phoneNumber: '+64211230999' },
  });
  const fxEvent = await prisma.event.create({
    data: {
      name: `GTC214 gate ${stamp}`,
      startDate: new Date(Date.now() + 30 * DAY),
      endDate: new Date(Date.now() + 30 * DAY),
      hostId: fxHost.id,
      status: 'CONFIRMING',
      sentAt: new Date(Date.now() - 10 * DAY),
    },
  });
  let run: Awaited<ReturnType<typeof runNudgeScheduler>>;
  let wroteOnFixture = 0;
  let wroteElsewhere = 0;
  try {
    await prisma.personEvent.create({
      data: { personId: fxHost.id, eventId: fxEvent.id, role: 'HOST' },
    });
    await prisma.personEvent.create({
      data: {
        personId: fxGuest.id,
        eventId: fxEvent.id,
        role: 'PARTICIPANT',
        sentAt: new Date(Date.now() - 5 * DAY),
      },
    });
    await prisma.accessToken.create({
      data: {
        token: `gtc214-gate-${stamp}`,
        scope: 'PARTICIPANT',
        eventId: fxEvent.id,
        personId: fxGuest.id,
        expiresAt: new Date(Date.now() + 30 * DAY),
      },
    });
    run = await runNudgeScheduler(new Date(), { eventIds: [fxEvent.id] });
    wroteOnFixture = await prisma.outboundMessage.count({ where: { eventId: fxEvent.id } });
    wroteElsewhere = (await outboundTotal()) - beforeTotal - wroteOnFixture;
  } finally {
    await prisma.event.delete({ where: { id: fxEvent.id } }); // cascades its rows
    await prisma.person.deleteMany({ where: { id: { in: [fxHost.id, fxGuest.id] } } });
  }
  assert('B', 'the scoped run wrote its reminder on its OWN fixture event', wroteOnFixture === 1);
  assert('B', 'and wrote nothing on any other board in gather_dev (D1)', wroteElsewhere === 0);
  assert(
    'B',
    'and gather_dev is restored exactly: the outbound count equals the count before the run',
    (await outboundTotal()) === beforeTotal
  );

  // `proxyCandidates` is set only on the full-run return. The `!isSmsEnabled()` early return
  // and the `catch` both omit it, so its presence is a shape-level proof that the finders
  // were reached — and it does not depend on the local database containing any candidate.
  /*
   * ⚠ REPLACED AT [[GTC-189]] SLICE 8b. This read `proxyCandidates` as a shape-level proof that the
   * run got inside its `try`. Rulings V and AE retire the proxy reminder, so the field is gone, and the
   * proof is now the other half of the same shape: the `catch` is the only path that sets `errors`,
   * and it returns zeroed candidates — so a run with no errors reached the finder and returned from
   * the `try`. Still independent of the database holding any candidate.
   */
  assert(
    'B',
    'the run reached the finder and returned from the try — no early return, no caught error',
    Array.isArray(run.errors) && run.errors.length === 0 && Array.isArray(run.candidates?.skipped)
  );
  assert(
    'B',
    'rulings V / AE — the proxy household reminder is retired: the run carries no proxy branch',
    !('proxyCandidates' in run) && !('proxyResults' in run)
  );
  assert(
    'B',
    "errors does not contain 'SMS not configured'",
    !run.errors.includes('SMS not configured')
  );
  assert(
    'B',
    'the run reports smsConfigured: false rather than claiming to be fine',
    (run as { smsConfigured?: boolean }).smsConfigured === false
  );
  assert(
    'B',
    'the run reports ok: false — no provider is configured, so this run cannot do its job',
    (run as { ok?: boolean }).ok === false
  );

  // ── B2. The health verdict, all four quadrants, without a database or a provider ────
  // The live cron can only ever show one quadrant per process, because provider config is
  // captured at module scope. This is the seam where the whole rule is assertable.
  console.log('\n\x1b[1mB2 — isNudgeRunHealthy\x1b[0m\n');

  const { isNudgeRunHealthy } = await import('../src/lib/sms/nudge-scheduler');

  assert(
    'B2',
    'no provider configured → unhealthy, whatever the counts',
    isNudgeRunHealthy({ smsConfigured: false, attempted: 0, succeeded: 0 }) === false &&
      isNudgeRunHealthy({ smsConfigured: false, attempted: 3, succeeded: 3 }) === false
  );
  assert(
    'B2',
    'configured + nothing to send → healthy (an idle cron is a working cron)',
    isNudgeRunHealthy({ smsConfigured: true, attempted: 0, succeeded: 0 }) === true
  );
  assert(
    'B2',
    'configured + every send failed → UNHEALTHY (the Twilio-set/TNZ-absent hole)',
    isNudgeRunHealthy({ smsConfigured: true, attempted: 2, succeeded: 0 }) === false
  );
  assert(
    'B2',
    'configured + partial failure → healthy (one bad number must not flap the alert)',
    isNudgeRunHealthy({ smsConfigured: true, attempted: 5, succeeded: 1 }) === true
  );
  assert(
    'B2',
    'quiet-hours deferral attempts nothing → healthy, not mistaken for total failure',
    isNudgeRunHealthy({ smsConfigured: true, attempted: 0, succeeded: 0 }) === true
  );

  // ── C. The manual nudge must not reroute a valid NZ mobile to email ─────────────────
  console.log('\n\x1b[1mC — chooseManualNudgeChannel\x1b[0m\n');

  const { chooseManualNudgeChannel } = await import('../src/lib/sms/manual-nudge-recipient');

  assert(
    'C',
    'chooseManualNudgeChannel is exported',
    typeof chooseManualNudgeChannel === 'function'
  );

  if (typeof chooseManualNudgeChannel === 'function') {
    // THE DEFECT. A host presses nudge on a guest with a perfectly good NZ mobile; with
    // Twilio unconfigured the old expression resolved to 'email' and the host was told the
    // nudge succeeded.
    assert(
      'C',
      'valid +64, not opted out, has email → sms (NOT email) with Twilio unconfigured',
      chooseManualNudgeChannel({
        phoneNumber: '+64211234567',
        smsOptedOut: false,
        email: 'guest@example.test',
      }) === 'sms'
    );

    assert(
      'C',
      'valid +64, no email → sms',
      chooseManualNudgeChannel({
        phoneNumber: '+64211234567',
        smsOptedOut: false,
        email: null,
      }) === 'sms'
    );

    // Zone 7. Opt-out outranks the phone number, in both directions.
    assert(
      'C',
      'opted out + email → email, never sms [zone 7]',
      chooseManualNudgeChannel({
        phoneNumber: '+64211234567',
        smsOptedOut: true,
        email: 'guest@example.test',
      }) === 'email'
    );
    assert(
      'C',
      'opted out + no email → none, never sms [zone 7]',
      chooseManualNudgeChannel({
        phoneNumber: '+64211234567',
        smsOptedOut: true,
        email: null,
      }) === 'none'
    );

    assert(
      'C',
      'non-NZ number falls back to email — isValidNZNumber still gates the manual path',
      chooseManualNudgeChannel({
        phoneNumber: '+12025551234',
        smsOptedOut: false,
        email: 'guest@example.test',
      }) === 'email'
    );
    assert(
      'C',
      'no phone + email → email',
      chooseManualNudgeChannel({
        phoneNumber: null,
        smsOptedOut: false,
        email: 'g@example.test',
      }) === 'email'
    );
    assert(
      'C',
      "no phone + no email → none (the route's 400 path survives)",
      chooseManualNudgeChannel({ phoneNumber: null, smsOptedOut: false, email: null }) === 'none'
    );
  }

  // ── D. The cron must not report a healthy run when it cannot send ───────────────────
  console.log('\n\x1b[1mD — /api/cron/nudges must not report success with no provider\x1b[0m\n');

  // GTC-270: the cron routes now REFUSE when CRON_SECRET is unset, and this process
  // loads `.env` (tsx does not load `.env.local`), so it has none. Set one and supply
  // it, so this section goes on testing what it was written to test — the provider
  // gate — instead of stopping at the auth guard.
  //
  // SET BEFORE THE IMPORT. The route reads CRON_SECRET at module scope, so the value
  // has to be in place before the module is first loaded; a later assignment is
  // invisible to it. The `||` keeps the value stable across both call sites, because
  // the second import is served from the module cache and inherits the first one's view.
  process.env.CRON_SECRET = process.env.CRON_SECRET || 'gtc270-nudge-provider-gate-test';

  const { GET } = await import('../src/app/api/cron/nudges/route');
  const { NextRequest } = await import('next/server');

  /*
   * ⚠ D1, FOUNDER RULING 2026-09-27 — THIS IS WHERE THE LEFTOVER ROWS CAME FROM. The real cron route
   * runs the scheduler across every live event and cannot be scoped from outside, and since
   * [[GTC-189]] slice 8b the scheduler QUEUES a row per due reminder. So the rows present before the
   * call are recorded, every row the call wrote is removed afterwards, and the count is asserted
   * restored. The scheduler writes nothing else (a leg's stamp is written only at a provider's
   * acceptance, by the dispatcher), so this restores gather_dev exactly.
   */
  const rowsBefore = new Set(
    (await prisma.outboundMessage.findMany({ select: { id: true } })).map((r) => r.id)
  );
  let res: Response;
  let body: any;
  try {
    res = await GET(
      new NextRequest(
        `http://localhost:3000/api/cron/nudges?secret=${encodeURIComponent(process.env.CRON_SECRET)}`
      )
    );
    body = await res.json();
  } finally {
    const written = (await prisma.outboundMessage.findMany({ select: { id: true } }))
      .map((r) => r.id)
      .filter((id) => !rowsBefore.has(id));
    await prisma.outboundMessage.deleteMany({ where: { id: { in: written } } });
  }
  assert(
    'D',
    'D1 — every row the cron run wrote is removed: the outbound count is back where it started',
    (await prisma.outboundMessage.count()) === rowsBefore.size
  );

  assert('D', 'cron does NOT return HTTP 200 when no provider is configured', res.status !== 200);
  assert(
    'D',
    'cron does NOT report success: true when no provider is configured',
    body.success !== true
  );
  assert('D', 'cron surfaces smsConfigured: false in the body', body.smsConfigured === false);

  // ── E. The gate is gone everywhere, not just where the tests look ───────────────────
  console.log('\n\x1b[1mE — structural: no caller-side Twilio gate survives\x1b[0m\n');

  const fs = await import('fs');
  const path = await import('path');
  const repo = path.join(__dirname, '..');
  const read = (rel: string) => fs.readFileSync(path.join(repo, rel), 'utf8');

  /**
   * Comments are stripped before every source assertion below. These files now DISCUSS
   * `isSmsEnabled` at length — that is the point of the comments GTC-214 leaves behind —
   * and a bare `includes()` would assert on prose rather than on code. Naming the thing
   * you removed must not read as still doing it.
   */
  const code = (rel: string) =>
    read(rel)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

  assert(
    'E',
    'validateTwilioSignature is no longer exported (zero callers; GTC-229 ruled delete, not wire)',
    !code('src/lib/sms/twilio-client.ts').includes('validateTwilioSignature')
  );

  // These three must not consult provider configuration AT ALL — the decision is not
  // theirs. Full relative paths, not basenames: two of them are called route.ts.
  for (const rel of [
    'src/lib/sms/manual-nudge-recipient.ts',
    'src/app/api/events/[id]/trigger-nudges/route.ts',
    'src/app/api/events/[id]/people/[personId]/nudge/route.ts',
  ]) {
    assert('E', `${rel} does not consult isSmsEnabled`, !code(rel).includes('isSmsEnabled'));
  }

  // The scheduler is the one caller allowed to name it, and only to REPORT. That it does
  // not GATE on it is asserted behaviourally in B, which is the stronger statement; what
  // is checked here is that the report stayed destination-aware rather than reverting to
  // a Twilio-only signal.
  const scheduler = code('src/lib/sms/nudge-scheduler.ts');
  assert(
    'E',
    'nudge-scheduler.ts reports on TNZ as well as Twilio — the signal is not Twilio-only',
    scheduler.includes('isTnzEnabled') && scheduler.includes('isSmsEnabled')
  );
  assert(
    'E',
    'nudge-scheduler.ts no longer carries an isSmsEnabled early-return gate',
    !/if\s*\(\s*!\s*isSmsEnabled\s*\(\s*\)\s*\)/.test(scheduler)
  );

  assert(
    'E',
    'the Twilio arm of sendSms still consults isSmsEnabled — the check moved, it was not abolished',
    code('src/lib/sms/send-sms.ts').includes('isSmsEnabled')
  );

  // The precise repo-wide invariant: exactly two call sites survive, each deliberate.
  const callSites = execFileSync(
    'grep',
    ['-rn', '--include=*.ts', '--include=*.tsx', 'isSmsEnabled()', 'src'],
    { cwd: repo, encoding: 'utf8' }
  )
    .trim()
    .split('\n')
    // Drop comment lines (these files discuss the predicate on purpose) and the
    // declaration itself — `isSmsEnabled(): boolean` contains `isSmsEnabled()`.
    .filter((l) => !/:\s*(\*|\/\/)/.test(l) && !/function\s+isSmsEnabled/.test(l));
  /*
   * ⚠ 2 → 3, MOVED AT [[GTC-189]] SLICE 8a's PIN COMMIT (founder ruling, 2026-09-27). Slice 7b
   * (59decd3) added `smsProviderConfiguredFor` to send-sms.ts — founder answer 1's fence for the
   * bounce door, which answers per destination exactly as `sendSms` does — and did not run this
   * suite. It is a REPORT beside the sender, not a gate on the run, so the invariant this assertion
   * protects (no early return on the Twilio predicate) is intact. Pinned by where each site is, so a
   * third gate elsewhere still fails.
   */
  assert(
    'E',
    `isSmsEnabled() has exactly 3 call sites: sendSms's Twilio arm, smsProviderConfiguredFor beside it (slice 7b), and the scheduler's report (found ${callSites.length})`,
    callSites.length === 3 &&
      callSites.filter((l) => l.includes('src/lib/sms/send-sms.ts')).length === 2 &&
      callSites.some((l) => l.includes('nudge-scheduler.ts'))
  );

  const envExample = read('.env.example');
  assert('E', '.env.example documents TNZ_AUTH_TOKEN', envExample.includes('TNZ_AUTH_TOKEN'));
  assert(
    'E',
    '.env.example no longer claims Twilio is required for auto-nudge',
    !envExample.includes('Required for auto-nudge functionality')
  );

  assert(
    'E',
    'the decide-by header note no longer records the gate as a live constraint',
    !read('src/lib/sms/decide-by-scheduler.ts').includes('early-returns on `!isSmsEnabled()`')
  );
}

// ──────────────────────────────────────────────────────────────────────────────

async function run() {
  if (IS_POSITIVE_CONTROL) {
    await positiveControl();
  } else {
    await main();
  }

  await prisma.$disconnect();

  // The child inherits the ambient environment on purpose — see the header.
  if (!IS_POSITIVE_CONTROL && failed === 0) {
    console.log('\n\x1b[2m— spawning positive control with the real .env —\x1b[0m');
    try {
      const out = execFileSync('npx', ['tsx', __filename, '--positive-control'], {
        env: AMBIENT_ENV,
        encoding: 'utf8',
        stdio: 'pipe',
      });
      process.stdout.write(out);
    } catch (error: any) {
      process.stdout.write(error.stdout ?? '');
      process.stderr.write(error.stderr ?? '');
      failed++;
      redAssertions.push('[CONTROL] positive control failed — see output above');
    }
  }

  console.log(`\n${'─'.repeat(70)}`);
  console.log(`\x1b[32mPassed: ${passed}\x1b[0m   \x1b[31mFailed: ${failed}\x1b[0m`);
  if (failed > 0) {
    console.log('\n\x1b[31mRED assertions:\x1b[0m');
    redAssertions.forEach((a) => console.log(`  ${a}`));
    process.exit(1);
  }
  console.log('\n\x1b[32m\x1b[1m✓ GTC-214 — no caller-side Twilio gate on any nudge path\x1b[0m');
  process.exit(0);
}

run().catch(async (error) => {
  console.error('\n\x1b[31mFatal:\x1b[0m', error);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
