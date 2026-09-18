/**
 * GTC-175 (D2) — The maybe's decide-by clock.
 *
 * Hinge §8 rules a maybe "a decision to decide later": no nudge cadence, but a
 * decide-by point "derived by the system from item logistics and event date, with Kate
 * able to override per item". Moment 4 §10.2 keys that derivation to needed-by and
 * defers the constant to ticket time with founder sign-off.
 *
 * What this suite pins:
 *
 *   - the offset resolves in three layers — per-ITEM override, else per-EVENT default,
 *     else the signed-off system default of 120h (5 days)
 *   - the decide-by INSTANT is derived from neededBy() and never stored
 *   - the follow-up window opens a LEAD before the decide-by, and the lead scales with
 *     the resolved offset rather than being a second fixed constant
 *   - an expired maybe is a correct derivable state: now > decide-by && MAYBE
 *   - the sent-stamp is never cleared by any of the four response writers
 *
 * Pure functions, no database. Patterned on tests/attendance-derivation-test.ts, with a
 * source-level suite in the style of tests/guest-response-model-test.ts — a behavioural
 * test on a pure helper cannot catch a route that clears the stamp behind its back.
 *
 * Run with: npx tsx tests/decide-by-clock-test.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  DEFAULT_DECIDE_BY_OFFSET_HOURS,
  DECIDE_BY_FOLLOWUP_LEAD_FRACTION,
  DECIDE_BY_FOLLOWUP_LEAD_FLOOR_HOURS,
  resolveDecideByOffsetHours,
  decideBy,
  decideByFollowupLeadHours,
  decideByFollowupOpensAt,
  isDecideByExpired,
  isDecideByFollowupDue,
} from '../src/lib/decide-by';

let passed = 0;
let failed = 0;
const redAssertions: string[] = [];

function assert(label: string, condition: boolean, hint?: string) {
  if (condition) {
    console.log(`\x1b[32m✓\x1b[0m ${label}`);
    passed++;
  } else {
    console.error(`\x1b[31m✗\x1b[0m ${label}`);
    if (hint) console.error(`  \x1b[31m${hint}\x1b[0m`);
    failed++;
    redAssertions.push(label);
  }
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** A sent, still-live event ending at `endDate`. */
const ev = (endDate: Date, decideByOffsetHours: number | null = null) => ({
  status: 'CONFIRMING' as const,
  sentAt: new Date('2026-12-01T00:00:00.000Z'),
  endDate,
  decideByOffsetHours,
});

const item = (dropOffAt: Date | null, decideByOffsetHours: number | null = null) => ({
  dropOffAt,
  decideByOffsetHours,
});

const EVENT_END = new Date('2026-12-25T07:00:00.000Z');
const DROP_OFF = new Date('2026-12-25T02:00:00.000Z');

console.log('\x1b[33m=== GTC-175 (D2): the maybe carries a derived decide-by clock ===\x1b[0m\n');

// ── The signed-off constant ──────────────────────────────────────────────────
console.log('\x1b[33mSuite 1: the system default is the founder-ruled 5 days\x1b[0m');
assert(
  'DEFAULT_DECIDE_BY_OFFSET_HOURS is 120 (5 days) — signed off for GTC-175',
  DEFAULT_DECIDE_BY_OFFSET_HOURS === 120
);
assert(
  'the lead is a FRACTION of the resolved offset, not a second fixed constant',
  DECIDE_BY_FOLLOWUP_LEAD_FRACTION > 0 && DECIDE_BY_FOLLOWUP_LEAD_FRACTION < 1
);
assert(
  'the lead floor clears the worst quiet-hours deferral (~11h, quiet-hours.ts:33-39)',
  DECIDE_BY_FOLLOWUP_LEAD_FLOOR_HOURS >= 11
);

// ── Ruling 1: three-layer precedence ─────────────────────────────────────────
console.log('\n\x1b[33mSuite 2: the offset resolves item → event → system default\x1b[0m');
assert(
  'neither set → the system default',
  resolveDecideByOffsetHours({ item: item(null), event: ev(EVENT_END) }) === 120
);
assert(
  'event default set, no item override → the event value',
  resolveDecideByOffsetHours({ item: item(null), event: ev(EVENT_END, 48) }) === 48
);
assert(
  'item override set → the item value, whatever the event says',
  resolveDecideByOffsetHours({ item: item(null, 12), event: ev(EVENT_END, 48) }) === 12
);
assert(
  'item override wins even with no event default',
  resolveDecideByOffsetHours({ item: item(null, 12), event: ev(EVENT_END) }) === 12
);
assert(
  'ZERO is an override, not an absence — a truthiness check here would silently skip it',
  resolveDecideByOffsetHours({ item: item(null, 0), event: ev(EVENT_END, 48) }) === 0
);
assert(
  'a zero EVENT default is honoured too',
  resolveDecideByOffsetHours({ item: item(null), event: ev(EVENT_END, 0) }) === 0
);
assert(
  'absent sources fall through rather than throwing (E3 adds a layer without breaking callers)',
  resolveDecideByOffsetHours({}) === 120
);

// ── The derived instant ──────────────────────────────────────────────────────
console.log('\n\x1b[33mSuite 3: the decide-by instant is neededBy() minus the offset\x1b[0m');
assert(
  'no drop-off → event date minus 5 days',
  decideBy(item(null), ev(EVENT_END)).getTime() === EVENT_END.getTime() - 5 * DAY
);
assert(
  "drop-off wins as the anchor — neededBy()'s contract is consumed unchanged",
  decideBy(item(DROP_OFF), ev(EVENT_END)).getTime() === DROP_OFF.getTime() - 5 * DAY
);
assert(
  'the event-level fast toggle (48h) moves the clock, not the anchor',
  decideBy(item(null), ev(EVENT_END, 48)).getTime() === EVENT_END.getTime() - 2 * DAY
);
assert(
  'a per-item override beats the event fast toggle',
  decideBy(item(null, 24), ev(EVENT_END, 48)).getTime() === EVENT_END.getTime() - 1 * DAY
);

// ── The follow-up lead ───────────────────────────────────────────────────────
console.log('\n\x1b[33mSuite 4: the follow-up lead scales with the offset\x1b[0m');
assert(
  'at the 120h default the lead is 24h',
  decideByFollowupLeadHours(item(null), ev(EVENT_END)) === 24
);
assert(
  'at the 48h fast toggle the fraction (9.6h) is raised to the floor',
  decideByFollowupLeadHours(item(null), ev(EVENT_END, 48)) === DECIDE_BY_FOLLOWUP_LEAD_FLOOR_HOURS
);
assert(
  'the lead never exceeds the offset itself — a 6h offset gets a 6h lead, not 12h',
  decideByFollowupLeadHours(item(null, 6), ev(EVENT_END)) === 6
);
assert(
  'a zero offset yields a zero lead rather than a window opening before needed-by',
  decideByFollowupLeadHours(item(null, 0), ev(EVENT_END)) === 0
);
assert(
  'the window opens exactly one lead before the decide-by',
  decideByFollowupOpensAt(item(null), ev(EVENT_END)).getTime() ===
    decideBy(item(null), ev(EVENT_END)).getTime() - 24 * HOUR
);

// ── Ruling 2: expiry is a state, derivable and correct ───────────────────────
console.log('\n\x1b[33mSuite 5: an expired maybe is a derivable state (no red built here)\x1b[0m');
const maybe = { response: 'MAYBE' };
const accepted = { response: 'ACCEPTED' };
const declined = { response: 'DECLINED' };
const pending = { response: 'PENDING' };
const DECIDE_BY_AT = new Date(EVENT_END.getTime() - 5 * DAY);

assert(
  'a maybe past its decide-by is expired',
  isDecideByExpired(maybe, item(null), ev(EVENT_END), new Date(DECIDE_BY_AT.getTime() + 1)) === true
);
assert(
  'a maybe before its decide-by is not',
  isDecideByExpired(maybe, item(null), ev(EVENT_END), new Date(DECIDE_BY_AT.getTime() - 1)) ===
    false
);
assert(
  'the boundary is strict — now === decide-by is NOT expired (mirrors isComplete)',
  isDecideByExpired(maybe, item(null), ev(EVENT_END), DECIDE_BY_AT) === false
);
const AFTER = new Date(DECIDE_BY_AT.getTime() + HOUR);
assert(
  'an accepted item never expires',
  isDecideByExpired(accepted, item(null), ev(EVENT_END), AFTER) === false
);
assert(
  'a declined item never expires',
  isDecideByExpired(declined, item(null), ev(EVENT_END), AFTER) === false
);
assert(
  'an untouched item is a SILENCE, not an expired maybe — E1 owns that, not D2',
  isDecideByExpired(pending, item(null), ev(EVENT_END), AFTER) === false
);
assert(
  'a maybe on an UNSENT event never expires — the clock cannot run before the send',
  isDecideByExpired(
    maybe,
    item(null),
    { status: 'CONFIRMING', sentAt: null, endDate: EVENT_END, decideByOffsetHours: null },
    AFTER
  ) === false
);
assert(
  'the fast toggle expires a maybe earlier, from the same predicate',
  isDecideByExpired(
    maybe,
    item(null),
    ev(EVENT_END, 48),
    new Date(EVENT_END.getTime() - 2 * DAY + 1)
  ) === true
);

// ── The follow-up timing predicate ───────────────────────────────────────────
console.log('\n\x1b[33mSuite 6: exactly one follow-up window — none before, none after\x1b[0m');
const OPENS_AT = new Date(DECIDE_BY_AT.getTime() - 24 * HOUR);
const due = (now: Date) => isDecideByFollowupDue(maybe, item(null), ev(EVENT_END), now);

assert('well before the window → not due', due(new Date(OPENS_AT.getTime() - DAY)) === false);
assert(
  'one instant before the window opens → not due',
  due(new Date(OPENS_AT.getTime() - 1)) === false
);
assert('the moment the window opens → due', due(OPENS_AT) === true);
assert('mid-window → due', due(new Date(OPENS_AT.getTime() + 12 * HOUR)) === true);
assert('at the decide-by itself → still due (not yet expired)', due(DECIDE_BY_AT) === true);
assert(
  'past the decide-by → NOT due: no text may quote a deadline that has already passed',
  due(new Date(DECIDE_BY_AT.getTime() + 1)) === false
);
assert(
  'a maybe born expired (event sent inside the offset window) is never texted',
  isDecideByFollowupDue(
    maybe,
    item(null),
    ev(new Date('2026-12-25T07:00:00.000Z')),
    new Date('2026-12-24T07:00:00.000Z')
  ) === false
);
assert(
  'only a MAYBE is ever due — the sweep never texts an accepted or declined item',
  isDecideByFollowupDue(accepted, item(null), ev(EVENT_END), OPENS_AT) === false &&
    isDecideByFollowupDue(declined, item(null), ev(EVENT_END), OPENS_AT) === false &&
    isDecideByFollowupDue(pending, item(null), ev(EVENT_END), OPENS_AT) === false
);

// ── The clock is derived, never stored ───────────────────────────────────────
console.log('\n\x1b[33mSuite 7: nothing stores the instant, and neededBy() is untouched\x1b[0m');
const root = path.resolve(__dirname, '..');
const read = (rel: string): string => {
  const full = path.join(root, rel);
  return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : '';
};
/** Source minus comment lines, so a doc-comment naming a field never masks a real write. */
const code = (rel: string): string =>
  read(rel)
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return (
        !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*') && !t.startsWith('///')
      );
    })
    .join('\n');

const schema = read('prisma/schema.prisma');
assert(
  'no decideByAt / decideBy column exists — the instant is derived (Ruling 1)',
  !/^\s*decideByAt\s/m.test(schema) && !/^\s*decideBy\s+DateTime/m.test(schema),
  'a stored decide-by is the Item.status mistake again: it drifts from its inputs'
);
assert(
  'Item carries the per-item offset override',
  /^\s*decideByOffsetHours\s+Int\?/m.test(code('prisma/schema.prisma'))
);
assert(
  'Assignment carries the follow-up sent-stamp',
  /^\s*decideByFollowupSentAt\s+DateTime\?/m.test(code('prisma/schema.prisma'))
);

const lifecycle = read('src/lib/lifecycle.ts');
assert(
  'neededBy() is byte-identical — D2 consumes the anchor, it does not bake an offset in',
  /export function neededBy\(item: \{ dropOffAt: Date \| null \}, event: LifecycleEvent\): Date \{\n  return item\.dropOffAt \?\? event\.endDate;\n\}/.test(
    lifecycle
  ),
  'the offset must be applied at D2 derivation time, never inside neededBy()'
);
assert(
  'decide-by.ts imports the shared anchor rather than re-deriving it',
  /import \{[^}]*neededBy[^}]*\} from '\.\/lifecycle'/.test(read('src/lib/decide-by.ts'))
);

// ── The flip rule: the stamp is never cleared ────────────────────────────────
console.log('\n\x1b[33mSuite 8: the sent-stamp is never cleared (exactly one, ever)\x1b[0m');
const RESPONSE_WRITERS = [
  'src/app/api/p/[token]/ack/[assignmentId]/route.ts',
  'src/app/api/c/[token]/ack/[assignmentId]/route.ts',
  'src/app/api/h/[token]/people/[personId]/manual-override/route.ts',
  'src/app/api/events/[id]/people/[personId]/manual-override/route.ts',
];
for (const writer of RESPONSE_WRITERS) {
  assert(
    `${writer.replace('src/app/api/', '')} does not touch the stamp`,
    read(writer).length > 0 && !/decideByFollowupSentAt/.test(code(writer)),
    'clearing it on a MAYBE → ACCEPTED → MAYBE flip lets one guest be texted twice'
  );
}
assert(
  'restoreRevision carries the stamp across a plan restore',
  /decideByFollowupSentAt/.test(code('src/lib/workflow.ts')),
  'restoreRevision deletes and recreates every Assignment — dropping the stamp re-texts every maybe in the event'
);
assert(
  'restoreRevision carries the per-item override across a plan restore',
  /decideByOffsetHours:\s*itemData\.decideByOffsetHours/.test(code('src/lib/workflow.ts')),
  "the item create list is explicit — an omitted column silently resets Kate's override"
);

// ── Summary ─────────────────────────────────────────────────────────────────
console.log(
  `\n${passed + failed} tests: \x1b[32m${passed} passed\x1b[0m, \x1b[31m${failed} failed\x1b[0m`
);
if (failed > 0) {
  console.error(`\n\x1b[31mRED — ${failed} assertion(s) failed:\x1b[0m`);
  for (const r of redAssertions) console.error(`  ✗ ${r}`);
  process.exit(1);
}
console.log(
  '\x1b[32mGREEN — the decide-by clock derives correctly and stores only its inputs.\x1b[0m'
);
