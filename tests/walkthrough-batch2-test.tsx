/**
 * GTC-364 — walkthrough batch 2: Moment 2's questions.
 *
 * The founder walked the Moment flow himself and sorted what he found (GTC-189's Fourth ruling).
 * This suite pins batch 2's four items to the words he ruled on the plan (GTC-364, PLAN RULINGS
 * 2026-10-06, W1 to W8) and to the behaviour he chose (Q1 to Q7, with his change to Q5):
 *
 *   3   (with 21) nothing jumps: sections open side by side (Q1), on the pre-flight too (Q2); a
 *       box shows what a choice adds at once, because it is never measured
 *   18  the box that did nothing: "Still deciding" made plain (W1 to W3, Q3) and Notes' dead link gone
 *   24  each ticked style's own question and choices right under it (W8), one "Other" box at the
 *       bottom of them (Q4); unticking a style unticks its choices, on screen and where the plan is
 *       made (Q5, the founder's change)
 *   28  the Dietary title row says what was answered (W4 to W7)
 *
 * Layers 3, 18, 24, Q5 and 28 run in memory: rendered components, the config, and two
 * `buildPlanGenerationInput` calls whose one query (households for a made-up event id) reads nothing.
 *
 * Layer C drives the dev server in the walled-off headless Chrome, on a fixture of its own (example.com
 * addresses, no phones), behind the three safeguards of GATHER-BUILD-CONSTANTS.md ("Looking on screen"):
 * the server runs with the AI key blanked; the browser fails every plan-making request before it
 * leaves the page (proven on a probe URL first); every click is `clickGuarded`. It never touches
 * "Generate plan →", the press or the hold. Every fixture row is counted while it exists and removed
 * by id; the InviteEvent and OutboundMessage totals are asserted as found.
 *
 * Needs the dev server on :3000 and a global WebSocket (NODE_OPTIONS=--experimental-websocket).
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';

import AccordionShell from '../src/components/plan/AccordionShell';
import OptionTree from '../src/components/shared/OptionTree';
import * as CL from '../src/lib/ai/config-loader';
import * as DIET from '../src/lib/dietary';
import { buildPlanGenerationInput } from '../src/lib/ai/plan-input';
import { prisma } from '../src/lib/prisma';
import { installProviderTrap } from './helpers/provider-trap';
import { openHeadless, type Headless } from './helpers/headless';

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

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

/** Source with comments removed, so a sentence quoted in a comment is never mistaken for code. */
function codeOnly(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

// ── The ruled words, verbatim (GTC-364, PLAN RULINGS 2026-10-06) ─────────────
const W1 = 'Still deciding · left out of the plan for now';
const W2 = 'Still deciding?';
const W3 = '✓ Still deciding. Tap here, or pick something, to include it in the plan.';
const W4 = 'Needs confirmation';
const W5 = 'No dietary needs';

const NO_SUCH_EVENT = 'gtc364-no-such-event';
const setupOf = (eventType: string, mains: unknown) =>
  ({
    eventType,
    mainsData: mains,
    extendedCategoriesData: {},
    dietaryData: null,
    otherNotes: null,
    setUpData: null,
    cleanUpData: null,
    otherJobsOtherData: null,
  }) as any;

/** Where a rendered option, question or heading sits in the markup; -1 when it is absent. */
const at = (out: string, text: string) => out.indexOf(`>${text}<`);
const count = (out: string, needle: string) => out.split(needle).length - 1;
const tree = (eventType: string, key: string, selections: Record<number, unknown>) =>
  renderToStaticMarkup(
    createElement(OptionTree, {
      levels: CL.getCategoryLevels(eventType, key)!,
      selections: selections as any,
      onChange: () => {},
    })
  );
const shell = (props: Record<string, unknown>, child = 'CHILD-CONTENT') =>
  renderToStaticMarkup(
    createElement(
      AccordionShell as any,
      { id: 'mains', label: '🍖 Mains', open: true, onToggle: () => {}, ...props },
      createElement('p', null, child)
    )
  );

function runInMemory() {
  // ══ ITEM 3 — a box that is never measured ══════════════════════════════════
  assert(
    '3',
    '3a an open box follows its content (grid row 1fr), a closed one is shut (0fr); no max-height',
    ok(() => {
      const open = shell({ open: true });
      const shut = shell({ open: false });
      return (
        /grid-template-rows:\s*1fr/.test(open) &&
        /grid-template-rows:\s*0fr/.test(shut) &&
        !/max-height/.test(open + shut)
      );
    })
  );
  assert(
    '3',
    '3b the shell reads no scrollHeight',
    !/scrollHeight/.test(codeOnly(read('src/components/plan/AccordionShell.tsx')))
  );
  assert(
    '3',
    '3c CONTROL: the title row is one button carrying the label and its hint',
    ok(() => {
      const out = shell({ open: false, headerHint: createElement('span', null, 'HINT') });
      const button = out.match(/<button[^>]*>([\s\S]*?)<\/button>/);
      return !!button && button[1].includes('🍖 Mains') && button[1].includes('HINT');
    })
  );

  // ══ ITEM 18 — "Still deciding", made plain; Notes' dead link gone ══════════
  assert(
    '18',
    '18a Notes passes no "Still deciding" toggle',
    ok(() => {
      const src = codeOnly(read('src/components/plan/Moment2Step1Modal.tsx'));
      const from = src.indexOf('function NotesAccordion');
      const notes = src.slice(from);
      return from > 0 && !/onStillDecidingToggle|stillDeciding/.test(notes);
    })
  );
  assert(
    '18',
    '18b while still deciding: W1 on the title row, and the way out reads W3, after the choices',
    ok(() => {
      const out = shell({ stillDeciding: true, onStillDecidingToggle: () => {} });
      const button = out.match(/<button[^>]*>([\s\S]*?)<\/button>/)![1];
      return button.includes(W1) && out.indexOf(`>${W3}<`) > out.indexOf('CHILD-CONTENT');
    })
  );
  assert(
    '18',
    '18c otherwise the link reads W2, at the foot of the section (after the choices), and no W1',
    ok(() => {
      const out = shell({ stillDeciding: false, onStillDecidingToggle: () => {} });
      return out.indexOf(`>${W2}<`) > out.indexOf('CHILD-CONTENT') && !out.includes(W1);
    })
  );
  assert(
    '18',
    '18d a still-deciding section still takes a tap (nothing in it is pointer-events-none)',
    ok(
      () =>
        !shell({ stillDeciding: true, onStillDecidingToggle: () => {} }).includes(
          'pointer-events-none'
        )
    )
  );
  assert(
    '18',
    '18e CONTROL: with no toggle there is no link',
    ok(() => {
      const out = shell({});
      return !out.includes(W2) && !out.includes('Still deciding');
    })
  );

  // ══ ITEM 24 — each style's own question and choices right under it ═════════
  const mainsRoast = tree('Christmas', 'mains', {
    0: { options: ['Traditional roast'], freeText: '' },
  });
  assert(
    '24',
    '24a Mains: "Glazed ham" sits between "Traditional roast" and "NZ summer BBQ"',
    ok(
      () =>
        at(mainsRoast, 'Traditional roast') < at(mainsRoast, 'Glazed ham') &&
        at(mainsRoast, 'Glazed ham') < at(mainsRoast, 'NZ summer BBQ')
    )
  );
  const drinks = tree('Christmas', 'drinks_alcoholic', {
    0: { options: ['Beer and cider', 'Wine'], freeText: '' },
  });
  assert(
    '24',
    '24b Alcoholic Drinks, two styles: each one’s choices under it, before the next style',
    ok(
      () =>
        at(drinks, 'Beer and cider') < at(drinks, 'NZ craft beer selection') &&
        at(drinks, 'NZ craft beer selection') < at(drinks, 'Wine') &&
        at(drinks, 'Wine') < at(drinks, 'Rosé') &&
        at(drinks, 'Rosé') < at(drinks, 'Spirits and cocktails')
    )
  );
  assert(
    '24',
    '24c the small capital headings naming a style are gone (W8)',
    !/uppercase/.test(drinks)
  );
  assert(
    '24',
    '24i each ticked style shows its own question under it (W8): "Any preferences?" twice',
    ok(
      () =>
        count(drinks, '>Any preferences?<') === 2 &&
        at(drinks, 'Beer and cider') < at(drinks, 'Any preferences?') &&
        at(drinks, 'Any preferences?') < at(drinks, 'NZ craft beer selection')
    )
  );
  const mainsTwo = tree('Christmas', 'mains', {
    0: { options: ['Traditional roast', 'Seafood spread'], freeText: '' },
  });
  assert(
    '24',
    '24d one "Other" box for the dishes, at the bottom of them: after the last ticked style’s dishes (Q4)',
    ok(() => {
      const box = mainsTwo.indexOf('placeholder="Specify dishes..."');
      return (
        count(mainsTwo, 'placeholder="Specify dishes..."') === 1 &&
        box > at(mainsTwo, 'Mixed seafood platter') &&
        box < at(mainsTwo, 'Hangi-inspired')
      );
    })
  );
  const mainsNone = tree('Christmas', 'mains', {});
  assert(
    '24',
    '24e nothing ticked: no "Which dishes?"',
    at(mainsNone, 'Which dishes?') === -1 && at(mainsNone, 'What style of mains?') >= 0
  );
  assert(
    '24',
    '24f CONTROL: nothing ticked, but dishes text already saved — its box still shows, with the text',
    ok(() => {
      const out = tree('Christmas', 'mains', { 1: { options: [], freeText: 'a big one' } });
      return (
        out.includes('placeholder="Specify dishes..."') && out.includes('>a big one</textarea>')
      );
    })
  );
  assert(
    '24',
    '24g CONTROL: "Anything else to consider?" once, after the styles and their "Other" box',
    ok(
      () =>
        count(drinks, '>Anything else to consider?<') === 1 &&
        at(drinks, 'Anything else to consider?') > at(drinks, 'Mixed / Full bar') &&
        at(drinks, 'Anything else to consider?') >
          drinks.indexOf('placeholder="Describe your drinks..."')
    )
  );
  assert(
    '24',
    '24h CONTROL: "Roast potatoes", under two ticked styles, shows once',
    ok(
      () =>
        count(
          tree('Christmas', 'sides_salads', {
            0: {
              options: ['Roast vegetables', 'Traditional sides (potatoes, kumara)'],
              freeText: '',
            },
          }),
          '>Roast potatoes<'
        ) === 1
    )
  );
}

async function runQ5() {
  // ══ Q5 (the founder's change) — unticking a style unticks its choices ══════
  const prune = (CL as any).withoutOrphanedChoices;
  const mainsLevels = CL.getCategoryLevels('Christmas', 'mains');
  const sidesLevels = CL.getCategoryLevels('Christmas', 'sides_salads');
  assert(
    'Q5',
    'Q5a no style ticked: its dishes are dropped; typed text is left alone',
    ok(() => {
      const out = prune(mainsLevels, {
        0: { options: [], freeText: '' },
        1: { options: ['Glazed ham', 'Roast lamb'], freeText: 'a big one' },
      });
      return out[1].options.length === 0 && out[1].freeText === 'a big one';
    })
  );
  assert(
    'Q5',
    'Q5b a choice still under another ticked style stays ("Roast potatoes"); one under no ticked style goes',
    ok(() => {
      const out = prune(sidesLevels, {
        0: { options: ['Roast vegetables'], freeText: '' },
        1: { options: ['Roast potatoes', 'Potato bake', 'Roast kumara'], freeText: '' },
      });
      return JSON.stringify(out[1].options) === JSON.stringify(['Roast potatoes', 'Roast kumara']);
    })
  );
  assert(
    'Q5',
    'Q5c a stored choice in no list at all is kept (it is under no style to untick); the styles are untouched',
    ok(() => {
      const out = prune(mainsLevels, {
        0: { options: ['Traditional roast'], freeText: 'x' },
        1: { options: ['Something new', 'Lamb chops'], freeText: '' },
      });
      return (
        JSON.stringify(out[1].options) === JSON.stringify(['Something new']) &&
        JSON.stringify(out[0]) === JSON.stringify({ options: ['Traditional roast'], freeText: 'x' })
      );
    })
  );
  const sent = async (mains: unknown) => {
    const { promptInput } = await buildPlanGenerationInput(
      NO_SUCH_EVENT,
      { guestCount: 10 },
      setupOf('Christmas', mains)
    );
    return promptInput.engagedCategories.find((c) => c.key === 'mains')?.selections ?? [];
  };
  assert(
    'Q5',
    'Q5d where the plan is made: a dish saved under an unticked style is not sent to the AI',
    await okAsync(async () => {
      const s = await sent({
        selections: {
          0: { options: ['NZ summer BBQ'], freeText: '' },
          1: { options: ['Glazed ham', 'Lamb chops'], freeText: '' },
        },
        stillDeciding: false,
      });
      return !s.includes('Glazed ham');
    })
  );
  assert(
    'Q5',
    'Q5e CONTROL: …while the style and a dish under it still are',
    await okAsync(async () => {
      const s = await sent({
        selections: {
          0: { options: ['NZ summer BBQ'], freeText: '' },
          1: { options: ['Glazed ham', 'Lamb chops'], freeText: '' },
        },
        stillDeciding: false,
      });
      return s.includes('NZ summer BBQ') && s.includes('Lamb chops');
    })
  );
  assert(
    'Q5',
    'Q5f CONTROL: typed dishes text is sent with no style ticked',
    await okAsync(async () => {
      const s = await sent({
        selections: { 1: { options: ['Glazed ham'], freeText: 'a big one' } },
        stillDeciding: false,
      });
      return s.includes('a big one');
    })
  );
  // The founder's two precisions (2026-10-06), both for plans saved before this change.
  const engaged = async (setup: Record<string, unknown>) =>
    (
      await buildPlanGenerationInput(NO_SUCH_EVENT, { guestCount: 10 }, {
        ...setupOf('Christmas', null),
        ...setup,
      } as any)
    ).promptInput.engagedCategories;
  assert(
    'Q5',
    'Q5g old picks are read as today’s words first: the old pavlova, saved under an unticked style, is not sent',
    await okAsync(async () => {
      const dessert = (
        await engaged({
          extendedCategoriesData: {
            dessert: {
              selections: {
                0: { options: ['Trifle and creams'], freeText: '' },
                1: {
                  options: ['Classic pavlova with cream and kiwifruit', 'Eton mess'],
                  freeText: '',
                },
              },
              stillDeciding: false,
            },
          },
        })
      ).find((c) => c.key === 'dessert');
      return (
        !!dessert &&
        dessert.selections.includes('Eton mess') &&
        !dessert.selections.some((s) => /pavlova/i.test(s))
      );
    })
  );
  assert(
    'Q5',
    'Q5h a category not on by default, whose only picks were dishes under an unticked style, is left out',
    await okAsync(async () => {
      const cats = await engaged({
        extendedCategoriesData: {
          entree_starters: {
            selections: {
              0: { options: [], freeText: '' },
              1: { options: ['Pumpkin'], freeText: '' },
            },
            stillDeciding: false,
          },
        },
      });
      return cats.length > 0 && !cats.some((c) => c.key === 'entree_starters');
    })
  );
}

function run28() {
  // ══ ITEM 28 — the Dietary title row ════════════════════════════════════════
  const sum = (d: unknown) => (DIET as any).dietaryTitleSummary(d);
  assert(
    '28',
    '28a not answered: W4 "Needs confirmation"',
    ok(() => sum({ status: 'unanswered', requirements: [] }) === W4)
  );
  assert(
    '28',
    '28b none: W5 "No dietary needs"',
    ok(() => sum({ status: 'confirmed_none', requirements: [] }) === W5)
  );
  assert(
    '28',
    '28c W6: the needs in list order, with commas — "Vegetarian, Gluten-free"',
    ok(
      () =>
        sum({ status: 'confirmed_needs', requirements: ['Gluten-free', 'Vegetarian'] }) ===
        'Vegetarian, Gluten-free'
    )
  );
  assert(
    '28',
    '28d W7: a note after them, as typed — "Vegetarian, Gluten-free, no shellfish"',
    ok(
      () =>
        sum({
          status: 'confirmed_needs',
          requirements: ['Vegetarian', 'Gluten-free'],
          other: '  no shellfish ',
        }) === 'Vegetarian, Gluten-free, no shellfish'
    )
  );
  assert(
    '28',
    '28e W7: a note on its own — "no shellfish"',
    ok(
      () =>
        sum({ status: 'confirmed_needs', requirements: [], other: 'no shellfish' }) ===
        'no shellfish'
    )
  );
  assert(
    '28',
    '28f the Dietary title row renders the summary from the module',
    /dietaryTitleSummary\(/.test(codeOnly(read('src/components/plan/Moment2Step1Modal.tsx')))
  );
}

// ── LAYER C — the dev server, in the walled-off headless Chrome ─────────────
const created = {
  users: [] as string[],
  people: [] as string[],
  events: [] as string[],
  sessions: [] as string[],
};

const HELPERS = `
window.__hdr = (label) => [...document.querySelectorAll('div.rounded-lg > button')].find((b) => b.innerText.includes(label));
window.__box = (label) => { const b = window.__hdr(label); return b ? b.parentElement : null; };
window.__isOpen = (label) => window.__box(label).getBoundingClientRect().height > 70;
window.__tag = (el, name) => { document.querySelectorAll('[data-t="' + name + '"]').forEach((e) => e.removeAttribute('data-t')); if (!el) return false; el.setAttribute('data-t', name); return true; };
window.__within = (label, sel, text) => [...window.__box(label).querySelectorAll(sel)].find((e) => (e.innerText || '').trim() === text || e.getAttribute('placeholder') === text);
window.__hidden = (box) => { const r = box.getBoundingClientRect(); let worst = 0;
  box.querySelectorAll('label, textarea, select, input[type=text]').forEach((e) => { const b = e.getBoundingClientRect(); if (b.height > 0) worst = Math.max(worst, b.bottom - r.bottom); });
  return Math.round(worst); };
window.__sampleTop = (el, ms) => { window.__tops = []; const t0 = performance.now();
  (function f() { window.__tops.push(Math.round(el.getBoundingClientRect().top)); if (performance.now() - t0 < ms) requestAnimationFrame(f); })(); return true; };
window.__sampleHidden = (label, ms) => { const box = window.__box(label); window.__hs = []; window.__grewAt = null; const n0 = box.querySelectorAll('label').length; const t0 = performance.now();
  (function f() { const t = performance.now() - t0; const n = box.querySelectorAll('label').length; if (window.__grewAt === null && n > n0) window.__grewAt = t;
    window.__hs.push([Math.round(t), window.__hidden(box)]); if (t < ms) requestAnimationFrame(f); })(); return true; };
true;`;

async function runLive() {
  const up = await okAsync(async () => (await realFetch(`${BASE}/`)).ok);
  assert('C', 'S0 PRECONDITION: the dev server answers on :3000', up);
  if (!up) return;

  const totals = async () => ({
    invite: await prisma.inviteEvent.count(),
    outbound: await prisma.outboundMessage.count(),
  });
  const before = await totals();

  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const mail = (l: string) => `gtc364-${l}-${stamp}@example.com`;
  const user = await prisma.user.create({ data: { email: mail('kate') } });
  created.users.push(user.id);
  const kate = await prisma.person.create({
    data: { name: 'Kate B2', email: user.email, userId: user.id },
  });
  created.people.push(kate.id);
  const token = randomBytes(32).toString('hex');
  const session = await prisma.session.create({
    data: { userId: user.id, token, expiresAt: new Date(Date.now() + 3600e3) },
  });
  created.sessions.push(session.id);
  const start = new Date(Date.now() + 40 * 864e5);
  const mk = async (name: string, status: 'DRAFT' | 'CONFIRMING', approved: boolean) => {
    const ev = await prisma.event.create({
      data: { name, startDate: start, endDate: start, hostId: kate.id, status },
    });
    created.events.push(ev.id);
    await prisma.eventRole.create({ data: { eventId: ev.id, userId: user.id, role: 'HOST' } });
    await prisma.eventSetup.create({
      data: {
        eventId: ev.id,
        eventType: 'Christmas',
        ...(approved ? { planApprovedAt: new Date() } : {}),
      },
    });
    const hhK = await prisma.household.create({ data: { eventId: ev.id } });
    await prisma.personEvent.create({
      data: {
        personId: kate.id,
        eventId: ev.id,
        role: 'HOST',
        householdId: hhK.id,
        householdRole: 'PRIMARY_CONTACT',
      },
    });
    for (const [lead, others] of [
      ['Jo', ['Lee']],
      ['Ross', []],
      ['Gus', ['Ana', 'Zed']],
    ] as [string, string[]][]) {
      const hh = await prisma.household.create({ data: { eventId: ev.id } });
      for (const [i, n] of [lead, ...others].entries()) {
        const p = await prisma.person.create({
          data: { name: `${n} B2`, email: mail(`${n.toLowerCase()}-${created.events.length}`) },
        });
        created.people.push(p.id);
        await prisma.personEvent.create({
          data: {
            personId: p.id,
            eventId: ev.id,
            role: 'PARTICIPANT',
            householdId: hh.id,
            householdRole: i === 0 ? 'PRIMARY_CONTACT' : 'GUEST',
          },
        });
      }
    }
    return ev;
  };
  const desk = await mk('GTC-364 batch2 — Moment 2, desktop', 'DRAFT', false);
  const phone = await mk('GTC-364 batch2 — Moment 2, phone', 'DRAFT', false);
  const pf = await mk('GTC-364 batch2 — pre-flight', 'CONFIRMING', true);
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
      await prisma.session.count({ where: { id: { in: created.sessions } } }),
      await prisma.team.count({ where: evIn }),
      await prisma.outboundMessage.count({ where: evIn }),
      await prisma.inviteEvent.count({ where: evIn }),
    ].join(',');
  const whileExists = await rows();
  console.log(
    `  fixture rows (Event, EventSetup, EventRole, Household, PersonEvent, Person, User, Session, Team, OutboundMessage, InviteEvent): ${whileExists}`
  );
  const savedMains = async (id: string) =>
    CL.readStoredSelections(
      (((await prisma.eventSetup.findUnique({ where: { eventId: id } }))?.mainsData as any)
        ?.selections ?? {}) as any
    ) as Record<string, { options: string[]; freeText: string }>;

  let chrome: Headless | null = null;
  try {
    chrome = await openHeadless({ fetchImpl: realFetch, port: 9374 });
    await chrome.blockPlanMaking();
    await chrome.setSessionCookie(token);
    const c = chrome;
    const ev = <T = any,>(js: string) => c.evaluate<T>(js);
    const go = async (path: string) => {
      await c.navigate(path, 9000);
      await ev(HELPERS);
    };
    /** Tag what `js` finds, then click it — guarded. Resolves to null when clicked, else why not. */
    const tap = async (js: string) => {
      const found = await ev<boolean>(`window.__tag(${js}, 'x')`);
      if (!found) return 'not found';
      return c.clickGuarded('[data-t="x"]');
    };
    const hdr = (label: string) => `window.__hdr(${JSON.stringify(label)})`;
    const inBox = (label: string, sel: string, text: string) =>
      `window.__within(${JSON.stringify(label)}, ${JSON.stringify(sel)}, ${JSON.stringify(text)})`;
    const ensure = async (label: string, open: boolean) => {
      if ((await ev<boolean>(`window.__isOpen(${JSON.stringify(label)})`)) !== open) {
        await tap(hdr(label));
        await sleep(500);
      }
    };
    /** Open `above`, then open `below`: how far does `below`'s title row move? */
    const jump = async (above: string | null, below: string) => {
      if (above) await ensure(above, true);
      await ev(`${hdr(below)}.scrollIntoView({ block: 'center' })`);
      await sleep(300);
      const from = await ev<number>(`Math.round(${hdr(below)}.getBoundingClientRect().top)`);
      await ev(`window.__sampleTop(${hdr(below)}, 1200)`);
      const why = await tap(hdr(below));
      await sleep(1300);
      const tops = await ev<number[]>('window.__tops');
      return { why, moved: Math.max(...tops.map((t) => Math.abs(t - from))) };
    };
    /** Tick `option` in an open section: once the new choices exist, is any of them cut off? */
    const cutOff = async (label: string, option: string) => {
      await ev(`window.__sampleHidden(${JSON.stringify(label)}, 1500)`);
      const why = await tap(inBox(label, 'label', option));
      await sleep(1500);
      const grewAt = await ev<number | null>('window.__grewAt');
      const hs = await ev<[number, number][]>('window.__hs');
      const late = grewAt === null ? [] : hs.filter(([t]) => t >= grewAt + 50);
      return { why, grewAt, worst: late.length ? Math.max(...late.map(([, h]) => h)) : -1 };
    };

    // ── desktop, Moment 2
    await c.setViewport(1280, 900, false);
    await go(`/plan/${desk.id}/setup`);
    const probe = await ev<string>(
      `fetch('/__gtc364_probe/finalize-plan', { method: 'POST' }).then((r) => 'reached ' + r.status, () => 'failed in the browser')`
    );
    assert(
      'C',
      'C0 SAFETY: the plan-making block holds — a probe request fails in the browser',
      probe === 'failed in the browser' && c.planMakingBlocked().length === 1,
      probe
    );
    assert(
      'C',
      'C14b CONTROL: Dietary, not answered, closed: the title row reads W4',
      (await ev<string>(`${hdr('Dietary')}.innerText`)).includes(W4)
    );
    const c5 = await jump(null, 'Dessert');
    assert(
      'C',
      'C5 CONTROL: nothing open; opening Dessert moves nothing',
      c5.why === null && c5.moved <= 2,
      JSON.stringify(c5)
    );
    await ensure('Dessert', false);
    const c1 = await jump('Mains', 'Dessert');
    assert(
      'C',
      'C1 desktop: with Mains open, opening Dessert leaves Dessert’s title row where it was',
      c1.why === null && c1.moved <= 2,
      JSON.stringify(c1)
    );
    await ensure('Dessert', false);
    await ensure('Mains', true);
    const c3 = await cutOff('Mains', 'Traditional roast');
    assert(
      'C',
      'C3 desktop: ticking "Traditional roast" shows its dishes at once — none cut off after 50ms',
      c3.why === null && c3.grewAt !== null && c3.worst <= 1,
      JSON.stringify(c3)
    );
    await tap(inBox('Mains', 'label', 'Roast lamb'));
    await sleep(1500);
    const c13 = await savedMains(desk.id);
    assert(
      'C',
      'C13 CONTROL: a dish tick saves as it always has — styles at level 0, dishes at level 1',
      JSON.stringify(c13['0']?.options) === JSON.stringify(['Traditional roast']) &&
        JSON.stringify(c13['1']?.options) === JSON.stringify(['Roast lamb']),
      JSON.stringify(c13)
    );
    await tap(inBox('Mains', 'textarea', 'Specify dishes...'));
    await c.insertText('a big one');
    await sleep(300);
    await tap(inBox('Mains', 'label', 'Traditional roast'));
    await sleep(1500);
    const c16 = await savedMains(desk.id);
    assert(
      'C',
      'C16 Q5 on screen: unticking "Traditional roast" unticks "Roast lamb"; the typed text stays',
      (c16['0']?.options ?? []).length === 0 &&
        (c16['1']?.options ?? []).length === 0 &&
        c16['1']?.freeText === 'a big one',
      JSON.stringify(c16)
    );
    await tap(inBox('Mains', 'label', 'Traditional roast'));
    await sleep(900);
    const gap = await ev<number>(
      `(() => { const l = ${inBox('Mains', 'button', W2)}; return l ? Math.round(l.getBoundingClientRect().top - ${hdr('Mains')}.getBoundingClientRect().bottom) : -1; })()`
    );
    assert(
      'C',
      'C10 "Still deciding?" is not within 40px under the title row (it is at the foot)',
      gap > 40,
      String(gap)
    );
    await ensure('Notes', true);
    assert(
      'C',
      'C9 Notes, open, has no "Still deciding?" link',
      (await ev<boolean>(`!${inBox('Notes', 'button', W2)}`)) === true
    );
    await ensure('Notes', false);
    await ensure('Mains', true);
    await tap(inBox('Mains', 'button', W2));
    await sleep(600);
    await ensure('Mains', false);
    assert(
      'C',
      'C11 Mains still deciding, closed: the title row reads W1',
      (await ev<string>(`${hdr('Mains')}.innerText`)).includes(W1)
    );
    await ensure('Mains', true);
    assert(
      'C',
      'C11b …and open, the way out reads W3',
      (await ev<boolean>(`!!${inBox('Mains', 'button', W3)}`)) === true
    );
    const c12why = await tap(inBox('Mains', 'label', 'Glazed ham'));
    await sleep(900);
    const c12 = await ev<{ ham: boolean; row: string }>(
      `({ ham: !!${inBox('Mains', 'label', 'Glazed ham')}?.querySelector('input')?.checked, row: ${hdr('Mains')}.innerText })`
    );
    assert(
      'C',
      'C12 still deciding: a tap on "Glazed ham" ticks it and takes Mains out of still deciding',
      c12why === null && c12.ham && !c12.row.includes(W1),
      `${c12why} ${JSON.stringify(c12)}`
    );
    await ensure('Mains', false);
    await ensure('Dietary', true);
    await tap(inBox('Dietary', 'label', 'Vegetarian'));
    await tap(inBox('Dietary', 'label', 'Gluten-free'));
    await sleep(600);
    await ensure('Dietary', false);
    const c14 = await ev<string>(`${hdr('Dietary')}.innerText`);
    assert(
      'C',
      'C14 Dietary, two ticked, closed: the title row reads "Vegetarian, Gluten-free"',
      c14.includes('Vegetarian, Gluten-free') && !c14.includes(W4),
      c14.replace(/\s+/g, ' ')
    );

    // ── phone, Moment 2
    await c.setViewport(390, 844, true);
    await go(`/plan/${phone.id}/setup`);
    const c2 = await jump('Mains', 'Dessert');
    assert(
      'C',
      'C2 phone: with Mains open, opening Dessert leaves Dessert’s title row where it was',
      c2.why === null && c2.moved <= 2,
      JSON.stringify(c2)
    );
    await ensure('Dessert', false);
    await ensure('Mains', true);
    const c4 = await cutOff('Mains', 'Traditional roast');
    assert(
      'C',
      'C4 phone: ticking "Traditional roast" shows its dishes at once — none cut off after 50ms',
      c4.why === null && c4.grewAt !== null && c4.worst <= 1,
      JSON.stringify(c4)
    );

    // ── the pre-flight's household rows (Q2)
    for (const [tag, w, h, mobile] of [
      ['C6 desktop', 1280, 900, false],
      ['C7 phone', 390, 844, true],
    ] as [string, number, number, boolean][]) {
      await c.setViewport(w, h, mobile);
      await go(`/plan/${pf.id}/pre-flight`);
      if (tag.startsWith('C6')) {
        // Measured before Gus's row is opened: at HEAD, opening Gus's closes Jo's.
        await ensure('Jo B2', true);
        assert(
          'C',
          "C8 CONTROL: pre-flight, Jo's household open: nothing in it is cut off",
          (await ev<number>(`window.__hidden(window.__box('Jo B2'))`)) <= 1
        );
      }
      const r = await jump('Jo B2', 'Gus B2');
      assert(
        'C',
        `${tag}: pre-flight, with Jo's household open, opening Gus's leaves its title row where it was`,
        r.why === null && r.moved <= 2,
        JSON.stringify(r)
      );
    }

    assert(
      'C',
      'C15 SAFETY: the page asked for no plan-making route (the probe is the only request blocked), and only localhost',
      c.planMakingBlocked().length === 1 &&
        /__gtc364_probe/.test(c.planMakingBlocked()[0]) &&
        c.hostsRequested().every((x) => /^localhost(:\d+)?$/.test(x)),
      JSON.stringify({ blocked: c.planMakingBlocked(), hosts: c.hostsRequested() })
    );
  } finally {
    chrome?.close();
  }
  const ai = await prisma.event.findMany({
    where: { id: { in: created.events } },
    select: { aiCallsUsed: true },
  });
  assert(
    'C',
    'S4 SAFETY: nothing was generated — every fixture event’s aiCallsUsed is 0, and none has a team',
    ai.length === 3 &&
      ai.every((e) => (e.aiCallsUsed ?? 0) === 0) &&
      (await prisma.team.count({ where: evIn })) === 0
  );
  await cleanup();
  const after = await totals();
  assert(
    'Z',
    `Z1 every fixture row removed by id (${whileExists} while it existed), and the totals as found (${before.invite}/${before.outbound} -> ${after.invite}/${after.outbound})`,
    (await rows()) === '0,0,0,0,0,0,0,0,0,0,0' &&
      after.invite === before.invite &&
      after.outbound === before.outbound
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
  await del(() => prisma.session.deleteMany({ where: { id: { in: created.sessions } } }));
  await del(() => prisma.event.deleteMany({ where: { id: { in: created.events } } }));
  await del(() => prisma.person.deleteMany({ where: { id: { in: created.people } } }));
  await del(() => prisma.user.deleteMany({ where: { id: { in: created.users } } }));
}

async function main() {
  runInMemory();
  await runQ5();
  run28();
  await runLive();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (redAssertions.length) {
    console.log('\nRED:');
    for (const r of redAssertions) console.log(`  ${r}`);
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
