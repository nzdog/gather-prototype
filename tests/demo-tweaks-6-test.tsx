/**
 * [[GTC-404]] — THE DIETARY STEP IN TWO STATES (THE LIGHT PATH): note 4 of the founder's list ("Dietary
 * needs should be either all sorted or edit. Does changing them, adding a new dietary need do
 * anything"), with his rulings of 25 Oct 2026. Layout and words on the pre-flight's step 2 only.
 *
 * THE RULINGS THIS SUITE PINS
 *   1  A step whose answer is saved ("none" or "some") shows, open, one line ("You said there are
 *      none." or "You said there are these: Vegetarian, no shellfish.") and "Change"; no pills.
 *      "Change" shows today's pills, ticks, "Other dietary needs" box and "Save this", plus "Cancel"
 *      (back to the saved answer, nothing saved). A step never answered opens straight into the
 *      editing state, without "Cancel".
 *   2  The step's tick stays allowed while it is unanswered; its closed line stays as it is today
 *      ("Needs confirmation", amber, for never answered).
 *   3  The button reads "Save this" until something is saved; "Saved" is no longer a button label.
 *      After a save the step goes to the saved state.
 *   4  After a saved change, when a plan has been drafted, one line under the saved one: "Saved.
 *      Your plan was drafted before this, so check the dishes still cover it." Nothing re-run.
 *   5  The "Add a dish" link (Part B) was not built (see the ticket), so nothing here asks for it.
 *
 * THE LAYERS
 *   S  the page's source: the new words in the step's own part of the page; the save posts the same
 *      body to the same route as at the ticket's base; step 2's place in the page (its tick, fold,
 *      line) byte for byte as at the base; the plan question is a read and re-runs nothing.
 *   C  the dev server in the walled-off headless Chrome (port 9486), at 1280, on a fixture of its
 *      own: three held events of one host (a plan and some needs; no plan and none; a plan and never
 *      answered). Behind the plan-making and send walls, proven on probe URLs first; every click
 *      scrolled to mid-screen and made only when the point is inside the target. Send is never
 *      pressed. A script in each page records the page's own requests and any "Saved" button.
 *   K  CONTROL: nothing blocked but the probes, no dialog, no click refused; no AI call, nothing
 *      queued, every fixture row removed by id, the invite and outbound totals as found.
 *   U  CONTROL: routes, schema, src/lib, the strip and the lockfile not edited since the base;
 *      package.json (at the commit that added this suite) differs by its one script line; the two
 *      untracked scripts are in no commit.
 *
 * Every live condition lives in CHECKS, so it can be dry-run on a passing and a failing input
 * (DEMO_TWEAKS_6_DRY_RUN=1 imports CHECKS only). Every fixture and expected value is written here by
 * hand, never taken from the code under test.
 *
 * Needs the dev server on :3000 (GTC404_BASE_URL points it elsewhere, for the break proofs) and a
 * global WebSocket (NODE_OPTIONS=--experimental-websocket).
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { randomBytes } from 'crypto';

import { prisma } from '../src/lib/prisma';
import { installProviderTrap } from './helpers/provider-trap';
import { openHeadless, type Headless } from './helpers/headless';

const realFetch = globalThis.fetch;
installProviderTrap();

const ROOT = path.join(__dirname, '..');
const BASE_URL = process.env.GTC404_BASE_URL ?? 'http://localhost:3000';
const PORT = 9486;
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

// ── The ruled words, typed by hand ───────────────────────────────────────────
const CHANGE = 'Change';
const CANCEL = 'Cancel';
const SAVE = 'Save this';
const SAVED = 'Saved';
const NONE_LINE = 'You said there are none.';
const THESE_LINE = (list: string) => `You said there are these: ${list}.`;
const AFTER_SAVE = 'Saved. Your plan was drafted before this, so check the dishes still cover it.';
/** Today's three pills, the five needs, the box and the never-answered line, as they were. */
const PILLS = ['No dietary needs', 'There are some', 'Still don’t know'];
const OPTIONS = ['Vegetarian', 'Vegan', 'Gluten-free', 'Dairy-free', 'Nut allergy'];
const OTHER_BOX = 'Other dietary needs';
const NEVER_LINE = 'Never answered. That is different from “nobody has any”.';
const NEEDS_CONFIRMATION = 'Needs confirmation';

// ── Files and commits ────────────────────────────────────────────────────────
const SUITE = 'tests/demo-tweaks-6-test.tsx';
const PAGE = 'src/app/plan/[eventId]/pre-flight/page.tsx';
/** GTC-403's last commit (its ticket), where this ticket started: a fixed commit. */
const BASE = 'ed59114987038f335bd035581431cb214cb2aae9';
const NEW_SCRIPT = 'test:demo-tweaks-6';
const NEW_SCRIPT_VALUE =
  'NODE_OPTIONS=--experimental-websocket tsx --tsconfig tests/tsconfig.json tests/demo-tweaks-6-test.tsx';
const UNTRACKED_SCRIPTS = ['scripts/dev-login.ts', 'scripts/print-host-link.ts'];
/** The founder's untouched list for this ticket, read as it is now against the base. */
const NOT_TOUCHED = [
  'src/app/api',
  'prisma',
  'src/lib',
  'src/components/plan/MomentArc.tsx',
  'package-lock.json',
];

/** Step 2 as the page shows it, read in the browser (see STEP_FACTS). */
export interface StepFacts {
  /** The step's toggle says it is open. */
  open: boolean;
  /** What the open step shows, the foot's tick box left out, spaces collapsed. */
  text: string;
  /** Its buttons, the foot's tick box left out: words and whether greyed. */
  buttons: { t: string; d: boolean }[];
  /** The needs' tick boxes (never the step's own): their words and whether ticked. */
  ticks: { label: string; c: boolean }[];
  /** The typed box, or null when it is not drawn. */
  other: { value: string; placeholder: string } | null;
  /** The step's two tick boxes, the row's and the foot's (null when not drawn). */
  head: boolean | null;
  foot: boolean | null;
  /** The closed row's line under the blurb. */
  line: { text: string; amber: boolean } | null;
}

/** A stored dietaryData, as the suite compares it: status, needs in order, typed text. */
export interface StoredDiet {
  status?: string;
  requirements?: string[];
  other?: string;
}

// ── CHECKS ───────────────────────────────────────────────────────────────────
export const CHECKS = {
  /** Ruling 1 — the saved state: its one line, "Change" alone, nothing of the editor; ruling 4's line only when asked for. */
  sorted(f: StepFacts | null, line: string, afterSave: boolean) {
    if (!f || !f.open) return false;
    return (
      f.text.includes(line) &&
      f.buttons.length === 1 &&
      f.buttons[0].t === CHANGE &&
      !f.buttons[0].d &&
      f.ticks.length === 0 &&
      f.other === null &&
      !PILLS.some((p) => f.text.includes(p)) &&
      !f.text.includes(SAVE) &&
      !f.text.includes(CANCEL) &&
      f.text.includes(AFTER_SAVE) === afterSave &&
      (afterSave ? f.text.indexOf(AFTER_SAVE) > f.text.indexOf(line) : true)
    );
  },
  /** Ruling 1 — the editing state: today's pills, ticks and box, "Save this", "Cancel" only when asked; no "Change", no "Saved". */
  editing(
    f: StepFacts | null,
    o: { cancel: boolean; needs: boolean; ticked: string[]; other: string; saveDisabled: boolean }
  ) {
    if (!f || !f.open) return false;
    const words = f.buttons.map((b) => b.t);
    const save = f.buttons.filter((b) => b.t === SAVE);
    const needsOk = o.needs
      ? f.ticks.length === OPTIONS.length &&
        OPTIONS.every((x, i) => f.ticks[i].label === x) &&
        f.ticks
          .filter((k) => k.c)
          .map((k) => k.label)
          .join('|') === o.ticked.join('|') &&
        f.other !== null &&
        f.other.placeholder === OTHER_BOX &&
        f.other.value === o.other
      : f.ticks.length === 0 && f.other === null;
    return (
      PILLS.every((p) => words.includes(p)) &&
      save.length === 1 &&
      save[0].d === o.saveDisabled &&
      words.includes(CANCEL) === o.cancel &&
      !words.includes(CHANGE) &&
      !words.includes(SAVED) &&
      !f.text.includes(AFTER_SAVE) &&
      needsOk
    );
  },
  /** Ruling 1 — "Cancel": the draft had changed just before; back to the saved line; no save request; the stored answer as it was. */
  cancelled(
    mid: StepFacts | null,
    after: StepFacts | null,
    line: string,
    setupPosts: number,
    storedBefore: string,
    storedAfter: string
  ) {
    const midChanged =
      !!mid &&
      mid.buttons.some((b) => b.t === SAVE && !b.d) &&
      mid.buttons.some((b) => b.t === CANCEL);
    return (
      midChanged &&
      CHECKS.sorted(after, line, false) &&
      setupPosts === 0 &&
      storedBefore.length > 2 &&
      storedBefore === storedAfter
    );
  },
  /** Ruling 1 — never answered: straight into the editor, its own line, no "Cancel", no "Change". */
  neverAnswered(f: StepFacts | null) {
    return (
      !!f &&
      f.text.includes(NEVER_LINE) &&
      CHECKS.editing(f, { cancel: false, needs: false, ticked: [], other: '', saveDisabled: true })
    );
  },
  /** Ruling 3 — "Save this" at every editing moment seen, "Saved" never drawn as a button, the saved state after the save. */
  saveLabel(moments: (StepFacts | null)[], savedSeen: number, afterSave: StepFacts | null) {
    return (
      moments.length >= 4 &&
      moments.every(
        (m) =>
          !!m &&
          m.buttons.some((b) => b.t === SAVE) &&
          !m.buttons.some((b) => b.t === SAVED || b.t.startsWith(SAVED))
      ) &&
      savedSeen === 0 &&
      !!afterSave &&
      afterSave.buttons.map((b) => b.t).join('|') === CHANGE
    );
  },
  /** Ruling 4 — after a saved change: the saved state with (or without) the line, one save request, the read that answers "a plan?", and the answer stored. */
  afterSaved(
    f: StepFacts | null,
    line: string,
    withLine: boolean,
    setupPosts: number,
    itemsReads: number,
    stored: StoredDiet | null,
    expected: StoredDiet
  ) {
    return (
      CHECKS.sorted(f, line, withLine) &&
      setupPosts === 1 &&
      itemsReads >= 1 &&
      !!stored &&
      stored.status === expected.status &&
      JSON.stringify(stored.requirements ?? []) === JSON.stringify(expected.requirements ?? []) &&
      (stored.other ?? '') === (expected.other ?? '')
    );
  },
  /** Ruling 2 — the tick on a never-answered step: either box ticks both, either unticks both; the closed line as today; nothing saved. */
  tickUnanswered(
    before: StepFacts | null,
    ticked: StepFacts | null,
    unticked: StepFacts | null,
    setupPosts: number
  ) {
    const lineOk = (f: StepFacts | null) =>
      !!f && !!f.line && f.line.text === NEEDS_CONFIRMATION && f.line.amber;
    return (
      !!before &&
      !!ticked &&
      !!unticked &&
      before.head === false &&
      before.foot === false &&
      ticked.head === true &&
      ticked.foot === true &&
      unticked.head === false &&
      unticked.foot === false &&
      [before, ticked, unticked].every(lineOk) &&
      CHECKS.neverAnswered(ticked) &&
      setupPosts === 0
    );
  },

  // ── Source ──
  /** S1 — the new words, literal in the step's own part of the page; "Saved" no button label there. */
  words(section: string) {
    return (
      section.length > 500 &&
      /'You said there are none\.'/.test(section) &&
      section.includes('`You said there are these: ${listed}.`') &&
      count(section, AFTER_SAVE) === 1 &&
      />\s*Change\s*<\/button>/.test(section) &&
      />\s*Cancel\s*<\/button>/.test(section) &&
      />\s*Save this\s*<\/button>/.test(section) &&
      !/['"`]Saved['"`]/.test(section) &&
      !/>\s*Saved\s*</.test(section) &&
      /dietaryTitleSummary\(value\)/.test(section)
    );
  },
  /** S2 — the save's request, from `fetch(` to its closing `});`, the same text at the base and now. */
  sameSave(now: string, base: string) {
    const call = (src: string) => {
      const fn = between(src, 'const saveDietary', 'setSaving(false);');
      return between(fn, 'const res = await fetch(', '});');
    };
    return (
      call(base).length > 100 &&
      call(now) === call(base) &&
      call(now).includes('/api/events/${eventId}/setup') &&
      call(now).includes("method: 'POST'") &&
      call(now).includes('JSON.stringify({ dietaryData: next })')
    );
  },
  /** S3 — step 2's place in the page (its tick, fold, line and what it holds), byte for byte as at the base. */
  sameStep(now: string, base: string) {
    const block = (src: string) => between(src, '{/* ── 2. Dietary', '{/* ── 3.');
    return (
      block(base).length > 300 &&
      block(now) === block(base) &&
      block(now).includes('onCheck={(v) => tick(2, v)}') &&
      block(now).includes("amber: dietary.status === 'unanswered'")
    );
  },
  /** S4 — the plan question is one read of the event's items; nothing in the step's code re-runs or re-drafts. */
  readOnly(section: string, save: string) {
    const both = section + save;
    return (
      section.length > 500 &&
      save.length > 100 &&
      count(section, 'fetch(') === 1 &&
      /fetch\(`\/api\/events\/\$\{eventId\}\/items`\);/.test(section) &&
      count(save, 'fetch(') === 1 &&
      !/finalize-plan|regenerate|\/generate|\/check\b|conflicts|suggest-resolution|gate-check/.test(
        both
      )
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

// ══ S — the page's source ════════════════════════════════════════════════════
function layerS() {
  section('S — the page: the words, the same save, the same step, a read only');
  const now = read(PAGE);
  const base = atRef(BASE, PAGE);
  const nowCode = stripComments(now);
  const dietary = between(nowCode, 'async function hasDishes(', '\ntype MessageData');
  const save = between(nowCode, 'const saveDietary', '\n  };');
  assert(
    'S',
    'S1 the new words, literal in the step’s own part of the page: the two saved lines, "Change", "Cancel", the after-save line once, the button "Save this"; "Saved" is no button label; the needs read as the closed row reads them',
    CHECKS.words(dietary)
  );
  assert(
    'S',
    'S2 the save posts the same body to the same route, its request byte for byte as at the base (ed59114)',
    CHECKS.sameSave(now, base)
  );
  assert(
    'S',
    'S3 step 2’s place in the page (its tick, both boxes, fold, ring and closed line) byte for byte as at the base (ruling 2)',
    CHECKS.sameStep(now, base)
  );
  assert(
    'S',
    'S4 the plan question is one read of the event’s items (no method, so GET); nothing in the step’s code re-runs a check or re-drafts the plan (ruling 4)',
    CHECKS.readOnly(dietary, save)
  );
}

// ══ C — the live step ════════════════════════════════════════════════════════
const created = { users: [] as string[], people: [] as string[], events: [] as string[] };

/** Run in every new document: the page's own requests, and any button in step 2 reading "Saved". */
const RECORD = `(() => {
  window.__calls = [];
  window.__saved = 0;
  const f = window.fetch;
  window.fetch = function (input, init) {
    try {
      const url = typeof input === 'string' ? input : input && input.url ? input.url : String(input);
      const method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      window.__calls.push(method + ' ' + url);
    } catch (e) {}
    return f.apply(this, arguments);
  };
  const look = () => {
    const s = document.getElementById('step-2');
    if (!s) return;
    for (const b of s.querySelectorAll('button')) if (b.textContent.trim() === ${JSON.stringify(SAVED)}) window.__saved++;
  };
  new MutationObserver(look).observe(document, { childList: true, subtree: true, characterData: true });
})();`;

/** Step 2's facts (StepFacts), read in the page. */
const STEP_FACTS = `(() => {
  const s = document.getElementById('step-2');
  const body = document.getElementById('step-2-body');
  if (!s || !body) return null;
  const tog = s.querySelector('header button[aria-expanded]');
  const head = s.querySelector('header input[type="checkbox"]');
  const foot = s.querySelector('input[data-tick-foot]');
  const lineEl = s.querySelector('header [data-step-line]');
  const inner = body.firstElementChild;
  const bottom = body.querySelector('[data-tick-bottom]');
  const flat = (x) => (x || '').replace(/\\s+/g, ' ').trim();
  let text = '';
  if (inner) {
    const c = inner.cloneNode(true);
    const b = c.querySelector('[data-tick-bottom]');
    if (b) b.remove();
    text = flat(c.textContent);
  }
  const buttons = inner ? [...inner.querySelectorAll('button')].filter((b) => !(bottom && bottom.contains(b))).map((b) => ({ t: flat(b.textContent), d: b.disabled })) : [];
  const ticks = inner ? [...inner.querySelectorAll('input[type="checkbox"]')].filter((i) => !i.hasAttribute('data-tick-foot')).map((i) => ({ label: flat(i.closest('label') ? i.closest('label').textContent : ''), c: i.checked })) : [];
  const box = inner ? inner.querySelector('input[type="text"]') : null;
  return {
    open: !!tog && tog.getAttribute('aria-expanded') === 'true',
    text,
    buttons,
    ticks,
    other: box ? { value: box.value, placeholder: box.getAttribute('placeholder') || '' } : null,
    head: head ? head.checked : null,
    foot: foot ? foot.checked : null,
    line: lineEl ? { text: flat(lineEl.textContent), amber: /text-amber-700/.test(lineEl.className) } : null,
  };
})()`;

async function layerC() {
  section('C — the step, live: two states, Cancel, the button, the after-save line, the tick');
  const up = await realFetch(`${BASE_URL}/`)
    .then((r) => r.ok)
    .catch(() => false);
  if (!up)
    console.error(`    the dev server does not answer at ${BASE_URL}: every C assertion fails`);
  const totals = async () => ({
    invite: await prisma.inviteEvent.count(),
    outbound: await prisma.outboundMessage.count(),
  });
  const before = await totals();

  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const mail = (l: string) => `gtc404-${l}-${stamp}@example.com`;
  const user = await prisma.user.create({ data: { email: mail('kate') } });
  created.users.push(user.id);
  const kate = await prisma.person.create({
    data: { name: 'Kate Lowe', email: user.email, userId: user.id },
  });
  created.people.push(kate.id);
  const jo = await prisma.person.create({ data: { name: 'Jo Lowe', email: mail('jo') } });
  created.people.push(jo.id);
  const token = randomBytes(32).toString('hex');
  await prisma.session.create({
    data: { userId: user.id, token, expiresAt: new Date(Date.now() + 3600e3) },
  });
  const start = new Date(Date.now() + 30 * 864e5);

  /** A held event of Kate's: her household, Jo's, and (with a plan) one section holding one dish. */
  const mk = async (label: string, opts: { plan: boolean; dietary: StoredDiet | null }) => {
    const ev = await prisma.event.create({
      data: {
        name: `GTC-404 — ${label}`,
        startDate: start,
        endDate: start,
        hostId: kate.id,
        status: 'CONFIRMING',
        venueName: 'Kate’s place',
      },
    });
    created.events.push(ev.id);
    await prisma.eventRole.create({ data: { eventId: ev.id, userId: user.id, role: 'HOST' } });
    await prisma.eventSetup.create({
      data: {
        eventId: ev.id,
        ...(opts.dietary ? { dietaryData: opts.dietary as any } : {}),
      } as any,
    });
    const hk = await prisma.household.create({ data: { eventId: ev.id } });
    await prisma.personEvent.create({
      data: {
        personId: kate.id,
        eventId: ev.id,
        householdId: hk.id,
        householdRole: 'PRIMARY_CONTACT' as any,
        role: 'HOST' as any,
      },
    });
    const h1 = await prisma.household.create({ data: { eventId: ev.id } });
    await prisma.personEvent.create({
      data: {
        personId: jo.id,
        eventId: ev.id,
        householdId: h1.id,
        householdRole: 'PRIMARY_CONTACT' as any,
      },
    });
    if (opts.plan) {
      const team = await prisma.team.create({ data: { name: 'Mains', eventId: ev.id } });
      const it = await prisma.item.create({
        data: { name: 'Green salad', teamId: team.id, source: 'MANUAL', kind: 'ITEM' } as any,
      });
      await prisma.assignment.create({ data: { itemId: it.id, personId: jo.id } });
    }
    return ev.id;
  };
  const evA = await mk('a plan, some needs', {
    plan: true,
    dietary: { status: 'confirmed_needs', requirements: ['Vegetarian'], other: 'no shellfish' },
  });
  const evB = await mk('no plan, none', {
    plan: false,
    dietary: { status: 'confirmed_none', requirements: [] },
  });
  const evC = await mk('a plan, never answered', { plan: true, dietary: null });

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
      await prisma.outboundMessage.count({ where: evIn }),
      await prisma.inviteEvent.count({ where: evIn }),
    ].join(',');
  const storedRaw = async (eventId: string) =>
    JSON.stringify(
      (await prisma.eventSetup.findUnique({ where: { eventId }, select: { dietaryData: true } }))
        ?.dietaryData ?? null
    );
  const stored = async (eventId: string): Promise<StoredDiet | null> =>
    ((await prisma.eventSetup.findUnique({ where: { eventId }, select: { dietaryData: true } }))
      ?.dietaryData as StoredDiet | null) ?? null;

  let chrome: Headless | null = null;
  let probes = { plan: '', send: '' };
  let blocked: string[] = [];
  let dialogs: string[] = [];
  const refusals: string[] = [];
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
        `fetch('/api/gtc404-probe/finalize-plan', { method: 'POST' }).then(r => 'reached ' + r.status).catch(() => 'failed')`
      ),
      send: await c.evaluate<string>(
        `fetch('/api/events/gtc404-probe/send', { method: 'POST' }).then(r => 'reached ' + r.status).catch(() => 'failed')`
      ),
    };
    assert(
      'C',
      'C0 PRECONDITION: both walls proven: a plan-making probe and a send probe fail in the browser',
      probes.plan === 'failed' && probes.send === 'failed',
      JSON.stringify(probes)
    );
    if (probes.plan !== 'failed' || probes.send !== 'failed') return;
    await c.addInitScript(RECORD);
    await c.setSessionCookie(token);
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
    /** Open the page, wait for the steps and step 4's message, then open step 2. */
    const open = async (eventId: string) => {
      await c.navigate(`/plan/${eventId}/pre-flight`, 300);
      await waitFor(`document.getElementById('step-5')`);
      await waitFor(
        `document.querySelector('#step-4 [data-message-part], #step-4 textarea')`,
        8000
      );
      await sleep(500);
      await tap('#step-2 header button[aria-expanded]', 700);
    };
    /** Click through the guard; a target that is not there is skipped, not refused. */
    const tap = async (selector: string, settleMs = 500) => {
      if (!(await ev<boolean>(`!!document.querySelector(${JSON.stringify(selector)})`)))
        return 'absent';
      const why = await c.clickGuarded(selector, settleMs);
      if (why) refusals.push(`${selector}: ${why}`);
      return why;
    };
    /** The element inside step 2's open content (a button, or a need's label) whose words are exactly `text`. */
    const tapIn = async (kind: 'button' | 'label', text: string, settleMs = 500) => {
      const found =
        await ev<boolean>(`(() => { document.querySelectorAll('[data-t]').forEach((e) => e.removeAttribute('data-t'));
        const b = [...document.querySelectorAll('#step-2-body ${kind}')].find((x) => !x.closest('[data-tick-bottom]') && x.textContent.replace(/\\s+/g, ' ').trim() === ${JSON.stringify(text)});
        if (!b) return false; b.setAttribute('data-t', 'x'); return true; })()`);
      return found ? tap('[data-t="x"]', settleMs) : 'absent';
    };
    const facts = () => ev<StepFacts | null>(STEP_FACTS);
    const calls = async () => (await ev<string[]>('window.__calls || []')) ?? [];
    const posts = async (eventId: string) =>
      (await calls()).filter(
        (x) => x.startsWith('POST ') && x.includes(`/api/events/${eventId}/setup`)
      ).length;
    const itemsReads = async (eventId: string) =>
      (await calls()).filter(
        (x) => x.startsWith('GET ') && x.endsWith(`/api/events/${eventId}/items`)
      ).length;
    const savedSeen = async () => (await ev<number>('window.__saved || 0')) ?? 0;
    /** After a save: wait for the saved state to come back (the line), then read the step. */
    const afterSave = async () => {
      await waitFor(
        `(() => { const b = document.getElementById('step-2-body'); return b && /You said there are/.test(b.textContent) && ![...b.querySelectorAll('button')].some((x) => x.textContent.trim() === ${JSON.stringify(SAVE)}); })()`,
        10000
      );
      await sleep(400);
      return facts();
    };
    let saved = 0;

    // ── Event A: a plan, some needs ──
    await open(evA);
    const a1 = await facts();
    assert(
      'C',
      'C1 a saved answer ("some") opens as one line, "You said there are these: Vegetarian, no shellfish.", and "Change": no pills, no ticks, no box, no "Save this", no "Cancel", no after-save line yet (ruling 1)',
      CHECKS.sorted(a1, THESE_LINE('Vegetarian, no shellfish'), false),
      JSON.stringify(a1)
    );
    await tapIn('button', CHANGE);
    const a2 = await facts();
    assert(
      'C',
      'C3 "Change" brings back today’s three pills, the five ticks (Vegetarian ticked), the "Other dietary needs" box holding "no shellfish", "Save this" (greyed, nothing changed yet) and "Cancel"; "Change" itself gone (ruling 1)',
      CHECKS.editing(a2, {
        cancel: true,
        needs: true,
        ticked: ['Vegetarian'],
        other: 'no shellfish',
        saveDisabled: true,
      }),
      JSON.stringify(a2)
    );
    await tapIn('label', 'Vegan');
    const a3 = await facts();
    const storedA0 = await storedRaw(evA);
    await tapIn('button', CANCEL, 800);
    const a4 = await facts();
    const postsA4 = await posts(evA);
    const storedA1 = await storedRaw(evA);
    assert(
      'C',
      'C4 "Cancel" after ticking Vegan goes back to the saved line, unchanged; no save request was made and the stored answer is as it was (ruling 1)',
      CHECKS.cancelled(a3, a4, THESE_LINE('Vegetarian, no shellfish'), postsA4, storedA0, storedA1),
      `${JSON.stringify(a3?.buttons)} | ${JSON.stringify(a4)} | posts ${postsA4} | ${storedA0} → ${storedA1}`
    );
    await tapIn('button', CHANGE);
    await tapIn('label', 'Vegan');
    const a5 = await facts();
    await tapIn('button', SAVE, 400);
    const a6 = await afterSave();
    const postsA6 = await posts(evA);
    const readsA6 = await itemsReads(evA);
    const storedA2 = await stored(evA);
    assert(
      'C',
      'C7 after a saved change on an event with a plan: the saved line now "Vegetarian, Vegan, no shellfish", and under it "Saved. Your plan was drafted before this, so check the dishes still cover it."; one save request; the answer stored (ruling 4)',
      CHECKS.afterSaved(
        a6,
        THESE_LINE('Vegetarian, Vegan, no shellfish'),
        true,
        postsA6,
        readsA6,
        storedA2,
        {
          status: 'confirmed_needs',
          requirements: ['Vegetarian', 'Vegan'],
          other: 'no shellfish',
        }
      ),
      `${JSON.stringify(a6)} | posts ${postsA6} reads ${readsA6} | ${JSON.stringify(storedA2)}`
    );
    saved += await savedSeen();

    // ── Event B: no plan, none ──
    await open(evB);
    const b1 = await facts();
    assert(
      'C',
      'C2 a saved answer ("none") opens as "You said there are none." and "Change": no pills (ruling 1)',
      CHECKS.sorted(b1, NONE_LINE, false),
      JSON.stringify(b1)
    );
    await tapIn('button', CHANGE);
    await tapIn('button', 'There are some');
    await tapIn('label', 'Vegetarian');
    await tapIn('button', SAVE, 400);
    const b2 = await afterSave();
    const postsB2 = await posts(evB);
    const readsB2 = await itemsReads(evB);
    const storedB = await stored(evB);
    assert(
      'C',
      'C8 after a saved change on an event with no plan: "You said there are these: Vegetarian." and no after-save line, though the plan question was asked; one save request; the answer stored (ruling 4)',
      CHECKS.afterSaved(b2, THESE_LINE('Vegetarian'), false, postsB2, readsB2, storedB, {
        status: 'confirmed_needs',
        requirements: ['Vegetarian'],
      }),
      `${JSON.stringify(b2)} | posts ${postsB2} reads ${readsB2} | ${JSON.stringify(storedB)}`
    );
    saved += await savedSeen();

    // ── Event C: a plan, never answered ──
    await open(evC);
    const c1 = await facts();
    assert(
      'C',
      'C5 a step never answered opens straight into the editing state: "Never answered…", the three pills, "Save this" greyed, no "Cancel", no "Change" (ruling 1)',
      CHECKS.neverAnswered(c1),
      JSON.stringify(c1)
    );
    await tap('#step-2 header label', 500);
    const c2 = await facts();
    await tap('#step-2-body [data-tick-bottom] label', 500);
    const c3 = await facts();
    const postsC3 = await posts(evC);
    assert(
      'C',
      'C9 the tick on a never-answered step still works: the row’s box ticks both boxes, the foot’s unticks both; the closed line stays "Needs confirmation" in amber; still editing; nothing saved (ruling 2)',
      CHECKS.tickUnanswered(c1, c2, c3, postsC3),
      `${JSON.stringify([c1?.head, c1?.foot, c2?.head, c2?.foot, c3?.head, c3?.foot])} | ${JSON.stringify(c2?.line)} | posts ${postsC3}`
    );
    await tapIn('button', 'No dietary needs');
    const c4 = await facts();
    await tapIn('button', SAVE, 400);
    const c5 = await afterSave();
    saved += await savedSeen();
    assert(
      'C',
      'C6 the button reads "Save this" at every editing moment (greyed and ready, on a saved answer and a never-answered one), no button in step 2 ever read "Saved" on any of the three pages, and a save goes to the saved state (ruling 3)',
      CHECKS.saveLabel([a2, a5, c1, c4], saved, c5),
      `saved seen ${saved} | ${JSON.stringify([a2, a5, c1, c4].map((m) => m?.buttons))} | ${JSON.stringify(c5?.buttons)}`
    );

    blocked = c.planMakingBlocked();
    dialogs = c.dialogs();
  } finally {
    chrome?.close();
  }

  assert(
    'K',
    'K1 CONTROL: nothing blocked but the two probes; no dialog; every click made (none refused)',
    blocked.length === 2 &&
      blocked.every((x) => /gtc404-probe/.test(x)) &&
      dialogs.length === 0 &&
      refusals.length === 0,
    `${blocked.join(' | ')} | ${dialogs.join(',')} | ${refusals.join(' ; ')}`
  );
  const whileExists = await rows();
  const ai = (
    await prisma.event.findMany({
      where: { id: { in: created.events } },
      select: { aiCallsUsed: true },
    })
  ).map((e) => e.aiCallsUsed);
  console.log(
    `    fixture while it existed (Event, EventSetup, EventRole, Household, PersonEvent, Person, User, Session, Team, Item, Assignment, AccessToken, OutboundMessage, InviteEvent): ${whileExists}`
  );
  await cleanup();
  const left = await rows();
  const after = await totals();
  assert(
    'K',
    'K2 CONTROL: aiCallsUsed 0 on every fixture event; nothing queued; every fixture row removed by id; the InviteEvent and OutboundMessage totals as found',
    ai.length === 3 &&
      ai.every((x) => x === 0) &&
      whileExists.endsWith(',0,0') &&
      left === '0,0,0,0,0,0,0,0,0,0,0,0,0,0' &&
      after.invite === before.invite &&
      after.outbound === before.outbound,
    `ai ${ai} | ${left} | ${JSON.stringify(before)} → ${JSON.stringify(after)}`
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
  // Every row below was made by this suite: its three events and what hangs off them (households,
  // memberships, teams, items, assignments, roles and setups go with the event), its people, its
  // user and the session. Tokens and audit rows, if any were written, by their event.
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
    `U1 the ${NOT_TOUCHED.length} untouched paths exist and are not edited since the base (ed59114): routes, schema, src/lib (the pre-flight’s library included), the strip and the lockfile`,
    missing.length === 0 && git(['diff', '--quiet', BASE, '--', ...NOT_TOUCHED]).status === 0,
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
  await layerC();
  layerU();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (reds.length) console.log(reds.map((r) => `  - ${r}`).join('\n'));
}

// A dry run imports CHECKS only (DEMO_TWEAKS_6_DRY_RUN=1); the suite runs otherwise.
if (process.env.DEMO_TWEAKS_6_DRY_RUN !== '1') {
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
