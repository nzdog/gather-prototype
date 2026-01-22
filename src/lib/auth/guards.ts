/**
 * Authentication & Authorization Guards
 *
 * Fail-closed security guards for API routes.
 * All guards return Response objects on failure for consistent error handling.
 *
 * Design principles:
 * - Fail-closed: Deny access by default
 * - Explicit: Require specific roles/scopes
 * - Consistent: Same error codes across all routes
 */

import { NextResponse } from 'next/server';
import { getUser } from './session';
import { resolveToken } from '../auth';
import type { AuthContext } from '../auth';
import type { User, Event, TokenScope } from '@prisma/client';
import { prisma } from '../prisma';

/**
 * Event role types that can be authorized
 */
type EventRoleType = 'HOST' | 'COHOST' | 'COORDINATOR';

/**
 * Result of successful event role authorization
 */
export interface EventRoleAuth {
  user: User;
  role: EventRoleType;
  eventId: string;
}

/**
 * Requires authenticated user with specific event role.
 *
 * Returns 401 if no session, 403 if user lacks required role.
 *
 * @param eventId - The event ID to check role for
 * @param allowedRoles - Array of roles that are allowed (e.g., ['HOST', 'COORDINATOR'])
 * @returns EventRoleAuth if authorized, NextResponse error if not
 *
 * @example
 * const auth = await requireEventRole(eventId, ['HOST']);
 * if (auth instanceof NextResponse) return auth; // Auth failed
 * // Auth succeeded, use auth.user and auth.role
 */
export async function requireEventRole(
  eventId: string,
  allowedRoles: EventRoleType[]
): Promise<EventRoleAuth | NextResponse> {
  // 1. Require authenticated user session
  const user = await getUser();
  if (!user) {
    console.error('[Auth] Session auth failed: No authenticated user', { eventId, allowedRoles });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Check if user has a role for this event
  const eventRole = await prisma.eventRole.findFirst({
    where: {
      userId: user.id,
      eventId,
      role: { in: allowedRoles },
    },
  });

  if (!eventRole) {
    console.error('[Auth] Event role check failed: User lacks required role', {
      userId: user.id,
      eventId,
      allowedRoles,
    });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return {
    user,
    role: eventRole.role as EventRoleType,
    eventId,
  };
}

/**
 * Requires valid access token with specific scope.
 *
 * Returns 401 if token invalid/expired, 403 if wrong scope.
 *
 * @param token - The access token string
 * @param requiredScope - The scope required (HOST, COORDINATOR, PARTICIPANT)
 * @returns AuthContext if authorized, NextResponse error if not
 *
 * @example
 * const context = await requireTokenScope(token, 'HOST');
 * if (context instanceof NextResponse) return context; // Auth failed
 * // Auth succeeded, use context.person, context.event, etc.
 */
export async function requireTokenScope(
  token: string,
  requiredScope: TokenScope
): Promise<AuthContext | NextResponse> {
  const context = await resolveToken(token);

  if (!context) {
    console.error('[Auth] Token auth failed: Invalid or expired token', {
      tokenPrefix: token.substring(0, 8),
      requiredScope,
    });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (context.scope !== requiredScope) {
    console.error('[Auth] Token scope check failed: Insufficient scope', {
      tokenPrefix: token.substring(0, 8),
      requiredScope,
      actualScope: context.scope,
    });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return context;
}

/**
 * Validates that event status allows mutations.
 *
 * FROZEN events block modifications unless override is allowed.
 *
 * @param event - The event to check
 * @param allowOverride - If true, HOST can override frozen state
 * @returns void if allowed, NextResponse error if blocked
 *
 * @example
 * const block = requireNotFrozen(event);
 * if (block) return block; // Mutation blocked
 * // Mutation allowed, proceed
 */
export function requireNotFrozen(event: Event, allowOverride = false): NextResponse | void {
  if (event.status === 'FROZEN' && !allowOverride) {
    console.error('[Auth] Mutation blocked: Event is FROZEN', {
      eventId: event.id,
      eventStatus: event.status,
      allowOverride,
    });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (event.status === 'COMPLETE') {
    console.error('[Auth] Mutation blocked: Event is COMPLETE', {
      eventId: event.id,
      eventStatus: event.status,
    });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
}

/**
 * Validates that coordinator token has team-scoped access.
 *
 * Ensures coordinator can only access their assigned team.
 *
 * @param context - The auth context from resolveToken
 * @param teamId - The team ID being accessed
 * @returns void if allowed, NextResponse error if team mismatch
 */
export function requireTeamAccess(context: AuthContext, teamId: string): NextResponse | void {
  if (context.scope === 'COORDINATOR') {
    if (!context.team || context.team.id !== teamId) {
      console.error('[Auth] Team access denied: Coordinator accessing wrong team', {
        scope: context.scope,
        coordinatorTeamId: context.team?.id,
        requestedTeamId: teamId,
      });
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }
}

/**
 * Validates that person belongs to same team as item.
 *
 * Used during assignment to enforce team consistency.
 *
 * @param personTeamId - The team ID of the person
 * @param itemTeamId - The team ID of the item
 * @returns void if same team, NextResponse error if mismatch
 */
export function requireSameTeam(personTeamId: string, itemTeamId: string): NextResponse | void {
  if (personTeamId !== itemTeamId) {
    console.error('[Auth] Team assignment validation failed: Person and item in different teams', {
      personTeamId,
      itemTeamId,
    });
    return NextResponse.json({ error: 'Bad Request' }, { status: 400 });
  }
}

/**
 * Multi-role guard: Allows event role OR token scope.
 *
 * Useful for routes accessible by both session users and token links.
 *
 * Auth flow:
 * 1. Try session-based event role auth (requireEventRole checks user internally)
 * 2. If that fails AND token provided, try token-based auth
 * 3. If both fail, return 401
 *
 * SECURITY: Token auth MUST be attempted if token provided, regardless of session state.
 * The previous implementation had a logic error where pre-checking user existence
 * created an unnecessary dependency between session and token auth paths.
 *
 * @param eventId - The event ID to check
 * @param allowedEventRoles - Roles allowed via session auth
 * @param token - Optional token for token-based auth
 * @param allowedTokenScope - Scope allowed via token auth
 * @returns Auth result or error response
 */
export async function requireEventRoleOrToken(
  eventId: string,
  allowedEventRoles: EventRoleType[],
  token?: string,
  allowedTokenScope?: TokenScope
): Promise<EventRoleAuth | AuthContext | NextResponse> {
  // SECURITY: Try session-based auth first (requireEventRole checks user internally)
  // Don't pre-check user existence - let requireEventRole handle it
  const eventAuth = await requireEventRole(eventId, allowedEventRoles);
  if (!(eventAuth instanceof NextResponse)) {
    return eventAuth; // Session auth succeeded
  }

  // SECURITY: Session auth failed - try token-based auth if token provided
  // This MUST be attempted regardless of whether a user session exists
  if (token && allowedTokenScope) {
    const tokenAuth = await requireTokenScope(token, allowedTokenScope);
    if (!(tokenAuth instanceof NextResponse)) {
      return tokenAuth; // Token auth succeeded
    }
  }

  // Both auth methods failed
  console.error('[Auth] Multi-auth failed: Both session and token auth failed', {
    eventId,
    allowedEventRoles,
    tokenProvided: !!token,
    allowedTokenScope,
  });
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
