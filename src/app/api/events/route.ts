// GET /api/events - List events where user has a role
// POST /api/events - Create new event from a paid Stripe Checkout Session
//
/*
 * ⚠ GTC-280 — POST NEVER SETS A SESSION COOKIE. That is the whole invariant and
 * it is one sentence on purpose.
 *
 * This route used to read `customer_details.email` off a paid Checkout
 * Session, look it up in `User`, and — found or created — write a 30-day
 * `Session` and set the `session` cookie. So paying $12 and typing a known
 * host's address at Stripe returned a logged-in session as that host, reaching
 * every event she holds a role on, every guest's contact details, her
 * message-sending capability and her host memory, for 30 days, with no way for
 * her to end it.
 *
 * A Stripe receipt is a bearer proof of PAYMENT. It was being spent as a
 * bearer proof of IDENTITY. Stripe does not confirm that address, does not
 * require a click on it and does not represent it as verified.
 *
 * The rule: a payment may CREATE an event and ATTACH it to an address; it may
 * never, on its own, return a credential for an account. Who the payer is
 * relative to the request is decided by `resolvePaymentIdentity` in
 * `src/lib/events/payment-identity.ts`, which is exhaustively tested offline
 * because this route cannot be driven without really paying.
 *
 * DO NOT ADD A BRANCH THAT MINTS. The uniform shape was chosen over a variant
 * that kept the mint for brand-new addresses precisely because a route with
 * one branch that mints and three that do not is a route someone later
 * simplifies in the wrong direction. It also closes account pre-registration:
 * paying with an address that has no `User` yet used to hand out a live
 * session on the account its real owner would later sign in to.
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUser } from '@/lib/auth/session';
import { EVENT_LIST_WIRE_SELECT } from '@/lib/events/wire-select';
import { resolvePaymentIdentity, maskEmail } from '@/lib/events/payment-identity';
import { stripe } from '@/lib/stripe';
import { sendWelcomeEmail } from '@/lib/email';

export async function GET(_request: NextRequest) {
  try {
    // Get authenticated user
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch events where user has any role (HOST, COHOST, COORDINATOR)
    const events = await prisma.event.findMany({
      where: {
        eventRoles: {
          some: {
            userId: user.id,
          },
        },
      },
      // GTC-271: a top-level `select`, never a bare `include`. `include` on its own means
      // "every scalar, plus these relations", which sent `sharedLinkToken` — a join
      // credential `POST /api/join/[token]/claim` authenticates on — along with the Stripe
      // columns and the check-plan telemetry, for every event in the list. The field list
      // lives in `EVENT_LIST_WIRE_SELECT`; `eventRoles` is composed here because its
      // `where` is bound to the calling user.
      select: {
        ...EVENT_LIST_WIRE_SELECT,
        eventRoles: {
          where: { userId: user.id },
          select: { role: true },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json({ events });
  } catch (error) {
    console.error('Error fetching events:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch events',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { stripeSessionId } = body;

    // Require payment session
    if (!stripeSessionId) {
      return NextResponse.json(
        { error: 'Payment required. Missing stripeSessionId.' },
        { status: 402 }
      );
    }

    // Verify Stripe session
    let stripeSession;
    try {
      stripeSession = await stripe.checkout.sessions.retrieve(stripeSessionId);
    } catch (err) {
      console.error('[Event Creation] Invalid Stripe session:', stripeSessionId, err);
      return NextResponse.json({ error: 'Invalid payment session' }, { status: 400 });
    }

    // Verify payment is completed
    if (stripeSession.payment_status !== 'paid') {
      console.error('[Event Creation] Payment not completed:', stripeSession.payment_status);
      return NextResponse.json({ error: 'Payment not completed' }, { status: 402 });
    }

    // Get email from Stripe (collected during checkout)
    const email = stripeSession.customer_details?.email;
    if (!email) {
      return NextResponse.json({ error: 'No email from Stripe' }, { status: 400 });
    }

    // Get event data from Stripe metadata
    const { eventName, startDate, endDate } = stripeSession.metadata || {};
    if (!eventName || !startDate || !endDate) {
      return NextResponse.json(
        { error: 'Missing event data from payment session' },
        { status: 400 }
      );
    }

    // Check session hasn't been used already
    const existingEvent = await prisma.event.findFirst({
      where: { stripePaymentIntentId: stripeSession.payment_intent as string },
    });

    if (existingEvent) {
      console.error('[Event Creation] Payment already used for event:', existingEvent.id);
      return NextResponse.json(
        { error: 'Payment already used for another event' },
        { status: 409 }
      );
    }

    /*
     * ⚠ THIS `getUser()` CLASSIFIES. IT NEVER REFUSES, AND THAT IS DELIBERATE.
     *
     * No branch below returns a 4xx because of it. An anonymous caller with a
     * valid receipt still gets an event — that is how a first-time host pays,
     * and it is the reason the route scanner still reports this handler as
     * carrying no session guard. That verdict is TRUE and is pinned in
     * `tests/security-route-scan-control.ts`. The containment is what the route
     * RETURNS, which no static read of this handler can see, so it lives in the
     * suites instead. GTC-269's rule: do not buy a flattering scanner verdict
     * with a false one.
     */
    const sessionUser = await getUser();
    const identity = resolvePaymentIdentity(sessionUser, email);

    // Build event data
    const eventData = {
      name: eventName,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      status: 'DRAFT' as const,
      structureMode: 'EDITABLE' as const,
      isLegacy: false,
      stripePaymentIntentId: stripeSession.payment_intent as string,
      paidAt: new Date(),
      amountPaid: stripeSession.amount_total,
      guestCountConfidence: 'MEDIUM' as const,
      dietaryStatus: 'UNSPECIFIED' as const,
      dietaryVegetarian: 0,
      dietaryVegan: 0,
      dietaryGlutenFree: 0,
      dietaryDairyFree: 0,
      venueOvenCount: 0,
    };

    // Create user, person, event, and event role in a transaction.
    //
    // `identity.bindTo` is the PAID address on every branch, including the
    // mismatch branch. Moving someone's event under them is no better than
    // moving their session, so neither is done silently.
    const { event } = await prisma.$transaction(async (tx) => {
      let user = await tx.user.findUnique({ where: { email: identity.bindTo } });
      if (!user) {
        user = await tx.user.create({ data: { email: identity.bindTo } });
      }

      let person = await tx.person.findFirst({ where: { userId: user.id } });
      if (!person) {
        person = await tx.person.create({
          data: {
            name: identity.bindTo.split('@')[0],
            email: identity.bindTo,
            userId: user.id,
          },
        });
      }

      const event = await tx.event.create({
        data: { ...eventData, hostId: person.id },
      });

      await tx.eventRole.create({
        data: { userId: user.id, eventId: event.id, role: 'HOST' },
      });

      return { event, user };
    });

    /*
     * The sign-in link, and GTC-265's contract arriving at its loud caller.
     *
     * `sendWelcomeEmail` returns its result and does not decide what to do
     * about a failure. `POST /api/auth/magic-link` answers byte-identically
     * whatever happens, because that is enumeration protection. THIS caller is
     * the other side of that asymmetry: she typed the address herself and has
     * just been charged for it, there is nothing to enumerate, and if the link
     * did not go she needs to be told so on the screen rather than left
     * watching an inbox. So the send is awaited, not fired and forgotten, and
     * its outcome is in the response.
     *
     * The event is created either way. A failed email withholds a shortcut, not
     * the goods: the Event and the EventRole are already written and attached
     * to her User, and /auth/signin is a second door to the same place.
     */
    const delivery = await sendWelcomeEmail(email, event.name, event.id, {
      alreadySignedIn: identity.alreadySignedIn,
    });
    if (!delivery.success) {
      console.error(
        `[Event Creation] sign-in link to ${email} for event ${event.id} was NOT delivered:`,
        delivery.error
      );
    }

    return NextResponse.json({
      success: true,
      event,
      // What the client needs to know, and nothing that is a credential.
      alreadySignedIn: identity.alreadySignedIn,
      relation: identity.relation,
      signInEmailSentTo: identity.needsSignInLink ? maskEmail(email) : null,
      signInEmailDelivered: identity.needsSignInLink ? delivery.success : null,
      signedInAs: identity.signedInAs ? maskEmail(identity.signedInAs) : null,
    });
  } catch (error) {
    console.error('Error creating event:', error);
    return NextResponse.json(
      {
        error: 'Failed to create event',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
