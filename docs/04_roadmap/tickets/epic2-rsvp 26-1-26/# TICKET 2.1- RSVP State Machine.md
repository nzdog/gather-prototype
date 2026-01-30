```markdown
Before starting work on this ticket:

1. Make sure you're on master branch and it's up to date
2. Create a new branch: `git checkout -b epic2-ticket2.1-rsvp-state-machine`
3. Confirm you're on the new branch before making any changes

Previous tickets completed:
- Epic 1 (Reachability): Tickets 1.1-1.5
  - ReachabilityTier enum (DIRECT, PROXY, SHARED, UNTRACKABLE)
  - Household and HouseholdMember models
  - Shared link claim flow
  - Dashboard reachability bar
  - Proxy nudge logic

These changes are already merged to master.

---

# EPIC 2: RSVP LAYER

---

# TICKET 2.1: RSVP State Machine

## Context

Gather tracks item assignment responses (PENDING/ACCEPTED/DECLINED), but RSVP (attendance) is a separate question: "Are you coming?" vs "Can you bring the salad?"

**Depends on:** Epic 1 complete (PersonEvent model exists with reachability fields)

## File Locations

```
prisma/schema.prisma                              — Add RsvpStatus enum, extend PersonEvent
src/app/p/[token]/page.tsx                        — Add RSVP UI before items
src/app/api/p/[token]/route.ts                    — Add PATCH handler for RSVP
src/app/api/events/[id]/invite-status/route.ts   — Add RSVP breakdown to response
```

## Build Spec

### 1. Schema (`prisma/schema.prisma`)

```prisma
enum RsvpStatus {
  PENDING
  YES
  NO
  NOT_SURE
}
```

Add to PersonEvent:
```prisma
rsvpStatus      RsvpStatus @default(PENDING)
rsvpRespondedAt DateTime?
```

`rsvpRespondedAt` updates on every RSVP change — tracks most recent response, not first response. Host cares about "when did I last hear from them?" not "when did they first click something?"

### 2. Participant View (`src/app/p/[token]/page.tsx`)

| RSVP State | Display |
|------------|---------|
| PENDING | RSVP question: "Are you coming?" with Yes / No / Not sure buttons. No items visible. |
| YES | Items visible |
| NO | "Thanks for letting us know" — no items |
| NOT_SURE | Items visible (Ticket 2.2 adds forced conversion) |

State changes are immediate — if user changes from YES to NO, items disappear. If user changes from NO to YES, items reappear.

### 3. Participant API (`src/app/api/p/[token]/route.ts`)

Add PATCH handler:

```typescript
PATCH /api/p/[token]
Body: { rsvpStatus: 'YES' | 'NO' | 'NOT_SURE' }
Response: { success: true, rsvpStatus, rsvpRespondedAt }
```

On every RSVP update:
- Set `rsvpStatus` to provided value
- Set `rsvpRespondedAt` to `now()`

### 4. Invite Status API (`src/app/api/events/[id]/invite-status/route.ts`)

Add to response:
```typescript
rsvp: {
  pending: number
  yes: number
  no: number
  notSure: number
}
```

### 5. Error Handling

| Condition | Response |
|-----------|----------|
| Invalid token | 404 `{ error: 'Not found' }` |
| Invalid rsvpStatus value | 400 `{ error: 'Invalid RSVP status. Must be YES, NO, or NOT_SURE' }` |
| Token valid but PersonEvent not found | 404 `{ error: 'Not found' }` |

## Do Not Touch

- Assignment model or item response flow
- Forced conversion logic (Ticket 2.2)
- Nudge infrastructure

## Done When

- [ ] `npx prisma migrate dev` succeeds
- [ ] `npm run typecheck` passes
- [ ] `npm run build` passes
- [ ] RSVP question appears before items on participant view
- [ ] RSVP response writes to database with timestamp
- [ ] Changing RSVP updates timestamp (not just first response)
- [ ] RSVP = NO hides item assignments
- [ ] RSVP = YES or NOT_SURE shows item assignments
- [ ] Invite status API returns RSVP breakdown

## Verification Steps

```
1. Get participant token:
   SELECT token FROM "PersonEvent" WHERE "eventId" = '[test-event-id]' LIMIT 1

2. Open /p/[token] in browser

3. Verify RSVP question appears, no items visible

4. Click "Yes"
   - Verify items now visible
   - Check DB: rsvpStatus = 'YES', rsvpRespondedAt is set
   - Note the timestamp

5. Click "No" (change mind)
   - Verify items disappear, "Thanks for letting us know" shown
   - Check DB: rsvpStatus = 'NO', rsvpRespondedAt updated (newer than step 4)

6. Click "Yes" (change mind again)
   - Verify items reappear
   - Check DB: rsvpStatus = 'YES', rsvpRespondedAt updated again

7. Test "Not sure" flow:
   - Reset: UPDATE "PersonEvent" SET "rsvpStatus" = 'PENDING', "rsvpRespondedAt" = NULL WHERE token = '[token]'
   - Reload page, click "Not sure"
   - Verify items visible (same as YES for now)

8. Check invite status API:
   curl /api/events/[id]/invite-status
   - Verify response includes rsvp breakdown with correct counts
```

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| User changes YES → NO | Items disappear immediately |
| User changes NO → YES | Items reappear immediately |
| User changes NOT_SURE → YES | No visible change (items already showing) |
| User spam-clicks RSVP buttons | Each click updates `rsvpRespondedAt` — this is fine |

---

After completing all work and verification:

1. Create `TICKET_2.1_IMPLEMENTATION.md` in the project root documenting:
   - All files created or modified
   - Summary of changes made
   - Build status (typecheck, build results)
   - Verification results
   - Any implementation decisions or notes

2. Stage and commit all changes:
```bash
git add .
git commit -m "Ticket 2.1: RSVP state machine with participant view integration"
```

3. Show me the final git status and confirm the branch is ready to merge to master.
```


  Implementation Complete ✅                                                    
                                                                                
  Modified Files:                                                               
                                                                                
  1. prisma/schema.prisma - Added RsvpStatus enum and fields to PersonEvent     
  2. prisma/migrations/20260130072549_add_rsvp_state_machine/ - Database        
  migration                                                                     
  3. src/app/p/[token]/page.tsx - Participant view with RSVP UI                 
  4. src/app/api/p/[token]/route.ts - Added PATCH handler for RSVP updates      
  5. src/app/api/events/[id]/invite-status/route.ts - Added RSVP breakdown      
                                                                                
  New File:                                                                     
                                                                                
  6. TICKET_2.1_IMPLEMENTATION.md - Complete documentation                      
                                                                                
  Build Status:                                                                 
                                                                                
  - ✅ npx prisma migrate dev - Migration successful                            
  - ✅ npm run typecheck - PASSED                                               
  - ✅ npm run build - PASSED                                                   
                                                                                
  Key Features Implemented:                                                     
                                                                                
  - RSVP question appears before item assignments                               
  - Three options: Yes / No / Not sure                                          
  - Items visible when RSVP = YES or NOT_SURE                                   
  - Items hidden when RSVP = NO                                                 
  - Timestamp updates on every RSVP change                                      
  - RSVP breakdown in invite status API                                         
                                                                                
  The branch epic2-ticket2.1-rsvp-state-machine is ready. Would you like me to  
  stage and commit these changes? I'll only commit the files related to this    
  ticket (not the unrelated doc file deletions).    


  Perfect! ✅ Ticket 2.1 has been successfully committed.                       
                                                                                
  Commit Summary                                                                
                                                                                
  Branch: epic2-ticket2.1-rsvp-state-machine                                    
  Commit: d677bd5                                                               
                                                                                
  Committed Changes:                                                            
                                                                                
  - ✅ Schema changes (RsvpStatus enum + PersonEvent fields)                    
  - ✅ Database migration                                                       
  - ✅ Participant view with RSVP UI                                            
  - ✅ PATCH API handler for RSVP updates                                       
  - ✅ Invite status API with RSVP breakdown                                    
  - ✅ Implementation documentation                                             
                                                                                
  Files Committed:                                                              
                                                                                
  6 files changed, 429 insertions(+), 151 deletions(-)                          
  - prisma/schema.prisma                                                        
  - prisma/migrations/20260130072549_add_rsvp_state_machine/                    
  - src/app/api/p/[token]/route.ts                                              
  - src/app/p/[token]/page.tsx                                                  
  - src/app/api/events/[id]/invite-status/route.ts                              
  - TICKET_2.1_IMPLEMENTATION.md                                                
                                                                                
  Verification Status:                                                          
                                                                                
  - ✅ Migration applied successfully                                           
  - ✅ Type checking passed                                                     
  - ✅ Build completed successfully                                             
  - ✅ Prettier formatting applied                                              
                                                                                
  Unrelated Files (not committed):                                              
                                                                                
  The deleted doc files and new untracked docs remain in your working directory 
  but were not included in this commit.                                         
                                                                                
  The branch is ready to merge to master when you're ready! 🎉      