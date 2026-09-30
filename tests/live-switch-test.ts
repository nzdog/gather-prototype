/**
 * [[GTC-274]] — ONE LIVE SWITCH. Nothing leaves any process unless `GATHER_LIVE_SENDS=on`.
 *
 * Founder ruling, 2026-09-29: *"Gather only sends for real where a setting says it's live:
 * production. Anywhere else, including your Mac, every text and email stops at the last step,
 * whatever keys are there, and tests still run in full."*
 *
 * WHAT THIS FILE PROVES, with FAKE credentials for all three providers and every outbound request
 * intercepted and counted (`tests/helpers/provider-trap.ts`), so none can leave the machine:
 *
 *   A. With the switch off, every door stops before its provider: `sendSms` on both arms,
 *      `sendViaTnz` called directly (what `live:tnz-sms` calls), every email sender, and
 *      `getResendClient`. The trap counts nothing, and nothing is recorded as sent.
 *   B. The order of checks in `sendSms`: E.164, then opt-out (Zone 7, first and untouched), then
 *      the provider's configuration, then the gate, then the network. The configuration half runs
 *      in a child process, because the providers' configuration is fixed when their modules load.
 *   C. The positive control: with the gate open BEHIND the trap, each door reaches the trap exactly
 *      once. So the trap sees traffic, and the switch is what stopped it in A.
 *   D. What reads the switch besides the senders: the nudge cron's health (GTC-214), the resend
 *      door's texting predicate, and the dispatcher's retry predicate.
 *   E. The deploy check (`scripts/check-live-sends.mjs`), run as a child process.
 *   F. Tripwires: nothing but the trap helper opens the gate, no env file sets it, and every
 *      provider call in src/ sits in a gated file.
 *
 * It replaces `tests/sms-validation-test.ts` (retired at GTC-274, never run again): that file's five
 * cases are here, on a fixture this file creates and removes by id — its own host, event and
 * people — so the `SmsOptOut` row it needs exists only under its own host, and no real opt-out can
 * be touched (Zone 7).
 *
 * Run: npm run test:live-switch
 */

// ── Fake credentials, BEFORE any sender module loads: they read env at module scope. ──
const NO_TNZ = process.argv.includes('--no-tnz');
process.env.TNZ_AUTH_TOKEN = 'gtc274-fake-tnz-token';
if (NO_TNZ) delete process.env.TNZ_AUTH_TOKEN;
process.env.TWILIO_ACCOUNT_SID = 'AC' + '0'.repeat(32);
process.env.TWILIO_AUTH_TOKEN = 'gtc274fakeauthtoken0000000000000';
process.env.TWILIO_PHONE_NUMBER = '+15005550006';
process.env.RESEND_API_KEY = 're_gtc274_fake_key_not_real';
if (!process.env.UNSUBSCRIBE_TOKEN_SECRET) {
  process.env.UNSUBSCRIBE_TOKEN_SECRET = 'gtc274-fake-unsubscribe-secret';
}
delete process.env.GATHER_LIVE_SENDS;

import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { installProviderTrap, liveBehindTrap, trapCount, trapHits } from './helpers/provider-trap';

installProviderTrap();

/**
 * The switch's module, loaded softly so that RED at a HEAD without it still RUNS every door and
 * shows what reaches a provider, rather than stopping at a missing import.
 */
async function liveSends(): Promise<{
  LIVE_SENDS_OFF: string;
  LiveSendsOffError: new (...a: any[]) => Error;
  isLiveSendingOn: () => boolean;
}> {
  try {
    return await import('../src/lib/live-sends');
  } catch {
    console.error('\x1b[31m(src/lib/live-sends.ts does not exist — there is no switch)\x1b[0m');
    class NoSwitch extends Error {}
    return {
      LIVE_SENDS_OFF: '(no switch at this commit)',
      LiveSendsOffError: NoSwitch,
      isLiveSendingOn: () => false,
    };
  }
}

const REPO = path.join(__dirname, '..');
const SENT_TYPES = [
  'NUDGE_SENT_AUTO',
  'PROXY_NUDGE_SENT',
  'NUDGE_SENT_HOST',
  'WRAPUP_MESSAGE_SENT',
] as const;

let passed = 0;
let failed = 0;
const red: string[] = [];
function assert(phase: string, label: string, condition: boolean, detail = '') {
  if (condition) {
    console.log(`\x1b[32m✓\x1b[0m [${phase}] ${label}`);
    passed++;
  } else {
    console.error(`\x1b[31m✗\x1b[0m [${phase}] ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
    red.push(`[${phase}] ${label}`);
  }
}

/** Run `fn` and report how many requests the trap intercepted while it ran. */
async function reached<T>(
  fn: () => Promise<T>
): Promise<{ result: T | { threw: string }; hits: number; where: string }> {
  const before = trapCount();
  let result: T | { threw: string };
  try {
    result = await fn();
  } catch (e: any) {
    result = { threw: String(e?.message ?? e) };
  }
  const mine = trapHits().slice(before);
  return { result, hits: mine.length, where: mine.map((h) => `${h.via}->${h.target}`).join(', ') };
}

// ─────────────────────────────────────────────────────────────────────────────
// The child: TNZ absent. Configuration is checked BEFORE the gate, so a +64 number with no TNZ
// token is SMS_DISABLED with TNZ's own words, whether the switch is on or off.
// ─────────────────────────────────────────────────────────────────────────────
async function childNoTnz() {
  const { prisma } = await import('../src/lib/prisma');
  const { sendSms } = await import('../src/lib/sms/send-sms');
  const { LIVE_SENDS_OFF } = await liveSends();
  const probe = {
    to: '+64211234567',
    message: 'GTC-274 probe — never dispatched',
    eventId: 'gtc274-no-such-event',
    personId: 'gtc274-no-such-person',
  };

  const off = await reached(() => sendSms(probe));
  const offR = off.result as any;
  assert(
    'B-cfg',
    "switch OFF, no TNZ token: +64 is SMS_DISABLED in TNZ's words, not the switch's (configuration comes first)",
    offR.blocked === 'SMS_DISABLED' &&
      /TNZ_AUTH_TOKEN missing/.test(offR.error ?? '') &&
      offR.error !== LIVE_SENDS_OFF,
    JSON.stringify(offR)
  );
  assert('B-cfg', 'and it reached no provider', off.hits === 0, off.where);

  const close = liveBehindTrap();
  const on = await reached(() => sendSms(probe));
  close();
  const onR = on.result as any;
  assert(
    'B-cfg',
    "switch ON, no TNZ token: still SMS_DISABLED in TNZ's words — today's suites keep their outcome",
    onR.blocked === 'SMS_DISABLED' && /TNZ_AUTH_TOKEN missing/.test(onR.error ?? ''),
    JSON.stringify(onR)
  );
  assert('B-cfg', 'and it reached no provider', on.hits === 0, on.where);
  await prisma.$disconnect();
}

// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  const { prisma } = await import('../src/lib/prisma');
  const { sendSms, smsProviderConfiguredFor } = await import('../src/lib/sms/send-sms');
  const { sendViaTnz } = await import('../src/lib/sms/tnz-client');
  const email = await import('../src/lib/email');
  const { LIVE_SENDS_OFF, LiveSendsOffError, isLiveSendingOn } = await liveSends();

  const sentEverywhere = () =>
    prisma.inviteEvent.count({ where: { type: { in: [...SENT_TYPES] } } });
  const sentGlobalBefore = await sentEverywhere();
  const outboundBefore = await prisma.outboundMessage.count();

  // ── The fixture: its own host, event and people. Removed by id in `finally`. ──
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const DAY = 24 * 60 * 60 * 1000;
  const OPTED_OUT = '+64211111111';
  const WELCOME_TO = `gtc274-welcome-${stamp}@example.invalid`;
  const host = await prisma.person.create({ data: { name: `GTC274 switch host ${stamp}` } });
  const guest = await prisma.person.create({
    data: { name: `GTC274 switch guest ${stamp}`, phoneNumber: '+64211234567' },
  });
  const event = await prisma.event.create({
    data: {
      name: `GTC274 switch ${stamp}`,
      startDate: new Date(Date.now() + 30 * DAY),
      endDate: new Date(Date.now() + 30 * DAY),
      hostId: host.id,
      status: 'CONFIRMING',
    },
  });
  let optOutId: string | null = null;
  let welcomeLinkId: string | null = null;

  const on = (to: string) => ({
    to,
    message: 'GTC-274 probe — never dispatched',
    eventId: event.id,
    personId: guest.id,
  });
  const rowsOnFixture = (types?: readonly string[]) =>
    prisma.inviteEvent.count({
      where: { eventId: event.id, ...(types ? { type: { in: [...types] } } : {}) },
    });

  try {
    const optOut = await prisma.smsOptOut.create({
      data: { phoneNumber: OPTED_OUT, hostId: host.id, rawMessage: 'STOP (GTC-274 fixture)' },
    });
    optOutId = optOut.id;

    // ── A. Switch off: every door stops before its provider ─────────────────────
    console.log('\n\x1b[1mA — switch off: every door stops before its provider\x1b[0m\n');
    assert(
      'A',
      'the switch reads off: GATHER_LIVE_SENDS is unset in this process',
      isLiveSendingOn() === false
    );

    for (const [label, to] of [
      ['+64 (TNZ arm)', '+64211234567'],
      ['+64 second number (TNZ arm)', '+64222222222'],
      ['+1 (Twilio arm)', '+12025550123'],
    ] as const) {
      const r = await reached(() => sendSms(on(to)));
      const res = r.result as any;
      assert(
        'A',
        `sendSms ${label}: SMS_DISABLED in the switch's words`,
        res.success === false && res.blocked === 'SMS_DISABLED' && res.error === LIVE_SENDS_OFF,
        JSON.stringify(res)
      );
      assert('A', `sendSms ${label}: reached no provider`, r.hits === 0, r.where);
    }

    const tnz = await reached(() => sendViaTnz({ to: '+64211234567', message: 'GTC-274 probe' }));
    assert(
      'A',
      "sendViaTnz called directly (what live:tnz-sms calls): stopped in the switch's words",
      (tnz.result as any).success === false && (tnz.result as any).error === LIVE_SENDS_OFF,
      JSON.stringify(tnz.result)
    );
    assert('A', 'sendViaTnz called directly: reached no provider', tnz.hits === 0, tnz.where);

    const emailDoors: [string, () => Promise<any>][] = [
      [
        'sendMagicLinkEmail',
        () => email.sendMagicLinkEmail('gtc274@example.invalid', 'fake-token'),
      ],
      [
        'sendNudgeEmail',
        () =>
          email.sendNudgeEmail({
            to: 'gtc274@example.invalid',
            subject: 's',
            body: 'b',
            eventId: event.id,
            personId: guest.id,
          }),
      ],
      [
        'sendAskEmail',
        () =>
          email.sendAskEmail({
            to: 'gtc274@example.invalid',
            subject: 's',
            body: 'b',
            replyTo: 'host@example.invalid',
            fromName: 'Host',
            eventId: event.id,
            personId: guest.id,
          }),
      ],
      [
        'sendChaseEmail',
        () =>
          email.sendChaseEmail({
            to: 'gtc274@example.invalid',
            subject: 's',
            body: 'b',
            replyTo: 'host@example.invalid',
            fromName: 'Host',
            eventId: event.id,
            personId: guest.id,
          }),
      ],
      ['sendWelcomeEmail', () => email.sendWelcomeEmail(WELCOME_TO, 'GTC274', event.id)],
    ];
    for (const [label, call] of emailDoors) {
      const r = await reached(call);
      const res = r.result as any;
      assert(
        'A',
        `${label}: fails in the switch's words, with no provider code (the request never left)`,
        res.success === false &&
          res.error === LIVE_SENDS_OFF &&
          res.providerErrorCode === undefined &&
          res.providerStatusCode === undefined &&
          res.providerMessageId === undefined,
        JSON.stringify(res)
      );
      assert('A', `${label}: reached no provider`, r.hits === 0, r.where);
    }
    // sendWelcomeEmail writes its MagicLink before it reaches the gate (Zone 2: create and delete
    // by id only). Found by its fixture-only address, removed by id in `finally`.
    const link = await prisma.magicLink.findFirst({
      where: { email: WELCOME_TO },
      select: { id: true },
    });
    welcomeLinkId = link?.id ?? null;

    let threw: unknown = null;
    const client = await reached(async () => {
      try {
        return email.getResendClient();
      } catch (e) {
        threw = e;
        throw e;
      }
    });
    assert(
      'A',
      'getResendClient (every Resend caller, the claim route and the delivery poll included) throws LiveSendsOffError',
      // By name and words, not `instanceof`: under tsx, src's `@/lib/live-sends` and this file's
      // relative import can load as two module instances, so the class identity differs.
      (threw as any)?.name === new LiveSendsOffError().name &&
        (threw as any)?.name === 'LiveSendsOffError' &&
        (threw as any)?.message === LIVE_SENDS_OFF,
      threw ? String(threw) : 'it returned a working client'
    );
    assert('A', 'getResendClient: reached no provider', client.hits === 0, client.where);

    assert(
      'A',
      'nothing on the fixture is recorded as sent — and a stop writes no InviteEvent at all',
      (await rowsOnFixture(SENT_TYPES)) === 0 && (await rowsOnFixture()) === 0
    );
    assert(
      'A',
      'the trap has intercepted nothing so far in this process',
      trapCount() === 0,
      trapHits()
        .map((h) => h.target)
        .join(', ')
    );

    // ── B. The order of checks (Zone 7 first; the gate last) ────────────────────
    console.log('\n\x1b[1mB — the order of checks in sendSms\x1b[0m\n');

    const invalid = await reached(() => sendSms(on('not-a-number')));
    assert(
      'B',
      'an invalid number is INVALID_NUMBER, and SMS_BLOCKED_INVALID is recorded',
      (invalid.result as any).blocked === 'INVALID_NUMBER' &&
        (await rowsOnFixture(['SMS_BLOCKED_INVALID'])) === 1
    );

    const optedOff = await reached(() => sendSms(on(OPTED_OUT)));
    assert(
      'B',
      'switch OFF: an opted-out number is OPTED_OUT, not the switch — opt-out is checked first [zone 7]',
      (optedOff.result as any).blocked === 'OPTED_OUT',
      JSON.stringify(optedOff.result)
    );
    const closeB = liveBehindTrap();
    const optedOn = await reached(() => sendSms(on(OPTED_OUT)));
    closeB();
    assert(
      'B',
      'switch ON: an opted-out number is still OPTED_OUT, and reaches no provider [zone 7]',
      (optedOn.result as any).blocked === 'OPTED_OUT' && optedOn.hits === 0,
      `${JSON.stringify(optedOn.result)} ${optedOn.where}`
    );
    assert(
      'B',
      'both opt-out refusals are recorded as SMS_BLOCKED_OPT_OUT, exactly as before',
      (await rowsOnFixture(['SMS_BLOCKED_OPT_OUT'])) === 2
    );

    console.log('\x1b[2m— spawning the TNZ-absent child —\x1b[0m');
    const child = spawnSync('npx', ['tsx', __filename, '--no-tnz'], {
      cwd: REPO,
      env: { ...process.env },
      encoding: 'utf8',
    });
    process.stdout.write(child.stdout ?? '');
    process.stderr.write(child.stderr ?? '');
    assert(
      'B',
      'the TNZ-absent child passed: configuration is checked before the gate',
      child.status === 0
    );

    // ── C. Positive control: the gate open, behind the trap ──────────────────────
    console.log(
      '\n\x1b[1mC — positive control: gate open behind the trap, each door reaches it once\x1b[0m\n'
    );
    const closeC = liveBehindTrap();
    assert('C', 'the switch reads on while the helper holds it open', isLiveSendingOn() === true);

    const cTnz = await reached(() => sendSms(on('+64211234567')));
    assert(
      'C',
      "sendSms +64 reaches TNZ exactly once, and the trap's 200 is recorded as a send",
      cTnz.hits === 1 &&
        /api\.tnz\.co\.nz/.test(cTnz.where) &&
        (cTnz.result as any).success === true,
      `${cTnz.where} ${JSON.stringify(cTnz.result)}`
    );
    assert(
      'C',
      'so "nothing recorded as sent" in A is a real zero: the recording path works (NUDGE_SENT_AUTO = 1)',
      (await rowsOnFixture(['NUDGE_SENT_AUTO'])) === 1
    );
    const cTw = await reached(() => sendSms(on('+12025550123')));
    assert(
      'C',
      'sendSms +1 reaches Twilio exactly once — at https.request, where no fetch stub could see it',
      cTw.hits === 1 && /api\.twilio\.com/.test(cTw.where),
      cTw.where
    );
    const cDirect = await reached(() =>
      sendViaTnz({ to: '+64211234567', message: 'GTC-274 probe' })
    );
    assert('C', 'sendViaTnz reaches TNZ exactly once', cDirect.hits === 1, cDirect.where);
    const cMail = await reached(() =>
      email.sendMagicLinkEmail('gtc274@example.invalid', 'fake-token')
    );
    assert(
      'C',
      'sendMagicLinkEmail reaches Resend exactly once',
      cMail.hits === 1 && /api\.resend\.com\/emails/.test(cMail.where),
      cMail.where
    );
    const cPoll = await reached(() => email.getResendClient().emails.get('gtc274-fake-id'));
    assert(
      'C',
      'getResendClient().emails.get reaches Resend exactly once',
      cPoll.hits === 1,
      cPoll.where
    );
    closeC();

    const again = await reached(() => sendSms(on('+64211234567')));
    assert(
      'C',
      'closed again, the next send stops — the switch is read at every call, never cached',
      (again.result as any).error === LIVE_SENDS_OFF && again.hits === 0,
      JSON.stringify(again.result)
    );

    // ── D. What else reads the switch ───────────────────────────────────────────
    console.log('\n\x1b[1mD — what else reads the switch\x1b[0m\n');
    /*
     * [[GTC-339]] — THE SWITCH IS READ WHERE SENDS HAPPEN. GTC-214's contract (a cron that cannot send
     * must not report a healthy run) lives with the sending crons now, per channel (founder ruling Q1):
     * a text stopped by the switch counts as not got out. The nudges cron only queues, and no longer
     * reads the switch at all (ruling Q2) — it used to fail every run with the switch off.
     */
    let sendHealth: any = null;
    try {
      sendHealth = await import('../src/lib/send-health');
    } catch {
      sendHealth = null;
    }
    const stopped = await sendSms(on('+64211234567'));
    assert(
      'D',
      'GTC-339: a text stopped by the switch counts against its cron’s text channel — the run fails',
      (() => {
        try {
          const t = sendHealth.emptyTally();
          const counts = sendHealth.SMS_BLOCK_COUNTS[(stopped as any).blocked] === true;
          sendHealth.tallySend(t, 'text', counts ? 'NOT_OUT' : 'NOT_COUNTED');
          const v = sendHealth.sendRunHealth(t);
          return (
            (stopped as any).error === LIVE_SENDS_OFF &&
            v.ok === false &&
            JSON.stringify(v.failedChannels) === '["text"]'
          );
        } catch {
          return false;
        }
      })(),
      JSON.stringify(stopped)
    );
    const schedulerCode = fs
      .readFileSync(path.join(REPO, 'src/lib/sms/nudge-scheduler.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    assert(
      'D',
      'GTC-339 Q2: the nudges scheduler no longer reads the switch — it sends nothing',
      schedulerCode.length > 0 && !schedulerCode.includes('isLiveSendingOn')
    );
    assert(
      'D',
      'smsProviderConfiguredFor is false with the switch off, though TNZ and Twilio are both configured',
      smsProviderConfiguredFor('+64211234567') === false &&
        smsProviderConfiguredFor('+12025550123') === false
    );
    const closeD = liveBehindTrap();
    const configuredLive =
      smsProviderConfiguredFor('+64211234567') && smsProviderConfiguredFor('+12025550123');
    closeD();
    assert(
      'D',
      'and true with the switch on — the fence still answers per destination',
      configuredLive
    );
    const { isRetryableProviderError } = await import('../src/lib/press/dispatch');
    assert(
      'D',
      'a stopped email is terminal for the dispatcher, never retried',
      isRetryableProviderError({ error: LIVE_SENDS_OFF }) === false
    );
  } finally {
    await prisma.event.delete({ where: { id: event.id } }); // cascades its InviteEvent rows
    if (optOutId) await prisma.smsOptOut.delete({ where: { id: optOutId } });
    if (welcomeLinkId) await prisma.magicLink.delete({ where: { id: welcomeLinkId } });
    await prisma.person.deleteMany({ where: { id: { in: [host.id, guest.id] } } });
  }

  assert(
    'A',
    "sendWelcomeEmail's MagicLink was found on the fixture address and removed by id",
    welcomeLinkId !== null
  );
  assert(
    'CLEAN',
    'gather_dev restored: sent-type InviteEvent and OutboundMessage counts are what they were',
    (await sentEverywhere()) === sentGlobalBefore &&
      (await prisma.outboundMessage.count()) === outboundBefore,
    `sent ${sentGlobalBefore}→${await sentEverywhere()}, outbound ${outboundBefore}→${await prisma.outboundMessage.count()}`
  );

  // ── E. The deploy check ──────────────────────────────────────────────────────
  console.log('\n\x1b[1mE — the deploy check (scripts/check-live-sends.mjs)\x1b[0m\n');
  const script = path.join(REPO, 'scripts/check-live-sends.mjs');
  const base: NodeJS.ProcessEnv = { ...process.env };
  delete base.GATHER_LIVE_SENDS;
  delete base.RAILWAY_ENVIRONMENT_NAME;
  const check = (vars: Record<string, string>) => {
    // ⚠ The one place outside the helper that names the setting as a value: a CHILD process
    // running the deploy check, which sends nothing. Allow-listed by name in F.
    const r = spawnSync('node', [script], { env: { ...base, ...vars }, encoding: 'utf8' });
    return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
  };
  if (!fs.existsSync(script)) {
    assert('E', 'scripts/check-live-sends.mjs exists', false);
  } else {
    const prodOff = check({ RAILWAY_ENVIRONMENT_NAME: 'production' });
    assert(
      'E',
      'production without the setting: the build fails (exit 1)',
      prodOff.status === 1,
      prodOff.out
    );
    assert(
      'E',
      'and says so in one line naming the environment and "off"',
      /production/.test(prodOff.out) && /\boff\b/i.test(prodOff.out),
      prodOff.out
    );
    const prodOn = check({ RAILWAY_ENVIRONMENT_NAME: 'production', GATHER_LIVE_SENDS: 'on' });
    assert(
      'E',
      'production with GATHER_LIVE_SENDS=on: passes (exit 0)',
      prodOn.status === 0,
      prodOn.out
    );
    assert(
      'E',
      'and prints its one line: the environment, and live sending on',
      /production/.test(prodOn.out) && /\bon\b/i.test(prodOn.out),
      prodOn.out
    );
    const prodTrue = check({ RAILWAY_ENVIRONMENT_NAME: 'production', GATHER_LIVE_SENDS: 'true' });
    assert(
      'E',
      'production with a mistyped value ("true"): fails — only "on" is on',
      prodTrue.status === 1,
      prodTrue.out
    );
    const staging = check({ RAILWAY_ENVIRONMENT_NAME: 'staging' });
    assert(
      'E',
      'another Railway environment without it: passes, and still prints its line',
      staging.status === 0 && /staging/.test(staging.out) && /\boff\b/i.test(staging.out),
      staging.out
    );
    const local = check({});
    assert(
      'E',
      'no Railway environment (a local build): passes silently',
      local.status === 0 && local.out.trim() === '',
      local.out
    );
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
    assert(
      'E',
      'the check is the FIRST step of `build`, so it runs before migrations or the build',
      typeof pkg.scripts?.build === 'string' &&
        pkg.scripts.build.startsWith('node scripts/check-live-sends.mjs &&')
    );
  }

  // ── F. Tripwires ─────────────────────────────────────────────────────────────
  console.log('\n\x1b[1mF — tripwires\x1b[0m\n');
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name === 'node_modules' || ent.name.startsWith('.')) continue;
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p, out);
      else if (/\.(ts|tsx|js|mjs|cjs|sh)$/.test(ent.name)) out.push(p);
    }
    return out;
  };
  const rel = (p: string) => path.relative(REPO, p);
  const HELPER = 'tests/helpers/provider-trap.ts';
  const THIS = 'tests/live-switch-test.ts';
  const ASSIGN = /process\.env(\.GATHER_LIVE_SENDS|\[\s*['"`]GATHER_LIVE_SENDS['"`]\s*\])\s*=(?!=)/;
  const SHELL = /GATHER_LIVE_SENDS=/;
  const OBJKEY = /GATHER_LIVE_SENDS\s*:/;
  const offenders: string[] = [];
  for (const file of [...walk(path.join(REPO, 'tests')), ...walk(path.join(REPO, 'scripts'))]) {
    const r = rel(file);
    if (r === HELPER) continue;
    const src = fs.readFileSync(file, 'utf8');
    if (r.endsWith('.sh')) {
      if (SHELL.test(src)) offenders.push(r);
      continue;
    }
    // Code only: prose and messages may NAME the setting; only code may not SET it.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    if (ASSIGN.test(code)) offenders.push(r);
    if (OBJKEY.test(code) && r !== THIS) offenders.push(`${r} (object key)`);
    if (/(spawn|exec)[A-Za-z]*\([^)]*GATHER_LIVE_SENDS=/.test(code)) offenders.push(`${r} (shell)`);
  }
  if (SHELL.test(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8')))
    offenders.push('package.json');
  assert(
    'F',
    `nothing in tests/, scripts/ or package.json opens the gate except ${HELPER}`,
    offenders.length === 0,
    offenders.join(', ')
  );
  const envSetters: string[] = [];
  for (const envFile of ['.env', '.env.local']) {
    const p = path.join(REPO, envFile);
    // Presence only. No value is read out, printed or compared.
    if (
      fs.existsSync(p) &&
      /^\s*(export\s+)?GATHER_LIVE_SENDS\s*=/m.test(fs.readFileSync(p, 'utf8'))
    ) {
      envSetters.push(envFile);
    }
  }
  assert(
    'F',
    '.env and .env.local do not set GATHER_LIVE_SENDS (presence checked, no value read out)',
    envSetters.length === 0,
    envSetters.join(', ')
  );

  const codeOf = (file: string) =>
    fs
      .readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
  const srcFiles = walk(path.join(REPO, 'src')).map((f) => ({ rel: rel(f), code: codeOf(f) }));
  const only = (pattern: RegExp, allowed: string[], label: string) => {
    const found = srcFiles.filter((f) => pattern.test(f.code)).map((f) => f.rel);
    assert(
      'F',
      label,
      found.length > 0 && found.every((f) => allowed.includes(f)),
      `found in: ${found.join(', ') || '(nowhere)'}`
    );
  };
  only(
    /new Resend\(/,
    ['src/lib/email.ts'],
    "`new Resend(` appears only in src/lib/email.ts, behind getResendClient's gate"
  );
  only(
    /api\.tnz\.co\.nz/,
    ['src/lib/sms/tnz-client.ts'],
    "the TNZ endpoint appears only in src/lib/sms/tnz-client.ts, behind sendViaTnz's gate"
  );
  only(
    /sendViaTnz\(/,
    ['src/lib/sms/tnz-client.ts', 'src/lib/sms/send-sms.ts'],
    '`sendViaTnz(` is called only from sendSms'
  );
  // `getTwilioClient` rather than `messages.create`: the Anthropic SDK has a `messages.create` too.
  only(
    /getTwilioClient\(\)/,
    ['src/lib/sms/twilio-client.ts', 'src/lib/sms/send-sms.ts'],
    'the Twilio client is taken only by sendSms (its one `messages.create`, after its gate)'
  );
  only(
    /from ['"]twilio['"]/,
    ['src/lib/sms/twilio-client.ts'],
    'the Twilio SDK is imported only by twilio-client.ts'
  );
}

async function run() {
  try {
    if (NO_TNZ) await childNoTnz();
    else await main();
  } catch (e: any) {
    assert('FATAL', `the suite threw: ${e?.message ?? e}`, false);
  }
  console.log(`\n${'─'.repeat(70)}`);
  console.log(
    `\x1b[32mPassed: ${passed}\x1b[0m   \x1b[31mFailed: ${failed}\x1b[0m   trap intercepts: ${trapCount()}`
  );
  if (failed > 0) {
    console.log('\n\x1b[31mRED assertions:\x1b[0m');
    red.forEach((a) => console.log(`  ${a}`));
    process.exit(1);
  }
  if (!NO_TNZ)
    console.log('\n\x1b[32m\x1b[1m✓ GTC-274 — nothing leaves without the live switch\x1b[0m');
  process.exit(0);
}

run();
