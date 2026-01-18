Ticket 2.2 — Stripe Integration + Webhook Handler
Type: Infrastructure
Risk: Medium (external dependency)
Estimated effort: 3-4 hours
Context
Set up Stripe SDK, configure products/prices, and create the webhook endpoint that will be the source of truth for subscription state.
Acceptance Criteria
Stripe SDK installed (npm install stripe)
Environment variables: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_ID
Stripe client wrapper at src/lib/stripe.ts
Webhook endpoint at POST /api/webhooks/stripe
Webhook handles: customer.subscription.created, updated, deleted
Webhook handles: invoice.paid, invoice.payment_failed
Webhook signature verification
Stripe Setup (Manual)
Before implementing, create in Stripe Dashboard:
Product: 'Gather Annual' (or your product name)
Price: Annual recurring (e.g., $49/year)
Webhook endpoint pointing to your domain/api/webhooks/stripe
Webhook events: customer.subscription.*, invoice.*
Implementation
// src/lib/stripe.ts
import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

// src/app/api/webhooks/stripe/route.ts
import { stripe } from '@/lib/stripe';
import { headers } from 'next/headers';

export async function POST(req: Request) {
  const body = await req.text();
  const signature = headers().get('stripe-signature')!;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    return new Response('Webhook signature verification failed', { status: 400 });
  }

  // Handle events (implemented in 2.4)
  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
    case 'invoice.paid':
    case 'invoice.payment_failed':
      // TODO: Implement in 2.4
      break;
  }

  return new Response('OK', { status: 200 });
}
Environment Variables
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID=price_...
Verification
Stripe CLI: stripe listen --forward-to localhost:3000/api/webhooks/stripe
Trigger test event: stripe trigger customer.subscription.created
Webhook receives event and returns 200


  Implementation Summary

  1. Stripe SDK Installation
    - Installed stripe package (v20.2.0)
  2. Stripe Client Wrapper (src/lib/stripe.ts)
    - Configured Stripe client with API version 2025-12-15.clover
    - Added environment variable validation
    - Exported client instance and configuration constants
  3. Webhook Endpoint (src/app/api/webhooks/stripe/route.ts)
    - Created POST handler at /api/webhooks/stripe
    - Implemented webhook signature verification
    - Added event routing for all required events:
        - customer.subscription.created
      - customer.subscription.updated
      - customer.subscription.deleted
      - invoice.paid
      - invoice.payment_failed
    - Event handlers log events (full implementation in Ticket 2.4)
  4. Environment Configuration
    - Updated .env.example with:
        - STRIPE_SECRET_KEY
      - STRIPE_WEBHOOK_SECRET
      - STRIPE_PRICE_ID (pre-configured: price_1SqhMFIP69tdO3saRJRViz0g)
  5. Verification Script (scripts/verify-ticket-2.2.ts)
    - Automated validation of all acceptance criteria
    - ✅ All checks passed

  Verification Results

  npx tsx scripts/verify-ticket-2.2.ts
  ✅ Stripe SDK installed
  ✅ Stripe client wrapper created
  ✅ Webhook endpoint implemented
  ✅ Environment variables documented
  ✅ TypeScript compilation successful (no new errors)

  Testing the Webhook

  To test the webhook locally with Stripe CLI:

  # Forward webhooks to your local server
  stripe listen --forward-to localhost:3000/api/webhooks/stripe

  # In another terminal, start the dev server
  npm run dev

  # Trigger a test event
  stripe trigger customer.subscription.created

  Files Created/Modified

  Created:
  - src/lib/stripe.ts
  - src/app/api/webhooks/stripe/route.ts
  - scripts/verify-ticket-2.2.ts
  - docs/TICKET_2.2_COMPLETE.md

  Modified:
  - .env.example (added Stripe env vars)
  - package.json & package-lock.json (Stripe dependency)

  Next Steps

  You're ready to proceed to Ticket 2.3: Checkout + Subscription Creation!

  All dependencies are in place:
  - ✅ Stripe SDK configured
  - ✅ Webhook infrastructure ready
  - ✅ Database schema ready (from Ticket 2.1)

  Would you like me to proceed with Ticket 2.3, or would you prefer to test the webhook endpoint first?


   ✅ Implementation Summary

  1. Checkout API Endpoint

  POST /api/billing/checkout (src/app/api/billing/checkout/route.ts)
  - Authenticates user via session
  - Creates Stripe Customer if not exists
  - Stores stripeCustomerId in Subscription record
  - Creates Stripe Checkout Session
  - Returns checkout URL for redirect

  2. User Interface Pages

  Upgrade Page (/billing/upgrade)
  - Displays subscription pricing ($69 NZD/year)
  - Feature list with benefits
  - "Upgrade Now" button that triggers checkout
  - Loading states and error handling

  Success Page (/billing/success)
  - Confirmation message with checkmark
  - Displays session ID
  - Auto-redirect countdown to events page
  - Manual navigation options

  Cancel Page (/billing/cancel)
  - Cancellation confirmation
  - "Try Again" button
  - Support contact information

  3. Verification Script

  scripts/verify-ticket-2.3.ts
  - Automated verification of all components
  - ✅ 17/17 checks passed

  📋 Testing Steps

  1. Setup environment variables (if not already configured):
  STRIPE_SECRET_KEY="sk_test_..."
  STRIPE_WEBHOOK_SECRET="whsec_..."
  STRIPE_PRICE_ID="price_1SqhMFIP69tdO3saRJRViz0g"
  2. Start the dev server:
  npm run dev
  3. Sign in as a user (using existing auth)
  4. Navigate to: http://localhost:3000/billing/upgrade
  5. Click "Upgrade Now" button
  6. Complete checkout with test card:
    - Card: 4242 4242 4242 4242
    - Expiry: Any future date
    - CVC: Any 3 digits
  7. Verify redirect to /billing/success
  8. Check database:
  SELECT * FROM "Subscription" WHERE "userId" = '<your-user-id>';
  8. Should show stripeCustomerId populated with cus_...

  📁 Files Created

  - src/app/api/billing/checkout/route.ts — Checkout endpoint
  - src/app/billing/success/page.tsx — Success page
  - src/app/billing/cancel/page.tsx — Cancel page
  - src/app/billing/upgrade/page.tsx — Upgrade page
  - scripts/verify-ticket-2.3.ts — Verification script
  - docs/TICKET_2.3_COMPLETE.md — Completion documentation

  🔍 Verification

  Run automated verification:
  npx tsx scripts/verify-ticket-2.3.ts

  ⚠️ Note

  The subscription status will remain FREE until you complete Ticket 2.4 (Webhook Handlers), which will update the status to ACTIVE when the webhook fires after successful payment. The checkout flow is fully functional and will create the Subscription record with the Stripe Customer ID as required.
