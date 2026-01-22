// src/app/api/billing/cancel/route.ts
import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/session';
import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/billing/cancel
 *
 * Cancels the user's subscription at the end of the current billing period.
 * The user retains ACTIVE status until currentPeriodEnd, then Stripe webhook
 * will set status to CANCELED.
 *
 * Flow:
 * 1. Get authenticated user
 * 2. Find their subscription
 * 3. Call stripe.subscriptions.update() with cancel_at_period_end: true
 * 4. Update local Subscription.cancelAtPeriodEnd = true
 * 5. Return success with period end date
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

    if (!subscription.stripeSubscriptionId) {
      return NextResponse.json({ error: 'No active subscription to cancel' }, { status: 400 });
    }

    // Check if already canceled
    if (subscription.cancelAtPeriodEnd) {
      return NextResponse.json({
        message: 'Subscription already scheduled for cancellation',
        cancelAtPeriodEnd: true,
        currentPeriodEnd: subscription.currentPeriodEnd,
      });
    }

    console.log('[Cancel] Canceling subscription:', subscription.stripeSubscriptionId);

    // Update Stripe subscription to cancel at period end
    const stripeSubscription = await stripe.subscriptions.update(
      subscription.stripeSubscriptionId,
      {
        cancel_at_period_end: true,
      }
    );

    console.log('[Cancel] Stripe subscription updated:', {
      id: stripeSubscription.id,
      cancel_at_period_end: stripeSubscription.cancel_at_period_end,
    });

    // Update local subscription record
    const updatedSubscription = await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        cancelAtPeriodEnd: true,
      },
    });

    console.log('[Cancel] Local subscription updated:', {
      userId: user.id,
      cancelAtPeriodEnd: true,
      currentPeriodEnd: updatedSubscription.currentPeriodEnd,
    });

    return NextResponse.json({
      success: true,
      message: 'Subscription scheduled for cancellation',
      cancelAtPeriodEnd: true,
      currentPeriodEnd: updatedSubscription.currentPeriodEnd,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Cancel] Error canceling subscription:', errorMessage);
    return NextResponse.json({ error: 'Failed to cancel subscription' }, { status: 500 });
  }
}
