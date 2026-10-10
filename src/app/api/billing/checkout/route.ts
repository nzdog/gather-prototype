// src/app/api/billing/checkout/route.ts
// Per-event payment: $12 one-time payment (not subscription)
import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { eventName, startDate, endDate, email } = body;

    /*
     * GTC-280, half 1 — ONE address, and it is the one she typed.
     *
     * This route used to set no `customer_email`, so Stripe collected the
     * address itself and whatever the payer typed there became the identity
     * `POST /api/events` bound the event to. Meanwhile `/plan/new` had already
     * asked her for an address and thrown it away. Two inputs, one ignored.
     *
     * ⚠ THIS IS NOT THE SECURITY FIX AND MUST NOT BE MISTAKEN FOR ONE. The
     * value below comes from the request body, so a caller who skips the form
     * and posts here directly still chooses the address. It closes the
     * ACCIDENTAL second address — the two-account drift an honest host hits by
     * autofilling a different address at Stripe. The deliberate one is closed
     * by `POST /api/events` refusing to hand back a credential at all.
     */
    const customerEmail =
      typeof email === 'string' && email.includes('@') ? email.trim() : undefined;

    // Get app URL from env or construct from request
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    // Create Stripe Checkout Session for one-time payment
    const session = await stripe.checkout.sessions.create({
      mode: 'payment', // NOT 'subscription'
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'nzd',
            unit_amount: 1200, // $12.00 NZD
            product_data: {
              name: 'Gather Event',
              description: eventName || 'Event coordination',
            },
          },
          quantity: 1,
        },
      ],
      ...(customerEmail ? { customer_email: customerEmail } : {}),
      success_url: `${appUrl}/plan/new?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/plan/new?canceled=true`,
      metadata: {
        eventName: eventName || '',
        startDate: startDate || '',
        endDate: endDate || '',
      },
    });

    return NextResponse.json({
      checkoutUrl: session.url,
      sessionId: session.id,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Checkout] Error creating checkout session:', errorMessage);
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 });
  }
}
