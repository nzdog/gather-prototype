import { prisma } from '@/lib/prisma';

/**
 * Check if a phone number has opted out from a specific host
 */
export async function isOptedOut(phoneNumber: string, hostId: string): Promise<boolean> {
  const optOut = await prisma.smsOptOut.findUnique({
    where: {
      phoneNumber_hostId: {
        phoneNumber,
        hostId,
      },
    },
  });

  return !!optOut;
}

/**
 * Get all opt-outs for a host
 */
export async function getOptOutsForHost(hostId: string) {
  return prisma.smsOptOut.findMany({
    where: { hostId },
    orderBy: { optedOutAt: 'desc' },
  });
}

/**
 * Get opt-out status for multiple phone numbers (efficient batch check)
 */
export async function getOptOutStatuses(
  phoneNumbers: string[],
  hostId: string
): Promise<Map<string, boolean>> {
  const optOuts = await prisma.smsOptOut.findMany({
    where: {
      phoneNumber: { in: phoneNumbers },
      hostId,
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
 * Manually opt out a number (e.g., if host reports it)
 */
export async function manualOptOut(
  phoneNumber: string,
  hostId: string,
  reason?: string
): Promise<void> {
  await prisma.smsOptOut.upsert({
    where: {
      phoneNumber_hostId: { phoneNumber, hostId },
    },
    create: {
      phoneNumber,
      hostId,
      rawMessage: reason || 'Manual opt-out',
    },
    update: {
      optedOutAt: new Date(),
      rawMessage: reason || 'Manual opt-out',
    },
  });
}

/**
 * Remove opt-out (if someone wants to re-subscribe)
 * Note: Be careful with this - users should explicitly re-subscribe
 */
export async function removeOptOut(phoneNumber: string, hostId: string): Promise<boolean> {
  try {
    await prisma.smsOptOut.delete({
      where: {
        phoneNumber_hostId: { phoneNumber, hostId },
      },
    });
    return true;
  } catch {
    return false; // Didn't exist
  }
}
