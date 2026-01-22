import { randomBytes } from 'crypto';
import { prisma } from './prisma';
import type { TokenScope, Prisma } from '@prisma/client';

export interface InviteLink {
  personId: string;
  personName: string;
  role: string;
  scope: TokenScope;
  teamId: string | null;
  teamName: string | null;
  token: string;
  url: string;
}

type PrismaClient = typeof prisma | Prisma.TransactionClient;

/**
 * Ensures all necessary access tokens exist for an event.
 * This function is idempotent - safe to call multiple times.
 *
 * Token creation rules:
 * - HOST token for event.hostId
 * - HOST token for event.coHostId (if present)
 * - COORDINATOR token for each team's coordinatorId (with teamId)
 * - PARTICIPANT token for each PersonEvent with role=PARTICIPANT (without teamId)
 *
 * NOTE: Coordinators do NOT receive PARTICIPANT tokens.
 * The coordinator view already shows their personal assignments.
 *
 * @param eventId - Event to ensure tokens for
 * @param tx - Optional transaction client for atomic operations
 */
export async function ensureEventTokens(eventId: string, tx?: PrismaClient): Promise<void> {
  const db = tx || prisma;

  // Fetch all necessary data in one query
  const event = await db.event.findUnique({
    where: { id: eventId },
    include: {
      host: true,
      coHost: true,
      teams: {
        include: {
          coordinator: true,
        },
      },
    },
  });

  if (!event) {
    throw new Error(`Event ${eventId} not found`);
  }

  // Fetch all PersonEvents for this event
  const personEvents = await db.personEvent.findMany({
    where: { eventId },
    include: {
      person: true,
      team: true,
    },
  });

  // CLEANUP STEP: Remove orphaned coordinator tokens
  // Build a set of valid coordinator tokens (teamId -> personId)
  const validCoordinatorTokens = new Set<string>();
  for (const team of event.teams) {
    if (team.coordinatorId) {
      validCoordinatorTokens.add(`${team.id}-${team.coordinatorId}`);
    }
  }

  // Also include coordinators from PersonEvent role (backup)
  for (const pe of personEvents) {
    if (pe.role === 'COORDINATOR' && pe.teamId) {
      validCoordinatorTokens.add(`${pe.teamId}-${pe.personId}`);
    }
  }

  // Delete coordinator tokens that don't match current state
  const existingCoordinatorTokens = await db.accessToken.findMany({
    where: {
      eventId,
      scope: 'COORDINATOR',
    },
    select: {
      id: true,
      teamId: true,
      personId: true,
    },
  });

  const tokensToDelete = existingCoordinatorTokens.filter((token) => {
    if (!token.teamId) return true; // Coordinator tokens should always have teamId
    const key = `${token.teamId}-${token.personId}`;
    return !validCoordinatorTokens.has(key);
  });

  if (tokensToDelete.length > 0) {
    await db.accessToken.deleteMany({
      where: {
        id: { in: tokensToDelete.map((t) => t.id) },
      },
    });
  }

  // Fetch all existing tokens for this event in ONE query
  const existingTokens = await db.accessToken.findMany({
    where: { eventId },
    select: {
      personId: true,
      scope: true,
      teamId: true,
    },
  });

  // Build a Set of existing token keys for O(1) lookup
  const existingKeys = new Set(
    existingTokens.map((t) => `${t.personId}-${t.scope}-${t.teamId || 'null'}`)
  );

  // Helper to check if token exists
  const tokenExists = (personId: string, scope: TokenScope, teamId: string | null): boolean => {
    return existingKeys.has(`${personId}-${scope}-${teamId || 'null'}`);
  };

  // Collect tokens to create
  const tokensToCreate: Array<{
    token: string;
    scope: TokenScope;
    personId: string;
    eventId: string;
    teamId: string | null;
    expiresAt: Date;
  }> = [];

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 90); // 90 days from now

  // 1. HOST token for hostId
  if (!tokenExists(event.hostId, 'HOST', null)) {
    tokensToCreate.push({
      token: generateToken(),
      scope: 'HOST',
      personId: event.hostId,
      eventId,
      teamId: null,
      expiresAt,
    });
  }

  // 2. HOST token for coHostId (if present)
  if (event.coHostId && !tokenExists(event.coHostId, 'HOST', null)) {
    tokensToCreate.push({
      token: generateToken(),
      scope: 'HOST',
      personId: event.coHostId,
      eventId,
      teamId: null,
      expiresAt,
    });
  }

  // 3. COORDINATOR tokens for each team's coordinator (via team.coordinatorId)
  for (const team of event.teams) {
    if (team.coordinatorId && !tokenExists(team.coordinatorId, 'COORDINATOR', team.id)) {
      tokensToCreate.push({
        token: generateToken(),
        scope: 'COORDINATOR',
        personId: team.coordinatorId,
        eventId,
        teamId: team.id,
        expiresAt,
      });
    }
  }

  // 3b. COORDINATOR tokens for anyone with PersonEvent.role = COORDINATOR
  // This handles cases where people are added as coordinators via the People section
  // but are not set as team.coordinatorId
  for (const pe of personEvents) {
    if (pe.role === 'COORDINATOR' && !tokenExists(pe.personId, 'COORDINATOR', pe.teamId)) {
      tokensToCreate.push({
        token: generateToken(),
        scope: 'COORDINATOR',
        personId: pe.personId,
        eventId,
        teamId: pe.teamId,
        expiresAt,
      });
    }
  }

  // 4. PARTICIPANT tokens for PersonEvents with role=PARTICIPANT only
  // NOTE: Coordinators do NOT get PARTICIPANT tokens
  // Build set of all coordinator person IDs (both team.coordinatorId AND PersonEvent.role = COORDINATOR)
  const coordinatorIds = new Set([
    ...event.teams.map((t) => t.coordinatorId).filter(Boolean),
    ...personEvents.filter((pe) => pe.role === 'COORDINATOR').map((pe) => pe.personId),
  ]);

  for (const pe of personEvents) {
    // Only create PARTICIPANT tokens for people with PARTICIPANT role
    // AND who are NOT coordinators
    if (pe.role === 'PARTICIPANT' && !coordinatorIds.has(pe.personId)) {
      if (!tokenExists(pe.personId, 'PARTICIPANT', null)) {
        tokensToCreate.push({
          token: generateToken(),
          scope: 'PARTICIPANT',
          personId: pe.personId,
          eventId,
          teamId: null,
          expiresAt,
        });
      }
    }
  }

  // Batch insert all missing tokens
  if (tokensToCreate.length > 0) {
    await db.accessToken.createMany({
      data: tokensToCreate,
      skipDuplicates: true, // Extra safety layer
    });
  }
}

/**
 * Lists all invite links for an event.
 * Returns ALL tokens, including existing ones.
 *
 * @param eventId - Event to list invite links for
 * @returns Array of invite link DTOs
 */
export async function listInviteLinks(eventId: string): Promise<InviteLink[]> {
  const tokens = await prisma.accessToken.findMany({
    where: { eventId },
    include: {
      person: {
        select: {
          id: true,
          name: true,
        },
      },
      team: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: [
      { scope: 'asc' }, // HOST first, then COORDINATOR, then PARTICIPANT
      { person: { name: 'asc' } },
    ],
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || '';

  return tokens.map((t) => {
    // Determine role from scope and team
    let role = '';
    if (t.scope === 'HOST') {
      role = 'Host';
    } else if (t.scope === 'COORDINATOR') {
      role = 'Coordinator';
    } else {
      role = 'Participant';
    }

    // Determine URL prefix based on scope
    const prefix = t.scope === 'HOST' ? 'h' : t.scope === 'COORDINATOR' ? 'c' : 'p';
    const url = `${baseUrl}/${prefix}/${t.token}`;

    return {
      personId: t.person.id,
      personName: t.person.name,
      role,
      scope: t.scope,
      teamId: t.team?.id || null,
      teamName: t.team?.name || null,
      token: t.token,
      url,
    };
  });
}

/**
 * Generates a random token string.
 * Uses 32 random bytes encoded as hex (64 characters).
 */
function generateToken(): string {
  return randomBytes(32).toString('hex');
}
