import { createHmac, timingSafeEqual } from 'crypto';

/**
 * [[GTC-296]] — THE TOKEN IN AN UNSUBSCRIBE LINK.
 *
 * ⚠ THIS IS NOT THE GUEST-LINK TOKEN, AND THE TICKET ORIGINALLY SAID IT WAS. Correction
 * R5, 2026-09-20, after the executor checked the tree: the ticket asked for *"a signed
 * one-shot of the same shape as the guest-link tokens the invitation already carries"* and
 * pointed at `src/lib/tokens/`. Three things were wrong with that sentence and each one
 * matters here:
 *
 *   - `src/lib/tokens.ts` is a FILE, not a directory.
 *   - `generateToken` there makes 32 random bytes stored as an `AccessToken` row. It is
 *     not SIGNED. It is a lookup key.
 *   - `AccessToken` is **Do-Not-Touch Zone 3**, whose uniqueness constraint and scope
 *     system are interdependent with the scoped cookie system. Minting a fourth scope
 *     for an unsubscribe would need the full security re-audit that zone requires, to
 *     buy a credential that grants nothing.
 *
 * ── ⚠ WHY STATELESS, WHICH IS THE ONE THING TO UNDERSTAND BEFORE EDITING ─────
 *
 * THE LINK EXISTS BEFORE THE ROW DOES. The unsubscribe URL is carried by an email that
 * goes out long before anybody clicks it, and the `EmailOptOut` row is created BY the
 * click. So a token stored on that row cannot be the token in the link — it would have to
 * exist before the row it lives on. Either a second table mints one per recipient per
 * send, or the token carries its own meaning and is verified rather than looked up. This
 * is the second, and `EmailOptOut.token` records which token was presented.
 *
 * ── FAILS CLOSED, FOLLOWING [[GTC-270]] ──────────────────────────────────────
 *
 * `CRON_SECRET` was made to refuse every caller when unset rather than admit everyone.
 * Same here, in both directions: reading returns `null`, and minting THROWS. The throw is
 * deliberate and it is the same door `getResendClient()` uses for a missing
 * `RESEND_API_KEY` — the guest senders in `src/lib/email.ts` already catch that and
 * return `{ success: false }`, so a Gather with no secret configured sends no guest email
 * at all rather than sending one with no way out of it. That is ruling Q enforced by
 * construction rather than by discipline.
 */

const SECRET_ENV = 'UNSUBSCRIBE_TOKEN_SECRET';

/** The pair a token carries. Ruling 1's grain: a person, and ONE event. */
export interface UnsubscribeSubject {
  personId: string;
  eventId: string;
}

/**
 * ⚠ READ AT CALL TIME, NEVER CAPTURED AT IMPORT TIME. A module-level constant would be
 * fixed at first import, which breaks the route under Next's module reuse and makes the
 * fail-closed behaviour untestable — a suite could never assert what an unconfigured
 * process does once a configured one had imported the module.
 */
function secret(): string | null {
  const value = process.env[SECRET_ENV];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function sign(payload: string, key: string): string {
  return createHmac('sha256', key).update(payload).digest('base64url');
}

/**
 * The token for one person on one event.
 *
 * DETERMINISTIC, on purpose: the same pair mints the same token every time, so the link in
 * the invitation and the link in a later reminder are the SAME link. A random token per
 * send would work and would leave the person holding several live ways out of one event,
 * with nothing able to say which they used.
 *
 * NO EXPIRY, ruled at R5: *"a way out that stops working is not a way out."* There is no
 * timestamp in the payload to lapse, which is what `tests/email-opt-out-test.ts` layer A
 * asserts rather than waiting for a clock.
 *
 * @throws when `UNSUBSCRIBE_TOKEN_SECRET` is unset — see the header.
 */
export function mintUnsubscribeToken(personId: string, eventId: string): string {
  const key = secret();
  if (!key) {
    throw new Error(
      `${SECRET_ENV} is not set. Gather cannot compose a guest email without a way out of it (GTC-296).`
    );
  }
  const payload = Buffer.from(`${personId}:${eventId}`).toString('base64url');
  return `${payload}.${sign(payload, key)}`;
}

/**
 * The pair a token carries, or `null` for anything this process did not sign.
 *
 * NEVER THROWS. Its caller is an unauthenticated route reachable by anybody with a URL
 * bar, and a thrown error there is a 500 where a 404 is the honest answer.
 *
 * ⚠ `timingSafeEqual` RATHER THAN `===`, and it needs the length guard above it: the
 * function throws on mismatched lengths, so a short signature would crash the comparison
 * that exists to be constant-time.
 */
export function readUnsubscribeToken(token: string | null | undefined): UnsubscribeSubject | null {
  const key = secret();
  if (!key || typeof token !== 'string' || token.length === 0) return null;

  const dot = token.lastIndexOf('.');
  if (dot <= 0 || dot === token.length - 1) return null;
  const payload = token.slice(0, dot);
  const presented = token.slice(dot + 1);

  const expected = sign(payload, key);
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let decoded: string;
  try {
    decoded = Buffer.from(payload, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const split = decoded.indexOf(':');
  if (split <= 0 || split === decoded.length - 1) return null;
  return { personId: decoded.slice(0, split), eventId: decoded.slice(split + 1) };
}

/** Where a person reads what they are about to do. The body link points here. */
export function unsubscribePagePath(token: string): string {
  return `/unsubscribe/${token}`;
}

/**
 * Where a mail client POSTs. The `List-Unsubscribe` header points here.
 *
 * ⚠ TWO PATHS, AND IT IS NOT AN ACCIDENT (R4). Next's App Router cannot serve a page and a
 * POST from one `page.tsx`, and `tests/security-route-scan.ts` walks `src/app/api` ONLY —
 * so a public POST anywhere else is a route the security scanner cannot see. The header
 * gets the scanned handler; the human gets the page.
 */
export function unsubscribeOneClickPath(token: string): string {
  return `/api/unsubscribe/${token}`;
}

/** Both URLs for one recipient. Throws with `mintUnsubscribeToken` when unconfigured. */
export function unsubscribeUrls(
  baseUrl: string,
  personId: string,
  eventId: string
): { pageUrl: string; oneClickUrl: string } {
  const token = mintUnsubscribeToken(personId, eventId);
  const base = (baseUrl || '').replace(/\/$/, '');
  return {
    pageUrl: `${base}${unsubscribePagePath(token)}`,
    oneClickUrl: `${base}${unsubscribeOneClickPath(token)}`,
  };
}
