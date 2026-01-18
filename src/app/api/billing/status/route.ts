// src/app/api/billing/status/route.ts
import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/billing/status
 *
 * Returns the user's current billing status and subscription details.
 */
export async function GET(_req: Request) {
  try {
    // Get authenticated user
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user with subscription
    const userWithSubscription = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        billingStatus: true,
        subscription: {
          select: {
            status: true,
            cancelAtPeriodEnd: true,
            currentPeriodStart: true,
            currentPeriodEnd: true,
            stripeSubscriptionId: true,
            stripePriceId: true,
            trialEnd: true,
          },
        },
      },
    });

    if (!userWithSubscription) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      billingStatus: userWithSubscription.billingStatus,
      subscription: userWithSubscription.subscription,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Billing Status] Error fetching status:', errorMessage);
    return NextResponse.json(
      { error: 'Failed to fetch billing status' },
      { status: 500 }
    );
  }
}
