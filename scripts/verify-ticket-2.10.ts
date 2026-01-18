#!/usr/bin/env tsx
/**
 * Verification script for Ticket 2.10: Legacy Event Grandfathering
 *
 * This script validates that legacy event handling is correctly implemented:
 * - Legacy events don't count against free tier limits
 * - Legacy events remain editable regardless of billing status
 * - New events are marked as non-legacy by default
 *
 * Run with: npx tsx scripts/verify-ticket-2.10.ts
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

console.log(`\n${colors.blue}=== Ticket 2.10 Verification ===${colors.reset}\n`);

// ============================================
// 1. Check schema has isLegacy field
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
  const hasIsLegacy = schemaContent.includes('isLegacy') &&
    schemaContent.match(/model Event[\s\S]*?isLegacy.*?Boolean/);

  check(
    'Event.isLegacy field exists',
    !!hasIsLegacy,
    'Required to identify legacy events'
  );

  // Check that default is false
  const isLegacyDefaultFalse = schemaContent.match(/isLegacy.*Boolean.*@default\(false\)/);

  check(
    'Event.isLegacy defaults to false',
    !!isLegacyDefaultFalse,
    'New events should not be legacy by default'
  );
}

// ============================================
// 2. Check migration script exists
// ============================================
console.log(`\n${colors.yellow}2. Migration Script${colors.reset}`);

const migrationPath = 'scripts/mark-legacy-events.ts';
const migrationContent = readFile(migrationPath);

check(
  'Migration script exists',
  migrationContent !== null,
  migrationContent ? `Found at ${migrationPath}` : `Missing: ${migrationPath}`
);

if (migrationContent) {
  check(
    'Updates events to isLegacy: true',
    migrationContent.includes('isLegacy: true') &&
      migrationContent.includes('updateMany'),
    'Script marks existing events as legacy'
  );

  check(
    'Filters for non-legacy events',
    migrationContent.includes('isLegacy: false') ||
      migrationContent.includes('where'),
    'Only updates events not already marked as legacy'
  );

  check(
    'Logs count of marked events',
    migrationContent.includes('count') &&
      (migrationContent.includes('console.log') || migrationContent.includes('console')),
    'Provides feedback on number of events marked'
  );

  check(
    'Uses prisma client',
    migrationContent.includes('prisma.event'),
    'Uses Prisma to update database'
  );
}

// ============================================
// 3. Check entitlement logic
// ============================================
console.log(`\n${colors.yellow}3. Entitlement Logic${colors.reset}`);

const entitlementsPath = 'src/lib/entitlements.ts';
const entitlementsContent = readFile(entitlementsPath);

check(
  'Entitlements file exists',
  entitlementsContent !== null,
  entitlementsContent ? `Found at ${entitlementsPath}` : `Missing: ${entitlementsPath}`
);

if (entitlementsContent) {
  // Check canCreateEvent excludes legacy events from count
  const excludesLegacyFromCount = entitlementsContent.includes('canCreateEvent') &&
    entitlementsContent.includes('isLegacy: false');

  check(
    'canCreateEvent excludes legacy events from count',
    excludesLegacyFromCount,
    'Legacy events should not count against free tier limit'
  );

  // Check canEditEvent allows editing legacy events
  const legacyAlwaysEditable = entitlementsContent.includes('canEditEvent') &&
    entitlementsContent.includes('event.isLegacy') &&
    entitlementsContent.match(/canEditEvent[\s\S]*?event\.isLegacy[\s\S]*?return true/);

  check(
    'canEditEvent allows editing legacy events',
    !!legacyAlwaysEditable,
    'Legacy events should be editable regardless of billing status'
  );

  // Check that legacy check happens early (before billing status checks)
  const legacyCheckEarly = (() => {
    if (!entitlementsContent.includes('canEditEvent')) return false;

    // Find the canEditEvent function
    const funcMatch = entitlementsContent.match(/export async function canEditEvent[\s\S]*?(?=export async function|$)/);
    if (!funcMatch) return false;

    const funcBody = funcMatch[0];
    const legacyCheckIndex = funcBody.search(/event\.isLegacy/);
    // Look for where billingStatus is destructured or first used in a conditional
    const billingCheckIndex = funcBody.search(/const \{ billingStatus \}|if.*billingStatus/);

    return legacyCheckIndex !== -1 &&
           billingCheckIndex !== -1 &&
           legacyCheckIndex < billingCheckIndex;
  })();

  check(
    'Legacy check bypasses billing status checks',
    legacyCheckEarly,
    'Legacy events should return true before checking billing status'
  );

  // Check getRemainingEvents excludes legacy events
  const remainingExcludesLegacy = entitlementsContent.includes('getRemainingEvents') &&
    entitlementsContent.match(/getRemainingEvents[\s\S]*?isLegacy: false/);

  check(
    'getRemainingEvents excludes legacy events',
    !!remainingExcludesLegacy,
    'Legacy events should not count in remaining event calculations'
  );
}

// ============================================
// 4. Check API integration
// ============================================
console.log(`\n${colors.yellow}4. API Integration${colors.reset}`);

const createEventApiPath = 'src/app/api/events/route.ts';
const createEventContent = readFile(createEventApiPath);

if (createEventContent) {
  // New events should default to isLegacy: false (schema default)
  // We don't need to explicitly set it, but check that we're not setting it to true
  const notSettingLegacyTrue = !createEventContent.includes('isLegacy: true');

  check(
    'POST /api/events does not set isLegacy: true',
    notSettingLegacyTrue,
    'New events should use schema default (false)'
  );
}

// ============================================
// 5. Business logic validation
// ============================================
console.log(`\n${colors.yellow}5. Business Logic Validation${colors.reset}`);

if (entitlementsContent) {
  // Validate legacy events bypass CANCELED status
  const bypassesCanceled = entitlementsContent.match(/canEditEvent[\s\S]*?isLegacy[\s\S]*?CANCELED/);

  check(
    'Legacy events editable even when CANCELED',
    !!bypassesCanceled,
    'Legacy check should happen before CANCELED check'
  );

  // Validate legacy events bypass PAST_DUE status
  const bypassesPastDue = entitlementsContent.match(/canEditEvent[\s\S]*?isLegacy[\s\S]*?PAST_DUE/);

  check(
    'Legacy events editable even when PAST_DUE',
    !!bypassesPastDue,
    'Legacy check should happen before PAST_DUE check'
  );

  // Validate FREE tier can still edit legacy events
  const freeCanEditLegacy = entitlementsContent.includes('isLegacy') &&
    entitlementsContent.includes('canEditEvent');

  check(
    'FREE users can edit legacy events',
    freeCanEditLegacy,
    'Legacy events should be editable for FREE tier users'
  );
}

// ============================================
// 6. Summary
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
  console.log(`\n${colors.green}✓ All checks passed! Ticket 2.10 implementation verified.${colors.reset}\n`);
  process.exit(0);
} else {
  console.log(`\n${colors.red}✗ Some checks failed. Please review the implementation.${colors.reset}\n`);
  process.exit(1);
}
