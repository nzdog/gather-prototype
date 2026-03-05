/**
 * Session isolation middleware (GTC-001)
 *
 * Token-based views (/p/, /h/, /c/) authenticate via URL token, not via the
 * `session` cookie.  Without isolation the `session` cookie (path: '/') is
 * sent on every API request — including participant and coordinator calls —
 * and any auth flow that runs in the same browser session can overwrite the
 * host's planning-dashboard session.
 *
 * This middleware enforces three layers of isolation:
 *
 * 1.  For token-based PAGE routes (/p/, /h/, /c/) it stores the URL token in
 *     a path-scoped cookie (e.g. `gather_p_token` scoped to `/p/`).  That
 *     cookie is completely separate from the global `session` cookie used by
 *     the host planning dashboard, and it expires when the browser closes.
 *
 * 2.  For PARTICIPANT API routes (/api/p/) and COORDINATOR API routes
 *     (/api/c/) the `session` cookie is stripped from the forwarded request.
 *     These handlers authenticate purely via the URL token (resolveToken())
 *     and must never read or shadow the host's session.
 *
 *     NOTE: /api/h/ is intentionally excluded from stripping — the host
 *     token view calls getUser() in production to verify the host is
 *     signed in and needs the session cookie to be present.
 *
 * 3.  The `session` cookie itself is never written or cleared here; it is
 *     only protected on routes that don't need it.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/** Scoped cookie config for token-based page routes */
const TOKEN_PAGE_COOKIES: Record<string, { name: string; path: string }> = {
  '/p/': { name: 'gather_p_token', path: '/p/' },
  '/h/': { name: 'gather_h_token', path: '/h/' },
  '/c/': { name: 'gather_c_token', path: '/c/' },
};

/**
 * Routes where the `session` cookie should be stripped from the forwarded
 * request.  Only participant and coordinator API routes are included;
 * /api/h/ is deliberately omitted (see module comment above).
 */
const SESSION_STRIP_PREFIXES = ['/api/p/', '/api/c/'];

/** Extract the first path segment token from a token-based pathname. */
function extractToken(pathname: string): string | null {
  const match = pathname.match(/^\/[phc]\/([^/]+)/);
  return match ? match[1] : null;
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // ── 1. Token-based PAGE routes (/p/, /h/, /c/) ──────────────────────────
  // Identify which token context we're in and set a path-scoped cookie so
  // the browser has an isolated "session" for that view that cannot collide
  // with the global `session` cookie.
  for (const [prefix, { name, path }] of Object.entries(TOKEN_PAGE_COOKIES)) {
    if (pathname.startsWith(prefix)) {
      const token = extractToken(pathname);
      const response = NextResponse.next();

      if (token) {
        response.cookies.set(name, token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path,
          // Session-only (expires when browser closes): the URL token IS the
          // real auth credential; this cookie is just an isolation marker.
          maxAge: 60 * 60 * 8, // 8 hours
        });
      }

      return response;
    }
  }

  // ── 2. Participant / Coordinator API routes ──────────────────────────────
  // Strip the `session` cookie before forwarding so these handlers cannot
  // accidentally read or overwrite the host's authenticated session.
  if (SESSION_STRIP_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    const existingCookies = request.headers.get('cookie') ?? '';
    const filteredCookies = existingCookies
      .split(';')
      .map((c: string) => c.trim())
      .filter((c: string) => !c.startsWith('session='))
      .join('; ');

    const requestHeaders = new Headers(request.headers);
    if (filteredCookies) {
      requestHeaders.set('cookie', filteredCookies);
    } else {
      requestHeaders.delete('cookie');
    }

    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Token-based page routes — set scoped cookies
    '/p/:path*',
    '/h/:path*',
    '/c/:path*',
    // Participant and coordinator API routes — strip `session` cookie
    // /api/h/ is intentionally excluded; see module comment
    '/api/p/:path*',
    '/api/c/:path*',
  ],
};
