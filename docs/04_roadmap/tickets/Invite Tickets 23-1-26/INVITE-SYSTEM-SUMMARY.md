# Gather Invite System — Implementation Summary

**Total Estimated Effort:** 12-17 days  
**Phases:** 6  
**Core Deliverable:** Auto-nudge system that eliminates host chasing

---

## Quick Reference

| Phase | Branch | Effort | Key Deliverable |
|-------|--------|--------|-----------------|
| 1 | `feature/invite-phase-1-instrumentation` | 1-2 days | Event logging + phone fields |
| 2 | `feature/invite-phase-2-send-confirmation` | 1 day | Nudge timing anchor |
| 3 | `feature/invite-phase-3-shared-link` | 3-4 days | One-link-for-all (16+ people) |
| 4 | `feature/invite-phase-4-sms-infrastructure` | 2-3 days | Twilio + opt-out handling |
| 5 | `feature/invite-phase-5-auto-nudge` | 3-4 days | 24h/48h auto-reminders |
| 6 | `feature/invite-phase-6-dashboard-enhancements` | 2-3 days | Host visibility + manual overrides |

---

## Phase 1: Instrumentation Foundation

**Branch:** `feature/invite-phase-1-instrumentation`  
**Effort:** 1-2 days  
**Dependencies:** None

### What It Does
Creates the measurement layer that all subsequent phases depend on.

### Key Deliverables
- `InviteEvent` model for logging all invite activities
- `AccessToken.openedAt` tracking for link opens
- `Person.phoneNumber` field (E.164 format)
- `Person.smsOptedOut` and `smsOptedOutAt` fields
- Phone normalization utilities (`src/lib/phone.ts`)
- Link-open tracking in participant/coordinator views
- Phone input in AddPersonModal and CSV import

### New Files
- `src/lib/invite-events.ts`
- `src/lib/phone.ts`

### Schema Changes
- `InviteEvent` model (new)
- `InviteEventType` enum (new)
- `AccessToken`: +`openedAt`, +`claimedAt`, +`claimedBy`
- `Person`: +`phoneNumber`, +`smsOptedOut`, +`smsOptedOutAt`

---

## Phase 2: Invite Send Confirmation

**Branch:** `feature/invite-phase-2-send-confirmation`  
**Effort:** 1 day  
**Dependencies:** Phase 1

### What It Does
Creates the anchor timestamp for nudge timing. Nudges are calculated from when the host confirms "I've sent the invites", not when the system generates links.

### Key Deliverables
- `Event.inviteSendConfirmedAt` timestamp
- `Person.inviteAnchorAt` per-person nudge anchor
- "I've sent the invites" confirmation API
- Auto-anchor for people added after confirm
- `InviteStatusSection` UI component
- Status breakdown: Not sent → Sent → Opened → Responded

### New Files
- `src/app/api/events/[id]/confirm-invites-sent/route.ts`
- `src/app/api/events/[id]/invite-status/route.ts`
- `src/components/plan/InviteStatusSection.tsx`

### Schema Changes
- `Event`: +`inviteSendConfirmedAt`
- `Person`: +`inviteAnchorAt`

---

## Phase 3: Shared Link Mode

**Branch:** `feature/invite-phase-3-shared-link`  
**Effort:** 3-4 days  
**Dependencies:** Phases 1-2

### What It Does
Enables one-link-for-everyone for events with 16+ people. Instead of sending 40 individual links, host posts one URL to the family group chat.

### Key Deliverables
- Shared link token on Event
- `/join/[token]` landing page with name search
- Name claim mechanics (first claim wins)
- Duplicate name disambiguation
- Host can reset claims
- Hybrid mode (shared link + individual links)
- `SharedLinkSection` UI component

### New Files
- `src/app/join/[token]/page.tsx`
- `src/app/join/[token]/NameSelectionClient.tsx`
- `src/app/api/join/[token]/claim/route.ts`
- `src/app/api/events/[id]/shared-link/route.ts`
- `src/app/api/events/[id]/people/[personId]/reset-claim/route.ts`
- `src/components/plan/SharedLinkSection.tsx`

### Schema Changes
- `Event`: +`sharedLinkToken`, +`sharedLinkEnabled`

---

## Phase 4: SMS Infrastructure

**Branch:** `feature/invite-phase-4-sms-infrastructure`  
**Effort:** 2-3 days  
**Dependencies:** Phase 1

### What It Does
Sets up Twilio integration for sending SMS nudges and handling opt-outs.

### Key Deliverables
- Twilio client setup with graceful degradation
- `sendSms()` service with validation and logging
- Opt-out keyword parsing (STOP, UNSUBSCRIBE, etc.)
- Inbound webhook for STOP messages
- Per-host opt-out tracking (`SmsOptOut` model)
- SMS status in dashboard

### New Files
- `src/lib/sms/twilio-client.ts`
- `src/lib/sms/opt-out-keywords.ts`
- `src/lib/sms/send-sms.ts`
- `src/lib/sms/opt-out-service.ts`
- `src/app/api/sms/inbound/route.ts`

### Schema Changes
- `SmsOptOut` model (new) — per-host opt-out tracking

### Environment Variables
```
TWILIO_ACCOUNT_SID=ACxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxx
TWILIO_PHONE_NUMBER=+642XXXXXXXX
```

---

## Phase 5: Auto-Nudge System

**Branch:** `feature/invite-phase-5-auto-nudge`  
**Effort:** 3-4 days  
**Dependencies:** Phases 1, 2, 4

### What It Does
The core "no chasing" feature. Automatically sends SMS reminders to non-responders at 24h and 48h after invites are sent.

### Key Deliverables
- Nudge eligibility checking (validates all prerequisites)
- Quiet hours handling (9pm-8am NZ → defer to 8:05am)
- SMS message templates (<160 chars)
- Nudge sender with duplicate prevention
- Nudge scheduler (orchestrates full process)
- Cron endpoint (runs every 15 minutes)
- Manual trigger endpoint for testing
- Nudge status in dashboard

### New Files
- `src/lib/sms/quiet-hours.ts`
- `src/lib/sms/nudge-templates.ts`
- `src/lib/sms/nudge-eligibility.ts`
- `src/lib/sms/nudge-sender.ts`
- `src/lib/sms/nudge-scheduler.ts`
- `src/app/api/cron/nudges/route.ts`
- `src/app/api/events/[id]/trigger-nudges/route.ts`

### Schema Changes
- `Person`: +`nudge24hSentAt`, +`nudge48hSentAt`

### Environment Variables
```
CRON_SECRET=your-random-secret
```

### Cron Configuration
```
*/15 * * * * — Every 15 minutes
```

---

## Phase 6: Host Dashboard Enhancements

**Branch:** `feature/invite-phase-6-dashboard-enhancements`  
**Effort:** 2-3 days  
**Dependencies:** Phases 1-5 (for full functionality)

### What It Does
Makes all the invite infrastructure visible and controllable for the host. Adds panic-mode tools for event week.

### Key Deliverables
- Invite funnel visualization (5 stages with dropoff)
- Per-person detail modal with full timeline
- Manual override ("Mark as Confirmed")
- "Who's Missing" summary component
- "Copy Plan as Text" fallback
- Clickable person names throughout dashboard
- Nudge badges on person rows

### New Files
- `src/components/plan/InviteFunnel.tsx`
- `src/components/plan/PersonInviteDetailModal.tsx`
- `src/components/plan/WhosMissing.tsx`
- `src/components/plan/CopyPlanAsText.tsx`
- `src/app/api/events/[id]/people/[personId]/invite-detail/route.ts`
- `src/app/api/events/[id]/people/[personId]/mark-confirmed/route.ts`
- `src/app/api/events/[id]/export-text/route.ts`

---

## Build Order

Recommended sequence for implementation:

```
Week 1:
├── Phase 1: Instrumentation (1-2 days)
├── Phase 2: Send Confirmation (1 day)
└── Start Phase 3: Shared Link

Week 2:
├── Complete Phase 3: Shared Link (3-4 days)
└── Start Phase 4: SMS Infrastructure

Week 3:
├── Complete Phase 4: SMS Infrastructure (2-3 days)
└── Start Phase 5: Auto-Nudge

Week 4:
├── Complete Phase 5: Auto-Nudge (3-4 days)
└── Phase 6: Dashboard Enhancements (2-3 days)
```

---

## Pre-Build Decisions Required

Before starting, confirm:

1. **Twilio Account:** Set up and credentials obtained?
2. **Phone Requirement:** Required for all invitees, or optional with graceful degradation?
3. **Shared Link Threshold:** 16+ people confirmed, or adjustable?
4. **Nudge Copy:** Final SMS template text approved?
5. **Quiet Hours:** Hardcoded NZ, or per-event timezone setting?
6. **Cron Platform:** Vercel Cron, Railway, or other?

---

## All Schema Changes Summary

```prisma
// NEW MODELS

model InviteEvent {
  id        String          @id @default(cuid())
  eventId   String
  event     Event           @relation(...)
  personId  String?
  person    Person?         @relation(...)
  type      InviteEventType
  metadata  Json?
  createdAt DateTime        @default(now())
}

model SmsOptOut {
  id          String   @id @default(cuid())
  phoneNumber String
  hostId      String
  host        Person   @relation(...)
  optedOutAt  DateTime @default(now())
  rawMessage  String?
  
  @@unique([phoneNumber, hostId])
}

// NEW ENUM

enum InviteEventType {
  INVITE_SEND_CONFIRMED
  LINK_OPENED
  NAME_CLAIMED
  RESPONSE_SUBMITTED
  NUDGE_SENT_AUTO
  NUDGE_DEFERRED_QUIET
  SMS_OPT_OUT_RECEIVED
  SMS_BLOCKED_OPT_OUT
  SMS_BLOCKED_INVALID
  SMS_SEND_FAILED
  MANUAL_OVERRIDE_MARKED
  CLAIM_RESET
}

// MODIFIED MODELS

model Event {
  // + inviteSendConfirmedAt  DateTime?
  // + sharedLinkToken        String?    @unique
  // + sharedLinkEnabled      Boolean    @default(false)
  // + inviteEvents           InviteEvent[]
}

model Person {
  // + phoneNumber      String?
  // + smsOptedOut      Boolean   @default(false)
  // + smsOptedOutAt    DateTime?
  // + inviteAnchorAt   DateTime?
  // + nudge24hSentAt   DateTime?
  // + nudge48hSentAt   DateTime?
  // + inviteEvents     InviteEvent[]
  // + receivedOptOuts  SmsOptOut[]  @relation("HostOptOuts")
}

model AccessToken {
  // + openedAt   DateTime?
  // + claimedAt  DateTime?
  // + claimedBy  String?
}
```

---

## All Environment Variables

```bash
# Twilio SMS (Phase 4)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_PHONE_NUMBER=+642XXXXXXXX

# Cron Authentication (Phase 5)
CRON_SECRET=your-random-secret-here

# App URL (used for links in SMS)
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

---

## Key Files by Category

### API Routes (New)
```
src/app/api/
├── events/[id]/
│   ├── confirm-invites-sent/route.ts
│   ├── invite-status/route.ts
│   ├── shared-link/route.ts
│   ├── trigger-nudges/route.ts
│   ├── export-text/route.ts
│   └── people/[personId]/
│       ├── invite-detail/route.ts
│       ├── mark-confirmed/route.ts
│       └── reset-claim/route.ts
├── join/[token]/
│   └── claim/route.ts
├── sms/
│   └── inbound/route.ts
└── cron/
    └── nudges/route.ts
```

### Libraries (New)
```
src/lib/
├── invite-events.ts
├── phone.ts
└── sms/
    ├── twilio-client.ts
    ├── opt-out-keywords.ts
    ├── opt-out-service.ts
    ├── send-sms.ts
    ├── quiet-hours.ts
    ├── nudge-templates.ts
    ├── nudge-eligibility.ts
    ├── nudge-sender.ts
    └── nudge-scheduler.ts
```

### Components (New)
```
src/components/plan/
├── InviteStatusSection.tsx
├── SharedLinkSection.tsx
├── InviteFunnel.tsx
├── PersonInviteDetailModal.tsx
├── WhosMissing.tsx
└── CopyPlanAsText.tsx
```

### Pages (New)
```
src/app/
└── join/[token]/
    ├── page.tsx
    └── NameSelectionClient.tsx
```

---

## Success Metrics

After full implementation, measure:

1. **Host chasing reduction:** Hosts should send 0 follow-up messages
2. **Response rate:** Target 90%+ responses within 72h
3. **Nudge effectiveness:** Track responses that come after nudges
4. **Opt-out rate:** Should be <5% (indicates good targeting)
5. **Shared link adoption:** % of 16+ events using shared link

---

## Ticket Files Location

All individual phase tickets are available at:

```
/mnt/user-data/outputs/
├── PHASE-1-INSTRUMENTATION-FOUNDATION.md
├── PHASE-2-SEND-CONFIRMATION.md
├── PHASE-3-SHARED-LINK-MODE.md
├── PHASE-4-SMS-INFRASTRUCTURE.md
├── PHASE-5-AUTO-NUDGE-SYSTEM.md
├── PHASE-6-DASHBOARD-ENHANCEMENTS.md
└── INVITE-SYSTEM-SUMMARY.md (this file)
```

Each ticket contains:
- Full project context
- Detailed sub-tasks with code examples
- Acceptance criteria
- Testing checklists
- Database verification queries
- Definition of done

---

## Getting Started

1. Review this summary
2. Confirm pre-build decisions
3. Set up Twilio account (can defer until Phase 4)
4. Start with Phase 1 in a new branch
5. Work through phases sequentially
6. Each phase should be deployable independently

**The core promise:** After Phase 5, Gather will automatically remind non-responders so hosts don't have to chase.
