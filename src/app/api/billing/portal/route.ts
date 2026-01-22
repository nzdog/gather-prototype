// src/app/api/billing/portal/route.ts
import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/session';
import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/billing/portal
 *
 * Creates a Stripe Customer Portal session for payment method updates.
 * The portal allows users to update payment methods, view invoices, and manage their subscription.
 *
 * Flow:
 * 1. Get authenticated user
 * 2. Find their subscription with stripeCustomerId
 * 3. Create Stripe billing portal session
 * 4. Return portal URL for redirect
 */
export async function POST(_req: Request) {
  try {
    // Get authenticated user
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's subscription
    const subscription = await prisma.subscription.findUnique({
      where: { userId: user.id },
    });

    if (!subscription) {
      return NextResponse.json({ error: 'No subscription found' }, { status: 404 });
    }

    if (!subscription.stripeCustomerId) {
      return NextResponse.json({ error: 'No Stripe customer ID found' }, { status: 400 });
    }

    // Get app URL from env or construct from request
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    console.log(
      '[Portal] Creating billing portal session for customer:',
      subscription.stripeCustomerId
    );

    // Create Stripe Billing Portal session
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: `${appUrl}/billing`,
    });

    console.log('[Portal] Portal session created:', {
      id: portalSession.id,
      url: portalSession.url,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Portal] Error creating portal session:', errorMessage);
    return NextResponse.json({ error: 'Failed to create portal session' }, { status: 500 });
  }
}
