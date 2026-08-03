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
    const all = [...candidates.eligible24h, ...candidates.eligible48h];
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
