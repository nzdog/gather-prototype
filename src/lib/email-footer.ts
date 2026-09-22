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
 * Ruling 7 adds the third thing: Gather's registered postal address, in the footer of
 * every guest-bound email, from ONE constant. The founder named all three together
 * *"so the three do not get quietly removed later by someone tidying the footer."* This
 * module is that one place, and the ticket is the reason to leave it alone.
 *
 * ⚠ THE TWO ACCOUNT SENDERS DO NOT USE THIS MODULE. `sendMagicLinkEmail` and
 * `sendWelcomeEmail` are exempt by ruling 6 — they are direct responses to something the
 * account holder just did, which is the reading commercial-mail law gives "transactional"
 * mail. A magic link carrying an unsubscribe would offer to switch off the only way back
 * in. `tests/email-opt-out-test.ts` layer G asserts the exemption rather than assuming it.
 */

/**
 * ⚠ A PLACEHOLDER. THIS TICKET MAY NOT MERGE WITH A MADE-UP ADDRESS.
 *
 * ANCHOR(GTC-296): registered postal address — founder to confirm before merge
 *
 * Ruling 7 builds to the NZ Unsolicited Electronic Messages Act 2007 whether or not it
 * strictly reaches a friend's invitation sent from Gather's domain, on the ground that its
 * three requirements are almost free to meet. Two of the three are met in code — the
 * functional unsubscribe, and sender identification through *"Alice via Gather"* in the
 * from-line (THE VOICE, 2026-09-13). The third is a fact about the company that the
 * founder holds and the executor does not.
 *
 * An invented address would meet the letter of the requirement and defeat its purpose,
 * which is that a recipient can reach a real sender. So the value states what it is, and
 * `POSTAL_ADDRESS_IS_PLACEHOLDER` below is what a merge gate reads.
 */
export const GATHER_POSTAL_ADDRESS =
  '[Gather — registered postal address to be confirmed before launch]';

/**
 * Whether the address above is still the placeholder.
 *
 * Kept as a separate exported fact rather than derived by matching on the string, because
 * a test that asserted `GATHER_POSTAL_ADDRESS.includes('to be confirmed')` would go green
 * the day somebody wrote a real address containing those words, and would need editing the
 * day somebody reworded the placeholder. One boolean, flipped in the same edit that
 * supplies the address.
 */
export const POSTAL_ADDRESS_IS_PLACEHOLDER = true;

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
  return ['', '—', `${UNSUBSCRIBE_INVITATION} ${pageUrl}`, '', GATHER_POSTAL_ADDRESS].join('\n');
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
