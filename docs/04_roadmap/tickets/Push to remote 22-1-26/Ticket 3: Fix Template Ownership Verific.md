Ticket 3: Fix Template Ownership Verification - Clone
Priority: 🔴 Critical
File: src/app/api/templates/[id]/clone/route.ts
Issue: No validation that the template being cloned belongs to the authenticated user.
Task:

Open src/app/api/templates/[id]/clone/route.ts
Find where template is fetched (around line 61)
Add ownership verification before cloning:

typescript   const template = await prisma.template.findUnique({
     where: { id: templateId },
     select: { userId: true, /* other fields needed for clone */ }
   });
   
   if (!template) {
     return NextResponse.json({ error: 'Template not found' }, { status: 404 });
   }
   
   if (template.userId !== session.user.id) {
     return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
   }

Also add validation for startDate and endDate parameters if they exist:

typescript   if (startDate && isNaN(Date.parse(startDate))) {
     return NextResponse.json({ error: 'Invalid start date' }, { status: 400 });
   }

Verify fix:

bash   npm run typecheck

Commit:

bash   git add src/app/api/templates/[id]/clone/route.ts
   git commit -m "security: add ownership and date validation to template clone endpoint"
   git push
Acceptance criteria:

Clone only succeeds if user owns the template
Date parameters validated
Typecheck passes

Start now.

⏺ ✅ Ticket 3 Complete: Template Clone Ownership Verification Fixed                               
                                                                                                  
  Security Issues Identified:                                                                     
  1. The template clone endpoint fetched the full template before verifying ownership (line 40-42)
  2. No validation for date parameters - invalid dates could cause crashes (lines 92-93)          
                                                                                                  
  Fixes Applied:                                                                                  
                                                                                                  
  Date Validation (Lines 39-46):                                                                  
                                                                                                  
  // SECURITY: Validate date parameters                                                           
  if (startDate && isNaN(Date.parse(startDate))) {                                                
    return NextResponse.json({ error: 'Invalid start date' }, { status: 400 });                   
  }                                                                                               
                                                                                                  
  if (endDate && isNaN(Date.parse(endDate))) {                                                    
    return NextResponse.json({ error: 'Invalid end date' }, { status: 400 });                     
  }                                                                                               
                                                                                                  
  Ownership Verification (Lines 48-70):                                                           
                                                                                                  
  - Changed to fetch only ownership fields first: select: { hostId: true, templateSource: true }  
  (line 51)                                                                                       
  - Verifies ownership for HOST templates before accessing template data (line 59)                
  - Only fetches full template after authorization passes (line 64-66)                            
  - Returns 404 for missing templates (line 55)                                                   
  - Returns 403 for unauthorized access (line 60)                                                 
                                                                                                  
  Security Flow:                                                                                  
  // Before: Fetched all template data before authorization                                       
  const template = await prisma.structureTemplate.findUnique({ where: { id: params.id } });       
  if (template.templateSource === 'HOST' && template.hostId !== hostId) { ... }                   
                                                                                                  
  // After: Verify ownership first, then fetch full data                                          
  const templateCheck = await prisma.structureTemplate.findUnique({                               
    where: { id: params.id },                                                                     
    select: { hostId: true, templateSource: true }                                                
  });                                                                                             
  // ... ownership verification ...                                                               
  const template = await prisma.structureTemplate.findUnique({ where: { id: params.id } });       
                                                                                                  
  Verification:                                                                                   
  - ✅ Clone only succeeds if user owns the template                                              
  - ✅ Date parameters validated (startDate and endDate)                                          
  - ✅ Returns 404 for missing templates                                                          
  - ✅ Returns 403 for unauthorized access                                                        
  - ✅ Returns 400 for invalid dates                                                              
  - ✅ Typecheck passes                                                                           
  - ✅ Committed: 5b14aea                                                                         
  - ✅ Pushed to wip/post-push-cleanup-2026-01-22                                                 
                                                                                                  
  The endpoint now follows security best practices by verifying authorization and validating input
   before performing any operations.      