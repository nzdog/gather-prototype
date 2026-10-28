/**
 * [[GTC-420]] — TICKET F, THE WAY BACK (tweak 16, the founder's ruling of 28 Oct 2026, Batch 2 Part
 * A). One file changes: src/app/plan/[eventId]/pre-flight/page.tsx.
 *
 * THE RULING THIS SUITE PINS
 *   - Where the pre-flight shows the invites-only choice, a clear button "Make a plan after all →",
 *     to Moment 2's opening: the same address as the small link "← Back to “What’s the plan?”".
 *   - Before Send only (GTC-374: "any time before she presses Send"): absent once the invitations
 *     have gone, by what the page already knows (event.sentAt), with no new state.
 *   - Nothing else on the pre-flight changes (tweak 9, step 5 and Send, is not started).
 *
 * THE LAYERS
 *   P  the page's source against GTC-419's tip (8bc1064, a fixed commit), the expected piece typed
 *      here by hand.
 *   R  the page itself, in this process: the page as it is now and as it was at 8bc1064 are both
 *      compiled here (esbuild) with React's hooks answered by this suite, and drawn for made-up
 *      events (typed here): invites only before Send (a plan put away, and none), invites only
 *      after Send, a planned event before and after Send. No request is made; nothing is pressed.
 *   U  CONTROL: between 8bc1064 and Ticket F's code commit (both fixed) only the page changed;
 *      package.json (at the commit that added this suite) differs by its one script line; the two
 *      untracked scripts are in no commit.
 *
 * No database, no server, no provider. Every condition lives in CHECKS, so it can be dry-run on a
 * passing and a failing input (TWEAKS_F_DRY_RUN=1 imports CHECKS and the helpers only).
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import * as ReactAll from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformSync } from 'esbuild';

import AfterThePress from '../src/components/preflight/AfterThePress';

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

// ── Source reading ───────────────────────────────────────────────────────────
const read = (rel: string) => {
  try {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
  } catch {
    return '';
  }
};
const git = (args: string[]) => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
const atRef = (ref: string, rel: string) => {
  const r = git(['show', `${ref}:${rel}`]);
  return r.status === 0 ? r.stdout : '';
};
const count = (s: string, needle: string) => s.split(needle).length - 1;

// ── Files and commits ────────────────────────────────────────────────────────
const PAGE = 'src/app/plan/[eventId]/pre-flight/page.tsx';
const SUITE = 'tests/tweaks-f-test.tsx';
/** GTC-419's tip (Ticket E's ticket commit), where this ticket starts: a fixed commit. */
const BASE = '8bc1064cd8f19fa1d100c3d1fcbdb6d83cce32c3';
/** Ticket F's code commit: a fixed commit. */
const CODE_F = '4052862a82e998ea749a6eca9eda6ccf941ffd84';
const CODE_FILES = [PAGE];
const NEW_SCRIPT = 'test:tweaks-f';
const NEW_SCRIPT_VALUE = 'tsx --tsconfig tests/tsconfig.json tests/tweaks-f-test.tsx';
const UNTRACKED_SCRIPTS = ['scripts/dev-login.ts', 'scripts/print-host-link.ts'];

// ── The ruled words and the address, typed by hand ───────────────────────────
const BUTTON_WORDS = 'Make a plan after all →';
const EVENT_ID = 'gtc420-made-up-event';
const OPENING = `/plan/${EVENT_ID}/setup?at=opening`;
const SMALL_LINK_WORDS = '← Back to “What’s the plan?”';
const LINE_WORDS = 'Invites only: nobody’s asked to bring anything, just whether they can come.';
const WAITING_WORDS = 'Your plan is put away. Go back to “What’s the plan?” to bring it back.';

// ── The exact piece Ticket F adds, typed by hand (8bc1064's file -> now) ─────
const AFTER_WAITING =
  '                <span data-plan-waiting="" className="mt-1 block">\n' +
  '                  {INVITES_ONLY_WORDS.PREFLIGHT_WAITING}\n' +
  '                </span>\n' +
  '              )}\n';
const BUTTON =
  "              {/* [[GTC-420]] (tweak 16): the way back to a plan, the small link's address. Before\n" +
  '                  Send only: once sent, this page gives way to AfterThePress above. */}\n' +
  '              <a\n' +
  '                data-make-a-plan=""\n' +
  '                href={setupHref(eventId, AT_OPENING)}\n' +
  '                className="mt-2 block w-fit rounded-md bg-sage-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sage-700"\n' +
  '              >\n' +
  `                ${BUTTON_WORDS}\n` +
  '              </a>\n';
/** The page's own early return once the invitations have gone, as it stands at the base. */
const AFTER_SEND =
  '  if (data.event.sentAt) {\n    return <AfterThePress eventId={eventId} />;\n  }\n';
/** The button as drawn (React writes the empty data attribute as =""). */
const DRAWN_BUTTON = `<a data-make-a-plan="" href="${OPENING}" class="mt-2 block w-fit rounded-md bg-sage-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sage-700">${BUTTON_WORDS}</a>`;

// ══ The page in this process ═════════════════════════════════════════════════
let slots: unknown[] = [];
let slot = 0;
const FAKE_REACT = {
  ...ReactAll,
  useState: (init: unknown) => {
    const i = slot++;
    return [
      i < slots.length ? slots[i] : typeof init === 'function' ? (init as () => unknown)() : init,
      () => undefined,
    ];
  },
  useEffect: () => undefined,
  useLayoutEffect: () => undefined,
  useMemo: (f: () => unknown) => f(),
  useCallback: (f: unknown) => f,
  useRef: (v: unknown) => ({ current: v }),
};
const NAVIGATION = {
  useParams: () => ({ eventId: EVENT_ID }),
  useRouter: () => ({ push() {}, replace() {}, refresh() {} }),
  usePathname: () => `/plan/${EVENT_ID}/pre-flight`,
  useSearchParams: () => new URLSearchParams(),
};
export interface Loaded {
  View: () => ReactAll.ReactElement;
}
/** Compiles a version of the page here; React's hooks are answered by this suite. */
export function loadPage(source: string): Loaded | null {
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
    return { View: m.exports.default };
  } catch (e) {
    console.error('    the page did not load:', (e as Error).message.split('\n')[0]);
    return null;
  }
}
/** A made-up event's pre-flight read, typed here. */
const preflight = (event: Record<string, unknown>) => ({
  viewerId: 'gtc420-kate',
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
    invitesOnly: true,
    planPutAway: false,
    ...event,
  },
  coverage: {
    unassignedItems: [],
    unassignedCount: 0,
    criticalUnassignedCount: 0,
    complianceRate: 100,
    criticalGaps: [],
  },
  dietary: { status: 'confirmed_none', requirements: [] },
  households: [],
  unhoused: [],
  channelCandidates: [],
});
const SENT = '2026-10-29T00:00:00.000Z';
export interface State {
  key: string;
  what: string;
  data: ReturnType<typeof preflight>;
  /** Whether the button is drawn: only invites only, before Send. */
  button: boolean;
  sent: boolean;
}
export const STATES: State[] = [
  {
    key: 'invites-only-put-away',
    what: 'invites only, a plan put away, before Send',
    data: preflight({ planPutAway: true }),
    button: true,
    sent: false,
  },
  {
    key: 'invites-only-no-plan',
    what: 'invites only, no plan ever made, before Send',
    data: preflight({}),
    button: true,
    sent: false,
  },
  {
    key: 'invites-only-sent',
    what: 'invites only, after Send',
    data: preflight({ planPutAway: true, sentAt: SENT }),
    button: false,
    sent: true,
  },
  {
    key: 'invites-only-sent-no-plan',
    what: 'invites only, no plan ever made, after Send',
    data: preflight({ sentAt: SENT }),
    button: false,
    sent: true,
  },
  {
    key: 'planned',
    what: 'a planned event, before Send',
    data: preflight({ invitesOnly: false }),
    button: false,
    sent: false,
  },
  {
    key: 'planned-sent',
    what: 'a planned event, after Send',
    data: preflight({ invitesOnly: false, sentAt: SENT }),
    button: false,
    sent: true,
  },
];
export interface Drawn {
  html: string;
  /** The element the page returned is the after-Send view. */
  afterSend: boolean;
}
export function draw(page: Loaded, data: unknown): Drawn {
  slots = [data];
  slot = 0;
  const tree = page.View();
  return { html: renderToStaticMarkup(tree), afterSend: tree?.type === AfterThePress };
}
const linksOf = (html: string) =>
  [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((m) => ({
    href: (m[1].match(/\bhref="([^"]*)"/) || [])[1] ?? null,
    words: m[2].replace(/<[^>]+>/g, '').trim(),
    attrs: m[1],
  }));

// ── CHECKS: every condition, dry-runnable ────────────────────────────────────
export const CHECKS = {
  /** P1 — the page is 8bc1064's file with exactly the button put in, byte for byte. */
  exactly(now: string, base: string) {
    return (
      base.length > 1000 &&
      count(base, AFTER_WAITING) === 1 &&
      now === base.replace(AFTER_WAITING, () => AFTER_WAITING + BUTTON)
    );
  },
  /**
   * P2 — the button sits inside the invites-only line and takes the small link's address: the
   * same `setupHref(eventId, AT_OPENING)` the small link uses, in the same invites-only branch.
   */
  inTheLine(now: string) {
    const line = now.slice(
      now.indexOf('data-invites-only-line=""'),
      now.indexOf('          ) : null}')
    );
    const small = now.slice(
      now.indexOf('          {invitesOnly ? (\n            <a\n'),
      now.indexOf('STRIP_WORDS.BACK_TO_WHATS_THE_PLAN')
    );
    return (
      line.length > 200 &&
      count(line, BUTTON) === 1 &&
      line.indexOf(BUTTON) > line.indexOf('{INVITES_ONLY_WORDS.PREFLIGHT_WAITING}') &&
      line.indexOf(BUTTON) < line.indexOf('</p>') &&
      small.includes('href={setupHref(eventId, AT_OPENING)}') &&
      count(now, 'data-make-a-plan') === 1
    );
  },
  /**
   * P3 — before Send only, by what the page already knows: its own return to the after-Send view
   * (as at the base) stands above the button; no new state, no new read of sentAt.
   */
  beforeSendOnly(now: string, base: string) {
    const ret = now.indexOf(AFTER_SEND);
    return (
      count(base, AFTER_SEND) === 1 &&
      count(now, AFTER_SEND) === 1 &&
      ret > 0 &&
      ret < now.indexOf('data-make-a-plan') &&
      count(now, 'sentAt') === count(base, 'sentAt') &&
      count(now, 'useState') === count(base, 'useState') &&
      count(now, 'useEffect') === count(base, 'useEffect')
    );
  },
  /** R1 — invites only, before Send: one button, its words, the small link's address, in the line. */
  drawnBefore(d: Drawn) {
    const links = linksOf(d.html);
    const mine = links.filter((l) => /data-make-a-plan/.test(l.attrs));
    const small = links.filter((l) => l.words === SMALL_LINK_WORDS);
    const line = d.html.slice(
      d.html.indexOf('data-invites-only-line'),
      d.html.indexOf('</p>', d.html.indexOf('data-invites-only-line'))
    );
    return (
      !d.afterSend &&
      mine.length === 1 &&
      mine[0].words === BUTTON_WORDS &&
      mine[0].href === OPENING &&
      small.length === 1 &&
      small[0].href === OPENING &&
      line.includes(LINE_WORDS) &&
      line.includes(DRAWN_BUTTON) &&
      count(d.html, DRAWN_BUTTON) === 1
    );
  },
  /** R2 — after Send, or on a planned event: no button, and nothing else changed. */
  absent(d: Drawn, sent: boolean) {
    return (
      d.html.length > 0 &&
      !d.html.includes('data-make-a-plan') &&
      !d.html.includes(BUTTON_WORDS) &&
      d.afterSend === sent &&
      (!sent || !d.html.includes('data-invites-only-line'))
    );
  },
  /** R3 — CONTROL: the page drawn now is the page drawn at the base, but for the button itself. */
  onlyTheButton(now: Drawn, base: Drawn, button: boolean) {
    return (
      base.html.length > 0 &&
      !base.html.includes('data-make-a-plan') &&
      (button ? now.html.replace(DRAWN_BUTTON, '') === base.html : now.html === base.html)
    );
  },
  /** R4 — the waiting line shows only when a plan was put away, as before; the button either way. */
  waiting(d: Drawn, putAway: boolean) {
    return d.html.includes(WAITING_WORDS) === putAway;
  },
  /** U1 — the files the code commit changed since the base are exactly this ticket's list. */
  sameList(changed: string | null, list: string[]) {
    if (changed === null) return false;
    const got = changed.split('\n').filter(Boolean).sort();
    return JSON.stringify(got) === JSON.stringify([...list].sort());
  },
  /** U3 — package.json at the commit that added this suite differs by the one script line. */
  oneScriptLine(atAdd: string, baseJson: string) {
    try {
      const now = JSON.parse(atAdd);
      const base = JSON.parse(baseJson);
      if (now?.scripts?.[NEW_SCRIPT] !== NEW_SCRIPT_VALUE) return false;
      if (base?.scripts?.[NEW_SCRIPT] !== undefined) return false;
      delete now.scripts[NEW_SCRIPT];
      return JSON.stringify(now) === JSON.stringify(base);
    } catch {
      return false;
    }
  },
};
// ── CHECKS-END ───────────────────────────────────────────────────────────────

function layerP(now: string, base: string) {
  section('P — the pre-flight’s source, against GTC-419’s tip (8bc1064)');
  assert(
    'P',
    'P1 the page is 8bc1064’s file with exactly the button (and its comment) put in, byte for byte: nothing else on the pre-flight changes (step 5 and Send included)',
    CHECKS.exactly(now, base)
  );
  assert(
    'P',
    'P2 the button sits inside the invites-only line, after "Your plan is put away", with the small link’s own address, setupHref(eventId, AT_OPENING)',
    CHECKS.inTheLine(now)
  );
  assert(
    'P',
    'P3 before Send only, by what the page already knows: its return to the after-Send view (if data.event.sentAt) stands above the button, as at the base; no new state, no new read of sentAt',
    CHECKS.beforeSendOnly(now, base)
  );
}

function layerR(now: string, base: string) {
  section('R — the pre-flight itself, drawn here for six made-up events');
  const pageNow = loadPage(now);
  const pageBase = loadPage(base);
  const ok = !!pageNow && !!pageBase;
  const red: Record<string, string[]> = {};
  const fail = (k: string, s: State) => (red[k] = [...(red[k] ?? []), s.key]);
  for (const s of STATES) {
    if (!ok) break;
    let dn: Drawn;
    let db: Drawn;
    try {
      dn = draw(pageNow!, s.data);
      db = draw(pageBase!, s.data);
    } catch (e) {
      console.error(`    ${s.key} did not draw:`, (e as Error).message.split('\n')[0]);
      ['R1', 'R2', 'R3', 'R4'].forEach((k) => fail(k, s));
      continue;
    }
    if (s.button && !CHECKS.drawnBefore(dn)) fail('R1', s);
    if (!s.button && !CHECKS.absent(dn, s.sent)) fail('R2', s);
    if (!CHECKS.onlyTheButton(dn, db, s.button)) fail('R3', s);
    if (s.button && !CHECKS.waiting(dn, s.data.event.planPutAway === true)) fail('R4', s);
  }
  const keys = (k: string) => (ok ? (red[k] ?? []).join(', ') : 'the page did not load');
  const green = (k: string) => ok && !(k in red);
  assert(
    'R',
    `R1 invites only, before Send (a plan put away, and none): one button "${BUTTON_WORDS}" in the invites-only line, to ${OPENING}, the small link’s own address`,
    green('R1'),
    keys('R1')
  );
  assert(
    'R',
    'R2 after Send (invites only, with and without a plan put away), and on a planned event before and after Send: no button; after Send the page is the after-Send view, with no invites-only line',
    green('R2'),
    keys('R2')
  );
  assert(
    'R',
    'R3 CONTROL: in all six states the page drawn now is the page drawn at 8bc1064 but for the button itself (and at 8bc1064 there is no button)',
    green('R3'),
    keys('R3')
  );
  assert(
    'R',
    'R4 "Your plan is put away ..." shows only when a plan was put away, as before; the button shows either way',
    green('R4'),
    keys('R4')
  );
}

function layerU() {
  section('U — CONTROL: what Ticket F touched, between fixed commits');
  const r = git(['diff', '--name-only', BASE, CODE_F]);
  const changed = r.status === 0 ? r.stdout : null;
  assert(
    'U',
    `U1 the files changed between GTC-419’s tip (8bc1064) and Ticket F’s code commit (${CODE_F.slice(0, 7)}) are exactly: ${CODE_FILES.join(', ')} (no component, no shared library)`,
    CHECKS.sameList(changed, CODE_FILES),
    String(changed)
  );
  assert(
    'U',
    'U2 Ticket F’s code commit stands straight on GTC-419’s tip (its one parent)',
    git(['rev-parse', `${CODE_F}^@`]).stdout.trim() === BASE
  );
  const added = git(['log', '--diff-filter=A', '--format=%H', '--', SUITE])
    .stdout.trim()
    .split('\n')
    .filter(Boolean);
  const addCommit = added[added.length - 1] ?? '';
  assert(
    'U',
    `U3 package.json at the commit that added this suite (${addCommit.slice(0, 7) || 'none yet'}) differs from the base by "${NEW_SCRIPT}" and nothing else`,
    addCommit.length === 40 &&
      CHECKS.oneScriptLine(atRef(addCommit, 'package.json'), atRef(BASE, 'package.json'))
  );
  const tracked = UNTRACKED_SCRIPTS.filter(
    (f) => git(['log', '--oneline', `${BASE}..HEAD`, '--', f]).stdout.trim().length > 0
  );
  assert(
    'U',
    'U4 neither scripts/dev-login.ts nor scripts/print-host-link.ts is in any commit since the base',
    tracked.length === 0,
    tracked.join(', ')
  );
}

function main() {
  const now = read(PAGE);
  const base = atRef(BASE, PAGE);
  layerP(now, base);
  layerR(now, base);
  layerU();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (reds.length) console.log(reds.map((r) => `  - ${r}`).join('\n'));
  process.exit(failed > 0 ? 1 : 0);
}

// A dry run imports CHECKS and the helpers only (TWEAKS_F_DRY_RUN=1); the suite runs otherwise.
if (process.env.TWEAKS_F_DRY_RUN !== '1') main();
