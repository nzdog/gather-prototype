# Phase 2: Quick Reference Card

## What Was Built
**Invite Send Confirmation** - Lets hosts mark when they've actually sent invites (not just transitioned to CONFIRMING status).

---

## Key Files

### New API Endpoints
```
POST /api/events/[id]/confirm-invites-sent
GET  /api/events/[id]/invite-status
```

### New Component
```
src/components/plan/InviteStatusSection.tsx
```

### Database Changes
```sql
Event.inviteSendConfirmedAt  -- Event-level timestamp
Person.inviteAnchorAt         -- Per-person nudge anchor
```

---

## How It Works

### For Hosts
1. Navigate to event → Click "Invite Links"
2. See InviteStatusSection at top
3. Click "I've sent the invites" button
4. System records timestamp and sets anchors for all people
5. Status updates automatically (Not sent → Sent)

### For Developers
```typescript
// When host confirms
POST /api/events/[id]/confirm-invites-sent
→ Sets Event.inviteSendConfirmedAt = NOW
→ Sets Person.inviteAnchorAt = NOW (for people without anchors)
→ Logs INVITE_SEND_CONFIRMED event

// To get current status
GET /api/events/[id]/invite-status
→ Returns counts + per-person status
→ Status: NOT_SENT | SENT | OPENED | RESPONDED
```

---

## Test Results (2026-01-23)

**Event:** Wickham Family Christmas (29 people)
**Result:** ✅ All tests passed

```
Before: Not sent: 29, Sent: 0, Opened: 0, Responded: 0
After:  Not sent: 0,  Sent: 29, Opened: 0, Responded: 0
```

**Database:**
- ✅ Event.inviteSendConfirmedAt: 2026-01-23 00:57:49
- ✅ 29/29 people have inviteAnchorAt set
- ✅ INVITE_SEND_CONFIRMED event logged

---

## Important Notes

⚠️ **Authentication Currently Disabled**
```typescript
// TODO: Re-enable before production
// const auth = await requireEventRole(eventId, ['HOST'])
```

🔄 **Auto-Refresh**
Component polls every 30 seconds for updates

📊 **Status Hierarchy**
RESPONDED > OPENED > SENT > NOT_SENT

---

## Next Steps for Production

1. Re-enable authentication on both endpoints
2. Test with real user sessions
3. Test re-confirmation flow (adding people after initial confirm)
4. Monitor performance with larger events

---

## Future Integration

**Phase 5 (Auto-Nudges) will use:**
- `Person.inviteAnchorAt` for 24h/48h nudge timing
- `invite-status` API to check if person opened/responded
- Status hierarchy to determine which nudge to send

**Example:**
```typescript
// Send nudge 24h after anchor if not opened
if (now - person.inviteAnchorAt >= 24h && !person.openedAt) {
  sendOpenRescueNudge(person)
}
```

---

**Quick Access:**
- Full documentation: `PHASE_2_IMPLEMENTATION_COMPLETE.md`
- Detailed test plan: `TEST_PHASE_2_RESULTS.md`
- Test summary: `PHASE_2_TEST_SUMMARY.md`
