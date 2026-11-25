/**
 * [[GTC-485]] — MULTI-DAY: THE DEADLINE FROM THE DISH'S SESSION, AND WHAT GUESTS AND THE BOARD SHOW
 * (`npm run test:sessions-guests-clock`).
 *
 * The founder's final word on the plan, 25 Nov 2026 (docs/tickets/GTC-485.md): ruling 5 (the two
 * Zone 7 and Zone 9 select lines, decide-by-clock's check moved, every other decide-by check as it
 * is); decision 1, nothing new is sent when a dish's session moves after the send; decision 2, the
 * range for any event over more than one date while the switch is on; decision 3, the words as
 * listed, "Fri 25 Dec" taking its weekday from the date, the tag in the reading list only.
 *
 *   D  the deadline, pure: `neededBy` at 1pm NZ on the session's date (noon in winter), never later
 *      than the event's end, a drop-off time first, no session as today; "Answers by"
 *   Z7 the follow-up's finder over its own made-up sent event, the switch on and off
 *   Z9 the follow-up's email retry, scoped to its own event, the email stubbed in this process
 *   F  the board: the session tag on a held row (none for the whole event, none with the switch
 *      off); an earlier session's maybe red sooner
 *   E  the guest page's words through the date rule; the route and page lines
 *   G  the invitation's draft first line: the range for an event over more than one date, one date
 *      as today, the switch off as today, the screen and the send the same
 *   K  each of the 18 edited files is 8454fed's with exactly its named hunks; nothing else moved
 *   Z  nothing left the process; every row this run made removed by id; every table's count as found
 *
 * SAFETY. Nothing is sent: the provider trap (`tests/helpers/provider-trap.ts`) walls the process,
 * the provider keys are removed for this process, and `globalThis.fetch` answers Resend in-process
 * (the retry's two emails land here, as in test:decide-by-email). The finder only reads. The
 * decide-by cron is never run. Writes only its own rows (names start with the run's TAG); every id
 * is written to the fixture file BEFORE the row is used, and removed by id in `finally`, however the
 * run ends. The guest route needs a request scope (its sign-in check reads the cookies), so its two
 * day lines are checked in the source here and on screen in the look. The reading list draws its
 * rows only once tapped open, so the tag is checked in its data and its drawn hunk here, and on
 * screen in the look.
 *
 * Run: npx tsx --tsconfig tests/tsconfig.json tests/sessions-guests-clock-test.tsx
 */
import { prisma } from '../src/lib/prisma';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { liveBehindTrap, trapCount } from './helpers/provider-trap';

const ROOT = path.join(__dirname, '..');
const BASE = '8454fed'; // origin/main when GTC-485 began (the merge of GTC-480)
const TAG = `S485${Date.now().toString(36)}`;
const VAR = 'GATHER_SESSIONS';
const FIXTURE_FILE =
  process.env.GTC485_FIXTURE_FILE ?? path.join(os.tmpdir(), `gtc485-guests-clock-${TAG}.json`);
const HOUR = 36e5;
const DAY = 24 * HOUR;

let passed = 0;
let failed = 0;
function check(id: string, label: string, ok: boolean, got?: unknown) {
  if (ok) {
    passed++;
    console.log(`\x1b[32m✓\x1b[0m ${id} ${label}`);
  } else {
    failed++;
    console.log(`\x1b[31m✗\x1b[0m ${id} ${label}`);
    if (got !== undefined) console.log(`    got: ${String(JSON.stringify(got)).slice(0, 600)}`);
  }
}
const section = (s: string) => console.log(`\n\x1b[1m\x1b[33m${s}\x1b[0m`);
const read = (rel: string) =>
  fs.existsSync(path.join(ROOT, rel)) ? fs.readFileSync(path.join(ROOT, rel), 'utf8') : '';
const git = (args: string[]) => {
  try {
    return execFileSync('git', ['--literal-pathspecs', ...args], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 1 << 26,
    });
  } catch {
    return null;
  }
};
const atBase = (rel: string) => git(['show', `${BASE}:${rel}`]) ?? '';
/**
 * ⚠ [[GTC-481]] (25 Nov 2026, the founder's ruling 6 on its plan: "sessions-guests-clock's K checks
 * read GTC-485's merge 6e84218, as described"). K14 and E3 (the guest page), K19, K20, K22 and K23
 * state GTC-485's own facts: the page's four pieces and imports, no new source file, the 18 edited
 * files, no new route, one script line. GTC-481 edits the page and adds files and a route, so these
 * read the tree as GTC-485 merged it (MERGED) instead of the working folder: they still prove
 * exactly what GTC-485 did. GTC-481's own suite holds its own files the same way. Every other check
 * here, K21 and K1 to K18 but K14 among them, still reads the working folder.
 */
const MERGED = '6e84218';
const atMerged = (rel: string) => git(['show', `${MERGED}:${rel}`]) ?? '';
const READ_AT_MERGE = ['src/app/p/[token]/page.tsx'];
/** git with pathspec patterns read as patterns (for `tests/security-*`). */
const gitGlob = (args: string[]) => {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });
  } catch {
    return null;
  }
};
const count = (s: string, needle: string) => (needle ? s.split(needle).length - 1 : 0);
const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// ── The fixture file: every id, written before the row is used ──────────────────────────────
const made: Record<'users' | 'people' | 'events', string[]> = { users: [], people: [], events: [] };
function note(kind: keyof typeof made, id: string) {
  made[kind].push(id);
  fs.writeFileSync(FIXTURE_FILE, JSON.stringify({ tag: TAG, ...made }, null, 2), { mode: 0o600 });
}

/** Run `fn` with the switch at `value` (undefined = unset), then put it back to unset. */
async function withSwitch<T>(value: string | undefined, fn: () => T | Promise<T>): Promise<T> {
  const env = process.env as Record<string, string | undefined>;
  if (value === undefined) delete env[VAR];
  else env[VAR] = value;
  try {
    return await fn();
  } finally {
    delete env[VAR];
  }
}
const on = <T,>(fn: () => T | Promise<T>) => withSwitch('on', fn);
const off = <T,>(fn: () => T | Promise<T>) => withSwitch(undefined, fn);

const utcDay = (s: string) => new Date(`${s}T00:00:00.000Z`);
/** NZ midnight of a summer date (NZDT, UTC+13): the seed's form. */
const nzMidnight = (s: string) => new Date(utcDay(s).getTime() - 13 * HOUR);
const nzHour = (d: Date) =>
  Number(
    new Intl.DateTimeFormat('en-NZ', {
      timeZone: 'Pacific/Auckland',
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(d)
  );
const keyOf = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' }).format(d);

async function tableCounts(): Promise<Record<string, number>> {
  const tables: { tablename: string }[] =
    await prisma.$queryRaw`select tablename from pg_tables where schemaname = 'public' order by tablename`;
  const out: Record<string, number> = {};
  for (const { tablename } of tables) {
    const rows: { n: bigint }[] = await prisma.$queryRawUnsafe(
      `select count(*)::bigint as n from "${tablename.replace(/"/g, '""')}"`
    );
    out[tablename] = Number(rows[0].n);
  }
  return out;
}

async function cleanUp() {
  const { events, people, users } = made;
  if (events.length) {
    // The retry's rows and the email's log first, then the events with everything they hold.
    await prisma.inviteEvent.deleteMany({ where: { eventId: { in: events } } });
    await prisma.outboundMessage.deleteMany({
      where: { eventId: { in: events }, retryOfId: { not: null } },
    });
    await prisma.outboundMessage.deleteMany({ where: { eventId: { in: events } } });
    await prisma.event.deleteMany({ where: { id: { in: events } } });
  }
  if (people.length) {
    await prisma.auditEntry.deleteMany({ where: { actorId: { in: people } } });
    await prisma.person.deleteMany({ where: { id: { in: people } } });
  }
  if (users.length) {
    await prisma.session.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  }
}

// ── The email, answered here (as test:decide-by-email does) ─────────────────────────────────
type Mail = { to: string[]; subject: string; text: string };
const mails: Mail[] = [];
let nonResendCalls = 0;
const realFetch = globalThis.fetch;
function stubFetch() {
  globalThis.fetch = (async (url: unknown, init?: { body?: string }) => {
    if (String(url).includes('resend')) {
      const body = JSON.parse(init?.body ?? '{}');
      mails.push({ to: [body.to ?? []].flat(), subject: body.subject, text: body.text });
      return new Response(JSON.stringify({ id: `${TAG}-${mails.length}` }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    nonResendCalls++;
    return new Response('{}', { status: 500 });
  }) as typeof fetch;
}

// ── The 18 edited files and their named hunks, each [before, after] (K) ─────────────────────
// Each `before` must be found exactly once (in order); 8454fed's file with every hunk applied must
// be the file now, byte for byte.
const K_HUNKS: Record<string, [string, string][]> = {
  'src/lib/lifecycle.ts': [
    [
      "import type { EventStatus } from '@prisma/client';\n\n",
      "import type { EventStatus } from '@prisma/client';\nimport { sessionDateKey } from './sessions/dates';\nimport { isSessionsOn } from './sessions/switch';\n\n",
    ],
    [
      ' * function supplies only the anchor both clocks share.\n */\n',
      " * function supplies only the anchor both clocks share.\n *\n * [[GTC-485]] (Q8; the founder's ruling 5 at GTC-480): while the sessions switch is on, a dish\n * with a session and no drop-off time is needed by its session's date, at the instant a form-made\n * event's last day is stored as (00:00 UTC on that NZ date: 1pm NZ, noon in winter), never later\n * than the event's own end. The date is read by GTC-479's rule (`sessionDateKey`). Off, or no\n * session: the old line, word for word.\n */\n",
    ],
    [
      ' */\nexport function neededBy(item: { dropOffAt: Date | null }, event: LifecycleEvent): Date {\n  return item.dropOffAt ?? event.endDate;\n',
      ' */\nexport function neededBy(\n  item: { dropOffAt: Date | null; day?: { date: Date } | null },\n  event: LifecycleEvent\n): Date {\n  if (item.dropOffAt === null && item.day && isSessionsOn()) {\n    const at = new Date(`${sessionDateKey(item.day.date)}T00:00:00.000Z`);\n    return at.getTime() < event.endDate.getTime() ? at : event.endDate;\n  }\n  return item.dropOffAt ?? event.endDate;\n',
    ],
    [
      ' *\n * This module stays client-safe: its only import is a type, which erases at build.\n */\n',
      ' *\n * This module stays client-safe: its imports are a type, which erases at build, and ([[GTC-485]])\n * the sessions date helper and switch, which import nothing.\n */\n',
    ],
  ],
  'src/lib/decide-by.ts': [
    [
      '  dropOffAt: Date | null;\n}\n',
      "  dropOffAt: Date | null;\n  /**\n   * [[GTC-485]] D: the dish's session, where it is loaded. `neededBy` reads it only while the\n   * sessions switch is on.\n   */\n  day?: { date: Date } | null;\n}\n",
    ],
  ],
  'src/lib/sms/decide-by-eligibility.ts': [
    [
      '          decideByOffsetHours: true,\n          team: {\n',
      '          decideByOffsetHours: true,\n          day: { select: { date: true } },\n          team: {\n',
    ],
  ],
  'src/lib/sms/decide-by-sender.ts': [
    [
      '      },\n      select: { item: { select: { name: true, dropOffAt: true, decideByOffsetHours: true } } },\n    });\n',
      '      },\n      select: {\n        item: {\n          select: {\n            name: true,\n            dropOffAt: true,\n            decideByOffsetHours: true,\n            day: { select: { date: true } },\n          },\n        },\n      },\n    });\n',
    ],
  ],
  'src/lib/chase-reply-read.ts': [
    [
      '        decideByFollowupSentAt: true,\n        item: { select: { dropOffAt: true, decideByOffsetHours: true } },\n      },\n',
      '        decideByFollowupSentAt: true,\n        item: {\n          select: { dropOffAt: true, decideByOffsetHours: true, day: { select: { date: true } } },\n        },\n      },\n',
    ],
  ],
  'src/lib/glance/read.ts': [
    [
      "import type { Prisma } from '@prisma/client';\nimport {\n",
      "import type { Prisma } from '@prisma/client';\nimport { isSessionsOn } from '@/lib/sessions/switch';\nimport {\n",
    ],
    [
      '      decideByOffsetHours: true,\n    },\n',
      "      decideByOffsetHours: true,\n      // [[GTC-485]] D and F: the dish's session, for its decide-by clock and the reading list's tag.\n      // It reaches a colour only through the clock, and the tag is drawn only while the sessions\n      // switch is on.\n      day: { select: { name: true, date: true } },\n    },\n",
    ],
    [
      '      quantityUnitCustom: a.item.quantityUnitCustom,\n      item: { dropOffAt: a.item.dropOffAt, decideByOffsetHours: a.item.decideByOffsetHours },\n    });\n',
      "      quantityUnitCustom: a.item.quantityUnitCustom,\n      item: {\n        dropOffAt: a.item.dropOffAt,\n        decideByOffsetHours: a.item.decideByOffsetHours,\n        day: a.item.day,\n      },\n      // [[GTC-485]] F: the session's tag while the sessions switch is on; none for the whole event.\n      ...(isSessionsOn() && a.item.day?.name.trim() ? { session: a.item.day.name.trim() } : {}),\n    });\n",
    ],
    [
      '          decideByAt: decideByAtFor(i.response, i.item, glanceEvent),\n        };\n',
      '          decideByAt: decideByAtFor(i.response, i.item, glanceEvent),\n          ...(i.session ? { session: i.session } : {}),\n        };\n',
    ],
  ],
  'src/lib/glance/rewind.ts': [
    [
      '      response: true,\n      item: { select: { dropOffAt: true, decideByOffsetHours: true } },\n    },\n',
      '      response: true,\n      item: {\n        select: { dropOffAt: true, decideByOffsetHours: true, day: { select: { date: true } } },\n      },\n    },\n',
    ],
    [
      '      decideByOffsetHours: a.item.decideByOffsetHours,\n    });\n',
      '      decideByOffsetHours: a.item.decideByOffsetHours,\n      day: a.item.day,\n    });\n',
    ],
  ],
  'src/lib/glance/state.ts': [
    [
      '  item: DecideByItem;\n}\n',
      "  item: DecideByItem;\n  /**\n   * [[GTC-485]] F: the dish's session tag (its session's name), set only while the sessions\n   * switch is on; absent for a whole-event dish. Never a colour input.\n   */\n  session?: string;\n}\n",
    ],
    [
      '  decideByAt: string | null;\n}\n',
      "  decideByAt: string | null;\n  /** [[GTC-485]] F: the dish's session tag, as on `GlanceItemInput`; absent for a whole event. */\n  session?: string;\n}\n",
    ],
  ],
  'src/lib/events/event-dates.ts': [
    [
      ' * Q6: null before the press (the clock starts there), and null once that NZ day has passed.\n */\n',
      " * Q6: null before the press (the clock starts there), and null once that NZ day has passed.\n *\n * [[GTC-485]] D (the founder's ruling 5 at GTC-480): given the plan's rows (the board page gives\n * them only while the sessions switch is on), each counts back from its own session, a whole-event\n * row from the event's last day, with the event's offset; the line is the next of those days still\n * to come. Not given: the event's day, as before.\n */\n",
    ],
    [
      '  event: LifecycleEvent & { decideByOffsetHours: number | null },\n  now: Date\n): string | null {\n',
      '  event: LifecycleEvent & { decideByOffsetHours: number | null },\n  now: Date,\n  rows?: readonly { day: { date: Date } | null }[]\n): string | null {\n',
    ],
    [
      '  if (!isSent(event)) return null;\n  const at = decideBy({ dropOffAt: null, decideByOffsetHours: null }, event);\n',
      '  if (!isSent(event)) return null;\n  if (rows && rows.length > 0) {\n    const next = rows\n      .map((row) => decideBy({ dropOffAt: null, decideByOffsetHours: null, day: row.day }, event))\n      .filter((at) => nzDaysBetween(now, at) >= 0)\n      .sort((a, b) => a.getTime() - b.getTime())[0];\n    return next ? shortNzDay(next) : null;\n  }\n  const at = decideBy({ dropOffAt: null, decideByOffsetHours: null }, event);\n',
    ],
  ],
  'src/app/plan/[eventId]/glance/page.tsx': [
    [
      "import GuestRepliesButton from '@/components/demo/GuestRepliesButton';\n\n",
      "import GuestRepliesButton from '@/components/demo/GuestRepliesButton';\nimport { isSessionsOn } from '@/lib/sessions/switch';\n\n",
    ],
    [
      '\n  return (\n',
      '\n  // [[GTC-485]] D: while the sessions switch is on, "Answers by" counts each of the plan\'s rows\n  // from its own session (a whole-event row from the event\'s last day). Off: nothing is read here.\n  const sessionRows = isSessionsOn()\n    ? await prisma.item.findMany({\n        where: { team: { eventId } },\n        select: { day: { select: { date: true } } },\n      })\n    : undefined;\n\n  return (\n',
    ],
    [
      '        */\n        answersBy={answersByDay(event, now)}\n        daysToGo={daysToGoLine(event.startDate, now)}\n',
      '        */\n        answersBy={answersByDay(event, now, sessionRows)}\n        daysToGo={daysToGoLine(event.startDate, now)}\n',
    ],
  ],
  'src/components/glance/reading.ts': [
    [
      '  critical: boolean;\n}\n',
      "  critical: boolean;\n  /**\n   * [[GTC-485]] F: the dish's session tag, only when it has one (the sessions switch on). The\n   * plan's own session name, never a time anything happened.\n   */\n  session?: string;\n}\n",
    ],
    [
      '    critical: row.critical,\n  }));\n',
      '    critical: row.critical,\n    ...(row.session ? { session: row.session } : {}),\n  }));\n',
    ],
  ],
  'src/components/glance/GlancePersonReading.tsx': [
    [
      '                  ) : null}\n                  {/*\n',
      '                  ) : null}\n                  {/* [[GTC-485]] F: the session, small and grey; none for a whole-event dish. */}\n                  {row.session ? (\n                    <span\n                      data-reading-session=""\n                      className="rounded bg-white px-1.5 text-[11px] text-[#888780]"\n                    >\n                      {row.session}\n                    </span>\n                  ) : null}\n                  {/*\n',
    ],
  ],
  'src/app/api/p/[token]/route.ts': [
    [
      "import { guestAmountText } from '@/lib/guest/guest-amount';\n\n",
      "import { guestAmountText } from '@/lib/guest/guest-amount';\nimport { isSessionsOn } from '@/lib/sessions/switch';\nimport { sessionDateKey } from '@/lib/sessions/dates';\nimport { sessionWithDate } from '@/lib/sessions/tabs';\n\n",
    ],
    [
      '            critical: a.item.critical,\n            day: a.item.day ? { id: a.item.day.id, name: a.item.day.name } : null,\n          },\n',
      '            critical: a.item.critical,\n            day: a.item.day\n              ? { id: a.item.day.id, name: a.item.day.name, ...sessionLabel(a.item.day) }\n              : null,\n          },\n',
    ],
    [
      "\n/** One row on the wire. Shared by the recipient's own rows and by a carried child's. */\n",
      "\n/**\n * [[GTC-485]] E (the founder's rulings 4 and 5 at GTC-480): a dish's session as the guest page shows\n * it. While the sessions switch is on, its name and date (\"Christmas lunch, Fri 25 Dec\", or the date\n * alone when the name is only the date), read by GTC-479's date rule. Off, nothing: the wire is as\n * before and the page shows the name alone.\n */\nfunction sessionLabel(day: { name: string; date: Date }): { label?: string } {\n  return isSessionsOn()\n    ? { label: sessionWithDate({ name: day.name, date: sessionDateKey(day.date) }) }\n    : {};\n}\n\n/** One row on the wire. Shared by the recipient's own rows and by a carried child's. */\n",
    ],
    [
      '      dropOffNote: a.item.dropOffNote,\n      day: a.item.day ? { id: a.item.day.id, name: a.item.day.name, date: a.item.day.date } : null,\n    },\n',
      '      dropOffNote: a.item.dropOffNote,\n      day: a.item.day\n        ? {\n            id: a.item.day.id,\n            name: a.item.day.name,\n            date: a.item.day.date,\n            ...sessionLabel(a.item.day),\n          }\n        : null,\n    },\n',
    ],
  ],
  'src/app/p/[token]/page.tsx': [
    [
      '      critical: boolean;\n      day: { id: string; name: string } | null;\n    };\n',
      "      critical: boolean;\n      // [[GTC-485]] E: the session's name and date, sent only while the sessions switch is on.\n      day: { id: string; name: string; label?: string } | null;\n    };\n",
    ],
    [
      '      date: string;\n    } | null;\n',
      "      date: string;\n      // [[GTC-485]] E: the session's name and date, sent only while the sessions switch is on.\n      label?: string;\n    } | null;\n",
    ],
    [
      '                      {a.item.day && (\n                        <span className="text-gray-400 text-xs">({a.item.day.name})</span>\n                      )}\n',
      '                      {a.item.day && (\n                        <span className="text-gray-400 text-xs">\n                          ({a.item.day.label ?? a.item.day.name})\n                        </span>\n                      )}\n',
    ],
    [
      '                  <Calendar className="size-5 text-gray-400" />\n                  <span className="text-gray-900">{assignment.item.day.name}</span>\n                </div>\n',
      '                  <Calendar className="size-5 text-gray-400" />\n                  <span className="text-gray-900">\n                    {assignment.item.day.label ?? assignment.item.day.name}\n                  </span>\n                </div>\n',
    ],
  ],
  'src/lib/messages/ask-register.ts': [
    [
      '  occasionDescription: string | null;\n}\n',
      "  occasionDescription: string | null;\n  /**\n   * [[GTC-485]] G: the event's last day, given only while the sessions switch is on and the\n   * event's first and last days are different NZ dates (`readAskPreview`). Absent, the draft names\n   * the first day alone, as before.\n   */\n  endDate?: Date;\n}\n",
    ],
    [
      '  const occasion = event.occasionDescription?.trim();\n\n',
      '  const occasion = event.occasionDescription?.trim();\n  // [[GTC-485]] G: an event over more than one date names its first and last days.\n  const first = formatEventDay(event.startDate);\n  const last = event.endDate ? formatEventDay(event.endDate) : first;\n  const when = last === first ? `on ${first}` : `from ${first} to ${last}`;\n\n',
    ],
    [
      "  return [\n    `We're doing ${event.name} on ${formatEventDay(event.startDate)}${where}.`,\n    occasion ? `${occasion}` : null,\n",
      "  return [\n    `We're doing ${event.name} ${when}${where}.`,\n    occasion ? `${occasion}` : null,\n",
    ],
  ],
  'src/lib/preflight/ask-preview.ts': [
    [
      "import { SMS_OPT_OUT_IN_FORCE } from '@/lib/sms/opt-out-service';\n\n",
      "import { SMS_OPT_OUT_IN_FORCE } from '@/lib/sms/opt-out-service';\nimport { isSessionsOn } from '@/lib/sessions/switch';\nimport { sessionDateKey } from '@/lib/sessions/dates';\n\n",
    ],
    [
      '    invitesOnly?: boolean;\n  };\n',
      "    invitesOnly?: boolean;\n    /**\n     * [[GTC-485]] G: the event's last day, only while the sessions switch is on and the event's\n     * first and last days are different NZ dates, so the draft first line names both. Absent\n     * otherwise: the facts are exactly as before.\n     */\n    endDate?: Date;\n  };\n",
    ],
    [
      '      startDate: true,\n      venueName: true,\n',
      "      startDate: true,\n      // [[GTC-485]] G: read for the draft first line's last day; given on only as below.\n      endDate: true,\n      venueName: true,\n",
    ],
    [
      '      invitesOnly: event.setup?.invitesOnly === true,\n    },\n',
      '      invitesOnly: event.setup?.invitesOnly === true,\n      ...(isSessionsOn() && sessionDateKey(event.endDate) !== sessionDateKey(event.startDate)\n        ? { endDate: event.endDate }\n        : {}),\n    },\n',
    ],
  ],
  'src/lib/preflight/ask-preview-compose.ts': [
    [
      "type WireDate<T> = Omit<T, 'event'> & {\n  event: Omit<AskPreview['event'], 'startDate'> & { startDate: Date | string };\n};\n",
      "type WireDate<T> = Omit<T, 'event'> & {\n  event: Omit<AskPreview['event'], 'startDate' | 'endDate'> & {\n    startDate: Date | string;\n    endDate?: Date | string;\n  };\n};\n",
    ],
    [
      '): ComposedPreview {\n  const event = { ...preview.event, startDate: new Date(preview.event.startDate) };\n\n',
      '): ComposedPreview {\n  // [[GTC-485]] G: the last day, when the preview carries one, back from its wire form.\n  const { endDate, ...facts } = preview.event;\n  const event = {\n    ...facts,\n    startDate: new Date(preview.event.startDate),\n    ...(endDate ? { endDate: new Date(endDate) } : {}),\n  };\n\n',
    ],
  ],
  'src/app/plan/[eventId]/pre-flight/page.tsx': [
    [
      '            startDate: new Date(data.event.startDate),\n            venueName: data.event.venueName,\n',
      '            startDate: new Date(data.event.startDate),\n            // [[GTC-485]] G: the last day, only while the sessions switch is on and the event spans\n            // more than one date (a string on the wire, as the first day is).\n            ...(data.event.endDate ? { endDate: new Date(data.event.endDate) } : {}),\n            venueName: data.event.venueName,\n',
    ],
  ],
};

function applyHunks(base: string, hunks: [string, string][]): string | null {
  let s = base;
  for (const [a, b] of hunks) {
    if (count(s, a) !== 1) return null;
    s = s.replace(a, () => b);
  }
  return s;
}

async function main() {
  liveBehindTrap();
  process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
  process.env.RESEND_API_KEY = `re_${TAG}_sentinel_key_000000000000`;
  process.env.UNSUBSCRIBE_TOKEN_SECRET = process.env.UNSUBSCRIBE_TOKEN_SECRET || `${TAG}-secret`;
  for (const k of [
    'TNZ_AUTH_TOKEN',
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN',
    'TWILIO_PHONE_NUMBER',
  ])
    delete process.env[k];
  stubFetch();
  delete (process.env as Record<string, string | undefined>)[VAR];

  const startCounts = await tableCounts();
  const sentBefore = [await prisma.outboundMessage.count(), await prisma.inviteEvent.count()];

  const L = await import('../src/lib/lifecycle');
  const DB = await import('../src/lib/decide-by');
  const ED = await import('../src/lib/events/event-dates');
  const TABS = await import('../src/lib/sessions/tabs');
  const DATES = await import('../src/lib/sessions/dates');
  const EL = await import('../src/lib/sms/decide-by-eligibility');
  const SE = await import('../src/lib/sms/decide-by-sender');
  const NT = await import('../src/lib/sms/nudge-templates');
  const GR = await import('../src/lib/glance/read');
  const RD = await import('../src/components/glance/reading');
  const AP = await import('../src/lib/preflight/ask-preview');
  const APC = await import('../src/lib/preflight/ask-preview-compose');
  const AR = await import('../src/lib/messages/ask-register');

  // ══ D — the deadline, pure ═══════════════════════════════════════════════════════════════
  section('D — the deadline from the session: 1pm NZ on its date, never later than the event');
  const ev = (start: string, end: Date, sent = true) => ({
    status: 'CONFIRMING' as const,
    sentAt: sent ? utcDay('2026-11-01') : null,
    endDate: end,
    startDate: utcDay(start),
    decideByOffsetHours: null as number | null,
  });
  const xmas = ev('2026-12-24', utcDay('2026-12-26'));
  const dish = (date: Date | null, dropOffAt: Date | null = null) => ({
    dropOffAt,
    decideByOffsetHours: null as number | null,
    day: date ? { date } : null,
  });
  const lunch = dish(utcDay('2026-12-25'));
  check(
    'D1',
    'switch off: a dish with a session is needed by the event’s end, as today',
    (await off(() => L.neededBy(lunch, xmas))).getTime() === xmas.endDate.getTime()
  );
  const lunchOn = await on(() => L.neededBy(lunch, xmas));
  check(
    'D2',
    'switch on: needed by its session’s date, 00:00 UTC on it, 1pm NZ in summer',
    lunchOn.getTime() === utcDay('2026-12-25').getTime() && nzHour(lunchOn) === 13,
    lunchOn
  );
  const winter = await on(() =>
    L.neededBy(dish(utcDay('2027-06-15')), ev('2027-06-14', utcDay('2027-06-20')))
  );
  check(
    'D3',
    'switch on, a winter session: noon NZ on its date',
    winter.getTime() === utcDay('2027-06-15').getTime() && nzHour(winter) === 12,
    winter
  );
  const seedForm = await on(() => L.neededBy(dish(nzMidnight('2026-12-25')), xmas));
  check(
    'D4',
    'switch on: the seed’s NZ-midnight form of the same date gives the same moment (the date rule)',
    seedForm.getTime() === lunchOn.getTime(),
    seedForm
  );
  const seedEnd = ev('2026-12-24', nzMidnight('2026-12-26'));
  const lastDay = await on(() => L.neededBy(dish(utcDay('2026-12-26')), seedEnd));
  const pastEnd = await on(() => L.neededBy(dish(utcDay('2026-12-28')), xmas));
  check(
    'D5',
    'switch on: never later than the event’s own end (a seed-form end; a session after the end)',
    lastDay.getTime() === seedEnd.endDate.getTime() && pastEnd.getTime() === xmas.endDate.getTime(),
    { lastDay, pastEnd }
  );
  const drop = new Date('2026-12-25T05:00:00.000Z');
  check(
    'D6',
    'switch on: a drop-off time, where one exists, still wins',
    (await on(() => L.neededBy(dish(utcDay('2026-12-24'), drop), xmas))).getTime() ===
      drop.getTime()
  );
  check(
    'D7',
    'switch on: a whole-event dish (no session, or none loaded) is needed by the event’s end',
    (await on(() => L.neededBy(dish(null), xmas))).getTime() === xmas.endDate.getTime() &&
      (await on(() => L.neededBy({ dropOffAt: null }, xmas))).getTime() === xmas.endDate.getTime()
  );
  const lunchBy = await on(() => DB.decideBy(lunch, xmas));
  const lunchByOff = await off(() => DB.decideBy(lunch, xmas));
  check(
    'D8',
    'the decide-by counts back 5 days from the session on, from the event’s end off',
    lunchBy.getTime() === utcDay('2026-12-25').getTime() - 120 * HOUR &&
      lunchByOff.getTime() === xmas.endDate.getTime() - 120 * HOUR,
    { lunchBy, lunchByOff }
  );
  const eveMaybe = dish(utcDay('2026-12-24'));
  const at19 = new Date('2026-12-19T06:00:00.000Z'); // 19 Dec, 7pm NZ
  check(
    'D9',
    'a maybe on an earlier session runs out sooner: expired on, still live off, at the same moment',
    (await on(() => DB.isDecideByExpired({ response: 'MAYBE' }, eveMaybe, xmas, at19))) === true &&
      (await off(() => DB.isDecideByExpired({ response: 'MAYBE' }, eveMaybe, xmas, at19))) === false
  );
  const rows = [
    { day: { date: utcDay('2026-12-24') } },
    { day: { date: utcDay('2026-12-25') } },
    { day: null },
  ];
  const dec1 = new Date('2026-12-01T00:00:00.000Z');
  check(
    'D10',
    '"Answers by": switch off, the rows read exactly as no rows (the event’s day, Mon 21 Dec)',
    (await off(() => ED.answersByDay(xmas, dec1, rows))) === ED.answersByDay(xmas, dec1) &&
      ED.answersByDay(xmas, dec1) === 'Mon 21 Dec',
    await off(() => ED.answersByDay(xmas, dec1, rows))
  );
  const by = (now: Date) => on(() => ED.answersByDay(xmas, now, rows));
  const steps = [
    await by(dec1),
    await by(new Date('2026-12-19T05:00:00.000Z')),
    await by(new Date('2026-12-19T23:00:00.000Z')),
    await by(new Date('2026-12-20T23:00:00.000Z')),
    await by(new Date('2026-12-21T12:00:00.000Z')),
  ];
  check(
    'D11',
    '"Answers by", switch on: the next answer day still to come, each row from its own session, a whole-event row from the last day (today counts; none left, no line)',
    JSON.stringify(steps) ===
      JSON.stringify(['Sat 19 Dec', 'Sat 19 Dec', 'Sun 20 Dec', 'Mon 21 Dec', null]),
    steps
  );
  check(
    'D12',
    '"Answers by": nothing before the press, on or off',
    (await on(() => ED.answersByDay(ev('2026-12-24', utcDay('2026-12-26'), false), dec1, rows))) ===
      null
  );

  // ══ The made-up sent event the finder, the retry and the board read ══════════════════════
  const now = new Date();
  const stamp = Date.now();
  const mail = (who: string) => `gtc485+${who}+${stamp}@example.test`;
  const stem = String(stamp).slice(-5);
  let phoneSeq = 10;
  const phone = () => `+6421${stem}${String(phoneSeq++).padStart(2, '0')}`;
  const keyIn = (days: number) => keyOf(new Date(now.getTime() + days * DAY));
  const dateA = keyIn(8);
  const dateB = keyIn(14);
  const endDate = utcDay(keyIn(20));
  const sentAt = new Date(now.getTime() - 3 * DAY);
  const momentA = utcDay(dateA);
  const decideA = new Date(momentA.getTime() - 120 * HOUR);
  const nowA = new Date(decideA.getTime() - 12 * HOUR); // inside A's follow-up window
  const nowPast = new Date(decideA.getTime() + 12 * HOUR); // A's decide-by just gone

  const user = await prisma.user.create({ data: { email: mail('host') } });
  note('users', user.id);
  const host = await prisma.person.create({
    data: { name: `${TAG} Kate`, email: mail('host'), userId: user.id },
  });
  note('people', host.id);
  const eventId = `${TAG.toLowerCase()}d`;
  note('events', eventId);
  await prisma.event.create({
    data: {
      id: eventId,
      name: `${TAG} Christmas`,
      startDate: momentA,
      endDate,
      hostId: host.id,
      status: 'CONFIRMING',
      sentAt,
    },
  });
  await prisma.personEvent.create({ data: { personId: host.id, eventId, role: 'HOST' } });
  const team = await prisma.team.create({ data: { eventId, name: `${TAG} Mains` } });
  const dayA = await prisma.day.create({
    data: { eventId, name: 'Christmas lunch', date: momentA },
  });
  const dayB = await prisma.day.create({
    data: { eventId, name: DATES.sessionDateWords(dateB), date: utcDay(dateB) },
  });
  const guest = async (
    name: string,
    holds: { item: string; dayId: string | null }[],
    followupSentAt: Date | null
  ) => {
    const p = await prisma.person.create({
      data: { name: `${TAG} ${name}`, email: mail(name.toLowerCase()), phoneNumber: phone() },
    });
    note('people', p.id);
    const pe = await prisma.personEvent.create({
      data: {
        personId: p.id,
        eventId,
        role: 'PARTICIPANT',
        reachabilityTier: 'DIRECT',
        contactMethod: 'SMS',
        householdRole: 'GUEST',
        sentAt,
      },
    });
    await prisma.accessToken.create({
      data: { token: `${TAG}-${pe.id}`, scope: 'PARTICIPANT', eventId, personId: p.id },
    });
    const items: Record<string, string> = {};
    for (const h of holds) {
      const it = await prisma.item.create({
        data: {
          teamId: team.id,
          name: `${TAG} ${h.item}`,
          kind: 'ITEM',
          status: 'ASSIGNED',
          dayId: h.dayId,
        } as any,
      });
      items[h.item] = it.id;
      await prisma.assignment.create({
        data: {
          itemId: it.id,
          personId: p.id,
          response: 'MAYBE',
          decideByFollowupSentAt: followupSentAt,
        },
      });
    }
    return { p, pe, items };
  };
  const ann = await guest(
    'Ann',
    [
      { item: 'pavlova', dayId: dayA.id },
      { item: 'napkins', dayId: null },
    ],
    null
  );
  const ben = await guest('Ben', [{ item: 'trifle', dayId: dayB.id }], null);

  // ══ Z7 — the finder (it only reads) ═══════════════════════════════════════════════════════
  section('Z7 — the follow-up’s finder: an earlier session’s maybe is due sooner (switch on only)');
  const mine = (r: any) => (r?.eligible ?? []).filter((c: any) => c.eventId === eventId);
  const offA = mine(await off(() => EL.findDecideByFollowupCandidates(nowA)));
  const onA = mine(await on(() => EL.findDecideByFollowupCandidates(nowA)));
  check(
    'Z7.1',
    'switch off, inside the session’s window: nobody here is due (the event’s end is far)',
    offA.length === 0,
    offA
  );
  check(
    'Z7.2',
    'switch on, the same moment: exactly one follow-up, to Ann, naming the dish on the earlier session and its decide-by',
    onA.length === 1 &&
      onA[0].personId === ann.p.id &&
      onA[0].itemName === `${TAG} pavlova` &&
      new Date(onA[0].decideByAt).getTime() === decideA.getTime(),
    onA.map((c: any) => ({ who: c.personName, item: c.itemName, at: c.decideByAt }))
  );
  const onPast = mine(await on(() => EL.findDecideByFollowupCandidates(nowPast)));
  const offPast = mine(await off(() => EL.findDecideByFollowupCandidates(nowPast)));
  check(
    'Z7.3',
    'switch on, the session’s decide-by just gone: no text (already passed); off: still none (not yet)',
    onPast.length === 0 && offPast.length === 0,
    { onPast: onPast.length, offPast: offPast.length }
  );
  const words = NT.formatDecideByDay(decideA, nowA);
  check(
    'Z7.4',
    'the one message’s day is the session’s decide-by, in the follow-up’s own words helper',
    onA.length === 1 && NT.formatDecideByDay(new Date(onA[0].decideByAt), nowA) === words,
    words
  );

  // ══ Z9 — the email retry, scoped to this event, the email answered here ═══════════════════
  section('Z9 — the follow-up’s email retry names the maybe whose session runs out first');
  const failedText = (pe: { id: string }, destination: string) =>
    prisma.outboundMessage.create({
      data: {
        eventId,
        personEventId: pe.id,
        kind: 'DECIDE_BY_FOLLOWUP',
        channel: 'TEXT',
        createdAt: new Date(nowA.getTime() - 3 * HOUR),
        attemptedAt: new Date(nowA.getTime() - 3 * HOUR),
        attemptCount: 1,
        acceptedAt: new Date(nowA.getTime() - 3 * HOUR),
        provider: 'tnz',
        providerMessageId: `${TAG}-mid-${pe.id}`,
        destination,
        deliveryState: 'TEXT_DEAD_CHANNEL',
        deliveryCheckedAt: new Date(nowA.getTime() - HOUR),
        deliveryPollDoneAt: new Date(nowA.getTime() - HOUR),
      } as any,
    });
  const cat = await guest(
    'Cat',
    [
      { item: 'ham', dayId: dayA.id },
      { item: 'ice', dayId: null },
    ],
    sentAt
  );
  await failedText(cat.pe, cat.p.phoneNumber!);
  const before1 = mails.length;
  const r1: any = await on(() => SE.retryUndeliveredFollowups(nowA, { eventIds: [eventId] }));
  const m1 = mails.slice(before1);
  check(
    'Z9.1',
    'switch on: one email, to Cat, naming the dish on the earlier session and that session’s day',
    r1?.sent === 1 &&
      m1.length === 1 &&
      m1[0].to.includes(cat.p.email!) &&
      m1[0].text.includes(`${TAG} ham`) &&
      m1[0].text.includes(words),
    {
      result: r1 && { sent: r1.sent, withheld: r1.withheld, refused: r1.refused },
      mails: m1.map((m) => m.text.slice(0, 200)),
    }
  );
  const dan = await guest(
    'Dan',
    [
      { item: 'salad', dayId: dayA.id },
      { item: 'cups', dayId: null },
    ],
    sentAt
  );
  await failedText(dan.pe, dan.p.phoneNumber!);
  const before2 = mails.length;
  const r2: any = await off(() => SE.retryUndeliveredFollowups(nowA, { eventIds: [eventId] }));
  const m2 = mails.slice(before2);
  const endWords = NT.formatDecideByDay(new Date(endDate.getTime() - 120 * HOUR), nowA);
  check(
    'Z9.2',
    'switch off: one email, to Dan, naming the event’s day as today (never the session’s)',
    r2?.sent === 1 &&
      m2.length === 1 &&
      m2[0].to.includes(dan.p.email!) &&
      m2[0].text.includes(endWords) &&
      (words === endWords || !m2[0].text.includes(words)),
    { result: r2 && { sent: r2.sent }, endWords, mails: m2.map((m) => m.text.slice(0, 200)) }
  );

  // ══ F — the board ══════════════════════════════════════════════════════════════════════
  section('F — the board: the session tag on a held row; an earlier session’s maybe red sooner');
  const peopleOf = (g: any) => [...g.households.flatMap((h: any) => h.members), ...g.unhoused];
  const annOn = (await on(() => GR.readEventGlance(prisma as any, eventId, nowA))) as any;
  const annOff = (await off(() => GR.readEventGlance(prisma as any, eventId, nowA))) as any;
  const rowsOf = (g: any) => peopleOf(g).find((p: any) => p.personId === ann.p.id)?.items ?? [];
  const pav = (g: any) => rowsOf(g).find((i: any) => i.name === `${TAG} pavlova`);
  const nap = (g: any) => rowsOf(g).find((i: any) => i.name === `${TAG} napkins`);
  check(
    'F1',
    'switch off: no held row has a session key at all',
    rowsOf(annOff).length === 2 && rowsOf(annOff).every((i: any) => !('session' in i)),
    rowsOf(annOff)
  );
  check(
    'F2',
    'switch on: the session’s dish carries its tag ("Christmas lunch"); the whole-event dish has none',
    pav(annOn)?.session === 'Christmas lunch' && nap(annOn) && !('session' in nap(annOn)),
    rowsOf(annOn)
  );
  const benOn = (await on(() => GR.readEventGlance(prisma as any, eventId, nowA))) as any;
  const tri = peopleOf(benOn)
    .find((p: any) => p.personId === ben.p.id)
    ?.items.find((i: any) => i.name === `${TAG} trifle`);
  check(
    'F3',
    'a session named by its date is tagged with that date alone',
    tri?.session === DATES.sessionDateWords(dateB),
    tri?.session
  );
  const readOn = RD.readingRowsOf(rowsOf(annOn));
  const readOff = RD.readingRowsOf(rowsOf(annOff));
  check(
    'F4',
    'the reading list’s rows carry the tag only when present; with the switch off each keeps its four keys',
    readOn.find((r: any) => r.name === `${TAG} pavlova`)?.session === 'Christmas lunch' &&
      !('session' in (readOn.find((r: any) => r.name === `${TAG} napkins`) ?? { session: 1 })) &&
      readOff.every(
        (r: any) =>
          JSON.stringify(Object.keys(r).sort()) ===
          JSON.stringify(['critical', 'itemId', 'name', 'quantity'])
      ),
    { readOn, readOff }
  );
  const pastOn = (await on(() => GR.readEventGlance(prisma as any, eventId, nowPast))) as any;
  const pastOff = (await off(() => GR.readEventGlance(prisma as any, eventId, nowPast))) as any;
  check(
    'F5',
    'a maybe on the earlier session reads red once its session’s decide-by has gone (on); amber off',
    pav(pastOn)?.state === 'RED' &&
      pav(pastOff)?.state === 'AMBER' &&
      nap(pastOn)?.state === 'AMBER',
    { on: pav(pastOn)?.state, off: pav(pastOff)?.state, whole: nap(pastOn)?.state }
  );
  const reading = read('src/components/glance/GlancePersonReading.tsx');
  check(
    'F6',
    'the reading list draws the tag after the name and the "critical" mark, small and grey, only when the row has one',
    count(reading, '{row.session ? (') === 1 &&
      reading.indexOf('{row.session ? (') > reading.indexOf('>critical</span>') &&
      /data-reading-session=""\s+className="rounded bg-white px-1\.5 text-\[11px\] text-\[#888780\]"/.test(
        reading
      )
  );
  check(
    'F7',
    'the tapped surface and the board’s frame are not changed (the reading list only)',
    git([
      'diff',
      '--quiet',
      BASE,
      '--',
      'src/components/glance/PersonSurface.tsx',
      'src/components/glance/GlanceBoard.tsx',
    ]) !== null
  );

  // ══ E — the guest page ════════════════════════════════════════════════════════════════════
  section('E — the guest page: the session’s name and its date, through the date rule');
  const lunchWords = [utcDay('2026-12-25'), nzMidnight('2026-12-25')].map((d) =>
    TABS.sessionWithDate({ name: 'Christmas lunch', date: DATES.sessionDateKey(d) })
  );
  check(
    'E1',
    'the words: "Christmas lunch, Fri 25 Dec" from both stored forms; "Sat 26 Dec" alone when the name is the date',
    JSON.stringify(lunchWords) ===
      JSON.stringify(['Christmas lunch, Fri 25 Dec', 'Christmas lunch, Fri 25 Dec']) &&
      TABS.sessionWithDate({ name: 'Sat 26 Dec', date: '2026-12-26' }) === 'Sat 26 Dec',
    lunchWords
  );
  const route = codeOnly(read('src/app/api/p/[token]/route.ts'));
  check(
    'E2',
    'the route: a label only while the switch is on, through the date rule, on both day lines (the guest’s rows and a carried child’s; the host’s preview)',
    /function sessionLabel\(day: \{ name: string; date: Date \}\): \{ label\?: string \} \{\s*return isSessionsOn\(\)\s*\?\s*\{ label: sessionWithDate\(\{ name: day\.name, date: sessionDateKey\(day\.date\) \}\) \}\s*:\s*\{\};/.test(
      route
    ) && count(route, '...sessionLabel(a.item.day)') === 2,
    count(route, '...sessionLabel(a.item.day)')
  );
  const page = atMerged('src/app/p/[token]/page.tsx'); // [[GTC-481]]: as GTC-485 merged it
  check(
    'E3',
    'the page: the label where the name was, on the card and the preview; no new import',
    count(page, 'assignment.item.day.label ?? assignment.item.day.name') === 1 &&
      count(page, '({a.item.day.label ?? a.item.day.name})') === 1 &&
      (page.match(/^import .*$/gm) ?? []).join('\n') ===
        (atBase('src/app/p/[token]/page.tsx').match(/^import .*$/gm) ?? []).join('\n')
  );

  // ══ G — the invitation's draft first line ═════════════════════════════════════════════════
  section('G — the draft first line: the range for an event over more than one date');
  const draftEvent = async (suffix: string, start: string, end: string) => {
    const id = `${TAG.toLowerCase()}${suffix}`;
    note('events', id);
    await prisma.event.create({
      data: {
        id,
        name: 'Christmas',
        startDate: utcDay(start),
        endDate: utcDay(end),
        venueName: "Mum's",
        hostId: host.id,
        status: 'CONFIRMING',
      },
    });
    await prisma.personEvent.create({ data: { personId: host.id, eventId: id, role: 'HOST' } });
    const p = await prisma.person.create({
      data: { name: `${TAG} Jo ${suffix}`, email: mail(`jo-${suffix}`) },
    });
    note('people', p.id);
    await prisma.personEvent.create({ data: { personId: p.id, eventId: id, role: 'PARTICIPANT' } });
    const t = await prisma.team.create({ data: { eventId: id, name: `${TAG} Mains` } });
    const it = await prisma.item.create({
      data: { teamId: t.id, name: `${TAG} pavlova`, kind: 'ITEM' } as any,
    });
    await prisma.assignment.create({ data: { itemId: it.id, personId: p.id } });
    return id;
  };
  const three = await draftEvent('g3', '2026-12-24', '2026-12-26');
  const one = await draftEvent('g1', '2026-12-23', '2026-12-23');
  const RANGE =
    "We're doing Christmas from Thursday, 24 December to Saturday, 26 December, at Mum's.";
  const ONE = "We're doing Christmas on Wednesday, 23 December, at Mum's.";
  const THREE_OFF = "We're doing Christmas on Thursday, 24 December, at Mum's.";
  const TAIL = ' Would love to have you there.';
  const previewOf = (id: string) => AP.readAskPreview(prisma as any, id, 'http://localhost:3000');
  const threeOff: any = await off(() => previewOf(three));
  const threeOn: any = await on(() => previewOf(three));
  const oneOn: any = await on(() => previewOf(one));
  check(
    'G1',
    'switch off: the facts are exactly today’s (no endDate key), and the line names the first day only',
    !!threeOff &&
      JSON.stringify(Object.keys(threeOff.event).sort()) ===
        JSON.stringify(['invitesOnly', 'name', 'occasionDescription', 'startDate', 'venueName']) &&
      AR.draftAuthorLine(threeOff.event) === THREE_OFF + TAIL,
    threeOff && { keys: Object.keys(threeOff.event), line: AR.draftAuthorLine(threeOff.event) }
  );
  check(
    'G2',
    'switch on, three dates (no sessions): the facts carry the last day, and the line names the range, word for word',
    !!threeOn &&
      new Date(threeOn.event.endDate).getTime() === utcDay('2026-12-26').getTime() &&
      AR.draftAuthorLine(threeOn.event) === RANGE + TAIL,
    threeOn && AR.draftAuthorLine(threeOn.event)
  );
  check(
    'G3',
    'switch on, one date: no last day in the facts, and the line exactly as today',
    !!oneOn && !('endDate' in oneOn.event) && AR.draftAuthorLine(oneOn.event) === ONE + TAIL,
    oneOn && { keys: Object.keys(oneOn.event), line: AR.draftAuthorLine(oneOn.event) }
  );
  const wire = threeOn ? JSON.parse(JSON.stringify(threeOn)) : null;
  // The guest's rows only: the host's own row carries no ask (decision 20).
  const asks = (line: string | null) =>
    wire
      ? APC.composePreview(wire, line)
          .rows.filter((r: any) => r.ask)
          .map((r: any) => r.ask.text)
      : [];
  const sendText = asks(null);
  const savedText = asks('Come hungry.');
  check(
    'G4',
    'the send composes the same line from the wire form (no saved line); a saved line is never touched',
    sendText.length > 0 &&
      sendText.every((t: string) => t.includes(RANGE)) &&
      savedText.length > 0 &&
      savedText.every((t: string) => !t.includes(RANGE) && t.includes('Come hungry.')),
    { sendText, savedText }
  );
  check(
    'G5',
    'the range line is plain characters only (a straight apostrophe, no dash)',
    /^[\x20-\x7e]+$/.test(RANGE) && !/[’–—]/.test(AR.draftAuthorLine(threeOn?.event ?? {}) ?? '')
  );

  // ══ K — the files ═════════════════════════════════════════════════════════════════════════
  section('K — each edited file is 8454fed’s with exactly its named hunks, byte for byte');
  let k = 0;
  for (const [file, hunks] of Object.entries(K_HUNKS)) {
    k++;
    const base = atBase(file);
    const want = base.length > 0 ? applyHunks(base, hunks) : null;
    check(
      `K${k}`,
      `${file}: 8454fed plus exactly its ${hunks.length} named hunk(s)`,
      want !== null && (READ_AT_MERGE.includes(file) ? atMerged(file) : read(file)) === want
    );
  }
  // [[GTC-481]]: the source files as GTC-485 merged them; nothing untracked, read live.
  const srcNow = (git(['ls-tree', '-r', '--name-only', MERGED, 'src']) ?? '')
    .split('\n')
    .filter(Boolean);
  const srcBase = (git(['ls-tree', '-r', '--name-only', BASE, 'src']) ?? '')
    .split('\n')
    .filter(Boolean);
  const untrackedSrc = (git(['ls-files', '--others', '--exclude-standard', 'src']) ?? 'x').trim();
  check(
    `K${++k}`,
    'no new source file (the files under src are 8454fed’s, none untracked)',
    JSON.stringify(srcNow.sort()) === JSON.stringify(srcBase.sort()) && untrackedSrc === '',
    { now: srcNow.length, base: srcBase.length, untrackedSrc }
  );
  // [[GTC-481]]: the files GTC-485 edited, 8454fed to its merge.
  const changed = (git(['diff', '--name-only', BASE, MERGED, '--', 'src']) ?? '')
    .split('\n')
    .filter(Boolean);
  check(
    `K${++k}`,
    'the edited source files are exactly the 18 named',
    JSON.stringify(changed.sort()) === JSON.stringify(Object.keys(K_HUNKS).sort()),
    changed
  );
  const added = (git(['diff', '-U0', '--no-color', BASE, '--', 'src']) ?? 'x')
    .split('\n')
    .filter((l) => l.startsWith('+') && !l.startsWith('+++'));
  check(
    `K${++k}`,
    'no added line says remind or chase',
    added.length > 0 && !added.some((l) => /remind|chase/i.test(l)),
    added.filter((l) => /remind|chase/i.test(l))
  );
  check(
    `K${++k}`,
    'the schema, its migrations, the route list and the security suite are as at 8454fed (no migration, no new route)',
    gitGlob([
      'diff',
      '--quiet',
      BASE,
      MERGED, // [[GTC-481]]: as GTC-485 merged them
      '--',
      'prisma',
      'route-classifications.json',
      ':(glob)tests/security-*',
    ]) !== null &&
      (
        git(['ls-files', '--others', '--exclude-standard', 'prisma', 'src/app/api']) ?? 'x'
      ).trim() === ''
  );
  const pkgNow = JSON.parse(atMerged('package.json') || '{}'); // [[GTC-481]]: as GTC-485 merged it
  const pkgBase = JSON.parse(atBase('package.json') || '{}');
  const SCRIPT = 'test:sessions-guests-clock';
  const VALUE = 'tsx --tsconfig tests/tsconfig.json tests/sessions-guests-clock-test.tsx';
  const pkgOk = (() => {
    if (pkgNow?.scripts?.[SCRIPT] !== VALUE || pkgBase?.scripts?.[SCRIPT] !== undefined)
      return false;
    const copy = JSON.parse(JSON.stringify(pkgNow));
    delete copy.scripts[SCRIPT];
    return JSON.stringify(copy) === JSON.stringify(pkgBase);
  })();
  check(`K${++k}`, 'package.json is 8454fed’s with exactly the one script line', pkgOk);

  // ══ Z — nothing sent; every row removed ═══════════════════════════════════════════════════
  section('Z — nothing left the process; every row this run made removed by id');
  check(
    'Z1',
    'nothing left the process: no trapped request, no request but the two answered here',
    trapCount() === 0 && nonResendCalls === 0 && mails.length === 2,
    { trap: trapCount(), other: nonResendCalls, mails: mails.length }
  );
  await cleanUp();
  const sentAfter = [await prisma.outboundMessage.count(), await prisma.inviteEvent.count()];
  check(
    'Z2',
    'the OutboundMessage and InviteEvent counts are as found',
    JSON.stringify(sentAfter) === JSON.stringify(sentBefore),
    { sentBefore, sentAfter }
  );
  const left = await Promise.all([
    prisma.event.count({ where: { id: { in: made.events } } }),
    prisma.person.count({ where: { id: { in: made.people } } }),
    prisma.user.count({ where: { id: { in: made.users } } }),
  ]);
  check(
    'Z3',
    "none of this run's events, people or users is left",
    left.every((n) => n === 0),
    left
  );
  const endCounts = await tableCounts();
  const moved = Object.keys({ ...startCounts, ...endCounts }).filter(
    (t) => startCounts[t] !== endCounts[t]
  );
  check('Z4', "every table's count is as found", moved.length === 0, moved);
}

main()
  .catch((e) => {
    failed++;
    console.log(`\x1b[31m✗\x1b[0m the run stopped: ${(e as Error).message}`);
  })
  .finally(async () => {
    globalThis.fetch = realFetch;
    try {
      await cleanUp();
    } catch (e) {
      console.log(`clean-up: ${(e as Error).message}`);
    }
    try {
      const left = await prisma.event.count({ where: { id: { in: made.events } } });
      if (left === 0) fs.rmSync(FIXTURE_FILE, { force: true });
    } catch {
      // the fixture file stays, naming what is left
    }
    await prisma.$disconnect();
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
  });
