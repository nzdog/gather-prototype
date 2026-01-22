Ticket 2: Fix Template Ownership Verification - DELETE
Priority: 🔴 Critical
File: src/app/api/templates/[id]/route.ts
Issue: DELETE endpoint doesn't verify template ownership before deletion - authorization bypass.
Task:

Open src/app/api/templates/[id]/route.ts
Find the DELETE handler
Before deletion, verify the template belongs to the authenticated user:

typescript   const template = await prisma.template.findUnique({
     where: { id: templateId },
     select: { userId: true }
   });
   
   if (!template) {
     return NextResponse.json({ error: 'Template not found' }, { status: 404 });
   }
   
   if (template.userId !== session.user.id) {
     return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
   }

Apply same pattern to GET handler if missing
Verify fix:

bash   npm run typecheck

Commit:

bash   git add src/app/api/templates/[id]/route.ts
   git commit -m "security: add ownership verification to template DELETE endpoint"
   git push
Acceptance criteria:

DELETE only succeeds if user owns the template
Returns 404 for missing templates
Returns 403 for unauthorized access
Typecheck passes

Start now.

⏺ ✅ Ticket 2 Complete: Template Ownership Verification Fixed                                     
                                                                                                  
  Security Issue Identified:                                                                      
  The template DELETE endpoint at src/app/api/templates/[id]/route.ts fetched the entire template 
  object before verifying ownership. While ownership checks existed, they violated security best  
  practices by accessing data before authorization.                                               
                                                                                                  
  Fixes Applied:                                                                                  
                                                                                                  
  DELETE Handler (Lines 42-74):                                                                   
                                                                                                  
  - Changed to fetch only ownership fields first: select: { hostId: true, templateSource: true }  
  (line 52)                                                                                       
  - Performs authorization check before deletion operation (line 60)                              
  - Returns 404 for missing templates (line 56)                                                   
  - Returns 403 for unauthorized access (line 61)                                                 
  - Prevents deletion of GATHER_CURATED templates (line 65)                                       
                                                                                                  
  GET Handler (Lines 11-39):                                                                      
                                                                                                  
  - Applied same secure pattern: fetches ownership fields first (line 19-22)                      
  - Verifies ownership for HOST templates before fetching full data (line 29-31)                  
  - Only fetches complete template after authorization passes (line 34-36)                        
  - Returns 404 for missing templates (line 25)                                                   
  - Returns 403 for unauthorized access (line 30)                                                 
                                                                                                  
  Security Improvements:                                                                          
  // Before: Fetched all data before authorization                                                
  const template = await prisma.structureTemplate.findUnique({                                    
    where: { id: params.id },                                                                     
  });                                                                                             
                                                                                                  
  // After: Fetch only ownership fields, verify, then proceed                                     
  const template = await prisma.structureTemplate.findUnique({                                    
    where: { id: params.id },                                                                     
    select: { hostId: true, templateSource: true },                                               
  });                                                                                             
  // ... ownership check ...                                                                      
  // Only then proceed with operation                                                             
                                                                                                  
  Verification:                                                                                   
  - ✅ DELETE only succeeds if user owns the template                                             
  - ✅ Returns 404 for missing templates                                                          
  - ✅ Returns 403 for unauthorized access                                                        
  - ✅ Typecheck passes                                                                           
  - ✅ Committed: 36e4e1f                                                                         
  - ✅ Pushed to wip/post-push-cleanup-2026-01-22                                                 
                                                                                                  
  Both GET and DELETE endpoints now follow security best practices by verifying authorization     
  before accessing or modifying template data.          