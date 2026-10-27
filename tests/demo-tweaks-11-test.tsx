/**
 * [[GTC-409]] — THE DISH CARDS: ONE PER ROW FOR A GUEST, NEVER MORE THAN TWO ACROSS FOR A HOST OR A
 * COORDINATOR. A layout ticket, class names only, on four pages: src/app/p/[token]/page.tsx,
 * src/app/h/[token]/page.tsx, src/app/h/[token]/team/[teamId]/page.tsx, src/app/c/[token]/page.tsx.
 *
 * THE RULINGS THIS SUITE PINS (27 Oct 2026)
 *   1  All three pages: the guest page, the host page with its team page, the coordinator page.
 *   2  The guest page: one dish card per row at every width. The host's and coordinator's pages:
 *      the Grid/List switch and the List view as they were; Grid view never more than two across.
 *   3  Dish names that wrap cleanly (no word per line, no letters hidden), the open/close arrow in
 *      its own space beside the name, Yes / No / Maybe across the card with all three words fully
 *      visible, "Expand All" / "Collapse All" unchanged. At the pause: the long-word guard on the
 *      host page and its team page (a very long single word wraps inside the card).
 *   4  No change to any word, answer, behaviour, route or data.
 *
 * THE LAYERS
 *   S  the source: each page is GTC-408's tip (b05cac3, this ticket's parent) but for its class
 *      names; with every className value taken out of both, the rest is the same byte for byte
 *      (whitespace aside), so no word, handler, fetch, state or prop moved.
 *   L  the guest page in a walled-off headless Chrome (port 9490) at 320, 375, 768 and 1280: one
 *      card per row; no name broken one word per line; the arrow's box never over the name's text;
 *      Yes, No and Maybe each inside the card and fully drawn; Collapse All and Expand All work.
 *   G  the host page, its team page and the coordinator page: Grid view two across at most at
 *      1280; List view where it was (each card's left edge and width as the parent draws them, at
 *      375 and 1280); no arrow over a name in Grid or List at 375 and 1280 (the host and team pages
 *      with a word wider than a phone's card).
 *   W  no word changed: each page's visible words, drawn with the same made-up data by this
 *      ticket's parent (b05cac3, exported by `git archive` into a scratch folder OUTSIDE the repo
 *      and served by its own dev server on :3100, port 9491 for its Chrome) and by HEAD, are the
 *      same. The scratch folder is deleted at the end.
 *   K  CONTROL: every request the pages made to /api was paused and answered by this suite with the
 *      made-up data written here (none unexpected, so nothing reached a database or a provider);
 *      both browsers asked for the two local servers only.
 *   U  CONTROL: the only files under src or prisma that differ from b05cac3 are the four pages; the
 *      lockfile is as it was; package.json (at the commit that added this suite) differs by its one
 *      script line; the two untracked scripts are in no commit.
 *
 * WHY IT IS SAFE: the page reads (GET /api/p/…, /api/h/…, /api/h/…/team/…, /api/c/…) never reach
 * either server: a second DevTools connection answers them with made-up data, and fails anything
 * else under /api in the browser. The browsers resolve localhost only. The parent's dev server is
 * given a database address that reaches nothing and blank provider keys; the pages it serves ask it
 * for nothing but their own code (no session cookie, so the layout reads no user). No answer button
 * is pressed; the only clicks are a card's arrow, "Collapse All" / "Expand All" and the Grid / List
 * switch, all DOM clicks found by their title or words.
 *
 * Every live condition lives in CHECKS, so it can be dry-run on a passing and a failing input
 * (DEMO_TWEAKS_11_DRY_RUN=1 imports CHECKS only). Every made-up answer and expected value is
 * written here by hand, never taken from the code under test.
 *
 * Needs the dev server on :3000 (GTC409_BASE_URL points it elsewhere, for the break proofs), port
 * 3100 free, and a global WebSocket (NODE_OPTIONS=--experimental-websocket). GTC409_PARENT_URL, if
 * set, names an already running server of the parent instead of starting one (break proofs only).
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn, spawnSync, type ChildProcess } from 'child_process';

import { installProviderTrap } from './helpers/provider-trap';
import { openHeadless, type Headless } from './helpers/headless';

const realFetch = globalThis.fetch;
installProviderTrap();

const ROOT = path.join(__dirname, '..');
const BASE_URL = process.env.GTC409_BASE_URL ?? 'http://localhost:3000';
const PARENT_PORT = 3100;
const PORT = 9490;
const PARENT_CHROME_PORT = 9491;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

// ── Files and commits ────────────────────────────────────────────────────────
const SUITE = 'tests/demo-tweaks-11-test.tsx';
const GUEST = 'src/app/p/[token]/page.tsx';
const HOST = 'src/app/h/[token]/page.tsx';
const TEAM = 'src/app/h/[token]/team/[teamId]/page.tsx';
const COORD = 'src/app/c/[token]/page.tsx';
const PAGES = [GUEST, HOST, TEAM, COORD];
/** GTC-408's last commit (its ticket, its pushed tip): this ticket's parent, a fixed commit. */
const BASE = 'b05cac341e28ca1a3bdea5966f71015553cb98a4';
/**
 * [[GTC-411]] edits three files on purpose (signing in and paying for an event now find or make a
 * User through one shared rule that ignores capitals and outer spaces) and adds the rule's own
 * file, so U1 asks its question of the three at GTC-411's base (7597112), a fixed commit: this
 * ticket still may not have touched them; and the new file must not be there yet. All four are
 * kept out of U1's live diff, which still covers everything else under src and prisma.
 * test:email-case, test:gtc280 and the security suite (suite 20) pin their new state.
 */
const GTC411_BASE = '759711288b981fe78941a11fb9bd177743a1db6f';
const NOT_TOUCHED_TILL_GTC411 = [
  'src/app/api/auth/verify/route.ts',
  'src/app/api/events/route.ts',
  'src/lib/events/payment-identity.ts',
];
const NEW_IN_GTC411 = ['src/lib/accounts/user-by-email.ts'];
const NEW_SCRIPT = 'test:demo-tweaks-11';
const NEW_SCRIPT_VALUE =
  'NODE_OPTIONS=--experimental-websocket tsx --tsconfig tests/tsconfig.json tests/demo-tweaks-11-test.tsx';
const UNTRACKED_SCRIPTS = ['scripts/dev-login.ts', 'scripts/print-host-link.ts'];

// ── The made-up data, written by hand ────────────────────────────────────────
const EVENT_NAME = 'GTC-409 made-up gathering';
const T_GUEST = 'gtc409guesttoken0000000000000000000000000000000000000000000000aa';
const T_HOST = 'gtc409hosttoken00000000000000000000000000000000000000000000000bb';
const T_COORD = 'gtc409coordtoken0000000000000000000000000000000000000000000000cc';
const TEAM_ID = 'gtc409-team-desserts';
/** A word wider than a phone's card, for the host page's team and the team page's dish (ruling 1 at the pause). */
const LONG_TEAM = 'Grandmasfamouschristmaspuddingandtriflecommittee';
const LONG_DISH = 'Chocolatebrowniesliceandraspberrycoulisplatter';
const START = '2026-12-24T23:00:00.000Z';
const person = (id: string, name: string) => ({ id: `gtc409-${id}`, name });
const JO = person('jo', 'Jo Lowe');
const MIA = person('mia', 'Mia Lowe');
const ROB = person('rob', 'Rob Tane');
const KATE = person('kate', 'Kate Lowe');
const ANA = person('ana', 'Ana Pere');
let n = 0;
const item = (name: string, extra: Record<string, unknown> = {}) => ({
  id: `gtc409-item-${++n}`,
  name,
  quantity: null as string | null,
  description: null,
  critical: false,
  glutenFree: false,
  dairyFree: false,
  vegetarian: false,
  notes: null as string | null,
  dropOffAt: null,
  dropOffLocation: null as string | null,
  dropOffNote: null as string | null,
  day: null,
  ...extra,
});
const ask = (response: string, it: ReturnType<typeof item>) => ({
  id: `gtc409-ask-${it.id}`,
  response,
  item: it,
});
/** The guest's own dishes: long and awkward names, a critical one, one with its own drop-off, a maybe, a yes. */
const GUEST_ROWS = [
  ask('PENDING', item('L&P (Lemon & Paeroa)', { quantity: '6 bottles' })),
  ask(
    'PENDING',
    item('Fruit-Based Dessert Platter', {
      critical: true,
      notes: 'Enough for twenty, please.',
      glutenFree: true,
      vegetarian: true,
    })
  ),
  ask(
    'PENDING',
    item('Marlborough Sauvignon Blanc', {
      quantity: '2 bottles',
      dropOffLocation: 'the back door',
      dropOffNote: '11am',
    })
  ),
  ask('PENDING', item('Homemade Raspberrylemonadeconcentrate')),
  ask('MAYBE', item('Pavlova', { quantity: '2' })),
  ask('ACCEPTED', item('Glazed Christmas Ham')),
];
const CHILD_ROWS = [
  ask('PENDING', item('Chocolate-Chip Cookies', { quantity: '1 tin' })),
  ask('PENDING', item('Paper Napkins')),
];
/** How many cards hold the three answers (the PENDING ones). */
const PENDING_CARDS = 6;
const GUEST_DATA = {
  isDemo: false,
  person: JO,
  event: {
    id: 'gtc409-event',
    name: EVENT_NAME,
    sentAt: null,
    startDate: START,
    endDate: START,
    status: 'CONFIRMING',
    guestCount: 12,
    venueName: 'Riverside Hall',
    venueTimingStart: '12:00pm',
    venueTimingEnd: '4:00pm',
    hostFirstName: 'Kate',
  },
  team: null,
  attendance: 'YES',
  attendanceAnswer: null,
  attendanceAskable: false,
  invitesOnly: false,
  assignments: GUEST_ROWS,
  carried: [
    {
      personEventId: 'gtc409-pe-mia',
      personId: MIA.id,
      name: MIA.name,
      firstName: 'Mia',
      assignments: CHILD_ROWS,
    },
  ],
};
const held = (
  it: ReturnType<typeof item>,
  who: { id: string; name: string } | null,
  r = 'PENDING'
) => ({
  ...it,
  status: who ? 'ASSIGNED' : 'UNASSIGNED',
  assignment: who ? { id: `gtc409-ask-${it.id}`, response: r, person: who } : null,
});
const DESSERT_ITEMS = [
  held(item('L&P (Lemon & Paeroa)', { quantity: '6 bottles' }), JO),
  held(
    item('Fruit-Based Dessert Platter', { critical: true, notes: 'Enough for twenty, please.' }),
    JO
  ),
  held(item('Homemade Raspberrylemonadeconcentrate'), JO),
  held(item('Pavlova', { quantity: '2' }), JO, 'MAYBE'),
  held(item('Ice for the Chilly Bin', { quantity: '2 bags' }), ROB),
];
const team = (
  id: string,
  name: string,
  coordinator: { id: string; name: string },
  items: any[],
  status: string
) => ({
  id,
  name,
  scope: null,
  coordinator,
  status,
  itemCount: items.length,
  unassignedCount: items.filter((i) => !i.assignment).length,
  criticalGapCount: items.filter((i) => i.critical && !i.assignment).length,
  items,
});
const HOST_DATA = {
  isDemo: false,
  person: KATE,
  event: {
    id: 'gtc409-event',
    name: EVENT_NAME,
    startDate: START,
    endDate: START,
    venueTimingStart: '12:00pm',
    venueTimingEnd: '4:00pm',
    status: 'DRAFT',
    sentAt: null,
    guestCount: 12,
  },
  authStatus: 'authenticated',
  teams: [
    team(TEAM_ID, 'Desserts and Sweet Things', ROB, DESSERT_ITEMS, 'SORTED'),
    team(
      'gtc409-team-mains',
      'Mains',
      KATE,
      [held(item('Roast Lamb', { critical: true }), null)],
      'CRITICAL_GAP'
    ),
    team('gtc409-team-drinks', 'Drinks', ANA, [held(item('Sparkling Grape Juice'), null)], 'GAP'),
    team('gtc409-team-long', LONG_TEAM, ANA, [held(item('Pudding'), null)], 'GAP'),
  ],
  freezeAllowed: true,
  criticalGapCount: 1,
  inviteStatus: null,
  people: null,
};
const TEAM_DATA = {
  event: {
    id: 'gtc409-event',
    name: EVENT_NAME,
    startDate: START,
    endDate: START,
    status: 'DRAFT',
  },
  team: { id: TEAM_ID, name: 'Desserts and Sweet Things', coordinator: ROB },
  items: [...DESSERT_ITEMS, held(item(LONG_DISH), null)],
  people: [],
};
const COORD_DATA = {
  isDemo: false,
  person: ROB,
  event: {
    id: 'gtc409-event',
    name: EVENT_NAME,
    status: 'DRAFT',
    sentAt: null,
    endDate: START,
    guestCount: 12,
  },
  team: { id: TEAM_ID, name: 'Desserts and Sweet Things', scope: null },
  host: { name: KATE.name },
  myStatus: 'SORTED',
  items: DESSERT_ITEMS,
  teamMembers: [],
  otherTeams: [
    { id: 'gtc409-team-mains', name: 'Mains', status: 'CRITICAL_GAP' },
    { id: 'gtc409-team-drinks', name: 'Drinks', status: 'GAP' },
  ],
  myAssignments: [ask('PENDING', item('Ice for the Chilly Bin', { quantity: '2 bags' }))],
};
/** The four reads, by path, and what this suite answers each with. */
const ANSWERS: Record<string, unknown> = {
  [`/api/p/${T_GUEST}`]: GUEST_DATA,
  [`/api/h/${T_HOST}`]: HOST_DATA,
  [`/api/h/${T_HOST}/team/${TEAM_ID}`]: TEAM_DATA,
  [`/api/c/${T_COORD}`]: COORD_DATA,
};
const LINKS = {
  guest: `/p/${T_GUEST}`,
  host: `/h/${T_HOST}`,
  team: `/h/${T_HOST}/team/${TEAM_ID}`,
  coordinator: `/c/${T_COORD}`,
};

// ── Shapes read in the browser ───────────────────────────────────────────────
export interface Box {
  l: number;
  t: number;
  r: number;
  b: number;
  w: number;
  h: number;
}
export interface Answer {
  word: string;
  box: Box;
  /** The word's own drawn box. */
  text: Box;
  sw: number;
  cw: number;
  visible: boolean;
}
export interface Card {
  name: string | null;
  card: Box;
  arrow: Box;
  /** The union of the name's drawn text, line by line; null when no name was found. */
  text: Box | null;
  lines: number;
  /** The box the name sits in (its row), and the widest single word of the name as drawn in its font. */
  box: Box | null;
  wordW: number;
  title: string | null;
  answers: Answer[];
}
export interface Facts {
  docWidth: number;
  cards: Card[];
}
export interface Toggled {
  titles: string[];
  yesVisible: number;
  label: string | null;
}

const overlap = (a: Box, b: Box) =>
  a.l < b.r - 0.5 && a.r > b.l + 0.5 && a.t < b.b - 0.5 && a.b > b.t + 0.5;
const inside = (a: Box, b: Box) =>
  a.l >= b.l - 0.5 && a.r <= b.r + 0.5 && a.t >= b.t - 0.5 && a.b <= b.b + 0.5;
/** The most cards that share one row (the same top). */
const mostInARow = (cards: Card[]) => {
  const tops = new Map<number, number>();
  for (const c of cards) {
    const t = Math.round(c.card.t);
    tops.set(t, (tops.get(t) ?? 0) + 1);
  }
  return Math.max(0, ...tops.values());
};
const words = (s: string | null) => (s ?? '').trim().split(/\s+/).filter(Boolean).length;
/** Every className value taken out, then every space: what is left is everything but the classes. */
const withoutClasses = (src: string) =>
  src
    .replace(/className=\{`[^`]*`\}/g, 'className')
    .replace(/className="[^"]*"/g, 'className')
    .replace(/\s+/g, '');

export const CHECKS = {
  /** S1-S4 — the page is the parent's but for class names. */
  onlyClasses(now: string, base: string) {
    return base.length > 1000 && now.length > 1000 && withoutClasses(now) === withoutClasses(base);
  },
  /** L1 — every card on a row of its own (no two cards' heights overlap). */
  oneCardPerRow(f: Facts | null, min: number) {
    if (!f || f.cards.length < min) return false;
    const c = f.cards;
    return c.every((a, i) =>
      c.every((b, j) => j <= i || a.card.b <= b.card.t + 1 || b.card.b <= a.card.t + 1)
    );
  },
  /**
   * L2 — the name's box is at least half its card wide, and no name of two words or more takes a
   * line per word, but where one of its words is wider than the whole box (it cannot fit; it breaks).
   */
  namesWrapCleanly(f: Facts | null, min: number) {
    if (!f || f.cards.length < min) return false;
    return f.cards.every(
      (c) =>
        !!c.name &&
        !!c.box &&
        c.lines >= 1 &&
        c.box.w >= 0.5 * c.card.w &&
        (words(c.name) < 2 || c.lines < words(c.name) || c.wordW > c.box.w)
    );
  },
  /** L3 — the arrow's box never over the name's text; the text inside the card; the page no wider than the screen. */
  arrowClear(f: Facts | null, min: number, width: number) {
    if (!f || f.cards.length < min) return false;
    return (
      f.docWidth <= width &&
      f.cards.every((c) => !!c.text && !overlap(c.text, c.arrow) && inside(c.text, c.card))
    );
  },
  /** L4 — Yes, No, Maybe on every open, unanswered card: each inside the card, drawn whole; together across it. */
  answersVisible(f: Facts | null, pending: number) {
    if (!f) return false;
    const asked = f.cards.filter((c) => c.answers.length > 0);
    return (
      asked.length === pending &&
      asked.every((c) => {
        const a = c.answers;
        return (
          a.map((x) => x.word).join() === 'Yes,No,Maybe' &&
          a.every(
            (x) =>
              x.visible &&
              x.sw <= x.cw &&
              inside(x.box, c.card) &&
              x.text.w > 0 &&
              inside(x.text, x.box)
          ) &&
          a[2].box.r - a[0].box.l >= 0.75 * c.card.w
        );
      })
    );
  },
  /** L5 — Collapse All closes every card (their answers gone), Expand All opens every one again. */
  toggles(closed: Toggled | null, open: Toggled | null, cards: number, pending: number) {
    return (
      !!closed &&
      !!open &&
      closed.titles.length === cards &&
      closed.titles.every((t) => t === 'Expand') &&
      closed.yesVisible === 0 &&
      closed.label === 'Expand All' &&
      open.titles.length === cards &&
      open.titles.every((t) => t === 'Collapse') &&
      open.yesVisible === pending &&
      open.label === 'Collapse All'
    );
  },
  /** G1-G3 — Grid view: at least three cards, and exactly two side by side at most. */
  twoAcross(f: Facts | null) {
    return !!f && f.cards.length >= 3 && mostInARow(f.cards) === 2;
  },
  /** G4 — List view: the same cards, each where the parent draws it across (left edge, width), one per row. */
  listAsParent(head: Facts | null, parent: Facts | null) {
    if (!head || !parent || head.cards.length < 3 || head.cards.length !== parent.cards.length)
      return false;
    return (
      mostInARow(head.cards) === 1 &&
      head.cards.every(
        (c, i) =>
          Math.abs(c.card.l - parent.cards[i].card.l) < 1 &&
          Math.abs(c.card.w - parent.cards[i].card.w) < 1
      )
    );
  },
  /** G5 — no arrow over a name's text, and the text inside its card. */
  noArrowOverName(f: Facts | null) {
    return (
      !!f &&
      f.cards.length >= 1 &&
      f.cards.every((c) => !!c.text && !overlap(c.text, c.arrow) && inside(c.text, c.card))
    );
  },
  /** W1-W4 — the same visible words, drawn by the parent and by HEAD. */
  sameWords(head: string[] | null, parent: string[] | null) {
    return (
      !!head &&
      !!parent &&
      head.length >= 2 &&
      head.length === parent.length &&
      head.every((h, i) => h.length > 200 && h.includes(EVENT_NAME) && h === parent[i])
    );
  },
  /** K1 — every /api request was one of the four reads and was answered here; each read answered on both servers. */
  allAnswered(log: { path: string; answered: boolean; server: string }[], servers: string[]) {
    return (
      log.length > 0 &&
      log.every((x) => x.answered) &&
      Object.keys(ANSWERS).every((p) =>
        servers.every((s) => log.some((x) => x.path === p && x.server === s))
      )
    );
  },
  /** K2 — every address the browsers asked for is on one of the two local servers, or a data: or blob: address. */
  walled(urls: string[], hosts: string[], allowed: string[]) {
    return (
      urls.length > 0 &&
      urls.every((u) => /^(data|blob):/.test(u) || allowed.some((a) => u.startsWith(a + '/'))) &&
      hosts.every((h) => allowed.some((a) => new URL(a).host === h))
    );
  },
  /** U1 — the only files under src or prisma that differ from the parent are the four pages. */
  onlyThePages(changed: string, untracked: string) {
    const got = changed.trim().split('\n').filter(Boolean).sort();
    return JSON.stringify(got) === JSON.stringify([...PAGES].sort()) && untracked.trim() === '';
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

// ══ S — THE SOURCE ═══════════════════════════════════════════════════════════
function layerS() {
  section('S — the source: each page is the parent’s (b05cac3) but for its class names');
  const labels = [
    'the guest page',
    'the host page',
    'the host’s team page',
    'the coordinator page',
  ];
  PAGES.forEach((p, i) =>
    assert(
      'S',
      `S${i + 1} ${labels[i]} (${p}): with every className value taken out of both, it is the parent’s byte for byte (spaces aside): no word, handler, fetch, state or prop moved`,
      CHECKS.onlyClasses(read(p), atRef(BASE, p))
    )
  );
}

// ══ The browsers ═════════════════════════════════════════════════════════════
/** In the page: every card (found by its open/close arrow), its name's drawn text and its answers. */
const MEASURE = `(() => {
  const r = (b) => ({ l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height });
  const arrows = [...document.querySelectorAll('button[title="Expand"], button[title="Collapse"]')];
  const cards = arrows.map((a) => {
    const card = a.parentElement && a.parentElement.parentElement;
    const name = card ? card.querySelector('h2, h3, span.font-semibold') : null;
    let text = null; let lines = 0; let box = null; let wordW = 0;
    if (name) {
      const g = document.createRange(); g.selectNodeContents(name);
      const rs = [...g.getClientRects()].filter((x) => x.width > 0 && x.height > 0);
      lines = new Set(rs.map((x) => Math.round(x.top))).size;
      if (rs.length) text = { l: Math.min(...rs.map((x) => x.left)), t: Math.min(...rs.map((x) => x.top)), r: Math.max(...rs.map((x) => x.right)), b: Math.max(...rs.map((x) => x.bottom)) };
      if (text) { text.w = text.r - text.l; text.h = text.b - text.t; }
      box = r(name.parentElement.getBoundingClientRect());
      const ctx = document.createElement('canvas').getContext('2d'); ctx.font = getComputedStyle(name).font;
      wordW = Math.max(0, ...name.textContent.trim().split(/\s+/).map((w) => ctx.measureText(w).width));
    }
    const answers = card ? [...card.querySelectorAll('button')].filter((b) => /^(Yes|No|Maybe)$/.test(b.textContent.trim())).map((b) => {
      const g = document.createRange(); g.selectNodeContents(b);
      return { word: b.textContent.trim(), box: r(b.getBoundingClientRect()), text: r(g.getBoundingClientRect()), sw: b.scrollWidth, cw: b.clientWidth, visible: b.checkVisibility() };
    }) : [];
    return { name: name ? name.textContent.trim() : null, card: r(card.getBoundingClientRect()), arrow: r(a.getBoundingClientRect()), text, lines, box, wordW, title: a.getAttribute('title'), answers };
  });
  return { docWidth: document.documentElement.scrollWidth, cards };
})()`;
const TOGGLED = `(() => ({
  titles: [...document.querySelectorAll('button[title="Expand"], button[title="Collapse"]')].map((b) => b.getAttribute('title')),
  yesVisible: [...document.querySelectorAll('button')].filter((b) => b.textContent.trim() === 'Yes' && b.checkVisibility()).length,
  label: ([...document.querySelectorAll('button')].map((b) => b.textContent.trim()).find((t) => t === 'Expand All' || t === 'Collapse All')) || null,
}))()`;
const WORDS = `document.body.innerText.replace(/\\s+/g, ' ').trim()`;
const clickWords = (w: string) =>
  `(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === ${JSON.stringify(w)}); if (!b) return false; b.click(); return true; })()`;
const LIST_VIEW = `(() => { const b = document.querySelector('button[title="List view"]'); if (!b) return false; b.click(); return true; })()`;

interface Logged {
  path: string;
  answered: boolean;
  server: string;
}
/** A second DevTools connection to a browser's page: answers the four reads, fails the rest of /api. */
async function openAnswerer(port: number, server: string, log: Logged[]) {
  const targets = (await (await realFetch(`http://127.0.0.1:${port}/json/list`)).json()) as {
    type: string;
    webSocketDebuggerUrl: string;
  }[];
  const page = targets.find((t) => t.type === 'page');
  if (!page) throw new Error('no page target for the answerer');
  const ws = new (globalThis as any).WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0;
  const pending = new Map<number, (m: any) => void>();
  const urls: string[] = [];
  const send = (method: string, params: Record<string, unknown> = {}) =>
    new Promise<any>((r) => {
      const i = ++id;
      pending.set(i, r);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  ws.addEventListener('message', (e: { data: string }) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)!(m);
      pending.delete(m.id);
    }
    if (m.method === 'Network.requestWillBeSent') urls.push(m.params.request.url);
    if (m.method !== 'Fetch.requestPaused') return;
    const { requestId, request } = m.params;
    const p = new URL(request.url).pathname;
    const body = request.method === 'GET' ? ANSWERS[p] : undefined;
    log.push({ path: p, answered: body !== undefined, server });
    if (body === undefined) {
      void send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' });
      return;
    }
    void send('Fetch.fulfillRequest', {
      requestId,
      responseCode: 200,
      responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
      body: Buffer.from(JSON.stringify(body)).toString('base64'),
    });
  });
  await send('Network.enable');
  await send('Fetch.enable', { patterns: [{ urlPattern: '*/api/*', requestStage: 'Request' }] });
  return {
    urls: () => [...urls],
    close() {
      try {
        ws.close();
      } catch {
        // already closed
      }
    },
  };
}

/** Navigates and waits (up to 90 s: a dev server's first build of a page) until the cards are drawn. */
async function load(c: Headless, link: string, min: number) {
  await c.navigate(link, 300);
  for (let i = 0; i < 180; i++) {
    const got = await c
      .evaluate<number>(
        `document.querySelectorAll('button[title="Expand"], button[title="Collapse"]').length`
      )
      .catch(() => 0);
    if (got >= min) {
      await sleep(400);
      return true;
    }
    await sleep(500);
  }
  return false;
}

/** The parent's own dev server, from `git archive` of b05cac3 in a scratch folder outside the repo. */
async function startParent(): Promise<{ url: string; stop: () => Promise<void>; note: string }> {
  if (process.env.GTC409_PARENT_URL) {
    return { url: process.env.GTC409_PARENT_URL, stop: async () => {}, note: 'given' };
  }
  const busy = await realFetch(`http://127.0.0.1:${PARENT_PORT}/`)
    .then(() => true)
    .catch(() => false);
  if (busy) throw new Error(`port ${PARENT_PORT} is in use: the parent's server cannot start`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtc409-parent-'));
  if (dir.startsWith(ROOT)) throw new Error('the scratch folder is inside the repo');
  const tar = spawnSync('sh', ['-c', `git -C "${ROOT}" archive ${BASE} | tar -x -C "${dir}"`]);
  const cp = spawnSync('cp', [
    '-cR',
    path.join(ROOT, 'node_modules'),
    path.join(dir, 'node_modules'),
  ]);
  if (tar.status !== 0 || cp.status !== 0 || !fs.existsSync(path.join(dir, GUEST)))
    throw new Error('the parent could not be exported');
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? '',
    HOME: process.env.HOME ?? '',
    NEXT_TELEMETRY_DISABLED: '1',
    // A database address that reaches nothing: the pages it serves read no data from it.
    DATABASE_URL: 'postgresql://gtc409-no-database@127.0.0.1:1/none',
    ANTHROPIC_API_KEY: '',
    RESEND_API_KEY: '',
    TWILIO_ACCOUNT_SID: '',
    TWILIO_AUTH_TOKEN: '',
    TWILIO_PHONE_NUMBER: '',
    TNZ_AUTH_TOKEN: '',
    TNZ_API_KEY: '',
    CRON_SECRET: '',
    STRIPE_SECRET_KEY: 'gtc409-made-up-not-a-stripe-key',
    STRIPE_WEBHOOK_SECRET: 'gtc409-made-up-not-a-webhook-secret',
    HTTPS_PROXY: process.env.HTTPS_PROXY ?? '',
    HTTP_PROXY: process.env.HTTP_PROXY ?? '',
  };
  const child: ChildProcess = spawn(
    path.join(dir, 'node_modules', '.bin', 'next'),
    ['dev', '--turbo', '-p', String(PARENT_PORT)],
    { cwd: dir, env, detached: true, stdio: 'ignore' }
  );
  const kill = () => {
    try {
      if (child.pid) process.kill(-child.pid, 'SIGTERM');
    } catch {
      // already gone
    }
  };
  process.on('exit', kill);
  const url = `http://localhost:${PARENT_PORT}`;
  let up = false;
  for (let i = 0; i < 240 && !up; i++) {
    up = await realFetch(`${url}/privacy`)
      .then((r) => r.status === 200)
      .catch(() => false);
    if (!up) await sleep(500);
  }
  const stop = async () => {
    kill();
    await sleep(1500);
    try {
      if (child.pid) process.kill(-child.pid, 'SIGKILL');
    } catch {
      // stopped
    }
    for (let i = 0; i < 5; i++) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
        break;
      } catch {
        await sleep(1000);
      }
    }
  };
  if (!up) {
    await stop();
    throw new Error("the parent's server did not answer");
  }
  return { url, stop, note: 'started' };
}

async function main() {
  layerS();

  section('L, G, W, K — the pages in two walled-off headless Chromes, every read answered here');
  const GUEST_CARDS = GUEST_ROWS.length + CHILD_ROWS.length;
  const log: Logged[] = [];
  let head: Headless | null = null;
  let par: Headless | null = null;
  let headAns: Awaited<ReturnType<typeof openAnswerer>> | null = null;
  let parAns: Awaited<ReturnType<typeof openAnswerer>> | null = null;
  let parent: Awaited<ReturnType<typeof startParent>> | null = null;
  const guest: Record<
    number,
    { open: Facts | null; closed: Toggled | null; again: Toggled | null }
  > = {};
  const pages: Record<string, Record<string, Facts | null>> = {};
  const words: Record<string, { head: string[]; parent: string[] }> = {};
  try {
    parent = await startParent();
    head = await openHeadless({ fetchImpl: realFetch, port: PORT, base: BASE_URL });
    headAns = await openAnswerer(PORT, 'head', log);
    par = await openHeadless({ fetchImpl: realFetch, port: PARENT_CHROME_PORT, base: parent.url });
    parAns = await openAnswerer(PARENT_CHROME_PORT, 'parent', log);

    // ── L: the guest page at four widths (HEAD) ──
    for (const width of [320, 375, 768, 1280]) {
      await head.setViewport(width, 900, width < 768);
      const ok = await load(head, LINKS.guest, GUEST_CARDS);
      const open = ok ? await head.evaluate<Facts>(MEASURE) : null;
      await head.evaluate(clickWords('Collapse All'));
      await sleep(500);
      const closed = await head.evaluate<Toggled>(TOGGLED);
      await head.evaluate(clickWords('Expand All'));
      await sleep(500);
      const again = await head.evaluate<Toggled>(TOGGLED);
      guest[width] = { open, closed, again };
    }

    // ── G: the host page, its team page, the coordinator page (HEAD and parent) ──
    const MIN: Record<string, number> = { host: 4, team: 6, coordinator: 6 };
    for (const [pg, link] of Object.entries(LINKS).filter(([k]) => k !== 'guest')) {
      for (const width of [375, 1280]) {
        for (const [who, c] of [
          ['head', head],
          ['parent', par],
        ] as const) {
          await c.setViewport(width, 900, width < 768);
          const ok = await load(c, link, MIN[pg]);
          if (who === 'head' && width === 1280)
            pages[`${pg}-grid-closed`] = ok ? await c.evaluate<Facts>(MEASURE) : null;
          await c.evaluate(clickWords('Expand All'));
          await sleep(500);
          pages[`${pg}-${width}-grid-${who}`] = ok ? await c.evaluate<Facts>(MEASURE) : null;
          await c.evaluate(LIST_VIEW);
          await sleep(500);
          pages[`${pg}-${width}-list-${who}`] = ok ? await c.evaluate<Facts>(MEASURE) : null;
        }
      }
    }

    // ── W: the visible words, as loaded and after the all-cards toggle, at 1280 (HEAD and parent) ──
    for (const [pg, link] of Object.entries(LINKS)) {
      words[pg] = { head: [], parent: [] };
      for (const [who, c] of [
        ['head', head],
        ['parent', par],
      ] as const) {
        await c.setViewport(1280, 900, false);
        const ok = await load(c, link, pg === 'guest' ? GUEST_CARDS : MIN[pg]);
        if (!ok) continue;
        words[pg][who].push(await c.evaluate<string>(WORDS));
        await c.evaluate(clickWords(pg === 'guest' ? 'Collapse All' : 'Expand All'));
        await sleep(500);
        words[pg][who].push(await c.evaluate<string>(WORDS));
        await c.evaluate(LIST_VIEW);
        await sleep(400);
        words[pg][who].push(await c.evaluate<string>(WORDS));
      }
    }
  } catch (e) {
    console.error('    the browsers threw:', (e as Error).message.split('\n')[0]);
  }

  // ── L ──
  const widths = [320, 375, 768, 1280];
  const per = (f: (w: number) => boolean) => widths.filter((w) => !f(w));
  const l1 = per((w) => CHECKS.oneCardPerRow(guest[w]?.open ?? null, GUEST_CARDS));
  assert(
    'L',
    'L1 the guest page at 320, 375, 768 and 1280: one dish card per row, no two cards side by side (ruling 2)',
    l1.length === 0,
    `red at ${l1.join(', ')}`
  );
  const l2 = per((w) => CHECKS.namesWrapCleanly(guest[w]?.open ?? null, GUEST_CARDS));
  assert(
    'L',
    'L2 the guest page at every width: each dish name’s box is at least half its card wide, and no name of two words or more is broken one word per line (but a word wider than the whole box, which must break) (ruling 3)',
    l2.length === 0,
    `red at ${l2.join(', ')}`
  );
  const l3 = per((w) => CHECKS.arrowClear(guest[w]?.open ?? null, GUEST_CARDS, w));
  assert(
    'L',
    'L3 the guest page at every width: the arrow’s box is never over a name’s text, every name’s text is inside its card, and the page is no wider than the screen (ruling 3)',
    l3.length === 0,
    `red at ${l3.join(', ')}`
  );
  const l4 = per((w) => CHECKS.answersVisible(guest[w]?.open ?? null, PENDING_CARDS));
  assert(
    'L',
    'L4 the guest page at every width: Yes, No and Maybe on each unanswered card, each inside the card and drawn whole, together across the card (ruling 3)',
    l4.length === 0,
    `red at ${l4.join(', ')}`
  );
  const l5 = per((w) =>
    CHECKS.toggles(guest[w]?.closed ?? null, guest[w]?.again ?? null, GUEST_CARDS, PENDING_CARDS)
  );
  assert(
    'L',
    'L5 the guest page at every width: "Collapse All" closes every card (hers and the child’s) and "Expand All" opens them all again (ruling 3)',
    l5.length === 0,
    `red at ${l5.join(', ')}`
  );

  // ── G ──
  const names: Record<string, string> = {
    host: 'the host page',
    team: 'the host’s team page',
    coordinator: 'the coordinator page',
  };
  (['host', 'team', 'coordinator'] as const).forEach((pg, i) =>
    assert(
      'G',
      `G${i + 1} ${names[pg]} in Grid view at 1280, cards closed and open: never more than two across, and two side by side (ruling 2)`,
      CHECKS.twoAcross(pages[`${pg}-grid-closed`] ?? null) &&
        CHECKS.twoAcross(pages[`${pg}-1280-grid-head`] ?? null),
      JSON.stringify({
        closed: pages[`${pg}-grid-closed`]?.cards.length,
        open: pages[`${pg}-1280-grid-head`]?.cards.length,
      })
    )
  );
  const g4 = (['host', 'team', 'coordinator'] as const).flatMap((pg) =>
    [375, 1280]
      .filter(
        (w) =>
          !CHECKS.listAsParent(
            pages[`${pg}-${w}-list-head`] ?? null,
            pages[`${pg}-${w}-list-parent`] ?? null
          )
      )
      .map((w) => `${pg} ${w}`)
  );
  assert(
    'G',
    'G4 List view on all three pages at 375 and 1280: one card per row, each card’s left edge and width as the parent (b05cac3) draws them (ruling 2)',
    g4.length === 0,
    `red: ${g4.join(', ')}`
  );
  const g5 = (['host', 'team', 'coordinator'] as const).flatMap((pg) =>
    [375, 1280].flatMap((w) =>
      ['grid', 'list']
        .filter((v) => !CHECKS.noArrowOverName(pages[`${pg}-${w}-${v}-head`] ?? null))
        .map((v) => `${pg} ${w} ${v}`)
    )
  );
  assert(
    'G',
    `G5 all three pages at 375 and 1280, Grid and List, cards open: no arrow over a name’s text, each name inside its card (the host page’s "${LONG_TEAM}" and the team page’s "${LONG_DISH}" included)`,
    g5.length === 0,
    `red: ${g5.join(', ')}`
  );

  // ── W ──
  (['guest', 'host', 'team', 'coordinator'] as const).forEach((pg, i) => {
    const w = words[pg];
    const first = w ? w.head.findIndex((h, j) => h !== w.parent[j]) : -1;
    assert(
      'W',
      `W${i + 1} ${pg === 'guest' ? 'the guest page' : names[pg]}: the visible words, as loaded, after the all-cards toggle and in List view, are the parent’s (b05cac3, served from a scratch folder outside the repo) word for word (ruling 4)`,
      CHECKS.sameWords(w?.head ?? null, w?.parent ?? null),
      w
        ? `${w.head.length}/${w.parent.length} captures; first difference at ${first}`
        : 'no capture'
    );
  });

  // ── K ──
  const allowed = [new URL(BASE_URL).origin, parent ? new URL(parent.url).origin : 'none'];
  assert(
    'K',
    'K1 CONTROL: every request the pages made to /api was one of the four reads and was answered here with the made-up data, on both servers; none went through',
    CHECKS.allAnswered(log, ['head', 'parent']),
    JSON.stringify(log.filter((x) => !x.answered).slice(0, 5))
  );
  const urls = [...(headAns?.urls() ?? []), ...(parAns?.urls() ?? [])];
  const hosts = [...(head?.hostsRequested() ?? []), ...(par?.hostsRequested() ?? [])];
  assert(
    'K',
    'K2 CONTROL: both browsers asked only for the two local servers (and data: or blob: addresses); no other host',
    CHECKS.walled(urls, hosts, allowed),
    JSON.stringify({
      outside: urls
        .filter((u) => !/^(data|blob):/.test(u) && !allowed.some((a) => u.startsWith(a + '/')))
        .slice(0, 5),
      hosts,
    })
  );
  headAns?.close();
  parAns?.close();
  head?.close();
  par?.close();
  await parent?.stop();
  await sleep(500);

  layerU();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (reds.length) console.log(reds.map((r) => `  - ${r}`).join('\n'));
}

// ══ U — CONTROL ══════════════════════════════════════════════════════════════
function layerU() {
  section('U — CONTROL: what this ticket must not touch');
  const changed = git([
    'diff',
    '--name-only',
    BASE,
    '--',
    'src',
    'prisma',
    ...[...NOT_TOUCHED_TILL_GTC411, ...NEW_IN_GTC411].map((f) => `:(exclude)${f}`),
  ]).stdout;
  const untracked = git([
    'ls-files',
    '--others',
    '--exclude-standard',
    '--',
    'src',
    'prisma',
  ]).stdout;
  assert(
    'U',
    'U1 the only files under src or prisma that differ from GTC-408’s tip (b05cac3) are the four pages, and nothing new is waiting there; and the three files GTC-411 edits, not between the base and GTC-411’s base (7597112), and the rule’s file it adds, not there',
    CHECKS.onlyThePages(changed, untracked) &&
      NOT_TOUCHED_TILL_GTC411.every(
        (f) => git(['cat-file', '-e', `${GTC411_BASE}:${f}`]).status === 0
      ) &&
      NEW_IN_GTC411.every((f) => git(['cat-file', '-e', `${GTC411_BASE}:${f}`]).status !== 0) &&
      git([
        'diff',
        '--quiet',
        BASE,
        GTC411_BASE,
        '--',
        ...NOT_TOUCHED_TILL_GTC411,
        ...NEW_IN_GTC411,
      ]).status === 0,
    `${changed.trim()} | ${untracked.trim()}`
  );
  assert(
    'U',
    'U2 package-lock.json is as at the base',
    read('package-lock.json').length > 1000 &&
      git(['diff', '--quiet', BASE, '--', 'package-lock.json']).status === 0
  );
  // GTC-397's lesson: package.json is read at a fixed commit (the one that added this suite), never
  // as it is now, so a later ticket's script line cannot turn this red.
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

// A dry run imports CHECKS only (DEMO_TWEAKS_11_DRY_RUN=1); the suite runs otherwise.
if (process.env.DEMO_TWEAKS_11_DRY_RUN !== '1') {
  main()
    .catch((e) => {
      console.error(e);
      failed++;
    })
    .finally(() => {
      process.exit(failed > 0 ? 1 : 0);
    });
}
