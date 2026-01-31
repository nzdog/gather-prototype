// src/lib/entitlements.ts
// Simplified entitlements for per-event payment model
// Payment verification is now handled at event creation time via Stripe session validation
import { prisma } from '@/lib/prisma';

/**
 * Entitlement service for managing event editing permissions.
 *
 * Per-event payment model:
 * - No event creation limits (payment is the gate at checkout)
 * - Legacy events remain editable
 * - Paid events are always editable by their host
 * - Subscription status is deprecated but kept for migration
 */

/**
 * Checks if a user can create a new event.
 * With per-event payments, this always returns true since payment
 * verification happens during checkout/creation flow.
 *
 * @param userId - The user ID to check
 * @returns true (payment is verified at creation time)
 */
export async function canCreateEvent(_userId: string): Promise<boolean> {
  // No limits - payment is verified during event creation
  return true;
}

/**
 * Checks if a user can edit a specific event.
 * Users can edit events they host, regardless of payment status.
 *
 * @param userId - The user ID to check
 * @param eventId - The event ID to check
 * @returns true if the user has a HOST role for this event
 */
export async function canEditEvent(userId: string, eventId: string): Promise<boolean> {
  // Check if user has HOST or COHOST role for this event
  const eventRole = await prisma.eventRole.findUnique({
    where: {
      userId_eventId: {
        userId,
        eventId,
      },
    },
    select: {
      role: true,
    },
  });

  if (!eventRole) {
    return false;
  }

  // Allow editing if user is HOST or COHOST
  return eventRole.role === 'HOST' || eventRole.role === 'COHOST';
}

/**
 * Gets the event creation limit for a user.
 * With per-event payments, this is always unlimited.
 *
 * @param _userId - The user ID to check
 * @returns 'unlimited'
 */
export async function getEventLimit(_userId: string): Promise<number | 'unlimited'> {
  return 'unlimited';
}

/**
 * Gets the number of remaining events a user can create.
 * With per-event payments, this is always unlimited.
 *
 * @param _userId - The user ID to check
 * @returns 'unlimited'
 */
export async function getRemainingEvents(_userId: string): Promise<number | 'unlimited'> {
  return 'unlimited';
}
