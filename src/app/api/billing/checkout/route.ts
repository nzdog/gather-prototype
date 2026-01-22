// src/app/api/billing/checkout/route.ts
import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/session';
import { stripe, STRIPE_PRICE_ID } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';

export async function POST(_req: Request) {
  try {
    // Get authenticated user
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!STRIPE_PRICE_ID) {
      console.error('[Checkout] STRIPE_PRICE_ID not configured');
      return NextResponse.json({ error: 'Stripe price ID not configured' }, { status: 500 });
    }

    // Get or create Subscription record
    let subscription = await prisma.subscription.findUnique({
      where: { userId: user.id },
    });

    let stripeCustomerId: string;

    if (!subscription || !subscription.stripeCustomerId) {
      // Create Stripe Customer
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          userId: user.id,
        },
      });

      stripeCustomerId = customer.id;

      // Create or update Subscription record with Stripe Customer ID
      if (subscription) {
        subscription = await prisma.subscription.update({
          where: { userId: user.id },
          data: { stripeCustomerId: customer.id },
        });
      } else {
        subscription = await prisma.subscription.create({
          data: {
            userId: user.id,
            stripeCustomerId: customer.id,
            status: 'FREE',
          },
        });
      }

      console.log('[Checkout] Created Stripe customer:', stripeCustomerId);
    } else {
      stripeCustomerId = subscription.stripeCustomerId;
    }

    // Get app URL from env or construct from request
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: STRIPE_PRICE_ID,
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/billing/cancel`,
      metadata: {
        userId: user.id,
      },
    });

    console.log('[Checkout] Created checkout session:', session.id);

    return NextResponse.json({ url: session.url });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Checkout] Error creating checkout session:', errorMessage);
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 });
  }
}
