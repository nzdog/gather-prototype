/**
 * [[GTC-296]] — WHAT EVERY GUEST-BOUND EMAIL CARRIES AT THE BOTTOM, AND IN ITS HEADERS.
 *
 * Ruling 2, 2026-09-20: BOTH, never either.
 *
 *   - a visible link in the body, because a header-only unsubscribe misses every client
 *     that does not render one;
 *   - a `List-Unsubscribe` header with its RFC 8058 `List-Unsubscribe-Post` companion,
 *     because a body-only unsubscribe misses the users trained to trust the button at the
 *     top of the message.
 *
 * Ruling 7 adds the third thing: how to contact Gather, as the last line of every
 * guest-bound email, from ONE constant. The founder named all three together
 * *"so the three do not get quietly removed later by someone tidying the footer."* This
 * module is that one place, and the ticket is the reason to leave it alone.
 *
 * ⚠ THE TWO ACCOUNT SENDERS DO NOT USE THIS MODULE. `sendMagicLinkEmail` and
 * `sendWelcomeEmail` are exempt by ruling 6 — they are direct responses to something the
 * account holder just did, which is the reading commercial-mail law gives "transactional"
 * mail. A magic link carrying an unsubscribe would offer to switch off the only way back
 * in. `tests/email-opt-out-test.ts` layer G asserts the exemption rather than assuming it,
 * and `tests/email-contact-line-test.ts` layer C does for the contact line.
 */

/**
 * [[GTC-296]] RULING 7, RE-RULED 2026-09-29 — A CONTACT EMAIL, NOT A POSTAL ADDRESS.
 *
 * UEMA 2007 s10 asks that a commercial electronic message say how the recipient can contact
 * the sender. It prescribes no postal address; that was the US CAN-SPAM rule, carried into
 * the ruling at scoping and corrected on 2026-09-27. So the footer gives Gather's address,
 * and no guest email carries a postal address.
 *
 * The address is here and nowhere else, so changing it is one edit.
 * [[GTC-341]] ruled the line's words, and its suite pins both.
 */
export const GATHER_CONTACT_EMAIL = 'hello@gatheringtogether.co.nz';

/** The last line of every guest-bound email. Plain text, like the rest of the footer. */
export const GATHER_CONTACT_LINE = `Contact Gather: ${GATHER_CONTACT_EMAIL}`;

/** The sentence above the link. Plain text — both guest senders send `text`, not `html`. */
export const UNSUBSCRIBE_INVITATION = "Don't want emails about this event?";

/**
 * The footer appended to every guest-bound email body.
 *
 * ⚠ IT TAKES THE PAGE URL, NOT THE ONE-CLICK URL. A person clicking a link in a body wants
 * to read what they are about to do before it happens — which is ruling 1's confirm page.
 * The one-click URL is for the client's own button, where there is no page to read.
 *
 * The separator is a plain rule rather than markup, because the ask and the nudge are text
 * emails and an `<hr>` would arrive as four literal characters.
 */
export function guestEmailFooter(pageUrl: string): string {
  return ['', '—', `${UNSUBSCRIBE_INVITATION} ${pageUrl}`, '', GATHER_CONTACT_LINE].join('\n');
}

/** A guest body with its way out attached. One place, so the two senders cannot drift. */
export function withGuestEmailFooter(body: string, pageUrl: string): string {
  return `${body}\n${guestEmailFooter(pageUrl)}`;
}

/**
 * The two headers, together, always.
 *
 * `List-Unsubscribe` is angle-bracketed per RFC 2369 — a bare URL is not a valid value and
 * clients differ on whether they repair it. `List-Unsubscribe-Post` carries RFC 8058's one
 * exact value; anything else means the header is present and one-click is not offered,
 * which is the failure mode that looks fine in a header dump.
 *
 * ⚠ THE POST HEADER IS A PROMISE THE ROUTE HAS TO KEEP. Declaring one-click tells Gmail and
 * Outlook they may POST to that URL with no interaction and expect a 2xx. See
 * `src/app/api/unsubscribe/[token]/route.ts`, which is why that handler is idempotent.
 */
export function listUnsubscribeHeaders(oneClickUrl: string): Record<string, string> {
  return {
    'List-Unsubscribe': `<${oneClickUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}
