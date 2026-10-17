/**
 * [[GTC-264]] Phase 3 — TNZ's webhook credential, as one definition. [[GTC-229]] consumes it.
 *
 * TNZ authenticate every webhook call with ONE identity and ONE secret, presented twice: raw in
 * the `X-Sender` and `Authorization` headers (no `Basic`, no `Bearer`), and echoed as `Sender`
 * and `APIKey` in the JSON body. Both are configured in the TNZ Dashboard under Users > API User >
 * API > Reporting. The secret is NOT `TNZ_AUTH_TOKEN`, which authenticates OUR calls to THEM.
 *
 *   TNZ_CALLBACK_SECRET  the webhook APIKey
 *   TNZ_CALLBACK_SENDER  the webhook Sender
 *
 * WHY THESE ARE PURE PREDICATES AND THE REFUSALS STAY IN THE ROUTE. The house shape is
 * [[GTC-270]]'s, in `../cron/cron-secret.ts`: the DECISION lives here, once, assertable with no
 * server and no database; the refusing `if` stays in the route file, where the route scanner
 * reads it. The scanner follows a RELATIVE import one level deep ([[GTC-273]],
 * `MAX_MODULE_DEPTH = 1`), so the route imports this as `../tnz-callback-auth`, never through the
 * `@/` alias. Measured before the build: all three refusals read `SHARED_SECRET:PROVEN`.
 *
 * FAILS CLOSED. An unset or empty secret OR sender is a misconfiguration, and the fail-closed
 * direction for a misconfiguration is nobody, not everybody. The configured check comes first in
 * `tnzCallbackAccepted` too, so an empty configured value can never be satisfied by an empty
 * presented one (`'' === ''`), which is the hole [[GTC-270]] closed one layer down.
 */

import { timingSafeEqual } from 'crypto';

/** Are both halves of the credential configured? An empty string is not configured. */
export function isTnzCallbackConfigured(
  secret: string | undefined,
  sender: string | undefined
): boolean {
  return (
    typeof secret === 'string' &&
    secret.length > 0 &&
    typeof sender === 'string' &&
    sender.length > 0
  );
}

/** Constant-time equality, so a refusal takes no longer for a closer guess. */
function same(presented: string, configured: string): boolean {
  const a = Buffer.from(presented, 'utf8');
  const b = Buffer.from(configured, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Does the presented pair authenticate? Called twice per request: once on the headers, once on
 * the body's echo of them. FAILS CLOSED on an unconfigured credential.
 */
export function tnzCallbackAccepted(
  secret: string | undefined,
  sender: string | undefined,
  presentedSecret: string | null | undefined,
  presentedSender: string | null | undefined
): boolean {
  if (!isTnzCallbackConfigured(secret, sender)) return false;
  if (typeof presentedSecret !== 'string' || typeof presentedSender !== 'string') return false;
  return same(presentedSecret, secret as string) && same(presentedSender, sender as string);
}
