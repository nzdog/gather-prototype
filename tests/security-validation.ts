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
    const res = await coordinatorAssign(f.eventSent);
    logTest(
      'Post-send assignment succeeds (replaces: "requireNotFrozen blocks FROZEN")',
      res.status === 200,
      res.status === 200 ? undefined : `Got ${res.status}: ${JSON.stringify(res.json)}`
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
    const src = readRoute(rel);
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
  const hostAssign = readRoute('src/app/api/events/[id]/items/[itemId]/assign/route.ts');
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
  logSection('Test Suite 7: No undo post-send (the one ADDED restriction)');

  // The guard lives in restoreFromRevision() itself, not in the route: no-undo is a
  // domain invariant, so it must hold for EVERY caller, not just the one HTTP path.
  // Testing the function directly also keeps this assertion honest — the route is
  // session-authed, and a 4xx from a missing cookie would look like a pass.

  const sentRevision = await createRevision(f.eventSent.id, f.host.id, 'security suite');
  let refused = false;
  let refusalMessage = '';
  try {
    await restoreFromRevision(f.eventSent.id, sentRevision, f.host.id);
  } catch (error: any) {
    refused = true;
    refusalMessage = error.message;
  }
  logTest(
    'restoreFromRevision is refused on a sent event (Hinge §2: no undo at the mechanism level)',
    refused,
    refused ? undefined : 'Restore succeeded on a sent event — undo is reachable'
  );
  logTest(
    'and it is refused for the RIGHT reason (not an incidental error)',
    /sent|undo|restore/i.test(refusalMessage),
    `Message was: ${refusalMessage || '(none — it did not throw)'}`
  );

  // Pre-send, restore is still a legitimate tool. Round-trip the DRAFT event through
  // its own snapshot so the fixture is left exactly as it was found.
  const draftRevision = await createRevision(f.eventDraft.id, f.host.id, 'security suite');
  let preSendWorked = true;
  try {
    await restoreFromRevision(f.eventDraft.id, draftRevision, f.host.id);
  } catch {
    preSendWorked = false;
  }
  logTest('restoreFromRevision still works pre-send (the restriction is scoped)', preSendWorked);

  const restoreSrc = readRoute('src/app/api/events/[id]/revisions/[revisionId]/restore/route.ts');
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
    const onPastEvent = [...candidates.eligible24h, ...candidates.eligible48h].filter(
      (c) => c.eventId === f.eventPast.id
    );
    logTest(
      'No nudge candidates on a past-dated event (§10.1: nudges must never fire after)',
      onPastEvent.length === 0,
      onPastEvent.length === 0 ? undefined : `${onPastEvent.length} candidate(s) would be nudged`
    );
  } catch (error: any) {
    logTest('No nudge candidates on a past-dated event', false, error.message);
  }

  // Structural on purpose: exercising the send path would send real messages.
  for (const rel of [
    'src/lib/sms/nudge-eligibility.ts',
    'src/lib/sms/proxy-nudge-eligibility.ts',
  ]) {
    const src = readRoute(rel);
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
