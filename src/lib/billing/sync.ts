// src/lib/billing/sync.ts
import { prisma } from '@/lib/prisma';
import { BillingStatus } from '@prisma/client';
import Stripe from 'stripe';

/**
 * Maps Stripe subscription status to our BillingStatus enum.
 * Stripe is the source of truth for subscription state.
 */
export function mapStripeToBillingStatus(
  stripeStatus: Stripe.Subscription.Status
): BillingStatus {
  switch (stripeStatus) {
    case 'trialing':
      return 'TRIALING';
    case 'active':
      return 'ACTIVE';
    case 'past_due':
      return 'PAST_DUE';
    case 'canceled':
    case 'unpaid':
      return 'CANCELED';
    case 'incomplete':
    case 'incomplete_expired':
      // Treat incomplete subscriptions as free until they're completed
      return 'FREE';
    default:
      console.warn(
        `[Billing Sync] Unknown Stripe status: ${stripeStatus}, defaulting to FREE`
      );
      return 'FREE';
  }
}

/**
 * Syncs a Stripe subscription to the local database.
 * Updates both the Subscription record and User.billingStatus in a transaction.
 *
 * This is the single source of truth for subscription state synchronization.
 * All webhook handlers should call this function.
 *
 * @param subscription - Stripe subscription object from webhook event
 * @returns The updated Subscription record, or null if customer not found
 */
export async function syncSubscriptionFromStripe(
  subscription: Stripe.Subscription
): Promise<{ userId: string; status: BillingStatus } | null> {
  const stripeCustomerId = subscription.customer as string;
  const stripeSubscriptionId = subscription.id;
  const status = mapStripeToBillingStatus(subscription.status);

  console.log('[Billing Sync] Syncing subscription:', {
    stripeCustomerId,
    stripeSubscriptionId,
    stripeStatus: subscription.status,
    mappedStatus: status,
  });

  // Find the subscription record by Stripe customer ID
  const existingSubscription = await prisma.subscription.findUnique({
    where: { stripeCustomerId },
    include: { user: true },
  });

  if (!existingSubscription) {
    console.error(
      '[Billing Sync] No subscription found for Stripe customer:',
      stripeCustomerId
    );
    return null;
  }

  // Extract subscription data
  // Note: In API version 2025-12-15.clover, current_period_start/end moved to subscription items
  const firstItem = subscription.items.data[0];
  const stripePriceId = firstItem?.price.id || null;
  const currentPeriodStart = firstItem?.current_period_start
    ? new Date(firstItem.current_period_start * 1000)
    : new Date();
  const currentPeriodEnd = firstItem?.current_period_end
    ? new Date(firstItem.current_period_end * 1000)
    : new Date();
  const cancelAtPeriodEnd = subscription.cancel_at_period_end;
  const trialStart = subscription.trial_start
    ? new Date(subscription.trial_start * 1000)
    : null;
  const trialEnd = subscription.trial_end
    ? new Date(subscription.trial_end * 1000)
    : null;

  // Check if status is changing to track statusChangedAt
  const statusChanged = existingSubscription.status !== status;
  const statusChangedAt = statusChanged ? new Date() : existingSubscription.statusChangedAt;

  // Update both Subscription and User.billingStatus in a transaction
  // This ensures they stay in sync
  await prisma.$transaction(async (tx) => {
    // Update the subscription record
    await tx.subscription.update({
      where: { id: existingSubscription.id },
      data: {
        stripeSubscriptionId,
        stripePriceId,
        status,
        statusChangedAt,
        currentPeriodStart,
        currentPeriodEnd,
        cancelAtPeriodEnd,
        trialStart,
        trialEnd,
      },
    });

    // Update the user's billing status to match
    await tx.user.update({
      where: { id: existingSubscription.userId },
      data: { billingStatus: status },
    });
  });

  console.log('[Billing Sync] Subscription synced successfully:', {
    userId: existingSubscription.userId,
    status,
    stripeSubscriptionId,
  });

  return {
    userId: existingSubscription.userId,
    status,
  };
}

/**
 * Handles subscription deletion by marking it as CANCELED.
 * This is called when a subscription is deleted in Stripe.
 */
export async function handleSubscriptionDeleted(
  stripeCustomerId: string
): Promise<{ userId: string; status: BillingStatus } | null> {
  console.log('[Billing Sync] Handling subscription deletion:', stripeCustomerId);

  // Find the subscription record
  const existingSubscription = await prisma.subscription.findUnique({
    where: { stripeCustomerId },
  });

  if (!existingSubscription) {
    console.error(
      '[Billing Sync] No subscription found for deleted customer:',
      stripeCustomerId
    );
    return null;
  }

  // Update to CANCELED status in transaction
  await prisma.$transaction(async (tx) => {
    await tx.subscription.update({
      where: { id: existingSubscription.id },
      data: {
        status: 'CANCELED',
        statusChangedAt: new Date(),
        stripeSubscriptionId: null, // Clear the subscription ID since it's deleted
      },
    });

    await tx.user.update({
      where: { id: existingSubscription.userId },
      data: { billingStatus: 'CANCELED' },
    });
  });

  console.log('[Billing Sync] Subscription marked as CANCELED:', {
    userId: existingSubscription.userId,
  });

  return {
    userId: existingSubscription.userId,
    status: 'CANCELED',
  };
}

/**
 * Handles successful invoice payment by ensuring subscription is ACTIVE.
 * This is particularly important for recovering from PAST_DUE status.
 */
export async function handleInvoicePaid(
  stripeCustomerId: string,
  stripeSubscriptionId: string | null
): Promise<{ userId: string; status: BillingStatus } | null> {
  console.log('[Billing Sync] Handling invoice paid:', {
    stripeCustomerId,
    stripeSubscriptionId,
  });

  // Find the subscription record
  const existingSubscription = await prisma.subscription.findUnique({
    where: { stripeCustomerId },
  });

  if (!existingSubscription) {
    console.error(
      '[Billing Sync] No subscription found for customer:',
      stripeCustomerId
    );
    return null;
  }

  // Only update to ACTIVE if we have a subscription ID
  // (invoice.paid can fire for one-time payments too)
  if (!stripeSubscriptionId) {
    console.log('[Billing Sync] Invoice paid but no subscription ID, skipping');
    return null;
  }

  // Update to ACTIVE status in transaction
  await prisma.$transaction(async (tx) => {
    await tx.subscription.update({
      where: { id: existingSubscription.id },
      data: {
        status: 'ACTIVE',
        statusChangedAt: new Date(),
      },
    });

    await tx.user.update({
      where: { id: existingSubscription.userId },
      data: { billingStatus: 'ACTIVE' },
    });
  });

  console.log('[Billing Sync] Subscription marked as ACTIVE after payment:', {
    userId: existingSubscription.userId,
  });

  return {
    userId: existingSubscription.userId,
    status: 'ACTIVE',
  };
}

/**
 * Handles failed invoice payment by marking subscription as PAST_DUE.
 * This triggers grace period logic.
 */
export async function handleInvoicePaymentFailed(
  stripeCustomerId: string
): Promise<{ userId: string; status: BillingStatus } | null> {
  console.log('[Billing Sync] Handling invoice payment failure:', stripeCustomerId);

  // Find the subscription record
  const existingSubscription = await prisma.subscription.findUnique({
    where: { stripeCustomerId },
  });

  if (!existingSubscription) {
    console.error(
      '[Billing Sync] No subscription found for customer:',
      stripeCustomerId
    );
    return null;
  }

  // Update to PAST_DUE status in transaction
  await prisma.$transaction(async (tx) => {
    await tx.subscription.update({
      where: { id: existingSubscription.id },
      data: {
        status: 'PAST_DUE',
        statusChangedAt: new Date(),
      },
    });

    await tx.user.update({
      where: { id: existingSubscription.userId },
      data: { billingStatus: 'PAST_DUE' },
    });
  });

  console.log('[Billing Sync] Subscription marked as PAST_DUE:', {
    userId: existingSubscription.userId,
  });

  return {
    userId: existingSubscription.userId,
    status: 'PAST_DUE',
  };
}
