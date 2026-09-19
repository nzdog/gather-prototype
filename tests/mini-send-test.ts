/**
 * GTC-189 slice 5e — the mini-send. A person added after the press gets their own send, on their
 * own clock.
 *
 * Hinge §2, ruled gap #5. The build shape: *"Mini-sends reuse the dispatcher."* That is the whole
 * design — a late-added recipient gets an `OutboundMessage` row and everything after that is
 * slice 5c's drain: the same gates, the same quiet hours, the same claim, the same outcome, and
 * ruling G's clock starting at their own acceptance with no special case anywhere.
 *
 * ── WHERE THE ROW COMES FROM, AND WHY IT IS A SWEEP ───────────────────────────
 *
 * ⚠ NOT AT THE CAPTURE ROUTES. Three paths add a person — `POST /api/events/[id]/people`,
 * `createMember` inside the households route, and the batch import — and a fourth could be added
 * tomorrow. A hook in each is three writers of one rule, which is the shape decision 30 closed for
 * the press itself.
 *
 * So it is one sweep, in the dispatcher's own tick: for every event that has been pressed, any
 * addressed recipient with NO ask row gets one. ⚠ THE PRECEDENT IS EXACT AND IT IS
 * `generateWrapUpLinks`, whose own comment says why it is keyed on (event, person) rather than on
 * the event: *"a guest added AFTER the press must still get their link... an event-level 'already
 * done' check would pass every duplicate test and silently strip late guests instead."*
 *
 * ⚠ AND THE CONDITION IS "NO ASK ROW AT ALL", NOT "NO ACCEPTED ASK ROW". A withheld row, a
 * rejected row and an accepted row all mean this membership has been dealt with. Keyed on
 * acceptance, the sweep would re-create a row for every withholding on every tick, for ever.
 * Ruling U's bounce-door resend is the one case that makes a second ask row deliberately, and it
 * already has one, so the sweep leaves it alone.
 *
 * ── ⚠ RULING AJ IS NOT MET BY THIS SLICE, AND THAT IS RULED RATHER THAN OVERLOOKED ────
 *
 * Ruling AJ (decision 23): *"the collapsed one-person pre-flight asks me then"* — a person added on
 * day three gets the same chase-channel question the others got, at their own send.
 *
 * **It cannot. The control does not exist.** `PersonEvent.chaseException` is storage slice 4a
 * landed and [[GTC-311]] owns the control, the resolver and the screen; `chooseChaseRoute` still
 * has no caller anywhere in `src/`. Founder ruling, 2026-09-19:
 *
 *   "5e ships the mini-send without the question, records AJ as unmet with GTC-311 named as what
 *    meets it... Say plainly in the ticket that this is a ruling shipping incomplete, not a ruling
 *    met — and that a mini-send recipient therefore falls to the event default with no chance to
 *    except them."
 *
 * ⚠ SO: A MINI-SEND RECIPIENT FALLS TO `Event.chaseWhenNoMobileDefault` AND THE HOST IS NEVER
 * ASKED ABOUT THEM. That is decision 23's hole, still open, with the mini-send now shipping over
 * it. Layer J asserts the absence so it cannot read as done.
 *
 * ── ⚠ AND THE SWEEP DOES NOT MINT TOKENS, WHICH IS A BLOCKER FOUND BY BUILDING ───
 *
 * A mini-send needs a LINK, and a person added after the press holds no PARTICIPANT token: only
 * `ensureEventTokens` mints one, and its live callers are the person-edit PATCH, the tokens route,
 * `workflow.ts`'s transition and `pressSend`. None of them runs when a host simply adds somebody.
 *
 * ⚠ SO THE OBVIOUS MOVE — CALL `ensureEventTokens` FROM THE SWEEP — IS REFUSED, AND THE REASON IS
 * [[GTC-316]]. That function mints a PARTICIPANT token for every CHILD membership (childness lives
 * on `householdRole` and step 4 reads `role`), and the unauthenticated family directory publishes
 * it. Putting it on a **cron** would fire that defect **every two minutes on every pressed event**,
 * in production, with no host action at all.
 *
 * That is strictly worse than the state the founder's ordering ruling of 2026-09-19 reasoned about
 * — *"nothing presses until 5f wires the button"* — because a cron does not wait for a button. So
 * the sweep enrols only recipients who ALREADY hold a link, counts the rest as `awaitingLink`, and
 * **minting is a precondition on [[GTC-316]]**. Layer L asserts both halves.
 *
 * Destructive to its own created rows only; cleans up in `finally`.
 * Requires the dev server on :3000.
 *
 * Run: npx tsx tests/mini-send-test.ts
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const prisma = new PrismaClient();
const TAG = 'GTC189M';
const BASE = 'http://localhost:3000';

const DISPATCH = 'src/lib/press/dispatch.ts';
const PEOPLE_SECTION = 'src/components/plan/PeopleSection.tsx';

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
/** Outside quiet hours at either NZ offset — verified against isQuietHours, not reasoned about. */
const DAYTIME = new Date('2026-09-19T01:00:00.000Z');

async function main() {
  /*
   * ⚠ SNAPSHOT-AND-RESTORE, BECAUSE TWO FUNCTIONS THIS SUITE CALLS ARE GLOBAL BY DESIGN.
   *
   * `enrolMiniSends` sweeps EVERY pressed event and `drainOnce` drains EVERY unfinished row — they
   * are cron functions and a cron has no tenant. So the `finally` block below, which deletes what
   * the FIXTURE created, is not enough: the sweep creates rows on other people's events and the
   * drain then claims and attempts them.
   *
   * ⚠ IT ALREADY HAPPENED. The first run of this suite created 20 rows on four real boards —
   * including `GTC-192 replay — arrival`, a seeded DEMO board — and the drain attempted a send for
   * every one. Nothing was delivered, because the Resend key does not authenticate and every
   * address was on a reserved domain, and `PersonEvent.sentAt` did not move. **Both of those are
   * luck rather than design.**
   *
   * So: every `OutboundMessage` id present before the suite runs is recorded, and anything not in
   * that set is deleted afterwards. It is the same rule this ledger's standing warning states for
   * mutations — a query with no tenant filter has the table for a blast radius — arriving as a
   * FEATURE rather than as a mutation.
   */
  const preExistingOutboundIds = new Set(
    (await prisma.outboundMessage.findMany({ select: { id: true } })).map((r) => r.id)
  );
  const createdPersonIds: string[] = [];
  const createdEventIds: string[] = [];
  const createdUserIds: string[] = [];

  try {
    section('Layer 0: controls');

    const health = await fetch(`${BASE}/api/events`);
    assert('CONTROL: the dev server answers 401 with no cookie', health.status === 401);
    assert(
      'CONTROL: the file reader really reads',
      read(DISPATCH).length > 0 && read('src/lib/press/nope.ts') === ''
    );

    const { ensureEventTokens } = await import('../src/lib/tokens');

    let dispatch: any = null;
    try {
      dispatch = await import('../src/lib/press/dispatch');
    } catch {
      dispatch = null;
    }
    const call = async (fn: string, ...args: unknown[]) => {
      if (typeof dispatch?.[fn] !== 'function') return null;
      try {
        return await dispatch[fn](...args);
      } catch (e) {
        console.error(`   ${fn} threw:`, e);
        return null;
      }
    };

    // ── The fixture: an event, pressed, then somebody added ──────────────
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
    const late = await person('Late');
    const tokenless = await person('Tokenless');

    const event = await prisma.event.create({
      data: {
        name: `${TAG} the mini-send`,
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
    async function addRecipient(p: { id: string; name: string }) {
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
    await addRecipient(amelia);

    const press = await import('../src/lib/press/press');
    const pressed = await press.pressSend(prisma, {
      eventId: event.id,
      actor: { id: hostPerson.id, kind: 'HOST' as const, name: hostPerson.name },
      baseUrl: BASE,
    });

    section('Layer 0b: the event is pressed, with one recipient, before anybody is added');
    assert(
      'CONTROL: the press succeeded',
      ok(() => pressed.ok)
    );
    assert(
      'CONTROL: exactly one ask row exists, and the event is locked',
      (await prisma.outboundMessage.count({ where: { eventId: event.id } })) === 1
    );
    const eventAfterPress = await prisma.event.findUnique({
      where: { id: event.id },
      select: { sentAt: true },
    });
    assert('CONTROL: Event.sentAt is set', eventAfterPress!.sentAt !== null);

    /*
     * Two late arrivals, added AFTER the press exactly as a host does on day three.
     *
     * `late` is given a token — by the TEST, which may call `ensureEventTokens` where the sweep may
     * not (see the header) — so the enrolment path is exercised. `tokenless` is not, so the skip is
     * exercised too. Without the second one the `awaitingLink` count is zero and the assertion
     * about it passes for the wrong reason.
     */
    await addRecipient(late);
    await addRecipient(tokenless);
    await ensureEventTokens(event.id);
    const tokenlessPe = await prisma.personEvent.findFirst({
      where: { eventId: event.id, personId: tokenless.id },
      select: { id: true },
    });
    await prisma.accessToken.deleteMany({
      where: { eventId: event.id, personId: tokenless.id, scope: 'PARTICIPANT' },
    });
    const latePe = await prisma.personEvent.findFirst({
      where: { eventId: event.id, personId: late.id },
      select: { id: true },
    });
    assert(
      'CONTROL: both late arrivals are memberships with an item and NO ask row — the state a ' +
        'mini-send starts from',
      (await prisma.outboundMessage.count({ where: { personEventId: latePe!.id } })) === 0 &&
        (await prisma.outboundMessage.count({ where: { personEventId: tokenlessPe!.id } })) === 0
    );
    assert(
      'CONTROL: one holds a PARTICIPANT token and the other does not, so the sweep has one of ' +
        'each to answer for',
      (await prisma.accessToken.count({
        where: { eventId: event.id, personId: late.id, scope: 'PARTICIPANT' },
      })) === 1 &&
        (await prisma.accessToken.count({
          where: { eventId: event.id, personId: tokenless.id, scope: 'PARTICIPANT' },
        })) === 0
    );

    // ── Layer M: the sweep ───────────────────────────────────────────────
    section('Layer M: the sweep gives a late arrival their own row');

    assert(
      `${DISPATCH} exports enrolMiniSends`,
      ok(() => typeof dispatch.enrolMiniSends === 'function')
    );
    const enrolled = await call('enrolMiniSends', prisma, 50);
    const lateAskRows = await prisma.outboundMessage.count({
      where: { personEventId: latePe!.id, kind: 'ASK' },
    });
    assert(
      '⚠ THE LATE ARRIVAL GETS AN ASK ROW, AND IT IS KIND ASK LIKE ANY OTHER — a mini-send is the ' +
        'same message on a different clock, not a different message',
      lateAskRows === 1
    );
    assert(
      "⚠ AND THE SWEEP ENROLLED EXACTLY ONE ON THIS EVENT. Counted over this event's rows rather " +
        "than off the sweep's total, because the sweep is GLOBAL — it scans every pressed event in " +
        'the database, and a total is a fact about `gather_dev` rather than about this fixture',
      lateAskRows === 1 &&
        (await prisma.outboundMessage.count({ where: { eventId: event.id } })) === 2
    );
    const eventAfterSweep = await prisma.event.findUnique({
      where: { id: event.id },
      select: { sentAt: true },
    });
    assert(
      '⚠ AND Event.sentAt DID NOT MOVE. The press happened once (Hinge §7); a mini-send is not a ' +
        'second press and must not look like one in the lock',
      ok(() => eventAfterSweep!.sentAt!.getTime() === eventAfterPress!.sentAt!.getTime())
    );
    assert(
      "⚠ AND NO SECOND SEND_PRESSED WENT INTO THE LEDGER. The press is the ledger's FIRST entry " +
        '(Moment 4 §7) and there is only one of those. Adding a person is already recorded by the ' +
        "capture route's own ADD_PERSON; the outbound row is the record of the send (decision 27)",
      (await prisma.auditEntry.count({
        where: { eventId: event.id, actionType: 'SEND_PRESSED' },
      })) === 1
    );

    // ── Layer I: idempotence ─────────────────────────────────────────────
    section('Layer I: the sweep runs every tick, so it must not enrol twice');

    const again = await call('enrolMiniSends', prisma, 50);
    assert(
      '⚠ A SECOND SWEEP ENROLS NOBODY — the row already exists. The sweep runs on every cron tick, ' +
        'so a non-idempotent one would create a second invitation every two minutes',
      ok(() => again.enrolled === 0)
    );
    assert(
      'and the row count is unchanged',
      (await prisma.outboundMessage.count({ where: { eventId: event.id } })) === 2
    );

    // ── Layer L: the link, and the blocker ───────────────────────────────
    section(
      'Layer L: a late arrival with no link is counted, not enrolled (GTC-316 blocks minting)'
    );

    assert(
      '⚠ THE TOKENLESS LATE ARRIVAL GETS NO ROW — the sweep does not mint, so it cannot promise a ' +
        'link it has no way to create',
      (await prisma.outboundMessage.count({ where: { personEventId: tokenlessPe!.id } })) === 0
    );
    assert(
      '⚠ AND THE SWEEP SAYS SO RATHER THAN SKIPPING SILENTLY — `awaitingLink` counts them, so an ' +
        'operator reading enrolled: 0 can tell "nobody new" from "somebody new and no link for them"',
      ok(() => enrolled.awaitingLink >= 1)
    );
    assert(
      '⚠ AND THE MODULE NAMES [[GTC-316]] AS WHAT UNBLOCKS MINTING. Calling ensureEventTokens from ' +
        'a cron would mint a PARTICIPANT token for every CHILD membership every two minutes on ' +
        'every pressed event, which the unauthenticated directory publishes — worse than the state ' +
        'the ordering ruling reasoned about, because a cron does not wait for a button',
      read(DISPATCH).includes('GTC-316') && stripComments(read(DISPATCH)).includes('awaitingLink')
    );
    assert(
      '⚠ AND THE SWEEP CALLS NO TOKEN ISSUER AT ALL — asserted, because the fix that looks obvious ' +
        'is one import away',
      ok(() => {
        const src = stripComments(read(DISPATCH));
        return src.length > 0 && !/ensureEventTokens|accessToken\.create|generateToken/.test(src);
      })
    );

    // ── Layer U: what "already dealt with" means ──────────────────────────
    section('Layer U: a row in ANY state means this membership is done');

    const ameliaPe = await prisma.personEvent.findFirst({
      where: { eventId: event.id, personId: amelia.id },
      select: { id: true },
    });
    await prisma.outboundMessage.updateMany({
      where: { personEventId: ameliaPe!.id },
      data: { withheldAt: new Date(), withheldWhy: 'NO_CHANNEL' },
    });
    const afterWithheld = await call('enrolMiniSends', prisma, 50);
    assert(
      '⚠ A WITHHELD RECIPIENT IS NOT RE-ENROLLED. Keyed on acceptance rather than existence, the ' +
        'sweep would re-create a row for every withholding on every tick, for ever — and each one ' +
        'would be a fresh attempt at somebody the chooser has already refused',
      ok(() => afterWithheld.enrolled === 0)
    );
    await prisma.outboundMessage.updateMany({
      where: { personEventId: ameliaPe!.id },
      data: { withheldAt: null, withheldWhy: null, rejectedAt: new Date(), providerError: 'x' },
    });
    const afterRejected = await call('enrolMiniSends', prisma, 50);
    assert(
      "a REJECTED recipient is not re-enrolled either — a retry is the dispatcher's job through " +
        "nextAttemptAt, and a resend is the host's through ruling U's bounce door. Neither is " +
        "the sweep's",
      ok(() => afterRejected.enrolled === 0)
    );

    // ── Layer G: a legacy pressed event is not swept ─────────────────────
    section('Layer G: an event pressed by the OLD press is left alone');

    const legacy = await prisma.event.create({
      data: {
        name: `${TAG} legacy pressed`,
        startDate: endDate,
        endDate,
        hostId: hostPerson.id,
        status: 'CONFIRMING',
        // ⚠ `sentAt` set with NO ask rows — exactly what GTC-169's old press left behind, and what
        // every event pressed before slice 5 looks like.
        sentAt: new Date(now.getTime() - DAY),
      },
    });
    createdEventIds.push(legacy.id);
    await prisma.personEvent.create({
      data: { personId: hostPerson.id, eventId: legacy.id, role: 'HOST' },
    });
    const legacyTeam = await prisma.team.create({
      data: { name: `${TAG} L`, eventId: legacy.id },
    });
    await prisma.personEvent.create({
      data: { personId: amelia.id, eventId: legacy.id, role: 'PARTICIPANT' },
    });
    const lItem = await prisma.item.create({
      data: { name: `${TAG} l dish`, teamId: legacyTeam.id, status: 'ASSIGNED' },
    });
    await prisma.assignment.create({
      data: { itemId: lItem.id, personId: amelia.id, response: 'PENDING' },
    });
    await ensureEventTokens(legacy.id);
    const legacyPreview = await (
      await import('../src/lib/preflight/ask-preview')
    ).readAskPreview(prisma, legacy.id, BASE);
    assert(
      'CONTROL: the legacy event has sentAt set, a READY recipient, and NO ask rows — so keyed on ' +
        'sentAt alone the sweep would enrol her',
      ok(
        () =>
          legacyPreview!.recipients.length === 1 &&
          legacyPreview!.recipients[0].linkState === 'READY'
      ) && (await prisma.outboundMessage.count({ where: { eventId: legacy.id } })) === 0
    );
    const afterLegacy = await call('enrolMiniSends', prisma, 50);
    assert(
      '⚠ AND IT IS LEFT ALONE. `Event.sentAt` has been written since GTC-169 by the OLD press — the ' +
        'one that stamped clocks and sent nothing — so every event pressed before slice 5 has ' +
        'sentAt and zero ask rows. Keyed on sentAt the sweep enrols the WHOLE GUEST LIST of every ' +
        'one of them, and the drain then sends to all of them. It did: 20 rows across four real ' +
        'boards on the first run of this suite',
      (await prisma.outboundMessage.count({ where: { eventId: legacy.id } })) === 0
    );
    assert(
      'CONTROL: and the same sweep still enrols nobody on the live fixture either, so the legacy ' +
        'skip is the reason rather than the sweep having stopped working',
      ok(() => afterLegacy !== null && afterLegacy.enrolled === 0)
    );

    // ── Layer P: an unpressed event is not swept ─────────────────────────
    section('Layer P: only a pressed event has mini-sends');

    const unpressed = await prisma.event.create({
      data: {
        name: `${TAG} never pressed`,
        startDate: endDate,
        endDate,
        hostId: hostPerson.id,
        status: 'CONFIRMING',
      },
    });
    createdEventIds.push(unpressed.id);
    await prisma.personEvent.create({
      data: { personId: hostPerson.id, eventId: unpressed.id, role: 'HOST' },
    });
    const unpressedTeam = await prisma.team.create({
      data: { name: `${TAG} U`, eventId: unpressed.id },
    });
    await prisma.personEvent.create({
      data: { personId: amelia.id, eventId: unpressed.id, role: 'PARTICIPANT' },
    });
    const uItem = await prisma.item.create({
      data: { name: `${TAG} u dish`, teamId: unpressedTeam.id, status: 'ASSIGNED' },
    });
    await prisma.assignment.create({
      data: { itemId: uItem.id, personId: amelia.id, response: 'PENDING' },
    });
    const afterUnpressed = await call('enrolMiniSends', prisma, 50);
    const unpressedRows = await prisma.outboundMessage.count({
      where: { eventId: unpressed.id },
    });
    assert(
      '⚠ AN EVENT THAT WAS NEVER PRESSED IS NOT SWEPT. A mini-send is a send AFTER the press; on ' +
        'an unpressed event the host has not decided to send at all, and enrolling her guests ' +
        'would be the press happening by cron',
      ok(() => afterUnpressed.enrolled === 0) && unpressedRows === 0
    );

    // ── Layer D: the mini-send reuses the dispatcher, with no special case ──
    section('Layer D: the drain treats it like any other row (ruling G, per person)');

    const drained = await call('drainOnce', prisma, 50, DAYTIME);
    assert('the drain ran', drained !== null);
    const lateRow = await prisma.outboundMessage.findFirst({
      where: { personEventId: latePe!.id },
      select: {
        attemptedAt: true,
        attemptCount: true,
        rejectedAt: true,
        withheldAt: true,
        nextAttemptAt: true,
        providerError: true,
      },
    });
    assert(
      '⚠ THE MINI-SEND ROW WAS CLAIMED AND FINISHED BY THE SAME DRAIN — no second dispatcher, no ' +
        'branch, no "isMiniSend". The build shape said mini-sends reuse the dispatcher and this is ' +
        'what that means',
      ok(
        () =>
          lateRow!.attemptedAt !== null &&
          (lateRow!.rejectedAt !== null ||
            lateRow!.withheldAt !== null ||
            lateRow!.nextAttemptAt !== null)
      )
    );
    assert(
      '⚠ AND THE DISPATCHER CONTAINS NO MINI-SEND BRANCH — asserted, because the natural mistake ' +
        'is to give a late arrival its own path. Ruling G made the clock per person, which is what ' +
        'removes the need for one, and decision 33 removed isMiniSend for the same reason',
      ok(() => {
        const src = stripComments(read(DISPATCH));
        return src.length > 0 && !/isMiniSend|miniSend\?|isLate|lateArrival/.test(src);
      })
    );

    // ── Layer J: ruling AJ, unmet and said so ────────────────────────────
    section('Layer J: ruling AJ is NOT met, and the code says so');

    assert(
      '⚠ THE MODULE NAMES RULING AJ AS UNMET AND NAMES [[GTC-311]] AS WHAT MEETS IT. Founder ' +
        'ruling, 2026-09-19: this is a ruling SHIPPING INCOMPLETE, not a ruling met, and it must ' +
        'not read as done',
      read(DISPATCH).includes('AJ') && read(DISPATCH).includes('GTC-311')
    );
    assert(
      '⚠ AND THE CONSEQUENCE IS NAMED: a mini-send recipient falls to the event default with no ' +
        'chance to except them',
      ok(() => /chaseWhenNoMobileDefault/.test(read(DISPATCH)))
    );
    assert(
      'CONTROL: and the exception column really is still unset for the late arrival, so the ' +
        'sentence above describes the tree rather than only the comment',
      (await prisma.personEvent.findUnique({
        where: { id: latePe!.id },
        select: { chaseException: true },
      }))!.chaseException === null
    );

    // ── Layer T: the Auto-Assign tombstone ───────────────────────────────
    section('Layer T: the tombstone, and which of its two conditions is now met');

    const people = read(PEOPLE_SECTION);
    assert(
      '⚠ THE `!isSent &&` CONDITION IS STILL THERE. Its comment names TWO expiries — this ticket ' +
        'for mini-sends and GTC-178 (E1) for the cadence their clocks run on — and E1 is not ' +
        'built. Deleting it now offers a button creating N asks on a cadence that does not exist',
      stripComments(people).includes('!isSent &&')
    );
    assert(
      '⚠ AND THE COMMENT NOW DISTINGUISHES MET FROM UNMET: mini-sends exist, GTC-178 does not, and ' +
        'ruling AJ\'s question does not either. A tombstone that says only "not yet" is a ' +
        'tombstone the next reader deletes',
      /MET: mini-sends exist/.test(people) &&
        /NOT MET: GTC-178/.test(people) &&
        people.includes('GTC-311')
    );
    assert(
      'CONTROL: the tombstone file was really read — it still contains the Auto-Assign handler the ' +
        'condition guards',
      people.includes('handleAutoAssign')
    );
  } finally {
    // ⚠ The global sweep's and drain's reach, undone. See the note at the top of main().
    const strays = await prisma.outboundMessage.findMany({ select: { id: true } });
    const strayIds = strays.map((r) => r.id).filter((id) => !preExistingOutboundIds.has(id));
    if (strayIds.length > 0) {
      await prisma.outboundMessage.deleteMany({ where: { id: { in: strayIds } } });
      console.log(`   cleaned ${strayIds.length} row(s) the global sweep/drain created elsewhere`);
    }
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
