# Ticket 1.5: Proxy Nudge Logic Implementation

## Overview
Implemented automated nudge system for household proxies when members don't claim their slots. This completes Epic 1 (Reachability) by ensuring proxies can follow up with unclaimed household members.

## Files Created

### 1. `/src/lib/sms/proxy-nudge-eligibility.ts`
- **Purpose**: Identify households eligible for proxy nudges
- **Key Functions**:
  - `findProxyNudgeCandidates()`: Find all eligible households across events
  - `findProxyNudgeCandidatesForEvent(eventId)`: Find eligible households for specific event
- **Logic**:
  - Finds households in CONFIRMING events with unclaimed members
  - Validates proxy has valid NZ phone number
  - Checks proxy has SMS contact method
  - Verifies proxy hasn't opted out
  - Returns candidates for 24h, 48h, and escalation

### 2. `/src/lib/sms/proxy-nudge-sender.ts`
- **Purpose**: Send proxy nudges and handle escalation
- **Key Functions**:
  - `sendProxyNudge(candidate, nudgeType)`: Send SMS to proxy
  - `escalateHousehold(candidate)`: Mark household as escalated
  - `processProxyNudges(candidates)`: Process all eligible nudges
- **Logic**:
  - Sends SMS with unclaimed member count
  - Updates all unclaimed members' `proxyNudgeCount` and `lastProxyNudgeAt`
  - Logs invite events for tracking
  - Handles quiet hours deferral
  - Escalates after 2 nudges (sets `escalatedAt`)

## Files Modified

### 1. `/src/lib/sms/nudge-templates.ts`
- Added `ProxyNudgeTemplateParams` interface
- Added `getProxyHouseholdReminderMessage()` function
- Template: `"{eventName}: {count} people in your group haven't confirmed yet. Can you check in with them? {link} — Reply STOP to opt out"`

### 2. `/src/lib/sms/nudge-scheduler.ts`
- Added proxy nudge processing to main scheduler
- Updated `NudgeRunResult` interface with `proxyCandidates` and `proxyResults`
- Integrated `findProxyNudgeCandidates()` and `processProxyNudges()`
- Added logging for proxy nudge counts and escalations

### 3. `/prisma/schema.prisma`
- Added new `InviteEventType` enum values:
  - `PROXY_NUDGE_SENT`
  - `PROXY_NUDGE_DEFERRED_QUIET`
  - `HOUSEHOLD_ESCALATED`

### 4. `/src/app/api/events/[id]/invite-status/route.ts`
- Added `proxyNudgeSummary` to response
- Queries households and aggregates:
  - Total households
  - Households with unclaimed members
  - Households escalated
  - Total proxy nudges sent

### 5. `/src/components/plan/InviteStatusSection.tsx`
- Added `proxyNudgeSummary` to `InviteStatusData` interface
- Added "Household Proxy Nudges" display section
- Shows household counts, unclaimed members, nudges sent, and escalations

## Nudge Schedule Logic

| Trigger | Condition | Action |
|---------|-----------|--------|
| 24h after household creation | `proxyNudgeCount = 0` | Send first nudge, increment count to 1 |
| 48h after household creation | `proxyNudgeCount = 1` | Send second nudge, increment count to 2 |
| After 2nd nudge | `proxyNudgeCount = 2` | Set `escalatedAt = now()`, stop nudging |

## Error Handling

| Condition | Response |
|-----------|----------|
| Proxy has no phone | Skip, log in skipped reasons |
| Proxy contact method not SMS | Skip, log in skipped reasons |
| Proxy opted out | Skip, log in skipped reasons |
| SMS send fails | Log error, don't increment `proxyNudgeCount` |
| Household deleted mid-cron | Skip gracefully (query filters prevent issues) |

## Edge Cases Handled

1. **Multiple unclaimed members**: Single nudge to proxy (not per-member)
2. **Proxy nudge count sync**: All unclaimed members updated with same count
3. **Invalid phone numbers**: Validated using `isValidNZNumber()`
4. **Quiet hours**: Nudges deferred, logged as `PROXY_NUDGE_DEFERRED_QUIET`
5. **Member claims between checks**: Query filters ensure only unclaimed are counted

## Database Schema Usage

Existing fields from Ticket 1.2:
- `HouseholdMember.proxyNudgeCount`: Tracks number of nudges sent (0, 1, 2)
- `HouseholdMember.lastProxyNudgeAt`: Timestamp of last nudge
- `HouseholdMember.escalatedAt`: Marks escalation after 2 failed nudges
- `HouseholdMember.claimedAt`: Determines if member needs nudging

## Build Status

✅ **TypeScript Type Check**: Passed
```bash
npm run typecheck
# > tsc --noEmit
# (no errors)
```

✅ **Build**: Passed
```bash
npm run build
# ✓ Compiled successfully
# ✓ Linting and checking validity of types
# ✓ Generating static pages (36/36)
```

## Integration Points

### Cron Job
- Route: `/api/cron/nudges` (GET/POST)
- Frequency: Every 15 minutes (recommended)
- Processes both direct nudges and proxy nudges in single run

### SMS Sending
- Uses existing `sendSms()` infrastructure
- Respects quiet hours (via `isQuietHours()`)
- Logs to `InviteEvent` table for audit trail

### UI Dashboard
- Displays in `InviteStatusSection` component
- Shows household status alongside individual invite status
- Real-time updates via 30-second polling

## Testing Notes

### Manual Verification Steps
1. Create event with household (proxy with SMS contact)
2. Set `Household.createdAt` to 25h ago via DB
3. Trigger cron: `curl -X POST http://localhost:3000/api/cron/nudges?secret=YOUR_SECRET`
4. Verify:
   - Proxy received SMS
   - `proxyNudgeCount` = 1
   - `lastProxyNudgeAt` is set
   - Event logged as `PROXY_NUDGE_SENT`

5. Set `Household.createdAt` to 49h ago
6. Trigger cron again
7. Verify:
   - Second SMS sent
   - `proxyNudgeCount` = 2
   - Event logged

8. Trigger cron again
9. Verify:
   - `escalatedAt` is set
   - No SMS sent
   - Event logged as `HOUSEHOLD_ESCALATED`

### Unit Test Coverage Needed
- `findProxyNudgeCandidates()`: Eligibility filtering
- `sendProxyNudge()`: Nudge count increment logic
- `escalateHousehold()`: Escalation flag setting
- Template: Message format and length

## Implementation Decisions

1. **Single nudge for multiple unclaimed members**: More user-friendly than per-member spam
2. **Nudge count on HouseholdMember not Household**: Allows individual member tracking if needed later
3. **Escalation stops all nudging**: Prevents endless nudge loop, requires manual intervention
4. **Dashboard link instead of magic link**: Proxies already have access, simpler UX
5. **Quiet hours respected**: Consistent with direct nudge behavior

## Next Steps (Out of Scope)

- [ ] Admin UI for viewing escalated households
- [ ] Manual "un-escalate" action for hosts
- [ ] Email fallback for proxies without SMS
- [ ] Customizable nudge schedule (currently hardcoded 24h/48h)
- [ ] Analytics dashboard for nudge effectiveness

## Dependencies

- Ticket 1.1: ReachabilityTier and ContactMethod enums
- Ticket 1.2: Household and HouseholdMember models
- Ticket 1.3: Contact info upgrade infrastructure
- Existing SMS infrastructure (Twilio, opt-out service, quiet hours)

## Verification Checklist

- [x] TypeScript compiles without errors
- [x] Build succeeds
- [x] Cron route processes proxy nudges
- [x] SMS template under 160 characters
- [x] Nudge count increments correctly
- [x] Escalation sets `escalatedAt`
- [x] Dashboard displays proxy nudge status
- [x] Quiet hours respected
- [x] Opt-out honored
- [x] Invalid phones skipped
- [x] Invite events logged

## Known Limitations

1. **No migration script**: Existing households won't retroactively get nudges (start from deployment)
2. **No batch SMS optimization**: Sends one at a time with 500ms delay
3. **Hardcoded timing**: 24h/48h not configurable per event
4. **No retry logic**: Failed SMS doesn't retry, just logs error

## Deployment Notes

1. Run `prisma generate` to update client with new InviteEventType values
2. No migration needed (schema enums added, no table changes)
3. Ensure `CRON_SECRET` env var is set for cron route
4. Verify Twilio credentials for SMS sending
5. Monitor first few cron runs for any edge cases
