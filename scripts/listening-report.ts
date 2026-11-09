/**
 * [[GTC-453]] — LISTENING REPORT, LEVEL 1. For the founder to run, daily, from their own computer.
 *
 * Founder ruling for production scripts (GTC-369 Q13), followed here exactly: "the production
 * check script opens a read-only transaction and prints numbers only (no names, emails or ids)
 * and never prints the connection string."
 *
 * Run (staging first, then production; name the environment and the service every time):
 *   railway run -e staging -s <APP_SERVICE> npx tsx scripts/listening-report.ts \
 *     --exclude ~/gather-test-gatherings.txt --cutoff <LAUNCH_DATE>
 *   railway run -e production -s <APP_SERVICE> npx tsx scripts/listening-report.ts \
 *     --exclude ~/gather-test-gatherings.txt --cutoff <LAUNCH_DATE>
 * Reaching a private Railway database from a home computer: see GTC-453, "Reaching the
 * database from a home computer". Nothing here enables public access.
 *
 *   --since <YYYY-MM-DD>  Which period to report on: things that happened from this NZ day on.
 *                         Default: the start of yesterday, NZ time.
 *   --cutoff <YYYY-MM-DD> Which gatherings may count at all: leaves out every gathering created
 *                         before this NZ day (the launch date), however recent its activity.
 *   --exclude <file>      Test gatherings to leave out (L1-D3, Way 1): one gathering id per line,
 *                         copied from the address bar in Gather. Lines starting # are ignored.
 *                         Keep the file on your own computer, never in the repo.
 *
 * WHAT IT READS — explicit columns only, never whole rows:
 *   Event: id, createdAt, status, sentAt, frozenAt, transitionedToConfirmingAt, endDate, paidAt,
 *          isDemo; EventSetup.planApprovedAt.
 *   AuditEntry: eventId, timestamp, actionType, targetType, actorKind.
 *   PersonEvent: eventId, sentAt, rsvpRespondedAt, attendanceAnsweredAt.
 *   Assignment: response, and the event it belongs to.
 *   InviteEvent: counts of SMS_SEND_FAILED and WRAPUP_MESSAGE_FAILED per event.
 *   OutboundMessage: counts of rows with rejectedAt set, per event.
 *
 * WHAT IT NEVER READS: AuditEntry.actorName, before, after, details, reason; InviteEvent.metadata;
 * OutboundMessage.destination, providerError, providerErrorCode; TextReply.body; any name, email
 * or phone field. Ids are read to join rows and to apply the test list, and never printed.
 */

import { readFileSync } from 'node:fs';
import { PrismaClient, Prisma } from '@prisma/client';
import { nzDayStart } from '../src/lib/lifecycle';
import {
  buildReport,
  DAY_MS,
  HOUR_MS,
  type EventRow,
  type FailureCounts,
} from './lib/listening-report-core';

// ── NZ calendar helpers (built on the app's own nzDayStart) ──────────────────────────────

/** The NZ midnight that starts the given calendar date. */
export function nzMidnightOf(ymd: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) throw new Error('dates must look like 2026-11-05');
  // UTC midnight of that date is midday or early afternoon on the same NZ date.
  return nzDayStart(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))));
}

/** The NZ midnight after the NZ day holding `d`. Day lengths are 23 to 25 hours. */
export function nextNzMidnight(d: Date): Date {
  return nzDayStart(new Date(nzDayStart(d).getTime() + 26 * HOUR_MS));
}

/** The NZ midnight that starts the NZ day before the one holding `d`. */
export function previousNzMidnight(d: Date): Date {
  return nzDayStart(new Date(nzDayStart(d).getTime() - 12 * HOUR_MS));
}

/** Monday 00:00 NZ for the current week and the three before it, oldest first. */
export function lastFourNzWeekStarts(now: Date): Date[] {
  const weekday = new Intl.DateTimeFormat('en-NZ', {
    timeZone: 'Pacific/Auckland',
    weekday: 'short',
  }).format(now);
  const back = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(weekday);
  const today = nzDayStart(now).getTime();
  const starts: Date[] = [];
  for (let w = 3; w >= 0; w--) {
    starts.push(nzDayStart(new Date(today - (back + 7 * w) * DAY_MS + 12 * HOUR_MS)));
  }
  return starts;
}

// ── read-only transaction ─────────────────────────────────────────────────────────────────

/**
 * Runs `fn` inside a transaction the database itself has confirmed is read-only. Refuses to run
 * `fn` at all if that confirmation does not come back 'on'.
 */
export async function withReadOnly<T>(
  prisma: PrismaClient,
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      const ro = await tx.$queryRaw<
        { ro: string }[]
      >`SELECT current_setting('transaction_read_only') AS ro`;
      if (ro[0]?.ro !== 'on') throw new Error('the transaction is not read-only');
      return fn(tx);
    },
    { timeout: 120_000, maxWait: 10_000 }
  );
}

// ── arguments ─────────────────────────────────────────────────────────────────────────────

export interface Options {
  since: Date;
  excludeIds: Set<string>;
  cutoff: Date | null;
}

export function parseArgs(argv: string[], now: Date): Options {
  let since = previousNzMidnight(now);
  let excludeIds = new Set<string>();
  let cutoff: Date | null = null;
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--since' && value) {
      since = nzMidnightOf(value);
      i++;
    } else if (flag === '--cutoff' && value) {
      cutoff = nzMidnightOf(value);
      i++;
    } else if (flag === '--exclude' && value) {
      let text: string;
      try {
        text = readFileSync(value, 'utf8');
      } catch {
        throw new Error('could not read the test list file');
      }
      excludeIds = new Set(
        text
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l && !l.startsWith('#'))
      );
      i++;
    } else {
      throw new Error('unknown option; see the comment at the top of the script');
    }
  }
  return { since, excludeIds, cutoff };
}

// ── loading ───────────────────────────────────────────────────────────────────────────────

export async function loadAndBuild(
  tx: Prisma.TransactionClient,
  opts: Options,
  now: Date
): Promise<string[]> {
  const all = await tx.event.findMany({
    select: {
      id: true,
      createdAt: true,
      status: true,
      sentAt: true,
      frozenAt: true,
      transitionedToConfirmingAt: true,
      endDate: true,
      paidAt: true,
      isDemo: true,
      setup: { select: { planApprovedAt: true } },
    },
  });

  const excluded = { demo: 0, testList: 0, beforeCutoff: 0 };
  const events: EventRow[] = [];
  for (const e of all) {
    if (e.isDemo) excluded.demo++;
    else if (opts.excludeIds.has(e.id)) excluded.testList++;
    else if (opts.cutoff && e.createdAt.getTime() < opts.cutoff.getTime()) excluded.beforeCutoff++;
    else
      events.push({
        id: e.id,
        createdAt: e.createdAt,
        status: e.status,
        sentAt: e.sentAt,
        frozenAt: e.frozenAt,
        transitionedToConfirmingAt: e.transitionedToConfirmingAt,
        endDate: e.endDate,
        paidAt: e.paidAt,
        planApprovedAt: e.setup?.planApprovedAt ?? null,
      });
  }
  const ids = events.map((e) => e.id);

  const saves = await tx.auditEntry.findMany({
    where: { eventId: { in: ids } },
    select: { eventId: true, timestamp: true, actionType: true, targetType: true, actorKind: true },
  });

  const personEvents = await tx.personEvent.findMany({
    where: { eventId: { in: ids } },
    select: { eventId: true, sentAt: true, rsvpRespondedAt: true, attendanceAnsweredAt: true },
  });

  const assignmentRows = await tx.assignment.findMany({
    where: { item: { team: { eventId: { in: ids } } } },
    select: { response: true, item: { select: { team: { select: { eventId: true } } } } },
  });
  const assignments = assignmentRows.map((a) => ({
    eventId: a.item.team.eventId,
    response: a.response,
  }));

  const failures = new Map<string, FailureCounts>();
  const blank = (): FailureCounts => ({
    smsSendFailed: 0,
    wrapupMessageFailed: 0,
    outboundRejected: 0,
  });
  const inviteFailures = await tx.inviteEvent.groupBy({
    by: ['eventId', 'type'],
    where: { eventId: { in: ids }, type: { in: ['SMS_SEND_FAILED', 'WRAPUP_MESSAGE_FAILED'] } },
    _count: { _all: true },
  });
  for (const row of inviteFailures) {
    const c = failures.get(row.eventId) ?? blank();
    if (row.type === 'SMS_SEND_FAILED') c.smsSendFailed += row._count._all;
    else c.wrapupMessageFailed += row._count._all;
    failures.set(row.eventId, c);
  }
  const refused = await tx.outboundMessage.groupBy({
    by: ['eventId'],
    where: { eventId: { in: ids }, rejectedAt: { not: null } },
    _count: { _all: true },
  });
  for (const row of refused) {
    const c = failures.get(row.eventId) ?? blank();
    c.outboundRejected += row._count._all;
    failures.set(row.eventId, c);
  }

  return buildReport({
    now,
    since: opts.since,
    events,
    saves,
    personEvents,
    assignments,
    failures,
    weekStarts: lastFourNzWeekStarts(now),
    excluded,
    nextNzMidnight,
  });
}

// ── main ──────────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const now = new Date();
  let opts: Options;
  try {
    opts = parseArgs(process.argv.slice(2), now);
  } catch (e) {
    console.error(`Stopped: ${(e as Error).message}`);
    process.exitCode = 1;
    return;
  }
  const prisma = new PrismaClient();
  try {
    const lines = await withReadOnly(prisma, (tx) => loadAndBuild(tx, opts, now));
    console.log(lines.join('\n'));
  } catch (e) {
    if ((e as Error).message === 'the transaction is not read-only') {
      console.error('Stopped: the database did not confirm read-only, so nothing was read.');
    } else {
      // By code only: a message could carry a connection detail.
      const code = (e as { code?: string }).code ?? 'unknown';
      console.error(`Stopped: the report could not be read (error code ${code}).`);
    }
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main();
}
