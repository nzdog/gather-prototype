/**
 * [[GTC-369]] — where signing in may send her next. Founder ruling Q4, 2026-10-08: "same-origin
 * path plus the {plan, h} allowlist".
 *
 * WHY THIS EXISTS. The sign-in link's `returnUrl` is written by whoever made the link, and the
 * sign-in page navigates to whatever the server hands back. Next's router treats any address
 * whose origin differs from the page's as an outside navigation and hands it to the browser —
 * including a `javascript:` address, whose origin is "null". A link to Gather's real sign-in page
 * could therefore sign someone in and send them anywhere. So the server decides, here, and
 * anything it does not recognise as one of Gather's own sign-in destinations becomes the events
 * list.
 *
 * WHY A LIST AND NOT "ANY PATH". Sign-in sends people to three places today: the events list,
 * one event (the welcome email, [[GTC-282]]) and the host page after a claim ([[GTC-309]]). A
 * new destination is a deliberate addition to the list, not something a link can invent.
 *
 * WHY THE CHARACTER CHECK COMES BEFORE THE PARSE. The URL parser drops tabs and newlines, so
 * `/<tab>/evil.example` would parse as `//evil.example`, another site. A backslash is read as a
 * slash for the same reason. Both are refused as written, before parsing can reinterpret them.
 *
 * Pure: no imports, so the route and any client code can share it.
 */

const FALLBACK = '/plan/events';
const ALLOWED_FIRST_SEGMENTS = new Set(['plan', 'h']);
const MAX_LENGTH = 2048;
const PROBE_ORIGIN = 'https://gather.invalid';

function hasForbiddenCharacter(raw: string): boolean {
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    if (c <= 0x20 || c === 0x7f || c === 0x5c) return true;
  }
  return false;
}

export function safeReturnPath(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_LENGTH) return FALLBACK;
  if (raw[0] !== '/' || raw[1] === '/') return FALLBACK;
  if (hasForbiddenCharacter(raw)) return FALLBACK;

  let url: URL;
  try {
    url = new URL(raw, PROBE_ORIGIN);
  } catch {
    return FALLBACK;
  }
  if (url.origin !== PROBE_ORIGIN) return FALLBACK;

  const firstSegment = url.pathname.split('/')[1] ?? '';
  if (!ALLOWED_FIRST_SEGMENTS.has(firstSegment)) return FALLBACK;

  return url.pathname + url.search + url.hash;
}
