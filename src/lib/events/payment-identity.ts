/**
 * GTC-280 — who a payment authenticates, which is nobody.
 *
 * THE RULE THIS MODULE EXISTS TO MAKE TESTABLE:
 *
 *   A payment may CREATE an event and ATTACH it to an address. It may never,
 *   on its own, return a credential for an account.
 *
 * Before GTC-280, `POST /api/events` read `customer_details.email` off a paid
 * Stripe Checkout Session, looked it up in `User`, and — whether the row was
 * found or created — wrote a 30-day `Session` and set the `session` cookie. A
 * Stripe receipt is a bearer proof of PAYMENT. It was being spent as a bearer
 * proof of IDENTITY. Those are different claims and only one of them was ever
 * verified: Stripe does not confirm that address, does not require a click on
 * it, and does not represent it as verified.
 *
 * ── WHY THIS IS A MODULE AND NOT AN `if` IN THE ROUTE ─────────────────────────
 *
 * `POST /api/events` cannot be driven without a really-paid Checkout Session,
 * and there is no Stripe API that fakes one — completing a session needs the
 * hosted page. So the branch table would otherwise be reachable only by paying
 * four times. Extracted, it is exhaustively testable offline. Same reason and
 * same pattern as `resolveManualNudgeRecipient` in
 * `src/lib/sms/manual-nudge-recipient.ts` (GTC-172 / C1).
 *
 * ── WHAT THIS TYPE DELIBERATELY CANNOT SAY ───────────────────────────────────
 *
 * There is no field here meaning "mint a session", "issue a cookie" or "log
 * them in", and there must never be one. The outcome describes who the payer
 * is relative to the request, and nothing else. `bindTo` is ALWAYS the paid
 * address on every branch — including the mismatch branch, because moving
 * someone's event under them is no better than moving their session.
 */

export type PaymentIdentityRelation = 'SESSION_MATCHES' | 'SESSION_MISMATCH' | 'NO_SESSION';

export interface PaymentIdentity {
  /** How the payer relates to the session on the request, if there was one. */
  relation: PaymentIdentityRelation;
  /**
   * Whether the caller can already reach the new event with the credential
   * they arrived holding. True only when they were already authenticated AS
   * the paying address — never as a consequence of the payment.
   */
  alreadySignedIn: boolean;
  /** Whether a sign-in link must be emailed to the paid address. */
  needsSignInLink: boolean;
  /**
   * The address the event binds to. Always the paid one. Never the session's,
   * and never a caller-supplied override.
   */
  bindTo: string;
  /** The session's address when it differs from the paid one, so it can be said out loud. */
  signedInAs: string | null;
}

/**
 * Addresses are compared case- and whitespace-insensitively.
 *
 * ⚠ THE COMPARISON IS NORMALISED; THE LOOKUP IS NOT, AND THAT ASYMMETRY IS
 * DELIBERATE. `prisma.user.findUnique({ where: { email } })` in the route is an
 * exact match, and changing that would change which accounts resolve to which
 * rows — identity semantics, not this ticket's. Normalising only the
 * comparison fails in the safe direction: a case difference can at worst turn
 * the frictionless branch into the emailed one, never the other way round.
 */
const normalise = (email: string): string => email.trim().toLowerCase();

export function resolvePaymentIdentity(
  sessionUser: { email: string } | null,
  paidEmail: string
): PaymentIdentity {
  if (!sessionUser) {
    return {
      relation: 'NO_SESSION',
      alreadySignedIn: false,
      needsSignInLink: true,
      bindTo: paidEmail,
      signedInAs: null,
    };
  }

  if (normalise(sessionUser.email) === normalise(paidEmail)) {
    return {
      relation: 'SESSION_MATCHES',
      alreadySignedIn: true,
      needsSignInLink: false,
      bindTo: paidEmail,
      signedInAs: null,
    };
  }

  return {
    relation: 'SESSION_MISMATCH',
    alreadySignedIn: false,
    needsSignInLink: true,
    bindTo: paidEmail,
    signedInAs: sessionUser.email,
  };
}

/** Masked for display: the payer knows their own address, a shoulder-surfer does not. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '•••';
  const head = local.slice(0, 1);
  return `${head}${'•'.repeat(Math.max(2, Math.min(local.length - 1, 3)))}@${domain}`;
}
