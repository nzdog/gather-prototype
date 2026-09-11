/**
 * Security Validation Test Suite
 *
 * The security contract for the API surface. Preflight gate: `npm run test:security`.
 *
 * REWRITTEN BY GTC-169 (A3a) UNDER EXPLICIT ZONE-6 APPROVAL (Nigel, 2026-08-03):
 * "APPROVED to rewrite — replace, never delete. The new assertions must hold the
 * send-lock contract at equal strength."
 *
 * What changed and why: the send-lock model (GTC-167) removes FROZEN as a mutation
 * gate. The old suite asserted that FROZEN BLOCKS mutations — a contract the specs
 * superseded (Moment 4 §7: "the fact is welcome; the challenge is forbidden"). Those
 * assertions are not wrong; they are obsolete. Every one is REPLACED by an assertion
 * of the new contract, and the replacements are stronger than what they replace:
 *
 *   OLD: six fs.readFileSync + substring checks — "does the string requireNotFrozen
 *        appear in this file?" Structural, and blind to whether the route works.
 *   NEW: real route handlers invoked in-process against real fixtures, asserting
 *        actual HTTP status codes. Behavioural.
 *
 * Auth and token-scope validation is untouched at full strength and, where it was
 * previously only grepped for, is now exercised behaviourally as well.
 *
 * Run with: npx tsx tests/security-validation.ts
 */

import { prisma } from '../src/lib/prisma';
import { requireEventRole, requireTokenScope } from '../src/lib/auth/guards';
import { isSent, isComplete, getEventPhase } from '../src/lib/lifecycle';
import { createRevision, restoreFromRevision } from '../src/lib/workflow';
import { findNudgeCandidates } from '../src/lib/sms/nudge-eligibility';
import { cleanup, generateFixtures, type Fixtures } from './security-fixtures';
import { NextRequest } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

function logTest(name: string, passed: boolean, message?: string) {
  testsRun++;
  if (passed) {
    testsPassed++;
    console.log(`${GREEN}✓${RESET} ${name}`);
  } else {
    testsFailed++;
    console.log(`${RED}✗${RESET} ${name}`);
    if (message) console.log(`  ${RED}Error: ${message}${RESET}`);
  }
}

function logSection(title: string) {
  console.log(`\n${BOLD}${YELLOW}${title}${RESET}`);
}

function isErrorResponse(result: any): boolean {
  return result && typeof result === 'object' && 'status' in result;
}

function readRoute(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

/**
 * Source with comments removed.
 *
 * Residue assertions are about CODE, not prose. Deleted guards leave tombstone
 * comments behind on purpose — explaining why requireNotFrozen is gone is exactly how
 * it stays gone — and a naive substring scan would read those as the guard itself.
 */
function readCode(rel: string): string {
  return readRoute(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

// ─────────────────────────────────────────────────────────────────────────────
// In-process route invocation
//
// Token routes take their token from params and authenticate purely via
// resolveToken() — no cookies, no middleware — so the handlers are directly
// callable. This is what lets route protection be asserted behaviourally.
// ─────────────────────────────────────────────────────────────────────────────

async function callRoute(
  modulePath: string,
  method: 'POST' | 'PATCH' | 'DELETE' | 'GET',
  url: string,
  params: Record<string, string>,
  body?: unknown
): Promise<{ status: number; json: any }> {
  const mod = await import(modulePath);
  const handler = mod[method];
  if (typeof handler !== 'function') throw new Error(`${modulePath} has no ${method} export`);

  const req = new NextRequest(`http://localhost:3000${url}`, {
    method,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }
      : {}),
  });

  const res = await handler(req, { params: Promise.resolve(params) });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* some responses have no body */
  }
  return { status: res.status, json };
}

const COORD_ASSIGN = '../src/app/api/c/[token]/items/[itemId]/assign/route';
const COORD_ITEM = '../src/app/api/c/[token]/items/[itemId]/route';
const PARTICIPANT_ACK = '../src/app/api/p/[token]/ack/[assignmentId]/route';

/** Assign team A's unassigned item to team A's participant, through the coordinator. */
function coordinatorAssign(ev: Fixtures['eventSent']) {
  return callRoute(
    COORD_ASSIGN,
    'POST',
    `/api/c/${ev.teamA.coordinator.token}/items/${ev.teamA.items[1].id}/assign`,
    { token: ev.teamA.coordinator.token, itemId: ev.teamA.items[1].id },
    { personId: ev.teamA.participant.personId }
  );
}

/** Edit the claimed item's name, through the coordinator. */
function coordinatorEdit(ev: Fixtures['eventSent'], name: string) {
  return callRoute(
    COORD_ITEM,
    'PATCH',
    `/api/c/${ev.teamA.coordinator.token}/items/${ev.teamA.items[0].id}`,
    { token: ev.teamA.coordinator.token, itemId: ev.teamA.items[0].id },
    { name }
  );
}

// ─────────────────────────────────────────────────────────────────────────────

async function testSuite1_AuthGuards() {
  logSection('Test Suite 1: Auth Guard Functions');

  logTest('requireEventRole function exists', typeof requireEventRole === 'function');
  logTest('requireTokenScope function exists', typeof requireTokenScope === 'function');

  // Behavioural — stronger than the previous existence-only check.
  try {
    const result = await requireTokenScope('definitely-not-a-real-token', 'COORDINATOR');
    logTest(
      'requireTokenScope rejects an invalid token (401)',
      isErrorResponse(result) && (result as any).status === 401
    );
  } catch (error: any) {
    logTest('requireTokenScope rejects an invalid token (401)', false, error.message);
  }
}

async function testSuite2_DatabaseIntegrity() {
  logSection('Test Suite 2: Database Schema Integrity');

  try {
    await prisma.$connect();
    logTest('Database connection successful', true);
  } catch (error: any) {
    logTest('Database connection successful', false, error.message);
  }

  try {
    const eventRoleCount = await prisma.eventRole.count();
    logTest('EventRole model accessible', typeof eventRoleCount === 'number');
  } catch (error: any) {
    logTest('EventRole model accessible', false, error.message);
  }

  try {
    const tokenCount = await prisma.accessToken.count();
    logTest('AccessToken model accessible', typeof tokenCount === 'number');
  } catch (error: any) {
    logTest('AccessToken model accessible', false, error.message);
  }

  try {
    const events = await prisma.event.findMany({ take: 1 });
    logTest('Event model has status field', events.length === 0 || 'status' in events[0]);
  } catch (error: any) {
    logTest('Event model has status field', false, error.message);
  }
}

/**
 * The lifecycle predicates replace requireNotFrozen as the gate, so they inherit its
 * place in the suite.
 */
async function testSuite3_LifecyclePredicates(f: Fixtures) {
  logSection('Test Suite 3: Lifecycle Predicates (the gate that replaced requireNotFrozen)');

  const load = (id: string) =>
    prisma.event.findUniqueOrThrow({
      where: { id },
      select: { status: true, sentAt: true, endDate: true },
    });

  const draft = await load(f.eventDraft.id);
  const sent = await load(f.eventSent.id);
  const legacy = await load(f.eventSentLegacy.id);
  const past = await load(f.eventPast.id);

  logTest('DRAFT event is not sent', isSent(draft) === false);
  logTest('SENT event is sent', isSent(sent) === true);
  logTest(
    'LEGACY FROZEN event still reads as sent (compat shim — GTC-199 depends on this)',
    isSent(legacy) === true
  );
  logTest('PAST event is complete (derived from the calendar)', isComplete(past) === true);
  logTest('SENT event is not complete', isComplete(sent) === false);
  logTest('getEventPhase reports SENT', getEventPhase(sent) === 'SENT');
  logTest('getEventPhase reports COMPLETE for a past event', getEventPhase(past) === 'COMPLETE');
}

/**
 * Token auth, exercised through real routes. Previously these were grep assertions;
 * they are now behavioural and cover cases the greps never could.
 */
async function testSuite4_TokenAuth(f: Fixtures) {
  logSection('Test Suite 4: Token Auth — Route Protection (behavioural)');

  const ev = f.eventSent;

  try {
    const res = await callRoute(
      COORD_ASSIGN,
      'POST',
      '/api/c/bogus/items/x/assign',
      { token: 'bogus-token-that-does-not-exist', itemId: ev.teamA.items[1].id },
      { personId: ev.teamA.participant.personId }
    );
    logTest('Coordinator route rejects an unknown token (403)', res.status === 403);
  } catch (error: any) {
    logTest('Coordinator route rejects an unknown token (403)', false, error.message);
  }

  try {
    // A PARTICIPANT token must not drive a COORDINATOR route.
    const res = await callRoute(
      COORD_ASSIGN,
      'POST',
      `/api/c/${ev.teamA.participant.token}/items/${ev.teamA.items[1].id}/assign`,
      { token: ev.teamA.participant.token, itemId: ev.teamA.items[1].id },
      { personId: ev.teamA.participant.personId }
    );
    logTest('Coordinator route rejects a PARTICIPANT-scoped token (403)', res.status === 403);
  } catch (error: any) {
    logTest('Coordinator route rejects a PARTICIPANT-scoped token (403)', false, error.message);
  }

  try {
    // Team B's coordinator must not touch Team A's item — the team-scoping invariant.
    const res = await callRoute(
      COORD_ASSIGN,
      'POST',
      `/api/c/${ev.teamB.coordinator.token}/items/${ev.teamA.items[1].id}/assign`,
      { token: ev.teamB.coordinator.token, itemId: ev.teamA.items[1].id },
      { personId: ev.teamA.participant.personId }
    );
    logTest('Coordinator cannot mutate another team’s item (404, team-scoped)', res.status === 404);
  } catch (error: any) {
    logTest(
      'Coordinator cannot mutate another team’s item (404, team-scoped)',
      false,
      error.message
    );
  }

  try {
    const res = await callRoute(
      PARTICIPANT_ACK,
      'POST',
      `/api/p/${ev.teamA.coordinator.token}/ack/${ev.teamA.participant.assignmentId}`,
      { token: ev.teamA.coordinator.token, assignmentId: ev.teamA.participant.assignmentId },
      { response: 'ACCEPTED' }
    );
    logTest('Participant ack route rejects a COORDINATOR-scoped token (403)', res.status === 403);
  } catch (error: any) {
    logTest('Participant ack route rejects a COORDINATOR-scoped token (403)', false, error.message);
  }
}

/**
 * THE SEND-LOCK CONTRACT — the replacement for "requireNotFrozen blocks FROZEN".
 *
 * Moment 4 §7: the lock is a ledger, not a wall. Post-send the host may change
 * anything; nothing hard-blocks.
 */
async function testSuite5_SendLock(f: Fixtures) {
  logSection('Test Suite 5: The Send-Lock — post-send mutations are ALLOWED');

  try {
    const before = await prisma.auditEntry.count({ where: { eventId: f.eventSent.id } });
    const res = await coordinatorAssign(f.eventSent);
    logTest(
      'Post-send assignment succeeds (replaces: "requireNotFrozen blocks FROZEN")',
      res.status === 200,
      res.status === 200 ? undefined : `Got ${res.status}: ${JSON.stringify(res.json)}`
    );

    // GTC-196 (A3b): the OTHER half of the A1 plan's §12.1 replacement, deferred out
    // of A3a by decision because recordChange was uncalled there by design. The
    // send-lock is "allowed AND recorded" — asserting only the first half would let
    // the second silently regress.
    // Versioned rows only: logAudit lifecycle rows carry a NULL sequence and Postgres
    // sorts those FIRST on DESC.
    const entries = await prisma.auditEntry.findMany({
      where: { eventId: f.eventSent.id, sequence: { not: null } },
      orderBy: { sequence: 'desc' },
      take: 1,
    });
    logTest(
      'Post-send assignment WRITES A LEDGER ENTRY',
      entries.length > 0 &&
        (await prisma.auditEntry.count({ where: { eventId: f.eventSent.id } })) > before
    );
    const latest = entries[0];
    logTest(
      'and the entry is a T1 reassignment owed a why',
      latest?.actionType === 'MOVE_ASSIGNMENT' || latest?.actionType === 'CREATE_ASSIGNMENT'
    );
    logTest('and it carries a version (sequence)', typeof latest?.sequence === 'number');
    logTest('and a changeSetId', typeof latest?.changeSetId === 'string');
    logTest(
      'and it records the actor by name at time of action',
      latest?.actorName !== null && latest?.actorKind === 'COORDINATOR'
    );
    logTest(
      'and reasonRequired fired for a touching-someone change',
      latest?.reasonRequired === true
    );
  } catch (error: any) {
    logTest('Post-send assignment succeeds', false, error.message);
  }

  try {
    const res = await coordinatorEdit(f.eventSent, 'Renamed post-send');
    logTest(
      'Post-send item edit succeeds',
      res.status === 200,
      res.status === 200 ? undefined : `Got ${res.status}: ${JSON.stringify(res.json)}`
    );
  } catch (error: any) {
    logTest('Post-send item edit succeeds', false, error.message);
  }

  try {
    const res = await coordinatorAssign(f.eventSentLegacy);
    logTest(
      'A LEGACY FROZEN event also allows mutation (the shim reads it as sent)',
      res.status === 200,
      res.status === 200 ? undefined : `Got ${res.status}: ${JSON.stringify(res.json)}`
    );
  } catch (error: any) {
    logTest('A LEGACY FROZEN event also allows mutation', false, error.message);
  }

  try {
    // Moment 4 §8.8: the day's corrections are captured on paper and resolved in the
    // system later. A past event must accept edits.
    const res = await coordinatorAssign(f.eventPast);
    logTest(
      'A PAST (complete) event still accepts mutations (§8.8 paper-then-system)',
      res.status === 200,
      res.status === 200 ? undefined : `Got ${res.status}: ${JSON.stringify(res.json)}`
    );
  } catch (error: any) {
    logTest('A PAST (complete) event still accepts mutations', false, error.message);
  }

  try {
    // The participant-side inversion: responding is what post-send is FOR.
    const res = await callRoute(
      PARTICIPANT_ACK,
      'POST',
      `/api/p/${f.eventSentLegacy.teamA.participant.token}/ack/${f.eventSentLegacy.teamA.participant.assignmentId}`,
      {
        token: f.eventSentLegacy.teamA.participant.token,
        assignmentId: f.eventSentLegacy.teamA.participant.assignmentId,
      },
      { response: 'ACCEPTED' }
    );
    logTest(
      'Guest can respond post-send (§7 "the plan being answered")',
      res.status === 200,
      res.status === 200 ? undefined : `Got ${res.status}: ${JSON.stringify(res.json)}`
    );
  } catch (error: any) {
    logTest('Guest can respond post-send', false, error.message);
  }

  // No lifecycle-derived hard block survives anywhere on the server.
  const gateResidue = [
    'src/lib/auth/guards.ts',
    'src/app/api/c/[token]/items/route.ts',
    'src/app/api/c/[token]/items/[itemId]/route.ts',
    'src/app/api/c/[token]/items/[itemId]/assign/route.ts',
    'src/app/api/events/[id]/items/[itemId]/assign/route.ts',
    'src/app/api/p/[token]/ack/[assignmentId]/route.ts',
  ].filter((rel) => {
    const src = readCode(rel);
    return src.includes('requireNotFrozen') || src.includes("=== 'FROZEN'");
  });
  logTest(
    'No lifecycle hard-block remains on any mutation route',
    gateResidue.length === 0,
    gateResidue.length === 0 ? undefined : `Still gated: ${gateResidue.join(', ')}`
  );
}

/**
 * THE COORDINATOR RULING (Nigel, 2026-08-03): "(a) — same always-allow + ledger as
 * the host. No walls anywhere, ledger is actor-agnostic."
 *
 * Asserted as phase-invariance: a coordinator's authority does not change when the
 * event is sent. That is the property the ruling states, and it is stronger than
 * comparing two auth surfaces.
 */
async function testSuite6_CoordinatorAuthority(f: Fixtures) {
  logSection('Test Suite 6: The Coordinator Ruling — no walls anywhere');

  const results: Array<{ phase: string; status: number }> = [];
  for (const [phase, ev] of [
    ['DRAFT', f.eventDraft],
    ['SENT', f.eventSent],
    ['SENT-LEGACY', f.eventSentLegacy],
    ['PAST', f.eventPast],
  ] as const) {
    const res = await coordinatorEdit(ev, `Edited in ${phase}`);
    results.push({ phase, status: res.status });
  }

  for (const r of results) {
    logTest(`Coordinator may edit in ${r.phase} (got ${r.status})`, r.status === 200);
  }
  logTest(
    'Coordinator authority is phase-invariant — identical outcome in all four phases',
    new Set(results.map((r) => r.status)).size === 1
  );

  // The host surface cannot be driven in-process (requireEventRole reads a session
  // cookie), so this one is structural by necessity — and named as such.
  const hostAssign = readCode('src/app/api/events/[id]/items/[itemId]/assign/route.ts');
  logTest(
    'Host assign route keeps requireEventRole (auth) and has no lifecycle gate [structural]',
    hostAssign.includes('requireEventRole') && !hostAssign.includes('requireNotFrozen')
  );
}

/**
 * The epic's ONE added restriction. Hinge §2 rules out undo at the mechanism level;
 * restoring a revision post-send is recall by another name.
 */
async function testSuite7_NoUndoPostSend(f: Fixtures) {
  logSection('Test Suite 7: Bulk restore — recorded, not refused');

  // The guard lives in restoreFromRevision() itself, not in the route: no-undo is a
  // domain invariant, so it must hold for EVERY caller, not just the one HTTP path.
  // Testing the function directly also keeps this assertion honest — the route is
  // session-authed, and a 4xx from a missing cookie would look like a pass.

  // GTC-196 (A3b) — THE CONVERSION. A3a refused this; the refusal was interim
  // scaffolding around the window where the gate was off but the recording was not yet
  // in. Post-send restore is the same species as post-send regeneration — ruled
  // allowed with checkpoint + ledger + why — so with recordChange wired it converts to
  // allowed-as-recorded-changeSet, and this assertion flips with it.
  const sentRevision = await createRevision(f.eventSent.id, f.host.id, 'security suite');
  const revisionsBefore = await prisma.planRevision.count({ where: { eventId: f.eventSent.id } });
  const entriesBefore = await prisma.auditEntry.count({ where: { eventId: f.eventSent.id } });

  let restoreError = '';
  try {
    await restoreFromRevision(f.eventSent.id, sentRevision, f.host.id, {
      reason: 'security suite — bulk restore',
    });
  } catch (error: any) {
    restoreError = error.message;
  }
  logTest(
    "restoreFromRevision is ALLOWED post-send (converted from A3a's interim refusal)",
    restoreError === '',
    restoreError || undefined
  );
  logTest(
    'and it took a checkpoint first — nothing is lost by moving forward',
    (await prisma.planRevision.count({ where: { eventId: f.eventSent.id } })) > revisionsBefore
  );
  const restoreEntry = await prisma.auditEntry.findFirst({
    where: { eventId: f.eventSent.id, sequence: { not: null } },
    orderBy: { sequence: 'desc' },
  });
  logTest(
    'and it landed as ONE recorded changeSet carrying the why',
    (await prisma.auditEntry.count({ where: { eventId: f.eventSent.id } })) > entriesBefore &&
      restoreEntry?.reason === 'security suite — bulk restore'
  );

  // Pre-send it is versioned and never interrogated. Round-trip the DRAFT event
  // through its own snapshot so the fixture is left exactly as it was found.
  const draftRevision = await createRevision(f.eventDraft.id, f.host.id, 'security suite');
  let preSendWorked = true;
  try {
    await restoreFromRevision(f.eventDraft.id, draftRevision, f.host.id);
  } catch {
    preSendWorked = false;
  }
  logTest('restoreFromRevision still works pre-send', preSendWorked);

  const restoreSrc = readCode('src/app/api/events/[id]/revisions/[revisionId]/restore/route.ts');
  logTest(
    'Restore route retains its auth guard [structural]',
    restoreSrc.includes('requireEventRole')
  );
}

/**
 * ZONE 7 (SMS opt-out) is a Do-Not-Touch zone. A3a inverts the event-status filter in
 * the eligibility queries and NOTHING else. These assertions prove both halves: the
 * inversion happened, and the opt-out machinery survived it verbatim.
 */
async function testSuite8_NudgePredicateAndOptOut(f: Fixtures) {
  logSection('Test Suite 8: Nudge predicate + zone-7 preservation');

  try {
    const candidates = await findNudgeCandidates();
    const all = [...candidates.eligibleFirst, ...candidates.eligibleSecond];
    const onPastEvent = all.filter((c) => c.eventId === f.eventPast.id);
    const onSentEvent = all.filter((c) => c.eventId === f.eventSent.id);

    logTest(
      'No nudge candidates on a past-dated event (§10.1: nudges must never fire after)',
      onPastEvent.length === 0,
      onPastEvent.length === 0 ? undefined : `${onPastEvent.length} candidate(s) would be nudged`
    );

    // GTC-202 (A3c-2): THE OTHER HALF OF THE METRIC.
    //
    // Plan §10.2 requires the predicate verified in BOTH directions, and GTC-169's
    // acceptance says so in as many words. Only the negative was asserted — and it
    // would have passed against the OLD `status: 'CONFIRMING'` filter too, because no
    // fixture person on a live sent event had a phone or an anchor.
    //
    // This is the inversion itself: under the old predicate a sent event stopped
    // producing candidates the moment it was frozen; under the send-lock model the send
    // is when the chasing STARTS (plan §0.2). The fixture person here is identical in
    // every respect to the past-event one except which event they are in.
    logTest(
      'A sent, live event YIELDS nudge candidates (§0.2: the send starts the chasing)',
      onSentEvent.length > 0,
      onSentEvent.length > 0
        ? undefined
        : 'the sent+live event produced no candidates — the predicate is not inverted, or the fixture is not eligible'
    );
    logTest(
      'and the two differ only in phase — same person shape, opposite outcome',
      onSentEvent.some((c) => c.personId === f.liveNudgeCandidate.personId) &&
        !onPastEvent.some((c) => c.personId === f.nudgeCandidate.personId)
    );
  } catch (error: any) {
    logTest('Nudge predicate verified in both directions', false, error.message);
  }

  // Structural on purpose: exercising the send path would send real messages.
  for (const rel of [
    'src/lib/sms/nudge-eligibility.ts',
    'src/lib/sms/proxy-nudge-eligibility.ts',
  ]) {
    const src = readCode(rel);
    const hasOptOut = src.includes('isOptedOut');
    const hasPhoneValidation = src.includes('isValidNZNumber');
    logTest(
      `${path.basename(rel)} still enforces opt-out and phone validation [structural, zone 7]`,
      hasOptOut && hasPhoneValidation,
      hasOptOut && hasPhoneValidation
        ? undefined
        : `Missing: ${!hasOptOut ? 'isOptedOut' : ''} ${!hasPhoneValidation ? 'isValidNZNumber' : ''}`
    );
  }

  const optOutRespected = await prisma.person.count({ where: { smsOptedOut: true } });
  logTest('Person.smsOptedOut column intact [zone 7]', typeof optOutRespected === 'number');
}

/**
 * THE REPO-WIDE FROZEN RESIDUE GATE (GTC-198 / A3d).
 *
 * Epic A's completeness proof, enforced rather than eyeballed. FROZEN survives as an
 * enum value until GTC-199 (A4) drops it, so a bare grep can never be zero — this
 * asserts that every surviving reference is in one of the categories the epic
 * deliberately left behind, and NOTHING else:
 *
 *   1. lifecycle.ts — the compat shim, the one place the legacy value is interpreted
 *   2. legacy enum KEYS — status→label/style maps and type unions, whose keys must
 *      match the Prisma enum until A4 changes it
 *   3. comments — tombstones explaining why the ceremony is gone
 *
 * A new behavioural branch on FROZEN fails here. That is the point: it is how the
 * ceremony stays gone.
 */
/**
 * Is this line one of the deliberate leftovers (category 2), rather than a behavioural
 * dependency on FROZEN?
 *
 * GTC-202 (A3c-2) NARROWED THIS AND MADE IT TESTABLE. The old stage-key exemption was
 * `/status:\s*'FROZEN'/`, which also matched `where: { status: 'FROZEN' }` — a real
 * Prisma filter, and precisely the kind of behavioural dependency this gate exists to
 * catch, waved through as if it were a display key. A gate with a hole shaped like the
 * thing it guards against is worse than no gate: it reads as proof.
 *
 * A stage key is `status: 'FROZEN'` alone on its line — an object-literal property in a
 * stages or labels array. A query has it embedded in a larger expression. Anything
 * ambiguous is an OFFENDER: the gate's default must be to flag, not to excuse.
 *
 * Extracted so the classifier itself can be asserted against known-bad lines rather
 * than only against the current repo, which is the only way a gate can be shown to
 * still work after the code it guards has been cleaned.
 */
function isExemptFrozenLine(line: string): boolean {
  const isMapKey = /^\s*(\|\s*)?'?FROZEN'?\s*[:,]/.test(line);
  const isUnionMember = /'FROZEN'\s*\|/.test(line) || /\|\s*'FROZEN'/.test(line);
  const isStageKey = /^\s*status:\s*'FROZEN',?\s*$/.test(line);
  return isMapKey || isUnionMember || isStageKey;
}

function frozenResidue(): string[] {
  const roots = ['src/app', 'src/lib', 'src/components'];
  const offenders: string[] = [];

  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry.name)) continue;

      const rel = path.relative(path.join(__dirname, '..'), full);
      if (rel.endsWith('src/lib/lifecycle.ts')) continue; // (1) the compat shim

      const code = readCode(rel); // (3) comments stripped
      code.split('\n').forEach((line, i) => {
        if (!line.includes('FROZEN')) return;

        if (isExemptFrozenLine(line)) return;

        offenders.push(`${rel}:${i + 1}: ${line.trim().slice(0, 90)}`);
      });
    }
  };

  for (const root of roots) walk(path.join(__dirname, '..', root));
  return offenders;
}

async function testSuite9_FrozenResidue() {
  logSection('Test Suite 9: Repo-wide FROZEN residue gate');

  const offenders = frozenResidue();
  logTest(
    'No behavioural FROZEN branch survives outside the compat shim',
    offenders.length === 0,
    offenders.length === 0 ? undefined : `\n    ${offenders.join('\n    ')}`
  );

  // The shim itself must still be there — removing it early would break legacy reads.
  const shim = readCode('src/lib/lifecycle.ts');
  logTest(
    'lifecycle.ts still carries the compat shim (GTC-199 removes it, not before)',
    shim.includes("status === 'FROZEN'")
  );

  // GTC-202 (A3c-2): THE GATE'S OWN GATE.
  //
  // The residue check passing tells you nothing about whether it still WORKS once the
  // repo is clean — a broken classifier and a clean repo produce the same green. So the
  // classifier is asserted directly, against lines it must catch and lines it must not.
  //
  // The first case is the hole this ticket closed: a literal Prisma filter on FROZEN
  // used to be exempted as a "stage key".
  const mustFlag = [
    "    where: { status: 'FROZEN' },",
    "  const frozen = await prisma.event.findMany({ where: { status: 'FROZEN' } });",
    "  if (event.status === 'FROZEN') return true;",
    "  return event.status !== 'FROZEN';",
  ];
  const mustAllow = [
    "  FROZEN: 'SENT',",
    '    FROZEN: [],',
    "  currentStatus?: 'DRAFT' | 'CONFIRMING' | 'FROZEN' | 'COMPLETE';",
    "    status: 'FROZEN',",
  ];
  const wronglyAllowed = mustFlag.filter((l) => isExemptFrozenLine(l));
  const wronglyFlagged = mustAllow.filter((l) => !isExemptFrozenLine(l));

  logTest(
    'The residue gate flags a real FROZEN query (the exemption hole GTC-202 closed)',
    wronglyAllowed.length === 0,
    wronglyAllowed.length === 0
      ? undefined
      : `wrongly exempt:\n    ${wronglyAllowed.join('\n    ')}`
  );
  logTest(
    'and still exempts the legacy enum keys the epic deliberately left behind',
    wronglyFlagged.length === 0,
    wronglyFlagged.length === 0
      ? undefined
      : `wrongly flagged:\n    ${wronglyFlagged.join('\n    ')}`
  );
}

/**
 * GTC-267 — the unguarded event reads.
 *
 * Nine GET handlers under /api/events/[id] answered 200 to a caller with no session,
 * and three more routes accepted a `hostId` query parameter as a credential — a
 * parameter the first of those nine published. An event id alone therefore reached
 * the HOST access token and every guest's email. This suite is where that contract
 * lives from now on.
 *
 * ── WHY THESE RUN OVER HTTP AND NOT IN-PROCESS ──────────────────────────────────
 *
 * `callRoute` above drives token routes directly because they authenticate from a
 * path param. These are SESSION routes: `requireEventRole` reads the cookie through
 * `getUser`, which needs a real request scope. Driving them in-process would assert
 * against a null session in both the allowed and the refused case and pass for the
 * wrong reason — so they are driven over HTTP against the dev server, exactly as
 * `tests/glance-replay-test.ts` drives its own session assertions.
 *
 * ── THE SERVER PROBE IS AN ASSERTION, NOT A SKIP ────────────────────────────────
 *
 * Fixture rule 5: a suite that cannot report its red is not a red. If the dev server
 * is down these tests cannot run, so the probe FAILS the suite rather than skipping
 * it quietly. A green run always means the routes were actually exercised.
 *
 * ── EVERY REFUSAL IS PAIRED WITH ITS OWN GRANT ──────────────────────────────────
 *
 * Fixture rule 4: a negative needs a positive control. "401 without a session" is
 * trivially true of a route that is broken, of a 500, and of a typo in the path. So
 * every one of the nine is asserted TWICE against the same URL in the same run —
 * refused cold, then 200 with the host's cookie. Only the pair means anything.
 */
async function testSuite10_EventReadAuth(fixtures: Fixtures) {
  logSection('Test Suite 10: GTC-267 — event reads require a session');

  const BASE = process.env.SECURITY_TEST_BASE_URL ?? 'http://localhost:3000';
  const ev = fixtures.eventSent;
  const HOST_COOKIE = { Cookie: fixtures.user.sessionCookie };

  // ── The probe ────────────────────────────────────────────────────────────────
  let probeOk = false;
  try {
    const probe = await fetch(`${BASE}/api/events/${ev.id}/people`);
    probeOk = probe.status === 401;
  } catch {
    probeOk = false;
  }
  logTest(
    `dev server healthy on ${BASE} — a guarded sibling answers 401, not 500 or ECONNREFUSED`,
    probeOk,
    'Start it with `npm run dev`. These assertions cannot run without it.'
  );
  if (!probeOk) return;

  // ── Real sub-resource rows, so the :id routes have something to answer with ───
  //
  // The revision is written by `createRevision` in `src/lib/workflow.ts` — the real
  // writer, per fixture rule 1.
  //
  // The Conflict row is written directly, and that is a DELIBERATE exception to rule
  // 1, recorded rather than skipped: conflicts are produced by the AI detection route,
  // which cannot be driven offline. The exception is safe here because nothing derives
  // from a Conflict row — no ledger entry, no status, no downstream predicate. The
  // assertion is "does this route answer without a session", for which the row is
  // inert scenery, so writing it directly cannot encode a wrong model of how it got
  // there.
  const revisionId = await createRevision(ev.id, fixtures.host.id, 'GTC-267 fixture');
  const conflict = await prisma.conflict.create({
    data: {
      eventId: ev.id,
      fingerprint: `gtc267-${ev.id}`,
      type: 'COVERAGE_GAP',
      severity: 'ADVISORY',
      claimType: 'RISK',
      resolutionClass: 'INFORMATIONAL',
      title: 'GTC-267 fixture conflict',
      description: 'Exists so the per-conflict read has something to refuse.',
    },
  });

  const NINE: Array<{ label: string; path: string }> = [
    { label: 'GET /api/events/:id', path: `/api/events/${ev.id}` },
    { label: 'GET /api/events/:id/summary', path: `/api/events/${ev.id}/summary` },
    { label: 'GET /api/events/:id/items', path: `/api/events/${ev.id}/items` },
    { label: 'GET /api/events/:id/days', path: `/api/events/${ev.id}/days` },
    { label: 'GET /api/events/:id/conflicts', path: `/api/events/${ev.id}/conflicts` },
    {
      label: 'GET /api/events/:id/conflicts/dismissed',
      path: `/api/events/${ev.id}/conflicts/dismissed`,
    },
    {
      label: 'GET /api/events/:id/conflicts/:conflictId',
      path: `/api/events/${ev.id}/conflicts/${conflict.id}`,
    },
    { label: 'GET /api/events/:id/revisions', path: `/api/events/${ev.id}/revisions` },
    {
      label: 'GET /api/events/:id/revisions/:revisionId',
      path: `/api/events/${ev.id}/revisions/${revisionId}`,
    },
  ];

  for (const route of NINE) {
    const cold = await fetch(`${BASE}${route.path}`);
    logTest(
      `${route.label} — refused without a session (401/403)`,
      cold.status === 401 || cold.status === 403,
      `got ${cold.status}`
    );
  }

  for (const route of NINE) {
    const warm = await fetch(`${BASE}${route.path}`, { headers: HOST_COOKIE });
    logTest(`${route.label} — still 200 for the host`, warm.status === 200, `got ${warm.status}`);
  }

  // ── `hostId` is not a credential ─────────────────────────────────────────────
  //
  // This is the step that turned a read leak into a takeover: the hostId these three
  // accept is published by the first of the nine above.
  const hostIdParam = fixtures.host.id;

  const CRED_ROUTES: Array<{ label: string; path: string; method: 'GET' | 'POST' }> = [
    {
      label: 'GET /api/events/:id/tokens',
      path: `/api/events/${ev.id}/tokens?hostId=${hostIdParam}`,
      method: 'GET',
    },
    {
      label: 'GET /api/events/:id/invite-status',
      path: `/api/events/${ev.id}/invite-status?hostId=${hostIdParam}`,
      method: 'GET',
    },
    {
      label: 'POST /api/events/:id/people/batch-import',
      path: `/api/events/${ev.id}/people/batch-import?hostId=${hostIdParam}`,
      method: 'POST',
    },
  ];

  for (const route of CRED_ROUTES) {
    const res = await fetch(`${BASE}${route.path}`, {
      method: route.method,
      ...(route.method === 'POST'
        ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ people: [] }) }
        : {}),
    });
    logTest(
      `${route.label} — ?hostId= alone is refused (401/403)`,
      res.status === 401 || res.status === 403,
      `got ${res.status}`
    );
  }

  // The paired grant: the same three still work for a real host session.
  for (const route of CRED_ROUTES) {
    const res = await fetch(`${BASE}${route.path}`, {
      method: route.method,
      headers:
        route.method === 'POST'
          ? { ...HOST_COOKIE, 'Content-Type': 'application/json' }
          : HOST_COOKIE,
      ...(route.method === 'POST' ? { body: JSON.stringify({ people: [] }) } : {}),
    });
    // batch-import with an empty array reaches its own body check — a 400 proves the
    // auth gate was passed without writing anything.
    const ok = route.method === 'POST' ? res.status === 400 : res.status === 200;
    logTest(`${route.label} — still reachable by the host`, ok, `got ${res.status}`);
  }

  // ── The whole chain, asserted end to end ─────────────────────────────────────
  const chainStep1 = await fetch(`${BASE}/api/events/${ev.id}`);
  const chainDead = chainStep1.status !== 200;
  logTest(
    'the takeover chain is dead at step 1 — an event id yields no hostId',
    chainDead,
    `step 1 answered ${chainStep1.status} to an anonymous caller`
  );

  // ── The select: fields that must never be serialised ─────────────────────────
  //
  // Populated FIRST, so an absence in the response is a DROP and not a gap. The
  // shared link is written through its own route (`POST /api/events/[id]/shared-link`)
  // — the real writer, per rule 1.
  //
  // The billing and telemetry scalars are written directly, a second recorded
  // exception: their real writer is the Stripe webhook, which cannot be driven
  // without Stripe, and like the Conflict row they are inert — nothing reads them
  // back, nothing derives from them. What is under test is the serialiser, not how
  // the columns came to hold a value.
  const linkRes = await fetch(`${BASE}/api/events/${ev.id}/shared-link`, {
    method: 'POST',
    headers: HOST_COOKIE,
  });
  logTest(
    'fixture: the shared link was minted through its own route',
    linkRes.status === 200,
    `got ${linkRes.status}`
  );

  await prisma.event.update({
    where: { id: ev.id },
    data: {
      stripePaymentIntentId: 'pi_gtc267_fixture',
      paidAt: new Date(),
      amountPaid: 4900,
      checkPlanInvocations: 3,
      checkPlanBeforeGate: true,
      blindAccept: true,
      madeAnyEditBeforeCheckPlan: true,
      manualAdditionsCount: 7,
      hostReadinessConfidence: 'HIGH',
      transitionAttempts: 2,
    },
  });

  const populated = await prisma.event.findUnique({
    where: { id: ev.id },
    select: { sharedLinkToken: true, stripePaymentIntentId: true, amountPaid: true },
  });
  logTest(
    'fixture: the forbidden columns really are populated (so an absence is a drop)',
    Boolean(populated?.sharedLinkToken) &&
      populated?.stripePaymentIntentId === 'pi_gtc267_fixture' &&
      populated?.amountPaid === 4900
  );

  const FORBIDDEN = [
    'sharedLinkToken',
    'stripePaymentIntentId',
    'paidAt',
    'amountPaid',
    'checkPlanInvocations',
    'firstCheckPlanAt',
    'checkPlanBeforeGate',
    'transitionAttempts',
    'transitionedToConfirmingAt',
    'planSnapshotIdAtConfirming',
    'blindAccept',
    'madeAnyEditBeforeCheckPlan',
    'manualAdditionsCount',
    'hostReadinessConfidence',
    'complianceAtFreeze',
    'freezeReason',
  ];

  const getRes = await fetch(`${BASE}/api/events/${ev.id}`, { headers: HOST_COOKIE });
  const getText = await getRes.text();
  const getLeaks = FORBIDDEN.filter((f) => getText.includes(`"${f}"`));
  logTest(
    'GET /api/events/:id serialises none of the credential, billing or telemetry columns',
    getLeaks.length === 0,
    `leaked: ${getLeaks.join(', ')}`
  );

  // The host's email was included for nobody: no caller in the tree reads
  // `event.host` off this route.
  logTest(
    'GET /api/events/:id no longer serialises the host or co-host email',
    !getText.includes(fixtures.user.email),
    'the host email is still in the response body'
  );

  const patchRes = await fetch(`${BASE}/api/events/${ev.id}`, {
    method: 'PATCH',
    headers: { ...HOST_COOKIE, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: ev.name }),
  });
  const patchText = await patchRes.text();
  const patchLeaks = FORBIDDEN.filter((f) => patchText.includes(`"${f}"`));
  logTest(
    'PATCH /api/events/:id returns the same narrowed shape',
    patchRes.status === 200 && patchLeaks.length === 0,
    `status ${patchRes.status}; leaked: ${patchLeaks.join(', ')}`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite 11 — GTC-269: the credential POST /api/demo/session hands out
//
// The defect held closed here is NOT "the route has no credential". The route is
// DELIBERATELY reachable by anyone: GTC-015 (commit `f6e4b41`, 2026-03-08) removed
// its production gate on purpose, so that a stranger on the deployed site can click
// "Open Planning Dashboard" on `/demo`. Founder ruling, 2026-09-11: that product
// decision stands.
//
// What does not stand is a credential wider than the thing it is demoing. The route
// mints a `Session`, and a `Session` is a bearer credential for a whole `User` —
// `getUser` in `src/lib/auth/session.ts` resolves the cookie to a user with no event
// scoping whatsoever. Before this fix the route minted for the `User` linked to the
// demo `Person`, and THAT user's `EventRole` set grows on its own as the Person's
// hosting history grows: measured 2026-09-11, it held HOST on two events, one of
// them `GTC-133 Sub-commit (g) Test` with `isDemo: false`.
//
// ⚠ THE ROUTE SCANNER CANNOT BE THE EVIDENCE FOR THIS FIX, and that is deliberate,
// not a gap. After the fix `POST /api/demo/session` still carries no guard and no
// credential of any kind, so its verdict in `tests/security-route-scan-control.ts`
// is UNCHANGED and still true. The containment is not "who may call it" — it is
// "what the thing it hands back can reach". So this suite asserts the property
// itself, by ENUMERATING what the minted session reaches. It never counts
// `EventRole` rows: a row count is a statement about the fix's implementation, and
// the contract is about reach.
//
// Fixture rule 4 (a negative needs a positive control) applies throughout. The
// legitimate demo path is asserted to still work in the same run as every refusal,
// because a route that 409s on everything, or 500s, or was renamed, also "refuses".
// ─────────────────────────────────────────────────────────────────────────────

/** Read `session=` back out of a live response's Set-Cookie headers. */
function sessionCookieFrom(res: Response): string | null {
  const all =
    typeof (res.headers as any).getSetCookie === 'function'
      ? (res.headers as any).getSetCookie()
      : [res.headers.get('set-cookie') ?? ''];
  for (const raw of all as string[]) {
    const m = /(?:^|;\s*)session=([^;]*)/.exec(raw ?? '');
    if (m && m[1] && m[1].length > 0) return m[1];
  }
  return null;
}

async function testSuite11_DemoSessionScope(fixtures: Fixtures) {
  logSection('Test Suite 11: GTC-269 — the demo session reaches exactly one event');

  const BASE = process.env.SECURITY_TEST_BASE_URL ?? 'http://localhost:3000';

  // ── The probe, same shape as suite 10 ────────────────────────────────────────
  let probeOk = false;
  try {
    const probe = await fetch(`${BASE}/api/events/${fixtures.eventSent.id}/people`);
    probeOk = probe.status === 401;
  } catch {
    probeOk = false;
  }
  logTest(
    `dev server healthy on ${BASE} — a guarded sibling answers 401, not 500 or ECONNREFUSED`,
    probeOk,
    'Start it with `npm run dev`. These assertions cannot run without it.'
  );
  if (!probeOk) return;

  // ── The subject ──────────────────────────────────────────────────────────────
  //
  // Resolved by `isDemo: true`, NOT by name. The demo event's name has drifted
  // across six sites (GTC-272): `prisma/seed.ts` writes
  // "Henderson Family Christmas 2026" while the route looks for "...2025". Mirroring
  // the literal here would make this file a seventh site. `isDemo` is the column the
  // route is being fixed to filter on, so it is also the honest handle.
  const demoEvents = await prisma.event.findMany({
    where: { isDemo: true },
    select: { id: true, name: true },
  });
  logTest(
    'CONTROL: exactly one isDemo event exists, so these assertions have a subject',
    demoEvents.length === 1,
    `found ${demoEvents.length}: ${demoEvents.map((e) => `${e.id} ${e.name}`).join(' | ')}. ` +
      'Zero means the seed drift in GTC-272 has bitten — `prisma/seed.ts` writes a ' +
      '2026 name and the route looks for 2025. This is a loud failure on purpose: a ' +
      'silent skip here would be a suite that cannot report its red.'
  );
  if (demoEvents.length !== 1) return;
  const demoEventId = demoEvents[0].id;

  // Row accounting, per the ticket: asserted by counting rows, not by reading a
  // status code. Recorded before anything is driven.
  const sessionsBefore = await prisma.session.count();

  // ── 11.1 POSITIVE CONTROL: the demo path still works for a stranger ──────────
  const mintRes = await fetch(`${BASE}/api/demo/session`, { method: 'POST' });
  const mintBody = await mintRes.json().catch(() => null);
  const mintedToken = sessionCookieFrom(mintRes);

  logTest(
    'CONTROL: an anonymous caller still gets a demo session — GTC-015 stands',
    mintRes.status === 200 && mintedToken !== null && mintBody?.eventId === demoEventId,
    `status ${mintRes.status}; cookie ${mintedToken ? 'set' : 'ABSENT'}; ` +
      `eventId ${mintBody?.eventId} (expected ${demoEventId})`
  );

  // ── 11.2 THE CONTRACT: enumerate what that session reaches ───────────────────
  //
  // `GET /api/events` takes a bare session with no event role and returns every
  // event the user holds any role on. That is the enumeration: whatever it lists is
  // what `requireEventRole` will then admit the holder to.
  const mintedCookie = mintedToken ? `session=${mintedToken}` : 'session=';
  const listRes = await fetch(`${BASE}/api/events`, { headers: { Cookie: mintedCookie } });
  const listBody = await listRes.json().catch(() => null);
  const reached: Array<{ id: string; name: string; isDemo: boolean }> = (
    listBody?.events ?? []
  ).map((e: any) => ({ id: e.id, name: e.name, isDemo: e.isDemo }));

  logTest(
    'the minted session reaches EXACTLY ONE event, and it is the demo event',
    listRes.status === 200 && reached.length === 1 && reached[0].id === demoEventId,
    `status ${listRes.status}; reaches ${reached.length}: ` +
      reached.map((e) => `${e.id} "${e.name}" isDemo=${e.isDemo}`).join(' | ')
  );

  logTest(
    'every event the minted session reaches is a demo event',
    reached.length > 0 && reached.every((e) => e.isDemo === true),
    reached.map((e) => `${e.name} isDemo=${e.isDemo}`).join(' | ') || 'reached nothing'
  );

  // ── 11.3 The same session, aimed at a real event, is refused ─────────────────
  //
  // Paired with its positive control in the same second, on the same URL: the
  // fixture host's own cookie must still get 200 there. A 401 alone is also what a
  // broken route, a typo'd path and a 500 return.
  const crossRes = await fetch(`${BASE}/api/events/${fixtures.eventSent.id}`, {
    headers: { Cookie: mintedCookie },
  });
  const crossControl = await fetch(`${BASE}/api/events/${fixtures.eventSent.id}`, {
    headers: { Cookie: fixtures.user.sessionCookie },
  });
  logTest(
    'the minted session is refused on a non-demo event (401/403)',
    crossRes.status === 401 || crossRes.status === 403,
    `status ${crossRes.status} — expected 401 or 403`
  );
  logTest(
    'CONTROL: the real host still reaches that same event in the same run',
    crossControl.status === 200,
    `status ${crossControl.status} — if this is not 200 the refusal above proves nothing`
  );

  // ── 11.4 The credential is demo-shaped, not a standing one ───────────────────
  const mintedRow = mintedToken
    ? await prisma.session.findUnique({
        where: { token: mintedToken },
        select: { userId: true, expiresAt: true },
      })
    : null;
  const lifetimeMs = mintedRow ? mintedRow.expiresAt.getTime() - Date.now() : -1;
  const TWO_HOURS = 2 * 60 * 60 * 1000;
  logTest(
    'the minted session expires in hours, not the 30 days a real login gets',
    mintedRow !== null && lifetimeMs > 0 && lifetimeMs <= TWO_HOURS + 60_000,
    `lifetime ${Math.round(lifetimeMs / 60_000)} min — expected <= 120 min`
  );

  // ── 11.5 It does not clobber a session that is already there ─────────────────
  //
  // This is a live product bug in its own right, not hygiene: `/demo` is linked
  // unconditionally from the homepage, so a signed-in host was two clicks from
  // having their own `session` cookie silently replaced by the demo user's —
  // signed out of their own account and into the demo without being told.
  const sessionsBeforeClobber = await prisma.session.count();
  const clobberRes = await fetch(`${BASE}/api/demo/session`, {
    method: 'POST',
    headers: { Cookie: fixtures.user.sessionCookie },
  });
  const clobberCookie = sessionCookieFrom(clobberRes);
  const sessionsAfterClobber = await prisma.session.count();

  logTest(
    'a caller who already holds a session is refused, not silently re-credentialed',
    clobberRes.status === 409,
    `status ${clobberRes.status} — expected 409`
  );
  logTest(
    'the refused call sets no session cookie, so the existing one survives',
    clobberCookie === null,
    clobberCookie ? `Set-Cookie carried session=${clobberCookie.slice(0, 12)}…` : ''
  );
  logTest(
    'the refused call creates NO Session row — counted, not inferred from the status',
    sessionsAfterClobber === sessionsBeforeClobber,
    `${sessionsBeforeClobber} before, ${sessionsAfterClobber} after`
  );

  const hostStillValid = await fetch(`${BASE}/api/events/${fixtures.eventSent.id}`, {
    headers: { Cookie: fixtures.user.sessionCookie },
  });
  logTest(
    "CONTROL: the real host's session still works after the refused demo call",
    hostStillValid.status === 200,
    `status ${hostStillValid.status}`
  );

  // ── 11.6 The demo user is decoupled from the demo Person ─────────────────────
  //
  // This is the assertion that makes "exactly one event" durable rather than
  // momentarily true. The old route minted for `person.userId`, so the demo
  // credential inherited every event the demo Person ever hosted. A dedicated user
  // that is never linked to a Person cannot inherit anything.
  const demoEventRow = await prisma.event.findUnique({
    where: { id: demoEventId },
    select: { hostId: true },
  });
  const demoPerson = demoEventRow
    ? await prisma.person.findUnique({
        where: { id: demoEventRow.hostId },
        select: { userId: true },
      })
    : null;
  logTest(
    'the session belongs to a dedicated user, NOT the user linked to the demo Person',
    mintedRow !== null && demoPerson !== null && mintedRow.userId !== demoPerson.userId,
    `session user ${mintedRow?.userId}; demo Person's user ${demoPerson?.userId}`
  );

  // ── 11.7 THE MUTATION — prove the enumeration above actually catches a widening
  //
  // Founder instruction, 2026-09-11: "Mutate it: link the demo user to a second
  // event and prove the assertion catches it." A detector that has never fired is
  // not a detector. The link is made AFTER the session is minted, so the route's own
  // pruning cannot repair it before the enumeration runs.
  let mutationCaught = false;
  let mutationRestored = false;
  if (mintedRow) {
    await prisma.eventRole.create({
      data: { userId: mintedRow.userId, eventId: fixtures.eventSent.id, role: 'HOST' },
    });
    const widened = await fetch(`${BASE}/api/events`, { headers: { Cookie: mintedCookie } });
    const widenedBody = await widened.json().catch(() => null);
    const widenedCount = (widenedBody?.events ?? []).length;
    mutationCaught = widenedCount > 1;
    logTest(
      'MUTATION: linking the demo user to a second event IS caught by 11.2',
      mutationCaught,
      `after linking, the enumeration reports ${widenedCount} event(s) — if this is ` +
        'still 1, assertion 11.2 cannot see a widening and proves nothing'
    );

    // ── The prune, asserted rather than assumed ──────────────────────────────
    //
    // Added after mutation M5 (removing the route's `eventRole.deleteMany`) left
    // this suite fully green: the dedicated demo account has no stray roles to
    // prune, so nothing above could see the prune's absence. An unasserted line in
    // a security fix is a line that can be deleted by a future tidy-up without a
    // single test going red.
    //
    // With the widening still in place, a FRESH call must hand back a session that
    // reaches one event again — the route repairing the invariant, not merely
    // having been correct once. This is what makes "exactly one EventRole forever"
    // a property of the route rather than of today's data.
    const repairRes = await fetch(`${BASE}/api/demo/session`, { method: 'POST' });
    const repairToken = sessionCookieFrom(repairRes);
    const repairList = await fetch(`${BASE}/api/events`, {
      headers: { Cookie: `session=${repairToken ?? ''}` },
    });
    const repairBody = await repairList.json().catch(() => null);
    const repairCount = (repairBody?.events ?? []).length;
    logTest(
      'the route PRUNES a widening it finds — a fresh session still reaches one event',
      repairRes.status === 200 && repairCount === 1,
      `status ${repairRes.status}; the fresh session reaches ${repairCount} event(s) — ` +
        'the demo user was deliberately linked to a second event just before this ' +
        'call, so 2 means the route accepted an inherited role instead of revoking it'
    );
    if (repairToken) await prisma.session.deleteMany({ where: { token: repairToken } });

    await prisma.eventRole.deleteMany({
      where: { userId: mintedRow.userId, eventId: fixtures.eventSent.id },
    });
    const restored = await fetch(`${BASE}/api/events`, { headers: { Cookie: mintedCookie } });
    const restoredBody = await restored.json().catch(() => null);
    mutationRestored = (restoredBody?.events ?? []).length === 1;
    logTest(
      'MUTATION REVERTED: the enumeration is back to exactly one event',
      mutationRestored,
      `reports ${(restoredBody?.events ?? []).length} event(s) after the revert`
    );
  }

  // ── 11.8 The name lookup cannot resolve a real event ─────────────────────────
  //
  // ⚠ HONEST LABEL: this is a FORWARD REGRESSION GUARD, not a reproduced red. The
  // route resolves by `findFirst` with no `orderBy`, so which of two same-named rows
  // it returns is Postgres heap order — in practice the older row, which is the demo
  // one. A decoy therefore cannot be made to win deterministically, and claiming
  // this assertion as part of the RED would be claiming a proof that was never run.
  // What it does hold: once `isDemo: true` is on the lookup, no non-demo row can
  // ever be resolved, whatever the ordering.
  const decoyName = demoEvents[0].name;
  const decoyHost = await prisma.person.create({
    data: { name: 'GTC-269 decoy host', email: 'gtc269-decoy@example.com' },
  });
  const decoy = await prisma.event.create({
    data: {
      name: decoyName,
      startDate: new Date(),
      endDate: new Date(Date.now() + 3_600_000),
      status: 'DRAFT',
      isDemo: false,
      hostId: decoyHost.id,
    },
    select: { id: true },
  });
  const withDecoy = await fetch(`${BASE}/api/demo/session`, { method: 'POST' });
  const withDecoyBody = await withDecoy.json().catch(() => null);
  const decoyToken = sessionCookieFrom(withDecoy);
  logTest(
    'with a non-demo event of the SAME NAME present, the route still resolves the demo one',
    withDecoy.status === 200 && withDecoyBody?.eventId === demoEventId,
    `resolved ${withDecoyBody?.eventId}; decoy was ${decoy.id}; demo is ${demoEventId}`
  );

  // ── Teardown. Every row this suite wrote, removed in the same run. ───────────
  //
  // `clobberCookie` is deleted too, and that is not defensive padding: BEFORE the
  // fix the clobber call succeeds and mints a real 30-day session, so a RED run
  // writes a row the GREEN run never will. The first RED run of this suite leaked
  // exactly that row and it was deleted by hand; this line is why that cannot
  // happen twice.
  if (clobberCookie) await prisma.session.deleteMany({ where: { token: clobberCookie } });
  if (decoyToken) await prisma.session.deleteMany({ where: { token: decoyToken } });
  await prisma.event.delete({ where: { id: decoy.id } });
  await prisma.person.delete({ where: { id: decoyHost.id } });
  if (mintedToken) await prisma.session.deleteMany({ where: { token: mintedToken } });

  const sessionsAfter = await prisma.session.count();
  logTest(
    'teardown: every Session row this suite minted is gone',
    sessionsAfter === sessionsBefore,
    `${sessionsBefore} before the suite, ${sessionsAfter} after teardown`
  );
  console.log(
    `  ${YELLOW}row accounting: Session rows ${sessionsBefore} before → ${sessionsAfter} ` +
      `after; demo EventRole mutation created and deleted${RESET}`
  );
}

async function main() {
  console.log(`${BOLD}${YELLOW}=== Security Validation Test Suite ===${RESET}\n`);
  console.log('Contract under test:');
  console.log('1. Authentication and token scoping on every protected route');
  console.log('2. The send-lock: post-send mutations are ALLOWED, never hard-blocked');
  console.log('3. Zone-7 (SMS opt-out) machinery survives the nudge-predicate inversion\n');

  try {
    console.log(`${YELLOW}Rebuilding fixtures...${RESET}`);
    await cleanup();
    const fixtures = await generateFixtures();

    await testSuite1_AuthGuards();
    await testSuite2_DatabaseIntegrity();
    await testSuite3_LifecyclePredicates(fixtures);
    await testSuite4_TokenAuth(fixtures);
    await testSuite5_SendLock(fixtures);
    await testSuite6_CoordinatorAuthority(fixtures);
    await testSuite7_NoUndoPostSend(fixtures);
    await testSuite8_NudgePredicateAndOptOut(fixtures);
    await testSuite9_FrozenResidue();
    await testSuite10_EventReadAuth(fixtures);
    await testSuite11_DemoSessionScope(fixtures);

    console.log(`\n${BOLD}${YELLOW}=== Test Summary ===${RESET}`);
    console.log(`Total tests: ${testsRun}`);
    console.log(`${GREEN}Passed: ${testsPassed}${RESET}`);
    console.log(`${RED}Failed: ${testsFailed}${RESET}`);

    if (testsFailed === 0) {
      console.log(`\n${GREEN}${BOLD}✓ All security tests passed!${RESET}`);
      await prisma.$disconnect();
      process.exit(0);
    } else {
      console.log(`\n${RED}${BOLD}✗ Some security tests failed${RESET}`);
      await prisma.$disconnect();
      process.exit(1);
    }
  } catch (error: any) {
    console.error(`\n${RED}${BOLD}Fatal error:${RESET}`, error.message);
    console.error(error.stack);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();
