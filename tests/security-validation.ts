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
import { randomBytes } from 'crypto';

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

/**
 * Test Suite 12 — GTC-270: the cron guard fails closed on an unset secret.
 *
 * WHY THE HEADLINE PROPERTY IS ASSERTED IN-PROCESS AND NOT OVER HTTP.
 *
 * The property is "an UNSET `CRON_SECRET` admits nobody". All three route modules
 * read the secret at module scope — `const CRON_SECRET = process.env.CRON_SECRET`
 * at the top of each file, evaluated once when the module loads. A test process
 * cannot unset the environment of a server that is already running, and the dev
 * server on :3000 has the secret set from `.env.local`, so over HTTP this suite can
 * only ever observe the CONFIGURED quadrant.
 *
 * `isNudgeRunHealthy` in `src/lib/sms/nudge-scheduler.ts` records the same problem
 * and the same answer, for provider configuration rather than this one: "Pure, and
 * exported so both directions can be asserted without a database or a provider —
 * the live cron can only ever demonstrate one quadrant per process, because
 * provider configuration is captured at module scope." That is this problem, solved
 * once already in this tree.
 *
 * So the quadrants are split deliberately, and each part asserts what it alone can:
 *
 *   A  the predicate itself — pure, both directions, injected values, no I/O
 *   B  the six handlers with the secret DELETED BEFORE the module loads — the
 *      ticket's headline case, reproduced without restarting a server
 *   C  the live server, which HAS the secret, for the three states it can show
 *   D  the response body carries counts, never recipient names
 *   E  row accounting: no send happened, counted rather than assumed
 *
 * ⚠ B AND C DRIVE REAL SMS SENDER ROUTES, AND THE ORDERING IS THE SAFETY MECHANISM.
 * Every probe sits behind a canary on `/api/cron/wrap-up-dispatch` — the only one of
 * the three that can be SHOWN to send nothing on this database, because zero
 * undispatched `WrapUpLink` rows is asserted here rather than assumed. If the canary
 * is ADMITTED rather than refused, the guard is open, and the remaining probes are
 * not run at all: driving `/api/cron/nudges` through an open guard is the one thing
 * this ticket must never do to prove its own point. On a RED run the canary is
 * admitted, so RED drives wrap-up-dispatch and nothing else.
 */
async function testSuite12_CronSecretFailsClosed(_fixtures: Fixtures) {
  logSection('Test Suite 12: GTC-270 — the cron guard fails closed on an unset secret');

  const BASE = process.env.SECURITY_TEST_BASE_URL ?? 'http://localhost:3000';
  const inviteEventsBefore = await prisma.inviteEvent.count();

  // ── A. THE PREDICATE, PURE ──────────────────────────────────────────────────────
  //
  // This is the assertion the ticket exists for, and it is the only form of it that
  // is deterministic: no server, no database, no provider, no clock.
  let secretMod: {
    isCronSecretConfigured: (configured: string | undefined) => boolean;
    cronSecretAccepted: (
      configured: string | undefined,
      provided: string | null | undefined
    ) => boolean;
  } | null = null;
  try {
    secretMod = await import('../src/app/api/cron/cron-secret');
  } catch (e: any) {
    secretMod = null;
  }

  const predicate = (name: string, fn: () => boolean) => {
    if (!secretMod) {
      logTest(name, false, 'src/app/api/cron/cron-secret.ts does not exist or does not export it');
      return;
    }
    let ok = false;
    let err: string | undefined;
    try {
      ok = fn();
    } catch (e: any) {
      err = e.message;
    }
    logTest(name, ok, err);
  };

  predicate(
    'PREDICATE: an UNSET secret refuses a caller who supplies one — the whole ticket',
    () => secretMod!.cronSecretAccepted(undefined, 'anything-at-all') === false
  );
  predicate(
    'PREDICATE: an UNSET secret refuses a caller who supplies nothing',
    () => secretMod!.cronSecretAccepted(undefined, undefined) === false
  );
  predicate(
    'PREDICATE: an EMPTY secret is unset too, and refuses',
    () => secretMod!.cronSecretAccepted('', 'anything-at-all') === false
  );
  predicate(
    'PREDICATE: an EMPTY secret is not satisfied by an EMPTY credential ("" === "")',
    () => secretMod!.cronSecretAccepted('', '') === false
  );
  predicate(
    'PREDICATE: a SET secret refuses a wrong credential',
    () => secretMod!.cronSecretAccepted('s3cret-gtc270', 'wrong') === false
  );
  predicate(
    'PREDICATE: a SET secret refuses a missing credential',
    () => secretMod!.cronSecretAccepted('s3cret-gtc270', null) === false
  );
  predicate(
    'PREDICATE [POSITIVE CONTROL]: a SET secret ACCEPTS the right credential',
    () => secretMod!.cronSecretAccepted('s3cret-gtc270', 's3cret-gtc270') === true
  );
  predicate(
    'PREDICATE: isCronSecretConfigured(undefined) is false',
    () => secretMod!.isCronSecretConfigured(undefined) === false
  );
  predicate(
    'PREDICATE: isCronSecretConfigured("") is false',
    () => secretMod!.isCronSecretConfigured('') === false
  );
  predicate(
    'PREDICATE [POSITIVE CONTROL]: isCronSecretConfigured("s3cret") is true',
    () => secretMod!.isCronSecretConfigured('s3cret-gtc270') === true
  );

  // ── B. THE SIX HANDLERS, WITH THE SECRET UNSET AT MODULE LOAD ───────────────────
  //
  // `delete process.env.CRON_SECRET` runs BEFORE the first import of any route
  // module, so each module's own module-scope read sees undefined. That is the
  // deployment state the ticket is about, reproduced exactly, in-process.
  //
  // The module-scope capture is a wart in every other respect and it is the thing
  // that makes this assertion possible at all. Recorded because it looks accidental.
  const savedSecret = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;

  const pendingWrapUps = await prisma.wrapUpLink.count({ where: { dispatched: false } });
  logTest(
    'SAFETY PRECONDITION: zero undispatched WrapUpLink rows, so the canary route sends nothing even if admitted',
    pendingWrapUps === 0,
    `${pendingWrapUps} undispatched row(s) — do not run this suite until that is zero`
  );

  type Handler = (req: NextRequest) => Promise<Response>;
  const req = (path: string, method: 'GET' | 'POST') =>
    new NextRequest(`http://localhost:3000${path}`, { method });

  let canaryRefused = false;
  if (pendingWrapUps === 0) {
    try {
      const wrapMod = (await import('../src/app/api/cron/wrap-up-dispatch/route')) as {
        GET: Handler;
        POST: Handler;
      };
      const canary = await wrapMod.POST(req('/api/cron/wrap-up-dispatch', 'POST'));
      canaryRefused = canary.status === 401;
      logTest(
        'CANARY: POST /api/cron/wrap-up-dispatch with CRON_SECRET unset is REFUSED (401)',
        canaryRefused,
        `status ${canary.status} — the guard is open; the remaining five handlers were NOT driven`
      );
      // Logged in BOTH states, never conditionally skipped: an assertion that does
      // not exist when the suite is red is one the red run cannot report.
      if (canaryRefused) {
        const wrapGet = await wrapMod.GET(req('/api/cron/wrap-up-dispatch', 'GET'));
        logTest(
          'unset secret: GET /api/cron/wrap-up-dispatch is refused (401)',
          wrapGet.status === 401,
          `status ${wrapGet.status}`
        );
      } else {
        logTest(
          'unset secret: GET /api/cron/wrap-up-dispatch is refused (401)',
          false,
          'NOT DRIVEN — the canary was admitted, so the guard is open'
        );
      }
    } catch (e: any) {
      logTest(
        'CANARY: POST /api/cron/wrap-up-dispatch with CRON_SECRET unset is REFUSED (401)',
        false,
        e.message
      );
    }
  }

  const drivenBehindCanary: [string, string, 'GET' | 'POST'][] = [
    ['../src/app/api/cron/decide-by-followups/route', '/api/cron/decide-by-followups', 'GET'],
    ['../src/app/api/cron/decide-by-followups/route', '/api/cron/decide-by-followups', 'POST'],
    ['../src/app/api/cron/nudges/route', '/api/cron/nudges', 'GET'],
    ['../src/app/api/cron/nudges/route', '/api/cron/nudges', 'POST'],
  ];

  for (const [modPath, apiPath, method] of drivenBehindCanary) {
    const name = `unset secret: ${method} ${apiPath} is refused (401)`;
    if (!canaryRefused) {
      logTest(
        name,
        false,
        'NOT DRIVEN — the canary was admitted, so the guard is open and driving an SMS sender through it was refused'
      );
      continue;
    }
    try {
      const mod = (await import(modPath)) as { GET: Handler; POST: Handler };
      const res = await mod[method](req(apiPath, method));
      logTest(name, res.status === 401, `status ${res.status}`);
    } catch (e: any) {
      logTest(name, false, e.message);
    }
  }

  if (savedSecret !== undefined) process.env.CRON_SECRET = savedSecret;

  // ── C. THE LIVE SERVER, WHICH HAS THE SECRET ────────────────────────────────────
  //
  // The dev server loads `.env.local`; this process does not (tsx loads `.env`, and
  // Prisma loads it for us — see the migrate-status banner). So the credential for
  // the positive control is read from the same file the server read, by hand. It is
  // never logged.
  let serverSecret: string | undefined;
  try {
    const dotenv = await import('dotenv');
    const envLocal = path.join(__dirname, '..', '.env.local');
    if (fs.existsSync(envLocal)) {
      serverSecret = dotenv.parse(fs.readFileSync(envLocal)).CRON_SECRET;
    }
  } catch {
    serverSecret = undefined;
  }

  let liveProbeOk = false;
  try {
    const probe = await fetch(`${BASE}/api/cron/wrap-up-dispatch`, { method: 'POST' });
    liveProbeOk = probe.status === 401;
  } catch {
    liveProbeOk = false;
  }
  logTest(
    `LIVE CANARY: dev server on ${BASE} refuses an uncredentialed POST /api/cron/wrap-up-dispatch (401)`,
    liveProbeOk,
    'either the server is down, or its CRON_SECRET is unset and the guard is open — the live probes were NOT run'
  );

  const liveRefusals: [string, 'GET' | 'POST'][] = [
    ['/api/cron/wrap-up-dispatch', 'GET'],
    ['/api/cron/wrap-up-dispatch', 'POST'],
    ['/api/cron/decide-by-followups', 'GET'],
    ['/api/cron/decide-by-followups', 'POST'],
    ['/api/cron/nudges', 'GET'],
    ['/api/cron/nudges', 'POST'],
  ];

  for (const [apiPath, method] of liveRefusals) {
    const name = `live: ${method} ${apiPath} with a WRONG secret is refused (401)`;
    if (!liveProbeOk) {
      logTest(name, false, 'NOT DRIVEN — the live canary was admitted or the server is down');
      continue;
    }
    try {
      const res = await fetch(`${BASE}${apiPath}?secret=definitely-not-the-secret`, { method });
      logTest(name, res.status === 401, `status ${res.status}`);
    } catch (e: any) {
      logTest(name, false, e.message);
    }
  }

  // Both documented credential channels, asserted on the route that sends nothing.
  let queryChannelBody: any = null;
  if (liveProbeOk && serverSecret) {
    try {
      const res = await fetch(
        `${BASE}/api/cron/wrap-up-dispatch?secret=${encodeURIComponent(serverSecret)}`
      );
      queryChannelBody = await res.json();
      logTest(
        'live [POSITIVE CONTROL]: GET /api/cron/wrap-up-dispatch with the RIGHT secret in ?secret= answers 200',
        res.status === 200,
        `status ${res.status}`
      );
    } catch (e: any) {
      logTest('live [POSITIVE CONTROL]: ?secret= channel answers 200', false, e.message);
    }
    try {
      const res = await fetch(`${BASE}/api/cron/wrap-up-dispatch`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${serverSecret}` },
      });
      logTest(
        'live [POSITIVE CONTROL]: POST /api/cron/wrap-up-dispatch with the RIGHT secret in Authorization: Bearer answers 200',
        res.status === 200,
        `status ${res.status}`
      );
    } catch (e: any) {
      logTest('live [POSITIVE CONTROL]: Bearer channel answers 200', false, e.message);
    }
  } else {
    const why = !liveProbeOk
      ? 'the live canary was admitted or the server is down'
      : 'CRON_SECRET could not be read from .env.local, so the positive control cannot be constructed';
    logTest('live [POSITIVE CONTROL]: ?secret= channel answers 200', false, why);
    logTest('live [POSITIVE CONTROL]: Bearer channel answers 200', false, why);
  }

  // ── D. THE RESPONSE BODY CARRIES COUNTS, NEVER RECIPIENT NAMES ──────────────────
  //
  // Every scheduler builds a per-recipient `errors` array as `${personName}: ${err}`
  // and the routes used to spread it straight into a 200 body, so an anonymous caller
  // got a list of guest names for every failed send. The trigger half of this ticket
  // is bounded by send stamps and time gates; this half was bounded by nothing.
  let responseMod: {
    withoutRecipientNames: <T extends object>(
      result: T
    ) => Omit<T, 'errors'> & { errorCount: number };
  } | null = null;
  try {
    responseMod = await import('../src/app/api/cron/cron-response');
  } catch {
    responseMod = null;
  }

  const leak = (name: string, fn: () => boolean) => {
    if (!responseMod) {
      logTest(
        name,
        false,
        'src/app/api/cron/cron-response.ts does not exist or does not export it'
      );
      return;
    }
    let ok = false;
    let err: string | undefined;
    try {
      ok = fn();
    } catch (e: any) {
      err = e.message;
    }
    logTest(name, ok, err);
  };

  leak('LEAK: a recipient name in `errors` does not survive into the wire body', () => {
    const body = responseMod!.withoutRecipientNames({
      errors: ['Amelia Turner: SMS_DISABLED', 'Proxy Rob Whittaker: SEND_FAILED'],
      sent: 2,
    });
    return !JSON.stringify(body).includes('Amelia') && !JSON.stringify(body).includes('Whittaker');
  });
  leak('LEAK: the `errors` key itself is gone from the wire body', () => {
    const body: any = responseMod!.withoutRecipientNames({ errors: ['Amelia Turner: x'], sent: 1 });
    return !('errors' in body);
  });
  leak('LEAK: the count survives, so a monitor still sees that sends failed', () => {
    const body = responseMod!.withoutRecipientNames({ errors: ['a: x', 'b: y'], sent: 2 });
    return body.errorCount === 2;
  });
  leak('LEAK: a result with no `errors` field reports errorCount 0, not undefined', () => {
    const body = responseMod!.withoutRecipientNames({ sent: 0, failed: 0 } as any);
    return body.errorCount === 0;
  });
  leak('LEAK: the rest of the result is preserved unchanged', () => {
    const body: any = responseMod!.withoutRecipientNames({ errors: ['a: x'], sent: 7, total: 9 });
    return body.sent === 7 && body.total === 9;
  });

  logTest(
    'LEAK [live]: the 200 body from /api/cron/wrap-up-dispatch carries errorCount and no `errors` key',
    queryChannelBody !== null &&
      typeof queryChannelBody.errorCount === 'number' &&
      !('errors' in queryChannelBody),
    queryChannelBody === null
      ? 'the positive control did not run, so there is no body to inspect'
      : `body keys: ${Object.keys(queryChannelBody).join(', ')}`
  );

  // ⚠ THE SECOND LIVE BODY, AND WHY IT IS DECIDE-BY AND NOT NUDGES.
  //
  // Mutation M3 — `withoutRecipientNames` deleted from the decide-by route — produced
  // ZERO failures on the first attempt. The pure assertions above prove the helper
  // works; nothing proved that this route calls it. An unasserted line in a security
  // fix is a line a future tidy-up deletes with the suite still green, so it is closed
  // here rather than noted.
  //
  // GTC-270's own Reproduce section nominates this route for probing ("USE
  // decide-by-followups OR wrap-up-dispatch FOR THE PROBE, NOT nudges"). The sweep is
  // inert on this database and that is ASSERTED below, not assumed: the eligibility
  // query filters `person: { phoneNumber: { not: null } }` in SQL and re-checks it in
  // JS, so a candidate without a phone cannot reach `sendSms` by either door.
  //
  // /api/cron/nudges is NOT driven with a valid credential anywhere in this suite, by
  // founder instruction. Its copy of the redaction is held by the shared helper and by
  // the mutation log in docs/tickets/GTC-270.md, not by a live red.
  const decideByReachable = await prisma.assignment.count({
    where: {
      response: 'MAYBE',
      decideByFollowupSentAt: null,
      person: { phoneNumber: { not: null } },
    },
  });
  logTest(
    'SAFETY PRECONDITION: zero decide-by candidates with a reachable number, so the sweep sends nothing',
    decideByReachable === 0,
    `${decideByReachable} candidate(s) with a phone — do not drive this route until that is zero`
  );

  if (liveProbeOk && serverSecret && decideByReachable === 0) {
    try {
      const res = await fetch(
        `${BASE}/api/cron/decide-by-followups?secret=${encodeURIComponent(serverSecret)}`
      );
      const body = await res.json();
      logTest(
        'LEAK [live]: the 200 body from /api/cron/decide-by-followups carries errorCount and no `errors` key',
        res.status === 200 && typeof body.errorCount === 'number' && !('errors' in body),
        `status ${res.status}; body keys: ${Object.keys(body).join(', ')}`
      );
    } catch (e: any) {
      logTest(
        'LEAK [live]: the 200 body from /api/cron/decide-by-followups carries errorCount and no `errors` key',
        false,
        e.message
      );
    }
  } else {
    logTest(
      'LEAK [live]: the 200 body from /api/cron/decide-by-followups carries errorCount and no `errors` key',
      false,
      decideByReachable !== 0
        ? 'NOT DRIVEN — a decide-by candidate has a reachable number, so driving it could send'
        : 'NOT DRIVEN — the live canary was admitted, the server is down, or the secret was unreadable'
    );
  }

  // ── E. ROW ACCOUNTING — THE NO-SEND IS COUNTED, NOT TRUSTED ─────────────────────
  //
  // `logInviteEvent` in src/lib/invite-events.ts writes one InviteEvent row per send
  // ATTEMPT — success, failure and blocked alike. So an unchanged count is the proof
  // that nothing in this suite reached a provider, and it does not depend on the
  // fixture happening to have no reachable numbers.
  const inviteEventsAfter = await prisma.inviteEvent.count();
  logTest(
    'NO SEND: InviteEvent row count is unchanged across this suite',
    inviteEventsAfter === inviteEventsBefore,
    `${inviteEventsBefore} before → ${inviteEventsAfter} after; a send ATTEMPT of any kind writes one`
  );
  console.log(
    `  ${YELLOW}row accounting: InviteEvent ${inviteEventsBefore} before → ${inviteEventsAfter} after${RESET}`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite 13 — GTC-271: the LIST route serialises the same forbidden columns
//
// GTC-267 narrowed `GET` and `PATCH` on `/api/events/[id]` behind `EVENT_WIRE_SELECT`
// and asserted the narrowing in suite 10. It did not touch `GET /api/events`, which
// calls `prisma.event.findMany` with an `include` and no sibling top-level `select` —
// "all scalars, plus these relations". Every column suite 10 forbids is a scalar on
// `Event`, so the list route hands back all sixteen for EVERY event the caller holds
// a role on.
//
// This is NOT suite 10's anonymous class. The route calls `getUser` and filters on
// `eventRoles.some.userId`, so a caller only ever sees events they already hold a role
// on. What is under test is the WIDTH of the response, not who can reach it.
//
// `sharedLinkToken` is the one that matters: `CREDENTIAL_COLUMNS` in
// `tests/security-route-scan.ts` declares it a credential, and
// `POST /api/join/[token]/claim` authenticates on it. A `COORDINATOR` on the event
// gets it too — 13.4 asserts that case with its own caller rather than assuming the
// HOST result generalises.
//
// The forbidden columns are POPULATED before the read, so an absence in the response
// is a DROP and not a gap. That is suite 10's standard, and it caught a real gap there.
// ─────────────────────────────────────────────────────────────────────────────
async function testSuite13_EventListSelect(fixtures: Fixtures) {
  logSection('Test Suite 13: GTC-271 — the events LIST route narrows its wire shape');

  const BASE = process.env.SECURITY_TEST_BASE_URL ?? 'http://localhost:3000';
  const ev = fixtures.eventSent;
  const HOST_COOKIE = { Cookie: fixtures.user.sessionCookie };

  // ── The probe ────────────────────────────────────────────────────────────────
  let probeOk = false;
  try {
    const probe = await fetch(`${BASE}/api/events`);
    probeOk = probe.status === 401;
  } catch {
    probeOk = false;
  }
  logTest(
    `dev server healthy on ${BASE} — GET /api/events answers 401 with no cookie`,
    probeOk,
    'Start it with `npm run dev`. These assertions cannot run without it.'
  );
  if (!probeOk) return;

  // ── 13.1 FIXTURE: populate the forbidden columns FIRST ───────────────────────
  //
  // The shared link is minted through its own route (`POST /api/events/[id]/shared-link`)
  // — the real writer, per fixture rule 1. The billing and telemetry scalars are written
  // directly, the same recorded exception suite 10 takes: their real writer is the Stripe
  // webhook, which cannot be driven offline, and they are inert — nothing reads them back
  // and nothing derives from them. What is under test is the serialiser, not how the
  // columns came to hold a value.
  //
  // Written unconditionally rather than relying on suite 10 having run first: a suite
  // whose red depends on another suite's side effects is a suite that goes green when
  // someone reorders main().
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
      stripePaymentIntentId: 'pi_gtc271_fixture',
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
      populated?.stripePaymentIntentId === 'pi_gtc271_fixture' &&
      populated?.amountPaid === 4900,
    `sharedLinkToken ${populated?.sharedLinkToken ? 'set' : 'NULL'}; ` +
      `stripePaymentIntentId ${populated?.stripePaymentIntentId}; amountPaid ${populated?.amountPaid}`
  );

  // ── 13.2 THE CONTRACT: none of the sixteen leave over the wire ───────────────
  //
  // The same sixteen names suite 10 holds for the single-event route. Kept as its own
  // list on purpose: if the two ever diverge, that divergence should show up as a test
  // change and be argued, not inherited silently from a shared constant.
  const FORBIDDEN_LIST = [
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

  const listRes = await fetch(`${BASE}/api/events`, { headers: HOST_COOKIE });
  const listText = await listRes.text();
  const listBody = JSON.parse(listText);
  const listLeaks = FORBIDDEN_LIST.filter((f) => listText.includes(`"${f}"`));

  logTest(
    'GET /api/events serialises none of the credential, billing or telemetry columns',
    listRes.status === 200 && listLeaks.length === 0,
    `status ${listRes.status}; leaked ${listLeaks.length}/16: ${listLeaks.join(', ')}`
  );

  // The value itself, not just the key — a select that renamed the field would still
  // be handing out the credential.
  logTest(
    'GET /api/events does not carry the shared-link credential VALUE under any key',
    populated?.sharedLinkToken ? !listText.includes(populated.sharedLinkToken) : false,
    populated?.sharedLinkToken
      ? 'the minted sharedLinkToken string appears in the list response body'
      : 'fixture has no sharedLinkToken — this assertion proves nothing, fix 13.1 first'
  );

  // ── 13.3 POSITIVE CONTROL: the fields /plan/events renders are all still there ─
  //
  // Paired with 13.2 in the same run and on the same response. An empty response, a
  // 500, or a select that dropped half the page would also pass 13.2 — this is what
  // separates "narrowed" from "broken". The list is the `Event` interface in
  // `src/app/plan/events/page.tsx`, field for field, plus the three fields suite 11
  // reads off this same route.
  const rows: any[] = listBody?.events ?? [];
  const row = rows.find((e: any) => e.id === ev.id);
  logTest(
    'CONTROL: the host still gets their event back from the list',
    row !== undefined,
    `the list returned ${rows.length} event(s), none with id ${ev.id}`
  );

  if (row) {
    // `setup` is legitimately null on an event with no EventSetup row, so presence of
    // the KEY is what is asserted — that is what `event.setup ? … : …` in the page reads.
    const RENDERED = [
      'id',
      'name',
      'status',
      'startDate',
      'endDate',
      'guestCount',
      'occasionType',
      'archived',
      'createdAt',
      'setup',
    ];
    const missing = RENDERED.filter((k) => !(k in row));
    logTest(
      'CONTROL: every field /plan/events renders is present in the narrowed row',
      missing.length === 0,
      `missing: ${missing.join(', ')}`
    );

    logTest(
      'CONTROL: _count.teams survives — the page renders it as "N teams"',
      typeof row?._count?.teams === 'number',
      `_count is ${JSON.stringify(row?._count)}`
    );

    // Suite 11 (GTC-269) enumerates what a demo session reaches off THIS route and
    // reads `isDemo` off each row. Narrowing this select without `isDemo` would turn
    // that enumeration into a silent pass.
    logTest(
      'CONTROL: isDemo survives — suite 11 enumerates the demo blast radius with it',
      'isDemo' in row,
      'isDemo is absent; suite 11 would read undefined and its every() would be vacuous'
    );
  }

  // The page itself answers, not just its data source.
  const pageRes = await fetch(`${BASE}/plan/events`, { headers: HOST_COOKIE });
  logTest(
    'CONTROL: /plan/events still answers 200',
    pageRes.status === 200,
    `status ${pageRes.status}`
  );

  // ── 13.4 A COORDINATOR-only caller sees no join credential either ────────────
  //
  // The route filters on `eventRoles.some.userId` with NO role predicate, so a
  // COORDINATOR is admitted to the list on equal terms with the HOST. Asserted with its
  // own caller rather than inferred from 13.2: "the host does not get it" and "nobody
  // gets it" are different claims.
  const coordUser = await prisma.user.create({
    data: { email: `gtc271-coordinator-${Date.now()}@gather.test` },
  });
  const coordToken = randomBytes(32).toString('hex');
  await prisma.session.create({
    data: {
      token: coordToken,
      userId: coordUser.id,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  await prisma.eventRole.create({
    data: { userId: coordUser.id, eventId: ev.id, role: 'COORDINATOR' },
  });

  try {
    const coordRes = await fetch(`${BASE}/api/events`, {
      headers: { Cookie: `session=${coordToken}` },
    });
    const coordText = await coordRes.text();
    const coordBody = JSON.parse(coordText);
    const coordRows: any[] = coordBody?.events ?? [];

    logTest(
      'CONTROL: the COORDINATOR really does reach the event through this route',
      coordRes.status === 200 && coordRows.some((e: any) => e.id === ev.id),
      `status ${coordRes.status}; reached ${coordRows.length} event(s) — if this is 0 ` +
        'the refusal below proves nothing'
    );

    const coordLeaks = FORBIDDEN_LIST.filter((f) => coordText.includes(`"${f}"`));
    logTest(
      'a COORDINATOR-only caller gets none of the sixteen columns either',
      coordLeaks.length === 0,
      `leaked ${coordLeaks.length}/16: ${coordLeaks.join(', ')}`
    );
    logTest(
      'a COORDINATOR-only caller does not get the shared-link credential VALUE',
      populated?.sharedLinkToken ? !coordText.includes(populated.sharedLinkToken) : false,
      'the minted sharedLinkToken string appears in the coordinator list response'
    );
  } finally {
    // Row accounting: this suite leaves nothing behind. `cleanup()` keys off the
    // fixture host email and the fixture event names, neither of which matches this
    // user, so it would survive every future run if it were not removed here.
    await prisma.eventRole.deleteMany({ where: { userId: coordUser.id } });
    await prisma.session.deleteMany({ where: { userId: coordUser.id } });
    await prisma.user.deleteMany({ where: { id: coordUser.id } });
  }
}

async function testSuite14_PaymentIsNotIdentity() {
  logSection('Test Suite 14: GTC-280 — a paid receipt never returns a credential');

  const BASE = process.env.SECURITY_TEST_BASE_URL ?? 'http://localhost:3000';

  /*
   * THE CONTRACT: a payment may CREATE an event and ATTACH it to an address. It
   * may never, on its own, return a credential for an account.
   *
   * Before GTC-280, `POST /api/events` looked the Stripe address up in `User`
   * and — found or created — wrote a 30-day `Session` and set the `session`
   * cookie. Paying $12 with a known host's address returned a logged-in session
   * as that host.
   *
   * ⚠ THE END-TO-END PROOF IS NOT HERE, AND ITS ABSENCE IS NAMED RATHER THAN
   * PAPERED OVER. Driving the paid path needs a really-completed Checkout
   * Session, and Stripe has no API that fakes one. That proof lives in
   * `npm run test:gtc280-paid`, is run deliberately, and its output is recorded
   * in the ticket. What is asserted below is everything that does NOT need a
   * charge — which includes the invariant itself, because a cookie the route
   * cannot set on any path is a cookie it cannot set on the paid one either.
   */

  const readCode = (p: string) =>
    require('fs')
      .readFileSync(p, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

  const eventsRoute = readCode('src/app/api/events/route.ts');
  const verifyRoute = readCode('src/app/api/auth/verify/route.ts');

  logTest(
    'POST /api/events sets no session cookie on any path',
    !/\.set\(\s*[\'"`]session[\'"`]/.test(eventsRoute),
    'the route file contains a session cookie set'
  );
  logTest(
    'CONTROL: POST /api/auth/verify still does — the detector finds one where one exists',
    /\.set\(\s*[\'"`]session[\'"`]/.test(verifyRoute),
    'the detector matched nothing anywhere, so the assertion above proves nothing'
  );
  logTest(
    'POST /api/events creates no Session row either — the cookie is not the only way to hand one out',
    !/session\s*\.\s*create\s*\(/.test(eventsRoute),
    'the route file creates a Session'
  );
  logTest(
    'CONTROL: POST /api/auth/verify still creates one',
    /session\.create\(/.test(verifyRoute),
    'the detector matched nothing anywhere'
  );

  // ── Live ─────────────────────────────────────────────────────────────────────
  let probeOk = false;
  try {
    probeOk = (await fetch(`${BASE}/api/events`)).status === 401;
  } catch {
    probeOk = false;
  }
  logTest(
    `dev server healthy on ${BASE} — GET /api/events answers 401 with no cookie`,
    probeOk,
    'Start it with `npm run dev`. These assertions cannot run without it.'
  );
  if (!probeOk) return;

  const before = await prisma.session.count();

  const noReceipt = await fetch(`${BASE}/api/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  const badReceipt = await fetch(`${BASE}/api/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stripeSessionId: 'cs_test_gtc280_security_suite' }),
  });

  logTest(
    'a call with no receipt is refused 402, and the receipt is still the only gate — no 401 anywhere',
    noReceipt.status === 402,
    `got ${noReceipt.status}`
  );
  logTest(
    'a call with an unusable receipt is refused 400 before any write',
    badReceipt.status === 400,
    `got ${badReceipt.status}`
  );
  logTest(
    'neither refusal returned a session cookie',
    !(noReceipt.headers.get('set-cookie') ?? '').includes('session=') &&
      !(badReceipt.headers.get('set-cookie') ?? '').includes('session='),
    'a Set-Cookie carrying session= came back from a refused call'
  );
  logTest(
    'and neither created a Session row — counted before and after, not read off the status code',
    (await prisma.session.count()) === before,
    'the Session row count moved during two refused calls'
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
    await testSuite12_CronSecretFailsClosed(fixtures);
    await testSuite13_EventListSelect(fixtures);
    await testSuite14_PaymentIsNotIdentity();

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
