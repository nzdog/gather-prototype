/**
 * GTC-174 (D1) — Attendance derivation tests.
 *
 * Asserts the model ruled by Hinge §3 (gap #10) and §8:
 *
 *   - the tap IS the item ask; attendance is INFERRED from it
 *   - a yes to any item is a yes to coming ("nobody brings a dessert to a party
 *     they're skipping")
 *   - a no is ambiguous, so attendance stays UNKNOWN until the one conditional
 *     follow-up is answered
 *   - a maybe is purely an ITEM-maybe — it never answers attendance, and it never
 *     triggers an attendance question
 *   - attendance is never asked directly except on the no path and the itemless case
 *
 * Pure functions, no database. Patterned on tests/lifecycle-predicates-test.ts.
 */

import {
  deriveAttendance,
  isAttendanceAskable,
  parseAssignmentResponse,
  parseAttendanceBody,
  type Attendance,
  type StoredAttendanceAnswer,
} from '../src/lib/attendance';

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

/** Assignment stand-ins — the derivation only ever reads `response`. */
const accepted = { response: 'ACCEPTED' as const };
const declined = { response: 'DECLINED' as const };
const pending = { response: 'PENDING' as const };
const maybe = { response: 'MAYBE' as const };

const derive = (assignments: { response: string }[], answer: StoredAttendanceAnswer): Attendance =>
  deriveAttendance(assignments, answer);

console.log('\x1b[33m=== GTC-174 (D1): Attendance is derived, never stored ===\x1b[0m\n');

// ── Rule 5: never engaged ────────────────────────────────────────────────────
console.log('\x1b[33mSuite 1: PENDING — the guest has not engaged\x1b[0m');
assert('no assignments, never asked → PENDING', derive([], null) === 'PENDING');
assert('all items untouched → PENDING', derive([pending, pending], null) === 'PENDING');

// ── Rule 1: yes-to-the-pavlova is yes-to-coming ──────────────────────────────
console.log('\n\x1b[33mSuite 2: YES is inferred from the item tap (§3 axiom)\x1b[0m');
assert('one accepted item → YES', derive([accepted], null) === 'YES');
assert('accepted among declined → YES', derive([accepted, declined], null) === 'YES');
assert('accepted among pending → YES', derive([accepted, pending], null) === 'YES');
assert('accepted alongside a maybe → YES', derive([accepted, maybe], null) === 'YES');
assert(
  'attendance is never PENDING once an item is accepted',
  derive([accepted, pending, pending], null) === 'YES'
);

// ── Rule 4: the no path is ambiguous until answered ──────────────────────────
console.log('\n\x1b[33mSuite 3: a no leaves attendance UNKNOWN until the follow-up\x1b[0m');
assert('declined, follow-up unanswered → UNKNOWN', derive([declined], null) === 'UNKNOWN');
assert('all declined, unanswered → UNKNOWN', derive([declined, declined], null) === 'UNKNOWN');
assert(
  "UNKNOWN is not PENDING — the guest engaged, they just haven't said if they're coming",
  derive([declined], null) !== derive([pending], null)
);

// ── Rule 2: the stored answer, from the two moments that ask ─────────────────
console.log('\n\x1b[33mSuite 4: the follow-up and itemless answers are honoured\x1b[0m');
assert('declined + answered yes → YES', derive([declined], 'YES') === 'YES');
assert('declined + answered no → NO', derive([declined], 'NO') === 'NO');
assert('itemless + answered yes → YES (degenerate case)', derive([], 'YES') === 'YES');
assert('itemless + answered no → NO (degenerate case)', derive([], 'NO') === 'NO');

// ── Rule 3: a maybe is an ITEM maybe only (§8) ───────────────────────────────
console.log('\n\x1b[33mSuite 5: a maybe never answers attendance\x1b[0m');
assert('one maybe → UNKNOWN', derive([maybe], null) === 'UNKNOWN');
assert('maybe among pending → UNKNOWN', derive([maybe, pending], null) === 'UNKNOWN');
assert('maybe among declined → UNKNOWN', derive([maybe, declined], null) === 'UNKNOWN');
assert(
  'a maybe is never read as a yes — D2 owns resolving it',
  derive([maybe], null) !== 'YES' && derive([maybe, declined], null) !== 'YES'
);
assert(
  'a maybe is never read as a no either',
  derive([maybe], null) !== 'NO' && derive([maybe, declined], null) !== 'NO'
);

// ── The documented corner ────────────────────────────────────────────────────
console.log('\n\x1b[33mSuite 6: ACCEPTED outranks a stored NO (documented corner)\x1b[0m');
assert('accepted item + stored NO → YES (§3 axiom wins)', derive([accepted], 'NO') === 'YES');
assert(
  'unreachable via the guest flow: a follow-up is never offered while an item is accepted',
  isAttendanceAskable([accepted]) === false
);
assert('an explicit answer still stands where no item is accepted', derive([maybe], 'NO') === 'NO');

// ── isAttendanceAskable — the guard that keeps attendance underivable-by-asking
console.log('\n\x1b[33mSuite 7: attendance is askable in exactly two situations\x1b[0m');
assert('itemless guest → askable (degenerate case)', isAttendanceAskable([]) === true);
assert('every item declined → askable (the no path)', isAttendanceAskable([declined]) === true);
assert('several items, all declined → askable', isAttendanceAskable([declined, declined]) === true);
assert('any item still pending → NOT askable', isAttendanceAskable([declined, pending]) === false);
assert('any item accepted → NOT askable', isAttendanceAskable([accepted]) === false);
assert(
  'any item maybe → NOT askable (§8: a maybe raises no attendance question)',
  isAttendanceAskable([maybe]) === false
);
assert('declined + maybe → NOT askable', isAttendanceAskable([declined, maybe]) === false);
assert('all pending → NOT askable', isAttendanceAskable([pending]) === false);

// ── "Exactly one conditional follow-up" needs no stored counter ──────────────
console.log('\n\x1b[33mSuite 8: the follow-up shows exactly once, with no extra field\x1b[0m');
const followUpShows = (assignments: { response: string }[], answer: StoredAttendanceAnswer) =>
  isAttendanceAskable(assignments) && answer === null;
assert('shown after a no', followUpShows([declined], null) === true);
assert('gone once answered', followUpShows([declined], 'NO') === false);
assert('gone once answered yes', followUpShows([declined], 'YES') === false);
assert('never shown after a yes', followUpShows([accepted], null) === false);
assert('never shown after a maybe', followUpShows([maybe], null) === false);
assert('shown to an itemless guest', followUpShows([], null) === true);

// ── Body parsers: the guest may set a response, never a status ───────────────
console.log('\n\x1b[33mSuite 9: parseAssignmentResponse — one tap, three ways\x1b[0m');
assert("'ACCEPTED' accepted", parseAssignmentResponse('ACCEPTED') === 'ACCEPTED');
assert("'DECLINED' accepted", parseAssignmentResponse('DECLINED') === 'DECLINED');
assert("'MAYBE' accepted — the new third way", parseAssignmentResponse('MAYBE') === 'MAYBE');
assert(
  "'PENDING' rejected — a guest cannot un-answer",
  parseAssignmentResponse('PENDING') === null
);
assert("'YES' rejected — that is not this axis", parseAssignmentResponse('YES') === null);
assert('undefined rejected', parseAssignmentResponse(undefined) === null);
assert('non-string rejected', parseAssignmentResponse(3) === null);
assert('lowercase rejected', parseAssignmentResponse('maybe') === null);

console.log('\n\x1b[33mSuite 10: parseAttendanceBody — the old RSVP contract is gone\x1b[0m');
assert('{ attending: true } → YES', parseAttendanceBody({ attending: true }) === 'YES');
assert('{ attending: false } → NO', parseAttendanceBody({ attending: false }) === 'NO');
assert(
  "{ rsvpStatus: 'YES' } REJECTED — guests are no longer asked attendance directly",
  parseAttendanceBody({ rsvpStatus: 'YES' }) === null
);
assert(
  "{ rsvpStatus: 'NOT_SURE' } REJECTED — the attendance-maybe is abolished (§8)",
  parseAttendanceBody({ rsvpStatus: 'NOT_SURE' }) === null
);
assert(
  "{ attending: 'yes' } rejected — boolean only",
  parseAttendanceBody({ attending: 'yes' }) === null
);
assert('empty body rejected', parseAttendanceBody({}) === null);
assert('null body rejected', parseAttendanceBody(null) === null);

// ── Summary ─────────────────────────────────────────────────────────────────
console.log(
  `\n${passed + failed} tests: \x1b[32m${passed} passed\x1b[0m, \x1b[31m${failed} failed\x1b[0m`
);
if (failed > 0) process.exit(1);
