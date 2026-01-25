# Phase 2: Invite Send Confirmation - Test Results

**Test Date:** 2026-01-23
**Event ID:** cmkkwt0qd000un99ryvc3m5ic (Wickham Family Christmas)
**Test Status:** ✅ All automated checks passed

---

## ✅ Automated Verification Tests

### 1. Schema Changes
- ✅ Event.inviteSendConfirmedAt column exists (timestamp)
- ✅ Person.inviteAnchorAt column exists (timestamp)
- ✅ Migration applied: 20260123003222_invite_send_confirm
- ✅ InviteEventType enum includes INVITE_SEND_CONFIRMED

### 2. File Structure
- ✅ `/api/events/[id]/confirm-invites-sent/route.ts` created (2,038 bytes)
- ✅ `/api/events/[id]/invite-status/route.ts` created (3,292 bytes)
- ✅ `/components/plan/InviteStatusSection.tsx` created (6,746 bytes)

### 3. Code Quality
- ✅ TypeScript compilation passes (npm run typecheck)
- ✅ No linting errors
- ✅ All imports resolved correctly

### 4. Database State (Before Manual Testing)
- Event: "Wickham Family Christmas" in CONFIRMING status
- inviteSendConfirmedAt: NULL (not confirmed yet)
- People count: 10 people
- All people have inviteAnchorAt: NULL (expected before confirmation)

---

## 📋 Manual Testing Checklist

### Test 1: Initial Confirmation Flow

**Prerequisites:**
1. Log in to the app
2. Navigate to event: Wickham Family Christmas
3. Ensure event is in CONFIRMING status
4. Click on "Invite Links" section

**Expected Results:**
- [ ] InviteStatusSection appears at top of Invite Links modal
- [ ] Shows "10 people haven't been marked as sent yet"
- [ ] Progress bar shows 0% responded
- [ ] Status breakdown shows:
  - Not sent: 10
  - Sent: 0
  - Opened: 0
  - Responded: 0
- [ ] "I've sent the invites" button is visible

**Actions:**
1. Click "I've sent the invites" button

**Expected Database Changes:**
```sql
-- Check Event table
SELECT "inviteSendConfirmedAt" FROM "Event"
WHERE id = 'cmkkwt0qd000un99ryvc3m5ic';
-- Should show current timestamp

-- Check Person table (all 10 people should have anchor set)
SELECT COUNT(*) FROM "Person" p
JOIN "PersonEvent" pe ON pe."personId" = p.id
WHERE pe."eventId" = 'cmkkwt0qd000un99ryvc3m5ic'
AND p."inviteAnchorAt" IS NOT NULL;
-- Should return: 10

-- Check InviteEvent log
SELECT * FROM "InviteEvent"
WHERE "eventId" = 'cmkkwt0qd000un99ryvc3m5ic'
AND type = 'INVITE_SEND_CONFIRMED';
-- Should show 1 row with metadata
```

**Expected UI Changes:**
- [ ] "Not sent" count drops to 0
- [ ] All people show status icon (yellow "Sent" icon)
- [ ] "I've sent the invites" button disappears (or section collapses)
- [ ] "Last confirmed" timestamp appears

---

### Test 2: Add Person After Confirmation

**Prerequisites:**
- Test 1 completed (invites already confirmed)

**Actions:**
1. Add a new person: "Uncle Derek"
2. Refresh Invite Links section

**Expected Results:**
- [ ] InviteStatusSection shows "1 person hasn't been marked as sent yet"
- [ ] Status breakdown shows:
  - Not sent: 1
  - Sent: 9
  - Opened: 0
  - Responded: 0
- [ ] "I've sent the invites" button reappears

**Expected Database State:**
```sql
-- Derek should have inviteAnchorAt set to event's inviteSendConfirmedAt
SELECT p.name, p."inviteAnchorAt", e."inviteSendConfirmedAt"
FROM "Person" p
JOIN "PersonEvent" pe ON pe."personId" = p.id
JOIN "Event" e ON e.id = pe."eventId"
WHERE p.name = 'Uncle Derek'
AND pe."eventId" = 'cmkkwt0qd000un99ryvc3m5ic';
-- inviteAnchorAt should equal inviteSendConfirmedAt
```

---

### Test 3: Re-confirm After Adding Person

**Prerequisites:**
- Test 2 completed (Derek added but not confirmed)

**Actions:**
1. Click "I've sent the invites" again

**Expected Results:**
- [ ] All 11 people show as "Sent"
- [ ] Original 10 people keep their original anchor time
- [ ] Derek gets current timestamp as anchor
- [ ] New INVITE_SEND_CONFIRMED event logged

**Expected Database State:**
```sql
-- Check that original people kept their anchor
SELECT COUNT(*) as original_people
FROM "Person" p
JOIN "PersonEvent" pe ON pe."personId" = p.id
WHERE pe."eventId" = 'cmkkwt0qd000un99ryvc3m5ic'
AND p.name != 'Uncle Derek'
AND p."inviteAnchorAt" < NOW() - INTERVAL '1 minute';
-- Should return: 10

-- Check InviteEvent count
SELECT COUNT(*) FROM "InviteEvent"
WHERE "eventId" = 'cmkkwt0qd000un99ryvc3m5ic'
AND type = 'INVITE_SEND_CONFIRMED';
-- Should return: 2
```

---

### Test 4: Status Progression (Opened)

**Prerequisites:**
- Invite confirmed

**Actions:**
1. Copy a participant's invite link
2. Open in incognito/private browser window
3. Return to host dashboard and refresh

**Expected Results:**
- [ ] Person's status changes from "Sent" (yellow) to "Opened" (blue eye icon)
- [ ] Status breakdown updates:
  - Opened: 1
  - Sent: decreases by 1

---

### Test 5: Status Progression (Responded)

**Prerequisites:**
- Test 4 completed (link opened)

**Actions:**
1. In participant view, accept an assignment
2. Return to host dashboard and refresh

**Expected Results:**
- [ ] Person's status changes to "Responded" (green checkmark)
- [ ] Progress bar increases
- [ ] Status breakdown updates:
  - Responded: 1
  - Opened: decreases by 1

---

### Test 6: Auto-Refresh

**Prerequisites:**
- Event in CONFIRMING status

**Actions:**
1. Keep Invite Links section open
2. Wait 30 seconds without interaction

**Expected Results:**
- [ ] Status data refreshes automatically
- [ ] Any status changes appear without manual refresh

---

### Test 7: CSV Import After Confirmation

**Prerequisites:**
- Invites confirmed

**Actions:**
1. Import CSV with 2 new people
2. Check database

**Expected Database State:**
```sql
-- Both imported people should have anchor set
SELECT COUNT(*) FROM "Person" p
JOIN "PersonEvent" pe ON pe."personId" = p.id
WHERE pe."eventId" = 'cmkkwt0qd000un99ryvc3m5ic'
AND p."createdAt" > NOW() - INTERVAL '1 minute'
AND p."inviteAnchorAt" IS NOT NULL;
-- Should return: 2
```

---

### Test 8: Edge Cases

#### 8a. Confirm in DRAFT Status
**Actions:** Try to confirm invites while event is in DRAFT
**Expected:** ❌ API returns 400 error "Can only confirm invites when event is in CONFIRMING status"

#### 8b. Confirm in FROZEN Status
**Actions:** Freeze event, try to confirm invites
**Expected:** ❌ API returns 400 error

#### 8c. Event with Zero People
**Actions:** Remove all people, try to confirm
**Expected:** ✅ Confirms successfully, no errors, 0 people anchored

---

## 🔍 Verification Queries

### Current Event State
```sql
SELECT
  e.name,
  e.status,
  e."inviteSendConfirmedAt",
  COUNT(DISTINCT pe."personId") as total_people,
  COUNT(DISTINCT CASE WHEN p."inviteAnchorAt" IS NOT NULL THEN p.id END) as anchored_people
FROM "Event" e
LEFT JOIN "PersonEvent" pe ON pe."eventId" = e.id
LEFT JOIN "Person" p ON p.id = pe."personId"
WHERE e.id = 'cmkkwt0qd000un99ryvc3m5ic'
GROUP BY e.id;
```

### People Status Breakdown
```sql
SELECT
  p.name,
  p."inviteAnchorAt",
  (SELECT "openedAt" FROM "AccessToken"
   WHERE "personId" = p.id AND scope = 'PARTICIPANT'
   LIMIT 1) as opened_at,
  (SELECT COUNT(*) FROM "Assignment" a
   JOIN "Item" i ON i.id = a."itemId"
   JOIN "Team" t ON t.id = i."teamId"
   WHERE a."personId" = p.id
   AND t."eventId" = 'cmkkwt0qd000un99ryvc3m5ic'
   AND a.response != 'PENDING') as responded_count
FROM "Person" p
JOIN "PersonEvent" pe ON pe."personId" = p.id
WHERE pe."eventId" = 'cmkkwt0qd000un99ryvc3m5ic'
ORDER BY p.name;
```

### Invite Event History
```sql
SELECT
  type,
  "createdAt",
  metadata
FROM "InviteEvent"
WHERE "eventId" = 'cmkkwt0qd000un99ryvc3m5ic'
ORDER BY "createdAt" DESC;
```

---

## 🎯 Success Criteria

Phase 2 is considered fully tested when:

- [x] All automated verification tests pass
- [ ] All 8 manual tests complete successfully
- [ ] Database state matches expected results after each test
- [ ] No console errors in browser
- [ ] No TypeScript compilation errors
- [ ] UI updates correctly without page refresh (auto-polling works)
- [ ] Status icons display correctly for all states
- [ ] InviteEvent logs are created correctly

---

## 📝 Notes

- Authentication required for testing - must be logged in as event host
- Test event: "Wickham Family Christmas" (ID: cmkkwt0qd000un99ryvc3m5ic)
- All API endpoints require HOST role for security
- Status polling interval: 30 seconds
- Status hierarchy respected: RESPONDED > OPENED > SENT > NOT_SENT

