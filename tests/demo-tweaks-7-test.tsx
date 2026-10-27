/**
 * [[GTC-405]] — A DISH'S OWN DROP-OFF, THE GUEST'S CARD, AND WHO SEES "CRITICAL" (THE LIGHT PATH):
 * ticket 3 of the four from the planning report ("NOTE 1, part A: the fields and the guest page"),
 * with the founder's rulings of 26 Oct 2026. Screens and words only.
 *
 * THE RULINGS THIS SUITE PINS
 *   1  A dish has its own drop-off place and time, typed by the host as free text in Moment 2's edit
 *      box: "Drop-off place" (hint "e.g. the back door") and "Drop-off time" (hint "e.g. 11am"). The
 *      place is stored in dropOffLocation, the time in dropOffNote. No clock time, no dropOffAt, no
 *      route change. An empty box clears (null, never an empty string).
 *   2  Typed in Moment 2's edit box only; NOT the Add item form.
 *   3  On the guest's card, a dish with no place and no time of its own shows the event's line, in
 *      the words already ruled (GTC-395): "Drop off at Riverside Park, 12:00pm to 4:00pm". A dish
 *      with either of its own shows its own, not the event's line. No venue: no line.
 *   4  The red "CRITICAL" badge no longer shows to a guest. A host (the guest link's preview) and a
 *      coordinator still see it.
 *   5  Moment 2's edit box calls the dish's note "Note for the guest".
 *
 * THE LAYERS
 *   S  the source: the new words and the save in the edit box; the setup page passes both on through
 *      the same PATCH; the Add item form and its save as at the base; the guest page adds no fetch
 *      and no field, takes the line from eventDropOffLine, draws "CRITICAL" only in the host's
 *      preview; the coordinator's and host's screens that draw it are as at the base.
 *   R  the edit box, rendered: the two boxes with their labels and hints, filled from the dish, under
 *      the others; "Note for the guest"; a job has no drop-off boxes; Add item has none of it.
 *   P  the "why" rule, as the route has it (GTC-183), for the record: a drop-off change on a dish
 *      someone answered, on a sent event, is T4; otherwise nothing is asked.
 *   C  the dev server in the walled-off headless Chrome (port 9487), at 1280, on a fixture of its
 *      own: Moment 2's edit box (fill, save, a save that leaves them alone, clear), the guest's
 *      cards (with and without their own drop-off, with no venue), the host's preview of the guest
 *      link and the coordinator's page. Behind the plan-making and send walls, proven on probe URLs
 *      first; every click guarded. A script in each page records the page's own requests.
 *   K  CONTROL: nothing blocked but the probes, no dialog, no click refused; the setup page wrote
 *      only the three saves; no AI call, nothing queued, every fixture row removed by id, the
 *      invite and outbound totals as found.
 *   U  CONTROL: routes, schema, src/lib, the new-event page, the strip and the lockfile not edited
 *      since the base; package.json (at the commit that added this suite) differs by its one script
 *      line; the two untracked scripts are in no commit.
 *
 * Every live condition lives in CHECKS, so it can be dry-run on a passing and a failing input
 * (DEMO_TWEAKS_7_DRY_RUN=1 imports CHECKS only). Every fixture and expected value is written here by
 * hand, never taken from the code under test.
 *
 * Needs the dev server on :3000 (GTC405_BASE_URL points it elsewhere, for the break proofs) and a
 * global WebSocket (NODE_OPTIONS=--experimental-websocket).
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { randomBytes } from 'crypto';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { prisma } from '../src/lib/prisma';
import * as PV from '../src/components/plan/Moment2PlanView';
import { whyTrigger, type PendingChange } from '../src/lib/ledger';
import type { LifecycleEvent } from '../src/lib/lifecycle';
import { installProviderTrap } from './helpers/provider-trap';
import { openHeadless, type Headless } from './helpers/headless';

const realFetch = globalThis.fetch;
installProviderTrap();

const ROOT = path.join(__dirname, '..');
const BASE_URL = process.env.GTC405_BASE_URL ?? 'http://localhost:3000';
const PORT = 9487;
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
const flat = (s: string) => s.replace(/\s+/g, '');
/** [[GTC-406]] — a block's lines with their shared indent taken off (the first starts at its marker). */
const dedent = (s: string) => {
  const lines = s.split('\n');
  const rest = lines.slice(1).filter((l) => l.trim().length > 0);
  const n = rest.length ? Math.min(...rest.map((l) => l.length - l.trimStart().length)) : 0;
  return [lines[0], ...lines.slice(1).map((l) => l.slice(n))].join('\n');
};

// ── The ruled words, typed by hand ───────────────────────────────────────────
const PLACE_LABEL = 'Drop-off place';
const PLACE_HINT = 'e.g. the back door';
const TIME_LABEL = 'Drop-off time';
const TIME_HINT = 'e.g. 11am';
const NOTE_LABEL = 'Note for the guest';
const OLD_NOTE_LABEL = 'Notes';
/** The edit box's labels before this ticket's two, in order (Name, Quantity, Serves, the note). */
const EARLIER_LABELS = ['Name', 'Quantity', 'Serves', NOTE_LABEL];
/** The event's line, GTC-395's words, for Riverside Park from 12:00pm to 4:00pm. */
const EVENT_LINE = 'Drop off at Riverside Park, 12:00pm to 4:00pm';
/** DropOffDisplay's own words for a dish's own place and time. */
const OWN_PLACE = 'Drop-off:';
const OWN_TIME = 'By:';
const CRITICAL = 'CRITICAL';
const PREVIEW_HEADING = 'Link checked, good to send';
const EV2_NAME = 'GTC-405 — the guest card';

// ── Files and commits ────────────────────────────────────────────────────────
const SUITE = 'tests/demo-tweaks-7-test.tsx';
const PLAN_VIEW = 'src/components/plan/Moment2PlanView.tsx';
const SETUP = 'src/app/plan/[eventId]/setup/page.tsx';
const GUEST = 'src/app/p/[token]/page.tsx';
/** GTC-404's last commit (its ticket), where this ticket started: a fixed commit. */
const BASE = 'c593d220a7390c3fc417739fd9c709c84d0be8c3';
const NEW_SCRIPT = 'test:demo-tweaks-7';
const NEW_SCRIPT_VALUE =
  'NODE_OPTIONS=--experimental-websocket tsx --tsconfig tests/tsconfig.json tests/demo-tweaks-7-test.tsx';
const UNTRACKED_SCRIPTS = ['scripts/dev-login.ts', 'scripts/print-host-link.ts'];
/**
 * [[GTC-406]] adds Moment 3's new words to src/lib/moment3/words.ts on purpose (the Details box and
 * the amber tag), so U1 keeps that one file out of its live diff of src/lib and asks it instead at
 * GTC-406's base (347fb10), a fixed commit: this ticket still may not have touched it.
 * test:demo-tweaks-8 U4 asks that the file only grew.
 */
const GTC406_BASE = '347fb109403f43c767e64fdf29efa0c861808bb9';
const NOT_TOUCHED_TILL_GTC406 = ['src/lib/moment3/words.ts'];
/**
 * [[GTC-407]] edits the paying page on purpose (after payment: the 409 screen, "Try Again" with
 * the same receipt, the support address), so U1 asks its question of it at GTC-407's base
 * (1b8bfe7), a fixed commit: this ticket still may not have touched it. GTC-407's own suite
 * (test:demo-tweaks-9) pins its new state. It is kept out of the live diff of src/app/plan/new,
 * which stays listed and still covers anything else that appears there.
 */
const GTC407_BASE = '1b8bfe7b8a9b7540ef582fff9be031b37e325b8c';
const NOT_TOUCHED_TILL_GTC407 = ['src/app/plan/new/page.tsx'];
/** The founder's untouched list for this ticket, read as it is now against the base. */
const NOT_TOUCHED = [
  'src/app/api',
  'prisma',
  'src/lib',
  'src/app/plan/new', // but page.tsx (GTC-407; see NOT_TOUCHED_TILL_GTC407)
  'src/components/plan/MomentArc.tsx',
  'package-lock.json',
];
/**
 * [[GTC-409]] restyles the coordinator page and the host's team page on purpose (class names only:
 * Grid view two across at most, and the team page's long-word guard), so S7 asks its "not edited"
 * question of those two at GTC-409's base (b05cac3), a fixed commit: this ticket still may not have
 * touched them. Their badges are still counted as they are now; the other two files stay in the
 * live diff. GTC-409's own suite (test:demo-tweaks-11) pins their new state.
 */
const GTC409_BASE = 'b05cac341e28ca1a3bdea5966f71015553cb98a4';
const NOT_TOUCHED_TILL_GTC409 = [
  'src/app/c/[token]/page.tsx',
  'src/app/h/[token]/team/[teamId]/page.tsx',
];
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
/**
 * [[GTC-413]] moves ONE lockfile entry on purpose (the founder's ruling of 28 Oct 2026): qs from
 * 6.16.0 to 6.16.1, the named fix for GHSA-6pq8-jhm2-2vcw, by its version, resolved and integrity
 * only. The lockfile is still asked of the base as strictly as before, but for that one entry:
 * byte for byte it is the base's text with only those three values changed; parsed, with
 * node_modules/qs removed on both sides, the two are equal; and that entry is the base's 6.16.0
 * entry with exactly those three fields set to 6.16.1's, nothing added and nothing else moved.
 */
const QS_NODE = 'node_modules/qs';
const QS_FROM = '6.16.0';
const QS_TO = {
  version: '6.16.1',
  resolved: 'https://registry.npmjs.org/qs/-/qs-6.16.1.tgz',
  integrity:
    'sha512-5Px6J7rfHBAGUhNQ3es4YzcOdBBw0SDcVtThJml4RdnKw4tKs2epA0kPZ+K8X+WiHktT93RHVcQ/3ym5aTCgtg==',
};
/** The lockfile now is the base's but for the one qs entry, which says 6.16.1 and nothing else. */
function lockfileIsBaseButQs(now: string, base: string): boolean {
  let a: any;
  let b: any;
  try {
    a = JSON.parse(now);
    b = JSON.parse(base);
  } catch {
    return false;
  }
  const qsNow = a?.packages?.[QS_NODE];
  const qsBase = b?.packages?.[QS_NODE];
  if (!qsNow || !qsBase || qsBase.version !== QS_FROM) return false;
  const restNow = { ...a, packages: { ...a.packages } };
  const restBase = { ...b, packages: { ...b.packages } };
  delete restNow.packages[QS_NODE];
  delete restBase.packages[QS_NODE];
  const sameRest = JSON.stringify(restNow) === JSON.stringify(restBase);
  const qsSays = JSON.stringify(qsNow) === JSON.stringify({ ...qsBase, ...QS_TO });
  const three = (e: { version: string; resolved: string; integrity: string }) =>
    `"${QS_NODE}": {\n      "version": "${e.version}",\n      "resolved": "${e.resolved}",\n      "integrity": "${e.integrity}",\n`;
  const sameText =
    base.split(three(qsBase)).length === 2 && now === base.split(three(qsBase)).join(three(QS_TO));
  return sameRest && qsSays && sameText;
}
/** Where a host or a coordinator sees "CRITICAL" today, and how many times each file draws it. */
const CRITICAL_ELSEWHERE: Array<[string, number]> = [
  ['src/app/c/[token]/page.tsx', 2],
  ['src/app/h/[token]/team/[teamId]/page.tsx', 1],
  ['src/app/plan/[eventId]/page.tsx', 1],
  ['src/components/plan/RegenerationPreview.tsx', 2],
];

/** One labelled box in the edit box, as drawn: its label, and its input's value and hint. */
export interface Field {
  label: string;
  value: string | null;
  placeholder: string | null;
}
/** What one PATCH sent, as the page recorded it. */
export interface Sent {
  m: string;
  u: string;
  b: string | null;
}
/** A guest's dish card as drawn. */
export interface Card {
  text: string;
  critical: boolean;
  /** DropOffDisplay's words after "Drop-off:" and "By:", or null when not drawn. */
  place: string | null;
  time: string | null;
}
/** A dish's stored drop-off. */
export interface Stored {
  dropOffLocation: string | null;
  dropOffNote: string | null;
  dropOffAt: Date | string | null;
}

/** The labelled boxes in rendered markup, in order. */
export function fieldsOf(html: string): Field[] {
  const out: Field[] = [];
  const attr = (tag: string, name: string) => {
    const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
    return m ? m[1] : null;
  };
  for (const m of html.matchAll(
    /<label class="block"><span[^>]*>([^<]*)<\/span>([\s\S]*?)<\/label>/g
  )) {
    const input = /<input\b[^>]*>/.exec(m[2]);
    out.push({
      label: m[1],
      value: input ? attr(input[0], 'value') : null,
      placeholder: input ? attr(input[0], 'placeholder') : null,
    });
  }
  return out;
}

// ── CHECKS ───────────────────────────────────────────────────────────────────
export const CHECKS = {
  // ── Render ──
  /** R1/R2 — a dish: the earlier boxes, then (after the ticks, if any) the place and time with their hints, filled as given; the Save button after them. */
  dishBox(html: string, place: string, time: string, note: string, ticks: boolean) {
    const f = fieldsOf(html);
    const labels = f.map((x) => x.label);
    const p = f.find((x) => x.label === PLACE_LABEL);
    const t = f.find((x) => x.label === TIME_LABEL);
    const n = f.find((x) => x.label === NOTE_LABEL);
    const at = (w: string) => html.indexOf(`>${w}</span>`);
    return (
      JSON.stringify(labels) === JSON.stringify([...EARLIER_LABELS, PLACE_LABEL, TIME_LABEL]) &&
      !!p &&
      !!t &&
      !!n &&
      p.value === place &&
      p.placeholder === PLACE_HINT &&
      t.value === time &&
      t.placeholder === TIME_HINT &&
      n.value === note &&
      html.includes('data-dish-ticks') === ticks &&
      (ticks ? html.indexOf('data-dish-ticks') < at(PLACE_LABEL) : true) &&
      at(NOTE_LABEL) < at(PLACE_LABEL) &&
      at(PLACE_LABEL) < at(TIME_LABEL) &&
      html.indexOf('>Save</button>') > at(TIME_LABEL)
    );
  },
  /** R3 — a job: no drop-off boxes; the note's new label still there. */
  jobBox(html: string) {
    const labels = fieldsOf(html).map((x) => x.label);
    return (
      labels.includes('Name') &&
      labels.includes(NOTE_LABEL) &&
      !labels.includes(PLACE_LABEL) &&
      !labels.includes(TIME_LABEL) &&
      !html.includes(PLACE_HINT) &&
      !html.includes(TIME_HINT)
    );
  },
  /** R4 — the old label is gone from the edit box; the Add item form has none of the new boxes or words. */
  oldLabelGone(editHtml: string[], addHtml: string[]) {
    return (
      editHtml.length >= 2 &&
      addHtml.length >= 2 &&
      editHtml.every((h) => h.length > 0 && !fieldsOf(h).some((x) => x.label === OLD_NOTE_LABEL)) &&
      addHtml.every(
        (h) =>
          h.includes('>Name</span>') &&
          ![PLACE_LABEL, TIME_LABEL, NOTE_LABEL, PLACE_HINT, TIME_HINT].some((w) => h.includes(w))
      )
    );
  },

  // ── Live: Moment 2 ──
  /** C1 — the open box: both boxes with labels and hints, filled from the dish; the note under its new label. */
  boxFilled(fields: Field[] | null, place: string, time: string, note: string) {
    if (!fields) return false;
    const get = (l: string) => fields.find((x) => x.label === l);
    return (
      get(PLACE_LABEL)?.value === place &&
      get(PLACE_LABEL)?.placeholder === PLACE_HINT &&
      get(TIME_LABEL)?.value === time &&
      get(TIME_LABEL)?.placeholder === TIME_HINT &&
      get(NOTE_LABEL)?.value === note &&
      !get(OLD_NOTE_LABEL)
    );
  },
  /** C2 — the save: one PATCH to the dish's own route; next to a save that left the boxes alone, it sends dropOffLocation and dropOffNote as typed and nothing else new, no dropOffAt. */
  savedBody(changed: Sent[], control: Sent[], itemPath: string, place: string, time: string) {
    if (changed.length !== 1 || control.length !== 1) return false;
    try {
      const a = JSON.parse(changed[0].b ?? '');
      const c = JSON.parse(control[0].b ?? '');
      const added = Object.keys(a)
        .filter((k) => !(k in c))
        .sort();
      return (
        changed[0].m === 'PATCH' &&
        changed[0].u.endsWith(itemPath) &&
        JSON.stringify(added) === JSON.stringify(['dropOffLocation', 'dropOffNote']) &&
        Object.keys(c).every((k) => k in a) &&
        a.dropOffLocation === place &&
        a.dropOffNote === time &&
        !('dropOffAt' in a)
      );
    } catch {
      return false;
    }
  },
  /** C3 — a save that left both boxes alone sends neither (and no dropOffAt). */
  leftAlone(control: Sent[], itemPath: string) {
    if (control.length !== 1) return false;
    try {
      const c = JSON.parse(control[0].b ?? '');
      return (
        control[0].m === 'PATCH' &&
        control[0].u.endsWith(itemPath) &&
        typeof c.name === 'string' &&
        !('dropOffLocation' in c) &&
        !('dropOffNote' in c) &&
        !('dropOffAt' in c)
      );
    } catch {
      return false;
    }
  },
  /** C4 — both boxes emptied: both sent as null (never an empty string), no dropOffAt. */
  clearedBody(sent: Sent[], itemPath: string) {
    if (sent.length !== 1) return false;
    try {
      const a = JSON.parse(sent[0].b ?? '');
      return (
        sent[0].m === 'PATCH' &&
        sent[0].u.endsWith(itemPath) &&
        'dropOffLocation' in a &&
        'dropOffNote' in a &&
        a.dropOffLocation === null &&
        a.dropOffNote === null &&
        !('dropOffAt' in a)
      );
    } catch {
      return false;
    }
  },
  /** The dish as stored: the place and time as given, no clock time. */
  storedAs(row: Stored | null, place: string | null, time: string | null) {
    return (
      !!row &&
      row.dropOffLocation === place &&
      row.dropOffNote === time &&
      (row.dropOffAt === null || row.dropOffAt === undefined)
    );
  },
  /** The row as drawn after the save: DropOffDisplay's place and time (null: not drawn). */
  rowShows(
    row: { place: string | null; time: string | null } | null,
    place: string | null,
    time: string | null
  ) {
    return !!row && row.place === place && row.time === time;
  },

  // ── Live: the guest ──
  /** C5 — no drop-off of its own: the event's line, once; nothing of DropOffDisplay. */
  eventLineCard(c: Card | null) {
    return (
      !!c &&
      count(c.text, EVENT_LINE) === 1 &&
      c.place === null &&
      c.time === null &&
      !c.text.includes(OWN_PLACE)
    );
  },
  /** C6 — its own place or time: its own words, and not the event's line. */
  ownCard(c: Card | null, place: string | null, time: string | null) {
    return !!c && c.place === place && c.time === time && !c.text.includes('Drop off at');
  },
  /** C7 — an event with no venue or times: neither line on the card. */
  noLineCard(c: Card | null) {
    return (
      !!c &&
      c.text.length > 0 &&
      c.place === null &&
      c.time === null &&
      !/Drop off|Drop-off|By:/.test(c.text)
    );
  },
  /** C8 — a guest sees no "CRITICAL" anywhere: not on a card, not on the page. */
  guestNoCritical(cards: (Card | null)[], pageHits: number[]) {
    return (
      cards.length >= 4 &&
      cards.every((c) => !!c && !c.critical && !c.text.includes(CRITICAL)) &&
      pageHits.length >= 2 &&
      pageHits.every((n) => n === 0)
    );
  },
  /** C9 — the host's preview of the same link: its heading, and "CRITICAL" beside the critical dish only. */
  hostSees(
    p: { heading: boolean; rows: { name: string; critical: boolean }[] } | null,
    critical: string,
    others: string[]
  ) {
    if (!p || !p.heading) return false;
    const row = (n: string) => p.rows.find((r) => r.name === n);
    return (
      row(critical)?.critical === true &&
      others.length > 0 &&
      others.every((n) => row(n)?.critical === false)
    );
  },
  /** C10 — the coordinator's page: "CRITICAL" beside the critical dish only. */
  coordinatorSees(
    rows: { name: string; critical: boolean }[] | null,
    critical: string,
    others: string[]
  ) {
    if (!rows) return false;
    const row = (n: string) => rows.find((r) => r.name === n);
    return row(critical)?.critical === true && others.every((n) => row(n)?.critical === false);
  },
  /** C11 — the guest page asked the server for one thing, its own read; and the top still names the venue. */
  oneRead(calls: Sent[], token: string, top: string) {
    return (
      calls.length === 1 &&
      calls[0].m === 'GET' &&
      calls[0].u.endsWith(`/api/p/${token}`) &&
      top.includes('📍 Riverside Park')
    );
  },

  // ── Source ──
  /** S1 — the edit box's code: the two boxes' words, the note's new label, the old one gone; each sent only when changed, an empty box as null, never dropOffAt. */
  editBoxCode(box: string) {
    return (
      box.length > 1000 &&
      box.includes(`label="${PLACE_LABEL}"`) &&
      box.includes(`placeholder="${PLACE_HINT}"`) &&
      box.includes(`label="${TIME_LABEL}"`) &&
      box.includes(`placeholder="${TIME_HINT}"`) &&
      box.includes(`label="${NOTE_LABEL}"`) &&
      !box.includes(`label="${OLD_NOTE_LABEL}"`) &&
      /const place = dropOffPlace\.trim\(\) \|\| null;/.test(box) &&
      /const time = dropOffTime\.trim\(\) \|\| null;/.test(box) &&
      /\{ dropOffLocation: place \}/.test(box) &&
      /\{ dropOffNote: time \}/.test(box) &&
      !/dropOffAt/.test(box)
    );
  },
  /**
   * S2 — the setup page passes both on to the same PATCH, its request byte for byte as at the base.
   * [[GTC-406]] ruling 6: Moment 2's save (the body, the why and the PATCH) moved whole into the
   * page's one item save, `saveItemEdit`, which onUpdateItem calls and Moment 3's box shares. The
   * request is still asked byte for byte, but for the block's own indent (`dedent`: one shift for
   * every line); the two fields are asked in that save, and onUpdateItem must call it.
   */
  setupSave(now: string, base: string) {
    const patch = (src: string) =>
      between(src, 'const res = await fetch(`/api/events/${eventId}/items/${itemId}`, {', '});');
    const save = between(now, 'const saveItemEdit = async (', 'return true;');
    const onUpdate = between(now, 'onUpdateItem={async (itemId, updates) => {', 'onRemoveItem=');
    return (
      patch(base).length > 50 &&
      dedent(patch(now)) === dedent(patch(base)) &&
      patch(now).includes("method: 'PATCH'") &&
      save.includes(patch(now)) &&
      /body\.dropOffLocation\s*=\s*updates\.dropOffLocation;/.test(save) &&
      /body\.dropOffNote\s*=\s*updates\.dropOffNote;/.test(save) &&
      !/dropOffAt/.test(save) &&
      /saveItemEdit\(itemId, updates\)/.test(onUpdate) &&
      !/dropOffAt/.test(onUpdate)
    );
  },
  /** S3 — ruling 2: the Add item form, and the setup page's add-item save, as at the base. */
  addKept(planNow: string, planBase: string, setupNow: string, setupBase: string) {
    const form = (src: string) => between(src, 'export function AddItemForm(', '\nfunction ');
    const add = (src: string) =>
      between(src, 'onAddItem={async (categoryId, newItem) => {', 'onAddCategory=');
    return (
      form(planBase).length > 1000 &&
      flat(form(planNow)) === flat(form(planBase)) &&
      add(setupBase).length > 300 &&
      flat(add(setupNow)) === flat(add(setupBase))
    );
  },
  /** S4 — the guest page: no new fetch, no new field (its three shapes as at the base). */
  guestNoNewRead(now: string, base: string) {
    const shape = (src: string, name: string) => between(src, `interface ${name} {`, '\n}\n');
    return (
      count(base, 'fetch(') >= 1 &&
      count(now, 'fetch(') === count(base, 'fetch(') &&
      ['HostPreviewData', 'Assignment', 'CarriedChild', 'ParticipantData'].every(
        (n) => shape(base, n).length > 50 && shape(now, n) === shape(base, n)
      )
    );
  },
  /** S5 — the line's words come from eventDropOffLine, as it is; not the shared component; no words of its own. */
  guestHelper(now: string) {
    return (
      now.includes("import { eventDropOffLine } from '@/lib/items/drop-off-words';") &&
      count(now, 'eventDropOffLine(') === 1 &&
      /eventDropOffLine\(data\.event\)/.test(now) &&
      !now.includes('EventDropOffLine') &&
      !now.includes('Drop off at')
    );
  },
  /** S6 — "CRITICAL" is drawn once, in the host's preview; the guest's card neither draws it nor reads the flag. */
  criticalInPreviewOnly(now: string) {
    const at = now.indexOf(CRITICAL);
    const from = now.indexOf('if (hostPreview) {');
    const to = now.indexOf('if (!data) return null;');
    const card = now.slice(now.indexOf('function AssignmentCard('));
    return (
      count(now, CRITICAL) === 1 &&
      from > 0 &&
      to > from &&
      at > from &&
      at < to &&
      card.length > 1000 &&
      !card.includes(CRITICAL) &&
      !/\.critical\b/.test(card)
    );
  },

  /** S7 — how many times a file's code draws the badge: "CRITICAL" as an element's own text (not CRITICAL_GAP and the like). */
  badges(code: string) {
    return (code.match(/>\s*CRITICAL\s*</g) ?? []).length;
  },

  // ── The "why" rule (P) ──
  /** P1 — what the route's rule asks for a drop-off change, by the answer the dish has. */
  whyRule(r: Record<string, string | null>) {
    return (
      ['ACCEPTED', 'DECLINED', 'MAYBE'].every(
        (x) => r[`dropOffLocation ${x}`] === 'T4' && r[`dropOffNote ${x}`] === 'T4'
      ) &&
      r['dropOffLocation PENDING'] === null &&
      r['dropOffNote PENDING'] === null &&
      r['dropOffLocation none'] === null &&
      r['dropOffLocation unsent'] === null &&
      r['dropOffNote unsent'] === null
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
};
// ── CHECKS-END ───────────────────────────────────────────────────────────────

const editBoxOf = (src: string) =>
  between(src, 'export function ItemEditForm(', 'interface AddItemFormProps');

// ══ S — the source ═══════════════════════════════════════════════════════════
function layerS() {
  section('S — the source: the edit box and its save, the Add item form, the guest page');
  const planNow = stripComments(read(PLAN_VIEW));
  const planBase = stripComments(atRef(BASE, PLAN_VIEW));
  const setupNow = stripComments(read(SETUP));
  const setupBase = stripComments(atRef(BASE, SETUP));
  const guestNow = stripComments(read(GUEST));
  const guestBase = stripComments(atRef(BASE, GUEST));
  assert(
    'S',
    'S1 the edit box’s code: "Drop-off place" (hint "e.g. the back door"), "Drop-off time" (hint "e.g. 11am"), "Note for the guest", no "Notes"; each sent only as typed or null, never dropOffAt (rulings 1 and 5)',
    CHECKS.editBoxCode(editBoxOf(planNow))
  );
  assert(
    'S',
    'S2 the setup page passes the place and the time on as dropOffLocation and dropOffNote, through the same PATCH, its request byte for byte as at the base (c593d22; since GTC-406 in the page’s one item save, which onUpdateItem calls, moved as a block); no dropOffAt (ruling 1)',
    CHECKS.setupSave(setupNow, setupBase)
  );
  assert(
    'S',
    'S3 the Add item form and the setup page’s add-item save are as at the base: nothing typed there, its route untouched (ruling 2)',
    CHECKS.addKept(planNow, planBase, setupNow, setupBase)
  );
  assert(
    'S',
    'S4 the guest page makes no new request and holds no new field: the same number of fetch calls and its four data shapes as at the base (ruling 3)',
    CHECKS.guestNoNewRead(guestNow, guestBase)
  );
  assert(
    'S',
    'S5 the guest page takes the line from eventDropOffLine (src/lib/items/drop-off-words, used as it is), with the event it already holds; not the shared EventDropOffLine component; no drop-off words of its own (ruling 3)',
    CHECKS.guestHelper(guestNow)
  );
  assert(
    'S',
    'S6 on the guest page "CRITICAL" is drawn once, inside the host’s preview of the link; the guest’s card neither draws it nor reads the flag (ruling 4)',
    CHECKS.criticalInPreviewOnly(guestNow)
  );
  const others = CRITICAL_ELSEWHERE.map(([f, n]) => ({
    f,
    n,
    got: CHECKS.badges(stripComments(read(f))),
  }));
  assert(
    'S',
    `S7 CONTROL: where a host or a coordinator sees "CRITICAL" today (the coordinator’s page twice, the host’s team page, the old dashboard, the regeneration preview twice) is as at the base and still draws it (ruling 4); the coordinator’s page and the team page, which GTC-409 restyles, not between the base and GTC-409’s base (b05cac3)`,
    others.every((o) => o.got === o.n) &&
      git([
        'diff',
        '--quiet',
        BASE,
        '--',
        ...CRITICAL_ELSEWHERE.map(([f]) => f).filter((f) => !NOT_TOUCHED_TILL_GTC409.includes(f)),
      ]).status === 0 &&
      NOT_TOUCHED_TILL_GTC409.every(
        (f) => git(['cat-file', '-e', `${GTC409_BASE}:${f}`]).status === 0
      ) &&
      git(['diff', '--quiet', BASE, GTC409_BASE, '--', ...NOT_TOUCHED_TILL_GTC409]).status === 0,
    JSON.stringify(others)
  );
}

// ══ R — the edit box, rendered ═══════════════════════════════════════════════
function layerR() {
  section('R — the edit box, rendered');
  const EditForm = (PV as any).ItemEditForm;
  const AddForm = (PV as any).AddItemForm;
  const render = (el: unknown) => {
    try {
      return renderToStaticMarkup(el as any);
    } catch (e) {
      console.error('    render threw:', (e as Error).message.split('\n')[0]);
      return '';
    }
  };
  const edit = (item: Record<string, unknown>, showMarks: boolean) =>
    EditForm
      ? render(
          createElement(EditForm, {
            item,
            showMarks,
            onSave: async () => {},
            onCancel: () => {},
            onRemove: async () => {},
          })
        )
      : '';
  const add = (marksAllowed: boolean) =>
    AddForm
      ? render(createElement(AddForm, { marksAllowed, onAdd: async () => {}, onCancel: () => {} }))
      : '';
  const dish = {
    id: 'i1',
    name: 'Roast lamb',
    quantity: 2,
    unit: 'trays',
    servingSize: '',
    kind: 'ITEM',
    notes: 'Use the big dish',
    dropOffLocation: 'the back door',
    dropOffNote: '11am',
  };
  const bare = {
    id: 'i2',
    name: 'Green salad',
    quantity: 1,
    unit: 'bowls',
    servingSize: '',
    kind: 'ITEM',
  };
  const job = {
    id: 'i3',
    name: 'Set the tables',
    quantity: 0,
    unit: '',
    servingSize: '',
    kind: 'TASK',
  };
  const withPlace = edit(dish, true);
  const empty = edit(bare, false);
  const jobHtml = edit(job, false);
  assert(
    'R',
    'R1 a food dish with its own: under Name, Quantity, Serves, "Note for the guest" and the ticks come "Drop-off place" holding "the back door" and "Drop-off time" holding "11am", each with its hint; Save after them (rulings 1 and 5)',
    CHECKS.dishBox(withPlace, 'the back door', '11am', 'Use the big dish', true),
    JSON.stringify(fieldsOf(withPlace))
  );
  assert(
    'R',
    'R2 a dish with none (not food, so no ticks): both boxes empty, showing "e.g. the back door" and "e.g. 11am" (ruling 1)',
    CHECKS.dishBox(empty, '', '', '', false),
    JSON.stringify(fieldsOf(empty))
  );
  assert(
    'R',
    'R3 a job (not dropped off): no drop-off boxes; "Note for the guest" still there',
    CHECKS.jobBox(jobHtml),
    JSON.stringify(fieldsOf(jobHtml))
  );
  assert(
    'R',
    'R4 "Notes" is gone from the edit box; the Add item form (food and not) has none of the new boxes or words (rulings 2 and 5)',
    CHECKS.oldLabelGone([withPlace, empty, jobHtml], [add(true), add(false)])
  );
}

// ══ P — the "why" rule, for the record ═══════════════════════════════════════
function layerP() {
  section('P — the "why" rule (GTC-183) for a drop-off change, as the route has it');
  const SENT: LifecycleEvent = {
    status: 'CONFIRMING',
    sentAt: new Date('2026-10-01T09:00:00.000Z'),
    endDate: new Date('2026-12-25T12:00:00.000Z'),
  };
  const UNSENT: LifecycleEvent = { ...SENT, sentAt: null };
  const change = (field: string, response: string | null): PendingChange =>
    ({
      action: 'EDIT_ITEM',
      targetType: 'Item',
      targetId: 'i1',
      field,
      context: { assignmentResponse: response },
    }) as PendingChange;
  const r: Record<string, string | null> = {};
  for (const field of ['dropOffLocation', 'dropOffNote']) {
    for (const x of ['ACCEPTED', 'DECLINED', 'MAYBE', 'PENDING'])
      r[`${field} ${x}`] = whyTrigger(change(field, x), SENT);
    r[`${field} none`] = whyTrigger(change(field, null), SENT);
    r[`${field} unsent`] = whyTrigger(change(field, 'ACCEPTED'), UNSENT);
  }
  assert(
    'P',
    'P1 a drop-off place or time changed on a dish someone answered (yes, no or maybe), on a sent event, asks why (T4); asked but not answered, nobody holding it, or not yet sent: nothing asked',
    CHECKS.whyRule(r),
    JSON.stringify(r)
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

/** The open edit box: the form holding a "Name" box and a "Save" button. */
const FORM = `(() => [...document.querySelectorAll('div.border')].find((d) =>
  [...d.querySelectorAll(':scope > label.block > span')].some((s) => s.textContent.trim() === 'Name') &&
  [...d.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Save')) || null)`;
/** Its labelled boxes (Field[]), or null when no box is open. */
const BOX_FIELDS = `(() => { const f = ${FORM}(); if (!f) return null;
  return [...f.querySelectorAll('label.block')].filter((l) => l.firstElementChild && l.firstElementChild.tagName === 'SPAN').map((l) => {
    const i = l.querySelector('input');
    return { label: l.firstElementChild.textContent.trim(), value: i ? i.value : null, placeholder: i ? i.getAttribute('placeholder') : null };
  }); })()`;
/** Type into the box labelled `label` as React reads typing (the native setter and an input event). */
const SET = (label: string, value: string) => `(() => { const f = ${FORM}(); if (!f) return false;
  const l = [...f.querySelectorAll('label.block')].find((x) => x.firstElementChild && x.firstElementChild.textContent.trim() === ${JSON.stringify(label)});
  const i = l && l.querySelector('input'); if (!i) return false;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify(value)});
  i.dispatchEvent(new Event('input', { bubbles: true }));
  return i.value === ${JSON.stringify(value)}; })()`;
/** Mark the row's own "Edit" (up from the dish's name to the row holding it). */
const MARK_EDIT = (
  name: string
) => `(() => { document.querySelectorAll('[data-t]').forEach((e) => e.removeAttribute('data-t'));
  let el = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === ${JSON.stringify(name)});
  while (el && el.parentElement) { el = el.parentElement;
    const e = [...el.querySelectorAll(':scope > button')].find((b) => b.textContent.trim() === 'Edit');
    if (e) { e.setAttribute('data-t', 'x'); return true; } }
  return false; })()`;
const MARK_CANCEL = `(() => { document.querySelectorAll('[data-t]').forEach((e) => e.removeAttribute('data-t'));
  const f = ${FORM}(); if (!f) return false;
  const b = [...f.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Cancel'); if (!b) return false;
  b.setAttribute('data-t', 'x'); return true; })()`;
const MARK_SAVE = `(() => { document.querySelectorAll('[data-t]').forEach((e) => e.removeAttribute('data-t'));
  const f = ${FORM}(); if (!f) return false;
  const b = [...f.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Save'); if (!b) return false;
  b.setAttribute('data-t', 'x'); return true; })()`;
/** A Moment 2 row's drop-off as DropOffDisplay draws it: the words after "Drop-off:" and "By:". */
const ROW = (
  name: string
) => `(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === ${JSON.stringify(name)});
  const col = b && b.closest('div.flex-col'); if (!col) return null;
  const spans = [...col.querySelectorAll('span')];
  const after = (w) => { const s = spans.find((x) => x.textContent.trim() === w); return s && s.nextElementSibling ? s.nextElementSibling.textContent.trim() : null; };
  return { place: after(${JSON.stringify(OWN_PLACE)}), time: after(${JSON.stringify(OWN_TIME)}) }; })()`;
/** A guest's card (Card), found by its dish's name. */
const CARD = (
  name: string
) => `(() => { const h = [...document.querySelectorAll('h2')].find((x) => x.textContent.trim() === ${JSON.stringify(name)});
  const card = h && h.closest('div.rounded-xl'); if (!card) return null;
  const spans = [...card.querySelectorAll('span')];
  const after = (w) => { const s = spans.find((x) => x.textContent.trim() === w); return s && s.nextElementSibling ? s.nextElementSibling.textContent.trim() : null; };
  return { text: card.textContent.replace(/\\s+/g, ' ').trim(),
    critical: [...card.querySelectorAll('*')].some((e) => e.children.length === 0 && e.textContent.trim() === ${JSON.stringify(CRITICAL)}),
    place: after(${JSON.stringify(OWN_PLACE)}), time: after(${JSON.stringify(OWN_TIME)}) }; })()`;
/** How many drawn elements (not scripts) hold "CRITICAL" in their own text. */
const PAGE_CRITICAL = `[...document.body.querySelectorAll('*')].filter((e) => !['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'].includes(e.tagName) && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.includes(${JSON.stringify(CRITICAL)}))).length`;
/** The host's preview: its heading, and each dish row with or without "CRITICAL". */
const PREVIEW = `(() => ({ heading: [...document.querySelectorAll('h1')].some((h) => h.textContent.trim() === ${JSON.stringify(PREVIEW_HEADING)}),
  rows: [...document.querySelectorAll('li')].map((li) => ({ name: (li.querySelector('span.font-medium') || {}).textContent || '',
    critical: [...li.querySelectorAll('span')].some((s) => s.textContent.trim() === ${JSON.stringify(CRITICAL)}) })) }))()`;
/** The coordinator's page: each dish name span, with or without "CRITICAL" beside it. */
const COORD = `(() => [...document.querySelectorAll('span.font-semibold')].map((s) => ({ name: s.textContent.trim(),
  critical: !!s.parentElement && [...s.parentElement.querySelectorAll(':scope > span')].some((x) => x.textContent.trim() === ${JSON.stringify(CRITICAL)}) })))()`;

async function layerC() {
  section('C — live: the edit box, the guest’s cards, the host’s preview, the coordinator’s page');
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
  const mail = (l: string) => `gtc405-${l}-${stamp}@example.com`;
  const user = await prisma.user.create({ data: { email: mail('kate') } });
  created.users.push(user.id);
  const kate = await prisma.person.create({
    data: { name: 'Kate Lowe', email: user.email, userId: user.id },
  });
  created.people.push(kate.id);
  const jo = await prisma.person.create({ data: { name: 'Jo Lowe', email: mail('jo') } });
  created.people.push(jo.id);
  const rob = await prisma.person.create({ data: { name: 'Rob Tane', email: mail('rob') } });
  created.people.push(rob.id);
  const sessionToken = randomBytes(32).toString('hex');
  await prisma.session.create({
    data: { userId: user.id, token: sessionToken, expiresAt: new Date(Date.now() + 3600e3) },
  });
  const start = new Date(Date.now() + 30 * 864e5);
  const mkEvent = async (name: string, venue: Record<string, string>) => {
    const ev = await prisma.event.create({
      data: { name, startDate: start, endDate: start, hostId: kate.id, ...venue } as any,
    });
    created.events.push(ev.id);
    await prisma.eventRole.create({ data: { eventId: ev.id, userId: user.id, role: 'HOST' } });
    return ev.id;
  };
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
  const linkFor = async (eventId: string, personId: string, scope: string, teamId?: string) =>
    (
      await prisma.accessToken.create({
        data: {
          token: randomBytes(32).toString('hex'),
          scope,
          eventId,
          personId,
          ...(teamId ? { teamId } : {}),
          expiresAt: new Date(Date.now() + 864e5),
        } as any,
      })
    ).token;

  // Event 1: Moment 2's plan, three dishes.
  const ev1 = await mkEvent('GTC-405 — the edit box', {});
  await prisma.eventSetup.create({ data: { eventId: ev1, eventType: 'Christmas' } as any });
  const mains = await prisma.team.create({
    data: {
      name: 'Mains',
      eventId: ev1,
      displayOrder: 0,
      source: 'GENERATED',
      coordinatorId: kate.id,
    } as any,
  });
  const lamb = await mkItem(
    mains.id,
    'Roast lamb',
    { dropOffLocation: 'the shed', dropOffNote: 'noon', notes: 'Use the big dish' },
    0
  );
  const salad = await mkItem(mains.id, 'Green salad', {}, 1);
  const rolls1 = await mkItem(mains.id, 'Bread rolls', { dropOffLocation: 'the gate' }, 2);

  // Event 2: the guest's cards, a venue and its times as typed.
  const ev2 = await mkEvent(EV2_NAME, {
    venueName: 'Riverside Park',
    venueTimingStart: '12:00pm',
    venueTimingEnd: '4:00pm',
  });
  const desserts = await prisma.team.create({
    data: {
      name: 'Desserts',
      eventId: ev2,
      displayOrder: 0,
      source: 'GENERATED',
      coordinatorId: rob.id,
    } as any,
  });
  const pav = await mkItem(desserts.id, 'Pavlova', { critical: true }, 0);
  const ham = await mkItem(desserts.id, 'Ham', { dropOffLocation: 'the back door' }, 1);
  const buns = await mkItem(desserts.id, 'Buns', { dropOffNote: '11am' }, 2);
  for (const itemId of [pav, ham, buns])
    await prisma.assignment.create({ data: { itemId, personId: jo.id } });
  const joLink2 = await linkFor(ev2, jo.id, 'PARTICIPANT');
  const robLink = await linkFor(ev2, rob.id, 'COORDINATOR', desserts.id);

  // Event 3: no venue, no times.
  const ev3 = await mkEvent('GTC-405 — no venue', {});
  const snacks = await prisma.team.create({
    data: {
      name: 'Snacks',
      eventId: ev3,
      displayOrder: 0,
      source: 'GENERATED',
      coordinatorId: kate.id,
    } as any,
  });
  const chips = await mkItem(snacks.id, 'Chips', { critical: true }, 0);
  const dip = await mkItem(snacks.id, 'Dip', {}, 1);
  for (const itemId of [chips, dip])
    await prisma.assignment.create({ data: { itemId, personId: jo.id } });
  const joLink3 = await linkFor(ev3, jo.id, 'PARTICIPANT');

  const evIn = { eventId: { in: created.events } };
  const rows = async () =>
    [
      await prisma.event.count({ where: { id: { in: created.events } } }),
      await prisma.eventSetup.count({ where: evIn }),
      await prisma.eventRole.count({ where: evIn }),
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
      select: { dropOffLocation: true, dropOffNote: true, dropOffAt: true, critical: true },
    });

  let chrome: Headless | null = null;
  let probes = { plan: '', send: '' };
  let blocked: string[] = [];
  let dialogs: string[] = [];
  const refusals: string[] = [];
  let setupWrites: Sent[] = [];
  let invitesWhileExists = -1;
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
        `fetch('/api/gtc405-probe/finalize-plan', { method: 'POST' }).then(r => 'reached ' + r.status).catch(() => 'failed')`
      ),
      send: await c.evaluate<string>(
        `fetch('/api/events/gtc405-probe/send', { method: 'POST' }).then(r => 'reached ' + r.status).catch(() => 'failed')`
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
    const tapMarked = async (settleMs: number) => {
      const why = await c.clickGuarded('[data-t="x"]', settleMs);
      if (why) refusals.push(why);
      return why;
    };
    const calls = async () => (await ev<Sent[]>('window.__calls || []')) ?? [];
    const patchesTo = async (itemId: string) =>
      (await calls()).filter(
        (x) => x.m === 'PATCH' && x.u.endsWith(`/api/events/${ev1}/items/${itemId}`)
      );
    /** Open the dish's edit box. */
    const openBox = async (name: string) => {
      if (await ev<boolean>(MARK_EDIT(name))) await tapMarked(600);
      await waitFor(`${FORM}()`, 5000);
      return ev<PV_Fields>(BOX_FIELDS);
    };
    /** Press Save, wait for the box to close and the PATCH to have gone. */
    const save = async (itemId: string, n: number) => {
      if (await ev<boolean>(MARK_SAVE)) await tapMarked(400);
      await waitFor(`!${FORM}()`, 10000);
      const end = Date.now() + 8000;
      while (Date.now() < end && (await patchesTo(itemId)).length < n) await sleep(150);
      await sleep(600);
    };

    // ── Moment 2's edit box ──
    await c.navigate(`/plan/${ev1}/setup`, 300);
    await waitFor(
      `[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Roast lamb')`,
      20000
    );
    await sleep(800);
    const lambBox = await openBox('Roast lamb');
    assert(
      'C',
      'C1 the edit box on a dish with its own: "Drop-off place" holds "the shed", "Drop-off time" holds "noon", each with its hint; its note under "Note for the guest" (rulings 1 and 5)',
      CHECKS.boxFilled(lambBox, 'the shed', 'noon', 'Use the big dish'),
      JSON.stringify(lambBox)
    );
    // Close it by its own "Cancel" (nothing saved), then the control dish.
    if (await ev<boolean>(MARK_CANCEL)) await tapMarked(400);
    await waitFor(`!${FORM}()`, 5000);

    // C3 control: a save that leaves both boxes alone (Bread rolls, place "the gate").
    const rollsBox = await openBox('Bread rolls');
    await save(rolls1, 1);
    const controlSent = await patchesTo(rolls1);
    const rollsStored = await storedOf(rolls1);
    assert(
      'C',
      'C3 a save that leaves both boxes alone sends neither (nor dropOffAt), and the dish keeps its own "the gate" (the box opened holding it)',
      CHECKS.leftAlone(controlSent, `/api/events/${ev1}/items/${rolls1}`) &&
        CHECKS.boxFilled(rollsBox, 'the gate', '', '') &&
        CHECKS.storedAs(rollsStored as Stored, 'the gate', null),
      `${JSON.stringify(controlSent)} | ${JSON.stringify(rollsStored)}`
    );

    // C2: type both into a dish with none, save.
    const saladBox = await openBox('Green salad');
    const typed =
      (await ev<boolean>(SET(PLACE_LABEL, 'the back door'))) &&
      (await ev<boolean>(SET(TIME_LABEL, '11am')));
    await save(salad, 1);
    const saladSent = await patchesTo(salad);
    const saladStored = await storedOf(salad);
    const saladRow = await ev<{ place: string | null; time: string | null } | null>(
      ROW('Green salad')
    );
    assert(
      'C',
      'C2 typed "the back door" and "11am" into a dish with none, and saved: one PATCH to the dish’s own route sending dropOffLocation "the back door" and dropOffNote "11am" and nothing else new (beside C3’s save), no dropOffAt; stored so; the row now shows "Drop-off: the back door · By: 11am" (ruling 1)',
      typed &&
        CHECKS.boxFilled(saladBox, '', '', '') &&
        CHECKS.savedBody(
          saladSent,
          controlSent,
          `/api/events/${ev1}/items/${salad}`,
          'the back door',
          '11am'
        ) &&
        CHECKS.storedAs(saladStored as Stored, 'the back door', '11am') &&
        CHECKS.rowShows(saladRow, 'the back door', '11am'),
      `typed ${typed} | ${JSON.stringify(saladSent)} | ${JSON.stringify(saladStored)} | ${JSON.stringify(saladRow)}`
    );

    // C4: empty both on Roast lamb, save.
    await openBox('Roast lamb');
    const emptied =
      (await ev<boolean>(SET(PLACE_LABEL, ''))) && (await ev<boolean>(SET(TIME_LABEL, '')));
    await save(lamb, 1);
    const lambSent = await patchesTo(lamb);
    const lambStored = await storedOf(lamb);
    const lambRow = await ev<{ place: string | null; time: string | null } | null>(
      ROW('Roast lamb')
    );
    assert(
      'C',
      'C4 both boxes emptied and saved: both sent as null (never an empty string), stored as null, and the row shows no drop-off (ruling 1)',
      emptied &&
        CHECKS.clearedBody(lambSent, `/api/events/${ev1}/items/${lamb}`) &&
        CHECKS.storedAs(lambStored as Stored, null, null) &&
        CHECKS.rowShows(lambRow, null, null),
      `emptied ${emptied} | ${JSON.stringify(lambSent)} | ${JSON.stringify(lambStored)} | ${JSON.stringify(lambRow)}`
    );
    setupWrites = (await calls()).filter((x) => x.m !== 'GET');

    // ── The host's preview of Jo's link (the host is signed in) ──
    await c.navigate(`/p/${joLink2}`, 300);
    await waitFor(
      `[...document.querySelectorAll('h1')].some((h) => h.textContent.trim() === ${JSON.stringify(PREVIEW_HEADING)})`,
      15000
    );
    await sleep(400);
    const preview = await ev<any>(PREVIEW);
    assert(
      'C',
      'C9 a host still sees it: the host’s preview of the guest’s link ("Link checked, good to send") shows "CRITICAL" beside Pavlova, and not beside Ham or Buns (ruling 4)',
      CHECKS.hostSees(preview, 'Pavlova', ['Ham', 'Buns']),
      JSON.stringify(preview)
    );

    // ── The guest's page (no session) ──
    await c.clearCookies();
    await c.navigate(`/p/${joLink2}`, 300);
    await waitFor(
      `[...document.querySelectorAll('h2')].some((h) => h.textContent.trim() === 'Pavlova')`,
      15000
    );
    await sleep(500);
    const cPav = await ev<Card | null>(CARD('Pavlova'));
    const cHam = await ev<Card | null>(CARD('Ham'));
    const cBuns = await ev<Card | null>(CARD('Buns'));
    const hits2 = (await ev<number>(PAGE_CRITICAL)) ?? -1;
    const reads2 = await calls();
    const top2 =
      (await ev<string>(
        `(() => { const h = [...document.querySelectorAll('h1')].find((x) => x.textContent.trim() === ${JSON.stringify(EV2_NAME)}); return h && h.parentElement ? h.parentElement.textContent : ''; })()`
      )) ?? '';
    assert(
      'C',
      `C5 a dish with no drop-off of its own (Pavlova) shows the event’s line on its card, once: "${EVENT_LINE}" (ruling 3)`,
      CHECKS.eventLineCard(cPav),
      JSON.stringify(cPav)
    );
    assert(
      'C',
      'C6 a dish with its own place (Ham) shows "Drop-off: the back door", one with its own time (Buns) "By: 11am"; neither shows the event’s line (ruling 3)',
      CHECKS.ownCard(cHam, 'the back door', null) && CHECKS.ownCard(cBuns, null, '11am'),
      JSON.stringify([cHam, cBuns])
    );
    assert(
      'C',
      'C11 the guest page asked the server for one thing, its own read (GET /api/p/<link>), and its top still names the venue ("📍 Riverside Park") (ruling 3: no new fetch)',
      CHECKS.oneRead(reads2, joLink2, top2),
      `${JSON.stringify(reads2.map((x) => `${x.m} ${x.u}`))} | ${JSON.stringify(top2.slice(0, 200))}`
    );
    await c.navigate(`/p/${joLink3}`, 300);
    await waitFor(
      `[...document.querySelectorAll('h2')].some((h) => h.textContent.trim() === 'Chips')`,
      15000
    );
    await sleep(500);
    const cChips = await ev<Card | null>(CARD('Chips'));
    const cDip = await ev<Card | null>(CARD('Dip'));
    const hits3 = (await ev<number>(PAGE_CRITICAL)) ?? -1;
    assert(
      'C',
      'C7 on an event with no venue and no times, a dish with no drop-off of its own shows neither line (Chips, Dip) (ruling 3)',
      CHECKS.noLineCard(cChips) && CHECKS.noLineCard(cDip),
      JSON.stringify([cChips, cDip])
    );
    const pavStored = await storedOf(pav);
    const chipsStored = await storedOf(chips);
    assert(
      'C',
      'C8 a guest sees no "CRITICAL": not on Pavlova’s or Chips’ card (both stored critical) nor anywhere on either page (ruling 4)',
      pavStored?.critical === true &&
        chipsStored?.critical === true &&
        CHECKS.guestNoCritical([cPav, cHam, cBuns, cChips, cDip], [hits2, hits3]),
      `stored ${pavStored?.critical} ${chipsStored?.critical} | page hits ${hits2} ${hits3} | ${JSON.stringify([cPav?.critical, cChips?.critical])}`
    );

    // ── The coordinator's page ──
    await c.navigate(`/c/${robLink}`, 300);
    await waitFor(
      `[...document.querySelectorAll('span.font-semibold')].some((s) => s.textContent.trim() === 'Pavlova')`,
      15000
    );
    await sleep(500);
    const coord = await ev<{ name: string; critical: boolean }[] | null>(COORD);
    assert(
      'C',
      'C10 a coordinator still sees it: on the coordinator’s page "CRITICAL" beside Pavlova, and not beside Ham or Buns (ruling 4)',
      CHECKS.coordinatorSees(coord, 'Pavlova', ['Ham', 'Buns']),
      JSON.stringify(coord)
    );

    // Opening a link writes its own "opened" row (fire and forget): wait for the three, so the
    // clean-up finds them while they exist.
    const end = Date.now() + 10000;
    while (Date.now() < end && (await prisma.inviteEvent.count({ where: evIn })) < 3)
      await sleep(200);
    invitesWhileExists = await prisma.inviteEvent.count({ where: evIn });

    blocked = c.planMakingBlocked();
    dialogs = c.dialogs();
  } finally {
    chrome?.close();
  }

  const setupPaths = setupWrites.map((x) => `${x.m} ${x.u.replace(/^https?:\/\/[^/]+/, '')}`);
  assert(
    'K',
    'K1 CONTROL: nothing blocked but the two probes; no dialog; every click made (none refused); the setup page wrote only the three saves (C3, C2, C4)',
    blocked.length === 2 &&
      blocked.every((x) => /gtc405-probe/.test(x)) &&
      dialogs.length === 0 &&
      refusals.length === 0 &&
      JSON.stringify(setupPaths) ===
        JSON.stringify([
          `PATCH /api/events/${ev1}/items/${rolls1}`,
          `PATCH /api/events/${ev1}/items/${salad}`,
          `PATCH /api/events/${ev1}/items/${lamb}`,
        ]),
    `${blocked.join(' | ')} | ${dialogs.join(',')} | ${refusals.join(' ; ')} | ${JSON.stringify(setupPaths)}`
  );
  const whileExists = await rows();
  const ai = (
    await prisma.event.findMany({
      where: { id: { in: created.events } },
      select: { aiCallsUsed: true },
    })
  ).map((e) => e.aiCallsUsed);
  console.log(
    `    fixture while it existed (Event, EventSetup, EventRole, Person, User, Session, Team, Item, Assignment, AccessToken, AuditEntry, InviteEvent, OutboundMessage): ${whileExists}`
  );
  await cleanup();
  const left = await rows();
  const after = await totals();
  assert(
    'K',
    'K2 CONTROL: aiCallsUsed 0 on every fixture event; nothing queued; the three links’ "opened" rows written on the fixture only; every fixture row removed by id; the InviteEvent and OutboundMessage totals as found',
    ai.length === 3 &&
      ai.every((x) => x === 0) &&
      whileExists.endsWith(',0') &&
      invitesWhileExists === 3 &&
      left === '0,0,0,0,0,0,0,0,0,0,0,0,0' &&
      after.invite === before.invite &&
      after.outbound === before.outbound,
    `ai ${ai} | invites ${invitesWhileExists} | ${left} | ${JSON.stringify(before)} → ${JSON.stringify(after)}`
  );
}
type PV_Fields = Field[] | null;

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
  // Every row below was made by this suite: its three events and what hangs off them (setups,
  // roles, teams, items, assignments and the links' "opened" rows go with the event), its people,
  // its user and the session. Tokens and audit rows by their event.
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
    `U1 the ${NOT_TOUCHED.length} untouched paths exist and are not edited since the base (c593d22): routes, schema, src/lib (auth, press, AI, households, the items' words and email included), the new-event page, the strip and the lockfile; but Moment 3’s words file, which GTC-406 adds to, not between the base and GTC-406’s base (347fb10); and the paying page, which GTC-407 edits, not between the base and GTC-407’s base (1b8bfe7); and the three files GTC-411 edits, not between the base and GTC-411’s base (7597112), and the rule’s file it adds, not there; and the lockfile, one entry of which GTC-413 moves, the base’s but for that qs entry, which says 6.16.1 and nothing else`,
    missing.length === 0 &&
      git([
        'diff',
        '--quiet',
        BASE,
        '--',
        ...NOT_TOUCHED,
        ...NOT_TOUCHED_TILL_GTC406.map((f) => `:(exclude)${f}`),
        ...NOT_TOUCHED_TILL_GTC407.map((f) => `:(exclude)${f}`),
        ...[...NOT_TOUCHED_TILL_GTC411, ...NEW_IN_GTC411].map((f) => `:(exclude)${f}`),
        ':(exclude)package-lock.json',
      ]).status === 0 &&
      git(['diff', '--quiet', BASE, GTC406_BASE, '--', ...NOT_TOUCHED_TILL_GTC406]).status === 0 &&
      git(['diff', '--quiet', BASE, GTC407_BASE, '--', ...NOT_TOUCHED_TILL_GTC407]).status === 0 &&
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
      ]).status === 0 &&
      lockfileIsBaseButQs(read('package-lock.json'), atRef(BASE, 'package-lock.json')),
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
}

async function main() {
  layerS();
  layerR();
  layerP();
  await layerC();
  layerU();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (reds.length) console.log(reds.map((r) => `  - ${r}`).join('\n'));
}

// A dry run imports CHECKS only (DEMO_TWEAKS_7_DRY_RUN=1); the suite runs otherwise.
if (process.env.DEMO_TWEAKS_7_DRY_RUN !== '1') {
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
