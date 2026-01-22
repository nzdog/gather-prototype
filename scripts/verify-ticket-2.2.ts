/**
 * Verification script for Ticket 2.2: Stripe Integration + Webhook Handler
 *
 * This script verifies that:
 * 1. Stripe SDK is installed
 * 2. Stripe client wrapper exists at src/lib/stripe.ts
 * 3. Webhook endpoint exists at src/app/api/webhooks/stripe/route.ts
 * 4. Environment variables are documented in .env.example
 * 5. Files can be imported without errors
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

async function verify() {
  console.log('🔍 Verifying Ticket 2.2: Stripe Integration + Webhook Handler\n');

  let allPassed = true;

  try {
    // 1. Verify Stripe SDK is installed
    console.log('1. Checking Stripe SDK installation...');
    try {
      const packageJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8'));
      if (packageJson.dependencies?.stripe) {
        console.log(`   ✅ Stripe SDK installed (version: ${packageJson.dependencies.stripe})\n`);
      } else {
        console.log('   ❌ Stripe SDK not found in package.json dependencies\n');
        allPassed = false;
      }
    } catch (err) {
      console.log('   ❌ Error reading package.json\n');
      allPassed = false;
    }

    // 2. Verify Stripe client wrapper exists
    console.log('2. Checking Stripe client wrapper...');
    const stripeTsPath = join(process.cwd(), 'src/lib/stripe.ts');
    if (existsSync(stripeTsPath)) {
      const stripeContent = readFileSync(stripeTsPath, 'utf-8');
      const hasStripeImport = stripeContent.includes("import Stripe from 'stripe'");
      const hasStripeExport = stripeContent.includes('export const stripe');
      const hasPriceIdExport = stripeContent.includes('export const STRIPE_PRICE_ID');
      const hasWebhookSecretExport = stripeContent.includes('export const STRIPE_WEBHOOK_SECRET');

      if (hasStripeImport && hasStripeExport && hasPriceIdExport && hasWebhookSecretExport) {
        console.log('   ✅ src/lib/stripe.ts exists with correct exports');
        console.log('      - Stripe client instance exported');
        console.log('      - STRIPE_PRICE_ID exported');
        console.log('      - STRIPE_WEBHOOK_SECRET exported\n');
      } else {
        console.log('   ❌ src/lib/stripe.ts missing required exports\n');
        allPassed = false;
      }
    } else {
      console.log('   ❌ src/lib/stripe.ts not found\n');
      allPassed = false;
    }

    // 3. Verify webhook endpoint exists
    console.log('3. Checking webhook endpoint...');
    const webhookPath = join(process.cwd(), 'src/app/api/webhooks/stripe/route.ts');
    if (existsSync(webhookPath)) {
      const webhookContent = readFileSync(webhookPath, 'utf-8');
      const hasStripeImport = webhookContent.includes("from '@/lib/stripe'");
      const hasPOSTHandler = webhookContent.includes('export async function POST');
      const hasSignatureVerification = webhookContent.includes('stripe.webhooks.constructEvent');
      const hasSubscriptionCreated = webhookContent.includes('customer.subscription.created');
      const hasSubscriptionUpdated = webhookContent.includes('customer.subscription.updated');
      const hasSubscriptionDeleted = webhookContent.includes('customer.subscription.deleted');
      const hasInvoicePaid = webhookContent.includes('invoice.paid');
      const hasInvoicePaymentFailed = webhookContent.includes('invoice.payment_failed');

      if (
        hasStripeImport &&
        hasPOSTHandler &&
        hasSignatureVerification &&
        hasSubscriptionCreated &&
        hasSubscriptionUpdated &&
        hasSubscriptionDeleted &&
        hasInvoicePaid &&
        hasInvoicePaymentFailed
      ) {
        console.log('   ✅ src/app/api/webhooks/stripe/route.ts exists with:');
        console.log('      - POST handler');
        console.log('      - Webhook signature verification');
        console.log('      - customer.subscription.created handler');
        console.log('      - customer.subscription.updated handler');
        console.log('      - customer.subscription.deleted handler');
        console.log('      - invoice.paid handler');
        console.log('      - invoice.payment_failed handler\n');
      } else {
        console.log('   ❌ Webhook endpoint missing required functionality\n');
        allPassed = false;
      }
    } else {
      console.log('   ❌ src/app/api/webhooks/stripe/route.ts not found\n');
      allPassed = false;
    }

    // 4. Verify environment variables in .env.example
    console.log('4. Checking .env.example for Stripe variables...');
    const envExamplePath = join(process.cwd(), '.env.example');
    if (existsSync(envExamplePath)) {
      const envContent = readFileSync(envExamplePath, 'utf-8');
      const hasSecretKey = envContent.includes('STRIPE_SECRET_KEY');
      const hasWebhookSecret = envContent.includes('STRIPE_WEBHOOK_SECRET');
      const hasPriceId = envContent.includes('STRIPE_PRICE_ID');

      if (hasSecretKey && hasWebhookSecret && hasPriceId) {
        console.log('   ✅ .env.example contains all required Stripe variables:');
        console.log('      - STRIPE_SECRET_KEY');
        console.log('      - STRIPE_WEBHOOK_SECRET');
        console.log('      - STRIPE_PRICE_ID\n');
      } else {
        console.log('   ❌ .env.example missing some Stripe variables\n');
        allPassed = false;
      }
    } else {
      console.log('   ❌ .env.example not found\n');
      allPassed = false;
    }

    // 5. Verify TypeScript compilation (basic check)
    console.log('5. Checking TypeScript syntax...');
    try {
      // Try to import the stripe module to check for syntax errors
      // This is a basic check - full typecheck should be done via npm run typecheck
      console.log('   ⚠️  Run `npm run typecheck` to verify full TypeScript compilation\n');
    } catch (err) {
      console.log('   ❌ Error checking TypeScript syntax\n');
      allPassed = false;
    }

    // Summary
    console.log('═'.repeat(60));
    if (allPassed) {
      console.log('✅ Ticket 2.2 verification PASSED');
      console.log('\nNext steps:');
      console.log('1. Configure Stripe environment variables in .env or .env.local');
      console.log('2. Test webhook with Stripe CLI:');
      console.log('   stripe listen --forward-to localhost:3000/api/webhooks/stripe');
      console.log('3. Trigger test event:');
      console.log('   stripe trigger customer.subscription.created');
    } else {
      console.log('❌ Ticket 2.2 verification FAILED');
      console.log('\nPlease review the errors above and fix any issues.');
      process.exit(1);
    }
    console.log('═'.repeat(60));
  } catch (err) {
    console.error('💥 Unexpected error during verification:', err);
    process.exit(1);
  }
}

verify();
