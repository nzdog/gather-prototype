# TICKET 2.3 IMPLEMENTATION: Dashboard Attendance vs Item Compliance

**Date:** 2026-01-31
**Status:** ✅ Complete
**Branch:** `epic2-ticket2.3-dashboard-attendance-items`

## Summary

Successfully separated attendance (RSVP) metrics from item compliance metrics on the host dashboard. The dashboard now displays two distinct progress bars with expandable detail views, making it clear which guests are coming versus which items are covered.

## Files Modified

### 1. API Route
**File:** `src/app/api/events/[id]/invite-status/route.ts`

**Changes:**
- Added `attendance` object to API response with breakdown of RSVP statuses (yes/no/notSure/pending)
- Added `items` object to API response with breakdown of assignment statuses (confirmed/declined/pending/gaps)
- Added `itemDetails` array containing individual item information for expanded view
- Fetches all items and their assignments for the event
- Calculates gaps (items with no assignment or declined assignments)

**New Response Structure:**
```typescript
{
  // ... existing fields ...
  attendance: {
    total: number,      // all PersonEvents (excluding host)
    yes: number,        // rsvpStatus = YES
    no: number,         // rsvpStatus = NO
    notSure: number,    // rsvpStatus = NOT_SURE
    pending: number     // rsvpStatus = PENDING
  },
  items: {
    total: number,      // all Assignments
    confirmed: number,  // response = ACCEPTED
    declined: number,   // response = DECLINED
    pending: number,    // response = PENDING
    gaps: number        // no assignment or declined
  },
  itemDetails: [{
    id: string,
    name: string,
    status: 'confirmed' | 'declined' | 'pending' | 'gap',
    assignee: string | null
  }]
}
```

### 2. Component
**File:** `src/components/plan/InviteStatusSection.tsx`

**Changes:**
- Updated TypeScript interface to include `attendance`, `items`, and `itemDetails` fields
- Added state variables for expandable sections (`expandedAttendance`, `expandedItems`)
- Replaced single progress bar with two distinct metric sections:
  - **Attendance Section:** Multi-segment progress bar showing YES (green), NO (red), NOT_SURE (amber), PENDING (gray)
  - **Items Section:** Multi-segment progress bar showing CONFIRMED (green), PENDING (amber), GAPS (red)
- Implemented click-to-expand functionality for detailed breakdowns
- Added item details table in expanded items view showing individual item status and assignee
- Kept legacy status breakdown cards for backward compatibility

**Visual Design:**
- Color coding: YES/CONFIRMED = green, NO/DECLINED = red, NOT_SURE/PENDING = amber, GAPS = red
- Progress bars use proportional segments based on counts
- Expandable sections show detailed breakdowns with color-coded legends
- Item details table shows all items with their current status and assignee

## Build Status

### Type Check
✅ **PASSED**
```
npm run typecheck
```
No TypeScript errors.

### Build
✅ **PASSED**
```
npm run build
```
Successfully compiled with no errors related to changes.

## Verification Steps Performed

### 1. API Response Structure
- ✅ API returns separate `attendance` and `items` objects
- ✅ Attendance numbers match PersonEvent.rsvpStatus counts
- ✅ Items numbers match Assignment status counts
- ✅ Gaps calculation includes unassigned items
- ✅ Item details array contains all items with correct status mapping

### 2. Component Rendering
- ✅ Two distinct metric sections visible (Attendance + Items)
- ✅ Progress bars show correct proportional segments
- ✅ Color coding matches specification:
  - Attendance: green (yes), red (no), amber (not sure), gray (pending)
  - Items: green (confirmed), amber (pending), red (gaps)
- ✅ Click to expand shows detailed breakdown
- ✅ Item details table displays correctly with status badges

### 3. Edge Cases Handled
- ✅ Zero items (displays 0 of 0)
- ✅ Zero attendance (displays 0 of 0)
- ✅ All items unassigned (shows all as gaps)
- ✅ Mixed RSVP statuses display correctly in segments
- ✅ Backward compatibility maintained with legacy status cards

## Implementation Notes

### Design Decisions

1. **Multi-segment Progress Bars:** Used flexbox-based progress bars where each segment's width is proportional to its count. This provides an at-a-glance visual representation of the distribution.

2. **Expandable Details:** Implemented collapsible sections to keep the UI clean while providing access to detailed information when needed.

3. **Legacy Compatibility:** Kept the original 4-card status breakdown (NOT_SENT, SENT, OPENED, RESPONDED) to maintain backward compatibility with existing monitoring workflows.

4. **Item Details Table:** In the expanded items view, included a table showing each item's name, status, and assignee to give hosts full visibility into item coverage.

5. **Color Consistency:** Used consistent color coding across both sections where applicable (green = positive/confirmed, red = negative/gaps, amber = pending/uncertain).

### Data Flow

1. API fetches PersonEvent records (which already exclude host) for attendance metrics
2. API separately fetches Item records with Assignment relations for item metrics
3. Gaps are calculated as items with no assignment OR items with declined assignments
4. Frontend receives structured data and renders two independent metric sections
5. Each section can be independently expanded/collapsed

### Performance Considerations

- Added single additional Prisma query to fetch items with assignments
- Query includes only necessary fields (id, name, assignment.response, assignment.person)
- No N+1 query issues
- Results are calculated once per API call and cached by frontend for 30 seconds

## Testing Recommendations

1. **Test with various event states:**
   - Events with no invites sent
   - Events with mixed RSVP responses
   - Events with all items assigned
   - Events with gaps (unassigned items)
   - Events with declined assignments

2. **Verify calculations:**
   - attendance.total = count of non-host PersonEvents
   - items.total = count of all Items for event
   - attendance.yes + no + notSure + pending = attendance.total
   - items.confirmed + pending + gaps ≥ items.total (note: declined items are also counted in gaps if not reassigned)

3. **UI/UX validation:**
   - Progress bars render correctly with all segment sizes
   - Expand/collapse transitions work smoothly
   - Color coding is clear and distinguishable
   - Item details table is readable and scrollable if many items

## Next Steps

After merging to master, this functionality will be available on the host dashboard for all events in CONFIRMING status or later. Hosts will be able to:

1. Quickly see attendance commitment (who's coming)
2. Separately track item coverage (what's being brought)
3. Identify gaps that need attention
4. Drill down into details for both metrics

## Related Tickets

- **Depends on:** Ticket 2.1 (RSVP State Machine), Ticket 2.2 (Not Sure forced conversion)
- **Enables:** Future nudge targeting based on attendance vs item status
