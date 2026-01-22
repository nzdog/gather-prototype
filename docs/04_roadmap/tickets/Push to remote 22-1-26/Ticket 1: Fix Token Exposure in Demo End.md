Ticket 1: Fix Token Exposure in Demo Endpoint
Priority: 🔴 Critical
File: src/app/api/demo/tokens/route.ts
Issue: Exposes ALL access tokens from database without filtering - leaks sensitive authentication data across teams/events.
Task:

Open src/app/api/demo/tokens/route.ts
Analyze current implementation - identify what tokens are being returned
Add filtering to only return tokens that belong to:

The authenticated user's events, OR
Mark this endpoint as dev-only and disable in production


If this is a demo/development endpoint:

Add environment check: if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'Not available' }, { status: 404 })


Verify fix:

bash   npm run typecheck

Commit:

bash   git add src/app/api/demo/tokens/route.ts
   git commit -m "security: restrict token exposure in demo endpoint"
   git push
Acceptance criteria:

Tokens are not exposed to unauthorized users
Endpoint either filtered by ownership OR disabled in production
Typecheck passes

Start now.

⏺ ✅ Ticket 1 Complete: Token Exposure Fixed                                                      
                                                                                                  
  Security Issue Identified:                                                                      
  The /api/demo/tokens endpoint at src/app/api/demo/tokens/route.ts:21 exposed ALL access tokens  
  from the database without any ownership filtering. Any authenticated user could retrieve tokens 
  for all events and teams - a critical data leak.                                                
                                                                                                  
  Fix Applied:                                                                                    
  - Added production environment check that returns 404 in production (line 15-17)                
  - Updated documentation to clearly mark as "DEV ONLY" (line 9-11)                               
  - Added explicit security warning about token exposure (line 11)                                
                                                                                                  
  Code Changes:                                                                                   
  // SECURITY: Disable in production - this endpoint exposes all tokens                           
  if (process.env.NODE_ENV === 'production') {                                                    
    return NextResponse.json({ error: 'Not found' }, { status: 404 });                            
  }                                                                                               
                                                                                                  
  Verification:                                                                                   
  - ✅ Typecheck passes                                                                           
  - ✅ Endpoint disabled in production                                                            
  - ✅ Dev-only warning added to documentation                                                    
  - ✅ Committed: 2b31be2                                                                         
  - ✅ Pushed to wip/post-push-cleanup-2026-01-22                                                 
                                                                                                  
  Acceptance Criteria Met:                                                                        
  - ✅ Tokens not exposed to unauthorized users (disabled in production)                          
  - ✅ Endpoint disabled in production                                                            
  - ✅ Typecheck passes                                                                           
                                                                                                  
  The endpoint is now safe - it will return a 404 error in production environments, preventing any
   token exposure in deployed instances.                                                          
                                                                                                  
✻ Baked for 40s               