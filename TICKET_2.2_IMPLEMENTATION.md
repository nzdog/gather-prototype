# Ticket 2.2 Implementation: Not Sure Forced Conversion

## Implementation Date
2026-01-30

## Overview
Implemented forced conversion of "Not sure" RSVP responses to binary Yes/No after 48 hours. This ensures participants cannot remain indefinitely undecided, helping hosts finalize headcounts.

## Files Created
None (all changes were modifications to existing files)

## Files Modified

### 1. Database Schema
**File:** `prisma/schema.prisma`
- Added `rsvpFollowupSentAt DateTime?` field to PersonEvent model (line 227)
- Migration: `20260130074454_add_rsvp_followup_sent_at`

### 2. SMS Templates
**File:** `src/lib/sms/nudge-templates.ts`
- Added `getRsvpFollowupMessage()` function (lines 87-93)
- Template: "{eventName}: We need a final answer — are you coming? {link} — Reply STOP to opt out"

### 3. Eligibility Logic
**File:** `src/lib/sms/nudge-eligibility.ts`
- Added `RsvpFollowupCandidate` interface (lines 23-33)
- Updated `EligibilityResult` interface to include `eligibleRsvpFollowup` (line 38)
- Added `findRsvpFollowupCandidates()` function (lines 206-296)
  - Finds PersonEvents with `rsvpStatus = NOT_SURE`
  - Filters by `rsvpRespondedAt < now() - 48h`
  - Excludes those with `rsvpFollowupSentAt IS NOT NULL`
  - Validates phone numbers and checks opt-out status
- Updated `findNudgeCandidates()` to include RSVP followup candidates (lines 175-179)

### 4. Nudge Sender
**File:** `src/lib/sms/nudge-sender.ts`
- Added `RsvpFollowupSendResult` interface (lines 18-25)
- Updated imports to include `getRsvpFollowupMessage` and `RsvpFollowupCandidate` (lines 5-11)
- Added `sendRsvpFollowupNudge()` function (lines 162-205)
  - Sends SMS using RSVP_FOLLOWUP template
  - Updates PersonEvent.rsvpFollowupSentAt on success
  - Does NOT set rsvpFollowupSentAt on failure (prevents duplicate sends)
- Added `processRsvpFollowupNudges()` function (lines 207-250)
  - Respects quiet hours (9pm-8am)
  - Processes all eligible candidates
  - Includes 500ms delay between sends to avoid rate limiting

### 5. Scheduler Integration
**File:** `src/lib/sms/nudge-scheduler.ts`
- Updated imports (lines 1-5)
- Updated `NudgeRunResult` interface to include `rsvpFollowupResults` (lines 11-26)
- Integrated RSVP followup processing in `runNudgeScheduler()` (lines 84-109)
  - Finds eligible candidates
  - Processes nudges
  - Logs results
  - Collects errors

### 6. Participant View
**File:** `src/app/p/[token]/page.tsx`
- Added `rsvpFollowupSentAt` to `ParticipantData` interface (line 65)
- Updated RSVP display logic (lines 212-269):
  - **PENDING state:** Shows Yes/No/Not sure (3 buttons)
  - **NOT_SURE with followup sent:** Shows only Yes/No (2 buttons) with message "We need to finalize the headcount — please let us know if you're coming."
  - **NOT_SURE without followup:** Shows Yes/No/Not sure (3 buttons) with note "You selected 'Not sure' — you can update your response here."

### 7. API Route
**File:** `src/app/api/p/[token]/route.ts`
- Added `rsvpFollowupSentAt` to GET response (line 124)

## Summary of Changes

### Database
- 1 new field: `PersonEvent.rsvpFollowupSentAt`
- 1 migration created and applied successfully

### Logic Flow
1. Cron job runs (every 15 minutes recommended)
2. `findRsvpFollowupCandidates()` queries for NOT_SURE participants > 48h old
3. Filters out invalid phones, opt-outs, and those already sent followup
4. `processRsvpFollowupNudges()` sends SMS via RSVP_FOLLOWUP template
5. Sets `rsvpFollowupSentAt = now()` only on successful send
6. Participant views link, sees only Yes/No buttons (no "Not sure" option)
7. Future cron runs skip this participant (followup already sent)

### One-Time Only Guarantee
- Follow-up sent flag (`rsvpFollowupSentAt`) prevents duplicate nudges
- Only set on successful SMS send
- Never cleared, ensuring only one follow-up per NOT_SURE response

## Build Status

### TypeCheck
```
✅ npm run typecheck — PASSED
No TypeScript errors
```

### Build
```
✅ npm run build — PASSED
- Prisma migration deployed successfully
- All 108 routes compiled successfully
- No build errors
```

### Migration
```
✅ npx prisma migrate dev — PASSED
Migration: 20260130074454_add_rsvp_followup_sent_at
Database schema is in sync
```

## Verification Checklist

Per ticket requirements:

- [x] `npx prisma migrate dev` succeeds
- [x] `npm run typecheck` passes
- [x] `npm run build` passes
- [ ] NOT_SURE RSVPs older than 48h identified by eligibility check (requires test data)
- [ ] Follow-up SMS sent and `rsvpFollowupSentAt` recorded (requires cron execution)
- [ ] Participant view shows Yes/No only after follow-up sent (requires test data)
- [ ] No second follow-up sent (one-time only) (requires test data)

**Note:** Items 4-7 require database test data and cron execution. These should be verified manually using the verification steps in the ticket specification.

## Implementation Decisions

### 1. Separate Candidate Interface
Created `RsvpFollowupCandidate` interface distinct from `NudgeCandidate` because:
- RSVP followup targets `PersonEvent` records (not just `Person`)
- Needs `personEventId` to update the correct record
- Requires `rsvpRespondedAt` for logging/debugging

### 2. No Followup on Failed Send
Only set `rsvpFollowupSentAt` on successful SMS delivery to ensure:
- Failed sends are retried on next cron run
- No participants missed due to transient SMS failures
- Clear audit trail (timestamp = actual send time)

### 3. Quiet Hours Respect
RSVP followup nudges respect quiet hours (9pm-8am) same as other nudges to:
- Comply with SMS regulations
- Maintain positive user experience
- Avoid opt-outs due to inconvenient timing

### 4. Three UI States for NOT_SURE
Implemented three distinct states for better UX:
- Before followup: Shows all 3 options with hint they can change
- After followup: Shows 2 options with urgent message
- This prevents confusion and makes forced conversion intent clear

## Edge Cases Handled

| Scenario | Behavior |
|----------|----------|
| User responds YES/NO before 48h | Never enters forced conversion flow (eligibility check filters them out) |
| User in NOT_SURE, changes to YES before cron runs | Eligibility check excludes them (status no longer NOT_SURE) |
| Follow-up sent, user ignores it | Stays in NOT_SURE with follow-up sent — no further auto-nudges |
| SMS send fails | `rsvpFollowupSentAt` NOT set — will retry on next cron run |
| User clicks "Not sure" then immediately gets follow-up | Only possible if cron runs within same minute — acceptable race condition |
| User opted out from host | Eligibility check excludes them |
| Invalid/non-NZ phone number | Eligibility check excludes them |

## Testing Recommendations

### Manual Verification Steps
(From ticket specification - Section "Verification Steps")

1. Create test participant with NOT_SURE RSVP > 48h old:
```sql
UPDATE "PersonEvent"
SET "rsvpStatus" = 'NOT_SURE',
    "rsvpRespondedAt" = now() - interval '49 hours',
    "rsvpFollowupSentAt" = NULL
WHERE token = '[token]'
```

2. Trigger cron: `curl -X POST /api/cron/nudges`

3. Verify database:
```sql
SELECT "rsvpFollowupSentAt" FROM "PersonEvent" WHERE token = '[token]'
```
Expected: `rsvpFollowupSentAt` is now set

4. Open participant view: `/p/[token]`
Expected: Only Yes/No buttons visible, no "Not sure"
Expected: Message "We need to finalize the headcount..." displayed

5. Run cron again: `curl -X POST /api/cron/nudges`
Expected: No duplicate SMS sent (check logs)

6. Click "Yes" on participant page
Expected: `rsvpStatus = YES`, items now visible

## Dependencies
- Ticket 2.1 (RSVP state machine) — ✅ Completed
- Existing SMS infrastructure — ✅ In place
- Existing nudge system — ✅ In place

## Related Files Not Modified
- `src/lib/sms/send-sms.ts` — No changes needed (uses existing SMS sender)
- `src/lib/sms/quiet-hours.ts` — No changes needed (reused existing logic)
- Item assignment flow — Unchanged (only RSVP flow affected)
- Proxy nudge logic — Unchanged (separate concern)

## Performance Considerations
- RSVP followup query uses indexed fields (`rsvpStatus`, `rsvpRespondedAt`, `rsvpFollowupSentAt`)
- Expected volume: Low (only NOT_SURE responses > 48h without followup)
- SMS rate limiting: 500ms delay between sends (same as other nudges)
- Database writes: Minimal (one update per successful send)

## Security & Privacy
- Phone validation: Only sends to valid NZ numbers
- Opt-out respect: Checks per-host opt-out status before sending
- Token-based auth: Participant links use secure tokens
- No PII in logs: Only uses person IDs and event IDs in error messages

## Completion Status
✅ All code changes implemented
✅ Database migration applied
✅ TypeScript compilation successful
✅ Next.js build successful
✅ Ready for manual verification testing
✅ Ready for merge to master (pending user approval)
