/**
 * GTC-030 — Plan/Generate: Initial plan generation produces 0 items with no error
 *
 * Root causes under test:
 *
 * 1. PLAN_GENERATION_SYSTEM_PROMPT did not explicitly instruct Claude to use
 *    identical team names in BOTH the teams array AND the items array.
 *    Claude can return slightly different names in items (e.g. "Sides" vs "Side Dishes"),
 *    causing every teamItems filter to return [] → 0 items created → silent success.
 *
 * 2. The generate route returned { success: true } even when itemsCreated === 0
 *    and aiResponse.items.length > 0. Teams were created, items silently dropped,
 *    no error surfaced. Same class of bug as GTC-024, different code path.
 *
 * RED state before fix:
 *   Suite 1 assertion 1 fails — PLAN_GENERATION_SYSTEM_PROMPT lacks explicit identical-
 *     team-name instruction strong enough to catch the mismatch failure mode
 *   Suite 3 assertion 1 fails — route file has no 422 path for initial plan mismatch
 *
 * Test strategy: pure function tests + prompt/file content checks, no DB required.
 */

import * as fs from 'fs';
import * as path from 'path';
import { findMissingTeamNames } from '../src/lib/ai/generate';
import { PLAN_GENERATION_SYSTEM_PROMPT } from '../src/lib/ai/prompts';

const RED_COLOR = '\x1b[31m';
const GREEN_COLOR = '\x1b[32m';
const YELLOW_COLOR = '\x1b[33m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`${GREEN_COLOR}✓${RESET} ${label}`);
    passed++;
  } else {
    console.error(`${RED_COLOR}✗${RESET} ${label}`);
    if (detail) console.error(`  ${RED_COLOR}${detail}${RESET}`);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// Suite 1: PLAN_GENERATION_SYSTEM_PROMPT — explicit identical team name instruction
//
// RED: The current prompt only says `"teamName": "Team Name (must match a team name above)"`
// in the output format section. This is too weak — Claude still returns slightly variant
// names. The fix must add an explicit CRITICAL CONSISTENCY RULE that names the failure mode.
// ---------------------------------------------------------------------------
console.log(
  `${YELLOW_COLOR}=== GTC-030: Initial plan generation produces 0 items — Regression Tests ===${RESET}\n`
);
console.log(
  `${YELLOW_COLOR}Suite 1: PLAN_GENERATION_SYSTEM_PROMPT must explicitly require identical team names${RESET}`
);

// ── RED assertion ──
// Before fix: prompt has no explicit instruction about CRITICAL CONSISTENCY RULE
// or identical team names between arrays.
// After fix: prompt contains an explicit rule that teamName in items MUST exactly match
// a name from the teams array, naming the consequence (items silently lost).
assert(
  'prompt contains explicit "CRITICAL CONSISTENCY RULE" or equivalent for team name matching',
  /CRITICAL CONSISTENCY RULE/i.test(PLAN_GENERATION_SYSTEM_PROMPT) ||
    /teamName.*MUST exactly match/i.test(PLAN_GENERATION_SYSTEM_PROMPT) ||
    /teamName.*must.*exactly match/i.test(PLAN_GENERATION_SYSTEM_PROMPT),
  'Expected PLAN_GENERATION_SYSTEM_PROMPT to contain an explicit team name consistency rule'
);

assert(
  'prompt explains the consequence of mismatched teamNames (items lost / silently dropped)',
  /silently (lost|dropped|discarded)/i.test(PLAN_GENERATION_SYSTEM_PROMPT) ||
    /will (cause|result in).{0,60}(lost|dropped|silently)/i.test(PLAN_GENERATION_SYSTEM_PROMPT),
  'Expected prompt to warn that a mismatched teamName causes the item to be lost'
);

// Existing constraints must be retained
assert(
  'prompt retains JSON output format instruction',
  PLAN_GENERATION_SYSTEM_PROMPT.toLowerCase().includes('return only valid json') ||
    PLAN_GENERATION_SYSTEM_PROMPT.toLowerCase().includes('return only the json')
);
assert(
  'prompt retains the teamName field definition in OUTPUT FORMAT',
  PLAN_GENERATION_SYSTEM_PROMPT.includes('"teamName"')
);

// ---------------------------------------------------------------------------
// Suite 2: Mismatch simulation — demonstrates the bug scenario
//
// Given an AI response where item teamNames don't exactly match teams array names,
// the route's filter `items.filter(i => i.teamName === teamData.name)` silently
// returns [] for every team → 0 items created.
// These assertions PASS both before and after the fix — they document the bug trigger.
// ---------------------------------------------------------------------------
console.log(
  `\n${YELLOW_COLOR}Suite 2: Mismatch simulation — items are silently dropped when names differ${RESET}`
);

const AI_TEAMS = [
  { name: 'Proteins', scope: 'Main proteins', domain: 'PROTEINS' },
  { name: 'Sides', scope: 'Side dishes', domain: 'SIDES' },
  { name: 'Drinks', scope: 'Beverages', domain: 'DRINKS' },
];

// Claude returns slightly different names in items (the bug trigger)
const AI_ITEMS_MISMATCHED = [
  { teamName: 'Protein Team', name: 'Roast Turkey' }, // "Protein Team" ≠ "Proteins"
  { teamName: 'Side Dishes', name: 'Roast Potatoes' }, // "Side Dishes" ≠ "Sides"
  { teamName: 'Beverages', name: 'Sparkling Water' }, // "Beverages" ≠ "Drinks"
];

// Simulate the route's per-team filter
function simulateItemFilter(
  aiTeams: { name: string }[],
  aiItems: { teamName: string; name: string }[]
): number {
  let count = 0;
  for (const team of aiTeams) {
    const teamItems = aiItems.filter((item) => item.teamName === team.name);
    count += teamItems.length;
  }
  return count;
}

const itemsCreatedWithMismatch = simulateItemFilter(AI_TEAMS, AI_ITEMS_MISMATCHED);
assert(
  'mismatched teamNames cause 0 items to be created (confirms the bug scenario)',
  itemsCreatedWithMismatch === 0,
  `Expected 0 items created with mismatched names, got ${itemsCreatedWithMismatch}`
);

// Matching names work correctly
const AI_ITEMS_MATCHING = [
  { teamName: 'Proteins', name: 'Roast Turkey' },
  { teamName: 'Sides', name: 'Roast Potatoes' },
  { teamName: 'Drinks', name: 'Sparkling Water' },
];

const itemsCreatedWithMatch = simulateItemFilter(AI_TEAMS, AI_ITEMS_MATCHING);
assert(
  'matching teamNames produce expected item count (confirms happy path works)',
  itemsCreatedWithMatch === 3,
  `Expected 3 items created with matching names, got ${itemsCreatedWithMatch}`
);

// ---------------------------------------------------------------------------
// Suite 3: findMissingTeamNames detects initial plan mismatches
//
// findMissingTeamNames (added in GTC-024) can be used in the initial gen path
// to detect mismatches. These assertions confirm the detection logic works.
// ---------------------------------------------------------------------------
console.log(
  `\n${YELLOW_COLOR}Suite 3: findMissingTeamNames detects mismatches in the initial plan scenario${RESET}`
);

const aiTeamNames = AI_TEAMS.map((t) => t.name);

const missingNames = findMissingTeamNames(AI_ITEMS_MISMATCHED, aiTeamNames);
assert(
  'findMissingTeamNames detects all 3 mismatched teamNames',
  missingNames.length === 3,
  `Expected 3 missing names, got ${missingNames.length}: ${missingNames.join(', ')}`
);
assert('detects "Protein Team" as missing (not "Proteins")', missingNames.includes('Protein Team'));
assert('detects "Side Dishes" as missing (not "Sides")', missingNames.includes('Side Dishes'));
assert('detects "Beverages" as missing (not "Drinks")', missingNames.includes('Beverages'));

const noMissing = findMissingTeamNames(AI_ITEMS_MATCHING, aiTeamNames);
assert(
  'returns empty array when all teamNames match (no false positives)',
  noMissing.length === 0,
  `Expected 0 missing names for matching items, got ${noMissing.length}`
);

assert(
  'itemsCreated === 0 and items.length > 0 is detectable via findMissingTeamNames',
  itemsCreatedWithMismatch === 0 && AI_ITEMS_MISMATCHED.length > 0 && missingNames.length > 0,
  'The 422 trigger condition (0 items created, items exist) should always coincide with mismatch detection'
);

// ---------------------------------------------------------------------------
// Suite 4: Route file — must return 422 when initial plan produces 0 items
//
// RED: The current route returns { success: true } even when itemsCreated === 0
// and aiResponse.items.length > 0. After fix the route must contain a 422 path
// in the initial gen code path.
// ---------------------------------------------------------------------------
console.log(
  `\n${YELLOW_COLOR}Suite 4: generate route must return 422 on initial plan item mismatch${RESET}`
);

const routePath = path.join(__dirname, '../src/app/api/events/[id]/generate/route.ts');
const routeContent = fs.readFileSync(routePath, 'utf8');

// ── RED assertion ──
// Before fix: the route has no 422 status code in the initial gen path.
// After fix: the route checks itemsCreated === 0 + items.length > 0 and returns 422.
assert(
  'route contains 422 status for team name mismatch in initial plan generation',
  /status:\s*422/.test(routeContent),
  'Expected generate route to return { status: 422 } when initial plan produces 0 items'
);

assert(
  'route checks itemsCreated === 0 condition before returning success',
  /itemsCreated\s*===\s*0/.test(routeContent),
  'Expected route to check itemsCreated === 0 before returning success'
);

assert(
  'route uses findMissingTeamNames or equivalent to detect mismatch',
  routeContent.includes('findMissingTeamNames') || routeContent.includes('missingTeamNames'),
  'Expected route to call findMissingTeamNames or reference missingTeamNames'
);

// Regression: selective regen path must still have its 422 guard (from GTC-024)
assert(
  'selective regen path still has 422 guard (GTC-024 regression check)',
  (routeContent.match(/status:\s*422/g) || []).length >= 2,
  'Expected at least 2 occurrences of { status: 422 } — one for selective regen (GTC-024) and one for initial gen (GTC-030)'
);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${YELLOW_COLOR}=== Test Summary ===${RESET}`);
console.log(`Total tests: ${passed + failed}`);
console.log(`${GREEN_COLOR}Passed: ${passed}${RESET}`);
console.log(`${RED_COLOR}Failed: ${failed}${RESET}`);

if (failed > 0) {
  console.error(`\n${RED_COLOR}✗ Tests failed${RESET}`);
  process.exit(1);
} else {
  console.log(`\n${GREEN_COLOR}${BOLD}✓ All tests passed!${RESET}`);
}
