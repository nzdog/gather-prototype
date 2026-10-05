/**
 * GTC-363 — walkthrough batch 1: the wording, and the menu lists.
 *
 * The founder walked the Moment flow himself (2026-10-03, 2026-10-04) and sorted what he found
 * (GTC-189's Fourth ruling). This suite pins batch 1's eight items to the words he ruled on the
 * plan (GTC-363, PLAN RULINGS 2026-10-05, W1 to W12) and to the behaviour he chose (Q1 to Q11):
 *
 *   6   the household-contact line (W1), on Moment 1 and the pre-flight, never for the host's own
 *       household — and a check, through the chooser itself, that W1 is true of what Gather does
 *   7   the board's sentence: "I’m looking after N" (W2)
 *   15  each entry is a household (W3 to W6)
 *   19  "Roast turkey" for Christmas (W7), and the line only the AI sees (W8)
 *   22  "Classic pavlova with cream" in all seven lists (W9); an old stored pick reads as W9
 *   26  Entrée & Starters up front for Christmas, planned only when picked (Q1)
 *   25  the notes box: "📝 Notes" (W10), its hint (W11), just after Dietary (Q4)
 *   20  "Other" above every type-your-own box (W12)
 *
 * NOTHING SENDS AND NOTHING IS WRITTEN. Everything here is in memory — rendered components, the
 * config, the prompt builder and the channel chooser called on an event built in this file —
 * except two `buildPlanGenerationInput` calls, whose one query (households for a made-up event
 * id) reads nothing and writes nothing.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'fs';
import { join } from 'path';

import Moment1InputForm from '../src/components/plan/Moment1InputForm';
import HouseholdCardList from '../src/components/plan/HouseholdCardList';
import OptionTree from '../src/components/shared/OptionTree';
import * as CL from '../src/lib/ai/config-loader';
import { buildPlanGenerationPrompt } from '../src/lib/ai/prompts';
import { buildPlanGenerationInput } from '../src/lib/ai/plan-input';
import { summarySentence } from '../src/components/glance/strip';
import {
  chooseAskRoute,
  chooseHouseholdListRoute,
  type ChooserEvent,
  type ChooserMembership,
} from '../src/lib/eligibility/channel-chooser';
import { prisma } from '../src/lib/prisma';
import planConfig from '../src/lib/ai/plan-option-tree-config.json';

let passed = 0;
let failed = 0;
const redAssertions: string[] = [];

function assert(phase: string, label: string, condition: boolean) {
  if (condition) {
    console.log(`\x1b[32m✓\x1b[0m [${phase}] ${label}`);
    passed++;
  } else {
    console.error(`\x1b[31m✗\x1b[0m [${phase}] ${label}`);
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

/** React escapes these in text and attributes; compare against what the page really carries. */
function html(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

// ── The ruled words, verbatim (GTC-363, PLAN RULINGS 2026-10-05) ─────────────
const W1 =
  'Gather sends this person the asks for the household’s children, and tells them what the ' +
  'others in the household have been asked to bring. Adults with their own email or mobile ' +
  'still hear from Gather themselves.';
const W3 = (event: string) =>
  `Who’s coming to ${event}? Add one household at a time: start with its main contact, then ` +
  'anyone else in it. Someone coming on their own is a household of one. Just a name and how ' +
  'to reach each person — you can sort out what they’re bringing later.';
const W4 = 'Anyone else in this household?';
const W5 = 'Ducks in a row so far';
const W6 = 'Save & add another household';
const W7 = 'Roast turkey';
const W8 = 'Turkey is not a usual NZ Christmas main: include it only when the host has picked it.';
const W9 = 'Classic pavlova with cream';
const W10 = '📝 Notes';
const W11 =
  'Anything else Gather should know? For example, you’d like leftovers for 6 people tomorrow.';
const W12 = 'Other';

const OLD_PAVLOVA = 'Classic pavlova with cream and kiwifruit';
const SEVEN = [
  'christmas',
  'birthday_adult',
  'bbq_casual',
  'engagement_party',
  'easter',
  'anniversary',
  'farewell',
];

const config = planConfig as unknown as Record<
  string,
  {
    label: string;
    nzNotes: string;
    defaultCategories: string[];
    categories: Record<
      string,
      {
        levels: Array<{
          options?: string[];
          dependsOn?: Record<string, string[]>;
          freeText?: boolean;
          freeTextPlaceholder?: string;
        }>;
      }
    >;
  }
>;

/** Every option list in the config: level options and every dependsOn list. */
function everyList(): Array<{ where: string; list: string[] }> {
  const out: Array<{ where: string; list: string[] }> = [];
  for (const [type, occ] of Object.entries(config)) {
    for (const [cat, c] of Object.entries(occ.categories)) {
      c.levels.forEach((l, i) => {
        if (l.options) out.push({ where: `${type}.${cat}.L${i + 1}`, list: l.options });
        for (const [k, v] of Object.entries(l.dependsOn ?? {})) {
          out.push({ where: `${type}.${cat}.L${i + 1}[${k}]`, list: v });
        }
      });
    }
  }
  return out;
}

/** The pavlova list of one event type's dessert (the list that held the old words at HEAD). */
function pavlovaList(type: string): string[] | null {
  const levels = config[type]?.categories.dessert?.levels ?? [];
  for (const l of levels) {
    for (const v of Object.values(l.dependsOn ?? {})) {
      if (v.includes('Berry pavlova') && v.includes('Mini pavlovas')) return v;
    }
  }
  return null;
}

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
const NO_SUCH_EVENT = 'gtc363-no-such-event';

async function main() {
  // ══ ITEM 6 — the household-contact line ════════════════════════════════════
  const CANDIDATES = [
    { personEventId: 'pe-ross', name: 'Ross', householdId: 'h-other', householdName: 'Moana' },
  ];
  const renderForm = (props: Record<string, unknown>) =>
    renderToStaticMarkup(
      createElement(Moment1InputForm as any, {
        eventId: 'e1',
        eventName: 'Boxing Day',
        onComplete: () => {},
        onAddPerson: async () => {},
        channelCandidates: CANDIDATES,
        ...props,
      })
    );
  const guestForm = renderForm({});
  const ownHousehold = {
    id: 'h-kate',
    primaryContact: { name: 'Kate' },
    helpers: [],
    littleCount: 0,
    guests: [],
    isHostHousehold: true,
  };
  const ownForm = renderForm({ editingHousehold: ownHousehold });
  const hostFirstScreen = renderForm({
    hostMode: { name: 'Kate', email: 'kate@example.com', phone: null },
    channelCandidates: [],
  });
  const PICKER = 'Who should Gather talk to for this household?';

  let CLINE: any = null;
  try {
    CLINE = await import('../src/lib/households/contact-line');
  } catch {
    CLINE = null;
  }
  assert(
    '6',
    '6a the line is held once, verbatim as ruled (W1)',
    ok(() => CLINE.HOUSEHOLD_CONTACT_LINE === W1)
  );
  assert(
    '6',
    '6b Moment 1: a guest household’s form shows W1 under the contact question',
    ok(() => {
      const q = guestForm.indexOf(PICKER);
      const w = guestForm.indexOf(html(W1));
      return q >= 0 && w > q;
    })
  );
  assert(
    '6',
    '6c Moment 1: both old sentences are gone ("Everything for this household…", "…better ear")',
    !guestForm.includes('Everything for this household goes to one person') &&
      !guestForm.includes('better ear') &&
      !read('src/components/plan/Moment1InputForm.tsx').includes('better ear')
  );
  assert(
    '6',
    '6d Moment 1, the host’s own household opened from the list: the picker still shows (unchanged)',
    ownForm.includes(PICKER)
  );
  assert(
    '6',
    '6e …and W1 does NOT, while a guest household’s form in the same harness shows it (the founder’s fix)',
    guestForm.includes(html(W1)) && !ownForm.includes(html(W1))
  );
  assert(
    '6',
    '6f Moment 1, the host’s first screen: no picker and no W1 (unchanged)',
    !hostFirstScreen.includes(PICKER) && !hostFirstScreen.includes(html(W1))
  );

  const pageSrc = codeOnly(read('src/app/plan/[eventId]/pre-flight/page.tsx'));
  const routeSrc = codeOnly(read('src/app/api/events/[id]/pre-flight/route.ts'));
  assert(
    '6',
    '6g pre-flight step 3: W1 rendered from the module, under the question, off the host’s household',
    /HOUSEHOLD_CONTACT_LINE/.test(pageSrc) &&
      /!h\.isHostHousehold\s*&&[\s\S]{0,200}HOUSEHOLD_CONTACT_LINE/.test(pageSrc) &&
      pageSrc.indexOf(PICKER) >= 0 &&
      pageSrc.indexOf('HOUSEHOLD_CONTACT_LINE}') > pageSrc.indexOf(PICKER)
  );
  assert(
    '6',
    '6h the pre-flight route marks the host’s own household by the host rule (isAddressable)',
    /isHostHousehold:\s*h\.members\.some\(\s*\(m\)\s*=>\s*!isAddressable\(/.test(routeSrc)
  );

  // W1 against the chooser — what Gather actually does since GTC-356. Controls: green at HEAD.
  const person = (email: string | null, phoneNumber: string | null) => ({
    email,
    phoneNumber,
    smsOptedOut: false,
    emailOptedOut: false,
    emailBlocked: false,
    emailReported: false,
    numberDead: false,
  });
  const m = (
    id: string,
    personId: string,
    householdId: string,
    householdRole: string,
    p: ReturnType<typeof person>,
    role = 'PARTICIPANT'
  ): ChooserMembership => ({
    id,
    personId,
    role,
    householdId,
    householdRole,
    nudgeMark: null,
    holdsItems: true,
    person: p,
  });
  const moana = m(
    'pe-moana',
    'p-moana',
    'h1',
    'PRIMARY_CONTACT',
    person('moana@example.com', null)
  );
  const ross = m('pe-ross', 'p-ross', 'h1', 'PARTNER', person('ross@example.com', null));
  const pita = m('pe-pita', 'p-pita', 'h1', 'GUEST', person(null, '+64211234567'));
  const sam = m('pe-sam', 'p-sam', 'h1', 'GUEST', person(null, null));
  const kid = m('pe-kid', 'p-kid', 'h1', 'CHILD', person(null, null));
  const kate = m(
    'pe-kate',
    'p-kate',
    'h2',
    'PRIMARY_CONTACT',
    person('kate@example.com', null),
    'HOST'
  );
  const tia = m('pe-tia', 'p-tia', 'h2', 'CHILD', person(null, null));
  const ev: ChooserEvent = {
    hostId: 'p-kate',
    memberships: [moana, ross, pita, sam, kid, kate, tia],
    households: [
      // Ross picked as the contact, not the primary: the picker is what decides.
      { id: 'h1', contactPersonEventId: 'pe-ross', messagesMuted: null },
      { id: 'h2', contactPersonEventId: null, messagesMuted: null },
    ],
  };
  assert(
    '6 truth',
    '6T1 "Gather sends this person the asks for the household’s children": a child holding an item is CARRIED to the picked contact',
    ok(() => {
      const r = chooseAskRoute(kid, ev);
      return r.kind === 'CARRIED' && r.recipientId === 'pe-ross';
    })
  );
  assert(
    '6 truth',
    '6T2 "…and tells them what the others… have been asked to bring": the household list goes to the same person, naming the other adults',
    ok(() => {
      const r = chooseHouseholdListRoute('h1', ev);
      return (
        r.kind === 'TO_CONTACT' &&
        r.recipientId === 'pe-ross' &&
        ['pe-moana', 'pe-pita', 'pe-sam'].every((id) => r.memberIds.includes(id)) &&
        !r.memberIds.includes('pe-kid')
      );
    })
  );
  assert(
    '6 truth',
    '6T3 "Adults with their own email or mobile still hear from Gather themselves": email → DIRECT by email, mobile only → DIRECT by text',
    ok(() => {
      const a = chooseAskRoute(moana, ev);
      const b = chooseAskRoute(pita, ev);
      return (
        a.kind === 'DIRECT' &&
        a.recipientId === 'pe-moana' &&
        a.channel === 'EMAIL' &&
        b.kind === 'DIRECT' &&
        b.recipientId === 'pe-pita' &&
        b.channel === 'TEXT'
      );
    })
  );
  assert(
    '6 truth',
    '6T4 an adult with neither goes on the host’s list, not to the contact — W1 promises nothing for them',
    ok(() => chooseAskRoute(sam, ev).kind === 'HOST_LIST')
  );
  assert(
    '6 truth',
    '6T5 why W1 is not shown for the host’s own household: her child is hers, and her household has no list',
    ok(() => {
      const r = chooseAskRoute(tia, ev);
      const l = chooseHouseholdListRoute('h2', ev);
      return (
        r.kind === 'HOST_LIST' &&
        r.why === 'HOST_HOUSEHOLD_CHILD' &&
        l.kind === 'NONE' &&
        l.why === 'HOST_HOUSEHOLD'
      );
    })
  );

  // ══ ITEM 7 — the board's sentence ══════════════════════════════════════════
  assert(
    '7',
    '7a the founder’s example, verbatim: "2 need you. I’m looking after 23. 1 settled." (W2)',
    ok(
      () =>
        summarySentence({ needYou: 2, withGather: 23, settled: 1 }) ===
        '2 need you. I’m looking after 23. 1 settled.'
    )
  );

  // ══ ITEM 15 — each entry is a household ════════════════════════════════════
  assert(
    '15',
    '15a the guest form opens with W3, the event named',
    guestForm.includes(html(W3('Boxing Day')))
  );
  assert(
    '15',
    '15b "Anyone else in this household?" (W4), and "this group" is gone',
    guestForm.includes(W4) && !guestForm.includes('Anyone else in this group?')
  );
  assert(
    '15',
    '15c the column is headed "Ducks in a row so far" (W5)',
    ok(() => {
      const col = renderToStaticMarkup(
        createElement(HouseholdCardList as any, {
          households: [{ ...ownHousehold, isHostHousehold: false, id: 'h-x' }],
          onEdit: () => {},
        })
      );
      return col.includes(W5) && !col.includes('Ducks in row so far');
    })
  );
  assert(
    '15',
    '15d the button reads "Save & add another household" (W6)',
    guestForm.includes(html(W6))
  );
  assert(
    '15',
    '15e the host’s first screen is unchanged: her own household’s words',
    hostFirstScreen.includes('Anyone else in your household?') &&
      hostFirstScreen.includes('First — you’re at Boxing Day too.')
  );

  // ══ ITEM 19 — turkey for Christmas ═════════════════════════════════════════
  const roast = () => config.christmas.categories.mains.levels[1].dependsOn!['Traditional roast'];
  assert(
    '19',
    '19a Christmas "Traditional roast": the five dishes, then "Roast turkey" last (W7)',
    ok(
      () =>
        JSON.stringify(roast()) ===
        JSON.stringify([
          'Glazed ham',
          'Roast lamb',
          'Roast chicken',
          'Roast beef',
          'Roast pork',
          W7,
        ])
    )
  );
  assert(
    '19',
    '19b turkey is offered nowhere else: exactly one option in the whole config names it',
    ok(() => {
      const hits = everyList().flatMap((x) =>
        x.list.filter((o) => /turkey/i.test(o)).map(() => x.where)
      );
      return hits.length === 1 && hits[0] === 'christmas.mains.L2[Traditional roast]';
    })
  );
  assert(
    '19',
    '19c the line only the AI sees (W8) is in a Christmas prompt, and in no other event type’s',
    ok(() => {
      const base = {
        totalAdults: 10,
        totalKids: 2,
        dietaryStatus: 'confirmed_none' as const,
        dietaryRequirements: [],
        engagedCategories: [],
        otherNotes: '',
        setUpNotes: '',
        cleanUpNotes: '',
        otherJobsNotes: '',
      };
      const xmas = buildPlanGenerationPrompt({ ...base, eventType: 'Christmas' }).system;
      const others = ['Easter', 'Casual BBQ', 'Birthday (Adult)'].map(
        (t) => buildPlanGenerationPrompt({ ...base, eventType: t }).system
      );
      return xmas.includes(W8) && others.every((s) => !/turkey/i.test(s));
    })
  );
  assert(
    '19',
    '19d why W8 is needed: "Roast turkey" reaches the AI as a reference item in a Christmas plan nobody picked it in',
    await okAsync(async () => {
      const { promptInput } = await buildPlanGenerationInput(
        NO_SUCH_EVENT,
        { guestCount: 10 },
        setupOf('Christmas', {})
      );
      const mains = promptInput.engagedCategories.find((c) => c.key === 'mains');
      return !!mains && mains.selections.length === 0 && mains.referenceItems.includes(W7);
    })
  );
  assert(
    '19',
    '19e on screen: with "Traditional roast" ticked, "Roast turkey" is the last dish shown',
    ok(() => {
      const levels = CL.getCategoryLevels('Christmas', 'mains')!;
      const out = renderToStaticMarkup(
        createElement(OptionTree, {
          levels,
          selections: { 0: { options: ['Traditional roast'], freeText: '' } },
          onChange: () => {},
        })
      );
      const t = out.indexOf(`>${W7}<`);
      return t > out.indexOf('>Roast pork<') && out.indexOf('>Roast pork<') > 0;
    })
  );

  // ══ ITEM 22 — kiwifruit off the classic pavlova ════════════════════════════
  assert(
    '22',
    '22a the old words are in no list anywhere in the config',
    ok(() => everyList().every((x) => !x.list.includes(OLD_PAVLOVA)))
  );
  assert(
    '22',
    '22b "Classic pavlova with cream" (W9) leads the pavlova list in all seven event types',
    ok(() => SEVEN.every((t) => pavlovaList(t)?.[0] === W9))
  );
  assert(
    '22',
    '22c the wedding’s "Classic pavlova with cream and berries" is untouched',
    ok(() =>
      Object.values(config.wedding_reception.categories.dessert.levels[1].dependsOn ?? {}).some(
        (v) => v.includes('Classic pavlova with cream and berries')
      )
    )
  );
  assert(
    '22',
    '22d an old stored pick reads as W9, and every other stored value reads as itself',
    ok(() => {
      const f = (CL as any).readStoredSelections;
      const out = f({
        0: { options: ['Classic NZ pavlova centrepiece'], freeText: '' },
        1: { options: [OLD_PAVLOVA, 'Berry pavlova'], freeText: 'kiwifruit on the side' },
      });
      return (
        JSON.stringify(out[0].options) === JSON.stringify(['Classic NZ pavlova centrepiece']) &&
        JSON.stringify(out[1].options) === JSON.stringify([W9, 'Berry pavlova']) &&
        out[1].freeText === 'kiwifruit on the side'
      );
    })
  );
  assert(
    '22',
    '22e plan generation sends W9 for an event whose stored choices name the old words',
    await okAsync(async () => {
      const { promptInput } = await buildPlanGenerationInput(
        NO_SUCH_EVENT,
        { guestCount: 10 },
        setupOf('Christmas', {
          dessert: {
            selections: {
              0: { options: ['Classic NZ pavlova centrepiece'], freeText: '' },
              1: { options: [OLD_PAVLOVA], freeText: '' },
            },
            stillDeciding: false,
          },
        })
      );
      const d = promptInput.engagedCategories.find((c) => c.key === 'dessert');
      return !!d && d.selections.includes(W9) && !d.selections.includes(OLD_PAVLOVA);
    })
  );
  const modalSrc = codeOnly(read('src/components/plan/Moment2Step1Modal.tsx'));
  assert(
    '22',
    '22f Moment 2 reads stored choices through the same map when it loads them',
    /readStoredSelections\(/.test(modalSrc)
  );

  // ══ ITEM 26 — Entrée & Starters up front for Christmas ═════════════════════
  const XMAS_DEFAULTS = [
    'mains',
    'dessert',
    'sides_salads',
    'drinks_alcoholic',
    'drinks_non_alcoholic',
    'table_snacks',
    'cleanup',
    'furniture_equipment',
  ];
  assert(
    '26',
    '26a Christmas’s defaultCategories are unchanged — starters are NOT always planned (Q1)',
    ok(() => JSON.stringify(CL.getDefaultCategories('Christmas')) === JSON.stringify(XMAS_DEFAULTS))
  );
  const upFront = (t: string): string[] => (CL as any).getUpFrontCategories(t);
  assert(
    '26',
    '26b Christmas shows its defaults and Entrée & Starters up front',
    ok(
      () =>
        JSON.stringify(upFront('Christmas')) ===
        JSON.stringify([...XMAS_DEFAULTS, 'entree_starters'])
    )
  );
  const order = (() => {
    const m = modalSrc.match(/OPTION_TREE_FOOD_CATEGORIES\s*=\s*\[([\s\S]*?)\]\s*as const/);
    return m ? [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]) : [];
  })();
  assert(
    '26',
    '26c Moment 2, Christmas: starters second (after Mains); "Show more" holds two — Cake, Breakfast & brunch',
    ok(() => {
      const shown = new Set(upFront('Christmas'));
      const up = order.filter((k) => shown.has(k));
      const more = order.filter(
        (k) => !shown.has(k) && !!CL.getCategoryLevels('Christmas', k)?.length
      );
      return (
        up[0] === 'mains' &&
        up[1] === 'entree_starters' &&
        JSON.stringify(more) === JSON.stringify(['cake', 'breakfast_brunch'])
      );
    })
  );
  assert(
    '26',
    '26d every other event type shows up front exactly its defaults, as before',
    ok(() => {
      const types = CL.CONFIG_EVENT_TYPES.filter((t) => t !== 'Christmas' && t !== 'Other');
      return (
        types.length === 9 &&
        types.every(
          (t) => JSON.stringify(upFront(t)) === JSON.stringify(CL.getDefaultCategories(t))
        )
      );
    })
  );
  assert(
    '26',
    '26e both Moment 2 lists (up front, "Show more") read the up-front categories',
    (modalSrc.match(/getUpFrontCategories\(state\.eventType/g) ?? []).length === 2 &&
      !/getDefaultCategories\(/.test(modalSrc)
  );
  assert(
    '26',
    '26f a Christmas plan with no starter picked plans no starters',
    await okAsync(async () => {
      const { promptInput } = await buildPlanGenerationInput(
        NO_SUCH_EVENT,
        { guestCount: 10 },
        setupOf('Christmas', {})
      );
      return !promptInput.engagedCategories.some((c) => c.key === 'entree_starters');
    })
  );
  assert(
    '26',
    '26g …and one with a starter picked plans them',
    await okAsync(async () => {
      const { promptInput } = await buildPlanGenerationInput(
        NO_SUCH_EVENT,
        { guestCount: 10 },
        setupOf('Christmas', {
          entree_starters: {
            selections: { 0: { options: ['Soup'], freeText: '' } },
            stillDeciding: false,
          },
        })
      );
      const s = promptInput.engagedCategories.find((c) => c.key === 'entree_starters');
      return !!s && s.selections.includes('Soup');
    })
  );

  // ══ ITEM 25 — the notes section ════════════════════════════════════════════
  assert(
    '25',
    '25a the box is "📝 Notes" (W10) with the ruled hint (W11); "📝 Other" and its old hint are gone',
    modalSrc.includes(`label="${W10}"`) &&
      modalSrc.includes(`placeholder="${W11}"`) &&
      !modalSrc.includes('label="📝 Other"') &&
      !modalSrc.includes('Music, decorations, specific equipment, venue notes')
  );
  assert(
    '25',
    '25b it sits just after Dietary requirements and before the first food section',
    ok(() => {
      const diet = modalSrc.indexOf('<DietaryAccordion');
      const notes = modalSrc.indexOf('<NotesAccordion');
      const food = modalSrc.indexOf('renderableFoodCategories.map');
      return diet >= 0 && notes > diet && food > notes;
    })
  );
  assert(
    '25',
    '25c it still writes otherNotes, under the same id — what the AI reads is unchanged',
    /id="other"[\s\S]{0,300}otherNotes:\s*v/.test(modalSrc)
  );

  // ══ ITEM 20 — "Other" above every type-your-own box ════════════════════════
  const mainsTree = ok(() => !!CL.getCategoryLevels('Christmas', 'mains'))
    ? renderToStaticMarkup(
        createElement(OptionTree, {
          levels: CL.getCategoryLevels('Christmas', 'mains')!,
          selections: { 0: { options: ['Traditional roast'], freeText: '' } },
          onChange: () => {},
        })
      )
    : '';
  assert(
    '20',
    '20a each of Mains’ two boxes has an "Other" label (W12), tied to it by for/id',
    ok(() => {
      const labels = [...mainsTree.matchAll(/<label[^>]*for="([^"]+)"[^>]*>([^<]*)<\/label>/g)];
      const other = labels.filter((l) => l[2] === W12);
      const areas = [...mainsTree.matchAll(/<textarea[^>]*id="([^"]+)"/g)].map((a) => a[1]);
      return (
        other.length === 2 &&
        areas.length === 2 &&
        other.every((l) => areas.includes(l[1])) &&
        new Set(areas).size === 2
      );
    })
  );
  assert(
    '20',
    '20b the placeholders are unchanged ("Describe your mains...", "Specify dishes...")',
    mainsTree.includes('placeholder="Describe your mains..."') &&
      mainsTree.includes('placeholder="Specify dishes..."')
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  if (redAssertions.length) {
    console.log('\nRED:');
    for (const r of redAssertions) console.log(`  ${r}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    failed++;
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(failed > 0 ? 1 : 0);
  });
