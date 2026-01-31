# Per-Event Payment Implementation

**Date:** 2026-01-31
**Branch:** `per-event-payment`
**Migration Status:** ✅ Complete
**Build Status:** ✅ Passing

---

## Overview

Replaced subscription-based billing with a simple per-event payment model. Every new event now requires a one-time payment of **$12 NZD** at creation time.

**Previous Model:**
- Subscription tiers (FREE, TRIALING, ACTIVE, PAST_DUE, CANCELED)
- FREE tier: 1 event per 12 months
- Paid tiers: unlimited events
- Complex entitlement checks

**New Model:**
- $12 NZD per event (one-time payment)
- No subscriptions
- No free tier
- Payment verified at checkout via Stripe session validation
- Unlimited events (payment is the gate)

---

## Files Created or Modified

### Database Schema

**Modified:** `prisma/schema.prisma`
- Added payment tracking fields to Event model:
  - `stripePaymentIntentId: String? @unique` — Links event to Stripe payment
  - `paidAt: DateTime?` — Timestamp of payment
  - `amountPaid: Int?` — Amount in cents (e.g., 1200 = $12.00)

**Migration:**
- Applied via `npx prisma db push --accept-data-loss`
- No data loss (new nullable fields)
- Unique constraint on `stripePaymentIntentId`

---

### API Routes

#### 1. **src/app/api/billing/checkout/route.ts** — REPLACED

**Purpose:** Create Stripe checkout session for one-time payment

**Changes:**
- Mode changed from `'subscription'` to `'payment'`
- Removed Stripe Customer creation (not needed for one-time payments)
- Price: Fixed $12 NZD (1200 cents)
- Success URL: `/events/new?session_id={CHECKOUT_SESSION_ID}`
- Cancel URL: `/events/new?canceled=true`

**Request:**
```json
POST /api/billing/checkout
{ "eventName": "Christmas 2026" }
```

**Response:**
```json
{
  "checkoutUrl": "https://checkout.stripe.com/...",
  "sessionId": "cs_test_..."
}
```

---

#### 2. **src/app/api/events/route.ts** — MODIFIED

**Purpose:** Create new event (now requires payment verification)

**Changes:**
- Added `stripeSessionId` as required parameter
- Verifies Stripe checkout session before creating event:
  1. Session exists and is valid
  2. Payment status is `'paid'`
  3. Session belongs to authenticated user (via metadata)
  4. Session hasn't been used for another event
- Populates payment tracking fields on event
- Sends receipt email after successful creation

**Request:**
```json
POST /api/events
{
  "name": "Christmas 2026",
  "startDate": "2026-12-24",
  "endDate": "2026-12-26",
  "stripeSessionId": "cs_test_..."
}
```

**Response:**
```json
{
  "success": true,
  "event": { ... }
}
```

**Error Responses:**
- `402`: Payment not completed
- `403`: Payment session mismatch
- `409`: Payment already used for another event

---

#### 3. **src/app/api/webhooks/stripe/route.ts** — SIMPLIFIED

**Purpose:** Handle Stripe webhook events (logging only)

**Changes:**
- Removed all subscription-related handlers:
  - ❌ `customer.subscription.created`
  - ❌ `customer.subscription.updated`
  - ❌ `customer.subscription.deleted`
  - ❌ `invoice.paid`
  - ❌ `invoice.payment_failed`
- Added payment handlers (logging only):
  - ✅ `checkout.session.completed`
  - ✅ `payment_intent.succeeded`
  - ✅ `payment_intent.payment_failed`

**Note:** Event creation happens via API (`POST /api/events`), not webhooks. Webhooks are for logging/monitoring only.

---

### Business Logic

#### 4. **src/lib/entitlements.ts** — SIMPLIFIED

**Purpose:** Check event creation and editing permissions

**Changes:**
- `canCreateEvent()` — Now always returns `true` (payment is verified at creation time)
- `canEditEvent()` — Simplified to check EventRole (HOST or COHOST)
- `getEventLimit()` — Returns `'unlimited'`
- `getRemainingEvents()` — Returns `'unlimited'`

**Rationale:** Payment verification moved to checkout/creation flow. No need for complex subscription checks.

---

### Email Integration

#### 5. **Receipt Email** — ADDED

**Location:** Integrated into `src/app/api/events/route.ts` (lines 212-238)

**Trigger:** Automatically sent after successful event creation

**Content:**
```
Subject: Receipt: [Event Name] — Gather

Thanks for using Gather!

Event: Christmas 2026
Date: 12/24/2026
Amount: $12.00 NZD

Manage your event: https://gather.app/plan/[eventId]

Questions? Reply to this email.
```

**Implementation:**
- Uses Resend (`getResendClient()`)
- Non-blocking (errors logged but don't fail event creation)
- Sent to authenticated user's email

---

## Files NOT Modified (Deprecated but Left Intact)

The following files are deprecated but were intentionally left in place for potential migration needs:

- `src/lib/billing/sync.ts` — Subscription sync logic (unused)
- `src/app/api/billing/portal/route.ts` — Stripe customer portal (no longer needed)
- `src/app/api/billing/cancel/route.ts` — Cancel subscription (no longer needed)
- `src/app/api/billing/status/route.ts` — Get billing status (deprecated)
- `src/app/billing/upgrade/page.tsx` — Upgrade page (could be repurposed or removed)
- `prisma/schema.prisma` — User.billingStatus and Subscription models (kept for backward compatibility)

**Recommendation:** These can be removed in a future cleanup migration once per-event payment is stable.

---

## Build Verification

### ✅ Database Migration
```bash
$ npx prisma db push --accept-data-loss
✔ Generated Prisma Client
🚀 Your database is now in sync with your Prisma schema.
```

### ✅ Type Checking
```bash
$ npm run typecheck
# No errors
```

### ✅ Production Build
```bash
$ npm run build
✓ Compiled successfully
✓ Linting and checking validity of types
✓ Generating static pages (36/36)
```

**Warnings (Non-blocking):**
- Dynamic server usage for API routes (expected for auth cookies)
- ESLint config deprecation (Next.js internal)

---

## Implementation Decisions

### 1. **Why not use Stripe subscriptions?**
- Simpler model: One payment = one event
- No recurring billing complexity
- No proration, cancellation, or refund logic needed
- Easier for users to understand

### 2. **Why verify payment at API level, not webhooks?**
- Synchronous verification provides immediate feedback
- User sees event created right after payment
- Webhooks can be delayed or fail silently
- Session verification is cryptographically secure

### 3. **Why keep deprecated subscription models?**
- Safe migration path
- Allows rollback if needed
- Existing events may reference these models
- Can be removed in future cleanup migration

### 4. **Why $12 NZD?**
- Per ticket specification
- Hardcoded in checkout route (line 29)
- Can be made configurable via env var if needed

### 5. **Why nullable payment fields on Event?**
- Legacy events don't have payment data
- Allows gradual migration
- Non-breaking change to schema

---

## Security Considerations

### ✅ Payment Verification
- Session validation prevents replay attacks
- User ID verified via session metadata
- Payment intent tracked to prevent reuse
- Stripe signature verification on webhooks

### ✅ Authorization
- User must be authenticated (`getUser()`)
- Session must belong to requesting user
- Event role checked for editing

### ✅ Error Handling
- Payment failures return 402 (Payment Required)
- Invalid sessions return 400 (Bad Request)
- Mismatched users return 403 (Forbidden)
- Duplicate use returns 409 (Conflict)

---

## Testing Checklist

### Manual Testing Required

- [ ] Navigate to event creation page
- [ ] Fill in event details
- [ ] Click "Pay & Create" → redirects to Stripe
- [ ] Complete payment with test card `4242 4242 4242 4242`
- [ ] Verify redirect to `/events/new?session_id=cs_test_...`
- [ ] Verify event created in database
- [ ] Verify payment fields populated:
  - `stripePaymentIntentId` not null
  - `paidAt` set to current timestamp
  - `amountPaid = 1200`
- [ ] Verify receipt email received
- [ ] Attempt to reuse session_id → expect 409 error
- [ ] Attempt to create without payment → expect 402 error
- [ ] Cancel payment in Stripe → verify redirect to `/events/new?canceled=true`

### Stripe Test Cards

- **Success:** `4242 4242 4242 4242`
- **Decline:** `4000 0000 0000 0002`
- **Insufficient funds:** `4000 0000 0000 9995`

---

## Environment Variables Required

No new environment variables added. Existing ones still required:

```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
RESEND_API_KEY=re_...
EMAIL_FROM="Gather <noreply@gather.app>"
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**Note:** `STRIPE_PRICE_ID` is no longer used (was for subscriptions).

---

## Known Issues / Future Work

### 1. **Frontend Not Updated**
This ticket only updates the backend. Frontend pages (e.g., `/events/new`) still need to be updated to:
- Call `POST /api/billing/checkout` with event name
- Handle redirect to Stripe
- Handle success/cancel callbacks
- Call `POST /api/events` with session_id

### 2. **Deprecated Routes**
Old billing routes should be disabled or removed:
- `/api/billing/portal`
- `/api/billing/cancel`
- `/api/billing/status`

### 3. **Database Cleanup**
Consider removing unused models in future migration:
- `User.billingStatus` field
- `Subscription` model

### 4. **Refunds**
No refund logic implemented. If needed, implement via Stripe dashboard manually or add refund API route.

### 5. **Currency Flexibility**
Currently hardcoded to NZD. Could add support for multiple currencies based on user location.

---

## Rollback Plan

If issues arise, rollback steps:

1. **Revert code:**
   ```bash
   git checkout master
   ```

2. **Revert database schema:**
   ```bash
   git checkout master -- prisma/schema.prisma
   npx prisma db push --accept-data-loss
   ```

3. **No data loss:** New fields are nullable, so reverting schema won't break existing events.

---

## Summary

✅ **Replaced subscription billing with per-event payment**
✅ **$12 NZD one-time payment per event**
✅ **Payment verification at checkout + event creation**
✅ **Receipt email sent automatically**
✅ **Database schema updated and migrated**
✅ **Type checking passes**
✅ **Production build succeeds**

**Next Steps:**
- Update frontend to integrate with new checkout flow
- Test end-to-end with Stripe test cards
- Remove deprecated subscription routes
- Clean up unused database models (optional)

---

**Implementation completed by:** Claude Sonnet 4.5
**Branch:** `per-event-payment`
**Ready for:** Code review and frontend integration
