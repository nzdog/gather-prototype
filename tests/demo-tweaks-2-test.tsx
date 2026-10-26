/**
 * [[GTC-395]] — THE DEMO TWEAKS, LIST THREE: the founder's seven items after his look at GTC-394.
 *
 * Founder rulings, 20 Oct 2026 (his prompt, through Cowork). Each item adds its own layer here, in
 * its own commit.
 *
 * THE LAYERS
 *   F  items 1 and 2: the front page has only "Try it yourself"; the Sarah button and its handler
 *      go, the session route behind it is not touched.
 *   N  item 3: the sample starts on its own pre-filled "Create Your Event" page (development-only),
 *      then its name, dates and venue are saved through the Edit event route.
 *   C  item 4: "Who should Gather talk to for the kids in this household?" lists this household's
 *      adults only, on Moment 1's edit-household form and the pre-flight's step 3; an existing pick
 *      in another household stays while it is the pick.
 *   R  item 5: "What you've picked" on the right of Moment 2's questions, in Moment 1's arrangement;
 *      on a phone it stays under the questions. Layout only.
 *   E  item 7: where and when to drop off: the event's one line (its venue and times) at the top of
 *      Moment 2's plan and of Moment 3; an item's own place or note on its row, through the
 *      existing DropOffDisplay with its own words.
 *
 * SAFETY. Static and rendered checks only: no database row, no dev server, no AI call, no
 * browser, no network. Every fixture and expected value is written here by hand, never taken from
 * the code under test. Every check's condition lives in CHECKS so it can be dry-run on a passing
 * and a failing input before RED.
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
// Imported statically, as GTC-394 ruled for the demo page (a dynamic import() would give the page
// a second toast context if it ever used one).
import DemoPage from '../src/app/demo/page';
// Item 7: the two views and the toast provider imported statically, as the Moment 3 suites do (a
// dynamic import() would give Moment 3 a second toast context).
import { ToastProvider } from '../src/contexts/ToastContext';
import Moment2PlanView from '../src/components/plan/Moment2PlanView';
import Moment3AssignView from '../src/components/plan/Moment3AssignView';

const ROOT = path.join(__dirname, '..');

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
const code = (rel: string) => stripComments(read(rel));
/** The tag the founder last looked at (GTC-395's rollback structure). */
const GOOD_TAG = 'demo-tweaks-good';
const unchangedSinceGood = (paths: string[]) =>
  spawnSync('git', ['diff', '--quiet', GOOD_TAG, '--', ...paths], { cwd: ROOT }).status === 0;
async function load(rel: string): Promise<any> {
  try {
    return await import(rel);
  } catch {
    return null;
  }
}
const atGood = (rel: string) => {
  const r = spawnSync('git', ['show', `${GOOD_TAG}:${rel}`], { cwd: ROOT, encoding: 'utf8' });
  return r.status === 0 ? r.stdout : '';
};
const render = (el: any) => {
  try {
    return renderToStaticMarkup(el);
  } catch (err) {
    console.log(`    (render threw: ${String((err as Error).message).split('\n')[0]})`);
    return '';
  }
};

// ── Items 1 and 2: the front page, hand-written ──────────────────────────────
const DEMO_PAGE = 'src/app/demo/page.tsx';
/** The one button (GTC-394 tweak 3's own label, founder's words). */
const TRY_IT = 'Try it yourself';
/** The route behind the old Sarah button and the sample's own code: none of them edited. */
const NOT_EDITED_F = [
  'src/app/api/demo/session/route.ts',
  'src/app/api/demo/tokens/route.ts',
  'src/app/api/demo/reset/route.ts',
  'src/lib/demo/copy.ts',
  'src/lib/demo/start-limit.ts',
  'src/lib/demo/send-wall.ts',
  'src/lib/demo/ai-cap.ts',
];

// ── Item 3: the sample's "Create Your Event" page, hand-written ──────────────
const NEW_PAGE = 'src/app/demo/new/page.tsx';
const NEW_LAYOUT = 'src/app/demo/new/layout.tsx';
const NEW_LIB = 'src/lib/demo/new-event.ts';
const PLAN_NEW = 'src/app/plan/new/page.tsx';
const EDIT_BOX = 'src/components/plan/EditEventModal.tsx';
/** The real page's heading and labels, as they read in its file (the file is not edited). */
const REAL_WORDS = ['Create Your Event', 'Event Name', 'Your Name', 'Email', 'Phone'];
/** The Edit event box's venue heading and labels, as they read in its file (not edited). */
const BOX_WORDS = ['Venue Details', 'Venue Name', 'Event Start Time', 'Event End Time'];
/** The two new words (founder: the button and the line, the real page's minus the payment). */
const NEW_LINE = 'Enter your event details to get started.';
const REAL_LINE = 'Enter your event details and pay $25 to get started.';
const NEW_BUTTON = 'Create';
const REAL_BUTTON = 'Pay & Create — $25';
/** Reused: the old /demo button's working word, and the Edit event box's failure line. */
const STARTING = 'Starting…';
const SAVE_FAILED = 'Failed to update event';
/** The sample's own name and host (GTC-392 W12, W13), and the made-up details. */
const W12 = 'Your sample gathering';
const W13 = 'Sam';
const MADE_UP = {
  email: 'sam@example.com',
  phone: '021 123 4567',
  venueName: 'Riverside Park',
  venueTimingStart: '12:00pm',
  venueTimingEnd: '4:00pm',
};
/** GTC-392's start words (W9, W10, W15) and the link, as written there. */
const W9 = "You're signed in to Gather. Sign out first to try a sample event.";
const W10 = 'You already have a sample event open.';
const W15 = 'The sample event could not be started. Please try again.';
const GO_TO_IT = 'Go to it →';
/** Not edited by item 3: the real page, the Edit event box and route, and the sample's own code. */
const NOT_EDITED_N = [
  PLAN_NEW, // asked at GTC-407's base (see GTC407_BASE)
  EDIT_BOX,
  'src/app/api/events/[id]/route.ts',
  'src/app/api/demo/session/route.ts',
  'src/lib/demo/copy.ts',
  'src/lib/demo/start-limit.ts',
  'src/lib/demo/send-wall.ts',
  'src/lib/demo/ai-cap.ts',
];
/**
 * [[GTC-407]] edits the paying page on purpose (after payment: the 409 screen, "Try Again" with
 * the same receipt, the support address), so N13 asks its question of that page at GTC-407's base
 * (1b8bfe7), a fixed commit: item 3 still may not have touched it. GTC-407's own suite
 * (test:demo-tweaks-9) pins its new state. N1 and N2 still read the page as it is now.
 */
const GTC407_BASE = '1b8bfe7b8a9b7540ef582fff9be031b37e325b8c';
/**
 * The sample's day, worked out here by hand (GTC-392 W14): today's NZ date plus four weeks, then
 * on to the Saturday (the same day if it is one).
 */
function sampleDay(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-NZ', {
    timeZone: 'Pacific/Auckland',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const d = new Date(Date.UTC(get('year'), get('month') - 1, get('day')));
  d.setUTCDate(d.getUTCDate() + 28);
  while (d.getUTCDay() !== 6) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
/** A new sample's event as GET /api/events/{id} answers it, written by hand (wire fields and all). */
const FIXTURE_EVENT: Record<string, unknown> = {
  id: 'ev-1',
  name: W12,
  status: 'DRAFT',
  sentAt: null,
  wrappedAt: null,
  startDate: '2026-11-21T00:00:00.000Z',
  endDate: '2026-11-21T00:00:00.000Z',
  occasionType: null,
  occasionDescription: null,
  guestCount: null,
  guestCountConfidence: 'MEDIUM',
  guestCountMin: null,
  guestCountMax: null,
  dietaryStatus: 'UNSPECIFIED',
  dietaryVegetarian: 0,
  dietaryVegan: 0,
  dietaryGlutenFree: 0,
  dietaryDairyFree: 0,
  dietaryAllergies: null,
  venueName: null,
  venueType: null,
  venueKitchenAccess: null,
  venueOvenCount: 0,
  venueStoretopBurners: null,
  venueBbqAvailable: null,
  venueTimingStart: null,
  venueTimingEnd: null,
  venueNotes: null,
  lastCheckPlanAt: null,
  hostId: 'p-host',
  isDemo: true,
  clonedFromId: null,
  aiCallsUsed: 0,
  setup: {
    id: 's-1',
    planApprovedAt: null,
    eventType: null,
    eventTypeOther: null,
    invitesOnly: false,
  },
};
/** What the page sends, hand-written: her name, a two-day date pair, and her venue. */
const PAGE_DETAILS = {
  name: 'Ana’s birthday',
  dates: { first: '2026-12-05', last: '2026-12-06', moreDays: true },
  venueName: 'The Boatshed',
  venueTimingStart: '6:00pm',
  venueTimingEnd: '10:00pm',
};
/** The PATCH body expected for PAGE_DETAILS on FIXTURE_EVENT: the box's fields, hers on top. */
const EXPECTED_PATCH: Record<string, unknown> = {
  name: 'Ana’s birthday',
  startDate: '2026-12-05',
  endDate: '2026-12-06',
  occasionType: null,
  occasionDescription: null,
  guestCount: null,
  guestCountConfidence: 'MEDIUM',
  guestCountMin: null,
  guestCountMax: null,
  dietaryStatus: 'UNSPECIFIED',
  dietaryVegetarian: 0,
  dietaryVegan: 0,
  dietaryGlutenFree: 0,
  dietaryDairyFree: 0,
  dietaryAllergies: null,
  venueName: 'The Boatshed',
  venueType: null,
  venueKitchenAccess: null,
  venueOvenCount: 0,
  venueStoretopBurners: null,
  venueBbqAvailable: null,
  venueTimingStart: '6:00pm',
  venueTimingEnd: '10:00pm',
  venueNotes: null,
};
type Call = { url: string; method: string; body: unknown };
/** A hand-written fetch: answers by URL and method, and logs every call. */
function fakeFetch(
  answer: (url: string, method: string) => { status: number; json?: unknown } | 'throw'
) {
  const calls: Call[] = [];
  const fn = async (url: string, init?: { method?: string; body?: string }) => {
    const method = init?.method ?? 'GET';
    calls.push({ url, method, body: init?.body ? JSON.parse(init.body) : undefined });
    const a = answer(url, method);
    if (a === 'throw') throw new Error('network down');
    return {
      ok: a.status >= 200 && a.status < 300,
      status: a.status,
      json: async () => {
        if (a.json === undefined) throw new Error('no body');
        return a.json;
      },
    };
  };
  return { fn: fn as unknown as typeof fetch, calls };
}
const STARTED = { status: 200, json: { success: true, eventId: 'ev-1', href: '/plan/ev-1/setup' } };

// ── Item 4: the household picker, hand-written ────────────────────────────────
const CHOICES_FILE = 'src/components/plan/household-channel-choices.ts';
const M1_FORM = 'src/components/plan/Moment1InputForm.tsx';
const PREFLIGHT = 'src/app/plan/[eventId]/pre-flight/page.tsx';
/** Not edited by item 4: the routes that check a pick, the households code and the schema. */
const NOT_EDITED_C = [
  'src/app/api/events/[id]/households/route.ts',
  'src/app/api/events/[id]/households/[householdId]/route.ts',
  'src/app/api/events/[id]/pre-flight/channel/route.ts',
  'src/lib/households/channel.ts',
  'prisma/schema.prisma',
];
/** [[GTC-395]] ruling (20 Oct 2026): on the setup page C5 pins only the dropdown's list code. */
const SETUP_FILE_C = 'src/app/plan/[eventId]/setup/page.tsx';
/** Moment 1's page offers every household's non-child members (Ana's household and Bob's). */
const M1_CANDIDATES = [
  { personEventId: 'pe-ana', name: 'Ana Ngata', householdName: 'Ana Ngata', householdId: 'h-ana' },
  {
    personEventId: 'pe-ross',
    name: 'Ross Ngata',
    householdName: 'Ana Ngata',
    householdId: 'h-ana',
  },
  {
    personEventId: 'pe-mere',
    name: 'Mere Ngata',
    householdName: 'Ana Ngata',
    householdId: 'h-ana',
  },
  { personEventId: 'pe-tia', name: 'Tia Ngata', householdName: 'Ana Ngata', householdId: 'h-ana' },
  { personEventId: 'pe-bob', name: 'Bob Reid', householdName: 'Bob Reid', householdId: 'h-bob' },
  { personEventId: 'pe-jo', name: 'Jo Reid', householdName: 'Bob Reid', householdId: 'h-bob' },
];
/** Ana's form while she edits it: her partner, a guest, a helper ticked as an adult, a child helper. */
const ANA_FORM = {
  householdId: 'h-ana',
  partner: { personEventId: 'pe-ross', name: 'Ross Ngata ' },
  guests: [{ personEventId: 'pe-mere', name: 'Mere Ngata' }, { name: 'New Guest' }],
  helpers: [
    { personEventId: 'pe-tia', name: 'Tia Ngata', adultRoled: true },
    { personEventId: 'pe-kai', name: 'Kai Ngata', adultRoled: false },
  ],
  candidates: M1_CANDIDATES,
};
const ANA_ADULTS = [
  { personEventId: 'pe-ross', label: 'Ross Ngata' },
  { personEventId: 'pe-mere', label: 'Mere Ngata' },
  { personEventId: 'pe-tia', label: 'Tia Ngata' },
];
/** The pre-flight read offers every non-child member, with the household's label. */
const PF_CANDIDATES = [
  { personEventId: 'pe-ana', name: 'Ana Ngata', householdId: 'h-ana', householdLabel: 'Ana Ngata' },
  {
    personEventId: 'pe-ross',
    name: 'Ross Ngata',
    householdId: 'h-ana',
    householdLabel: 'Ana Ngata',
  },
  { personEventId: 'pe-bob', name: 'Bob Reid', householdId: 'h-bob', householdLabel: 'Bob Reid' },
  { personEventId: 'pe-lee', name: 'Lee Tan', householdId: null, householdLabel: null },
];
const PF_ANA = (contactPersonEventId: string | null) => ({
  id: 'h-ana',
  contactPersonEventId,
  members: [
    { personEventId: 'pe-ana', householdRole: 'PRIMARY_CONTACT' },
    { personEventId: 'pe-ross', householdRole: 'PARTNER' },
    { personEventId: 'pe-kai', householdRole: 'CHILD' },
  ],
});

// ── Item 5: "What you've picked" on the right, hand-written ─────────────────
const MODAL = 'src/components/plan/Moment2Step1Modal.tsx';
const SETUP_PAGE = 'src/app/plan/[eventId]/setup/page.tsx';
const PICKS_LIB = 'src/lib/moments/picks-summary.ts';
/** Moment 1's arrangement, as the setup page writes it (GTC-365): the row, the columns, the box. */
const M1_ROW = 'flex flex-col md:flex-row md:gap-8';
const M1_LEFT = 'flex-1 min-w-0';
const M1_PHONE = 'md:hidden mt-8';
const M1_RIGHT = 'hidden md:block w-80 flex-shrink-0';
const M1_STICKY = 'sticky top-8 max-h-[calc(100vh-4rem-65px)] overflow-y-auto';
const M1_BOX = 'max-w-5xl mx-auto px-6 py-8';
/** The modal's: the same, its box widened at md only, its column 81px shorter (the bar, ruled). */
const M2_BOX = 'max-w-2xl mx-auto px-6 py-8 pb-32 md:max-w-5xl';
const M2_STICKY = 'sticky top-8 max-h-[calc(100vh-4rem-65px-81px)] overflow-y-auto';
const PICKS_BOX = 'rounded-lg border border-gray-200 bg-white px-4 py-3';
const PICKS_TABLE = '<PicksTable rows={picksTable} />';
const PICKS_HEAD =
  '<h3 className="text-sm font-medium text-gray-900 mb-2">{PICKS_WORDS.HEADING}</h3>';
/** The same code but its layout: whitespace, brackets and commas (Prettier's re-wraps) dropped. */
const flat = (src: string) => src.replace(/[\s(),]/g, '');
const between = (src: string, from: string, to: string) => {
  const a = src.indexOf(from);
  const b = a >= 0 ? src.indexOf(to, a) : -1;
  return a >= 0 && b > a ? src.slice(a, b) : '';
};

// ── Item 7: where and when to drop off, hand-written ────────────────────────
const DROP_WORDS_FILE = 'src/lib/items/drop-off-words.ts';
const DROP_LINE_FILE = 'src/components/shared/EventDropOffLine.tsx';
const PLAN_VIEW = 'src/components/plan/Moment2PlanView.tsx';
const M3_VIEW = 'src/components/plan/Moment3AssignView.tsx';
/** The new words (founder: "drop off at <venue>, <start> to <end>"). */
const DROP_AT = 'Drop off at';
const NO_VENUE = 'Drop off: the venue hasn’t been added yet.';
/** Not edited by item 7: the drop-off component and helper, the items routes, every sender. */
const NOT_EDITED_E = [
  'src/components/shared/DropOffDisplay.tsx',
  'src/lib/formatDropOff.ts',
  'src/app/api',
  'src/lib/messages',
  'src/lib/press',
  'src/lib/email.ts',
  'src/lib/sms',
  'prisma',
];
/**
 * [[GTC-400]] edits one route on purpose (the dish edit now checks the dish is the event's), so
 * E8 asks its question of that file at GTC-400's base (528e8ad), a fixed commit: GTC-395 still
 * may not have touched it. The security suite (suite 16) pins its new behaviour. The file is
 * kept out of the live diff of src/app/api, which still covers every other route.
 */
const GTC400_BASE = '528e8adc5960c3fe3de989a89b738dbbe6a60e1d';
const GTC400_ROUTE = 'src/app/api/events/[id]/items/[itemId]/route.ts';
const GTC400_EXCLUDED = [`:(exclude)${GTC400_ROUTE}`];
/**
 * [[GTC-401]] edits four person routes on purpose (each now checks the person has a place in the
 * event in its address), so E8 asks its question of them at GTC-401's base (71a6287), a fixed
 * commit: GTC-395 still may not have touched them. The security suite (suite 17) pins their new
 * behaviour. They are kept out of the live diff of src/app/api, which still covers every other
 * route.
 */
const GTC401_BASE = '71a6287e2d3cefed5e37f3f8f5764955e0b34caa';
const GTC401_ROUTES = [
  'src/app/api/events/[id]/people/[personId]/nudge/route.ts',
  'src/app/api/events/[id]/people/[personId]/invite-detail/route.ts',
  'src/app/api/events/[id]/people/[personId]/manual-override/route.ts',
  'src/app/api/events/[id]/people/[personId]/route.ts',
];
const GTC401_EXCLUDED = GTC401_ROUTES.map((f) => `:(exclude)${f}`);
/**
 * [[GTC-402]] edits two link routes on purpose (each now checks the second thing in its address is
 * on the event its link opens), so E8 asks its question of them at GTC-402's base (dea03c1), a
 * fixed commit: GTC-395 still may not have touched them. The security suite (suite 18) pins their
 * new behaviour. They are kept out of the live diff of src/app/api, which still covers every other
 * route.
 */
const GTC402_BASE = 'dea03c10c2873344d0f989b238b24d65a166baeb';
const GTC402_ROUTES = [
  'src/app/api/h/[token]/people/[personId]/manual-override/route.ts',
  'src/app/api/c/[token]/ack/[assignmentId]/route.ts',
];
const GTC402_EXCLUDED = GTC402_ROUTES.map((f) => `:(exclude)${f}`);
/**
 * [[GTC-403]] edits three more routes on purpose (the guest link's answer now checks the assignment
 * is on the event its link opens; the coordinator link's dish create and edit check a day sent is
 * on that event), so E8 asks its question of them at GTC-403's base (a8e1117), a fixed commit:
 * GTC-395 still may not have touched them. The security suite (suite 19) pins their new behaviour.
 * They are kept out of the live diff of src/app/api, which still covers every other route. (GTC-403
 * also edits GTC-400's dish route, which is already kept out above and asked at GTC-400's base.)
 */
const GTC403_BASE = 'a8e1117fa798a1cfcec5b63fdf2c0f23c09bcac1';
const GTC403_ROUTES = [
  'src/app/api/p/[token]/ack/[assignmentId]/route.ts',
  'src/app/api/c/[token]/items/route.ts',
  'src/app/api/c/[token]/items/[itemId]/route.ts',
];
const GTC403_EXCLUDED = GTC403_ROUTES.map((f) => `:(exclude)${f}`);
const VENUE_FACTS = {
  id: 'e1',
  name: 'Boxing Day',
  startDate: '2026-12-26T00:00:00.000Z',
  endDate: '2026-12-26T00:00:00.000Z',
  venueName: 'Riverside Park',
  venueTimingStart: '12:00pm',
  venueTimingEnd: '4:00pm',
};
const NO_VENUE_FACTS = {
  ...VENUE_FACTS,
  venueName: null,
  venueTimingStart: null,
  venueTimingEnd: null,
};
const PLAN_PROPS = {
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
const PLAN_CATS = [
  {
    id: 'c1',
    name: 'Mains',
    emoji: '🍖',
    items: [
      {
        id: 'i1',
        name: 'Roast lamb',
        quantity: 1,
        unit: 'kg',
        servingSize: 'serves 6',
        dropOffLocation: 'The back door',
        dropOffNote: 'before 11am',
      },
      { id: 'i2', name: 'Bread rolls', quantity: 12, unit: 'rolls', servingSize: '' },
    ],
  },
];
const M3_CATS = [
  {
    id: 'c1',
    name: 'Mains',
    emoji: '🍖',
    items: [
      {
        id: 'i1',
        name: 'Roast lamb',
        kind: 'ITEM',
        detail: '1 kg',
        dropOffLocation: 'The back door',
        dropOffNote: 'before 11am',
      },
      { id: 'i2', name: 'Bread rolls', kind: 'ITEM', detail: '12 rolls' },
    ],
  },
];
/** DropOffDisplay's own words for the lamb, as it draws them (its file, not edited). */
const LAMB_DROP = ['Drop-off:', 'The back door', 'By:', 'before 11am'];
const drawPlan = (extra: Record<string, unknown>) =>
  render(
    createElement(
      ToastProvider as any,
      null,
      createElement(Moment2PlanView as any, { ...PLAN_PROPS, categories: PLAN_CATS, ...extra })
    )
  );
const drawM3 = (extra: Record<string, unknown>) =>
  render(
    createElement(
      ToastProvider as any,
      null,
      createElement(Moment3AssignView as any, {
        eventId: 'e1',
        event: { id: 'e1', status: 'DRAFT', sentAt: null },
        hostPersonId: 'p-kate',
        headcount: 4,
        categories: M3_CATS,
        initialHolders: {},
        households: [],
        askForReason: async () => ({ proceed: true }),
        askForBatchReason: async () => ({ proceed: true }),
        onBack: () => {},
        onMoveOn: () => {},
        stripDoors: {},
        ...extra,
      })
    )
  );
/** The text of a piece of markup, tags dropped. */
const textOf = (html: string) => html.replace(/<[^>]+>/g, '');

export const CHECKS = {
  /** F1, F2 — the first page: the heading "Gather" and its buttons, and nothing else. */
  frontPage(html: string, buttonsWanted: string[]) {
    const buttons = [...html.matchAll(/<button\b[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]);
    const h1 = html.match(/<h1\b[^>]*>([^<]*)<\/h1>/);
    return (
      !!h1 &&
      h1[1] === 'Gather' &&
      (html.match(/<h1\b/g) ?? []).length === 1 &&
      JSON.stringify(buttons) === JSON.stringify(buttonsWanted) &&
      (html.match(/<button\b/g) ?? []).length === buttons.length &&
      !/<(h2|h3|p|a|section|hr|img)\b/.test(html) &&
      !/Sarah|Henderson|Christmas/.test(html)
    );
  },
  /** F3 — the page's code: no Sarah door left, and nothing posts to the session route bare. */
  noSarah(src: string) {
    return (
      src.length > 200 &&
      !/Sarah|Henderson/.test(src) &&
      !/handleOpen/.test(src) &&
      !/\/glance/.test(src) &&
      !/fetch\('\/api\/demo\/session',\s*\{\s*method:\s*'POST'\s*\}\)/.test(src) &&
      !/useToast|toast\./.test(src) &&
      /process\.env\.NODE_ENV === 'development' && \(\s*<button\b/.test(src)
    );
  },
  /** N1 — each borrowed word reads, as text, in its own file. */
  wordsInFile(src: string, words: string[]) {
    return (
      src.length > 0 &&
      words.every((w) =>
        new RegExp(`>\\s*${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*<`).test(src)
      )
    );
  },
  /** N3 — the labels in order, and an input's attributes by its id. */
  labelsInOrder(html: string, labels: string[]) {
    const seen = [
      ...html.matchAll(/<(label|h3)\b[^>]*>(?:<svg[\s\S]*?<\/svg>)?([^<]*)<\/\1>/g),
    ].map((m) => m[2].trim());
    return JSON.stringify(seen) === JSON.stringify(labels);
  },
  input(html: string, id: string) {
    const tag = html.match(new RegExp(`<input\\b[^>]*\\bid="${id}"[^>]*>`))?.[0] ?? '';
    const value = tag.match(/\bvalue="([^"]*)"/)?.[1] ?? null;
    return { found: tag.length > 0, value, locked: /\bdisabled=""/.test(tag) };
  },
  /** N4 — no price, no payment and nothing of Stripe. */
  noPayment(text: string) {
    return (
      text.length > 0 && !/\$\s?\d|stripe|\bpay\b|\bpay\s*&|payment|checkout|billing/i.test(text)
    );
  },
  /** N10 — the page's handler: the flow, then the outcome as one line, the sample opening anyway. */
  pageHandler(src: string) {
    return (
      /startSampleWithDetails\(\{\s*name,\s*dates,\s*venueName,\s*venueTimingStart,\s*venueTimingEnd,?\s*\}\)/.test(
        src
      ) &&
      /result\.kind === 'opened'\)\s*\{\s*window\.location\.href = result\.href;/.test(src) &&
      /result\.kind === 'saveError'\)\s*\{[\s\S]{0,200}setTimeout\(\(\) => \{\s*window\.location\.href = result\.href;/.test(
        src
      ) &&
      /\{\s*words: SAMPLE_EVENT_WORDS\.SAVE_FAILED, href: outcome\.href\s*\}/.test(src) &&
      /\{DEMO_START_WORDS\.GO_TO_IT\}/.test(src) &&
      !/fetch\(/.test(src)
    );
  },
  /** N11 — /demo: the development-only button opens the sample's page, and /demo fetches nothing. */
  demoDoor(src: string) {
    return (
      /const SAMPLE_PAGE = '\/demo\/new';/.test(src) &&
      /process\.env\.NODE_ENV === 'development' && \(\s*<button\s+onClick=\{\(\) => window\.location\.assign\(SAMPLE_PAGE\)\}/.test(
        src
      ) &&
      !/fetch\(/.test(src) &&
      !/useState|DEMO_START_WORDS/.test(src)
    );
  },
  /** C4 — Moment 1's select maps the household's own choices; the old cross-household filter is gone. */
  moment1Picker(src: string) {
    const at = src.indexOf('id="household-channel"');
    const select = at >= 0 ? src.slice(at, src.indexOf('</select>', at)) : '';
    return (
      /\{!isHostHouseholdForm && channelCandidates\.length > 0 && \(/.test(src) &&
      select.includes("{name.trim() ? `${name.trim()} (main contact)` : 'The main contact'}") &&
      /\{moment1ChannelChoices\(\{[\s\S]*?\}\)\.map\(\(c\) => \(\s*<option key=\{c\.personEventId\} value=\{c\.personEventId\}>\s*\{c\.label\}\s*<\/option>/.test(
        select
      ) &&
      /householdId: editingHousehold\?\.id/.test(select) &&
      /picked: contactPersonEventId/.test(select) &&
      !/channelCandidates\s*\.filter/.test(select) &&
      !src.includes('householdId !== editingHousehold?.id')
    );
  },
  /** C4 — the pre-flight's select maps its household's choices; the default and its guard as they were. */
  preflightPicker(src: string) {
    const at = src.indexOf('Who should Gather talk to for the kids in this household?');
    const select = at >= 0 ? src.slice(at, src.indexOf('</select>', at)) : '';
    return (
      /\{!h\.isHostHousehold && \(/.test(src) &&
      select.includes('<option value="">{h.label} (main contact)</option>') &&
      /\{preflightChannelChoices\(h, channelCandidates\)\.map\(\(c\) => \(\s*<option key=\{c\.personEventId\} value=\{c\.personEventId\}>\s*\{c\.label\}\s*<\/option>/.test(
        select
      ) &&
      !/channelCandidates\s*\.filter/.test(select)
    );
  },
  /** R1 — the modal uses Moment 1's row, columns and box (read in the setup page too). */
  rightColumnLayout(modal: string, setup: string) {
    return (
      [M1_ROW, M1_LEFT, M1_PHONE, M1_RIGHT, M1_STICKY, M1_BOX].every((c) =>
        setup.includes(`className="${c}"`)
      ) &&
      modal.includes(`<div className="${M2_BOX}">`) &&
      modal.includes(`<div className="${M1_ROW}">`) &&
      modal.includes(`<div className="${M1_LEFT}">`) &&
      modal.includes(`<div className="${M1_RIGHT}">`) &&
      modal.includes(`<div className="${M2_STICKY}">`) &&
      !modal.includes('max-w-2xl mx-auto px-6 py-8 pb-32">')
    );
  },
  /** R2 — the order: the row, the questions (the strip to the foot choices, the phone copy under Notes), then the column, then the bar. */
  rightColumnOrder(modal: string) {
    const at = (x: string) => modal.indexOf(x);
    const marks = [
      `<div className="${M1_ROW}">`,
      `<div className="${M1_LEFT}">`,
      '<MomentArc currentMoment={2}',
      '<NotesAccordion',
      `<div className="mt-6 ${PICKS_BOX} md:hidden">`,
      '<QuietChoices',
      `<div className="${M1_RIGHT}">`,
      '<div className="fixed bottom-0 left-0 right-0',
    ].map(at);
    return marks.every((m, i) => m >= 0 && (i === 0 || m > marks[i - 1]));
  },
  /** R3 — the table twice, as Moment 1 draws its list: the phone copy, and the column's, after a kind is picked. */
  rightColumnTable(modal: string) {
    const count = (x: string) => modal.split(x).length - 1;
    const column = between(
      modal,
      `<div className="${M2_STICKY}">`,
      '<div className="fixed bottom-0'
    );
    return (
      count(PICKS_TABLE) === 2 &&
      count(PICKS_HEAD) === 2 &&
      flat(column).startsWith(
        flat(
          `<div className="${M2_STICKY}">{state.eventType && <div className="${PICKS_BOX}">${PICKS_HEAD}${PICKS_TABLE}</div>}</div>`
        )
      )
    );
  },
  /** E3, E5 — the event's line, then the plan's heading straight after it. */
  lineBeforeHeading(html: string, words: string) {
    const m = html.match(/<p data-drop-off-line=""[^>]*>([^<]*)<\/p>(<h1\b)?/);
    return (
      !!m &&
      m[1] === words.replace(/’/g, '’') &&
      !!m[2] &&
      (html.match(/data-drop-off-line/g) ?? []).length === 1
    );
  },
  /**
   * E4, E5 — Moment 3: the line in the TOP ROW, after W10 and before the event's details, ahead of
   * the strip, with no margin of its own (founder's ruling, 20 Oct 2026: on a computer it adds no
   * height above the lists; batch11 C7's row must rest where it did before item 7).
   */
  lineInMoment3TopRow(html: string, words: string) {
    const line = html.indexOf('<p data-drop-off-line=""');
    const back = html.indexOf('>← Back to “What’s the plan?”</button>');
    const name = html.indexOf('data-event-details-button');
    const strip = html.indexOf('data-moment-strip');
    // [[GTC-399]] item 2: the working screen no longer draws Moment 3's two lead-in blocks (they
    // are on its opening page), so the first thing after the strip is the heading.
    const heading = html.indexOf('Now. Who&#x27;s on what.');
    const m = html.slice(line).match(/^<p data-drop-off-line="" class="([^"]*)">([^<]*)<\/p>/);
    return (
      back > 0 &&
      line > back &&
      name > line &&
      strip > name &&
      heading > strip &&
      !html.includes('data-moment-words') &&
      !!m &&
      m[2] === words &&
      !/\bm[tby]-|\bmy-|\bp[tby]-/.test(m[1]) &&
      (html.match(/data-drop-off-line/g) ?? []).length === 1
    );
  },
  /** E6 — an item's own drop-off on its row, in DropOffDisplay's words, and only on that row. */
  rowDropOff(html: string, rowStart: string, otherRowStart: string, words: string[]) {
    const a = html.indexOf(rowStart);
    const b = html.indexOf(otherRowStart);
    if (a < 0 || b < 0) return false;
    const own = a < b ? html.slice(a, b) : html.slice(a);
    const other = a < b ? html.slice(b) : html.slice(b, a);
    const text = textOf(own);
    let at = 0;
    for (const w of words) {
      const i = text.indexOf(w, at);
      if (i < 0) return false;
      at = i + w.length;
    }
    return !textOf(other).includes('Drop-off:') && !textOf(other).includes('By:');
  },
  /**
   * C5 — the setup page's code that builds the dropdown's list: every `setChannelCandidates(` call,
   * from its name to its closing bracket. [[GTC-395]] ruling, 20 Oct 2026: C5 pins only this code on
   * the setup page (item 7 edits the page elsewhere).
   */
  candidateCalls(src: string) {
    const out: string[] = [];
    let at = src.indexOf('setChannelCandidates(');
    while (at >= 0) {
      let depth = 0;
      let end = -1;
      for (let i = at + 'setChannelCandidates'.length; i < src.length; i++) {
        if (src[i] === '(') depth++;
        else if (src[i] === ')' && --depth === 0) {
          end = i + 1;
          break;
        }
      }
      out.push(end > 0 ? src.slice(at, end) : src.slice(at));
      at = src.indexOf('setChannelCandidates(', at + 1);
    }
    return out;
  },
};
// ── CHECKS-END ───────────────────────────────────────────────────────────────

// ══ Items 1 and 2 ════════════════════════════════════════════════════════════
async function layerF() {
  section('F — items 1 and 2: the front page has only "Try it yourself"');
  /** The page as a build for `env` draws it (the button is development-only until part D). */
  const draw = (env: string) => {
    const was = process.env.NODE_ENV;
    (process.env as any).NODE_ENV = env;
    try {
      return render(createElement(DemoPage));
    } finally {
      (process.env as any).NODE_ENV = was;
    }
  };
  const dev = draw('development');
  const prod = draw('production');
  assert(
    'F',
    'F1 on the founder’s Mac (development): the heading "Gather" and one button, "Try it yourself", and nothing else',
    CHECKS.frontPage(dev, [TRY_IT]),
    dev.slice(0, 400)
  );
  assert(
    'F',
    'F2 in a production build: the heading "Gather" and no button (until GTC-392 part D)',
    CHECKS.frontPage(prod, []),
    prod.slice(0, 400)
  );
  assert(
    'F',
    'F3 the page’s code: the Sarah button and its handler gone, nothing posts to the session route without a body',
    CHECKS.noSarah(code(DEMO_PAGE))
  );
  assert(
    'F',
    'F4 CONTROL: the session, tokens and reset routes and the sample’s own code are not edited since demo-tweaks-good',
    NOT_EDITED_F.every((f) => read(f).length > 0) && unchangedSinceGood(NOT_EDITED_F)
  );
}

// ══ Item 3 ═══════════════════════════════════════════════════════════════════
async function layerN() {
  section('N — item 3: the sample starts on its own pre-filled "Create Your Event" page');
  const LIB = await load('../src/lib/demo/new-event');
  const PAGE = await load('../src/app/demo/new/page');
  const LAYOUT = await load('../src/app/demo/new/layout');
  const W = LIB ?? {};
  assert(
    'N',
    'N1 the heading and labels are the real page’s, the venue labels the Edit event box’s, each read in its own file',
    CHECKS.wordsInFile(read(PLAN_NEW), REAL_WORDS) &&
      CHECKS.wordsInFile(read(EDIT_BOX), BOX_WORDS) &&
      JSON.stringify(Object.values(W.CREATE_EVENT_WORDS ?? {})) === JSON.stringify(REAL_WORDS) &&
      JSON.stringify(Object.values(W.VENUE_WORDS ?? {})) === JSON.stringify(BOX_WORDS)
  );
  assert(
    'N',
    'N2 the only new words: the line and the button, the real page’s minus the payment; "Starting…" and the failure line reused from their files',
    read(PLAN_NEW).includes(REAL_LINE) &&
      read(PLAN_NEW).includes(REAL_BUTTON) &&
      W.SAMPLE_EVENT_WORDS?.LINE === NEW_LINE &&
      W.SAMPLE_EVENT_WORDS?.BUTTON === NEW_BUTTON &&
      atGood('src/app/demo/page.tsx').includes(`'${STARTING}'`) &&
      W.SAMPLE_EVENT_WORDS?.STARTING === STARTING &&
      read(EDIT_BOX).includes(`'${SAVE_FAILED}'`) &&
      W.SAMPLE_EVENT_WORDS?.SAVE_FAILED === SAVE_FAILED &&
      Object.keys(W.SAMPLE_EVENT_WORDS ?? {}).length === 4
  );
  /** The page as the founder's Mac draws it: the layout round the page, in development. */
  const drawPage = (env: string) => {
    const was = process.env.NODE_ENV;
    (process.env as any).NODE_ENV = env;
    try {
      if (!PAGE?.default || !LAYOUT?.default) return { html: '', threw: '' };
      try {
        return {
          html: renderToStaticMarkup(
            createElement(LAYOUT.default, null, createElement(PAGE.default))
          ),
          threw: '',
        };
      } catch (err) {
        const e = err as { message?: string; digest?: string };
        return { html: '', threw: `${e.digest ?? ''} ${e.message ?? ''}` };
      }
    } finally {
      (process.env as any).NODE_ENV = was;
    }
  };
  const dev = drawPage('development');
  const html = dev.html;
  const day = sampleDay(new Date());
  const field = (id: string) => CHECKS.input(html, id);
  assert(
    'N',
    'N3 on the founder’s Mac: the heading, the line, the labels in the real page’s order then the venue, and the button',
    /<h1\b[^>]*>Create Your Event<\/h1>/.test(html) &&
      html.includes(`<p class="text-gray-600">${NEW_LINE}</p>`) &&
      CHECKS.labelsInOrder(html, [
        'Event Name',
        'Your Name',
        'Email',
        'Phone',
        'Date',
        'Venue Details',
        'Venue Name',
        'Event Start Time',
        'Event End Time',
      ]) &&
      /<button type="submit"[^>]*>Create<\/button>/.test(html),
    html.slice(0, 300)
  );
  assert(
    'N',
    'N4 pre-filled: her event name, the sample’s day and a made-up venue and times, editable; the host’s name, email and phone filled and locked',
    field('name').value === W12 &&
      !field('name').locked &&
      field('hostName').value === W13 &&
      field('hostName').locked &&
      field('email').value === MADE_UP.email &&
      field('email').locked &&
      field('phone').value === MADE_UP.phone &&
      field('phone').locked &&
      field('startDate').value === day &&
      !field('startDate').locked &&
      field('venueName').value === MADE_UP.venueName &&
      !field('venueName').locked &&
      field('venueTimingStart').value === MADE_UP.venueTimingStart &&
      !field('venueTimingStart').locked &&
      field('venueTimingEnd').value === MADE_UP.venueTimingEnd &&
      !field('venueTimingEnd').locked,
    JSON.stringify({ day, start: field('startDate'), name: field('name') })
  );
  assert(
    'N',
    'N5 no $25, no Stripe and no payment word on the page, drawn or in its code and words',
    CHECKS.noPayment(html) &&
      CHECKS.noPayment(code(NEW_PAGE)) &&
      CHECKS.noPayment(code(NEW_LIB)) &&
      CHECKS.noPayment(code(NEW_LAYOUT))
  );
  const prod = drawPage('production');
  assert(
    'N',
    'N6 development-only: in a production build the page is a plain not-found',
    html.length > 0 &&
      prod.html === '' &&
      /NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/.test(prod.threw),
    prod.threw.slice(0, 120)
  );
  // The flow, driven by a hand-written fetch.
  const start = LIB?.startSampleWithDetails as
    | ((d: unknown, f: typeof fetch) => Promise<any>)
    | undefined;
  const run = async (answer: Parameters<typeof fakeFetch>[0]) => {
    const f = fakeFetch(answer);
    const outcome = start ? await start(PAGE_DETAILS, f.fn).catch(() => null) : null;
    return { outcome, calls: f.calls };
  };
  const ok = await run((url, method) =>
    url === '/api/demo/session' && method === 'POST'
      ? STARTED
      : url === '/api/events/ev-1' && method === 'GET'
        ? { status: 200, json: { event: FIXTURE_EVENT } }
        : url === '/api/events/ev-1' && method === 'PATCH'
          ? { status: 200, json: { event: {} } }
          : { status: 404, json: {} }
  );
  assert(
    'N',
    'N7 the button starts the sample as the old button did, then reads and saves it through the Edit event route, once each, and opens the setup page',
    JSON.stringify(ok.calls.map((c) => `${c.method} ${c.url}`)) ===
      JSON.stringify([
        'POST /api/demo/session',
        'GET /api/events/ev-1',
        'PATCH /api/events/ev-1',
      ]) &&
      JSON.stringify(ok.calls[0]?.body) === JSON.stringify({ start: 'copy' }) &&
      JSON.stringify(ok.outcome) === JSON.stringify({ kind: 'opened', href: '/plan/ev-1/setup' }),
    JSON.stringify(ok)
  );
  const boxKeys = (() => {
    const src = read(EDIT_BOX);
    const at = src.indexOf('const [formData, setFormData] = useState({');
    const block = at >= 0 ? src.slice(at, src.indexOf('});', at)) : '';
    return [...block.matchAll(/^\s*(\w+):/gm)].map((m) => m[1]);
  })();
  assert(
    'N',
    'N8 the save sends the whole event as the Edit event box does (its form’s own fields, no others), with her name, dates and venue on top',
    boxKeys.length === 24 &&
      JSON.stringify(Object.keys((ok.calls[2]?.body as object) ?? {}).sort()) ===
        JSON.stringify([...boxKeys].sort()) &&
      JSON.stringify(ok.calls[2]?.body) === JSON.stringify(EXPECTED_PATCH),
    JSON.stringify(ok.calls[2]?.body)
  );
  const readRefused = await run((url, method) =>
    url === '/api/demo/session' ? STARTED : method === 'GET' ? { status: 403, json: {} } : 'throw'
  );
  const writeFails = await run((url, method) =>
    url === '/api/demo/session'
      ? STARTED
      : method === 'GET'
        ? { status: 200, json: { event: FIXTURE_EVENT } }
        : { status: 500, json: { error: 'x' } }
  );
  const readThrows = await run((url) => (url === '/api/demo/session' ? STARTED : 'throw'));
  const saveError = { kind: 'saveError', href: '/plan/ev-1/setup' };
  const once = (calls: Call[]) => calls.filter((c) => c.url === '/api/demo/session').length === 1;
  assert(
    'N',
    'N9 if the save fails the sample still opens, with its own line; nothing is retried',
    JSON.stringify(readRefused.outcome) === JSON.stringify(saveError) &&
      !readRefused.calls.some((c) => c.method === 'PATCH') &&
      JSON.stringify(writeFails.outcome) === JSON.stringify(saveError) &&
      writeFails.calls.filter((c) => c.method === 'PATCH').length === 1 &&
      JSON.stringify(readThrows.outcome) === JSON.stringify(saveError) &&
      [readRefused, writeFails, readThrows].every((r) => once(r.calls)),
    JSON.stringify([readRefused.outcome, writeFails.outcome, readThrows.outcome])
  );
  const openAlready = await run((url) =>
    url === '/api/demo/session'
      ? { status: 409, json: { error: 'Already signed in' } }
      : { status: 200, json: { events: [{ id: 'e-real' }, { id: 'e9', isDemo: true }] } }
  );
  const signedIn = await run((url) =>
    url === '/api/demo/session'
      ? { status: 409, json: {} }
      : { status: 200, json: { events: [{ id: 'e-real', isDemo: false }] } }
  );
  const limited = await run(() => ({ status: 429, json: { error: 'Please try again later.' } }));
  const broken = await run(() => ({ status: 500, json: {} }));
  const offline = await run(() => 'throw');
  const noSave = (calls: Call[]) => !calls.some((c) => c.url.startsWith('/api/events/'));
  assert(
    'N',
    'N10 the start notes and limits /demo showed, the same DEMO_START_WORDS lines unchanged, and no save when no sample started',
    JSON.stringify(openAlready.outcome) ===
      JSON.stringify({ kind: 'refused', words: W10, href: '/plan/e9/setup' }) &&
      JSON.stringify(signedIn.outcome) === JSON.stringify({ kind: 'refused', words: W9 }) &&
      JSON.stringify(limited.outcome) ===
        JSON.stringify({ kind: 'refused', words: 'Please try again later.' }) &&
      JSON.stringify(broken.outcome) === JSON.stringify({ kind: 'refused', words: W15 }) &&
      JSON.stringify(offline.outcome) === JSON.stringify({ kind: 'refused', words: W15 }) &&
      [openAlready, signedIn, limited, broken, offline].every((r) => noSave(r.calls)) &&
      read('src/lib/demo/start-limit.ts').includes(`GO_TO_IT: '${GO_TO_IT}'`),
    JSON.stringify([openAlready.outcome, signedIn.outcome, limited.outcome])
  );
  assert(
    'N',
    'N11 the page’s button: the flow with her five details; opened goes to the setup page; a failed save shows its line and the link, then opens anyway',
    CHECKS.pageHandler(code(NEW_PAGE))
  );
  assert(
    'N',
    'N12 /demo’s "Try it yourself" (still development-only) opens /demo/new, and /demo fetches nothing',
    CHECKS.demoDoor(code(DEMO_PAGE))
  );
  assert(
    'N',
    'N13 CONTROL: the real page, the Edit event box and its route, the session route and the sample’s own code are not edited since demo-tweaks-good (the real page, which GTC-407 edits: not between demo-tweaks-good and GTC-407’s base, 1b8bfe7)',
    NOT_EDITED_N.every((f) => read(f).length > 0) &&
      unchangedSinceGood(NOT_EDITED_N.filter((f) => f !== PLAN_NEW)) &&
      // [[GTC-407]]: the real page asked at GTC-407's base, a fixed commit.
      spawnSync('git', ['diff', '--quiet', GOOD_TAG, GTC407_BASE, '--', PLAN_NEW], { cwd: ROOT })
        .status === 0
  );
}

// ══ Item 4 ═══════════════════════════════════════════════════════════════════
async function layerC() {
  section('C — item 4: "Who should Gather talk to" lists this household’s adults only');
  const CH = await load('../src/components/plan/household-channel-choices');
  const m1 = (picked: string | null) =>
    CH?.moment1ChannelChoices ? CH.moment1ChannelChoices({ ...ANA_FORM, picked }) : null;
  const pf = (picked: string | null) =>
    CH?.preflightChannelChoices ? CH.preflightChannelChoices(PF_ANA(picked), PF_CANDIDATES) : null;
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  assert(
    'C',
    'C1 Moment 1: the household’s own adults from the form (partner, guest, helper ticked as an adult), each once saved; never its main contact, a child or another household',
    same(m1(null), ANA_ADULTS) && same(m1('pe-ross'), ANA_ADULTS),
    JSON.stringify(m1(null))
  );
  assert(
    'C',
    'C2 Moment 1: an existing pick in another household stays, labelled as before, while it is the pick; changed away, it is gone',
    same(m1('pe-bob'), [
      ...ANA_ADULTS,
      { personEventId: 'pe-bob', label: 'Bob Reid — Bob Reid’s household' },
    ]) && same(m1('pe-mere'), ANA_ADULTS),
    JSON.stringify(m1('pe-bob'))
  );
  const ross = [{ personEventId: 'pe-ross', label: 'Ross Ngata' }];
  assert(
    'C',
    'C3 the pre-flight: the household’s own candidates but its main contact, by name; a kept pick elsewhere with its suffix while it is the pick',
    same(pf(null), ross) &&
      same(pf('pe-ross'), ross) &&
      same(pf('pe-bob'), [
        ...ross,
        { personEventId: 'pe-bob', label: 'Bob Reid — Bob Reid’s household' },
      ]) &&
      same(pf('pe-lee'), [
        ...ross,
        { personEventId: 'pe-lee', label: 'Lee Tan — not in a household' },
      ]),
    JSON.stringify([pf(null), pf('pe-bob'), pf('pe-lee')])
  );
  assert(
    'C',
    'C4 both screens draw those choices under the same default, still never on the host’s own household',
    CHECKS.moment1Picker(code(M1_FORM)) &&
      CHECKS.preflightPicker(code(PREFLIGHT)) &&
      /from '@\/components\/plan\/household-channel-choices'/.test(code(M1_FORM)) &&
      /from '@\/components\/plan\/household-channel-choices'/.test(code(PREFLIGHT))
  );
  assert(
    'C',
    'C5 CONTROL: the three routes that check a pick, src/lib/households and the schema are not edited since demo-tweaks-good, and the setup page’s code that builds the dropdown’s list (its two setChannelCandidates( calls) is the same code as there',
    NOT_EDITED_C.every((f) => read(f).length > 0) &&
      unchangedSinceGood(NOT_EDITED_C) &&
      CHECKS.candidateCalls(atGood(SETUP_FILE_C)).length === 2 &&
      CHECKS.candidateCalls(atGood(SETUP_FILE_C)).every((c) => c.length > 200) &&
      JSON.stringify(CHECKS.candidateCalls(read(SETUP_FILE_C))) ===
        JSON.stringify(CHECKS.candidateCalls(atGood(SETUP_FILE_C)))
  );
}

// ══ Item 5 ═══════════════════════════════════════════════════════════════════
async function layerR() {
  section('R — item 5: "What you’ve picked" on the right, in Moment 1’s arrangement');
  const modal = code(MODAL);
  const head = stripComments(atGood(MODAL));
  assert(
    'R',
    'R1 Moment 1’s row, columns, widths and breakpoint (as the setup page writes them); the box widens at md only; the column 81px shorter',
    CHECKS.rightColumnLayout(modal, code(SETUP_PAGE))
  );
  assert(
    'R',
    'R2 on a computer the questions then the column; on a phone the table under Notes, before the foot choices, as now; the bar after both',
    CHECKS.rightColumnOrder(modal)
  );
  assert(
    'R',
    'R3 the table drawn twice, as Moment 1 draws its list: the phone copy and the column’s, the column’s once a kind is picked',
    CHECKS.rightColumnTable(modal)
  );
  const bar = (src: string) =>
    between(src, '<div className="fixed bottom-0 left-0 right-0', '\n  );\n}');
  const quiet = (src: string) => between(src, '<QuietChoices', '/>');
  const questions = (src: string) =>
    between(src, '<MomentArc currentMoment={2}', '<QuietChoices').replace(' md:hidden', '');
  assert(
    'R',
    'R4 CONTROL: the Generate bar and the foot choices as they were (the same code)',
    bar(head).length > 500 &&
      flat(bar(modal)) === flat(bar(head)) &&
      quiet(head).length > 100 &&
      flat(quiet(modal)) === flat(quiet(head))
  );
  assert(
    'R',
    'R5 CONTROL: layout only — the questions’ code as it was but its indent and the phone copy’s md:hidden; the table and the words not edited',
    questions(head).length > 5000 &&
      flat(questions(modal)) === flat(questions(head)) &&
      flat(between(modal, 'export function PicksTable', '\nfunction ')) ===
        flat(between(head, 'export function PicksTable', '\nfunction ')) &&
      between(head, 'export function PicksTable', '\nfunction ').length > 200 &&
      unchangedSinceGood([PICKS_LIB])
  );
}

// ══ Item 7 ═══════════════════════════════════════════════════════════════════
async function layerE() {
  section('E — item 7: where and when to drop off');
  const DW = await load('../src/lib/items/drop-off-words');
  const line = (f: Record<string, unknown>) =>
    DW?.eventDropOffLine ? DW.eventDropOffLine(f) : null;
  assert(
    'E',
    'E1 the event’s line, from its venue and times: where, then when; with no venue, one plain line',
    DW?.DROP_OFF_WORDS?.AT === DROP_AT &&
      DW?.DROP_OFF_WORDS?.NO_VENUE === NO_VENUE &&
      line(VENUE_FACTS) === 'Drop off at Riverside Park, 12:00pm to 4:00pm' &&
      line({ venueName: 'Riverside Park', venueTimingStart: '12:00pm' }) ===
        'Drop off at Riverside Park, from 12:00pm' &&
      line({ venueName: 'Riverside Park', venueTimingEnd: '4:00pm' }) ===
        'Drop off at Riverside Park, by 4:00pm' &&
      line({ venueName: ' Riverside Park ' }) === 'Drop off at Riverside Park' &&
      line({ venueName: '  ', venueTimingStart: '12:00pm' }) === NO_VENUE &&
      line(NO_VENUE_FACTS) === NO_VENUE,
    JSON.stringify([line(VENUE_FACTS), line(NO_VENUE_FACTS)])
  );
  const lineSrc = code(DROP_LINE_FILE);
  assert(
    'E',
    'E2 one shared component draws it, a plain line that wraps; no hook, no router, no fetch',
    lineSrc.length > 0 &&
      /eventDropOffLine\(facts\)/.test(lineSrc) &&
      /break-words/.test(lineSrc) &&
      !/\buse[A-Z]\w*\(|useRouter|fetch\(|'use client'/.test(lineSrc)
  );
  const plan = drawPlan({ details: VENUE_FACTS });
  const planNoVenue = drawPlan({ details: NO_VENUE_FACTS });
  const planBare = drawPlan({});
  assert(
    'E',
    'E3 Moment 2’s plan: the line at the top, straight above the heading (the count line still the heading’s next)',
    CHECKS.lineBeforeHeading(plan, 'Drop off at Riverside Park, 12:00pm to 4:00pm') &&
      /<\/h1><p class="text-sm text-gray-500/.test(plan) &&
      !planBare.includes('data-drop-off-line'),
    plan.slice(plan.indexOf('data-drop-off-line') - 40, plan.indexOf('data-drop-off-line') + 200)
  );
  const m3 = drawM3({ details: VENUE_FACTS });
  const m3NoVenue = drawM3({ details: NO_VENUE_FACTS });
  const m3Bare = drawM3({});
  assert(
    'E',
    'E4 Moment 3: the line at the top, in the top row beside the event’s details (after W10, before the strip), with no margin of its own',
    CHECKS.lineInMoment3TopRow(m3, 'Drop off at Riverside Park, 12:00pm to 4:00pm') &&
      !m3Bare.includes('data-drop-off-line'),
    m3.slice(m3.indexOf('data-drop-off-line') - 40, m3.indexOf('data-drop-off-line') + 200)
  );
  const plainNoVenue = (html: string) => {
    const m = html.match(/<p data-drop-off-line=""[^>]*>([\s\S]*?)<\/p>/);
    return !!m && m[1] === NO_VENUE && !/<a\b|<button\b/.test(m[1]);
  };
  assert(
    'E',
    'E5 with no venue, both screens show one plain line that says so (neither screen has a way to the venue step)',
    plainNoVenue(planNoVenue) &&
      plainNoVenue(m3NoVenue) &&
      CHECKS.lineBeforeHeading(planNoVenue, NO_VENUE) &&
      CHECKS.lineInMoment3TopRow(m3NoVenue, NO_VENUE)
  );
  assert(
    'E',
    'E6 an item with its own place or note shows it on its row, through DropOffDisplay in its own words; an item without, nothing',
    CHECKS.rowDropOff(plan, '>Roast lamb</button>', '>Bread rolls</button>', LAMB_DROP) &&
      CHECKS.rowDropOff(m3, '<span>Roast lamb</span>', '<span>Bread rolls</span>', LAMB_DROP) &&
      /<DropOffDisplay\b[\s\S]{0,300}dropOffLocation=\{item\.dropOffLocation\}/.test(
        code(PLAN_VIEW)
      ) &&
      /<DropOffDisplay\b[\s\S]{0,300}dropOffLocation=\{item\.dropOffLocation\}/.test(code(M3_VIEW)),
    textOf(plan).slice(0, 0)
  );
  const setup = code(SETUP_PAGE);
  assert(
    'E',
    'E7 the setup page passes each item’s own place and note through (already sent by the items read; no route changed)',
    /dropOffLocation\?: string \| null;\s*dropOffNote\?: string \| null;/.test(setup) &&
      (
        setup.match(
          /dropOffLocation: item\.dropOffLocation \?\? null,\s*dropOffNote: item\.dropOffNote \?\? null,/g
        ) ?? []
      ).length === 2 &&
      /dropOffLocation\?: string \| null;/.test(code(PLAN_VIEW)) &&
      /dropOffLocation\?: string \| null;/.test(code(M3_VIEW))
  );
  assert(
    'E',
    'E8 CONTROL: DropOffDisplay and its helper, every route, the messages, the press, email, texts and the schema are not edited since demo-tweaks-good (the one route GTC-400 edits: not between demo-tweaks-good and GTC-400’s base, 528e8ad; the four GTC-401 edits: not between demo-tweaks-good and GTC-401’s base, 71a6287; the two GTC-402 edits: not between demo-tweaks-good and GTC-402’s base, dea03c1; the three GTC-403 edits: not between demo-tweaks-good and GTC-403’s base, a8e1117)',
    NOT_EDITED_E.every((f) => fs.existsSync(path.join(ROOT, f))) &&
      unchangedSinceGood([
        ...NOT_EDITED_E,
        ...GTC400_EXCLUDED,
        ...GTC401_EXCLUDED,
        ...GTC402_EXCLUDED,
        ...GTC403_EXCLUDED,
      ]) &&
      spawnSync('git', ['cat-file', '-e', `${GTC400_BASE}:${GTC400_ROUTE}`], { cwd: ROOT })
        .status === 0 &&
      spawnSync('git', ['diff', '--quiet', GOOD_TAG, GTC400_BASE, '--', GTC400_ROUTE], {
        cwd: ROOT,
      }).status === 0 &&
      GTC401_ROUTES.every(
        (f) =>
          spawnSync('git', ['cat-file', '-e', `${GTC401_BASE}:${f}`], { cwd: ROOT }).status === 0
      ) &&
      spawnSync('git', ['diff', '--quiet', GOOD_TAG, GTC401_BASE, '--', ...GTC401_ROUTES], {
        cwd: ROOT,
      }).status === 0 &&
      GTC402_ROUTES.every(
        (f) =>
          spawnSync('git', ['cat-file', '-e', `${GTC402_BASE}:${f}`], { cwd: ROOT }).status === 0
      ) &&
      spawnSync('git', ['diff', '--quiet', GOOD_TAG, GTC402_BASE, '--', ...GTC402_ROUTES], {
        cwd: ROOT,
      }).status === 0 &&
      GTC403_ROUTES.every(
        (f) =>
          spawnSync('git', ['cat-file', '-e', `${GTC403_BASE}:${f}`], { cwd: ROOT }).status === 0
      ) &&
      spawnSync('git', ['diff', '--quiet', GOOD_TAG, GTC403_BASE, '--', ...GTC403_ROUTES], {
        cwd: ROOT,
      }).status === 0
  );
}

async function main() {
  await layerF();
  await layerN();
  await layerC();
  await layerR();
  await layerE();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log(reds.map((r) => `  - ${r}`).join('\n'));
    process.exit(1);
  }
  process.exit(0);
}

// A dry run imports CHECKS only (DEMO_TWEAKS_2_DRY_RUN=1); the suite runs otherwise.
if (process.env.DEMO_TWEAKS_2_DRY_RUN !== '1') {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
