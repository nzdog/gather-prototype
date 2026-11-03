import type { Prisma, PrismaClient } from '@prisma/client';
import { nzDayStart } from '@/lib/lifecycle';
import { copyEventWhere, DEMO_COPY_EMAIL_DOMAIN } from '@/lib/demo/copy';

/**
 * [[GTC-442]] — THE CLEAN-UP: an expired sample copy goes, with everything a visitor made in it.
 * Founder rulings, 1 Nov 2026 (GTC-392 parts C and D, Q9 and Q11).
 *
 * A copy is expired once it was started (its Event.createdAt) before today's NZ midnight AND more
 * than two hours ago, so its two-hour session is over and today's copies stay: the start limit
 * and the AI day total count today's copies, and deleting one would lower them.
 *
 * Oldest first, at most 25 deleted a run (up to 100 looked at, so a copy that is skipped or
 * fails never holds a place), each copy in its own transaction. Per copy: the event, its host
 * Person, the host's account (its address must be a copy's made-up one, else the copy is skipped)
 * and every Person whose sampleEventId is this copy ([[GTC-441]]). The marker is what finds a
 * person removed mid-visit (a household delete, a person delete, a household edit): no membership
 * points at them any more. The copy is skipped if a WrapUpLink exists (the send wall means none
 * can); a collected person who belongs to another event is kept (T2 means none can). Then the
 * host's StructureTemplate and QuantitiesProfile rows go, then the event (its cascade takes the
 * memberships, households, teams, items, roles, tokens and ledger), then the collected people,
 * then the account (its cascade takes its Session and EventRole rows).
 *
 * [[GTC-448]] — THE SECOND PASS: A COPY ITS VISITOR DELETED. She may delete her own copy (DELETE
 * /api/events/[id] admits the host); the first pass finds copies by their event, so it never sees
 * hers again. What the delete leaves: her account, its session, Sam, and every Person stamped with
 * the gone copy's id. The second pass finds such an ORPHAN ACCOUNT: a copy's made-up address,
 * created before today's NZ midnight and more than two hours ago (the account is written in the
 * same transaction as the copy, so its createdAt is when the copy started), with no role, and none
 * of its people hosting, co-hosting or belonging to any event. Its people are its own (Sam) and
 * every Person stamped with Sam's mark, when no event has that id. The same guards: an address not
 * a copy's is skipped; a WrapUpLink on any of them skips the account; a person who belongs to
 * another event (or hosts or co-hosts one) is kept. Its own limits: up to 100 looked at, at most 25
 * deleted, oldest first; one transaction each; a skip or a failure uses no place.
 *
 * Zone 2, as founder ruling Q11 reads GTC-269: demo code deleting copy accounts and their
 * sessions; nothing in the sign-in code changes. It sends nothing. It logs counts only, never a
 * name, an address or an id.
 */

export const DEMO_CLEANUP = {
  /** Copies deleted in one run, at most. The second pass has its own 25. */
  perRun: 25,
  /**
   * Expired copies looked at in one run, oldest first. A copy that is skipped or fails uses no
   * place among the 25, so copies that cannot go never stop the ones behind them. The second pass
   * has its own 100.
   */
  lookAt: 100,
  /** A copy younger than this is never expired: its session may still be open. */
  minAgeMs: 2 * 60 * 60 * 1000,
} as const;

/** The instant a copy must have been started before to be expired at `now`. */
export function expiredBefore(now: Date): Date {
  return new Date(Math.min(nzDayStart(now).getTime(), now.getTime() - DEMO_CLEANUP.minAgeMs));
}

/** Expired: started before today's NZ midnight and more than two hours before `now`. */
export function isExpiredCopy(startedAt: Date, now: Date): boolean {
  return startedAt.getTime() < expiredBefore(now).getTime();
}

export type CopyOutcome =
  | { kind: 'deleted'; people: number; peopleKept: number; sessions: number; templates: number }
  | { kind: 'skipped'; why: 'not a copy account' | 'a wrap-up link exists' }
  | { kind: 'gone' };

export type OrphanOutcome =
  | { kind: 'deleted'; people: number; peopleKept: number; sessions: number; templates: number }
  | {
      kind: 'skipped';
      why: 'not a copy account' | 'its copy still exists' | 'a wrap-up link exists';
    }
  | { kind: 'gone' };

export interface DemoCleanupCounts {
  found: number;
  deleted: number;
  skipped: number;
  failed: number;
  /** [[GTC-448]] the second pass: orphan accounts looked at, deleted, skipped, failed. */
  orphansFound: number;
  orphansDeleted: number;
  orphansSkipped: number;
  orphansFailed: number;
  /** Rows, both passes together. */
  people: number;
  peopleKept: number;
  accounts: number;
  sessions: number;
  templates: number;
}

function isCopyAccount(address: string | null | undefined): boolean {
  return (
    typeof address === 'string' && address.toLowerCase().endsWith(`@${DEMO_COPY_EMAIL_DOMAIN}`)
  );
}

/** One copy, in its own transaction. Exported for its suite; the sweep is the caller. */
export async function sweepOneCopy(db: PrismaClient, eventId: string): Promise<CopyOutcome> {
  return db.$transaction(
    async (tx: Prisma.TransactionClient): Promise<CopyOutcome> => {
      const event = await tx.event.findFirst({
        where: { id: eventId, isDemo: true },
        select: { id: true, hostId: true, host: { select: { userId: true } } },
      });
      if (!event) return { kind: 'gone' };
      const account = event.host.userId
        ? await tx.user.findUnique({
            where: { id: event.host.userId },
            select: { id: true, email: true },
          })
        : null;
      if (!account || !isCopyAccount(account.email)) {
        return { kind: 'skipped', why: 'not a copy account' };
      }

      const collected = await tx.person.findMany({
        where: { OR: [{ id: event.hostId }, { sampleEventId: event.id }] },
        select: { id: true },
      });
      const ids = collected.map((p) => p.id);

      const links = await tx.wrapUpLink.count({
        where: { OR: [{ eventId: event.id }, { personId: { in: ids } }] },
      });
      if (links > 0) return { kind: 'skipped', why: 'a wrap-up link exists' };

      const elsewhere = await tx.personEvent.findMany({
        where: { personId: { in: ids }, eventId: { not: event.id } },
        select: { personId: true },
      });
      const kept = new Set(elsewhere.map((m) => m.personId));
      const doomed = ids.filter((id) => !kept.has(id));

      const owned = { where: { hostId: { in: [account.id, event.hostId] } } };
      const templates = await tx.structureTemplate.deleteMany(owned);
      const profiles = await tx.quantitiesProfile.deleteMany(owned);
      await tx.event.delete({ where: { id: event.id } });
      const people = await tx.person.deleteMany({ where: { id: { in: doomed } } });
      const sessions = await tx.session.count({ where: { userId: account.id } });
      await tx.user.delete({ where: { id: account.id } });

      return {
        kind: 'deleted',
        people: people.count,
        peopleKept: kept.size,
        sessions,
        templates: templates.count + profiles.count,
      };
    },
    { timeout: 30_000 }
  );
}

/** A person on an event in any way the second pass reads: a membership, a host, a co-host. */
const ON_AN_EVENT: Prisma.PersonWhereInput = {
  OR: [
    { eventMemberships: { some: {} } },
    { hostedEvents: { some: {} } },
    { cohostedEvents: { some: {} } },
  ],
};

/**
 * [[GTC-448]] An orphan account at `before`: a copy's made-up address, made before `before`, with
 * no role on any event and none of its people on one.
 */
function orphanAccountWhere(before: Date): Prisma.UserWhereInput {
  return {
    email: { endsWith: `@${DEMO_COPY_EMAIL_DOMAIN}` },
    createdAt: { lt: before },
    eventRoles: { none: {} },
    people: { none: ON_AN_EVENT },
  };
}

/** [[GTC-448]] One orphan account, in its own transaction. Exported for its suite. */
export async function sweepOneOrphan(
  db: PrismaClient,
  userId: string,
  now: Date = new Date()
): Promise<OrphanOutcome> {
  return db.$transaction(
    async (tx: Prisma.TransactionClient): Promise<OrphanOutcome> => {
      const account = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true },
      });
      if (!account) return { kind: 'gone' };
      if (!isCopyAccount(account.email)) return { kind: 'skipped', why: 'not a copy account' };
      const still = await tx.user.count({
        where: { id: account.id, ...orphanAccountWhere(expiredBefore(now)) },
      });
      if (still === 0) return { kind: 'gone' };

      const own = await tx.person.findMany({
        where: { userId: account.id },
        select: { id: true, sampleEventId: true },
      });
      const marks = [...new Set(own.map((p) => p.sampleEventId).filter((m): m is string => !!m))];
      if (marks.length > 0 && (await tx.event.count({ where: { id: { in: marks } } })) > 0) {
        return { kind: 'skipped', why: 'its copy still exists' };
      }
      const stamped =
        marks.length > 0
          ? await tx.person.findMany({
              where: { sampleEventId: { in: marks } },
              select: { id: true },
            })
          : [];
      const ids = [...new Set([...own.map((p) => p.id), ...stamped.map((p) => p.id)])];

      const links = await tx.wrapUpLink.count({ where: { personId: { in: ids } } });
      if (links > 0) return { kind: 'skipped', why: 'a wrap-up link exists' };

      const elsewhere = await tx.person.findMany({
        where: { id: { in: ids }, ...ON_AN_EVENT },
        select: { id: true },
      });
      const kept = new Set(elsewhere.map((p) => p.id));
      const doomed = ids.filter((id) => !kept.has(id));

      const owned = { where: { hostId: { in: [account.id, ...own.map((p) => p.id)] } } };
      const templates = await tx.structureTemplate.deleteMany(owned);
      const profiles = await tx.quantitiesProfile.deleteMany(owned);
      const people = await tx.person.deleteMany({ where: { id: { in: doomed } } });
      const sessions = await tx.session.count({ where: { userId: account.id } });
      await tx.user.delete({ where: { id: account.id } });

      return {
        kind: 'deleted',
        people: people.count,
        peopleKept: kept.size,
        sessions,
        templates: templates.count + profiles.count,
      };
    },
    { timeout: 30_000 }
  );
}

/**
 * Delete the expired copies at `now`: oldest first, each in its own transaction, at most `limit`
 * (25) deleted. Up to `lookAt` (100) are looked at (`found` counts those), and a copy that is skipped or
 * fails uses no place, so copies that cannot go never stop the ones behind them. A copy that
 * cannot be deleted is counted as failed and left whole (its transaction rolls back); the others
 * go on. A failure to find the copies at all is thrown. The cron route answers 500 for either.
 * [[GTC-448]] Then the orphan accounts, the same way, with their own `limit` and `lookAt`.
 */
export async function sweepExpiredCopies(
  db: PrismaClient,
  now: Date = new Date(),
  options: { limit?: number; lookAt?: number } = {}
): Promise<DemoCleanupCounts> {
  const limit = options.limit ?? DEMO_CLEANUP.perRun;
  const lookAt = options.lookAt ?? DEMO_CLEANUP.lookAt;
  const before = expiredBefore(now);
  const copies = await db.event.findMany({
    where: { ...copyEventWhere(), createdAt: { lt: before } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: lookAt,
    select: { id: true },
  });

  const counts: DemoCleanupCounts = {
    found: 0,
    deleted: 0,
    skipped: 0,
    failed: 0,
    orphansFound: 0,
    orphansDeleted: 0,
    orphansSkipped: 0,
    orphansFailed: 0,
    people: 0,
    peopleKept: 0,
    accounts: 0,
    sessions: 0,
    templates: 0,
  };
  const tally = (o: {
    people: number;
    peopleKept: number;
    sessions: number;
    templates: number;
  }) => {
    counts.accounts++;
    counts.people += o.people;
    counts.peopleKept += o.peopleKept;
    counts.sessions += o.sessions;
    counts.templates += o.templates;
  };
  for (const copy of copies) {
    if (counts.deleted >= limit) break;
    counts.found++;
    try {
      const outcome = await sweepOneCopy(db, copy.id);
      if (outcome.kind === 'deleted') {
        counts.deleted++;
        tally(outcome);
        if (outcome.peopleKept > 0) {
          console.warn(
            `[demo-cleanup] kept ${outcome.peopleKept} person(s) of a copy: they belong to another event`
          );
        }
      } else if (outcome.kind === 'skipped') {
        counts.skipped++;
        console.warn(`[demo-cleanup] skipped a copy: ${outcome.why}`);
      }
    } catch (error) {
      counts.failed++;
      const code = (error as { code?: unknown })?.code;
      console.error(
        `[demo-cleanup] a copy could not be deleted (${typeof code === 'string' ? code : 'error'})`
      );
    }
  }

  // [[GTC-448]] The second pass: orphan accounts, a copy its visitor deleted.
  const orphans = await db.user.findMany({
    where: orphanAccountWhere(before),
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: lookAt,
    select: { id: true },
  });
  for (const orphan of orphans) {
    if (counts.orphansDeleted >= limit) break;
    counts.orphansFound++;
    try {
      const outcome = await sweepOneOrphan(db, orphan.id, now);
      if (outcome.kind === 'deleted') {
        counts.orphansDeleted++;
        tally(outcome);
        if (outcome.peopleKept > 0) {
          console.warn(
            `[demo-cleanup] kept ${outcome.peopleKept} person(s) of an orphan account: they belong to another event`
          );
        }
      } else if (outcome.kind === 'skipped') {
        counts.orphansSkipped++;
        console.warn(`[demo-cleanup] skipped an orphan account: ${outcome.why}`);
      }
    } catch (error) {
      counts.orphansFailed++;
      const code = (error as { code?: unknown })?.code;
      console.error(
        `[demo-cleanup] an orphan account could not be deleted (${typeof code === 'string' ? code : 'error'})`
      );
    }
  }

  console.log(
    `[demo-cleanup] copies found ${counts.found}, deleted ${counts.deleted}, skipped ` +
      `${counts.skipped}, failed ${counts.failed}; orphan accounts found ${counts.orphansFound}, ` +
      `deleted ${counts.orphansDeleted}, skipped ${counts.orphansSkipped}, failed ` +
      `${counts.orphansFailed}; people deleted ${counts.people}, kept ${counts.peopleKept}; ` +
      `accounts ${counts.accounts}, sessions ${counts.sessions}, templates ${counts.templates}`
  );
  return counts;
}
