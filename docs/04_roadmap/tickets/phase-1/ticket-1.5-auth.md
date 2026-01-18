Ticket 1.5 — Session Middleware
Type: Infrastructure
Risk: Medium
Estimated effort: 2 hours
Context
This ticket adds middleware to validate session cookies and expose the current user to API routes and pages. It does NOT enforce auth — that comes later. For now, it just makes user context available.
Acceptance Criteria
Middleware reads session cookie on every request
If valid session: attach user to request context
If expired session: clear cookie, continue as unauthenticated
If no session: continue as unauthenticated
Helper function getUser() available in server components and API routes
No routes are blocked — this is read-only context
Implementation
// src/lib/auth/session.ts
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';

export async function getUser() {
  const sessionToken = cookies().get('session')?.value;
  if (!sessionToken) return null;

  const session = await prisma.session.findUnique({
    where: { token: sessionToken },
    include: { user: true }
  });

  if (!session || session.expiresAt < new Date()) {
    // Clear expired session cookie
    cookies().delete('session');
    return null;
  }

  return session.user;
}
Logout Endpoint
// POST /api/auth/logout
export async function POST() {
  const sessionToken = cookies().get('session')?.value;
  if (sessionToken) {
    await prisma.session.delete({ where: { token: sessionToken } });
    cookies().delete('session');
  }
  return Response.json({ ok: true });
}
Verification
After sign-in, getUser() returns user object
After logout, getUser() returns null
With expired session, getUser() returns null and clears cookie
Existing /h/[token] routes still work (no blocking)


Truncated due to conversation compression


⏺ All tests passed successfully! Ticket 1.5 (Session Middleware) is complete.

  Verified functionality:
  - Session validation correctly finds sessions by token
  - Expired sessions are detected and cookies are cleared
  - Valid sessions return user object
  - Unauthenticated requests return null (not blocked - read-only as specified)
  - Logout endpoint deletes sessions and clears cookies

  Acceptance criteria met:
  - ✓ getUser() helper function works in server components
  - ✓ Expired sessions handled automatically
  - ✓ Logout endpoint functions correctly
  - ✓ No routes are blocked (read-only context)

  The implementation is ready for commit. Would you like me to commit these changes and create a new branch for the next ticket?
