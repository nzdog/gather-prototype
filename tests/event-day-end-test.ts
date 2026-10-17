/**
 * [[GTC-390]] — an event is over once the NZ calendar day holding its stored end has ended.
 *
 * Founder rulings, 17 Oct 2026: Q1 "Midnight NZ (Recommended)" — the old dashboard and the
 * thank-you move at 00:00 NZ on the day after the last day; Q2 "Leave them as they are
 * (Recommended)" — reminders keep stopping at the stored end, SENT_AND_LIVE keeps its code.
 *
 * A form-made event stores its last day as 00:00 UTC, which is 1pm NZ in summer (NZDT, +13)
 * and noon in winter (NZST, +12). Until GTC-390 a one-day event read PAST from then.
 *
 * EVERY EXPECTED INSTANT BELOW IS HAND-WRITTEN, worked out from NZ law, never from the code
 * under test: NZ is +12 (NZST) and +13 (NZDT); clocks go forward at 2am NZST on the last
 * Sunday of September (27 Sep 2026, a 23-hour day) and back at 3am NZDT on the first Sunday
 * of April (5 Apr 2026 and 4 Apr 2027, 25-hour days). So the changes never touch midnight.
 *
 *   A  the instant `nzDayStart` — when today's NZ day began
 *   B  the rule — `isComplete`, `getEventPhase`, the wire forms, by NZ clock time
 *   C  the JS and SQL rules agree — `COMPLETE_WHERE` against `isComplete`, and Postgres's own
 *      NZ midnights as a second time-zone database (READ ONLY: nothing is written)
 *   D  the machine's own zone does not matter (`process.env.TZ` switched at run time)
 *   S  structure — the readers, the one zone constant, and nothing that sends is edited
 *
 * No browser, no send, the live switch never opened, no row written.
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync, readdirSync } from 'fs';
import { execFileSync } from 'child_process';
import { join, relative } from 'path';
import * as L from '../src/lib/lifecycle';
import { isQuietHours } from '../src/lib/sms/quiet-hours';

const prisma = new PrismaClient();
const ROOT = join(__dirname, '..');
const HOUR = 60 * 60 * 1000;

let passed = 0;
let failed = 0;
const redAssertions: string[] = [];

function assert(layer: string, label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`\x1b[32m✓\x1b[0m [${layer}] ${label}`);
    passed++;
  } else {
    console.error(`\x1b[31m✗\x1b[0m [${layer}] ${label}${detail ? `\n    ${detail}` : ''}`);
    failed++;
    redAssertions.push(`[${layer}] ${label}`);
  }
}

function ok(fn: () => boolean): boolean {
  try {
    return fn() === true;
  } catch {
    return false;
  }
}

function read(rel: string): string {
  try {
    return readFileSync(join(ROOT, rel), 'utf8');
  } catch {
    return '';
  }
}

function code(rel: string): string {
  return read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function quiet(paths: string[]): boolean {
  try {
    execFileSync('git', ['diff', '--quiet', 'HEAD', '--', ...paths], { cwd: ROOT, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

// ── The code under test, read so that a missing export reads red rather than crashing ──────
type Ev = L.LifecycleEvent;
const lib = L as unknown as {
  nzDayStart?: (now?: Date) => Date;
  isComplete: (e: Ev, now?: Date) => boolean;
  getEventPhase: (e: Ev, now?: Date) => string;
  isCompleteJson: (e: L.SerialisedEvent, now?: Date) => boolean;
  getEventPhaseJson: (e: L.SerialisedEvent, now?: Date) => string;
  COMPLETE_WHERE: (now?: Date) => { endDate: Record<string, Date> };
  SENT_AND_LIVE: (now?: Date) => { sentAt: unknown; endDate: Record<string, Date> };
};
const dayStart = (now: Date): Date => {
  if (typeof lib.nzDayStart !== 'function') throw new Error('nzDayStart is not exported');
  return lib.nzDayStart(now);
};

const at = (iso: string) => new Date(iso);
const same = (a: Date, iso: string) => a.getTime() === at(iso).getTime();
const SEND = at('2026-12-18T00:00:00.000Z');
const ev = (endIso: string, over: Partial<Ev> = {}): Ev => ({
  status: 'CONFIRMING',
  sentAt: SEND,
  endDate: at(endIso),
  ...over,
});

// ── Layer A's table: [label, input, expected start of that NZ day], all hand-written ─────────
const A_CASES: [string, string, string][] = [
  ['A1 summer: 1pm NZDT 25 Dec', '2026-12-25T00:00:00.000Z', '2026-12-24T11:00:00.000Z'],
  ['A2 winter: noon NZST 15 Jul', '2026-07-15T00:00:00.000Z', '2026-07-14T12:00:00.000Z'],
  ['A3 midnight NZ maps to itself', '2026-12-24T11:00:00.000Z', '2026-12-24T11:00:00.000Z'],
  ['A4 one millisecond before midnight', '2026-12-24T10:59:59.999Z', '2026-12-23T11:00:00.000Z'],
  ['A5 27 Sep 2026, 1pm NZDT', '2026-09-27T00:00:00.000Z', '2026-09-26T12:00:00.000Z'],
  ['A5 28 Sep 2026, noon NZDT', '2026-09-27T23:00:00.000Z', '2026-09-27T11:00:00.000Z'],
  ['A6 1:59:59.999am NZST 27 Sep', '2026-09-26T13:59:59.999Z', '2026-09-26T12:00:00.000Z'],
  ['A6 3:00am NZDT 27 Sep', '2026-09-26T14:00:00.000Z', '2026-09-26T12:00:00.000Z'],
  ['A7 4 Apr 2027, noon NZST', '2027-04-04T00:00:00.000Z', '2027-04-03T11:00:00.000Z'],
  ['A7 5 Apr 2027, noon NZST', '2027-04-05T00:00:00.000Z', '2027-04-04T12:00:00.000Z'],
  ['A8 2:30am NZDT 4 Apr 2027', '2027-04-03T13:30:00.000Z', '2027-04-03T11:00:00.000Z'],
  ['A8 2:30am NZST 4 Apr 2027', '2027-04-03T14:30:00.000Z', '2027-04-03T11:00:00.000Z'],
  ['A9 5 Apr 2026, noon NZST', '2026-04-05T00:00:00.000Z', '2026-04-04T11:00:00.000Z'],
  ['A9 6 Apr 2026, noon NZST', '2026-04-06T00:00:00.000Z', '2026-04-05T12:00:00.000Z'],
  ["A10 New Year's midnight", '2026-12-31T11:00:00.000Z', '2026-12-31T11:00:00.000Z'],
  ["A10 just before New Year's midnight", '2026-12-31T10:59:59.999Z', '2026-12-30T11:00:00.000Z'],
  ['A11 29 Feb 2028, 1pm NZDT', '2028-02-29T00:00:00.000Z', '2028-02-28T11:00:00.000Z'],
  ['A11 1 Mar 2028, 1pm NZDT', '2028-03-01T00:00:00.000Z', '2028-02-29T11:00:00.000Z'],
];
const aHolds = (prefix: string) =>
  ok(() =>
    A_CASES.filter(([l]) => l.startsWith(`${prefix} `)).every(([, input, want]) =>
      same(dayStart(at(input)), want)
    )
  );

/** A12: every NZ day 2026-2028 — the NZ clock at the result reads 00:00:00 on that date. */
const NZ_CLOCK = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Pacific/Auckland',
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});
const DAYS: string[] = [];
for (let t = Date.UTC(2026, 0, 1); t <= Date.UTC(2028, 11, 31); t += 24 * HOUR) {
  DAYS.push(new Date(t).toISOString().slice(0, 10));
}
function a12(): { ok: boolean; detail: string } {
  let prev: string | null = null;
  for (const day of DAYS) {
    let s: Date;
    try {
      s = dayStart(at(`${day}T00:00:00.000Z`)); // noon or 1pm NZ on `day`
    } catch (e) {
      return { ok: false, detail: String(e) };
    }
    if (NZ_CLOCK.format(s) !== `${day}, 00:00:00`) {
      return { ok: false, detail: `${day}: ${s.toISOString()} reads ${NZ_CLOCK.format(s)}` };
    }
    const before = NZ_CLOCK.format(new Date(s.getTime() - 1));
    if (prev && before !== `${prev}, 23:59:59`) {
      return { ok: false, detail: `${day}: 1 ms earlier reads ${before}` };
    }
    prev = day;
  }
  return { ok: true, detail: '' };
}

// ── Layer B's table: [label, end, clock reading, over?], all hand-written ───────────────────
const XMAS = '2026-12-25T00:00:00.000Z'; // a one-day form event, 25 Dec: 1pm NZDT
const B_CASES: [string, string, string, boolean][] = [
  ['B1 CONTROL Christmas, 8am NZDT: not over', XMAS, '2026-12-24T19:00:00.000Z', false],
  ['B2 CONTROL Christmas, 1pm exactly (the stored end): not over', XMAS, XMAS, false],
  ['B3 Christmas, 1pm plus 1 ms: not over', XMAS, '2026-12-25T00:00:00.001Z', false],
  ['B4 Christmas, 5pm: not over', XMAS, '2026-12-25T04:00:00.000Z', false],
  ['B5 Christmas, 9pm: not over', XMAS, '2026-12-25T08:00:00.000Z', false],
  ['B6 Christmas, 11pm: not over', XMAS, '2026-12-25T10:00:00.000Z', false],
  ['B7 Christmas, 23:59:59.999: not over', XMAS, '2026-12-25T10:59:59.999Z', false],
  ['B8 CONTROL Christmas, 00:00 on the 26th: over', XMAS, '2026-12-25T11:00:00.000Z', true],
  [
    'B9 winter (15 Jul, noon NZST), 23:59:59.999: not over',
    '2026-07-15T00:00:00.000Z',
    '2026-07-15T11:59:59.999Z',
    false,
  ],
  [
    'B10 CONTROL winter, 00:00 on 16 Jul: over',
    '2026-07-15T00:00:00.000Z',
    '2026-07-15T12:00:00.000Z',
    true,
  ],
  [
    'B11 27 Sep 2026 (clocks forward), 23:59:59.999 NZDT: not over',
    '2026-09-27T00:00:00.000Z',
    '2026-09-27T10:59:59.999Z',
    false,
  ],
  [
    'B12 CONTROL 27 Sep 2026, 00:00 on 28 Sep: over',
    '2026-09-27T00:00:00.000Z',
    '2026-09-27T11:00:00.000Z',
    true,
  ],
  [
    'B13 4 Apr 2027 (clocks back), 11pm NZST, where a wrong offset puts midnight: not over',
    '2027-04-04T00:00:00.000Z',
    '2027-04-04T11:00:00.000Z',
    false,
  ],
  [
    'B14 4 Apr 2027, 23:59:59.999 NZST: not over',
    '2027-04-04T00:00:00.000Z',
    '2027-04-04T11:59:59.999Z',
    false,
  ],
  [
    'B15 CONTROL 4 Apr 2027, 00:00 on 5 Apr: over',
    '2027-04-04T00:00:00.000Z',
    '2027-04-04T12:00:00.000Z',
    true,
  ],
  [
    'B16 an end with a real time (5:30pm NZDT 24 Dec), 6pm: not over',
    '2026-12-24T04:30:00.000Z',
    '2026-12-24T05:00:00.000Z',
    false,
  ],
  [
    'B17 CONTROL the same, 00:00 on 25 Dec: over',
    '2026-12-24T04:30:00.000Z',
    '2026-12-24T11:00:00.000Z',
    true,
  ],
  [
    'B18 an end stored AT 00:00 NZ 25 Dec belongs to the 25th: 11pm that day, not over',
    '2026-12-24T11:00:00.000Z',
    '2026-12-25T10:00:00.000Z',
    false,
  ],
  [
    'B19 a three-day event, 24 to 26 Dec: 9pm on the 26th, not over',
    '2026-12-26T00:00:00.000Z',
    '2026-12-26T08:00:00.000Z',
    false,
  ],
  [
    'B20 CONTROL the three-day event, 00:00 on the 27th: over',
    '2026-12-26T00:00:00.000Z',
    '2026-12-26T11:00:00.000Z',
    true,
  ],
];
const bHolds = (label: string) =>
  ok(() => {
    const row = B_CASES.find(([l]) => l === label)!;
    return lib.isComplete(ev(row[1]), at(row[2])) === row[3];
  });

const XMAS_5PM = '2026-12-25T04:00:00.000Z';
const XMAS_MIDNIGHT = '2026-12-25T11:00:00.000Z';
const XMAS_8AM = '2026-12-24T19:00:00.000Z';
const wire: L.SerialisedEvent = {
  status: 'CONFIRMING',
  sentAt: SEND.toISOString(),
  endDate: XMAS,
};
const b21 = () => ok(() => lib.getEventPhase(ev(XMAS), at(XMAS_5PM)) === 'SENT');
const b22 = () => ok(() => lib.getEventPhase(ev(XMAS), at(XMAS_MIDNIGHT)) === 'COMPLETE');
const b23 = () =>
  ok(
    () =>
      lib.isCompleteJson(wire, at(XMAS_5PM)) === false &&
      lib.getEventPhaseJson(wire, at(XMAS_5PM)) === 'SENT'
  );
const b24 = () =>
  ok(() =>
    (['DRAFT', 'CONFIRMING', 'FROZEN', 'COMPLETE'] as const).every((status) =>
      [null, SEND].every(
        (sentAt) =>
          lib.isComplete(ev(XMAS, { status, sentAt }), at(XMAS_MIDNIGHT)) === true &&
          lib.isComplete(ev(XMAS, { status, sentAt }), at(XMAS_8AM)) === false
      )
    )
  );

/** Every expected answer of Layers A and B, for Layer D to re-ask under another zone. */
function allExpected(): boolean {
  return (
    A_CASES.every(([, input, want]) => ok(() => same(dayStart(at(input)), want))) &&
    a12().ok &&
    B_CASES.every(([label]) => bHolds(label)) &&
    b21() &&
    b22() &&
    b23() &&
    b24()
  );
}

async function main() {
  console.log('\x1b[33m=== GTC-390: an event is over when its last NZ day has ended ===\x1b[0m\n');
  const eventsBefore = await prisma.event.count();

  // ══ LAYER A — the instant ═══════════════════════════════════════════════════════════════
  console.log('\x1b[33mLayer A: nzDayStart, the moment today’s NZ day began\x1b[0m');
  assert('A', 'A1 summer: 1pm NZDT 25 Dec → 24 Dec 11:00Z', aHolds('A1'));
  assert('A', 'A2 winter: noon NZST 15 Jul → 14 Jul 12:00Z', aHolds('A2'));
  assert('A', 'A3 the instant of NZ midnight maps to itself', aHolds('A3'));
  assert('A', 'A4 one millisecond before NZ midnight → the day before', aHolds('A4'));
  assert(
    'A',
    'A5 27 Sep 2026 (clocks forward): → 26 Sep 12:00Z, and the day is 23 hours',
    aHolds('A5') &&
      ok(
        () =>
          dayStart(at('2026-09-27T23:00:00.000Z')).getTime() -
            dayStart(at('2026-09-27T00:00:00.000Z')).getTime() ===
          23 * HOUR
      )
  );
  assert('A', 'A6 the skipped hour’s two edges → the same start', aHolds('A6'));
  assert(
    'A',
    'A7 4 Apr 2027 (clocks back): → 3 Apr 11:00Z, and the day is 25 hours',
    aHolds('A7') &&
      ok(
        () =>
          dayStart(at('2027-04-05T00:00:00.000Z')).getTime() -
            dayStart(at('2027-04-04T00:00:00.000Z')).getTime() ===
          25 * HOUR
      )
  );
  assert('A', 'A8 the repeated 2:30am, both times → the same start', aHolds('A8'));
  assert('A', 'A9 5 Apr 2026 (clocks back), a second year', aHolds('A9'));
  assert('A', 'A10 New Year’s midnight', aHolds('A10'));
  assert('A', 'A11 29 Feb 2028', aHolds('A11'));
  const sweep = a12();
  assert(
    'A',
    `A12 every NZ day 2026-2028 (${DAYS.length}): starts at 00:00:00 NZ, and 1 ms earlier is the day before`,
    sweep.ok,
    sweep.detail
  );

  // ══ LAYER B — the rule ══════════════════════════════════════════════════════════════════
  console.log('\n\x1b[33mLayer B: over once the NZ day holding the end has ended\x1b[0m');
  for (const [label] of B_CASES) assert('B', label, bHolds(label));
  assert('B', 'B21 a sent Christmas event at 5pm on the day is SENT', b21());
  assert('B', 'B22 CONTROL the same at 00:00 on the 26th is COMPLETE', b22());
  assert(
    'B',
    'B23 the wire forms (isCompleteJson, getEventPhaseJson) give the same answers at 5pm',
    b23()
  );
  assert('B', 'B24 KEPT: over ignores status and sentAt (8am and midnight, every status)', b24());

  // ══ LAYER C — the JS and SQL rules agree ════════════════════════════════════════════════
  console.log('\n\x1b[33mLayer C: COMPLETE_WHERE and isComplete compare one instant\x1b[0m');
  assert(
    'C',
    'C1 COMPLETE_WHERE(now) is exactly { endDate: { lt: <start of today’s NZ day> } }',
    ok(() =>
      [
        ['2026-12-25T04:00:00.000Z', '2026-12-24T11:00:00.000Z'],
        ['2026-09-27T00:00:00.000Z', '2026-09-26T12:00:00.000Z'],
        ['2027-04-04T00:00:00.000Z', '2027-04-03T11:00:00.000Z'],
      ].every(([now, want]) => {
        const w = lib.COMPLETE_WHERE(at(now));
        return (
          Object.keys(w).join() === 'endDate' &&
          Object.keys(w.endDate).join() === 'lt' &&
          w.endDate.lt instanceof Date &&
          same(w.endDate.lt, want)
        );
      })
    )
  );

  const ENDS = [...new Set(B_CASES.map(([, end]) => end))];
  const NOWS = [
    ...new Set([...A_CASES.map(([, input]) => input), ...B_CASES.map(([, , now]) => now)]),
  ];
  let c2Detail = '';
  assert(
    'C',
    `C2 for ${ENDS.length} ends × ${NOWS.length} clock readings, isComplete equals "end < COMPLETE_WHERE's instant"`,
    ok(() =>
      ENDS.every((end) =>
        NOWS.every((now) => {
          const js = lib.isComplete(ev(end), at(now));
          const sql = at(end).getTime() < lib.COMPLETE_WHERE(at(now)).endDate.lt.getTime();
          if (js !== sql) c2Detail = `end ${end}, now ${now}: js ${js}, sql ${sql}`;
          return js === sql;
        })
      )
    ),
    c2Detail
  );
  assert(
    'C',
    'C3 KEPT (Q2): SENT_AND_LIVE(now) is still exactly { sentAt: { not: null }, endDate: { gt: now } }',
    ok(() => {
      const now = at(XMAS_5PM);
      const w = lib.SENT_AND_LIVE(now);
      return (
        Object.keys(w).join() === 'sentAt,endDate' &&
        JSON.stringify(w.sentAt) === '{"not":null}' &&
        Object.keys(w.endDate).join() === 'gt' &&
        w.endDate.gt === now
      );
    })
  );

  // C4: Postgres's own NZ midnight for each day, a second time-zone database. Read only.
  let c4Detail = '';
  let c4 = false;
  try {
    const [, rows] = await prisma.$transaction([
      prisma.$executeRaw`SET TRANSACTION READ ONLY`,
      prisma.$queryRaw<{ day: string; start: Date }[]>`
        SELECT to_char(d, 'YYYY-MM-DD') AS day,
               (d::timestamp AT TIME ZONE 'Pacific/Auckland') AS start
        FROM generate_series('2026-01-01'::date, '2028-12-31'::date, '1 day') AS d
        ORDER BY d`,
    ]);
    c4 =
      rows.length === DAYS.length &&
      rows.every((r) => {
        const js = ok(() => dayStart(at(`${r.day}T00:00:00.000Z`)).getTime() === r.start.getTime());
        if (!js && !c4Detail) c4Detail = `${r.day}: Postgres ${r.start.toISOString()}`;
        return js;
      });
  } catch (e) {
    c4Detail = String(e);
  }
  assert(
    'C',
    `C4 Postgres's own NZ midnight equals nzDayStart on every day 2026-2028 (read only)`,
    c4,
    c4Detail
  );

  // C5: over gather_dev's events, read only — Postgres's answer and isComplete's agree.
  const events = await prisma.event.findMany({
    select: { id: true, status: true, sentAt: true, endDate: true },
  });
  const ids = events.map((e) => e.id);
  const c5Nows = [
    ...events.flatMap((e) => [-1, 0, 1].map((d) => new Date(e.endDate.getTime() + d))),
    ...A_CASES.map(([, , want]) => at(want)),
  ];
  let c5Detail = '';
  let c5 = events.length > 0;
  for (const now of c5Nows) {
    if (!c5) break;
    try {
      const [, rows] = await prisma.$transaction([
        prisma.$executeRaw`SET TRANSACTION READ ONLY`,
        prisma.event.findMany({
          where: { id: { in: ids }, ...(lib.COMPLETE_WHERE(now) as object) },
          select: { id: true },
        }),
      ]);
      const sql = rows
        .map((r) => r.id)
        .sort()
        .join();
      const js = events
        .filter((e) => lib.isComplete(e, now))
        .map((e) => e.id)
        .sort()
        .join();
      if (sql !== js) {
        c5 = false;
        c5Detail = `at ${now.toISOString()}: SQL ${sql.split(',').length} over, JS ${js.split(',').length}`;
      }
    } catch (e) {
      c5 = false;
      c5Detail = String(e);
    }
  }
  assert(
    'C',
    `C5 over gather_dev's ${events.length} events at ${c5Nows.length} clock readings, COMPLETE_WHERE and isComplete pick the same events (read only)`,
    c5,
    c5Detail
  );
  assert('C', 'C6 CONTROL: the read sees at least one event', events.length > 0);

  // ══ LAYER D — another machine zone ══════════════════════════════════════════════════════
  console.log('\n\x1b[33mLayer D: the machine’s own zone does not matter\x1b[0m');
  const originalTz = process.env.TZ;
  const local = (tz: string) => {
    process.env.TZ = tz;
    const d = at('2026-12-25T00:00:00.000Z');
    return [d.getHours(), d.getMinutes(), d.getDate()].join(':');
  };
  const ZONES = [
    'UTC',
    'America/Los_Angeles',
    'Europe/London',
    'Asia/Kolkata',
    'Pacific/Chatham',
    'Pacific/Kiritimati',
    'Pacific/Pago_Pago',
  ];
  const auckland = local('Pacific/Auckland');
  const clocks = ZONES.map((z) => `${z} ${local(z)}`);
  assert(
    'D',
    'D0 CONTROL: switching the machine’s zone really moves its local clock, for every zone',
    auckland === '13:0:25' && ZONES.every((z) => local(z) !== auckland),
    `Auckland ${auckland}; ${clocks.join('; ')}`
  );
  ZONES.forEach((z, i) => {
    process.env.TZ = z;
    assert(
      'D',
      `D${i + 1} under ${z}: every expected answer in Layers A and B holds`,
      allExpected()
    );
  });
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;

  // ══ LAYER S — structure ═════════════════════════════════════════════════════════════════
  console.log(
    '\n\x1b[33mLayer S: one constant, the readers as listed, nothing that sends edited\x1b[0m'
  );
  const life = read('src/lib/lifecycle.ts');
  const lifeCode = code('src/lib/lifecycle.ts');
  assert(
    'S',
    "S1 KEPT: lifecycle.ts's only import is the type from @prisma/client (safe in the browser)",
    (life.match(/^import .*$/gm) ?? []).join('\n') ===
      "import type { EventStatus } from '@prisma/client';"
  );
  assert(
    'S',
    'S2 lifecycle.ts names Pacific/Auckland once, in one constant',
    (lifeCode.match(/Pacific\/Auckland/g) ?? []).length === 1 &&
      /const [A-Z_]+ = 'Pacific\/Auckland';/.test(lifeCode)
  );
  const isCompleteBody = lifeCode.match(/export function isComplete\([\s\S]*?\n\}/)?.[0] ?? '';
  const completeWhereBody =
    lifeCode.match(/export const COMPLETE_WHERE = [\s\S]*?\n\}\);/)?.[0] ?? '';
  assert(
    'S',
    'S3 isComplete and COMPLETE_WHERE each go through nzDayStart(',
    /nzDayStart\(/.test(isCompleteBody) && /nzDayStart\(/.test(completeWhereBody),
    `isComplete ${isCompleteBody.length} chars, COMPLETE_WHERE ${completeWhereBody.length} chars`
  );

  const srcFiles: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) srcFiles.push(relative(ROOT, full));
    }
  };
  walk(join(ROOT, 'src'));
  const naming = (re: RegExp) =>
    srcFiles
      .filter((f) => re.test(code(f)))
      .sort()
      .join(', ');
  const readers = {
    sentAndLive: naming(/SENT_AND_LIVE/),
    completeWhere: naming(/COMPLETE_WHERE/),
    isComplete: naming(/\bisComplete\(/),
    json: naming(/\b(isCompleteJson|getEventPhaseJson)\(/),
  };
  assert(
    'S',
    'S4 KEPT: the readers are as listed (SENT_AND_LIVE: lifecycle + the two finders; COMPLETE_WHERE: lifecycle; isComplete(: lifecycle + the wrap-up route; the wire forms: lifecycle + the old dashboard)',
    readers.sentAndLive ===
      'src/lib/lifecycle.ts, src/lib/sms/decide-by-eligibility.ts, src/lib/sms/nudge-eligibility.ts' &&
      readers.completeWhere === 'src/lib/lifecycle.ts' &&
      readers.isComplete === 'src/app/api/events/[id]/wrap-up/route.ts, src/lib/lifecycle.ts' &&
      readers.json === 'src/app/plan/[eventId]/page.tsx, src/lib/lifecycle.ts',
    JSON.stringify(readers)
  );
  const wrapUp = code('src/app/api/events/[id]/wrap-up/route.ts');
  assert(
    'S',
    'S5 KEPT: the wrap-up route still refuses on !isComplete(event), in the same words',
    /if \(!isComplete\(event\)\) \{\s*return NextResponse\.json\(\s*\{ error: 'Cannot wrap up before the event date has passed\.' \},\s*\{ status: 400 \}/.test(
      wrapUp
    )
  );
  assert(
    'S',
    'S6 KEPT: nothing that sends is edited (the two finders, the drain, wrap-up, quiet hours, decide-by, its sender, the wrap-up route, the cron routes)',
    quiet([
      'src/lib/sms/nudge-eligibility.ts',
      'src/lib/sms/decide-by-eligibility.ts',
      'src/lib/press/dispatch.ts',
      'src/lib/wrap-up.ts',
      'src/lib/sms/quiet-hours.ts',
      'src/lib/decide-by.ts',
      'src/lib/sms/decide-by-sender.ts',
      'src/app/api/events/[id]/wrap-up/route.ts',
      'src/app/api/cron',
    ])
  );
  assert(
    'S',
    'S7 KEPT: no schema, migration, route list, security suite, billing, AI or event-creation change',
    quiet([
      'prisma',
      'route-classifications.json',
      'tests/security-*',
      'src/app/api/billing',
      'src/lib/ai',
      'src/app/api/events/route.ts',
    ])
  );
  assert(
    'S',
    'S8 KEPT: a thank-you pressed at midnight waits — quiet at 00:00 and 7:59:59.999 NZDT, not at 8:00',
    isQuietHours(at('2026-12-25T11:00:00.000Z')) === true &&
      isQuietHours(at('2026-12-25T18:59:59.999Z')) === true &&
      isQuietHours(at('2026-12-25T19:00:00.000Z')) === false
  );

  const eventsAfter = await prisma.event.count();
  assert(
    'C',
    'C7 KEPT: the Event count is the same before and after (nothing written)',
    eventsAfter === eventsBefore,
    `${eventsBefore} → ${eventsAfter}`
  );
  await prisma.$disconnect();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('RED:');
    for (const x of redAssertions) console.log(`  ${x}`);
    process.exit(1);
  }
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
