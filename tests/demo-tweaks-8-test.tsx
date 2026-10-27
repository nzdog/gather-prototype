/**
 * [[GTC-406]] — MOMENT 3'S DISH DETAILS AND "CRITICAL" (THE LIGHT PATH): ticket 4 of the four from
 * the planning report ("NOTES 2 AND 3: MOMENT 3'S DISH DETAIL AND CRITICAL"), with the founder's
 * rulings of 26 Oct 2026. Screens and words only.
 *
 * THE RULINGS THIS SUITE PINS
 *   1  A small "Details" button at the right of each Moment 3 row, read aloud "Details for <dish>".
 *      The row's own tap, the "x" and the ticks work as they did; Tab reaches it, the arrows still
 *      move from row to row; it never counts as "pressed".
 *   2  The box changes Critical and the dish's drop-off place and time, nothing else. The name and
 *      the amount are shown; who has it is shown, not changed.
 *   3  A small amber "critical" tag on Moment 2's and Moment 3's critical rows, the pre-flight's
 *      look. Not on the guest's page (not edited).
 *   4  "This needs an amount before you move on." only for a critical dish whose amount is still a
 *      placeholder. The hold rule is kept as it is.
 *   5  The words: "Details", the dish's name as the heading, "Amount", "Who's bringing it",
 *      "Nobody yet", "Critical: we can't do without it", "Drop-off place" ("e.g. the back door"),
 *      "Drop-off time" ("e.g. 11am"), "Save", "Close", the tag "critical". After the send, a
 *      holder's answer already on the screen, in the board's words ("said yes").
 *   6  It saves through the setup page's existing item save (the item PATCH and its "why"), only
 *      what changed (critical, dropOffLocation, dropOffNote); an emptied box sends null. Moment 3's
 *      view calls no new address.
 *   7  A job: its name, who has it and the tick; no Amount and no drop-off boxes.
 *   8  Jobs and dishes both show the tag when critical.
 *
 * THE LAYERS
 *   S  the source: the words; Moment 3 calls no new address; the setup page's one save carries
 *      critical; the box changes only three fields, empty as null; the guest page not edited.
 *   R  rendered: the Details button last in every Moment 3 row; the tag on critical rows only, on
 *      Moment 3 and Moment 2; the box for a dish, a job, nobody, an answer; the ruling-4 sentence.
 *   C  the dev server in the walled-off headless Chrome (port 9488), at 1280 and at 375, on a
 *      fixture of its own: the rows, the box (open, close, Escape, focus back, a picked person
 *      kept), the saves and what they sent, the arrows, the layout at 375, the answer after the
 *      send, and Moment 2's tags. Behind the plan-making and send walls, proven on probe URLs
 *      first; every click guarded. A script in each page records the page's own requests.
 *   K  CONTROL: nothing blocked but the probes, no dialog, no click refused; the setup page wrote
 *      only the two saves; no AI call, nothing queued, every fixture row removed by id, the invite
 *      and outbound totals as found.
 *   U  CONTROL: routes, schema, src/lib (but its one new-words file, which only grew), the guest
 *      page, the new-event page, the strip and the lockfile not edited since the base;
 *      package.json (at the commit that added this suite) differs by its one script line; the two
 *      untracked scripts are in no commit.
 *
 * Every live condition lives in CHECKS, so it can be dry-run on a passing and a failing input
 * (DEMO_TWEAKS_8_DRY_RUN=1 imports CHECKS only). Every fixture and expected value is written here by
 * hand, never taken from the code under test.
 *
 * Needs the dev server on :3000 (GTC406_BASE_URL points it elsewhere, for the break proofs) and a
 * global WebSocket (NODE_OPTIONS=--experimental-websocket).
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { randomBytes } from 'crypto';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { prisma } from '../src/lib/prisma';
import { ToastProvider } from '../src/contexts/ToastContext';
import Moment3AssignView from '../src/components/plan/Moment3AssignView';
import Moment2PlanView from '../src/components/plan/Moment2PlanView';
import * as DETAIL from '../src/components/plan/Moment3ItemDetail';
import * as WORDS from '../src/lib/moment3/words';
import { installProviderTrap } from './helpers/provider-trap';
import { openHeadless, type Headless } from './helpers/headless';

const realFetch = globalThis.fetch;
installProviderTrap();

const ROOT = path.join(__dirname, '..');
const BASE_URL = process.env.GTC406_BASE_URL ?? 'http://localhost:3000';
const PORT = 9488;
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
/** Code only: block and line comments stripped (a URL's `://` is kept). */
const stripComments = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
const git = (args: string[]) => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
const atRef = (ref: string, rel: string) => {
  const r = git(['show', `${ref}:${rel}`]);
  return r.status === 0 ? r.stdout : '';
};
const between = (src: string, from: string, to: string) => {
  const a = src.indexOf(from);
  const b = a >= 0 ? src.indexOf(to, a + from.length) : -1;
  return a >= 0 && b > a ? src.slice(a, b) : '';
};
const count = (s: string, needle: string) => s.split(needle).length - 1;
/** A block's lines with their shared indent taken off (the first line starts at its marker). */
const dedent = (s: string) => {
  const lines = s.split('\n');
  const rest = lines.slice(1).filter((l) => l.trim().length > 0);
  const n = rest.length ? Math.min(...rest.map((l) => l.length - l.trimStart().length)) : 0;
  return [lines[0], ...lines.slice(1).map((l) => l.slice(n))].join('\n');
};

// ── The ruled words, typed by hand ───────────────────────────────────────────
const DETAILS = 'Details';
const DETAILS_FOR = (name: string) => `Details for ${name}`;
const AMOUNT = 'Amount';
const WHO = "Who's bringing it";
const NOBODY = 'Nobody yet';
const TICK = "Critical: we can't do without it";
const PLACE = 'Drop-off place';
const PLACE_HINT = 'e.g. the back door';
const TIME = 'Drop-off time';
const TIME_HINT = 'e.g. 11am';
const SAVE = 'Save';
const CLOSE = 'Close';
const TAG = 'critical';
const NEEDS_AMOUNT = 'This needs an amount before you move on.';
/** The board's own words for an answer (W28), beside a holder's name. */
const SAID_YES = 'said yes';
const NOT_ANSWERED = 'hasn’t answered';
/** The pre-flight's amber tag, as it draws it (its colours, size and case). */
const AMBER = [
  'text-[11px]',
  'uppercase',
  'tracking-wide',
  'text-amber-700',
  'bg-amber-50',
  'border',
  'border-amber-200',
  'rounded',
  'px-1.5',
];
/** DropOffDisplay's own word before a dish's own place. */
const OWN_PLACE = 'Drop-off:';
const SENTENCE = "Now. Who's on what.";
const LONG = 'Slow-roasted lamb shoulder with rosemary, garlic and lemon';

// ── Files and commits ────────────────────────────────────────────────────────
const SUITE = 'tests/demo-tweaks-8-test.tsx';
const M3_VIEW = 'src/components/plan/Moment3AssignView.tsx';
const BOX = 'src/components/plan/Moment3ItemDetail.tsx';
const SETUP = 'src/app/plan/[eventId]/setup/page.tsx';
const WORDS_FILE = 'src/lib/moment3/words.ts';
const GUEST = 'src/app/p';
/** GTC-405's last commit (its ticket), where this ticket started: a fixed commit. */
const BASE = '347fb109403f43c767e64fdf29efa0c861808bb9';
const NEW_SCRIPT = 'test:demo-tweaks-8';
const NEW_SCRIPT_VALUE =
  'NODE_OPTIONS=--experimental-websocket tsx --tsconfig tests/tsconfig.json tests/demo-tweaks-8-test.tsx';
const UNTRACKED_SCRIPTS = ['scripts/dev-login.ts', 'scripts/print-host-link.ts'];
/** The founder's untouched list for this ticket, read as it is now against the base. */
const NOT_TOUCHED = [
  'src/app/api',
  'prisma',
  'src/lib',
  'src/app/p',
  'src/app/plan/new', // but page.tsx (GTC-407; see NOT_TOUCHED_TILL_GTC407)
  'src/components/plan/MomentArc.tsx',
  'package-lock.json',
];
/** The one src/lib file this ticket may change (its new words): kept out of U1, asked in U4. */
const NOT_TOUCHED_EXCEPT = [`:(exclude)${WORDS_FILE}`];
/**
 * [[GTC-407]] edits the paying page on purpose (after payment: the 409 screen, "Try Again" with
 * the same receipt, the support address), so U1 asks its question of it at GTC-407's base
 * (1b8bfe7), a fixed commit: this ticket still may not have touched it. GTC-407's own suite
 * (test:demo-tweaks-9) pins its new state. It is kept out of the live diff of src/app/plan/new,
 * which stays listed and still covers anything else that appears there.
 */
const GTC407_BASE = '1b8bfe7b8a9b7540ef582fff9be031b37e325b8c';
const NOT_TOUCHED_TILL_GTC407 = ['src/app/plan/new/page.tsx'];
/**
 * [[GTC-409]] restyles the guest page on purpose (class names only: one dish card per row, the
 * name and the arrow each in their own space), so S5 and U1 ask their question of it at GTC-409's
 * base (b05cac3), a fixed commit: this ticket still may not have touched it. It is kept out of the
 * live diff of src/app/p, which stays listed and still covers anything else that appears there.
 * GTC-409's own suite (test:demo-tweaks-11) pins its new state.
 */
const GTC409_BASE = 'b05cac341e28ca1a3bdea5966f71015553cb98a4';
const NOT_TOUCHED_TILL_GTC409 = ['src/app/p/[token]/page.tsx'];
/**
 * [[GTC-411]] edits three files on purpose (signing in and paying for an event now find or make a
 * User through one shared rule that ignores capitals and outer spaces) and adds the rule's own
 * file, so U1 asks its question of the three at GTC-411's base (7597112), a fixed commit: this
 * ticket still may not have touched them; and the new file must not be there yet. All four are
 * kept out of U1's live diff, which still covers every other route and everything else in
 * src/lib. test:email-case, test:gtc280 and the security suite (suite 20) pin their new state.
 */
const GTC411_BASE = '759711288b981fe78941a11fb9bd177743a1db6f';
const NOT_TOUCHED_TILL_GTC411 = [
  'src/app/api/auth/verify/route.ts',
  'src/app/api/events/route.ts',
  'src/lib/events/payment-identity.ts',
];
const NEW_IN_GTC411 = ['src/lib/accounts/user-by-email.ts'];

// ── Shapes read in the browser ───────────────────────────────────────────────
export interface RowFacts {
  name: string | null;
  /** The last thing in the row is a button reading "Details". */
  lastIsDetails: boolean;
  label: string | null;
  /** Its aria-pressed attribute, or null when it has none. */
  pressedAttr: string | null;
  /** It carries the row marker the arrows move between. */
  isRow: boolean;
  tabbable: boolean;
  /** Elements in the row's own button whose text is the tag's word. */
  tags: number;
  /** That one tag has the amber look and shows in capitals. */
  amber: boolean;
  /** The row's own drop-off place, as DropOffDisplay draws it, or null. */
  place: string | null;
}
export interface BoxFacts {
  heading: string | null;
  /** The heading names the box (aria-labelledby). */
  named: boolean;
  pairs: Array<[string, string | null]>;
  tick: boolean | null;
  tickLabel: string | null;
  boxes: Array<{ label: string | null; value: string; hint: string | null }>;
  buttons: Array<{ text: string; disabled: boolean }>;
  text: string;
}
export interface Sent {
  m: string;
  u: string;
  b: string | null;
}
export interface Fit {
  name: string;
  /** The Details button lies inside its row and inside 375. */
  detailsIn: boolean;
  /** The row's text box has nothing cut off sideways. */
  textFits: boolean;
  /** The amount, when the row has one, sits on one line. */
  amountLines: number | null;
  amount: string | null;
}

// ── CHECKS ───────────────────────────────────────────────────────────────────
const sameList = (a: unknown[], b: unknown[]) => JSON.stringify(a) === JSON.stringify(b);
const box = (b: BoxFacts | null) => b ?? ({} as BoxFacts);
const pair = (b: BoxFacts | null, k: string) => (box(b).pairs ?? []).find((p) => p[0] === k)?.[1];
const buttonsOf = (b: BoxFacts | null) => (box(b).buttons ?? []).map((x) => x.text);

export const CHECKS = {
  // ── Source ──
  /** S1 — the words, as ruled. */
  words(w: Record<string, string>, label: (n: string) => string) {
    return (
      w.DETAILS === DETAILS &&
      w.AMOUNT === AMOUNT &&
      w.WHO === WHO &&
      w.NOBODY_YET === NOBODY &&
      w.CRITICAL === TICK &&
      w.DROP_OFF_PLACE === PLACE &&
      w.DROP_OFF_PLACE_HINT === PLACE_HINT &&
      w.DROP_OFF_TIME === TIME &&
      w.DROP_OFF_TIME_HINT === TIME_HINT &&
      w.SAVE === SAVE &&
      w.CLOSE === CLOSE &&
      w.ROW_TAG === TAG &&
      w.NEEDS_AMOUNT === NEEDS_AMOUNT &&
      label('Pavlova') === DETAILS_FOR('Pavlova')
    );
  },
  /** S2 — Moment 3 calls the addresses it called at the base and no other; the box calls none. */
  noNewAddress(view: string, viewBase: string, boxCode: string) {
    const fetches = (s: string) => s.match(/fetch\(\s*`[^`]*`/g) ?? [];
    return (
      fetches(viewBase).length >= 3 &&
      sameList(fetches(view), fetches(viewBase)) &&
      boxCode.length > 500 &&
      !/fetch\(/.test(boxCode) &&
      !/\/api\//.test(boxCode)
    );
  },
  /** S3 — the setup page's one item save carries critical; Moment 2 and Moment 3 both use it; its request as at the base. */
  oneSave(now: string, base: string) {
    const patch = (src: string) =>
      between(src, 'const res = await fetch(`/api/events/${eventId}/items/${itemId}`, {', '});');
    const save = between(now, 'const saveItemEdit = async (', 'return true;');
    const onUpdate = between(now, 'onUpdateItem={async (itemId, updates) => {', 'onRemoveItem=');
    const m3 = between(now, '<Moment3AssignView', '/>');
    return (
      patch(base).length > 50 &&
      dedent(patch(now)) === dedent(patch(base)) &&
      count(now, "method: 'PATCH'") === count(base, "method: 'PATCH'") &&
      save.includes(patch(now)) &&
      /if \(updates\.critical !== undefined\) body\.critical = updates\.critical;/.test(save) &&
      /body\.dropOffLocation\s*=\s*updates\.dropOffLocation;/.test(save) &&
      /body\.dropOffNote\s*=\s*updates\.dropOffNote;/.test(save) &&
      /askForBatchReason\(\s*fieldChanges\(/.test(save) &&
      /saveItemEdit\(itemId, updates\)/.test(onUpdate) &&
      !/body\./.test(onUpdate) &&
      /onSaveItemDetail=\{saveItemEdit\}/.test(m3)
    );
  },
  /** S4 — the box changes three fields only, each when changed, an emptied box as null. */
  threeFields(boxCode: string) {
    const shape = between(boxCode, 'export interface Moment3ItemDetailChanges {', '}');
    const fields = shape
      .split('\n')
      .slice(1)
      .map((l) => l.trim())
      .filter(Boolean);
    // The object's body only (its type's own name holds "Detail").
    const changes = between(boxCode, 'const changes: Moment3ItemDetailChanges = {', '};').slice(
      'const changes: Moment3ItemDetailChanges = {'.length
    );
    return (
      sameList(fields, [
        'critical?: boolean;',
        'dropOffLocation?: string | null;',
        'dropOffNote?: string | null;',
      ]) &&
      /const place = dropOffPlace\.trim\(\) \|\| null;/.test(boxCode) &&
      /const time = dropOffTime\.trim\(\) \|\| null;/.test(boxCode) &&
      /\{ critical \}/.test(changes) &&
      /\{ dropOffLocation: place \}/.test(changes) &&
      /\{ dropOffNote: time \}/.test(changes) &&
      changes.length > 50 &&
      !/name|quantity|detail|amount|assign|holder/i.test(changes) &&
      !/dropOffAt/.test(boxCode)
    );
  },

  // ── Rendered ──
  /** R1 — every Moment 3 row ends in its Details button: the word, its spoken name, no "pressed", not a row, no tabindex. */
  detailsLast(html: string, names: string[]) {
    const rows = html.match(/<li [^>]*data-m3-item="[^"]*"[\s\S]*?<\/li>/g) ?? [];
    return (
      rows.length === names.length &&
      rows.every((li, i) => {
        const last = li.slice(li.lastIndexOf('<button'));
        const open = last.slice(0, last.indexOf('>') + 1);
        return (
          last.endsWith(`>${DETAILS}</button></li>`) &&
          open.includes(`aria-label="${DETAILS_FOR(names[i])}"`) &&
          !/aria-pressed|data-m3-row|tabindex|disabled/i.test(open) &&
          count(li, `>${DETAILS}</button>`) === 1
        );
      })
    );
  },
  /** R2/R3 — the amber tag on the named rows only: once each, the pre-flight's look, inside the row. */
  tagsOn(rowsHtml: Record<string, string>, critical: string[]) {
    const names = Object.keys(rowsHtml);
    return (
      names.length >= 3 &&
      critical.length >= 1 &&
      names.every((n) => {
        const h = rowsHtml[n] ?? '';
        const tags = h.match(/<span [^>]*class="([^"]*)"[^>]*>critical<\/span>/g) ?? [];
        if (!critical.includes(n)) return h.length > 0 && tags.length === 0;
        const cls = (tags[0] ?? '').match(/class="([^"]*)"/)?.[1].split(/\s+/) ?? [];
        return tags.length === 1 && AMBER.every((c) => cls.includes(c));
      })
    );
  },
  /** R4 — a dish's box: its name, the amount, who has it, the tick, the two boxes with their hints, Close and Save. */
  dishBox(
    b: BoxFacts | null,
    name: string,
    amount: string,
    who: string,
    ticked: boolean,
    place: string,
    time: string
  ) {
    return (
      !!b &&
      b.heading === name &&
      b.named &&
      pair(b, AMOUNT) === amount &&
      pair(b, WHO) === who &&
      (b.pairs ?? []).length === 2 &&
      b.tick === ticked &&
      b.tickLabel === TICK &&
      sameList(b.boxes ?? [], [
        { label: PLACE, value: place, hint: PLACE_HINT },
        { label: TIME, value: time, hint: TIME_HINT },
      ]) &&
      sameList(buttonsOf(b), [CLOSE, SAVE])
    );
  },
  /** R5 — a job's box: its name, who has it and the tick; no Amount, no drop-off boxes. */
  jobBox(b: BoxFacts | null, name: string, who: string, ticked: boolean) {
    return (
      !!b &&
      b.heading === name &&
      (b.pairs ?? []).length === 1 &&
      pair(b, WHO) === who &&
      pair(b, AMOUNT) === undefined &&
      b.tick === ticked &&
      b.tickLabel === TICK &&
      (b.boxes ?? []).length === 0 &&
      !b.text.includes(PLACE) &&
      !b.text.includes(TIME) &&
      sameList(buttonsOf(b), [CLOSE, SAVE])
    );
  },
  /** R7 — the ruling-4 sentence, said exactly when it should be. */
  needsAmount(said: boolean, b: BoxFacts | null) {
    const n = count(box(b).text ?? '', NEEDS_AMOUNT);
    return !!b && (said ? n === 1 : n === 0);
  },
  /** R8 — Save does nothing until something changed. */
  saveIdle(b: BoxFacts | null) {
    const s = (box(b).buttons ?? []).find((x) => x.text === SAVE);
    const c = (box(b).buttons ?? []).find((x) => x.text === CLOSE);
    return !!s && s.disabled === true && !!c && c.disabled === false;
  },

  // ── Live ──
  /** C1 — every row: Details last, its spoken name, never pressed, not a row, reached by Tab; the tag on the critical ones only, amber, in capitals. */
  rowsLive(rows: RowFacts[] | null, names: string[], critical: string[]) {
    return (
      !!rows &&
      sameList(
        rows.map((r) => r.name),
        names
      ) &&
      rows.every(
        (r) =>
          r.lastIsDetails &&
          r.label === DETAILS_FOR(r.name ?? '') &&
          r.pressedAttr === null &&
          !r.isRow &&
          r.tabbable &&
          (critical.includes(r.name ?? '') ? r.tags === 1 && r.amber : r.tags === 0)
      )
    );
  },
  /** C2 — Details opens the box and picks nothing; Close shuts it, focus back on that button; the row's own tap still picks the row. */
  detailsPicksNothing(s: {
    openedFor: string | null;
    pressedWhileOpen: number;
    closed: boolean;
    focus: string | null;
    pressedAfter: number;
    rowTapPressed: boolean;
  }) {
    return (
      s.openedFor === 'Bread rolls' &&
      s.pressedWhileOpen === 0 &&
      s.closed &&
      s.focus === DETAILS_FOR('Bread rolls') &&
      s.pressedAfter === 0 &&
      s.rowTapPressed
    );
  },
  /** C4/C5 — exactly one PATCH to the dish's own route, its body exactly `expected` and a null reason. */
  sentOnly(sent: Sent[], url: string, expected: Record<string, unknown>) {
    if (sent.length !== 1 || sent[0].m !== 'PATCH' || !sent[0].u.endsWith(url)) return false;
    try {
      const body = JSON.parse(sent[0].b ?? '');
      const keys = Object.keys(body).sort();
      return (
        sameList(keys, [...Object.keys(expected), 'reason'].sort()) &&
        Object.entries(expected).every(([k, v]) => body[k] === v) &&
        body.reason === null
      );
    } catch {
      return false;
    }
  },
  /** C4/C5 — what is stored. */
  storedAs(
    s: { critical: boolean; dropOffLocation: string | null; dropOffNote: string | null } | null,
    critical: boolean,
    place: string | null,
    time: string | null
  ) {
    return !!s && s.critical === critical && s.dropOffLocation === place && s.dropOffNote === time;
  },
  /** C8 — Escape (and Close) shut the box, focus back on its Details, the picked person still picked, nothing given. */
  escapeKeeps(s: {
    pickedBefore: boolean;
    opened: boolean;
    closed: boolean;
    focus: string | null;
    pickedAfter: boolean;
    assignCalls: number;
    label: string;
  }) {
    return (
      s.pickedBefore &&
      s.opened &&
      s.closed &&
      s.focus === DETAILS_FOR(s.label) &&
      s.pickedAfter &&
      s.assignCalls === 0
    );
  },
  /** C9 — the arrows: from a row, and from its Details, they move to the next and the previous row. */
  arrows(a: Record<string, string | null>, expected: Record<string, string>) {
    return (
      Object.keys(expected).length >= 3 &&
      Object.entries(expected).every(([k, v]) => a[k] === v) &&
      sameList(Object.keys(a).sort(), Object.keys(expected).sort())
    );
  },
  /** C10 — at 375: every Details inside its row and the screen; no name cut; "2 trays" on one line; no sideways scroll; no row taller for its Details. */
  fitsAt375(
    fits: Fit[] | null,
    names: string[],
    pageWidth: number,
    detailsTallest: number,
    line: number
  ) {
    return (
      !!fits &&
      sameList(
        fits.map((f) => f.name),
        names
      ) &&
      fits.every(
        (f) => f.detailsIn && f.textFits && (f.amount === '2 trays' ? f.amountLines === 1 : true)
      ) &&
      fits.filter((f) => f.amount === '2 trays').length >= 3 &&
      pageWidth <= 375 &&
      detailsTallest > 0 &&
      detailsTallest <= line
    );
  },
  /** C12 — Moment 2's rows: the tag on the critical ones only. */
  moment2Tags(rows: Record<string, number> | null, critical: string[]) {
    return (
      !!rows &&
      Object.keys(rows).length >= 5 &&
      Object.entries(rows).every(([n, tags]) => tags === (critical.includes(n) ? 1 : 0))
    );
  },

  // ── CONTROL ──
  /** U2 — package.json differs from the base by this suite's one script line, nothing else. */
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
  /** U4 — the words file only grew: every line it had at the base is still there, first and in order. */
  onlyGrew(now: string, base: string) {
    return base.length > 1000 && now.length > base.length && now.startsWith(base);
  },
};
// ── CHECKS-END ───────────────────────────────────────────────────────────────

// ══ S — the source ═══════════════════════════════════════════════════════════
function layerS() {
  section('S — the source: the words, no new address, the one save, three fields, the guest page');
  assert(
    'S',
    'S1 the box’s words and the tag, as ruled: "Details" ("Details for <dish>"), "Amount", "Who\'s bringing it", "Nobody yet", "Critical: we can\'t do without it", "Drop-off place" / "e.g. the back door", "Drop-off time" / "e.g. 11am", "Save", "Close", "critical", and ruling 4’s sentence (ruling 5)',
    CHECKS.words(
      ((WORDS as any).M3_DETAIL_WORDS ?? {}) as Record<string, string>,
      typeof (WORDS as any).detailsLabel === 'function' ? (WORDS as any).detailsLabel : () => ''
    )
  );
  const view = stripComments(read(M3_VIEW));
  const viewBase = stripComments(atRef(BASE, M3_VIEW));
  const boxCode = stripComments(read(BOX));
  assert(
    'S',
    'S2 Moment 3’s view calls the addresses it called at the base (c… GTC-405’s ticket) and no other; the box calls none (ruling 6)',
    CHECKS.noNewAddress(view, viewBase, boxCode)
  );
  assert(
    'S',
    'S3 the setup page saves an edit one way: its one item save sends critical only when given, beside the drop-off and the rest, through the "why" and the same PATCH (its request as at the base, moved as a block); Moment 2’s edit box and Moment 3’s box both hand their save to it (ruling 6)',
    CHECKS.oneSave(stripComments(read(SETUP)), stripComments(atRef(BASE, SETUP)))
  );
  assert(
    'S',
    'S4 the box changes three fields and nothing else (critical, dropOffLocation, dropOffNote), each only when changed; an emptied box is null; no dropOffAt (rulings 2 and 6)',
    CHECKS.threeFields(boxCode)
  );
  assert(
    'S',
    'S5 the guest page is not edited since the base (ruling 3: GTC-405 took the badge off; this ticket leaves it); its page.tsx, which GTC-409 restyles, not between the base and GTC-409’s base (b05cac3)',
    fs.existsSync(path.join(ROOT, GUEST)) &&
      git([
        'diff',
        '--quiet',
        BASE,
        '--',
        GUEST,
        ...NOT_TOUCHED_TILL_GTC409.map((f) => `:(exclude)${f}`),
      ]).status === 0 &&
      git(['cat-file', '-e', `${GTC409_BASE}:${NOT_TOUCHED_TILL_GTC409[0]}`]).status === 0 &&
      git(['diff', '--quiet', BASE, GTC409_BASE, '--', ...NOT_TOUCHED_TILL_GTC409]).status === 0 &&
      git(['status', '--porcelain', '--', GUEST]).stdout.trim() === ''
  );
}

// ══ R — rendered ═════════════════════════════════════════════════════════════
const render = (el: unknown) => {
  try {
    return renderToStaticMarkup(el as any);
  } catch (e) {
    console.error('    render threw:', (e as Error).message.split('\n')[0]);
    return '';
  }
};
/** A rendered box, read the way the browser reads one (BOX_FACTS), from its markup. */
function boxFactsOf(html: string): BoxFacts | null {
  if (!/role="dialog"/.test(html)) return null;
  const text = (s: string) =>
    s
      .replace(/<[^>]+>/g, ' ')
      .replace(/&#x27;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim();
  const h2 = html.match(/<h2 id="([^"]*)"[^>]*>([\s\S]*?)<\/h2>/);
  const labelled = html.match(/aria-labelledby="([^"]*)"/)?.[1];
  const pairs: Array<[string, string | null]> = [
    ...html.matchAll(/<dt[^>]*>([\s\S]*?)<\/dt><dd[^>]*>([\s\S]*?)<\/dd>/g),
  ].map((m) => [text(m[1]), text(m[2])]);
  const tickM = html.match(/<label[^>]*><input type="checkbox"([^>]*)\/?>([\s\S]*?)<\/label>/);
  // An input's attributes come in React's own order: read each one by its name.
  const attr = (tag: string, name: string) =>
    tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? '';
  const boxes = [
    ...html.matchAll(
      /<label[^>]*><span[^>]*>([\s\S]*?)<\/span>(<input type="text"[^>]*>)<\/label>/g
    ),
  ].map((m) => ({
    label: text(m[1]),
    value: text(attr(m[2], 'value')),
    hint: text(attr(m[2], 'placeholder')),
  }));
  const buttons = [...html.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)].map((m) => ({
    text: text(m[2]),
    disabled: /\sdisabled=""/.test(m[1]),
  }));
  return {
    heading: h2 ? text(h2[2]) : null,
    named: !!h2 && !!labelled && h2[1] === labelled,
    pairs,
    tick: tickM ? /\schecked=""/.test(tickM[1]) : null,
    tickLabel: tickM ? text(tickM[2]) : null,
    boxes,
    buttons,
    text: text(html),
  };
}

function layerR() {
  section('R — rendered: the rows, the tags, the box');
  const M3 = (categories: unknown[]) =>
    render(
      createElement(
        ToastProvider as any,
        null,
        createElement(Moment3AssignView as any, {
          eventId: 'e1',
          event: { id: 'e1', status: 'DRAFT', sentAt: null },
          hostPersonId: 'p-kate',
          headcount: 4,
          categories,
          initialHolders: { i2: { personId: 'p-ann', name: 'Ann Lowe' } },
          households: [],
          askForReason: async () => ({ proceed: true }),
          askForBatchReason: async () => ({ proceed: true }),
          onBack: () => {},
          onMoveOn: () => {},
          onSaveItemDetail: async () => true,
        })
      )
    );
  const cats = [
    {
      id: 'c1',
      name: 'Mains',
      emoji: '🍖',
      items: [
        { id: 'i1', name: 'Pavlova', kind: 'ITEM', detail: '', critical: true },
        { id: 'i2', name: 'Roast lamb', kind: 'ITEM', detail: '2 trays' },
        { id: 'i3', name: 'Bread rolls', kind: 'ITEM', detail: '2 trays', critical: false },
      ],
    },
    {
      id: 'c2',
      name: 'On the day',
      emoji: '📋',
      items: [
        { id: 'i4', name: 'Set the tables', kind: 'TASK', detail: '', critical: true },
        { id: 'i5', name: 'Wash up', kind: 'TASK', detail: '' },
      ],
    },
  ];
  const names = ['Pavlova', 'Roast lamb', 'Bread rolls', 'Set the tables', 'Wash up'];
  const m3 = M3(cats);
  assert(
    'R',
    'R1 Moment 3: every row (dishes and jobs) ends in one "Details" button read aloud "Details for <dish>"; it is not "pressed", not a row the arrows move between, not taken out of Tab (ruling 1)',
    CHECKS.detailsLast(m3, names),
    m3.slice(m3.indexOf('<li '), m3.indexOf('<li ') + 900)
  );
  const m3Rows: Record<string, string> = {};
  for (const li of m3.match(/<li [^>]*data-m3-item="[^"]*"[\s\S]*?<\/li>/g) ?? []) {
    const own = li.match(/<button[^>]*data-m3-row[^>]*>[\s\S]*?<\/button>/)?.[0] ?? '';
    const n = names.find((x) => own.includes(`<span>${x}</span>`));
    if (n) m3Rows[n] = own;
  }
  assert(
    'R',
    'R2 Moment 3: the amber "critical" tag, in the pre-flight’s look, once inside each critical row (Pavlova, a dish; Set the tables, a job) and on no other row (rulings 3 and 8)',
    CHECKS.tagsOn(m3Rows, ['Pavlova', 'Set the tables']),
    JSON.stringify(Object.keys(m3Rows))
  );
  const plan = render(
    createElement(
      ToastProvider as any,
      null,
      createElement(Moment2PlanView as any, {
        eventId: 'e1',
        eventName: 'Boxing Day',
        guestCount: 10,
        categories: cats.map((c) => ({
          id: c.id,
          name: c.name,
          emoji: c.emoji,
          items: c.items.map((i) => ({
            id: i.id,
            name: i.name,
            quantity: 2,
            unit: 'trays',
            servingSize: '',
            kind: i.kind,
            critical: (i as { critical?: boolean }).critical,
          })),
        })),
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
      })
    )
  );
  // A Moment 2 row: from its name's button to its "Mark for delete".
  const m2Rows: Record<string, string> = {};
  for (const n of names) {
    const at = plan.indexOf(`>${n}</button>`);
    const end = at >= 0 ? plan.indexOf('Mark for delete', at) : -1;
    if (at >= 0 && end > at) m2Rows[n] = plan.slice(at, end);
  }
  assert(
    'R',
    'R3 Moment 2: the same tag once on each critical row (Pavlova, Set the tables) and on no other row (rulings 3 and 8)',
    CHECKS.tagsOn(m2Rows, ['Pavlova', 'Set the tables']),
    JSON.stringify(Object.keys(m2Rows))
  );

  const Box = (DETAIL as any).default;
  const boxOf = (
    item: Record<string, unknown>,
    holderName: string | null,
    answer: string | null
  ) =>
    Box
      ? boxFactsOf(
          render(
            createElement(Box, {
              item,
              holderName,
              holderAnswer: answer,
              onSave: async () => true,
              onClose: () => {},
            })
          )
        )
      : null;
  const lamb = {
    id: 'i2',
    name: 'Roast lamb',
    kind: 'ITEM',
    detail: '2 trays',
    critical: false,
    dropOffLocation: 'the shed',
    dropOffNote: 'noon',
  };
  const lambBox = boxOf(lamb, 'Ann Lowe', null);
  assert(
    'R',
    'R4 a dish’s box: the dish’s name as its heading (naming the box), "Amount" 2 trays, "Who\'s bringing it" Ann Lowe, the tick unticked, "Drop-off place" holding "the shed" and "Drop-off time" holding "noon" with their hints, then "Close" and "Save" (rulings 2 and 5)',
    CHECKS.dishBox(lambBox, 'Roast lamb', '2 trays', 'Ann Lowe', false, 'the shed', 'noon'),
    JSON.stringify(lambBox)
  );
  const jobBox = boxOf(
    { id: 'i4', name: 'Set the tables', kind: 'TASK', detail: '', critical: true },
    'Bo Tane',
    null
  );
  assert(
    'R',
    'R5 a job’s box: its name, "Who\'s bringing it" Bo Tane and the tick (ticked: it is critical); no "Amount" and no drop-off boxes (ruling 7)',
    CHECKS.jobBox(jobBox, 'Set the tables', 'Bo Tane', true),
    JSON.stringify(jobBox)
  );
  const nobody = boxOf({ ...lamb, dropOffLocation: null, dropOffNote: null }, null, null);
  const answered = boxOf(lamb, 'Ann Lowe', SAID_YES);
  assert(
    'R',
    'R6 nobody holding it reads "Nobody yet" (both boxes empty, showing their hints); an answer handed in reads beside the name in the board’s way, "Ann Lowe · said yes" (ruling 5)',
    CHECKS.dishBox(nobody, 'Roast lamb', '2 trays', NOBODY, false, '', '') &&
      CHECKS.dishBox(
        answered,
        'Roast lamb',
        '2 trays',
        `Ann Lowe · ${SAID_YES}`,
        false,
        'the shed',
        'noon'
      ),
    JSON.stringify([pair(nobody, WHO), pair(answered, WHO)])
  );
  const pav = (critical: boolean, placeholderAmount: boolean, kind = 'ITEM') =>
    boxOf({ id: 'i1', name: 'Pavlova', kind, detail: '', critical, placeholderAmount }, null, null);
  const said = pav(true, true);
  const notPlaceholder = pav(true, false);
  const notCritical = pav(false, true);
  assert(
    'R',
    'R7 ruling 4’s sentence "This needs an amount before you move on." is said for a critical dish whose amount is a placeholder, and not for a critical dish with an amount nor a placeholder dish that is not critical',
    CHECKS.needsAmount(true, said) &&
      CHECKS.needsAmount(false, notPlaceholder) &&
      CHECKS.needsAmount(false, notCritical),
    JSON.stringify([said?.text, notPlaceholder?.text, notCritical?.text])
  );
  assert(
    'R',
    'R8 a box just opened: "Save" does nothing yet (nothing changed), "Close" works (ruling 6: only what changed is sent)',
    CHECKS.saveIdle(lambBox) && CHECKS.saveIdle(jobBox),
    JSON.stringify([lambBox?.buttons, jobBox?.buttons])
  );
}

// ══ C — live ═════════════════════════════════════════════════════════════════
const created = { users: [] as string[], people: [] as string[], events: [] as string[] };

/** Run in every new document: the page's own requests, with their bodies. */
const RECORD = `(() => {
  window.__calls = [];
  const f = window.fetch;
  window.fetch = function (input, init) {
    try {
      const url = typeof input === 'string' ? input : input && input.url ? input.url : String(input);
      const method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      const body = init && typeof init.body === 'string' ? init.body : null;
      window.__calls.push({ m: method, u: url, b: body });
    } catch (e) {}
    return f.apply(this, arguments);
  };
})();`;

/** Moment 3's rows, read by hand: the row's own button, its last element, the tag's word. */
const M3_ROWS = `[...document.querySelectorAll('li[data-m3-item]')].map((li) => {
  const row = li.querySelector('button[data-m3-row]');
  const last = li.lastElementChild;
  const name = row ? row.querySelector('span > span') : null;
  const tags = row ? [...row.querySelectorAll('*')].filter((s) => s.children.length === 0 && s.textContent.trim() === ${JSON.stringify(TAG)}) : [];
  const spans = [...li.querySelectorAll('span')];
  const own = spans.find((s) => s.textContent.trim() === ${JSON.stringify(OWN_PLACE)});
  return { name: name ? name.textContent.trim() : null,
    lastIsDetails: !!last && last.tagName === 'BUTTON' && last.textContent.trim() === ${JSON.stringify(DETAILS)},
    label: last ? last.getAttribute('aria-label') : null,
    pressedAttr: last ? last.getAttribute('aria-pressed') : 'none',
    isRow: last ? last.hasAttribute('data-m3-row') : true,
    tabbable: !!last && last.tabIndex === 0 && !last.disabled,
    tags: tags.length,
    amber: tags.length === 1 && /amber/.test(tags[0].className) && getComputedStyle(tags[0]).textTransform === 'uppercase' && tags[0].innerText.trim() === 'CRITICAL',
    place: own && own.nextElementSibling ? own.nextElementSibling.textContent.trim() : null }; })`;
/**
 * The open box: the VISIBLE modal dialog. Moment 3 always carries a hidden role="dialog" of its own
 * (the event details pop-up, with its own "Close"), so every lookup is scoped to this one.
 */
const THE_BOX = `[...document.querySelectorAll('[role="dialog"][aria-modal="true"]')].find((x) => x.checkVisibility())`;
/** The open box, read by hand. */
const BOX_FACTS = `(() => { const d = ${THE_BOX}; if (!d) return null;
  const pairs = [...d.querySelectorAll('dt')].map((dt) => [dt.textContent.trim(), dt.nextElementSibling ? dt.nextElementSibling.textContent.trim() : null]);
  const tick = d.querySelector('input[type="checkbox"]');
  const tl = tick ? tick.closest('label') : null;
  const boxes = [...d.querySelectorAll('input[type="text"]')].map((i) => { const l = i.closest('label');
    return { label: l && l.firstElementChild ? l.firstElementChild.textContent.trim() : null, value: i.value, hint: i.getAttribute('placeholder') }; });
  const buttons = [...d.querySelectorAll('button')].map((b) => ({ text: b.textContent.trim(), disabled: b.disabled }));
  const h = d.querySelector('h2'); const lab = d.getAttribute('aria-labelledby');
  return { heading: h ? h.textContent.trim() : null, named: !!lab && !!h && h.id === lab, pairs,
    tick: tick ? tick.checked : null, tickLabel: tl ? tl.textContent.trim() : null, boxes, buttons,
    text: d.innerText.replace(/\\s+/g, ' ').trim() }; })()`;
const OPEN_BOX = `!!${BOX_FACTS}`;
/** Mark one element for a guarded click. */
const MARK = (
  finder: string
) => `(() => { document.querySelectorAll('[data-t]').forEach((e) => e.removeAttribute('data-t'));
  const el = ${finder}; if (!el) return false; el.setAttribute('data-t', 'x'); return true; })()`;
const DETAILS_OF = (name: string) =>
  `document.querySelector('button[aria-label=${JSON.stringify(JSON.stringify(DETAILS_FOR(name)))}]')`.replace(
    /aria-label="(.*)"\]/,
    'aria-label=$1]'
  );
const ROW_OF = (name: string) =>
  `[...document.querySelectorAll('li[data-m3-item]')].map((li) => li.querySelector('button[data-m3-row]')).find((b) => b && b.querySelector('span > span') && b.querySelector('span > span').textContent.trim() === ${JSON.stringify(name)})`;
const PERSON_OF = (name: string) =>
  `[...document.querySelectorAll('button[data-m3-row]')].find((b) => !b.closest('li[data-m3-item]') && b.textContent.includes(${JSON.stringify(name)}))`;
const IN_BOX_BUTTON = (text: string) =>
  `(() => { const d = ${THE_BOX}; return d ? [...d.querySelectorAll('button')].find((b) => b.textContent.trim() === ${JSON.stringify(text)}) : null; })()`;
const IN_BOX_TICK = `(() => { const d = ${THE_BOX}; return d ? d.querySelector('input[type="checkbox"]') : null; })()`;
/** Type into the box's input labelled `label` as React reads typing. */
const SET = (label: string, value: string) => `(() => { const d = ${THE_BOX}; if (!d) return false;
  const l = [...d.querySelectorAll('label')].find((x) => x.firstElementChild && x.firstElementChild.textContent.trim() === ${JSON.stringify(label)});
  const i = l && l.querySelector('input[type="text"]'); if (!i) return false;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify(value)});
  i.dispatchEvent(new Event('input', { bubbles: true }));
  return i.value === ${JSON.stringify(value)}; })()`;
const PRESSED = `document.querySelectorAll('[aria-pressed="true"]').length`;
const FOCUS = `document.activeElement ? document.activeElement.getAttribute('aria-label') : null`;
/** At 375: each row's fit, read by hand. */
const FIT = `[...document.querySelectorAll('li[data-m3-item]')].map((li) => {
  const row = li.querySelector('button[data-m3-row]'); const last = li.lastElementChild;
  const text = row ? row.firstElementChild : null; const name = row ? row.querySelector('span > span') : null;
  const lr = li.getBoundingClientRect(); const dr = last.getBoundingClientRect();
  const amt = text ? [...text.querySelectorAll(':scope > span')].find((s) => /\\d/.test(s.textContent) && s.textContent.trim() === '2 trays') : null;
  let lines = null;
  if (amt && amt.firstChild) { const r = document.createRange(); r.selectNodeContents(amt);
    lines = new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size; }
  return { name: name ? name.textContent.trim() : '',
    detailsIn: last.textContent.trim() === ${JSON.stringify(DETAILS)} && dr.left >= lr.left - 0.5 && dr.right <= lr.right + 0.5 && dr.right <= 375 && dr.width > 0,
    textFits: !!text && text.scrollWidth - text.clientWidth <= 0,
    amountLines: lines, amount: amt ? amt.textContent.trim() : null }; })`;
/** The tallest Details button and the row text's line height, at the current width. */
const HEIGHTS = `(() => { const ds = [...document.querySelectorAll('li[data-m3-item]')].map((li) => li.lastElementChild.getBoundingClientRect().height);
  const row = document.querySelector('li[data-m3-item] button[data-m3-row]');
  return { tallest: Math.max(...ds), line: row ? parseFloat(getComputedStyle(row).lineHeight) : 0 }; })()`;
/** Moment 2's plan view: for each dish's name button, how many tags sit beside it. */
const M2_TAGS = (names: string[]) => `(() => { const out = {};
  for (const n of ${JSON.stringify(names)}) { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === n); if (!b) continue;
    out[n] = [...b.parentElement.querySelectorAll('*')].filter((s) => s.children.length === 0 && s.textContent.trim() === ${JSON.stringify(TAG)}).length; }
  return out; })()`;

async function layerC() {
  section(
    'C — live: Moment 3’s rows and box, the saves, the keys, 375, the answer, Moment 2’s tags'
  );
  const up = await realFetch(`${BASE_URL}/`)
    .then((r) => r.status > 0)
    .catch(() => false);
  if (!up)
    console.error(`    the dev server does not answer at ${BASE_URL}: every C assertion fails`);
  const totals = async () => ({
    invite: await prisma.inviteEvent.count(),
    outbound: await prisma.outboundMessage.count(),
  });
  const before = await totals();

  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const mail = (l: string) => `gtc406-${l}-${stamp}@example.com`;
  const user = await prisma.user.create({ data: { email: mail('kate') } });
  created.users.push(user.id);
  const kate = await prisma.person.create({
    data: { name: 'Kate Lowe', email: user.email, userId: user.id },
  });
  created.people.push(kate.id);
  const ann = await prisma.person.create({ data: { name: 'Ann Lowe', email: mail('ann') } });
  created.people.push(ann.id);
  const bo = await prisma.person.create({ data: { name: 'Bo Tane', email: mail('bo') } });
  created.people.push(bo.id);
  const sessionToken = randomBytes(32).toString('hex');
  await prisma.session.create({
    data: { userId: user.id, token: sessionToken, expiresAt: new Date(Date.now() + 3600e3) },
  });
  const start = new Date(Date.now() + 30 * 864e5);
  const mkEvent = async (name: string, sent: boolean) => {
    const ev = await prisma.event.create({
      data: {
        name,
        startDate: start,
        endDate: start,
        hostId: kate.id,
        status: sent ? 'CONFIRMING' : 'DRAFT',
        ...(sent ? { sentAt: new Date() } : {}),
      } as any,
    });
    created.events.push(ev.id);
    await prisma.eventRole.create({ data: { eventId: ev.id, userId: user.id, role: 'HOST' } });
    await prisma.eventSetup.create({
      data: { eventId: ev.id, eventType: 'Christmas', planApprovedAt: new Date() } as any,
    });
    // Kate and Ann; Bo on his own.
    for (const members of [
      [
        [kate.id, 'PRIMARY_CONTACT', 'HOST'],
        [ann.id, 'PARTNER', 'PARTICIPANT'],
      ],
      [[bo.id, 'PRIMARY_CONTACT', 'PARTICIPANT']],
    ]) {
      const h = await prisma.household.create({ data: { eventId: ev.id } });
      for (const [personId, householdRole, role] of members)
        await prisma.personEvent.create({
          data: { personId, eventId: ev.id, role, householdId: h.id, householdRole } as any,
        });
    }
    return ev.id;
  };
  const mkTeam = async (eventId: string, name: string, order: number) =>
    (
      await prisma.team.create({
        data: {
          name,
          eventId,
          displayOrder: order,
          source: 'GENERATED',
          coordinatorId: kate.id,
        } as any,
      })
    ).id;
  const mkItem = async (
    teamId: string,
    name: string,
    extra: Record<string, unknown>,
    order: number
  ) =>
    (
      await prisma.item.create({
        data: {
          name,
          kind: 'ITEM',
          teamId,
          source: 'GENERATED',
          aiGenerated: true,
          quantityAmount: 2,
          quantityUnit: 'TRAYS',
          status: 'UNASSIGNED',
          displayOrder: order,
          ...extra,
        } as any,
      })
    ).id;
  const give = (itemId: string, personId: string, response = 'PENDING') =>
    prisma.assignment.create({ data: { itemId, personId, response } as any });

  // Event A, before the send: five dishes and two jobs.
  const evA = await mkEvent('GTC-406 — before the send', false);
  const mainsA = await mkTeam(evA, 'Mains', 0);
  const pavA = await mkItem(
    mainsA,
    'Pavlova',
    {
      critical: true,
      quantityAmount: null,
      quantityUnit: null,
      quantityState: 'PLACEHOLDER',
      placeholderAcknowledged: false,
    },
    0
  );
  const lambA = await mkItem(mainsA, 'Roast lamb', { dropOffLocation: 'the shed' }, 1);
  const rollsA = await mkItem(mainsA, 'Bread rolls', {}, 2);
  const longA = await mkItem(mainsA, LONG, {}, 3);
  const dayA = await mkTeam(evA, 'On the day', 1);
  const tablesA = await mkItem(
    dayA,
    'Set the tables',
    { kind: 'TASK', critical: true, quantityAmount: null, quantityUnit: null, quantityState: 'NA' },
    0
  );
  const washA = await mkItem(
    dayA,
    'Wash up',
    { kind: 'TASK', quantityAmount: null, quantityUnit: null, quantityState: 'NA' },
    1
  );
  await give(lambA, ann.id);
  await give(tablesA, bo.id);
  const namesA = ['Pavlova', 'Roast lamb', 'Bread rolls', LONG, 'Set the tables', 'Wash up'];

  // Event B, after the send: an answered dish, an unanswered one, one nobody holds.
  const evB = await mkEvent('GTC-406 — after the send', true);
  const mainsB = await mkTeam(evB, 'Mains', 0);
  const lambB = await mkItem(mainsB, 'Roast lamb', {}, 0);
  const rollsB = await mkItem(mainsB, 'Bread rolls', {}, 1);
  await mkItem(mainsB, 'Trifle', {}, 2);
  await give(lambB, ann.id, 'ACCEPTED');
  await give(rollsB, bo.id, 'PENDING');

  const evIn = { eventId: { in: created.events } };
  const rows = async () =>
    [
      await prisma.event.count({ where: { id: { in: created.events } } }),
      await prisma.eventSetup.count({ where: evIn }),
      await prisma.eventRole.count({ where: evIn }),
      await prisma.household.count({ where: evIn }),
      await prisma.personEvent.count({ where: evIn }),
      await prisma.person.count({ where: { id: { in: created.people } } }),
      await prisma.user.count({ where: { id: { in: created.users } } }),
      await prisma.session.count({ where: { userId: { in: created.users } } }),
      await prisma.team.count({ where: evIn }),
      await prisma.item.count({ where: { team: evIn } }),
      await prisma.assignment.count({ where: { item: { team: evIn } } }),
      await prisma.accessToken.count({ where: evIn }),
      await prisma.auditEntry.count({ where: evIn }),
      await prisma.inviteEvent.count({ where: evIn }),
      await prisma.outboundMessage.count({ where: evIn }),
    ].join(',');
  const storedOf = (id: string) =>
    prisma.item.findUnique({
      where: { id },
      select: { critical: true, dropOffLocation: true, dropOffNote: true },
    });

  let chrome: Headless | null = null;
  let probes = { plan: '', send: '' };
  let blocked: string[] = [];
  let dialogs: string[] = [];
  const refusals: string[] = [];
  const writes: Sent[] = [];
  try {
    chrome = await openHeadless({ fetchImpl: realFetch, port: PORT, base: BASE_URL });
    const c = chrome;
    await c.setViewport(1280, 900, false);
    await c.blockPlanMaking();
    await c.blockSends();
    c.answerLeaveDialogs(true);
    await c.navigate('/', 3000);
    probes = {
      plan: await c.evaluate<string>(
        `fetch('/api/gtc406-probe/finalize-plan', { method: 'POST' }).then(r => 'reached ' + r.status).catch(() => 'failed')`
      ),
      send: await c.evaluate<string>(
        `fetch('/api/events/gtc406-probe/send', { method: 'POST' }).then(r => 'reached ' + r.status).catch(() => 'failed')`
      ),
    };
    assert(
      'C',
      'C0 PRECONDITION: both walls proven: a plan-making probe and a send probe fail in the browser',
      probes.plan === 'failed' && probes.send === 'failed',
      JSON.stringify(probes)
    );
    // Not proven: stop here; main's catch removes the fixture.
    if (probes.plan !== 'failed' || probes.send !== 'failed') throw new Error('walls not proven');
    await c.addInitScript(RECORD);
    await c.setSessionCookie(sessionToken);
    const ev = <T = any,>(js: string) => c.evaluate<T>(js);
    const waitFor = async (js: string, ms = 15000) => {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        if (
          await ev<boolean>(`(() => { try { return !!(${js}); } catch (e) { return false; } })()`)
        )
          return true;
        await sleep(150);
      }
      return false;
    };
    const tap = async (finder: string, settleMs = 400) => {
      if (!(await ev<boolean>(MARK(finder)))) {
        refusals.push(`not found: ${finder.slice(0, 80)}`);
        return 'not found';
      }
      const why = await c.clickGuarded('[data-t="x"]', settleMs);
      if (why) {
        const hit =
          await ev<string>(`(() => { const t = document.querySelector('[data-t="x"]'); if (!t) return 'gone';
          const r = t.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return e ? e.tagName + ' ' + String(e.className).slice(0, 60) + ' "' + (e.textContent || '').trim().slice(0, 30) + '"' : 'nothing'; })()`);
        refusals.push(`${why} (${finder.slice(0, 60)} | hit ${hit})`);
      }
      return why;
    };
    const calls = async () => (await ev<Sent[]>('window.__calls || []')) ?? [];
    /** Keep this document's writes before leaving it. */
    const keepWrites = async () => {
      writes.push(...(await calls()).filter((x) => x.m !== 'GET'));
    };
    const patchesTo = async (eventId: string, itemId: string) =>
      (await calls()).filter(
        (x) => x.m === 'PATCH' && x.u.endsWith(`/api/events/${eventId}/items/${itemId}`)
      );
    const openM3 = async (eventId: string, first: string) => {
      await c.navigate(`/plan/${eventId}/setup`, 300);
      await waitFor(
        `document.body.innerText.includes(${JSON.stringify(SENTENCE)}) && !!(${ROW_OF(first)})`,
        20000
      );
      await sleep(800);
    };
    const openBox = async (name: string) => {
      await tap(DETAILS_OF(name), 300);
      await waitFor(OPEN_BOX, 5000);
      return ev<BoxFacts | null>(BOX_FACTS);
    };
    const closeBox = async () => {
      await tap(IN_BOX_BUTTON(CLOSE), 300);
      await waitFor(`!${OPEN_BOX}`, 5000);
    };
    const saveBox = async (eventId: string, itemId: string) => {
      await tap(IN_BOX_BUTTON(SAVE), 300);
      const end = Date.now() + 10000;
      while (Date.now() < end && (await patchesTo(eventId, itemId)).length < 1) await sleep(150);
      await sleep(800);
    };

    // ── Moment 3, before the send, at 1280 ──
    await openM3(evA, 'Pavlova');
    const rowsA = await ev<RowFacts[] | null>(M3_ROWS);
    assert(
      'C',
      'C1 every Moment 3 row, dish or job, ends in "Details", read aloud "Details for <dish>", never "pressed", not one of the rows, reached by Tab; the amber tag (shown "CRITICAL") on Pavlova and Set the tables only (rulings 1, 3 and 8)',
      CHECKS.rowsLive(rowsA, namesA, ['Pavlova', 'Set the tables']),
      JSON.stringify(rowsA)
    );

    // C2: Details on Bread rolls picks nothing; Close; the row's own tap still picks the row.
    const rollsOpen = await openBox('Bread rolls');
    const pressedWhileOpen = (await ev<number>(PRESSED)) ?? -1;
    await closeBox();
    const c2 = {
      openedFor: rollsOpen?.heading ?? null,
      pressedWhileOpen,
      closed: !(await ev<boolean>(OPEN_BOX)),
      focus: await ev<string | null>(FOCUS),
      pressedAfter: (await ev<number>(PRESSED)) ?? -1,
      rowTapPressed: false,
    };
    await tap(ROW_OF('Bread rolls'), 400);
    c2.rowTapPressed =
      (await ev<boolean>(`(${ROW_OF('Bread rolls')}).getAttribute('aria-pressed') === 'true'`)) ===
      true;
    // Unpick it (Escape on the picked row, the list's own key).
    await c.pressKey('Escape');
    await sleep(300);
    assert(
      'C',
      'C2 "Details" opens Bread rolls’ box and picks nothing (nothing "pressed"); "Close" shuts it and the focus is back on its Details; the row’s own tap still picks the row (ruling 1)',
      CHECKS.detailsPicksNothing(c2) && (await ev<number>(PRESSED)) === 0,
      JSON.stringify(c2)
    );

    // C3: Roast lamb's box as it opens.
    const lambBox = await openBox('Roast lamb');
    assert(
      'C',
      'C3 Roast lamb’s box: its name, "Amount" 2 trays, "Who\'s bringing it" Ann Lowe, not ticked, "Drop-off place" holding "the shed", "Drop-off time" empty, each with its hint; "Save" idle until something changes (rulings 2 and 5)',
      CHECKS.dishBox(lambBox, 'Roast lamb', '2 trays', 'Ann Lowe', false, 'the shed', '') &&
        CHECKS.saveIdle(lambBox),
      JSON.stringify(lambBox)
    );
    await closeBox();

    // C4: Bread rolls: tick Critical, type a place, save.
    await openBox('Bread rolls');
    await tap(IN_BOX_TICK, 200);
    const typed = await ev<boolean>(SET(PLACE, 'the back door'));
    await saveBox(evA, rollsA);
    const rollsSent = await patchesTo(evA, rollsA);
    const rollsStored = await storedOf(rollsA);
    const rollsBoxAfter = await ev<BoxFacts | null>(BOX_FACTS);
    const rollsRow = ((await ev<RowFacts[] | null>(M3_ROWS)) ?? []).find(
      (r) => r.name === 'Bread rolls'
    );
    assert(
      'C',
      'C4 ticked and typed "the back door" on Bread rolls, saved: one PATCH to its own route sending critical true and dropOffLocation "the back door" and nothing else (no reason asked before the send); stored so; at once the row shows the tag and "the back door", and the box shows them with "Save" idle again (rulings 2, 3 and 6)',
      typed === true &&
        CHECKS.sentOnly(rollsSent, `/api/events/${evA}/items/${rollsA}`, {
          critical: true,
          dropOffLocation: 'the back door',
        }) &&
        CHECKS.storedAs(rollsStored, true, 'the back door', null) &&
        !!rollsRow &&
        rollsRow.tags === 1 &&
        rollsRow.place === 'the back door' &&
        CHECKS.dishBox(
          rollsBoxAfter,
          'Bread rolls',
          '2 trays',
          NOBODY,
          true,
          'the back door',
          ''
        ) &&
        CHECKS.saveIdle(rollsBoxAfter),
      `typed ${typed} | ${JSON.stringify(rollsSent)} | ${JSON.stringify(rollsStored)} | ${JSON.stringify(rollsRow)} | ${JSON.stringify(rollsBoxAfter)}`
    );
    await closeBox();

    // C5: Roast lamb: empty the place, save.
    await openBox('Roast lamb');
    const emptied = await ev<boolean>(SET(PLACE, '   '));
    await saveBox(evA, lambA);
    const lambSent = await patchesTo(evA, lambA);
    const lambStored = await storedOf(lambA);
    const lambRow = ((await ev<RowFacts[] | null>(M3_ROWS)) ?? []).find(
      (r) => r.name === 'Roast lamb'
    );
    assert(
      'C',
      'C5 Roast lamb’s place emptied (spaces only) and saved: dropOffLocation sent as null (never an empty string) and nothing else; stored null; the row shows no drop-off at once (ruling 6)',
      emptied === true &&
        CHECKS.sentOnly(lambSent, `/api/events/${evA}/items/${lambA}`, { dropOffLocation: null }) &&
        CHECKS.storedAs(lambStored, false, null, null) &&
        !!lambRow &&
        lambRow.place === null &&
        lambRow.tags === 0,
      `emptied ${emptied} | ${JSON.stringify(lambSent)} | ${JSON.stringify(lambStored)} | ${JSON.stringify(lambRow)}`
    );
    await closeBox();

    // C6: the ruling-4 sentence.
    const pavBox = await openBox('Pavlova');
    await tap(IN_BOX_TICK, 200);
    const pavUnticked = await ev<BoxFacts | null>(BOX_FACTS);
    await closeBox();
    const rollsCritical = await openBox('Bread rolls');
    await closeBox();
    const lambPlain = await openBox('Roast lamb');
    await closeBox();
    assert(
      'C',
      'C6 Pavlova (critical, its amount a placeholder) says "This needs an amount before you move on." with no amount shown; unticked in the box, it no longer does (closed unsaved); Bread rolls (critical, with an amount) and Roast lamb (not critical) do not (ruling 4)',
      CHECKS.needsAmount(true, pavBox) &&
        pair(pavBox, AMOUNT) === '—' &&
        pavBox?.tick === true &&
        CHECKS.needsAmount(false, pavUnticked) &&
        pavUnticked?.tick === false &&
        CHECKS.needsAmount(false, rollsCritical) &&
        rollsCritical?.tick === true &&
        CHECKS.needsAmount(false, lambPlain),
      JSON.stringify([pavBox?.text, pavUnticked?.text, rollsCritical?.text, lambPlain?.text])
    );

    // C7: a job's box.
    const tablesBox = await openBox('Set the tables');
    await closeBox();
    assert(
      'C',
      'C7 Set the tables (a job, critical, Bo Tane’s): its name, "Who\'s bringing it" Bo Tane, the tick ticked; no "Amount", no drop-off boxes (ruling 7)',
      CHECKS.jobBox(tablesBox, 'Set the tables', 'Bo Tane', true),
      JSON.stringify(tablesBox)
    );

    // C8: with Ann picked, Escape and Close each shut a box; Ann stays picked; nothing given.
    await tap(PERSON_OF('Ann Lowe'), 400);
    const pickedBefore =
      (await ev<boolean>(`(${PERSON_OF('Ann Lowe')}).getAttribute('aria-pressed') === 'true'`)) ===
      true;
    const assignsBefore = (await calls()).filter((x) => /\/assign$/.test(x.u)).length;
    const escOpened = !!(await openBox('Bread rolls'));
    await c.pressKey('Escape');
    await sleep(400);
    const escClosed = !(await ev<boolean>(OPEN_BOX));
    const escFocus = await ev<string | null>(FOCUS);
    const escPicked =
      (await ev<boolean>(`(${PERSON_OF('Ann Lowe')}).getAttribute('aria-pressed') === 'true'`)) ===
      true;
    const closeOpened = !!(await openBox('Wash up'));
    await closeBox();
    const closeFocus = await ev<string | null>(FOCUS);
    const closePicked =
      (await ev<boolean>(`(${PERSON_OF('Ann Lowe')}).getAttribute('aria-pressed') === 'true'`)) ===
      true;
    const assigns = (await calls()).filter((x) => /\/assign$/.test(x.u)).length - assignsBefore;
    const esc = {
      pickedBefore,
      opened: escOpened,
      closed: escClosed,
      focus: escFocus,
      pickedAfter: escPicked,
      assignCalls: assigns,
      label: 'Bread rolls',
    };
    const close = {
      pickedBefore: escPicked,
      opened: closeOpened,
      closed: !(await ev<boolean>(OPEN_BOX)),
      focus: closeFocus,
      pickedAfter: closePicked,
      assignCalls: assigns,
      label: 'Wash up',
    };
    // Unpick Ann (Escape with no box open: the screen's own key).
    await c.pressKey('Escape');
    await sleep(300);
    assert(
      'C',
      'C8 with Ann picked, Escape shuts Bread rolls’ box and "Close" shuts Wash up’s: each time the focus is back on that row’s Details, Ann is still picked, and nothing was given (ruling 1)',
      CHECKS.escapeKeeps(esc) && CHECKS.escapeKeeps(close),
      JSON.stringify([esc, close])
    );

    // C9: the arrows, from a row and from its Details.
    const arrow = (
      finder: string,
      key: string
    ) => `(() => { const el = ${finder}; if (!el) return null; el.focus();
      el.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, bubbles: true, cancelable: true }));
      const a = document.activeElement; if (!a || !a.hasAttribute('data-m3-row')) return a ? 'not a row: ' + (a.getAttribute('aria-label') || a.tagName) : null;
      const s = a.querySelector('span > span'); return s ? s.textContent.trim() : null; })()`;
    const keys: Record<string, string | null> = {
      'row down': await ev<string | null>(arrow(ROW_OF('Bread rolls'), 'ArrowDown')),
      'row up': await ev<string | null>(arrow(ROW_OF('Bread rolls'), 'ArrowUp')),
      'details down': await ev<string | null>(arrow(DETAILS_OF('Bread rolls'), 'ArrowDown')),
      'details up': await ev<string | null>(arrow(DETAILS_OF('Bread rolls'), 'ArrowUp')),
    };
    assert(
      'C',
      'C9 the arrows still move from row to row: from Bread rolls’ row, and from its Details, down goes to the next row (the long lamb dish) and up to Roast lamb (ruling 1)',
      CHECKS.arrows(keys, {
        'row down': LONG,
        'row up': 'Roast lamb',
        'details down': LONG,
        'details up': 'Roast lamb',
      }),
      JSON.stringify(keys)
    );
    const at1280 = await ev<{ tallest: number; line: number }>(HEIGHTS);
    await keepWrites();

    // ── At 375 ──
    await c.setViewport(375, 812, true);
    await openM3(evA, 'Pavlova');
    const fits = await ev<Fit[] | null>(FIT);
    const pageWidth = (await ev<number>('document.documentElement.scrollWidth')) ?? 9999;
    const at375 = await ev<{ tallest: number; line: number }>(HEIGHTS);
    assert(
      'C',
      'C10 at 375 wide: every Details lies inside its row and the screen; no name is cut (the long lamb dish wraps); every "2 trays" sits on one line; nothing scrolls sideways; and at 375 and 1280 no Details is taller than a row’s line (the rows keep their height)',
      CHECKS.fitsAt375(fits, namesA, pageWidth, at375?.tallest ?? 0, at375?.line ?? 0) &&
        (at1280?.tallest ?? 99) > 0 &&
        (at1280?.tallest ?? 99) <= (at1280?.line ?? 0),
      `${JSON.stringify(fits)} | width ${pageWidth} | ${JSON.stringify([at375, at1280])}`
    );
    await keepWrites();
    await c.setViewport(1280, 900, false);

    // ── After the send: the answer ──
    await openM3(evB, 'Roast lamb');
    const lambAnswered = await openBox('Roast lamb');
    await closeBox();
    const rollsAsked = await openBox('Bread rolls');
    await closeBox();
    const trifle = await openBox('Trifle');
    await closeBox();
    assert(
      'C',
      'C11 after the send, the holder’s answer the screen already has, in the board’s words: "Ann Lowe · said yes", "Bo Tane · hasn’t answered"; Trifle "Nobody yet" (ruling 5)',
      pair(lambAnswered, WHO) === `Ann Lowe · ${SAID_YES}` &&
        pair(rollsAsked, WHO) === `Bo Tane · ${NOT_ANSWERED}` &&
        pair(trifle, WHO) === NOBODY,
      JSON.stringify([pair(lambAnswered, WHO), pair(rollsAsked, WHO), pair(trifle, WHO)])
    );
    await keepWrites();

    // ── Moment 2's plan view of event A ──
    await c.navigate(`/plan/${evA}/setup?at=plan`, 300);
    await waitFor(
      `[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Wash up') && !document.body.innerText.includes(${JSON.stringify(SENTENCE)})`,
      20000
    );
    await sleep(600);
    const m2 = await ev<Record<string, number> | null>(M2_TAGS(namesA));
    assert(
      'C',
      'C12 Moment 2’s plan: the tag on Pavlova, Bread rolls (made critical in C4) and Set the tables, and on no other row (rulings 3 and 8)',
      CHECKS.moment2Tags(m2, ['Pavlova', 'Bread rolls', 'Set the tables']),
      JSON.stringify(m2)
    );
    await keepWrites();

    blocked = c.planMakingBlocked();
    dialogs = c.dialogs();
  } finally {
    chrome?.close();
  }

  const paths = writes.map((x) => `${x.m} ${x.u.replace(/^https?:\/\/[^/]+/, '')}`);
  assert(
    'K',
    'K1 CONTROL: nothing blocked but the two probes; no dialog; every click made (none refused); the pages wrote only the two saves (C4, C5)',
    blocked.length === 2 &&
      blocked.every((x) => /gtc406-probe/.test(x)) &&
      dialogs.length === 0 &&
      refusals.length === 0 &&
      JSON.stringify(paths) ===
        JSON.stringify([
          `PATCH /api/events/${evA}/items/${rollsA}`,
          `PATCH /api/events/${evA}/items/${lambA}`,
        ]),
    `${blocked.join(' | ')} | ${dialogs.join(',')} | ${refusals.join(' ; ')} | ${JSON.stringify(paths)}`
  );
  const whileExists = await rows();
  const ai = (
    await prisma.event.findMany({
      where: { id: { in: created.events } },
      select: { aiCallsUsed: true },
    })
  ).map((e) => e.aiCallsUsed);
  const untouched = await Promise.all([pavA, longA, tablesA, washA].map((id) => storedOf(id)));
  console.log(
    `    fixture while it existed (Event, EventSetup, EventRole, Household, PersonEvent, Person, User, Session, Team, Item, Assignment, AccessToken, AuditEntry, InviteEvent, OutboundMessage): ${whileExists}`
  );
  await cleanup();
  const left = await rows();
  const after = await totals();
  assert(
    'K',
    'K2 CONTROL: aiCallsUsed 0 on both events; the dishes not saved are as made; nothing queued, no link opened; every fixture row removed by id; the InviteEvent and OutboundMessage totals as found',
    ai.length === 2 &&
      ai.every((x) => x === 0) &&
      CHECKS.storedAs(untouched[0], true, null, null) &&
      CHECKS.storedAs(untouched[1], false, null, null) &&
      CHECKS.storedAs(untouched[2], true, null, null) &&
      CHECKS.storedAs(untouched[3], false, null, null) &&
      whileExists.endsWith(',0,0') &&
      left === '0,0,0,0,0,0,0,0,0,0,0,0,0,0,0' &&
      after.invite === before.invite &&
      after.outbound === before.outbound,
    `ai ${ai} | ${JSON.stringify(untouched)} | ${whileExists} | ${left} | ${JSON.stringify(before)} → ${JSON.stringify(after)}`
  );
}

let cleaned = false;
async function cleanup() {
  if (cleaned) return;
  cleaned = true;
  const del = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      console.error('cleanup:', (e as Error).message.split('\n')[0]);
    }
  };
  // Every row below was made by this suite: its two events and what hangs off them (setups, roles,
  // households, memberships, teams, items and assignments go with the event), its people, its user
  // and the session. Tokens and audit rows by their event.
  const evIds = created.events;
  const tokenIds = (
    await prisma.accessToken.findMany({ where: { eventId: { in: evIds } }, select: { id: true } })
  ).map((t) => t.id);
  await del(() => prisma.accessToken.deleteMany({ where: { id: { in: tokenIds } } }));
  const auditIds = (
    await prisma.auditEntry.findMany({ where: { eventId: { in: evIds } }, select: { id: true } })
  ).map((a) => a.id);
  await del(() => prisma.auditEntry.deleteMany({ where: { id: { in: auditIds } } }));
  await del(() => prisma.event.deleteMany({ where: { id: { in: evIds } } }));
  const sessionIds = (
    await prisma.session.findMany({
      where: { userId: { in: created.users } },
      select: { id: true },
    })
  ).map((s) => s.id);
  await del(() => prisma.session.deleteMany({ where: { id: { in: sessionIds } } }));
  await del(() => prisma.person.deleteMany({ where: { id: { in: created.people } } }));
  await del(() => prisma.user.deleteMany({ where: { id: { in: created.users } } }));
}

// ══ U — CONTROL ══════════════════════════════════════════════════════════════
function layerU() {
  section('U — CONTROL: what this ticket must not touch');
  const missing = NOT_TOUCHED.filter((f) => !fs.existsSync(path.join(ROOT, f)));
  assert(
    'U',
    `U1 the ${NOT_TOUCHED.length} untouched paths exist and are not edited since the base (347fb10): routes, schema, src/lib (auth, press, AI, households, email, Moment 3's rules and the pre-flight's included; its one new-words file asked in U4), the guest page, the new-event page, the strip and the lockfile; the paying page, which GTC-407 edits, not between the base and GTC-407’s base (1b8bfe7); the guest page’s page.tsx, which GTC-409 restyles, not between the base and GTC-409’s base (b05cac3); and the three files GTC-411 edits, not between the base and GTC-411’s base (7597112), and the rule’s file it adds, not there`,
    missing.length === 0 &&
      git([
        'diff',
        '--quiet',
        BASE,
        '--',
        ...NOT_TOUCHED,
        ...NOT_TOUCHED_EXCEPT,
        ...NOT_TOUCHED_TILL_GTC407.map((f) => `:(exclude)${f}`),
        ...NOT_TOUCHED_TILL_GTC409.map((f) => `:(exclude)${f}`),
        ...[...NOT_TOUCHED_TILL_GTC411, ...NEW_IN_GTC411].map((f) => `:(exclude)${f}`),
      ]).status === 0 &&
      git(['diff', '--quiet', BASE, GTC407_BASE, '--', ...NOT_TOUCHED_TILL_GTC407]).status === 0 &&
      git(['cat-file', '-e', `${GTC409_BASE}:${NOT_TOUCHED_TILL_GTC409[0]}`]).status === 0 &&
      git(['diff', '--quiet', BASE, GTC409_BASE, '--', ...NOT_TOUCHED_TILL_GTC409]).status === 0 &&
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
    missing.length ? `missing: ${missing.join(', ')}` : undefined
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
    `U2 package.json at the commit that added this suite (${addCommit.slice(0, 7) || 'none yet'}) differs from the base by "${NEW_SCRIPT}" and nothing else`,
    addCommit.length === 40 &&
      CHECKS.oneScriptLine(atRef(addCommit, 'package.json'), atRef(BASE, 'package.json'))
  );
  const tracked = UNTRACKED_SCRIPTS.filter(
    (f) => git(['log', '--oneline', `${BASE}..HEAD`, '--', f]).stdout.trim().length > 0
  );
  assert(
    'U',
    'U3 neither scripts/dev-login.ts nor scripts/print-host-link.ts is in any commit since the base',
    tracked.length === 0,
    tracked.join(', ')
  );
  assert(
    'U',
    'U4 src/lib/moment3/words.ts, the one src/lib file this ticket may change, only grew: everything it held at the base is still there, first and unchanged (M3_WORDS and its functions as they were)',
    CHECKS.onlyGrew(read(WORDS_FILE), atRef(BASE, WORDS_FILE))
  );
}

async function main() {
  layerS();
  layerR();
  await layerC();
  layerU();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (reds.length) console.log(reds.map((r) => `  - ${r}`).join('\n'));
}

// A dry run imports CHECKS only (DEMO_TWEAKS_8_DRY_RUN=1); the suite runs otherwise.
if (process.env.DEMO_TWEAKS_8_DRY_RUN !== '1') {
  main()
    .catch(async (e) => {
      console.error(e);
      failed++;
      await cleanup();
    })
    .finally(async () => {
      await prisma.$disconnect();
      process.exit(failed > 0 ? 1 : 0);
    });
}
