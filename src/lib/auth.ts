import { prisma } from './prisma';
import type { Person, Event, Team, TokenScope } from '@prisma/client';

export interface AuthContext {
  person: Person;
  event: Event;
  team?: Team;
  scope: TokenScope;
}

/**
 * Resolves an access token and returns the authenticated context.
 *
 * Validation rules:
 * 1. Token must exist and not be expired
 * 2. For COORDINATOR tokens:
 *    - token.teamId must be non-null
 *    - token.teamId must match PersonEvent.teamId for (personId, eventId)
 *    - If mismatch, return null (invalid token)
 * 3. Return { person, event, team (for COORDINATOR), scope }
 *
 * @param token - The access token string
 * @returns AuthContext if valid, null if invalid/expired
 */
export async function resolveToken(token: string): Promise<AuthContext | null> {
  console.log(`[Auth] Resolving token: ${token.substring(0, 16)}...`);

  // 1. Find token
  const accessToken = await prisma.accessToken.findUnique({
    where: { token },
    include: {
      person: true,
      event: true,
      team: true,
    },
  });

  if (!accessToken) {
    console.log(`[Auth] Token not found in database`);
    return null;
  }

  console.log(
    `[Auth] Token found - scope: ${accessToken.scope}, person: ${accessToken.person?.name || 'NULL'}, event: ${accessToken.event?.name || 'NULL'}`
  );

  // 2. Check expiration
  if (accessToken.expiresAt && accessToken.expiresAt < new Date()) {
    console.log(`[Auth] Token expired`);
    return null;
  }

  // 3. For COORDINATOR tokens, validate team access
  if (accessToken.scope === 'COORDINATOR') {
    // COORDINATOR tokens MUST have teamId
    if (!accessToken.teamId) {
      return null;
    }

    // Get the team to check coordinatorId
    const team = await prisma.team.findUnique({
      where: { id: accessToken.teamId },
    });

    if (!team) {
      console.log(`[Auth] COORDINATOR token team not found`);
      return null;
    }

    // Verify the person's PersonEvent.teamId matches the token.teamId
    const personEvent = await prisma.personEvent.findFirst({
      where: {
        personId: accessToken.personId,
        eventId: accessToken.eventId,
      },
    });

    // Allow access if EITHER:
    // 1. PersonEvent.teamId matches token.teamId (regular coordinator added via People section)
    // 2. Person is the team.coordinatorId (Demo Host or team coordinator)
    const hasPersonEventMatch = personEvent && personEvent.teamId === accessToken.teamId;
    const isTeamCoordinator = team.coordinatorId === accessToken.personId;

    if (!hasPersonEventMatch && !isTeamCoordinator) {
      // Team mismatch - invalid token
      console.log(`[Auth] COORDINATOR token team mismatch`);
      return null;
    }

    // Return context with team
    console.log(`[Auth] Returning COORDINATOR context`);
    return {
      person: accessToken.person,
      event: accessToken.event,
      team: accessToken.team!,
      scope: accessToken.scope,
    };
  }

  // 4. For HOST and PARTICIPANT tokens, return without team
  console.log(`[Auth] Returning ${accessToken.scope} context`);
  return {
    person: accessToken.person,
    event: accessToken.event,
    scope: accessToken.scope,
  };
}

/**
 * Gets all events for a user along with their role in each event.
 *
 * @param userId - The user ID to fetch events for
 * @returns Array of events with their associated role (HOST, COHOST, or COORDINATOR)
 */
export async function getUserEventsWithRole(userId: string) {
  const eventRoles = await prisma.eventRole.findMany({
    where: { userId },
    include: {
      event: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return eventRoles.map((eventRole) => ({
    event: eventRole.event,
    role: eventRole.role,
    eventRoleId: eventRole.id,
    createdAt: eventRole.createdAt,
  }));
}
