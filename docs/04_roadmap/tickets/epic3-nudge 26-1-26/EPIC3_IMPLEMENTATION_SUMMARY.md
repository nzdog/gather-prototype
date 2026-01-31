# Epic 3: Nudge Infrastructure - Implementation Summary

**Date**: 26-31 January 2026
**Status**: ✅ Verified Complete

## Overview

Epic 3 implements an automated nudge system that sends SMS reminders to guests who haven't opened their invitation or responded to assignments. The system operates on a 15-minute cron schedule and respects NZ quiet hours (9pm-8am).

## Architecture

### Three Nudge Types

1. **Direct Nudges** (24h/48h)
   - 24h nudge: Sent if guest hasn't opened invite 24h after anchor
   - 48h nudge: Sent if guest hasn't responded 48h after anchor

2. **RSVP Followup**
   - Sent to guests with NOT_SURE RSVP status after 48h
   - Forces conversion to YES/NO

3. **Proxy Nudges**
   - Sent to proxy contacts for unclaimed household members
   - Includes escalation after multiple attempts

### Data Model

**Nudge Tracking** (no separate NudgeLog table):
- `Person.nudge24hSentAt: DateTime?` - Timestamp of 24h nudge
- `Person.nudge48hSentAt: DateTime?` - Timestamp of 48h nudge
- `PersonEvent.rsvpFollowupSentAt: DateTime?` - Timestamp of RSVP followup
- `Person.inviteAnchorAt: DateTime?` - Starting point for nudge timing

**Event Logging** (InviteEvent model):
```typescript
enum InviteEventType {
  NUDGE_SENT_AUTO
  NUDGE_DEFERRED_QUIET
  PROXY_NUDGE_SENT
  PROXY_NUDGE_DEFERRED_QUIET
  HOUSEHOLD_ESCALATED
  SMS_OPT_OUT_RECEIVED
  SMS_BLOCKED_OPT_OUT
  SMS_BLOCKED_INVALID
  SMS_SEND_FAILED
  // ... other types
}
```

## Implementation Files

### Core Logic

**`src/lib/sms/nudge-scheduler.ts`**
- Main entry point: `runNudgeScheduler()`
- Orchestrates all three nudge types
- Returns detailed results: sent/succeeded/failed/deferred
- Checks SMS enabled status before processing

**`src/lib/sms/nudge-eligibility.ts`**
- `findNudgeCandidates()` - Find eligible guests for direct nudges
- `findRsvpFollowupCandidates()` - Find NOT_SURE RSVPs needing followup
- `findProxyNudgeCandidates()` - Find unclaimed household members

Eligibility checks:
- Valid NZ phone number
- Not opted out
- Has participant token
- Event status = CONFIRMING
- Reachability tier != UNTRACKABLE

**`src/lib/sms/quiet-hours.ts`**
- Quiet hours: 9pm - 8am NZ time (Pacific/Auckland)
- `isQuietHours()` - Check if current time is quiet
- `getNextSendTime()` - Returns 8:05am if in quiet hours, otherwise now
- Defers sending until 8:05am the next valid morning

### Nudge Sending

**`src/lib/sms/nudge-sender.ts`**
- `processNudges()` - Send direct nudges
- `processRsvpFollowupNudges()` - Send RSVP followup
- Handles quiet hours deferral
- Updates Person timestamps
- Logs InviteEvents

**`src/lib/sms/proxy-nudge-sender.ts`**
- `processProxyNudges()` - Send proxy nudges
- Tracks nudge count on HouseholdMember
- Escalates after threshold

### API Endpoints

**`src/app/api/cron/nudges/route.ts`**
- Endpoint: `GET/POST /api/cron/nudges`
- Authorization: Requires `CRON_SECRET` env var
- Accepts secret via:
  - Authorization header: `Bearer <secret>`
  - Query param: `?secret=<secret>`
- Called every 15 minutes by cron service
- Returns full NudgeRunResult

## Eligibility Rules

### 24h Nudge
```typescript
candidate.anchorAt <= twentyFourHoursAgo &&
!candidate.hasOpened &&
!candidate.nudge24hSentAt
```

### 48h Nudge
```typescript
candidate.anchorAt <= fortyEightHoursAgo &&
!candidate.hasResponded &&
!candidate.nudge48hSentAt
```

### RSVP Followup
```typescript
rsvpStatus === 'NOT_SURE' &&
rsvpRespondedAt <= fortyEightHoursAgo &&
!rsvpFollowupSentAt
```

### Proxy Nudge
```typescript
householdMember.claimedAt === null &&
anchorAt <= threshold (24h/48h) &&
proxyNudgeCount < escalationThreshold
```

## Quiet Hours Behavior

**Quiet Period**: 21:00 - 08:00 NZ time

**During quiet hours**:
1. Nudge is marked for deferral
2. `getNextSendTime()` calculates 8:05am next valid day
3. InviteEvent logged with `NUDGE_DEFERRED_QUIET`
4. Cron will pick up and send at next run after 8:05am

**Outside quiet hours**:
1. Nudge sent immediately
2. InviteEvent logged with `NUDGE_SENT_AUTO`
3. Person timestamp updated

## Response Data Structure

```typescript
interface NudgeRunResult {
  timestamp: Date;
  smsEnabled: boolean;

  candidates: {
    eligible24h: number;
    eligible48h: number;
    eligibleRsvpFollowup?: number;
    skipped: { reason: string; count: number }[];
  };

  proxyCandidates?: {
    eligible24h: number;
    eligible48h: number;
    eligibleEscalation: number;
    skipped: { reason: string; count: number }[];
  };

  results: {
    sent: number;
    succeeded: number;
    failed: number;
    deferred: number;
  };

  rsvpFollowupResults?: {
    sent: number;
    succeeded: number;
    failed: number;
    deferred: number;
  };

  proxyResults?: {
    sent: number;
    succeeded: number;
    failed: number;
    escalated: number;
    deferred: number;
  };

  errors: string[];
}
```

## Skip Reasons

Candidates are skipped for:
- No participant token
- Invalid/non-NZ phone number
- Opted out from host
- No phone number (proxy nudges)
- Already sent nudge
- Event not in CONFIRMING status

## Security

**Cron Authorization**:
- Environment variable: `CRON_SECRET`
- Header: `Authorization: Bearer <secret>`
- Query param: `?secret=<secret>`
- Returns 401 if secret doesn't match

**Opt-Out Handling**:
- Per-host opt-out tracking
- Checked before every nudge send
- Logged as `SMS_BLOCKED_OPT_OUT`

## Dependencies

**External Services**:
- Twilio SMS (via `src/lib/sms/twilio-client.ts`)
- Cron service (15-minute schedule)

**Database**:
- Person (nudge timestamps, anchor, phone)
- PersonEvent (RSVP status, followup timestamp, reachability)
- Household (proxy tracking)
- HouseholdMember (proxy nudge count, escalation)
- InviteEvent (comprehensive event log)
- AccessToken (participant tokens for links)
- SmsOptOut (per-host opt-out tracking)

## Testing Considerations

To test nudges locally:

1. **Set up test event in CONFIRMING status**
2. **Create Person with**:
   - Valid NZ phone: `+64...`
   - `inviteAnchorAt`: 25+ hours ago (for 24h) or 49+ hours ago (for 48h)
   - `nudge24hSentAt`: null
   - `nudge48hSentAt`: null
3. **Ensure**:
   - Person has participant token
   - Person has `reachabilityTier != UNTRACKABLE`
   - Phone not opted out
4. **Call endpoint**:
   ```bash
   curl -H "Authorization: Bearer <CRON_SECRET>" \
        http://localhost:3000/api/cron/nudges
   ```
5. **Verify**:
   - Check console logs for "[Nudge Scheduler]"
   - Check Person.nudge24hSentAt or nudge48hSentAt updated
   - Check InviteEvent created

## Known Limitations

1. **No retry mechanism** - Failed sends are logged but not automatically retried
2. **No rate limiting** - All eligible candidates processed in single run
3. **No backoff** - Same nudge interval regardless of previous failures
4. **Timezone assumption** - All quiet hours use Pacific/Auckland
5. **No notification** - Host not notified when nudges sent (only via InviteEvent log)

## Verification Status

✅ Nudge scheduler exists and processes three types
✅ Eligibility rules implemented with 24h/48h timing
✅ Quiet hours (9pm-8am NZ) with deferred sending
✅ Database tracking via Person/PersonEvent fields
✅ InviteEvent model for comprehensive logging
✅ Cron endpoint with CRON_SECRET authorization
✅ Opt-out checking before every send
✅ Phone validation (NZ numbers only)

## Next Steps

Epic 3 is complete. Integration with Epic 4 (Freeze Warnings) allows hosts to see compliance rates before freezing, which depend on nudge-driven responses.

**Related Epics**:
- Epic 1: Reachability Tracking (defines DIRECT/PROXY/SHARED/UNTRACKABLE tiers)
- Epic 2: RSVP (provides NOT_SURE status for followup nudges)
- Epic 4: Freeze Warnings (uses compliance data from nudge responses)
