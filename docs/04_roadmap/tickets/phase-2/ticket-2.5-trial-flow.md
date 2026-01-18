# Ticket 2.5 Complete — Entitlement Service

**Branch:** `phase2/ticket-2.1-subscription-schema`
**Status:** ✅ Complete
**Date:** 2026-01-18

---

## What Was Implemented

### 1. Database Schema Changes

#### **Event.isLegacy Field**
Added `isLegacy` boolean field to the Event model:
- Default: `false`
- Purpose: Identify pre-monetization events that don't count against free tier limits
- Legacy events remain editable regardless of billing status

#### **Subscription.statusChangedAt Field**
Added `statusChangedAt` DateTime field to the Subscription model:
- Tracks when the billing status last changed
- Critical for PAST_DUE grace period calculation (7 days from status change)
- Updated automatically by billing sync functions

### 2. Entitlement Service Library

Created `src/lib/entitlements.ts` with four core functions:

#### **canCreateEvent(userId): Promise<boolean>**
Checks if a user can create a new event based on their billing status.

**Rules:**
- **FREE**: Can create if under 1 event in rolling 12 months (excludes legacy events)
- **TRIALING**: Unlimited creation
- **ACTIVE**: Unlimited creation
- **PAST_DUE**: Cannot create new events
- **CANCELED**: Cannot create new events

**Implementation:**
- Queries EventRole table for HOST roles
- Filters by `isLegacy: false`
- Checks against rolling 12-month window

#### **canEditEvent(userId, eventId): Promise<boolean>**
Checks if a user can edit a specific event.

**Rules:**
- **Legacy events**: Always editable (regardless of billing status)
- **FREE**: Can edit all their events
- **TRIALING**: Can edit all events
- **ACTIVE**: Can edit all events
- **PAST_DUE**: Can edit if within 7-day grace period from status change
- **CANCELED**: Cannot edit (except legacy events)

**Implementation:**
- Checks event's `isLegacy` flag first
- For PAST_DUE, calculates grace period end using `statusChangedAt`
- Returns false for canceled subscriptions

#### **getEventLimit(userId): Promise<number | 'unlimited'>**
Returns the event creation limit for a user.

**Return values:**
- **FREE**: `1`
- **TRIALING**: `'unlimited'`
- **ACTIVE**: `'unlimited'`
- **PAST_DUE**: `0`
- **CANCELED**: `0`

#### **getRemainingEvents(userId): Promise<number | 'unlimited'>**
Returns the number of remaining events a user can create.

**Logic:**
- For unlimited tiers: Returns `'unlimited'`
- For FREE tier: Calculates `limit - current_count` in rolling 12 months
- For restricted tiers: Returns `0`

### 3. Billing Sync Updates

Updated all billing sync functions in `src/lib/billing/sync.ts` to track `statusChangedAt`:

#### **syncSubscriptionFromStripe()**
- Checks if status is changing
- Sets `statusChangedAt` to current timestamp if status changed
- Preserves existing timestamp if status unchanged

#### **handleSubscriptionDeleted()**
- Sets `statusChangedAt` when marking subscription as CANCELED
- Critical for tracking when cancellation occurred

#### **handleInvoicePaid()**
- Sets `statusChangedAt` when recovering from PAST_DUE to ACTIVE
- Enables grace period reset on successful payment

#### **handleInvoicePaymentFailed()**
- Sets `statusChangedAt` when entering PAST_DUE status
- Starts the 7-day grace period countdown

### 4. Verification Script

Created `scripts/verify-ticket-2.5.ts` with 30 automated checks:
- Schema changes (2 checks)
- Entitlement functions (4 checks)
- Billing status handling (5 checks)
- Legacy event handling (1 check)
- Grace period logic (1 check)
- Rolling 12-month period (1 check)
- HOST role filtering (1 check)
- Return type validation (4 checks)
- Billing sync updates (4 checks)
- Business logic validation (7 checks)

**Result:** 30/30 checks passed ✅

---

## Implementation Details

### Constants Defined

```typescript
const GRACE_PERIOD_DAYS = 7;
const FREE_TIER_LIMIT = 1;
const ROLLING_PERIOD_MONTHS = 12;
```

### Key Query Pattern

For FREE tier event counting:
```typescript
const eventCount = await prisma.eventRole.count({
  where: {
    userId,
    role: 'HOST',
    createdAt: {
      gte: twelveMonthsAgo,
    },
    event: {
      isLegacy: false,  // Don't count legacy events
    },
  },
});
```

### Grace Period Calculation

For PAST_DUE users:
```typescript
const gracePeriodEnd = new Date(statusChangedAt);
gracePeriodEnd.setDate(gracePeriodEnd.getDate() + GRACE_PERIOD_DAYS);
return new Date() <= gracePeriodEnd;
```

---

## Verification Results

✅ **All acceptance criteria met:**

1. **Entitlement functions created** — All 4 functions implemented in `src/lib/entitlements.ts`
2. **FREE tier enforced** — 1 event per rolling 12 months (excludes legacy events)
3. **TRIALING/ACTIVE unlimited** — Both tiers have unlimited event creation
4. **PAST_DUE grace period** — 7 days from status change for editing, no new creation
5. **CANCELED read-only** — No creation or editing (except legacy events)
6. **Legacy event handling** — Legacy events always editable and don't count against limits
7. **Status tracking** — `statusChangedAt` updated by all billing sync functions
8. **Rolling 12-month window** — FREE tier limit calculated from rolling period

**Automated verification:** 30/30 checks passed ✅

---

## Files Changed

### Created
- `src/lib/entitlements.ts` — Entitlement service with 4 core functions
- `scripts/verify-ticket-2.5.ts` — Verification script
- `docs/TICKET_2.5_COMPLETE.md` — This file

### Modified
- `prisma/schema.prisma` — Added `isLegacy` to Event, `statusChangedAt` to Subscription
- `src/lib/billing/sync.ts` — Updated all sync functions to track `statusChangedAt`

---

## Testing Performed

### Automated Verification
```bash
npx tsx scripts/verify-ticket-2.5.ts
```
✅ All 30 checks passed

### TypeScript Compilation
```bash
npm run typecheck
```
✅ No new TypeScript errors introduced

### Database Schema Sync
```bash
npx prisma db push
npx prisma generate
```
✅ Schema successfully updated with new fields

---

## Usage Examples

### Check if user can create an event
```typescript
import { canCreateEvent } from '@/lib/entitlements';

const userId = 'cuid123';
const allowed = await canCreateEvent(userId);

if (allowed) {
  // Proceed with event creation
} else {
  // Show upgrade prompt
}
```

### Check if user can edit an event
```typescript
import { canEditEvent } from '@/lib/entitlements';

const userId = 'cuid123';
const eventId = 'event456';
const allowed = await canEditEvent(userId, eventId);

if (allowed) {
  // Show edit form
} else {
  // Show read-only view
}
```

### Get user's event limit
```typescript
import { getEventLimit, getRemainingEvents } from '@/lib/entitlements';

const userId = 'cuid123';
const limit = await getEventLimit(userId);
const remaining = await getRemainingEvents(userId);

console.log(`Limit: ${limit}, Remaining: ${remaining}`);
// FREE user: "Limit: 1, Remaining: 0"
// ACTIVE user: "Limit: unlimited, Remaining: unlimited"
```

---

## Integration Points

### Event Creation API
To enforce entitlements in event creation:
```typescript
// src/app/api/events/route.ts
import { canCreateEvent } from '@/lib/entitlements';

export async function POST(request: Request) {
  const userId = await getCurrentUserId(request);

  const allowed = await canCreateEvent(userId);
  if (!allowed) {
    return new Response('Event limit reached', { status: 403 });
  }

  // Proceed with event creation
}
```

### Event Edit API
To enforce entitlements in event editing:
```typescript
// src/app/api/events/[id]/route.ts
import { canEditEvent } from '@/lib/entitlements';

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const userId = await getCurrentUserId(request);
  const eventId = params.id;

  const allowed = await canEditEvent(userId, eventId);
  if (!allowed) {
    return new Response('Cannot edit event', { status: 403 });
  }

  // Proceed with event update
}
```

---

## Business Rules Summary

| Status | Create New | Edit Existing | Edit Legacy | Limit |
|--------|-----------|---------------|-------------|-------|
| FREE | ✅ (1/12mo) | ✅ | ✅ | 1 |
| TRIALING | ✅ | ✅ | ✅ | Unlimited |
| ACTIVE | ✅ | ✅ | ✅ | Unlimited |
| PAST_DUE | ❌ | ✅ (7 days) | ✅ | 0 |
| CANCELED | ❌ | ❌ | ✅ | 0 |

**Key Notes:**
- Legacy events (isLegacy: true) don't count against FREE tier limit
- PAST_DUE grace period is 7 days from when status changed to PAST_DUE
- Rolling 12-month window means events older than 12 months don't count

---

## Implementation Safety

This implementation is **completely safe** for the existing codebase:

1. **Additive only** — New library with no changes to existing event logic
2. **Opt-in enforcement** — APIs must explicitly call entitlement functions
3. **Backward compatible** — All existing events work unchanged
4. **Grace period** — PAST_DUE users get 7 days to fix payment
5. **Legacy protection** — Pre-monetization events remain accessible

---

## Dependencies

**Satisfied:**
- ✅ Ticket 2.1: Subscription schema exists
- ✅ Ticket 2.2: Stripe SDK and webhooks
- ✅ Ticket 2.3: Checkout flow creates subscriptions
- ✅ Ticket 2.4: Billing sync maintains status

**External:**
- Prisma Client (for database queries)
- EventRole table (for HOST role tracking)
- User and Subscription tables (for billing status)

---

## Next Steps

Ready to proceed to **Ticket 2.6** or integrate entitlements into event APIs.

**Current state:**
- ✅ Entitlement rules defined and implemented
- ✅ FREE tier limit enforced (1 event per 12 months)
- ✅ PAST_DUE grace period implemented (7 days)
- ✅ Legacy events protected from restrictions
- ✅ All billing statuses handled correctly

**Remaining Phase 2 work:**
- Integrate entitlements into event creation/edit APIs
- Add UI to display limits and upgrade prompts
- Implement subscription management UI
- Add email notifications for billing events

---

## Run Verification

To verify this implementation:

```bash
# Run automated verification
npx tsx scripts/verify-ticket-2.5.ts

# Check TypeScript compilation
npm run typecheck

# Sync database schema
npx prisma db push
npx prisma generate
```

---

## Known Limitations

1. **No caching** — Every entitlement check queries the database (could add Redis caching)
2. **No rate limiting** — Unlimited entitlement checks (could DOS the service)
3. **Sync operation** — All functions are async database calls (acceptable for MVP)
4. **No audit trail** — Entitlement denials not logged (could add for compliance)
5. **No bulk checks** — Must check entitlements one at a time (could add batch API)

---

## Migration Notes

**Database changes:**
- Added `Event.isLegacy` (default: false)
- Added `Subscription.statusChangedAt` (nullable)

**For existing data:**
- All existing events automatically get `isLegacy: false`
- Existing subscriptions have `statusChangedAt: null`
- First status change will set `statusChangedAt`

**To mark existing events as legacy:**
```sql
-- Mark all events created before monetization launch
UPDATE "Event"
SET "isLegacy" = true
WHERE "createdAt" < '2026-01-01';  -- Adjust date as needed
```

---

**Ticket 2.5: ✅ COMPLETE**
