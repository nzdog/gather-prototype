/**
 * GTC-366 — walkthrough batch 4: the pre-flight and the board.
 *
 * The founder walked the Moment flow himself and sorted what he found (GTC-189's Fourth ruling).
 * This suite pins batch 4 to the words he ruled on the plan (GTC-366, PLAN RULINGS 2026-10-06, W1
 * to W17, with his fix to W16) and to the behaviour he chose (Q1 to Q18, Q10 as A):
 *
 *   32  under the greyed Send, a line naming the first step not yet ticked (W1); one tap scrolls
 *       there and puts the focus on its box, ticking and pressing nothing (Q1 to Q4)
 *   8   "Answers by" on the board's top line after the press, the event-level decide-by in NZ time
 *       (W2, Q5 to Q7); the days to the event behind a "Days to go" button (W3 to W6, Q8)
 *   9   a key to the colours behind "What the colours mean", below the households and above the
 *       doors (W7 to W12, Q10 A, Q11)
 *   11  "Print the list" from the board in one tap, through one print shared with the old
 *       dashboard: every name escaped, amounts in plain words, only the printed fields kept (W13 to
 *       W17, Q12 to Q16)
 *
 * The pure and render layers run in memory. The Chrome layer drives the dev server in the
 * walled-off headless Chrome, on fixtures of its own (example.com addresses, no phones; the board's
 * event written as sent directly, with nothing queued), behind the three safeguards of
 * GATHER-BUILD-CONSTANTS.md ("Looking on screen") and a fourth (Q17): the browser fails every
 * plan-making request AND every request to a door that sends, before it leaves the page (both
 * proven on probe URLs first); every click is `clickGuarded`. The print only ever runs with
 * `window.open` stubbed, never through a dialog. Never pressed: Send, "Send it again", Generate,
 * Regenerate, Move on, New Event. Opening the old dashboard makes its guest links (AccessToken
 * rows) as it always does — approved for this fixture only: counted while they exist and removed
 * by id. Every fixture row is counted while it exists and removed by id; the InviteEvent and
 * OutboundMessage totals are asserted as found.
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

// ── The ruled words, verbatim (GTC-366, PLAN RULINGS 2026-10-06) ─────────────
const W1 = (n: number, title: string) => `Go to step ${n}: ${title} ↑`;
const STEP_TITLES = [
  'What is still loose',
  'Dietary needs',
  'Who Gather talks to',
  'The message, shown',
  'Ready',
];
const W2 = (day: string) => ` · Answers by ${day}`;
const W3 = 'Days to go';
const W4 = (n: number) => `${n} days to go.`;
const W5 = '1 day to go.';
const W6 = 'It’s today.';
const W7 = 'What the colours mean';
const KEY: Array<[string, string]> = [
  ['RED', 'Needs you. Tap it for what to do.'], // W8
  ['AMBER', 'I’m looking after them: I’ve asked, and I’ll follow up.'], // W9
  ['GREEN', 'Settled. Nothing more needed from them.'], // W10
  ['NOT_CHASED', 'Not chased. I won’t follow them up.'], // W11
  ['OUT', 'Out. Not coming.'], // W12
];
const W13 = 'Print the list';
const W14 = 'Getting the list ready…';
const W15 = 'That didn’t work. Close this tab and try again from the board.';
/** The founder's fix. */
const W16 = 'Your browser blocked the print window. Allow pop-ups for Gather, then try again.';

/** React escapes these in text; `’` and `·` pass through. */
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** "Fri 18 Dec" in NZ time, worked out here independently of the module under test. */
const nzShort = (d: Date) =>
  new Intl.DateTimeFormat('en-NZ', {
    timeZone: 'Pacific/Auckland',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
    .formatToParts(d)
    .filter((p) => p.type !== 'literal')
    .map((p) => p.value)
    .join(' ');
const nzDay = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' }).format(d);

/**
 * HEAD's print, FROZEN: the old dashboard's "Download PDF" builder as it stood at `1fcf643`
 * (src/app/plan/[eventId]/page.tsx), copied verbatim into a function. P11d holds the shared
 * module to it, byte for byte, for names with nothing to escape — so the only changes are the
 * escaping and the amounts (W17), as ruled.
 */
function frozenHeadPrint(eventName: string, eventDate: string, items: any[]): string {
  const grouped = items.reduce<Record<string, any[]>>((acc, item) => {
    const key = item.team.name;
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
  const hasOrder = items.some((i) => i.team.displayOrder > 0);
  const cats = Object.keys(grouped).sort((a, b) => {
    if (hasOrder) {
      const oA = grouped[a][0]?.team.displayOrder ?? 0;
      const oB = grouped[b][0]?.team.displayOrder ?? 0;
      if (oA !== oB) return oA - oB;
    }
    return a.localeCompare(b);
  });

  const gatherLogo = `<svg viewBox="0 0 240 40" fill="none" xmlns="http://www.w3.org/2000/svg" style="height:32px;width:auto;"><circle cx="7" cy="7" r="2.5" fill="#6b7c6f"/><circle cx="15" cy="7" r="2.5" fill="#6b7c6f"/><circle cx="23" cy="7" r="2.5" fill="#6b7c6f"/><circle cx="31" cy="7" r="2.5" fill="#6b7c6f"/><circle cx="7" cy="15" r="2.5" fill="#6b7c6f"/><circle cx="15" cy="15" r="2.5" fill="#6b7c6f"/><circle cx="23" cy="15" r="2.5" fill="rgba(107,124,111,0.3)"/><circle cx="31" cy="15" r="2.5" fill="rgba(107,124,111,0.3)"/><circle cx="7" cy="23" r="2.5" fill="#6b7c6f"/><circle cx="15" cy="23" r="2.5" fill="#6b7c6f"/><circle cx="23" cy="23" r="2.5" fill="#6b7c6f"/><circle cx="31" cy="23" r="2.5" fill="#6b7c6f"/><circle cx="7" cy="31" r="2.5" fill="#6b7c6f"/><circle cx="15" cy="31" r="2.5" fill="#6b7c6f"/><circle cx="23" cy="31" r="2.5" fill="#6b7c6f"/><circle cx="31" cy="31" r="2.5" fill="#6b7c6f"/><text x="56" y="29" fill="#6b7c6f" style="font-family:'Source Serif 4',Georgia,serif;font-size:28px;font-weight:400;letter-spacing:-0.01em;">Gather</text></svg>`;

  let html = `<!DOCTYPE html><html><head><title>${eventName} — Items</title>
                      <style>
                        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 0 auto; padding: 24px; color: #111; }
                        .logo { margin-bottom: 16px; }
                        h1 { font-size: 20px; margin-bottom: 2px; }
                        .date { font-size: 14px; color: #666; margin-bottom: 24px; }
                        h2 { font-size: 16px; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin-top: 20px; }
                        table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
                        th, td { text-align: left; padding: 6px 8px; font-size: 13px; border-bottom: 1px solid #eee; }
                        th { font-weight: 600; color: #555; font-size: 11px; text-transform: uppercase; }
                        .qty { color: #555; }
                        .status-confirmed { color: #16a34a; }
                        .status-declined { color: #dc2626; }
                        .status-pending { color: #d97706; }
                        .status-unassigned { color: #999; font-style: italic; }
                        @media print { body { padding: 0; } .logo svg text { fill: #333; } }
                      </style></head><body>`;
  html += `<div class="logo">${gatherLogo}</div>`;
  html += `<h1>${eventName}</h1>`;
  if (eventDate) html += `<div class="date">${eventDate}</div>`;

  for (const cat of cats) {
    const catItems = grouped[cat];
    html += `<h2>${cat}</h2><table><thead><tr><th>Item</th><th>Qty</th><th>Assigned To</th><th>Status</th></tr></thead><tbody>`;
    for (const item of catItems) {
      const qty =
        item.quantityAmount && item.quantityUnit
          ? `${item.quantityAmount} ${item.quantityUnit}`
          : item.quantityText || '—';
      const assignee =
        item.assignment?.person?.name || '<span class="status-unassigned">Unassigned</span>';
      const status = item.assignment
        ? `<span class="status-${item.assignment.response === 'ACCEPTED' ? 'confirmed' : item.assignment.response === 'DECLINED' ? 'declined' : 'pending'}">${item.assignment.response === 'ACCEPTED' ? 'Confirmed' : item.assignment.response === 'DECLINED' ? 'Declined' : item.assignment.response === 'MAYBE' ? 'Maybe' : 'Pending'}</span>`
        : '';
      html += `<tr><td>${item.name}</td><td class="qty">${qty}</td><td>${assignee}</td><td>${status}</td></tr>`;
    }
    html += `</tbody></table>`;
  }

  html += `</body></html>`;
  return html;
}

/** An item as `GET /api/events/[id]/items` sends it, behind-the-scenes fields included (Q13). */
const apiItem = (
  name: string,
  team: [string, number],
  q: [number | null, string | null, string | null, string | null],
  holder: [string, string] | null
) => ({
  id: `i-${name.replace(/\W/g, '')}`,
  name,
  description: 'a description the print never shows',
  critical: false,
  quantityState: 'SPECIFIED',
  quantityAmount: q[0],
  quantityUnit: q[1],
  quantityUnitCustom: q[2],
  quantityText: q[3],
  dropOffAt: '2026-12-24T01:00:00.000Z',
  createdAt: '2026-10-01T01:00:00.000Z',
  team: { id: 't', name: team[0], displayOrder: team[1] },
  assignment: holder
    ? {
        id: 'a',
        response: holder[1],
        createdAt: '2026-10-02T01:00:00.000Z',
        decideByFollowupSentAt: '2026-10-03T01:00:00.000Z',
        person: { id: 'p', name: holder[0] },
      }
    : null,
});

/** A person, as the glance payload shapes one (as tests/glance-grid-test.tsx builds them). */
function person(over: Record<string, unknown> = {}): any {
  return {
    personEventId: `pe-${Math.random().toString(36).slice(2)}`,
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
      members: [
        person({ name: 'Ray Dalton', state: 'OUT', reasons: ['ATTENDANCE_NO'] }),
        person({ name: 'Aoife Dalton', state: 'NOT_CHASED', reasons: ['DONT_CHASE'] }),
      ],
    },
  ],
  unhoused: [],
  unassignedCritical: [],
  unassignedOrdinaryCount: 0,
};

/** Send's element exactly as it stands at `1fcf643` — Q1: "Send stays exactly as it is." */
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

// ══ IN MEMORY — the pure layer and the render ════════════════════════════════
async function runInMemory() {
  const NC = await load('../src/lib/preflight/next-check');
  const ED = await load('../src/lib/events/event-dates');
  const SP = await load('../src/components/glance/strip');
  const PR = await load('../src/lib/print/item-list');
  const GB = await load('../src/components/glance/GlanceBoard');

  // ── item 32 — the first unticked step ──────────────────────────────────────
  assert(
    'P',
    'P32a nothing ticked: the first unticked step is 1',
    ok(() => NC.firstUnticked({}) === 1)
  );
  assert(
    'P',
    'P32b step 1 ticked: the first unticked step is 2',
    ok(() => NC.firstUnticked({ 1: true }) === 2)
  );
  assert(
    'P',
    'P32c steps 1 to 4 ticked: the first unticked step is 5 (Q3)',
    ok(() => NC.firstUnticked({ 1: true, 2: true, 3: true, 4: true }) === 5)
  );
  assert(
    'P',
    'P32d all five ticked: there is no line to show',
    ok(() => NC.firstUnticked({ 1: true, 2: true, 3: true, 4: true, 5: true }) === null)
  );
  assert(
    'P',
    'P32e W1 composed from the steps’ own titles: "Go to step 2: Dietary needs ↑"',
    ok(
      () =>
        NC.goToStepLine(2) === W1(2, 'Dietary needs') &&
        STEP_TITLES.every((t, i) => NC.PREFLIGHT_STEP_TITLES[i] === t) &&
        NC.PREFLIGHT_STEP_TITLES.length === 5
    )
  );

  // ── item 8 — answers by, and the days to go ────────────────────────────────
  const sent = (endIso: string, offset: number | null = null) => ({
    status: 'CONFIRMING',
    sentAt: new Date('2026-11-20T00:00:00Z'),
    endDate: new Date(endIso),
    decideByOffsetHours: offset,
  });
  const at = (iso: string) => new Date(iso);
  // 2026-12-23T00:00Z is Wed 23 Dec, 1pm in NZ.
  assert(
    'P',
    'P8a the event-level decide-by, five days before the end date: "Fri 18 Dec" (Q5, Q7)',
    ok(
      () =>
        ED.answersByDay(sent('2026-12-23T00:00:00Z'), at('2026-12-01T00:00:00Z')) === 'Fri 18 Dec'
    )
  );
  assert(
    'P',
    'P8b the event’s own offset when she has changed it: 48 hours gives "Mon 21 Dec"',
    ok(
      () =>
        ED.answersByDay(sent('2026-12-23T00:00:00Z', 48), at('2026-12-01T00:00:00Z')) ===
        'Mon 21 Dec'
    )
  );
  assert(
    'P',
    'P8c an offset of 0 is kept, not read as unset: "Wed 23 Dec"',
    ok(
      () =>
        ED.answersByDay(sent('2026-12-23T00:00:00Z', 0), at('2026-12-01T00:00:00Z')) ===
        'Wed 23 Dec'
    )
  );
  assert(
    'P',
    'P8d the day is NZ’s: 11:30pm UTC on Wed 23 Dec is "Thu 24 Dec"',
    ok(
      () =>
        ED.answersByDay(sent('2026-12-23T11:30:00Z', 0), at('2026-12-01T00:00:00Z')) ===
        'Thu 24 Dec'
    )
  );
  assert(
    'P',
    'P8e before the press there is no "Answers by" (Q6)',
    ok(
      () =>
        ED.answersByDay(
          { ...sent('2026-12-23T00:00:00Z'), status: 'DRAFT', sentAt: null },
          at('2026-12-01T00:00:00Z')
        ) === null
    )
  );
  assert(
    'P',
    'P8f still shown on the day itself, at 11:30pm NZ',
    ok(
      () =>
        ED.answersByDay(sent('2026-12-23T00:00:00Z'), at('2026-12-18T10:30:00Z')) === 'Fri 18 Dec'
    )
  );
  assert(
    'P',
    'P8g and gone once that NZ day has passed, at 12:30am the next day (Q6)',
    ok(() => ED.answersByDay(sent('2026-12-23T00:00:00Z'), at('2026-12-18T11:30:00Z')) === null)
  );
  // 2026-12-25T00:00Z is Fri 25 Dec, 1pm in NZ.
  const xmas = at('2026-12-25T00:00:00Z');
  assert(
    'P',
    'P8h twelve days out: W4 "12 days to go."',
    ok(() => ED.daysToGoLine(xmas, at('2026-12-13T00:00:00Z')) === W4(12))
  );
  assert(
    'P',
    'P8i the day before: W5 "1 day to go."',
    ok(() => ED.daysToGoLine(xmas, at('2026-12-24T00:00:00Z')) === W5)
  );
  assert(
    'P',
    'P8j the day itself: W6 "It’s today."',
    ok(() => ED.daysToGoLine(xmas, at('2026-12-25T05:00:00Z')) === W6)
  );
  assert(
    'P',
    'P8k the day after: no button at all (Q8)',
    ok(() => ED.daysToGoLine(xmas, at('2026-12-26T00:00:00Z')) === null)
  );
  assert(
    'P',
    'P8l counted in NZ calendar days: 11:30pm on Thu 24 Dec to 12:30am on Fri 25 Dec is "1 day to go."',
    ok(() => ED.daysToGoLine(at('2026-12-24T11:30:00Z'), at('2026-12-24T10:30:00Z')) === W5)
  );

  // ── item 9 — the key ───────────────────────────────────────────────────────
  assert(
    'P',
    'P9a the key: W7, then five rows in the board’s order with W8 to W12',
    ok(
      () =>
        SP.COLOUR_KEY_BUTTON === W7 &&
        SP.COLOUR_KEY.length === 5 &&
        KEY.every(([s, w], i) => SP.COLOUR_KEY[i].state === s && SP.COLOUR_KEY[i].words === w)
    )
  );

  // ── item 11 — the print ────────────────────────────────────────────────────
  assert(
    'P',
    'P11a escapeHtml makes < > & " \' safe',
    ok(
      () =>
        PR.escapeHtml(`<a href="x">Tom & 'Jo'</a>`) ===
        '&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jo&#39;&lt;/a&gt;'
    )
  );
  const nasty = (() => {
    try {
      return PR.itemListHtml({
        eventName: `Kate’s <script>x</script>`,
        eventDate: '25 December 2026',
        items: PR.toPrintItems([
          apiItem(
            'Kūmara <i>bake</i> & "gravy"',
            ['Sides & <u>Salads</u>', 1],
            [2, 'TRAYS', null, null],
            ['Tom <b>B</b>', 'PENDING']
          ),
        ]),
      }) as string;
    } catch {
      return '';
    }
  })();
  assert(
    'P',
    'P11b every name escaped — the item, the person, the category, the event and the <title>',
    ok(
      () =>
        nasty.length > 0 &&
        !/<i>bake|<b>B|<u>Salads|<script>x/.test(nasty) &&
        nasty.includes('Kūmara &lt;i&gt;bake&lt;/i&gt; &amp; &quot;gravy&quot;') &&
        nasty.includes('Tom &lt;b&gt;B&lt;/b&gt;') &&
        nasty.includes('Sides &amp; &lt;u&gt;Salads&lt;/u&gt;') &&
        nasty.includes('<title>Kate’s &lt;script&gt;x&lt;/script&gt; — Items</title>')
    )
  );
  const qty = (a: number | null, u: string | null, c: string | null, t: string | null) =>
    PR.printQuantity(PR.toPrintItems([apiItem('x', ['T', 0], [a, u, c, t], null)])[0]);
  assert(
    'P',
    'P11c W17 the amounts in plain words — "2 trays", "1 tray", "1 big bag", "2 kg", "12", the host’s text, else "—"',
    ok(
      () =>
        qty(2, 'TRAYS', null, null) === '2 trays' &&
        qty(1, 'TRAYS', null, null) === '1 tray' &&
        qty(1, 'CUSTOM', 'big bag', null) === '1 big bag' &&
        qty(2, 'KG', null, null) === '2 kg' &&
        qty(12, 'COUNT', null, null) === '12' &&
        qty(null, null, null, 'a big bowl') === 'a big bowl' &&
        qty(null, null, null, null) === '—'
    )
  );
  const plainItems = [
    apiItem('Glazed ham', ['Mains', 0], [2, 'KG', null, null], ['Josie Walker', 'ACCEPTED']),
    apiItem('Roast lamb', ['Mains', 0], [null, null, null, 'one leg'], ['Ross Walker', 'PENDING']),
    apiItem('Green salad', ['Sides', 1], [3, 'TRAYS', null, null], ['Hemi Parata', 'MAYBE']),
    apiItem('Pavlova', ['Dessert', 2], [1, 'CUSTOM', 'big one', null], ['Gus Tane', 'DECLINED']),
    apiItem('Bread rolls', ['Sides', 1], [null, null, null, null], null),
  ];
  const noQty = (s: string) => s.replace(/<td class="qty">[^<]*<\/td>/g, '<td class="qty">#</td>');
  assert(
    'P',
    'P11d plain names print byte for byte as HEAD did, the amounts apart — one print, shared, not a new one',
    ok(() => {
      const mine = PR.itemListHtml({
        eventName: 'Christmas at Kate’s',
        eventDate: '25 December 2026',
        items: PR.toPrintItems(plainItems),
      });
      const head = frozenHeadPrint('Christmas at Kate’s', '25 December 2026', plainItems);
      return mine.length > 1000 && noQty(mine) === noQty(head) && mine !== head;
    })
  );

  // ── The render: GlanceBoard in memory ──────────────────────────────────────
  const render = (props: Record<string, unknown>) => {
    try {
      return renderToStaticMarkup(
        createElement(GB.default, {
          glance: glanceFixture,
          eventName: 'Henderson family Christmas',
          actorRole: 'HOST',
          eventDate: 'Friday 25 December',
          ...props,
        })
      );
    } catch (err) {
      console.error(`  the board threw: ${String((err as Error).message).split('\n')[0]}`);
      return '';
    }
  };
  const plain = GB ? render({}) : '';
  const dated = GB ? render({ answersBy: 'Fri 18 Dec', daysToGo: W4(12) }) : '';
  const text = (h: string) => h.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, '\n');

  assert(
    'R',
    'R8a the top line reads "Henderson family Christmas · 3 households · Answers by Fri 18 Dec" (W2)',
    ok(() => text(dated).includes(`Henderson family Christmas · 3 households${W2('Fri 18 Dec')}`))
  );
  const daysEl = /<details data-days-to-go=""([^>]*)>([\s\S]*?)<\/details>/.exec(dated);
  assert(
    'R',
    'R8b "Days to go" (W3) is a closed native disclosure, and W4 is inside it and nowhere else',
    ok(
      () =>
        !!daysEl &&
        !/\bopen\b/.test(daysEl[1]) &&
        /<summary[^>]*>Days to go<\/summary>/.test(daysEl[2]) &&
        daysEl[2].includes(W4(12)) &&
        (dated.match(/12 days to go\./g) ?? []).length === 1
    )
  );
  assert(
    'R',
    'R8c CONTROL: given neither, the board says neither — no "Answers by", no days button',
    plain.length > 0 && !plain.includes('Answers by') && !plain.includes('data-days-to-go')
  );
  const keyEl = /<details data-colour-key=""([^>]*)>([\s\S]*?)<\/details>/.exec(plain);
  assert(
    'R',
    'R9a the key is behind W7, closed, below the households and above the doors (Q10, A)',
    ok(
      () =>
        !!keyEl &&
        !/\bopen\b/.test(keyEl[1]) &&
        new RegExp(`<summary[^>]*>${W7}</summary>`).test(keyEl[2]) &&
        plain.indexOf('<details data-colour-key') > plain.lastIndexOf('data-strip-state') &&
        plain.indexOf('<details data-colour-key') < plain.indexOf('data-plan-door')
    )
  );
  assert(
    'R',
    'R9b each row wears its strip’s own tint, read from STRIP_TONE rather than restated (Q11)',
    ok(() => {
      if (!keyEl) return false;
      let from = 0;
      return KEY.every(([state, words]) => {
        const i = keyEl[2].indexOf(esc(words), from);
        if (i < 0) return false;
        from = i;
        const tag = keyEl[2].slice(keyEl[2].lastIndexOf('<', i), i);
        return tag.includes(SP.STRIP_TONE[state].className);
      });
    })
  );
  assert(
    'R',
    'R9c and nothing in the key is a strip or a door — no strip state, no person, no button, no link, no chevron',
    ok(
      () =>
        !!keyEl &&
        !/data-strip-state|data-person-event-id|<button|<a |data-strip-chevron|›/.test(keyEl[2])
    )
  );
  assert(
    'R',
    'R11a "Print the list" (W13) is a door in the board’s doors row, after "Invites & people"',
    ok(
      () =>
        /<button[^>]*data-print-door=""[^>]*>Print the list<\/button>/.test(plain) &&
        plain.indexOf('data-print-door') > plain.indexOf('data-back-room-door')
    )
  );
  const readSrc =
    codeOnly(read('src/lib/glance/read.ts')) + codeOnly(read('src/lib/glance/state.ts'));
  assert(
    'R',
    'R-pay CONTROL: the glance payload is untouched — the dates are the page’s props, never the board’s data',
    readSrc.length > 0 && !/answersBy|daysToGo|printDate|startDate/.test(readSrc)
  );
  const dash = codeOnly(read('src/app/plan/[eventId]/page.tsx'));
  assert(
    'R',
    'R-dash the old dashboard prints through the shared module, and its inline builder is gone (Q12)',
    dash.includes("from '@/lib/print/item-list'") &&
      !dash.includes('printWindow.document.write(html)') &&
      !dash.includes('<td>${item.name}</td>')
  );
  const preflight = read('src/app/plan/[eventId]/pre-flight/page.tsx');
  assert(
    'R',
    'R-send CONTROL: Send’s element is byte for byte as it was — its greying, its press and its words (Q1, Q4)',
    preflight.includes(SEND_AT_HEAD)
  );
  const page = codeOnly(read('src/app/plan/[eventId]/glance/page.tsx'));
  assert(
    'R',
    'R-page the glance page hands the board "Answers by" and the days from event-dates, and the print its date',
    /answersBy=\{answersByDay\(/.test(page) &&
      /daysToGo=\{daysToGoLine\(/.test(page) &&
      /printDate=\{printEventDate\(/.test(page)
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
  const mail = (l: string) => `gtc366-${l}-${stamp}@example.com`;
  const user = await prisma.user.create({ data: { email: mail('kate') } });
  created.users.push(user.id);
  const kate = await prisma.person.create({
    data: { name: 'Kate B4', email: user.email, userId: user.id },
  });
  created.people.push(kate.id);
  const token = randomBytes(32).toString('hex');
  const session = await prisma.session.create({
    data: { userId: user.id, token, expiresAt: new Date(Date.now() + 3600e3) },
  });
  created.sessions.push(session.id);
  const start = new Date(Date.now() + 12 * 864e5);

  type G = {
    name: string;
    response?: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'MAYBE';
    item?: [string, string];
    out?: boolean;
    dontChase?: boolean;
  };
  /** One event, its plan written directly; `sent` writes the press's stamps and nothing else. */
  const mk = async (name: string, sent: boolean, households: G[][]) => {
    const ev = await prisma.event.create({
      data: {
        name,
        startDate: start,
        endDate: start,
        hostId: kate.id,
        status: sent ? 'CONFIRMING' : 'DRAFT',
        sentAt: sent ? new Date(Date.now() - 2 * 864e5) : null,
        guestCount: 14,
      },
    });
    created.events.push(ev.id);
    await prisma.eventRole.create({ data: { eventId: ev.id, userId: user.id, role: 'HOST' } });
    await prisma.eventSetup.create({
      data: { eventId: ev.id, eventType: 'christmas', planApprovedAt: new Date() },
    });
    const teams: Record<string, string> = {};
    let order = 0;
    for (const s of ['Mains', 'Sides & Salads', 'Dessert']) {
      teams[s] = (
        await prisma.team.create({
          data: { name: s, eventId: ev.id, displayOrder: order++, source: 'GENERATED' },
        })
      ).id;
    }
    const hhK = await prisma.household.create({ data: { eventId: ev.id } });
    await prisma.personEvent.create({
      data: {
        personId: kate.id,
        eventId: ev.id,
        role: 'HOST',
        householdId: hhK.id,
        householdRole: 'PRIMARY_CONTACT',
        ...(sent ? { sentAt: ev.sentAt } : {}),
      },
    });
    let n = 0;
    for (const hh of households) {
      const h = await prisma.household.create({ data: { eventId: ev.id } });
      for (const [i, g] of hh.entries()) {
        const p = await prisma.person.create({
          data: { name: g.name, email: mail(`${g.name.toLowerCase().replace(/\W/g, '')}-${n++}`) },
        });
        created.people.push(p.id);
        await prisma.personEvent.create({
          data: {
            personId: p.id,
            eventId: ev.id,
            role: 'PARTICIPANT',
            householdId: h.id,
            householdRole: i === 0 ? 'PRIMARY_CONTACT' : 'PARTNER',
            ...(sent ? { sentAt: ev.sentAt } : {}),
            ...(g.out ? { attendanceAnswer: 'NO' as const, attendanceAnsweredAt: new Date() } : {}),
            ...(g.dontChase ? { nudgeMark: 'DONT_CHASE' as const } : {}),
          },
        });
        if (g.item) {
          const it = await prisma.item.create({
            data: {
              name: g.item[0],
              teamId: teams[g.item[1]],
              source: 'GENERATED',
              aiGenerated: true,
              quantityAmount: 2,
              quantityUnit: 'TRAYS',
              status: 'ASSIGNED',
            } as any,
          });
          await prisma.assignment.create({
            data: {
              itemId: it.id,
              personId: p.id,
              response: sent ? (g.response ?? 'PENDING') : 'PENDING',
            },
          });
        }
      }
    }
    await prisma.item.create({
      data: {
        name: 'Bread rolls',
        teamId: teams['Sides & Salads'],
        source: 'GENERATED',
        quantityAmount: 1,
        quantityUnit: 'CUSTOM',
        quantityUnitCustom: 'big bag',
        status: 'UNASSIGNED',
      } as any,
    });
    return ev.id;
  };
  const HH: G[][] = [
    [
      { name: 'Josie Walker', response: 'ACCEPTED', item: ['Glazed ham', 'Mains'] },
      { name: 'Ross Walker', response: 'PENDING', item: ['Roast lamb', 'Mains'] },
    ],
    [{ name: 'Gus Tane', response: 'DECLINED', item: ['Classic pavlova with cream', 'Dessert'] }],
    [
      { name: 'Mere Parata', response: 'MAYBE', item: ['Trifle', 'Dessert'] },
      { name: 'Hemi Parata', response: 'ACCEPTED', item: ['Green salad', 'Sides & Salads'] },
    ],
    [{ name: 'Ana Lealaiauloto', out: true }],
    [
      {
        name: 'Tom Bryce',
        response: 'PENDING',
        item: ['Christmas pudding', 'Dessert'],
        dontChase: true,
      },
    ],
    [
      {
        name: 'Priya Shah',
        response: 'PENDING',
        item: ['Kūmara <i>bake</i> & "gravy"', 'Sides & Salads'],
      },
      { name: 'Dev Shah', response: 'ACCEPTED', item: ['Coleslaw', 'Sides & Salads'] },
    ],
  ];
  const board = await mk('GTC-366 batch4 — the board', true, HH);
  const pre = await mk(
    'GTC-366 batch4 — before you send',
    false,
    HH.map((h) => h.map((g) => ({ ...g, out: false })))
  );

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
      await prisma.item.count({ where: { team: evIn } }),
      await prisma.assignment.count({ where: { item: { team: evIn } } }),
      await prisma.accessToken.count({ where: evIn }),
      await prisma.outboundMessage.count({ where: evIn }),
      await prisma.inviteEvent.count({ where: evIn }),
    ].join(',');
  console.log(
    `  fixture rows (Event, EventSetup, EventRole, Household, PersonEvent, Person, User, Session, Team, Item, Assignment, AccessToken, OutboundMessage, InviteEvent): ${await rows()}`
  );

  // The expected dates, worked out here, not by the module under test.
  const expectedAnswersBy = nzShort(new Date(start.getTime() - 120 * 3600e3));
  const days = Math.round((Date.parse(nzDay(start)) - Date.parse(nzDay(new Date()))) / 864e5);

  let chrome: Headless | null = null;
  let whileExists = '';
  let tokensWhileExist = 0;
  let probes = { plan: '', send: '' };
  try {
    chrome = await openHeadless({ fetchImpl: realFetch, port: 9377 });
    const c = chrome;
    await c.blockPlanMaking();
    await c.blockSends();
    await c.navigate('/', 3000);
    probes = {
      plan: await c.evaluate<string>(
        `fetch('/api/gtc366-probe/finalize-plan', { method: 'POST' }).then(r => 'reached ' + r.status).catch(() => 'failed')`
      ),
      send: await c.evaluate<string>(
        `fetch('/api/events/gtc366-probe/send', { method: 'POST' }).then(r => 'reached ' + r.status).catch(() => 'failed')`
      ),
    };
    await c.setSessionCookie(token);
    const ev = <T = any,>(js: string) => c.evaluate<T>(js);
    /** Tag what `js` finds, then click it — guarded. Skipped (not a refusal) when absent. */
    const tap = async (js: string, settleMs?: number) => {
      const found = await ev<boolean>(
        `(() => { document.querySelectorAll('[data-t]').forEach(e => e.removeAttribute('data-t')); const el = ${js}; if (!el) return false; el.setAttribute('data-t', 'x'); return true; })()`
      );
      if (!found) return 'absent';
      const r = await c.clickGuarded('[data-t="x"]', settleMs);
      if (r) refusals.push(`${js}: ${r}`);
      return r;
    };
    const section = (n: number) => `document.querySelectorAll('section')[${n - 1}]`;
    const box = (n: number) => `${section(n)}?.querySelector('header input[type=checkbox]')`;
    const label = (n: number) => `${section(n)}?.querySelector('header label')`;
    const goLine = `document.querySelector('[data-go-to-step]')`;
    const sendBtn = `[...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Send — finish the five checks first')`;

    // ── item 32 — at 1280, then 390 ─────────────────────────────────────────
    for (const [w, h, mobile, tag] of [
      [1280, 900, false, 'desktop'],
      [390, 844, true, 'phone'],
    ] as const) {
      await c.setViewport(w, h, mobile);
      await c.navigate(`/plan/${pre}/pre-flight`, 9000);
      const ids =
        tag === 'desktop'
          ? ['C32a', 'C32b', 'C32c', 'C32d', 'C32e']
          : ['C32g', 'C32h', 'C32i', 'C32j', 'C32k'];
      assert(
        'C',
        `${ids[0]} ${tag}: under the greyed Send, the line names step 1 — "${W1(1, STEP_TITLES[0])}"`,
        (await ev<string>(`${goLine}?.innerText.trim() ?? ''`)) === W1(1, STEP_TITLES[0])
      );
      await tap(label(1));
      assert(
        'C',
        `${ids[1]} ${tag}: step 1 ticked, it names step 2 — "${W1(2, STEP_TITLES[1])}"`,
        (await ev<string>(`${goLine}?.innerText.trim() ?? ''`)) === W1(2, STEP_TITLES[1])
      );
      await ev(`(() => { window.__reqs = 0; const f = window.fetch.bind(window); window.fetch = (u, o) => { window.__reqs++; return f(u, o); };
        window.__boxes = () => [...document.querySelectorAll('section header input[type=checkbox]')].map(b => b.checked).join(','); window.__before = window.__boxes(); return true; })()`);
      const tapped = (await tap(goLine, 2500)) === null;
      const top = await ev<number>(`${section(2)}.getBoundingClientRect().top`);
      assert(
        'C',
        `${ids[2]} ${tag}: one tap brings step 2 to the top of the screen (its top at ${Math.round(top)}px)`,
        tapped && top >= 0 && top <= 96
      );
      assert(
        'C',
        `${ids[3]} ${tag}: and the focus is on step 2’s box, in reach`,
        tapped && (await ev<boolean>(`document.activeElement === ${box(2)}`))
      );
      assert(
        'C',
        `${ids[4]} ${tag}: the tap ticked nothing and asked the server for nothing (Q2)`,
        tapped && (await ev<boolean>(`window.__boxes() === window.__before && window.__reqs === 0`))
      );
      if (tag === 'desktop') {
        assert(
          'C',
          'C32f CONTROL: Send is still greyed, with its own words (Q1, Q4)',
          await ev<boolean>(`(() => { const b = ${sendBtn}; return !!b && b.disabled; })()`)
        );
      } else {
        const sw = await ev<number>('document.documentElement.scrollWidth');
        assert('C', `C32w CONTROL: the pre-flight is 390px wide at 390 (${sw}px)`, sw === 390);
        for (const n of [2, 3, 4]) await tap(label(n));
        assert(
          'C',
          `C32l with steps 1 to 4 ticked, the line names step 5 — "${W1(5, STEP_TITLES[4])}" (Q3); step 5 is never ticked here`,
          (await ev<string>(`${goLine}?.innerText.trim() ?? ''`)) === W1(5, STEP_TITLES[4])
        );
      }
    }

    // ── item 8 and 9 — the board, at 1280 ────────────────────────────────────
    await c.setViewport(1280, 900, false);
    await c.navigate(`/plan/${board}/glance`, 8000);
    const meta = await ev<string>(`document.querySelector('main')?.innerText ?? ''`);
    assert(
      'C',
      `C8a a sent board’s top line ends "${W2(expectedAnswersBy)}"`,
      meta.includes(`7 households${W2(expectedAnswersBy)}`)
    );
    const daysSummary = `document.querySelector('details[data-days-to-go] > summary')`;
    assert(
      'C',
      `C8b W3 "Days to go" shows, and the count does not until she taps it`,
      (await ev<boolean>(
        `(() => { const s = ${daysSummary}; return !!s && s.getClientRects().length > 0 && s.innerText.trim() === ${JSON.stringify(W3)}; })()`
      )) && !(await ev<string>('document.body.innerText')).includes(W4(days))
    );
    const daysTapped = (await tap(daysSummary)) === null;
    assert(
      'C',
      `C8c one tap on it shows "${W4(days)}"`,
      daysTapped && (await ev<string>('document.body.innerText')).includes(W4(days))
    );
    const keySummary = `document.querySelector('details[data-colour-key] > summary')`;
    const keyVisible = `[...document.querySelectorAll('details[data-colour-key] p')].filter(p => p.checkVisibility()).map(p => p.innerText.trim())`;
    const keyClosed =
      (await ev<boolean>(`!!${keySummary}`)) && (await ev<string[]>(keyVisible)).length === 0;
    const keyTapped = (await tap(keySummary)) === null;
    const keyOpen = await ev<string[]>(keyVisible);
    assert(
      'C',
      'C9a the key is closed on load, and one tap on W7 shows W8 to W12',
      keyClosed && keyTapped && KEY.every(([, words], i) => keyOpen[i] === words)
    );

    // ── item 11 — the print, with window.open stubbed (never a dialog) ───────
    const STUB = `(() => { window.__log = []; window.__writes = ''; window.__prints = 0;
      window.open = () => { window.__log.push('open'); return { document: { open() {}, write(h) { window.__writes += h; }, close() {} }, print() { window.__prints++; }, close() {} }; };
      const f = window.fetch.bind(window); window.fetch = (u, o) => { window.__log.push('fetch:' + String(u)); return f(u, o); }; return true; })()`;
    await ev(STUB);
    const printDoor = `document.querySelector('[data-print-door]')`;
    const printTapped = (await tap(printDoor, 2500)) === null;
    const log = await ev<string[]>('window.__log');
    const writes = await ev<string>('window.__writes');
    const itemsAt = log.findIndex(
      (l) => l.startsWith('fetch:') && l.endsWith(`/api/events/${board}/items`)
    );
    assert(
      'C',
      'C11a the board prints in one tap: the window opens first, then the list is read, written with every name escaped and amounts in plain words, and printed once',
      printTapped &&
        log[0] === 'open' &&
        itemsAt > 0 &&
        writes.includes('Kūmara &lt;i&gt;bake&lt;/i&gt; &amp; &quot;gravy&quot;') &&
        !writes.includes('<i>bake</i>') &&
        writes.includes('<td class="qty">2 trays</td>') &&
        writes.includes('<td class="qty">1 big bag</td>') &&
        !/decideByFollowupSentAt|2026-\d\d-\d\dT/.test(writes) &&
        (await ev<number>('window.__prints')) === 1,
      `log ${JSON.stringify(log)}`
    );
    await ev(`window.open = () => null; true`);
    await tap(printDoor, 800);
    assert(
      'C',
      'C11c a blocked print window says W16 on the board',
      printTapped && (await ev<string>('document.body.innerText')).includes(W16)
    );

    // ── the unsent board ──────────────────────────────────────────────────────
    await c.navigate(`/plan/${pre}/glance`, 8000);
    const preMeta = await ev<string>(`document.querySelector('main')?.innerText ?? ''`);
    assert(
      'C',
      'C8d CONTROL: before the press the board has no "Answers by" (Q6)',
      preMeta.length > 0 && !preMeta.includes('Answers by')
    );
    assert(
      'C',
      'C8e but the days button is there before the press too (Q8)',
      await ev<boolean>(`!!${daysSummary}`)
    );

    // ── the board at 390, both disclosures open ─────────────────────────────
    await c.setViewport(390, 844, true);
    await c.navigate(`/plan/${board}/glance`, 8000);
    const openedDays = (await tap(daysSummary)) === null;
    const openedKey = (await tap(keySummary)) === null;
    const sw = await ev<number>('document.documentElement.scrollWidth');
    assert(
      'C',
      `C9b at 390 the board stays 390px wide with "Days to go" and the key open (${sw}px)`,
      openedDays &&
        openedKey &&
        (await ev<boolean>(
          `document.querySelector('details[data-days-to-go]').open && document.querySelector('details[data-colour-key]').open`
        )) &&
        sw === 390
    );

    // ── the old dashboard's Download PDF, stubbed the same way ──────────────
    await c.setViewport(1280, 900, false);
    await c.navigate(`/plan/${board}?expand=items`, 9000);
    tokensWhileExist = await prisma.accessToken.count({ where: evIn });
    await ev(STUB);
    const dlTapped =
      (await tap(
        `[...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Download PDF')`,
        1200
      )) === null;
    const dlWrites = await ev<string>('window.__writes');
    assert(
      'C',
      'C11b the old dashboard’s Download PDF prints through the same module: names escaped, amounts in plain words',
      dlTapped &&
        dlWrites.includes('Kūmara &lt;i&gt;bake&lt;/i&gt; &amp; &quot;gravy&quot;') &&
        !dlWrites.includes('<i>bake</i>') &&
        dlWrites.includes('<td class="qty">2 trays</td>') &&
        (await ev<number>('window.__prints')) === 1
    );

    whileExists = await rows();
  } finally {
    chrome?.close();
  }

  const blocked = chrome ? chrome.planMakingBlocked() : [];
  assert(
    'S',
    `S1 both probes failed in the browser: plan-making (${probes.plan}) and a send (${probes.send})`,
    probes.plan === 'failed' &&
      probes.send === 'failed' &&
      blocked.some((b) => b.includes('/api/gtc366-probe/finalize-plan')) &&
      blocked.some((b) => b.includes('/api/events/gtc366-probe/send'))
  );
  assert(
    'S',
    `S2 no click was refused (${refusals.length})`,
    refusals.length === 0,
    refusals.join('; ')
  );
  const hosts = chrome ? chrome.hostsRequested() : [];
  assert(
    'S',
    `S3 Chrome asked only for localhost:3000 (${hosts.join(', ')})`,
    hosts.length > 0 && hosts.every((h) => h === 'localhost:3000')
  );

  const ai = await prisma.event.findMany({
    where: { id: { in: created.events } },
    select: { aiCallsUsed: true },
  });
  await cleanup();
  const after = await totals();
  const left = await rows();
  console.log(`  guest links made by the old dashboard, while they existed: ${tokensWhileExist}`);
  assert(
    'S',
    `S4 aiCallsUsed 0 on every event; every row removed by id (${whileExists} while it existed, ${tokensWhileExist} guest links among them); totals as found (${before.invite}/${before.outbound} -> ${after.invite}/${after.outbound})`,
    ai.length === 2 &&
      ai.every((e) => e.aiCallsUsed === 0) &&
      whileExists.length > 0 &&
      left === '0,0,0,0,0,0,0,0,0,0,0,0,0,0' &&
      after.invite === before.invite &&
      after.outbound === before.outbound
  );

  const routes = (dir: string): number =>
    readdirSync(dir).reduce((n, f) => {
      const p = join(dir, f);
      return n + (statSync(p).isDirectory() ? routes(p) : f === 'route.ts' ? 1 : 0);
    }, 0);
  const classified = JSON.parse(read('route-classifications.json') || '[]');
  assert(
    'S',
    'Z1 CONTROL: no new route — src/app/api still has 112 route.ts, and the classifications 86 (Zone 6 untouched)',
    routes(join(process.cwd(), 'src/app/api')) === 112 && classified.length === 86
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
  // The old dashboard's guest links, by id, before their events (founder ruling, Q13's note).
  const tokenIds = (
    await prisma.accessToken.findMany({
      where: { eventId: { in: created.events } },
      select: { id: true },
    })
  ).map((t) => t.id);
  await del(() => prisma.accessToken.deleteMany({ where: { id: { in: tokenIds } } }));
  await del(() => prisma.session.deleteMany({ where: { id: { in: created.sessions } } }));
  await del(() => prisma.event.deleteMany({ where: { id: { in: created.events } } }));
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
