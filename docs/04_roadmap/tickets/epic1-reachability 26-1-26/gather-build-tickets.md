# Gather Build Tickets — Claude Code Ready

**Generated:** 24 January 2026
**Total Tickets:** 18 (launch) + 3 (fast-follow)
**Workflow:** Load each ticket into Claude Code sequentially. Wait for completion, run tests, fix bugs, proceed to next.

---

# HOW TO USE THIS DOCUMENT

Each ticket is self-contained. Copy the entire ticket (from `# TICKET X.X` to the next `---`) into Claude Code.

**Before starting:** Create `docs/BUILD_STATUS.md` in the repo to track progress:

\`\`\`markdown
# Gather Build Status

## Epic 1: Tiered Identity + Reachability
- [ ] 1.1: Extend PersonEvent with Reachability Fields
- [ ] 1.2: Tier 2 Proxy Household Model
- [ ] 1.3: Tier 3 Shared Link Fallback
- [ ] 1.4: Dashboard Reachability Bar
- [ ] 1.5: Proxy Nudge Logic

## Epic 2: RSVP Layer
- [ ] 2.1: RSVP State Machine
- [ ] 2.2: Not Sure Forced Conversion
- [ ] 2.3: Dashboard Attendance vs Items

## Epic 3: Nudge Infrastructure
- [ ] 3.1: Background Job Infrastructure
- [ ] 3.2: Nudge Scheduling Engine
- [ ] 3.3: Notification Delivery

## Epic 4: Freeze Enhancements
- [ ] 4.1: Freeze Warnings
- [ ] 4.2: Sub-80% Reason Tag
- [ ] 4.3: Surgical Edit While Frozen

## Epic 5: Threshold UX
- [ ] 5.1: 80% Threshold Visual State

## Epic 6: Metric Instrumentation
- [ ] 6.1: Frozen Rate Metric
- [ ] 6.2: Repeat Host Rate Metric
- [ ] 6.3: Reachability Breakdown Logging
\`\`\`

---

# EPIC 1: TIERED IDENTITY + REACHABILITY LAYER

---

# TICKET 1.1: Extend PersonEvent with Reachability Fields

## Context

**What is Gather?**
Gather is a coordination app for multi-person gatherings (Christmas dinners, family reunions). Hosts distribute responsibilities across 10-50 participants. The system uses magic link authentication — no passwords, no accounts.

**What exists now?**
- Working prototype with events, teams, items, people
- Magic link tokens via AccessToken model (HOST/COORDINATOR/PARTICIPANT scopes)
- PersonEvent joins people to events with role and team assignment
- Token resolution in src/lib/auth.ts
- Invite instrumentation fields already exist on PersonEvent (inviteSentAt, inviteOpenedAt, inviteRespondedAt)

**What previous tickets built?**
This is the first ticket. No prior work.

**What this ticket builds?**
Adds reachability tracking to PersonEvent so the system knows who can be nudged directly, who needs a proxy, and who is untrackable.

**What comes next?**
Ticket 1.2 adds the Household/Proxy model. Ticket 1.3 adds shared link fallback. Do not build those yet.

## File Locations

\`\`\`
prisma/schema.prisma          — Data models (PersonEvent is here)
src/lib/auth.ts               — Token resolution
src/lib/workflow.ts           — State machine, mutations
src/app/api/events/[id]/people/route.ts — People CRUD
\`\`\`

## Current Schema (relevant excerpt)

\`\`\`prisma
model PersonEvent {
  id        String   @id @default(cuid())
  personId  String
  eventId   String
  teamId    String?
  role      Role     @default(PARTICIPANT)
  
  // Invite tracking (already exists)
  inviteSentAt      DateTime?
  inviteOpenedAt    DateTime?
  inviteRespondedAt DateTime?
  inviteSendConfirmed Boolean @default(false)
  
  person    Person   @relation(fields: [personId], references: [id], onDelete: Cascade)
  event     Event    @relation(fields: [eventId], references: [id], onDelete: Cascade)
  team      Team?    @relation(fields: [teamId], references: [id])

  @@unique([personId, eventId])
}

model Person {
  id    String  @id @default(cuid())
  name  String
  email String?
  phone String?
  // ... relations
}
\`\`\`

## What To Build

- [ ] Add enum ReachabilityTier to schema: DIRECT, PROXY, SHARED, UNTRACKABLE
- [ ] Add enum ContactMethod to schema: EMAIL, SMS, NONE
- [ ] Add field reachabilityTier to PersonEvent (default: UNTRACKABLE)
- [ ] Add field contactMethod to PersonEvent (default: NONE)
- [ ] Add field proxyPersonEventId to PersonEvent (nullable, self-reference for Tier 2)
- [ ] Create migration
- [ ] Update person creation logic in src/app/api/events/[id]/people/route.ts:
  - If person has phone → contactMethod: SMS, reachabilityTier: DIRECT
  - If person has email but no phone → contactMethod: EMAIL, reachabilityTier: DIRECT
  - If person has neither → contactMethod: NONE, reachabilityTier: UNTRACKABLE
- [ ] Update CSV import in src/app/api/events/[id]/people/batch-import/route.ts with same logic
- [ ] Write migration script to backfill existing PersonEvent records based on Person.email/phone

## Do Not Touch

- Do not modify resolveToken() in src/lib/auth.ts
- Do not change AccessToken model
- Do not add any UI components yet (Ticket 1.4 handles dashboard)

## Technical Notes

Self-referential relation for proxy:
\`\`\`prisma
model PersonEvent {
  // ... existing fields
  
  reachabilityTier    ReachabilityTier @default(UNTRACKABLE)
  contactMethod       ContactMethod    @default(NONE)
  proxyPersonEventId  String?
  proxy               PersonEvent?     @relation("ProxyRelation", fields: [proxyPersonEventId], references: [id])
  householdMembers    PersonEvent[]    @relation("ProxyRelation")
}
\`\`\`

## Done When

- [ ] npx prisma migrate dev succeeds
- [ ] npm run typecheck passes
- [ ] npm run build passes
- [ ] New PersonEvent created via API has correct reachabilityTier based on contact info
- [ ] CSV import sets reachabilityTier correctly
- [ ] Existing records have been backfilled (run migration script)

## Verification Steps

1. Run npm run db:seed to create test data
2. Create a new person with phone → confirm reachabilityTier: DIRECT, contactMethod: SMS
3. Create a new person with email only → confirm reachabilityTier: DIRECT, contactMethod: EMAIL
4. Create a new person with no contact → confirm reachabilityTier: UNTRACKABLE, contactMethod: NONE

## Next Ticket Preview

Ticket 1.2 will add the Household model for proxy invites, using the proxyPersonEventId field added here.

---


# TICKET 1.2: Tier 2 Proxy Household Model

## Context

**What is Gather?**
Gather is a coordination app for multi-person gatherings. Hosts often don't have contact info for everyone — they know their sister Lisa, but not Lisa's partner or kids. The proxy model lets Lisa receive invites for her household and forward them.

**What exists now?**
- PersonEvent with reachabilityTier, contactMethod, proxyPersonEventId (from Ticket 1.1)
- Magic link tokens
- Person/PersonEvent CRUD

**What previous tickets built?**
- Ticket 1.1: Added reachabilityTier, contactMethod, proxyPersonEventId to PersonEvent

**What this ticket builds?**
A Household model that groups people under a proxy. Proxy can add household members. Household members can claim their slot.

**What comes next?**
Ticket 1.3 adds shared link fallback. Ticket 1.4 adds dashboard visibility. Do not build those yet.

## File Locations

\`\`\`
prisma/schema.prisma                              — Data models
src/app/api/events/[id]/people/route.ts           — People CRUD
src/app/api/events/[id]/people/[personId]/route.ts — Individual person
src/app/join/[token]/                             — Claim flow (existing)
\`\`\`

## What To Build

- [ ] Add Household model to schema:
\`\`\`prisma
model Household {
  id              String   @id @default(cuid())
  eventId         String
  proxyPersonId   String
  name            String?
  createdAt       DateTime @default(now())
  
  event           Event    @relation(fields: [eventId], references: [id], onDelete: Cascade)
  proxyPerson     Person   @relation(fields: [proxyPersonId], references: [id])
  members         HouseholdMember[]
  
  @@unique([eventId, proxyPersonId])
}

model HouseholdMember {
  id            String    @id @default(cuid())
  householdId   String
  name          String
  claimedAt     DateTime?
  personEventId String?   @unique
  proxyNudgeCount   Int       @default(0)
  lastProxyNudgeAt  DateTime?
  escalatedAt       DateTime?
  
  household     Household    @relation(fields: [householdId], references: [id], onDelete: Cascade)
  personEvent   PersonEvent? @relation(fields: [personEventId], references: [id])
}
\`\`\`
- [ ] Add relation to PersonEvent: householdMember HouseholdMember?
- [ ] Create migration
- [ ] Create API endpoint POST /api/events/[id]/households — Host creates household with proxy
- [ ] Create API endpoint GET /api/events/[id]/households — List households for event
- [ ] Create API endpoint POST /api/events/[id]/households/[householdId]/members — Proxy adds member names
- [ ] Create API endpoint POST /api/events/[id]/households/[householdId]/claim — Member claims their slot
- [ ] When member claims: Create Person if not exists, Create PersonEvent with reachabilityTier: PROXY

## Do Not Touch

- Do not modify existing magic link flow in src/app/join/[token]/
- Do not add dashboard UI (Ticket 1.4)
- Do not add nudge logic (Ticket 1.5)

## Done When

- [ ] npx prisma migrate dev succeeds
- [ ] npm run typecheck passes
- [ ] npm run build passes
- [ ] Can create household via API
- [ ] Can add members to household via API
- [ ] Can claim member slot via API
- [ ] Claimed member has correct reachabilityTier and proxyPersonEventId

## Verification Steps

1. Create event with person "Lisa" (has phone)
2. POST /api/events/[id]/households with { proxyPersonId: lisaId, name: "Lisa's family" }
3. POST /api/events/[id]/households/[householdId]/members with { name: "Tom" }
4. POST /api/events/[id]/households/[householdId]/claim with { memberId: tomMemberId }
5. Verify Tom's PersonEvent has reachabilityTier: PROXY

## Next Ticket Preview

Ticket 1.3 will add Tier 3 shared link fallback for group chat drops.

---

# TICKET 1.3: Tier 3 Shared Link Fallback

## Context

**What is Gather?**
Gather is a coordination app for multi-person gatherings. Sometimes hosts don't have individual contact info — they just drop a link in the family group chat.

**What exists now?**
- ReachabilityTier enum with DIRECT, PROXY, SHARED, UNTRACKABLE
- Household model for Tier 2 proxy invites
- Magic link tokens (HOST/COORDINATOR/PARTICIPANT scopes)
- Existing claim flow at src/app/join/[token]/
- Existing shared link endpoint at src/app/api/events/[id]/shared-link/route.ts

**What previous tickets built?**
- Ticket 1.1: Reachability fields on PersonEvent
- Ticket 1.2: Household model for proxy invites

**What this ticket builds?**
Enhance shared event link so claimants are tracked as Tier 3 (SHARED).

**What comes next?**
Ticket 1.4 adds dashboard visibility for reachability tiers.

## File Locations

\`\`\`
prisma/schema.prisma                          — Data models
src/lib/tokens.ts                             — Token generation
src/app/api/events/[id]/shared-link/route.ts  — Already exists! Review first
src/app/join/[token]/                         — Claim flow
src/app/join/[token]/NameSelectionClient.tsx  — Name selection UI
\`\`\`

## What To Build

- [ ] Review existing shared-link implementation first
- [ ] Add claimedViaSharedLink Boolean @default(false) to PersonEvent
- [ ] When someone claims via shared link:
  - Set reachabilityTier: SHARED
  - Set claimedViaSharedLink: true
- [ ] If visitor adds contact info after claim:
  - Upgrade reachabilityTier to DIRECT
  - Set contactMethod appropriately
- [ ] Ensure shared-link claimants can respond to assignments

## Do Not Touch

- Do not modify Tier 1 (direct) or Tier 2 (proxy) flows
- Do not add dashboard UI (Ticket 1.4)

## Done When

- [ ] npm run typecheck passes
- [ ] npm run build passes
- [ ] Shared link claim sets reachabilityTier: SHARED
- [ ] Adding contact info upgrades to DIRECT

## Verification Steps

1. Create event with 5 people (no contact info)
2. Generate shared link
3. Open link, select a name, claim
4. Verify PersonEvent shows reachabilityTier: SHARED
5. Add phone number
6. Verify upgrade to reachabilityTier: DIRECT

## Next Ticket Preview

Ticket 1.4 will add the dashboard reachability bar.

---

# TICKET 1.4: Dashboard Reachability Bar

## Context

**What is Gather?**
Gather is a coordination app for multi-person gatherings. Hosts need to understand who can be nudged automatically versus who requires manual follow-up.

**What exists now?**
- ReachabilityTier on PersonEvent (DIRECT, PROXY, SHARED, UNTRACKABLE)
- Host dashboard at src/app/plan/[eventId]/page.tsx
- Invite status section at src/components/plan/InviteStatusSection.tsx
- Invite funnel at src/components/plan/InviteFunnel.tsx

**What previous tickets built?**
- Ticket 1.1: Reachability fields
- Ticket 1.2: Proxy households
- Ticket 1.3: Shared link fallback

**What this ticket builds?**
A reachability breakdown on the host dashboard showing trackable vs proxy vs untrackable counts.

**What comes next?**
Ticket 1.5 adds proxy nudge logic.

## File Locations

\`\`\`
src/app/plan/[eventId]/page.tsx               — Host dashboard
src/components/plan/InviteStatusSection.tsx   — Invite tracking UI
src/components/plan/InviteFunnel.tsx          — Funnel visualization
src/components/plan/PeopleSection.tsx         — People list
src/app/api/events/[id]/invite-status/route.ts — Invite status API
\`\`\`

## What To Build

- [ ] Create component src/components/plan/ReachabilityBar.tsx:
  - Shows segments: Trackable (Tier 1), Via Proxy (Tier 2), Untrackable
  - Visual: horizontal bar with color segments
  - Numbers: "10 trackable · 4 via proxy · 2 untrackable"
  - Clicking segment shows names in that tier
- [ ] Update invite-status API to include reachability breakdown:
\`\`\`typescript
{
  reachability: {
    direct: number,
    proxy: number,
    shared: number,
    untrackable: number
  }
}
\`\`\`
- [ ] Add warning banner if untrackable > 0
- [ ] Integrate ReachabilityBar into InviteStatusSection

## Do Not Touch

- Do not add nudge functionality (Ticket 1.5 / Epic 3)

## Done When

- [ ] npm run typecheck passes
- [ ] npm run build passes
- [ ] Host dashboard shows reachability breakdown
- [ ] Warning appears when untrackable > 0

## Verification Steps

1. Seed database with mix of reachability tiers
2. Open host dashboard
3. Verify counts match database
4. Click tier segment, verify names shown

## Next Ticket Preview

Ticket 1.5 will add proxy nudge logic.

---

# TICKET 1.5: Proxy Nudge Logic (Unclaimed Slots)

## Context

**What is Gather?**
When household members don't respond, the proxy should be nudged to follow up.

**What exists now?**
- Household and HouseholdMember models
- Nudge infrastructure in src/lib/sms/
- Cron endpoint at src/app/api/cron/nudges/route.ts

**What previous tickets built?**
- Ticket 1.1-1.4: Reachability tracking and dashboard

**What this ticket builds?**
Proxy-specific nudge logic: when household members are unclaimed, nudge the proxy.

**What comes next?**
Epic 2 (RSVP Layer). This completes Epic 1.

## File Locations

\`\`\`
src/lib/sms/nudge-scheduler.ts    — Schedule nudges
src/lib/sms/nudge-sender.ts       — Send nudges
src/lib/sms/nudge-templates.ts    — Message templates
src/lib/sms/nudge-eligibility.ts  — Eligibility checks
src/app/api/cron/nudges/route.ts  — Cron trigger
\`\`\`

## What To Build

- [ ] Add nudge template PROXY_HOUSEHOLD_REMINDER in nudge-templates.ts
- [ ] Update nudge-eligibility.ts to identify proxy nudge targets:
  - Find Households where HouseholdMember.claimedAt is null
  - Check time since household created (24h, 48h thresholds)
- [ ] Schedule proxy nudges: First at 24h, second at 48h
- [ ] After second nudge: mark HouseholdMember.escalatedAt (no more auto-nudges)
- [ ] Update dashboard to show escalation status

## Do Not Touch

- Do not modify direct (Tier 1) nudge logic
- Do not change SMS infrastructure (twilio-client.ts, send-sms.ts)

## Done When

- [ ] npm run typecheck passes
- [ ] npm run build passes
- [ ] Unclaimed household members trigger proxy nudge at 24h
- [ ] Second nudge fires at 48h
- [ ] After second nudge, member marked as escalated
- [ ] Dashboard shows escalation status

## Verification Steps

1. Create event with household (Lisa as proxy, Tom unclaimed)
2. Trigger nudge cron
3. Verify Lisa receives nudge SMS
4. Verify proxyNudgeCount incremented
5. After second nudge, verify escalatedAt is set

## Next Ticket Preview

This completes Epic 1. Epic 2 begins with Ticket 2.1: RSVP State Machine.

---


# EPIC 2: RSVP LAYER

---

# TICKET 2.1: RSVP State Machine

## Context

**What is Gather?**
Gather is a coordination app for multi-person gatherings. Currently, the system only tracks item assignment responses (PENDING/ACCEPTED/DECLINED). RSVP (attendance) is a separate question: "Are you coming?" vs "Can you bring the salad?"

**What exists now?**
- Assignment model with status (PENDING/ACCEPTED/DECLINED)
- PersonEvent joins people to events
- Participant view at src/app/p/[token]/page.tsx

**What previous tickets built?**
- Epic 1: Tiered identity and reachability

**What this ticket builds?**
RSVP tracking separate from item commitment.

**What comes next?**
Ticket 2.2 adds forced conversion for "Not sure" responses.

## File Locations

\`\`\`
prisma/schema.prisma                    — Data models
src/app/p/[token]/page.tsx              — Participant view
src/app/api/p/[token]/route.ts          — Participant API
src/app/api/events/[id]/invite-status/route.ts — Status aggregation
\`\`\`

## What To Build

- [ ] Add enum RsvpStatus to schema: PENDING, YES, NO, NOT_SURE
- [ ] Add fields to PersonEvent:
\`\`\`prisma
rsvpStatus      RsvpStatus @default(PENDING)
rsvpRespondedAt DateTime?
\`\`\`
- [ ] Create migration
- [ ] Update participant view (src/app/p/[token]/page.tsx):
  - Show RSVP question first: "Are you coming? Yes / No / Not sure"
  - Only show item assignments after RSVP answered
  - If RSVP = NO, show "Thanks for letting us know" (no items)
- [ ] Update participant API with PATCH handler for RSVP
- [ ] Update invite status API to include RSVP breakdown

## Do Not Touch

- Do not modify Assignment model or item response flow
- Do not add forced conversion logic (Ticket 2.2)

## Done When

- [ ] npx prisma migrate dev succeeds
- [ ] npm run typecheck passes
- [ ] npm run build passes
- [ ] Participant sees RSVP question before items
- [ ] RSVP response recorded with timestamp
- [ ] RSVP = NO hides item assignments

## Verification Steps

1. Get participant token for test event
2. Open /p/[token]
3. Verify RSVP question appears first
4. Select "Yes" — verify items now visible
5. Check database: PersonEvent.rsvpStatus = YES

## Next Ticket Preview

Ticket 2.2 will add forced conversion for "Not sure".

---

# TICKET 2.2: Not Sure Forced Conversion

## Context

**What is Gather?**
"Not sure" is a valid initial response, but it cannot become a permanent silence bucket.

**What exists now?**
- RsvpStatus enum with PENDING, YES, NO, NOT_SURE
- Nudge infrastructure in src/lib/sms/
- Participant view with RSVP question

**What previous tickets built?**
- Ticket 2.1: RSVP state machine with "Not sure" option

**What this ticket builds?**
After 48h of "Not sure", send follow-up that only offers Yes/No.

**What comes next?**
Ticket 2.3 adds dashboard attendance view.

## File Locations

\`\`\`
src/lib/sms/nudge-templates.ts      — Message templates
src/lib/sms/nudge-eligibility.ts    — Eligibility checks
src/lib/sms/nudge-scheduler.ts      — Scheduling
src/app/p/[token]/page.tsx          — Participant view
\`\`\`

## What To Build

- [ ] Add nudge template RSVP_FOLLOWUP
- [ ] Add rsvpFollowupSentAt DateTime? to PersonEvent
- [ ] Update nudge eligibility to identify NOT_SURE RSVPs older than 48h
- [ ] Update nudge scheduler to send RSVP follow-up at 48h mark
- [ ] Create follow-up landing: If rsvpStatus = NOT_SURE, show only Yes/No (no "Not sure")

## Do Not Touch

- Do not remove "Not sure" from initial RSVP
- Do not modify item assignment flow

## Done When

- [ ] npx prisma migrate dev succeeds
- [ ] npm run typecheck passes
- [ ] npm run build passes
- [ ] NOT_SURE RSVPs get follow-up at 48h
- [ ] Follow-up landing shows only Yes/No

## Verification Steps

1. Set participant RSVP to NOT_SURE
2. Set rsvpRespondedAt to 49 hours ago
3. Trigger nudge cron
4. Verify follow-up SMS sent
5. Open follow-up link, verify only Yes/No buttons

## Next Ticket Preview

Ticket 2.3 will update the dashboard to show attendance vs item compliance separately.

---

# TICKET 2.3: Dashboard Attendance vs Item Compliance

## Context

**What is Gather?**
Gather now tracks RSVP (attendance) separately from item commitments. The host dashboard needs to show both.

**What exists now?**
- RsvpStatus on PersonEvent
- Invite status API with RSVP breakdown
- Host dashboard at src/app/plan/[eventId]/page.tsx

**What previous tickets built?**
- Ticket 2.1: RSVP state machine
- Ticket 2.2: Not Sure forced conversion

**What this ticket builds?**
Dashboard shows attendance and item compliance as separate metrics.

**What comes next?**
Epic 3 (Nudge Infrastructure). This completes Epic 2.

## File Locations

\`\`\`
src/app/plan/[eventId]/page.tsx               — Host dashboard
src/components/plan/InviteStatusSection.tsx   — Invite tracking
src/components/plan/InviteFunnel.tsx          — Funnel viz
src/app/api/events/[id]/invite-status/route.ts — Status API
\`\`\`

## What To Build

- [ ] Update invite status API response:
\`\`\`typescript
{
  attendance: {
    total: number,
    yes: number,
    no: number,
    notSure: number,
    pending: number
  },
  items: {
    total: number,
    confirmed: number,
    declined: number,
    pending: number,
    gaps: number
  }
}
\`\`\`
- [ ] Create/update component to show dual metrics
- [ ] Visual separation between attendance and items

## Do Not Touch

- Do not modify RSVP logic (Ticket 2.1-2.2)
- Do not modify item assignment logic

## Done When

- [ ] npm run typecheck passes
- [ ] npm run build passes
- [ ] Dashboard shows attendance count separate from item count
- [ ] Click-through shows detailed breakdown

## Verification Steps

1. Create event with mix of RSVP statuses and item assignments
2. Open host dashboard
3. Verify attendance count matches PersonEvent.rsvpStatus counts
4. Verify item count matches Assignment status counts

## Next Ticket Preview

This completes Epic 2. Epic 3 begins with Ticket 3.1: Background Job Infrastructure.

---

# EPIC 3: NUDGE INFRASTRUCTURE

---

# TICKET 3.1: Background Job Infrastructure

## Context

**What is Gather?**
Gather needs to send automated nudges at scheduled times. This requires background job processing.

**What exists now?**
- Cron endpoint at src/app/api/cron/nudges/route.ts
- SMS infrastructure in src/lib/sms/
- Vercel cron configuration in vercel.json

**What previous tickets built?**
- Epic 1: Reachability tracking
- Epic 2: RSVP tracking

**What this ticket builds?**
Review and harden existing background job infrastructure. Ensure production-ready.

**What comes next?**
Ticket 3.2 builds comprehensive nudge scheduling.

## File Locations

\`\`\`
vercel.json                           — Cron configuration
src/app/api/cron/nudges/route.ts      — Cron handler
src/lib/sms/nudge-scheduler.ts        — Scheduling logic
src/lib/sms/nudge-sender.ts           — Sending logic
src/lib/sms/nudge-eligibility.ts      — Who gets nudged
\`\`\`

## What To Build

- [ ] Review existing cron setup in vercel.json
- [ ] Ensure cron runs every 15 minutes
- [ ] Add/verify NudgeLog model:
\`\`\`prisma
model NudgeLog {
  id              String   @id @default(cuid())
  personEventId   String
  nudgeType       String
  scheduledFor    DateTime
  sentAt          DateTime?
  status          String   // PENDING, SENT, FAILED, CANCELLED
  errorMessage    String?
  createdAt       DateTime @default(now())
  
  personEvent     PersonEvent @relation(fields: [personEventId], references: [id], onDelete: Cascade)
}
\`\`\`
- [ ] Ensure cron handler processes batches (max 50 per run)
- [ ] Add health check logging

## Do Not Touch

- Do not modify Twilio integration
- Do not modify SMS send logic

## Done When

- [ ] npx prisma migrate dev succeeds (if schema changes)
- [ ] npm run typecheck passes
- [ ] npm run build passes
- [ ] Cron endpoint responds successfully
- [ ] NudgeLog records created and updated correctly

## Verification Steps

1. Create test NudgeLog with scheduledFor in the past
2. Trigger cron endpoint: curl /api/cron/nudges
3. Verify nudge sent and status updated to SENT
4. Test error handling with invalid phone number

## Next Ticket Preview

Ticket 3.2 will build the comprehensive nudge scheduling engine.

---

# TICKET 3.2: Nudge Scheduling Engine

## Context

**What is Gather?**
Gather sends automated nudges to reduce host chasing. Nudges fire at 24h and 48h.

**What exists now?**
- NudgeLog model for tracking
- Cron endpoint processing due nudges
- Existing nudge logic in src/lib/sms/nudge-scheduler.ts

**What previous tickets built?**
- Ticket 3.1: Background job infrastructure with NudgeLog

**What this ticket builds?**
Comprehensive nudge scheduling: when to create nudges, cancellation logic.

**What comes next?**
Ticket 3.3 ensures delivery via email and SMS.

## File Locations

\`\`\`
src/lib/sms/nudge-scheduler.ts      — Main scheduling logic
src/lib/sms/nudge-eligibility.ts    — Eligibility rules
src/app/api/events/[id]/transition/route.ts — State transitions
\`\`\`

## What To Build

- [ ] Define nudge types:
\`\`\`typescript
enum NudgeType {
  INVITE_REMINDER_24H,
  INVITE_REMINDER_48H,
  RSVP_FOLLOWUP,
  PROXY_HOUSEHOLD,
  ITEM_REMINDER
}
\`\`\`
- [ ] Schedule nudges when event transitions to CONFIRMING
- [ ] Cancellation logic: When invitee responds, cancel pending nudges
- [ ] Respect quiet hours (src/lib/sms/quiet-hours.ts)
- [ ] Function: scheduleNudgesForEvent(eventId)
- [ ] Function: cancelNudgesForPerson(personEventId)

## Do Not Touch

- Do not modify cron processing (Ticket 3.1)
- Do not modify SMS sending (Ticket 3.3)

## Done When

- [ ] npm run typecheck passes
- [ ] npm run build passes
- [ ] Event transition creates nudge records
- [ ] Response cancels pending nudges
- [ ] Quiet hours respected

## Verification Steps

1. Transition event to CONFIRMING
2. Verify NudgeLog records created
3. Respond as invitee
4. Verify pending nudges cancelled

## Next Ticket Preview

Ticket 3.3 ensures nudges are delivered via both email and SMS.

---

# TICKET 3.3: Notification Delivery (Email + SMS)

## Context

**What is Gather?**
Gather sends nudges via SMS (primary) and email (fallback).

**What exists now?**
- SMS sending via Twilio in src/lib/sms/
- Email via src/lib/email.ts
- ContactMethod on PersonEvent

**What previous tickets built?**
- Ticket 3.1: Background job infrastructure
- Ticket 3.2: Nudge scheduling engine

**What this ticket builds?**
Reliable delivery via both channels with status tracking.

**What comes next?**
Epic 4 (Freeze Enhancements). This completes Epic 3.

## File Locations

\`\`\`
src/lib/sms/send-sms.ts           — SMS sending
src/lib/sms/nudge-sender.ts       — Nudge dispatch
src/lib/sms/nudge-templates.ts    — Message templates
src/lib/email.ts                  — Email sending
\`\`\`

## What To Build

- [ ] Update nudge sender to route by ContactMethod:
\`\`\`typescript
async function sendNudge(nudge: NudgeLog, personEvent: PersonEvent) {
  const { contactMethod } = personEvent;
  if (contactMethod === 'SMS') return sendViaSMS(nudge, personEvent);
  if (contactMethod === 'EMAIL') return sendViaEmail(nudge, personEvent);
  return { success: false, error: 'No contact method' };
}
\`\`\`
- [ ] Add email templates matching SMS templates
- [ ] Track delivery status: deliveryChannel, externalId in NudgeLog
- [ ] Handle failures gracefully

## Do Not Touch

- Do not modify Twilio credentials
- Do not modify nudge scheduling

## Done When

- [ ] npm run typecheck passes
- [ ] npm run build passes
- [ ] SMS delivery works for NZ numbers
- [ ] Email delivery works
- [ ] Delivery status tracked correctly

## Verification Steps

1. Create nudge for person with SMS contact
2. Trigger cron, verify SMS sent
3. Create nudge for person with EMAIL contact
4. Trigger cron, verify email sent
5. Test invalid phone: verify status = FAILED

## Next Ticket Preview

This completes Epic 3. Epic 4 begins with Ticket 4.1: Freeze Warnings.

---


# EPIC 4: FREEZE ENHANCEMENTS

---

# TICKET 4.1: Freeze Warnings

## Context

**What is Gather?**
Gather allows hosts to "freeze" the plan when coordination is complete. But freezing with low compliance or critical gaps should trigger warnings.

**What exists now?**
- Freeze transition in src/lib/workflow.ts
- Gate checks before DRAFT → CONFIRMING
- Transition modal in src/components/plan/TransitionModal.tsx

**What previous tickets built?**
- Epics 1-3: Reachability, RSVP, Nudges

**What this ticket builds?**
Warnings when host freezes with <80% compliance or unassigned critical items.

**What comes next?**
Ticket 4.2 adds reason tag capture.

## File Locations

\`\`\`
src/lib/workflow.ts                       — State machine
src/components/plan/TransitionModal.tsx   — Transition UI
src/components/plan/FreezeCheck.tsx       — Freeze validation
src/app/api/events/[id]/transition/route.ts — Transition API
\`\`\`

## What To Build

- [ ] Add freeze check function in src/lib/workflow.ts:
\`\`\`typescript
interface FreezeCheckResult {
  canFreeze: boolean; // always true — warnings don't block
  warnings: {
    type: 'LOW_COMPLIANCE' | 'CRITICAL_GAPS';
    message: string;
    details: string[];
  }[];
  complianceRate: number;
  criticalGaps: { itemId: string; itemName: string }[];
}
\`\`\`
- [ ] Update TransitionModal for freeze:
  - If warnings, show confirmation modal
  - "Only X% confirmed. Freeze anyway?"
  - "X critical items have no owner. Freeze anyway?"
- [ ] Compliance calculation: Only count trackable assignments

## Do Not Touch

- Do not block freeze — warnings only
- Do not modify DRAFT → CONFIRMING gate checks

## Done When

- [ ] npm run typecheck passes
- [ ] npm run build passes
- [ ] Freeze with <80% shows warning
- [ ] Freeze with critical gaps shows warning
- [ ] Host can proceed despite warnings

## Verification Steps

1. Create event at 50% compliance
2. Attempt freeze
3. Verify warning shown
4. Click "Freeze Anyway", verify event freezes

## Next Ticket Preview

Ticket 4.2 will capture why the host froze below 80%.

---

# TICKET 4.2: Sub-80% Reason Tag

## Context

**What is Gather?**
When hosts freeze below 80% compliance, capturing why helps understand patterns.

**What exists now?**
- Freeze warnings from Ticket 4.1
- Event model with status tracking

**What previous tickets built?**
- Ticket 4.1: Freeze warnings

**What this ticket builds?**
Reason tag capture when freezing below threshold.

**What comes next?**
Ticket 4.3 adds surgical edit while frozen.

## File Locations

\`\`\`
prisma/schema.prisma                      — Event model
src/lib/workflow.ts                       — Freeze logic
src/components/plan/TransitionModal.tsx   — Freeze UI
\`\`\`

## What To Build

- [ ] Add fields to Event model:
\`\`\`prisma
frozenAt              DateTime?
complianceAtFreeze    Float?
freezeReason          String?
\`\`\`
- [ ] Create migration
- [ ] When compliance < 80%, show reason picklist:
  - "Time pressure — event is soon"
  - "Handling remaining items offline"
  - "Small event — this is enough"
  - "Other"
- [ ] Store selected reason
- [ ] If compliance >= 80%, no reason required

## Do Not Touch

- Do not modify warning logic (Ticket 4.1)

## Done When

- [ ] npx prisma migrate dev succeeds
- [ ] npm run typecheck passes
- [ ] npm run build passes
- [ ] Freeze below 80% prompts for reason
- [ ] Reason stored on Event
- [ ] Freeze at/above 80% skips reason prompt

## Verification Steps

1. Create event at 50% compliance
2. Freeze, select "Time pressure"
3. Check database: freezeReason set
4. Create event at 90% compliance
5. Freeze, verify no reason prompt

## Next Ticket Preview

Ticket 4.3 will add surgical edit capability while frozen.

---

# TICKET 4.3: Surgical Edit While Frozen

## Context

**What is Gather?**
After freezing, sometimes one item needs reassignment. Allow controlled exceptions without full unfreeze.

**What exists now?**
- Frozen state is read-only for invitees
- Host can unfreeze with audit trail

**What previous tickets built?**
- Ticket 4.1-4.2: Freeze warnings and reason capture

**What this ticket builds?**
Host can make targeted edits while frozen: reassign item, toggle critical, edit item details.

**What comes next?**
Epic 5 (Threshold UX). This completes Epic 4.

## File Locations

\`\`\`
src/lib/workflow.ts                           — State machine
src/app/api/events/[id]/items/[itemId]/route.ts — Item CRUD
src/app/api/events/[id]/items/[itemId]/assign/route.ts — Assignment
src/components/plan/EditItemModal.tsx         — Item editing UI
\`\`\`

## What To Build

- [ ] Create new API endpoint: POST /api/events/[id]/frozen-edit
\`\`\`typescript
interface FrozenEditRequest {
  action: 'reassign' | 'toggle-critical' | 'edit-item';
  itemId: string;
  payload: {
    newPersonId?: string;
    notifyRemoved?: boolean;
    critical?: boolean;
    name?: string;
    quantity?: string;
    description?: string;
  };
  reason: string;
}
\`\`\`
- [ ] Validation: Event must be FROZEN, Actor must be HOST
- [ ] For reassignment: Send notification to new assignee
- [ ] For edit-item: Trigger re-confirmation
- [ ] Log all frozen edits in audit trail
- [ ] UI: Add "Edit" option to items in frozen state

## Do Not Touch

- Do not add full "Unfreeze" capability
- Do not allow bulk edits

## Done When

- [ ] npm run typecheck passes
- [ ] npm run build passes
- [ ] Host can reassign item while frozen
- [ ] Host can toggle critical while frozen
- [ ] Host can edit item details (triggers re-confirm)
- [ ] All edits logged in audit trail

## Verification Steps

1. Freeze event with Jake assigned to "Chilly bin"
2. Call frozen-edit API: reassign to Derek
3. Verify Jake's assignment removed
4. Verify Derek receives notification
5. Verify audit entry created

## Next Ticket Preview

This completes Epic 4. Epic 5 begins with Ticket 5.1: 80% Threshold Visual State.

---

# EPIC 5: THRESHOLD UX

---

# TICKET 5.1: 80% Threshold Visual State

## Context

**What is Gather?**
When 80% of items are confirmed, the host should feel confident to freeze. A visual state change rewards progress.

**What exists now?**
- Host dashboard showing item counts
- No special treatment at 80% threshold

**What previous tickets built?**
- Epics 1-4: Full coordination infrastructure

**What this ticket builds?**
Visual signal when host reaches 80% trackable compliance.

**What comes next?**
Epic 6 (Metrics). This completes Epic 5.

## File Locations

\`\`\`
src/app/plan/[eventId]/page.tsx               — Host dashboard
src/components/plan/InviteStatusSection.tsx   — Status display
src/app/api/events/[id]/invite-status/route.ts — Status API
\`\`\`

## What To Build

- [ ] Update invite status API:
\`\`\`typescript
{
  thresholdReached: boolean, // complianceRate >= 0.8
  complianceRate: number,
  readyToFreeze: boolean     // thresholdReached && no critical gaps
}
\`\`\`
- [ ] Create component src/components/plan/ReadyToFreezeIndicator.tsx:
  - Appears when readyToFreeze: true
  - Banner with calming green state
  - Copy: "12 of 14 confirmed — ready to lock"
  - Button: "Lock Plan"
- [ ] Visual: Calm, not celebratory (no confetti)

## Do Not Touch

- Do not modify freeze logic (Epic 4)

## Done When

- [ ] npm run typecheck passes
- [ ] npm run build passes
- [ ] At <80%, indicator not shown
- [ ] At >=80%, indicator appears
- [ ] "Lock Plan" button triggers freeze flow

## Verification Steps

1. Create event at 75% compliance
2. Verify indicator not visible
3. Confirm one more item (crosses 80%)
4. Verify indicator now visible
5. Click "Lock Plan", verify freeze flow starts

## Next Ticket Preview

This completes Epic 5. Epic 6 begins with Ticket 6.1: Frozen Rate Metric.

---

# EPIC 6: METRIC INSTRUMENTATION

---

# TICKET 6.1: Frozen Rate Metric

## Context

**What is Gather?**
Primary success metric: % of events that reach FROZEN with >=80% compliance within 7 days.

**What exists now?**
- Event model with status
- frozenAt, complianceAtFreeze from Ticket 4.2

**What previous tickets built?**
- Ticket 4.2: frozenAt and complianceAtFreeze on Event

**What this ticket builds?**
Metric calculation and storage for Frozen Rate.

**What comes next?**
Ticket 6.2 adds Repeat Host Rate.

## File Locations

\`\`\`
prisma/schema.prisma              — Models
src/lib/workflow.ts               — State transitions
\`\`\`

## What To Build

- [ ] Add fields to Event if not present:
\`\`\`prisma
confirmingAt    DateTime?
\`\`\`
- [ ] Record confirmingAt when transitioning DRAFT → CONFIRMING
- [ ] Create metrics query function:
\`\`\`typescript
interface FrozenRateMetrics {
  totalEventsEligible: number;
  qualityFreezes: number;
  frozenRate: number;
  averageTimeToFreeze: number;
  averageComplianceAtFreeze: number;
}
\`\`\`
- [ ] Quality freeze: Frozen with >=80% within 7 days
- [ ] Create API endpoint: GET /api/metrics/frozen-rate (admin only)

## Do Not Touch

- Do not build admin UI yet

## Done When

- [ ] npx prisma migrate dev succeeds
- [ ] npm run typecheck passes
- [ ] npm run build passes
- [ ] confirmingAt recorded on transition
- [ ] Metrics query returns accurate data

## Verification Steps

1. Create events with various outcomes
2. Call metrics endpoint
3. Verify calculations correct

## Next Ticket Preview

Ticket 6.2 will add Repeat Host Rate metric.

---

# TICKET 6.2: Repeat Host Rate Metric

## Context

**What is Gather?**
Repeat Host Rate measures retention: hosts who run 2+ events.

**What exists now?**
- Event model
- Frozen Rate metrics from Ticket 6.1

**What previous tickets built?**
- Ticket 6.1: Frozen Rate infrastructure

**What this ticket builds?**
Repeat Host Rate metric calculation.

**What comes next?**
Ticket 6.3 adds reachability breakdown logging.

## File Locations

\`\`\`
prisma/schema.prisma              — Models
src/app/api/events/route.ts       — Event creation
\`\`\`

## What To Build

- [ ] Ensure host identity tracked on Event:
\`\`\`prisma
hostEmail    String?
hostPersonId String?
\`\`\`
- [ ] Record host identity on event creation
- [ ] Create metrics query:
\`\`\`typescript
interface RepeatHostMetrics {
  totalHosts: number;
  repeatHosts: number;
  repeatHostRate: number;
  averageEventsPerHost: number;
}
\`\`\`
- [ ] Create API endpoint: GET /api/metrics/repeat-host (admin only)

## Do Not Touch

- Do not build admin UI

## Done When

- [ ] npx prisma migrate dev succeeds
- [ ] npm run typecheck passes
- [ ] npm run build passes
- [ ] Host identity recorded
- [ ] Metrics query returns accurate data

## Verification Steps

1. Create 3 events with same host email
2. Create 2 events with different host
3. Call metrics endpoint
4. Verify: totalHosts = 2, repeatHosts = 1

## Next Ticket Preview

Ticket 6.3 will add reachability breakdown logging.

---

# TICKET 6.3: Reachability Breakdown Logging

## Context

**What is Gather?**
Understanding how reachability tiers affect outcomes helps improve the product.

**What exists now?**
- ReachabilityTier on PersonEvent
- Frozen Rate and Repeat Host metrics

**What previous tickets built?**
- Epic 1: Reachability tracking
- Tickets 6.1-6.2: Core metrics

**What this ticket builds?**
Snapshot reachability breakdown at key state transitions for correlation analysis.

**What comes next?**
Fast-follow tickets. This completes Epic 6 and the main build.

## File Locations

\`\`\`
prisma/schema.prisma
src/lib/workflow.ts
src/app/api/events/[id]/transition/route.ts
\`\`\`

## What To Build

- [ ] Add EventMetricsSnapshot model:
\`\`\`prisma
model EventMetricsSnapshot {
  id              String   @id @default(cuid())
  eventId         String
  capturedAt      DateTime @default(now())
  trigger         String
  
  tierDirectCount     Int
  tierProxyCount      Int
  tierSharedCount     Int
  tierUntrackableCount Int
  
  totalItems          Int
  assignedItems       Int
  confirmedItems      Int
  
  rsvpYes             Int
  rsvpNo              Int
  rsvpNotSure         Int
  rsvpPending         Int
  
  event           Event @relation(fields: [eventId], references: [id], onDelete: Cascade)
}
\`\`\`
- [ ] Capture snapshot on CONFIRMING and FROZEN transitions
- [ ] Create correlation API endpoint

## Do Not Touch

- Do not modify reachability calculation
- Do not add real-time dashboard

## Done When

- [ ] npx prisma migrate dev succeeds
- [ ] npm run typecheck passes
- [ ] npm run build passes
- [ ] Snapshots captured at transitions
- [ ] Correlation query works

## Verification Steps

1. Transition event to CONFIRMING
2. Verify snapshot created
3. Transition to FROZEN
4. Verify second snapshot
5. Call correlation endpoint

## Next Ticket Preview

This completes the main build (18 tickets). Fast-follow tickets are optional.

---

# FAST-FOLLOW TICKETS (Post-MVP)

---

# TICKET FF.1: AI Menu Generation Schema

## Context
AI generates items but output format isn't strictly defined.

## What To Build
- Lock AI output schema in src/lib/ai/prompts.ts
- Define: Teams, Items with all required fields
- Serving assumptions: people_count → quantity

## Done When
- AI output matches schema consistently

---

# TICKET FF.2: Item Clarity Fields

## Context
Unclear items cause non-response.

## What To Build
- Required item fields: What, How much, By when, Where
- Participant confirmation shows all 4 fields

## Done When
- Items have clarity fields
- Participant view shows full context

---

# TICKET FF.3: Post-Freeze Retention Loop

## Context
After event date passes, Gather goes silent.

## What To Build
- Auto-transition to COMPLETE after event date
- Prompt: "Start another event"
- Future: "Save as template"

## Done When
- Events auto-complete
- Host sees re-engagement prompt

---

# END OF TICKETS

Total: 18 main tickets + 3 fast-follow
Estimated scope: 2-4 weeks depending on velocity

Critical path: Epic 3 (Nudge Infrastructure) is the long pole
Parallel work: Epics 1, 2, 4, 5 can proceed independently
