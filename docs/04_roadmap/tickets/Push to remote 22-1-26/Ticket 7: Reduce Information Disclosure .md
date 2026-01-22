Ticket 7: Reduce Information Disclosure in Auth Errors
Priority: 🟠 Warning
File: src/lib/auth/guards.ts
Issue: Lines 84, 122, 176, 194, 244 - Error responses reveal internal authorization logic.
Task:

Open src/lib/auth/guards.ts
Find all error responses at the listed lines
Replace specific error messages with generic ones:

typescript   // Before (too specific):
   return NextResponse.json({ error: 'User session required but no user found' }, { status: 401 });
   return NextResponse.json({ error: 'Event role HOST required' }, { status: 403 });
   
   // After (generic):
   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

Keep detailed logging server-side for debugging:

typescript   console.error('Auth failed: User session required but no user found', { userId, eventId });
   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

Verify fix:

bash   npm run typecheck

Commit:

bash   git add src/lib/auth/guards.ts
   git commit -m "security: reduce information disclosure in auth error responses"
   git push
Acceptance criteria:

Error responses are generic (Unauthorized/Forbidden)
Detailed errors logged server-side
Typecheck passes

Start now.


⏺ ✅ Ticket 7 Complete: Information Disclosure in Auth Errors Fixed                               
                                                                                                  
  Security Issue Identified:                                                                      
  The authentication guards at src/lib/auth/guards.ts exposed internal authorization logic through
   detailed error messages, allowing attackers to enumerate valid roles, token scopes, and        
  application states.                                                                             
                                                                                                  
  Fixes Applied Across All Guard Functions:                                                       
                                                                                                  
  1. requireEventRole (Lines 48-75):                                                              
                                                                                                  
  Before:                                                                                         
  // Line 56: Reveals authentication method                                                       
  { error: 'Unauthorized', message: 'Authentication required' }                                   
  // Line 74: Reveals allowed roles structure                                                     
  { error: 'Forbidden', message: `Requires one of: ${allowedRoles.join(', ')}` }                  
                                                                                                  
  After:                                                                                          
  // Generic client error                                                                         
  { error: 'Unauthorized' }                                                                       
  // Server-side detailed logging                                                                 
  console.error('[Auth] Session auth failed: No authenticated user', { eventId, allowedRoles });  
                                                                                                  
  // Generic client error                                                                         
  { error: 'Forbidden' }                                                                          
  // Server-side detailed logging                                                                 
  console.error('[Auth] Event role check failed: User lacks required role', {                     
    userId: user.id, eventId, allowedRoles                                                        
  });                                                                                             
                                                                                                  
  2. requireTokenScope (Lines 98-119):                                                            
                                                                                                  
  Before:                                                                                         
  // Reveals token validation logic                                                               
  { error: 'Unauthorized', message: 'Invalid or expired token' }                                  
  // Reveals scope information                                                                    
  { error: 'Forbidden', message: `Requires ${requiredScope} scope, got ${context.scope}` }        
                                                                                                  
  After:                                                                                          
  { error: 'Unauthorized' }                                                                       
  console.error('[Auth] Token auth failed: Invalid or expired token', {                           
    tokenPrefix: token.substring(0, 8), requiredScope                                             
  });                                                                                             
                                                                                                  
  { error: 'Forbidden' }                                                                          
  console.error('[Auth] Token scope check failed: Insufficient scope', {                          
    tokenPrefix: token.substring(0, 8), requiredScope, actualScope: context.scope                 
  });                                                                                             
                                                                                                  
  3. requireNotFrozen (Lines 138-155):                                                            
                                                                                                  
  Before:                                                                                         
  // Reveals event state and business logic                                                       
  { error: 'Forbidden', message: 'Cannot modify items when event is FROZEN', status: event.status 
  }                                                                                               
  { error: 'Forbidden', message: 'Cannot modify completed event', status: event.status }          
                                                                                                  
  After:                                                                                          
  { error: 'Forbidden' }                                                                          
  console.error('[Auth] Mutation blocked: Event is FROZEN', {                                     
    eventId: event.id, eventStatus: event.status, allowOverride                                   
  });                                                                                             
                                                                                                  
  { error: 'Forbidden' }                                                                          
  console.error('[Auth] Mutation blocked: Event is COMPLETE', {                                   
    eventId: event.id, eventStatus: event.status                                                  
  });                                                                                             
                                                                                                  
  4. requireTeamAccess (Lines 166-177):                                                           
                                                                                                  
  Before:                                                                                         
  // Reveals coordinator authorization logic                                                      
  { error: 'Forbidden', message: 'Coordinator can only access own team' }                         
                                                                                                  
  After:                                                                                          
  { error: 'Forbidden' }                                                                          
  console.error('[Auth] Team access denied: Coordinator accessing wrong team', {                  
    scope: context.scope, coordinatorTeamId: context.team?.id, requestedTeamId: teamId            
  });                                                                                             
                                                                                                  
  5. requireSameTeam (Lines 188-196):                                                             
                                                                                                  
  Before:                                                                                         
  // Reveals business rule about team assignments                                                 
  { error: 'Bad Request', message: 'Person must be in same team as item' }                        
                                                                                                  
  After:                                                                                          
  { error: 'Bad Request' }                                                                        
  console.error('[Auth] Team assignment validation failed: Person and item in different teams', { 
    personTeamId, itemTeamId                                                                      
  });                                                                                             
                                                                                                  
  6. requireEventRoleOrToken (Lines 240-247):                                                     
                                                                                                  
  Before:                                                                                         
  // Reveals multi-auth logic                                                                     
  { error: 'Unauthorized', message: 'Authentication required' }                                   
                                                                                                  
  After:                                                                                          
  { error: 'Unauthorized' }                                                                       
  console.error('[Auth] Multi-auth failed: Both session and token auth failed', {                 
    eventId, allowedEventRoles, tokenProvided: !!token, allowedTokenScope                         
  });                                                                                             
                                                                                                  
  Security Improvements:                                                                          
  1. Generic client errors: All errors now return simple "Unauthorized", "Forbidden", or "Bad     
  Request"                                                                                        
  2. Detailed server logs: All failures logged with context for debugging                         
  3. Information hiding: Attackers cannot enumerate:                                              
    - Valid role types                                                                            
    - Token scope values                                                                          
    - Event status values                                                                         
    - Authorization logic                                                                         
    - Business rules                                                                              
  4. Consistent format: All logs prefixed with [Auth] for easy filtering                          
                                                                                                  
  Verification:                                                                                   
  - ✅ Error responses are generic (Unauthorized/Forbidden/Bad Request)                           
  - ✅ Detailed errors logged server-side for debugging                                           
  - ✅ Token prefixes logged (first 8 chars) instead of full tokens                               
  - ✅ All authentication failures traceable in server logs                                       
  - ✅ Typecheck passes                                                                           
  - ✅ Committed: 419c230                                                                         
  - ✅ Pushed to wip/post-push-cleanup-2026-01-22                                                 
                                                                                                  
  The authentication system now provides minimal information to potential attackers while         
  maintaining full debugging capability through server-side logs. 