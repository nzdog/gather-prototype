#!/usr/bin/env tsx
/**
 * Verification Script for Ticket 2.6 — Event Creation Gate
 *
 * This script verifies that:
 * 1. POST /api/events checks canCreateEvent() before creating
 * 2. New events get isLegacy: false
 * 3. EventRole is created for user as HOST
 * 4. PATCH /api/events/[id] checks canEditEvent()
 * 5. DELETE /api/events/[id] checks canEditEvent()
 * 6. /plan/new page checks entitlement on load
 * 7. GET /api/entitlements/check-create works correctly
 */

import fs from 'fs';
import path from 'path';

interface CheckResult {
  name: string;
  passed: boolean;
  details?: string;
}

const results: CheckResult[] = [];

function check(name: string, condition: boolean, details?: string): void {
  results.push({ name, passed: condition, details });
  const status = condition ? '✅' : '❌';
  console.log(`${status} ${name}`);
  if (details && !condition) {
    console.log(`   ${details}`);
  }
}

function readFile(filePath: string): string {
  const fullPath = path.join(process.cwd(), filePath);
  return fs.readFileSync(fullPath, 'utf-8');
}

function fileExists(filePath: string): boolean {
  const fullPath = path.join(process.cwd(), filePath);
  return fs.existsSync(fullPath);
}

console.log('🔍 Verifying Ticket 2.6 Implementation — Event Creation Gate\n');
console.log('═'.repeat(70) + '\n');

// ============================================================================
// Check 1: POST /api/events imports canCreateEvent
// ============================================================================
console.log('📝 Check 1: POST /api/events Configuration');
const eventsRouteContent = readFile('src/app/api/events/route.ts');

check(
  'POST /api/events imports canCreateEvent',
  eventsRouteContent.includes('import { canCreateEvent }') &&
    eventsRouteContent.includes("from '@/lib/entitlements'")
);

// ============================================================================
// Check 2: POST /api/events checks authentication
// ============================================================================
check(
  'POST /api/events gets authenticated user',
  eventsRouteContent.includes('const user = await getUser()') &&
    eventsRouteContent.includes('status: 401')
);

// ============================================================================
// Check 3: POST /api/events checks canCreateEvent
// ============================================================================
check(
  'POST /api/events checks canCreateEvent()',
  eventsRouteContent.includes('await canCreateEvent(user.id)') ||
    eventsRouteContent.includes('await canCreateEvent(userId)')
);

// ============================================================================
// Check 4: POST /api/events returns 403 when blocked
// ============================================================================
check(
  'POST /api/events returns 403 with proper error when blocked',
  eventsRouteContent.includes("error: 'Event limit reached'") &&
    eventsRouteContent.includes("reason: 'FREE_LIMIT'") &&
    eventsRouteContent.includes("upgradeUrl: '/billing/upgrade'") &&
    eventsRouteContent.includes('status: 403')
);

// ============================================================================
// Check 5: POST /api/events sets isLegacy: false
// ============================================================================
check(
  'POST /api/events sets isLegacy: false on new events',
  eventsRouteContent.includes('isLegacy: false')
);

// ============================================================================
// Check 6: POST /api/events creates EventRole
// ============================================================================
check(
  'POST /api/events creates EventRole for user as HOST',
  eventsRouteContent.includes('eventRole.create') && eventsRouteContent.includes("role: 'HOST'")
);

// ============================================================================
// Check 7: PATCH /api/events/[id] imports canEditEvent
// ============================================================================
console.log('\n📝 Check 7: PATCH /api/events/[id] Configuration');
const eventIdRouteContent = readFile('src/app/api/events/[id]/route.ts');

check(
  'PATCH /api/events/[id] imports canEditEvent',
  eventIdRouteContent.includes('import { canEditEvent }') &&
    eventIdRouteContent.includes("from '@/lib/entitlements'")
);

// ============================================================================
// Check 8: PATCH /api/events/[id] checks authentication
// ============================================================================
check(
  'PATCH /api/events/[id] gets authenticated user',
  eventIdRouteContent.includes('const user = await getUser()') &&
    eventIdRouteContent.match(/PATCH[\s\S]*?status: 401/) !== null
);

// ============================================================================
// Check 9: PATCH /api/events/[id] checks canEditEvent
// ============================================================================
check(
  'PATCH /api/events/[id] checks canEditEvent()',
  eventIdRouteContent.match(/PATCH[\s\S]*?canEditEvent\(user\.id, eventId\)/) !== null ||
    eventIdRouteContent.match(/PATCH[\s\S]*?canEditEvent\(userId, eventId\)/) !== null
);

// ============================================================================
// Check 10: PATCH /api/events/[id] returns 403 when blocked
// ============================================================================
check(
  'PATCH /api/events/[id] returns 403 when edit not allowed',
  eventIdRouteContent.match(/PATCH[\s\S]*?status: 403/) !== null &&
    eventIdRouteContent.includes("error: 'Cannot edit event'")
);

// ============================================================================
// Check 11: DELETE /api/events/[id] checks authentication
// ============================================================================
console.log('\n📝 Check 11: DELETE /api/events/[id] Configuration');
check(
  'DELETE /api/events/[id] gets authenticated user',
  eventIdRouteContent.match(/DELETE[\s\S]*?const user = await getUser\(\)/) !== null
);

// ============================================================================
// Check 12: DELETE /api/events/[id] checks canEditEvent
// ============================================================================
check(
  'DELETE /api/events/[id] checks canEditEvent()',
  eventIdRouteContent.match(/DELETE[\s\S]*?canEditEvent\(user\.id, eventId\)/) !== null ||
    eventIdRouteContent.match(/DELETE[\s\S]*?canEditEvent\(userId, eventId\)/) !== null
);

// ============================================================================
// Check 13: DELETE /api/events/[id] returns 403 when blocked
// ============================================================================
check(
  'DELETE /api/events/[id] returns 403 when edit not allowed',
  eventIdRouteContent.match(/DELETE[\s\S]*?status: 403/) !== null &&
    eventIdRouteContent.includes("error: 'Cannot delete event'")
);

// ============================================================================
// Check 14: /plan/new page imports useEffect
// ============================================================================
console.log('\n📝 Check 14: /plan/new Page Configuration');
const newPlanPageContent = readFile('src/app/plan/new/page.tsx');

check(
  '/plan/new page imports useEffect',
  newPlanPageContent.includes('import { useState, useEffect }') ||
    (newPlanPageContent.includes('useState') && newPlanPageContent.includes('useEffect'))
);

// ============================================================================
// Check 15: /plan/new page has canCreate state
// ============================================================================
check(
  '/plan/new page has canCreate state',
  newPlanPageContent.includes('canCreate') && newPlanPageContent.includes('setCanCreate')
);

// ============================================================================
// Check 16: /plan/new page checks entitlement on load
// ============================================================================
check(
  '/plan/new page checks entitlement on load',
  newPlanPageContent.includes('useEffect') &&
    newPlanPageContent.includes('/api/entitlements/check-create')
);

// ============================================================================
// Check 17: /plan/new page shows upgrade message when blocked
// ============================================================================
check(
  '/plan/new page shows upgrade message when blocked',
  newPlanPageContent.includes("You've used your free event this year") &&
    newPlanPageContent.includes('Upgrade for unlimited gatherings')
);

// ============================================================================
// Check 18: /plan/new page has upgrade button
// ============================================================================
check(
  '/plan/new page has upgrade button linking to /billing/upgrade',
  newPlanPageContent.includes('/billing/upgrade') && newPlanPageContent.match(/upgrade/i) !== null
);

// ============================================================================
// Check 19: GET /api/entitlements/check-create exists
// ============================================================================
console.log('\n📝 Check 19: GET /api/entitlements/check-create Endpoint');
const checkCreateExists = fileExists('src/app/api/entitlements/check-create/route.ts');

check('GET /api/entitlements/check-create endpoint exists', checkCreateExists);

// ============================================================================
// Check 20: GET /api/entitlements/check-create uses canCreateEvent
// ============================================================================
if (checkCreateExists) {
  const checkCreateContent = readFile('src/app/api/entitlements/check-create/route.ts');

  check(
    'GET /api/entitlements/check-create imports canCreateEvent',
    checkCreateContent.includes('import { canCreateEvent }') &&
      checkCreateContent.includes("from '@/lib/entitlements'")
  );

  check(
    'GET /api/entitlements/check-create checks authentication',
    checkCreateContent.includes('const user = await getUser()') &&
      checkCreateContent.includes('status: 401')
  );

  check(
    'GET /api/entitlements/check-create calls canCreateEvent',
    checkCreateContent.includes('await canCreateEvent(user.id)') ||
      checkCreateContent.includes('await canCreateEvent(userId)')
  );

  check(
    'GET /api/entitlements/check-create returns canCreate property',
    checkCreateContent.includes('canCreate:')
  );
} else {
  check('GET /api/entitlements/check-create imports canCreateEvent', false, 'File does not exist');
  check('GET /api/entitlements/check-create checks authentication', false, 'File does not exist');
  check('GET /api/entitlements/check-create calls canCreateEvent', false, 'File does not exist');
  check(
    'GET /api/entitlements/check-create returns canCreate property',
    false,
    'File does not exist'
  );
}

// ============================================================================
// Check 24: Verification script exists
// ============================================================================
console.log('\n📝 Check 24: Documentation');
check('Verification script exists (this file)', fileExists('scripts/verify-ticket-2.6.ts'));

// ============================================================================
// Summary
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('📊 VERIFICATION SUMMARY\n');

const totalChecks = results.length;
const passedChecks = results.filter((r) => r.passed).length;
const failedChecks = totalChecks - passedChecks;

console.log(`Total Checks: ${totalChecks}`);
console.log(`✅ Passed: ${passedChecks}`);
console.log(`❌ Failed: ${failedChecks}`);

if (failedChecks > 0) {
  console.log('\n⚠️  Failed Checks:');
  results
    .filter((r) => !r.passed)
    .forEach((r) => {
      console.log(`   • ${r.name}`);
      if (r.details) {
        console.log(`     ${r.details}`);
      }
    });
}

console.log('\n' + '═'.repeat(70));

if (failedChecks === 0) {
  console.log('✅ All checks passed! Ticket 2.6 implementation is complete.\n');
  process.exit(0);
} else {
  console.log(`❌ ${failedChecks} check(s) failed. Please review the implementation.\n`);
  process.exit(1);
}
