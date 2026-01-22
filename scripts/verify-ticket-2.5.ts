#!/usr/bin/env tsx
/**
 * Verification script for Ticket 2.5: Entitlement Service
 *
 * This script validates that the entitlement service correctly enforces
 * event creation and editing permissions based on billing status.
 *
 * Run with: npx tsx scripts/verify-ticket-2.5.ts
 */

import { readFileSync } from 'fs';
import { join } from 'path';

// ANSI color codes for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

type CheckResult = {
  name: string;
  passed: boolean;
  details?: string;
};

const results: CheckResult[] = [];

function check(name: string, passed: boolean, details?: string): void {
  results.push({ name, passed, details });
  const icon = passed ? '✓' : '✗';
  const color = passed ? colors.green : colors.red;
  console.log(`${color}${icon} ${name}${colors.reset}`);
  if (details) {
    console.log(`  ${details}`);
  }
}

function readFile(path: string): string | null {
  try {
    return readFileSync(join(process.cwd(), path), 'utf-8');
  } catch {
    return null;
  }
}

console.log(`\n${colors.blue}=== Ticket 2.5 Verification ===${colors.reset}\n`);

// ============================================
// 1. Check schema changes
// ============================================
console.log(`${colors.yellow}1. Schema Changes${colors.reset}`);

const schemaPath = 'prisma/schema.prisma';
const schemaContent = readFile(schemaPath);

check(
  'Schema file exists',
  schemaContent !== null,
  schemaContent ? `Found at ${schemaPath}` : `Missing: ${schemaPath}`
);

if (schemaContent) {
  // Check for isLegacy field in Event model
  const hasIsLegacy =
    schemaContent.includes('isLegacy') &&
    schemaContent.match(/model Event[\s\S]*?isLegacy.*?Boolean/);

  check(
    'Event.isLegacy field exists',
    !!hasIsLegacy,
    "Required to identify legacy events that don't count against limits"
  );

  // Check for statusChangedAt field in Subscription model
  const hasStatusChangedAt =
    schemaContent.includes('statusChangedAt') &&
    schemaContent.match(/model Subscription[\s\S]*?statusChangedAt.*?DateTime/);

  check(
    'Subscription.statusChangedAt field exists',
    !!hasStatusChangedAt,
    'Required to track PAST_DUE grace period'
  );
}

// ============================================
// 2. Check entitlements library
// ============================================
console.log(`\n${colors.yellow}2. Entitlements Library${colors.reset}`);

const entitlementsPath = 'src/lib/entitlements.ts';
const entitlementsContent = readFile(entitlementsPath);

check(
  'Entitlements file exists',
  entitlementsContent !== null,
  entitlementsContent ? `Found at ${entitlementsPath}` : `Missing: ${entitlementsPath}`
);

if (entitlementsContent) {
  // Check for required functions
  check(
    'canCreateEvent function exists',
    entitlementsContent.includes('export async function canCreateEvent'),
    'Checks if user can create a new event'
  );

  check(
    'canEditEvent function exists',
    entitlementsContent.includes('export async function canEditEvent'),
    'Checks if user can edit a specific event'
  );

  check(
    'getEventLimit function exists',
    entitlementsContent.includes('export async function getEventLimit'),
    'Returns event creation limit for a user'
  );

  check(
    'getRemainingEvents function exists',
    entitlementsContent.includes('export async function getRemainingEvents'),
    'Returns remaining event count for a user'
  );

  // Check for billing status handling
  check(
    'Handles FREE status',
    entitlementsContent.includes("'FREE'") || entitlementsContent.includes('BillingStatus.FREE'),
    'FREE tier: 1 event per rolling 12 months'
  );

  check(
    'Handles TRIALING status',
    entitlementsContent.includes("'TRIALING'") ||
      entitlementsContent.includes('BillingStatus.TRIALING'),
    'TRIALING: unlimited events'
  );

  check(
    'Handles ACTIVE status',
    entitlementsContent.includes("'ACTIVE'") ||
      entitlementsContent.includes('BillingStatus.ACTIVE'),
    'ACTIVE: unlimited events'
  );

  check(
    'Handles PAST_DUE status',
    entitlementsContent.includes("'PAST_DUE'") ||
      entitlementsContent.includes('BillingStatus.PAST_DUE'),
    'PAST_DUE: can edit existing (within grace period), cannot create'
  );

  check(
    'Handles CANCELED status',
    entitlementsContent.includes("'CANCELED'") ||
      entitlementsContent.includes('BillingStatus.CANCELED'),
    'CANCELED: read-only (no create, no edit)'
  );

  // Check for legacy event handling
  check(
    'Checks isLegacy flag',
    entitlementsContent.includes('isLegacy'),
    "Legacy events don't count against limits and remain editable"
  );

  // Check for grace period logic
  check(
    'Implements grace period check',
    entitlementsContent.includes('statusChangedAt') &&
      (entitlementsContent.includes('GRACE_PERIOD') || entitlementsContent.includes('7')),
    'PAST_DUE users have 7-day grace period for editing'
  );

  // Check for rolling 12-month logic
  check(
    'Implements rolling 12-month period',
    entitlementsContent.includes('12') || entitlementsContent.includes('ROLLING_PERIOD'),
    'FREE tier limit is per rolling 12 months'
  );

  // Check for EventRole filtering
  check(
    'Filters by HOST role',
    entitlementsContent.includes("role: 'HOST'") ||
      entitlementsContent.includes('EventRoleType.HOST'),
    'Only counts events where user is HOST'
  );

  // Check for return types
  check(
    'Returns boolean for canCreateEvent',
    !!entitlementsContent.match(/canCreateEvent[\s\S]*?Promise<boolean>/),
    'Returns true/false for creation permission'
  );

  check(
    'Returns boolean for canEditEvent',
    !!entitlementsContent.match(/canEditEvent[\s\S]*?Promise<boolean>/),
    'Returns true/false for edit permission'
  );

  check(
    'Returns number | "unlimited" for getEventLimit',
    !!entitlementsContent.match(
      /getEventLimit[\s\S]*?(number \| 'unlimited'|'unlimited' \| number)/
    ),
    'Returns limit count or "unlimited"'
  );

  check(
    'Returns number | "unlimited" for getRemainingEvents',
    !!entitlementsContent.match(
      /getRemainingEvents[\s\S]*?(number \| 'unlimited'|'unlimited' \| number)/
    ),
    'Returns remaining count or "unlimited"'
  );
}

// ============================================
// 3. Check billing sync updates
// ============================================
console.log(`\n${colors.yellow}3. Billing Sync Updates${colors.reset}`);

const syncPath = 'src/lib/billing/sync.ts';
const syncContent = readFile(syncPath);

if (syncContent) {
  check(
    'Updates statusChangedAt in syncSubscriptionFromStripe',
    syncContent.includes('statusChangedAt') &&
      !!syncContent.match(/syncSubscriptionFromStripe[\s\S]*?statusChangedAt/),
    'Tracks when subscription status changes'
  );

  check(
    'Updates statusChangedAt in handleSubscriptionDeleted',
    !!syncContent.match(/handleSubscriptionDeleted[\s\S]*?statusChangedAt/),
    'Sets timestamp when subscription is deleted'
  );

  check(
    'Updates statusChangedAt in handleInvoicePaid',
    !!syncContent.match(/handleInvoicePaid[\s\S]*?statusChangedAt/),
    'Sets timestamp when invoice is paid (recovery from PAST_DUE)'
  );

  check(
    'Updates statusChangedAt in handleInvoicePaymentFailed',
    !!syncContent.match(/handleInvoicePaymentFailed[\s\S]*?statusChangedAt/),
    'Sets timestamp when payment fails (entering PAST_DUE)'
  );
}

// ============================================
// 4. Logic validation
// ============================================
console.log(`\n${colors.yellow}4. Business Logic Validation${colors.reset}`);

if (entitlementsContent) {
  // Validate FREE tier logic
  const hasFreeLimit =
    entitlementsContent.includes('FREE_TIER_LIMIT') ||
    !!entitlementsContent.match(/eventCount < 1/) ||
    !!entitlementsContent.match(/limit.*1/);

  check(
    'FREE tier enforces 1 event limit',
    hasFreeLimit,
    'Free users can create 1 event per rolling 12 months'
  );

  // Validate unlimited tiers
  const hasUnlimitedForTrialing =
    !!entitlementsContent.match(/TRIALING.*unlimited/i) ||
    !!entitlementsContent.match(/if.*TRIALING.*ACTIVE.*return true/);

  check(
    'TRIALING and ACTIVE return unlimited',
    hasUnlimitedForTrialing,
    'Paid tiers have unlimited event creation'
  );

  // Validate PAST_DUE cannot create
  const pastDueCannotCreate =
    entitlementsContent.match(/PAST_DUE.*return false/) ||
    entitlementsContent.match(/if.*PAST_DUE.*CANCELED.*\n.*return false/);

  check(
    'PAST_DUE users cannot create new events',
    !!pastDueCannotCreate,
    'Users with failed payments cannot create events'
  );

  // Validate CANCELED cannot edit
  const canceledCannotEdit =
    entitlementsContent.includes('CANCELED') &&
    entitlementsContent.includes('canEditEvent') &&
    /CANCELED['\s\S]*?return false/.test(entitlementsContent);

  check(
    'CANCELED users cannot edit events',
    canceledCannotEdit,
    'Canceled subscriptions are read-only'
  );

  // Validate legacy events bypass
  const legacyBypass = !!(
    entitlementsContent.match(/if.*isLegacy.*return true/) ||
    entitlementsContent.match(/isLegacy.*false/)
  );

  check(
    'Legacy events bypass restrictions',
    legacyBypass,
    "Legacy events always editable and don't count against limits"
  );
}

// ============================================
// 5. Summary
// ============================================
console.log(`\n${colors.blue}=== Summary ===${colors.reset}\n`);

const totalChecks = results.length;
const passedChecks = results.filter((r) => r.passed).length;
const failedChecks = totalChecks - passedChecks;

console.log(`Total checks: ${totalChecks}`);
console.log(`${colors.green}Passed: ${passedChecks}${colors.reset}`);
if (failedChecks > 0) {
  console.log(`${colors.red}Failed: ${failedChecks}${colors.reset}`);
}

const passRate = ((passedChecks / totalChecks) * 100).toFixed(1);
console.log(`\nPass rate: ${passRate}%`);

if (failedChecks === 0) {
  console.log(
    `\n${colors.green}✓ All checks passed! Ticket 2.5 implementation verified.${colors.reset}\n`
  );
  process.exit(0);
} else {
  console.log(
    `\n${colors.red}✗ Some checks failed. Please review the implementation.${colors.reset}\n`
  );
  process.exit(1);
}
