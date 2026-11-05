/**
 * [[GTC-453]] — the Level 1 listening report.
 *
 * EVERY EXPECTED VALUE BELOW IS HAND-WORKED from the invented rows, never read back from the
 * code under test. NZ is +13 (NZDT) in November 2026, so NZ midnight of 5 Nov is 4 Nov 11:00 UTC.
 *
 *   A  NZ calendar helpers, including a 23-hour day (27 Sep 2026)
 *   B  the counting, on invented gatherings: both finish lines, stopped, came back, returns,
 *      reply time, time to sorted, after-send changes, failures, the paid trend, exclusions
 *   C  the database: the transaction refuses a write (READ ONLY), and a real run on the seed
 *      prints no seeded name, email, phone, gathering, item or team name and no id
 *   S  structure: the script asks for no forbidden column, and every line fits 80 characters
 *
 * Nothing is written: part C's only write attempt is the one that must fail.
 */

import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import {
  buildReport,
  phaseOf,
  visits,
  type EventRow,
  type SaveRow,
  type FailureCounts,
} from '../scripts/lib/listening-report-core';
import {
  nzMidnightOf,
  nextNzMidnight,
  previousNzMidnight,
  lastFourNzWeekStarts,
  withReadOnly,
  loadAndBuild,
  parseArgs,
} from '../scripts/listening-report';

const ROOT = join(__dirname, '..');
let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    passed++;
    console.log(`✓ ${name}`);
  } else {
    failed++;
    console.log(`✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const T = (iso: string) => new Date(iso);

/** [[GTC-455]] Does `word` appear in `text` as a whole word (no letter or digit touching it)? */
function leaks(text: string, word: string): boolean {
  const escaped = word.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, 'i').test(text);
}

function partW(): void {
  // Invented words. "Ann" sits inside "Planning" but is not a whole word there.
  check('W1 a short name inside a label word is not a leak', !leaks('A. PLANNING FINISHED', 'Ann'));
  check('W2 the same name as a whole word is a leak', leaks('Host Ann came back', 'Ann'));
  check('W3 case does not hide a leak', leaks('host ANN came back', 'ann'));
  check(
    'W4 an email is caught whole',
    leaks('sent to someone@example.invalid today', 'someone@example.invalid')
  );
  check(
    'W5 a phone number is caught, plus sign and all',
    leaks('call +64 21 000 0000 now', '+64 21 000 0000')
  );
  check(
    'W6 a title is caught across spaces',
    leaks('Report for Invented Picnic 2026', 'Invented Picnic 2026')
  );
}

// ── A. NZ calendar helpers ────────────────────────────────────────────────────────────────

function partA(): void {
  check(
    'A1 nzMidnightOf(2026-11-05) is 4 Nov 11:00 UTC',
    nzMidnightOf('2026-11-05').toISOString() === '2026-11-04T11:00:00.000Z'
  );
  check(
    'A2 a gathering stored as 4 Nov (00:00 UTC) is over at NZ midnight starting 5 Nov',
    nextNzMidnight(T('2026-11-04T00:00:00Z')).toISOString() === '2026-11-04T11:00:00.000Z'
  );
  check(
    'A3 across the 23-hour day: 27 Sep 01:00 NZST ends at 28 Sep 00:00 NZDT (27 Sep 11:00 UTC)',
    nextNzMidnight(T('2026-09-26T13:00:00Z')).toISOString() === '2026-09-27T11:00:00.000Z'
  );
  check(
    'A4 the default window starts at yesterday NZ midnight',
    previousNzMidnight(T('2026-11-05T20:00:00Z')).toISOString() === '2026-11-04T11:00:00.000Z'
  );
  const weeks = lastFourNzWeekStarts(T('2026-11-05T20:00:00Z')); // Fri 6 Nov, 09:00 NZDT
  check(
    'A5 the four NZ weeks start on Mondays 12, 19, 26 Oct and 2 Nov',
    weeks.map((w) => w.toISOString()).join(',') ===
      [
        '2026-10-11T11:00:00.000Z',
        '2026-10-18T11:00:00.000Z',
        '2026-10-25T11:00:00.000Z',
        '2026-11-01T11:00:00.000Z',
      ].join(','),
    weeks.map((w) => w.toISOString()).join(',')
  );
  let refused = false;
  try {
    nzMidnightOf('5/11/2026');
  } catch {
    refused = true;
  }
  check('A6 a date in the wrong shape is refused', refused);
}

// ── B. the counting ───────────────────────────────────────────────────────────────────────

const NOW = T('2026-11-05T20:00:00Z'); // Fri 6 Nov 09:00 NZDT
const SINCE = T('2026-11-04T11:00:00Z'); // Thu 5 Nov 00:00 NZDT

function ev(id: string, over: Partial<EventRow>): EventRow {
  return {
    id,
    createdAt: T('2026-10-01T00:00:00Z'),
    status: 'DRAFT',
    sentAt: null,
    frozenAt: null,
    transitionedToConfirmingAt: null,
    endDate: T('2026-12-01T00:00:00Z'),
    paidAt: null,
    planApprovedAt: null,
    ...over,
  };
}

function save(
  eventId: string,
  iso: string,
  targetType: string,
  actionType = 'EDIT',
  actorKind = 'HOST'
): SaveRow {
  return { eventId, timestamp: T(iso), actionType, targetType, actorKind };
}

function partB(): void {
  // e1: sent inside the window. M1 saves: 21 Oct 01:00, 01:30, then 22 Oct 05:00 (a return).
  const e1 = ev('e1', {
    status: 'CONFIRMING',
    planApprovedAt: T('2026-10-25T10:00:00Z'),
    transitionedToConfirmingAt: T('2026-10-28T00:00:00Z'),
    sentAt: T('2026-11-05T01:00:00Z'),
    paidAt: T('2026-11-03T00:00:00Z'),
  });
  // e2: never sent, last save 22 Oct 00:00 on an Item, so 14 days run out 5 Nov 00:00 UTC.
  const e2 = ev('e2', {});
  // e3: never sent, saved 1 Oct then 5 Nov 03:00 — came back after 14+ quiet days.
  const e3 = ev('e3', {});
  // e4: finished — stored last day 4 Nov, over at 4 Nov 11:00 UTC, which is SINCE (inclusive).
  const e4 = ev('e4', {
    status: 'CONFIRMING',
    planApprovedAt: T('2026-10-10T00:00:00Z'),
    transitionedToConfirmingAt: T('2026-10-15T00:00:00Z'),
    sentAt: T('2026-10-20T00:00:00Z'),
    endDate: T('2026-11-04T00:00:00Z'),
  });
  // e5: finished, never sent (stored last day 4 Nov too).
  const e5 = ev('e5', { endDate: T('2026-11-04T00:00:00Z'), createdAt: T('2026-11-01T00:00:00Z') });

  const saves: SaveRow[] = [
    save('e1', '2026-10-21T01:00:00Z', 'PersonEvent'),
    save('e1', '2026-10-21T01:30:00Z', 'Household'),
    save('e1', '2026-10-22T05:00:00Z', 'PersonEvent'),
    save('e1', '2026-10-23T01:00:00Z', 'Item'),
    save('e1', '2026-10-26T01:00:00Z', 'Assignment', 'ASSIGN_ITEM'),
    save('e1', '2026-11-05T02:00:00Z', 'Item', 'EDIT_ITEM'),
    save('e1', '2026-10-24T01:00:00Z', 'Mystery'),
    save('e2', '2026-10-21T23:00:00Z', 'PersonEvent'),
    save('e2', '2026-10-22T00:00:00Z', 'Item'),
    save('e3', '2026-10-01T00:00:00Z', 'Event'),
    save('e3', '2026-11-05T03:00:00Z', 'Event'),
    save('e4', '2026-10-21T00:00:00Z', 'Item', 'EDIT_ITEM'),
    save('e4', '2026-10-21T01:00:00Z', 'Assignment', 'REASSIGN_ITEM'),
    save('e4', '2026-10-21T02:00:00Z', 'Item', 'EDIT_ITEM'),
    // A guest's own tap: never a host save, but it is a reply.
    save('e4', '2026-10-22T00:00:00Z', 'Assignment', 'ACCEPT_ASSIGNMENT', 'GUEST'),
  ];

  check('B1 a save after the send is after-send', phaseOf(saves[5], e1) === 'after-send');
  check('B2 a save between approval and the hold is Moment 3', phaseOf(saves[4], e1) === 3);
  check('B3 an unknown target before approval is unplaced', phaseOf(saves[6], e1) === 'unplaced');
  check(
    'B4 visits: 01:00, 01:30, then a day later is two visits',
    visits(
      [T('2026-10-21T01:00:00Z'), T('2026-10-21T01:30:00Z'), T('2026-10-22T05:00:00Z')].map((d) =>
        d.getTime()
      )
    ) === 2
  );
  check(
    'B5 visits: a gap of exactly two hours is still one visit',
    visits([0, 2 * 60 * 60 * 1000]) === 1
  );

  const failures = new Map<string, FailureCounts>([
    ['e4', { smsSendFailed: 1, wrapupMessageFailed: 0, outboundRejected: 2 }],
    ['e1', { smsSendFailed: 5, wrapupMessageFailed: 5, outboundRejected: 5 }], // not finished
  ]);

  const lines = buildReport({
    now: NOW,
    since: SINCE,
    events: [e1, e2, e3, e4, e5],
    saves,
    personEvents: [
      // e4: two guests, answered after 2 hours and 4 hours: median 3 hours.
      {
        eventId: 'e4',
        sentAt: T('2026-10-20T00:00:00Z'),
        rsvpRespondedAt: T('2026-10-20T02:00:00Z'),
        attendanceAnsweredAt: null,
      },
      {
        eventId: 'e4',
        sentAt: T('2026-10-20T00:00:00Z'),
        rsvpRespondedAt: null,
        attendanceAnsweredAt: T('2026-10-20T04:00:00Z'),
      },
      // e5: never sent, so not counted.
      { eventId: 'e5', sentAt: null, rsvpRespondedAt: null, attendanceAnsweredAt: null },
    ],
    assignments: [
      { eventId: 'e4', response: 'ACCEPTED' },
      { eventId: 'e4', response: 'DECLINED' },
    ],
    failures,
    weekStarts: lastFourNzWeekStarts(NOW),
    excluded: { demo: 2, testList: 1, beforeCutoff: 0 },
    nextNzMidnight,
  });
  const text = lines.join('\n');
  const has = (s: string) => text.includes(s);

  check('B6 left-out counts are shown', has('Left out: demo 2, test list 1, before cut-off 0'));
  check('B7 one sent in the window (e1)', has('Sent: 1'));
  check('B8 one stopped, in Moment 2 (e2)', has('Stopped: 1 (M1 0, M2 1, M3 0, M4 0)'), text);
  check('B9 one came back after 14+ quiet days (e3)', has('Came back after 14+ quiet days: 1'));
  check(
    'B10 M1 for e1: one gathering, one return, span 21 Oct 01:00 to 22 Oct 05:00 = 28 hours',
    has('M1: 1 with saves; returns median 1, highest 1; span median 28.0 hours'),
    text
  );
  check(
    'B11 the save that fits no Moment is counted, not dropped',
    has('Saves that fit no Moment: 1')
  );
  check('B12 two finished in the window, one of them sent', has('Finished: 2 (1 were sent)'));
  check(
    'B13 reply time median 3 hours, from one gathering',
    has('OPEN, reply time: median 3.0 hours (1 gatherings with replies)'),
    text
  );
  check(
    'B14 time to sorted: last reply 22 Oct 00:00, sent 20 Oct 00:00 = 2.0 days',
    has('median 2.0 days (1 sorted, 0 not)'),
    text
  );
  check(
    'B15 e4 sent 20 Oct, host saves 21 Oct: 3 after-send changes, EDIT_ITEM 2, REASSIGN_ITEM 1',
    has('OPEN, host changes after the send: 3') && has('EDIT_ITEM: 2') && has('REASSIGN_ITEM: 1'),
    text
  );
  check(
    'B16 failures count only finished gatherings',
    has('Failures: texts 1, thank-yous 0, messages refused 2'),
    text
  );
  check('B17 one paid gathering this NZ week (e1, 3 Nov)', has('0, 0, 0, 1'));
  check('B18 no id appears in the report', !/\be[1-5]\b/.test(text), text);

  // A pending assignment means not sorted.
  const lines2 = buildReport({
    now: NOW,
    since: SINCE,
    events: [e4],
    saves,
    personEvents: [
      {
        eventId: 'e4',
        sentAt: T('2026-10-20T00:00:00Z'),
        rsvpRespondedAt: T('2026-10-20T02:00:00Z'),
        attendanceAnsweredAt: null,
      },
    ],
    assignments: [{ eventId: 'e4', response: 'PENDING' }],
    failures: new Map(),
    weekStarts: lastFourNzWeekStarts(NOW),
    excluded: { demo: 0, testList: 0, beforeCutoff: 0 },
    nextNzMidnight,
  }).join('\n');
  check('B19 a pending item means not sorted', lines2.includes('(0 sorted, 1 not)'), lines2);

  // A frozen legacy event counts as sent at its freeze.
  const legacy = ev('e6', { status: 'FROZEN', frozenAt: T('2026-11-05T05:00:00Z') });
  const lines3 = buildReport({
    now: NOW,
    since: SINCE,
    events: [legacy],
    saves: [],
    personEvents: [],
    assignments: [],
    failures: new Map(),
    weekStarts: lastFourNzWeekStarts(NOW),
    excluded: { demo: 0, testList: 0, beforeCutoff: 0 },
    nextNzMidnight,
  }).join('\n');
  check('B20 a legacy frozen gathering counts as sent at its freeze', lines3.includes('Sent: 1'));

  for (const l of [...lines, ...lines2.split('\n')]) {
    if (l.length > 80)
      check(`S1 line fits 80 characters: "${l.slice(0, 30)}..."`, false, `${l.length}`);
  }
  check(
    'S1 every report line fits 80 characters',
    [...lines].every((l) => l.length <= 80)
  );
}

// ── C. the database ───────────────────────────────────────────────────────────────────────

async function partC(prisma: PrismaClient): Promise<void> {
  // C1 the transaction refuses a write.
  let writeRefused = false;
  try {
    await withReadOnly(prisma, async (tx) => {
      await tx.$executeRawUnsafe(`UPDATE "Event" SET "updatedAt" = "updatedAt" WHERE false`);
      // Postgres refuses any UPDATE in a read-only transaction, even one matching no rows.
    });
  } catch (e) {
    writeRefused = /read-only|25006/i.test(String((e as Error).message ?? e));
  }
  check('C1 a write inside the report transaction is refused (READ ONLY)', writeRefused);

  // C2 a real run on the seed prints none of the seeded words and no id.
  const output = (
    await withReadOnly(prisma, (tx) =>
      loadAndBuild(
        tx,
        { since: T('2020-01-01T00:00:00Z'), excludeIds: new Set(), cutoff: null },
        new Date()
      )
    )
  ).join('\n');

  const [people, events, items, teams] = await Promise.all([
    prisma.person.findMany({ select: { name: true, email: true, phone: true } }),
    prisma.event.findMany({ select: { id: true, name: true } }),
    prisma.item.findMany({ select: { name: true } }),
    prisma.team.findMany({ select: { name: true } }),
  ]);
  const words = [
    ...people.flatMap((p) => [p.name, p.email, p.phone]),
    ...events.map((e) => e.name),
    ...items.map((i) => i.name),
    ...teams.map((t) => t.name),
  ].filter((w): w is string => typeof w === 'string' && w.trim().length >= 3);
  // [[GTC-455]] Whole words only: a seeded word counts when no letter or digit touches it on
  // either side. Matching inside words raised a false alarm on a short seeded name sitting
  // inside one of the report's own label words.
  const hits = words.filter((w) => leaks(output, w));
  // The count only — the words themselves are never printed.
  check(
    `C2 the seeded run prints none of ${words.length} seeded names, emails, phones and titles`,
    hits.length === 0,
    `${hits.length} found`
  );
  const ids = events.map((e) => e.id).filter((id) => output.includes(id));
  check('C3 the seeded run prints no gathering id', ids.length === 0, `${ids.length} found`);
  check(
    'C4 the seeded run fits 80 characters a line',
    output.split('\n').every((l) => l.length <= 80)
  );

  // C5 the test list (Way 1) and the cut-off leave gatherings out, and say how many.
  const nonDemo = await prisma.event.findMany({ where: { isDemo: false }, select: { id: true } });
  const dir = mkdtempSync(join(tmpdir(), 'listening-'));
  const listFile = join(dir, 'tests.txt');
  // [[GTC-455]] C5 and C6 need one ordinary gathering to put on the list. A database with none
  // (a local gather_demo can be all samples) skips them, said aloud, never counted as passed.
  if (nonDemo.length === 0) {
    console.log('- C5, C6 skipped: this database has no non-demo gathering to put on the list');
  } else {
    writeFileSync(listFile, `# my test gatherings\n${nonDemo[0].id}\n\n`);
    const opts = parseArgs(['--exclude', listFile, '--since', '2020-01-01'], new Date());
    const withList = (await withReadOnly(prisma, (tx) => loadAndBuild(tx, opts, new Date()))).join(
      '\n'
    );
    check(
      'C5 one gathering on the test list is left out',
      withList.includes('test list 1,'),
      withList.split('\n')[5]
    );
    check(
      'C6 the gatherings read drop by one',
      withList.includes(`Gatherings read: ${nonDemo.length - 1}`),
      withList.split('\n')[4]
    );
  }
  const future = parseArgs(['--cutoff', '2099-01-01'], new Date());
  const withCutoff = (
    await withReadOnly(prisma, (tx) => loadAndBuild(tx, future, new Date()))
  ).join('\n');
  check(
    'C7 a cut-off after every gathering leaves them all out',
    withCutoff.includes(`before cut-off ${nonDemo.length}`) &&
      withCutoff.includes('Gatherings read: 0'),
    withCutoff.split('\n')[5]
  );
  let missing = false;
  try {
    parseArgs(['--exclude', join(dir, 'no-such-file.txt')], new Date());
  } catch (e) {
    missing = (e as Error).message === 'could not read the test list file';
  }
  check('C8 a missing test list stops the run with a plain message', missing);
  rmSync(dir, { recursive: true, force: true });
}

// ── S. structure ──────────────────────────────────────────────────────────────────────────

function partS(): void {
  const src = ['scripts/listening-report.ts', 'scripts/lib/listening-report-core.ts']
    .map((f) => readFileSync(join(ROOT, f), 'utf8'))
    .join('\n');
  const forbidden =
    /\b(actorName|before|after|details|reason|metadata|destination|providerError|providerErrorCode|body|name|email|phone|token)\s*:\s*true/;
  const m = forbidden.exec(src);
  check('S2 the script selects no forbidden column', m === null, m?.[0] ?? '');
  check(
    'S3 the script opens its transaction READ ONLY and checks the database agreed',
    src.includes('SET TRANSACTION READ ONLY') &&
      src.includes("current_setting('transaction_read_only')")
  );
  check(
    'S4 the script never prints the connection string',
    !/DATABASE_URL/.test(src.replace(/^\s*\*.*$/gm, ''))
  );
}

async function run(): Promise<void> {
  partA();
  partB();
  partW();
  partS();
  const prisma = new PrismaClient();
  try {
    await partC(prisma);
  } finally {
    await prisma.$disconnect();
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
}

void run();
