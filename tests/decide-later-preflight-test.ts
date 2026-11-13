/**
 * GTC-449 S2.6 (ruling 76) — the pre-flight area's test file. It holds the W8 part of item 13 of
 * "The tests" in docs/tickets/GTC-449.md (the card marker, S2.6) and, from S2.5, items 6 and 13
 * for the pre-flight page: W5, W6 and W7 and the two-line row (sections W.2 onward, 6.x, R.x,
 * K.x, G.x, T.x and S.x, described under "S2.5" below).
 *
 * S2.5 (pre-flight step 3) — W5, W6 and W7, exactly as ruled (rulings 3, 14, 21, 22 and 28):
 *   W5 "Decide later: Josh, Mere" (in an open household, under the "Kids:" line)
 *   W6 "Gather won't message them unless you change this in their household." (under W5)
 *   W7 "1 kid is still on decide later." / "{n} kids are still on decide later." (step 3's row)
 * Read-only: no link, no button, the names are not links. Send is never blocked. A kid on decide
 * later with no name is counted by W7 and warned about by W6 and is left out of W5 (the founder's
 * answer in the S2.5 plan). The look of W5 and W6 is the "Kids:" line's own (his answer too).
 * The route section (R.x) is the one part of this file that touches a database: it calls the
 * real pre-flight route on the throwaway copy with rows it makes itself, removes only those,
 * and checks that InviteEvent and OutboundMessage did not move.
 *
 * S2.8 (item 3 of "The tests"): section A calls the real ask preview (`readAskPreview`) on the
 * throwaway copy, again with rows it makes itself and removes itself. It checks that a kid on
 * decide later is carried to the household's contact, or put on the host's list, exactly as a
 * plain kid is, with no ask row of its own; and that the same kid settled to message does get
 * one. The marker is the host's own note, not a rule, so these arrive green by design.
 *
 * W8 (ruling 14), exactly: "Josh (decide later)" beside the kid's name on the saved household
 * card. The name, one space, then "(decide later)" in lower case with round brackets. It is the
 * only new sentence here; there is no other, and none may be added without a ruling.
 *
 * What this file pins:
 *   - the words: the code's words are the ticket's W8 words, so a word changed on one side only
 *     is red (W.1);
 *   - where it shows: on the kid line of a SAVED household card, only for a kid saved as decide
 *     later, once per such kid, with the name before it and a space between (W8.1 to W8.7). That
 *     includes her own household's card (W8.5), a flagged kid with no name (W8.6, the founder's
 *     answer in S2.6: the words are a warning, so they are never hidden) and the whole chain from a stored
 *     marker through the setup page's own mapper to the drawn card (W8.7);
 *   - where it must NOT show, and what must not change: an unflagged kid draws exactly the old
 *     markup (W8.8, W8.9); an adult row never shows it (W8.10); the typed "not saved yet" card
 *     and the "Editing" card never show it (W8.11, W8.12);
 *   - that it is display only: no button, link or count changes (W8.13), the card file gains no
 *     fetch, router, link or click handler (W8.14), and W9's quiet line is unaffected (W8.15).
 *
 * HOW IT IS RUN WITHOUT A BROWSER. The real card (`HouseholdCardList`) is drawn to markup with
 * React's server renderer and the markup is read as text; the way decide-later-form-test.ts
 * already reads W9 off the same card. The setup page's `apiHouseholdToSaved` lives inside the
 * page's component, so it is read out of the page's live source with the TypeScript parser and
 * run on its own, as that test does. Nothing here reads a database, calls the network, or can
 * send anything.
 *
 * Run: npx tsx --tsconfig tests/tsconfig.json tests/decide-later-preflight-test.ts
 * Writes nothing: no rows, no files.
 */

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import * as ReactAll from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformSync } from 'esbuild';
import * as ts from 'typescript';

import { randomBytes } from 'crypto';
import { NextRequest } from 'next/server';
import HouseholdCardList from '../src/components/plan/HouseholdCardList';
import * as CardModule from '../src/components/plan/HouseholdCardList';
import PreflightStep from '../src/components/preflight/PreflightStep';
import * as KidsNote from '../src/components/preflight/kids-note';
import { preflightPrints } from '../src/lib/preflight/tick-memory';

const ROOT = path.join(__dirname, '..');
const CARD = 'src/components/plan/HouseholdCardList.tsx';
const SETUP = 'src/app/plan/[eventId]/setup/page.tsx';
const TICKET = 'docs/tickets/GTC-460.md';
/** The commit before S2.6 (S2.4's): the card file is as S2.3 left it. */
const BEFORE_S26 = '87f9c3a';

// ── Reporting ────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
function assert(id: string, label: string, condition: boolean, got?: unknown) {
  if (condition) {
    passed++;
    console.log(`\x1b[32m✓\x1b[0m ${id} ${label}`);
  } else {
    failed++;
    console.log(`\x1b[31m✗\x1b[0m ${id} ${label}`);
    if (got !== undefined) console.log(`    got: ${String(JSON.stringify(got)).slice(0, 300)}`);
  }
}
const section = (s: string) => console.log(`\n\x1b[1m\x1b[33m${s}\x1b[0m`);
const read = (rel: string) => {
  try {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
  } catch {
    return '';
  }
};
const readAt = (commit: string, rel: string) => {
  try {
    return execFileSync('git', ['show', `${commit}:${rel}`], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return '';
  }
};

// ── The words (W8, as ruled) ─────────────────────────────────────────────────
/** What the card file says, read from its exported words (undefined until the card has them). */
const codeMarker: unknown = (CardModule as any).DECIDE_LATER_WORDS?.marker;
const MARKER = '(decide later)';
const W8 = (name: string) => `${name} ${MARKER}`;

// ── Small helpers over the card's markup ─────────────────────────────────────
const draw = (props: Record<string, unknown>) =>
  renderToStaticMarkup(
    ReactAll.createElement(HouseholdCardList as any, { onEdit: () => {}, ...props })
  );
const drawList = (households: any[], more: Record<string, unknown> = {}) =>
  draw({ households, ...more });
/** Tags removed with nothing put in their place, so a missing space between name and words shows. */
const flat = (html: string) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
const count = (hay: string, needle: string) => hay.split(needle).length - 1;
/** One chunk of markup per household card, in order. */
const cardsOf = (html: string) =>
  html
    .split(/(?=<div[^>]*class="border rounded-lg)/)
    .filter((c) => /^<div[^>]*class="border rounded-lg/.test(c));
/** The kid lines of a card (each starts with the kid emoji), as text. */
const kidLines = (card: string): string[] => {
  const m = card.match(/<div class="flex flex-wrap[^"]*text-sm text-gray-500">([\s\S]*?)<\/div>/);
  if (!m) return [];
  return flat(m[1])
    .split(/(?=👫|👦|🧒|👤)/)
    .map((p) => p.trim())
    .filter((p) => p.startsWith('👦'));
};
const notesIn = (html: string) =>
  [...html.matchAll(/<(\w+)[^>]*data-decide-later-note[^>]*>([\s\S]*?)<\/\1>/g)].map((m) => ({
    tag: m[1],
    text: flat(m[2]),
  }));
const buttons = (html: string) => (html.match(/<button\b/g) || []).length;

// ── Households as the card receives them ─────────────────────────────────────
const kid = (name: string, extra: Record<string, unknown> = {}) => ({
  personEventId: `pe-${name || 'nameless'}`,
  name,
  adultRoled: false,
  ...extra,
});
const hh = (id: string, primary: string, over: Record<string, unknown> = {}) => ({
  id,
  primaryContact: { name: primary },
  helpers: [] as any[],
  littleCount: 0,
  guests: [] as any[],
  ...over,
});

// ── The setup page's apiHouseholdToSaved, read out of its live source ────────
function loadApiHouseholdToSaved(): ((h: any) => any) | null {
  const src = read(SETUP);
  const sf = ts.createSourceFile('page.tsx', src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let text: string | null = null;
  const visit = (n: ts.Node) => {
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.name.text === 'apiHouseholdToSaved' &&
      n.initializer &&
      ts.isCallExpression(n.initializer) &&
      n.initializer.arguments[0]
    ) {
      text = n.initializer.arguments[0].getText(sf);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (!text) return null;
  const js = transformSync(`exports.f = ${text};`, { loader: 'ts', format: 'cjs' }).code;
  const m: { exports: any } = { exports: {} };
  new Function('module', 'exports', js)(m, m.exports);
  return m.exports.f;
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// S2.5 — THE PRE-FLIGHT LINES (W5, W6, W7). Items 6 and 13 of "The tests".
// ══════════════════════════════════════════════════════════════════════════════════════════════
const PREFLIGHT_PAGE = 'src/app/plan/[eventId]/pre-flight/page.tsx';
const STEP_FILE = 'src/components/preflight/PreflightStep.tsx';
const NOTE_FILE = 'src/components/preflight/kids-note.ts';
const ROUTE_FILE = 'src/app/api/events/[id]/pre-flight/route.ts';
const TICK_FILE = 'src/lib/preflight/tick-memory.ts';
/** The commit before S2.5 (S2.6's evidence commit): every "as it was" below is read from here. */
const BEFORE_S25 = '8bfe39b';
/** The only source files S2.5 may change: the five its entry in the ticket names. */
const S25_SRC = [ROUTE_FILE, NOTE_FILE, STEP_FILE, PREFLIGHT_PAGE, TICK_FILE];
/** S2.5's own commit (its parent is BEFORE_S25): S.6 reads what that one commit changed. */
const S25_COMMIT = '7afdf92';

const W5_LABEL = 'Decide later:';
const W6 = "Gather won't message them unless you change this in their household.";
const W7_ONE = '1 kid is still on decide later.';
const W7_MANY = (n: number) => `${n} kids are still on decide later.`;
const W3_ONE = '1 household has no one to talk to.';

/** What the new module exports; undefined until it is built, so a missing export is red, not a crash. */
const noteWords: any = (KidsNote as any).DECIDE_LATER_NOTE_WORDS;
const decideLaterNote: any = (KidsNote as any).decideLaterNote;
const decideLaterRowLine: any = (KidsNote as any).decideLaterRowLine;
const kidsNoteFn: any = (KidsNote as any).kidsNote;

const tryit = (fn: () => boolean): boolean => {
  try {
    return fn() === true;
  } catch {
    return false;
  }
};
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const gitOut = (args: string[]) => {
  try {
    return execFileSync('git', args, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return '';
  }
};
/** The lines this step added to a file, read against the commit before it (working tree). */
const addedLines = (rel: string) =>
  gitOut(['diff', '-U0', BEFORE_S25, '--', rel])
    .split('\n')
    .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
    .map((l) => l.slice(1))
    .join('\n');

/** A member as the pure functions receive it (a name, a role, and the marker if given). */
const pm = (name: string, role: string | null, flag?: boolean) => ({
  name,
  householdRole: role,
  ...(flag === undefined ? {} : { messagingUndecided: flag }),
});

// ── The pre-flight page, compiled here from its live source (the way tweaks-d does) ──────────
let slots: unknown[] | null = null;
let slot = 0;
const FAKE_REACT = {
  ...ReactAll,
  useState: (init: unknown) => {
    if (slots === null) return ReactAll.useState(init);
    const i = slot++;
    return [
      i < slots.length ? slots[i] : typeof init === 'function' ? (init as () => unknown)() : init,
      () => undefined,
    ];
  },
  useEffect: (...a: Parameters<typeof ReactAll.useEffect>) =>
    slots === null ? ReactAll.useEffect(...a) : undefined,
  useLayoutEffect: () => undefined,
  useMemo: (f: () => unknown, d?: unknown[]) =>
    slots === null ? ReactAll.useMemo(f, d ?? []) : f(),
  useCallback: (f: unknown, d?: unknown[]) =>
    slots === null ? ReactAll.useCallback(f as any, d ?? []) : f,
  useRef: (v: unknown) => (slots === null ? ReactAll.useRef(v) : { current: v }),
};
const EVENT_ID = 'gtc449-made-up-event';
const NAVIGATION = {
  useParams: () => ({ eventId: EVENT_ID }),
  useRouter: () => ({ push() {}, replace() {}, refresh() {} }),
  usePathname: () => `/plan/${EVENT_ID}/pre-flight`,
  useSearchParams: () => new URLSearchParams(),
};
function compilePage(): ((p: Record<string, unknown>) => ReactAll.ReactElement) | null {
  const source = read(PREFLIGHT_PAGE);
  if (source.length < 1000) return null;
  try {
    const out = transformSync(source, { loader: 'tsx', format: 'cjs', jsx: 'automatic' });
    const m: { exports: any } = { exports: {} };
    const req = (id: string) => {
      if (id === 'react') return FAKE_REACT;
      if (id === 'next/navigation') return NAVIGATION;
      if (id.startsWith('@/')) return require(path.join(ROOT, 'src', id.slice(2)));
      return require(id);
    };
    new Function('require', 'module', 'exports', out.code)(req, m, m.exports);
    return m.exports.default;
  } catch (e) {
    console.error('    the page did not load:', (e as Error).message.split('\n')[0]);
    return null;
  }
}
let PageComp: ReturnType<typeof compilePage> = null;
/** The page's state, answered by position: data, error, saving, ticks, messagePrint, fourPending,
 *  openHouseholds, openSteps, pressing, pressed, pressError, pretend. */
function renderPage(data: unknown, openHouseholds: string[] = [], openSteps: number[] = []) {
  if (!PageComp) return '';
  slots = [data, null, false, {}, null, false, openHouseholds, openSteps, false, null, null, null];
  slot = 0;
  try {
    return renderToStaticMarkup(ReactAll.createElement(PageComp as any, {}));
  } catch (e) {
    console.error('    the page did not draw:', (e as Error).message.split('\n')[0]);
    return '';
  } finally {
    slots = null;
  }
}

/** A member row as the route returns it; `flag` undefined leaves the field out altogether. */
const rowMember = (name: string, role: string, flag?: boolean) => ({
  personEventId: `pe-${name || 'nameless'}`,
  personId: `p-${name || 'nameless'}`,
  name,
  email: null,
  phone: null,
  householdRole: role,
  isYoungPerson: false,
  messageable: role !== 'CHILD',
  markable: true,
  nudgeMark: null,
  ...(flag === undefined ? {} : { messagingUndecided: flag }),
});
const rowHousehold = (
  id: string,
  primary: string,
  kids: any[],
  over: Record<string, unknown> = {}
) => ({
  id,
  label: primary,
  littleCount: 0,
  contactPersonEventId: null,
  resolvedContactPersonEventId: `pe-${primary}`,
  members: [rowMember(primary, 'PRIMARY_CONTACT', false), ...kids],
  isHostHousehold: false,
  ...over,
});
const preflightData = (households: any[]) => ({
  viewerId: 'gtc449-kate',
  viewerEmail: 'kate@example.com',
  event: {
    id: EVENT_ID,
    name: 'Riverside lunch',
    startDate: '2026-12-19T00:00:00.000Z',
    sentAt: null,
    nudgePace: null,
    endDate: null,
    venueName: null,
    venueTimingStart: null,
    venueTimingEnd: null,
    occasionDescription: null,
    eventType: 'bbq',
    eventTypeOther: null,
    invitesOnly: false,
    planPutAway: false,
  },
  coverage: {
    unassignedItems: [],
    unassignedCount: 0,
    criticalUnassignedCount: 0,
    complianceRate: 100,
    criticalGaps: [],
  },
  dietary: { status: 'confirmed_none', requirements: [] },
  households,
  unhoused: [],
  channelCandidates: households
    .filter((h) => h.resolvedContactPersonEventId)
    .map((h) => ({
      personEventId: h.resolvedContactPersonEventId,
      name: h.label,
      householdId: h.id,
      householdLabel: h.label,
    })),
});

// ── Reading the markup ───────────────────────────────────────────────────────────────────────
const stepSection = (html: string, n: number) => {
  const a = html.indexOf(`<section id="step-${n}"`);
  if (a < 0) return '';
  const b = html.indexOf(`<section id="step-${n + 1}"`, a);
  return b < 0 ? html.slice(a) : html.slice(a, b);
};
const headerOf = (sec: string) => {
  const a = sec.indexOf('<header');
  const b = sec.indexOf('</header>');
  return a < 0 || b < 0 ? '' : sec.slice(a, b);
};
/** Every row-line element (data-step-line), whole, in order. Spans nest, so the end is found by depth. */
function lineEls(html: string): string[] {
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const a = html.indexOf('<span data-step-line=""', from);
    if (a < 0) break;
    const re = /<span\b|<\/span>/g;
    re.lastIndex = a;
    let depth = 0;
    let end = -1;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
      if (m[0] === '</span>') {
        depth--;
        if (depth === 0) {
          end = m.index + m[0].length;
          break;
        }
      } else depth++;
    }
    if (end < 0) break;
    out.push(html.slice(a, end));
    from = end;
  }
  return out;
}
/** A row line exactly as the step has always drawn it (typed from the file as it was at 8bfe39b). */
const amberLine = (t: string) =>
  `<span data-step-line="" class="mt-1 flex items-center gap-1.5 text-sm text-amber-700"><span class="w-1.5 h-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true"></span>${t}</span>`;
const greyLine = (t: string) =>
  `<span data-step-line="" class="mt-1 flex items-center gap-1.5 text-sm text-gray-500">${t}</span>`;
const stepHtml = (props: Record<string, unknown>) =>
  renderToStaticMarkup(
    ReactAll.createElement(
      PreflightStep as any,
      {
        n: 3,
        title: 'Who Gather talks to',
        blurb: 'BLURB-X',
        checked: false,
        onCheck: () => {},
        ...props,
      },
      ReactAll.createElement('p', null, 'INSIDE-X')
    )
  );
const toggleOf = (html: string) =>
  [...html.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].find((m) => /aria-expanded=/.test(m[0]));
const unesc = (s: string) => s.replace(/&#x27;/g, "'").replace(/&amp;/g, '&');
/** The text paragraphs of a block: [class, text]. */
const paras = (html: string) =>
  [...html.matchAll(/<p class="([^"]*)">([^<]*)<\/p>/g)].map((m) => [m[1], unesc(m[2])]);

// ── Section by section ───────────────────────────────────────────────────────────────────────
function runWords() {
  section('W — the pre-flight words are the founder’s W5, W6 and W7');
  const ticket = read(TICKET).replace(/\s+/g, ' ');
  assert(
    'W.2',
    'the code’s W5 label, W6 and W7 are the ticket’s, word for word',
    noteWords?.LABEL === W5_LABEL &&
      noteWords?.WARNING === W6 &&
      noteWords?.ROW_ONE === W7_ONE &&
      tryit(() => noteWords.ROW_MANY(7) === W7_MANY(7)) &&
      ticket.includes(`*"${W5_LABEL} Josh, Mere"*`) &&
      ticket.includes(`*"${W6}"*`) &&
      ticket.includes(`*"${W7_ONE}"*`) &&
      ticket.includes('*"{n} kids are still on decide later."*'),
    { noteWords }
  );
  assert(
    'W.3',
    'W6 has the straight apostrophe (U+0027), the one the ticket prints; no curly one anywhere in the three',
    typeof noteWords?.WARNING === 'string' &&
      noteWords.WARNING.charCodeAt(noteWords.WARNING.indexOf("won't") + 3) === 0x27 &&
      !/[‘’]/.test(
        [noteWords.LABEL, noteWords.WARNING, noteWords.ROW_ONE].join(' ') +
          String(tryit(() => noteWords.ROW_MANY(2)) && noteWords.ROW_MANY(2))
      ) &&
      ticket.includes("Gather won't message them unless you change this in their household.") &&
      !ticket.includes('won’t message them unless'),
    { warning: noteWords?.WARNING }
  );
}

function runPure() {
  section('6 — the pure functions beside kidsNote (item 6)');
  const josh = pm('Josh', 'CHILD', true);
  const mere = pm('Mere', 'CHILD', true);
  assert(
    '6.1',
    'one flagged kid: the W5 line names them and W6 follows',
    tryit(() =>
      same(decideLaterNote([pm('Aroha', 'PRIMARY_CONTACT'), josh]), {
        names: `${W5_LABEL} Josh`,
        warning: W6,
      })
    ),
    tryit(() => decideLaterNote([josh]))
  );
  assert(
    '6.2',
    'two flagged kids, in the order given, names trimmed: "Decide later: Josh, Mere"',
    tryit(() =>
      same(decideLaterNote([pm(' Josh ', 'CHILD', true), pm('  Mere', 'CHILD', true)]), {
        names: `${W5_LABEL} Josh, Mere`,
        warning: W6,
      })
    ),
    tryit(() => decideLaterNote([josh, mere]))
  );
  assert(
    '6.3',
    'kidsNote still lists a flagged kid as a kid, exactly as before: "Kids: Josh, Mere, Tama"',
    typeof kidsNoteFn === 'function' &&
      kidsNoteFn([pm('Aroha', 'PRIMARY_CONTACT'), josh, mere, pm('Tama', 'CHILD', false)]) ===
        'Kids: Josh, Mere, Tama' &&
      kidsNoteFn([pm('Aroha', 'PRIMARY_CONTACT')]) === null
  );
  assert(
    '6.4',
    'no flagged kid gives nothing: marker false, marker missing, and no kids at all',
    tryit(
      () =>
        decideLaterNote([pm('Aroha', 'PRIMARY_CONTACT'), pm('Tama', 'CHILD', false)]) === null &&
        decideLaterNote([pm('Tama', 'CHILD')]) === null &&
        decideLaterNote([pm('Aroha', 'PRIMARY_CONTACT')]) === null &&
        decideLaterNote([]) === null
    )
  );
  assert(
    '6.5',
    'only a CHILD with the marker counts: a flagged partner, guest or primary contact is ignored',
    tryit(
      () =>
        decideLaterNote([
          pm('Aroha', 'PRIMARY_CONTACT', true),
          pm('Hemi', 'PARTNER', true),
          pm('Gus', 'GUEST', true),
          pm('Nina', null, true),
        ]) === null
    )
  );
  assert(
    '6.6',
    'a plain kid beside a flagged one is not named',
    tryit(() =>
      same(decideLaterNote([pm('Tama', 'CHILD', false), josh, pm('Kai', 'CHILD')]), {
        names: `${W5_LABEL} Josh`,
        warning: W6,
      })
    )
  );
  assert(
    '6.7',
    'a flagged kid with no name: W6 still warns, W5 has no names; with a named one, W5 lists only the named',
    tryit(
      () =>
        same(decideLaterNote([pm('', 'CHILD', true)]), { names: null, warning: W6 }) &&
        same(decideLaterNote([pm('   ', 'CHILD', true)]), { names: null, warning: W6 }) &&
        same(decideLaterNote([pm('', 'CHILD', true), josh]), {
          names: `${W5_LABEL} Josh`,
          warning: W6,
        })
    )
  );
  const one = { members: [pm('Aroha', 'PRIMARY_CONTACT'), josh] };
  const two = { members: [pm('Hemi', 'PRIMARY_CONTACT'), mere, pm('Aroha', 'CHILD', true)] };
  const none = { members: [pm('Gus', 'PRIMARY_CONTACT'), pm('Tama', 'CHILD', false)] };
  assert(
    '6.8',
    'W7: nothing at 0; "1 kid is still on decide later."; "3 kids are still on decide later." counted across households',
    tryit(
      () =>
        decideLaterRowLine([]) === null &&
        decideLaterRowLine([none]) === null &&
        decideLaterRowLine([one, none]) === W7_ONE &&
        decideLaterRowLine([one, two, none]) === W7_MANY(3)
    ),
    tryit(() => decideLaterRowLine([one, two, none]))
  );
  assert(
    '6.9',
    'W7 counts a nameless flagged kid and ignores a flagged adult and an unflagged kid',
    tryit(
      () =>
        decideLaterRowLine([{ members: [pm('', 'CHILD', true)] }]) === W7_ONE &&
        decideLaterRowLine([{ members: [pm('Hemi', 'PARTNER', true), pm('Tama', 'CHILD')] }]) ===
          null
    )
  );
}

function runRow() {
  section('13 — the two-line row on PreflightStep (ruling 28)');
  const fold = { onToggle: () => {}, open: false };
  const both = stepHtml({
    ...fold,
    line: { text: 'LINE-A', amber: true },
    secondLine: { text: 'LINE-B', amber: true },
  });
  const t = toggleOf(both);
  const words = t ? flat(t[1]) : '';
  assert(
    'K.1',
    'folded, both lines: the first line then the second, both amber, inside the toggle, under the blurb',
    same(lineEls(headerOf(both)), [amberLine('LINE-A'), amberLine('LINE-B')]) &&
      !!t &&
      words.indexOf('BLURB-X') >= 0 &&
      words.indexOf('LINE-A') > words.indexOf('BLURB-X') &&
      words.indexOf('LINE-B') > words.indexOf('LINE-A'),
    lineEls(headerOf(both))
  );
  const secondOnly = stepHtml({ ...fold, secondLine: { text: 'LINE-B', amber: true } });
  assert(
    'K.2',
    'the second line alone draws alone, as one amber line',
    same(lineEls(headerOf(secondOnly)), [amberLine('LINE-B')]),
    lineEls(headerOf(secondOnly))
  );
  const firstOnly = stepHtml({ ...fold, line: { text: 'LINE-A', amber: true } });
  assert(
    'K.3',
    'the first line alone is byte for byte the row line the step has always drawn; a null second line changes nothing',
    same(lineEls(headerOf(firstOnly)), [amberLine('LINE-A')]) &&
      stepHtml({ ...fold, line: { text: 'LINE-A', amber: true }, secondLine: null }) === firstOnly,
    lineEls(headerOf(firstOnly))
  );
  const neither = stepHtml({ ...fold });
  assert(
    'K.4',
    'neither line given: no line element and neither text',
    !/data-step-line/.test(neither) &&
      !neither.includes('LINE-A') &&
      stepHtml({ ...fold, line: null, secondLine: null }) === neither
  );
  assert(
    'K.5',
    'a settled step draws neither line',
    !/data-step-line/.test(
      stepHtml({
        ...fold,
        settled: true,
        line: { text: 'LINE-A', amber: true },
        secondLine: { text: 'LINE-B', amber: true },
      })
    )
  );
  const opened = stepHtml({
    onToggle: () => {},
    open: true,
    line: { text: 'LINE-A', amber: true },
    secondLine: { text: 'LINE-B', amber: true },
  });
  assert(
    'K.6',
    'an open step shows both lines on its row too (C9), each once, and not again in the body',
    same(lineEls(headerOf(opened)), [amberLine('LINE-A'), amberLine('LINE-B')]) &&
      (opened.match(/data-step-line/g) || []).length === 2 &&
      (opened.match(/LINE-B/g) || []).length === 1
  );
  const fixed = stepHtml({
    line: { text: 'LINE-A', amber: true },
    secondLine: { text: 'LINE-B', amber: true },
  });
  assert(
    'K.7',
    'a step that does not fold draws both lines as well, in order',
    same(lineEls(headerOf(fixed)), [amberLine('LINE-A'), amberLine('LINE-B')]),
    lineEls(headerOf(fixed))
  );
  assert(
    'K.8',
    'a grey second line (amber off) is the same shape without the dot',
    same(lineEls(headerOf(stepHtml({ ...fold, secondLine: { text: 'LINE-B', amber: false } }))), [
      greyLine('LINE-B'),
    ])
  );
}

function runPage() {
  section('13 — step 3 on the live page: W7 on the row, W5 and W6 in the household (items 6, 13)');
  PageComp = compilePage();
  const kidFlag = (n: string, f?: boolean) => rowMember(n, 'CHILD', f);
  const withKid = rowHousehold('h1', 'Aroha', [kidFlag('Josh', true), kidFlag('Mere', true)]);
  const calm = rowHousehold('h2', 'Hemi', [kidFlag('Tama', false)]);
  const noOne = rowHousehold('h3', 'Gus', [kidFlag('Kai', false)], {
    resolvedContactPersonEventId: null,
  });
  const rowOf = (html: string) => lineEls(headerOf(stepSection(html, 3))).map(flat);

  const w7Only = renderPage(preflightData([withKid, calm]));
  assert(
    'G.1',
    'folded step 3 with flagged kids and every household reachable: the row shows W7 alone, amber',
    same(rowOf(w7Only), [W7_MANY(2)]) &&
      lineEls(headerOf(stepSection(w7Only, 3)))[0]?.includes('text-amber-700'),
    rowOf(w7Only)
  );
  const bothLines = renderPage(preflightData([withKid, calm, noOne]));
  assert(
    'G.2',
    'folded step 3 with a household nobody can talk to and flagged kids: talkLine first, W7 under it',
    same(rowOf(bothLines), [W3_ONE, W7_MANY(2)]) &&
      lineEls(headerOf(stepSection(bothLines, 3))).every((e) => e.includes('text-amber-700')),
    rowOf(bothLines)
  );
  const talkOnly = renderPage(preflightData([calm, noOne]));
  assert(
    'G.3',
    'no flagged kid anywhere: the row shows talkLine alone, as before',
    same(rowOf(talkOnly), [W3_ONE]),
    rowOf(talkOnly)
  );
  const quiet = renderPage(preflightData([calm]));
  assert(
    'G.4',
    'nothing to say: step 3’s row draws no line element at all',
    !/data-step-line/.test(headerOf(stepSection(quiet, 3))) &&
      headerOf(stepSection(quiet, 3)).length > 0
  );
  const three = renderPage(
    preflightData([withKid, rowHousehold('h4', 'Pita', [kidFlag('Aroha2', true)])])
  );
  assert(
    'G.5',
    'W7 counts across households: three flagged kids in two households read "3 kids are still on decide later."',
    same(rowOf(three), [W7_MANY(3)]),
    rowOf(three)
  );
  const openStep = renderPage(preflightData([withKid, noOne]), [], [3]);
  assert(
    'G.6',
    'an open step 3 shows both row lines on its row as well (C9)',
    same(rowOf(openStep), [W3_ONE, W7_MANY(2)]),
    rowOf(openStep)
  );

  const open1 = renderPage(preflightData([withKid, calm]), ['h1', 'h2'], [3]);
  const sec3 = stepSection(open1, 3);
  const text3 = flat(sec3);
  const iKids = text3.indexOf('Kids: Josh, Mere');
  const iW5 = text3.indexOf(`${W5_LABEL} Josh, Mere`);
  const iW6 = text3.indexOf(W6);
  const iAsk = text3.indexOf('Who should Gather talk to for the kids in this household?');
  assert(
    'G.7',
    'in an open household: the Kids line, then W5 "Decide later: Josh, Mere", then W6, all before the picker question',
    iKids >= 0 && iW5 > iKids && iW6 > iW5 && iAsk > iW6,
    { iKids, iW5, iW6, iAsk }
  );
  const ps = paras(sec3);
  const kidsP = ps.find((p) => p[1] === 'Kids: Josh, Mere');
  const w5P = ps.find((p) => p[1] === `${W5_LABEL} Josh, Mere`);
  const w6P = ps.find((p) => p[1] === W6);
  assert(
    'G.8',
    'W5 and W6 are plain paragraphs in the Kids line’s own class (the founder’s answer), one each, no tags inside',
    !!kidsP && !!w5P && !!w6P && w5P[0] === kidsP[0] && w6P[0] === kidsP[0],
    { kidsP, w5P, w6P }
  );
  const rawKids = sec3.indexOf('>Kids: Josh, Mere<');
  const rawAsk = sec3.indexOf('Who should Gather talk to');
  const between = rawKids >= 0 && rawAsk > rawKids ? sec3.slice(rawKids, rawAsk) : '';
  assert(
    'G.9',
    'read-only: no link, button, input or go-to-step between the Kids line and the picker question, and the names are not links',
    between.length > 0 &&
      iW6 > 0 &&
      !/<a[\s>]|<button|<input|href=|data-go-to-step|onclick/i.test(between),
    between.slice(0, 200)
  );
  const calmBody = renderPage(preflightData([calm]), ['h2'], [3]);
  assert(
    'G.10',
    'a household with no flagged kid shows no W5 and no W6, and the whole step 3 has no W7',
    !flat(stepSection(calmBody, 3)).includes(W5_LABEL) &&
      !flat(stepSection(calmBody, 3)).includes(W6) &&
      !flat(stepSection(calmBody, 3)).includes('on decide later') &&
      flat(stepSection(calmBody, 3)).includes('Kids: Tama')
  );
  const flagFalse = renderPage(
    preflightData([rowHousehold('h2', 'Hemi', [kidFlag('Tama', false)])]),
    ['h2'],
    [3]
  );
  const flagMissing = renderPage(
    preflightData([rowHousehold('h2', 'Hemi', [kidFlag('Tama')])]),
    ['h2'],
    [3]
  );
  assert(
    'G.11',
    'a marker of false and a marker not sent at all draw the very same page, so an unflagged event looks as it did',
    flagFalse.length > 1000 && flagFalse === flagMissing
  );
  const hostBody = renderPage(
    preflightData([
      rowHousehold('h1', 'Aroha', [kidFlag('Josh', true)], { isHostHousehold: true }),
    ]),
    ['h1'],
    [3]
  );
  const hostText = flat(stepSection(hostBody, 3));
  assert(
    'G.12',
    'her own household shows W5 and W6 too, and still has no picker question',
    hostText.includes(`${W5_LABEL} Josh`) &&
      hostText.includes(W6) &&
      !hostText.includes('Who should Gather talk to for the kids in this household?')
  );
  const nameless = renderPage(
    preflightData([rowHousehold('h1', 'Aroha', [kidFlag('', true)])]),
    ['h1'],
    [3]
  );
  const namelessText = flat(stepSection(nameless, 3));
  assert(
    'G.13',
    'a flagged kid with no name: W7 counts them, W6 still shows, and there is no W5 line',
    same(rowOf(nameless), [W7_ONE]) &&
      namelessText.includes(W6) &&
      !namelessText.includes(W5_LABEL),
    rowOf(nameless)
  );
  const sendOf = (html: string) => (html.match(/<button[^>]*>Send[^<]*<\/button>/) || [''])[0];
  assert(
    'G.14',
    'Send is the same with and without flagged kids: same button, same words, still waiting on the four checks',
    sendOf(w7Only).length > 0 &&
      sendOf(w7Only) === sendOf(quiet) &&
      sendOf(w7Only).includes('finish the four checks first') &&
      sendOf(w7Only).includes('disabled=""')
  );
}

function runPrints() {
  section('6 — the step 3 fingerprint (item 6)');
  const mem = (n: string, extra: object = {}) => ({
    personEventId: `pe-${n}`,
    name: n,
    nudgeMark: null,
    ...extra,
  });
  const facts = (kidExtra: object): any => ({
    event: { nudgePace: null },
    coverage: { unassignedItems: [] },
    dietary: { status: 'confirmed_none', requirements: [] as string[] },
    households: [
      {
        id: 'h1',
        label: 'Aroha',
        littleCount: 0,
        contactPersonEventId: null,
        resolvedContactPersonEventId: 'pe-Aroha',
        members: [mem('Aroha'), mem('Josh', kidExtra)],
      },
    ],
    unhoused: [mem('Nina')],
  });
  const absent = preflightPrints(facts({}));
  const no = preflightPrints(facts({ messagingUndecided: false }));
  const yes = preflightPrints(facts({ messagingUndecided: true }));
  assert(
    'T.1',
    'turning the marker on moves step 3’s fingerprint, so a tick made before it is dropped',
    yes[3] !== absent[3] && yes[3] !== no[3],
    { absent: absent[3], yes: yes[3] }
  );
  assert(
    'T.2',
    'a marker of false, or no marker at all, gives the fingerprint step 3 has always given (pinned), so no stored tick drops at deploy',
    absent[3] === 'f0aecefb' && no[3] === 'f0aecefb',
    { absent: absent[3], no: no[3] }
  );
  assert(
    'T.3',
    'steps 1 and 2 never move with the marker (pinned values)',
    yes[1] === '741638a5' && yes[2] === 'a8a06137' && absent[1] === yes[1] && absent[2] === yes[2],
    { yes }
  );
  assert(
    'T.4',
    'turning the marker back off returns step 3 to the same fingerprint',
    preflightPrints(facts({ messagingUndecided: false }))[3] === absent[3]
  );
  const unhousedFlag: any = facts({});
  unhousedFlag.unhoused = [mem('Nina', { messagingUndecided: true })];
  assert(
    'T.5',
    'a person outside any household carries the marker into the fingerprint the same way',
    preflightPrints(unhousedFlag)[3] !== absent[3]
  );
}

function runSource() {
  section('S — Send and the other files are as they were (item 6)');
  const pageNow = read(PREFLIGHT_PAGE);
  const pageThen = readAt(BEFORE_S25, PREFLIGHT_PAGE);
  const between = (s: string, a: string, b: string) => {
    const i = s.indexOf(a);
    const j = i < 0 ? -1 : s.indexOf(b, i + a.length);
    return i < 0 || j < 0 ? '' : s.slice(i, j);
  };
  const sendHead = (s: string) =>
    between(
      s,
      '<button\n            type="button"\n            disabled={!allChecked',
      '{pressed !== null'
    );
  const press = (s: string) =>
    between(s, 'const press = useCallback', '}, [eventId, pressing, pressed]);');
  const allChecked = (s: string) =>
    between(s, 'const allChecked = useMemo', 'const press = useCallback');
  assert(
    'S.1',
    `Send’s button, the press and the rule for when Send is on are the page’s own, unchanged since ${BEFORE_S25}`,
    pageThen.length > 1000 &&
      sendHead(pageThen).length > 200 &&
      press(pageThen).length > 500 &&
      allChecked(pageThen).length > 50 &&
      sendHead(pageNow) === sendHead(pageThen) &&
      press(pageNow) === press(pageThen) &&
      allChecked(pageNow) === allChecked(pageThen)
  );
  const wordsIn = (s: string, w: string) => s.split(w).length - 1;
  assert(
    'S.2',
    'no hook is added to the page: the counts of useState, useEffect, useMemo, useCallback, useRef and sentAt (comments included) are as they were',
    pageThen.length > 1000 &&
      ['useState', 'useEffect', 'useMemo', 'useCallback', 'useRef', 'sentAt'].every(
        (w) => wordsIn(pageNow, w) === wordsIn(pageThen, w)
      )
  );
  const added = S25_SRC.map((f) => [f, addedLines(f)] as const);
  assert(
    'S.3',
    'each of the five files was changed by this step (so the checks below are looking at something)',
    added.every(([, a]) => a.length > 0),
    added.map(([f, a]) => [f, a.length])
  );
  const addedAll = added
    .map(([, a]) => a)
    .filter((a) => a.length > 0)
    .join('\n');
  assert(
    'S.4',
    'what was added makes no link and no button, has no click handler, fetch or router, and no go-to-step',
    addedAll.length > 0 &&
      !/href=|<a[\s>]|<button|onClick|\bfetch\(|useRouter|data-go-to-step/.test(addedAll),
    addedAll.match(/href=|<a[\s>]|<button|onClick|\bfetch\(|useRouter|data-go-to-step/)
  );
  assert(
    'S.5',
    'what was added has no "we", no remind or chase word, no hook name and no sentAt (the pins on the page: ask-preview, batch9, tweaks-d, tweaks-f)',
    addedAll.length > 0 && !/\b[Ww]e\b|remind|chase|useState|useEffect|sentAt/.test(addedAll),
    addedAll.match(/\b[Ww]e\b|remind|chase|useState|useEffect|sentAt/)
  );
  const changed = [
    ...gitOut([
      'diff',
      '--name-only',
      BEFORE_S25,
      S25_COMMIT,
      '--',
      'src',
      'prisma',
      'package.json',
    ]).split('\n'),
    ...gitOut(['ls-files', '--others', '--exclude-standard', '--', 'src', 'prisma']).split('\n'),
  ].filter(Boolean);
  assert(
    'S.6',
    'S2.5’s commit (7afdf92): nothing under src or prisma changed but the five files S2.5 names; no new file, no package.json change, so no new route, no gate file, AfterThePress untouched',
    changed.every((f) => S25_SRC.includes(f)),
    changed.filter((f) => !S25_SRC.includes(f))
  );
  const kidsImport = "import { kidsNote } from '@/components/preflight/kids-note';";
  assert(
    'S.7',
    'the page’s kidsNote import line is exactly as it was and kidsNote( is called once, in its place (ruling 83)',
    pageNow.split(kidsImport).length - 1 === 1 &&
      pageNow.split('kidsNote(').length - 1 === 1 &&
      pageNow.includes('const kids = kidsNote(h.members);')
  );
  assert(
    'S.8',
    'the page still works out talkLine from the households with no one to talk to (preflight-fold S5)',
    /talkLine\(\s*households\.filter\([\s\S]{0,80}channelFor\(/.test(pageNow)
  );
  const stepNow = codeOnlyOf(read(STEP_FILE));
  assert(
    'S.9',
    '`line` is still one { text, amber } object and the second line comes through its own optional prop',
    /line\?: StepLine \| null;/.test(stepNow) &&
      /secondLine\?: StepLine \| null;/.test(stepNow) &&
      /export interface StepLine \{\s*text: string;\s*amber: boolean;\s*\}/.test(stepNow)
  );
  const routeNow = codeOnlyOf(read(ROUTE_FILE));
  assert(
    'S.10',
    'the route keeps its guard, viewerId then viewerEmail side by side, the host-household expression and the host-exclusion import',
    routeNow.includes("requireEventRole(eventId, ['HOST', 'COHOST'])") &&
      /viewerId: auth\.user\.id,\s*viewerEmail: auth\.user\.email,/.test(routeNow) &&
      routeNow.split('viewerEmail').length - 1 === 1 &&
      /isHostHousehold:\s*h\.members\.some\(\s*\(m\) => !isAddressable\(/.test(routeNow) &&
      routeNow.includes("from '@/lib/eligibility/host-exclusion'")
  );
}
/** Source with comments removed. */
function codeOnlyOf(src: string) {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

// ── The route, called for real on the throwaway copy ─────────────────────────────────────────
async function runRoute() {
  section('R — the real pre-flight route returns the marker with each member (item 6)');
  const { prisma } = await import('../src/lib/prisma');
  let sessionToken = '';
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Module = require('module') as any;
  const realLoad = Module._load;
  Module._load = function (request: string, ...rest: unknown[]) {
    if (request === 'next/headers') {
      return {
        cookies: async () => ({
          get: (name: string) =>
            name === 'session' && sessionToken ? { name, value: sessionToken } : undefined,
        }),
      };
    }
    return realLoad.call(this, request, ...rest);
  };
  const TAG = `S25P${Date.now().toString(36)}`;
  const mail = (k: string) => `${TAG}-${k}@example.com`.toLowerCase();
  const nm = (k: string) => `${TAG} ${k}`;
  const eventIds: string[] = [];
  let userId = '';
  const totals = async () => ({
    invite: await prisma.inviteEvent.count(),
    outbound: await prisma.outboundMessage.count(),
  });
  const before = await totals();
  try {
    const user = await prisma.user.create({ data: { email: mail('host') } });
    userId = user.id;
    sessionToken = randomBytes(24).toString('hex');
    await prisma.session.create({
      data: { userId, token: sessionToken, expiresAt: new Date(Date.now() + 86400000) },
    });
    const hostPerson = await prisma.person.create({
      data: { name: nm('Host'), email: mail('host'), userId },
    });
    const start = new Date();
    start.setDate(start.getDate() + 30);
    const ev = await prisma.event.create({
      data: { name: `${TAG} S2.5`, startDate: start, endDate: start, hostId: hostPerson.id },
    });
    eventIds.push(ev.id);
    await prisma.eventRole.create({ data: { userId, eventId: ev.id, role: 'HOST' } });
    const hh = await prisma.household.create({ data: { eventId: ev.id } });
    const person = (k: string) => prisma.person.create({ data: { name: nm(k), email: mail(k) } });
    const member = async (
      k: string,
      householdRole: 'PRIMARY_CONTACT' | 'CHILD' | 'GUEST' | null,
      extra: Record<string, unknown> = {}
    ) => {
      const p = await person(k);
      return prisma.personEvent.create({
        data: {
          personId: p.id,
          eventId: ev.id,
          householdId: extra.unhoused ? null : hh.id,
          householdRole,
          messagingUndecided: extra.flag === true,
        },
      });
    };
    await member('Aroha', 'PRIMARY_CONTACT');
    await member('Josh', 'CHILD', { flag: true });
    await member('Mere', 'CHILD');
    await member('Tama', 'GUEST');
    await member('Nina', null, { unhoused: true });
    await member('Kai', 'CHILD', { unhoused: true, flag: true });

    const route = await import('../src/app/api/events/[id]/pre-flight/route');
    const get = async () => {
      const res = await route.GET(
        new NextRequest(`http://localhost/api/events/${ev.id}/pre-flight`, { method: 'GET' }),
        { params: Promise.resolve({ id: ev.id }) }
      );
      let json: any = null;
      try {
        json = await res.json();
      } catch {
        json = null;
      }
      return { status: res.status, json };
    };
    const ok1 = await get();
    const members: any[] = (ok1.json?.households ?? []).flatMap((h: any) => h.members);
    const byName = (list: any[], k: string) => list.find((m) => m.name === nm(k));
    const unhoused: any[] = ok1.json?.unhoused ?? [];
    assert('R.1', 'the route answers 200 for the signed-in host', ok1.status === 200, ok1.status);
    assert(
      'R.2',
      'household members: a Decide later kid reads true; a plain kid, the primary contact and a guest read false, all as booleans',
      byName(members, 'Josh')?.messagingUndecided === true &&
        byName(members, 'Mere')?.messagingUndecided === false &&
        byName(members, 'Aroha')?.messagingUndecided === false &&
        byName(members, 'Tama')?.messagingUndecided === false &&
        members.length === 4 &&
        members.every((m) => typeof m.messagingUndecided === 'boolean'),
      members.map((m) => [m.name, m.messagingUndecided])
    );
    assert(
      'R.3',
      'people outside any household carry it too: one with the marker reads true, one without reads false',
      byName(unhoused, 'Kai')?.messagingUndecided === true &&
        byName(unhoused, 'Nina')?.messagingUndecided === false &&
        unhoused.every((m) => typeof m.messagingUndecided === 'boolean'),
      unhoused.map((m) => [m.name, m.messagingUndecided])
    );
    const OLD = [
      'personEventId',
      'personId',
      'name',
      'email',
      'phone',
      'householdRole',
      'isYoungPerson',
      'messageable',
      'markable',
      'nudgeMark',
    ];
    assert(
      'R.4',
      'a member row has exactly its old fields plus the marker, nothing else added',
      members.length > 0 &&
        members.every((m) => same(Object.keys(m).sort(), [...OLD, 'messagingUndecided'].sort())),
      members[0] && Object.keys(members[0])
    );
    assert(
      'R.5',
      'the rest of the answer is as it was: the same top-level fields and household fields',
      same(Object.keys(ok1.json ?? {}).sort(), [
        'channelCandidates',
        'coverage',
        'dietary',
        'event',
        'households',
        'unhoused',
        'viewerEmail',
        'viewerId',
      ]) &&
        same(Object.keys(ok1.json?.households?.[0] ?? {}).sort(), [
          'contactPersonEventId',
          'id',
          'isHostHousehold',
          'label',
          'littleCount',
          'members',
          'resolvedContactPersonEventId',
        ])
    );
    assert(
      'R.6',
      'the marker changes nobody’s messageability: the flagged kid is still a CHILD, not messageable, and not offered as a channel',
      byName(members, 'Josh')?.householdRole === 'CHILD' &&
        byName(members, 'Josh')?.messageable === false &&
        !(ok1.json?.channelCandidates ?? []).some((c: any) => c.name === nm('Josh')) &&
        (ok1.json?.channelCandidates ?? []).some((c: any) => c.name === nm('Aroha'))
    );
    sessionToken = '';
    const refused = await get();
    assert(
      'R.7',
      'a request with no sign-in is still refused',
      refused.status === 401 || refused.status === 403,
      refused.status
    );
    const after = await totals();
    assert(
      'R.8',
      'InviteEvent and OutboundMessage did not move: this section reads and writes neither',
      after.invite === before.invite && after.outbound === before.outbound,
      { before, after }
    );
  } finally {
    Module._load = realLoad;
    await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
    await prisma.person.deleteMany({
      where: { name: { startsWith: TAG }, eventMemberships: { none: {} } },
    });
    if (userId) {
      await prisma.session.deleteMany({ where: { userId } });
      await prisma.person.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    const left = {
      people: await prisma.person.count({ where: { name: { startsWith: TAG } } }),
      events: await prisma.event.count({ where: { name: { startsWith: TAG } } }),
      users: userId ? await prisma.user.count({ where: { id: userId } }) : 0,
      sessions: userId ? await prisma.session.count({ where: { userId } }) : 0,
    };
    const end = await totals();
    assert(
      'R.9',
      'every row this section made is gone (people, event, user, session) and the two sentinel tables are as found',
      left.people === 0 &&
        left.events === 0 &&
        left.users === 0 &&
        left.sessions === 0 &&
        end.invite === before.invite &&
        end.outbound === before.outbound,
      { left, before, end }
    );
    await prisma.$disconnect();
  }
}

// ══ S2.8 — THE ASK PREVIEW TREATS A DECIDE LATER KID AS IT TREATS A PLAIN KID ══
async function runAskPreview() {
  section('A — the real ask preview: a Decide later kid is routed as a plain kid is (item 3)');
  const { prisma } = await import('../src/lib/prisma');
  const { readAskPreview } = await import('../src/lib/preflight/ask-preview');
  const TAG = `S28A${Date.now().toString(36)}`;
  const mail = (k: string) => `${TAG}-${k}@example.com`.toLowerCase();
  const nm = (k: string) => `${TAG} ${k}`;
  const eventIds: string[] = [];
  const personIds: string[] = [];
  const totals = async () => ({
    invite: await prisma.inviteEvent.count(),
    outbound: await prisma.outboundMessage.count(),
  });
  const before = await totals();
  try {
    const hostPerson = await prisma.person.create({
      data: { name: nm('Host'), email: mail('host') },
    });
    personIds.push(hostPerson.id);
    const start = new Date();
    start.setDate(start.getDate() + 30);
    const ev = await prisma.event.create({
      data: { name: `${TAG} S2.8`, startDate: start, endDate: start, hostId: hostPerson.id },
    });
    eventIds.push(ev.id);
    await prisma.personEvent.create({
      data: { personId: hostPerson.id, eventId: ev.id, role: 'HOST' },
    });
    const team = await prisma.team.create({ data: { eventId: ev.id, name: 'Mains' } });
    const member = async (
      k: string,
      householdId: string,
      householdRole: 'PRIMARY_CONTACT' | 'CHILD',
      o: { email?: string | null; phone?: string | null; flag?: boolean } = {}
    ) => {
      const p = await prisma.person.create({
        data: {
          name: nm(k),
          email: o.email === undefined ? mail(k) : o.email,
          phoneNumber: o.phone ?? null,
        },
      });
      personIds.push(p.id);
      const pe = await prisma.personEvent.create({
        data: {
          personId: p.id,
          eventId: ev.id,
          role: 'PARTICIPANT',
          householdId,
          householdRole,
          messagingUndecided: o.flag === true,
        },
      });
      // Every member holds one item: a child with no item is not a recipient for a reason of its own.
      const item = await prisma.item.create({
        data: { teamId: team.id, name: `${nm(k)} dish`, kind: 'ITEM' },
      });
      await prisma.assignment.create({
        data: { itemId: item.id, personId: p.id, response: 'PENDING' },
      });
      return { p, pe };
    };
    /** One household: a contact, a plain kid and a kid on Decide later, both with an email and a phone. */
    const build = async (label: 'A' | 'B', contact: { email?: string | null }) => {
      const hh = await prisma.household.create({ data: { eventId: ev.id } });
      const adult = await member(`Adult${label}`, hh.id, 'PRIMARY_CONTACT', contact);
      await prisma.household.update({
        where: { id: hh.id },
        data: { contactPersonEventId: adult.pe.id },
      });
      const base = label === 'A' ? '+6421123900' : '+6421123910';
      const plain = await member(`Plain${label}`, hh.id, 'CHILD', { phone: `${base}1` });
      const undecided = await member(`Undecided${label}`, hh.id, 'CHILD', {
        phone: `${base}2`,
        flag: true,
      });
      return { adult, plain, undecided };
    };
    // A: a contact with an email, so the kids' asks are carried to them.
    const A = await build('A', {});
    // B: a contact with no email and no phone, so the kids' asks have nowhere to go.
    const B = await build('B', { email: null });

    const preview = async (): Promise<any> => readAskPreview(prisma, ev.id, '');
    const p1 = await preview();
    const routes = p1?.askRoutes ?? {};
    const recipients: any[] = p1?.recipients ?? [];
    const hostList: any[] = p1?.hostList ?? [];
    const isRecipient = (id: string) => recipients.some((r) => r.personEventId === id);

    const kids = await prisma.personEvent.findMany({
      where: { eventId: ev.id, householdRole: 'CHILD' },
      include: { person: true },
    });
    const kidRow = (m: { pe: { id: string } }) => kids.find((r) => r.id === m.pe.id);
    assert(
      'A.1',
      'the fixture: four kids, all CHILD, each with an email and a phone; only the two on Decide later hold the marker',
      kids.length === 4 &&
        kids.every((r) => !!r.person.email && !!r.person.phoneNumber) &&
        kidRow(A.undecided)?.messagingUndecided === true &&
        kidRow(B.undecided)?.messagingUndecided === true &&
        kidRow(A.plain)?.messagingUndecided === false &&
        kidRow(B.plain)?.messagingUndecided === false
    );

    const routeA = (m: { pe: { id: string } }) => routes[m.pe.id];
    assert(
      'A.2',
      'a household whose contact can be reached: the Decide later kid has exactly the plain kid’s ask route, CARRIED to the contact',
      !!routeA(A.plain) &&
        same(routeA(A.undecided), routeA(A.plain)) &&
        routeA(A.undecided).kind === 'CARRIED' &&
        routeA(A.undecided).recipientId === A.adult.pe.id,
      [routeA(A.plain), routeA(A.undecided)]
    );
    const contactA = recipients.find((r) => r.personEventId === A.adult.pe.id);
    assert(
      'A.3',
      'the contact’s message carries both kids, and neither kid is a recipient with an ask row of their own',
      same(
        (contactA?.carried ?? []).map((c: any) => c.personEventId).sort(),
        [A.plain.pe.id, A.undecided.pe.id].sort()
      ) &&
        !isRecipient(A.plain.pe.id) &&
        !isRecipient(A.undecided.pe.id),
      (contactA?.carried ?? []).map((c: any) => c.name)
    );

    const routeB = (m: { pe: { id: string } }) => routes[m.pe.id];
    const lineB = (m: { pe: { id: string } }) => hostList.find((l) => l.personEventId === m.pe.id);
    assert(
      'A.4',
      'a household whose contact cannot be reached: both kids have the same route, on the host’s list as children for the same reason, and neither is a recipient',
      !!routeB(B.plain) &&
        routeB(B.plain).kind === 'HOST_LIST' &&
        same(routeB(B.undecided), routeB(B.plain)) &&
        lineB(B.plain)?.child === true &&
        lineB(B.undecided)?.child === true &&
        lineB(B.undecided)?.why === lineB(B.plain)?.why &&
        !isRecipient(B.plain.pe.id) &&
        !isRecipient(B.undecided.pe.id),
      [routeB(B.plain), routeB(B.undecided), lineB(B.plain)?.why, lineB(B.undecided)?.why]
    );

    // THE CONTROL: the same kid, settled to message (role GUEST, marker off), is a recipient.
    await prisma.personEvent.update({
      where: { id: A.undecided.pe.id },
      data: { householdRole: 'GUEST', messagingUndecided: false },
    });
    const p2 = await preview();
    const recipients2: any[] = p2?.recipients ?? [];
    const contactA2 = recipients2.find((r) => r.personEventId === A.adult.pe.id);
    assert(
      'A.5',
      'control: the same kid settled to message DIRECTLY has an ask row of their own, and the contact now carries only the plain kid',
      p2?.askRoutes?.[A.undecided.pe.id]?.kind === 'DIRECT' &&
        recipients2.some((r) => r.personEventId === A.undecided.pe.id) &&
        same(
          (contactA2?.carried ?? []).map((c: any) => c.personEventId),
          [A.plain.pe.id]
        ),
      p2?.askRoutes?.[A.undecided.pe.id]
    );
  } finally {
    await prisma.household.updateMany({
      where: { eventId: { in: eventIds } },
      data: { contactPersonEventId: null },
    });
    await prisma.assignment.deleteMany({
      where: { item: { team: { eventId: { in: eventIds } } } },
    });
    await prisma.item.deleteMany({ where: { team: { eventId: { in: eventIds } } } });
    await prisma.team.deleteMany({ where: { eventId: { in: eventIds } } });
    await prisma.personEvent.deleteMany({ where: { eventId: { in: eventIds } } });
    await prisma.household.deleteMany({ where: { eventId: { in: eventIds } } });
    await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
    await prisma.person.deleteMany({ where: { id: { in: personIds } } });
    const left = {
      people: await prisma.person.count({ where: { name: { startsWith: TAG } } }),
      events: await prisma.event.count({ where: { name: { startsWith: TAG } } }),
    };
    const end = await totals();
    assert(
      'A.6',
      'every row this section made is gone (people, event) and InviteEvent and OutboundMessage are as found: it reads and writes neither',
      left.people === 0 &&
        left.events === 0 &&
        end.invite === before.invite &&
        end.outbound === before.outbound,
      { left, before, end }
    );
  }
}

async function main() {
  // ══ W — THE WORDS ARE THE RULED WORDS ═══════════════════════════════════════
  section('W — the words are the founder’s W8');
  const ticket = read(TICKET).replace(/\s+/g, ' ');
  assert(
    'W.1',
    'the card’s words are "(decide later)" and the ticket’s W8 has "Josh" followed by exactly them',
    codeMarker === MARKER && ticket.includes(`*"Josh ${String(codeMarker)}"*`),
    { codeMarker, ticketHasW8: ticket.includes(`*"${W8('Josh')}"*`) }
  );

  // ══ 8 — W8 ON THE SAVED CARD ════════════════════════════════════════════════
  section('8 — W8 on the saved household card (item 13)');

  const one = drawList([hh('h1', 'Aroha', { helpers: [kid('Josh', { decideLater: true })] })]);
  assert(
    'W8.1',
    'a kid saved as decide later shows "Josh (decide later)" on the kid line, once, name first',
    JSON.stringify(kidLines(cardsOf(one)[0] ?? '')) === JSON.stringify([`👦 ${W8('Josh')}`]) &&
      count(flat(one), MARKER) === 1 &&
      notesIn(one).length === 1 &&
      notesIn(one)[0].tag === 'span' &&
      notesIn(one)[0].text === MARKER,
    { lines: kidLines(cardsOf(one)[0] ?? ''), notes: notesIn(one) }
  );

  const mixed = drawList([
    hh('h1', 'Aroha', {
      helpers: [kid('Josh', { decideLater: true }), kid('Mere', { decideLater: false })],
    }),
  ]);
  assert(
    'W8.2',
    'two kids, one flagged: the words are on the flagged kid only, and once',
    JSON.stringify(kidLines(cardsOf(mixed)[0] ?? '')) ===
      JSON.stringify([`👦 ${W8('Josh')}`, '👦 Mere']) && count(flat(mixed), MARKER) === 1,
    kidLines(cardsOf(mixed)[0] ?? '')
  );

  const both = drawList([
    hh('h1', 'Aroha', {
      helpers: [kid('Josh', { decideLater: true }), kid('Mere', { decideLater: true })],
    }),
  ]);
  assert(
    'W8.3',
    'two flagged kids: each shows the words once, and nobody shows them twice',
    JSON.stringify(kidLines(cardsOf(both)[0] ?? '')) ===
      JSON.stringify([`👦 ${W8('Josh')}`, `👦 ${W8('Mere')}`]) && count(flat(both), MARKER) === 2,
    kidLines(cardsOf(both)[0] ?? '')
  );

  const twoHh = drawList([
    hh('h1', 'Aroha', { helpers: [kid('Josh', { decideLater: true })] }),
    hh('h2', 'Tama', { helpers: [kid('Hine')] }),
  ]);
  const twoCards = cardsOf(twoHh);
  assert(
    'W8.4',
    'two households: only the household with a flagged kid shows the words',
    twoCards.length === 2 &&
      JSON.stringify(kidLines(twoCards[0])) === JSON.stringify([`👦 ${W8('Josh')}`]) &&
      JSON.stringify(kidLines(twoCards[1])) === JSON.stringify(['👦 Hine']) &&
      count(flat(twoHh), MARKER) === 1,
    twoCards.map(kidLines)
  );

  const hostCard = drawList([
    hh('h1', 'Aroha', { isHostHousehold: true, helpers: [kid('Josh', { decideLater: true })] }),
  ]);
  assert(
    'W8.5',
    'her own household’s card (the host look, with the "You" pill) shows the words too',
    hostCard.includes('data-host-pill') &&
      JSON.stringify(kidLines(cardsOf(hostCard)[0] ?? '')) === JSON.stringify([`👦 ${W8('Josh')}`]),
    kidLines(cardsOf(hostCard)[0] ?? '')
  );

  const nameless = drawList([hh('h1', 'Aroha', { helpers: [kid('', { decideLater: true })] })]);
  assert(
    'W8.6',
    'a flagged kid with no name still shows the words (they are a warning, never hidden)',
    count(flat(nameless), MARKER) === 1 &&
      JSON.stringify(kidLines(cardsOf(nameless)[0] ?? '')) === JSON.stringify([`👦 ${MARKER}`]),
    kidLines(cardsOf(nameless)[0] ?? '')
  );

  // The chain: a stored marker, through the page's own mapper, to the drawn card.
  const toSaved = loadApiHouseholdToSaved();
  const serverHousehold = {
    id: 'h1',
    littleCount: 0,
    contactPersonEventId: null,
    members: [
      { id: 'pe0', role: 'GUEST', householdRole: 'PRIMARY_CONTACT', person: { name: 'Aroha' } },
      {
        id: 'pe1',
        role: 'CHILD',
        householdRole: 'CHILD',
        isYoungPerson: true,
        messagingUndecided: true,
        person: { name: 'Josh' },
      },
      {
        id: 'pe2',
        role: 'CHILD',
        householdRole: 'CHILD',
        isYoungPerson: true,
        messagingUndecided: false,
        person: { name: 'Mere' },
      },
      // A young person the host roled as an adult (stored GUEST) must never read as decide later,
      // even with a stray yes on the row.
      {
        id: 'pe3',
        role: 'GUEST',
        householdRole: 'GUEST',
        isYoungPerson: true,
        messagingUndecided: true,
        person: { name: 'Tane' },
      },
      {
        id: 'pe4',
        role: 'GUEST',
        householdRole: 'GUEST',
        isYoungPerson: false,
        messagingUndecided: true,
        person: { name: 'Rua' },
      },
    ],
  };
  let chainCard = '';
  let chainErr: unknown = null;
  try {
    chainCard = toSaved ? drawList([toSaved(serverHousehold)]) : '';
  } catch (e) {
    chainErr = String(e);
  }
  assert(
    'W8.7',
    'from a stored household: the kid with the marker "yes" shows the words; the other kid, the adult-roled youth and the guest do not',
    !!toSaved &&
      !chainErr &&
      JSON.stringify(kidLines(cardsOf(chainCard)[0] ?? '')) ===
        JSON.stringify([`👦 ${W8('Josh')}`, '👦 Mere', '👦 Tane']) &&
      count(flat(chainCard), MARKER) === 1,
    { mapper: !!toSaved, chainErr, lines: kidLines(cardsOf(chainCard)[0] ?? '') }
  );

  // ══ 8 — WHERE IT MUST NOT SHOW, AND WHAT MUST NOT CHANGE ════════════════════
  section('8 — where it must not show, and what must not change');

  const oldKid = '<span>👦 Josh</span>';
  const variants: Array<[string, any]> = [
    ['false', kid('Josh', { decideLater: false })],
    ['undefined', kid('Josh', { decideLater: undefined })],
    ['absent', kid('Josh')],
  ];
  const variantMarkup = variants.map(([, k]) => drawList([hh('h1', 'Aroha', { helpers: [k] })]));
  assert(
    'W8.8',
    'a kid who is not flagged (false, undefined or absent) draws exactly the old markup',
    variantMarkup.every((m) => m.includes(oldKid) && !m.includes('data-decide-later-note')),
    variantMarkup.map((m) => m.slice(m.indexOf('👦') - 8, m.indexOf('👦') + 24))
  );

  const twoKids = (flag: Record<string, unknown>) =>
    drawList([
      hh('h1', 'Aroha', {
        littleCount: 1,
        helpers: [kid('Josh', flag), kid('Mere', flag)],
        guests: [{ personEventId: 'pe-g', name: 'Tama' }],
      }),
    ]);
  assert(
    'W8.9',
    'false, undefined and absent give the very same card, and the people line is unchanged',
    twoKids({ decideLater: false }) === twoKids({}) &&
      twoKids({ decideLater: undefined }) === twoKids({}) &&
      twoKids({ decideLater: true }).match(/\d+ people in 1 household/)?.[0] ===
        twoKids({}).match(/\d+ people in 1 household/)?.[0]
  );

  const stray = { decideLater: true };
  const adults = (withStray: boolean) =>
    drawList([
      hh('h1', 'Aroha', {
        primaryContact: { name: 'Aroha', ...(withStray ? stray : {}) },
        partner: { personEventId: 'pe-p', name: 'Rua', ...(withStray ? stray : {}) },
        guests: [{ personEventId: 'pe-g', name: 'Tama', ...(withStray ? stray : {}) }],
      }),
    ]);
  assert(
    'W8.10',
    'a partner, a guest and the primary contact never show the words, even given a stray flag',
    !adults(true).includes('data-decide-later-note') &&
      count(flat(adults(true)), MARKER) === 0 &&
      adults(true) === adults(false)
  );

  const flaggedHh = hh('h1', 'Aroha', { helpers: [kid('Josh', { decideLater: true })] });
  const typedNew = draw({ households: [], draft: flaggedHh });
  assert(
    'W8.11',
    'the typed "not saved yet" card never shows the words, even if its draft carries the flag',
    typedNew.includes('data-draft-card') &&
      typedNew.includes('Josh') &&
      !typedNew.includes('data-decide-later-note') &&
      count(flat(typedNew), MARKER) === 0
  );

  const saved = hh('h1', 'Aroha', { helpers: [kid('Josh', { decideLater: true })] });
  const editing = draw({
    households: [saved],
    editingHouseholdId: 'h1',
    draft: { ...saved, id: 'typed' },
  });
  assert(
    'W8.12',
    'the "Editing" card, which shows what is typed, never shows the words either',
    editing.includes('data-draft-card') &&
      editing.includes('Josh') &&
      !editing.includes('data-decide-later-note') &&
      count(flat(editing), MARKER) === 0
  );

  // ══ 8 — DISPLAY ONLY ════════════════════════════════════════════════════════
  section('8 — display only');

  const withFlag = twoKids({ decideLater: true });
  const noFlag = twoKids({});
  assert(
    'W8.13',
    'the flag adds no button, link, field or count: same buttons, no link or input',
    buttons(withFlag) === buttons(noFlag) &&
      !/<(a|input|select|textarea)\b/.test(withFlag) &&
      !/href=/.test(withFlag),
    { withFlag: buttons(withFlag), noFlag: buttons(noFlag) }
  );

  const cardNow = read(CARD);
  const cardThen = readAt(BEFORE_S26, CARD);
  const clicks = (s: string) => (s.match(/onClick/g) || []).length;
  assert(
    'W8.14',
    `the card file gains no fetch, router, link or click handler (compared with the file at ${BEFORE_S26})`,
    cardThen.length > 0 &&
      cardNow.length > 0 &&
      !/\bfetch\(/.test(cardNow) &&
      !/useRouter/.test(cardNow) &&
      !/href=/.test(cardNow) &&
      !/<a[\s>]/.test(cardNow) &&
      clicks(cardNow) === clicks(cardThen),
    { now: clicks(cardNow), then: clicks(cardThen), thenLength: cardThen.length }
  );

  const bothNotes = drawList([
    hh('h1', 'Aroha', {
      helpers: [kid('Josh', { decideLater: true }), kid('Mere')],
      keptEmailNames: ['Mere'],
    }),
  ]);
  assert(
    'W8.15',
    'W9’s quiet line is unaffected beside a flagged kid: both show, each once, W9 in its own words',
    count(flat(bothNotes), "We kept Mere's email address on file") === 1 &&
      count(flat(bothNotes), MARKER) === 1 &&
      (bothNotes.match(/data-kept-email-note/g) || []).length === 1,
    flat(bothNotes)
  );

  // ══ S2.5 — THE PRE-FLIGHT LINES ═════════════════════════════════════════════
  runWords();
  runPure();
  runRow();
  runPage();
  runPrints();
  runSource();
  await runAskPreview();
  await runRoute();

  console.log(`\n\x1b[33m=== Results: ${passed} passed, ${failed} failed ===\x1b[0m`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\x1b[31mtest crashed:\x1b[0m', err);
  process.exit(2);
});
