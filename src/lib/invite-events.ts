import { prisma } from './prisma';
import { InviteEventType, Prisma } from '@prisma/client';

interface LogInviteEventParams {
  eventId: string;
  personId?: string;
  type: InviteEventType;
  metadata?: Record<string, unknown>;
}

type PrismaClient = typeof prisma | Prisma.TransactionClient;

export async function logInviteEvent(
  { eventId, personId, type, metadata }: LogInviteEventParams,
  tx?: PrismaClient
): Promise<void> {
  const db = tx || prisma;
  try {
    await db.inviteEvent.create({
      data: {
        eventId,
        personId: personId ?? null,
        type,
        metadata: metadata ? (metadata as any) : undefined,
      },
    });
  } catch (error) {
    // Log but don't throw - instrumentation shouldn't break user flows
    console.error('[InviteEvent] Failed to log event:', { type, eventId, personId, error });
  }
}

export async function getInviteEventsForEvent(eventId: string) {
  return prisma.inviteEvent.findMany({
    where: { eventId },
    include: { person: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getInviteEventsForPerson(personId: string) {
  return prisma.inviteEvent.findMany({
    where: { personId },
    orderBy: { createdAt: 'desc' },
  });
}
