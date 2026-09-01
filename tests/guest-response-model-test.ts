/**
 * GTC-174 (D1) — The unified guest response model, at the route contract level.
 *
 * The derivation itself is covered by tests/attendance-derivation-test.ts. THIS file
 * proves the routes actually adopt it — that the model is not merely available but
 * wired, and that the superseded direct-RSVP contract is genuinely gone:
 *
 *   - PATCH /api/p/[token] no longer accepts a guest-supplied rsvpStatus
 *   - it writes attendanceAnswer, and only where attendance is legitimately askable
 *   - both ack routes accept MAYBE
 *   - the participant payload no longer emits rsvpStatus at all
 *   - the NOT_SURE forced-conversion nudge can no longer fire (Hinge §8: no nudges)
 *   - a MAYBE is NOT a gap, but it IS unconfirmed (§8: held softly, yellow not red)
 *
 * Source-level assertions are deliberate: a behavioural test on a pure helper cannot
 * catch a route that imports the helper and then ignores it.
 *
 * Run with: npx tsx tests/guest-response-model-test.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { computeTeamStatusFromItems } from '../src/lib/workflow';

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean, hint?: string) {
  if (condition) {
    console.log(`\x1b[32m✓\x1b[0m ${label}`);
    passed++;
  } else {
    console.error(`\x1b[31m✗\x1b[0m ${label}`);
    if (hint) console.error(`  \x1b[31m${hint}\x1b[0m`);
    failed++;
  }
}

const root = path.resolve(__dirname, '..');
const read = (rel: string): string => {
  const full = path.join(root, rel);
  return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : '';
};

/** The route body minus its comment lines — so a comment mentioning rsvpStatus
 *  (which the retained-but-unwritten note legitimately does) never masks a real read. */
const code = (rel: string): string =>
  read(rel)
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .join('\n');

const P_ROUTE = 'src/app/api/p/[token]/route.ts';
const P_ACK = 'src/app/api/p/[token]/ack/[assignmentId]/route.ts';
const C_ACK = 'src/app/api/c/[token]/ack/[assignmentId]/route.ts';
const NUDGE = 'src/lib/sms/nudge-eligibility.ts';
const WORKFLOW = 'src/lib/workflow.ts';
const PAGE = 'src/app/p/[token]/page.tsx';

console.log('\x1b[33m=== GTC-174 (D1): the guest response model is wired ===\x1b[0m\n');

// ── The derivation module exists and is client-safe ──────────────────────────
console.log('\x1b[33mSuite 1: src/lib/attendance.ts is the single definition\x1b[0m');
const attendanceSrc = read('src/lib/attendance.ts');
assert('src/lib/attendance.ts exists', attendanceSrc.length > 0);
assert('exports deriveAttendance', /export function deriveAttendance/.test(attendanceSrc));
assert('exports isAttendanceAskable', /export function isAttendanceAskable/.test(attendanceSrc));
assert(
  'Attendance is a TS union, NOT a Prisma enum — nobody may add a column for it',
  /export type Attendance\s*=/.test(attendanceSrc)
);
assert(
  'client-safe: the only Prisma import is type-only (mirrors lifecycle.ts)',
  !/^import \{[^}]*\} from '@prisma\/client'/m.test(attendanceSrc)
);

// ── PATCH: the direct-RSVP write is gone ─────────────────────────────────────
console.log('\n\x1b[33mSuite 2: PATCH /api/p/[token] no longer asks attendance directly\x1b[0m');
const pRoute = code(P_ROUTE);
assert(
  'PATCH does not read rsvpStatus from the request body',
  !/const \{\s*rsvpStatus\s*\}\s*=\s*body/.test(pRoute),
  'the superseded direct-RSVP contract is still live'
);
assert(
  'the route writes no rsvpStatus at all',
  !/rsvpStatus/.test(pRoute),
  'rsvpStatus is retained-but-unwritten — nothing may write or read it'
);
assert('PATCH validates through parseAttendanceBody', /parseAttendanceBody/.test(pRoute));
assert(
  'PATCH gates on isAttendanceAskable — the guard is structural, not a UI convention',
  /isAttendanceAskable/.test(pRoute)
);
assert('PATCH answers 409 when attendance was never asked', /409/.test(pRoute));
assert('PATCH writes attendanceAnswer', /attendanceAnswer/.test(pRoute));
assert('PATCH stamps attendanceAnsweredAt', /attendanceAnsweredAt/.test(pRoute));

// ── GET: the payload carries derived state, not stored state ─────────────────
console.log('\n\x1b[33mSuite 3: the participant payload emits derived attendance\x1b[0m');
assert('GET emits attendance', /attendance:/.test(pRoute));
assert(
  'GET emits attendanceAskable so the client can render the follow-up',
  /attendanceAskable/.test(pRoute)
);
assert('GET no longer emits rsvpRespondedAt', !/rsvpRespondedAt/.test(pRoute));
assert('GET no longer emits rsvpFollowupSentAt', !/rsvpFollowupSentAt/.test(pRoute));
assert('GET calls deriveAttendance rather than reading a column', /deriveAttendance/.test(pRoute));

// ── The ack routes carry the third way ───────────────────────────────────────
console.log('\n\x1b[33mSuite 4: both ack routes accept MAYBE\x1b[0m');
const pAck = code(P_ACK);
const cAck = code(C_ACK);
assert(
  'participant ack no longer hardcodes the binary pair',
  !/\['ACCEPTED',\s*'DECLINED'\]/.test(pAck),
  'MAYBE cannot be recorded while the binary allow-list stands'
);
assert(
  'participant ack validates through parseAssignmentResponse',
  /parseAssignmentResponse/.test(pAck)
);
assert(
  'coordinator ack no longer hardcodes the binary pair',
  !/\['ACCEPTED',\s*'DECLINED'\]/.test(cAck)
);
assert(
  'coordinator ack validates through parseAssignmentResponse',
  /parseAssignmentResponse/.test(cAck)
);
assert(
  'GTC-169 stands: no lifecycle gate is reintroduced on the ack path',
  !/frozen|FROZEN/i.test(pAck),
  'the ack route must not gate on lifecycle — after the send is when guests answer'
);

// ── The forced-conversion nudge cannot fire ──────────────────────────────────
console.log('\n\x1b[33mSuite 5: the NOT_SURE forced-conversion nudge is dead (Hinge §8)\x1b[0m');
const nudge = code(NUDGE);
assert(
  'nudge-eligibility no longer queries rsvpStatus',
  !/rsvpStatus/.test(nudge),
  'a legacy NOT_SURE row could still trigger a nudge that contradicts the maybe ruling'
);
assert(
  'the opt-out zone is untouched — smsOptedOut logic still present',
  /smsOptedOut|MESSAGEABLE_PERSON_EVENT/.test(nudge)
);

// ── The guest page taps three ways ───────────────────────────────────────────
console.log('\n\x1b[33mSuite 6: the guest page is items-first, not RSVP-gated\x1b[0m');
const page = code(PAGE);
assert('page offers a MAYBE tap', /MAYBE/.test(page));
assert(
  'page no longer gates the item list behind an attendance question',
  !/rsvpStatus/.test(page),
  'the RSVP-first flow is superseded — the tap is the item ask'
);
assert(
  'page renders the conditional follow-up from attendanceAskable',
  /attendanceAskable/.test(page)
);

// ── MAYBE is not a gap, but it is not a confirmation either ──────────────────
console.log('\n\x1b[33mSuite 7: a maybe is held softly — yellow, not red (§8)\x1b[0m');
const item = (response: string | null, critical = false) => ({
  critical,
  assignment: response === null ? null : { response, person: { id: 'p', name: 'P' } },
});
assert(
  "a maybe item is NOT a gap — it stays the guest's",
  computeTeamStatusFromItems([item('MAYBE')] as never) === 'SORTED'
);
assert(
  'a critical maybe is NOT a critical gap',
  computeTeamStatusFromItems([item('MAYBE', true)] as never) === 'SORTED'
);
assert(
  'a declined item IS still a gap',
  computeTeamStatusFromItems([item('DECLINED')] as never) === 'GAP'
);
assert(
  'an unassigned item IS still a gap',
  computeTeamStatusFromItems([item(null)] as never) === 'GAP'
);
assert(
  'a critical declined item is still a critical gap',
  computeTeamStatusFromItems([item('DECLINED', true)] as never) === 'CRITICAL_GAP'
);

console.log('\n\x1b[33mSuite 8: but a maybe MUST block freeze-readiness\x1b[0m');
const workflow = read(WORKFLOW);
const lowCompliance = workflow.slice(
  workflow.indexOf('const pendingAssignments'),
  workflow.indexOf('const pendingAssignments') + 300
);
assert(
  'LOW_COMPLIANCE counts MAYBE as unconfirmed — a maybe is not a yes',
  /MAYBE/.test(lowCompliance),
  'freeze-readiness would report a maybe as a confirmation'
);

// ── Summary ─────────────────────────────────────────────────────────────────
console.log(
  `\n${passed + failed} tests: \x1b[32m${passed} passed\x1b[0m, \x1b[31m${failed} failed\x1b[0m`
);
if (failed > 0) process.exit(1);
