/**
 * GTC-171 (B2) — bucket eligibility: the negative cases.
 *
 * The acceptance criterion is that finalize-plan converts the host's three free-text
 * EventSetup fields into task rows. The corollary matters just as much: a bucket the host
 * left blank, or is still deciding on, must produce NOTHING — no rows, and therefore no
 * team. Enforced server-side rather than in the prompt, so the model cannot invent work
 * the host never asked for.
 *
 * `stillDeciding` is the subtle one. Every food category has always honoured it; these
 * three fields never did, because the route cast the JSON to `{ freeText }` and silently
 * dropped the flag (finalize-plan/route.ts, pre-B2).
 *
 * Deterministic — no AI, no DB.
 *
 * Run with: npx tsx tests/task-row-bucket-eligibility-test.ts
 */

import { isBucketEligible, selectTaskRows, type TaskBucket } from '../src/lib/ai/tasks';

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

console.log('\x1b[33m=== GTC-171 (B2): bucket eligibility negative cases ===\x1b[0m\n');

// --- isBucketEligible ------------------------------------------------------
console.log('\x1b[33mSuite E: isBucketEligible\x1b[0m');

assert('E1 settled free text is eligible', isBucketEligible({ freeText: 'Set up the tables' }));
assert(
  'E2 settled free text with stillDeciding:false is eligible',
  isBucketEligible({ freeText: 'Set up the tables', stillDeciding: false })
);
assert(
  'E3 stillDeciding:true is NOT eligible even with text',
  !isBucketEligible({ freeText: 'Maybe some tables?', stillDeciding: true })
);
assert('E4 empty free text is NOT eligible', !isBucketEligible({ freeText: '' }));
assert('E5 whitespace-only free text is NOT eligible', !isBucketEligible({ freeText: '   \n  ' }));
assert('E6 null bucket is NOT eligible', !isBucketEligible(null));
assert('E7 undefined bucket is NOT eligible', !isBucketEligible(undefined));
assert('E8 missing freeText is NOT eligible', !isBucketEligible({ stillDeciding: false }));

// --- selectTaskRows --------------------------------------------------------
console.log('\n\x1b[33mSuite F: selectTaskRows filtering\x1b[0m');

const modelTasks = [
  { bucket: 'set_up', name: 'Set out the tables' },
  { bucket: 'set_up', name: 'Put up the gazebo', notes: 'if it rains' },
  { bucket: 'clean_up', name: 'Wash the dishes' },
  { bucket: 'other_jobs', name: 'Mind the little ones' },
];

const onlySetUp = (b: TaskBucket) => b === 'set_up';
const grouped = selectTaskRows(modelTasks, onlySetUp);

assert('F1 keeps rows from the eligible bucket', grouped.get('set_up')?.length === 2);
assert('F2 drops rows from an ineligible bucket (clean_up)', !grouped.has('clean_up'));
assert('F3 drops rows from an ineligible bucket (other_jobs)', !grouped.has('other_jobs'));
assert('F4 preserves notes when present', grouped.get('set_up')?.[1].notes === 'if it rains');
assert('F5 leaves notes undefined when absent', grouped.get('set_up')?.[0].notes === undefined);

const noneEligible = selectTaskRows(modelTasks, () => false);
assert('F6 no eligible bucket → no rows at all, so no team is created', noneEligible.size === 0);

const allEligible = selectTaskRows(modelTasks, () => true);
assert('F7 all buckets eligible → all three groups present', allEligible.size === 3);

// --- Malformed model output ------------------------------------------------
console.log('\n\x1b[33mSuite G: malformed model output is discarded, never thrown on\x1b[0m');

const junk = selectTaskRows(
  [
    { bucket: 'set_up', name: '' },
    { bucket: 'set_up', name: '   ' },
    { bucket: 'nonsense_bucket', name: 'Something' },
    { bucket: 'set_up' },
    { name: 'No bucket at all' },
    null,
    'not an object',
    { bucket: 'set_up', name: '  Trim me  ' },
  ],
  () => true
);

assert('G1 only the one valid row survives', junk.get('set_up')?.length === 1);
assert('G2 the surviving name is trimmed', junk.get('set_up')?.[0].name === 'Trim me');
assert('G3 an unknown bucket key is dropped', !junk.has('nonsense_bucket' as TaskBucket));
assert(
  'G4 a non-array tasks payload yields nothing',
  selectTaskRows(undefined, () => true).size === 0
);
assert('G5 a null tasks payload yields nothing', selectTaskRows(null, () => true).size === 0);

console.log(`\n\x1b[32m${passed} passed\x1b[0m, \x1b[31m${failed} failed\x1b[0m`);
if (failed > 0) process.exit(1);
