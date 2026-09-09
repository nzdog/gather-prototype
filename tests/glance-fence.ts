/**
 * GTC-192 (J1) — Ruling 1's fence, as ONE list, shared by the suites that scan with it.
 *
 * WHY THIS FILE EXISTS, AND WHY IT IS NOT A SECOND DEFINITION OF ANYTHING.
 *
 * Phase 6 §5 says, of the denylist amendment: "Keep ONE list; scan the nine existing
 * sources with it unchanged; scan the rewind with DENYLIST.filter(...)". Until 6a there was
 * exactly one scanner (`tests/glance-read-test.ts`) so the list could live inside it. 6a adds
 * a second (`tests/glance-replay-test.ts`, which runs §5 layer 1's runtime pass over the
 * replay payload), and a copied fence list is the failure this ticket keeps refusing
 * elsewhere — `isChaseable` over a `'DONT_CHASE'` literal, `mayHoldRow` over a hand-rolled
 * same-team rule, one definition of the colours rather than a server one and a client one.
 * A fence that exists twice can be weakened in one copy with nothing failing.
 *
 * So the list moved here rather than being duplicated. Both scanners import it; neither
 * declares one. `collectKeys` and `code` travel with it because they are the fence's
 * mechanics — "at any depth" and "with comments stripped" are load-bearing, and two
 * implementations of them could disagree about what was scanned.
 *
 * NOTHING ABOUT THE LIST'S CONTENTS CHANGED IN THE MOVE. The 22 names below are byte-for-byte
 * the ones phase 1 wrote and phases 3b and 4 extended.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Ruling 1's fence, as a list of names.
 *
 * The replay "may only ever show state changes (resolutions), never behaviour. No opens, no
 * views, no hesitations, ever." These are the names that would carry behaviour into the
 * process, and the fence is on the SELECT rather than on the render: a field that is fetched
 * and not rendered is one careless JSX edit from being rendered.
 *
 * `firstNudgeSentAt` / `secondNudgeSentAt` are in the list for a second reason: they are the
 * raw material an exhaustion count would be derived from, and GTC-251 owns that derivation.
 * Denying them here forces the seam to take a DECISION (`ExhaustionFact`) rather than
 * telemetry it would have to interpret itself.
 *
 * `PersonEvent.sentAt` is deliberately NOT here. It records when GATHER SENT, which is the
 * anchor E1's cadence counts from — system action, not guest behaviour.
 *
 * ⚠ `glanceSeenAt` (phase 5) is deliberately NOT here and is NOT caught by `seenAt`: the scan
 * is `\bseenAt\b` and case-sensitive, so the longer name does not match. That is measured, not
 * assumed — `tests/glance-read-test.ts` asserts it directly.
 */
export const BEHAVIOUR_DENYLIST = [
  'openedAt',
  'viewedAt',
  'lastViewedAt',
  'seenAt',
  'lastSeenAt',
  'inviteEvent',
  'InviteEvent',
  'LINK_OPENED',
  'NAME_CLAIMED',
  'RESPONSE_SUBMITTED',
  'nudgeLog',
  'NudgeLog',
  'auditEntry',
  'AuditEntry',
  'rsvpStatus',
  'rsvpRespondedAt',
  'rsvpFollowupSentAt',
  'attendanceAnsweredAt',
  'claimedViaSharedLink',
  'claimedAt',
  'firstNudgeSentAt',
  'secondNudgeSentAt',
  'decideByFollowupSentAt',
];

/**
 * RULING 21's EXEMPTION, expressed as a derivation of the one list rather than as a second
 * list. Two names wide; the caller is responsible for applying it to exactly one file, and
 * both halves of that are asserted in `tests/glance-read-test.ts`.
 */
export const REWIND_EXEMPT_NAMES = ['auditEntry', 'AuditEntry'];

/** The scan the rewind is held to: the one list, minus exactly the two exempt names. */
export const REWIND_DENYLIST = BEHAVIOUR_DENYLIST.filter(
  (n) => n !== 'auditEntry' && n !== 'AuditEntry'
);

/** Every key appearing anywhere in a payload, at any depth. */
export function collectKeys(value: unknown, into: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const v of value) collectKeys(v, into);
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      into.add(k);
      collectKeys(v, into);
    }
  }
  return into;
}

/** Source with comments stripped — naming a thing you excluded must not read as using it. */
export function code(rel: string): string {
  try {
    return readFileSync(join(__dirname, '..', rel), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
  } catch {
    return '';
  }
}

/** Source exactly as written. Empty string when the file does not exist yet (the RED run). */
export function raw(rel: string): string {
  try {
    return readFileSync(join(__dirname, '..', rel), 'utf8');
  } catch {
    return '';
  }
}
