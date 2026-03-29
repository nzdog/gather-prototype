/**
 * GTC-024 — Plan/Generate: Regen All returns 0 items
 *
 * Three root causes under test:
 *
 * 1. buildItemsToRegenerate() did not attach a .team back-reference to items.
 *    generateMockSelectiveItems() reads item.team?.name — without .team, every item got
 *    teamName:'Unknown'. The generate route then skipped all items (no team named 'Unknown'
 *    exists in the DB), producing 0 items with no error surfaced.
 *
 * 2. The generate route silently discarded items with unresolvable team names via
 *    `if (!team) continue`. The response still returned success with 0 items.
 *    findMissingTeamNames() extracts the detection logic so it can be called before
 *    inserting items, allowing the route to return an error instead.
 *
 * 3. The selective regeneration system prompt did not explicitly instruct Claude to use
 *    only the exact existing team names. Claude could invent new names that don't match
 *    any team in the DB, triggering the same silent-discard path as bug (1).
 *
 * RED state before fix:
 *   Suite 1 assertion 5 fails — buildItemsToRegenerate items have no .team property
 *   Suite 3 assertion 1 fails — prompt lacks explicit "use only existing team names" rule
 *
 * Test strategy: pure function tests, no DB required.
 */

import {
  buildItemsToRegenerate,
  generateMockSelectiveItems,
  findMissingTeamNames,
} from '../src/lib/ai/generate';
import { SELECTIVE_REGENERATION_SYSTEM_PROMPT } from '../src/lib/ai/prompts';

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

const EXISTING_TEAM_NAMES = ['Mains Team', 'Supplies Team', 'Drinks Team'];

const MOCK_TEAMS = [
  {
    id: 'team-1',
    name: 'Mains Team',
    items: [
      { id: 'item-1', name: 'Burger Buns', teamId: 'team-1' },
      { id: 'item-2', name: 'Pasta', teamId: 'team-1' },
    ],
  },
  {
    id: 'team-2',
    name: 'Supplies Team',
    items: [{ id: 'item-3', name: 'Paper Plates', teamId: 'team-2' }],
  },
];

console.log('\x1b[33m=== GTC-024: Regen All returns 0 items — Regression Tests ===\x1b[0m\n');

// ---------------------------------------------------------------------------
// Suite 1: buildItemsToRegenerate — must attach .team back-reference
// ---------------------------------------------------------------------------
console.log('\x1b[33mSuite 1: buildItemsToRegenerate must attach .team.name to each item\x1b[0m');

// Build items for all IDs (simulates "Regen All")
const allIds = ['item-1', 'item-2', 'item-3'];
const builtItems = buildItemsToRegenerate(MOCK_TEAMS, allIds);

assert('returns all 3 items when all IDs passed', builtItems.length === 3);
assert(
  'filters correctly — only requested IDs returned',
  builtItems.every((i) => allIds.includes(i.id))
);

// Subset test
const subsetItems = buildItemsToRegenerate(MOCK_TEAMS, ['item-1', 'item-3']);
assert('returns 2 items when 2 IDs requested', subsetItems.length === 2);
assert(
  'does not include item-2 when not in regenerateIds',
  !subsetItems.some((i) => i.id === 'item-2')
);

// ── RED assertion ──
// Without the .team back-reference fix, items have no .team property.
// generateMockSelectiveItems then produces teamName:'Unknown', which is not in the DB.
// The generate route skips every item → 0 items created.
assert(
  'each built item has a .team property with .name (no .team means mock falls to "Unknown")',
  builtItems.every((i) => typeof (i as any).team?.name === 'string' && (i as any).team.name !== '')
);

// ---------------------------------------------------------------------------
// Suite 2: generateMockSelectiveItems + findMissingTeamNames — end-to-end mock path
// ---------------------------------------------------------------------------
console.log(
  '\n\x1b[33mSuite 2: Mock path — items from buildItemsToRegenerate must resolve to known team names\x1b[0m'
);

const mockResult = generateMockSelectiveItems(builtItems);

assert(
  'mock produces same number of items as input',
  mockResult.items.length === builtItems.length
);
assert(
  'mock items do not have teamName "Unknown" when .team.name is present',
  mockResult.items.every((i) => i.teamName !== 'Unknown')
);
assert(
  'mock item teamNames match known teams (findMissingTeamNames returns empty)',
  findMissingTeamNames(mockResult.items, EXISTING_TEAM_NAMES).length === 0
);

// Confirm the pre-fix path still produces 'Unknown' when .team is absent
// (documents the bug trigger for future reference)
const preFix_items = MOCK_TEAMS.flatMap((t) => t.items); // no .team attached — pre-fix shape
const preFix_mockResult = generateMockSelectiveItems(preFix_items);
assert(
  'pre-fix items (no .team ref) produce teamName "Unknown" — confirms the bug trigger',
  preFix_mockResult.items.every((i) => i.teamName === 'Unknown')
);
assert(
  'findMissingTeamNames detects "Unknown" as missing — would have caused silent 0-item drop',
  findMissingTeamNames(preFix_mockResult.items, EXISTING_TEAM_NAMES).includes('Unknown')
);

// ---------------------------------------------------------------------------
// Suite 3: findMissingTeamNames — mismatch detection (replaces silent discard)
// ---------------------------------------------------------------------------
console.log(
  '\n\x1b[33mSuite 3: findMissingTeamNames must identify all team name mismatches\x1b[0m'
);

assert(
  'returns empty array when all teamNames match existing teams',
  findMissingTeamNames(
    [{ teamName: 'Mains Team' }, { teamName: 'Supplies Team' }],
    EXISTING_TEAM_NAMES
  ).length === 0
);

const unknownTeam = findMissingTeamNames(
  [{ teamName: 'Unknown' }, { teamName: 'Mains Team' }],
  EXISTING_TEAM_NAMES
);
assert('detects "Unknown" as a missing team name', unknownTeam.includes('Unknown'));
assert('does not flag "Mains Team" as missing', !unknownTeam.includes('Mains Team'));

assert(
  'deduplicates — 3 items with "Unknown" → 1 missing entry',
  findMissingTeamNames(
    [{ teamName: 'Unknown' }, { teamName: 'Unknown' }, { teamName: 'Unknown' }],
    EXISTING_TEAM_NAMES
  ).length === 1
);

assert(
  'detects multiple distinct missing names in one call',
  findMissingTeamNames(
    [{ teamName: 'Unknown' }, { teamName: 'Ghost Team' }, { teamName: 'Drinks Team' }],
    EXISTING_TEAM_NAMES
  ).length === 2
);

// ---------------------------------------------------------------------------
// Suite 4: Selective regeneration prompt — explicit team name constraint
// ---------------------------------------------------------------------------
console.log(
  '\n\x1b[33mSuite 4: Selective regeneration prompt must explicitly restrict Claude to existing team names\x1b[0m'
);

// ── RED assertion ──
// The current prompt says "Keep the same categories/teams as the items you're replacing"
// and the output field says "must match the team from the item being replaced".
// Neither explicitly forbids inventing new team names not present in the regenerate list.
// Claude can and does generate items with team names that don't match any existing team,
// triggering the same silent-discard path.
// After fix the prompt must include an explicit "use only the exact team names" instruction.
assert(
  'prompt explicitly instructs Claude to use only existing team names (contains "use only" or "only use" near "team name")',
  /use only.{0,60}team.{0,20}name/i.test(SELECTIVE_REGENERATION_SYSTEM_PROMPT) ||
    /only use.{0,60}team.{0,20}name/i.test(SELECTIVE_REGENERATION_SYSTEM_PROMPT) ||
    /team.{0,20}name.{0,60}must (be|use|match) (one of|exact|the same)/i.test(
      SELECTIVE_REGENERATION_SYSTEM_PROMPT
    ) ||
    /do not.{0,40}(invent|create|add).{0,40}team/i.test(SELECTIVE_REGENERATION_SYSTEM_PROMPT)
);

// Existing constraints that should be retained after the prompt fix
assert(
  'prompt retains rule to not duplicate confirmed items',
  SELECTIVE_REGENERATION_SYSTEM_PROMPT.toLowerCase().includes('do not') &&
    SELECTIVE_REGENERATION_SYSTEM_PROMPT.toLowerCase().includes('confirmed')
);
assert(
  'prompt retains JSON output format instruction',
  SELECTIVE_REGENERATION_SYSTEM_PROMPT.toLowerCase().includes('return only valid json')
);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n\x1b[33m=== Test Summary ===\x1b[0m`);
console.log(`Total tests: ${passed + failed}`);
console.log(`\x1b[32mPassed: ${passed}\x1b[0m`);
console.log(`\x1b[31mFailed: ${failed}\x1b[0m`);

if (failed > 0) {
  console.error('\n\x1b[31m✗ Tests failed\x1b[0m');
  process.exit(1);
} else {
  console.log('\n\x1b[32m\x1b[1m✓ All tests passed!\x1b[0m');
}
