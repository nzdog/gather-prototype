/**
 * GTC-384 — walkthrough batch 14: the 14 Oct walk's first batch, words and small screens.
 *
 * Nigel walked the launch code on 2026-10-14 ("Gather Tweaks 2"). This suite pins items 54, 55, 56,
 * 57, 61, 62, 63, 65, 71 and 74 to his plan rulings (GTC-384, Q1 to Q8, 2026-10-14):
 *
 *   74  the per-event price is $25: the Stripe charge (2500, nzd) and every price a person sees, in
 *       one change (Q1); the $69 yearly plan's price and selling words off /billing and
 *       /billing/upgrade, with nothing new written (Q3)
 *   62  the pre-flight's step 1 is "Are we all sorted?", and the line under Send follows
 *   65  the handover names Gather twice, his words, straight apostrophes and a hyphen (Q2, GSM-7)
 *   63  "Who should Gather talk to for the kids in this household?", its line directly under it in
 *       darker text; on the host's own household the picker is not shown at all (Q4)
 *   55  the "Message me about my own household" switch is gone; one true line in its place, also
 *       for a household of one (Q5); nothing stored changes
 *   54  Moment 1's "What this does" and "When it's done" move to the herd-of-cats screen, between
 *       the strip and "Ready to start herding →", and the screen scrolls from its top on a phone
 *   56  "Anyone else in this household?" is a heading, in the counter's style
 *   57  "Ducks in a row so far — N people in M households", the same sum as "N people added." (Q6)
 *   61  the pre-flight's strip has more room and more space above and below, on the pre-flight
 *       only; MomentArc is untouched (Q7)
 *   71  "← Back to the board" on "Who I nudge" is an outlined button-link, top and bottom (Q8)
 *
 * Layers P, T, H, Q, S, M, A, D, N and Z run in memory (renders and source). Layer C drives the dev
 * server in the walled-off headless Chrome (port 9481) at 1280 and 390, on a fixture of its own
 * (example.com addresses, no phones, nothing queued), behind the three safeguards of
 * GATHER-BUILD-CONSTANTS.md and the send wall: the browser fails every plan-making request and every
 * request to a door that sends before it leaves the page (both proven on probe URLs first). Layer C
 * clicks NOTHING: it navigates, scrolls and measures. The fixture's `aiCallsUsed` is read while it
 * exists, its rows counted, then removed by id; the totals are asserted as found.
 *
 * Every new assertion carries a presence clause, so a check of something absent cannot pass before
 * the build. The render checks are the pure functions between the CHECKS markers below, so they
 * can be dry-run on a passing and a failing render verbatim.
 *
 * Needs the dev server on :3000 and a global WebSocket (NODE_OPTIONS=--experimental-websocket).
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { randomBytes } from 'crypto';

import { prisma } from '../src/lib/prisma';
import { installProviderTrap } from './helpers/provider-trap';
import { openHeadless, type Headless } from './helpers/headless';
import Moment1InputForm from '../src/components/plan/Moment1InputForm';
import HouseholdCardList from '../src/components/plan/HouseholdCardList';
import SetupOpeningScreen from '../src/components/plan/SetupOpeningScreen';

const realFetch = globalThis.fetch;
installProviderTrap();
const BASE = 'http://localhost:3000';
const ROOT = process.cwd();
const PORT = 9481;
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

const git = (args: string[]) => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
/** True when the file is the same as at HEAD (no staged or unstaged change). */
const unchanged = (rel: string) => git(['diff', '--quiet', 'HEAD', '--', rel]).status === 0;

// ── The ruled words, verbatim (GTC-384, plan rulings 2026-10-14) ─────────────
/** Q2: straight apostrophes and a hyphen, as the founder wrote it (the text stays GSM-7). */
const HANDOVER = "I've got Gather helping me put it together - I'll let Gather take it from here.";
const STEP1 = 'Are we all sorted?';
const STEP_TITLES_2_TO_5 = ['Dietary needs', 'Who Gather talks to', 'The message, shown', 'Ready'];
/** Item 63, ruled "your own 10 Oct words". */
const Q_NEW = 'Who should Gather talk to for the kids in this household?';
const Q_OLD = 'Who should Gather talk to for this household?';
/** GTC-363's W1, unchanged. */
const CONTACT_LINE =
  'Gather sends this person the asks for the household’s children, and tells them what the ' +
  'others in the household have been asked to bring. Adults with their own email or mobile ' +
  'still hear from Gather themselves.';
/** Q5, curly apostrophes in the app. */
const OWN_LINE =
  'Gather doesn’t message you about your own household: your children’s jobs are yours to sort. ' +
  'Anyone else in it with their own email or mobile hears from Gather themselves.';
const HEADING = 'Ducks in a row so far';
/** Q6: an em dash in the app, and the singular where it is one. */
const counted = (n: number, m: number) =>
  `${HEADING} — ${n} ${n === 1 ? 'person' : 'people'} in ${m} ${m === 1 ? 'household' : 'households'}`;
const BACK_TO_BOARD = '← Back to the board';
/** Q8: the "Write the list myself" button's outline (Moment2Opening.tsx). */
const OUTLINED = 'border-2 border-accent bg-white text-accent-dark';
const M1 = {
  does: 'Gets everyone who’s coming out of your head and into one list. Names, how to reach them, and who’s in each household.',
  done: 'You won’t need to remember who you’ve asked. I’ve got the list, and I’ll handle the invites and nudges from here.',
};
/** Q3: none of these may stay on /billing or /billing/upgrade. */
const YEARLY_WORDS = [
  '$69',
  'NZD / year',
  'NZD/year',
  'Annual Plan',
  'Gather Annual',
  'Upgrade to',
  'Upgrade Now',
  'Unlock unlimited events',
  'Unlimited events',
];

// ── CHECKS-START: the render checks, pure, dry-run verbatim before RED ───────
const CHECKS = {
  /** Q1 (63): the new question, its select, and the line directly under the select, darker. */
  Q1: (h: string) => {
    const q = h.indexOf(`>${Q_NEW}</label>`);
    const s = h.indexOf('</select>', q);
    const line = h.indexOf(`<p class="text-sm text-gray-600 mt-1">${CONTACT_LINE}</p>`);
    return q > 0 && s > q && line === s + '</select>'.length && !h.includes(Q_OLD);
  },
  /** Q2 (63): the host's own household form, rendered, shows no picker at all. */
  Q2: (h: string) =>
    h.includes('Anyone else in') &&
    !h.includes('Who should Gather talk to') &&
    !h.includes('id="household-channel"'),
  /** S1 (55): the own household's form carries the line and not the switch's words. */
  S1: (h: string) =>
    h.includes(`>${OWN_LINE}</p>`) &&
    !h.includes('Message me about my own household') &&
    !h.includes('you can choose') &&
    !h.includes('There’s nobody in your household'),
  /** S4 (55): a guest household's form: no switch, no line. */
  S4: (h: string) =>
    h.includes('Who’s coming to') && !h.includes(OWN_LINE) && !h.includes('Message me about'),
  /**
   * M1 (54): "What this does", "When it's done" directly under it, the button. Since GTC-394 tweak 2
   * the herd-of-cats line and the strip are gone from this screen and the Moment's name, big, heads
   * it: the title, then the two lines, then the button.
   */
  M1: (h: string) => {
    const title = h.indexOf('<h1');
    const does = h.indexOf('data-moment-words="1-does"');
    const done = h.indexOf('data-moment-words="1-done"');
    const button = h.indexOf('Ready to start herding');
    return (
      title >= 0 &&
      !h.includes('herd of cats') &&
      !h.includes('data-moment-strip') &&
      does > title &&
      done > does &&
      button > done &&
      h.split('data-moment-words="1-does"').length === 2 &&
      h.split('data-moment-words="1-done"').length === 2 &&
      h.includes(`${M1.does}</p></div><div data-moment-words="1-done"`) &&
      h.includes(M1.done) &&
      /data-moment-words="1-does" class="[^"]*max-w-xl/.test(h)
    );
  },
  /** M2 (54): a rendered Moment 1 form carries no Moment words. */
  M2: (h: string) => h.includes('id="m1-name"') && !h.includes('data-moment-words'),
  /** A1 (56): the line is a heading in the counter's style. */
  A1: (h: string, words: string) =>
    h.includes(`<h3 class="text-base font-semibold text-gray-800 mb-4">${words}</h3>`) &&
    !h.includes(`<p class="text-sm text-gray-500 mb-4">${words}</p>`),
  /** D (57): the column heading's words, as a host reads them. */
  D: (h: string, expected: string) => {
    const m = h.match(/<p class="text-sm font-medium text-gray-500 mb-3">([\s\S]*?)<\/p>/);
    return !!m && m[1].replace(/<!-- -->/g, '') === expected;
  },
  /** N1 to N3 (71): two outlined links to the board, the second after the last card. */
  N: (h: string, href: string, lastCardWords: string) => {
    const re = new RegExp(`<a href="${href}" class="([^"]*)">${BACK_TO_BOARD}</a>`, 'g');
    const found = [...h.matchAll(re)];
    const last = h.lastIndexOf(lastCardWords);
    return {
      two: found.length === 2,
      second: found.length === 2 && last > 0 && (found[1].index ?? 0) > last,
      outlined:
        found.length === 2 &&
        found.every((f) => f[1].includes(OUTLINED) && !/underline|text-gray-500/.test(f[1])),
    };
  },
};
// ── CHECKS-END ────────────────────────────────────────────────────────────────

/** Every file under a directory, relative to the repo. */
function filesUnder(rel: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(join(ROOT, dir))) {
      const p = `${dir}/${f}`;
      if (statSync(join(ROOT, p)).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(f)) out.push(p);
    }
  };
  walk(rel);
  return out;
}

// ══ IN MEMORY ═══════════════════════════════════════════════════════════════════
async function runInMemory() {
  // ── P — item 74, the price ─────────────────────────────────────────────────────
  const CHECKOUT = 'src/app/api/billing/checkout/route.ts';
  const checkout = codeOnly(read(CHECKOUT));
  assert(
    'P',
    'P1 the Stripe checkout charges 2500 in nzd, and 1200 is gone (Q1)',
    checkout.includes('unit_amount: 2500') &&
      checkout.includes("currency: 'nzd'") &&
      !/unit_amount:\s*1200\b/.test(checkout)
  );
  const planNew = read('src/app/plan/new/page.tsx');
  const demo = read('src/app/demo/page.tsx');
  const billing = read('src/app/billing/page.tsx');
  const upgrade = read('src/app/billing/upgrade/page.tsx');
  assert(
    'P',
    'P2 every price a person sees reads $25: New Event (two), billing (one); the demo page shows no price since GTC-394 tweak 3 (two buttons)',
    planNew.includes('pay $25 to get started') &&
      planNew.includes('Pay & Create — $25') &&
      demo.length > 0 &&
      !/\$\d/.test(demo) &&
      billing.includes('Pay per event — $25 NZD per event, no subscription')
  );
  const twelve = filesUnder('src/app')
    .concat(filesUnder('src/components'))
    .filter((f) => f !== 'src/app/api/events/route.ts' && /\$12\b/.test(read(f)));
  assert(
    'P',
    'P3 no "$12" left in any file under src/app or src/components (the GTC-280 incident comment in api/events/route.ts excepted by name)',
    twelve.length === 0,
    twelve.join(', ')
  );
  assert(
    'P',
    'P4 CONTROL: the checkout keeps its other lines (a one-off payment, her address, the two returns, the metadata), and the GTC-280 comments are left as they were',
    checkout.includes("mode: 'payment'") &&
      checkout.includes('customer_email: customerEmail') &&
      checkout.includes('success_url:') &&
      checkout.includes('cancel_url:') &&
      checkout.includes('metadata: {') &&
      read('src/app/api/events/route.ts').includes('paying $12 and typing a known') &&
      unchanged('tests/security-route-scan-control.ts') &&
      unchanged('tests/security-validation.ts')
  );
  const billingCode = codeOnly(billing);
  const upgradeCode = codeOnly(upgrade);
  const yearlyLeft = YEARLY_WORDS.filter((w) => billingCode.includes(w) || upgradeCode.includes(w));
  assert(
    'P',
    'P5 no $69 and no words selling the yearly plan on /billing or /billing/upgrade (Q3)',
    billingCode.length > 0 && upgradeCode.length > 0 && yearlyLeft.length === 0,
    yearlyLeft.join(', ')
  );
  assert(
    'P',
    'P6 CONTROL: /billing keeps what is true: the trial line without its price, the free plan, Update Payment Method, Cancel Subscription',
    billingCode.includes('remaining in your trial') &&
      billingCode.includes('Your trial ends today') &&
      billingCode.includes('Free Plan') &&
      billingCode.includes('Update Payment Method') &&
      billingCode.includes('Cancel Subscription')
  );
  assert(
    'P',
    'P7 /billing/upgrade: its button went with its words; what is left is the way back, "← Go back"',
    upgradeCode.includes('← Go back') &&
      upgradeCode.includes('router.back()') &&
      !upgradeCode.includes('/api/billing/checkout') &&
      !upgradeCode.includes('Secure checkout')
  );

  // ── T — item 62, step 1's title ───────────────────────────────────────────────
  const NC = await load('../src/lib/preflight/next-check');
  assert(
    'T',
    `T1 step 1's title is "${STEP1}"`,
    ok(() => NC.PREFLIGHT_STEP_TITLES[0] === STEP1)
  );
  assert(
    'T',
    `T2 the line under Send names it: "Go to step 1: ${STEP1} ↑"`,
    ok(() => NC.goToStepLine(1) === `Go to step 1: ${STEP1} ↑`)
  );
  assert(
    'T',
    'T3 CONTROL: titles 2 to 5 unchanged, five in all',
    ok(
      () =>
        NC.PREFLIGHT_STEP_TITLES.length === 5 &&
        STEP_TITLES_2_TO_5.every((t, i) => NC.PREFLIGHT_STEP_TITLES[i + 1] === t)
    )
  );

  // ── H — item 65, the handover ─────────────────────────────────────────────────
  const AR = await load('../src/lib/messages/ask-register');
  assert(
    'H',
    'H1 the handover is his line exactly (Q2)',
    ok(() => AR.askHandover() === HANDOVER)
  );
  assert(
    'H',
    'H2 it names Gather twice and stays GSM-7: straight apostrophes, a hyphen, no curly quote or dash',
    ok(
      () =>
        AR.askHandover().split('Gather').length === 3 &&
        !/[‘’“”—–]/.test(AR.askHandover()) &&
        AR.askHandover().includes("I'll let Gather")
    )
  );
  const askText = (() => {
    try {
      return AR.composeAsk({
        event: {
          name: 'Boxing Day',
          startDate: new Date('2026-12-26T00:00:00.000Z'),
          venueName: null,
          occasionDescription: null,
        },
        hostName: 'Kate Look',
        recipient: {
          firstName: 'Josie',
          itemNames: ['Pavlova'],
          jobNames: [],
          carried: [],
          household: [],
          link: 'https://gather.test/p/tok384',
        },
        storedAuthorLine: null,
      }).text as string;
    } catch {
      return '';
    }
  })();
  assert(
    'H',
    'H3 the composed ask carries it, then Gather in its own voice',
    askText.includes(`${HANDOVER}`) &&
      askText.indexOf(HANDOVER) < askText.indexOf('Hi - Gather here, helping Kate')
  );

  // ── The forms, rendered ───────────────────────────────────────────────────────
  const CANDIDATES = [
    { personEventId: 'pe-ross', name: 'Ross', householdId: 'h-other', householdName: 'Moana' },
  ];
  const renderForm = (props: Record<string, unknown>) =>
    render(
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
  const ownForm = renderForm({
    editingHousehold: {
      id: 'h-kate',
      primaryContact: { name: 'Kate', email: 'kate@example.com' },
      partner: { name: 'Dan', email: 'dan@example.com' },
      helpers: [],
      littleCount: 0,
      guests: [],
      isHostHousehold: true,
      messagesMuted: null,
    },
  });
  const hostFirst = renderForm({
    hostMode: { name: 'Kate', email: 'kate@example.com', phone: null },
    onSaveHostHousehold: async () => {},
    channelCandidates: [],
  });

  // ── Q — item 63 ───────────────────────────────────────────────────────────────
  assert(
    'Q',
    `Q1 Moment 1, a guest household: "${Q_NEW}", its select, and the line directly under it in text-sm text-gray-600`,
    CHECKS.Q1(guestForm)
  );
  assert(
    'Q',
    'Q2 Moment 1, the host’s own household opened from the list: no picker at all (Q4)',
    CHECKS.Q2(ownForm)
  );
  assert(
    'Q',
    'Q3 CONTROL: the host’s first step shows no picker either (unchanged)',
    hostFirst.replace(/<!-- -->/g, '').includes('First — you’re at Boxing Day too.') &&
      !hostFirst.includes('Who should Gather talk to')
  );
  const PRE = 'src/app/plan/[eventId]/pre-flight/page.tsx';
  const pre = codeOnly(read(PRE));
  const preQ = pre.indexOf(`${Q_NEW}`);
  const guardAt = pre.lastIndexOf('{!h.isHostHousehold && (', preQ);
  const preSelectEnd = pre.indexOf('</select>', preQ);
  const preLine = pre.indexOf(
    '<p className="text-sm text-gray-600 -mt-2 mb-3">{HOUSEHOLD_CONTACT_LINE}</p>',
    preSelectEnd
  );
  assert(
    'Q',
    'Q4 the pre-flight: the new question, its select and the darker line all inside one {!h.isHostHousehold && (…)} (Q4)',
    preQ > 0 &&
      guardAt > 0 &&
      preQ - guardAt < 200 &&
      preSelectEnd > preQ &&
      preLine > preSelectEnd &&
      preLine - preSelectEnd < 80
  );
  assert(
    'Q',
    'Q5 the old question is gone from both screens',
    pre.length > 0 &&
      !pre.includes(Q_OLD) &&
      !codeOnly(read('src/components/plan/Moment1InputForm.tsx')).includes(Q_OLD)
  );
  const CL = await load('../src/lib/households/contact-line');
  assert(
    'Q',
    'Q6 CONTROL: the line’s words are unchanged',
    ok(() => CL.HOUSEHOLD_CONTACT_LINE === CONTACT_LINE)
  );

  // ── S — item 55 ───────────────────────────────────────────────────────────────
  const FORM = codeOnly(read('src/components/plan/Moment1InputForm.tsx'));
  assert(
    'S',
    'S1 the host’s own household (a partner named): the line in the switch’s place, and no switch',
    CHECKS.S1(ownForm) && !/setMessagesMuted\(!e\.target\.checked\)/.test(FORM)
  );
  assert(
    'S',
    'S2 her first step, a household of one: the same line, and no "you can choose"',
    CHECKS.S1(hostFirst)
  );
  assert(
    'S',
    'S3 CONTROL: nothing stored changes: the form sends messagesMuted exactly as before, and the resolver is untouched',
    FORM.includes('if (isHostHouseholdForm) payload.messagesMuted = messagesMuted;') &&
      FORM.includes('messagesMuted: hostingAlone ? true : messagesMuted,') &&
      unchanged('src/lib/households/channel.ts') &&
      unchanged('src/lib/eligibility/channel-chooser.ts') &&
      unchanged('prisma/schema.prisma')
  );
  assert(
    'S',
    'S4 CONTROL: a guest household’s form has no switch and no line',
    CHECKS.S4(guestForm)
  );
  assert(
    'S',
    'S5 the line is held once, in the contact-line module, as ruled',
    ok(() => CL.OWN_HOUSEHOLD_LINE === OWN_LINE)
  );

  // ── M — item 54 ───────────────────────────────────────────────────────────────
  const opening = render(
    createElement(SetupOpeningScreen as any, { onStart: () => {}, doors: {} })
  );
  assert(
    'M',
    'M1 Moment 1’s opening screen: its title, "What this does", "When it’s done" directly under it (max-w-xl), then the button; once each; no herd line, no strip (GTC-394 tweak 2)',
    CHECKS.M1(opening)
  );
  assert(
    'M',
    'M2 Moment 1’s form, both steps, carries no Moment words (moved, not copied)',
    CHECKS.M2(guestForm) && CHECKS.M2(hostFirst)
  );
  const MW = await load('../src/lib/moments/moment-words');
  assert(
    'M',
    'M4 CONTROL: Moment 1’s two lines are unchanged',
    ok(() => MW.MOMENT_WORDS[1].does === M1.does && MW.MOMENT_WORDS[1].done === M1.done)
  );

  // ── A — item 56 ───────────────────────────────────────────────────────────────
  assert(
    'A',
    'A1 "Anyone else in this household?" (guest) and "…your household?" (her first step) are headings in text-base font-semibold text-gray-800',
    CHECKS.A1(guestForm, 'Anyone else in this household?') &&
      CHECKS.A1(hostFirst, 'Anyone else in your household?')
  );

  // ── D — item 57 ───────────────────────────────────────────────────────────────
  const column = (props: Record<string, unknown>) =>
    render(createElement(HouseholdCardList as any, { onEdit: () => {}, ...props }));
  const kate = {
    id: 'hk',
    primaryContact: { name: 'Kate' },
    partner: { name: 'Dan' },
    helpers: [],
    littleCount: 0,
    guests: [],
    isHostHousehold: true,
  };
  const josie = {
    id: 'hj',
    primaryContact: { name: 'Josie' },
    partner: { name: 'Ross' },
    helpers: [],
    littleCount: 2,
    guests: [],
  };
  const gus = {
    id: 'hg',
    primaryContact: { name: 'Gus' },
    helpers: [],
    littleCount: 0,
    guests: [],
  };
  assert(
    'D',
    `D1 three households, seven people: "${counted(7, 3)}"`,
    CHECKS.D(column({ households: [kate, josie, gus] }), counted(7, 3))
  );
  assert(
    'D',
    `D2 one household of one: "${counted(1, 1)}"`,
    CHECKS.D(column({ households: [gus] }), counted(1, 1))
  );
  assert(
    'D',
    'D3 CONTROL: nothing saved yet (her first step, only a typed card): the heading alone',
    CHECKS.D(column({ households: [], draft: gus }), HEADING)
  );
  const big = {
    id: 'hb',
    primaryContact: { name: 'Mere' },
    partner: { name: 'Hone' },
    helpers: [{ name: 'Aroha' }],
    littleCount: 1,
    guests: [{ name: 'Wiremu' }, { name: 'Tia' }],
  };
  // The setup page's sum, worked out here on its own: 1 + partner + helpers + littleCount + guests.
  const sum = [big, gus].reduce(
    (s, h: any) => s + 1 + (h.partner ? 1 : 0) + h.helpers.length + h.littleCount + h.guests.length,
    0
  );
  assert(
    'D',
    `D4 the count is the "N people added." sum: helpers, kids without jobs and guests counted (${sum} in 2)`,
    sum === 7 && CHECKS.D(column({ households: [big, gus] }), counted(7, 2))
  );
  assert(
    'D',
    'D5 an unsaved household is not counted: a saved one being changed counts as saved',
    CHECKS.D(
      column({
        households: [gus],
        editingHouseholdId: 'hg',
        draft: { ...gus, partner: { name: 'Tane' } },
      }),
      counted(1, 1)
    )
  );

  // ── N — item 71 ───────────────────────────────────────────────────────────────
  const after = await load('../src/components/preflight/AfterThePress');
  const person = (id: string, name: string, role: string) => ({
    personEventId: id,
    personId: `p-${id}`,
    name,
    email: null,
    phone: null,
    householdRole: role,
    isYoungPerson: false,
    messageable: true,
    markable: true,
    nudgeMark: null,
  });
  const chaseView = render(
    after?.AfterThePressView
      ? createElement(after.AfterThePressView, {
          eventId: 'e1',
          eventName: 'Boxing Day',
          sentAt: new Date('2026-12-01T00:00:00Z').toISOString(),
          pace: null,
          households: [
            {
              id: 'hh-m',
              label: 'Mere Parata',
              littleCount: 0,
              contactPersonEventId: null,
              resolvedContactPersonEventId: 'pe-mere',
              members: [person('pe-mere', 'Mere Parata', 'PRIMARY_CONTACT')],
            },
          ],
          unhoused: [person('pe-olly', 'Olly Solo', 'GUEST')],
          chase: null,
          saving: false,
          error: null,
          onMark: () => {},
          onException: () => {},
          onDefault: () => {},
        })
      : null
  );
  const n = CHECKS.N(chaseView, '/plan/e1/glance', 'Olly Solo');
  assert('N', `N1 "Who I nudge" has "${BACK_TO_BOARD}" twice, both to the board`, n.two);
  assert('N', 'N2 the second sits after the last card ("Not in a household")', n.second);
  assert(
    'N',
    'N3 both are outlined like "Write the list myself", neither the old small grey underlined link',
    n.outlined
  );
  assert(
    'N',
    'N4 CONTROL: Moment 3’s own "Back to the board" is untouched (Moment3AssignView.tsx as at HEAD)',
    unchanged('src/components/plan/Moment3AssignView.tsx')
  );

  // ── Z — the edges ─────────────────────────────────────────────────────────────
  const routesNow = filesUnder('src/app/api').filter((f) => f.endsWith('/route.ts')).length;
  const routesHead = git(['ls-tree', '-r', '--name-only', 'HEAD', 'src/app/api'])
    .stdout.split('\n')
    .filter((f) => f.endsWith('/route.ts')).length;
  assert(
    'Z',
    'Z1 CONTROL: no new route and no migration: route.ts files as at HEAD, prisma/ and route-classifications.json untouched',
    routesNow > 0 &&
      routesNow === routesHead &&
      unchanged('prisma') &&
      unchanged('route-classifications.json')
  );
  assert(
    'Z',
    'Z2 CONTROL: MomentArc is untouched (Q7), and so is every tests/security-* file',
    unchanged('src/components/plan/MomentArc.tsx') &&
      git(['diff', '--quiet', 'HEAD', '--', 'tests/security-*']).status === 0
  );
}

// ══ LIVE — the dev server, in the walled-off headless Chrome ════════════════════
const created = {
  users: [] as string[],
  people: [] as string[],
  events: [] as string[],
};

async function runLive() {
  const up = await realFetch(`${BASE}/`)
    .then((r) => r.status > 0)
    .catch(() => false);
  assert('C', 'C0 PRECONDITION: the dev server answers on :3000', up);
  if (!up) return;

  const totals = async () => ({
    invite: await prisma.inviteEvent.count(),
    outbound: await prisma.outboundMessage.count(),
  });
  const before = await totals();

  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const mail = (l: string) => `gtc384-${l}-${stamp}@example.com`;
  const user = await prisma.user.create({ data: { email: mail('kate') } });
  created.users.push(user.id);
  const kate = await prisma.person.create({
    data: { name: 'Kate B14', email: user.email, userId: user.id },
  });
  created.people.push(kate.id);
  const token = randomBytes(32).toString('hex');
  await prisma.session.create({
    data: { userId: user.id, token, expiresAt: new Date(Date.now() + 3600e3) },
  });
  const start = new Date(Date.now() + 20 * 864e5);
  const mkEvent = async (name: string) => {
    const ev = await prisma.event.create({
      data: { name, startDate: start, endDate: start, hostId: kate.id, status: 'DRAFT' } as any,
    });
    created.events.push(ev.id);
    await prisma.eventRole.create({ data: { eventId: ev.id, userId: user.id, role: 'HOST' } });
    return ev;
  };
  let n = 0;
  const addHousehold = async (eventId: string, names: string[], host = false) => {
    const h = await prisma.household.create({ data: { eventId } });
    for (const [i, nm] of names.entries()) {
      const isHost = host && i === 0;
      const p = isHost
        ? kate
        : await prisma.person.create({
            data: { name: nm, email: mail(`${nm.toLowerCase().replace(/\W/g, '')}-${n++}`) },
          });
      if (!isHost) created.people.push(p.id);
      await prisma.personEvent.create({
        data: {
          personId: p.id,
          eventId,
          role: isHost ? 'HOST' : 'PARTICIPANT',
          householdId: h.id,
          householdRole: i === 0 ? 'PRIMARY_CONTACT' : 'PARTNER',
        } as any,
      });
    }
  };
  // The opening: nothing saved. The pre-flight: her household and two more, a plan, approved, held.
  const evOpen = await mkEvent('GTC-384 b14 — opening');
  const evPre = await mkEvent('GTC-384 b14 — pre-flight');
  await addHousehold(evPre.id, ['Kate B14', 'Dan B14'], true);
  await addHousehold(evPre.id, ['Josie Walker', 'Ross Walker']);
  await addHousehold(evPre.id, ['Gus Tane']);
  await prisma.eventSetup.create({
    data: { eventId: evPre.id, eventType: 'Christmas', planApprovedAt: new Date() },
  });
  let order = 0;
  for (const [team, dishes] of [
    ['Mains', ['Glazed ham']],
    ['Dessert', ['Classic pavlova with cream']],
  ] as const) {
    const t = await prisma.team.create({
      data: {
        name: team,
        eventId: evPre.id,
        displayOrder: order++,
        source: 'GENERATED',
        coordinatorId: kate.id,
      } as any,
    });
    for (const d of dishes) {
      await prisma.item.create({
        data: {
          name: d,
          teamId: t.id,
          source: 'GENERATED',
          aiGenerated: true,
          quantityAmount: 2,
          quantityUnit: 'TRAYS',
          status: 'UNASSIGNED',
          displayOrder: 0,
        } as any,
      });
    }
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
      await prisma.accessToken.count({ where: evIn }),
      await prisma.outboundMessage.count({ where: evIn }),
      await prisma.inviteEvent.count({ where: evIn }),
    ].join(',');

  let chrome: Headless | null = null;
  let probes = { plan: '', send: '' };
  let blocked: string[] = [];
  let hosts: string[] = [];
  let dialogs: string[] = [];
  try {
    chrome = await openHeadless({ fetchImpl: realFetch, port: PORT });
    const c = chrome;
    await c.blockPlanMaking();
    await c.blockSends();
    await c.navigate('/', 3000);
    probes = {
      plan: await c.evaluate<string>(
        `fetch('/api/gtc384-probe/finalize-plan', { method: 'POST' }).then(r => 'reached ' + r.status).catch(() => 'failed')`
      ),
      send: await c.evaluate<string>(
        `fetch('/api/events/gtc384-probe/send', { method: 'POST' }).then(r => 'reached ' + r.status).catch(() => 'failed')`
      ),
    };
    assert(
      'C',
      'C1 PRECONDITION: both walls proven: a plan-making probe and a send probe fail in the browser',
      probes.plan === 'failed' && probes.send === 'failed',
      JSON.stringify(probes)
    );
    if (probes.plan !== 'failed' || probes.send !== 'failed') return;
    await c.setSessionCookie(token);

    for (const [tag, w, h, mobile] of [
      ['1280', 1280, 800, false],
      ['390', 390, 844, true],
    ] as const) {
      await c.setViewport(w, h, mobile);

      // ── M3 — the herd-of-cats screen, measured, nothing pressed ─────────────────
      await c.navigate(`/plan/${evOpen.id}/setup`, 6000);
      const m3 = await c.evaluate<any>(`(() => {
        const btn = [...document.querySelectorAll('button')].find((b) => b.innerText.includes('Ready to start herding'));
        const box = btn && btn.closest('.fixed');
        const does = document.querySelector('[data-moment-words="1-does"]');
        const done = document.querySelector('[data-moment-words="1-done"]');
        const out = [...document.querySelectorAll('a')].find((a) => a.innerText.trim() === '← Your events');
        // GTC-394 tweak 2: the screen's first line is its title now; the herd-of-cats line is gone.
        const line = box && box.querySelector('h1');
        if (!btn || !box || !does || !done || !out || !line) return { found: false };
        box.scrollTo(0, 0);
        const boxTop = box.getBoundingClientRect().top;
        const o = out.getBoundingClientRect();
        const l = line.getBoundingClientRect();
        const align = getComputedStyle(does.querySelector('p:last-child')).textAlign;
        box.scrollTo(0, box.scrollHeight);
        const b = btn.getBoundingClientRect();
        const r = { found: true, apart: o.bottom <= l.top, lineShown: l.top >= boxTop - 0.5,
          align, buttonShown: b.top >= boxTop - 0.5 && b.bottom <= innerHeight + 0.5,
          wide: document.documentElement.scrollWidth <= innerWidth,
          o: [Math.round(o.top), Math.round(o.bottom)], l: Math.round(l.top), boxTop: Math.round(boxTop),
          b: [Math.round(b.top), Math.round(b.bottom)], h: innerHeight };
        box.scrollTo(0, 0);
        return r;
      })()`);
      assert(
        'C',
        `M3 ${tag}: Moment 1’s opening screen carries Moment 1’s two lines, left-aligned; "← Your events" never sits on its title, the title is not cut off at the top, and the button can be scrolled to (GTC-394 tweak 2)`,
        !!m3?.found &&
          m3.apart &&
          m3.lineShown &&
          (m3.align === 'left' || m3.align === 'start') &&
          m3.buttonShown &&
          m3.wide,
        JSON.stringify(m3)
      );

      // ── B — the pre-flight's strip, measured ───────────────────────────────────
      await c.navigate(`/plan/${evPre.id}/pre-flight`, 8000);
      const b = await c.evaluate<any>(`(() => {
        const strip = document.querySelector('[data-moment-strip]');
        const back = [...document.querySelectorAll('a')].find((a) => a.innerText.trim().startsWith('← Back to'));
        if (!strip || !back) return { found: false };
        const wrap = strip.parentElement;
        const next = wrap.nextElementSibling;
        const cells = [...strip.firstElementChild.children];
        const labels = cells.map((c) => c.children[1]);
        const lh = labels.map((s) => parseFloat(getComputedStyle(s).lineHeight));
        const hs = labels.map((s) => s.getBoundingClientRect().height);
        const w = wrap.getBoundingClientRect();
        return { found: cells.length === 4 && !!next,
          oneLine: hs.every((x, i) => x < 1.5 * lh[i]), hs: hs.map(Math.round),
          above: w.top - back.getBoundingClientRect().bottom,
          below: next ? next.getBoundingClientRect().top - w.bottom : -1,
          wide: document.documentElement.scrollWidth <= innerWidth && strip.getBoundingClientRect().right <= innerWidth };
      })()`);
      if (tag === '1280') {
        assert(
          'C',
          'B1 1280: on the pre-flight each Moment’s label and its ✓ sit on one line (more room for the strip, Q7)',
          !!b?.found && b.oneLine,
          JSON.stringify(b)
        );
      }
      assert(
        'C',
        `B2 ${tag}: at least 24px between "← Back to …" and the strip, and 32px between the strip and the event’s name`,
        !!b?.found && b.above >= 23.5 && b.below >= 31.5,
        JSON.stringify(b)
      );
      assert(
        'C',
        `B3 ${tag} CONTROL: no sideways scroll, and the strip ends inside the screen`,
        !!b?.found && b.wide,
        JSON.stringify(b)
      );
    }
    blocked = c.planMakingBlocked();
    hosts = c.hostsRequested();
    dialogs = c.dialogs();
  } finally {
    chrome?.close();
  }

  assert(
    'K',
    'K1 CONTROL: Chrome asked only localhost:3000; nothing blocked but the two probes; no dialog',
    hosts.length > 0 &&
      hosts.every((x) => x === 'localhost:3000') &&
      blocked.length === 2 &&
      blocked.every((x) => /gtc384-probe/.test(x)) &&
      dialogs.length === 0,
    `${hosts.join(',')} | ${blocked.join(' | ')} | ${dialogs.join(',')}`
  );
  const whileExists = await rows();
  const ai = (
    await prisma.event.findMany({
      where: { id: { in: created.events } },
      select: { aiCallsUsed: true },
    })
  ).map((e) => e.aiCallsUsed);
  console.log(
    `    fixture while it existed (Event, EventSetup, EventRole, Household, PersonEvent, Person, User, Session, Team, Item, AccessToken, OutboundMessage, InviteEvent): ${whileExists}`
  );
  console.log(`    aiCallsUsed while it existed: ${ai.join(',')}`);
  await cleanup();
  const left = await rows();
  const after = await totals();
  assert(
    'K',
    'K2 CONTROL: aiCallsUsed 0 on both events while they exist, nothing queued on them; every fixture row removed by id; the InviteEvent and OutboundMessage totals as found',
    ai.length === 2 &&
      ai.every((x) => x === 0) &&
      whileExists.endsWith(',0,0') &&
      left === '0,0,0,0,0,0,0,0,0,0,0,0,0' &&
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
  // Every row below was made by this suite: its two events and what hangs off them, its people,
  // its user and that user's sessions.
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
