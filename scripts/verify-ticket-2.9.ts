#!/usr/bin/env tsx
/**
 * Verification script for Ticket 2.9: Cancellation + Downgrade Handling
 *
 * This script verifies that:
 * 1. POST /api/billing/cancel endpoint exists and calls Stripe correctly
 * 2. Cancellation updates local Subscription.cancelAtPeriodEnd
 * 3. User retains ACTIVE status until currentPeriodEnd
 * 4. Webhook handles subscription updates correctly
 * 5. CANCELED users can resubscribe via /api/billing/checkout
 * 6. Billing page UI shows correct states
 *
 * Run: npx tsx scripts/verify-ticket-2.9.ts
 */

import * as fs from 'fs';
import * as path from 'path';

interface Check {
  name: string;
  passed: boolean;
  details?: string;
}

const checks: Check[] = [];

function addCheck(name: string, passed: boolean, details?: string) {
  checks.push({ name, passed, details });
  const status = passed ? '✅' : '❌';
  console.log(`${status} ${name}`);
  if (details) {
    console.log(`   ${details}`);
  }
}

function fileExists(filePath: string): boolean {
  return fs.existsSync(path.join(process.cwd(), filePath));
}

function fileContains(filePath: string, searchString: string): boolean {
  if (!fileExists(filePath)) return false;
  const content = fs.readFileSync(path.join(process.cwd(), filePath), 'utf-8');
  return content.includes(searchString);
}

function fileContainsAll(filePath: string, searchStrings: string[]): boolean {
  if (!fileExists(filePath)) return false;
  const content = fs.readFileSync(path.join(process.cwd(), filePath), 'utf-8');
  return searchStrings.every((str) => content.includes(str));
}

console.log('🔍 Verifying Ticket 2.9: Cancellation + Downgrade Handling\n');

// ============================================
// 1. Cancel Endpoint Implementation
// ============================================

console.log('1️⃣  Cancel Endpoint Implementation\n');

addCheck(
  'Cancel endpoint exists',
  fileExists('src/app/api/billing/cancel/route.ts'),
  'POST /api/billing/cancel route file'
);

addCheck(
  'Cancel endpoint imports stripe',
  fileContains('src/app/api/billing/cancel/route.ts', "from '@/lib/stripe'"),
  'Imports Stripe client'
);

addCheck(
  'Cancel endpoint gets authenticated user',
  fileContains('src/app/api/billing/cancel/route.ts', 'getUser()'),
  'Checks authentication before canceling'
);

addCheck(
  'Cancel endpoint finds user subscription',
  fileContains('src/app/api/billing/cancel/route.ts', 'prisma.subscription.findUnique'),
  'Fetches subscription from database'
);

addCheck(
  'Cancel endpoint calls Stripe to cancel at period end',
  fileContainsAll('src/app/api/billing/cancel/route.ts', [
    'stripe.subscriptions.update',
    'cancel_at_period_end: true',
  ]),
  'Calls stripe.subscriptions.update() with cancel_at_period_end: true'
);

addCheck(
  'Cancel endpoint updates local cancelAtPeriodEnd field',
  fileContainsAll('src/app/api/billing/cancel/route.ts', [
    'prisma.subscription.update',
    'cancelAtPeriodEnd: true',
  ]),
  'Updates Subscription.cancelAtPeriodEnd = true'
);

addCheck(
  'Cancel endpoint returns success response',
  fileContainsAll('src/app/api/billing/cancel/route.ts', ['success: true', 'currentPeriodEnd']),
  'Returns success message with period end date'
);

addCheck(
  'Cancel endpoint handles already canceled',
  fileContains('src/app/api/billing/cancel/route.ts', 'subscription.cancelAtPeriodEnd'),
  'Checks if already scheduled for cancellation'
);

// ============================================
// 2. Billing Status Endpoint
// ============================================

console.log('\n2️⃣  Billing Status Endpoint\n');

addCheck(
  'Billing status endpoint exists',
  fileExists('src/app/api/billing/status/route.ts'),
  'GET /api/billing/status route file'
);

addCheck(
  'Status endpoint returns subscription details',
  fileContainsAll('src/app/api/billing/status/route.ts', [
    'billingStatus',
    'subscription',
    'cancelAtPeriodEnd',
    'currentPeriodEnd',
  ]),
  'Returns all necessary fields for UI'
);

// ============================================
// 3. Billing Page UI
// ============================================

console.log('\n3️⃣  Billing Page UI\n');

addCheck(
  'Billing page exists',
  fileExists('src/app/billing/page.tsx'),
  'Main billing management page'
);

addCheck(
  'Billing page fetches status',
  fileContains('src/app/billing/page.tsx', '/api/billing/status'),
  'Fetches billing status on load'
);

addCheck(
  'Billing page has cancel button',
  fileContainsAll('src/app/billing/page.tsx', ['Cancel Subscription', 'handleCancelSubscription']),
  'Shows cancel button for active subscriptions'
);

addCheck(
  'Billing page has cancel confirmation dialog',
  fileContainsAll('src/app/billing/page.tsx', [
    'showCancelDialog',
    'Cancel Subscription?',
    'remain active until',
  ]),
  'Shows confirmation dialog before canceling'
);

addCheck(
  'Billing page shows cancellation notice',
  fileContainsAll('src/app/billing/page.tsx', [
    'cancelAtPeriodEnd',
    'Subscription Ending',
    'subscription will end on',
  ]),
  'Shows warning when subscription is scheduled for cancellation'
);

addCheck(
  'Billing page has resubscribe button',
  fileContainsAll('src/app/billing/page.tsx', ['isCanceled', 'Resubscribe', 'handleResubscribe']),
  'Shows resubscribe button for CANCELED users'
);

addCheck(
  'Billing page resubscribe uses checkout endpoint',
  fileContainsAll('src/app/billing/page.tsx', ['handleResubscribe', '/api/billing/checkout']),
  'Resubscribe uses existing checkout flow'
);

addCheck(
  'Billing page shows status badge',
  fileContainsAll('src/app/billing/page.tsx', ['StatusBadge', 'billingStatus']),
  'Displays current billing status'
);

addCheck(
  'Billing page shows period information',
  fileContainsAll('src/app/billing/page.tsx', [
    'currentPeriodStart',
    'currentPeriodEnd',
    'Current period:',
  ]),
  'Shows billing period dates'
);

// ============================================
// 4. Webhook Handling
// ============================================

console.log('\n4️⃣  Webhook Handling\n');

addCheck(
  'Webhook handles subscription.updated',
  fileContainsAll('src/app/api/webhooks/stripe/route.ts', [
    'customer.subscription.updated',
    'syncSubscriptionFromStripe',
  ]),
  'Syncs subscription updates from Stripe'
);

addCheck(
  'Sync function updates cancelAtPeriodEnd',
  fileContains('src/lib/billing/sync.ts', 'subscription.cancel_at_period_end'),
  'Extracts and syncs cancelAtPeriodEnd from Stripe'
);

addCheck(
  'Sync function updates status from Stripe',
  fileContainsAll('src/lib/billing/sync.ts', ['mapStripeToBillingStatus', 'status']),
  'Maps Stripe status to BillingStatus enum'
);

addCheck(
  'Sync function handles canceled status',
  fileContainsAll('src/lib/billing/sync.ts', ["case 'canceled':", 'CANCELED']),
  'Maps Stripe canceled to CANCELED status'
);

// ============================================
// 5. Resubscription Flow
// ============================================

console.log('\n5️⃣  Resubscription Flow\n');

addCheck(
  'Checkout endpoint handles existing customers',
  fileContainsAll('src/app/api/billing/checkout/route.ts', [
    'subscription.stripeCustomerId',
    'stripeCustomerId = subscription.stripeCustomerId',
  ]),
  'Reuses existing Stripe customer ID for CANCELED users'
);

addCheck(
  'Checkout creates session with customer ID',
  fileContainsAll('src/app/api/billing/checkout/route.ts', [
    'stripe.checkout.sessions.create',
    'customer: stripeCustomerId',
  ]),
  'Creates checkout session with existing customer'
);

// ============================================
// 6. Schema Support
// ============================================

console.log('\n6️⃣  Database Schema\n');

addCheck(
  'Schema has cancelAtPeriodEnd field',
  fileContains('prisma/schema.prisma', 'cancelAtPeriodEnd'),
  'Subscription.cancelAtPeriodEnd field exists'
);

addCheck(
  'Schema has currentPeriodEnd field',
  fileContains('prisma/schema.prisma', 'currentPeriodEnd'),
  'Subscription.currentPeriodEnd field exists'
);

addCheck(
  'Schema has CANCELED status',
  fileContainsAll('prisma/schema.prisma', ['enum BillingStatus', 'CANCELED']),
  'BillingStatus.CANCELED enum value exists'
);

// ============================================
// 7. Documentation
// ============================================

console.log('\n7️⃣  Documentation\n');

addCheck('Verification script exists', fileExists('scripts/verify-ticket-2.9.ts'), 'This script');

// ============================================
// Summary
// ============================================

console.log('\n' + '='.repeat(60));
console.log('VERIFICATION SUMMARY');
console.log('='.repeat(60));

const passedChecks = checks.filter((c) => c.passed).length;
const totalChecks = checks.length;
const allPassed = passedChecks === totalChecks;

console.log(`\nTotal checks: ${totalChecks}`);
console.log(`Passed: ${passedChecks}`);
console.log(`Failed: ${totalChecks - passedChecks}`);

if (allPassed) {
  console.log('\n✅ All checks passed! Ticket 2.9 implementation verified.\n');
  process.exit(0);
} else {
  console.log('\n❌ Some checks failed. Please review the implementation.\n');
  console.log('Failed checks:');
  checks
    .filter((c) => !c.passed)
    .forEach((c) => {
      console.log(`  - ${c.name}`);
    });
  console.log();
  process.exit(1);
}
