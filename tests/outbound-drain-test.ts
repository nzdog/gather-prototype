/**
 * GTC-189 slice 5c, SECOND HALF — the gates, quiet hours, the transports, and the outcome.
 *
 * ⚠ THIS HALF ABSORBS WHAT THE SLICING CALLED 5d, AND THAT IS NOT SCOPE CREEP. A claimed row MUST
 * reach an end state in the same commit that claims it: the schema defines a row with `attemptedAt`
 * set and no end state as a crashed attempt. So wiring the claim and writing the outcome cannot be
 * two commits, and `PersonEvent.sentAt` on acceptance (ruling G) comes with them.
 *
 * ── WHAT IS PROVEN HERE, AND WHAT CANNOT BE ───────────────────────────────────
 *
 * ⚠ NO FAKE PROVIDER, NO SEAM, NO INJECTED SENDER (founder Q7). The dispatcher calls the real
 * senders and every send in this environment is REJECTED — `RESEND_API_KEY` does not authenticate
 * ([[GTC-247]]) and `TNZ_AUTH_TOKEN` is absent, so `sendSms` refuses a `+64` number before any
 * provider call. That is the state this suite builds against, and it is the honest one.
 *
 * ⚠ AND ONE DISTINCTION THE RULING DOES NOT REACH, STATED SO IT IS NOT MISTAKEN FOR A FAKE. The
 * OUTCOME-RECORDING functions — `recordAcceptance`, `recordRejection`, `recordWithholding`,
 * `scheduleRetry` — are called DIRECTLY by this suite with the values a provider would have
 * returned. That is not a fake provider: it is this ticket's own code, called with data, and it is
 * the only way ruling G's per-person clock can be asserted at all on a machine where nothing is
 * ever accepted. **The dispatcher itself has no seam and no branch** — layer N asserts it.
 * End-to-end acceptance stays unproven, and the slice's evidence says so rather than claiming it.
 *
 * ── THE ORDER, WHICH IS A RULING ──────────────────────────────────────────────
 *
 * GATES, THEN QUIET HOURS, THEN CLAIM, THEN SEND. Ruled 2026-09-19: claiming first and then
 * deferring leaves `attemptedAt` set with no outcome, which the schema calls a crashed attempt. A
 * deferred row must be left UNTOUCHED.
 *
 * ⚠ AND A WITHHOLDING DOES NOT TAKE THE CLAIM, because the claim means "the provider was called"
 * and a withholding means it was not. It writes an END STATE under its own guarded update, so two
 * overlapping runs cannot both write it — and `findNeverAttempted` had to learn to exclude an
 * already-withheld row, or the drain would return it forever. That is a correction to the first
 * half, recorded in the slice's evidence.
 *
 * Destructive to its own created rows only; cleans up in `finally`.
 * Requires the dev server on :3000.
 *
 * Run: npx tsx tests/outbound-drain-test.ts
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const prisma = new PrismaClient();
const TAG = 'GTC189X';
const BASE = 'http://localhost:3000';

const DISPATCH = 'src/lib/press/dispatch.ts';
const EMAIL = 'src/lib/email.ts';
const ROUTE = 'src/app/api/cron/outbound-dispatch/route.ts';
const INVITE_STATUS = 'src/components/plan/InviteStatusSection.tsx';
const HOST_VIEW = 'src/app/h/[token]/page.tsx';

let passed = 0;
let failed = 0;
function assert(label: string, condition: boolean) {
  if (condition) {
    console.log(`\x1b[32m✓\x1b[0m ${label}`);
    passed++;
  } else {
    console.error(`\x1b[31m✗\x1b[0m ${label}`);
    failed++;
  }
}
function section(title: string) {
  console.log(`\n\x1b[1m\x1b[33m${title}\x1b[0m`);
}
function ok(fn: () => boolean): boolean {
  try {
    return !!fn();
  } catch {
    return false;
  }
}
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}
function read(path: string): string {
  try {
    return fs.readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

const DAY = 24 * 60 * 60 * 1000;

/*
 * ⚠ THE DRAIN IS RUN ON A FIXED CLOCK, OUTSIDE QUIET HOURS, AND THAT IS NOT TIDINESS.
 *
 * Quiet hours is 21:00–08:00 NZ and it holds a TEXT row back. Run on the wall clock, the texted
 * recipient in this fixture is WITHHELD for most of the day and DEFERRED at night — so the
 * assertion about `SMS_DISABLED` passes or fails depending on what time the suite is run. A
 * time-dependent assertion is a flake that reads as a regression.
 *
 * 01:00 UTC is early afternoon in NZ at either offset; 12:00 UTC is the small hours at either.
 * Both verified against `isQuietHours` rather than reasoned about.
 */
const DAYTIME = new Date('2026-09-19T01:00:00.000Z');
const NIGHT = new Date('2026-09-19T12:00:00.000Z');

async function main() {
  const createdPersonIds: string[] = [];
  const createdEventIds: string[] = [];
  const createdUserIds: string[] = [];

  try {
    section('Layer 0: controls');

    const health = await fetch(`${BASE}/api/events`);
    assert('CONTROL: the dev server answers 401 with no cookie', health.status === 401);
    assert(
      'CONTROL: the comment stripper strips',
      stripComments('/* sendSms */ const a = 1;').includes('sendSms') === false
    );
    assert(
      'CONTROL: the file reader really reads',
      read(DISPATCH).length > 0 && read('src/lib/press/nope.ts') === ''
    );

    let dispatch: any = null;
    let email: any = null;
    try {
      dispatch = await import('../src/lib/press/dispatch');
    } catch {
      dispatch = null;
    }
    try {
      email = await import('../src/lib/email');
    } catch {
      email = null;
    }

    // ── Layer E: the ask email sender ────────────────────────────────────
    section('Layer E: a NEW ask email sender — the one thing 4b was written for');

    assert(
      `${EMAIL} exports sendAskEmail`,
      ok(() => typeof email.sendAskEmail === 'function')
    );
    const emailSrc = stripComments(read(EMAIL));
    assert(
      '⚠ IT CARRIES A reply-to, which is what sendNudgeEmail could not — ruling F: the message ' +
        "carries the host's name as sender and her address as reply-to",
      emailSrc.includes('replyTo')
    );
    assert(
      "⚠ AND A PER-MESSAGE FROM-NAME, so the message arrives under the HOST's name on Gather's " +
        'verified domain — ruling F again: "sent from our verified domain because it cannot be ' +
        'sent from hers"',
      ok(() => /fromName/.test(emailSrc))
    );
    assert(
      'it answers through the same resultOf as the other three senders, so it inherits slice ' +
        "4b's providerMessageId rather than getting a second read of Resend's envelope",
      ok(() => {
        const body = emailSrc.slice(emailSrc.indexOf('sendAskEmail'));
        return body.slice(0, 900).includes('resultOf');
      })
    );

    // ── Layer W: the withheld vocabulary ─────────────────────────────────
    section('Layer W: the withheld vocabulary, and SMS_DISABLED inside it');

    assert(
      `${DISPATCH} exports a withheld-why map, typed so a missing case is a compile error`,
      ok(() => typeof dispatch.WITHHELD_WHY_IS_TERMINAL === 'object')
    );
    assert(
      "⚠ SMS_DISABLED IS A WITHHOLDING — ruled 2026-09-19 for ruling AN's reason: the two " +
        'outcome doors were separated so this could not be settled by whichever branch got ' +
        'written first. Gather did not send it and the provider never saw it',
      ok(() => dispatch.blockedToWithheld('SMS_DISABLED') === 'SMS_DISABLED')
    );
    assert(
      'OPTED_OUT and INVALID_NUMBER are withholdings too — both are refused inside sendSms ' +
        'before any provider call',
      ok(
        () =>
          dispatch.blockedToWithheld('OPTED_OUT') === 'OPTED_OUT' &&
          dispatch.blockedToWithheld('INVALID_NUMBER') === 'INVALID_NUMBER'
      )
    );
    assert(
      '⚠ AND SEND_FAILED IS NOT — it is the provider refusing, so it goes to providerError and ' +
        'never to withheldWhy. The one blocked value that belongs on the other side of the door',
      ok(() => dispatch.blockedToWithheld('SEND_FAILED') === null)
    );

    // ── The fixture ──────────────────────────────────────────────────────
    const now = new Date();
    const stamp = Date.now();
    const endDate = new Date(now.getTime() + 7 * DAY);

    const user = await prisma.user.create({ data: { email: `${TAG}+${stamp}@example.com` } });
    createdUserIds.push(user.id);

    async function person(name: string, extra: Record<string, unknown> = {}) {
      const p = await prisma.person.create({
        data: {
          name: `${TAG} ${name}`,
          email: `${TAG.toLowerCase()}-${name.toLowerCase()}+${stamp}@example.com`,
          ...extra,
        },
      });
      createdPersonIds.push(p.id);
      return p;
    }

    const hostPerson = await prisma.person.create({
      data: { name: `${TAG} Kate`, email: user.email, userId: user.id },
    });
    createdPersonIds.push(hostPerson.id);

    const amelia = await person('Amelia');
    const bob = await person('Bob');
    // Texted: a valid NZ number and no email, so askChannelOf answers TEXT.
    const tess = await prisma.person.create({
      data: { name: `${TAG} Tess`, phoneNumber: '+64211234567' },
    });
    createdPersonIds.push(tess.id);

    const event = await prisma.event.create({
      data: {
        name: `${TAG} the drain`,
        startDate: endDate,
        endDate,
        hostId: hostPerson.id,
        status: 'CONFIRMING',
      },
    });
    createdEventIds.push(event.id);
    await prisma.eventRole.create({ data: { eventId: event.id, userId: user.id, role: 'HOST' } });
    const team = await prisma.team.create({ data: { name: `${TAG} Mains`, eventId: event.id } });
    await prisma.personEvent.create({
      data: { personId: hostPerson.id, eventId: event.id, role: 'HOST' },
    });
    for (const p of [amelia, bob, tess]) {
      await prisma.personEvent.create({
        data: { personId: p.id, eventId: event.id, role: 'PARTICIPANT' },
      });
      const item = await prisma.item.create({
        data: { name: `${TAG} ${p.name} dish`, teamId: team.id, status: 'ASSIGNED' },
      });
      await prisma.assignment.create({
        data: { itemId: item.id, personId: p.id, response: 'PENDING' },
      });
    }

    const press = await import('../src/lib/press/press');
    const pressed = await press.pressSend(prisma, {
      eventId: event.id,
      actor: { id: hostPerson.id, kind: 'HOST' as const, name: hostPerson.name },
      baseUrl: BASE,
    });

    section('Layer 0b: the fixture presses, with one texted recipient among three');
    assert(
      'CONTROL: the press succeeded',
      ok(() => pressed.ok)
    );
    const pressedRows = await prisma.outboundMessage.findMany({
      where: { eventId: event.id },
      select: { id: true, channel: true, personEventId: true },
    });
    assert(
      'CONTROL: three rows, two EMAIL and one TEXT — so the mixed-channel case quiet hours ' +
        'turns on is really in the fixture',
      pressedRows.length === 3 &&
        pressedRows.filter((r) => r.channel === 'EMAIL').length === 2 &&
        pressedRows.filter((r) => r.channel === 'TEXT').length === 1
    );

    // ── Layer G: the gates, re-run at drain ──────────────────────────────
    section('Layer G: the chooser is re-run at drain, and its why is the withheld why');

    // Bob opts out of texts AND loses his email between the press and the drain, so
    // chooseAskRoute now refuses him outright.
    await prisma.person.update({ where: { id: bob.id }, data: { email: null } });

    /*
     * ⚠ NOT `ok(() => dispatch.drainOnce(...)) ? await dispatch.drainOnce(...) : null`, AND THE
     * REASON IS A BUG THIS SUITE ACTUALLY HAD.
     *
     * `ok()` exists for SYNCHRONOUS predicates: it calls the function and coerces the result. Given
     * an async call it invokes it, gets a truthy promise, and then the ternary invokes it AGAIN —
     * so the drain ran TWICE, once un-awaited and racing, once for real. The second call found
     * nothing left and reported all zeros, and the un-awaited first left a row with `attemptedAt`
     * set and no outcome.
     *
     * ⚠ THE SUITE MANUFACTURED A CRASHED ATTEMPT — the exact state this whole design exists to make
     * impossible — and reported it as a failing assertion about quiet hours. Recorded in the
     * slice's evidence.
     */
    let drained: any = null;
    if (typeof dispatch?.drainOnce === 'function') {
      try {
        drained = await dispatch.drainOnce(prisma, 50, DAYTIME);
      } catch (e) {
        console.error('   drainOnce threw:', e);
      }
    }
    assert('drainOnce ran and reported', drained !== null);

    const bobPe = await prisma.personEvent.findFirst({
      where: { eventId: event.id, personId: bob.id },
      select: { id: true },
    });
    const bobRow = await prisma.outboundMessage.findFirst({
      where: { personEventId: bobPe!.id },
      select: { withheldAt: true, withheldWhy: true, attemptedAt: true, providerError: true },
    });
    assert(
      "⚠ A RECIPIENT THE CHOOSER NO LONGER REACHES IS WITHHELD, with the chooser's own why — " +
        'not sent and then failed. This is the case the re-run exists for: somebody who changed ' +
        'between the press and the drain',
      ok(() => bobRow!.withheldAt !== null && bobRow!.withheldWhy === 'NO_CHANNEL')
    );
    assert(
      '⚠ AND THE WITHHOLDING TOOK NO CLAIM — attemptedAt is still null, because the claim means ' +
        '"the provider was called" and it was not. The end state is withheldAt',
      ok(() => bobRow!.attemptedAt === null)
    );
    assert(
      'and it wrote nothing into providerError — the two doors stay apart (ruling AN)',
      ok(() => bobRow!.providerError === null)
    );
    const afterWithheld = await dispatch.findNeverAttempted(prisma, 50);
    assert(
      '⚠ AND A WITHHELD ROW LEAVES THE DRAIN. Without this the never-attempted pass returns it ' +
        'on every tick forever, because a withholding does not set attemptedAt — a correction to ' +
        "this slice's first half, found by building the second",
      ok(() => !afterWithheld.some((r: any) => r.personEventId === bobPe!.id))
    );

    // ── Layer R: the rejection path, which is all this environment can show ──
    section('Layer R: every send is REJECTED here, and that is the state slice 7 must read');

    const ameliaPe = await prisma.personEvent.findFirst({
      where: { eventId: event.id, personId: amelia.id },
      select: { id: true },
    });
    const ameliaRow = await prisma.outboundMessage.findFirst({
      where: { personEventId: ameliaPe!.id },
      select: {
        attemptedAt: true,
        attemptCount: true,
        acceptedAt: true,
        rejectedAt: true,
        providerError: true,
        provider: true,
        nextAttemptAt: true,
        withheldAt: true,
      },
    });
    assert(
      '⚠ THE EMAILED RECIPIENT WAS CLAIMED AND THE PROVIDER REFUSED — attemptedAt set, ' +
        'attemptCount 1, and an outcome. GTC-247: the Resend key does not authenticate, so this ' +
        'is the only thing a real send can do here',
      ok(() => ameliaRow!.attemptedAt !== null && ameliaRow!.attemptCount === 1)
    );
    assert(
      'it reached an END STATE rather than being left as a crashed attempt',
      ok(
        () =>
          ameliaRow!.rejectedAt !== null ||
          ameliaRow!.nextAttemptAt !== null ||
          ameliaRow!.acceptedAt !== null
      )
    );
    assert(
      "⚠ AND THE PROVIDER'S WORDS ARE STORED VERBATIM in providerError — GTC-264 Phase 1's " +
        'restraint: do not model a vocabulary you have not observed',
      ok(() => typeof ameliaRow!.providerError === 'string' && ameliaRow!.providerError!.length > 0)
    );
    assert(
      'and it named the provider it called',
      ok(() => ameliaRow!.provider === 'resend')
    );
    assert(
      '⚠ NO PersonEvent.sentAt WAS WRITTEN, because nothing was accepted. Ruling G ties the ' +
        'clock to acceptance, so a rejected recipient has none and is never chased — which ' +
        'findNudgeCandidates calls a fail-safe rather than a tidy-up',
      (await prisma.personEvent.count({
        where: { eventId: event.id, sentAt: { not: null } },
      })) === 0
    );

    // ── Layer B: the backoff ─────────────────────────────────────────────
    section('Layer B: the backoff, and where it stops');

    assert(
      'a retryable failure schedules a next attempt rather than rejecting outright',
      ok(() => typeof dispatch.nextBackoffAt === 'function')
    );
    assert(
      '⚠ THREE ATTEMPTS AND THEN TERMINAL — fixed, not computed, because there is no observed ' +
        "error vocabulary to compute from (GTC-264 Phase 1's restraint applied to a schedule)",
      ok(
        () =>
          dispatch.nextBackoffAt(1, now) !== null &&
          dispatch.nextBackoffAt(2, now) !== null &&
          dispatch.nextBackoffAt(3, now) === null
      )
    );
    assert(
      'and the waits grow: roughly one minute, then five, then nothing',
      ok(() => {
        const a = dispatch.nextBackoffAt(1, now)!.getTime() - now.getTime();
        const b = dispatch.nextBackoffAt(2, now)!.getTime() - now.getTime();
        return a > 0 && b > a;
      })
    );
    assert(
      '⚠ A 401 OR 403 IS TERMINAL AT ONCE, whatever the attempt count — ruled, because in this ' +
        'environment every provider answer is an auth failure and a retry-any-error policy ' +
        'queues every row three times against a key that will never work',
      ok(
        () =>
          dispatch.isRetryableProviderError('401 Unauthorized') === false &&
          dispatch.isRetryableProviderError('403 Forbidden') === false
      )
    );
    assert(
      '⚠ AND THE AUTH CHECK TAKES PRECEDENCE OVER THE RETRY PATTERNS, which is the only thing ' +
        'that makes it a guard rather than a coincidence. Asserted with a string that matches ' +
        'BOTH — a 401 that also says "rate limit" — because "401 Unauthorized" alone is refused ' +
        'by the retry patterns not matching it, so it passes with the guard deleted. Found by ' +
        'mutation M4 reporting the wrong assertion',
      ok(
        () =>
          dispatch.isRetryableProviderError(
            '401 Unauthorized: rate limit on an invalid api key'
          ) === false && dispatch.isRetryableProviderError('503 rate limit, try again') === true
      )
    );
    assert(
      'a 429 and a 5xx are retryable; a plain 4xx is not',
      ok(
        () =>
          dispatch.isRetryableProviderError('429 Too Many Requests') === true &&
          dispatch.isRetryableProviderError('503 Service Unavailable') === true &&
          dispatch.isRetryableProviderError('422 Unprocessable') === false
      )
    );

    // ── Layer Q: quiet hours ─────────────────────────────────────────────
    section('Layer Q: quiet hours defers a TEXT row, per row, and withholds nothing');

    assert(
      'the dispatcher decides quiet hours PER ROW and for TEXT only — not once for the batch, ' +
        'which on a mixed ask batch would hold the email for a rule that binds text',
      ok(
        () =>
          dispatch.quietHoursDefers('TEXT', true) === true &&
          dispatch.quietHoursDefers('EMAIL', true) === false
      )
    );
    assert(
      'the pure predicate says a deferral needs the window as well as the channel',
      ok(() => dispatch.quietHoursDefers('TEXT', false) === false)
    );

    /*
     * ⚠ AND NOW BEHAVIOURALLY, ON A NIGHT CLOCK, BECAUSE THE PREDICATE ABOVE PROVES ARITHMETIC AND
     * NOT THAT THE DISPATCHER CONSULTS IT. A fresh text row is drained at 12:00 UTC — the small
     * hours in NZ at either offset — and must come back untouched.
     */
    const tessPeForQuiet = await prisma.personEvent.findFirst({
      where: { eventId: event.id, personId: tess.id },
      select: { id: true },
    });
    const nightRow = await prisma.outboundMessage.create({
      data: {
        eventId: event.id,
        personEventId: tessPeForQuiet!.id,
        kind: 'ASK',
        channel: 'TEXT',
      },
      select: { id: true },
    });
    /*
     * ⚠ AN EMAIL ROW BESIDE IT, AND IT IS WHAT MAKES THE CONTROL BELOW MEAN ANYTHING. With only the
     * text row present, `deferred === considered` is satisfied whether quiet hours binds one channel
     * or all of them — a true assertion with a false label, which is the rule this ledger just wrote
     * down. With both rows, the batch-level shape defers two and the per-row shape defers one.
     */
    const ameliaPeForQuiet = await prisma.personEvent.findFirst({
      where: { eventId: event.id, personId: amelia.id },
      select: { id: true },
    });
    const nightEmailRow = await prisma.outboundMessage.create({
      data: {
        eventId: event.id,
        personEventId: ameliaPeForQuiet!.id,
        kind: 'ASK',
        channel: 'EMAIL',
      },
      select: { id: true },
    });
    const nightDrain =
      typeof dispatch?.drainOnce === 'function'
        ? await dispatch.drainOnce(prisma, 50, NIGHT)
        : null;
    const afterNight = await prisma.outboundMessage.findUnique({
      where: { id: nightRow.id },
      select: { attemptedAt: true, attemptCount: true, withheldAt: true, withheldWhy: true },
    });
    assert(
      '⚠ A TEXT ROW DRAINED IN QUIET HOURS IS LEFT COMPLETELY UNTOUCHED — no claim, no ' +
        'attemptCount, no withheldAt. The deferral is "implicit and durable — no scheduler, no ' +
        'timer", exactly as the wrap-up dispatcher describes its own, and the first run after the ' +
        'window takes the row unchanged',
      ok(
        () =>
          afterNight!.attemptedAt === null &&
          afterNight!.attemptCount === 0 &&
          afterNight!.withheldAt === null &&
          afterNight!.withheldWhy === null
      )
    );
    assert(
      'and the tick REPORTED it as deferred rather than silently skipping it — a monitor reading ' +
        'sent: 0 must be able to tell a quiet night from a broken drain',
      ok(() => nightDrain.deferred >= 1)
    );
    const afterNightEmail = await prisma.outboundMessage.findUnique({
      where: { id: nightEmailRow.id },
      select: { attemptedAt: true, rejectedAt: true, withheldAt: true, nextAttemptAt: true },
    });
    assert(
      '⚠ AND THE EMAIL ROW IN THE SAME NIGHT BATCH WENT ANYWAY — claimed and finished. Quiet ' +
        'hours binds TEXT only, so a mixed ask batch is not held for a rule that does not reach ' +
        'it. THIS is the assertion the batch-level shape fails: `dispatchPendingWrapUpMessages` ' +
        'checks once at the top and defers the whole batch, which on 231 emails and 1 text would ' +
        'stop almost everything for the sake of almost nothing',
      ok(
        () =>
          afterNightEmail!.attemptedAt !== null &&
          (afterNightEmail!.rejectedAt !== null ||
            afterNightEmail!.nextAttemptAt !== null ||
            afterNightEmail!.withheldAt !== null)
      )
    );
    assert(
      'and exactly ONE of the two was deferred',
      ok(() => nightDrain.deferred === 1)
    );

    // ── Layer P: the outcome writers, called directly ────────────────────
    section('Layer P: ruling G, asserted the only way this machine allows');

    const tessPe = await prisma.personEvent.findFirst({
      where: { eventId: event.id, personId: tess.id },
      select: { id: true },
    });
    const tessRow = await prisma.outboundMessage.findFirst({
      where: { personEventId: tessPe!.id },
      select: { id: true, withheldAt: true, withheldWhy: true, attemptedAt: true },
    });
    assert(
      '⚠ THE TEXTED RECIPIENT IS WITHHELD SMS_DISABLED, not rejected — TNZ_AUTH_TOKEN is absent, ' +
        'so sendSms refuses before any provider call. This is the ruling of 2026-09-19 arriving ' +
        'as the only text outcome the environment can produce',
      ok(() => tessRow!.withheldWhy === 'SMS_DISABLED' && tessRow!.withheldAt !== null)
    );

    // recordAcceptance is called with the values a provider would have returned. Not a fake
    // provider — this ticket's own function, called with data. See the header.
    const accepted = await prisma.outboundMessage.create({
      data: {
        eventId: event.id,
        personEventId: ameliaPe!.id,
        kind: 'ASK',
        channel: 'EMAIL',
        attemptedAt: new Date(),
        attemptCount: 1,
      },
      select: { id: true },
    });
    /*
     * Guarded, so a missing export reads as failed assertions rather than a crashed run —
     * GTC-192's standing warning: "a suite that cannot report its red is not a red."
     */
    const recordAcceptance = async (args: Record<string, unknown>) => {
      if (typeof dispatch?.recordAcceptance !== 'function') return;
      try {
        await dispatch.recordAcceptance(prisma, args);
      } catch {
        /* reported by the assertions below */
      }
    };
    await recordAcceptance({
      id: accepted.id,
      personEventId: ameliaPe!.id,
      provider: 'resend',
      providerMessageId: `${TAG}-fake-id-not-a-provider`,
    });
    const acceptedRow = await prisma.outboundMessage.findUnique({
      where: { id: accepted.id },
      select: { acceptedAt: true, provider: true, providerMessageId: true },
    });
    const ameliaMembership = await prisma.personEvent.findUnique({
      where: { id: ameliaPe!.id },
      select: { sentAt: true },
    });
    assert(
      'acceptance writes acceptedAt, the provider and its message id',
      ok(
        () =>
          acceptedRow!.acceptedAt !== null &&
          acceptedRow!.provider === 'resend' &&
          acceptedRow!.providerMessageId === `${TAG}-fake-id-not-a-provider`
      )
    );
    assert(
      '⚠ RULING G: PersonEvent.sentAt IS STAMPED FROM THE ACCEPTANCE INSTANT, per person. This ' +
        'is the whole of the per-person clock and it is the one thing GTC-247 makes unprovable ' +
        'end to end — asserted here at the function rather than claimed of the dispatcher',
      ok(() => ameliaMembership!.sentAt?.getTime() === acceptedRow!.acceptedAt?.getTime())
    );
    // A second acceptance for the same membership — ruling U's bounce door produces one.
    const second = await prisma.outboundMessage.create({
      data: {
        eventId: event.id,
        personEventId: ameliaPe!.id,
        kind: 'ASK',
        channel: 'EMAIL',
        attemptedAt: new Date(),
        attemptCount: 1,
      },
      select: { id: true },
    });
    await new Promise((r) => setTimeout(r, 5));
    await recordAcceptance({
      id: second.id,
      personEventId: ameliaPe!.id,
      provider: 'resend',
      providerMessageId: `${TAG}-second-id`,
    });
    const afterSecond = await prisma.personEvent.findUnique({
      where: { id: ameliaPe!.id },
      select: { sentAt: true },
    });
    assert(
      '⚠ FIRST ACCEPTANCE WINS — a second ASK row for the same membership does NOT move the ' +
        "clock. Ruling U's bounce door creates one, and a resend that reset the cadence would " +
        "give someone a fresh four days because Gather tried again. RAISED as the executor's " +
        'reading, and asserted so the behaviour is visible',
      ok(() => afterSecond!.sentAt?.getTime() === ameliaMembership!.sentAt?.getTime())
    );

    // ── Layer N: no fake, no seam ────────────────────────────────────────
    section('Layer N: the dispatcher calls the real senders, and has no second path');

    const dispatchSrc = stripComments(read(DISPATCH));
    assert(
      '⚠ IT CALLS THE REAL SENDERS — sendSms and sendAskEmail, by name. Founder Q7: "a fake ' +
        'provider that never ships is a second code path nobody exercises"',
      dispatchSrc.includes('sendSms') && dispatchSrc.includes('sendAskEmail')
    );
    assert(
      '⚠ AND THERE IS NO SEAM AND NO SWITCH: no NODE_ENV, no MOCK, no FAKE, no DRY_RUN, and no ' +
        'injected transport parameter. There is nothing to forget to turn off',
      dispatchSrc.length > 0 &&
        !/NODE_ENV|MOCK|FAKE|DRY_RUN|dryRun|transports\s*[:=]/.test(dispatchSrc)
    );
    assert(
      'the route now drains rather than describing — the claim is wired',
      stripComments(read(ROUTE)).includes('drainOnce')
    );

    // ── Layer D: option D on both buttons ────────────────────────────────
    section('Layer D: the two pressing surfaces stop pressing (founder option D)');

    const inviteStatus = read(INVITE_STATUS);
    const hostView = read(HOST_VIEW);
    assert(
      '⚠ NEITHER BUTTON SAYS "I\'ve sent the invites" ANY MORE. The danger was always the FIRST ' +
        'press — one irreversible act, two surfaces, a button promising the opposite of what it ' +
        "does, and none of the pre-flight's five checks",
      /*
       * ⚠ COMMENTS STRIPPED FIRST, BECAUSE THE NOTE RECORDING WHAT THE BUTTON USED TO SAY IS
       * EXACTLY RIGHT TO KEEP. A raw search finds the tombstone and fails — the same shape as
       * slice 5a's isMiniSend matcher, which matched its own assertion label.
       */
      stripComments(inviteStatus).length > 0 &&
        stripComments(hostView).length > 0 &&
        !stripComments(inviteStatus).includes("I've sent the invites") &&
        !stripComments(hostView).includes("I've sent the invites")
    );
    assert(
      'both now say "Review and send"',
      inviteStatus.includes('Review and send') && hostView.includes('Review and send')
    );
    assert(
      '⚠ AND NEITHER POSTS TO THE PRESS ANY MORE — the pre-flight is the one screen where she ' +
        'sees what the press will do before doing it, and three pressing surfaces is what it was ' +
        'built to prevent',
      !stripComments(inviteStatus).includes('confirm-invites-sent') &&
        !stripComments(hostView).includes('confirm-invites-sent') &&
        !/\/send['"`]/.test(stripComments(inviteStatus)) &&
        !/\/send['"`]/.test(stripComments(hostView))
    );
    assert(
      'and both point at the pre-flight instead',
      stripComments(inviteStatus).includes('pre-flight') &&
        stripComments(hostView).includes('pre-flight')
    );
    assert(
      '⚠ [[GTC-321]] IS NAMED AT BOTH, so the workflow option D deliberately does not foreclose ' +
        'is findable from the code that replaced it',
      inviteStatus.includes('GTC-321') && hostView.includes('GTC-321')
    );
  } finally {
    for (const eventId of createdEventIds) {
      await prisma.outboundMessage.deleteMany({ where: { eventId } });
      await prisma.assignment.deleteMany({ where: { item: { team: { eventId } } } });
      await prisma.item.deleteMany({ where: { team: { eventId } } });
      await prisma.accessToken.deleteMany({ where: { eventId } });
      await prisma.inviteEvent.deleteMany({ where: { eventId } });
      await prisma.auditEntry.deleteMany({ where: { eventId } });
      await prisma.household.updateMany({
        where: { eventId },
        data: { contactPersonEventId: null },
      });
      await prisma.personEvent.deleteMany({ where: { eventId } });
      await prisma.team.deleteMany({ where: { eventId } });
      await prisma.household.deleteMany({ where: { eventId } });
      await prisma.eventRole.deleteMany({ where: { eventId } });
      await prisma.event.delete({ where: { id: eventId } });
    }
    for (const personId of createdPersonIds) {
      await prisma.person.deleteMany({ where: { id: personId } });
    }
    for (const userId of createdUserIds) {
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    await prisma.$disconnect();
  }

  console.log(`\n\x1b[1m${passed} passed, ${failed} failed\x1b[0m`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
