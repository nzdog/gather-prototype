Ticket 8: Add Input Validation to Team Routes
Priority: 🟠 Warning
File: src/app/api/events/[id]/teams/route.ts
Issue: Missing input validation for name, scope, domain, coordinatorId parameters.
Task:

Open src/app/api/events/[id]/teams/route.ts
Find the POST/PUT handlers
Add input validation:

typescript   const body = await request.json();
   const { name, scope, domain, coordinatorId } = body;
   
   // Validate name
   if (!name || typeof name !== 'string' || name.trim().length === 0) {
     return NextResponse.json({ error: 'Name is required' }, { status: 400 });
   }
   
   if (name.length > 100) {
     return NextResponse.json({ error: 'Name too long' }, { status: 400 });
   }
   
   // Validate scope if provided
   const validScopes = ['MEAL', 'ACTIVITY', 'LOGISTICS']; // adjust to actual values
   if (scope && !validScopes.includes(scope)) {
     return NextResponse.json({ error: 'Invalid scope' }, { status: 400 });
   }
   
   // Validate coordinatorId if provided
   if (coordinatorId && typeof coordinatorId !== 'string') {
     return NextResponse.json({ error: 'Invalid coordinator ID' }, { status: 400 });
   }

Verify fix:

bash   npm run typecheck

Commit:

bash   git add src/app/api/events/[id]/teams/route.ts
   git commit -m "security: add input validation to team routes"
   git push
Acceptance criteria:

All inputs validated before database operations
Appropriate error messages for invalid input
Typecheck passes

Start now.


⏺ ✅ Ticket 8 Complete: Input Validation Added to Team Routes                                     
                                                                                                  
  Security Issue Identified:                                                                      
  The POST handler at src/app/api/events/[id]/teams/route.ts:71 had minimal input validation -    
  only checking if fields existed (line 83), allowing invalid data types, excessively long        
  strings, and invalid domain values to be passed to the database.                                
                                                                                                  
  Fixes Applied:                                                                                  
                                                                                                  
  1. Name Validation (Lines 83-90):                                                               
                                                                                                  
  // SECURITY: Validate name                                                                      
  if (!name || typeof name !== 'string' || name.trim().length === 0) {                            
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });                     
  }                                                                                               
                                                                                                  
  if (name.length > 100) {                                                                        
    return NextResponse.json({ error: 'Name too long (max 100 characters)' }, { status: 400 });   
  }                                                                                               
  Protection:                                                                                     
  - Ensures name is provided and is a string                                                      
  - Prevents empty/whitespace-only names                                                          
  - Limits length to prevent database overflow and DoS attacks                                    
                                                                                                  
  2. Scope Validation (Lines 92-100):                                                             
                                                                                                  
  // SECURITY: Validate scope (optional)                                                          
  if (scope !== undefined && scope !== null) {                                                    
    if (typeof scope !== 'string') {                                                              
      return NextResponse.json({ error: 'Scope must be a string' }, { status: 400 });             
    }                                                                                             
    if (scope.length > 50) {                                                                      
      return NextResponse.json({ error: 'Scope too long (max 50 characters)' }, { status: 400 }); 
    }                                                                                             
  }                                                                                               
  Protection:                                                                                     
  - Optional field validation (allows null/undefined)                                             
  - Type checking prevents non-string values                                                      
  - Length limit prevents excessive data                                                          
                                                                                                  
  3. Domain Validation (Lines 102-117):                                                           
                                                                                                  
  // SECURITY: Validate domain (optional, must be valid enum value)                               
  const validDomains = [                                                                          
    'PROTEINS', 'VEGETARIAN_MAINS', 'SIDES', 'SALADS', 'STARTERS',                                
    'DESSERTS', 'DRINKS', 'LATER_FOOD', 'SETUP', 'CLEANUP',                                       
  ];                                                                                              
  if (domain !== undefined && domain !== null && !validDomains.includes(domain)) {                
    return NextResponse.json({ error: 'Invalid domain value' }, { status: 400 });                 
  }                                                                                               
  Protection:                                                                                     
  - Validates against Prisma Domain enum values                                                   
  - Prevents injection of invalid domain values                                                   
  - Maintains data integrity with database schema                                                 
                                                                                                  
  4. CoordinatorId Validation (Lines 119-122):                                                    
                                                                                                  
  // SECURITY: Validate coordinatorId                                                             
  if (!coordinatorId || typeof coordinatorId !== 'string' || coordinatorId.trim().length === 0) { 
    return NextResponse.json({ error: 'Coordinator ID is required' }, { status: 400 });           
  }                                                                                               
  Protection:                                                                                     
  - Ensures required field is provided                                                            
  - Type checking prevents non-string values                                                      
  - Prevents empty/whitespace-only IDs                                                            
                                                                                                  
  5. Input Sanitization (Lines 136-142):                                                          
                                                                                                  
  // Create team with sanitized inputs                                                            
  const team = await prisma.team.create({                                                         
    data: {                                                                                       
      name: name.trim(),                                                                          
      scope: scope?.trim() || null,                                                               
      domain: domain || null,                                                                     
      domainConfidence: domain ? 'HIGH' : 'MEDIUM',                                               
      source: 'MANUAL',                                                                           
      eventId,                                                                                    
      coordinatorId: coordinatorId.trim(),                                                        
    },                                                                                            
  Protection:                                                                                     
  - Trims whitespace from string inputs before database insertion                                 
  - Prevents leading/trailing whitespace issues                                                   
  - Normalizes data for consistency                                                               
                                                                                                  
  Before:                                                                                         
  const { name, scope, domain, coordinatorId } = body;                                            
                                                                                                  
  if (!name || !scope || !coordinatorId) {                                                        
    return NextResponse.json({ error: '...' }, { status: 400 });                                  
  }                                                                                               
                                                                                                  
  // Directly used in database:                                                                   
  const team = await prisma.team.create({ data: { name, scope, ... } });                          
                                                                                                  
  After:                                                                                          
  // Comprehensive validation before any database operations                                      
  // Type checking, length limits, enum validation, required field checks                         
  // Sanitization with trim() before database insertion                                           
                                                                                                  
  Attack Scenarios Prevented:                                                                     
  1. Type confusion: { name: 123, scope: [], coordinatorId: {} } → Rejected                       
  2. Long strings: { name: 'A'.repeat(10000) } → Rejected (max 100)                               
  3. Invalid enums: { domain: 'MALICIOUS_VALUE' } → Rejected                                      
  4. Empty values: { name: '   ', coordinatorId: '' } → Rejected                                  
  5. Whitespace injection: { name: '  Team  ' } → Trimmed to 'Team'                               
                                                                                                  
  Verification:                                                                                   
  - ✅ All inputs validated before database operations                                            
  - ✅ Type checking for all parameters                                                           
  - ✅ Length limits enforced (name: 100, scope: 50)                                              
  - ✅ Domain enum validation against Prisma schema                                               
  - ✅ Required fields enforced                                                                   
  - ✅ Input sanitization with trim()                                                             
  - ✅ Appropriate error messages for invalid input                                               
  - ✅ Typecheck passes                                                                           
  - ✅ Committed: fc162d0                                                                         
  - ✅ Pushed to wip/post-push-cleanup-2026-01-22                                                 
                                                                                                  
  The team creation endpoint now validates all inputs comprehensively, preventing malformed data  
  from reaching the database and protecting against various injection and data integrity attacks. 
                                                       