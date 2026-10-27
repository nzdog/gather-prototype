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
  /**
   * [[GTC-411]] ruling 2: the event lands on the SIGNED-IN account (its own User and its own
   * Person), not on whatever account the paid address would look up. True only on
   * SESSION_MATCHES, where the two addresses differ at most by capitals or outer spaces, so they
   * are one person's address and no second User or Person is made for it. It changes where the
   * event is filed, never whether anyone is signed in.
   */
  landOnSessionAccount: boolean;
}

/**
 * Addresses are compared ignoring capitals and outer spaces.
 *
 * Since [[GTC-411]] the account lookup ignores them too. The route no longer
 * looks the paid address up letter for letter: when the session matches, the
 * event goes on the signed-in account itself (`landOnSessionAccount`); in every
 * other case the route asks `findOrCreateUserByEmail`
 * (src/lib/accounts/user-by-email.ts), the same rule the sign-in route uses: the
 * exact spelling if it has an account, otherwise the oldest account whose
 * address differs only by capitals or outer spaces, otherwise a new account
 * stored lower-case. So a difference in capitals no longer opens a second
 * account at either door. The comparison here still only decides the branch; it
 * can never hand out a credential.
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
      landOnSessionAccount: false,
    };
  }

  if (normalise(sessionUser.email) === normalise(paidEmail)) {
    return {
      relation: 'SESSION_MATCHES',
      alreadySignedIn: true,
      needsSignInLink: false,
      bindTo: paidEmail,
      signedInAs: null,
      landOnSessionAccount: true,
    };
  }

  return {
    relation: 'SESSION_MISMATCH',
    alreadySignedIn: false,
    needsSignInLink: true,
    bindTo: paidEmail,
    signedInAs: sessionUser.email,
    landOnSessionAccount: false,
  };
}

/** Masked for display: the payer knows their own address, a shoulder-surfer does not. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '•••';
  const head = local.slice(0, 1);
  return `${head}${'•'.repeat(Math.max(2, Math.min(local.length - 1, 3)))}@${domain}`;
}
