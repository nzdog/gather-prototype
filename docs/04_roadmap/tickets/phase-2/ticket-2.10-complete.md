❯ Read the following documentation to understand the codebase and current state:              
                                                                                              
  1. /Users/Nigel/Desktop/gather-prototype/ONBOARDING_REPORT.md — original codebase overview  
  2. /Users/Nigel/Desktop/gather-prototype/docs/PHASE1_COMPLETE.md — Phase 1 auth system      
  (complete)                                                                                  
  3. /Users/Nigel/Desktop/gather-prototype/docs/TICKET_2.9_COMPLETE.md — Cancellation         
  handling (complete)                                                                         
  4. /Users/Nigel/Desktop/gather-prototype/docs/gather-phase2-tickets.docx — Phase 2 ticket   
  specifications                                                                              
  5. /Users/Nigel/Desktop/gather-prototype/prisma/schema.prisma — current database schema     
  6. /Users/Nigel/Desktop/gather-prototype/src/lib/entitlements.ts — entitlement functions    
                                                                                              
  Also check:                                                                                 
  - git status — to see current state                                                         
  - Check how isLegacy field is already used in entitlements.ts                               
                                                                                              
  Context:                                                                                    
  - Phase 1 (magic link auth): Complete                                                       
  - Tickets 2.1–2.6, 2.9: Complete                                                            
  - Event.isLegacy field already exists (added in 2.5)                                        
  - Entitlements already check isLegacy for edit permissions                                  
  - Now implementing: Ticket 2.10 (Legacy Event Grandfathering)                               
                                                                                              
  Implement Ticket 2.10:                                                                      
                                                                                              
  1. Create migration script: scripts/mark-legacy-events.ts                                   
  - Marks ALL existing events as isLegacy: true                                               
  - This runs once at monetisation launch                                                     
  - Logs count of events marked                                                               
                                                                                              
  2. Verify entitlement logic handles legacy correctly:                                       
  - Legacy events excluded from free tier event count (check canCreateEvent)                  
  - Legacy events remain editable regardless of billing status (check canEditEvent)           
  - New events after migration get isLegacy: false (already done in 2.6)                      
                                                                                              
  3. Create verification script: scripts/verify-ticket-2.10.ts                                
  - Test that legacy events don't count against free limit                                    
  - Test that legacy events are editable even when CANCELED                                   
  - Test that new events are NOT legacy                                                       
                                                                                              
  The isLegacy field and logic may already be partially implemented. Check existing code      
  first and only add what's missing. Focus on the migration script and verification.          
                                                                                              
  Do not duplicate work — check existing files first.   
  Summary

  ✅ Created Files

  1. scripts/mark-legacy-events.ts
    - Migration script to mark all existing events as isLegacy: true
    - Run once at monetisation launch
    - Logs count of events marked
  2. scripts/verify-ticket-2.10.ts
    - Comprehensive verification with 17 checks
    - Validates schema, migration, entitlements, and business logic
    - Result: 17/17 checks passed (100%)
  3. docs/TICKET_2.10_COMPLETE.md
    - Complete documentation of the implementation

  ✅ Verified Existing Logic

  The entitlement logic was already correctly implemented in Ticket 2.5:

  - canCreateEvent() - Excludes legacy events from free tier count (line 67)
  - canEditEvent() - Legacy events always editable, bypassing billing checks (lines 116-119)
  - getRemainingEvents() - Excludes legacy events from remaining count (lines 228-240)

  Key Features

  Legacy Events (isLegacy: true):
  - Don't count against free tier limits
  - Always editable regardless of billing status (FREE, CANCELED, PAST_DUE)
  - Bypass all billing restrictions

  New Events (isLegacy: false):
  - Count toward free tier limit
  - Subject to normal billing restrictions

  Next Steps

  At monetisation launch, run:
  npx tsx scripts/mark-legacy-events.ts

  This will grandfather all existing events, ensuring a smooth transition for existing users.