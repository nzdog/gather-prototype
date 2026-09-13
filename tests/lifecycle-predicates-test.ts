/**
 * GTC-168 (A2) — Lifecycle predicate tests.
 *
 * Asserts the derived-state model from
 * `docs/04_roadmap/send-lock-reconciliation-plan.md` §1–§3:
 *
 *   - SENT is a stored timestamp, not a status
 *   - COMPLETE is derived from the calendar and never written
 *   - the FROZEN compat shim reads legacy events correctly
 *   - mini-sends are derived, not flagged
 *
 * Pure functions, no database.
 */

import {
  isSent,
  isComplete,
  getEventPhase,
  isMiniSend,
  neededBy,
  SENT_AND_LIVE,
  COMPLETE_WHERE,
  type LifecycleEvent,
} from '../src/lib/lifecycle';

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

const NOW = new Date('2026-08-03T12:00:00.000Z');
const FUTURE = new Date('2026-12-25T12:00:00.000Z');
const PAST = new Date('2026-01-01T12:00:00.000Z');
const SEND_TIME = new Date('2026-07-01T09:00:00.000Z');

const ev = (over: Partial<LifecycleEvent> = {}): LifecycleEvent => ({
  status: 'CONFIRMING',
  sentAt: null,
  endDate: FUTURE,
  ...over,
});

console.log('\x1b[33m=== GTC-168: Lifecycle predicates ===\x1b[0m\n');

// ── isSent ───────────────────────────────────────────────────────────────────
console.log('\x1b[33mSuite 1: isSent — the press is a timestamp\x1b[0m');
assert('DRAFT, no sentAt → not sent', isSent(ev({ status: 'DRAFT' })) === false);
assert('CONFIRMING, no sentAt → not sent', isSent(ev()) === false);
assert('CONFIRMING with sentAt → SENT', isSent(ev({ sentAt: SEND_TIME })) === true);
assert(
  'sentAt is what makes it sent, not the status',
  isSent(ev({ status: 'DRAFT', sentAt: SEND_TIME })) === true
);

console.log('\n\x1b[33mSuite 2: the FROZEN compat shim (legacy events, Epic A only)\x1b[0m');
assert(
  'legacy FROZEN with no sentAt still reads as sent',
  isSent(ev({ status: 'FROZEN', sentAt: null })) === true
);
assert(
  'FROZEN with a backfilled sentAt reads as sent',
  isSent(ev({ status: 'FROZEN', sentAt: SEND_TIME })) === true
);
assert(
  'COMPLETE alone does NOT imply sent — the shim covers FROZEN only',
  isSent(ev({ status: 'COMPLETE', sentAt: null })) === false
);

// ── isComplete ───────────────────────────────────────────────────────────────
console.log('\n\x1b[33mSuite 3: isComplete — the calendar does the transition\x1b[0m');
assert('future endDate → not complete', isComplete(ev({ endDate: FUTURE }), NOW) === false);
assert('past endDate → complete', isComplete(ev({ endDate: PAST }), NOW) === true);
assert(
  'BOUNDARY: now === endDate is NOT complete (event ends AT endDate)',
  isComplete(ev({ endDate: NOW }), NOW) === false
);
assert(
  'BOUNDARY: one millisecond past endDate IS complete',
  isComplete(ev({ endDate: new Date(NOW.getTime() - 1) }), NOW) === true
);
assert(
  'completeness ignores status entirely — never written, only derived',
  isComplete(ev({ status: 'DRAFT', endDate: PAST }), NOW) === true &&
    isComplete(ev({ status: 'COMPLETE', endDate: FUTURE }), NOW) === false
);

// ── getEventPhase ────────────────────────────────────────────────────────────
console.log('\n\x1b[33mSuite 4: getEventPhase — four phases, two stored facts\x1b[0m');
assert('DRAFT', getEventPhase(ev({ status: 'DRAFT' }), NOW) === 'DRAFT');
assert('CONFIRMING', getEventPhase(ev({ status: 'CONFIRMING' }), NOW) === 'CONFIRMING');
assert('SENT', getEventPhase(ev({ sentAt: SEND_TIME }), NOW) === 'SENT');
assert('COMPLETE from the calendar', getEventPhase(ev({ endDate: PAST }), NOW) === 'COMPLETE');
assert(
  'COMPLETE wins over SENT — a past event is over whether or not it was sent',
  getEventPhase(ev({ sentAt: SEND_TIME, endDate: PAST }), NOW) === 'COMPLETE'
);
assert(
  'COMPLETE wins for a never-sent past event too (GTC-199 migration safety)',
  getEventPhase(ev({ status: 'DRAFT', sentAt: null, endDate: PAST }), NOW) === 'COMPLETE'
);
assert(
  'legacy FROZEN reads as SENT, not as its own phase',
  getEventPhase(ev({ status: 'FROZEN', sentAt: null }), NOW) === 'SENT'
);

// ── isMiniSend ───────────────────────────────────────────────────────────────
console.log('\n\x1b[33mSuite 5: isMiniSend — derived, no stored flag\x1b[0m');
const sentEvent = ev({ sentAt: SEND_TIME });
const LATER = new Date(SEND_TIME.getTime() + 86_400_000);
assert(
  'person sent at the press → not a mini-send',
  isMiniSend({ sentAt: SEND_TIME }, sentEvent) === false
);
assert(
  'person sent after the press → mini-send',
  isMiniSend({ sentAt: LATER }, sentEvent) === true
);
assert(
  'person not yet sent to → not a mini-send',
  isMiniSend({ sentAt: null }, sentEvent) === false
);
assert(
  'unsent event → nobody is a mini-send',
  isMiniSend({ sentAt: LATER }, ev({ sentAt: null })) === false
);

// ── neededBy ─────────────────────────────────────────────────────────────────
console.log('\n\x1b[33mSuite 6: neededBy — the anchor both clocks share (§10.2)\x1b[0m');
const DROP_OFF = new Date('2026-12-25T08:00:00.000Z');
assert(
  'item drop-off time wins where one exists',
  neededBy({ dropOffAt: DROP_OFF }, ev({ endDate: FUTURE })).getTime() === DROP_OFF.getTime()
);
assert(
  'falls back to the event date',
  neededBy({ dropOffAt: null }, ev({ endDate: FUTURE })).getTime() === FUTURE.getTime()
);

// ── SQL fragments ────────────────────────────────────────────────────────────
console.log('\n\x1b[33mSuite 7: Prisma where-fragments filter in SQL, not JS\x1b[0m');
const live = SENT_AND_LIVE(NOW);
assert('SENT_AND_LIVE requires a non-null sentAt', JSON.stringify(live.sentAt) === '{"not":null}');
assert('SENT_AND_LIVE requires a future endDate', live.endDate.gt === NOW);
assert('COMPLETE_WHERE is endDate <= now', COMPLETE_WHERE(NOW).endDate.lte === NOW);

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(
  `\n${passed + failed} tests: \x1b[32m${passed} passed\x1b[0m, \x1b[31m${failed} failed\x1b[0m`
);
if (failed > 0) process.exit(1);
