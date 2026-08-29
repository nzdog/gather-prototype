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

  /*
   * GTC-256 (phase 3), RULING 5 + BUILD DECISION 3 — REVOKE, DO NOT MERELY DECLINE.
   *
   * Ruling 8 closes the auto-nudge finder and the decide-by finder BY WITHHOLDING the
   * PARTICIPANT token: both skip with 'No participant token'. That is construction-deep
   * only for as long as no such token exists. Step 4 below has always declined to ISSUE
   * one to a non-PARTICIPANT row — and nothing revoked one already issued, because the
   * cleanup above prunes COORDINATOR tokens and nothing else.
   *
   * SO THIS WAS A ONE-WAY DOOR, AND IT WAS REACHABLE TODAY, WITHOUT ANY BACKFILL. A
   * single `PATCH /api/events/[id]/people/[personId]` setting the host's role to
   * PARTICIPANT minted her one here; setting it back to HOST did not take it away. From
   * that point she was a live auto-nudge recipient, a live decide-by recipient, and a
   * fully claimable name on the shared link — permanently, on a new event. Measured, then
   * pinned in tests/host-never-messaged-test.ts, which asserts the RED state first so the
   * revocation cannot be mistaken for scaffolding.
   *
   * ⚠ DO-NOT-TOUCH ZONE 3, ENTERED DELIBERATELY AND NARROWLY (founder-approved,
   * 2026-08-29: "scoped to role: 'HOST' rows only, structurally symmetric with the
   * existing COORDINATOR prune. Nothing wider.").
   *
   *   - It keys on the WRONG SCOPE FOR THIS ROLE, never on the person: a HOST row must
   *     not hold a PARTICIPANT token. Her HOST token is untouched.
   *   - It reaches no ordinary participant. A `role: 'PARTICIPANT'` row is outside the
   *     query, so the token issuance every guest depends on is unchanged.
   *   - It is NOT the general PARTICIPANT prune the COORDINATOR block performs (revoking
   *     any token that no longer matches current state). That is a wider change to
   *     issuance semantics and would need the full security re-audit Zone 3 requires.
   *
   * This is also build decision 3's requirement for the phase-5 backfill, arriving early:
   * any event re-roled to HOST now has its stale token revoked by the same sweep, so the
   * backfill inherits a mechanism rather than needing to name a separate write.
   */
  const hostRowPersonIds = personEvents.filter((pe) => pe.role === 'HOST').map((pe) => pe.personId);

  if (hostRowPersonIds.length > 0) {
    await db.accessToken.deleteMany({
      where: {
        eventId,
        scope: 'PARTICIPANT',
        personId: { in: hostRowPersonIds },
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

    const url = buildTokenUrl(baseUrl, t.scope, t.token);

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

/**
 * Builds an invite URL for a given scope and token.
 * Exported for unit testing.
 */
export function buildTokenUrl(baseUrl: string, scope: TokenScope, token: string): string {
  const prefix = scope === 'HOST' ? 'h' : scope === 'COORDINATOR' ? 'c' : 'p';
  return `${baseUrl.replace(/\/$/, '')}/${prefix}/${token}`;
}

/**
 * Generates a cryptographically secure, URL-safe token.
 * Used for shared links and other public-facing tokens.
 *
 * @param length - Number of random bytes to generate (default: 32)
 * @returns URL-safe base64url-encoded token string
 */
export function generateSecureToken(length: number = 32): string {
  return randomBytes(length).toString('base64url');
}
