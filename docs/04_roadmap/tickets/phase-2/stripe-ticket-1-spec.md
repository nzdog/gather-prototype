Read the following documentation to understand the current codebase state:

1. /Users/Nigel/Desktop/gather-prototype/ONBOARDING_REPORT.md — original codebase overview
2. /Users/Nigel/Desktop/gather-prototype/docs/PHASE1_COMPLETE.md — what Phase 1 built (auth system)
3. /Users/Nigel/Desktop/gather-prototype/docs/gather-phase2-tickets.rtf — Phase 2 ticket specifications

After reading, create a new branch called `phase2/ticket-2.1-subscription-schema` and implement Ticket 2.1 (Subscription Schema + Billing States).

Summary of Ticket 2.1:
- Add BillingStatus enum: FREE, TRIALING, ACTIVE, PAST_DUE, CANCELED
- Add Subscription table with Stripe IDs and status tracking
- Add User.billingStatus field (defaults to FREE)
- Migration must be additive only — no breaking changes
- All existing Phase 1 flows must continue working

When complete, run verification:
- Migration runs successfully
- Existing users have billingStatus = FREE
- Subscription table exists (empty)
- All Phase 1 auth flows still work (sign-in, logout, claim, legacy tokens)

Do not proceed to Ticket 2.2 until 2.1 is verified.

⏺ ✅ Ticket 2.1 Complete: Subscription Schema + Billing States

  I've successfully implemented Ticket 2.1 on the new branch phase2/ticket-2.1-subscription-schema. Here's what was accomplished:

  Changes Made

  1. Database Schema (prisma/schema.prisma)
  - Added BillingStatus enum: FREE, TRIALING, ACTIVE, PAST_DUE, CANCELED
  - Created Subscription model with Stripe integration fields
  - Added billingStatus field to User model (defaults to FREE)

  2. Migration
  - Created migration: prisma/migrations/20260118103000_billing/
  - Migration applied successfully to database
  - Completely additive — no breaking changes

  3. Verification
  - Created automated verification script: scripts/verify-ticket-2.1.ts
  - All acceptance criteria verified ✅

  Verification Results

  ✅ BillingStatus enum: FREE, TRIALING, ACTIVE, PAST_DUE, CANCELED
  ✅ Subscription table: Created with all required fields
  ✅ User.billingStatus: Added with FREE default
  ✅ Existing users (13): All have billingStatus = FREE
  ✅ Subscription table: Empty (0 records)
  ✅ Phase 1 flows: All working (sign-in, logout, claim, legacy tokens)

  Files Changed

  - prisma/schema.prisma — Modified
  - prisma/migrations/20260118103000_billing/migration.sql — Created
  - scripts/verify-ticket-2.1.ts — Created
  - docs/TICKET_2.1_COMPLETE.md — Created

  Database State

  - Users: 13 total, all with billingStatus = FREE
  - Subscriptions: 0 records (empty table ready for Stripe integration)
  - Phase 1 auth: All flows tested and working ✅

  Next Steps

  The implementation is complete and verified. You can now:

  1. Review the changes: Check git status and review the modified files
  2. Run verification: npx tsx scripts/verify-ticket-2.1.ts
  3. Proceed to Ticket 2.2: Stripe Integration + Webhook Handler

  Would you like me to proceed with Ticket 2.2, or would you prefer to review and commit these changes first?

✻ Brewed for 5m 10s

⏺ Background command "Start Prisma Studio to inspect database" completed (exit code 0)

⏺ I see the background tasks completed successfully. Both Prisma Studio and the dev server ran without issues, which further confirms that our schema changes are working correctly.

  Current Status:
  - ✅ Ticket 2.1 implementation complete and verified
  - ✅ All tests passing
  - ✅ Phase 1 auth flows intact
  - ✅ Ready for review or next ticket

  Your Options:

  1. Review & Commit — I can help you review the changes and prepare a commit message
  2. Proceed to Ticket 2.2 — Continue with Stripe Integration + Webhook Handler
  3. Additional Testing — Run any specific tests you'd like to verify

  What would you like to do next?