
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




  ✅ Implementation Complete                                                                             
                                                                                                         
  Files Created:                                                                                         
                                                                                                         
  1. src/app/api/events/[id]/frozen-edit/route.ts - API endpoint for surgical edits                      
  2. src/components/plan/FrozenEditModal.tsx - Modal UI for frozen edits                                 
  3. docs/04_roadmap/tickets/epic4-freeze 31-1-26/TICKET_4.3_IMPLEMENTATION.md - Implementation          
  documentation                                                                                          
  4. docs/04_roadmap/tickets/epic4-freeze 31-1-26/TICKET_4.3_SPEC.md - Ticket specification              
                                                                                                         
  Files Modified:                                                                                        
                                                                                                         
  1. src/app/h/[token]/team/[teamId]/page.tsx - Added edit button and modal integration                  
  2. src/app/api/h/[token]/team/[teamId]/route.ts - Added people list to API response                    
                                                                                                         
  Features Implemented:                                                                                  
                                                                                                         
  - ✅ Three surgical edit actions: reassign, toggle_critical, edit_item                                 
  - ✅ HOST-only authorization with fail-closed security                                                 
  - ✅ Required reason field for all edits                                                               
  - ✅ Full audit trail via InviteEvent logging                                                          
  - ✅ Notification queuing for affected participants                                                    
  - ✅ Transaction-safe database operations                                                              
  - ✅ TypeScript type checking passes                                                                   
  - ✅ Production build succeeds                                                                         
                                                                                                         
  Build Status:                                                                                          
                                                                                                         
  - ✅ npm run typecheck - PASSED                                                                        
  - ✅ npm run build - PASSED (36 static pages generated)                                                
                                                                                                         
  The branch epic4-ticket4.3-surgical-edit-frozen is ready. All changes are staged and ready for commit. 
  Would you like me to commit these changes now? According to your instructions, I should ask before     
  committing to git.   


  Summary of what was completed:                                                                         
                                                                                                         
  ✅ Ticket 4.3: Surgical Edit While Frozen - Fully implemented and tested                               
  - API endpoint for frozen edits with audit logging                                                     
  - Modal UI with three action types (reassign, toggle critical, edit item)                              
  - All changes require reasons and are logged to audit trail                                            
  - Full manual testing completed successfully                                                           
                                                                                                         
  ✅ Bug fixes:                                                                                          
  - Fixed checkbox state reset on auto-refresh (useEffect dependency)                                    
  - Fixed critical badge to show for all critical items (not just unassigned)                            
                                                                                                         
  ✅ Testing verified:                                                                                   
  - All three surgical edit actions working                                                              
  - Audit trail logging correctly                                                                        
  - Changes persisting to database                                                                       
                                                                                                         
  The feature is ready for production use!                                                               
                                                     