/**
 * GTC-379 — walkthrough batch 10: Moment 2's questions (the 10 Oct walk's second batch).
 *
 * The founder walked the launch code on 2026-10-10 and ruled five batches (GTC-378). This suite
 * pins the second to his rulings (GTC-379, PLAN RULINGS 2026-10-10 and ruling 6 of 2026-10-11):
 *
 *   41  Notes is the last box, after "📋 Other", under a thin line and some space, no words
 *       (ruling 4)
 *   42  Entrée & Starters comes before Mains: in the questions, for every kind (Casual BBQ, Easter
 *       and Farewell now show it up front, ruling 1), in what the AI is handed, and in a plan
 *       written afterwards; a plan already written keeps its order, even on a full redraft
 *       (ruling 2)
 *   43  "Select all" / "Unselect all" (W1 to W3, ruling 3) on every list of dishes under a ticked
 *       style; none on styles, Cake, considerations, a radio list, or a disabled tree
 *   44  "What you’ve picked" (W4 to W9) at the foot of the questions, under Notes, above the bar
 *
 * What the build is asked for, beyond the words: OptionTree exports `selectAll(levels,
 * selections, levelIndex, style)` and `unselectAll(...)` (pure; the choices that list shows under
 * that style, the rest and the "Other" text untouched) and marks its control `data-select-all`;
 * plan-write exports `sectionsInPlanOrder(sections)`; `src/lib/moments/picks-summary.ts` exports
 * `PICKS_WORDS.HEADING` and `picksSummary({ eventType, sections, picks, dietary })`, the lines in
 * screen order (`sections` are the keys as the screen shows them; `picks` maps a section's key to
 * its `{ selections, stillDeciding }`, Mains included).
 *
 * Layers O, S, H, P and R run in memory. Layer D writes its own fixture (an example.com host, two
 * events) and hands `applyPlanSections` canned sections; nothing calls the AI. Layer L drives the
 * dev server in the walled-off headless Chrome (port 9477) on a fixture of its own (example.com
 * addresses, no phones, nothing queued), behind the three safeguards of GATHER-BUILD-CONSTANTS.md
 * and the send wall: the browser fails every plan-making request and every request to a door that
 * sends before it leaves the page (both proven on probe URLs first); every click is
 * `clickGuarded`; a "leave site?" dialog is the only kind answered, and every dialog is logged.
 * Never pressed: Generate, Regenerate, Send, Move on, New Event, a print dialog. Each fixture's
 * `aiCallsUsed` is read while it exists, its rows counted, then removed by id; gather_dev's
 * totals are asserted as found.
 *
 * Every new assertion carries a presence clause, so a check of something absent cannot pass before
 * the build. A target that is missing is not a click refusal: `tap` reports it as 'absent'.
 *
 * Needs the dev server on :3000 and a global WebSocket (NODE_OPTIONS=--experimental-websocket).
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';

import { prisma } from '../src/lib/prisma';
import { installProviderTrap } from './helpers/provider-trap';
import { openHeadless, type Headless } from './helpers/headless';
import {
  CONFIG_EVENT_TYPES,
  getCategoryLevels,
  getUpFrontCategories,
  withoutOrphanedChoices,
} from '../src/lib/ai/config-loader';
import { FOOD_CATEGORY_ORDER } from '../src/lib/ai/plan-categories';
import { buildPlanGenerationInput } from '../src/lib/ai/plan-input';
import { buildPlanGenerationPrompt } from '../src/lib/ai/prompts';
import { applyPlanSections } from '../src/lib/ai/plan-write';
import OptionTree from '../src/components/shared/OptionTree';

const realFetch = globalThis.fetch;
installProviderTrap();
const BASE = 'http://localhost:3000';
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

async function okAsync(fn: () => Promise<boolean>): Promise<boolean> {
  try {
    return (await fn()) === true;
  } catch {
    return false;
  }
}

const read = (rel: string) => {
  try {
    return readFileSync(join(process.cwd(), rel), 'utf8');
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

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ── The ruled words, verbatim (GTC-379, PLAN RULINGS 2026-10-10) ─────────────
const W1 = 'Select all';
const W2 = 'Unselect all';
const W3 = (verb: string, style: string) => `${verb} under “${style}”`;
const W4 = 'What you’ve picked';
const W6 = 'Still deciding · left out of the plan for now';
const W7 = (summary: string) => `⚠️ Dietary requirements: ${summary}`;
const W8 = (names: string) => `Nothing picked in ${names} yet. Gather will choose for you.`;
const W9 = 'Nothing picked yet.';

/** The kinds' questions as ruled (GTC-379, "The plan, as ruled"): up front | behind "Show more". */
const KEY: Record<string, string> = {
  Entrée: 'entree_starters',
  Mains: 'mains',
  Sides: 'sides_salads',
  Dessert: 'dessert',
  Cake: 'cake',
  Alcoholic: 'drinks_alcoholic',
  'Non-alcoholic': 'drinks_non_alcoholic',
  Snacks: 'table_snacks',
  Brunch: 'breakfast_brunch',
};
const RULED_ORDER: [string, string, string][] = [
  ['Christmas', 'Entrée, Mains, Sides, Dessert, Alcoholic, Non-alcoholic, Snacks', 'Cake, Brunch'],
  [
    'Birthday (Adult)',
    'Entrée, Mains, Dessert, Cake, Alcoholic, Non-alcoholic, Snacks',
    'Sides, Brunch',
  ],
  [
    'Birthday (Kids)',
    'Cake, Non-alcoholic, Snacks',
    'Entrée, Mains, Sides, Dessert, Alcoholic, Brunch',
  ],
  ['Casual BBQ', 'Entrée, Mains, Sides, Alcoholic, Non-alcoholic, Snacks', 'Dessert, Cake, Brunch'],
  [
    'Wedding Reception',
    'Entrée, Mains, Sides, Dessert, Cake, Alcoholic, Non-alcoholic',
    'Snacks, Brunch',
  ],
  [
    'Baby Shower',
    'Entrée, Dessert, Cake, Non-alcoholic, Snacks',
    'Mains, Sides, Alcoholic, Brunch',
  ],
  [
    'Engagement Party',
    'Entrée, Mains, Dessert, Cake, Alcoholic, Non-alcoholic, Snacks',
    'Sides, Brunch',
  ],
  ['Easter', 'Entrée, Mains, Sides, Dessert, Non-alcoholic, Snacks', 'Cake, Alcoholic, Brunch'],
  [
    'Anniversary',
    'Entrée, Mains, Dessert, Cake, Alcoholic, Non-alcoholic',
    'Sides, Snacks, Brunch',
  ],
  ['Farewell', 'Entrée, Mains, Cake, Alcoholic, Non-alcoholic, Snacks', 'Sides, Dessert, Brunch'],
];
const keysOf = (names: string) => names.split(', ').map((n) => KEY[n]);

/** A Moment 2 EventSetup in memory: only the fields buildPlanGenerationInput reads. */
function setupOf(eventType: string, extended: Record<string, unknown>, mains?: unknown): any {
  return {
    eventType,
    dietaryData: { status: 'confirmed_none', requirements: [], other: '' },
    mainsData: mains ?? null,
    extendedCategoriesData: extended,
    otherNotes: '',
    setUpData: null,
    cleanUpData: null,
    otherJobsOtherData: null,
  };
}
const NO_SUCH_EVENT = 'gtc379-no-such-event';

type Sel = Record<number, { options: string[]; freeText: string }>;
const sel = (...lv: (string[] | [string[], string] | undefined)[]): Sel => {
  const out: Sel = {};
  lv.forEach((o, i) => {
    if (!o) return;
    if (o.length === 2 && Array.isArray(o[0])) out[i] = { options: o[0], freeText: o[1] as string };
    else out[i] = { options: o as string[], freeText: '' };
  });
  return out;
};

// ══ IN MEMORY ═══════════════════════════════════════════════════════════════════
async function runInMemory() {
  const OT = await load('../src/components/shared/OptionTree');
  const PW = await load('../src/lib/ai/plan-write');
  const PS = await load('../src/lib/moments/picks-summary');
  const modalSrc = codeOnly(read('src/components/plan/Moment2Step1Modal.tsx'));

  // ── Layer O — the order ────────────────────────────────────────────────────
  const order = (() => {
    const m = modalSrc.match(/OPTION_TREE_FOOD_CATEGORIES\s*=\s*\[([\s\S]*?)\]\s*as const/);
    return m ? [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]) : [];
  })();
  assert(
    'O',
    'O1 the questions’ list and FOOD_CATEGORY_ORDER are the same nine, Entrée & Starters first, Mains second (item 42)',
    order.length === 9 &&
      same(order, [...FOOD_CATEGORY_ORDER]) &&
      order[0] === 'entree_starters' &&
      order[1] === 'mains'
  );
  // As the questions draw them: the up-front sections in the list's order, then those behind
  // "Show more" (only those the kind has questions for).
  const onScreen = (type: string) => {
    const up = new Set(getUpFrontCategories(type));
    const has = (k: string) => (getCategoryLevels(type, k) ?? []).length > 0;
    return {
      up: order.filter((k) => up.has(k) && has(k)),
      more: order.filter((k) => !up.has(k) && has(k)),
    };
  };
  const letters = 'abcdefghij';
  RULED_ORDER.forEach(([type, up, more], i) => {
    const got = onScreen(type);
    assert(
      'O',
      `O2${letters[i]} ${type}: up front ${up} | behind "Show more" ${more} (ruling 1)`,
      CONFIG_EVENT_TYPES.includes(type as any) &&
        same(got.up, keysOf(up)) &&
        same(got.more, keysOf(more)),
      `got ${got.up.join(',')} | ${got.more.join(',')}`
    );
  });

  const engaged = async (type: string, extended: Record<string, unknown>, mains?: unknown) => {
    const { promptInput } = await buildPlanGenerationInput(
      NO_SUCH_EVENT,
      { guestCount: 10 },
      setupOf(type, extended, mains)
    );
    return promptInput;
  };
  const THREE = ['Casual BBQ', 'Easter', 'Farewell'];
  assert(
    'O',
    'O3 CONTROL: a Casual BBQ, Easter or Farewell plan with no starter picked plans no starters (as 26f)',
    await okAsync(async () => {
      for (const t of THREE) {
        const p = await engaged(t, {});
        if (p.engagedCategories.length === 0) return false;
        if (p.engagedCategories.some((c: any) => c.key === 'entree_starters')) return false;
      }
      return true;
    })
  );
  assert(
    'O',
    'O4 CONTROL: …and one with a starter picked plans them (as 26g)',
    await okAsync(async () => {
      for (const t of THREE) {
        const first = getCategoryLevels(t, 'entree_starters')?.[0]?.options?.[0];
        if (!first) return false;
        const p = await engaged(t, {
          entree_starters: {
            selections: { 0: { options: [first], freeText: '' } },
            stillDeciding: false,
          },
        });
        const s = p.engagedCategories.find((c: any) => c.key === 'entree_starters');
        if (!s || !s.selections.includes(first)) return false;
      }
      return true;
    })
  );
  const xmasStarter = {
    entree_starters: {
      selections: { 0: { options: ['Soup'], freeText: '' } },
      stillDeciding: false,
    },
  };
  let xmasInput: any = null;
  try {
    xmasInput = await engaged('Christmas', xmasStarter, {
      items: [],
      stillDeciding: false,
      selections: { 0: { options: ['Traditional roast'], freeText: '' } },
    });
  } catch (e) {
    console.error('    buildPlanGenerationInput threw:', (e as Error).message.split('\n')[0]);
  }
  const engagedKeys: string[] = xmasInput?.engagedCategories?.map((c: any) => c.key) ?? [];
  assert(
    'O',
    'O5 a Christmas plan with a starter picked hands the AI Entrée & Starters first, then Mains and the rest in the questions’ order',
    same(engagedKeys, [
      'entree_starters',
      'mains',
      'sides_salads',
      'dessert',
      'drinks_alcoholic',
      'drinks_non_alcoholic',
      'table_snacks',
    ]),
    engagedKeys.join(',')
  );
  const userPrompt = ok(() => !!xmasInput) ? buildPlanGenerationPrompt(xmasInput).user : '';
  const head = userPrompt.indexOf('CATEGORIES TO GENERATE (in this order):');
  const starterLine = userPrompt.indexOf('- Entrée & Starters (key: entree_starters)');
  const mainsLine = userPrompt.indexOf('- Mains (key: mains)');
  assert(
    'O',
    'O6 the request’s text, built without a call: "- Entrée & Starters (key: entree_starters)" before "- Mains (key: mains)" under "CATEGORIES TO GENERATE (in this order)"',
    head >= 0 && starterLine > head && mainsLine > starterLine
  );
  const sec = (key: string | undefined, category: string) => ({
    key,
    category,
    items: [{ name: `${category} item`, quantity: 1, unit: 'tray', servingSize: '1' }],
  });
  const aiOrder = [
    sec('mains', 'Mains'),
    sec('dessert', 'Dessert'),
    sec('mystery_a', 'Mystery A'),
    sec('entree_starters', 'Entrée & Starters'),
    sec(undefined, 'Odd one'),
    sec('sides_salads', 'Sides & Salads'),
  ];
  const aiCopy = JSON.stringify(aiOrder);
  const sorted = ok(() => Array.isArray(PW?.sectionsInPlanOrder(aiOrder)))
    ? PW.sectionsInPlanOrder(aiOrder)
    : [];
  assert(
    'O',
    'O7 sectionsInPlanOrder puts the AI’s Mains-first sections in the questions’ order, unknown keys last in the AI’s order, and leaves its input as it was (Q4)',
    same(
      sorted.map((s: any) => s.category),
      ['Entrée & Starters', 'Mains', 'Sides & Salads', 'Dessert', 'Mystery A', 'Odd one']
    ) && JSON.stringify(aiOrder) === aiCopy
  );
  const writeSrc = codeOnly(read('src/lib/ai/plan-write.ts'));
  const applyBody = writeSrc.slice(
    writeSrc.indexOf('export async function applyPlanSections'),
    writeSrc.indexOf('export async function sweepEmptyGeneratedTeams')
  );
  const routeSrc = codeOnly(read('src/app/api/events/[id]/finalize-plan/route.ts'));
  assert(
    'O',
    'O8 applyPlanSections writes through sectionsInPlanOrder, and finalize-plan sorts writtenSections with it, so the screen after Generate shows the plan view’s order (Q4)',
    /export function sectionsInPlanOrder\b/.test(writeSrc) &&
      /sectionsInPlanOrder\(\s*sections\s*\)/.test(applyBody) &&
      /const writtenSections\s*=\s*sectionsInPlanOrder\(/.test(routeSrc)
  );

  // ── Layer S — the select-all control, rendered ─────────────────────────────
  const XMAS = 'Christmas';
  const mainsLv = getCategoryLevels(XMAS, 'mains') ?? [];
  const sidesLv = getCategoryLevels(XMAS, 'sides_salads') ?? [];
  const cakeLv = getCategoryLevels(XMAS, 'cake') ?? [];
  const drinksLv = getCategoryLevels(XMAS, 'drinks_alcoholic') ?? [];
  const ROAST = mainsLv[1]?.dependsOn?.['Traditional roast'] ?? [];
  const tree = (levels: any, selections: Sel, extra: Record<string, unknown> = {}) =>
    render(createElement(OptionTree, { levels, selections, onChange: () => {}, ...extra }));
  /** Every select-all control in the markup: where it sits, its attributes and its words. */
  const controls = (html: string) =>
    [...html.matchAll(/<button\b([^>]*\bdata-select-all\b[^>]*)>([\s\S]*?)<\/button>/g)].map(
      (m) => ({ at: m.index ?? -1, attrs: m[1], words: m[2].replace(/<[^>]*>/g, '').trim() })
    );
  const at = (html: string, option: string) => html.indexOf(`data-option="${option}"`);

  const twoStyles = tree(mainsLv, sel(['Traditional roast', 'Seafood spread']));
  const c1 = controls(twoStyles);
  assert(
    'S',
    'S1 W1 heads each ticked style’s list of dishes, and only those: two styles ticked, two controls, each after its style and before its first dish (item 43)',
    c1.length === 2 &&
      c1.every((c) => c.words === W1) &&
      c1[0].at > at(twoStyles, '0:Traditional roast') &&
      c1[0].at < at(twoStyles, '1:Glazed ham') &&
      c1[1].at > at(twoStyles, '0:Seafood spread') &&
      c1[1].at < at(twoStyles, '1:Green-lipped mussels'),
    JSON.stringify(c1.map((c) => c.words))
  );
  const cake = tree(cakeLv, sel(['Yule log']));
  const drinks = tree(drinksLv, {
    0: { options: ['Wine'], freeText: '' },
    2: { options: ['Under-18s will be present'], freeText: '' },
  });
  const cd = controls(drinks);
  assert(
    'S',
    'S2 none on Cake (its list holds "No cake") and none on Alcoholic Drinks’ "Anything else to consider?": Wine’s list has the one control (Q7, Q8)',
    c1.length === 2 &&
      cake.includes('data-option="0:Yule log"') &&
      controls(cake).length === 0 &&
      cd.length === 1 &&
      cd[0].at > at(drinks, '0:Wine') &&
      cd[0].at < at(drinks, '1:NZ Sauvignon Blanc (Marlborough)') &&
      cd[0].at < drinks.indexOf('Anything else to consider?')
  );
  const allRoast = tree(mainsLv, sel(['Traditional roast', 'Seafood spread'], [...ROAST]));
  const c3 = controls(allRoast);
  assert(
    'S',
    'S3 W2 once every box in a list is ticked, on that list only; the other list keeps W1 (Q6)',
    ROAST.length === 6 && c3.length === 2 && c3[0].words === W2 && c3[1].words === W1,
    JSON.stringify(c3.map((c) => c.words))
  );
  assert(
    'S',
    'S4 W3 read aloud: aria-label "Unselect all under “Traditional roast”" and "Select all under “Seafood spread”"',
    c3.length === 2 &&
      c3[0].attrs.includes(`aria-label="${W3(W2, 'Traditional roast')}"`) &&
      c3[1].attrs.includes(`aria-label="${W3(W1, 'Seafood spread')}"`)
  );
  const oneStyle = sel(['Traditional roast']);
  assert(
    'S',
    'S5 none while the tree is disabled',
    controls(tree(mainsLv, oneStyle)).length === 1 &&
      controls(tree(mainsLv, oneStyle, { disabled: true })).length === 0
  );
  const radioLv = mainsLv.map((l: any, i: number) => (i === 1 ? { ...l, multiSelect: false } : l));
  const radio = tree(radioLv, oneStyle);
  assert(
    'S',
    'S6 a list drawn as radio buttons (multiSelect false) gets no control',
    controls(tree(mainsLv, oneStyle)).length === 1 &&
      radio.includes('type="radio"') &&
      controls(radio).length === 0
  );
  assert(
    'S',
    'S7 the control is a type="button" in text-sm font-medium text-accent, no uppercase, not directly inside a div.rounded-lg; no "Tick all" or "Untick all" anywhere (ruling 3)',
    c1.length === 2 &&
      c1.every(
        (c) =>
          /\btype="button"/.test(c.attrs) &&
          /class="[^"]*\btext-sm\b[^"]*"/.test(c.attrs) &&
          /class="[^"]*\bfont-medium\b[^"]*"/.test(c.attrs) &&
          /class="[^"]*\btext-accent\b[^"]*"/.test(c.attrs) &&
          !/uppercase/.test(c.attrs)
      ) &&
      !/<div[^>]*class="[^"]*\brounded-lg\b[^"]*"[^>]*>\s*<button/.test(twoStyles) &&
      !/Tick all|Untick all/.test(twoStyles + allRoast)
  );
  const SIDES2 = ['Roast vegetables', 'Traditional sides (potatoes, kumara)'];
  const TRAD_OWN = ['Kumara mash', 'Potato bake', 'Creamed corn', 'Steamed vegetables'];
  const shared = tree(sidesLv, sel(SIDES2, [...TRAD_OWN]));
  const c8 = controls(shared);
  assert(
    'S',
    'S8 "Roast potatoes", listed under two ticked styles, shows under the first only: the second style’s list is all ticked without it (W2), the first’s is not (W1)',
    c8.length === 2 &&
      (shared.match(/data-option="1:Roast potatoes"/g) ?? []).length === 1 &&
      c8[0].words === W1 &&
      c8[1].words === W2,
    JSON.stringify(c8.map((c) => c.words))
  );

  // ── Layer H — selectAll and unselectAll ────────────────────────────────────
  const call = (fn: string, levels: any, s: Sel, level: number, style: string): Sel | null => {
    try {
      return OT[fn](levels, s, level, style) ?? null;
    } catch {
      return null;
    }
  };
  const before: Sel = sel(
    [['Traditional roast', 'Seafood spread'], 'y'],
    [['Prawns and shrimp'], 'x']
  );
  const beforeCopy = JSON.stringify(before);
  const h1 = call('selectAll', mainsLv, before, 1, 'Traditional roast');
  assert(
    'H',
    'H1 selectAll ticks every dish that style’s list shows, after what was ticked; the styles, the other list’s dish and both "Other" texts untouched',
    same(
      h1,
      sel([['Traditional roast', 'Seafood spread'], 'y'], [['Prawns and shrimp', ...ROAST], 'x'])
    ) && JSON.stringify(before) === beforeCopy
  );
  const h2 = h1 ? call('unselectAll', mainsLv, h1, 1, 'Traditional roast') : null;
  assert(
    'H',
    'H2 unselectAll clears that style’s list only, the "Other" text kept',
    same(h2, sel([['Traditional roast', 'Seafood spread'], 'y'], [['Prawns and shrimp'], 'x']))
  );
  const h3a = call('selectAll', sidesLv, sel(SIDES2), 1, SIDES2[1]);
  const h3b = call('selectAll', sidesLv, sel(SIDES2), 1, SIDES2[0]);
  const h3c = call(
    'unselectAll',
    sidesLv,
    sel(SIDES2, ['Roast potatoes', 'Kumara mash']),
    1,
    SIDES2[1]
  );
  assert(
    'H',
    'H3 "Roast potatoes" is the first style’s: the second’s Select all leaves it out, the first’s ticks it, the second’s Unselect all leaves it ticked',
    same(h3a, sel(SIDES2, TRAD_OWN)) &&
      same(h3b, sel(SIDES2, sidesLv[1]?.dependsOn?.['Roast vegetables'] ?? ['?'])) &&
      same(h3c, sel(SIDES2, ['Roast potatoes']))
  );
  const outs: [any, Sel | null][] = [
    [mainsLv, h1],
    [mainsLv, h2],
    [sidesLv, h3a],
    [sidesLv, h3b],
    [sidesLv, h3c],
  ];
  assert(
    'H',
    'H4 every result is stable through withoutOrphanedChoices (the tree’s emit applies it)',
    outs.every(([lv, out]) => out !== null && ok(() => same(withoutOrphanedChoices(lv, out!), out)))
  );
  const radioSel = sel(['Traditional roast'], ['Roast lamb']);
  assert(
    'H',
    'H5 on a radio list selectAll returns the selections unchanged, the same object',
    typeof OT?.selectAll === 'function' &&
      call('selectAll', radioLv, radioSel, 1, 'Traditional roast') === radioSel
  );

  // ── Layer P — the summary's lines ──────────────────────────────────────────
  const XMAS_SCREEN = keysOf(RULED_ORDER[0][1] + ', ' + RULED_ORDER[0][2]);
  const ANNIV_SCREEN = keysOf(RULED_ORDER[8][1] + ', ' + RULED_ORDER[8][2]);
  const NONE = { status: 'confirmed_none', requirements: [], other: '' };
  const summary = (
    eventType: string,
    sections: string[],
    picks: Record<string, unknown>,
    dietary: unknown = NONE,
    extra: Record<string, unknown> = {}
  ): string[] => {
    try {
      const out = PS.picksSummary({ eventType, sections, picks, dietary, ...extra });
      return Array.isArray(out) ? out : [];
    } catch {
      return [];
    }
  };
  const pick = (s: Sel, stillDeciding = false) => ({ selections: s, stillDeciding });
  assert(
    'P',
    'P1 the heading is W4',
    ok(() => PS.PICKS_WORDS.HEADING === W4)
  );
  const first = (dietary: unknown) => summary(XMAS, XMAS_SCREEN, {}, dietary)[0];
  assert(
    'P',
    'P2 W7 — the Dietary line comes first, in the Dietary row’s own words: "Needs confirmation", "No dietary needs", "Vegetarian, Nut allergy"',
    first({ status: 'unanswered', requirements: [], other: '' }) === W7('Needs confirmation') &&
      first(NONE) === W7('No dietary needs') &&
      first({
        status: 'confirmed_needs',
        requirements: ['Nut allergy', 'Vegetarian'],
        other: '',
      }) === W7('Vegetarian, Nut allergy')
  );
  const p3 = summary(XMAS, XMAS_SCREEN, {
    mains: pick(
      sel([['Traditional roast', 'Seafood spread'], 'a big one'], ['Roast turkey', 'Roast lamb'])
    ),
  });
  assert(
    'P',
    'P3 W5 — "🍖 Mains: Traditional roast (Roast lamb, Roast turkey), Seafood spread, “a big one”": styles and dishes in screen order, a style with none alone, her "Other" text last',
    p3.includes(
      '🍖 Mains: Traditional roast (Roast lamb, Roast turkey), Seafood spread, “a big one”'
    ),
    JSON.stringify(p3)
  );
  const p4 = summary(XMAS, XMAS_SCREEN, {
    sides_salads: pick(
      sel([SIDES2[1], SIDES2[0]], ['Roast potatoes', 'Kumara mash', 'Garden salad'])
    ),
  });
  assert(
    'P',
    'P4 a dish whose style is not ticked is dropped ("Garden salad"); "Roast potatoes" shows once, under the first style, as on screen',
    p4.includes(
      '🥗 Sides & Salads: Roast vegetables (Roast potatoes), Traditional sides (potatoes, kumara) (Kumara mash)'
    ),
    JSON.stringify(p4)
  );
  const p5 = summary(XMAS, XMAS_SCREEN, {
    mains: pick(sel(['Traditional roast'])),
    dessert: pick({}, true),
  });
  assert(
    'P',
    'P5 W6 — a still-deciding section: "🍰 Dessert: Still deciding · left out of the plan for now", and W8 leaves it out (Q9)',
    p5.includes(`🍰 Dessert: ${W6}`) &&
      p5[p5.length - 1] ===
        W8('Sides & Salads, Alcoholic Drinks, Non-Alcoholic Drinks and Table Snacks'),
    JSON.stringify(p5)
  );
  const p6 = summary('Anniversary', ANNIV_SCREEN, {
    entree_starters: pick(sel(['Soup'])),
    drinks_alcoholic: pick(sel(['Wine'])),
    drinks_non_alcoholic: pick(sel(['Mocktails'])),
  });
  assert(
    'P',
    'P6 W8 — "Nothing picked in Mains, Dessert and Cake yet. Gather will choose for you.": the always-planned sections with nothing picked, last (Q10)',
    same(p6, [
      W7('No dietary needs'),
      '🥟 Entrée & Starters: Soup',
      '🍷 Alcoholic Drinks: Wine',
      '🥤 Non-Alcoholic Drinks: Mocktails',
      W8('Mains, Dessert and Cake'),
    ]),
    JSON.stringify(p6)
  );
  const p7 = summary(XMAS, XMAS_SCREEN, {
    breakfast_brunch: pick(sel(['Continental spread'])),
    mains: pick(sel(['Traditional roast'])),
    entree_starters: pick(sel(['Soup'])),
  });
  assert(
    'P',
    'P7 the lines in screen order: Dietary, Entrée & Starters before Mains, a section behind "Show more" with picks after them, then W8',
    same(p7, [
      W7('No dietary needs'),
      '🥟 Entrée & Starters: Soup',
      '🍖 Mains: Traditional roast',
      '🍳 Breakfast & Brunch: Continental spread',
      W8('Sides & Salads, Dessert, Alcoholic Drinks, Non-Alcoholic Drinks and Table Snacks'),
    ]),
    JSON.stringify(p7)
  );
  const p8 = summary(XMAS, XMAS_SCREEN, {
    drinks_alcoholic: pick({
      0: { options: ['Wine'], freeText: '' },
      1: { options: ['Rosé'], freeText: 'no reds' },
      2: { options: ['Under-18s will be present'], freeText: '' },
    }),
  });
  assert(
    'P',
    'P8 considerations follow the styles and dishes, the "Other" text last: "🍷 Alcoholic Drinks: Wine (Rosé), Under-18s will be present, “no reds”"',
    p8.includes('🍷 Alcoholic Drinks: Wine (Rosé), Under-18s will be present, “no reds”'),
    JSON.stringify(p8)
  );
  const p9 = summary('Other', [], {});
  assert(
    'P',
    'P9 W9 — "Nothing picked yet." when no section line and no W8 shows ("Other")',
    same(p9, [W7('No dietary needs'), W9]),
    JSON.stringify(p9)
  );
  const p10 = summary(XMAS, XMAS_SCREEN, { mains: pick(sel(['Traditional roast'])) }, NONE, {
    otherNotes: 'NOTES-379',
    setUpData: { freeText: 'SETUP-379', stillDeciding: false },
    cleanUpData: { freeText: 'CLEANUP-379', stillDeciding: false },
    otherJobsOtherData: { freeText: 'OTHERJOBS-379', stillDeciding: false },
  });
  assert(
    'P',
    'P10 Notes, Set up, Clean up and "📋 Other" never show, whatever is typed in them (Q11)',
    p10.length >= 3 && !/NOTES-379|SETUP-379|CLEANUP-379|OTHERJOBS-379/.test(p10.join('\n'))
  );
  // Cowork's addition after RED: the emoji and name on each section's box, from the questions' own
  // table (Table Snacks shows 🍿 there; plan-categories.ts has 🥨 for it).
  const metaSrc = modalSrc.slice(modalSrc.indexOf('OPTION_TREE_CATEGORY_META'));
  const META = [
    ...metaSrc
      .slice(0, metaSrc.indexOf('};'))
      .matchAll(/(\w+): \{ label: '([^']+)', emoji: '([^']+)' \}/g),
  ].map((m) => ({ key: m[1], label: m[2], emoji: m[3] }));
  const p11 = META.map(({ key, label, emoji }) => {
    const style = getCategoryLevels(XMAS, key)?.[0]?.options?.[0] ?? '';
    const lines = summary(XMAS, XMAS_SCREEN, { [key]: pick(sel([style])) });
    return { key, ok: !!style && lines.some((l) => l.startsWith(`${emoji} ${label}: ${style}`)) };
  });
  assert(
    'P',
    'P11 each of the nine sections’ lines starts with the emoji and name on its box in the questions (Table Snacks 🍿), read from the modal’s own table',
    META.length === 9 &&
      same(META.map((m) => m.key).sort(), [...FOOD_CATEGORY_ORDER].sort()) &&
      META.some((m) => m.key === 'table_snacks' && m.emoji === '🍿') &&
      p11.every((x) => x.ok),
    p11
      .filter((x) => !x.ok)
      .map((x) => x.key)
      .join(',')
  );

  // ── Layer R — the questions' source ────────────────────────────────────────
  const otherJobs = modalSrc.indexOf('id="otherJobsOther"');
  const otherEnd = otherJobs >= 0 ? modalSrc.indexOf('/>', otherJobs) : -1;
  const notesAt = modalSrc.indexOf('<NotesAccordion');
  const above = otherEnd >= 0 && notesAt > otherEnd ? modalSrc.slice(otherEnd + 2, notesAt) : '';
  assert(
    'R',
    'R1 above Notes, a thin line and some space, no words (ruling 4): after 📋 Other a border-t border-gray-200 rule, and no text before Notes',
    notesAt > otherEnd &&
      otherEnd > otherJobs &&
      otherJobs >= 0 &&
      /className="[^"]*\bborder-t border-gray-200\b[^"]*"/.test(above) &&
      !/>[^<>{}]*[A-Za-z][^<>{}]*</.test(above),
    above.trim().slice(0, 200)
  );
  const mainEnd = modalSrc.indexOf('function FoodOptionTreeAccordion');
  // GTC-394 tweak 6: the screen draws its table from picksSummary's sibling, picksRows (the same
  // helpers and words, in rows), so that is the call this looks for.
  const callAt = modalSrc.indexOf('picksRows(');
  const bar = modalSrc.indexOf('Generate plan &rarr;');
  const between = notesAt >= 0 && bar > notesAt ? modalSrc.slice(notesAt, bar) : '';
  assert(
    'R',
    'R2 the questions draw the summary from picks-summary, in the main component, from the screen’s own two lists, under Notes and above the bar (Q13)',
    /from '@\/lib\/moments\/picks-summary'/.test(modalSrc) &&
      callAt > 0 &&
      callAt < mainEnd &&
      /renderableFoodCategories/.test(modalSrc.slice(callAt, callAt + 600)) &&
      /additionalFoodCategories/.test(modalSrc.slice(callAt, callAt + 600)) &&
      /PICKS_WORDS\.HEADING|<PicksSummary\b/.test(between)
  );
  const barSrc = modalSrc.slice(modalSrc.indexOf('fixed bottom-0 left-0 right-0'), mainEnd);
  assert(
    'R',
    'R3 CONTROL: nothing is added to the bar, and the content keeps its pb-32 (Q13)',
    modalSrc.includes('max-w-2xl mx-auto px-6 py-8 pb-32') &&
      barSrc.includes('Generate plan &rarr;') &&
      !/picks|Picks|PICKS/.test(barSrc)
  );
}

// ══ THE DATABASE ═══════════════════════════════════════════════════════════════
const created = {
  events: [] as string[],
  people: [] as string[],
  users: [] as string[],
};

async function runDatabase() {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const host = await prisma.person.create({
    data: { name: 'GTC-379 host', email: `gtc379-db-${stamp}@example.com` },
  });
  created.people.push(host.id);
  const mkEvent = async (name: string) => {
    const start = new Date(Date.now() + 30 * 864e5);
    const ev = await prisma.event.create({
      data: { name, startDate: start, endDate: start, hostId: host.id, status: 'DRAFT' },
    });
    created.events.push(ev.id);
    return ev;
  };
  const item = (name: string) => ({ name, quantity: 1, unit: 'tray', servingSize: '1' });
  const sec = (key: string, category: string) => ({
    key,
    category,
    items: [item(`${category} dish`)],
  });
  const teamsOf = async (eventId: string) =>
    prisma.team.findMany({
      where: { eventId },
      orderBy: { displayOrder: 'asc' },
      select: { id: true, name: true, displayOrder: true },
    });

  // D1 — a new plan, the AI's sections Mains first.
  const fresh = await mkEvent('GTC-379 b10 — a new plan');
  let d1: { name: string; displayOrder: number }[] = [];
  try {
    await prisma.$transaction((tx) =>
      applyPlanSections(tx, {
        eventId: fresh.id,
        sections: [
          sec('mains', 'Mains'),
          sec('dessert', 'Dessert'),
          sec('entree_starters', 'Entrée & Starters'),
          sec('sides_salads', 'Sides & Salads'),
        ],
        batchId: `gtc379-${stamp}`,
      })
    );
    d1 = await teamsOf(fresh.id);
  } catch (e) {
    console.error('    D1 threw:', (e as Error).message.split('\n')[0]);
  }
  assert(
    'D',
    'D1 a plan written from Mains-first sections comes out Entrée & Starters, Mains, Sides & Salads, Dessert (item 42)',
    same(
      d1.map((t) => t.name),
      ['Entrée & Starters', 'Mains', 'Sides & Salads', 'Dessert']
    ),
    d1.map((t) => `${t.displayOrder}:${t.name}`).join(', ')
  );

  // D2 — a plan already written Mains first, then a full redraft.
  const old = await mkEvent('GTC-379 b10 — a plan already drafted');
  const mains = await prisma.team.create({
    data: { name: 'Mains', eventId: old.id, source: 'GENERATED', displayOrder: 1 },
  });
  const dessert = await prisma.team.create({
    data: { name: 'Dessert', eventId: old.id, source: 'GENERATED', displayOrder: 2 },
  });
  for (const t of [mains, dessert]) {
    await prisma.item.create({
      data: { name: `${t.name} dish`, teamId: t.id, source: 'GENERATED', displayOrder: 1 },
    });
  }
  let d2: { id: string; name: string; displayOrder: number }[] = [];
  try {
    await prisma.$transaction((tx) =>
      applyPlanSections(tx, {
        eventId: old.id,
        sections: [
          sec('entree_starters', 'Entrée & Starters'),
          sec('mains', 'Mains'),
          sec('dessert', 'Dessert'),
        ],
        batchId: `gtc379-${stamp}-redraft`,
      })
    );
    d2 = await teamsOf(old.id);
  } catch (e) {
    console.error('    D2 threw:', (e as Error).message.split('\n')[0]);
  }
  assert(
    'D',
    'D2 CONTROL: a plan already drafted keeps its order through a full redraft — Mains and Dessert where they stood, Entrée & Starters after them (ruling 2)',
    same(
      d2.map((t) => `${t.displayOrder}:${t.name}`),
      ['1:Mains', '2:Dessert', '3:Entrée & Starters']
    ) &&
      d2[0].id === mains.id &&
      d2[1].id === dessert.id,
    d2.map((t) => `${t.displayOrder}:${t.name}`).join(', ')
  );

  const ai = await prisma.event.findMany({
    where: { id: { in: [fresh.id, old.id] } },
    select: { aiCallsUsed: true },
  });
  console.log(
    `  D: aiCallsUsed read while the fixture exists: ${ai.map((e) => e.aiCallsUsed).join(', ')}`
  );
  assert(
    'D',
    'DK1 CONTROL: aiCallsUsed 0 on both fixture events, read before they are removed',
    ai.length === 2 && ai.every((e) => e.aiCallsUsed === 0)
  );
  const dbIds = [fresh.id, old.id];
  const dbRows = async () =>
    [
      await prisma.event.count({ where: { id: { in: dbIds } } }),
      await prisma.team.count({ where: { eventId: { in: dbIds } } }),
      await prisma.item.count({ where: { team: { eventId: { in: dbIds } } } }),
      await prisma.person.count({ where: { id: host.id } }),
    ].join(',');
  const whileExists = await dbRows();
  await prisma.event.deleteMany({ where: { id: { in: dbIds } } });
  await prisma.person.deleteMany({ where: { id: host.id } });
  created.events = created.events.filter((id) => !dbIds.includes(id));
  created.people = created.people.filter((id) => id !== host.id);
  const left = await dbRows();
  assert(
    'D',
    `DK2 CONTROL: the fixture was counted while it existed (events, teams, items, people: ${whileExists}) and removed by id`,
    whileExists.startsWith('2,') && left === '0,0,0,0',
    `left ${left}`
  );
}

// ══ LIVE ═════════════════════════════════════════════════════════════════════
async function runLive() {
  const up = await (async () => {
    try {
      return (await realFetch(`${BASE}/`)).ok;
    } catch {
      return false;
    }
  })();
  assert('K', 'K1 CONTROL: the dev server answers on :3000', up);
  if (!up) return;

  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const mail = (l: string) => `gtc379-${l}-${stamp}@example.com`;
  const user = await prisma.user.create({ data: { email: mail('kate') } });
  created.users.push(user.id);
  const kate = await prisma.person.create({
    data: { name: 'Kate Lowe', email: user.email, userId: user.id },
  });
  created.people.push(kate.id);
  const token = randomBytes(32).toString('hex');
  await prisma.session.create({
    data: { userId: user.id, token, expiresAt: new Date(Date.now() + 3600e3) },
  });
  const start = new Date(Date.now() + 20 * 864e5);
  const ev = await prisma.event.create({
    data: {
      name: 'GTC-379 b10 — the questions',
      startDate: start,
      endDate: start,
      hostId: kate.id,
      status: 'DRAFT',
    } as any,
  });
  created.events.push(ev.id);
  await prisma.eventRole.create({ data: { eventId: ev.id, userId: user.id, role: 'HOST' } });
  const h = await prisma.household.create({ data: { eventId: ev.id } });
  await prisma.personEvent.create({
    data: {
      personId: kate.id,
      eventId: ev.id,
      role: 'HOST',
      householdId: h.id,
      householdRole: 'PRIMARY_CONTACT',
    } as any,
  });
  // Mains still deciding with its style ticked, so one Select all can end it.
  await prisma.eventSetup.create({
    data: {
      eventId: ev.id,
      eventType: 'Christmas',
      dietaryData: { status: 'confirmed_none', requirements: [], other: '' },
      mainsData: {
        items: [],
        stillDeciding: true,
        selections: { 0: { options: ['Traditional roast'], freeText: '' } },
      },
    } as any,
  });

  const evIn = { eventId: ev.id };
  const rows = async () =>
    [
      await prisma.event.count({ where: { id: ev.id } }),
      await prisma.eventSetup.count({ where: evIn }),
      await prisma.eventRole.count({ where: evIn }),
      await prisma.household.count({ where: evIn }),
      await prisma.personEvent.count({ where: evIn }),
      await prisma.person.count({ where: { id: { in: created.people } } }),
      await prisma.user.count({ where: { id: { in: created.users } } }),
      await prisma.session.count({ where: { userId: { in: created.users } } }),
      await prisma.team.count({ where: evIn }),
      await prisma.accessToken.count({ where: evIn }),
      await prisma.outboundMessage.count({ where: evIn }),
      await prisma.inviteEvent.count({ where: evIn }),
    ].join(',');
  const whileExists = await rows();

  const ROAST =
    getCategoryLevels('Christmas', 'mains')?.[1]?.dependsOn?.['Traditional roast'] ?? [];
  const MAINS_LINE = `🍖 Mains: Traditional roast (${ROAST.join(', ')})`;
  const refusals: string[] = [];
  let chrome: Headless | null = null;
  let probes = { plan: '', send: '' };
  const r: Record<string, boolean> = {};
  const detail: Record<string, string> = {};
  const shots: string[] = [];
  try {
    chrome = await openHeadless({ fetchImpl: realFetch, port: 9477 });
    const c = chrome;
    await c.blockPlanMaking();
    await c.blockSends();
    // The dialog rule: only a "leave site?" is answered (by leaving); every dialog is logged.
    c.answerLeaveDialogs(true);
    await c.navigate('/', 3000);
    probes = {
      plan: await c.evaluate<string>(
        `fetch('/api/gtc379-probe/finalize-plan', { method: 'POST' }).then(r => 'reached ' + r.status).catch(() => 'failed')`
      ),
      send: await c.evaluate<string>(
        `fetch('/api/events/gtc379-probe/send', { method: 'POST' }).then(r => 'reached ' + r.status).catch(() => 'failed')`
      ),
    };
    await c.setSessionCookie(token);
    await c.setViewport(1280, 900, false);
    const js = <T = any,>(src: string) => c.evaluate<T>(src);
    /** Tag what `src` finds, then click it — guarded. 'absent' (not a refusal) when not found. */
    const tap = async (src: string, settleMs = 900) => {
      const found = await js<boolean>(
        `(() => { document.querySelectorAll('[data-t]').forEach(e => e.removeAttribute('data-t')); const el = ${src}; if (!el) return false; el.setAttribute('data-t', 'x'); return true; })()`
      );
      if (!found) return 'absent';
      const why = await c.clickGuarded('[data-t="x"]', settleMs);
      if (why) refusals.push(`${src}: ${why}`);
      return why;
    };
    const logFetches = () =>
      js(`(() => { window.__log = []; const f = window.fetch.bind(window);
        window.fetch = (u, o) => { window.__log.push(((o && o.method) || 'GET') + ' ' + String(u)); return f(u, o); }; return true; })()`);
    const fetchLog = () => js<string[]>('window.__log || []');
    const setupNow = () =>
      prisma.eventSetup.findUnique({ where: { eventId: ev.id } }) as Promise<any>;
    /** The summary: the box around the W4 heading. Its text, or null when there is none. */
    const SUMMARY = `(() => { const hd = [...document.querySelectorAll('h2,h3,h4,p,div,span')].find(e => e.children.length === 0 && e.textContent.trim() === ${JSON.stringify(W4)});
        return hd ? hd.parentElement : null; })()`;
    /*
     * GTC-394 tweak 6: the summary is a table now (the section, what is picked, what was typed). Its
     * text is read back as the summary's own lines: the heading, then each row as "{section}:
     * {picked}, {typed}", a line across the table as it is. picksRows guarantees those are
     * picksSummary's lines, so the checks that read it are unchanged.
     */
    const summaryText = () =>
      js<string | null>(`(() => { const b = ${SUMMARY}; if (!b) return null;
        const h = b.querySelector('h3'); const t = b.querySelector('table');
        if (!h || !t) return null;
        const rows = [...t.querySelectorAll('tbody tr')].map((tr) => {
          const c = [...tr.querySelectorAll('td')].map((td) => td.innerText.trim());
          return c.length === 1 ? c[0] : c[0] + ': ' + c.slice(1).filter(Boolean).join(', ');
        });
        return [h.innerText.trim(), ...rows].join('\\n'); })()`);
    /** At the foot of the questions: the summary sits under Notes and clears the bar; it fits `w`. */
    const footFits = (w: number) =>
      js<string>(`(() => { const b = ${SUMMARY}; if (!b) return 'no summary';
        const scroller = b.closest('.overflow-y-auto'); if (!scroller) return 'no scroller';
        scroller.scrollTop = scroller.scrollHeight;
        const bar = [...document.querySelectorAll('.fixed.bottom-0')].find(x => x.innerText.includes('Generate plan'));
        const notes = document.querySelector('[data-accordion="other"]');
        if (!bar || !notes) return 'no bar or no notes';
        const s = b.getBoundingClientRect(); const t = bar.getBoundingClientRect();
        const under = !!(notes.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
        const fine = under && s.bottom <= t.top && s.left >= 0 && s.right <= ${w} && scroller.scrollWidth <= ${w};
        return fine ? 'ok' : JSON.stringify({ under, bottom: s.bottom, barTop: t.top, left: s.left, right: s.right, scrollWidth: scroller.scrollWidth }); })()`);

    await c.navigate(`/plan/${ev.id}/setup`, 8000);
    r.K4 = await js<boolean>(`!!document.querySelector('[data-accordion="mains"]')`);

    // L1 — before anything is touched.
    const s1 = (await summaryText()) ?? '';
    r.L1 = s1.includes(W4) && s1.includes(W7('No dietary needs')) && s1.includes(`🍖 Mains: ${W6}`);
    detail.L1 = JSON.stringify(s1);

    // L2/L3 — open Mains, then one tap on Select all under Traditional roast.
    const open = await tap(`document.querySelector('[data-accordion="mains"] > button')`, 900);
    await sleep(600);
    await logFetches();
    const tapAll = await tap(
      `document.querySelector('[data-accordion="mains"] [data-select-all]')`,
      1500
    );
    await sleep(1200);
    r.L2 =
      open === null &&
      tapAll === null &&
      ROAST.length === 6 &&
      (await js<boolean>(
        `${JSON.stringify(ROAST)}.every(d => document.querySelector('[data-accordion="mains"] [data-option="1:' + d + '"] input')?.checked === true)`
      )) &&
      (await js<string>(
        `document.querySelector('[data-accordion="mains"] [data-select-all]')?.innerText.trim() ?? ''`
      )) === W2;
    detail.L2 = `open ${open}, tap ${tapAll}`;
    const log3 = await fetchLog();
    const s3 = await setupNow();
    r.L3 =
      tapAll === null &&
      same(log3, [`POST /api/events/${ev.id}/setup`]) &&
      same(s3?.mainsData?.selections?.[0]?.options, ['Traditional roast']) &&
      same([...(s3?.mainsData?.selections?.[1]?.options ?? [])].sort(), [...ROAST].sort()) &&
      s3?.mainsData?.stillDeciding === false;
    detail.L3 = `${log3.join(' | ')} ${JSON.stringify(s3?.mainsData ?? null)}`;

    // L4 — the summary's line follows.
    const s4 = (await summaryText()) ?? '';
    r.L4 = tapAll === null && s4.includes(MAINS_LINE) && !s4.includes(`🍖 Mains: ${W6}`);
    detail.L4 = JSON.stringify(s4);

    // L5 — Notes is the last box, after 📋 Other.
    const boxes = await js<string[]>(
      `[...document.querySelectorAll('[data-accordion]')].map(e => e.getAttribute('data-accordion'))`
    );
    r.L5 = boxes.length > 3 && same(boxes.slice(-2), ['otherJobsOther', 'other']);
    detail.L5 = boxes.join(',');

    // L6 — at 1280: the summary under Notes, clear of the bar.
    const foot1280 = await footFits(1280);
    r.L6 = foot1280 === 'ok';
    detail.L6 = foot1280;
    const shot1 = join(tmpdir(), 'gtc379-questions-foot-1280.png');
    await c.screenshotViewport(shot1);
    shots.push(shot1);

    // L7 — at 390: the same, and nothing past 390.
    await c.setViewport(390, 844, true);
    await c.navigate(`/plan/${ev.id}/setup`, 8000);
    const foot390 = await footFits(390);
    r.L7 = foot390 === 'ok';
    detail.L7 = foot390;
    const shot2 = join(tmpdir(), 'gtc379-questions-foot-390.png');
    await c.screenshotViewport(shot2);
    shots.push(shot2);
    await c.setViewport(1280, 900, false);

    // L8 — "Unselect all" (ruling 7): the list clears, one more save, the line loses its brackets.
    // After L7 (ruling 10), so L6 and L7 measure the long line; on a fresh load of the questions at
    // 1280, the fetch log installed again, Mains opened only if it is not open already.
    await c.navigate(`/plan/${ev.id}/setup`, 8000);
    await logFetches();
    const mainsOpen = await js<boolean>(
      `document.querySelector('[data-accordion="mains"] > button')?.getAttribute('aria-expanded') === 'true'`
    );
    const open8 = mainsOpen
      ? null
      : await tap(`document.querySelector('[data-accordion="mains"] > button')`, 900);
    await sleep(600);
    const logBefore8 = (await fetchLog()).length;
    const tapNone =
      tapAll === null && open8 === null
        ? await tap(`document.querySelector('[data-accordion="mains"] [data-select-all]')`, 1500)
        : 'absent';
    await sleep(1200);
    const log8 = await fetchLog();
    const s8 = await setupNow();
    const s8text = (await summaryText()) ?? '';
    r.L8 =
      tapNone === null &&
      (await js<boolean>(
        `${JSON.stringify(ROAST)}.every(d => document.querySelector('[data-accordion="mains"] [data-option="1:' + d + '"] input')?.checked === false)
          && document.querySelector('[data-accordion="mains"] [data-option="0:Traditional roast"] input')?.checked === true`
      )) &&
      (await js<string>(
        `document.querySelector('[data-accordion="mains"] [data-select-all]')?.innerText.trim() ?? ''`
      )) === W1 &&
      same(log8.slice(logBefore8), [`POST /api/events/${ev.id}/setup`]) &&
      (s8?.mainsData?.selections?.[1]?.options ?? []).length === 0 &&
      same(s8?.mainsData?.selections?.[0]?.options, ['Traditional roast']) &&
      s8?.mainsData?.stillDeciding === false &&
      s8text.split('\n').some((l) => l.trim() === '🍖 Mains: Traditional roast');
    detail.L8 = `tap ${tapNone}; ${log8.slice(logBefore8).join(' | ')}; ${JSON.stringify(s8?.mainsData ?? null)}; ${JSON.stringify(s8text)}`;
  } catch (e) {
    console.error('live layer threw:', (e as Error).message);
  } finally {
    chrome?.close();
  }
  if (shots.length) console.log(`  screenshots: ${shots.join(' ')}`);

  const live: [string, string][] = [
    [
      'L1',
      'L1 on load the summary reads W4, the Dietary line and "🍖 Mains: Still deciding · left out of the plan for now"',
    ],
    [
      'L2',
      'L2 one tap on "Select all" under Traditional roast ticks its six dishes on screen, and the control reads W2',
    ],
    [
      'L3',
      'L3 it is one change, like one tick: one POST …/setup, the six dishes saved, Mains no longer still deciding',
    ],
    ['L4', 'L4 the summary’s Mains line follows: "🍖 Mains: Traditional roast (…the six…)"'],
    ['L5', 'L5 Notes is the last box on the questions, after 📋 Other'],
    ['L6', 'L6 at 1280, scrolled to the foot: the summary sits under Notes and clears the bar'],
    ['L7', 'L7 at 390, the same, and nothing runs past 390'],
    [
      'L8',
      'L8 then a tap on "Unselect all": the six dishes untick, the style stays, the control reads W1, one more POST …/setup, none saved, the Mains line without brackets (ruling 7)',
    ],
  ];
  for (const [k, label] of live) assert('L', label, r[k] === true, detail[k]);

  assert(
    'K',
    'K2 CONTROL: the plan-making probe failed in the browser',
    probes.plan === 'failed',
    probes.plan
  );
  assert(
    'K',
    'K3 CONTROL: the send probe failed in the browser',
    probes.send === 'failed',
    probes.send
  );
  assert(
    'K',
    'K4 CONTROL: Moment 2’s questions are reached (data-accordion="mains")',
    r.K4 === true
  );
  const hosts = chrome ? chrome.hostsRequested() : [];
  assert(
    'K',
    'K5 CONTROL: headless Chrome requested only localhost:3000',
    hosts.length > 0 && hosts.every((x) => x === 'localhost:3000'),
    hosts.join(',')
  );
  assert(
    'K',
    'K6 CONTROL: no click was refused (a missing target is not a refusal)',
    refusals.length === 0,
    refusals.join(' | ')
  );
  const dialogs = chrome ? chrome.dialogs() : ['no chrome'];
  assert('K', 'K7 CONTROL: no dialog opened', dialogs.length === 0, dialogs.join(','));
  const blocked = chrome ? chrome.planMakingBlocked() : ['no chrome'];
  assert(
    'K',
    'K8 CONTROL: the browser blocked nothing but the two probes (nothing pressed asked for a plan or a send)',
    blocked.length === 2 && blocked.every((b) => b.includes('gtc379-probe')),
    blocked.join(' | ')
  );
  const ai = await prisma.event.findMany({
    where: { id: ev.id },
    select: { aiCallsUsed: true },
  });
  console.log(
    `  L: aiCallsUsed read while the fixture exists: ${ai.map((e) => e.aiCallsUsed).join(', ')}`
  );
  assert(
    'K',
    'K9 CONTROL: aiCallsUsed 0 on the fixture event, read before it is removed',
    ai.length === 1 && ai.every((e) => e.aiCallsUsed === 0)
  );
  await cleanup();
  const left = await rows();
  assert(
    'K',
    `K10 CONTROL: the fixture was counted while it existed (${whileExists}) and every row removed by id`,
    whileExists.startsWith('1,1,1,1,1,1,1,1,') && left === '0,0,0,0,0,0,0,0,0,0,0,0',
    `left ${left}`
  );
}

async function cleanup() {
  const del = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      console.error('cleanup:', (e as Error).message.split('\n')[0]);
    }
  };
  const evIds = created.events;
  // Every row below was made by this suite: its events and what hangs off them (including any guest
  // links a page minted), its people, its user and their session.
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
  const totals = async () =>
    [
      await prisma.event.count(),
      await prisma.inviteEvent.count(),
      await prisma.outboundMessage.count(),
      await prisma.person.count(),
    ].join('/');
  const before = await totals();
  await runInMemory();
  await runDatabase();
  await runLive();
  const after = await totals();
  assert(
    'K',
    `K11 CONTROL: gather_dev's totals are as found, events/InviteEvent/OutboundMessage/people (${before} -> ${after})`,
    after === before
  );
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
