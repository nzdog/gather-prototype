/**
 * [[GTC-411]] — one rule for "which account is this address?", used by both doors that make a
 * User from an email: signing in (POST /api/auth/verify) and paying for an event (POST
 * /api/events).
 *
 * Why: the User table's unique rule on `email` is exact, letter for letter. Before this, both
 * doors looked an address up exactly, so "Nigel@x.com" and "nigel@x.com" opened two different
 * accounts, and a host who typed her address with a capital once could lose sight of her own
 * events. The founder's ruling (27 Oct 2026, option B-plus) is the order below.
 *
 * The order, and why each step is there:
 *
 *   (a) Trim the outer spaces. Nobody means a leading space as part of their address.
 *   (b) Look for the EXACT spelling first and use it if it is there. Where two spellings of one
 *       address already exist as two accounts, the one typed exactly still opens its own
 *       account, so nobody is moved off the account they have been using (ruling 4).
 *   (c) Otherwise look ignoring capitals, then CHECK EVERY CANDIDATE AGAIN IN CODE (trimmed and
 *       lower-cased, equal) and take the oldest (createdAt, then id). The re-check is not
 *       optional: the database's case-blind match may behave as a pattern match, where an
 *       underscore stands for any letter, so "n_gel@x.com" could otherwise open "nigel@x.com".
 *   (d) Otherwise make a new User, stored trimmed and lower-case (ruling 3). Old rows are not
 *       touched.
 *
 * Two sign-ins at once for a new address must not make two Users. The insert below skips a row
 * that would break the unique rule instead of failing (Postgres "ON CONFLICT DO NOTHING"); if it
 * made nothing, another request won the race, so we look again and use the winner's row. A
 * plain create that failed would be no good inside a transaction: in Postgres a failed
 * statement ends the whole transaction, so there would be nothing left to look again with.
 *
 * It takes the Prisma client or a transaction, so the routes call it inside the transactions
 * they already had, and a test can call it on its own.
 */
import type { Prisma, PrismaClient, User } from '@prisma/client';

/** The Prisma client itself, or the `tx` handed to a `$transaction` callback. */
export type UserDb = PrismaClient | Prisma.TransactionClient;

/** How two addresses are compared: outer spaces off, capitals ignored. */
export function sameAddress(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Oldest first: by when the account was made, then by id so a tie always lands the same way. */
function oldest(users: User[]): User {
  return [...users].sort((x, y) => {
    const byTime = x.createdAt.getTime() - y.createdAt.getTime();
    if (byTime !== 0) return byTime;
    return x.id < y.id ? -1 : x.id > y.id ? 1 : 0;
  })[0];
}

export async function findOrCreateUserByEmail(db: UserDb, email: string): Promise<User> {
  // (a)
  const typed = email.trim();
  if (typed === '') {
    throw new Error('findOrCreateUserByEmail: the address is empty');
  }

  // (b)
  const exact = await db.user.findUnique({ where: { email: typed } });
  if (exact) return exact;

  // (c) The database narrows the field; the code decides.
  const candidates = await db.user.findMany({
    where: { email: { equals: typed, mode: 'insensitive' } },
  });
  const same = candidates.filter((u) => sameAddress(u.email, typed));
  if (same.length > 0) return oldest(same);

  // (d)
  const stored = typed.toLowerCase();
  await db.user.createMany({ data: [{ email: stored }], skipDuplicates: true });
  // Whether this request made the row or lost the race to another, the row is there now.
  const made = await db.user.findUnique({ where: { email: stored } });
  if (!made) {
    throw new Error('findOrCreateUserByEmail: the account was neither made nor found');
  }
  return made;
}
