import type { Prisma } from '@prisma/client';

/**
 * [[GTC-392]] part A — THE SEND WALL. A sample event (`Event.isDemo`) never queues and never sends,
 * whatever the live switch says. Founder plan rulings, 18 Oct 2026.
 *
 * Three layers, so a door that forgets the first is still stopped by the third:
 *   1. the doors refuse before anything is written (the press, the resend door, the by-hand nudge,
 *      trigger-nudges, wrap-up and its retry, the test email);
 *   2. every queue finder leaves sample events out (`isDemo: false` beside its own rule);
 *   3. `sendSms` and the two guest email senders ask here last, after Zone 7's opt-out checks and
 *      the provider's configuration, immediately before the live switch.
 *
 * This module only reads `isDemo`. It reaches no provider and no sender, and takes the client as
 * an argument, so it holds no database handle of its own.
 */

/** W3 — what a host reads when a door refuses on a sample event. */
export const DEMO_SEND_WORDS = 'This is a sample event, so Gather sends nothing from it.';

/** The words a stopped send carries in its result and the log. Never shown to anyone. */
export const DEMO_STOP_WORDS = 'Not sent: this is a sample event';

/**
 * Is this a sample event? NEVER THROWS ON A MISSING EVENT AND NEVER FAILS CLOSED: no id, or no such
 * event, reads "not a demo", so a sender called with a made-up id behaves exactly as it did before.
 */
export async function isDemoEvent(
  db: Pick<Prisma.TransactionClient, 'event'>,
  eventId: string | null | undefined
): Promise<boolean> {
  if (typeof eventId !== 'string' || eventId.length === 0) return false;
  const event = await db.event.findUnique({ where: { id: eventId }, select: { isDemo: true } });
  return event?.isDemo === true;
}
