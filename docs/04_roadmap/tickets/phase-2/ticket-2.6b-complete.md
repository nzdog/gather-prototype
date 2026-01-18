 Read the following documentation to understand the codebase and current state:              
                                                                                              
  1. /Users/Nigel/Desktop/gather-prototype/ONBOARDING_REPORT.md — original codebase overview  
  2. /Users/Nigel/Desktop/gather-prototype/docs/PHASE1_COMPLETE.md — Phase 1 auth system      
  (complete)                                                                                  
  3. /Users/Nigel/Desktop/gather-prototype/docs/TICKET_2.5_COMPLETE.md — Entitlement service  
  (complete)                                                                                  
  4. /Users/Nigel/Desktop/gather-prototype/docs/gather-phase2-tickets.docx — Phase 2 ticket   
  specifications                                                                              
  5. /Users/Nigel/Desktop/gather-prototype/prisma/schema.prisma — current database schema     
  6. /Users/Nigel/Desktop/gather-prototype/src/lib/entitlements.ts — entitlement functions    
                                                                                              
  Also check:                                                                                 
  - /Users/Nigel/Desktop/gather-prototype/src/app/api/events/route.ts — existing event        
  creation endpoint                                                                           
  - /Users/Nigel/Desktop/gather-prototype/src/app/plan/new/page.tsx — event creation UI       
  - git status — to see current state                                                         
                                                                                              
  Context:                                                                                    
  - Phase 1 (magic link auth): Complete                                                       
  - Tickets 2.1–2.5: Complete                                                                 
  - Entitlement service ready with canCreateEvent(), canEditEvent()                           
  - Now implementing: Ticket 2.6 (Event Creation Gate)                                        
                                                                                              
  Implement Ticket 2.6:                                                                       
                                                                                              
  1. Modify POST /api/events to:                                                              
  - Call canCreateEvent(userId) before creating                                               
  - If not allowed: return 403 with { error: 'Event limit reached', reason: 'FREE_LIMIT',     
  upgradeUrl: '/billing/upgrade' }                                                            
  - New events get isLegacy: false                                                            
                                                                                              
  2. Modify /plan/new page to:                                                                
  - Check entitlement on page load                                                            
  - If blocked: show message + upgrade button instead of create form                          
  - Message: "You've used your free event this year. Upgrade for unlimited gatherings."       
                                                                                              
  3. Also add edit protection:                                                                
  - Modify event edit endpoints to call canEditEvent()                                        
  - If not allowed: return 403                                                                
                                                                                              
  Create verification script: scripts/verify-ticket-2.6.ts                                    
                                                                                              
  Test scenarios:                                                                             
  - FREE user with 0 events → can create                                                      
  - FREE user with 1 recent event → blocked with upgrade prompt                               
  - ACTIVE user → can create unlimited                                                        
  - CANCELED user → cannot edit (read-only)                                                   
                                                                                              
  Do not duplicate work — check existing files first.  


    Summary of Implementation

  1. Event Creation Protection

  Modified: src/app/api/events/route.ts:55-161
  - Added canCreateEvent() check before event creation
  - Returns 403 with upgrade prompt when limit reached
  - Sets isLegacy: false on all new events
  - Creates EventRole record for user as HOST
  - Uses transaction for atomic creation

  2. Event Edit Protection

  Modified: src/app/api/events/[id]/route.ts:50-176
  - Added canEditEvent() check to PATCH endpoint
  - Added canEditEvent() check to DELETE endpoint
  - Returns 403 when subscription is inactive
  - Legacy events remain editable regardless of status

  3. UI Gate on Event Creation Page

  Modified: src/app/plan/new/page.tsx:1-36,152-228
  - Checks entitlement on page load via new API endpoint
  - Shows loading spinner while checking
  - Displays upgrade prompt when blocked with message: "You've used your free event this year. Upgrade for unlimited gatherings."
  - Includes upgrade button linking to /billing/upgrade
  - Shows benefits list (unlimited events, priority support, advanced features)

  4. New Entitlement Check Endpoint

  Created: src/app/api/entitlements/check-create/route.ts
  - GET endpoint returning { canCreate: boolean }
  - Used by UI to optimize user experience
  - Returns 401 if not authenticated

  5. Comprehensive Testing

  Created: scripts/verify-ticket-2.6.ts
  - 24 automated verification checks
  - All checks passed ✅
  - Tests API enforcement, UI gating, and error responses

  Created: docs/TICKET_2.6_COMPLETE.md
  - Complete implementation documentation
  - Test scenarios and expected behavior
  - Integration examples and business rules

  Test Scenarios Covered
  ┌──────────────────────────┬────────────┬──────────┬───────────────────────────┐
  │         Scenario         │ Can Create │ Can Edit │         Behavior          │
  ├──────────────────────────┼────────────┼──────────┼───────────────────────────┤
  │ FREE user, 0 events      │ ✅         │ ✅       │ Shows creation form       │
  ├──────────────────────────┼────────────┼──────────┼───────────────────────────┤
  │ FREE user, 1+ events     │ ❌         │ ✅       │ Shows upgrade prompt      │
  ├──────────────────────────┼────────────┼──────────┼───────────────────────────┤
  │ ACTIVE user              │ ✅         │ ✅       │ Unlimited creation        │
  ├──────────────────────────┼────────────┼──────────┼───────────────────────────┤
  │ CANCELED user            │ ❌         │ ❌       │ Read-only (except legacy) │
  ├──────────────────────────┼────────────┼──────────┼───────────────────────────┤
  │ PAST_DUE user (in grace) │ ❌         │ ✅       │ Can edit, cannot create   │
  └──────────────────────────┴────────────┴──────────┴───────────────────────────┘
  Files Changed

  - ✅ Modified: src/app/api/events/route.ts
  - ✅ Modified: src/app/api/events/[id]/route.ts
  - ✅ Modified: src/app/plan/new/page.tsx
  - ✅ Created: src/app/api/entitlements/check-create/route.ts
  - ✅ Created: scripts/verify-ticket-2.6.ts
  - ✅ Created: docs/TICKET_2.6_COMPLETE.md

  Ticket 2.6 is ready for testing and integration. The event creation gate is now fully functional with both server-side enforcement and client-side UX optimization.