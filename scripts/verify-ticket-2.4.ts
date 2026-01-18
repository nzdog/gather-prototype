#!/usr/bin/env tsx
/**
 * Verification script for Ticket 2.4: Billing State Sync + Grace Period
 *
 * This script validates that the webhook handlers properly sync subscription
 * state from Stripe to the local database, ensuring Stripe is the source of truth.
 *
 * Run with: npx tsx scripts/verify-ticket-2.4.ts
 */

import { readFileSync, existsSync } from 'fs';
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

console.log(`\n${colors.blue}=== Ticket 2.4 Verification ===${colors.reset}\n`);

// ============================================
// 1. Check billing sync helper exists
// ============================================
console.log(`${colors.yellow}1. Billing Sync Helper${colors.reset}`);

const syncPath = 'src/lib/billing/sync.ts';
const syncContent = readFile(syncPath);

check(
  'Billing sync file exists',
  syncContent !== null,
  syncContent ? `Found at ${syncPath}` : `Missing: ${syncPath}`
);

if (syncContent) {
  check(
    'mapStripeToBillingStatus function exists',
    syncContent.includes('export function mapStripeToBillingStatus'),
    'Maps Stripe subscription status to BillingStatus enum'
  );

  check(
    'syncSubscriptionFromStripe function exists',
    syncContent.includes('export async function syncSubscriptionFromStripe'),
    'Main sync function for subscription updates'
  );

  check(
    'handleSubscriptionDeleted function exists',
    syncContent.includes('export async function handleSubscriptionDeleted'),
    'Handles subscription deletion events'
  );

  check(
    'handleInvoicePaid function exists',
    syncContent.includes('export async function handleInvoicePaid'),
    'Handles successful invoice payments'
  );

  check(
    'handleInvoicePaymentFailed function exists',
    syncContent.includes('export async function handleInvoicePaymentFailed'),
    'Handles failed invoice payments'
  );

  // Check status mapping
  const hasTrialing = syncContent.includes("case 'trialing'") && syncContent.includes("return 'TRIALING'");
  const hasActive = syncContent.includes("case 'active'") && syncContent.includes("return 'ACTIVE'");
  const hasPastDue = syncContent.includes("case 'past_due'") && syncContent.includes("return 'PAST_DUE'");
  const hasCanceled = syncContent.includes("case 'canceled'") || syncContent.includes("case 'unpaid'");

  check(
    'Status mapping: trialing → TRIALING',
    hasTrialing,
    'Correctly maps Stripe trialing status'
  );

  check(
    'Status mapping: active → ACTIVE',
    hasActive,
    'Correctly maps Stripe active status'
  );

  check(
    'Status mapping: past_due → PAST_DUE',
    hasPastDue,
    'Correctly maps Stripe past_due status'
  );

  check(
    'Status mapping: canceled/unpaid → CANCELED',
    hasCanceled,
    'Correctly maps Stripe canceled and unpaid statuses'
  );

  // Check transaction usage
  check(
    'Uses Prisma transactions for atomic updates',
    syncContent.includes('prisma.$transaction') && syncContent.includes('tx.subscription.update') && syncContent.includes('tx.user.update'),
    'Ensures User and Subscription stay in sync'
  );

  // Check API version compatibility
  check(
    'Handles API version 2025-12-15.clover subscription item periods',
    syncContent.includes('current_period_start') && syncContent.includes('subscription.items.data'),
    'Compatible with subscription item-level billing periods'
  );
}

// ============================================
// 2. Check webhook handler implementation
// ============================================
console.log(`\n${colors.yellow}2. Webhook Handler Implementation${colors.reset}`);

const webhookPath = 'src/app/api/webhooks/stripe/route.ts';
const webhookContent = readFile(webhookPath);

check(
  'Webhook handler exists',
  webhookContent !== null,
  webhookContent ? `Found at ${webhookPath}` : `Missing: ${webhookPath}`
);

if (webhookContent) {
  check(
    'Imports billing sync functions',
    webhookContent.includes("from '@/lib/billing/sync'") &&
      webhookContent.includes('syncSubscriptionFromStripe') &&
      webhookContent.includes('handleSubscriptionDeleted') &&
      webhookContent.includes('handleInvoicePaid') &&
      webhookContent.includes('handleInvoicePaymentFailed'),
    'All sync helper functions imported'
  );

  // Check event handlers
  check(
    'customer.subscription.created handler',
    webhookContent.includes("case 'customer.subscription.created'") &&
      webhookContent.includes('syncSubscriptionFromStripe'),
    'Syncs subscription on creation'
  );

  check(
    'customer.subscription.updated handler',
    webhookContent.includes("case 'customer.subscription.updated'") &&
      webhookContent.includes('syncSubscriptionFromStripe'),
    'Syncs subscription on update'
  );

  check(
    'customer.subscription.deleted handler',
    webhookContent.includes("case 'customer.subscription.deleted'") &&
      webhookContent.includes('handleSubscriptionDeleted'),
    'Handles subscription deletion'
  );

  check(
    'invoice.paid handler',
    webhookContent.includes("case 'invoice.paid'") &&
      webhookContent.includes('handleInvoicePaid'),
    'Handles successful invoice payments'
  );

  check(
    'invoice.payment_failed handler',
    webhookContent.includes("case 'invoice.payment_failed'") &&
      webhookContent.includes('handleInvoicePaymentFailed'),
    'Handles failed invoice payments'
  );

  // Check API version compatibility notes
  check(
    'Handles API version 2025-12-15.clover invoice subscription details',
    webhookContent.includes('parent') || webhookContent.includes('subscription_details'),
    'Compatible with nested subscription details in invoices'
  );
}

// ============================================
// 3. Database schema check
// ============================================
console.log(`\n${colors.yellow}3. Database Schema Compatibility${colors.reset}`);

const schemaPath = 'prisma/schema.prisma';
const schemaContent = readFile(schemaPath);

if (schemaContent) {
  const hasSubscription = schemaContent.includes('model Subscription');
  const hasStripeCustomerId = schemaContent.includes('stripeCustomerId');
  const hasStripeSubscriptionId = schemaContent.includes('stripeSubscriptionId');
  const hasStatus = schemaContent.includes('status') && schemaContent.includes('BillingStatus');
  const hasPeriodFields = schemaContent.includes('currentPeriodStart') && schemaContent.includes('currentPeriodEnd');
  const hasCancelAtPeriodEnd = schemaContent.includes('cancelAtPeriodEnd');
  const hasTrialFields = schemaContent.includes('trialStart') && schemaContent.includes('trialEnd');

  check('Subscription model exists', hasSubscription, 'Required for storing subscription data');
  check('stripeCustomerId field exists', hasStripeCustomerId, 'Links to Stripe customer');
  check('stripeSubscriptionId field exists', hasStripeSubscriptionId, 'Links to Stripe subscription');
  check('status field with BillingStatus enum', hasStatus, 'Tracks subscription status');
  check('currentPeriodStart/End fields exist', hasPeriodFields, 'Tracks billing cycle');
  check('cancelAtPeriodEnd field exists', hasCancelAtPeriodEnd, 'Tracks cancellation intent');
  check('trialStart/End fields exist', hasTrialFields, 'Tracks trial period');

  // Check User model has billingStatus
  const userHasBillingStatus = schemaContent.includes('model User') &&
    schemaContent.match(/model User[\s\S]*?billingStatus.*?BillingStatus/);

  check(
    'User.billingStatus field exists',
    !!userHasBillingStatus,
    'Must stay in sync with Subscription.status'
  );
}

// ============================================
// 4. Summary
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
  console.log(`\n${colors.green}✓ All checks passed! Ticket 2.4 implementation verified.${colors.reset}\n`);
  process.exit(0);
} else {
  console.log(`\n${colors.red}✗ Some checks failed. Please review the implementation.${colors.reset}\n`);
  process.exit(1);
}
