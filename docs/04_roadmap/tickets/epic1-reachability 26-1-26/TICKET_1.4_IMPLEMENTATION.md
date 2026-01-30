# Ticket 1.4: Dashboard Reachability Bar - Implementation Documentation

## Overview
This ticket adds a visual reachability breakdown to the host dashboard, showing how many people are trackable via direct contact, reachable via proxy, or untrackable. This helps hosts understand who can be nudged automatically versus who requires manual follow-up.

## Files Created

### 1. `/src/components/plan/ReachabilityBar.tsx`
- New component displaying reachability breakdown
- Features:
  - Visual horizontal bar chart with color-coded segments
  - Four categories: Direct (green), Proxy (blue), Shared link (amber), Untrackable (gray)
  - Summary text showing counts for each category
  - Interactive segments - clicking opens modal showing names in that tier
  - Color legend for clarity
  - Modal with list of people in selected tier

## Files Modified

### 1. `/src/app/api/events/[id]/invite-status/route.ts`
**Changes:**
- Updated Prisma query to include `reachabilityTier` from PersonEvent
- Added `reachabilityTier` to `PersonInviteStatus` interface
- Added `reachability` breakdown to API response:
  ```typescript
  {
    reachability: {
      direct: number,    // DIRECT tier
      proxy: number,     // PROXY tier
      shared: number,    // SHARED tier
      untrackable: number // UNTRACKABLE tier
    }
  }
  ```
- Counts calculated by iterating through event.people and tallying each tier

### 2. `/src/components/plan/InviteStatusSection.tsx`
**Changes:**
- Imported `ReachabilityBar` component
- Updated `PersonStatus` interface to include `reachabilityTier` field
- Updated `InviteStatusData` interface to include optional `reachability` object
- Added new section "Reachability Breakdown" after SMS summary
- Added warning banner when untrackable count > 0:
  - Displays count of untrackable people (SHARED + UNTRACKABLE combined)
  - Shows message about inability to send automated nudges
  - Suggests collecting contact info
- Integrated `ReachabilityBar` component with data and people props

## Implementation Details

### Reachability Tiers
Following the schema from Ticket 1.1:
- **DIRECT**: People with direct contact info (email/SMS) - fully trackable
- **PROXY**: People reachable through a proxy person (household member)
- **SHARED**: People who claimed via shared link - have some tracking
- **UNTRACKABLE**: People with no contact method

### Visual Design
- **Trackable** (DIRECT only): Green segment
- **Via Proxy** (PROXY): Blue segment
- **Untrackable** (SHARED + UNTRACKABLE combined): Amber/gray segments

### Warning Logic
- Warning banner appears when `(reachability.shared + reachability.untrackable) > 0`
- Styled with amber color scheme to indicate caution
- Clear messaging about automated nudge limitations

## Build Status

### TypeCheck Results
✅ **PASSED** - `npm run typecheck`
- No TypeScript errors
- All type definitions are correct

### Build Results
✅ **PASSED** - `npm run build`
- Successful production build
- All components compiled correctly
- No breaking changes introduced

Build output shows:
- Route `/plan/[eventId]` compiled successfully: 79.1 kB → 167 kB First Load JS
- All API routes compiled without errors
- Static generation completed for all pages

## Verification Steps

To verify this implementation:

1. **Create test data** with mixed reachability tiers:
   ```sql
   -- Update PersonEvent records to have different reachability tiers
   UPDATE "PersonEvent" SET "reachabilityTier" = 'DIRECT' WHERE "id" IN (...);
   UPDATE "PersonEvent" SET "reachabilityTier" = 'PROXY' WHERE "id" IN (...);
   UPDATE "PersonEvent" SET "reachabilityTier" = 'SHARED' WHERE "id" IN (...);
   UPDATE "PersonEvent" SET "reachabilityTier" = 'UNTRACKABLE' WHERE "id" IN (...);
   ```

2. **Navigate to host dashboard** for an event in CONFIRMING status

3. **Verify the reachability bar displays**:
   - Shows correct counts matching database
   - Visual bar segments are proportional to counts
   - Color coding matches tier types
   - Legend is displayed

4. **Click each segment** to verify modal:
   - Modal opens showing people in that tier
   - Names match the selected tier
   - Close button works correctly

5. **Verify warning banner**:
   - Appears when untrackable > 0
   - Shows correct count
   - Disappears when untrackable = 0

## Integration Points

This component integrates seamlessly with:
- Ticket 1.1: Uses `ReachabilityTier` enum and PersonEvent.reachabilityTier field
- Ticket 1.2: Counts PROXY tier from household proxy relationships
- Ticket 1.3: Counts SHARED tier from shared link claims
- Existing invite status tracking system

## Implementation Decisions

1. **Grouping SHARED and UNTRACKABLE**: While these are separate tiers in the schema, they're combined in the visual display as "Untrackable" since both prevent automated nudges. The bar still shows them in different colors (amber vs gray) for visual clarity.

2. **Modal interaction**: Clicking segments opens a modal instead of inline expansion to avoid cluttering the dashboard and provide a focused view of people in each tier.

3. **Warning threshold**: Warning triggers on any untrackable people (SHARED or UNTRACKABLE), as both require manual intervention.

4. **Positioning**: Placed after SMS summary and before nudge summary, as it provides context for understanding which people can receive automated communications.

## Next Steps

This ticket is complete and ready for:
- User testing with real event data
- Integration with Ticket 1.5 (proxy nudge logic)
- Future enhancements to handle tier transitions

## Notes

- No database migrations required (schema from Ticket 1.1 already in place)
- Component is responsive and works on mobile/tablet
- Accessibility considerations: Color coding is supplemented with text labels
- Performance: Efficient - only one additional field in existing API query
