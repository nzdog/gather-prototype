// src/lib/entitlements.ts
import { prisma } from '@/lib/prisma';

/**
 * Entitlement service for managing event creation and editing permissions
 * based on user billing status.
 *
 * Rules:
 * - FREE: 1 event per rolling 12 months (excluding legacy events)
 * - TRIALING: unlimited
 * - ACTIVE: unlimited
 * - PAST_DUE: can edit existing (within 7 days), cannot create new
 * - CANCELED: read-only (no create, no edit)
 *
 * Legacy events (isLegacy: true) don't count against free tier limits
 * and remain editable regardless of billing status.
 */

const GRACE_PERIOD_DAYS = 7;
const FREE_TIER_LIMIT = 1;
const ROLLING_PERIOD_MONTHS = 12;

/**
 * Checks if a user can create a new event based on their billing status
 * and current event count.
 *
 * @param userId - The user ID to check
 * @returns true if the user can create a new event, false otherwise
 */
export async function canCreateEvent(userId: string): Promise<boolean> {
  // Get user with billing status
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { billingStatus: true },
  });

  if (!user) {
    return false;
  }

  const { billingStatus } = user;

  // TRIALING and ACTIVE users have unlimited events
  if (billingStatus === 'TRIALING' || billingStatus === 'ACTIVE') {
    return true;
  }

  // PAST_DUE and CANCELED users cannot create new events
  if (billingStatus === 'PAST_DUE' || billingStatus === 'CANCELED') {
    return false;
  }

  // FREE users: check if they're within their limit
  if (billingStatus === 'FREE') {
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - ROLLING_PERIOD_MONTHS);

    // Count non-legacy events where user is HOST created in last 12 months
    const eventCount = await prisma.eventRole.count({
      where: {
        userId,
        role: 'HOST',
        createdAt: {
          gte: twelveMonthsAgo,
        },
        event: {
          isLegacy: false,
        },
      },
    });

    return eventCount < FREE_TIER_LIMIT;
  }

  // Default: deny
  return false;
}

/**
 * Checks if a user can edit a specific event based on their billing status
 * and the event's properties.
 *
 * @param userId - The user ID to check
 * @param eventId - The event ID to check
 * @returns true if the user can edit the event, false otherwise
 */
export async function canEditEvent(userId: string, eventId: string): Promise<boolean> {
  // Get user with billing status and subscription
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      billingStatus: true,
      subscription: {
        select: {
          status: true,
          statusChangedAt: true,
        },
      },
    },
  });

  if (!user) {
    return false;
  }

  // Get the event
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { isLegacy: true },
  });

  if (!event) {
    return false;
  }

  // Legacy events are always editable
  if (event.isLegacy) {
    return true;
  }

  const { billingStatus } = user;

  // TRIALING and ACTIVE users can edit all events
  if (billingStatus === 'TRIALING' || billingStatus === 'ACTIVE') {
    return true;
  }

  // FREE users can edit their events
  if (billingStatus === 'FREE') {
    return true;
  }

  // PAST_DUE users: check grace period
  if (billingStatus === 'PAST_DUE') {
    const statusChangedAt = user.subscription?.statusChangedAt;

    if (!statusChangedAt) {
      // No status change timestamp, deny edit
      return false;
    }

    const gracePeriodEnd = new Date(statusChangedAt);
    gracePeriodEnd.setDate(gracePeriodEnd.getDate() + GRACE_PERIOD_DAYS);

    // Can edit if within grace period
    return new Date() <= gracePeriodEnd;
  }

  // CANCELED users cannot edit (unless legacy, which is checked above)
  if (billingStatus === 'CANCELED') {
    return false;
  }

  // Default: deny
  return false;
}

/**
 * Gets the event creation limit for a user based on their billing status.
 *
 * @param userId - The user ID to check
 * @returns The event limit as a number or 'unlimited'
 */
export async function getEventLimit(userId: string): Promise<number | 'unlimited'> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { billingStatus: true },
  });

  if (!user) {
    return 0;
  }

  const { billingStatus } = user;

  // TRIALING and ACTIVE users have unlimited events
  if (billingStatus === 'TRIALING' || billingStatus === 'ACTIVE') {
    return 'unlimited';
  }

  // FREE users have a limit of 1 event per rolling 12 months
  if (billingStatus === 'FREE') {
    return FREE_TIER_LIMIT;
  }

  // PAST_DUE and CANCELED users cannot create new events
  if (billingStatus === 'PAST_DUE' || billingStatus === 'CANCELED') {
    return 0;
  }

  // Default
  return 0;
}

/**
 * Gets the number of remaining events a user can create based on their
 * billing status and current usage.
 *
 * @param userId - The user ID to check
 * @returns The remaining event count as a number or 'unlimited'
 */
export async function getRemainingEvents(userId: string): Promise<number | 'unlimited'> {
  const limit = await getEventLimit(userId);

  // If unlimited, return 'unlimited'
  if (limit === 'unlimited') {
    return 'unlimited';
  }

  // If limit is 0, return 0
  if (limit === 0) {
    return 0;
  }

  // For FREE users, calculate remaining based on rolling 12 months
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { billingStatus: true },
  });

  if (!user || user.billingStatus !== 'FREE') {
    return 0;
  }

  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - ROLLING_PERIOD_MONTHS);

  // Count non-legacy events where user is HOST created in last 12 months
  const eventCount = await prisma.eventRole.count({
    where: {
      userId,
      role: 'HOST',
      createdAt: {
        gte: twelveMonthsAgo,
      },
      event: {
        isLegacy: false,
      },
    },
  });

  const remaining = Math.max(0, limit - eventCount);
  return remaining;
}
