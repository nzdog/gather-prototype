# TICKET 2.1: RSVP State Machine - Implementation Documentation

## Implementation Date
January 30, 2026

## Summary
Successfully implemented the RSVP state machine that separates attendance tracking (RSVP) from item assignment responses. Participants must now respond to "Are you coming?" before seeing their item assignments.

## Files Modified

### 1. Schema Changes
**File:** `prisma/schema.prisma`
- Added `RsvpStatus` enum with values: PENDING, YES, NO, NOT_SURE
- Extended `PersonEvent` model with:
  - `rsvpStatus: RsvpStatus @default(PENDING)`
  - `rsvpRespondedAt: DateTime?` (tracks most recent RSVP change)

### 2. Database Migration
**File:** `prisma/migrations/20260130072549_add_rsvp_state_machine/migration.sql`
- Created migration to add enum and fields to database
- Migration applied successfully

### 3. Participant View
**File:** `src/app/p/[token]/page.tsx`
- Added `rsvpStatus` and `rsvpRespondedAt` to `ParticipantData` interface
- Implemented `handleRsvpResponse()` function to update RSVP via PATCH request
- Added RSVP question UI with three buttons (Yes / No / Not sure)
- Conditionally renders content based on RSVP state:
  - **PENDING**: Shows RSVP question, hides assignments
  - **YES**: Shows assignments
  - **NO**: Shows "Thanks for letting us know" message, hides assignments
  - **NOT_SURE**: Shows assignments (same as YES)
- State changes are immediate - items appear/disappear based on RSVP selection

### 4. Participant API
**File:** `src/app/api/p/[token]/route.ts`
- Added import for `RsvpStatus` type from Prisma client
- Extended GET response to include:
  - `rsvpStatus: personEvent?.rsvpStatus || 'PENDING'`
  - `rsvpRespondedAt: personEvent?.rsvpRespondedAt?.toISOString() || null`
- Implemented new PATCH handler:
  - Validates token and scope
  - Validates rsvpStatus value (must be YES, NO, or NOT_SURE)
  - Updates PersonEvent with new rsvpStatus and current timestamp
  - Returns success response with updated values

### 5. Invite Status API
**File:** `src/app/api/events/[id]/invite-status/route.ts`
- Extended event query to include `rsvpStatus` and `rsvpRespondedAt` from PersonEvent
- Added RSVP breakdown to response:
  ```typescript
  rsvp: {
    pending: number,
    yes: number,
    no: number,
    notSure: number
  }
  ```

## Build Status

### Type Checking
✅ `npm run typecheck` - PASSED
No type errors

### Build
✅ `npm run build` - PASSED
- All routes compiled successfully
- No build errors related to RSVP implementation
- Pre-existing ESLint and billing route warnings unaffected

## Verification Results

### Manual Testing Performed

1. ✅ Database migration applied successfully
2. ✅ Participant view shows RSVP question on first load (PENDING state)
3. ✅ Clicking "Yes" shows item assignments
4. ✅ Clicking "No" hides assignments and shows "Thanks" message
5. ✅ Clicking "Not sure" shows item assignments
6. ✅ RSVP changes update `rsvpRespondedAt` timestamp with each change
7. ✅ API returns RSVP status correctly in GET response
8. ✅ PATCH endpoint validates input and updates database
9. ✅ Invite status API includes RSVP breakdown

### Key Behaviors Verified

- **State Persistence**: RSVP status persists across page reloads
- **Timestamp Updates**: `rsvpRespondedAt` updates on every RSVP change (not just first response)
- **Immediate UI Updates**: Items appear/disappear immediately when RSVP changes
- **Error Handling**: Invalid RSVP values return 400 with clear error message
- **Authorization**: Invalid tokens properly blocked with 403/404

## Implementation Decisions

1. **Timestamp Behavior**: `rsvpRespondedAt` updates on every RSVP change, not just the first response. This aligns with the ticket spec that hosts care about "when did I last hear from them?" rather than first response time.

2. **NOT_SURE Behavior**: Items are visible when RSVP is NOT_SURE (same as YES). Ticket 2.2 will add forced conversion logic for this state.

3. **UI Flow**: RSVP question appears immediately when status is PENDING, blocking access to assignments until participant responds. This creates a clear decision point before item assignment.

4. **State Changes**: Users can change their RSVP at any time. When changing from YES to NO, items disappear immediately. When changing from NO to YES, items reappear immediately.

## Edge Cases Handled

| Scenario | Behavior |
|----------|----------|
| User changes YES → NO | Items disappear immediately, "Thanks" message shown |
| User changes NO → YES | Items reappear immediately, RSVP question hidden |
| User changes NOT_SURE → YES | No visible change (items already showing) |
| User spam-clicks RSVP buttons | Each click updates `rsvpRespondedAt` (acceptable behavior) |
| Invalid token | 403 Unauthorized response |
| Invalid RSVP value | 400 Bad Request with clear error message |
| PersonEvent not found | 404 Not found response |

## Dependencies
- Depends on: Epic 1 complete (PersonEvent model with reachability fields) ✅
- Required for: Ticket 2.2 (Forced conversion for NOT_SURE state)

## Notes for Future Tickets

- **Ticket 2.2**: Will add forced conversion logic to prompt NOT_SURE users to commit to YES or NO when they interact with items
- The RSVP system is now completely separate from assignment responses (PENDING/ACCEPTED/DECLINED)
- Host dashboard will need updates to display RSVP breakdown (data is available via invite-status API)

## Database State
All existing PersonEvent records automatically set to `rsvpStatus = 'PENDING'` via migration default value.
