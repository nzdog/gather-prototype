# Launch Readiness Test - Section 4: SMS Nudges (NZ Only)

**Test Date:** 2026-02-02
**Status:** 7/8 PASS, 1 FAIL, 2 Manual Tests Required

---

## Overview

This document verifies the SMS nudge system for the NZ-only launch. The system uses Twilio to send automatic nudges at 24h and 48h intervals to participants who haven't opened their invite or responded.

---

## 4.1 SMS Provider Configuration

**Status:** ✅ PASS

**Evidence:**
- **Provider:** Twilio
- **Sending function:** `sendSms()` in `src/lib/sms/send-sms.ts:30`
- **Client initialization:** `src/lib/sms/twilio-client.ts:1-40`
- **Environment variables:**
  - `TWILIO_ACCOUNT_SID`
  - `TWILIO_AUTH_TOKEN`
  - `TWILIO_PHONE_NUMBER`
- **Verification:** All 3 Twilio env vars present in `.env` file
- **Dedicated sending number:** Configured via `TWILIO_PHONE_NUMBER` env var

**Code References:**
```typescript
// src/lib/sms/twilio-client.ts:4-6
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const phoneNumber = process.env.TWILIO_PHONE_NUMBER;
```

---

## 4.2 Phone Number Format

**Status:** ✅ PASS

**Evidence:**
- **Storage format:** E.164 (`+64XXXXXXXXXX`)
- **Normalization:** `normalizePhoneNumber()` in `src/lib/phone.ts:5-29`
  - Converts local formats (0211234567) to E.164 (+64211234567)
  - Handles multiple input formats (0XX, 64XX, +64XX)
- **Validation:** `isValidNZNumber()` in `src/lib/phone.ts:34-40`
  - Pattern: `/^\+64\d{8,10}$/`
  - Applied before send: `src/lib/sms/send-sms.ts:44`
- **International detection:** `isInternationalNumber()` in `src/lib/phone.ts:45-49`
- **Rejection:** Invalid/international numbers rejected with `SMS_BLOCKED_INVALID` event

**Code References:**
```typescript
// src/lib/phone.ts:34-40
export function isValidNZNumber(phone: string): boolean {
  // NZ numbers: +64 followed by 8-10 digits
  const nzPattern = /^\+64\d{8,10}$/;
  return nzPattern.test(phone);
}
```

---

## 4.3 Auto-Nudge at 24h

**Status:** ✅ PASS

**Evidence:**
- **Eligibility check:** `src/lib/sms/nudge-eligibility.ts:169-175`
  - Condition: `anchorAt <= twentyFourHoursAgo && !hasOpened && !nudge24hSentAt`
  - Anchor point: `Person.inviteAnchorAt` (set when host confirms invites sent)
- **Message template:** `get24hNudgeMessage()` in `src/lib/sms/nudge-templates.ts:28-33`
  - Format: "{hostName} is waiting for your response for {eventName}. Tap to view: {link} — Reply STOP to opt out"
- **Sending:** `src/lib/sms/nudge-sender.ts:147-153`
- **Event logging:** `NUDGE_SENT_AUTO` logged in `src/lib/sms/send-sms.ts:100-110`
- **Trigger:** Cron endpoint `/api/cron/nudges` calls `runNudgeScheduler()`
  - Route: `src/app/api/cron/nudges/route.ts:27`
  - Expected frequency: Every 15 minutes (per comment in nudge-scheduler.ts:46)
- **Timestamp:** Updates `Person.nudge24hSentAt` in `nudge-sender.ts:77`

**Code References:**
```typescript
// src/lib/sms/nudge-eligibility.ts:169-175
if (
  candidate.anchorAt <= twentyFourHoursAgo && // 24h passed
  !candidate.hasOpened && // Haven't opened
  !candidate.nudge24hSentAt // Haven't sent 24h nudge
) {
  eligible24h.push(candidate);
}
```

---

## 4.4 Auto-Nudge at 48h

**Status:** ✅ PASS

**Evidence:**
- **Eligibility check:** `src/lib/sms/nudge-eligibility.ts:177-184`
  - Condition: `anchorAt <= fortyEightHoursAgo && !hasResponded && !nudge48hSentAt`
  - Different trigger: Checks for response, not just open
- **Message template:** `get48hNudgeMessage()` in `src/lib/sms/nudge-templates.ts:39-43`
  - **Distinct from 24h:** "Reminder: {hostName} needs your response for {eventName}. Please confirm: {link} — Reply STOP to opt out"
  - **Escalation in tone:** More direct ("needs your response", "Please confirm")
- **Sending:** `src/lib/sms/nudge-sender.ts:155-161`
- **Event logging:** `NUDGE_SENT_AUTO` logged
- **Timestamp:** Updates `Person.nudge48hSentAt`

**Key Difference from 24h:**
- 24h: Sent if link not opened
- 48h: Sent if no response (assignment acceptance/decline)

---

## 4.5 Quiet Hours Enforcement

**Status:** ✅ PASS

**Evidence:**
- **Implementation:** `isQuietHours()` in `src/lib/sms/quiet-hours.ts:24-30`
- **Hours:** 9pm-8am NZ time
  - `QUIET_START_HOUR = 21` (9pm)
  - `QUIET_END_HOUR = 8` (8am)
- **Timezone:** `Pacific/Auckland` (NZ) in `quiet-hours.ts:14-18`
  - Uses `toLocaleString('en-US', { timeZone: 'Pacific/Auckland' })`
- **Deferral logging:**
  - Direct nudges: `NUDGE_DEFERRED_QUIET` in `nudge-sender.ts:125`
  - Proxy nudges: `PROXY_NUDGE_DEFERRED_QUIET` in `proxy-nudge-sender.ts:202`
- **Defer time:** 8:05am NZ time next valid morning
  - `DEFER_TO_MINUTE = 5` (8:05am)
  - Implemented in `getNextSendTime()` at `quiet-hours.ts:36-56`

**Retry Mechanism:**
- Deferred nudges rely on cron scheduler running again during valid hours (8am-9pm)
- When scheduler runs during valid hours, it re-evaluates eligibility and sends pending nudges

**Code References:**
```typescript
// src/lib/sms/quiet-hours.ts:24-30
export function isQuietHours(): boolean {
  const nzNow = getNZTime();
  const hour = nzNow.getHours();
  // Quiet hours: 21:00 - 23:59 OR 00:00 - 07:59
  return hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR;
}
```

**⚠️ Manual Test Required:** See "Manual Tests" section below

---

## 4.6 Inbound SMS Handling

**Status:** ✅ PASS

**Evidence:**
- **Webhook endpoint:** `src/app/api/sms/inbound/route.ts`
- **Route:** `/api/sms/inbound`
- **Method:** POST (with GET for validation)
- **Parsing:** Extracts Twilio form-encoded data:
  - `From`: Sender's phone number
  - `Body`: Message text
  - `MessageSid`: Unique message identifier
- **Normalization:** Uses `normalizePhoneNumber()` to convert to E.164
- **Processing flow:**
  1. Parse form data (route.ts:18-22)
  2. Normalize phone number (route.ts:33)
  3. Check if opt-out message (route.ts:41)
  4. Find recent nudge to identify host (route.ts:53-71)
  5. Process opt-out or log and ignore (route.ts:98-146)

**Code References:**
```typescript
// src/app/api/sms/inbound/route.ts:18-22
const formData = await request.formData();
const from = formData.get('From') as string;
const body = formData.get('Body') as string;
const messageSid = formData.get('MessageSid') as string;
```

---

## 4.7 STOP Keyword / Opt-Out

**Status:** ✅ PASS

**Evidence:**
- **Keywords recognized:** `src/lib/sms/opt-out-keywords.ts:5`
  - `'stop', 'stopall', 'unsubscribe', 'cancel', 'end', 'quit'`
  - Case-insensitive, exact match required (trimmed)
  - "STOP" ✓, "Stop please" ✗
- **Detection:** `isOptOutMessage()` in `opt-out-keywords.ts:16-21`
- **Event logging:** `SMS_OPT_OUT_RECEIVED` in `inbound/route.ts:128-140`
- **Opt-out storage:**
  - Creates/updates `SmsOptOut` record: `inbound/route.ts:98-114`
  - Updates `Person.smsOptedOut` and `Person.smsOptedOutAt`: `inbound/route.ts:117-125`
- **Future exclusion:** Checked before every send in `sendSms()` at `send-sms.ts:64-82`
  - Logs `SMS_BLOCKED_OPT_OUT` if opted out
  - Prevents sending to opted-out numbers

**Opt-Out Scope:**
- **Per-host basis** (not global)
- Schema: `SmsOptOut` has unique constraint on `phoneNumber_hostId` (schema.prisma:413)
- Person can opt out from one host but still receive from others

**Code References:**
```typescript
// src/lib/sms/opt-out-keywords.ts:16-21
export function isOptOutMessage(message: string): boolean {
  if (!message) return false;
  const normalized = message.trim().toLowerCase();
  return OPT_OUT_KEYWORDS.includes(normalized as (typeof OPT_OUT_KEYWORDS)[number]);
}
```

---

## 4.8 Invalid/International Number Handling

**Status:** ⚠️ PARTIAL - **FAIL: NO EMAIL FALLBACK**

**Evidence:**
- **Validation:** `isValidNZNumber()` check in `send-sms.ts:44-60`
  - Pattern: `/^\+64\d{8,10}$/`
- **International detection:** `isInternationalNumber()` in `src/lib/phone.ts:45-49`
  - Checks for `+` prefix not starting with `+64`
- **Blocking:** Invalid/international numbers rejected at send time
- **Event logging:** `SMS_BLOCKED_INVALID` logged with reason
- **Exclusion:** Numbers are excluded from SMS nudges

**❌ ISSUE: NO EMAIL FALLBACK**
- When SMS is blocked for `INVALID_NUMBER`, no fallback to email occurs
- Impact: International guests or guests with invalid numbers receive NO nudges
- File: `src/lib/sms/send-sms.ts:44-60`

**Code References:**
```typescript
// src/lib/sms/send-sms.ts:44-60
// Validate NZ number
if (!isValidNZNumber(to)) {
  await logInviteEvent({
    eventId,
    personId,
    type: 'SMS_BLOCKED_INVALID',
    metadata: {
      phoneNumber: to,
      reason: 'Invalid or non-NZ number',
      ...metadata,
    },
  });

  return {
    success: false,
    blocked: 'INVALID_NUMBER',
    error: 'Invalid or non-NZ phone number',
  };
}
// ❌ No email fallback here
```

**Recommendation:**
Implement fallback logic to send email nudges when SMS is blocked for `INVALID_NUMBER`. This would require:
1. Check if person has email address
2. Send email nudge instead of SMS
3. Log `EMAIL_NUDGE_SENT_FALLBACK` or similar event

**⚠️ Manual Test Required:** See "Manual Tests" section below

---

## Additional Observations

### Invite Anchor Timing
- Anchor set via `Person.inviteAnchorAt` field
- Set when host confirms invites sent via `/api/events/[id]/confirm-invites-sent`
- Code: `src/app/api/events/[id]/confirm-invites-sent/route.ts`
- All existing people without anchor get it set at confirmation time
- New people added after confirmation get anchor immediately

### Event Types (InviteEventType enum)
All SMS-related events logged to `InviteEvent` table:
- `NUDGE_SENT_AUTO` - Nudge successfully sent
- `NUDGE_DEFERRED_QUIET` - Deferred due to quiet hours
- `PROXY_NUDGE_SENT` - Proxy household reminder sent
- `PROXY_NUDGE_DEFERRED_QUIET` - Proxy nudge deferred
- `HOUSEHOLD_ESCALATED` - Household escalated after 2 failed nudges
- `SMS_OPT_OUT_RECEIVED` - Opt-out request received
- `SMS_BLOCKED_OPT_OUT` - Send blocked due to opt-out
- `SMS_BLOCKED_INVALID` - Send blocked due to invalid number
- `SMS_SEND_FAILED` - Twilio API error

### Proxy Household Nudges
System also includes proxy nudges for household members:
- 24h nudge to proxy if household members haven't claimed
- 48h second nudge to proxy
- Escalation after 2 failed nudges
- Files: `proxy-nudge-eligibility.ts`, `proxy-nudge-sender.ts`

### RSVP Followup Nudges
Additional nudge type for "NOT_SURE" responses:
- Sent 48h after NOT_SURE RSVP response
- Forces conversion to YES/NO
- Template: `getRsvpFollowupMessage()` in `nudge-templates.ts:89-93`

---

## Manual Tests Required

### Test 1: Quiet Hours Deferral and Retry

**Objective:** Verify nudges are deferred during quiet hours and sent after

**Steps:**
1. Set system time to quiet hours (9pm-8am NZ time) OR wait for quiet hours
2. Trigger nudge scheduler:
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" \
     http://localhost:3000/api/cron/nudges
   ```
3. Check database for `NUDGE_DEFERRED_QUIET` events:
   ```sql
   SELECT * FROM "InviteEvent"
   WHERE type = 'NUDGE_DEFERRED_QUIET'
   ORDER BY "createdAt" DESC;
   ```
4. Wait until after 8:05am NZ time OR trigger cron again during valid hours
5. Verify deferred nudges are now sent:
   ```sql
   SELECT * FROM "InviteEvent"
   WHERE type = 'NUDGE_SENT_AUTO'
   ORDER BY "createdAt" DESC;
   ```

**Expected Behavior:**
- During quiet hours: No SMS sent, `NUDGE_DEFERRED_QUIET` events logged
- After quiet hours: Deferred nudges processed and `NUDGE_SENT_AUTO` logged

**Pass Criteria:**
- ✅ Deferral events logged with correct metadata
- ✅ No SMS sent during quiet hours
- ✅ Nudges sent when scheduler runs again during valid hours (8am-9pm)

---

### Test 2: International Number Handling and Email Fallback

**Objective:** Verify international numbers are blocked and check for fallback

**Steps:**
1. Add a person with international number:
   ```sql
   UPDATE "Person"
   SET "phoneNumber" = '+61412345678'  -- Australia
   WHERE id = 'test-person-id';
   ```
2. Confirm invites sent to set anchor:
   ```bash
   POST /api/events/{eventId}/confirm-invites-sent
   ```
3. Wait 24h OR manually update anchor:
   ```sql
   UPDATE "Person"
   SET "inviteAnchorAt" = NOW() - INTERVAL '25 hours'
   WHERE id = 'test-person-id';
   ```
4. Trigger nudge scheduler
5. Check invite events:
   ```sql
   SELECT * FROM "InviteEvent"
   WHERE "personId" = 'test-person-id'
   ORDER BY "createdAt" DESC;
   ```

**Expected Behavior:**
- `SMS_BLOCKED_INVALID` event logged with reason "Invalid or non-NZ number"
- Person receives no SMS
- **Currently:** No email fallback ❌

**Pass Criteria:**
- ✅ `SMS_BLOCKED_INVALID` event exists with correct metadata
- ❌ No email fallback mechanism (this is the FAIL item)

**Recommendation:** Add email fallback for invalid/international numbers

---

## Summary

### Results by Status
- ✅ **PASS:** 7/8 items
- ❌ **FAIL:** 1/8 items
- ⚠️ **MANUAL:** 2 items require real-world testing

### Critical Issues (FAIL)

#### Priority: MEDIUM
**Item 4.8 - No Email Fallback for Invalid/International Numbers**

**Issue:** Non-NZ phone numbers are blocked from SMS but no email fallback exists

**Impact:**
- International guests receive NO nudges
- Guests with invalid phone numbers receive NO nudges
- Reduces response rates for non-NZ participants

**Fix Required:**
Implement fallback logic in `src/lib/sms/send-sms.ts:44-60`:
1. When `SMS_BLOCKED_INVALID` occurs, check if person has email
2. Call email sending function (if exists)
3. Log `EMAIL_NUDGE_SENT_FALLBACK` event
4. Update person record to track email nudge sent

**Estimated Effort:** Small (1-2 hours)

**Blocker for Launch?**
- **NO** if launch is NZ-only with all participants having valid NZ numbers
- **YES** if any international participants expected

---

### Files Referenced

**SMS Core:**
- `src/lib/sms/twilio-client.ts` - Twilio client initialization
- `src/lib/sms/send-sms.ts` - SMS sending with validation
- `src/lib/sms/nudge-scheduler.ts` - Main scheduler orchestration
- `src/lib/sms/nudge-eligibility.ts` - 24h/48h eligibility logic
- `src/lib/sms/nudge-sender.ts` - Sending logic with quiet hours
- `src/lib/sms/nudge-templates.ts` - Message templates
- `src/lib/sms/quiet-hours.ts` - NZ timezone quiet hours
- `src/lib/sms/opt-out-keywords.ts` - STOP keyword detection
- `src/lib/sms/opt-out-service.ts` - Opt-out management

**Phone Validation:**
- `src/lib/phone.ts` - E.164 normalization and validation

**API Endpoints:**
- `src/app/api/sms/inbound/route.ts` - Inbound SMS webhook
- `src/app/api/cron/nudges/route.ts` - Cron trigger endpoint

**Database Schema:**
- `prisma/schema.prisma` - Person, SmsOptOut, InviteEvent models

---

### Deployment Checklist

Before launch, ensure:

- [ ] Twilio credentials configured in production `.env`
- [ ] `TWILIO_PHONE_NUMBER` is a valid NZ number
- [ ] Cron job set up to call `/api/cron/nudges` every 15 minutes
- [ ] `CRON_SECRET` configured for cron endpoint security
- [ ] Webhook URL configured in Twilio console: `https://{domain}/api/sms/inbound`
- [ ] Twilio webhook signature validation enabled (optional but recommended)
- [ ] Manual Test 1 (quiet hours) completed successfully
- [ ] Manual Test 2 (international numbers) completed
- [ ] Decision made on email fallback (fix or accept limitation)
- [ ] Monitoring set up for `SMS_SEND_FAILED` events

---

**End of Report**
