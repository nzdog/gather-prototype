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
    }
  });

  if (!accessToken) {
    console.log(`[Auth] Token not found in database`);
    return null;
  }

  console.log(`[Auth] Token found - scope: ${accessToken.scope}, person: ${accessToken.person?.name || 'NULL'}, event: ${accessToken.event?.name || 'NULL'}`);

  // 2. Check expiration
  if (accessToken.expiresAt && accessToken.expiresAt < new Date()) {
    console.log(`[Auth] Token expired`);
    return null;
  }

  // 3. For COORDINATOR tokens, validate teamId matches PersonEvent.teamId
  if (accessToken.scope === 'COORDINATOR') {
    // COORDINATOR tokens MUST have teamId
    if (!accessToken.teamId) {
      return null;
    }

    // Verify the person's PersonEvent.teamId matches the token.teamId
    const personEvent = await prisma.personEvent.findFirst({
      where: {
        personId: accessToken.personId,
        eventId: accessToken.eventId,
      }
    });

    if (!personEvent || personEvent.teamId !== accessToken.teamId) {
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
