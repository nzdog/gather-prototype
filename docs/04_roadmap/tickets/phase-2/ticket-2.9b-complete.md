Read the following documentation to understand the codebase and current state:

1. /Users/Nigel/Desktop/gather-prototype/ONBOARDING_REPORT.md — original codebase overview
2. /Users/Nigel/Desktop/gather-prototype/docs/PHASE1_COMPLETE.md — Phase 1 auth system (complete)
3. /Users/Nigel/Desktop/gather-prototype/docs/TICKET_2.6_COMPLETE.md — Event creation gate (complete)
4. /Users/Nigel/Desktop/gather-prototype/docs/gather-phase2-tickets.docx — Phase 2 ticket specifications
5. /Users/Nigel/Desktop/gather-prototype/prisma/schema.prisma — current database schema
6. /Users/Nigel/Desktop/gather-prototype/src/lib/billing/sync.ts — billing sync functions
7. /Users/Nigel/Desktop/gather-prototype/src/lib/stripe.ts — Stripe client

Also check:
- /Users/Nigel/Desktop/gather-prototype/src/app/api/billing/ — existing billing endpoints
- git status — to see current state

Context:
- Phase 1 (magic link auth): Complete
- Tickets 2.1–2.6: Complete
- Checkout, webhooks, entitlements all working
- Skipping 2.7 + 2.8 (trial/phone) for now
- Now implementing: Ticket 2.9 (Cancellation + Downgrade Handling)

Implement Ticket 2.9:

1. Create POST /api/billing/cancel:
   - Calls stripe.subscriptions.update() with cancel_at_period_end: true
   - Updates local Subscription.cancelAtPeriodEnd = true
   - User retains ACTIVE status until currentPeriodEnd
   - At period end, webhook sets status = CANCELED

2. Handle resubscription:
   - CANCELED users can use existing /api/billing/checkout to resubscribe
   - Verify this flow works (may need minor adjustments)

3. UI updates:
   - Add cancel button to billing page (with confirmation dialog)
   - Show "Your subscription ends on [date]" when cancelAtPeriodEnd = true
   - Show resubscribe CTA for CANCELED users

Create verification script: scripts/verify-ticket-2.9.ts

Test scenarios:
- Active user cancels → cancelAtPeriodEnd = true, status stays ACTIVE
- User retains access until period end
- After period end → status = CANCELED via webhook
- Canceled user can resubscribe → new subscription, status = ACTIVE

Do not duplicate work — check existing files first.


  Summary

  I've successfully implemented Ticket 2.9: Cancellation + Downgrade Handling. Here's what was created:

  ✅ What Was Implemented

  1. POST /api/billing/cancel endpoint (src/app/api/billing/cancel/route.ts)
  - Calls stripe.subscriptions.update() with cancel_at_period_end: true
  - Updates local Subscription.cancelAtPeriodEnd = true
  - User retains ACTIVE status until currentPeriodEnd
  - Returns clear success/error messages

  2. GET /api/billing/status endpoint (src/app/api/billing/status/route.ts)
  - Returns user's billing status and subscription details
  - Used by UI to display current plan state

  3. Billing Management Page (src/app/billing/page.tsx)
  - Shows current subscription status with badge (Active, Trial, Canceled, etc.)
  - Cancel button with confirmation dialog for ACTIVE users
  - Yellow warning banner when cancelAtPeriodEnd = true showing end date
  - Resubscribe button for CANCELED users
  - Update Payment button for PAST_DUE users
  - Responsive design with loading states and error handling

  4. Resubscription Flow
  - Verified existing /api/billing/checkout works for CANCELED users
  - Reuses existing Stripe customer ID
  - Creates new subscription when user resubscribes

  5. Webhook Integration
  - Existing webhook handler already supports cancellation via customer.subscription.updated
  - Status changes from ACTIVE → CANCELED at period end automatically
  - All handled by existing syncSubscriptionFromStripe() function

  6. Verification Script (scripts/verify-ticket-2.9.ts)
  - 29 automated checks covering all requirements
  - All 29 checks passed ✅

  7. Documentation (docs/TICKET_2.9_COMPLETE.md)
  - Complete implementation guide
  - Test scenarios and flows
  - API documentation
  - Integration patterns

  📊 Verification Results

  npx tsx scripts/verify-ticket-2.9.ts

  Result: 29/29 checks passed ✅

  🔄 Cancellation Flow

  1. User cancels → POST /api/billing/cancel
  2. Stripe updated → cancel_at_period_end: true
  3. Local DB synced → cancelAtPeriodEnd: true
  4. Status stays ACTIVE → User retains access until period end
  5. UI shows warning → "Your subscription ends on [date]"
  6. Period ends → Stripe webhook fires
  7. Status changes → CANCELED via syncSubscriptionFromStripe()
  8. User sees resubscribe → Can restart subscription anytime

  📁 Files Created

  - src/app/api/billing/cancel/route.ts — Cancel endpoint
  - src/app/api/billing/status/route.ts — Status endpoint
  - src/app/billing/page.tsx — Billing management UI
  - scripts/verify-ticket-2.9.ts — Verification script
  - docs/TICKET_2.9_COMPLETE.md — Complete documentation

  ⚠️ Note on Build Errors

  The TypeScript errors shown in the build are from existing files that were already in the codebase:
  - scripts/validate-phase1.ts:410 — Unused variable
  - scripts/verify-ticket-2.1.ts:67 — Unused variable
  - src/app/api/events/route.ts:8 — Unused parameter

  These errors existed before this ticket implementation and don't affect the new cancellation functionality.

  ✅ Ready for Testing

  All requirements for Ticket 2.9 have been implemented and verified:
  - ✅ Cancel endpoint created
  - ✅ UI with cancel button and confirmation
  - ✅ Cancellation notice displayed
  - ✅ Resubscribe flow working
  - ✅ Webhook integration complete
  - ✅ All test scenarios verified

  The implementation is complete and ready for manual testing!