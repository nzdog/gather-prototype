Read the following documentation to understand the codebase and current state:

1. /Users/Nigel/Desktop/gather-prototype/ONBOARDING_REPORT.md — original codebase overview
2. /Users/Nigel/Desktop/gather-prototype/docs/PHASE1_COMPLETE.md — Phase 1 auth system (complete)
3. /Users/Nigel/Desktop/gather-prototype/docs/TICKET_2.1_COMPLETE.md — Billing schema (complete)
4. /Users/Nigel/Desktop/gather-prototype/docs/TICKET_2.2_COMPLETE.md — Stripe SDK + webhooks (complete)
5. /Users/Nigel/Desktop/gather-prototype/docs/TICKET_2.3_COMPLETE.md — Checkout flow (complete)
6. /Users/Nigel/Desktop/gather-prototype/docs/TICKET_2.4_COMPLETE.md — Billing state sync (complete)
7. /Users/Nigel/Desktop/gather-prototype/docs/gather-phase2-tickets.docx — Phase 2 ticket specifications
8. /Users/Nigel/Desktop/gather-prototype/prisma/schema.prisma — current database schema
9. /Users/Nigel/Desktop/gather-prototype/src/lib/billing/sync.ts — billing sync functions

Also check:
- git status — to see current state
- /Users/Nigel/Desktop/gather-prototype/src/lib/ — existing lib structure

Context:
- Phase 1 (magic link auth): Complete
- Tickets 2.1–2.4: Complete and tested
- Billing flow working end-to-end (checkout → webhook → status = ACTIVE)
- Now implementing: Ticket 2.5 (Entitlement Service)

Implement Ticket 2.5:

Create src/lib/entitlements.ts with these functions:
- canCreateEvent(userId): boolean — checks if user can create a new event
- canEditEvent(userId, eventId): boolean — checks if user can edit an event
- getEventLimit(userId): number | 'unlimited'
- getRemainingEvents(userId): number | 'unlimited'

Rules:
- FREE: 1 event per rolling 12 months (check EventRole where role=HOST, created in last 12 months)
- TRIALING: unlimited
- ACTIVE: unlimited
- PAST_DUE: can edit existing (within 7 days), cannot create new
- CANCELED: read-only (no create, no edit)

Important:
- Legacy events (isLegacy: true) don't count against free tier limit
- Legacy events remain editable regardless of billing status
- PAST_DUE grace period is 7 days from when status changed

Create verification script: scripts/verify-ticket-2.5.ts

Do not duplicate work — check existing files first.



  Summary

  ✅ All 30 verification checks passed

  Files Created

  1. src/lib/entitlements.ts — Entitlement service with 4 core functions:
    - canCreateEvent(userId) — Checks if user can create new events
    - canEditEvent(userId, eventId) — Checks if user can edit specific events
    - getEventLimit(userId) — Returns event limit (number or 'unlimited')
    - getRemainingEvents(userId) — Returns remaining event count
  2. scripts/verify-ticket-2.5.ts — Automated verification script (30 checks)
  3. docs/TICKET_2.5_COMPLETE.md — Complete implementation documentation

  Files Modified

  1. prisma/schema.prisma — Added two fields:
    - Event.isLegacy (Boolean) — Identifies legacy events that bypass limits
    - Subscription.statusChangedAt (DateTime) — Tracks status changes for grace period
  2. src/lib/billing/sync.ts — Updated all 4 sync functions to track statusChangedAt

  Business Rules Implemented
  ┌──────────┬─────────────┬───────────────┬─────────────┬───────────┐
  │  Status  │ Create New  │ Edit Existing │ Edit Legacy │   Limit   │
  ├──────────┼─────────────┼───────────────┼─────────────┼───────────┤
  │ FREE     │ ✅ (1/12mo) │ ✅            │ ✅          │ 1         │
  ├──────────┼─────────────┼───────────────┼─────────────┼───────────┤
  │ TRIALING │ ✅          │ ✅            │ ✅          │ Unlimited │
  ├──────────┼─────────────┼───────────────┼─────────────┼───────────┤
  │ ACTIVE   │ ✅          │ ✅            │ ✅          │ Unlimited │
  ├──────────┼─────────────┼───────────────┼─────────────┼───────────┤
  │ PAST_DUE │ ❌          │ ✅ (7 days)   │ ✅          │ 0         │
  ├──────────┼─────────────┼───────────────┼─────────────┼───────────┤
  │ CANCELED │ ❌          │ ❌            │ ✅          │ 0         │
  └──────────┴─────────────┴───────────────┴─────────────┴───────────┘
  Key Features:
  - FREE tier: 1 event per rolling 12 months (legacy events excluded)
  - PAST_DUE grace period: 7 days from status change
  - Legacy events: Always editable, don't count against limits
  - Counts only events where user is HOST

  Verification Results

  npx tsx scripts/verify-ticket-2.5.ts
  ✅ 30/30 checks passed (100% pass rate)

  The implementation is complete and ready for integration into your event creation and editing APIs. The entitlement functions are standalone and can be called from any API endpoint to enforce billing restrictions.
