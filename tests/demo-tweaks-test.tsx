/**
 * [[GTC-394]] — THE DEMO TWEAKS, the founder's eight changes after his look at GTC-392 part B.
 *
 * Founder rulings, 19 Oct 2026 (in Cowork): his first prompt, and his rulings on the stop at
 * tweak 1 ("All fourteen", built in two parts; "Build it as it stands"; "Section / Picked /
 * Notes"). Each tweak adds its own layer here, in its own commit.
 *
 * THE LAYERS
 *   H  tweak 1 (a): the host's card, one shared definition, in the eight places where the screen
 *      already knows who the host is.
 *
 * SAFETY. Static and rendered checks only: no database row, no dev server, no AI call, no
 * browser, no network. Every fixture and expected value is written here by hand, never taken from
 * the code under test. Every check's condition lives in CHECKS so it can be dry-run on a passing
 * and a failing input before RED.
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const ROOT = path.join(__dirname, '..');

// ── Reporting ────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const reds: string[] = [];
function assert(layer: string, label: string, condition: boolean, detail?: string) {
  if (condition) {
    passed++;
    console.log(`\x1b[32m✓\x1b[0m [${layer}] ${label}`);
  } else {
    failed++;
    reds.push(`[${layer}] ${label}`);
    console.log(`\x1b[31m✗\x1b[0m [${layer}] ${label}${detail ? `\n    ${detail}` : ''}`);
  }
}
const section = (s: string) => console.log(`\n\x1b[1m\x1b[33m${s}\x1b[0m`);
const ok = (f: () => boolean) => {
  try {
    return f();
  } catch {
    return false;
  }
};

// ── Source reading ───────────────────────────────────────────────────────────
const read = (rel: string) => {
  try {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
  } catch {
    return '';
  }
};
/** Code only: block and line comments stripped (a URL's `://` is kept). */
const stripComments = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
const code = (rel: string) => stripComments(read(rel));
const unchangedSinceHead = (paths: string[]) =>
  spawnSync('git', ['diff', '--quiet', 'HEAD', '--', ...paths], { cwd: ROOT }).status === 0;
async function load(rel: string): Promise<any> {
  try {
    return await import(rel);
  } catch {
    return null;
  }
}
const render = (el: any) => {
  try {
    return renderToStaticMarkup(el);
  } catch (err) {
    console.log(`    (render threw: ${String((err as Error).message).split('\n')[0]})`);
    return '';
  }
};

// ── Tweak 1 (a): the files and the ruled look, hand-written ─────────────────
const HOST_CARD_FILE = 'src/components/shared/HostCard.tsx';
const HOST_IMPORT = "from '@/components/shared/HostCard'";
/** The card: a soft tint of the accent and a solid accent border (the sage scale builds). */
const HOST_TINT = 'bg-sage-100';
const HOST_BORDER = 'border-accent';
/** The "You" pill made stronger: filled accent, white text. The word stays "You". */
const HOST_PILL_HTML =
  '<span data-host-pill="" class="text-xs font-medium text-white bg-accent rounded-full px-2 py-0.5">You</span>';
/** GTC-256's pill as it was: a faint tint that never built (an opacity on a CSS variable). */
const OLD_PILL_CLASS = 'text-accent bg-accent/10';

/** The eight places, by file, and the host flag each already holds. */
const PLACES: Array<{ name: string; file: string; flags: string[]; pill: boolean }> = [
  {
    name: 'Moment 1’s household cards',
    file: 'src/components/plan/HouseholdCardList.tsx',
    flags: ['household.isHostHousehold'],
    pill: true,
  },
  {
    name: 'the pre-flight step 3 household rows',
    file: 'src/app/plan/[eventId]/pre-flight/page.tsx',
    flags: ['h.isHostHousehold'],
    pill: true,
  },
  {
    name: 'the board’s household card and its "Not in a household" card',
    file: 'src/components/glance/GlanceBoard.tsx',
    flags: ['household.isHostHousehold', 'unhousedHasHost'],
    pill: true,
  },
  {
    name: 'the Moment 3 people rows',
    file: 'src/components/plan/Moment3AssignView.tsx',
    flags: ['person.isHost'],
    pill: true,
  },
  {
    name: 'the old dashboard’s invite list',
    file: 'src/components/plan/InviteStatusSection.tsx',
    flags: ['person.isHost'],
    pill: true,
  },
  {
    name: 'the old dashboard’s people table',
    file: 'src/components/plan/PeopleSection.tsx',
    flags: ['person.personId === hostId'],
    pill: true,
  },
  {
    name: 'the host’s row in the pre-flight mark rows',
    file: 'src/components/preflight/mark-rows.tsx',
    flags: ['isHost'],
    pill: true,
  },
];

// ── CHECKS-START: every condition, pure, dry-run before RED ───────────────────
const indexesOf = (s: string, needle: string) => {
  const out: number[] = [];
  for (let i = s.indexOf(needle); i >= 0; i = s.indexOf(needle, i + 1)) out.push(i);
  return out;
};
/** The opening tag of the nearest element before `at` whose tag matches `want`. */
function tagBefore(html: string, at: number, tag: string, want: RegExp): string {
  let i = html.lastIndexOf(`<${tag}`, at);
  while (i >= 0) {
    const t = html.slice(i, html.indexOf('>', i) + 1);
    if (want.test(t)) return t;
    i = html.lastIndexOf(`<${tag}`, i - 1);
  }
  return '';
}
export const CHECKS = {
  /** H1 — the one shared definition: the card's classes and the pill, no hook, no client marker. */
  hostCardFile(src: string) {
    return (
      /export const HOST_CARD\s*=\s*'[^']*'/.test(src) &&
      src.includes(HOST_TINT) &&
      src.includes(HOST_BORDER) &&
      /export function HostPill\b/.test(src) &&
      src.includes('data-host-pill') &&
      src.includes('text-xs font-medium text-white bg-accent rounded-full px-2 py-0.5') &&
      !/['"]use client['"]/.test(src) &&
      !/\buse[A-Z]\w*\(/.test(src)
    );
  },
  /** H3 to H9 — a place uses the shared definition, each use behind that place's own host flag. */
  usesHostCard(src: string, flags: string[], pill: boolean) {
    if (!src.includes(HOST_IMPORT)) return false;
    const uses = indexesOf(src, 'HOST_CARD').filter(
      (i) => !/import\s*\{[^}]*$/.test(src.slice(Math.max(0, i - 200), i))
    );
    if (uses.length === 0) return false;
    const near = (i: number) => src.slice(Math.max(0, i - 260), i);
    const everyUseFlagged = uses.every((i) => flags.some((f) => near(i).includes(f)));
    const everyFlagUsed = flags.every((f) => uses.some((i) => near(i).includes(f)));
    const pills = indexesOf(src, '<HostPill');
    const pillsFlagged =
      !pill || (pills.length > 0 && pills.every((i) => flags.some((f) => near(i).includes(f))));
    return everyUseFlagged && everyFlagUsed && pillsFlagged && !src.includes(OLD_PILL_CLASS);
  },
  /** H4's extra — the pre-flight row's pill sits in its hint, after the label, and the shell is wrapped. */
  preflightRow(src: string) {
    const i = src.indexOf('label={`${h.label}’s household`}');
    const j = src.indexOf('headerHint={', i);
    const k = src.indexOf('<HostPill', j);
    const end = src.indexOf('<MarkRows', i);
    return (
      i > 0 &&
      j > i &&
      k > j &&
      k - j < 200 &&
      k < end &&
      /h\.isHostHousehold\s*\?\s*`[^`]*HOST_CARD/.test(src)
    );
  },
  /** H10 — Moment 1: the host's card wears it; another household's does not; the pill is there. */
  householdCards(html: string, host: string, other: string) {
    const h = tagBefore(html, html.indexOf(`>${host}<`), 'div', /rounded-lg/);
    const o = tagBefore(html, html.indexOf(`>${other}<`), 'div', /rounded-lg/);
    return (
      h.includes(HOST_TINT) &&
      h.includes(HOST_BORDER) &&
      /\bborder\b/.test(h) &&
      !/\bbg-white\b/.test(h) &&
      o.includes('bg-white') &&
      o.includes('border-gray-200') &&
      !o.includes(HOST_TINT) &&
      !o.includes(HOST_BORDER) &&
      indexesOf(html, HOST_PILL_HTML).length === 1 &&
      html.indexOf(HOST_PILL_HTML) > html.indexOf(`>${host}<`) &&
      html.indexOf(HOST_PILL_HTML) < html.indexOf(`>${other}<`) &&
      !html.includes(OLD_PILL_CLASS)
    );
  },
  /** H11 — the board: the host's household card wears it and carries the pill; another's does not. */
  boardCards(html: string, hostId: string, otherId: string) {
    const a = html.indexOf(`data-household-card="${hostId}"`);
    const b = html.indexOf(`data-household-card="${otherId}"`);
    if (a < 0 || b < 0) return false;
    const tag = (i: number) => html.slice(html.lastIndexOf('<', i), html.indexOf('>', i) + 1);
    const hostCard = html.slice(a, b > a ? b : undefined);
    const otherCard = html.slice(b, b > a ? undefined : a);
    return (
      tag(a).includes(HOST_TINT) &&
      tag(a).includes(HOST_BORDER) &&
      !tag(a).includes('bg-[#f5f4ef]') &&
      tag(b).includes('bg-[#f5f4ef]') &&
      !tag(b).includes(HOST_TINT) &&
      !tag(b).includes(HOST_BORDER) &&
      hostCard.includes(HOST_PILL_HTML) &&
      !otherCard.includes(HOST_PILL_HTML)
    );
  },
  /** H12 — the board's "Not in a household" card: it wears it only when the host is in it. */
  unhousedCard(withHost: string, withoutHost: string) {
    const tag = (html: string) => {
      const i = html.indexOf('data-unhoused-card');
      return i < 0 ? '' : html.slice(html.lastIndexOf('<', i), html.indexOf('>', i) + 1);
    };
    return (
      tag(withHost).includes(HOST_TINT) &&
      tag(withHost).includes(HOST_BORDER) &&
      tag(withoutHost).includes('bg-[#f5f4ef]') &&
      !tag(withoutHost).includes(HOST_TINT) &&
      !tag(withoutHost).includes(HOST_BORDER)
    );
  },
  /** H13 — the mark rows: the host's row wears it with the pill; another person's does not. */
  markRows(html: string, host: string, other: string) {
    const h = tagBefore(html, html.indexOf(`>${host}<`), 'li', /./);
    const o = tagBefore(html, html.indexOf(`>${other}<`), 'li', /./);
    const hostLi = html.slice(html.indexOf(h), html.indexOf('</li>', html.indexOf(h)));
    const otherLi = html.slice(html.indexOf(o), html.indexOf('</li>', html.indexOf(o)));
    return (
      h.length > 0 &&
      o.length > 0 &&
      h !== o &&
      h.includes(HOST_TINT) &&
      h.includes(HOST_BORDER) &&
      !o.includes(HOST_TINT) &&
      !o.includes(HOST_BORDER) &&
      hostLi.includes(HOST_PILL_HTML) &&
      hostLi.includes('you — never messaged about your own event') &&
      !otherLi.includes(HOST_PILL_HTML)
    );
  },
};
// ── CHECKS-END ───────────────────────────────────────────────────────────────

// ── Fixtures, hand-written ───────────────────────────────────────────────────
const household = (id: string, name: string, isHostHousehold: boolean) => ({
  id,
  primaryContact: { name },
  helpers: [],
  littleCount: 0,
  guests: [],
  isHostHousehold,
});
const boardPerson = (over: Record<string, unknown>) => ({
  personEventId: `pe-${String(over.name).replace(/\W/g, '')}`,
  personId: `p-${String(over.name).replace(/\W/g, '')}`,
  name: 'Someone',
  isHost: false,
  householdRole: 'GUEST',
  state: 'GREEN',
  reasons: ['ACCEPTED'],
  nextNudgeAt: null,
  items: [],
  ...over,
});
const glance = (hostUnhoused: boolean) => ({
  eventId: 'e-gtc394',
  hostPersonId: 'p-KateWalker',
  asOf: '2026-10-19T00:00:00.000Z',
  summary: { needYou: 0, withGather: 0, settled: 3 },
  households: hostUnhoused
    ? [
        {
          householdId: 'hh-other',
          primaryContactName: 'Tom Brennan',
          isHostHousehold: false,
          members: [boardPerson({ name: 'Tom Brennan' })],
        },
      ]
    : [
        {
          householdId: 'hh-host',
          primaryContactName: 'Kate Walker',
          isHostHousehold: true,
          members: [boardPerson({ name: 'Kate Walker', isHost: true })],
        },
        {
          householdId: 'hh-other',
          primaryContactName: 'Tom Brennan',
          isHostHousehold: false,
          members: [boardPerson({ name: 'Tom Brennan' })],
        },
      ],
  unhoused: hostUnhoused
    ? [boardPerson({ name: 'Kate Walker', isHost: true, householdRole: null })]
    : [boardPerson({ name: 'Bob Loner', householdRole: null })],
  unassignedCritical: [],
  unassignedOrdinaryCount: 0,
});
const member = (over: Record<string, unknown>) => ({
  personEventId: `pe-${String(over.name).replace(/\W/g, '')}`,
  personId: `p-${String(over.name).replace(/\W/g, '')}`,
  name: 'Someone',
  email: null,
  phone: null,
  householdRole: 'PRIMARY_CONTACT',
  isYoungPerson: false,
  messageable: true,
  markable: true,
  nudgeMark: null,
  ...over,
});

// ══ Tweak 1 (a) ══════════════════════════════════════════════════════════════
async function layerH() {
  section('H — tweak 1 (a): the host’s card, one shared definition, eight places');
  const HC = await load('../src/components/shared/HostCard');
  const HCL = await load('../src/components/plan/HouseholdCardList');
  const GB = await load('../src/components/glance/GlanceBoard');
  const MR = await load('../src/components/preflight/mark-rows');

  assert(
    'H',
    'H1 one shared definition in src/components/shared/HostCard.tsx: the card’s tint and border, the pill, no hook',
    CHECKS.hostCardFile(code(HOST_CARD_FILE))
  );
  assert(
    'H',
    'H2 the "You" pill, made stronger: filled accent, white text, the word "You"',
    !!HC?.HostPill && render(createElement(HC.HostPill)) === HOST_PILL_HTML,
    HC?.HostPill ? render(createElement(HC.HostPill)) : 'no HostPill'
  );
  PLACES.forEach((p, n) =>
    assert(
      'H',
      `H${n + 3} ${p.name} use it, behind the flag the screen already holds (${p.flags.join(', ')})`,
      CHECKS.usesHostCard(code(p.file), p.flags, p.pill) &&
        (p.file.endsWith('pre-flight/page.tsx') ? CHECKS.preflightRow(code(p.file)) : true)
    )
  );

  const cards = HCL?.default
    ? render(
        createElement(HCL.default, {
          households: [
            household('hh1', 'Kate Walker', true),
            household('hh2', 'Tom Brennan', false),
          ],
          onEdit: () => {},
          onDelete: async () => {},
        })
      )
    : '';
  assert(
    'H',
    'H10 Moment 1: the host’s card wears it, another household’s does not, and the "You" pill is still there',
    CHECKS.householdCards(cards, 'Kate Walker', 'Tom Brennan'),
    cards.slice(0, 400)
  );

  const board = (g: any) =>
    GB?.default
      ? render(
          createElement(GB.default, {
            glance: g,
            eventName: 'The Walker barbecue',
            actorRole: 'HOST',
            eventDate: 'Saturday 14 November',
          })
        )
      : '';
  const housed = board(glance(false));
  const unhoused = board(glance(true));
  assert(
    'H',
    'H11 the board: the host’s household card wears it with the pill; another household’s does not',
    CHECKS.boardCards(housed, 'hh-host', 'hh-other')
  );
  assert(
    'H',
    'H12 the board’s "Not in a household" card wears it only when the host is in it',
    CHECKS.unhousedCard(unhoused, housed)
  );

  const rows = MR?.MarkRows
    ? render(
        createElement(MR.MarkRows, {
          members: [
            member({ name: 'Kate Walker', markable: false }),
            member({ name: 'Tom Brennan' }),
          ],
          channelPersonEventId: null,
          pace: null,
          onMark: () => {},
        })
      )
    : '';
  assert(
    'H',
    'H13 the pre-flight mark rows: the host’s row wears it with the pill and keeps its line; another’s does not',
    CHECKS.markRows(rows, 'Kate Walker', 'Tom Brennan')
  );
  assert(
    'H',
    'H14 CONTROL: AccordionShell is not edited (preflight-fold R7 pins its markup; no new prop)',
    unchangedSinceHead(['src/components/plan/AccordionShell.tsx']) &&
      read('src/components/plan/AccordionShell.tsx').length > 0
  );
}

async function main() {
  await layerH();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log(reds.map((r) => `  - ${r}`).join('\n'));
    process.exit(1);
  }
  process.exit(0);
}

// A dry run imports CHECKS only (DEMO_TWEAKS_DRY_RUN=1); the suite runs otherwise.
if (process.env.DEMO_TWEAKS_DRY_RUN !== '1') {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
