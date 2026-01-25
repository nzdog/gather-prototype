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