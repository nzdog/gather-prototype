/**
 * GTC-196 (A3b) — resolving the Person behind a session-authenticated request.
 *
 * `requireEventRole` returns a `User` (a login account). The ledger records a `Person`
 * (someone in a plan). Five routes had already grown the same find-or-create block
 * inline; wiring the ledger would have made it a dozen. One place instead.
 */

import { prisma } from '../prisma';
import type { Person, User } from '@prisma/client';
import type { ActorKind, LedgerActor } from '../ledger';

/**
 * The Person for a signed-in User, created on first need.
 *
 * The create-if-missing branch is migration support that predates this helper: User
 * and Person were introduced at different times, so an account can exist without a
 * Person row until it first acts on a plan.
 */
export async function personForUser(user: Pick<User, 'id' | 'email'>): Promise<Person> {
  const existing = await prisma.person.findFirst({ where: { userId: user.id } });
  if (existing) return existing;

  return prisma.person.create({
    data: {
      name: user.email.split('@')[0],
      email: user.email,
      userId: user.id,
    },
  });
}

/**
 * The ledger actor for a signed-in User acting under an event role.
 *
 * COORDINATOR is carried through faithfully: the why-scope rule is actor-agnostic
 * (ruled 2026-08-03), but the history should say who.
 */
export async function ledgerActorForUser(
  user: Pick<User, 'id' | 'email'>,
  role: 'HOST' | 'COHOST' | 'COORDINATOR'
): Promise<LedgerActor> {
  const person = await personForUser(user);
  return { id: person.id, kind: role as ActorKind, name: person.name };
}
