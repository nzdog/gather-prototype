// src/app/api/billing/checkout/route.ts
// Per-event payment: $12 one-time payment (not subscription)
import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { eventName, startDate, endDate } = body;

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
      success_url: `${appUrl}/plan/new?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/plan/new?canceled=true`,
      metadata: {
        eventName: eventName || '',
        startDate: startDate || '',
        endDate: endDate || '',
      },
    });

    console.log('[Checkout] Created one-time payment session:', session.id);

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
