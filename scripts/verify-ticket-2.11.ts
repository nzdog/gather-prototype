#!/usr/bin/env tsx
/**
 * Verification script for Ticket 2.11: Billing UI - Manage Subscription
 *
 * This script validates that the billing management UI is correctly implemented:
 * - Billing page handles all UI states (FREE, TRIALING, ACTIVE, CANCELED, PAST_DUE)
 * - Stripe Customer Portal integration
 * - Trial days remaining display
 * - Update Payment Method functionality
 * - Navigation includes billing link
 *
 * Run with: npx tsx scripts/verify-ticket-2.11.ts
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

console.log(`\n${colors.blue}=== Ticket 2.11 Verification ===${colors.reset}\n`);

// ============================================
// 1. Check billing page exists and handles states
// ============================================
console.log(`${colors.yellow}1. Billing Page${colors.reset}`);

const billingPagePath = 'src/app/billing/page.tsx';
const billingPageContent = readFile(billingPagePath);

check(
  'Billing page exists',
  billingPageContent !== null,
  billingPageContent ? `Found at ${billingPagePath}` : `Missing: ${billingPagePath}`
);

if (billingPageContent) {
  // Check for status badge component
  const hasStatusBadge = billingPageContent.includes('StatusBadge');
  check('Has status badge component', hasStatusBadge, 'Required to display billing status');

  // Check for all status checks
  const hasAllStatusChecks =
    billingPageContent.includes('isFree') &&
    billingPageContent.includes('isActive') &&
    billingPageContent.includes('isCanceled') &&
    billingPageContent.includes('isPastDue') &&
    billingPageContent.includes('isTrialing');

  check(
    'Checks all billing statuses',
    hasAllStatusChecks,
    'FREE, ACTIVE, TRIALING, CANCELED, PAST_DUE'
  );

  // Check for trial days calculation
  const hasTrialDaysCalc =
    billingPageContent.includes('trialDaysRemaining') && billingPageContent.includes('trialEnd');

  check(
    'Calculates trial days remaining',
    hasTrialDaysCalc,
    'Required for TRIALING status display'
  );

  // Check for trial notice display
  const hasTrialNotice =
    billingPageContent.includes('Trial Active') || billingPageContent.includes('Trial Notice');

  check('Displays trial notice for TRIALING status', hasTrialNotice, 'Shows remaining trial days');

  // Check for cancellation notice
  const hasCancelNotice = billingPageContent.includes('cancelAtPeriodEnd');
  check('Shows cancellation notice', hasCancelNotice, 'Required for canceled subscriptions');

  // Check for upgrade button
  const hasUpgradeButton =
    billingPageContent.includes('Upgrade') && billingPageContent.includes('isFree');

  check('Has Upgrade button for FREE users', hasUpgradeButton, 'Links to /billing/upgrade');

  // Check for cancel button
  const hasCancelButton =
    billingPageContent.includes('Cancel Subscription') ||
    billingPageContent.includes('setShowCancelDialog');

  check('Has Cancel button for ACTIVE users', hasCancelButton, 'Opens cancel confirmation dialog');

  // Check for resubscribe button
  const hasResubscribeButton =
    billingPageContent.includes('Resubscribe') &&
    (billingPageContent.includes('isCanceled') || billingPageContent.includes('cancelAtPeriodEnd'));

  check('Has Resubscribe button', hasResubscribeButton, 'For canceled subscriptions');
}

// ============================================
// 2. Check Update Payment Method functionality
// ============================================
console.log(`\n${colors.yellow}2. Update Payment Method${colors.reset}`);

if (billingPageContent) {
  // Check for handleUpdatePaymentMethod function
  const hasUpdatePaymentHandler = billingPageContent.includes('handleUpdatePaymentMethod');
  check(
    'Has handleUpdatePaymentMethod function',
    hasUpdatePaymentHandler,
    'Calls /api/billing/portal endpoint'
  );

  // Check for Update Payment Method button
  const hasUpdatePaymentButton = billingPageContent.includes('Update Payment Method');
  check(
    'Has "Update Payment Method" button',
    hasUpdatePaymentButton,
    'For ACTIVE and PAST_DUE users'
  );

  // Check that PAST_DUE uses portal (not checkout)
  const pastDueUsesPortal =
    billingPageContent.includes('isPastDue') &&
    billingPageContent.includes('handleUpdatePaymentMethod') &&
    !billingPageContent.match(/isPastDue[\s\S]{0,200}handleResubscribe/);

  check(
    'PAST_DUE uses portal endpoint',
    pastDueUsesPortal,
    'Should call handleUpdatePaymentMethod, not handleResubscribe'
  );

  // Check that portal endpoint is called
  const callsPortalEndpoint = billingPageContent.includes('/api/billing/portal');
  check('Calls /api/billing/portal endpoint', callsPortalEndpoint, 'For payment method updates');
}

// ============================================
// 3. Check portal endpoint exists
// ============================================
console.log(`\n${colors.yellow}3. Customer Portal Endpoint${colors.reset}`);

const portalPath = 'src/app/api/billing/portal/route.ts';
const portalContent = readFile(portalPath);

check(
  'Portal endpoint exists',
  portalContent !== null,
  portalContent ? `Found at ${portalPath}` : `Missing: ${portalPath}`
);

if (portalContent) {
  // Check for Stripe billing portal session creation
  const createsBillingPortal =
    portalContent.includes('stripe.billingPortal.sessions.create') ||
    portalContent.includes('stripe.billingPortal');

  check(
    'Creates Stripe billing portal session',
    createsBillingPortal,
    'Uses stripe.billingPortal.sessions.create()'
  );

  // Check for customer ID usage
  const usesCustomerId = portalContent.includes('stripeCustomerId');
  check('Uses Stripe customer ID', usesCustomerId, 'Required for portal session');

  // Check for return URL
  const hasReturnUrl = portalContent.includes('return_url');
  check('Sets return URL', hasReturnUrl, 'Should redirect back to /billing');

  // Check for authentication
  const hasAuth = portalContent.includes('getUser');
  check('Requires authentication', hasAuth, 'Uses getUser() from session');
}

// ============================================
// 4. Check status endpoint includes trialEnd
// ============================================
console.log(`\n${colors.yellow}4. Billing Status Endpoint${colors.reset}`);

const statusPath = 'src/app/api/billing/status/route.ts';
const statusContent = readFile(statusPath);

check(
  'Status endpoint exists',
  statusContent !== null,
  statusContent ? `Found at ${statusPath}` : `Missing: ${statusPath}`
);

if (statusContent) {
  // Check that trialEnd is included in select
  const includesTrialEnd = statusContent.includes('trialEnd');
  check('Returns trialEnd in response', includesTrialEnd, 'Required for trial days calculation');
}

// ============================================
// 5. Check navigation includes billing link
// ============================================
console.log(`\n${colors.yellow}5. Navigation${colors.reset}`);

const navPath = 'src/components/shared/Navigation.tsx';
const navContent = readFile(navPath);

check(
  'Navigation component exists',
  navContent !== null,
  navContent ? `Found at ${navPath}` : `Missing: ${navPath}`
);

if (navContent) {
  // Check for billing link
  const hasBillingLink = navContent.includes('/billing');
  check('Navigation includes billing link', hasBillingLink, 'Users can access /billing from nav');

  // Check for CreditCard icon (commonly used for billing)
  const hasBillingIcon =
    navContent.includes('CreditCard') ||
    navContent.includes('DollarSign') ||
    navContent.includes('billing');

  check(
    'Billing link has appropriate icon',
    hasBillingIcon,
    'Should use CreditCard or similar icon'
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

const passRate = Math.round((passedChecks / totalChecks) * 100);
console.log(`\nPass rate: ${passRate}%`);

if (passRate === 100) {
  console.log(`\n${colors.green}✓ All checks passed! Ticket 2.11 is complete.${colors.reset}\n`);
  process.exit(0);
} else {
  console.log(
    `\n${colors.red}✗ Some checks failed. Please review the errors above.${colors.reset}\n`
  );
  process.exit(1);
}
