/**
 * GTC-368 — walkthrough batch 5, part 2: the event's name with its details, and what each Moment
 * does, in the founder's words.
 *
 * The founder walked the Moment flow himself and sorted what he found (GTC-189's Fourth ruling).
 * This suite pins batch 5's second half to the words he ruled (W10 to W15 at GTC-367's plan; W16 to
 * W19 at GTC-368's, with en-NZ's "Sept") and to the behaviour he chose (Q1 to Q15 as recommended):
 *
 *   17  the event's name on every screen of the flow, the board's whole top line included, and a
 *       tap on it opens its details (When, Where, Occasion, About; "Change these details"; "Close"),
 *       a native popover with a fallback for a browser that has none, so the tap is never dead (Q2)
 *   5   what each Moment does where it starts, and what done looks like where it finishes, in his
 *       words (Q10's A); on the board both behind a closed "What this does" (GTC-192's Ruling 1)
 *   and the false "Leave site?": Moment 1's form warns only when it differs from what it opened with
 *
 * The pure and render layers run in memory. The Chrome layer drives the dev server in the
 * walled-off headless Chrome, on fixtures of its own (example.com addresses, no phones; the sent
 * event written directly, with nothing queued), behind the three safeguards of
 * GATHER-BUILD-CONSTANTS.md ("Looking on screen") and the fourth wall: the browser fails every
 * plan-making request and every request to a door that sends before it leaves the page (both proven
 * on probe URLs first); every click is `clickGuarded`. Never pressed: Send, Generate, Regenerate,
 * Move on, New Event. A "leave site?" is answered by the browser wall (`answerLeaveDialogs`):
 * leaving writes nothing. C7 opens the old dashboard, which makes the fixture event's guest links;
 * they are counted with every other fixture row while they exist and removed by id. The
 * InviteEvent and OutboundMessage totals are asserted as found.
 *
 * Needs the dev server on :3000 and a global WebSocket (NODE_OPTIONS=--experimental-websocket).
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';

import { prisma } from '../src/lib/prisma';
import { installProviderTrap } from './helpers/provider-trap';
import { openHeadless, type Headless } from './helpers/headless';
import { ToastProvider } from '../src/contexts/ToastContext';
import SetupOpeningScreen from '../src/components/plan/SetupOpeningScreen';
import Moment1Summary from '../src/components/plan/Moment1Summary';
import Moment1InputForm from '../src/components/plan/Moment1InputForm';
import Moment2Opening from '../src/components/plan/Moment2Opening';
import Moment2PlanView from '../src/components/plan/Moment2PlanView';
import Moment3AssignView from '../src/components/plan/Moment3AssignView';

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

/** Markup as words: React's text separators dropped, entities read back. */
const words = (h: string) =>
  h
    .replace(/<!-- -->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

// ── The founder's words, verbatim (his paste of 2026-10-05, curly apostrophes: Q12) ──
const M = {
  1: {
    does: 'Gets everyone who’s coming out of your head and into one list. Names, how to reach them, and who’s in each household.',
    done: 'You won’t need to remember who you’ve asked. I’ve got the list, and I’ll handle the invites and nudges from here.', // GTC-378 W1
  },
  2: {
    does: 'Gets the plan out of your head and onto the page. Tell me about the event and any dietary needs, and I’ll draft the full list of what’s needed: food, drinks and everything else. You decide what stays.',
    done: 'You won’t need to worry you’ve forgotten something. The whole plan is in one place, it’s yours, and it’s ready to hand out.',
  },
  3: {
    does: 'Puts a name next to every job. You decide who’s on what, and I keep track of it all.',
    done: 'Every job has an owner, and you’re not carrying the plan anymore. I’ll ask each person and follow up, so you don’t have to.',
  },
  4: {
    does: 'Shows you where everything stands on one screen: who’s said yes, what’s covered, and what’s still open. I nudge anyone who hasn’t replied and flag anything that needs you.', // GTC-378 W2
    done: 'You stop wondering. Every job is confirmed, and you know your event is sorted.',
  },
} as const;
const W15_DOES = 'What this does';
const W15_DONE = 'When it’s done';
const W11 = ['When', 'Where', 'Occasion', 'About'];
const W13 = 'Close';
const W14 = 'Change these details';
const R1 = 'Thanks. You’ve done most of the hard work.';
const R2 = 'Let’s get this plan out of your head and onto the page.';
const M3_SENTENCE = "Now. Who's on what.";
const BOARD_TOP = 'Henderson family Christmas · 3 households · Answers by Fri 18 Dec';

const FACTS = {
  id: 'e1',
  name: 'Boxing Day',
  startDate: '2026-12-19T00:00:00.000Z',
  endDate: '2026-12-19T00:00:00.000Z',
  venueName: null,
  venueTimingStart: null,
  venueTimingEnd: null,
  occasionDescription: null,
  eventType: 'Christmas',
  eventTypeOther: null,
};
const PANEL_ID = 'event-details-e1';

/** Every `<button …>…</button>` in `html`, as [attributes, inner markup]. */
const buttons = (html: string) =>
  [...html.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)].map((m) => [m[1], m[2]] as const);
/** The name button for `id`: opens the panel (no "hide" action). */
const nameButton = (html: string, id = PANEL_ID) =>
  buttons(html).find(
    ([a]) =>
      a.toLowerCase().includes(`popovertarget="${id}"`) &&
      !a.toLowerCase().includes('popovertargetaction')
  );
/** The opening tag of the panel for `id`. */
const panelTag = (html: string, id = PANEL_ID) =>
  html.match(new RegExp(`<div[^>]*\\bid="${id}"[^>]*>`))?.[0] ?? '';

/** Send's element exactly as it stands at `1fcf643` — GTC-366 Q1: "Send stays exactly as it is." */
const SEND_AT_HEAD = `<button
            type="button"
            disabled={!allChecked || pressing || pressed !== null}
            onClick={press}
            className={\`w-full py-3 rounded-lg font-medium \${
              !allChecked || pressing || pressed !== null
                ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                : 'bg-gray-900 text-white hover:bg-gray-800'
            }\`}
          >
            {pressed !== null
              ? 'Sent'
              : pressing
                ? 'Sending…'
                : \`Send\${allChecked ? '' : ' — finish the five checks first'}\`}
          </button>`;

/** A person, as the glance payload shapes one (as tests/glance-grid-test.tsx builds them). */
let peCount = 0;
function person(over: Record<string, unknown> = {}): any {
  return {
    personEventId: `pe-${++peCount}`,
    personId: 'p',
    name: 'Someone',
    isHost: false,
    householdRole: 'GUEST',
    state: 'GREEN',
    reasons: ['ACCEPTED'],
    nextNudgeAt: null,
    items: [],
    ...over,
  };
}
const glanceFixture = {
  eventId: 'e1',
  hostPersonId: 'p-kate',
  asOf: new Date('2026-12-01T00:00:00Z').toISOString(),
  summary: { needYou: 0, withGather: 1, settled: 2 },
  households: [
    {
      householdId: 'hh-host',
      primaryContactName: 'Kate Whittaker',
      isHostHousehold: true,
      members: [
        person({ name: 'Kate Whittaker', isHost: true }),
        person({ name: 'Sam Whittaker', state: 'AMBER', reasons: ['AWAITING_REPLY'] }),
      ],
    },
    {
      householdId: 'hh-turner',
      primaryContactName: 'Charlotte Turner',
      isHostHousehold: false,
      members: [person({ name: 'Charlotte Turner' })],
    },
    {
      householdId: 'hh-dalton',
      primaryContactName: 'Ray Dalton',
      isHostHousehold: false,
      members: [person({ name: 'Ray Dalton', state: 'OUT', reasons: ['ATTENDANCE_NO'] })],
    },
  ],
  unhoused: [],
  unassignedCritical: [],
  unassignedOrdinaryCount: 0,
};

// ══ IN MEMORY ═══════════════════════════════════════════════════════════════════
async function runInMemory() {
  const MW = await load('../src/lib/moments/moment-words');
  const ED = await load('../src/components/shared/EventDetails');
  const CL = await load('../src/lib/ai/config-loader');

  // ── P — the words and the rules ───────────────────────────────────────────────
  assert(
    'P',
    'P1 the eight Moment lines are the founder’s, exactly, with curly apostrophes and no straight one',
    ok(() =>
      ([1, 2, 3, 4] as const).every(
        (n) =>
          MW.MOMENT_WORDS[n].does === M[n].does &&
          MW.MOMENT_WORDS[n].done === M[n].done &&
          !/'/.test(MW.MOMENT_WORDS[n].does + MW.MOMENT_WORDS[n].done)
      )
    )
  );
  assert(
    'P',
    'P2 W15: the headings are "What this does" and "When it’s done"',
    ok(() => MW.MOMENT_HEADINGS.DOES === W15_DOES && MW.MOMENT_HEADINGS.DONE === W15_DONE)
  );
  assert(
    'P',
    'P3 W11 "When", "Where", "Occasion", "About"; W13 "Close"; W14 "Change these details"',
    ok(
      () =>
        ED.DETAILS_WORDS.WHEN === W11[0] &&
        ED.DETAILS_WORDS.WHERE === W11[1] &&
        ED.DETAILS_WORDS.OCCASION === W11[2] &&
        ED.DETAILS_WORDS.ABOUT === W11[3] &&
        ED.DETAILS_WORDS.CLOSE === W13 &&
        ED.DETAILS_WORDS.CHANGE === W14
    )
  );
  const when = (a: string, b: string, t1?: string | null, t2?: string | null) => {
    try {
      return ED.whenLine(a, b, t1, t2) as string;
    } catch {
      return '';
    }
  };
  const D19 = '2026-12-19T00:00:00.000Z';
  assert('P', 'P4 W12 one day: "Sat 19 Dec 2026"', when(D19, D19) === 'Sat 19 Dec 2026');
  assert(
    'P',
    'P5 W12 two days in one year: "Fri 18 Dec to Sun 20 Dec 2026"',
    when('2026-12-18T00:00:00Z', '2026-12-20T00:00:00Z') === 'Fri 18 Dec to Sun 20 Dec 2026'
  );
  assert(
    'P',
    'P6 W12 one day with times, as she typed them: "Sat 19 Dec 2026, 12:00 to 16:00"',
    when(D19, D19, '12:00', '16:00') === 'Sat 19 Dec 2026, 12:00 to 16:00'
  );
  assert(
    'P',
    'P7 W16 two years: "Thu 31 Dec 2026 to Fri 1 Jan 2027", each date with its own year',
    when('2026-12-31T00:00:00Z', '2027-01-01T00:00:00Z') === 'Thu 31 Dec 2026 to Fri 1 Jan 2027'
  );
  assert(
    'P',
    'P8 W17 two days with times: "Fri 18 Dec to Sun 20 Dec 2026, 12:00 to 16:00"',
    when('2026-12-18T00:00:00Z', '2026-12-20T00:00:00Z', '12:00', '16:00') ===
      'Fri 18 Dec to Sun 20 Dec 2026, 12:00 to 16:00'
  );
  assert(
    'P',
    'P9 W18 one time only: "…, from 5:30pm" and "…, until 11:00pm"; a blank time is no time',
    when(D19, D19, '5:30pm', null) === 'Sat 19 Dec 2026, from 5:30pm' &&
      when(D19, D19, null, '11:00pm') === 'Sat 19 Dec 2026, until 11:00pm' &&
      when(D19, D19, '  ', '') === 'Sat 19 Dec 2026'
  );
  assert(
    'P',
    'P10 NZ time: 11:30 UTC on 31 Dec is "Fri 1 Jan 2027"; W19 September is "Tue 15 Sept 2026"; an end before the start shows the start alone',
    when('2026-12-31T11:30:00Z', '2026-12-31T11:30:00Z') === 'Fri 1 Jan 2027' &&
      when('2026-09-15T00:00:00Z', '2026-09-15T00:00:00Z') === 'Tue 15 Sept 2026' &&
      when('2026-12-20T00:00:00Z', '2026-12-18T00:00:00Z') === 'Sun 20 Dec 2026' &&
      ok(
        () =>
          ED.MONTHS.join(' ') === 'Jan Feb Mar Apr May Jun Jul Aug Sept Oct Nov Dec' &&
          ED.WEEKDAYS.join(' ') === 'Sun Mon Tue Wed Thu Fri Sat'
      )
  );
  const rows = (f: Record<string, unknown>) => {
    try {
      return (ED.detailRows({ ...FACTS, ...f }) as Array<{ label: string; value: string }>)
        .map((r) => `${r.label}=${r.value}`)
        .join('|');
    } catch {
      return 'threw';
    }
  };
  assert(
    'P',
    'P11 the rows: only those set, in the order When, Where, Occasion, About; a blank string is not set',
    rows({}) === 'When=Sat 19 Dec 2026|Occasion=Christmas' &&
      rows({
        venueName: 'Kate’s place',
        occasionDescription: 'Lunch in the garden.',
        venueTimingStart: '12:00',
        venueTimingEnd: '16:00',
      }) ===
        'When=Sat 19 Dec 2026, 12:00 to 16:00|Where=Kate’s place|Occasion=Christmas|About=Lunch in the garden.' &&
      rows({ venueName: '  ', occasionDescription: '', eventType: null }) ===
        'When=Sat 19 Dec 2026',
    rows({})
  );
  const occ = (t: string | null, o: string | null) => {
    try {
      return ED.occasionLabel(t, o) as string | null;
    } catch {
      return 'threw';
    }
  };
  assert(
    'P',
    'P12 the occasion: an old "BBQ" reads "Casual BBQ"; "Other" reads what she typed; "Other" with nothing typed (or the placeholder "Custom event") and none at all show no row (Q6); the legacy map is the questions’ own',
    occ('BBQ', null) === 'Casual BBQ' &&
      occ('Kids party', null) === 'Birthday (Kids)' &&
      occ('Farewell', null) === 'Farewell' &&
      occ('Other', 'Nana’s 90th') === 'Nana’s 90th' &&
      occ('Other', '') === null &&
      occ('Other', 'Custom event') === null &&
      occ(null, null) === null &&
      ok(
        () =>
          JSON.stringify(ED.LEGACY_EVENT_TYPE_LABELS) === JSON.stringify(CL.LEGACY_EVENT_TYPE_MAP)
      )
  );

  // ── R — the renders ───────────────────────────────────────────────────────────
  const detailsHtml = ED?.default ? render(createElement(ED.default, { facts: FACTS })) : '';
  const nb = nameButton(detailsHtml);
  assert(
    'R',
    'R1 the name button (W10): opens the panel by its id, reads "Boxing Day ▾", the ▾ hidden from a screen reader',
    !!nb &&
      words(nb[1]) === 'Boxing Day ▾' &&
      /<span[^>]*aria-hidden="true"[^>]*>▾<\/span>/.test(nb[1]),
    nb ? words(nb[1]) : 'no button'
  );
  const closeBtn = buttons(detailsHtml).find(
    ([a]) =>
      a.toLowerCase().includes(`popovertarget="${PANEL_ID}"`) &&
      a.toLowerCase().includes('popovertargetaction="hide"')
  );
  assert(
    'R',
    'R2 the panel: popover="auto", its id from the event’s id, the rows, W14 to /plan/[id], W13 hides it',
    /popover="auto"/.test(panelTag(detailsHtml)) &&
      detailsHtml.includes('>When<') &&
      detailsHtml.includes('>Sat 19 Dec 2026<') &&
      detailsHtml.includes('>Occasion<') &&
      !detailsHtml.includes('>Where<') &&
      /<a[^>]*href="\/plan\/e1"[^>]*>Change these details<\/a>/.test(detailsHtml) &&
      !!closeBtn &&
      words(closeBtn[1]) === W13
  );
  const panelClass = panelTag(detailsHtml).match(/class="([^"]*)"/)?.[1] ?? '';
  const tokens = panelClass.split(/\s+/);
  assert(
    'R',
    'R3 the panel shows only while open: hidden, with no display class but under :popover-open or [data-open]; no % in the details’ markup',
    tokens.includes('hidden') &&
      !tokens.some((t) => /^(block|flex|grid|inline|inline-block|inline-flex|table)$/.test(t)) &&
      tokens.some((t) => t.includes(':popover-open]:')) &&
      tokens.some((t) => t.startsWith('data-[open]:')) &&
      detailsHtml.length > 0 &&
      !detailsHtml.includes('%'),
    panelClass
  );
  const edSrc = read('src/components/shared/EventDetails.tsx');
  const edCode = codeOnly(edSrc);
  assert(
    'R',
    'R4 the details file: a client file with no hook, no fetch and no random id',
    edSrc.length > 0 &&
      /^'use client';/.test(edSrc.trim()) &&
      !/\buse[A-Z]\w*\(/.test(edCode) &&
      !/\bfetch\(/.test(edCode) &&
      !/Math\.random|Date\.now/.test(edCode)
  );

  const opening = render(
    createElement(SetupOpeningScreen as any, { onStart: () => {}, details: FACTS })
  );
  assert('R', 'R5 the opening screen renders W10', !!nameButton(opening));

  const households = [
    {
      id: 'h0',
      primaryContact: { name: 'Kate', email: 'k@example.com' },
      helpers: [],
      littleCount: 0,
      guests: [],
      isHostHousehold: true,
    },
    {
      id: 'h1',
      primaryContact: { name: 'Josie', email: 'j@example.com' },
      partner: { name: 'Ross', email: 'r@example.com' },
      helpers: [],
      littleCount: 0,
      guests: [],
    },
  ];
  const summary = render(
    createElement(Moment1Summary as any, {
      eventId: 'e1',
      eventName: 'Boxing Day',
      households,
      onContinue: () => {},
      onBackToEditing: () => {},
      details: FACTS,
    })
  );
  assert(
    'R',
    // [[GTC-378]] ruling (item 39): Moment 1's "When it’s done" moved to the form, under "What this does".
    'R6 Moment 1’s summary: W10, R1 gone, and no "When it’s done" (moved to the form, GTC-378)',
    !!nameButton(summary) &&
      !summary.includes(W15_DONE) &&
      !summary.includes(M[1].done) &&
      !summary.includes(R1)
  );
  const m2open = render(
    createElement(Moment2Opening as any, {
      eventName: 'Boxing Day',
      onStart: () => {},
      onBack: () => {},
      details: FACTS,
    })
  );
  assert(
    'R',
    'R7 Moment 2’s opening: W10, "What this does" with Moment 2’s line, "When it’s done" directly under it (GTC-378), and R2 gone',
    !!nameButton(m2open) &&
      m2open.includes(W15_DOES) &&
      m2open.includes(M[2].does) &&
      m2open.includes(M[2].done) &&
      m2open.includes(`${M[2].does}</p></div><div data-moment-words="2-done"`) &&
      !m2open.includes(R2)
  );
  const planProps = {
    eventId: 'e1',
    eventName: 'Boxing Day',
    guestCount: 10,
    categories: [],
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
  const planView = render(
    createElement(
      ToastProvider as any,
      null,
      createElement(Moment2PlanView as any, { ...planProps, details: FACTS })
    )
  );
  const addAt = planView.indexOf('+ Add category');
  assert(
    'R',
    // [[GTC-378]] ruling 5 (item 45): Moment 2's "When it’s done" is on its opening only.
    'R8 the plan view: W10, "+ Add category", and no "When it’s done" (on the opening only, GTC-378)',
    !!nameButton(planView) &&
      addAt > 0 &&
      !planView.includes(M[2].done) &&
      !planView.includes(W15_DONE)
  );
  const formProps = {
    eventId: 'e1',
    eventName: 'Boxing Day',
    onComplete: () => {},
    onAddPerson: async () => {},
    channelCandidates: [],
  };
  const guestForm = render(createElement(Moment1InputForm as any, formProps));
  const hostForm = render(
    createElement(Moment1InputForm as any, {
      ...formProps,
      hostMode: { name: 'Kate', email: 'kate@example.com', phone: null },
      onSaveHostHousehold: async () => {},
    })
  );
  assert(
    'R',
    'R9 Moment 1’s form, both steps: "What this does" with Moment 1’s line, "When it’s done" directly under it (GTC-378), both before her line',
    [guestForm, hostForm].every(
      (h) =>
        h.includes(W15_DOES) &&
        h.includes(M[1].does) &&
        h.includes(M[1].done) &&
        h.includes(`${M[1].does}</p></div><div data-moment-words="1-done"`) &&
        h.indexOf(M[1].done) <
          Math.max(h.indexOf('Who’s coming to'), h.indexOf('First — you’re at'))
    )
  );
  const m3 = render(
    createElement(
      ToastProvider as any,
      null,
      createElement(Moment3AssignView as any, {
        eventId: 'e1',
        event: { id: 'e1', status: 'DRAFT', sentAt: null, endDate: FACTS.endDate },
        hostPersonId: 'p-kate',
        headcount: 4,
        categories: [],
        initialHolders: {},
        households: [],
        askForReason: async () => ({ proceed: true }),
        askForBatchReason: async () => ({ proceed: true }),
        onBack: () => {},
        onMoveOn: () => {},
        details: FACTS,
      })
    )
  );
  const m3At = m3.indexOf(M3_SENTENCE.replace(/'/g, '&#x27;'));
  assert(
    'R',
    'R10 Moment 3: W10, "What this does" with Moment 3’s line, "When it’s done" directly under it (GTC-378), before "Now. Who’s on what."',
    !!nameButton(m3) &&
      m3At > 0 &&
      m3.indexOf(M[3].does) > 0 &&
      m3.includes(`${M[3].does}</p></div><div data-moment-words="3-done"`) &&
      m3.indexOf(M[3].done) > 0 &&
      m3.indexOf(M[3].done) < m3At
  );
  const after = await load('../src/components/preflight/AfterThePress');
  const chaseProps = {
    eventId: 'e1',
    eventName: 'Boxing Day',
    sentAt: new Date('2026-12-01T00:00:00Z').toISOString(),
    pace: null,
    households: [],
    unhoused: [],
    chase: null,
    saving: false,
    error: null,
    onMark: () => {},
    onException: () => {},
    onDefault: () => {},
  };
  const chase = after?.AfterThePressView
    ? render(createElement(after.AfterThePressView, { ...chaseProps, details: FACTS }))
    : '';
  assert(
    'R',
    'R11 "Who I nudge": W10 in the small name line’s place',
    !!nameButton(chase) && !chase.includes('<p class="text-sm text-gray-400 mb-1">Boxing Day</p>')
  );

  const GB = await load('../src/components/glance/GlanceBoard');
  const board = (props: Record<string, unknown>) => {
    try {
      return renderToStaticMarkup(
        createElement(GB.default, {
          glance: glanceFixture,
          eventName: 'Henderson family Christmas',
          actorRole: 'HOST',
          eventDate: 'Friday 25 December',
          stickyReversals: [],
          now: new Date('2026-12-01T00:00:00Z'),
          answersBy: 'Fri 18 Dec',
          ...props,
        })
      );
    } catch (err) {
      console.error(`  the board threw: ${String((err as Error).message).split('\n')[0]}`);
      return '';
    }
  };
  const boardFacts = { ...FACTS, name: 'Henderson family Christmas' };
  const withDetails = board({ details: boardFacts });
  const without = board({});
  const topBtn = nameButton(withDetails);
  const lastDoor = Math.max(
    withDetails.indexOf('data-print-door'),
    withDetails.indexOf('data-back-room-door')
  );
  assert(
    'R',
    'R12 the board: the whole top line is the button — R8a’s words, then ▾ — and the panel comes after the doors',
    !!topBtn &&
      words(topBtn[1]) === `${BOARD_TOP} ▾` &&
      withDetails
        .replace(/<!-- -->/g, '')
        .replace(/<[^>]+>/g, '\n')
        .includes(BOARD_TOP) &&
      lastDoor > 0 &&
      withDetails.indexOf(`id="${PANEL_ID}"`) > lastDoor,
    topBtn ? words(topBtn[1]) : 'no button'
  );
  const wordsEl = withDetails.match(/<details([^>]*data-moment-words[^>]*)>([\s\S]*?)<\/details>/);
  assert(
    'R',
    'R13 the board: a closed "What this does" before "What the colours mean", holding Moment 4’s two lines under "When it’s done"',
    !!wordsEl &&
      !/\bopen\b/.test(wordsEl[1]) &&
      /<summary[^>]*>What this does<\/summary>/.test(wordsEl[2]) &&
      wordsEl[2].includes(M[4].does) &&
      wordsEl[2].includes(W15_DONE) &&
      wordsEl[2].indexOf(M[4].done) > wordsEl[2].indexOf(W15_DONE) &&
      withDetails.indexOf('data-moment-words') < withDetails.indexOf('data-colour-key')
  );
  assert(
    'R',
    'R14 CONTROL: the board with no details is as it was — the top line a <p> with R8a’s words, no popover',
    /<p class="m-0 text-\[13px\] text-\[#888780\]">/.test(without) &&
      words(without).includes(BOARD_TOP) &&
      !/popovertarget/i.test(without)
  );

  // ── K — controls ──────────────────────────────────────────────────────────────
  const summaryNoDetails = render(
    createElement(Moment1Summary as any, {
      eventId: 'e1',
      eventName: 'Boxing Day',
      households,
      onContinue: () => {},
      onBackToEditing: () => {},
    })
  );
  const planNoDetails = render(
    createElement(ToastProvider as any, null, createElement(Moment2PlanView as any, planProps))
  );
  assert(
    'K',
    'K1 CONTROL: the four sentences that name the event are as they were',
    words(guestForm).includes('Who’s coming to Boxing Day? Add one household at a time') &&
      words(hostForm).includes('First — you’re at Boxing Day too.') &&
      words(summaryNoDetails).includes('3 people coming to Boxing Day.') &&
      words(planNoDetails).includes('Here’s what I’d suggest for Boxing Day.')
  );
  const firstDash = withDetails.match(/<a[^>]*href="\/plan\/e1"[^>]*>([^<]*)<\/a>/)?.[1];
  assert(
    'K',
    'K2 CONTROL: the board’s first link to /plan/[id] is "Invites & people" (board-door C4)',
    firstDash === 'Invites &amp; people',
    firstDash
  );
  assert(
    'K',
    'K3 CONTROL: the pre-flight’s Send is byte for byte as it was',
    read('src/app/plan/[eventId]/pre-flight/page.tsx').includes(SEND_AT_HEAD)
  );
  const boardCode = codeOnly(read('src/components/glance/GlanceBoard.tsx'));
  assert(
    'K',
    'K4 CONTROL: GlanceBoard stays a server component — no use client, no hook, no prisma, no fetch',
    boardCode.length > 0 &&
      !/'use client'/.test(boardCode) &&
      !/\buse[A-Z]\w*\(/.test(boardCode) &&
      !/\bprisma\b/.test(boardCode) &&
      !/\bfetch\(/.test(boardCode)
  );

  // ── D — the three reads (Q14, widened by C2) ──────────────────────────────────
  const wire = codeOnly(read('src/lib/events/wire-select.ts'));
  const wireOne = wire.slice(
    wire.indexOf('export const EVENT_WIRE_SELECT'),
    wire.indexOf('export const EVENT_LIST_WIRE_SELECT')
  );
  assert(
    'D',
    'D1 EVENT_WIRE_SELECT’s setup part carries eventType and eventTypeOther',
    /setup:\s*\{\s*select:\s*\{[^}]*\beventType: true[^}]*\beventTypeOther: true/.test(wireOne)
  );
  const pfRoute = codeOnly(read('src/app/api/events/[id]/pre-flight/route.ts'));
  const pfEvent = pfRoute.slice(pfRoute.indexOf('prisma.event.findUnique'));
  const pfEventSelect = pfEvent.slice(0, pfEvent.indexOf('});'));
  const pfSetup = pfRoute.slice(pfRoute.indexOf('prisma.eventSetup.findUnique'));
  const pfSetupSelect = pfSetup.slice(0, pfSetup.indexOf('})'));
  assert(
    'D',
    'D2 the pre-flight route reads the dates, the venue, both times, the description, and Moment 2’s answer',
    ['endDate', 'venueName', 'venueTimingStart', 'venueTimingEnd', 'occasionDescription'].every(
      (f) => new RegExp(`\\b${f}: true`).test(pfEventSelect)
    ) &&
      /\beventType: true/.test(pfSetupSelect) &&
      /\beventTypeOther: true/.test(pfSetupSelect)
  );
  const page = codeOnly(read('src/app/plan/[eventId]/glance/page.tsx'));
  const pageSelect = page.slice(page.indexOf('prisma.event.findUnique'));
  const pageSel = pageSelect.slice(0, pageSelect.indexOf('});'));
  assert(
    'D',
    'D3 the board page reads the venue, both times, the description, and Moment 2’s answer',
    ['venueName', 'venueTimingStart', 'venueTimingEnd', 'occasionDescription'].every((f) =>
      new RegExp(`\\b${f}: true`).test(pageSel)
    ) && /setup:\s*\{\s*select:\s*\{\s*eventType: true,\s*eventTypeOther: true\s*\}/.test(pageSel)
  );
}

// ══ CHROME — the dev server, behind the safeguards ═════════════════════════════
const created = {
  users: [] as string[],
  people: [] as string[],
  events: [] as string[],
  sessions: [] as string[],
};
const refusals: string[] = [];

async function runLive() {
  const up = await (async () => {
    try {
      return (await realFetch(`${BASE}/`)).ok;
    } catch {
      return false;
    }
  })();
  assert('S', 'S0 PRECONDITION: the dev server answers on :3000', up);
  if (!up) return;

  const totals = async () => ({
    invite: await prisma.inviteEvent.count(),
    outbound: await prisma.outboundMessage.count(),
  });
  const before = await totals();

  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const mail = (l: string) => `gtc368-${l}-${stamp}@example.com`;
  const user = await prisma.user.create({ data: { email: mail('kate') } });
  created.users.push(user.id);
  const kate = await prisma.person.create({
    data: { name: 'Kate B5W', email: user.email, userId: user.id },
  });
  created.people.push(kate.id);
  const token = randomBytes(32).toString('hex');
  const session = await prisma.session.create({
    data: { userId: user.id, token, expiresAt: new Date(Date.now() + 3600e3) },
  });
  created.sessions.push(session.id);
  const start = new Date('2026-12-19T00:00:00.000Z');

  const mkEvent = async (name: string, extra: Record<string, unknown> = {}) => {
    const ev = await prisma.event.create({
      data: {
        name,
        startDate: start,
        endDate: start,
        hostId: kate.id,
        status: 'DRAFT',
        ...extra,
      } as any,
    });
    created.events.push(ev.id);
    await prisma.eventRole.create({ data: { eventId: ev.id, userId: user.id, role: 'HOST' } });
    return ev;
  };
  let n = 0;
  const addHousehold = async (eventId: string, names: string[], sent: Date | null) => {
    const h = await prisma.household.create({ data: { eventId } });
    const ids: string[] = [];
    for (const [i, nm] of names.entries()) {
      const p = await prisma.person.create({
        data: { name: nm, email: mail(`${nm.toLowerCase().replace(/\W/g, '')}-${n++}`) },
      });
      created.people.push(p.id);
      ids.push(p.id);
      await prisma.personEvent.create({
        data: {
          personId: p.id,
          eventId,
          role: 'PARTICIPANT',
          householdId: h.id,
          householdRole: i === 0 ? 'PRIMARY_CONTACT' : 'PARTNER',
          ...(sent ? { sentAt: sent } : {}),
        } as any,
      });
    }
    return ids;
  };
  const addHost = async (eventId: string, sent: Date | null) => {
    const h = await prisma.household.create({ data: { eventId } });
    await prisma.personEvent.create({
      data: {
        personId: kate.id,
        eventId,
        role: 'HOST',
        householdId: h.id,
        householdRole: 'PRIMARY_CONTACT',
        ...(sent ? { sentAt: sent } : {}),
      } as any,
    });
  };
  /** The plan: three items; `holders` gives each one, in order, to a person (or leaves it). */
  const addPlan = async (eventId: string, holders: (string | null)[] = []) => {
    let order = 0;
    let k = 0;
    for (const [team, dishes] of [
      ['Mains', ['Glazed ham', 'Roast lamb']],
      ['Dessert', ['Classic pavlova with cream']],
    ] as const) {
      const t = await prisma.team.create({
        data: {
          name: team,
          eventId,
          displayOrder: order++,
          source: 'GENERATED',
          coordinatorId: kate.id,
        } as any,
      });
      for (const [i, d] of dishes.entries()) {
        const holder = holders[k++] ?? null;
        const item = await prisma.item.create({
          data: {
            name: d,
            teamId: t.id,
            source: 'GENERATED',
            aiGenerated: true,
            quantityAmount: 2,
            quantityUnit: 'TRAYS',
            status: holder ? 'ASSIGNED' : 'UNASSIGNED',
            displayOrder: i,
          } as any,
        });
        if (holder) {
          await prisma.assignment.create({
            data: { itemId: item.id, personId: holder, response: 'PENDING' },
          });
        }
      }
    }
  };
  const setup = (eventId: string, extra: Record<string, unknown> = {}) =>
    prisma.eventSetup.create({ data: { eventId, eventType: 'Christmas', ...extra } });

  // The opening screen: nothing saved. Her own household's step: a household, not hers.
  const evOpen = await mkEvent('GTC-368 w — opening');
  const evHost = await mkEvent('GTC-368 w — own household');
  await addHousehold(evHost.id, ['Josie Walker'], null);
  // Moment 1's form: hers and two more.
  const evM1 = await mkEvent('GTC-368 w — the people');
  await addHost(evM1.id, null);
  await addHousehold(evM1.id, ['Josie Walker'], null);
  await addHousehold(evM1.id, ['Gus Tane'], null);
  // Moment 2's questions: an answer, no plan.
  const evQ = await mkEvent('GTC-368 w — questions');
  await addHost(evQ.id, null);
  await addHousehold(evQ.id, ['Josie Walker'], null);
  await setup(evQ.id);
  // The plan view: a plan, not approved.
  const evPlan = await mkEvent('GTC-368 w — plan');
  await addHost(evPlan.id, null);
  await addHousehold(evPlan.id, ['Josie Walker'], null);
  await setup(evPlan.id);
  await addPlan(evPlan.id);
  // Moment 3: approved, jobs unassigned; and approved with every job given.
  const evM3 = await mkEvent('GTC-368 w — who’s on what');
  await addHost(evM3.id, null);
  await addHousehold(evM3.id, ['Josie Walker'], null);
  await setup(evM3.id, { planApprovedAt: new Date() });
  await addPlan(evM3.id);
  const evM3done = await mkEvent('GTC-368 w — every job given');
  await addHost(evM3done.id, null);
  const [josie] = await addHousehold(evM3done.id, ['Josie Walker'], null);
  await setup(evM3done.id, { planApprovedAt: new Date() });
  await addPlan(evM3done.id, [kate.id, josie, josie]);
  // The pre-flight: held, not sent.
  const evHeld = await mkEvent('GTC-368 w — held', { status: 'CONFIRMING' });
  await addHost(evHeld.id, null);
  await addHousehold(evHeld.id, ['Josie Walker'], null);
  await setup(evHeld.id, { planApprovedAt: new Date() });
  await addPlan(evHeld.id);
  // Sent: the press's stamps written directly, nothing queued; with every detail set.
  const sentAt = new Date(Date.now() - 2 * 864e5);
  const evSent = await mkEvent('GTC-368 w — sent', {
    status: 'CONFIRMING',
    sentAt,
    venueName: 'Kate’s place, 14 Rimu Road',
    venueTimingStart: '12:00',
    venueTimingEnd: '16:00',
    occasionDescription: 'Lunch in the garden, swim after.',
  });
  await addHost(evSent.id, sentAt);
  await addHousehold(evSent.id, ['Mere Parata'], sentAt);
  await setup(evSent.id, { planApprovedAt: new Date() });
  await addPlan(evSent.id);

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

  let chrome: Headless | null = null;
  let whileExists = '';
  let probes = { plan: '', send: '' };
  try {
    chrome = await openHeadless({ fetchImpl: realFetch, port: 9389 });
    const c = chrome;
    await c.blockPlanMaking();
    await c.blockSends();
    // Any "leave site?" the walk meets is answered by leaving (it writes nothing); the L layer
    // answers by staying, to see that the warning came.
    c.answerLeaveDialogs(true);
    await c.navigate('/', 3000);
    probes = {
      plan: await c.evaluate<string>(
        `fetch('/api/gtc368-probe/finalize-plan', { method: 'POST' }).then(r => 'reached ' + r.status).catch(() => 'failed')`
      ),
      send: await c.evaluate<string>(
        `fetch('/api/events/gtc368-probe/send', { method: 'POST' }).then(r => 'reached ' + r.status).catch(() => 'failed')`
      ),
    };
    await c.setSessionCookie(token);
    await c.setViewport(1280, 900, false);
    const ev = <T = any,>(js: string) => c.evaluate<T>(js);
    /** Tag what `js` finds, then click it — guarded. 'absent' (not a refusal) when not found. */
    const tap = async (js: string, settleMs = 900) => {
      const found = await ev<boolean>(
        `(() => { document.querySelectorAll('[data-t]').forEach(e => e.removeAttribute('data-t')); const el = ${js}; if (!el) return false; el.setAttribute('data-t', 'x'); return true; })()`
      );
      if (!found) return 'absent';
      const r = await c.clickGuarded('[data-t="x"]', settleMs);
      if (r) refusals.push(`${js}: ${r}`);
      return r;
    };
    const body = () => ev<string>(`document.body.innerText`);
    const path = () => ev<string>(`location.pathname + location.search`);
    const strip = (label: string) =>
      `[...document.querySelectorAll('[data-moment-strip] button, [data-moment-strip] a')].find(b => b.innerText.includes(${JSON.stringify(label)}))`;
    const link = (w: string) =>
      `[...document.querySelectorAll('a, button')].find(b => b.offsetParent !== null && b.innerText.trim() === ${JSON.stringify(w)})`;
    const NAME_BTN = `[...document.querySelectorAll('[data-event-details-button]')].find(b => b.offsetParent !== null)`;
    const panelOf = (id: string) => `document.getElementById('event-details-${id}')`;
    const isOpen = (id: string) =>
      ev<boolean>(
        `(() => { const p = ${panelOf(id)}; return !!p && (p.matches(':popover-open') || p.hasAttribute('data-open')) && p.checkVisibility(); })()`
      );
    const panelText = (id: string) =>
      ev<string>(`(${panelOf(id)}?.innerText ?? '').replace(/\\s+/g, ' ').trim()`);
    /** A small mark at the screen's left edge, outside the card, for "a tap outside". */
    const OUTSIDE = `(() => { let o = document.querySelector('[data-outside-probe]'); if (!o) { o = document.createElement('div'); o.setAttribute('data-outside-probe', ''); o.style.cssText = 'position:fixed;left:4px;top:320px;width:24px;height:24px;z-index:70'; document.body.appendChild(o); } return o; })()`;

    /** Opens the details on the screen in front of it and says whether they opened, and with what. */
    const opens = async (id: string, name: string) => {
      const r = await tap(NAME_BTN, 500);
      const open = await isOpen(id);
      const text = await panelText(id);
      return { ok: r === null && open && text.includes(name) && text.includes('When'), text, r };
    };
    const closeIt = async (id: string) => {
      await c.pressKey('Escape');
      return !(await isOpen(id));
    };

    // The screens, in an order that never needs a press: each from its own stored state.
    type Screen = { key: string; label: string; id: string; name: string; go: () => Promise<void> };
    const setupOf = (id: string) => `/plan/${id}/setup`;
    const screens: Screen[] = [
      {
        key: 'C1a',
        label: 'the opening screen',
        id: evOpen.id,
        name: 'GTC-368 w — opening',
        go: () => c.navigate(setupOf(evOpen.id), 6000),
      },
      {
        key: 'C1b',
        label: 'her own household’s step',
        id: evHost.id,
        name: 'GTC-368 w — own household',
        go: () => c.navigate(setupOf(evHost.id), 6000),
      },
      {
        key: 'C1c',
        label: 'Moment 1’s form',
        id: evM1.id,
        name: 'GTC-368 w — the people',
        go: () => c.navigate(setupOf(evM1.id), 6000),
      },
      {
        key: 'C1d',
        label: 'Moment 2’s opening (by the strip)',
        id: evM1.id,
        name: 'GTC-368 w — the people',
        go: async () => {
          await c.navigate(setupOf(evM1.id), 6000);
          await tap(strip("What's the plan?"), 1500);
        },
      },
      {
        key: 'C1e',
        label: 'Moment 2’s questions',
        id: evQ.id,
        name: 'GTC-368 w — questions',
        go: () => c.navigate(setupOf(evQ.id), 7000),
      },
      {
        key: 'C1f',
        label: 'the plan view',
        id: evPlan.id,
        name: 'GTC-368 w — plan',
        go: () => c.navigate(setupOf(evPlan.id), 7000),
      },
      {
        key: 'C1g',
        label: 'Moment 3',
        id: evM3.id,
        name: 'GTC-368 w — who’s on what',
        go: () => c.navigate(setupOf(evM3.id), 8000),
      },
      {
        key: 'C1h',
        label: 'the pre-flight',
        id: evHeld.id,
        name: 'GTC-368 w — held',
        go: () => c.navigate(`/plan/${evHeld.id}/pre-flight`, 8000),
      },
      {
        key: 'C1i',
        label: '“Who I nudge”',
        id: evSent.id,
        name: 'GTC-368 w — sent',
        go: () => c.navigate(`/plan/${evSent.id}/pre-flight`, 8000),
      },
      {
        key: 'C1j',
        label: 'the board',
        id: evSent.id,
        name: 'GTC-368 w — sent',
        go: () => c.navigate(`/plan/${evSent.id}/glance`, 9000),
      },
    ];

    // ── C1 — the name opens its details natively, on every screen ─────────────────
    for (const s of screens) {
      await s.go();
      const o = await opens(s.id, s.name);
      const extra =
        s.key === 'C1j' || s.key === 'C1i'
          ? o.text.includes('Where') && o.text.includes('Kate’s place, 14 Rimu Road')
          : true;
      assert(
        'C',
        `${s.key} ${s.label}: a tap on the event’s name opens its details`,
        o.ok && extra,
        `${o.r ?? 'tapped'} "${o.text.slice(0, 120)}"`
      );
      await closeIt(s.id);
    }

    // ── C2 to C4 — the ways it closes, on the plan view ───────────────────────────
    await c.navigate(setupOf(evPlan.id), 7000);
    let o = await opens(evPlan.id, 'GTC-368 w — plan');
    await c.pressKey('Escape');
    assert('C', 'C2 Escape closes the details', o.ok && !(await isOpen(evPlan.id)));
    o = await opens(evPlan.id, 'GTC-368 w — plan');
    await tap(OUTSIDE, 500);
    assert('C', 'C3 a tap outside closes the details', o.ok && !(await isOpen(evPlan.id)));
    o = await opens(evPlan.id, 'GTC-368 w — plan');
    await tap(
      `[...${panelOf(evPlan.id)}?.querySelectorAll('button') ?? []].find(b => b.innerText.trim() === 'Close')`,
      500
    );
    assert('C', 'C4 "Close" closes the details', o.ok && !(await isOpen(evPlan.id)));

    // ── C5 — a browser with no popover: the same card, every way in and out ───────
    const oldBrowser = await c.addInitScript(
      `delete HTMLElement.prototype.showPopover; delete HTMLElement.prototype.hidePopover; delete HTMLElement.prototype.togglePopover;`
    );
    await c.navigate(setupOf(evPlan.id), 7000);
    // An old browser ignores the attributes: take them away, so only the button's own tap works.
    const strip5 = () =>
      ev(
        `(() => { document.querySelectorAll('[popover]').forEach(e => e.removeAttribute('popover')); document.querySelectorAll('[popovertarget]').forEach(e => e.removeAttribute('popovertarget')); return typeof HTMLElement.prototype.showPopover; })()`
      );
    const apiGone = (await strip5()) === 'undefined';
    const steps: boolean[] = [];
    const id5 = evPlan.id;
    await tap(NAME_BTN, 400);
    steps.push(await isOpen(id5));
    await tap(
      `[...${panelOf(id5)}?.querySelectorAll('button') ?? []].find(b => b.innerText.trim() === 'Close')`,
      400
    );
    steps.push(!(await isOpen(id5)));
    await tap(NAME_BTN, 400);
    steps.push(await isOpen(id5));
    await c.pressKey('Escape');
    steps.push(!(await isOpen(id5)));
    await tap(NAME_BTN, 400);
    steps.push(await isOpen(id5));
    await tap(NAME_BTN, 400);
    steps.push(!(await isOpen(id5)));
    await tap(NAME_BTN, 400);
    steps.push(await isOpen(id5));
    await tap(OUTSIDE, 400);
    steps.push(!(await isOpen(id5)));
    await c.removeInitScript(oldBrowser);
    assert(
      'C',
      'C5 with no popover, the name still opens the card, and Close, Escape, the name again and a tap outside each close it',
      apiGone && steps.length === 8 && steps.every(Boolean),
      `${apiGone} ${steps.join(',')}`
    );

    // ── C6 — the occasion she has just picked shows at once, and after (C5's fix) ─
    await c.navigate(setupOf(evPlan.id), 7000);
    await tap(link('← Back to the questions'), 1500);
    await tap(
      `[...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Easter')`,
      900
    );
    o = await opens(evPlan.id, 'GTC-368 w — plan');
    const onQuestions = o.text.includes('Occasion Easter');
    await closeIt(evPlan.id);
    await tap(link('← Back to the people'), 1500);
    await tap(strip("What's the plan?"), 1500);
    const onPlan = (await body()).includes('Here’s what I’d suggest for');
    o = await opens(evPlan.id, 'GTC-368 w — plan');
    const afterwards = o.text.includes('Occasion Easter');
    await closeIt(evPlan.id);
    const savedEaster =
      (await prisma.eventSetup.findUnique({ where: { eventId: evPlan.id } }))?.eventType ===
      'Easter';
    assert(
      'C',
      'C6 on the questions, a just-picked occasion shows in the details at once, and on the plan view after',
      onQuestions && onPlan && afterwards && savedEaster,
      `${onQuestions} ${onPlan} ${afterwards} ${savedEaster}`
    );

    // ── C7 — W14 on the questions saves first (Q8) ────────────────────────────────
    await c.navigate(setupOf(evQ.id), 7000);
    await tap(
      `[...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Farewell')`,
      100
    );
    await tap(NAME_BTN, 150);
    await tap(
      `[...${panelOf(evQ.id)}?.querySelectorAll('a') ?? []].find(a => a.innerText.trim() === ${JSON.stringify(W14)})`,
      4000
    );
    const landed = await path();
    const savedFarewell =
      (await prisma.eventSetup.findUnique({ where: { eventId: evQ.id } }))?.eventType ===
      'Farewell';
    assert(
      'C',
      'C7 on the questions, "Change these details" saves a just-picked answer first, then opens the old dashboard',
      landed === `/plan/${evQ.id}` && savedFarewell,
      `${landed} ${savedFarewell}`
    );

    // ── C8 — Moment 3's "When it’s done": always at the top, under "What this does", and never in
    // the panel after "All sorted →" ([[GTC-378]] ruling 6, replacing GTC-368's Q9) ──────────────
    const topDone = () =>
      ev<string>(`document.querySelector('[data-moment-words="3-done"]')?.textContent ?? ''`);
    const panelWords = async () =>
      ev<string>(
        `(() => { const k = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Keep going'); return k ? k.closest('.shadow-lg')?.innerText ?? '' : ''; })()`
      );
    await c.navigate(setupOf(evM3.id), 8000);
    const unassignedTop = await topDone();
    await tap(`document.querySelector('[data-m3="all-sorted"]')`, 600);
    const unassignedPanel = await panelWords();
    await c.navigate(setupOf(evM3done.id), 8000);
    const givenTop = await topDone();
    await tap(`document.querySelector('[data-m3="all-sorted"]')`, 600);
    const givenPanel = await panelWords();
    assert(
      'C',
      'C8 Moment 3’s line is at the top whether or not a job is unassigned, and never in the panel after "All sorted →" (GTC-378)',
      unassignedPanel.length > 0 &&
        givenPanel.length > 0 &&
        unassignedTop.includes(M[3].done) &&
        givenTop.includes(M[3].done) &&
        !unassignedPanel.includes(M[3].done) &&
        !givenPanel.includes(M[3].done),
      `${unassignedTop.slice(0, 40)} | ${givenTop.slice(0, 40)} | ${givenPanel.slice(0, 120)}`
    );

    // ── C9 — the board's "What this does": closed on every visit, opens on a tap ──
    await c.navigate(`/plan/${evSent.id}/glance`, 9000);
    const shut = await ev<boolean>(
      `(() => { const d = document.querySelector('details[data-moment-words]'); if (!d || d.open) return false; const p = [...d.querySelectorAll('p')].find(x => x.textContent.includes('Shows you where')); return !!p && !p.checkVisibility(); })()`
    );
    await tap(`document.querySelector('details[data-moment-words] summary')`, 400);
    const shown = await ev<boolean>(
      `(() => { const d = document.querySelector('details[data-moment-words]'); if (!d || !d.open) return false; const p = [...d.querySelectorAll('p')].find(x => x.textContent.includes('Shows you where')); return !!p && p.checkVisibility(); })()`
    );
    assert(
      'C',
      'C9 the board’s "What this does" is closed on arrival and opens on a tap',
      shut && shown,
      `${shut} ${shown}`
    );

    // ── C10 — at 390, every screen with the details open ─────────────────────────
    await c.setViewport(390, 844, true);
    const widths: string[] = [];
    for (const s of screens) {
      await s.go();
      await tap(NAME_BTN, 500);
      const fit = await ev<string>(
        `(() => { const p = ${panelOf(s.id)}; const open = !!p && p.matches(':popover-open'); const r = p ? p.getBoundingClientRect() : null; return [document.documentElement.scrollWidth, open, r ? Math.round(r.left) : -1, r ? Math.round(r.right) : -1].join(':'); })()`
      );
      widths.push(`${s.key}:${fit}`);
      await c.pressKey('Escape');
    }
    assert(
      'C',
      'C10 at 390 every screen is 390 wide with its details open, and the card sits inside the screen',
      widths.length === 10 &&
        widths.every((w) => {
          const [, sw, open, l, r] = w.split(':');
          return Number(sw) <= 390 && open === 'true' && Number(l) >= 0 && Number(r) <= 390;
        }),
      widths.join(' ')
    );
    await c.setViewport(1280, 900, false);

    // ── L — the false "Leave site?" (the founder's ruling): warn only on a real change ──
    const leave = async () => {
      const d0 = c.dialogs().length;
      c.answerLeaveDialogs(false);
      await c.navigate('/plan/events', 3000);
      const came = c.dialogs().slice(d0).includes('beforeunload');
      const where = await ev<string>(`location.pathname`);
      c.answerLeaveDialogs(true);
      return { came, left: where === '/plan/events', where };
    };
    const NAME = `document.querySelector('#m1-name')`;
    const EMAIL = `document.querySelector('input[placeholder="email@example.com"]')`;
    const EDIT = `[...document.querySelectorAll('button')].filter(b => b.innerText.trim() === 'Edit' && b.offsetParent !== null).pop()`;

    await c.navigate(setupOf(evHost.id), 6000);
    const ownStep = (await body()).includes('First — you’re at');
    await tap(NAME, 300);
    let l = await leave();
    assert(
      'L',
      'L1 her own household’s step, her name as it opened and nothing typed: she leaves with no dialog',
      ownStep && !l.came && l.left,
      JSON.stringify(l)
    );
    await c.navigate(setupOf(evHost.id), 6000);
    await tap(NAME, 300);
    await c.insertText(' Jr');
    l = await leave();
    assert(
      'L',
      'L2 CONTROL: her own household’s step with something typed: the dialog comes',
      l.came && !l.left,
      JSON.stringify(l)
    );
    await c.navigate('/plan/events', 3000);

    await c.navigate(setupOf(evM1.id), 6000);
    const e3 = await tap(EDIT, 800);
    l = await leave();
    assert(
      'L',
      'L3 a saved household reopened and left unchanged: no dialog',
      e3 === null && !l.came && l.left,
      JSON.stringify(l)
    );
    await c.navigate(setupOf(evM1.id), 6000);
    const e4 = await tap(EDIT, 800);
    await tap(NAME, 300);
    await c.insertText('x');
    l = await leave();
    assert(
      'L',
      'L4 CONTROL: a saved household changed: the dialog comes',
      e4 === null && l.came && !l.left,
      JSON.stringify(l)
    );
    await c.navigate('/plan/events', 3000);

    await c.navigate(setupOf(evM1.id), 6000);
    await tap(EMAIL, 300);
    await c.insertText('aunt.may@example.com');
    l = await leave();
    assert(
      'L',
      'L5 a new household with only an email typed (no name yet): the dialog comes',
      l.came && !l.left,
      JSON.stringify(l)
    );
    await c.navigate('/plan/events', 3000);

    whileExists = await rows();
    console.log(
      `  fixture rows (Event, EventSetup, EventRole, Household, PersonEvent, Person, User, Session, Team, Item, Assignment, AccessToken, OutboundMessage, InviteEvent): ${whileExists}`
    );
    console.log(`  dialogs met: ${c.dialogs().join(', ') || 'none'}`);
  } finally {
    chrome?.close();
  }

  assert(
    'S',
    'S1 the plan-making and send blocks are proven: both probes failed in the browser',
    probes.plan === 'failed' && probes.send === 'failed',
    JSON.stringify(probes)
  );
  const blocked = chrome ? chrome.planMakingBlocked() : [];
  assert(
    'S',
    'S2 nothing but the two probes was blocked — no plan-making or send request was made — and no click was refused',
    blocked.length === 2 &&
      blocked.every((b) => b.includes('gtc368-probe')) &&
      refusals.length === 0,
    `${blocked.join(' | ')} ${refusals.join(' | ')}`
  );
  const hosts = chrome ? chrome.hostsRequested() : [];
  assert(
    'S',
    'S3 headless Chrome requested only localhost:3000',
    hosts.length > 0 && hosts.every((h) => h === 'localhost:3000'),
    hosts.join(',')
  );

  const ai = await prisma.event.findMany({
    where: { id: { in: created.events } },
    select: { aiCallsUsed: true },
  });
  await cleanup();
  const left = await rows();
  const after = await totals();
  const routes = (dir: string): number =>
    readdirSync(dir).reduce((acc, f) => {
      const p = join(dir, f);
      return acc + (statSync(p).isDirectory() ? routes(p) : f === 'route.ts' ? 1 : 0);
    }, 0);
  const classified = JSON.parse(read('route-classifications.json') || '[]');
  assert(
    'S',
    `Z1 CONTROL: no new route (112 route.ts, 86 classifications); aiCallsUsed 0 on every event; every row removed by id (${whileExists} while it existed); totals as found (${before.invite}/${before.outbound} -> ${after.invite}/${after.outbound})`,
    routes(join(process.cwd(), 'src/app/api')) === 112 &&
      classified.length === 86 &&
      ai.length === 9 &&
      ai.every((e) => e.aiCallsUsed === 0) &&
      whileExists.length > 0 &&
      left === '0,0,0,0,0,0,0,0,0,0,0,0,0,0' &&
      after.invite === before.invite &&
      after.outbound === before.outbound,
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
  // Every row below was made by this suite: its events and what hangs off them (the guest links
  // C7's visit to the old dashboard made among them), its people, its user and its sessions.
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
