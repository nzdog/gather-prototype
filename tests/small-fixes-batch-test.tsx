/**
 * [[GTC-487]] — five small fixes, one ticket (the founder's brief and rulings, 28 Nov 2026).
 *
 *   A  the board's red panel draws the dish's session tag, as the reading panel draws it
 *   B  a quantity of 1 reads singular for a word of the unit list ("1 tray"), on every screen
 *   C  the Sessions card reads its route again when the page comes back into view
 *   D  the plan screen's bottom bar folds away when she taps (Less / More), kept on her device
 *   E  Regenerate shows Generate's bar: the whole plan, and one category with its own clock
 *   K  exactly these files, and nothing else: no route, no migration, no AI, no send
 *   Z  its own fixture, removed by id; nothing left the process; every table as found
 *
 * Its fixture: one sent event of its own on gather_dev (a host, a guest who handed a dish back),
 * every id written to a file first, removed by id however the suite ends. No server, no AI; the
 * provider keys are blanked in its own process and the provider trap counts any request.
 *
 * Before the source commit (the red run) the new module is absent and the checks of A to E fail;
 * K1 and K11 fail too (no file is edited yet). Run:
 *   npx tsx --tsconfig tests/tsconfig.json tests/small-fixes-batch-test.tsx
 */
import { prisma } from '../src/lib/prisma';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { installProviderTrap, trapCount } from './helpers/provider-trap';
import {
  GTC487_PLAN_VIEW_CHANGES,
  withoutGtc487PlanView,
} from './helpers/gtc487-plan-view-changes';

const ROOT = path.join(__dirname, '..');
const BASE = '89da9a3'; // origin/main when GTC-487 began (the merge of pull request #128, GTC-482)
const TAG = `S487${Date.now().toString(36)}`;
const VAR = 'GATHER_SESSIONS';
const FIXTURE_FILE =
  process.env.GTC487_FIXTURE_FILE ?? path.join(os.tmpdir(), `gtc487-small-fixes-${TAG}.json`);
const DAY = 864e5;

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
const gitOk = (args: string[]) => git(args) !== null;
const atBase = (rel: string) => git(['show', `${BASE}:${rel}`]) ?? '';
const count = (s: string, needle: string) => (needle ? s.split(needle).length - 1 : 0);
const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const html = (el: any): string => {
  try {
    return renderToStaticMarkup(el);
  } catch (e) {
    return `THREW ${(e as Error).message}`;
  }
};
const lines = (s: string | null) => (s ?? '').split('\n').filter(Boolean);
async function load(rel: string): Promise<any> {
  try {
    return await import(`../${rel.replace(/\.tsx?$/, '')}`);
  } catch {
    return null;
  }
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

// ── The fixture, every id written down before it is used ───────────────────────────────────
const made: Record<'people' | 'events', string[]> = { people: [], events: [] };
function note(kind: keyof typeof made, id: string) {
  made[kind].push(id);
  fs.writeFileSync(FIXTURE_FILE, JSON.stringify({ tag: TAG, ...made }, null, 2), { mode: 0o600 });
}
async function cleanUp() {
  const { events, people } = made;
  if (events.length) {
    await prisma.inviteEvent.deleteMany({ where: { eventId: { in: events } } });
    await prisma.outboundMessage.deleteMany({ where: { eventId: { in: events } } });
    await prisma.event.deleteMany({ where: { id: { in: events } } });
  }
  if (people.length) {
    await prisma.auditEntry.deleteMany({ where: { actorId: { in: people } } });
    await prisma.person.deleteMany({ where: { id: { in: people } } });
  }
}
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

// ── The files ───────────────────────────────────────────────────────────────────────────────
const F = {
  words: 'src/lib/items/unit-words.ts',
  surface: 'src/components/glance/PersonSurface.tsx',
  readingPanel: 'src/components/glance/GlancePersonReading.tsx',
  reading: 'src/components/glance/reading.ts',
  split: 'src/lib/moment3/share-split.ts',
  plan: 'src/components/plan/Moment2PlanView.tsx',
  skeleton: 'src/components/plan/Moment2Step2Skeleton.tsx',
  setup: 'src/app/plan/[eventId]/setup/page.tsx',
  card: 'src/components/sessions/Moment1Sessions.tsx',
  wait: 'src/lib/setup/plan-wait.ts',
};
/** The nine source files, exactly (the founder's word: "the nine source files as named"). */
const EDITED = [F.setup, F.surface, F.reading, F.plan, F.skeleton, F.card, F.split, F.wait].sort();
const NEW_SRC = [F.words];
/** The new file's bytes, as written (SHA-256). */
const WORDS_SHA = 'fff72f794e1d59373bfe229717e963451b64271e98a25e42e46db264f8bbe139';

/**
 * Each edited file's named changes, [was, is], in order, against 89da9a3. The plan view's sixteen
 * are in tests/helpers/gtc487-plan-view-changes.ts (three older suites take them back too).
 */
const CHANGES: Record<string, [string, string][]> = {
  'src/app/plan/[eventId]/setup/page.tsx': [
    [
      "import { shownMarks } from '@/lib/items/dish-marks';\n",
      "import { shownMarks } from '@/lib/items/dish-marks';\nimport { unitWordFor } from '@/lib/items/unit-words';\n",
    ],
    [
      "          const kind = item.kind ?? 'ITEM';\n          const amountAndUnit = [item.quantityAmount ?? '', mapItemUnitToDisplay(item)]\n",
      "          const kind = item.kind ?? 'ITEM';\n          // [[GTC-487]] B: \"1 tray\", not \"1 trays\", on Moment 3's row and its Details box.\n          const unitWord = unitWordFor(item.quantityAmount, mapItemUnitToDisplay(item));\n          const amountAndUnit = [item.quantityAmount ?? '', unitWord]\n",
    ],
  ],
  'src/components/glance/PersonSurface.tsx': [
    [
      " * file. No plan content beyond the row's own name: no quantity, no team name, no\n * drop-off, no notes. No history, no message log, no counts of anything — with ONE\n",
      " * file. No plan content beyond the row's own name: no quantity, no team name, no\n * drop-off, no notes. ([[GTC-487]] A, the founder's brief of 28 Nov 2026: with the sessions switch\n * on, the dish's session tag too, drawn as the reading panel draws it, so two dishes of one name\n * can be told apart. Still no quantity, team, drop-off or notes.) No history, no message log, no counts of anything — with ONE\n",
    ],
    [
      '                      ) : null}\n',
      '                      ) : null}\n                      {/* [[GTC-487]] A: the session, as the reading panel draws it; none for a whole-event dish. */}\n                      {row.session ? (\n                        <span\n                          data-surface-session=""\n                          className="rounded bg-white px-1.5 text-[11px] text-[#888780]"\n                        >\n                          {row.session}\n                        </span>\n                      ) : null}\n',
    ],
  ],
  'src/components/glance/reading.ts': [
    [
      "import { CHASE_DOOR_LINK, chaseDoorHref } from '@/lib/preflight/after-press-words';\n",
      "import { CHASE_DOOR_LINK, chaseDoorHref } from '@/lib/preflight/after-press-words';\nimport { unitWordFor } from '@/lib/items/unit-words';\n",
    ],
    [
      ' * it reads that way because the alternative is editing her.\n',
      ' * it reads that way because the alternative is editing her.\n *\n * ⚠ NARROWED, NOT DELETED — [[GTC-487]] (the founder\'s ruling 7, 28 Nov 2026): "A word that is\n * exactly one of the list\'s words, same letters and same case, reads singular at exactly 1. Every\n * other word, and every other amount, reads exactly as stored." Moment 2\'s unit list saves a picked\n * word as a custom unit too, so "1 trays" now reads "1 tray" (`unitWordFor`); "1 big bowl" stays.\n',
    ],
    [
      '    const custom = item.quantityUnitCustom;\n    return custom ? `${amount} ${custom}` : `${amount}`;\n',
      '    const custom = item.quantityUnitCustom;\n    return custom ? `${amount} ${unitWordFor(amount, custom)}` : `${amount}`;\n',
    ],
  ],
  'src/components/plan/Moment2Step2Skeleton.tsx': [
    [
      "import { planWaitPercent, planWaitStage } from '@/lib/setup/plan-wait';\n",
      "import { planWaitPercent, planWaitStage } from '@/lib/setup/plan-wait';\nimport { unitWordFor } from '@/lib/items/unit-words';\n",
    ],
    [
      ' * never goes back; 100 once it has. The stage words change on the clock (Q3).\n',
      " * never goes back; 100 once it has. The stage words change on the clock (Q3).\n *\n * [[GTC-487]] E: the plan screen's Regenerate draws this same bar, with its own screen-reader name\n * (`label`) and spacing (`className`). Left out, both are as Generate has always drawn them.\n",
    ],
    [
      ' */\nexport function PlanWaitBar({ percent, stage }: { percent: number; stage: string | null }) {\n',
      " */\nexport function PlanWaitBar({\n  percent,\n  stage,\n  label = 'Putting your plan together',\n  className = '-mt-4 mb-6',\n}: {\n  percent: number;\n  stage: string | null;\n  label?: string;\n  className?: string;\n}) {\n",
    ],
    [
      '  return (\n    <div data-plan-wait className="-mt-4 mb-6">\n',
      '  return (\n    <div data-plan-wait className={className}>\n',
    ],
    [
      '        role="progressbar"\n        aria-label="Putting your plan together"\n',
      '        role="progressbar"\n        aria-label={label}\n',
    ],
    [
      '                        <span className="text-gray-400 whitespace-nowrap">\n                          {item.quantity} {item.unit}\n',
      '                        <span className="text-gray-400 whitespace-nowrap">\n                          {item.quantity} {unitWordFor(item.quantity, item.unit ?? \'\')}\n',
    ],
  ],
  'src/components/sessions/Moment1Sessions.tsx': [
    [
      "\nimport { useCallback, useEffect, useState } from 'react';\n",
      "\nimport { useCallback, useEffect, useRef, useState } from 'react';\n",
    ],
    [
      '    load();\n',
      "    load();\n  }, [load]);\n\n  /*\n    [[GTC-487]] C — the dates can change elsewhere (the Edit event box on the plan page, another tab),\n    so the card reads its route again when the page comes back into view, is restored from the\n    phone's memory by the back button, or its window gets focus. The same load, the same route. Two\n    of these often come together, so a read is skipped if one began under a second before. The card\n    is never drawn with the sessions switch off, so nothing here runs then.\n  */\n  const lastRead = useRef(0);\n  useEffect(() => {\n    const again = () => {\n      if (document.visibilityState !== 'visible') return;\n      const now = Date.now();\n      if (now - lastRead.current < 1000) return;\n      lastRead.current = now;\n      load();\n    };\n    const restored = (e: PageTransitionEvent) => {\n      if (e.persisted) again();\n    };\n    document.addEventListener('visibilitychange', again);\n    window.addEventListener('pageshow', restored);\n    window.addEventListener('focus', again);\n    return () => {\n      document.removeEventListener('visibilitychange', again);\n      window.removeEventListener('pageshow', restored);\n      window.removeEventListener('focus', again);\n    };\n",
    ],
  ],
  'src/lib/moment3/share-split.ts': [
    [
      ' *\n * CLIENT-SAFE AND PURE: no imports, no writes.\n',
      ' *\n * CLIENT-SAFE AND PURE: no imports, no writes. ([[GTC-487]], 28 Nov 2026: one import since, the\n * unit words of `src/lib/items/unit-words.ts`, which is pure and imports nothing.)\n',
    ],
    [
      ' */\n\n/** The most one amount may be: a typing slip, not a real dish. */\n',
      " */\n\nimport { unitWordFor } from '@/lib/items/unit-words';\n\n/** The most one amount may be: a typing slip, not a real dish. */\n",
    ],
    [
      '\n/** An amount and its unit word as a row reads it: "10 servings", "2.5 kg", or "3" with no word. */\n',
      '\n/**\n * An amount and its unit word as a row reads it: "10 servings", "2.5 kg", or "3" with no word.\n * [[GTC-487]] B: at exactly 1, a word of the plan\'s unit list reads singular ("1 tray"); any other\n * word reads as stored ("1 pavlovas").\n */\n',
    ],
    [
      "  if (amount === null || amount === undefined) return '';\n  return [roundAmount(amount), unitWord].filter((x) => x !== '').join(' ');\n",
      "  if (amount === null || amount === undefined) return '';\n  const n = roundAmount(amount);\n  return [n, unitWordFor(n, unitWord)].filter((x) => x !== '').join(' ');\n",
    ],
  ],
  'src/lib/setup/plan-wait.ts': [
    [
      "\n/** The bar's percent: the estimate while waiting (never above the cap), 100 once arrived. */\nexport function planWaitPercent(elapsedMs: number, arrived: boolean): number {\n",
      "\n/**\n * The bar's percent: the estimate while waiting (never above the cap), 100 once arrived.\n * [[GTC-487]] E: `tauMs` is the curve's time constant; left out, it is Generate's (35 s). One\n * category's Regenerate passes `CATEGORY_WAIT_TAU_MS`.\n */\nexport function planWaitPercent(\n  elapsedMs: number,\n  arrived: boolean,\n  tauMs: number = PLAN_WAIT_TAU_MS\n): number {\n",
    ],
    [
      '  const t = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0);\n  return Math.min(PLAN_WAIT_CAP, PLAN_WAIT_CAP * (1 - Math.exp(-t / PLAN_WAIT_TAU_MS)));\n',
      '  const t = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0);\n  return Math.min(PLAN_WAIT_CAP, PLAN_WAIT_CAP * (1 - Math.exp(-t / tauMs)));\n',
    ],
    [
      '  return PLAN_WAIT_STAGES[i];\n}\n',
      "  return PLAN_WAIT_STAGES[i];\n}\n\n/*\n * [[GTC-487]] E — the bar while a Regenerate waits (the founder's rulings 5 and 6, 28 Nov 2026).\n * The whole plan keeps Generate's five words and clock above: it is the same one AI call over the\n * same answers. One category gets four stages and a faster clock (measured at about 30 seconds on\n * the founder's Mac): \"Choosing the dishes…\" and \"Checking dietary needs…\" are left out, because a\n * category can be drinks. The bar is taken away when the wait ends, never filled to 100: the plan\n * view is not told whether the wait ended well.\n */\n\n/** One category's time constant: about 54 per cent at 10 s, 87 at 30 s, 93 at 45 s. */\nexport const CATEGORY_WAIT_TAU_MS = 12_000;\n\n/** One category's four stages, in order (W26 and W27 new; the other two are Generate's). */\nexport const CATEGORY_WAIT_STAGES = [\n  'Reading your answers…',\n  'Choosing new suggestions…',\n  'Working out quantities…',\n  'Putting them in order…',\n] as const;\n\n/** When each of one category's stages begins, in ms after the press: 0, 6, 14 and 22 seconds. */\nexport const CATEGORY_WAIT_STAGE_AT_MS = [0, 6_000, 14_000, 22_000] as const;\n\n/** One category's stage words for the time since the press; the last one stays. */\nexport function categoryWaitStage(elapsedMs: number): (typeof CATEGORY_WAIT_STAGES)[number] {\n  let i = 0;\n  for (let s = 0; s < CATEGORY_WAIT_STAGE_AT_MS.length; s++) {\n    if (elapsedMs >= CATEGORY_WAIT_STAGE_AT_MS[s]) i = s;\n  }\n  return CATEGORY_WAIT_STAGES[i];\n}\n\n/** The bar's name for a screen reader while a Regenerate waits (W24, W25). */\nexport const REGENERATE_WAIT_WORDS = {\n  PLAN: 'Regenerating the plan',\n  category: (name: string) => `Regenerating ${name}`,\n} as const;\n",
    ],
  ],
};

/** Takes a file's named changes back, last first, each `is` exactly once; null if one is not. */
function takeBack(text: string, pairs: [string, string][]): string | null {
  let out = text;
  for (let i = pairs.length - 1; i >= 0; i--) {
    const [was, is] = pairs[i];
    if (count(out, is) !== 1) return null;
    out = out.replace(is, () => was);
  }
  return out;
}

/** W1 to W18 (the founder's ruling 6): each list word and what it reads at exactly 1. */
const W: [string, string, string][] = [
  ['W1', 'kg', 'kg'],
  ['W2', 'g', 'g'],
  ['W3', 'litres', 'litre'],
  ['W4', 'ml', 'ml'],
  ['W5', 'bottles', 'bottle'],
  ['W6', 'cans', 'can'],
  ['W7', 'trays', 'tray'],
  ['W8', 'bowls', 'bowl'],
  ['W9', 'plates', 'plate'],
  ['W10', 'pieces', 'piece'],
  ['W11', 'servings', 'serving'],
  ['W12', 'bags', 'bag'],
  ['W13', 'boxes', 'box'],
  ['W14', 'packets', 'packet'],
  ['W15', 'bunches', 'bunch'],
  ['W16', 'loaves', 'loaf'],
  ['W17', 'dozen', 'dozen'],
  ['W18', 'packs', 'pack'],
];
/** Generate's bar as main drew it (PlanWaitBar at 42 per cent, its second stage), byte for byte. */
const GENERATE_BAR_AT_MAIN =
  '<div data-plan-wait="true" class="-mt-4 mb-6"><div role="progressbar" aria-label="Putting your plan together" aria-valuemin="0" aria-valuemax="100" aria-valuenow="42" class="h-2 w-full overflow-hidden rounded-full bg-gray-200"><div class="h-2 rounded-full bg-accent transition-[width] duration-300 ease-out" style="width:42%"></div></div><p class="mt-2 text-xs text-gray-500" aria-live="polite">Choosing the dishes…</p></div>';

const realFetch = globalThis.fetch;

async function main() {
  installProviderTrap();
  for (const k of [
    'ANTHROPIC_API_KEY',
    'RESEND_API_KEY',
    'TNZ_AUTH_TOKEN',
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN',
    'TWILIO_PHONE_NUMBER',
  ]) {
    delete process.env[k];
  }
  delete process.env[VAR];
  const startCounts = await tableCounts();

  const UW = await load(F.words);
  const RD = await load(F.reading);
  const SP = await load(F.split);
  const GA = await load('src/lib/guest/guest-amount.ts');
  const PW = await load(F.wait);
  const SK = await load(F.skeleton);
  const PV = await load(F.plan);
  const CARD = await load(F.card);
  const SW = await load('src/components/sessions/SessionsSwitch.tsx');
  const TC = await load('src/contexts/ToastContext.tsx');
  const GR = await load('src/lib/glance/read.ts');
  const unitWordFor: ((a: unknown, w: string) => string) | null = UW?.unitWordFor ?? null;

  // ══ A — the board's red panel ═══════════════════════════════════════════════════════════
  section('A — the red panel draws the session tag, as the reading panel draws it');
  const surface = read(F.surface);
  const panel = read(F.readingPanel);
  check(
    'A1',
    'the red panel draws the tag after the name and the "critical" mark, small and grey, only when the row has one',
    count(surface, '{row.session ? (') === 1 &&
      surface.indexOf('{row.session ? (') > surface.indexOf('>critical</span>') &&
      /data-surface-session=""\s+className="rounded bg-white px-1\.5 text-\[11px\] text-\[#888780\]"/.test(
        surface
      )
  );
  const tagOf = (src: string, attr: string) => {
    const i = src.indexOf('{row.session ? (');
    const j = src.indexOf(') : null}', i);
    if (i < 0 || j < 0) return '';
    return src
      .slice(i, j + ') : null}'.length)
      .replace(attr, 'ATTR')
      .split('\n')
      .map((l) => l.trim())
      .join('\n');
  };
  const tagSurface = tagOf(surface, 'data-surface-session');
  const tagPanel = tagOf(panel, 'data-reading-session');
  check(
    'A2',
    'the two drawings are identical, line for line, but for their data attribute (ruling 8)',
    tagSurface.length > 0 && tagSurface === tagPanel,
    { tagSurface, tagPanel }
  );

  // The fixture: a sent event, a session, a guest who handed back a dish of that session.
  const now = new Date();
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + 9 * DAY
  );
  const host = await prisma.person.create({ data: { name: `${TAG} Kate` } });
  note('people', host.id);
  const guestP = await prisma.person.create({ data: { name: `${TAG} Ann` } });
  note('people', guestP.id);
  const eventId = `${TAG.toLowerCase()}e`;
  note('events', eventId);
  await prisma.event.create({
    data: {
      id: eventId,
      name: `${TAG} Christmas`,
      startDate: start,
      endDate: new Date(start.getTime() + 2 * DAY),
      hostId: host.id,
      status: 'CONFIRMING',
      sentAt: new Date(now.getTime() - DAY),
    },
  });
  await prisma.personEvent.create({ data: { personId: host.id, eventId, role: 'HOST' } });
  await prisma.personEvent.create({
    data: {
      personId: guestP.id,
      eventId,
      role: 'PARTICIPANT',
      sentAt: new Date(now.getTime() - DAY),
    },
  });
  const team = await prisma.team.create({ data: { eventId, name: `${TAG} Mains` } });
  const lunch = await prisma.day.create({
    data: { eventId, name: 'Christmas lunch', date: start },
  });
  const dish = async (name: string, dayId: string | null) => {
    const it = await prisma.item.create({
      data: {
        teamId: team.id,
        name: `${TAG} ${name}`,
        kind: 'ITEM',
        status: 'ASSIGNED',
        dayId,
        quantityAmount: 1,
        quantityUnit: 'CUSTOM',
        quantityUnitCustom: 'trays',
        quantityState: 'SPECIFIED',
      } as any,
    });
    await prisma.assignment.create({
      data: { itemId: it.id, personId: guestP.id, response: 'DECLINED' },
    });
    return it.id;
  };
  const lunchDish = await dish('pavlova', lunch.id);
  const wholeDish = await dish('napkins', null);
  const rowsOf = (g: any) =>
    [...(g?.households ?? []).flatMap((h: any) => h.members), ...(g?.unhoused ?? [])].find(
      (p: any) => p.personId === guestP.id
    )?.items ?? [];
  const boardOn = GR
    ? await withSwitch('on', () => GR.readEventGlance(prisma as any, eventId, now))
    : null;
  const boardOff = GR
    ? await withSwitch(undefined, () => GR.readEventGlance(prisma as any, eventId, now))
    : null;
  const onRows = rowsOf(boardOn);
  const offRows = rowsOf(boardOff);
  const byId = (rows: any[], id: string) => rows.find((r: any) => r.itemId === id);
  check(
    'A3',
    'switch on: the handed-back dish carries its session ("Christmas lunch") on the red panel’s rows; the whole-event dish has none',
    byId(onRows, lunchDish)?.state === 'RED' &&
      byId(onRows, lunchDish)?.session === 'Christmas lunch' &&
      byId(onRows, wholeDish) !== undefined &&
      !('session' in byId(onRows, wholeDish)),
    onRows
  );
  check(
    'A4',
    'switch off: no row has a session key at all, so the red panel draws no tag',
    offRows.length === 2 && offRows.every((r: any) => !('session' in r)),
    offRows
  );
  const surfaceBack = takeBack(surface, CHANGES[F.surface]);
  check(
    'A5',
    'the red panel is otherwise as at 89da9a3, byte for byte: only its note and the tag are new',
    surfaceBack !== null && surfaceBack === atBase(F.surface)
  );

  // ══ B — the unit words ═══════════════════════════════════════════════════════════════════
  section('B — at exactly 1, a word of the unit list reads singular; every other word as stored');
  for (const [id, word, one] of W) {
    check(
      id,
      `"${word}": 1 reads "${one}"; 2, 0.5 and 1.5 read "${word}"`,
      unitWordFor !== null &&
        unitWordFor(1, word) === one &&
        [2, 0.5, 1.5, 0, 10].every((n) => unitWordFor!(n, word) === word)
    );
  }
  const odd = [
    'big bowl',
    'pavlovas',
    'Pieces',
    'Trays',
    'punnets',
    'whole',
    'count',
    'L',
    'piece',
    '',
  ];
  check(
    'B1',
    'a word not exactly on the list reads exactly as stored at 1 (ruling 7: same letters, same case)',
    unitWordFor !== null && odd.every((w) => unitWordFor!(1, w) === w),
    unitWordFor ? odd.map((w) => unitWordFor!(1, w)) : null
  );
  check(
    'B2',
    'the amount as words reads the same; no amount at all leaves the word as it is',
    unitWordFor !== null &&
      unitWordFor('1', 'trays') === 'tray' &&
      unitWordFor('2', 'trays') === 'trays' &&
      [null, undefined, ''].every((a) => unitWordFor!(a, 'trays') === 'trays')
  );
  const q = (amount: number | null, unit: string | null, custom: string | null) =>
    RD?.quantityLabel?.({ quantityAmount: amount, quantityUnit: unit, quantityUnitCustom: custom });
  check(
    'B3',
    'the board’s label: "1 tray" for the list word "trays"; "1 big bowl" stays; 2 stays plural; the old fixed units as before',
    q(1, 'CUSTOM', 'trays') === '1 tray' &&
      q(1, 'CUSTOM', 'pieces') === '1 piece' &&
      q(1, 'CUSTOM', 'big bowl') === '1 big bowl' &&
      q(2, 'CUSTOM', 'trays') === '2 trays' &&
      q(1, 'TRAYS', null) === '1 tray' &&
      q(6, 'COUNT', null) === '6' &&
      q(2, 'KG', null) === '2 kg',
    [q(1, 'CUSTOM', 'trays'), q(1, 'CUSTOM', 'big bowl'), q(2, 'CUSTOM', 'trays')]
  );
  check(
    'B4',
    'the guest page, the host’s preview and Moment 3’s shared rows (amountDetail): "1 piece", "1 pavlovas" as stored, "10 servings"',
    SP?.amountDetail?.(1, 'pieces') === '1 piece' &&
      SP?.amountDetail?.(1.001, 'trays') === '1 tray' &&
      SP?.amountDetail?.(1, 'pavlovas') === '1 pavlovas' &&
      SP?.amountDetail?.(10, 'servings') === '10 servings' &&
      SP?.amountDetail?.(3, '') === '3',
    [SP?.amountDetail?.(1, 'pieces'), SP?.amountDetail?.(1, 'pavlovas')]
  );
  const guestAmount = GA?.guestAmountText?.({
    quantity: null,
    quantityAmount: 1,
    quantityUnit: 'CUSTOM',
    quantityUnitCustom: 'trays',
    quantityState: 'SPECIFIED',
    placeholderAcknowledged: false,
  });
  check(
    'B5',
    'the guest’s amount reads "1 tray" (the card shows "×1 tray")',
    guestAmount === '1 tray',
    guestAmount
  );
  const Skeleton = SK?.default;
  const skel = Skeleton
    ? html(
        createElement(Skeleton, {
          eventName: 'Boxing Day',
          plan: {
            categories: [
              {
                name: 'Dessert',
                emoji: '',
                items: [
                  { name: 'Pavlova', quantity: 1, unit: 'pieces', servingSize: '' },
                  { name: 'Trifle', quantity: 2, unit: 'bowls', servingSize: '' },
                ],
              },
            ],
            dietaryCoverage: [],
            thingsToConsider: [],
          },
          onApprove: () => {},
        })
      )
    : 'missing';
  check(
    'B6',
    'the Generate screen reads "1 piece" and "2 bowls"',
    skel.includes('>1 piece</span>') &&
      skel.includes('>2 bowls</span>') &&
      !skel.includes('1 pieces'),
    skel.slice(0, 300)
  );
  const PlanView = PV?.default;
  const Toast = TC?.ToastProvider;
  const planProps = {
    eventId: 'e1',
    eventName: 'Boxing Day',
    guestCount: 6,
    onUpdateItem: async () => {},
    onRemoveItem: async () => {},
    onAddItem: async () => {},
    onAddCategory: async () => {},
    onApprove: () => {},
    onBack: () => {},
    onRegeneratePlan: () => {},
    onRegenerateCategory: () => {},
    regeneratingScope: null,
    onEditGuests: () => {},
    onGoToDashboard: () => {},
    onInvitesOnly: () => {},
  };
  const cats = [
    {
      id: 'c1',
      name: 'Mains',
      emoji: '',
      items: [{ id: 'i1', name: 'Glazed ham', quantity: 1, unit: 'pieces', servingSize: '' }],
    },
    {
      id: 'c2',
      name: 'Dessert',
      emoji: '',
      items: [{ id: 'i2', name: 'Pavlova', quantity: 2, unit: 'trays', servingSize: '' }],
    },
  ];
  const planView = (props: Record<string, unknown>) =>
    PlanView && Toast
      ? html(
          createElement(
            Toast,
            null,
            createElement(PlanView, { ...planProps, categories: cats, ...props })
          )
        )
      : 'missing';
  const plain = planView({});
  check(
    'B7',
    'Moment 2’s plan reads "1 piece" and "2 trays" on the rows',
    />1 piece<\/button>/.test(plain) &&
      />2 trays<\/button>/.test(plain) &&
      !plain.includes('1 pieces'),
    plain.slice(0, 200)
  );
  check(
    'B8',
    'each screen’s code calls the one helper: the setup page (Moment 3), the plan view, the Generate screen, the board’s label, the shared rows',
    count(read(F.setup), 'unitWordFor(item.quantityAmount, mapItemUnitToDisplay(item))') === 1 &&
      count(read(F.plan), '{unitWordFor(item.quantity, item.unit)}') === 1 &&
      count(read(F.skeleton), "{unitWordFor(item.quantity, item.unit ?? '')}") === 1 &&
      count(read(F.reading), 'unitWordFor(amount, custom)') === 1 &&
      count(read(F.split), 'unitWordFor(n, unitWord)') === 1
  );
  check(
    'B9',
    'left for later (ruling 1): the two boxes she types an amount into, and the old dashboard, as at 89da9a3',
    gitOk([
      'diff',
      '--quiet',
      BASE,
      '--',
      'src/components/plan/Moment3ShareDish.tsx',
      'src/app/plan/[eventId]/page.tsx',
      'src/components/plan/ItemReviewCard.tsx',
      'src/components/plan/RegenerationPreview.tsx',
    ]) &&
      count(
        read(F.plan),
        '<span className="text-sm text-gray-500 whitespace-nowrap">{unit}</span>'
      ) === 1
  );

  // ══ C — the Sessions card ════════════════════════════════════════════════════════════════
  section('C — the Sessions card reads its route again when the page comes back into view');
  const card = read(F.card);
  const cardCode = codeOnly(card);
  const effect = cardCode.slice(
    cardCode.indexOf('const lastRead = useRef(0);'),
    cardCode.indexOf('if (!state) return null;')
  );
  check(
    'C1',
    'it listens for the page coming back into view, being restored from memory, and the window’s focus, and stops listening when it goes',
    effect.length > 0 &&
      effect.includes("document.addEventListener('visibilitychange', again)") &&
      effect.includes("window.addEventListener('pageshow', restored)") &&
      effect.includes("window.addEventListener('focus', again)") &&
      effect.includes("document.removeEventListener('visibilitychange', again)") &&
      effect.includes("window.removeEventListener('pageshow', restored)") &&
      effect.includes("window.removeEventListener('focus', again)") &&
      effect.includes('if (e.persisted) again();') &&
      effect.includes("if (document.visibilityState !== 'visible') return;")
  );
  check(
    'C2',
    'each read is the card’s own load (the same route); one under a second after another is skipped; no new request',
    count(effect, 'load();') === 1 &&
      effect.includes('if (now - lastRead.current < 1000) return;') &&
      count(cardCode, 'fetch(') === count(codeOnly(atBase(F.card)), 'fetch(') &&
      count(card, 'SessionsCard(') === 1 &&
      card.indexOf('const lastRead = useRef(0);') > card.indexOf('export function SessionsCard(')
  );
  const Provider = SW?.SessionsSwitchProvider;
  const Card = CARD?.default;
  const offCard =
    Provider && Card
      ? html(createElement(Provider, { on: false }, createElement(Card, { eventId: 'x' })))
      : 'missing';
  check(
    'C3',
    'switch off: the card draws nothing, so it never listens (its default export is as it was)',
    offCard === '' &&
      /const on = useSessionsOn\(\);\s*if \(!on\) return null;\s*return <SessionsCard eventId=\{eventId\} \/>;/.test(
        card
      ),
    offCard
  );
  const cardBack = takeBack(card, CHANGES[F.card]);
  check(
    'C4',
    'the card is otherwise as at 89da9a3, byte for byte: its drawing, its words and its route unchanged (ruling 9)',
    cardBack !== null && cardBack === atBase(F.card)
  );
  const SC = CARD?.SessionsCard;
  const empty = (start: string, end: string) =>
    SC
      ? html(
          createElement(SC, {
            eventId: 'x',
            initial: { sessions: [], eventDates: { start, end }, households: [], absences: [] },
          })
        )
      : 'missing';
  check(
    'C5',
    'the empty card’s first drawing: the one-day line for one date, the many-dates line for three',
    empty('2026-12-25', '2026-12-25').includes('Lunch and dinner on the day?') &&
      empty('2026-12-25', '2026-12-27').includes('Is this more than one meal?')
  );

  // ══ D — the bottom bar ═══════════════════════════════════════════════════════════════════
  section('D — the plan screen’s bottom bar folds away (Less / More), kept on her device');
  const planSrc = read(F.plan);
  const at = (s: string, needle: string) => s.indexOf(needle);
  check(
    'D1',
    'drawn open first: the frame kept, Less (W19, its name W20) above every button, the four buttons in their order, no More',
    plain.includes('data-plan-bar="open"') &&
      plain.includes(
        'class="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4"'
      ) &&
      plain.includes('aria-label="Show fewer buttons" aria-expanded="true"') &&
      plain.includes('>Less ▾</button>') &&
      !plain.includes('More ▴') &&
      at(plain, '>Less ▾</button>') < at(plain, '← Back to the questions') &&
      at(plain, '← Back to the questions') < at(plain, 'Plan looks good →') &&
      at(plain, 'Plan looks good →') < at(plain, 'Invites, people and nudges →') &&
      at(plain, 'Invites, people and nudges →') < at(plain, 'Put the plan away: invites only'),
    plain.slice(plain.indexOf('data-plan-bar'), plain.indexOf('data-plan-bar') + 400)
  );
  check(
    'D2',
    'the words (ruling 6): W19 "Less ▾", W20 "Show fewer buttons", W21 "More ▴", W23 "Show all the buttons"',
    PV?.PLAN_BAR_WORDS?.LESS === 'Less ▾' &&
      PV?.PLAN_BAR_WORDS?.LESS_NAME === 'Show fewer buttons' &&
      PV?.PLAN_BAR_WORDS?.MORE === 'More ▴' &&
      PV?.PLAN_BAR_WORDS?.MORE_NAME === 'Show all the buttons'
  );
  check(
    'D3',
    'folded (ruling 2, option 1): one row, More and "Plan looks good"; the back button and the second row hidden by a class, so their buttons stay on the page',
    count(planSrc, '{barFolded && (') === 1 &&
      count(planSrc, '{!barFolded && (') === 1 &&
      count(planSrc, "disabled:cursor-not-allowed${barFolded ? ' hidden' : ''}`}") === 1 &&
      count(planSrc, "gap-y-1 text-center${barFolded ? ' hidden' : ''}`}") === 1 &&
      count(planSrc, 'aria-label={PLAN_BAR_WORDS.MORE_NAME}') === 1 &&
      count(planSrc, 'onClick={() => foldBar(false)}') === 1 &&
      count(planSrc, 'onClick={() => foldBar(true)}') === 1
  );
  check(
    'D4',
    'it folds only when she taps (ruling 3): nothing else sets it',
    count(codeOnly(planSrc), 'setBarFolded(') === 2 && count(codeOnly(planSrc), 'foldBar(') === 2
  );
  check(
    'D5',
    'kept on her device only (ruling 4): one name for all her events, in the browser’s own storage; no request added',
    PV?.PLAN_BAR_FOLDED_KEY === 'gather.planBarFolded' &&
      count(planSrc, 'window.localStorage.getItem(PLAN_BAR_FOLDED_KEY)') === 1 &&
      count(planSrc, "window.localStorage.setItem(PLAN_BAR_FOLDED_KEY, '1')") === 1 &&
      count(planSrc, 'window.localStorage.removeItem(PLAN_BAR_FOLDED_KEY)') === 1 &&
      count(codeOnly(planSrc), 'localStorage') === 3 &&
      count(codeOnly(planSrc), 'fetch(') === count(codeOnly(atBase(F.plan)), 'fetch(')
  );
  check(
    'D6',
    'the room below the page follows the bar’s real height (a ResizeObserver on the bar), plus 16 px beyond the page’s own 128',
    count(planSrc, 'ref={barRef}') === 1 &&
      count(planSrc, 'watch.observe(bar);') === 1 &&
      count(planSrc, 'style={{ height: Math.max(0, Math.ceil(barHeight) + 16 - 128) }}') === 1 &&
      plain.includes('<div aria-hidden="true" style="height:0"></div>')
  );

  // ══ E — Regenerate's bar ═════════════════════════════════════════════════════════════════
  section(
    'E — Regenerate shows Generate’s bar; the whole plan with its clock, one category with its own'
  );
  const pct = PW?.planWaitPercent;
  const generateSame =
    !!pct &&
    [0, 5e3, 3e4, 6e4, 8e4, 9.1e4, 1.13e5, 3e5].every(
      (t) => Math.abs(pct(t, false) - Math.min(95, 95 * (1 - Math.exp(-t / 35e3)))) < 1e-9
    ) &&
    pct(1e4, true) === 100 &&
    JSON.stringify(PW?.PLAN_WAIT_STAGES) ===
      JSON.stringify([
        'Reading your answers…',
        'Choosing the dishes…',
        'Working out quantities…',
        'Checking dietary needs…',
        'Putting the plan in order…',
      ]) &&
    JSON.stringify(PW?.PLAN_WAIT_STAGE_AT_MS) === JSON.stringify([0, 12000, 26000, 42000, 58000]);
  check(
    'E1',
    'Generate’s five words and clock are as they were; the whole plan’s Regenerate uses them (ruling 5)',
    generateSame
  );
  const cw = PW?.categoryWaitStage;
  check(
    'E2',
    'one category: four stages, in order, at 0, 6, 14 and 22 seconds; the last stays (W26, W27)',
    JSON.stringify(PW?.CATEGORY_WAIT_STAGES) ===
      JSON.stringify([
        'Reading your answers…',
        'Choosing new suggestions…',
        'Working out quantities…',
        'Putting them in order…',
      ]) &&
      !!cw &&
      cw(0) === 'Reading your answers…' &&
      cw(5999) === 'Reading your answers…' &&
      cw(6000) === 'Choosing new suggestions…' &&
      cw(13999) === 'Choosing new suggestions…' &&
      cw(14000) === 'Working out quantities…' &&
      cw(22000) === 'Putting them in order…' &&
      cw(300000) === 'Putting them in order…' &&
      PW.CATEGORY_WAIT_STAGES.every((w: string) => !/\d|done/i.test(w))
  );
  const tau = PW?.CATEGORY_WAIT_TAU_MS;
  let never95 = !!pct && typeof tau === 'number';
  let prev = -1;
  for (let t = 0; never95 && t <= 300000; t += 500) {
    const p = pct(t, false, tau);
    if (p > 95 || p < prev) never95 = false;
    prev = p;
  }
  check(
    'E3',
    'one category’s faster clock: about 54 per cent at 10 s, 87 at 30 s, 93 at 45 s; never above 95, never back',
    never95 &&
      Math.round(pct(1e4, false, tau)) === 54 &&
      Math.round(pct(3e4, false, tau)) === 87 &&
      Math.round(pct(4.5e4, false, tau)) === 93,
    pct && tau ? [pct(1e4, false, tau), pct(3e4, false, tau), pct(4.5e4, false, tau)] : null
  );
  check(
    'E4',
    'the bar’s names for a screen reader: W24 "Regenerating the plan", W25 "Regenerating Dessert"',
    PW?.REGENERATE_WAIT_WORDS?.PLAN === 'Regenerating the plan' &&
      PW?.REGENERATE_WAIT_WORDS?.category?.('Dessert') === 'Regenerating Dessert'
  );
  const bars = (h: string) => count(h, 'role="progressbar"');
  const whole = planView({ regeneratingScope: 'plan' });
  check(
    'E5',
    'the whole plan: one bar, under its "Regenerating the plan…" button and above the sections, at its first stage',
    bars(whole) === 1 &&
      whole.includes('aria-label="Regenerating the plan"') &&
      at(whole, 'Regenerating the plan…') < at(whole, 'role="progressbar"') &&
      at(whole, 'role="progressbar"') < at(whole, 'Mains') &&
      whole.includes('>Reading your answers…</p>') &&
      count(whole, 'animate-pulse opacity-60 pointer-events-none') === 2,
    whole.slice(at(whole, 'data-plan-wait') - 20, at(whole, 'data-plan-wait') + 300)
  );
  const oneCat = planView({ regeneratingScope: 'dessert' });
  check(
    'E6',
    'one category: one bar, inside that section under its "Regenerating…" button; that section neither pulses nor greys; the rest as they were',
    bars(oneCat) === 1 &&
      oneCat.includes('aria-label="Regenerating Dessert"') &&
      at(oneCat, 'Dessert') < at(oneCat, 'Regenerating…') &&
      at(oneCat, 'Regenerating…') < at(oneCat, 'role="progressbar"') &&
      oneCat.includes('class="mt-1 mb-2"') &&
      oneCat.includes('>Reading your answers…</p>') &&
      !oneCat.includes('animate-pulse') &&
      count(oneCat, '<div class="pointer-events-none">') === 1,
    oneCat.slice(at(oneCat, 'Dessert'), at(oneCat, 'Dessert') + 200)
  );
  const ownPlanNone = planView({ ownPlan: true, regeneratingScope: null });
  check(
    'E7',
    'no bar when nothing waits, and none on her own plan',
    bars(plain) === 0 && bars(ownPlanNone) === 0
  );
  const genBar = SK?.PlanWaitBar
    ? html(createElement(SK.PlanWaitBar, { percent: 42, stage: 'Choosing the dishes…' }))
    : 'missing';
  check(
    'E8',
    'it is Generate’s own bar: the plan view draws PlanWaitBar from the Generate screen, whose own drawing is byte for byte main’s',
    genBar === GENERATE_BAR_AT_MAIN &&
      count(planSrc, "import { PlanWaitBar } from './Moment2Step2Skeleton';") === 1 &&
      count(codeOnly(planSrc), '<PlanWaitBar') === 2 &&
      !codeOnly(planSrc).includes('role="progressbar"'),
    genBar
  );

  // ══ K — the files ═══════════════════════════════════════════════════════════════════════
  section('K — exactly these files, and nothing else');
  const changed = lines(git(['diff', '--name-only', BASE, '--', 'src'])).sort();
  const untracked = lines(git(['ls-files', '--others', '--exclude-standard', 'src'])).sort();
  const added = lines(git(['diff', '--name-only', '--diff-filter=A', BASE, '--', 'src'])).sort();
  check(
    'K1',
    'the edited source files are exactly the eight, and the one new file; nothing untracked',
    JSON.stringify(changed) === JSON.stringify([...EDITED, ...NEW_SRC].sort()) &&
      JSON.stringify(added) === JSON.stringify(NEW_SRC) &&
      untracked.length === 0,
    { changed, added, untracked }
  );
  const routesAt = (ref: string | null) =>
    lines(
      git(ref ? ['ls-tree', '-r', '--name-only', ref, '--', 'src/app'] : ['ls-files', 'src/app'])
    )
      .filter((f) => /\/route\.tsx?$/.test(f))
      .sort();
  check(
    'K2',
    'no new route: the route files are 89da9a3’s',
    routesAt(null).length > 100 && JSON.stringify(routesAt(null)) === JSON.stringify(routesAt(BASE))
  );
  check(
    'K3',
    'no migration and no schema change: prisma is as at 89da9a3',
    gitOk(['diff', '--quiet', BASE, '--', 'prisma']) &&
      lines(git(['ls-files', '--others', '--exclude-standard', 'prisma'])).length === 0
  );
  check(
    'K4',
    'the AI and its prompt, and every plan-making route, are as at 89da9a3',
    gitOk([
      'diff',
      '--quiet',
      BASE,
      '--',
      'src/lib/ai',
      'src/app/api/events/[id]/finalize-plan',
      'src/app/api/events/[id]/regenerate-plan',
      'src/app/api/events/[id]/generate',
      'src/app/api/events/[id]/regenerate',
      'src/app/api/events/[id]/suggest-resolution',
    ])
  );
  check(
    'K5',
    'the send, the nudges, the decide-by clock, the opt-outs, the board’s read and the guest routes: as at 89da9a3',
    gitOk([
      'diff',
      '--quiet',
      BASE,
      '--',
      'src/lib/sms',
      'src/lib/messages',
      'src/lib/eligibility',
      'src/lib/email-delivery',
      'src/lib/email.ts',
      'src/lib/press',
      'src/lib/preflight',
      'src/lib/decide-by.ts',
      'src/lib/live-sends.ts',
      'src/lib/glance',
      'src/lib/guest',
      'src/lib/sessions',
      'src/lib/auth',
      'src/app/api/cron',
      'src/app/api/events/[id]/send',
      'src/app/api/events/[id]/trigger-nudges',
      'src/app/api/p',
      'src/app/api/c',
      'src/app/p',
      'middleware.ts',
    ])
  );
  const pkgDiff = lines(git(['diff', '-U0', '--no-color', BASE, '--', 'package.json'])).filter(
    (l) => /^[+-]/.test(l) && !/^(\+\+\+|---)/.test(l)
  );
  check(
    'K6',
    'package.json gains exactly one line, the script, and the line before it gains its comma',
    pkgDiff.length === 3 &&
      pkgDiff.includes(
        '+    "test:small-fixes-batch": "tsx --tsconfig tests/tsconfig.json tests/small-fixes-batch-test.tsx"'
      ),
    pkgDiff
  );
  check(
    'K7',
    'package-lock.json is 89da9a3’s',
    gitOk(['diff', '--quiet', BASE, '--', 'package-lock.json'])
  );
  const addedLines = lines(git(['diff', '-U0', '--no-color', BASE, '--', 'src'])).filter(
    (l) => l.startsWith('+') && !l.startsWith('+++')
  );
  const newFileLines = read(F.words).split('\n');
  check(
    'K8',
    'no added source line says remind or chase, comments included',
    addedLines.length > 0 && ![...addedLines, ...newFileLines].some((l) => /remind|chase/i.test(l)),
    [...addedLines, ...newFileLines].filter((l) => /remind|chase/i.test(l))
  );
  const readersAt = (ref: string | null) =>
    lines(
      git(
        ref
          ? ['grep', '-l', '-E', 'isSessionsOn|useSessionsOn', ref, '--', 'src']
          : ['grep', '-l', '-E', 'isSessionsOn|useSessionsOn', '--', 'src']
      )
    )
      .map((l) => l.replace(`${BASE}:`, ''))
      .sort();
  check(
    'K9',
    'no new reader of the sessions switch',
    readersAt(null).length > 10 &&
      JSON.stringify(readersAt(null)) === JSON.stringify(readersAt(BASE)),
    { now: readersAt(null).length, base: readersAt(BASE).length }
  );
  const words = read(F.words);
  check(
    'K10',
    'the new file is pure and as written: it imports nothing and asks nothing of a network or a page',
    createHash('sha256').update(words).digest('hex') === WORDS_SHA &&
      !/^import\b/m.test(words) &&
      !/fetch|console|XMLHttpRequest|sendBeacon|innerHTML|eval\(|new RegExp/.test(words)
  );
  const planBack = withoutGtc487PlanView(planSrc);
  const eachOk = Object.entries(CHANGES).map(([f, pairs]) => {
    const back = takeBack(read(f), pairs);
    return [f, back !== null && back === atBase(f)] as const;
  });
  check(
    'K11',
    `each edited file is 89da9a3’s with exactly its named changes, byte for byte (the plan view’s ${GTC487_PLAN_VIEW_CHANGES.length})`,
    planBack === atBase(F.plan) && eachOk.every(([, ok]) => ok),
    eachOk.filter(([, ok]) => !ok).map(([f]) => f)
  );

  // ══ Z — the fixture ══════════════════════════════════════════════════════════════════════
  section('Z — its own fixture, removed by id; nothing left the process');
  check('Z1', 'nothing left the process: the trap counted no request at all', trapCount() === 0, {
    trap: trapCount(),
  });
  await cleanUp();
  const left = [
    await prisma.event.count({ where: { id: { in: made.events } } }),
    await prisma.person.count({ where: { id: { in: made.people } } }),
  ];
  check(
    'Z2',
    'every row it wrote is gone, by id',
    left.every((n) => n === 0),
    left
  );
  const endCounts = await tableCounts();
  const moved = Object.keys({ ...startCounts, ...endCounts }).filter(
    (t) => startCounts[t] !== endCounts[t]
  );
  check('Z3', "every table's count is as found", moved.length === 0, moved);
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
