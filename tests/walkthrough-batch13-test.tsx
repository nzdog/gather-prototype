/**
 * GTC-382 — walkthrough batch 13: Write the list myself (the 10 Oct walk's fifth and last batch).
 *
 * The founder walked the launch code on 2026-10-10 and ruled five batches (GTC-378). This suite
 * pins the fifth, item 40, to his rulings (GTC-382: scoping rulings Q1 to Q3, plan rulings Q1 to Q9
 * and the words W1 to W11, all 2026-10-13):
 *
 *   a third choice on Moment 2's opening, "Write the list myself" (W1), an outlined button directly
 *       under the solid "Let’s do this →", with W2 under it (scoping Q3); not offered while a plan is
 *       put away (Q2); the host's alone, a co-host told W4 (Q5); a failed press told W5
 *   the press makes the everyday eight, empty, in order (scoping Q1), through the setup route, once
 *       only, under a per-event lock, with no coordinator and no AI call (Q4); no new route
 *   on an event with a record, any section or any item is a plan (Q1): a reload, the strip, the
 *       pre-flight's `?at=plan` and the old dashboard's way back all land on her own plan; an
 *       old-style event (no record) is untouched
 *   her own plan's view: W6 for the heading, W7's "for" in the count line (Q6), no Regenerate
 *       anywhere, W8 while every section is empty, "No items yet." as today, and W10 back to
 *       Moment 2's opening (Q3), where W3 says her list is waiting
 *   "+ Add category" puts a new section last on an event with a record (Q8)
 *   Moment 2's opening is laid out so "← Your events" never sits on the strip (Q9)
 *   Moment 2's "What this does" is his new line, W11
 *
 * What the build is asked for, beyond the words: `src/lib/setup/entry-stage.ts` exports
 * `hasAnyPlan(items, teamCount)` and `resolveSetupStage` takes an optional `teamCount` (absent means
 * today's answer); `src/lib/setup/own-plan.ts` (client-safe) exports `OWN_PLAN_SECTIONS` (the eight,
 * `{ name, domain }`), `OWN_PLAN_WORDS` and `ownPlanHeading(eventName)`; `wayBack` reads `teams`;
 * `Moment2Opening` takes `onOwnPlan`, `ownPlanState` and `ownPlanExists`; `Moment2PlanView` takes
 * `ownPlan`; `POST /api/events/[id]/setup` takes `ownPlan: true` and answers `ownPlan: { made }`.
 *
 * Layers P, W, R and S run in memory. Layer D calls the dev server over HTTP on events of its own.
 * Layer C drives the dev server in the walled-off headless Chrome (port 9480) at 1280 and 390, on a
 * fixture of its own (example.com addresses, no phones, nothing queued), behind the three safeguards
 * of GATHER-BUILD-CONSTANTS.md and the send wall: the browser fails every plan-making request and
 * every request to a door that sends before it leaves the page (both proven on probe URLs first);
 * every click is `clickGuarded`, after a check that the target is on top at its middle (a covered
 * target is reported as 'covered', never pressed); every dialog is logged and none is expected.
 * Pressed, and only these: "Write the list myself", "+ Add item" and its "Add", the strip's doors,
 * W10 and the old dashboard's way back. Never pressed: Send, Generate, Regenerate, "Let’s do this →",
 * "Move on →", "Plan looks good →", invites only, New Event, Sign Out. Typing happens only once the
 * add-item form is found, so a red run never types into Moment 1. The fixture's `aiCallsUsed` is
 * read while it exists, its rows counted, then removed by id; the totals are asserted as found.
 *
 * Every new assertion carries a presence clause, so a check of something absent cannot pass before
 * the build.
 *
 * Needs the dev server on :3000 and a global WebSocket (NODE_OPTIONS=--experimental-websocket).
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { randomBytes } from 'crypto';

import { prisma } from '../src/lib/prisma';
import { installProviderTrap } from './helpers/provider-trap';
import { ToastProvider } from '../src/contexts/ToastContext';
import Moment2Opening from '../src/components/plan/Moment2Opening';
import Moment2PlanView from '../src/components/plan/Moment2PlanView';
import { openHeadless, type Headless } from './helpers/headless';

const realFetch = globalThis.fetch;
installProviderTrap();
const BASE = 'http://localhost:3000';
const ROOT = process.cwd();
const PORT = 9480;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let passed = 0;
let failed = 0;
const redAssertions: string[] = [];

function assert(phase: string, label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`\x1b[32m✓\x1b[0m [${phase}] ${label}`);
    passed++;
  } else {
    console.error(`\x1b[31m✗\x1b[0m [${phase}] ${label}${detail ? `  (${detail})` : ''}`);
    failed++;
    redAssertions.push(`[${phase}] ${label}`);
  }
}

function ok(fn: () => boolean): boolean {
  try {
    return fn() === true;
  } catch {
    return false;
  }
}

const read = (rel: string) => {
  try {
    return readFileSync(join(ROOT, rel), 'utf8');
  } catch {
    return '';
  }
};

/** Source with comments removed, so a sentence quoted in a comment is never mistaken for code. */
function codeOnly(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

async function load(rel: string): Promise<any> {
  try {
    return await import(rel);
  } catch {
    return null;
  }
}

/** A render that never throws: an empty string when the component cannot render. */
function render(el: any): string {
  try {
    return renderToStaticMarkup(el);
  } catch (e) {
    console.error('    render threw:', (e as Error).message.split('\n')[0]);
    return '';
  }
}

const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;
/** Rendered HTML as the words a host reads: React's text separators and the tags removed. */
const flat = (h: string) =>
  h
    .replace(/<!-- -->/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ');
const git = (args: string[]) =>
  spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' }).stdout?.trim() ?? '';

// ── The ruled words, verbatim (GTC-382, "The words, as ruled") ───────────────
const W1 = 'Write the list myself';
const W2 = 'I’ll set out the usual sections, and you fill them in.';
const W3 = 'Your list is waiting, as you left it.';
const W4 = 'Only the host can write the list.';
const W5 = 'That didn’t work. Try again.';
const W6 = (eventName: string) => `Your plan for ${eventName}.`;
const W7 = (n: number, m: number, g: number) =>
  `${n} ${n === 1 ? 'item' : 'items'} across ${m} ${m === 1 ? 'category' : 'categories'}, for ${g} ${g === 1 ? 'guest' : 'guests'}.`;
const W8 =
  'Add what’s needed under each heading. For anything else, use “+ Add category” at the bottom.';
const W9 = 'No items yet.';
const W10 = '← Back to the start of the plan';
const W11 =
  'Gets the plan out of your head and onto the page. You can either plan the menu yourself, or tell me about the event and any dietary needs, and I’ll draft the full list of what’s needed: food, drinks, quantities and everything else. You’re welcome to edit as much as you like.';
/** Scoping Q1 — the everyday eight, in order, as a drafted plan names them. */
const EIGHT = [
  'Entrée & Starters',
  'Mains',
  'Sides & Salads',
  'Dessert',
  'Alcoholic Drinks',
  'Non-Alcoholic Drinks',
  'Set up',
  'Clean up',
];
const START = 'Let’s do this →';
const SUGGEST = (eventName: string) => `Here’s what I’d suggest for ${eventName}.`;
const REGEN_PLAN = 'Not quite right? Regenerate the plan';
const REGEN_CATEGORY = '↻ Regenerate this category';
const BACK_TO_QUESTIONS = '← Back to the questions';
const BACK_TO_PEOPLE = '← Back to the people';
const YOUR_EVENTS = '← Your events';
const INVITES_ONLY = 'Skip the plan: invites only';
/** GTC-381's W4 and W5, the old dashboard's way back. */
const WB_W4 = '← Back to “Who’s coming?”';
const WB_W5 = '← Back to “What’s the plan?”';

// ══ IN MEMORY — the pure layer, the words, the render and the source ═══════════
async function runInMemory() {
  const ES = await load('../src/lib/setup/entry-stage');
  const WB = await load('../src/lib/moments/way-back');
  const OP = await load('../src/lib/setup/own-plan');
  const MW = await load('../src/lib/moments/moment-words');
  const IO = await load('../src/lib/setup/invites-only');
  const PC = await load('../src/lib/ai/plan-categories');
  const TK = await load('../src/lib/ai/tasks');

  // ── P — the rules ──────────────────────────────────────────────────────────
  assert(
    'P',
    'P1 hasAnyPlan: nothing is no plan; any section, any item, or a drafted row is a plan (Q1)',
    ok(
      () =>
        typeof ES?.hasAnyPlan === 'function' &&
        ES.hasAnyPlan([], 0) === false &&
        ES.hasAnyPlan([], 8) === true &&
        ES.hasAnyPlan([], 1) === true &&
        ES.hasAnyPlan([{ source: 'MANUAL' }], 0) === true &&
        ES.hasAnyPlan([{ source: 'GENERATED' }], 0) === true &&
        ES.hasAnyPlan([{ source: 'HOST_EDITED' }], 0) === true
    )
  );
  const stage = (input: any) => ES.resolveSetupStage(input);
  const base = { items: [], hasSetup: true, householdCount: 3, momentTwoBegun: false };
  assert(
    'P',
    'P2 the entry rule with teamCount: sections or a hand-added row, no kind, households → plan; approval and invites only still win; nothing → Moment 1 or the opening; no record → today’s answer (Q1)',
    ok(
      () =>
        stage({ ...base, teamCount: 8 }) === 'plan' &&
        stage({ ...base, teamCount: 0, items: [{ source: 'MANUAL' }] }) === 'plan' &&
        stage({ ...base, householdCount: 0, teamCount: 8 }) === 'plan' &&
        stage({ ...base, teamCount: 0 }) === 'moment1' &&
        stage({ ...base, householdCount: 0, teamCount: 0 }) === 'opening' &&
        stage({ ...base, teamCount: 8, planApproved: true }) === 'moment3' &&
        stage({ ...base, teamCount: 8, invitesOnly: true }) === 'invites-only' &&
        stage({ ...base, hasSetup: false, teamCount: 8, items: [{ source: 'MANUAL' }] }) ===
          'moment1' &&
        stage({ ...base, hasSetup: false, householdCount: 0, teamCount: 8 }) === 'opening'
    )
  );
  assert(
    'P',
    'P3 CONTROL: without teamCount, today’s answers (hand-added rows alone are no plan; a record with a kind → the questions; a drafted row → plan)',
    ok(
      () =>
        stage({ ...base, items: [{ source: 'MANUAL' }] }) === 'moment1' &&
        stage({ items: [], hasSetup: true, householdCount: 3 }) === 'moment2-step1' &&
        stage({ ...base, items: [{ source: 'GENERATED' }] }) === 'plan' &&
        stage({ items: [{ source: 'MANUAL' }], hasSetup: false, householdCount: 3 }) === 'moment1'
    )
  );
  const facts = (over: Record<string, unknown>) => ({
    id: 'e1',
    setup: { eventType: null, invitesOnly: false, planApprovedAt: null },
    status: 'DRAFT',
    sentAt: null,
    items: [],
    ...over,
  });
  const back = (over: Record<string, unknown>) => {
    const b = WB.wayBack(facts(over));
    return b ? `${b.href} ${b.words}` : 'null';
  };
  assert(
    'P',
    'P4 the way back on her own plan: sections, or a hand-added row, read GTC-381’s W5 to the setup page (Q1)',
    ok(
      () =>
        typeof WB?.wayBack === 'function' &&
        back({ teams: [{ id: 't1' }] }) === `/plan/e1/setup ${WB_W5}` &&
        back({ teams: EIGHT.map((name, i) => ({ id: `t${i}`, name })) }) ===
          `/plan/e1/setup ${WB_W5}` &&
        back({ items: [{ source: 'MANUAL' }] }) === `/plan/e1/setup ${WB_W5}`
    )
  );
  assert(
    'P',
    'P5 CONTROL: no sections and no rows still read W4; an old-style event (no record) still has no way back, sections or not',
    ok(
      () =>
        typeof WB?.wayBack === 'function' &&
        back({}) === `/plan/e1/setup ${WB_W4}` &&
        back({ teams: [] }) === `/plan/e1/setup ${WB_W4}` &&
        WB.wayBack(facts({ setup: null, teams: [{ id: 't1' }] })) === null
    )
  );
  const sections = (OP?.OWN_PLAN_SECTIONS ?? []) as { name: string; domain: string | null }[];
  const taskName = (key: string) =>
    (TK?.TASK_BUCKETS ?? []).find((b: { key: string }) => b.key === key)?.teamName;
  assert(
    'P',
    'P6 the eight, in scoping Q1’s order, named as a draft names them (CATEGORY_LABELS, TASK_BUCKETS); Set up and Clean up with SETUP and CLEANUP, the rest with no domain',
    ok(
      () =>
        Array.isArray(OP?.OWN_PLAN_SECTIONS) &&
        sections.map((s) => s.name).join('|') === EIGHT.join('|') &&
        sections[0].name === PC.CATEGORY_LABELS.entree_starters &&
        sections[1].name === PC.CATEGORY_LABELS.mains &&
        sections[2].name === PC.CATEGORY_LABELS.sides_salads &&
        sections[3].name === PC.CATEGORY_LABELS.dessert &&
        sections[4].name === PC.CATEGORY_LABELS.drinks_alcoholic &&
        sections[5].name === PC.CATEGORY_LABELS.drinks_non_alcoholic &&
        sections[6].name === taskName('set_up') &&
        sections[7].name === taskName('clean_up') &&
        sections[6].domain === 'SETUP' &&
        sections[7].domain === 'CLEANUP' &&
        sections.slice(0, 6).every((s) => s.domain == null)
    )
  );
  assert(
    'P',
    'P7 Moment 2’s "What this does" is W11 exactly, curly apostrophes and no straight one',
    ok(
      () =>
        MW?.MOMENT_WORDS?.[2]?.does === W11 &&
        W11.includes('’') &&
        !MW.MOMENT_WORDS[2].does.includes("'")
    )
  );

  // ── W — the words ──────────────────────────────────────────────────────────
  const OW = OP?.OWN_PLAN_WORDS ?? {};
  assert('W', 'W1 the outlined button: OWN_PLAN_WORDS.CHOOSE', OW.CHOOSE === W1, String(OW.CHOOSE));
  assert('W', 'W2 under it: OWN_PLAN_WORDS.EXPLAIN', OW.EXPLAIN === W2, String(OW.EXPLAIN));
  assert(
    'W',
    'W3 under it instead, when her list exists: OWN_PLAN_WORDS.WAITING',
    OW.WAITING === W3,
    String(OW.WAITING)
  );
  assert('W', 'W4 a co-host: OWN_PLAN_WORDS.NOT_HOST', OW.NOT_HOST === W4, String(OW.NOT_HOST));
  assert(
    'W',
    'W5 a failed press: OWN_PLAN_WORDS.FAILED, GTC-374’s INVITES_ONLY_WORDS.FAILED letter for letter',
    OW.FAILED === W5 && IO?.INVITES_ONLY_WORDS?.FAILED === W5,
    String(OW.FAILED)
  );
  assert(
    'W',
    'W6 her own plan’s heading: ownPlanHeading("Boxing Day") is "Your plan for Boxing Day."',
    ok(() => OP.ownPlanHeading('Boxing Day') === W6('Boxing Day'))
  );
  assert(
    'W',
    'W8 the first-time line: OWN_PLAN_WORDS.FIRST_TIME',
    OW.FIRST_TIME === W8,
    String(OW.FIRST_TIME)
  );
  assert('W', 'W10 the footer’s back on her own plan: OWN_PLAN_WORDS.BACK', OW.BACK === W10);

  // ── R — what renders ───────────────────────────────────────────────────────
  const opening = (props: Record<string, unknown>) =>
    render(
      createElement(Moment2Opening as any, {
        eventName: 'Boxing Day',
        onStart: () => {},
        onBack: () => {},
        onInvitesOnly: () => {},
        ...props,
      })
    );
  const withChoice = opening({ onOwnPlan: () => {} });
  const startEnd = withChoice.indexOf(`${START}</button>`);
  const ownAt = withChoice.indexOf(`>${W1}</button>`);
  assert(
    'R',
    'R1 the opening with the choice: W1 is the next button after "Let’s do this →", before invites only and "← Back to the people", with W2 under it (scoping Q3)',
    withChoice.length > 0 &&
      startEnd > 0 &&
      ownAt > startEnd &&
      count(withChoice.slice(startEnd + START.length, ownAt), /<button\b/g) === 1 &&
      !withChoice.slice(withChoice.lastIndexOf('<button', ownAt), ownAt).includes('>') &&
      withChoice.indexOf(W2) > ownAt &&
      withChoice.indexOf(W2) < withChoice.indexOf(INVITES_ONLY) &&
      withChoice.indexOf(INVITES_ONLY) < withChoice.indexOf(BACK_TO_PEOPLE),
    `render ${withChoice.length} chars, start ${startEnd}, W1 ${ownAt}`
  );
  const classOf = (h: string, text: string) => {
    const m = h.match(
      new RegExp(
        `<button\\b[^>]*\\bclass="([^"]*)"[^>]*>${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</button>`
      )
    );
    return m ? m[1].split(/\s+/) : null;
  };
  const sizeTokens = (cls: string[] | null) =>
    (cls ?? [])
      .filter((t) =>
        /^(w-|max-w-|min-w-|h-|min-h-|py-|px-|p-|rounded|text-(xs|sm|base|lg))/.test(t)
      )
      .sort()
      .join(' ');
  const goCls = classOf(withChoice, START);
  const ownCls = classOf(withChoice, W1);
  assert(
    'R',
    'R2 the two buttons share their width, height and size classes; W1 is outlined (a border, no solid fill), "Let’s do this →" stays solid',
    !!goCls &&
      !!ownCls &&
      sizeTokens(goCls) === sizeTokens(ownCls) &&
      sizeTokens(ownCls).includes('w-full') &&
      ownCls.some((t) => /^border/.test(t)) &&
      !ownCls.includes('bg-accent') &&
      goCls.includes('bg-accent'),
    `${goCls?.join(' ')} | ${ownCls?.join(' ')}`
  );
  const without = opening({});
  const waiting = opening({ onOwnPlan: () => {}, planWaiting: true });
  assert(
    'R',
    'R3 CONTROL: no W1 without onOwnPlan, nor while a plan is put away (Q2); "Let’s do this →" is there',
    without.includes(START) &&
      !without.includes(W1) &&
      waiting.includes(START) &&
      !waiting.includes(W1)
  );
  const failedR = opening({ onOwnPlan: () => {}, ownPlanState: 'failed' });
  const coHostR = opening({ onOwnPlan: () => {}, ownPlanState: 'not-host' });
  const listR = opening({ onOwnPlan: () => {}, ownPlanExists: true });
  const statusLine = (h: string, text: string) =>
    new RegExp(`role="status"[^>]*>${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}<`).test(h);
  assert(
    'R',
    'R4 a failed press says W5 and a co-host W4, each a status line; with her list there W3 stands in for W2',
    failedR.includes(W1) &&
      statusLine(failedR, W5) &&
      statusLine(coHostR, W4) &&
      !failedR.includes(W4) &&
      listR.includes(W3) &&
      !listR.includes(W2) &&
      listR.indexOf(W3) > listR.indexOf(`>${W1}</button>`)
  );
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
  };
  const eight = (withRow: boolean) =>
    EIGHT.map((name, i) => ({
      id: `c${i}`,
      name,
      emoji: '',
      items:
        withRow && name === 'Mains'
          ? [{ id: 'i1', name: 'Glazed ham', quantity: 1, unit: 'whole', servingSize: '' }]
          : [],
    }));
  const planView = (props: Record<string, unknown>) =>
    render(
      createElement(
        ToastProvider as any,
        null,
        createElement(Moment2PlanView as any, { ...planProps, ...props })
      )
    );
  const h1Of = (h: string) => flat(h.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? '').trim();
  const emptyOwn = planView({ categories: eight(false), ownPlan: true });
  const fe = flat(emptyOwn);
  assert(
    'R',
    'R5 her own plan, all empty: W6, W7, W8 after it, "No items yet." and "+ Add item" on each of the eight, "+ Add category", W10; no suggest heading, no Regenerate (scoping Q2, Q3, Q6)',
    emptyOwn.length > 0 &&
      h1Of(emptyOwn) === W6('Boxing Day') &&
      fe.includes(W7(0, 8, 6)) &&
      fe.indexOf(W8) > fe.indexOf(W7(0, 8, 6)) &&
      fe.indexOf(W8) < fe.indexOf(W9) &&
      count(fe, /No items yet\./g) === 8 &&
      count(fe, /\+ Add item/g) === 8 &&
      fe.includes('+ Add category') &&
      fe.includes(W10) &&
      !fe.includes(BACK_TO_QUESTIONS) &&
      !/suggest/i.test(fe) &&
      !/Regenerat/.test(fe),
    `h1 "${h1Of(emptyOwn)}"`
  );
  const oneRow = planView({ categories: eight(true), ownPlan: true });
  const fo = flat(oneRow);
  assert(
    'R',
    'R6 her own plan with one row: no W8; W6, W7 in the singular, "No items yet." on the other seven, no Regenerate',
    oneRow.length > 0 &&
      h1Of(oneRow) === W6('Boxing Day') &&
      fo.includes(W7(1, 8, 6)) &&
      fo.includes('Glazed ham') &&
      count(fo, /No items yet\./g) === 7 &&
      !fo.includes(W8) &&
      !/Regenerat/.test(fo)
  );
  const drafted = planView({ categories: eight(true) });
  const fd = flat(drafted);
  assert(
    'R',
    'R7 CONTROL: without ownPlan the drafted view as today: the suggest heading, "based on", both Regenerates (six of the eight), "← Back to the questions"; no W6, W8 or W10',
    drafted.length > 0 &&
      h1Of(drafted) === SUGGEST('Boxing Day') &&
      fd.includes('1 item across 8 categories, based on 6 guests.') &&
      fd.includes(REGEN_PLAN) &&
      count(fd, /↻ Regenerate this category/g) === 6 &&
      fd.includes(BACK_TO_QUESTIONS) &&
      !fd.includes(W6('Boxing Day')) &&
      !fd.includes(W8) &&
      !fd.includes(W10),
    `h1 "${h1Of(drafted)}"`
  );

  // ── S — the sources ────────────────────────────────────────────────────────
  const route = codeOnly(read('src/app/api/events/[id]/setup/route.ts'));
  const s1: Record<string, boolean> = {
    field: /'ownPlan' in body|body\.ownPlan/.test(route),
    hostOnly: count(route, /status:\s*403/g) >= 2,
    lock: /pg_advisory_xact_lock/.test(route),
    onlyIfNone: /\.team\.(count|findFirst)\(/.test(route),
    eight: /import\s*\{[^}]*\bOWN_PLAN_SECTIONS\b[^}]*\}\s*from\s*'@\/lib\/setup\/own-plan'/.test(
      route
    ),
    order: /displayOrder/.test(route),
    manual: /source:\s*'MANUAL'/.test(route),
    noCoordinator: route.length > 0 && !/coordinatorId/.test(route),
    ledger: /CREATE_TEAM/.test(route) && /recordChange/.test(route),
    transaction: count(route, /\$transaction\(/g) >= 2,
  };
  assert(
    'S',
    'S1 the setup route’s ownPlan branch: the host’s alone (403), in a transaction under a per-event lock, the eight from own-plan only when the event has no section, order stored, MANUAL, no coordinator, CREATE_TEAM in the ledger (Q4, Q5)',
    Object.values(s1).every(Boolean),
    Object.entries(s1)
      .filter(([, v]) => !v)
      .map(([k]) => k)
      .join(',')
  );
  assert(
    'S',
    'S2 CONTROL: invites only as GTC-374 and GTC-375 left it: the host’s alone, fixed after the press, put away and brought back in one transaction',
    /putAwayPlan\(tx, eventId, actorId\)/.test(route) &&
      /bringBackPlan\(tx, eventId, actorId\)/.test(route) &&
      route.includes("'Only the host can choose invites only'") &&
      route.includes("'The invitations have gone, so invites only is fixed'") &&
      count(route, /requireEventRole\(eventId, \['HOST', 'COHOST'\]\)/g) === 2
  );
  const setup = codeOnly(read('src/app/plan/[eventId]/setup/page.tsx'));
  const slice = (src: string, from: string, to: string) => {
    const a = src.indexOf(from);
    const b = a < 0 ? -1 : src.indexOf(to, a + from.length);
    return a < 0 || b < 0 ? '' : src.slice(a, b);
  };
  const goTo = slice(setup, 'const goToMoment', 'const doorsFor');
  const doors = slice(setup, 'const doorsFor', 'const details');
  const onReady = slice(setup, 'onReady={async', 'onApprove=');
  const s3: Record<string, boolean> = {
    imports: /import\s*\{[^}]*\bhasAnyPlan\b[^}]*\}\s*from\s*'@\/lib\/setup\/entry-stage'/.test(
      setup
    ),
    mountAndBringBack: count(setup, /resolveSetupStage\(\{[^}]*\bteamCount\b/g) >= 2,
    asked: /requestedStage\(at,\s*\{\s*hasPlan:[^}]*hasAnyPlan\(/.test(setup),
    goToMoment: /hasAnyPlan\(/.test(goTo) && /\.setup\b/.test(goTo),
    doors: /hasPlan:[^,]*hasAnyPlan\(/.test(doors),
    onReady: /loadItems\(\)/.test(onReady),
    press: /ownPlan:\s*true/.test(setup),
    planView: /<Moment2PlanView\b[\s\S]{0,6000}?\bownPlan=\{/.test(setup),
    opening: /<Moment2Opening\b[\s\S]{0,1500}?\bonOwnPlan=\{/.test(setup),
  };
  assert(
    'S',
    'S3 the setup page: hasAnyPlan with the section count at the mount, the bring-back, ?at=, the strip’s doors and its Moment 2 tap (gated on the record); the skeleton reloads items; the press sends ownPlan; the view and the opening are told (Q1)',
    Object.values(s3).every(Boolean),
    Object.entries(s3)
      .filter(([, v]) => !v)
      .map(([k]) => k)
      .join(',')
  );
  const entry = codeOnly(read('src/lib/setup/entry-stage.ts'));
  assert(
    'S',
    'S4 CONTROL: batch12 S3’s three lines, `requestedStage(at,`, no useSearchParams on the page, no useRouter in the plan view, hasGeneratedPlan as it was',
    /if \(!momentTwoBegun\(loadedEvent\.setup\)\)/.test(setup) &&
      /momentTwoBegun:\s*momentTwoBegun\(loadedEvent\.setup\)/.test(setup) &&
      /const hostSaved\s*=\s*momentTwoBegun\(event\?\.setup\)\s*\|\|/.test(setup) &&
      setup.includes('requestedStage(at,') &&
      !setup.includes('useSearchParams') &&
      !codeOnly(read('src/components/plan/Moment2PlanView.tsx')).includes('useRouter') &&
      entry.includes(
        "return items.some((i) => i.source === 'GENERATED' || i.source === 'HOST_EDITED');"
      )
  );
  assert(
    'S',
    'S5 the old dashboard passes its sections to the way back: wayBack({ ...event, items, teams }) (Q1)',
    /wayBack\(\{\s*\.\.\.event,\s*items,\s*teams\s*,?\s*\}\)/.test(
      codeOnly(read('src/app/plan/[eventId]/page.tsx'))
    )
  );
  const teamsRoute = codeOnly(read('src/app/api/events/[id]/teams/route.ts'));
  const teamsPost = teamsRoute.slice(Math.max(0, teamsRoute.indexOf('export async function POST')));
  assert(
    'S',
    'S6 POST /teams puts a new section after the last one, on an event with a record only (Q8)',
    teamsPost.length > 0 &&
      /displayOrder/.test(teamsPost) &&
      (/_max:\s*\{\s*displayOrder:\s*true/.test(teamsPost) ||
        /orderBy:\s*\{\s*displayOrder:\s*'desc'/.test(teamsPost)) &&
      /\bsetup\b/.test(teamsPost)
  );
  const routesAt = (ref: 'HEAD' | 'tree') =>
    (ref === 'HEAD'
      ? git(['ls-tree', '-r', '--name-only', 'HEAD', 'src/app/api'])
      : [
          git(['ls-files', 'src/app/api']),
          git(['ls-files', '--others', '--exclude-standard', 'src/app/api']),
        ].join('\n')
    )
      .split('\n')
      .filter((f) => /\/route\.ts$/.test(f))
      .sort()
      .join('\n');
  const untouched = git([
    'status',
    '--porcelain',
    '--',
    'prisma',
    'src/app/api/auth',
    'src/lib/auth',
    'scripts/triage-unknown-routes.ts',
    'route-classifications.json',
  ]);
  const zone6 = git(['status', '--porcelain', '--', 'tests/security-*']);
  assert(
    'S',
    'S7 CONTROL: no new route; prisma/, the auth routes, src/lib/auth, the triage script, route-classifications.json and tests/security-* untouched',
    routesAt('HEAD').length > 0 &&
      routesAt('tree') === routesAt('HEAD') &&
      untouched === '' &&
      zone6 === '',
    `${untouched} ${zone6}`.trim()
  );
}

// ══ LIVE — the dev server, over HTTP and in the walled-off headless Chrome ═════
const created = { users: [] as string[], people: [] as string[], events: [] as string[] };

async function runLive() {
  const up = await (async () => {
    try {
      return (await realFetch(`${BASE}/`)).ok;
    } catch {
      return false;
    }
  })();
  if (!up)
    console.error('    the dev server does not answer on :3000 — every D and C assertion fails');

  const totals = async () => ({
    invite: await prisma.inviteEvent.count(),
    outbound: await prisma.outboundMessage.count(),
  });
  const before = await totals();

  // ── the fixture: Kate's and Cara's events, example.com addresses, no phones, nothing queued ──
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const mail = (l: string) => `gtc382-${l}-${stamp}@example.com`;
  const mkUser = async (label: string, name: string) => {
    const user = await prisma.user.create({ data: { email: mail(label) } });
    created.users.push(user.id);
    const person = await prisma.person.create({
      data: { name, email: user.email, userId: user.id },
    });
    created.people.push(person.id);
    const token = randomBytes(32).toString('hex');
    await prisma.session.create({
      data: { userId: user.id, token, expiresAt: new Date(Date.now() + 3600e3) },
    });
    return { userId: user.id, personId: person.id, token };
  };
  const kate = await mkUser('kate', 'Kate Lowe');
  const cara = await mkUser('cara', 'Cara Lowe');
  // Sat 26 Dec 2026 in New Zealand.
  const start = new Date('2026-12-25T23:00:00.000Z');
  let n = 0;
  const mkEvent = async (
    name: string,
    opts: { setup?: Record<string, unknown> | null; cohost?: boolean } = {}
  ) => {
    const ev = await prisma.event.create({
      data: {
        name,
        startDate: start,
        endDate: start,
        hostId: kate.personId,
        venueName: 'Kate’s place',
        venueTimingStart: '12:00',
        venueTimingEnd: '16:00',
        ...(opts.setup === null ? {} : { setup: { create: opts.setup ?? {} } }),
      } as any,
    });
    created.events.push(ev.id);
    await prisma.eventRole.create({ data: { eventId: ev.id, userId: kate.userId, role: 'HOST' } });
    if (opts.cohost)
      await prisma.eventRole.create({
        data: { eventId: ev.id, userId: cara.userId, role: 'COHOST' },
      });
    return ev.id;
  };
  const household = async (eventId: string, members: [string, string][], host = false) => {
    const h = await prisma.household.create({ data: { eventId } });
    for (const [i, [nm, role]] of members.entries()) {
      let personId = kate.personId;
      if (!(host && i === 0)) {
        const p = await prisma.person.create({
          data: {
            name: nm,
            email: role === 'CHILD' ? null : mail(`${nm.toLowerCase().replace(/\W/g, '')}-${n++}`),
          },
        });
        created.people.push(p.id);
        personId = p.id;
      }
      await prisma.personEvent.create({
        data: {
          personId,
          eventId,
          role: host && i === 0 ? 'HOST' : 'PARTICIPANT',
          householdId: h.id,
          householdRole: role,
        } as any,
      });
    }
  };
  /** Kate's household, the Hendersons (Gus, Aroha, Mia) and Ted. */
  const everyone = async (eventId: string) => {
    await household(eventId, [['Kate Lowe', 'PRIMARY_CONTACT']], true);
    await household(eventId, [
      ['Gus Henderson', 'PRIMARY_CONTACT'],
      ['Aroha Henderson', 'PARTNER'],
      ['Mia Henderson', 'CHILD'],
    ]);
    await household(eventId, [['Ted Parata', 'PRIMARY_CONTACT']]);
  };
  /** The eight as the press is to make them, by Prisma: for the controls and Q8's check. */
  const eightByHand = async (eventId: string) => {
    const ids: Record<string, string> = {};
    for (const [i, name] of EIGHT.entries()) {
      const domain = name === 'Set up' ? 'SETUP' : name === 'Clean up' ? 'CLEANUP' : null;
      const t = await prisma.team.create({
        data: {
          name,
          eventId,
          source: 'MANUAL',
          displayOrder: i + 1,
          ...(domain ? { domain, domainConfidence: 'HIGH' } : {}),
        } as any,
      });
      ids[name] = t.id;
    }
    return ids;
  };
  const teamsOf = (eventId: string) =>
    prisma.team.findMany({
      where: { eventId },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      select: { name: true, displayOrder: true, source: true, coordinatorId: true, domain: true },
    });
  const isTheEight = (teams: Awaited<ReturnType<typeof teamsOf>>) =>
    teams.length === 8 &&
    teams.map((t) => t.name).join('|') === EIGHT.join('|') &&
    teams.every((t, i) => t.displayOrder === i + 1 && t.source === 'MANUAL') &&
    teams[6].domain === 'SETUP' &&
    teams[7].domain === 'CLEANUP';
  const createTeams = (eventId: string) =>
    prisma.auditEntry.count({ where: { eventId, actionType: 'CREATE_TEAM' } });

  const http = (path: string, token: string, init: RequestInit = {}) =>
    realFetch(`${BASE}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', cookie: `session=${token}` },
    });
  const post = (eventId: string, token: string, body: Record<string, unknown>) =>
    http(`/api/events/${eventId}/setup`, token, { method: 'POST', body: JSON.stringify(body) });
  const json = async (res: Response | null) => (res ? await res.json().catch(() => ({})) : {});

  // Layer D's events: each a record with Kate's household.
  const dA = await mkEvent('GTC-382 b13 — D, the press');
  const dB = await mkEvent('GTC-382 b13 — D, two at once');
  const dC = await mkEvent('GTC-382 b13 — D, a co-host', { cohost: true });
  const dD = await mkEvent('GTC-382 b13 — D, invites only', { setup: { invitesOnly: true } });
  const dE = await mkEvent('GTC-382 b13 — D, put away');
  const dF = await mkEvent('GTC-382 b13 — D, add category');
  const dG = await mkEvent('GTC-382 b13 — D, old style', { setup: null });
  for (const id of [dA, dB, dC, dD, dE, dF, dG])
    await household(id, [['Kate Lowe', 'PRIMARY_CONTACT']], true);
  const eE = await eightByHand(dE);
  await prisma.item.create({
    data: { name: 'Glazed ham', teamId: eE['Mains'], source: 'MANUAL', kind: 'ITEM' } as any,
  });
  await eightByHand(dF);
  await prisma.team.create({
    data: { name: 'Drinks', eventId: dG, source: 'MANUAL', coordinatorId: kate.personId } as any,
  });
  // Layer C's events: her own plan's walk, and a drafted plan for the control.
  const evA = await mkEvent('GTC-382 b13 — own plan');
  await everyone(evA);
  const evD = await mkEvent('GTC-382 b13 — drafted', { setup: { eventType: 'Christmas' } });
  await everyone(evD);
  for (const [i, name] of ['Mains', 'Dessert'].entries()) {
    const t = await prisma.team.create({
      data: { name, eventId: evD, displayOrder: i + 1, source: 'GENERATED' } as any,
    });
    await prisma.item.create({
      data: {
        name: name === 'Mains' ? 'Roast lamb' : 'Pavlova',
        teamId: t.id,
        source: 'GENERATED',
        aiGenerated: true,
        kind: 'ITEM',
        displayOrder: 1,
      } as any,
    });
  }

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
      await prisma.planRevision.count({ where: evIn }),
      await prisma.auditEntry.count({ where: evIn }),
      await prisma.outboundMessage.count({ where: evIn }),
      await prisma.inviteEvent.count({ where: evIn }),
    ].join(',');

  // ── D — over HTTP ───────────────────────────────────────────────────────────
  const d: Record<string, boolean> = {};
  const dd: Record<string, string> = {};
  if (up) {
    try {
      const r1 = await post(dA, kate.token, { ownPlan: true });
      const b1 = await json(r1);
      const t1 = await teamsOf(dA);
      d.D1 =
        r1.status === 200 &&
        b1?.ownPlan?.made === true &&
        isTheEight(t1) &&
        t1.every((t) => t.coordinatorId === null) &&
        (await createTeams(dA)) === 8;
      dd.D1 = `${r1.status} ${JSON.stringify(b1?.ownPlan)} ${t1.map((t) => `${t.displayOrder}:${t.name}`).join(',')}`;

      const r2 = await post(dA, kate.token, { ownPlan: true });
      const b2 = await json(r2);
      const t2 = await teamsOf(dA);
      d.D2 =
        r2.status === 200 &&
        b2?.ownPlan?.made === false &&
        isTheEight(t2) &&
        (await createTeams(dA)) === 8;
      dd.D2 = `${r2.status} ${JSON.stringify(b2?.ownPlan)} teams ${t2.length}`;

      const [r3a, r3b] = await Promise.all([
        post(dB, kate.token, { ownPlan: true }),
        post(dB, kate.token, { ownPlan: true }),
      ]);
      const b3 = [await json(r3a), await json(r3b)];
      const t3 = await teamsOf(dB);
      d.D3 =
        r3a.status === 200 &&
        r3b.status === 200 &&
        b3.filter((b) => b?.ownPlan?.made === true).length === 1 &&
        isTheEight(t3) &&
        (await createTeams(dB)) === 8;
      dd.D3 = `${r3a.status}/${r3b.status} ${JSON.stringify(b3.map((b) => b?.ownPlan))} teams ${t3.length}`;

      const r4 = await post(dC, cara.token, { ownPlan: true });
      const t4 = await teamsOf(dC);
      d.D4 = r4.status === 403 && t4.length === 0 && (await createTeams(dC)) === 0;
      dd.D4 = `${r4.status} teams ${t4.length}`;

      const r5 = await post(dD, kate.token, { invitesOnly: false, ownPlan: true });
      const b5 = await json(r5);
      const t5 = await teamsOf(dD);
      const flag5 = (await prisma.eventSetup.findUnique({ where: { eventId: dD } }))?.invitesOnly;
      d.D5 = r5.status === 200 && flag5 === false && b5?.ownPlan?.made === true && isTheEight(t5);
      dd.D5 = `${r5.status} flag ${flag5} ${JSON.stringify(b5?.ownPlan)} teams ${t5.length}`;

      const r6a = await post(dE, kate.token, { invitesOnly: true });
      const b6a = await json(r6a);
      const away = await prisma.team.count({ where: { eventId: dE } });
      const r6b = await post(dE, kate.token, { invitesOnly: false });
      const b6b = await json(r6b);
      const t6 = await teamsOf(dE);
      const ham = await prisma.item.findFirst({
        where: { team: { eventId: dE }, name: 'Glazed ham' },
        select: { source: true, team: { select: { name: true } } },
      });
      d.D6 =
        r6a.status === 200 &&
        b6a?.putAway === true &&
        away === 0 &&
        r6b.status === 200 &&
        b6b?.broughtBack === true &&
        isTheEight(t6) &&
        ham?.team.name === 'Mains' &&
        ham?.source === 'MANUAL';
      dd.D6 = `${r6a.status} away ${away} ${r6b.status} ${b6b?.broughtBack} teams ${t6.map((t) => `${t.displayOrder}:${t.name}`).join(',')} ham ${JSON.stringify(ham)}`;

      const addCat = (eventId: string) =>
        http(`/api/events/${eventId}/teams`, kate.token, {
          method: 'POST',
          body: JSON.stringify({ name: 'Cheese', coordinatorId: kate.personId }),
        });
      const r7 = await addCat(dF);
      const t7 = await teamsOf(dF);
      const r7v1 = await addCat(dG);
      const v1 = await prisma.team.findFirst({
        where: { eventId: dG, name: 'Cheese' },
        select: { displayOrder: true },
      });
      d.D7 =
        r7.status === 201 &&
        t7.length === 9 &&
        t7[8].name === 'Cheese' &&
        t7[8].displayOrder === 9 &&
        r7v1.status === 201 &&
        v1?.displayOrder === 0;
      dd.D7 = `${r7.status} ${t7.map((t) => `${t.displayOrder}:${t.name}`).join(',')} | old style ${r7v1.status} ${v1?.displayOrder}`;
    } catch (e) {
      console.error('D layer threw:', (e as Error).message);
    }
  }
  const D_LABELS: Record<string, string> = {
    D1: 'the host’s press makes the eight, in order 1 to 8, MANUAL, SETUP and CLEANUP, no coordinator, eight CREATE_TEAM entries; ownPlan.made is true (Q4)',
    D2: 'a second press makes nothing: still eight, still eight entries; ownPlan.made is false (Q4)',
    D3: 'two presses at once make one set: both 200, one made, eight sections (Q4)',
    D4: 'a co-host is refused 403 and nothing is made (Q5)',
    D5: 'on an invites-only event with nothing put away, one press clears the flag and makes the eight (Q2)',
    D6: 'CONTROL: a hand-made plan put away and brought back keeps its eight, in order, MANUAL, and its row in Mains',
    D7: '"+ Add category" on an event with a record lands ninth (order 9); on an old-style event it is stored as today, order 0 (Q8)',
  };
  for (const id of ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'])
    assert('D', `${id} ${D_LABELS[id]}`, d[id] === true, dd[id]);

  // ── C — in the walled-off headless Chrome ───────────────────────────────────
  const r: Record<string, boolean> = {};
  const detail: Record<string, string> = {};
  const refusals: string[] = [];
  const covered: string[] = [];
  let probes = { plan: '', send: '' };
  let hosts: string[] = [];
  let blocked: string[] = [];
  let dialogs: string[] = [];
  let nonGet: string[] = ['(never read)'];
  let chrome: Headless | null = null;
  const nameA = 'GTC-382 b13 — own plan';
  try {
    if (!up) throw new Error('no dev server');
    chrome = await openHeadless({ fetchImpl: realFetch, port: PORT });
    const c = chrome;
    await c.blockPlanMaking();
    await c.blockSends();
    // None is expected (K4 fails on any); answered so a red run cannot hang on one.
    c.answerLeaveDialogs(true);
    // Every request the page makes that is not a GET, kept across navigations in this tab.
    await c.addInitScript(`(() => { const f = window.fetch.bind(window);
      window.fetch = (input, init) => { const m = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
        if (m !== 'GET' && m !== 'HEAD') { try { const k = '__gtc382_nonget'; const l = JSON.parse(sessionStorage.getItem(k) || '[]');
          l.push(m + ' ' + (typeof input === 'string' ? input : (input && input.url) || '')); sessionStorage.setItem(k, JSON.stringify(l)); } catch {} }
        return f(input, init); }; })();`);
    await c.navigate('/', 3000);
    probes = {
      plan: await c.evaluate<string>(
        `fetch('/api/gtc382-probe/finalize-plan', { method: 'POST' }).then(r => 'reached ' + r.status).catch(() => 'failed')`
      ),
      send: await c.evaluate<string>(
        `fetch('/api/events/gtc382-probe/send', { method: 'POST' }).then(r => 'reached ' + r.status).catch(() => 'failed')`
      ),
    };
    // The probes are the only writes the page is not meant to make: start the record after them.
    await c.evaluate(`sessionStorage.removeItem('__gtc382_nonget')`);
    await c.setSessionCookie(kate.token);
    const ev = <T = any,>(js: string) => c.evaluate<T>(js);
    /**
     * Tag what `js` finds, check it is on top at its middle, then click it — guarded. 'absent' when
     * not found, 'covered' when something else is on top (never pressed; neither is a refusal).
     */
    const tap = async (js: string, settleMs = 700) => {
      const state = await ev<string>(
        `(() => { document.querySelectorAll('[data-t]').forEach(e => e.removeAttribute('data-t')); const el = ${js}; if (!el) return 'absent';
          el.setAttribute('data-t', 'x'); el.scrollIntoView({ block: 'center', inline: 'nearest' }); const b = el.getBoundingClientRect();
          const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return hit && el.contains(hit) ? 'ok' : 'covered'; })()`
      );
      if (state !== 'ok') {
        if (state === 'covered') covered.push(js.slice(0, 80));
        return state;
      }
      const why = await c.clickGuarded('[data-t="x"]', settleMs);
      if (why) refusals.push(`${js}: ${why}`);
      return why;
    };
    const norm = `(s) => (s || '').replace(/\\s+/g, ' ').trim()`;
    const buttonNamed = (words: string, within = 'document') =>
      `[...${within}.querySelectorAll('button')].find(b => (${norm})(b.innerText) === ${JSON.stringify(words)})`;
    const W1_BUTTON = buttonNamed(W1);
    const current = () =>
      ev<string>(
        `document.querySelector('[data-moment-strip] [aria-current="step"]')?.textContent.trim() ?? ''`
      );
    /** The plan view as she sees it: its heading, its count line, its sections in order. */
    const planState = () =>
      ev<any>(`(() => { const h1 = document.querySelector('h1'); const t = document.body.innerText;
        const heads = [...document.querySelectorAll('button > h2')].map(h => (${norm})(h.textContent));
        const mains = [...document.querySelectorAll('button > h2')].find(h => (${norm})(h.textContent).endsWith('Mains'));
        return { h1: h1 ? (${norm})(h1.innerText) : null, line: h1 && h1.nextElementSibling ? (${norm})(h1.nextElementSibling.innerText) : null,
          heads, order: ${JSON.stringify(EIGHT)}.every((x, i) => (heads[i] || '').endsWith(x)),
          empty: (t.match(/No items yet\\./g) || []).length, first: t.includes(${JSON.stringify(W8)}),
          regen: /Regenerat/.test(t), suggest: /suggest/i.test(t),
          mains: mains ? (${norm})(mains.closest('button').parentElement.innerText) : null,
          back: [...document.querySelectorAll('.fixed.bottom-0 button')].map(b => (${norm})(b.innerText)),
          sw: document.documentElement.scrollWidth }; })()`);
    const ownPlanShown = (p: any) => !!p && p.h1 === W6(nameA) && p.order && !p.regen && !p.suggest;
    const teamCountA = () => prisma.team.count({ where: { eventId: evA } });

    // C1 — Moment 2's opening on her event (no plan yet), at 1280 and 390.
    for (const [w, h, mobile] of [
      [1280, 900, false],
      [390, 844, true],
    ] as [number, number, boolean][]) {
      const k = mobile ? 'p' : '';
      await c.setViewport(w, h, mobile);
      await c.navigate(`/plan/${evA}/setup?at=opening`, 8000);
      const o =
        await ev<any>(`(() => { const rect = (e) => { if (!e) return null; const b = e.getBoundingClientRect();
          return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, width: b.width, height: b.height }; };
        const go = ${buttonNamed(START)}; const own = ${W1_BUTTON};
        const line = [...document.querySelectorAll('p')].find(p => (${norm})(p.innerText) === ${JSON.stringify(W2)});
        const io = document.querySelector('[data-invites-only]');
        const yours = [...document.querySelectorAll('a')].find(a => (${norm})(a.innerText) === ${JSON.stringify(YOUR_EVENTS)});
        const strip = document.querySelector('[data-moment-strip]');
        const cs = (e) => e ? getComputedStyle(e) : null;
        return { go: rect(go), own: rect(own), line: rect(line), io: rect(io), yours: rect(yours), strip: rect(strip),
          ownBorder: own ? parseFloat(cs(own).borderTopWidth) : 0, ownBg: own ? cs(own).backgroundColor : null,
          goBg: go ? cs(go).backgroundColor : null, sw: document.documentElement.scrollWidth }; })()`);
      const near = (a: number, b: number) => Math.abs(a - b) <= 1;
      const apart = (a: any, b: any) =>
        !!a &&
        !!b &&
        (a.bottom <= b.top || b.bottom <= a.top || a.right <= b.left || b.right <= a.left);
      r[`C1${k}`] =
        !!o?.go &&
        !!o?.own &&
        o.own.top >= o.go.bottom &&
        o.own.top - o.go.bottom <= 24 &&
        near(o.own.width, o.go.width) &&
        near(o.own.height, o.go.height) &&
        near(o.own.left, o.go.left) &&
        o.ownBorder >= 1 &&
        o.ownBg !== o.goBg &&
        !!o.line &&
        o.line.top >= o.own.bottom &&
        !!o.io &&
        o.io.top >= o.line.bottom &&
        apart(o.yours, o.strip) &&
        (!mobile || o.sw <= 390);
      detail[`C1${k}`] = JSON.stringify(o);
    }

    await c.setViewport(1280, 1400, false);
    // C2 — a guarded tap on W1 opens the eight, in order, with W6 and W8, and no Regenerate.
    await c.navigate(`/plan/${evA}/setup?at=opening`, 8000);
    const t2 = await tap(W1_BUTTON, 6000);
    const p2 = await planState();
    r.C2 =
      t2 === null && ownPlanShown(p2) && p2.empty === 8 && p2.first && (await teamCountA()) === 8;
    detail.C2 = JSON.stringify({ t2, p2 });

    // C3 — a reload keeps her own plan.
    await c.navigate(`/plan/${evA}/setup`, 8000);
    const p3 = await planState();
    r.C3 = ownPlanShown(p3) && p3.empty === 8 && p3.first;
    detail.C3 = JSON.stringify(p3);

    // C4 — a row added with "+ Add item" survives a reload, and W8 goes.
    const MAINS_SECTION = `(() => { const h = [...document.querySelectorAll('button > h2')].find(x => (${norm})(x.textContent).endsWith('Mains'));
      return h ? h.closest('button').parentElement : null; })()`;
    const opened4 = ownPlanShown(p3)
      ? await tap(
          `(() => { const s = ${MAINS_SECTION}; return s && ${buttonNamed('+ Add item', 's')}; })()`,
          800
        )
      : 'absent';
    const field4 =
      opened4 === null
        ? await tap(
            `(() => { const s = ${MAINS_SECTION}; return s && s.querySelector('input[type="text"]'); })()`,
            300
          )
        : 'absent';
    if (field4 === null) await c.insertText('Glazed ham');
    const added4 =
      field4 === null
        ? await tap(
            `(() => { const s = ${MAINS_SECTION}; return s && ${buttonNamed('Add', 's')}; })()`,
            3000
          )
        : 'absent';
    await c.navigate(`/plan/${evA}/setup`, 8000);
    const p4 = await planState();
    r.C4 =
      added4 === null &&
      ownPlanShown(p4) &&
      (p4.mains ?? '').includes('Glazed ham') &&
      p4.empty === 7 &&
      !p4.first &&
      /^1 item across 8 categories, for \d+ guests?\.$/.test(p4.line ?? '');
    detail.C4 = JSON.stringify({ opened4, field4, added4, p4 });

    // C5 — from her plan to Moment 1 by the strip, and back by the strip's "What's the plan?".
    const strip = (label: string) =>
      `[...document.querySelectorAll('[data-moment-strip] button')].find(b => b.textContent.includes(${JSON.stringify(label)}))`;
    const t5a = ownPlanShown(p4) ? await tap(strip("Who's coming?"), 3000) : 'absent';
    const cur5 = await current();
    const t5b = t5a === null ? await tap(strip("What's the plan?"), 4000) : 'absent';
    const p5 = await planState();
    r.C5 = t5a === null && cur5.includes("Who's coming?") && t5b === null && ownPlanShown(p5);
    detail.C5 = JSON.stringify({ t5a, cur5, t5b, h1: p5?.h1 });

    // C6 — the pre-flight's `?at=plan` opens her plan, and `?at=opening` no longer opens the opening.
    await c.navigate(`/plan/${evA}/setup?at=plan`, 8000);
    const p6a = await planState();
    await c.navigate(`/plan/${evA}/setup?at=opening`, 8000);
    const p6b = await planState();
    const opening6 = await ev<boolean>(`!!(${buttonNamed(START)})`);
    r.C6 = ownPlanShown(p6a) && ownPlanShown(p6b) && !opening6;
    detail.C6 = JSON.stringify({ a: p6a?.h1, b: p6b?.h1, opening6 });

    // C7 — the old dashboard's way back reads W5 and lands on her plan.
    await c.navigate(`/plan/${evA}`, 9000);
    const link7 = `[...document.querySelectorAll('a')].find(a => (${norm})(a.innerText) === ${JSON.stringify(WB_W5)})`;
    const href7 = await ev<string | null>(`(${link7})?.getAttribute('href') ?? null`);
    const t7 = href7 ? await tap(link7, 8000) : 'absent';
    const path7 = await ev<string>(`location.pathname`);
    const p7 = await planState();
    r.C7 =
      href7 === `/plan/${evA}/setup` &&
      t7 === null &&
      path7 === `/plan/${evA}/setup` &&
      ownPlanShown(p7);
    detail.C7 = JSON.stringify({ href7, t7, path7, h1: p7?.h1 });

    // C8 — W10 goes to Moment 2's opening, where W3 stands under W1; W1 again returns to the same eight.
    await c.navigate(`/plan/${evA}/setup`, 8000);
    const p8a = await planState();
    const t8a = ownPlanShown(p8a)
      ? await tap(buttonNamed(W10, `document.querySelector('.fixed.bottom-0')`), 3000)
      : 'absent';
    const o8 = await ev<any>(`(() => { const t = document.body.innerText;
      return { start: !!(${buttonNamed(START)}), own: !!(${W1_BUTTON}), w3: t.includes(${JSON.stringify(W3)}), w2: t.includes(${JSON.stringify(W2)}) }; })()`);
    const t8b = t8a === null && o8.own ? await tap(W1_BUTTON, 5000) : 'absent';
    const p8b = await planState();
    r.C8 =
      t8a === null &&
      o8.start &&
      o8.own &&
      o8.w3 &&
      !o8.w2 &&
      t8b === null &&
      ownPlanShown(p8b) &&
      (p8b.mains ?? '').includes('Glazed ham') &&
      (await teamCountA()) === 8;
    detail.C8 = JSON.stringify({ t8a, o8, t8b, h1: p8b?.h1, teams: await teamCountA() });

    // C9 — at 390 her plan scrolls nowhere sideways, and the footer's back reads W10.
    await c.setViewport(390, 844, true);
    await c.navigate(`/plan/${evA}/setup`, 8000);
    const p9 = await planState();
    r.C9 = ownPlanShown(p9) && p9.sw <= 390 && p9.back.includes(W10);
    detail.C9 = JSON.stringify({ h1: p9?.h1, sw: p9?.sw, back: p9?.back });

    // C10 — CONTROL: a drafted plan still has the suggest heading and both Regenerates.
    await c.setViewport(1280, 1400, false);
    await c.navigate(`/plan/${evD}/setup`, 8000);
    const p10 =
      await ev<any>(`(() => { const h1 = document.querySelector('h1'); const t = document.body.innerText;
      return { h1: h1 ? (${norm})(h1.innerText) : null, plan: t.includes(${JSON.stringify(REGEN_PLAN)}),
        category: t.includes(${JSON.stringify(REGEN_CATEGORY)}), basedOn: t.includes('based on'),
        back: [...document.querySelectorAll('.fixed.bottom-0 button')].some(b => (${norm})(b.innerText) === ${JSON.stringify(BACK_TO_QUESTIONS)}),
        own: t.includes(${JSON.stringify(W10)}) || t.includes(${JSON.stringify(W8)}) }; })()`);
    r.C10 =
      p10?.h1 === SUGGEST('GTC-382 b13 — drafted') &&
      p10.plan &&
      p10.category &&
      p10.basedOn &&
      p10.back &&
      !p10.own;
    detail.C10 = JSON.stringify(p10);

    nonGet = await ev<string[]>(`JSON.parse(sessionStorage.getItem('__gtc382_nonget') || '[]')`);
    hosts = c.hostsRequested();
    blocked = c.planMakingBlocked();
    dialogs = c.dialogs();
  } catch (e) {
    console.error('live layer threw:', (e as Error).message);
  } finally {
    chrome?.close();
  }
  if (covered.length) console.log(`    covered (not pressed): ${covered.join(' | ')}`);

  const C_LABELS: Record<string, string> = {
    C1: 'Moment 2’s opening: W1 directly under "Let’s do this →", the same width and height, outlined; W2 under it; invites only below; "← Your events" clear of the strip (scoping Q3, Q9)',
    C2: 'a guarded tap on W1 opens her plan: W6, the eight in order, "No items yet." on each, W8, no Regenerate, eight sections stored (Q4)',
    C3: 'a reload keeps her own plan, the eight in order, W8 (Q1)',
    C4: 'a row added through "+ Add item" survives a reload; W8 gone; W7 "1 item across 8 categories, for N guests." (Q1, Q6)',
    C5: 'the strip to Moment 1, then the strip’s "What’s the plan?" back to her plan (Q1)',
    C6: '?at=plan opens her plan; ?at=opening no longer opens the opening (Q1, C6)',
    C7: 'the old dashboard’s way back reads W5 and lands on her plan (Q1)',
    C8: 'W10 goes to Moment 2’s opening, W3 under W1; W1 again returns to the same eight, nothing made (Q3)',
    C9: 'at 390 her plan scrolls nowhere sideways and the footer’s back reads W10',
    C10: 'CONTROL: a drafted plan still shows the suggest heading, "based on", both Regenerates and "← Back to the questions"',
  };
  for (const id of ['C1', 'C1p', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10']) {
    const where = id.endsWith('p') || id === 'C9' ? 'phone' : 'desktop';
    assert('C', `${id} ${where}: ${C_LABELS[id.replace(/p$/, '')]}`, r[id] === true, detail[id]);
  }

  // ── K — the controls ───────────────────────────────────────────────────────
  assert(
    'K',
    'K1 CONTROL: both probes failed in the browser (plan-making and sending blocked)',
    probes.plan === 'failed' && probes.send === 'failed',
    JSON.stringify(probes)
  );
  assert(
    'K',
    'K2 CONTROL: no click was refused',
    up && refusals.length === 0,
    refusals.join(' | ')
  );
  const allowed = [
    new RegExp(`^POST /api/events/${evA}/setup$`),
    new RegExp(`^POST /api/events/${evA}/teams/[^/]+/items$`),
    /^POST \/api\/events\/[^/]+\/gate-check$/,
  ];
  assert(
    'K',
    'K3 CONTROL: Chrome asked only localhost:3000, and the page’s only writes are the press, the added row and the old dashboard’s read-only gate checks',
    hosts.length > 0 &&
      hosts.every((x) => x === 'localhost:3000') &&
      !nonGet.includes('(never read)') &&
      nonGet.every((x) => allowed.some((re) => re.test(x))),
    `${hosts.join(',')} | non-GET ${nonGet.join(' | ')}`
  );
  assert('K', 'K4 CONTROL: no dialog at all', up && dialogs.length === 0, dialogs.join(','));
  assert(
    'K',
    'K5 CONTROL: no plan-making request at all: nothing blocked but the two probes, and no write to finalize-plan, regenerate-plan, generate or suggest-resolution',
    up &&
      blocked.length === 2 &&
      blocked.every((b) => /gtc382-probe/.test(b)) &&
      !nonGet.some((x) =>
        /finalize-plan|regenerate-plan|\/generate|\/regenerate|suggest-resolution/.test(x)
      ),
    `blocked ${blocked.join(' | ')}`
  );
  const whileExists = await rows();
  const ai = (
    await prisma.event.findMany({
      where: { id: { in: created.events } },
      select: { aiCallsUsed: true },
    })
  ).map((e) => e.aiCallsUsed);
  console.log(
    `    fixture while it existed (Event, EventSetup, EventRole, Household, PersonEvent, Person, User, Session, Team, Item, Assignment, AccessToken, PlanRevision, AuditEntry, OutboundMessage, InviteEvent): ${whileExists}`
  );
  console.log(`    aiCallsUsed while it existed: ${ai.join(',')}`);
  await cleanup();
  const left = await rows();
  const after = await totals();
  assert(
    'K',
    'K6 CONTROL: aiCallsUsed 0 on all nine events while they exist, nothing queued or recorded on them; every fixture row removed by id; the InviteEvent and OutboundMessage totals as found',
    ai.length === 9 &&
      ai.every((x) => x === 0) &&
      whileExists.endsWith(',0,0') &&
      left === '0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0' &&
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
  // Every row below was made by this suite: its nine events and what hangs off them (the sections
  // and rows the app made on them at its request, their ledger and the put-away revision), its
  // people, its users and their sessions.
  const evIds = created.events;
  const tokenIds = (
    await prisma.accessToken.findMany({ where: { eventId: { in: evIds } }, select: { id: true } })
  ).map((t) => t.id);
  await del(() => prisma.accessToken.deleteMany({ where: { id: { in: tokenIds } } }));
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

async function main() {
  await runInMemory();
  await runLive();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (redAssertions.length) {
    console.log('\nRED:');
    for (const x of redAssertions) console.log(`  ${x}`);
  }
}

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
