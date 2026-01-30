  Before starting work on this ticket:

1. Make sure you're on master branch and it's up to date
2. Create a new branch: `git checkout -b epic2-ticket2.2-not-sure-forced-conversion`
3. Confirm you're on the new branch before making any changes

Previous tickets completed:
- Epic 1 (Reachability): Tickets 1.1-1.5
- Ticket 2.1: RSVP state machine with YES/NO/NOT_SURE states

These changes are already merged to master.

---

# TICKET 2.2: Not Sure Forced Conversion

## Context

"Not sure" is a valid initial response, but cannot become a permanent silence bucket. After 48h, convert to a binary Yes/No prompt.

**Depends on:** Ticket 2.1 (RsvpStatus enum, participant RSVP flow)

## File Locations
```
prisma/schema.prisma                — Add rsvpFollowupSentAt field
src/lib/sms/nudge-templates.ts      — Add RSVP_FOLLOWUP template
src/lib/sms/nudge-eligibility.ts    — Add NOT_SURE targeting logic
src/lib/sms/nudge-scheduler.ts      — Schedule forced conversion nudge
src/app/p/[token]/page.tsx          — Conditional Yes/No-only UI
```

## Build Spec

### 1. Schema (`prisma/schema.prisma`)

Add to PersonEvent:
```prisma
rsvpFollowupSentAt DateTime?
```

### 2. Template (`src/lib/sms/nudge-templates.ts`)
```typescript
RSVP_FOLLOWUP: {
  key: 'rsvp_followup',
  body: '{{eventName}}: We need a final answer — are you coming? {{participantLink}}'
}
```

### 3. Eligibility (`src/lib/sms/nudge-eligibility.ts`)

Find forced conversion targets where:
- `PersonEvent.rsvpStatus = NOT_SURE`
- `PersonEvent.rsvpRespondedAt < now() - 48h`
- `PersonEvent.rsvpFollowupSentAt IS NULL`
- Person has valid contact method (SMS or EMAIL)

### 4. Scheduler (`src/lib/sms/nudge-scheduler.ts`)

| Trigger | Condition | Action |
|---------|-----------|--------|
| 48h after `rsvpRespondedAt` | `rsvpStatus = NOT_SURE` AND `rsvpFollowupSentAt IS NULL` | Send RSVP_FOLLOWUP, set `rsvpFollowupSentAt = now()` |

One follow-up only — no repeated nudges for this flow.

### 5. Participant View (`src/app/p/[token]/page.tsx`)

| Condition | Display |
|-----------|---------|
| `rsvpStatus = NOT_SURE` AND `rsvpFollowupSentAt IS NOT NULL` | Show only Yes / No buttons (no "Not sure" option) |
| `rsvpStatus = NOT_SURE` AND `rsvpFollowupSentAt IS NULL` | Show Yes / No / Not sure (unchanged from 2.1) |
| `rsvpStatus = PENDING` | Show Yes / No / Not sure (unchanged) |

Add visual context when forcing conversion:
```
"We need to finalize the headcount — please let us know if you're coming."
```

### 6. Error Handling

| Condition | Response |
|-----------|----------|
| Person has no contact method | Skip, log warning |
| SMS send fails | Log error, don't set `rsvpFollowupSentAt` |
| Person already responded YES/NO | Skip (eligibility check handles this) |

## Do Not Touch

- Initial RSVP flow (keep "Not sure" as first-time option)
- Item assignment flow
- Proxy nudge logic (Ticket 1.5)

## Done When

- [ ] `npx prisma migrate dev` succeeds
- [ ] `npm run typecheck` passes
- [ ] `npm run build` passes
- [ ] NOT_SURE RSVPs older than 48h identified by eligibility check
- [ ] Follow-up SMS sent and `rsvpFollowupSentAt` recorded
- [ ] Participant view shows Yes/No only after follow-up sent
- [ ] No second follow-up sent (one-time only)

## Verification Steps
```
1. Create test participant, set RSVP to NOT_SURE:
   UPDATE "PersonEvent" 
   SET "rsvpStatus" = 'NOT_SURE', 
       "rsvpRespondedAt" = now() - interval '49 hours',
       "rsvpFollowupSentAt" = NULL
   WHERE token = '[token]'

2. Run nudge cron:
   curl -X POST /api/cron/nudges

3. Check database:
   SELECT "rsvpFollowupSentAt" FROM "PersonEvent" WHERE token = '[token]'
   Assert: rsvpFollowupSentAt is now set

4. Open /p/[token] in browser
   Assert: Only Yes/No buttons visible, no "Not sure"
   Assert: Conversion message displayed

5. Run nudge cron again:
   curl -X POST /api/cron/nudges

6. Verify no duplicate SMS sent (check logs or SMS provider)

7. Click "Yes" on participant page
   Assert: rsvpStatus = YES, items now visible
```

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| User responds YES/NO before 48h | Never enters forced conversion flow |
| User in NOT_SURE, changes to YES before cron runs | Eligibility check excludes them |
| Follow-up sent, user ignores it | Stays in NOT_SURE with follow-up sent — no further auto-nudges |
| User clicks "Not sure" then immediately gets follow-up | Only possible if cron runs within same minute — acceptable race condition |

---

After completing all work and verification:

1. Create `TICKET_2.2_IMPLEMENTATION.md` in the project root documenting:
   - All files created or modified
   - Summary of changes made
   - Build status (typecheck, build results)
   - Verification results
   - Any implementation decisions or notes

2. Stage and commit all changes:
```bash
git add .
git commit -m "Ticket 2.2: Not Sure forced conversion with 48h follow-up"
```

3. Show me the final git status and confirm the branch is ready to merge to master.



Merge Summary                                                                 
                                                                                
  - Strategy: Merge commit (no fast-forward)                                    
  - Files changed: 11 files, 856 insertions, 7 deletions                        
  - Branch: epic2-ticket2.2-not-sure-forced-conversion deleted                  
                                                                                
  Current Status                                                                
                                                                                
  Branch: master                                                                
  Status: 3 commits ahead of origin/master                                      
  Working tree: Clean                                                           
                                                                                
  Recent Commits                                                                
                                                                                
  e8a11ed Merge branch 'epic2-ticket2.2-not-sure-forced-conversion'             
  a82c06c Add test scripts for Ticket 2.2 verification                          
  8a4d967 Ticket 2.2: Not Sure forced conversion with 48h follow-up             
                                                                                
  What Was Merged                                                               
                                                                                
  ✅ Database migration (rsvpFollowupSentAt field)                              
  ✅ RSVP followup SMS template                                                 
  ✅ Eligibility logic for NOT_SURE > 48h                                       
  ✅ Nudge sender and scheduler integration                                     
  ✅ Participant UI forced conversion (Yes/No only)                             
  ✅ Test scripts for verification                                              
  ✅ Complete implementation documentation                                      
                                                                                
  ---                                                                           
  Ticket 2.2 is now complete and merged to master! 🎉                           
                                                                                
  The feature will automatically send follow-up nudges to participants who      
  selected "Not sure" after 48 hours, presenting them with only Yes/No options  
  to finalize the headcount.    