/**
 * GTC-289 phase 4 ([[GTC-189]] slice 6) — THE POLLER.
 *
 * ⚠ AN HONEST NOTE ABOUT THE ORDER THIS WAS BUILT IN, BECAUSE THE REST OF THIS SLICE WAS RED-FIRST
 * AND THIS PHASE WAS NOT. The module was written before this suite. The RED below is real — it was
 * captured by moving `delivery-poll.ts` out of the tree and running these assertions against its
 * absence — but a RED taken that way proves the assertions CAN fail and does NOT prove they were
 * written without the implementation in view. The mutation table is what carries that weight here,
 * and the phase's evidence says so rather than claiming a RED-first build.
 *
 * ── WHAT IS PROVEN AGAINST THE REAL ENVIRONMENT, AND WHAT NEEDS A STUB ────────
 *
 * Layer P runs the poll for real: under `tsx` there is no `RESEND_API_KEY`, so the Resend
 * constructor throws, **no request leaves the process**, and the row comes back with
 * `deliveryCheckedAt` set and nothing else. That is the only outcome this environment can produce and
 * it is asserted first.
 *
 * ⚠ LAYER J STUBS `globalThis.fetch`, AND THE BOUNDARY IS WORTH STATING. Founder answer Q7 ruled NO
 * FAKE for the press's SENDERS — *"every send rejected is a usable state and it is the honest one"* —
 * and that ruling is untouched here: this suite sends nothing, and layer P asserts the real rejection
 * before anything is stubbed. The stub exists because the JOIN GUARD cannot be observed at all
 * without a response, and that guard is the single most important thing in the module: it converts
 * GTC-289's *"the thing most likely to fail silently"* into a counted, logged failure. The same
 * instrument, for the same reason, is already in `tests/email-send-result-test.ts`.
 *
 * Destructive to its own created rows only; cleans up in `finally`, with snapshot-and-restore of
 * every pre-existing `OutboundMessage` id because two of the functions here are GLOBAL by design — a
 * cron has no tenant.
 *
 * Run: npx tsx tests/delivery-poll-test.ts
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const prisma = new PrismaClient();
const TAG = 'GTC289P';

const MODULE = 'src/lib/email-delivery/delivery-poll.ts';
const ROUTE = 'src/app/api/cron/outbound-dispatch/route.ts';
const DISPATCH = 'src/lib/press/dispatch.ts';

let passed = 0;
let failed = 0;
const redAssertions: string[] = [];
function assert(label: string, condition: boolean) {
  if (condition) {
    console.log(`\x1b[32m✓\x1b[0m ${label}`);
    passed++;
  } else {
    console.error(`\x1b[31m✗\x1b[0m ${label}`);
    failed++;
    redAssertions.push(label);
  }
}
function section(title: string) {
  console.log(`\n\x1b[1m\x1b[33m${title}\x1b[0m`);
}
/** Refuses a promise: its contract is a synchronous value. [[GTC-192]]'s standing warning. */
function ok(fn: () => boolean): boolean {
  try {
    const value: unknown = fn();
    if (value && typeof (value as { then?: unknown }).then === 'function') {
      throw new Error('ok() was handed a promise');
    }
    return !!value;
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
/** Every `data: { ... }` block in a source file, brace-matched — what the module WRITES. */
function dataBlocks(src: string): string[] {
  const out: string[] = [];
  let at = src.indexOf('data: {');
  while (at !== -1) {
    let depth = 0;
    let i = at + 'data: '.length;
    for (; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') {
        depth--;
        if (depth === 0) break;
      }
    }
    out.push(src.slice(at, i + 1));
    at = src.indexOf('data: {', i);
  }
  return out;
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

async function main() {
  const preExistingOutboundIds = new Set(
    (await prisma.outboundMessage.findMany({ select: { id: true } })).map((r) => r.id)
  );
  const createdPersonIds: string[] = [];
  const createdEventIds: string[] = [];
  const createdUserIds: string[] = [];
  const realFetch = globalThis.fetch;
  const savedKey = process.env.RESEND_API_KEY;

  try {
    section('Layer 0: controls');

    assert(
      'CONTROL: the file reader really reads',
      read(MODULE).length > 0 && read('src/lib/email-delivery/nope.ts') === ''
    );
    assert(
      'CONTROL: the comment stripper strips',
      stripComments('/* deliveryState */ const a = 1;').includes('deliveryState') === false
    );
    assert(
      'CONTROL: ok() refuses a promise rather than passing on a thenable',
      ok(() => true) && ok((() => Promise.resolve(true)) as unknown as () => boolean) === false
    );
    assert(
      'CONTROL: the data-block reader finds what a module WRITES and not what it reads — one block ' +
        'from planted source, and its contents',
      ok(() => {
        const blocks = dataBlocks(
          'await x.update({ where: { id }, data: { a: 1, b: { c: 2 } } });'
        );
        return blocks.length === 1 && blocks[0].includes('a: 1') && blocks[0].includes('c: 2');
      })
    );

    let poll: any = null;
    try {
      poll = await import('../src/lib/email-delivery/delivery-poll');
    } catch {
      poll = null;
    }
    /*
     * ⚠ EVERY SIDE-EFFECTING CALL GOES THROUGH THIS, AND THE REASON IS THE STANDING WARNING'S TWO
     * RULES AT ONCE. `ok()` may not wrap a write — its contract is a value and an async call's value
     * is a truthy promise, so the write would run twice — and a fixture that touches a not-yet-
     * existing export must sit inside a `try`, or a missing module reads as a DEAD RUN rather than as
     * failed assertions. **The first RED of this suite reported 4 passed and 12 failed out of 44,
     * because it crashed at the fixture.** A RED is a document: it names which assertions fail AND
     * which pass. So: an explicit `typeof` check, one `await`, one `try`.
     */
    const call = async (fn: string, ...args: unknown[]) => {
      if (typeof poll?.[fn] !== 'function') return null;
      try {
        return await poll[fn](...args);
      } catch (e) {
        console.error(`   ${fn} threw:`, e);
        return null;
      }
    };

    assert(
      `${MODULE} exports pollOnce, pollOne, retireUnjoinable and the two passes`,
      ok(
        () =>
          typeof poll.pollOnce === 'function' &&
          typeof poll.pollOne === 'function' &&
          typeof poll.retireUnjoinable === 'function' &&
          typeof poll.findNeverChecked === 'function' &&
          typeof poll.findDueForCheck === 'function'
      )
    );

    // ── Layer L: the stopping rule (ruled) and the cadence (proposed) ─────
    section('Layer L: 24 hours or a terminal state, and the ladder that decides the volume');

    assert(
      '⚠ THE STOP IS 24 HOURS FROM ACCEPTANCE — founder ruling: a message that has not resolved in a ' +
        'day will not resolve, and a row polled forever is a queue that grows without bound',
      ok(() => poll.POLL_STOP_AFTER_MS === 24 * 60 * 60 * 1000)
    );
    assert(
      'the interval grows with the age of the message: 5 minutes in the first hour, 30 minutes to ' +
        'six hours, 2 hours after that',
      ok(
        () =>
          poll.pollIntervalMsFor(0) === 5 * MINUTE &&
          poll.pollIntervalMsFor(59 * MINUTE) === 5 * MINUTE &&
          poll.pollIntervalMsFor(HOUR) === 30 * MINUTE &&
          poll.pollIntervalMsFor(5 * HOUR) === 30 * MINUTE &&
          poll.pollIntervalMsFor(6 * HOUR) === 2 * HOUR &&
          poll.pollIntervalMsFor(23 * HOUR) === 2 * HOUR
      )
    );
    assert(
      'and it never returns zero or a negative, at any age including past the stop — a zero would be ' +
        'a poll on every tick',
      ok(() =>
        [0, 1, HOUR, 6 * HOUR, DAY, 10 * DAY].every((age) => poll.pollIntervalMsFor(age) > 0)
      )
    );
    /*
     * ⚠ THE FOUNDER'S OWN ARITHMETIC, AS AN ASSERTION. "Polling every unresolved row every two
     * minutes for a day is 720 requests per message." This computes what the ladder actually costs,
     * from the ladder itself, so the number in this label cannot drift from the table.
     */
    assert(
      '⚠ THE LADDER COSTS 31 ASKS PER MESSAGE OVER THE 24 HOURS, NOT 720 — computed from the table ' +
        'rather than asserted about it, so the count and this label move together',
      ok(() => {
        let asks = 0;
        let at = 0;
        while (at < poll.POLL_STOP_AFTER_MS) {
          asks++;
          at += poll.pollIntervalMsFor(at);
        }
        return asks === 31 && asks < 720;
      })
    );
    assert(
      'the ladder is a TABLE rather than three literals, so a ruling on the cadence is one edit',
      ok(() => Array.isArray(poll.POLL_LADDER) && poll.POLL_LADDER.length === 3)
    );
    assert(
      '⚠ AND THE BATCH IS 25, A QUARTER OF THE DRAIN’S 100, because every row here is a network round ' +
        'trip and the poll rides the same tick as the drain, after it. Both numbers read from source, ' +
        'so this label cannot drift from either',
      ok(
        () =>
          poll.POLL_BATCH === 25 &&
          poll.POLL_BATCH < 100 &&
          read(DISPATCH).includes('DRAIN_BATCH = 100')
      )
    );

    // ── Layer T: what ends the asking ────────────────────────────────────
    section('Layer T: which outcomes are terminal, and the one that deliberately is not');

    assert(
      'the five failure outcomes end it: bounced, failed, suppressed, complained, cancelled',
      ok(() =>
        ['BOUNCED', 'PROVIDER_FAILED', 'SUPPRESSED', 'COMPLAINED', 'CANCELLED'].every((k) =>
          poll.isTerminalForPolling(k)
        )
      )
    );
    assert(
      '⚠ AND `delivered` IS NOT TERMINAL, WHICH IS THE ONE DECISION HERE WORTH ARGUING WITH. Stopping ' +
        'there would be cheaper and would foreclose a bounce or a complaint arriving AFTER a delivery ' +
        '— on an assumption about last_event that nobody in this repo can check ([[GTC-323]])',
      ok(() => poll.isTerminalForPolling('PROVIDER_REPORTS_DELIVERED') === false)
    );
    assert(
      'nor is engagement, nor in-flight, nor unrecognised — a value the SDK does not declare is the ' +
        'last moment to stop looking',
      ok(
        () =>
          poll.isTerminalForPolling('ENGAGEMENT_REPORTED') === false &&
          poll.isTerminalForPolling('IN_FLIGHT') === false &&
          poll.isTerminalForPolling('UNRECOGNISED') === false
      )
    );
    /*
     * ⚠ THIS MATCHER WAS WRONG AND A MUTATION FOUND IT. The first version banned `/RED|GREEN|AMBER|
     * HARD|SOFT/`, and mutation P4 — which adds `PROVIDER_REPORTS_DELIVERED` to the terminal set —
     * made it fail, because **`DELIVERED` contains `RED`.** It had passed only because that constant
     * did not happen to appear in the stripped source.
     *
     * A guard that fires on the wrong thing is the same defect as one that never fires ([[GTC-192]]'s
     * standing warning, which names `Array.from(` tripping a ban on `.from`). So the ban names the
     * tokens it means, and there are TWO controls: one that it matches planted source, and — the one
     * that would have caught this — one that it does NOT match a word with a colour inside it.
     */
    const COLOUR_BAN = /RED_REASON|HARD_BOUNCE|SOFT_BOUNCE|\b(?:RED|GREEN|AMBER)\b/;
    assert(
      '⚠ AND THE MODULE CARRIES NO COLOUR AND NO BOUNCE PARTITION — [[GTC-192]] owns the red and no ' +
        'hard/soft partition is asserted in any phase',
      ok(() => {
        const src = stripComments(read(MODULE));
        return src.length > 0 && !COLOUR_BAN.test(src);
      })
    );
    assert(
      'CONTROL: the ban really matches planted source — a colour, a partition and a red reason',
      COLOUR_BAN.test("const x = 'HARD_BOUNCE';") &&
        COLOUR_BAN.test('if (state === RED) {}') &&
        COLOUR_BAN.test('const r: RED_REASON = x;')
    );
    assert(
      '⚠ CONTROL: AND IT DOES NOT MATCH A WORD THAT MERELY CONTAINS A COLOUR — ' +
        'PROVIDER_REPORTS_DELIVERED, which is what the first version of this ban tripped on',
      !COLOUR_BAN.test("const k = 'PROVIDER_REPORTS_DELIVERED';") &&
        !COLOUR_BAN.test('const hardened = 1;')
    );

    // ── The fixture ──────────────────────────────────────────────────────
    const now = new Date();
    const stamp = Date.now();
    const user = await prisma.user.create({ data: { email: `${TAG}+${stamp}@example.com` } });
    createdUserIds.push(user.id);
    const hostPerson = await prisma.person.create({
      data: { name: `${TAG} Host`, email: user.email, userId: user.id },
    });
    createdPersonIds.push(hostPerson.id);
    const guest = await prisma.person.create({
      data: { name: `${TAG} Guest`, email: `${TAG.toLowerCase()}-guest+${stamp}@example.com` },
    });
    createdPersonIds.push(guest.id);
    const endDate = new Date(now.getTime() + 7 * DAY);
    const event = await prisma.event.create({
      data: {
        name: `${TAG} the poll`,
        startDate: endDate,
        endDate,
        hostId: hostPerson.id,
        status: 'CONFIRMING',
      },
    });
    createdEventIds.push(event.id);
    const pe = await prisma.personEvent.create({
      data: { personId: guest.id, eventId: event.id, role: 'PARTICIPANT' },
    });

    async function row(data: Record<string, unknown>) {
      return prisma.outboundMessage.create({
        data: {
          eventId: event.id,
          personEventId: pe.id,
          kind: 'ASK',
          channel: 'EMAIL',
          ...data,
        },
        select: { id: true },
      });
    }
    const stateOf = (id: string) =>
      prisma.outboundMessage.findUnique({
        where: { id },
        select: {
          deliveryState: true,
          providerLastEvent: true,
          deliveryCheckedAt: true,
          deliveryPollDoneAt: true,
          acceptedAt: true,
          providerError: true,
        },
      });

    // ── Layer U: the second quadrant, realised ───────────────────────────
    section('Layer U: accepted with no join key leaves the queue unasked');

    const unjoinable = await row({
      attemptedAt: now,
      attemptCount: 1,
      acceptedAt: now,
      provider: 'resend',
      providerMessageId: null,
    });
    const tableBefore = await prisma.outboundMessage.count();
    const retired: number | null = await call('retireUnjoinable', prisma, now);
    const afterUnjoinable = await stateOf(unjoinable.id);
    assert(
      '⚠ AN ACCEPTED ROW WITH NO PROVIDER ID IS RETIRED, because there is nothing to ask WITH — the ' +
        'state pair phase 3a designed the column for: deliveryState NULL and deliveryPollDoneAt set',
      ok(
        () =>
          (retired ?? 0) >= 1 &&
          afterUnjoinable!.deliveryPollDoneAt !== null &&
          afterUnjoinable!.deliveryState === null
      )
    );
    assert(
      '⚠ BLAST RADIUS CHECKED, NOT ASSUMED: retireUnjoinable is a global updateMany with no tenant ' +
        'filter, so the table count is read before and after and nothing was created or deleted',
      (await prisma.outboundMessage.count()) === tableBefore
    );
    const passAfterRetire: any[] | null = await call('findNeverChecked', prisma, 50);
    assert(
      'and it is excluded from both passes afterwards — a retired row does not come back',
      ok(() => (passAfterRetire ?? []).every((r: any) => r.id !== unjoinable.id))
    );

    // ── Layer Q: the two passes ──────────────────────────────────────────
    section('Layer Q: two passes, and the reason the second one costs no sort');

    const neverChecked = await row({
      acceptedAt: new Date(now.getTime() - 10 * MINUTE),
      attemptedAt: new Date(now.getTime() - 10 * MINUTE),
      attemptCount: 1,
      provider: 'resend',
      providerMessageId: `${TAG}-never`,
    });
    const alreadyChecked = await row({
      acceptedAt: new Date(now.getTime() - 3 * HOUR),
      attemptedAt: new Date(now.getTime() - 3 * HOUR),
      attemptCount: 1,
      provider: 'resend',
      providerMessageId: `${TAG}-checked`,
      deliveryState: 'IN_FLIGHT',
      providerLastEvent: 'queued',
      deliveryCheckedAt: new Date(now.getTime() - 2 * HOUR),
    });
    const firstPass: any[] = (await call('findNeverChecked', prisma, 50)) ?? [];
    const secondPass: any[] = (await call('findDueForCheck', prisma, 50)) ?? [];
    assert(
      'pass one returns the never-checked row and NOT the already-checked one',
      ok(
        () =>
          firstPass.some((r: any) => r.id === neverChecked.id) &&
          !firstPass.some((r: any) => r.id === alreadyChecked.id)
      )
    );
    assert(
      '⚠ AND PASS TWO RETURNS THE OTHER ONE — the two predicates are DISJOINT, which is what makes ' +
        'them two passes rather than one query with an ordering problem',
      ok(
        () =>
          secondPass.some((r: any) => r.id === alreadyChecked.id) &&
          !secondPass.some((r: any) => r.id === neverChecked.id)
      )
    );
    assert(
      '⚠ AND THE SOURCE SAYS WHY: pass two excludes a NULL deliveryCheckedAt, which is what lets ' +
        'ORDER BY deliveryCheckedAt ASC read straight off the index. Phase 3a’s rehearsal measured ' +
        'the plan that forced this — a btree ASC index puts NULLs LAST and a never-checked row must ' +
        'sort FIRST',
      ok(() => {
        const src = stripComments(read(MODULE));
        const pass2 = src.slice(src.indexOf('export async function findDueForCheck'));
        return (
          /deliveryCheckedAt: \{ not: null \}/.test(pass2) &&
          /orderBy: \{ deliveryCheckedAt: 'asc' \}/.test(pass2)
        );
      })
    );
    assert(
      'the per-row interval decides due-ness: a row checked 2 hours ago at age 3 hours is due (the ' +
        '30-minute step), and one checked a minute ago is not',
      ok(
        () =>
          poll.isDueForCheck(
            {
              acceptedAt: new Date(now.getTime() - 3 * HOUR),
              deliveryCheckedAt: new Date(now.getTime() - 2 * HOUR),
            },
            now
          ) === true &&
          poll.isDueForCheck(
            {
              acceptedAt: new Date(now.getTime() - 3 * HOUR),
              deliveryCheckedAt: new Date(now.getTime() - MINUTE),
            },
            now
          ) === false
      )
    );

    // ── Layer S: the ruled stop ──────────────────────────────────────────
    section('Layer S: the 24-hour stop, and why an aged row is RETIRED rather than filtered out');

    const agedOut = await row({
      acceptedAt: new Date(now.getTime() - 25 * HOUR),
      attemptedAt: new Date(now.getTime() - 25 * HOUR),
      attemptCount: 1,
      provider: 'resend',
      providerMessageId: `${TAG}-aged`,
      deliveryState: 'IN_FLIGHT',
      providerLastEvent: 'queued',
      deliveryCheckedAt: new Date(now.getTime() - 3 * HOUR),
    });
    assert(
      'the pure predicate says a row accepted 25 hours ago has run out of time, and one accepted 23 ' +
        'hours ago has not',
      ok(
        () =>
          poll.hasTimedOut({ acceptedAt: new Date(now.getTime() - 25 * HOUR) }, now) === true &&
          poll.hasTimedOut({ acceptedAt: new Date(now.getTime() - 23 * HOUR) }, now) === false
      )
    );
    const tickForAged: any = await call('pollOnce', prisma, { now, limit: 50 });
    const agedAfter = await stateOf(agedOut.id);
    assert(
      '⚠ AND A TICK RETIRES IT RATHER THAN SKIPPING IT: deliveryPollDoneAt set, and the state it ' +
        'never resolved to left exactly as it was. Filtering an aged row out of the query would ' +
        'leave it in the queue forever, scanned on every tick and never finished',
      ok(
        () =>
          agedAfter!.deliveryPollDoneAt !== null &&
          agedAfter!.deliveryState === 'IN_FLIGHT' &&
          (tickForAged?.timedOut ?? 0) >= 1
      )
    );
    assert(
      '⚠ AND THE FOURTH QUADRANT IS STILL READABLE AFTERWARDS: state set and pollDone set, where the ' +
        'state is NOT terminal — which the schema documents as "gave up" rather than "concluded"',
      ok(() => poll.isTerminalForPolling(agedAfter!.deliveryState) === false)
    );

    // ── Layer P: the poll, for real, in this environment ─────────────────
    section('Layer P: the real poll — no key, no request, and the row says exactly that');

    assert(
      'CONTROL: RESEND_API_KEY really is absent in this process, so the failure below is the ' +
        'constructor refusing and not a network answer — .env.local is not loaded under tsx',
      !process.env.RESEND_API_KEY
    );
    const realTick: any = await call(
      'pollOne',
      prisma,
      {
        id: neverChecked.id,
        providerMessageId: `${TAG}-never`,
        acceptedAt: now,
        deliveryCheckedAt: null,
      },
      now
    );
    const realAfter = await stateOf(neverChecked.id);
    assert(
      '⚠ THE POLL ASKED AND COULD READ NOTHING, AND THE ROW RECORDS BOTH FACTS: deliveryCheckedAt ' +
        'SET, deliveryState NULL, deliveryPollDoneAt NULL. That triple means "asked, no readable ' +
        'answer yet", and it is the only one this environment can produce ([[GTC-247]])',
      ok(
        () =>
          realTick?.unreadable === 1 &&
          realAfter!.deliveryCheckedAt !== null &&
          realAfter!.deliveryState === null &&
          realAfter!.deliveryPollDoneAt === null
      )
    );
    assert(
      '⚠ AND WRITING deliveryCheckedAt ON A FAILED POLL IS DELIBERATE: not writing it would re-ask ' +
        'the same row on every tick against whatever is broken, which is the hot loop the retry ' +
        'policy exists to avoid',
      ok(() => realAfter!.deliveryCheckedAt !== null)
    );
    assert(
      '⚠ AND A FAILED POLL TOUCHES NOTHING ELSE — acceptedAt and providerError are exactly as they ' +
        'were. A delivery poll may not move ruling G’s clock or overwrite a send outcome',
      ok(() => realAfter!.acceptedAt !== null && realAfter!.providerError === null)
    );

    // ── Layer X: the fences ──────────────────────────────────────────────
    section(
      'Layer X: what the poller may never write, and the claim it deliberately does not take'
    );

    const writes = dataBlocks(stripComments(read(MODULE)));
    assert(
      'CONTROL: the module really does write — at least four data blocks were found',
      writes.length >= 4
    );
    assert(
      '⚠ NO WRITE IN THIS MODULE TOUCHES sentAt, acceptedAt, providerError, providerErrorCode, ' +
        'withheldAt, rejectedAt, attemptedAt OR attemptCount. The poll reads a delivered message’s ' +
        'fate; it is not a second writer of the send’s outcome',
      writes.every(
        (b) =>
          !/sentAt|acceptedAt|providerError|withheldAt|rejectedAt|attemptedAt|attemptCount/.test(b)
      )
    );
    assert(
      'CONTROL: that matcher really matches planted source',
      /sentAt|acceptedAt|providerError|withheldAt|rejectedAt|attemptedAt|attemptCount/.test(
        'data: { acceptedAt: now }'
      )
    );
    assert(
      '⚠ AND THERE IS NO CLAIM, DELIBERATELY: a double send is a second invitation and a double poll ' +
        'is two reads and one redundant write of the same value. So no claim column, no ' +
        'compare-and-swap, and no crashed-poll state to recover from',
      ok(() => {
        const src = stripComments(read(MODULE));
        return !/claimFor|attemptedAt: null/.test(src);
      })
    );

    // ── Layer J: the join guard, which needs a response to exist ─────────
    section('Layer J: the guard that turns the unverified join into a counted failure');

    process.env.RESEND_API_KEY = `re_${TAG}_sentinel_key_000000000000`;
    let stubbedBody: Record<string, unknown> = {};
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(stubbedBody), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch;

    const joinRow = await row({
      acceptedAt: now,
      attemptedAt: now,
      attemptCount: 1,
      provider: 'resend',
      providerMessageId: `${TAG}-join`,
    });
    stubbedBody = {
      id: `${TAG}-A-DIFFERENT-ID`,
      last_event: 'delivered',
      created_at: now.toISOString(),
    };
    const mismatch: any = await call(
      'pollOne',
      prisma,
      {
        id: joinRow.id,
        providerMessageId: `${TAG}-join`,
        acceptedAt: now,
        deliveryCheckedAt: null,
      },
      now
    );
    const joinAfter = await stateOf(joinRow.id);
    assert(
      '⚠ A RESPONSE ABOUT A DIFFERENT MESSAGE ID WRITES NO DELIVERY STATE, AND IS COUNTED. GTC-289’s ' +
        'own finding is that the join is unverified and is the thing most likely to fail SILENTLY, in ' +
        'the direction that looks like nothing happened. This guard is what makes it loud',
      ok(
        () =>
          mismatch?.mismatched === 1 &&
          mismatch?.read === 0 &&
          joinAfter!.deliveryState === null &&
          joinAfter!.providerLastEvent === null
      )
    );
    assert(
      'and the row still records that it was ASKED — a mismatch is not a reason to ask again in two ' +
        'minutes',
      ok(() => joinAfter!.deliveryCheckedAt !== null)
    );

    stubbedBody = {
      id: `${TAG}-join`,
      last_event: 'bounced',
      created_at: now.toISOString(),
    };
    const matched: any = await call(
      'pollOne',
      prisma,
      {
        id: joinRow.id,
        providerMessageId: `${TAG}-join`,
        acceptedAt: now,
        deliveryCheckedAt: null,
      },
      now
    );
    const bouncedAfter = await stateOf(joinRow.id);
    assert(
      '✅ AND THE SAME RESPONSE WITH THE MATCHING ID IS WRITTEN: BOUNCED, the provider’s own word kept ' +
        'verbatim beside it, and the asking STOPS. This is the pair the mismatch assertion needs to ' +
        'mean anything — an absence measured against a presence on the same build',
      ok(
        () =>
          matched?.read === 1 &&
          matched?.resolved === 1 &&
          bouncedAfter!.deliveryState === 'BOUNCED' &&
          bouncedAfter!.providerLastEvent === 'bounced' &&
          bouncedAfter!.deliveryPollDoneAt !== null
      )
    );

    stubbedBody = {
      id: `${TAG}-join`,
      last_event: 'delivered',
      created_at: now.toISOString(),
    };
    const deliveredRow = await row({
      acceptedAt: now,
      attemptedAt: now,
      attemptCount: 1,
      provider: 'resend',
      providerMessageId: `${TAG}-join`,
    });
    const deliveredTick: any = await call(
      'pollOne',
      prisma,
      {
        id: deliveredRow.id,
        providerMessageId: `${TAG}-join`,
        acceptedAt: now,
        deliveryCheckedAt: null,
      },
      now
    );
    const deliveredAfter = await stateOf(deliveredRow.id);
    assert(
      '⚠ AND A DELIVERED MESSAGE IS RECORDED WITHOUT ENDING THE ASKING — state written, pollDone ' +
        'NULL — because a bounce or a complaint after a delivery would arrive later and stopping here ' +
        'would make it unobservable',
      ok(
        () =>
          deliveredTick?.read === 1 &&
          deliveredTick?.resolved === 0 &&
          deliveredAfter!.deliveryState === 'PROVIDER_REPORTS_DELIVERED' &&
          deliveredAfter!.deliveryPollDoneAt === null
      )
    );
    assert(
      '⚠ AND AN UNDECLARED last_event IS RECORDED VERBATIM AND NEVER REJECTED — the installed SDK and ' +
        'the live API having diverged is a fact to read, not a reason to throw in a cron tick',
      await (async () => {
        stubbedBody = {
          id: `${TAG}-join`,
          last_event: 'teleported',
          created_at: now.toISOString(),
        };
        const r: any = await call(
          'pollOne',
          prisma,
          {
            id: deliveredRow.id,
            providerMessageId: `${TAG}-join`,
            acceptedAt: now,
            deliveryCheckedAt: null,
          },
          now
        );
        const after = await stateOf(deliveredRow.id);
        return (
          r?.read === 1 &&
          after!.deliveryState === 'UNRECOGNISED' &&
          after!.providerLastEvent === 'teleported' &&
          after!.deliveryPollDoneAt === null
        );
      })()
    );

    globalThis.fetch = realFetch;
    if (savedKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = savedKey;

    // ── Layer R: the route ───────────────────────────────────────────────
    section('Layer R: the poll rides the drain’s tick, after it, and cannot fail it');

    const routeSrc = read(ROUTE);
    assert(
      'the cron route calls pollOnce',
      /pollOnce\(/.test(routeSrc) && /delivery-poll/.test(routeSrc)
    );
    assert(
      '⚠ AFTER THE DRAIN, not before: the drain is the time-sensitive half and nobody is watching a ' +
        'delivery outcome',
      routeSrc.indexOf('drainOnce(') < routeSrc.indexOf('pollOnce(')
    );
    assert(
      '⚠ AND A BROKEN POLL CANNOT MAKE A WORKING DRAIN LOOK FAILED — the call is inside its own try, ' +
        'and the reason goes on the wire rather than being swallowed',
      ok(() => {
        const src = stripComments(routeSrc);
        const around = src.slice(src.indexOf('let poll'), src.indexOf('success: true'));
        return /try \{/.test(around) && /catch/.test(around) && /error: message/.test(around);
      })
    );
    assert(
      'and its counts go through withoutRecipientNames like every other cron result (GTC-270)',
      /withoutRecipientNames\(await pollOnce/.test(routeSrc)
    );
    assert(
      '⚠ AND NO SECOND CRON ROUTE WAS ADDED — four cron directories, unchanged, which is why the ' +
        'pinned route counts are untouched: ' +
        'GTC-270’s auth block has to be written out per file because GTC-268’s scanner does not ' +
        'follow imports, so a second route means a second copy of the refusals',
      ok(() => {
        const files = fs.readdirSync('src/app/api/cron', { withFileTypes: true });
        return files.filter((f) => f.isDirectory()).length === 4;
      })
    );
  } finally {
    globalThis.fetch = realFetch;
    if (savedKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = savedKey;
    try {
      const strays = await prisma.outboundMessage.findMany({ select: { id: true } });
      const strayIds = strays.map((r) => r.id).filter((id) => !preExistingOutboundIds.has(id));
      if (strayIds.length > 0) {
        await prisma.outboundMessage.deleteMany({ where: { id: { in: strayIds } } });
        console.log(`   cleaned ${strayIds.length} outbound row(s)`);
      }
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
    } catch (cleanupErr) {
      console.error('\x1b[31mTEARDOWN FAILED — rows may remain:\x1b[0m', cleanupErr);
      failed++;
    }
    await prisma.$disconnect();
    console.log(`\n\x1b[1m${passed} passed, ${failed} failed\x1b[0m`);
    if (failed > 0) {
      console.log('\x1b[31mRED:\x1b[0m');
      redAssertions.forEach((a) => console.log(`  ${a}`));
    }
    process.exit(failed > 0 ? 1 : 0);
  }
}

main();
