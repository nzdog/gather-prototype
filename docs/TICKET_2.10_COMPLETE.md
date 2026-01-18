# Ticket 2.10 Complete: Legacy Event Grandfathering

**Status:** ✅ Complete
**Date:** 2026-01-18
**Type:** Data migration + logic
**Risk:** Medium

## Overview

Ticket 2.10 implements legacy event grandfathering to ensure events created before monetisation launch:
- Don't count against free tier limits
- Remain fully editable regardless of billing status

## Implementation Summary

### 1. Schema ✅

The `Event.isLegacy` field already exists (added in Ticket 2.5):
```prisma
model Event {
  // ...
  isLegacy   Boolean     @default(false)
  // ...
}
```

**Key points:**
- Defaults to `false` for new events
- Existing events need to be marked as `true` via migration

### 2. Migration Script ✅

**File:** `scripts/mark-legacy-events.ts`

**Purpose:** One-time migration to mark all existing events as legacy at monetisation launch

**Features:**
- Counts events before migration
- Only updates events where `isLegacy: false`
- Logs count of events marked
- Safely disconnects from Prisma
- Exit codes: 0 (success), 1 (failure)

**Usage:**
```bash
npx tsx scripts/mark-legacy-events.ts
```

**Example output:**
```
Starting legacy event migration...

Total events: 150
Already marked as legacy: 0
Events to mark as legacy: 150

✓ Successfully marked 150 events as legacy

Migration complete!
All existing events are now grandfathered and:
- Will not count against free tier limits
- Remain editable regardless of billing status
```

### 3. Entitlement Logic ✅

The entitlement logic already handles legacy events correctly (implemented in Ticket 2.5):

**File:** `src/lib/entitlements.ts`

#### `canCreateEvent(userId)`
**Line 58-70:** Excludes legacy events from free tier count
```typescript
const eventCount = await prisma.eventRole.count({
  where: {
    userId,
    role: 'HOST',
    createdAt: { gte: twelveMonthsAgo },
    event: {
      isLegacy: false,  // Only count non-legacy events
    },
  },
});
```

#### `canEditEvent(userId, eventId)`
**Line 116-119:** Returns true immediately for legacy events, bypassing all billing status checks
```typescript
// Legacy events are always editable
if (event.isLegacy) {
  return true;
}
```

**Key behavior:**
- Legacy check happens BEFORE billing status checks
- Bypasses FREE, CANCELED, and PAST_DUE restrictions
- No grace period limitations for legacy events

#### `getRemainingEvents(userId)`
**Line 228-240:** Excludes legacy events from remaining count calculation
```typescript
const eventCount = await prisma.eventRole.count({
  where: {
    userId,
    role: 'HOST',
    createdAt: { gte: twelveMonthsAgo },
    event: {
      isLegacy: false,  // Only count non-legacy events
    },
  },
});
```

### 4. Verification Script ✅

**File:** `scripts/verify-ticket-2.10.ts`

**Purpose:** Validates the implementation of Ticket 2.10

**Checks:**
1. ✅ Schema has `Event.isLegacy` field with default `false`
2. ✅ Migration script exists and updates events correctly
3. ✅ Migration script logs count of events marked
4. ✅ `canCreateEvent` excludes legacy events from count
5. ✅ `canEditEvent` allows editing legacy events
6. ✅ Legacy check bypasses billing status checks
7. ✅ `getRemainingEvents` excludes legacy events
8. ✅ POST /api/events doesn't set `isLegacy: true`
9. ✅ Legacy events editable even when CANCELED
10. ✅ Legacy events editable even when PAST_DUE
11. ✅ FREE users can edit legacy events

**Usage:**
```bash
npx tsx scripts/verify-ticket-2.10.ts
```

**Result:** 17/17 checks passed (100%)

## Acceptance Criteria

All acceptance criteria met:

- ✅ Migration script marks all existing events as `isLegacy: true`
- ✅ Legacy events excluded from free tier event count
- ✅ Legacy events remain editable even if user is FREE
- ✅ Legacy events remain editable even if user is CANCELED
- ✅ New events after migration: `isLegacy: false` (schema default)

## Files Created

1. `scripts/mark-legacy-events.ts` - Migration script
2. `scripts/verify-ticket-2.10.ts` - Verification script
3. `docs/TICKET_2.10_COMPLETE.md` - This completion document

## Files Modified

None (all required logic was already implemented in Ticket 2.5)

## Testing

### Migration Script
- ✅ Syntax validation passed
- ✅ TypeScript compilation successful
- ✅ Imports Prisma client correctly
- ✅ Includes error handling and cleanup

### Verification Script
- ✅ All 17 checks passed
- ✅ Validates schema structure
- ✅ Validates migration script logic
- ✅ Validates entitlement logic
- ✅ Validates API integration
- ✅ Validates business logic rules

## Deployment Checklist

When deploying monetisation to production:

1. ✅ Ensure all Phase 2 tickets are complete
2. ✅ Run database migration if needed
3. 🔲 **RUN ONCE:** `npx tsx scripts/mark-legacy-events.ts`
4. 🔲 Verify migration with: `npx tsx scripts/verify-ticket-2.10.ts`
5. 🔲 Test legacy event behavior in production
6. 🔲 Monitor for any issues with legacy events

## Key Behaviors

### Legacy Events (isLegacy: true)
- ✅ Don't count toward free tier limit (1 event per 12 months)
- ✅ Always editable regardless of billing status
- ✅ Bypass CANCELED restrictions
- ✅ Bypass PAST_DUE grace period restrictions
- ✅ Bypass FREE tier edit restrictions

### New Events (isLegacy: false)
- ✅ Count toward free tier limit
- ✅ Subject to billing status restrictions
- ✅ Follow standard entitlement rules

## Related Tickets

- **Ticket 2.1:** Subscription schema (adds billing infrastructure)
- **Ticket 2.2:** Stripe integration (handles subscription webhooks)
- **Ticket 2.5:** Entitlement service (implements `isLegacy` logic)
- **Ticket 2.6:** Event creation API (sets default `isLegacy: false`)
- **Ticket 2.9:** Cancellation handling (enforces read-only mode)

## Notes

- The `isLegacy` field and entitlement logic were already implemented in Ticket 2.5
- This ticket focused on creating the migration script and verification tooling
- The migration script should only be run ONCE at monetisation launch
- After migration, all new events will default to `isLegacy: false`
- Legacy events provide a smooth transition for existing users to the new billing model

## Conclusion

Ticket 2.10 is complete. The legacy event grandfathering system:
- Protects existing users' events from new billing restrictions
- Ensures smooth transition to monetised model
- Maintains backward compatibility
- Provides clear migration path

The implementation is fully validated with 100% verification pass rate.
