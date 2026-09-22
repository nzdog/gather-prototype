import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { readUnsubscribeToken, unsubscribePagePath } from '@/lib/unsubscribe-token';

/**
 * [[GTC-296]] — THE WAY OUT, AS A HANDLER.
 *
 * ── ⚠ PUBLIC, DELIBERATELY, AND IT IS THE POINT OF THE TICKET ────────────────
 *
 * Ruling Q says every guest-bound email carries a way out. The people who need this route are
 * guests who never signed up to Gather, hold no session and hold no account — so an
 * authenticated unsubscribe is not an unsubscribe. The signed token IS the authorisation, and
 * `readUnsubscribeToken` is where it is checked.
 *
 * ── ⚠ NO CSRF TOKEN, AND THAT IS RFC 8058 RATHER THAN AN OVERSIGHT ───────────
 *
 * One-click unsubscribe is a CROSS-ORIGIN POST made by Gmail, Apple Mail or Outlook with no
 * page and no interaction. A CSRF check would refuse exactly the request the header promises to
 * accept. Ruled at correction R4, with the exposure stated: the worst a forged POST achieves is
 * unsubscribing its own victim from one event, which is a thing the victim can undo by asking
 * the host and which nobody gains anything by doing.
 *
 * ── ⚠ IT LIVES UNDER `src/app/api` SO THE SCANNER CAN SEE IT ─────────────────
 *
 * `tests/security-route-scan.ts` walks `src/app/api` ONLY — *"SERVER ACTIONS ARE OUT OF SCOPE"*,
 * and so is everything else outside that tree. A public POST route anywhere else would be a
 * public route the security suite cannot audit, which is a worse property than the slightly
 * uglier URL in a header. The human-readable page is at `/unsubscribe/<token>`; this is what the
 * mail client posts to. Classified PUBLIC in `route-classifications.json`.
 */

/**
 * ⚠ IDEMPOTENT, BECAUSE THE HEADER PROMISED IT WOULD BE. A mail client may POST more than once
 * — retries, two devices, a user pressing the button twice — and `@@unique([personId, eventId])`
 * would turn the second into a 500 at the person trying to leave.
 *
 * `upsert` with an EMPTY update is the shape: the row is created if absent and left exactly as
 * it was if present, so `optedOutAt` goes on saying when they actually decided. Touching it
 * would make a replay look like a second decision.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ token: string }> }
): Promise<NextResponse> {
  const { token } = await context.params;
  const subject = readUnsubscribeToken(token);

  /*
   * ⚠ 404 AND NOT 401 OR 400. A token this process did not sign, a tampered one, and a token
   * presented while `UNSUBSCRIBE_TOKEN_SECRET` is unset all arrive here as `null`, and none of
   * them should tell the caller which. 404 is also the honest answer to a guest who mangled a
   * URL: there is nothing at that address.
   */
  if (!subject) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    await prisma.emailOptOut.upsert({
      where: {
        personId_eventId: { personId: subject.personId, eventId: subject.eventId },
      },
      create: { personId: subject.personId, eventId: subject.eventId, token },
      update: {},
    });
  } catch (error) {
    /*
     * ⚠ A FOREIGN KEY FAILURE IS A 404, NOT A 500. The person or the event may have been
     * deleted since the email was sent — the cascades in the schema mean a suppression for a
     * gone event is meaningless — and the token still verifies, because it is signed rather
     * than looked up. There is nothing to unsubscribe from, which is what 404 says.
     */
    console.error('[GTC-296] unsubscribe write failed:', error);
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, unsubscribed: true }, { status: 200 });
}

/**
 * A mail client that follows the header URL by hand, or a person who pasted it, gets the page.
 *
 * ⚠ A REDIRECT RATHER THAN A SECOND COPY OF THE PAGE. One set of words, in one place, so the
 * confirm sentence ruling 1 specifies cannot drift between two renderings of it.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> }
): Promise<NextResponse> {
  const { token } = await context.params;
  return NextResponse.redirect(
    new URL(unsubscribePagePath(token), process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
    307
  );
}
