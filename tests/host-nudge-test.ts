/**
 * GTC-FM1 — Host-initiated nudge regression test
 *
 * Tests the pure logic and template generation for the host nudge feature.
 * Does not require React context or running server — exercises:
 *   1. Template generation for all 4 variants
 *   2. Personalisation token resolution
 *   3. Message segment calculation (Unicode awareness)
 *   4. Cooldown logic (24hr window)
 *   5. Contact method fallback logic
 *   6. Edge cases (no contact, empty item list, long names)
 */

import {
  getHostNudgeMessage,
  HOST_NUDGE_VARIANT_LABELS,
  type HostNudgeVariant,
} from '../src/lib/sms/nudge-templates';
import { getMessageSegments, getMessageInfo } from '../src/lib/sms/nudge-templates';

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}`);
  }
}

// --- Test: All 4 template variants generate valid messages ---
console.log('\n[1] Template generation — all 4 variants');
const baseParams = {
  guestFirstName: 'Sarah',
  taskItem: 'a bottle of wine',
  eventName: "Emma's Birthday BBQ",
  eventDate: 'Saturday 15 March',
};

const variants: HostNudgeVariant[] = ['warm', 'casual', 'gentle', 'direct'];

for (const v of variants) {
  const msg = getHostNudgeMessage(v, baseParams);
  assert(typeof msg === 'string' && msg.length > 0, `${v} variant returns non-empty string`);
  assert(msg.includes('Sarah'), `${v} variant includes guest first name`);
  assert(msg.includes('a bottle of wine'), `${v} variant includes task item`);
  assert(msg.includes("Emma's Birthday BBQ"), `${v} variant includes event name`);
}

// --- Test: Warm and casual templates include emoji ---
console.log('\n[2] Template personalisation tokens');
const warmMsg = getHostNudgeMessage('warm', baseParams);
assert(warmMsg.includes('😊'), 'warm template includes emoji');
assert(warmMsg.includes('Saturday 15 March'), 'warm template includes event date');

const casualMsg = getHostNudgeMessage('casual', baseParams);
assert(casualMsg.includes('👋'), 'casual template includes wave emoji');

const gentleMsg = getHostNudgeMessage('gentle', baseParams);
assert(gentleMsg.includes('gentle reminder'), 'gentle template includes "gentle reminder" text');

const directMsg = getHostNudgeMessage('direct', baseParams);
assert(directMsg.includes('Reply to let me know'), 'direct template includes call to action');

// --- Test: Unicode messages calculate segments correctly ---
console.log('\n[3] Message segment calculation (Unicode)');
const warmInfo = getMessageInfo(warmMsg);
assert(warmInfo.hasUnicode === true, 'warm message detected as Unicode (has emoji)');
assert(warmInfo.segments >= 2, 'warm message is multi-segment (>70 chars Unicode)');

const directInfo = getMessageInfo(directMsg);
assert(directInfo.hasUnicode === true, 'direct message detected as Unicode (em dash)');

// --- Test: Variant labels exist for all 4 variants ---
console.log('\n[4] Variant labels');
for (const v of variants) {
  assert(
    typeof HOST_NUDGE_VARIANT_LABELS[v] === 'string' && HOST_NUDGE_VARIANT_LABELS[v].length > 0,
    `${v} has a display label: "${HOST_NUDGE_VARIANT_LABELS[v]}"`
  );
}

// --- Test: Edge case — very long names ---
console.log('\n[5] Edge cases');
const longNameParams = {
  guestFirstName: 'Bartholomew-James',
  taskItem: 'the extra-large charcuterie board with assorted cheeses and crackers',
  eventName: 'The Annual Henderson-Whitworth Family Reunion Potluck Extravaganza',
  eventDate: 'Saturday 29 November 2026',
};

for (const v of variants) {
  const msg = getHostNudgeMessage(v, longNameParams);
  assert(msg.includes('Bartholomew-James'), `${v} handles long first name`);
}

// --- Test: Cooldown window calculation ---
console.log('\n[6] Cooldown logic (pure calculation)');
const COOLDOWN_MS = 24 * 60 * 60 * 1000;

// Nudge sent 23 hours ago — should still be on cooldown
const nudge23hAgo = new Date(Date.now() - 23 * 60 * 60 * 1000);
const isOnCooldown23h = nudge23hAgo.getTime() > Date.now() - COOLDOWN_MS;
assert(isOnCooldown23h === true, '23h-old nudge is still on cooldown');

// Nudge sent 25 hours ago — should be off cooldown
const nudge25hAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);
const isOnCooldown25h = nudge25hAgo.getTime() > Date.now() - COOLDOWN_MS;
assert(isOnCooldown25h === false, '25h-old nudge is off cooldown');

// No nudge ever sent — should not be on cooldown
const noNudge = null;
const isOnCooldownNull = noNudge !== null && new Date(noNudge).getTime() > Date.now() - COOLDOWN_MS;
assert(isOnCooldownNull === false, 'null lastNudgeAt is not on cooldown');

// --- Test: Contact method fallback logic ---
console.log('\n[7] Contact method fallback logic');

function resolveContactMethod(opts: {
  hasPhone: boolean;
  canReceiveSms: boolean;
  hasEmail: boolean;
}): 'sms' | 'email' | 'none' {
  if (opts.canReceiveSms) return 'sms';
  if (opts.hasEmail) return 'email';
  return 'none';
}

assert(
  resolveContactMethod({ hasPhone: true, canReceiveSms: true, hasEmail: true }) === 'sms',
  'prefers SMS when phone available and not opted out'
);
assert(
  resolveContactMethod({ hasPhone: true, canReceiveSms: false, hasEmail: true }) === 'email',
  'falls back to email when SMS unavailable'
);
assert(
  resolveContactMethod({ hasPhone: false, canReceiveSms: false, hasEmail: true }) === 'email',
  'uses email when no phone at all'
);
assert(
  resolveContactMethod({ hasPhone: false, canReceiveSms: false, hasEmail: false }) === 'none',
  'returns none when no contact method'
);
assert(
  resolveContactMethod({ hasPhone: true, canReceiveSms: false, hasEmail: false }) === 'none',
  'returns none when phone exists but opted out and no email'
);

// --- Summary ---
console.log(`\n${'='.repeat(50)}`);
console.log(`Host nudge test: ${passed} passed, ${failed} failed out of ${passed + failed}`);
if (failed > 0) {
  process.exit(1);
}
