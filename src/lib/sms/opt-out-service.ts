import { prisma } from '@/lib/prisma';

/**
 * [[GTC-288]] — AN OPT-OUT IS ACCOUNT-WIDE, ON THE PHONE NUMBER (founder ruling, 2026-09-12).
 *
 * A number is opted out of texts from Gather when ANY `SmsOptOut` row for it is IN FORCE — not
 * closed by a START. One number may hold several rows (an opt-out, an opt-in, a later opt-out; or
 * two rows recorded per host before this ticket), so every reader asks this one question, with this
 * one fragment, and none filters by host. The number is matched exactly as stored: E.164, the form
 * `sendSms` requires of `to`.
 *
 * Do-Not-Touch Zone 7.
 */
export const SMS_OPT_OUT_IN_FORCE = { optedInAt: null } as const;

/**
 * Has this number opted out of texts from Gather, for every host?
 */
export async function isOptedOut(phoneNumber: string): Promise<boolean> {
  const optOut = await prisma.smsOptOut.findFirst({
    where: { phoneNumber, ...SMS_OPT_OUT_IN_FORCE },
    select: { id: true },
  });

  return !!optOut;
}

/**
 * The opt-outs in force that cover this host's guests: rows for any number held by a person on one
 * of the host's events. (Per host before [[GTC-288]]; no caller.)
 */
export async function getOptOutsForHost(hostId: string) {
  const people = await prisma.person.findMany({
    where: { eventMemberships: { some: { event: { hostId } } }, phoneNumber: { not: null } },
    select: { phoneNumber: true },
  });
  const phones = [...new Set(people.map((p) => p.phoneNumber!))];
  return prisma.smsOptOut.findMany({
    where: { phoneNumber: { in: phones }, ...SMS_OPT_OUT_IN_FORCE },
    orderBy: { optedOutAt: 'desc' },
  });
}

/**
 * Get opt-out status for multiple phone numbers (efficient batch check), account-wide.
 */
export async function getOptOutStatuses(phoneNumbers: string[]): Promise<Map<string, boolean>> {
  const optOuts = await prisma.smsOptOut.findMany({
    where: {
      phoneNumber: { in: phoneNumbers },
      ...SMS_OPT_OUT_IN_FORCE,
    },
    select: { phoneNumber: true },
  });

  const optedOutSet = new Set(optOuts.map((o) => o.phoneNumber));

  const result = new Map<string, boolean>();
  phoneNumbers.forEach((phone) => {
    result.set(phone, optedOutSet.has(phone));
  });

  return result;
}

/**
 * Manually opt out a number (e.g., if host reports it).
 *
 * ⚠ NO CALLER. Since [[GTC-288]] an opt-out is account-wide, so a caller here silences the number
 * for EVERY host — giving it one is a decision for whoever does. A row is opened only if none is in
 * force; it touches no `Person.smsOptedOut` flag, as before.
 */
export async function manualOptOut(phoneNumber: string, reason?: string): Promise<void> {
  if (await isOptedOut(phoneNumber)) return;
  await prisma.smsOptOut.create({
    data: {
      phoneNumber,
      rawMessage: reason || 'Manual opt-out',
      attribution: 'MANUAL',
    },
  });
}

/**
 * Remove opt-out (if someone wants to re-subscribe).
 * Note: Be careful with this - users should explicitly re-subscribe
 *
 * ⚠ NO CALLER. Since [[GTC-288]] it CLOSES every row in force for the number (`optedInAt`) and keeps
 * them — the history stays, as a START keeps it — rather than deleting a host's row. It touches no
 * `Person.smsOptedOut` flag, as before. True if anything was in force.
 */
export async function removeOptOut(phoneNumber: string): Promise<boolean> {
  const closed = await prisma.smsOptOut.updateMany({
    where: { phoneNumber, ...SMS_OPT_OUT_IN_FORCE },
    data: { optedInAt: new Date() },
  });
  return closed.count > 0;
}
