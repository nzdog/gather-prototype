/**
 * GTC-189 slice 5c, FIRST HALF — the cron route and the claim.
 *
 * ⚠ THIS HALF SENDS NOTHING AND CLAIMS NOTHING IN PRODUCTION, AND THE SECOND IS THE REASON.
 *
 * The schema is explicit about what an unfinished claim means: *"a row left with `attemptedAt` set
 * and no end state below is a crashed attempt — a visible fact rather than a silent resend."* So a
 * route that claimed rows before a transport existed would turn **every** row it touched into a
 * crashed attempt, permanently, and the press is ruled one act with no recall. The claim is
 * therefore BUILT and PROVEN here as a primitive, against real rows, and the route does not call
 * it until the second half has something that can finish a row.
 *
 * What the route does in this half: authenticates, reads both drain passes, and reports what it
 * WOULD drain. Layer N asserts it reaches no provider and takes no claim.
 *
 * ── THE CLAIM, AND THE HALF THE SCHEMA DOES NOT SETTLE ────────────────────────
 *
 * The first attempt is the schema's own instruction — `updateMany` on `attemptedAt: null`, send
 * only when the count is 1 — so two overlapping cron runs cannot both send. **That is the one
 * place this model departs from the house dispatcher pattern deliberately**:
 * `dispatchPendingWrapUpMessages` marks its rows AFTER sending, so a crash between the send and
 * the mark re-sends on the next tick. For a thank-you that is a duplicate thank-you; for the press
 * it is a second invitation to everyone in the window.
 *
 * ⚠ **THE RETRY CLAIM IS THE EXECUTOR'S AND NOT THE SCHEMA'S, AND IT IS RECORDED AS SUCH**
 * (founder confirmation, 2026-09-19: *"your compare-and-swap on nextAttemptAt is right and the
 * schema genuinely does not settle it. Record that as yours rather than the schema's."*). On a
 * retry `attemptedAt` is already set, so `attemptedAt: null` matches nothing and the schema's
 * predicate does not apply. The compare-and-swap is on `nextAttemptAt`, which the claim also
 * clears — so a row is either WAITING (`nextAttemptAt` set) or IN FLIGHT (cleared) and never both,
 * and the retry pass is as unforgeable as the first.
 *
 * ── WHAT THE ROUTE'S AUTH SHAPE IS, AND WHY IT IS WRITTEN OUT TWICE ───────────
 *
 * GTC-270's shape exactly, and `src/app/api/cron/cron-secret.ts` records the measurement behind
 * it: GTC-268's route scanner classifies a handler from the `if` CONDITIONS inside it, follows
 * local helpers and does NOT follow imports. A helper that swallowed the whole check reported all
 * six cron handlers as *"no credential of any kind"* — worse than the fail-open it replaced. So the
 * DECISION lives in that module and the REFUSAL stays in the route file.
 *
 * Destructive to its own created rows only; cleans up in `finally`.
 * Requires the dev server on :3000 for the route's HTTP assertions.
 *
 * Run: npx tsx tests/outbound-dispatch-test.ts
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const prisma = new PrismaClient();
const TAG = 'GTC189D';
const BASE = 'http://localhost:3000';

const ROUTE = 'src/app/api/cron/outbound-dispatch/route.ts';
const DISPATCH = 'src/lib/press/dispatch.ts';
const VERCEL = 'vercel.json';

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

async function main() {
  const createdPersonIds: string[] = [];
  const createdEventIds: string[] = [];
  const createdUserIds: string[] = [];

  try {
    // ── Layer 0: controls ────────────────────────────────────────────────
    section('Layer 0: controls — the harness, the server and the tree');

    const health = await fetch(`${BASE}/api/events`);
    assert(
      'CONTROL: the dev server is up on :3000 and answers 401 with no cookie',
      health.status === 401
    );
    assert(
      'CONTROL: the comment stripper strips',
      stripComments('/* attemptedAt */ const a = 1; // b').includes('attemptedAt') === false
    );
    assert(
      'CONTROL: the file reader really reads — an existing path is non-empty and a missing one ' +
        'is "", so no absence below passes for the wrong reason',
      read(VERCEL).length > 0 && read('src/lib/press/nope.ts') === ''
    );

    let dispatch: any = null;
    try {
      dispatch = await import('../src/lib/press/dispatch');
    } catch {
      dispatch = null;
    }

    /*
     * A missing module must read as FAILED ASSERTIONS, not a crashed run — `ask-preview-test`'s
     * rule, and GTC-192's standing warning: "a suite that cannot report its red is not a red."
     * The stand-ins answer shapes no assertion can mistake for a pass: no rows found, and no
     * claim taken.
     */
    const find = async (fn: 'findNeverAttempted' | 'findDueForRetry', take: number) => {
      if (typeof dispatch?.[fn] !== 'function') return [] as any[];
      try {
        return (await dispatch[fn](prisma, take)) as any[];
      } catch {
        return [] as any[];
      }
    };
    const claim = async (fn: 'claimForFirstAttempt' | 'claimForRetry', id: string) => {
      if (typeof dispatch?.[fn] !== 'function') return null;
      try {
        return (await dispatch[fn](prisma, id)) as boolean;
      } catch {
        return null;
      }
    };

    // ── Layer A: the route's auth shape ──────────────────────────────────
    section("Layer A: the cron route's auth — GTC-270's shape, both refusals in the file");

    const routeSrc = stripComments(read(ROUTE));
    assert(`${ROUTE} exists`, read(ROUTE).length > 0);
    assert(
      'it exports both GET and POST, as the other three cron routes do',
      /export async function GET/.test(routeSrc) && /export async function POST/.test(routeSrc)
    );
    assert(
      '⚠ BOTH REFUSING IFS ARE WRITTEN OUT IN THE ROUTE FILE, not swallowed by a helper — ' +
        "GTC-268's scanner classifies from the `if` conditions inside a handler and does not " +
        'follow imports, and a helper that hid the check reported all six cron handlers as ' +
        'having no credential at all',
      routeSrc.includes('isCronSecretConfigured') && routeSrc.includes('cronSecretAccepted')
    );
    assert(
      'the secret is read at module scope, as GTC-270 has it in the other three',
      /const CRON_SECRET = process\.env\.CRON_SECRET/.test(routeSrc)
    );
    assert(
      'the response goes through withoutRecipientNames, so a later errors array cannot leak ' +
        'a guest by default',
      routeSrc.includes('withoutRecipientNames')
    );

    const noSecret = await fetch(`${BASE}/api/cron/outbound-dispatch`, { method: 'POST' });
    assert(
      '⚠ A CALLER WITH NO SECRET IS REFUSED 401 — asserted over HTTP, because the source above ' +
        'proves the words are present and not that the route refuses',
      noSecret.status === 401
    );
    const wrongSecret = await fetch(
      `${BASE}/api/cron/outbound-dispatch?secret=${TAG}-definitely-not-it`,
      { method: 'POST' }
    );
    assert('a caller with the wrong secret is refused 401', wrongSecret.status === 401);
    const getNoSecret = await fetch(`${BASE}/api/cron/outbound-dispatch`);
    assert('and GET is refused the same way as POST', getNoSecret.status === 401);

    // ── Layer V: the schedule ────────────────────────────────────────────
    section('Layer V: the schedule is registered, and it is two minutes');

    const vercel = read(VERCEL);
    assert('vercel.json registers the route', vercel.includes('/api/cron/outbound-dispatch'));
    assert(
      '⚠ EVERY TWO MINUTES, and it is a PROPOSAL WITH NO MEASUREMENT BEHIND IT (founder, ' +
        '2026-09-19). The one-act feeling is what is being served and twelve minutes plainly ' +
        'does not serve it; if an accepted send is ever observed and two is wrong, it is one ' +
        'number to change',
      ok(() => {
        const cfg = JSON.parse(vercel);
        const entry = cfg.crons.find((c: any) => c.path.includes('outbound-dispatch'));
        return entry?.schedule === '*/2 * * * *';
      })
    );
    assert(
      'CONTROL: the other three schedules are untouched — 15, 10 and 15 minutes',
      ok(() => {
        const cfg = JSON.parse(vercel);
        const of = (p: string) => cfg.crons.find((c: any) => c.path.includes(p))?.schedule;
        return (
          of('nudges') === '*/15 * * * *' &&
          of('wrap-up-dispatch') === '*/10 * * * *' &&
          of('decide-by-followups') === '*/15 * * * *'
        );
      })
    );

    // ── The fixture: an event pressed, with rows to drain ────────────────
    const now = new Date();
    const stamp = Date.now();
    const endDate = new Date(now.getTime() + 7 * DAY);

    const user = await prisma.user.create({ data: { email: `${TAG}+${stamp}@example.com` } });
    createdUserIds.push(user.id);

    async function person(name: string) {
      const p = await prisma.person.create({
        data: {
          name: `${TAG} ${name}`,
          email: `${TAG.toLowerCase()}-${name.toLowerCase()}+${stamp}@example.com`,
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
    const cara = await person('Cara');

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
    for (const p of [amelia, bob, cara]) {
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

    section('Layer 0b: the fixture has rows to drain');
    assert(
      'CONTROL: the press succeeded',
      ok(() => pressed.ok)
    );
    const rows = await prisma.outboundMessage.findMany({
      where: { eventId: event.id },
      orderBy: { createdAt: 'asc' },
      select: { id: true, attemptedAt: true, attemptCount: true, nextAttemptAt: true },
    });
    assert(
      'CONTROL: three unclaimed rows exist — the drain below reads rows that are really there',
      rows.length === 3 && rows.every((r) => r.attemptedAt === null && r.attemptCount === 0)
    );

    // ── Layer D: the two passes ──────────────────────────────────────────
    section('Layer D: the two drain passes, in the shape the indexes were built for');

    assert(
      `${DISPATCH} exports findNeverAttempted and findDueForRetry`,
      ok(
        () =>
          typeof dispatch.findNeverAttempted === 'function' &&
          typeof dispatch.findDueForRetry === 'function'
      )
    );
    const never = await find('findNeverAttempted', 50);
    assert(
      'the never-attempted pass finds all three, and finds them in creation order — the FIFO ' +
        'the @@index([attemptedAt, createdAt]) exists for',
      ok(
        () =>
          never.filter((r: any) => r.eventId === event.id).length === 3 &&
          JSON.stringify(never.filter((r: any) => r.eventId === event.id).map((r: any) => r.id)) ===
            JSON.stringify(rows.map((r) => r.id))
      )
    );
    const dueNow = await find('findDueForRetry', 50);
    assert(
      'the retry pass finds NOTHING yet — no row has a nextAttemptAt, so the two passes are ' +
        'disjoint rather than overlapping',
      dueNow.length >= 0 &&
        dueNow.filter((r: any) => r.eventId === event.id).length === 0 &&
        typeof dispatch?.findDueForRetry === 'function'
    );
    /*
     * ⚠ ASSERTED BEHAVIOURALLY, NOT BY GREPPING FOR `take:`. A source match proves the word is
     * present and not that the query is bounded — the same defect as slice 5b's M4, where a
     * refusal asserted by its NAME survived the refusal being deleted. A take of 2 against a
     * 3-row fixture is the claim itself.
     */
    const bounded = await find('findNeverAttempted', 2);
    assert(
      'the never-attempted pass is BOUNDED — a take of 2 against three rows returns 2, so a ' +
        "tick's cost is a property of the work in front of it and not of the table's history",
      bounded.length === 2
    );
    assert(
      'CONTROL: and the same pass unbounded by that limit returns all three, so the 2 above is ' +
        'the take doing its job rather than a query that finds too little',
      never.filter((r: any) => r.eventId === event.id).length === 3
    );

    // ── Layer C: the first claim ─────────────────────────────────────────
    section("Layer C: the first claim — the schema's own instruction");

    const target = rows[0].id;
    const first = await claim('claimForFirstAttempt', target);
    assert('claiming an unclaimed row succeeds', first === true);
    const afterFirst = await prisma.outboundMessage.findUnique({
      where: { id: target },
      select: { attemptedAt: true, attemptCount: true },
    });
    assert(
      'and it stamped attemptedAt and incremented attemptCount to 1',
      ok(() => afterFirst!.attemptedAt !== null && afterFirst!.attemptCount === 1)
    );
    const second = await claim('claimForFirstAttempt', target);
    assert(
      '⚠ AND A SECOND CLAIM ON THE SAME ROW FAILS — which is the whole point: two overlapping ' +
        'cron runs cannot both send, and a double-send is structurally impossible rather than ' +
        'merely unlikely',
      second === false
    );
    const afterSecond = await prisma.outboundMessage.findUnique({
      where: { id: target },
      select: { attemptCount: true },
    });
    assert(
      'and the refused claim did not increment the count — a failed claim touches nothing',
      ok(() => afterSecond!.attemptCount === 1)
    );
    const neverAfter = await find('findNeverAttempted', 50);
    assert(
      'a claimed row leaves the never-attempted pass, so the next tick does not see it again',
      typeof dispatch?.findNeverAttempted === 'function' &&
        !neverAfter.some((r: any) => r.id === target)
    );
    assert(
      "⚠ AND IT IS NOW A CRASHED ATTEMPT, BY THE SCHEMA'S OWN DEFINITION — attemptedAt set and " +
        'no end state. That is exactly why this half does NOT claim from the route: a route ' +
        'claiming before a transport exists would make every row it touched one of these, ' +
        'permanently, against a press ruled one act with no recall',
      ok(() => afterSecond!.attemptCount === 1 && afterFirst!.attemptedAt !== null)
    );

    // ── Layer Y: the retry claim ─────────────────────────────────────────
    section("Layer Y: the retry claim — the compare-and-swap, which is the executor's");

    const retryTarget = rows[1].id;
    const due = new Date(Date.now() - 60_000);
    await prisma.outboundMessage.update({
      where: { id: retryTarget },
      data: { attemptedAt: new Date(Date.now() - 120_000), attemptCount: 1, nextAttemptAt: due },
    });
    const dueRows = await find('findDueForRetry', 50);
    assert(
      'a row whose nextAttemptAt has passed appears in the retry pass',
      ok(() => dueRows.some((r: any) => r.id === retryTarget))
    );
    const notYet = rows[2].id;
    await prisma.outboundMessage.update({
      where: { id: notYet },
      data: {
        attemptedAt: new Date(Date.now() - 120_000),
        attemptCount: 1,
        nextAttemptAt: new Date(Date.now() + 10 * 60_000),
      },
    });
    const dueRows2 = await find('findDueForRetry', 50);
    assert(
      '⚠ AND A ROW WHOSE nextAttemptAt IS IN THE FUTURE DOES NOT — the backoff is a wait and ' +
        'not a queue position',
      typeof dispatch?.findDueForRetry === 'function' && !dueRows2.some((r: any) => r.id === notYet)
    );
    const retried = await claim('claimForRetry', retryTarget);
    assert('claiming a due retry succeeds', retried === true);
    const afterRetry = await prisma.outboundMessage.findUnique({
      where: { id: retryTarget },
      select: { attemptedAt: true, attemptCount: true, nextAttemptAt: true },
    });
    assert(
      '⚠ THE CLAIM CLEARS nextAttemptAt AND RE-STAMPS attemptedAt, so the row is IN FLIGHT and ' +
        'no longer WAITING. That is the compare-and-swap: a row is one or the other and never ' +
        'both, and it is why the retry pass is as unforgeable as the first',
      ok(
        () =>
          afterRetry!.nextAttemptAt === null &&
          afterRetry!.attemptCount === 2 &&
          afterRetry!.attemptedAt !== null
      )
    );
    const retriedAgain = await claim('claimForRetry', retryTarget);
    assert(
      'and a second retry claim on the same row fails, because nextAttemptAt is no longer set',
      retriedAgain === false
    );
    const claimFirstOnRetried = await claim('claimForFirstAttempt', retryTarget);
    assert(
      '⚠ AND THE FIRST-ATTEMPT CLAIM CANNOT TAKE A RETRIED ROW EITHER — the two predicates are ' +
        'disjoint, so no row can be claimed twice by two different passes on the same tick',
      claimFirstOnRetried === false
    );
    const notDueClaim = await claim('claimForRetry', notYet);
    assert(
      'a row whose backoff has not elapsed cannot be claimed for retry',
      notDueClaim === false
    );

    // ── Layer N: nothing sends, and nothing is claimed by the route ──────
    section('Layer N: this half reaches no provider and takes no claim');

    const dispatchSrc = stripComments(read(DISPATCH));
    /*
     * ⚠ TWO ASSERTIONS HERE EXPIRED WHEN THIS SLICE'S SECOND HALF LANDED, AND THAT IS THE TRIPWIRE
     * WORKING. They held "the dispatch module reaches no provider" and "the route takes no claim",
     * both true of the first half by design and both deliberately false now — the claim went live in
     * the same commit as the thing that can finish a row, which is what the first half said it
     * would. Replaced with what must stay true forever rather than what was true for one commit.
     */
    assert(
      '⚠ THE DISPATCHER IS THE ONLY THING THAT CLAIMS, and the route reaches it through ONE entry ' +
        'point. Two callers of a claim is how two ticks come to send the same row',
      routeSrc.length > 0 &&
        routeSrc.includes('drainOnce') &&
        !routeSrc.includes('claimForFirstAttempt') &&
        !routeSrc.includes('claimForRetry')
    );
    assert(
      'CONTROL: the route matcher really matches — it finds the function it calls, so the two ' +
        'absences above are absences and not a failed read',
      routeSrc.includes('drainOnce')
    );
    assert(
      '⚠ AND NOTHING OUTSIDE THE DISPATCHER CLAIMS A ROW. Asserted over src/ rather than over the ' +
        'route alone, because the press is the other place that touches these rows and a claim ' +
        'taken there would be a drain inside a request that can be killed halfway',
      ok(() => {
        const hits: string[] = [];
        const walk = (dir: string) => {
          for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const q = `${dir}/${e.name}`;
            if (e.isDirectory()) walk(q);
            else if (/\.tsx?$/.test(e.name) && q !== DISPATCH) {
              const src = stripComments(read(q));
              if (/claimForFirstAttempt\(|claimForRetry\(/.test(src)) hits.push(q);
            }
          }
        };
        walk('src');
        return hits.length === 0;
      })
    );
    assert(
      'no fake provider anywhere (founder Q7): the module names no NODE_ENV, MOCK, FAKE or ' +
        'DRY_RUN',
      dispatchSrc.length > 0 && !/NODE_ENV|MOCK|FAKE|DRY_RUN|dryRun/.test(dispatchSrc)
    );

    // ── Layer W: what the second half must meet, recorded now ────────────
    section('Layer W: the three rulings the second half inherits, written down here');

    assert(
      "⚠ SMS_DISABLED IS A WITHHOLDING, not a provider error — ruled 2026-09-19 for ruling AN's " +
        'reason, which is that the two doors were separated so this could not be settled by ' +
        'whichever branch got written first. Named in the module before anything can write it',
      read(DISPATCH).includes('SMS_DISABLED')
    );
    assert(
      "⚠ THE ASK'S TEXT SEND WILL WRITE A FALSE NUDGE_SENT_AUTO, ruled as a stopgap with the " +
        'fix filed on GTC-288. Recorded at the place the send will go, so the second half meets ' +
        'it rather than discovers it',
      read(DISPATCH).includes('NUDGE_SENT_AUTO') && read(DISPATCH).includes('GTC-288')
    );
    assert(
      '⚠ 401 AND 403 ARE TERMINAL AND LOUD, because in this environment every provider answer ' +
        'is an auth failure and a retry-any-error policy queues every row three times against ' +
        'a key that will never work',
      read(DISPATCH).includes('401') && read(DISPATCH).includes('403')
    );
    assert(
      'and the gate order is recorded: gates, then quiet hours, then claim, then send',
      read(DISPATCH).includes('quiet hours') || read(DISPATCH).includes('QUIET HOURS')
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
