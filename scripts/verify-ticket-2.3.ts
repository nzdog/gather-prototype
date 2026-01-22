// scripts/verify-ticket-2.3.ts
// Verification script for Ticket 2.3: Checkout + Subscription Creation

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

console.log('='.repeat(60));
console.log('Ticket 2.3 Verification: Checkout + Subscription Creation');
console.log('='.repeat(60));
console.log();

let passed = 0;
let failed = 0;

function check(description: string, condition: boolean, details?: string) {
  if (condition) {
    console.log(`✅ ${description}`);
    passed++;
  } else {
    console.log(`❌ ${description}`);
    if (details) console.log(`   ${details}`);
    failed++;
  }
}

// 1. Verify checkout endpoint exists
const checkoutRoutePath = join(process.cwd(), 'src/app/api/billing/checkout/route.ts');
const checkoutRouteExists = existsSync(checkoutRoutePath);
check('Checkout endpoint file exists', checkoutRouteExists);

if (checkoutRouteExists) {
  const checkoutContent = readFileSync(checkoutRoutePath, 'utf-8');
  check(
    'Checkout endpoint has POST handler',
    checkoutContent.includes('export async function POST')
  );
  check('Checkout endpoint uses getUser()', checkoutContent.includes('getUser()'));
  check(
    'Checkout endpoint uses stripe.customers.create()',
    checkoutContent.includes('stripe.customers.create')
  );
  check(
    'Checkout endpoint uses stripe.checkout.sessions.create()',
    checkoutContent.includes('stripe.checkout.sessions.create')
  );
  check(
    'Checkout endpoint creates/updates Subscription',
    checkoutContent.includes('prisma.subscription')
  );
  check('Checkout endpoint sets success_url', checkoutContent.includes('/billing/success'));
  check('Checkout endpoint sets cancel_url', checkoutContent.includes('/billing/cancel'));
}

// 2. Verify success page exists
const successPagePath = join(process.cwd(), 'src/app/billing/success/page.tsx');
const successPageExists = existsSync(successPagePath);
check('Success page exists', successPageExists);

if (successPageExists) {
  const successContent = readFileSync(successPagePath, 'utf-8');
  check('Success page uses session_id parameter', successContent.includes('session_id'));
  check(
    'Success page has user-friendly UI',
    successContent.includes('Subscription Successful') || successContent.includes('Success')
  );
}

// 3. Verify cancel page exists
const cancelPagePath = join(process.cwd(), 'src/app/billing/cancel/page.tsx');
const cancelPageExists = existsSync(cancelPagePath);
check('Cancel page exists', cancelPageExists);

if (cancelPageExists) {
  const cancelContent = readFileSync(cancelPagePath, 'utf-8');
  check(
    'Cancel page has user-friendly UI',
    cancelContent.includes('Cancel') || cancelContent.includes('cancel')
  );
}

// 4. Verify upgrade page exists
const upgradePagePath = join(process.cwd(), 'src/app/billing/upgrade/page.tsx');
const upgradePageExists = existsSync(upgradePagePath);
check('Upgrade page exists', upgradePageExists);

if (upgradePageExists) {
  const upgradeContent = readFileSync(upgradePagePath, 'utf-8');
  check(
    'Upgrade page has upgrade button',
    upgradeContent.includes('Upgrade') || upgradeContent.includes('upgrade')
  );
  check(
    'Upgrade page calls /api/billing/checkout',
    upgradeContent.includes('/api/billing/checkout')
  );
  check(
    'Upgrade page handles loading state',
    upgradeContent.includes('loading') || upgradeContent.includes('Loading')
  );
}

console.log();
console.log('='.repeat(60));
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));

if (failed > 0) {
  process.exit(1);
}

console.log();
console.log('✅ Ticket 2.3 verification complete!');
console.log();
console.log('Manual testing steps:');
console.log('1. Ensure you have Stripe keys in .env:');
console.log('   - STRIPE_SECRET_KEY');
console.log('   - STRIPE_WEBHOOK_SECRET');
console.log('   - STRIPE_PRICE_ID');
console.log('2. Start the dev server: npm run dev');
console.log('3. Sign in as a user');
console.log('4. Navigate to /billing/upgrade');
console.log('5. Click "Upgrade Now"');
console.log('6. Use test card: 4242 4242 4242 4242');
console.log('7. Verify redirect to /billing/success');
console.log('8. Check database: SELECT * FROM "Subscription" WHERE "userId" = <your-user-id>;');
console.log();
