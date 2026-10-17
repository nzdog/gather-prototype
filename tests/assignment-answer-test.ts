/**
 * GTC-320 — two ack routes, one write, and a line that has already drifted.
 *
 * WHAT THIS HOLDS
 *
 *   One place decides what an item response writes and what the ledger records about it.
 *   Two routes did — `POST /api/p/[token]/ack/[assignmentId]` and
 *   `POST /api/c/[token]/ack/[assignmentId]` — and they no longer agreed on the second
 *   half. Measured at `aefa030`, comments stripped: 37 shared non-blank lines, of which
 *   the `assignment.update`, the verb ternary and the `logAudit` call are 17 in two
 *   blocks. The single line BETWEEN those two blocks is the one that drifted:
 *
 *     participant:  `${verb} assignment for item ${assignment.itemId}`   <- a cuid
 *     coordinator:  `${verb} ${assignment.item.name}`                    <- the name
 *
 *   `AuditEntry.details` is rendered to the host at `/h/[token]/audit`
 *   (`src/app/h/[token]/audit/page.tsx`), so one of those two sentences is shown to her
 *   unreadable. The schema calls the ledger her memory of what happened; a row reading
 *   "Accepted assignment for item cmu6rj7tl000srjfafy14ufnq" is not a memory of anything.
 *
 * ⚠ THE VERB WAS WRITTEN FOR THE FORM THAT DID NOT DRIFT, AND THAT IS THE ARGUMENT.
 *   The third branch of the ternary is `'Maybe on'`, not `'Maybe'`. It reads as a sentence
 *   in exactly one of the two shapes — "Maybe on the crackers" — and as noise in the
 *   other, "Maybe on assignment for item cmu…". So which form survives is decided by the
 *   code rather than by taste: the coordinator's was the intended one and the
 *   participant's was the copy that lost the name.
 *
 * ── WHAT IS DELIBERATELY NOT EXTRACTED ────────────────────────────────────────
 *
 * ⚠ GTC-191's AUTHORISATION STAYS IN THE PARTICIPANT ROUTE. `resolveCarriedSubjects`, the
 * carried-vs-own decision and the 403 are a Zone 3 approval given to that route and to no
 * other (founder, 2026-09-18). Generalising them into shared code would widen a signed
 * approval by refactor, which is the one move GTC-320's Stop Condition 5 names. Layer Z
 * asserts the helper reaches none of it.
 *
 * The coordinator route's own-row check stays too — GTC-174's ruling, not widened here.
 *
 * ── THE FIXTURE ───────────────────────────────────────────────────────────────
 *
 *   Amelia   PARTICIPANT, her household's contact, one row of her own
 *   James    her household's CHILD, one row she carries
 *   Colin    COORDINATOR of a team, one row of his own
 *
 * Destructive to its own created rows only; cleans up in `finally`.
 * Requires the dev server on :3000 — both routes are exercised over HTTP rather than as
 * imported handlers, because the point of this ticket is what the two DOORS write.
 *
 * Run: npx tsx tests/assignment-answer-test.ts
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import { ensureEventTokens } from '../src/lib/tokens';

const prisma = new PrismaClient();
const TAG = 'GTC320';
const BASE = 'http://localhost:3000';

const P_ROUTE = 'src/app/api/p/[token]/ack/[assignmentId]/route.ts';
const C_ROUTE = 'src/app/api/c/[token]/ack/[assignmentId]/route.ts';
const HELPER = 'src/lib/assignment/answer.ts';

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

/** The RED run must report every assertion, not stop at the first undefined. */
function ok(fn: () => boolean): boolean {
  try {
    return !!fn();
  } catch {
    return false;
  }
}

/** Source with comments removed — a fix that names what it removed false-positives a raw
 *  search, as `tests/coordinator-token-exposure-test.ts` records. */
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

async function http(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, init);
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* some responses have no body */
  }
  return { status: res.status, json };
}

const DAY = 24 * 60 * 60 * 1000;

async function main() {
  const createdPersonIds: string[] = [];
  const createdEventIds: string[] = [];
  const createdUserIds: string[] = [];

  try {
    // ── Layer 0: controls ────────────────────────────────────────────────
    section('Layer 0: controls — the harness and the server, before anything is trusted');

    const health = await http('/api/events');
    assert(
      'CONTROL: the dev server is up on :3000 and answers 401 with no cookie — both ack ' +
        'routes are exercised over HTTP because what this ticket is about is what the two ' +
        'DOORS write',
      health.status === 401
    );
    assert(
      'CONTROL: the comment stripper strips — asserted before the structural guards trust it',
      stripComments('/* logAudit */ const a = 1; // b\nconst c = 2;').includes('logAudit') === false
    );
    assert(
      'CONTROL: the file reader really reads these two routes — a missing path returns "" ' +
        'and every structural absence below would pass for the wrong reason',
      read(P_ROUTE).length > 0 && read(C_ROUTE).length > 0
    );

    // ── Layer S: one writer ──────────────────────────────────────────────
    section('Layer S: one helper performs the write and the audit line, and both routes call it');

    let helperMod: any = null;
    try {
      helperMod = await import('../src/lib/assignment/answer');
    } catch {
      helperMod = null;
    }
    assert(
      `${HELPER} exists and exports recordAssignmentAnswer`,
      ok(() => typeof helperMod.recordAssignmentAnswer === 'function')
    );

    const pSrc = stripComments(read(P_ROUTE));
    const cSrc = stripComments(read(C_ROUTE));

    assert(
      'the participant route no longer calls logAudit itself',
      pSrc.length > 0 && !pSrc.includes('logAudit(')
    );
    assert(
      'the coordinator route no longer calls logAudit itself',
      cSrc.length > 0 && !cSrc.includes('logAudit(')
    );
    assert(
      'the participant route no longer writes the assignment response itself',
      pSrc.length > 0 && !/assignment\.update\(/.test(pSrc)
    );
    assert(
      'the coordinator route no longer writes the assignment response itself',
      cSrc.length > 0 && !/assignment\.update\(/.test(cSrc)
    );
    assert('the participant route imports the helper', pSrc.includes('recordAssignmentAnswer'));
    assert('the coordinator route imports the helper', cSrc.includes('recordAssignmentAnswer'));

    // The verb is the cheapest fingerprint of the duplicated block, and it is the one that
    // decided the surviving form — see the header. Two copies today, one afterwards.
    const verbFiles: string[] = [];
    for (const [path, src] of [
      [P_ROUTE, pSrc],
      [C_ROUTE, cSrc],
      [HELPER, stripComments(read(HELPER))],
    ] as const) {
      if (src.includes('Maybe on')) verbFiles.push(path);
    }
    assert(
      "the verb ternary lives in exactly one file, and it is the helper — 'Maybe on' is " +
        'the fingerprint of the duplicated block',
      verbFiles.length === 1 && verbFiles[0] === HELPER
    );
    assert(
      'CONTROL: the verb matcher really matches — it finds the string in a planted source',
      stripComments("const v = 'Maybe on';").includes('Maybe on')
    );

    // ── Layer Z: what is NOT extracted ───────────────────────────────────
    section('Layer Z: the Zone 3 approval stays in the route it was given to');

    const helperSrc = stripComments(read(HELPER));
    assert(
      "the participant route still holds GTC-191's resolver — the authorisation was not " +
        'generalised into shared code (GTC-320 Stop Condition 5)',
      pSrc.includes('resolveCarriedSubjects')
    );
    assert('the participant route still holds its own 403', pSrc.includes('403'));
    assert(
      'the coordinator route still holds its own-row check (GTC-174, not widened here)',
      cSrc.includes('assignment.personId !== resolvedContext.person.id')
    );
    assert(
      '⚠ the helper reaches NO authorisation: it names neither the carried resolver nor ' +
        'the chooser, and it decides no refusal',
      helperSrc.length > 0 &&
        !helperSrc.includes('resolveCarriedSubjects') &&
        !helperSrc.includes('chooseAskRoute') &&
        !helperSrc.includes('403')
    );
    assert(
      'the helper touches no token: it names neither resolveToken nor AccessToken',
      helperSrc.length > 0 &&
        !helperSrc.includes('resolveToken') &&
        !helperSrc.includes('accessToken')
    );

    // ── The fixture ──────────────────────────────────────────────────────
    const now = new Date();
    const stamp = Date.now();
    const endDate = new Date(now.getTime() + 7 * DAY);

    const user = await prisma.user.create({ data: { email: `${TAG}+${stamp}@example.test` } });
    createdUserIds.push(user.id);

    async function person(name: string) {
      const slug = name.toLowerCase().replace(/\s+/g, '-');
      const p = await prisma.person.create({
        data: {
          name: `${TAG} ${name}`,
          email: `${TAG.toLowerCase()}-${slug}+${stamp}@example.test`,
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
    const james = await person('James');
    const colin = await person('Colin');

    const event = await prisma.event.create({
      data: {
        name: `${TAG} one write`,
        startDate: endDate,
        endDate,
        hostId: hostPerson.id,
        status: 'CONFIRMING',
        sentAt: new Date(now.getTime() - DAY),
      },
    });
    createdEventIds.push(event.id);

    const team = await prisma.team.create({ data: { name: `${TAG} Mains`, eventId: event.id } });

    const hhHost = await prisma.household.create({ data: { eventId: event.id } });
    const hhA = await prisma.household.create({ data: { eventId: event.id } });

    const peHost = await prisma.personEvent.create({
      data: {
        personId: hostPerson.id,
        eventId: event.id,
        role: 'HOST',
        householdId: hhHost.id,
        householdRole: 'PRIMARY_CONTACT',
      },
    });
    const peAmelia = await prisma.personEvent.create({
      data: {
        personId: amelia.id,
        eventId: event.id,
        role: 'PARTICIPANT',
        householdId: hhA.id,
        householdRole: 'PRIMARY_CONTACT',
      },
    });
    await prisma.personEvent.create({
      data: {
        personId: james.id,
        eventId: event.id,
        role: 'PARTICIPANT',
        householdId: hhA.id,
        householdRole: 'CHILD',
      },
    });
    await prisma.personEvent.create({
      data: {
        personId: colin.id,
        eventId: event.id,
        role: 'COORDINATOR',
        teamId: team.id,
      },
    });

    for (const [hh, contact] of [
      [hhHost, peHost],
      [hhA, peAmelia],
    ] as const) {
      await prisma.household.update({
        where: { id: hh.id },
        data: { contactPersonEventId: contact.id },
      });
    }

    async function row(personId: string, name: string) {
      const item = await prisma.item.create({
        data: { name: `${TAG} ${name}`, teamId: team.id, status: 'ASSIGNED' },
      });
      const a = await prisma.assignment.create({
        data: { itemId: item.id, personId, response: 'PENDING' },
      });
      return { assignment: a, item };
    }

    const aPavlova = await row(amelia.id, 'the pavlova');
    const jCrackers = await row(james.id, 'the crackers');
    const cAle = await row(colin.id, 'the ale');

    await ensureEventTokens(event.id);
    const tokenOf = async (personId: string, scope: 'PARTICIPANT' | 'COORDINATOR') =>
      (
        await prisma.accessToken.findFirst({
          where: { eventId: event.id, personId, scope },
          select: { token: true },
        })
      )?.token ?? null;

    const ameliaToken = await tokenOf(amelia.id, 'PARTICIPANT');
    const colinToken = await tokenOf(colin.id, 'COORDINATOR');

    section('Layer 0b: the fixture routes the way the assertions need');
    assert(
      'CONTROL: Amelia holds a PARTICIPANT token and Colin a COORDINATOR one — both doors ' +
        'are reachable before anything is read through them',
      !!ameliaToken && !!colinToken
    );

    const auditFor = async (assignmentId: string) =>
      prisma.auditEntry.findMany({
        where: { eventId: event.id, targetId: assignmentId },
        orderBy: { timestamp: 'asc' },
        select: { actionType: true, details: true, actorId: true, targetType: true },
      });

    const answer = (door: 'p' | 'c', token: string, assignmentId: string, response: string) =>
      http(`/api/${door}/${token}/ack/${assignmentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response }),
      });

    // Three answers through each door: one audit row per response, all three actionTypes.
    for (const r of ['ACCEPTED', 'DECLINED', 'MAYBE']) {
      const res = await answer('p', ameliaToken!, aPavlova.assignment.id, r);
      assert(`her own ${r} through the participant door is accepted`, res.status === 200);
    }
    for (const r of ['ACCEPTED', 'DECLINED', 'MAYBE']) {
      const res = await answer('c', colinToken!, cAle.assignment.id, r);
      assert(`his own ${r} through the coordinator door is accepted`, res.status === 200);
    }
    const carriedRes = await answer('p', ameliaToken!, jCrackers.assignment.id, 'ACCEPTED');
    assert(
      "the carried answer through the participant door is accepted — GTC-191's reach, unchanged",
      carriedRes.status === 200
    );

    const pRows = await auditFor(aPavlova.assignment.id);
    const cRows = await auditFor(cAle.assignment.id);
    const carriedRows = await auditFor(jCrackers.assignment.id);

    // ── Layer D: the details line ────────────────────────────────────────
    section('Layer D: one form, through both doors, naming the item rather than its id');

    assert(
      'CONTROL: three audit rows landed through each door — the assertions below read rows ' +
        'that exist',
      pRows.length === 3 && cRows.length === 3 && carriedRows.length === 1
    );
    assert(
      "⚠ the participant door names the ITEM: every details line contains the item's name",
      pRows.length === 3 && pRows.every((r) => r.details.includes(aPavlova.item.name))
    );
    assert(
      '⚠ the participant door names NO id: no details line contains the item id or the ' +
        'assignment id',
      pRows.length === 3 &&
        pRows.every(
          (r) =>
            !r.details.includes(aPavlova.item.id) && !r.details.includes(aPavlova.assignment.id)
        )
    );
    assert(
      "the coordinator door names the ITEM: every details line contains the item's name",
      cRows.length === 3 && cRows.every((r) => r.details.includes(cAle.item.name))
    );
    assert(
      'the coordinator door names no id',
      cRows.length === 3 &&
        cRows.every(
          (r) => !r.details.includes(cAle.item.id) && !r.details.includes(cAle.assignment.id)
        )
    );

    // The comparison that is the whole ticket: the two doors, with the only legitimate
    // difference — the item's name — substituted out, must be the same string.
    const shapeOf = (details: string, itemName: string) => details.split(itemName).join('{item}');
    assert(
      '⚠ BOTH DOORS WRITE THE SAME FORM — with the item name substituted out, the ' +
        'participant and coordinator sentences are identical for all three responses',
      pRows.length === 3 &&
        cRows.length === 3 &&
        pRows.every(
          (p, i) =>
            shapeOf(p.details, aPavlova.item.name) === shapeOf(cRows[i].details, cAle.item.name)
        )
    );
    assert(
      "⚠ 'Maybe on' reads as a sentence — the MAYBE line is the verb followed by the item " +
        'name and nothing between them. This is the assertion that decided WHICH form ' +
        'survives: the verb was written for it',
      ok(
        () =>
          pRows[2].details === `Maybe on ${aPavlova.item.name}` &&
          cRows[2].details === `Maybe on ${cAle.item.name}`
      )
    );

    // ── Layer B: the carried line ────────────────────────────────────────
    section("Layer B: GTC-191's carried line survives, and appears only where it is true");

    assert(
      '⚠ a carried answer still names the child — the one fact worth keeping about a ' +
        'carried answer is on whose behalf it was given (GTC-191)',
      ok(() => carriedRows[0].details.includes(`on behalf of ${james.name}`))
    );
    assert(
      "a carried answer names the child's ITEM, not its id",
      ok(
        () =>
          carriedRows[0].details.includes(jCrackers.item.name) &&
          !carriedRows[0].details.includes(jCrackers.item.id)
      )
    );
    assert(
      'her own answers carry no "on behalf of" — the phrase appears only where a carried ' +
        'answer was given',
      pRows.length === 3 && pRows.every((r) => !r.details.includes('on behalf of'))
    );
    assert(
      'his own answers carry no "on behalf of"',
      cRows.length === 3 && cRows.every((r) => !r.details.includes('on behalf of'))
    );
    assert(
      '⚠ the carried row still names BOTH people: actorId is the carrier, targetId is the ' +
        "child's Assignment (GTC-191, unchanged by the extraction)",
      ok(() => carriedRows[0].actorId === amelia.id) &&
        carriedRows.length === 1 &&
        carriedRows[0].targetType === 'Assignment'
    );

    // ── Layer A: the action vocabulary ───────────────────────────────────
    section('Layer A: the three actionTypes are unchanged, through both doors');

    const EXPECTED = ['ACCEPT_ASSIGNMENT', 'DECLINE_ASSIGNMENT', 'MAYBE_ASSIGNMENT'];
    assert(
      'the participant door writes ACCEPT / DECLINE / MAYBE_ASSIGNMENT in that order',
      JSON.stringify(pRows.map((r) => r.actionType)) === JSON.stringify(EXPECTED)
    );
    assert(
      '⚠ the coordinator door writes the SAME three — GTC-320 Unknown 1 (whether a ' +
        "coordinator's own answer should be distinguishable in the ledger) is a product " +
        'question and is NOT answered by this extraction',
      JSON.stringify(cRows.map((r) => r.actionType)) === JSON.stringify(EXPECTED)
    );
    assert(
      'targetType is Assignment through both doors',
      pRows.every((r) => r.targetType === 'Assignment') &&
        cRows.every((r) => r.targetType === 'Assignment')
    );

    // ── Layer I: idempotence, unchanged ──────────────────────────────────
    section('Layer I: an unchanged response still writes nothing, through both doors');

    const beforeP = (await auditFor(aPavlova.assignment.id)).length;
    const againP = await answer('p', ameliaToken!, aPavlova.assignment.id, 'MAYBE');
    assert(
      'the participant door answers 200 to an unchanged response and writes no second row',
      againP.status === 200 && (await auditFor(aPavlova.assignment.id)).length === beforeP
    );
    const beforeC = (await auditFor(cAle.assignment.id)).length;
    const againC = await answer('c', colinToken!, cAle.assignment.id, 'MAYBE');
    assert(
      'the coordinator door answers 200 to an unchanged response and writes no second row',
      againC.status === 200 && (await auditFor(cAle.assignment.id)).length === beforeC
    );
  } finally {
    for (const eventId of createdEventIds) {
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
