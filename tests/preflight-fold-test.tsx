/**
 * GTC-377 — walkthrough item 34: the pre-flight's steps fold, closed to start with.
 *
 * Pins the founder's rulings at scoping (2026-10-09: "Before launch, next"; "Ready stays open, with
 * Send"; "Tick box on the closed row") and the PLAN RULINGS of 2026-10-09: W1 to W3 as proposed (W1
 * and W3 only when something needs her; W2 always, Moment 2's own closed Dietary words); Q1 and Q3
 * to Q12 as recommended; C4's reading of "Send in view" (shown, never behind a fold).
 *
 *   P  the pure rules: W1 and W3 composed; next-check and Moment 2's Dietary words as pinned
 *   R  what a step renders: closed, open, the tick box outside the toggle, settled, Ready, the line;
 *      AccordionShell's markup byte for byte as at HEAD, and its fold shared with the steps
 *   S  the page's source: Send byte for byte, which steps fold, the open state, the line, W1 to W3
 *   C  headless Chrome at 1280 and 390, behind the three safeguards and the send wall: the fold,
 *      several open, ticking a closed row, the line opening its step, invites only, the widths;
 *      the safety controls; every fixture row removed by id, the totals as found
 *
 * NOTHING SENDS. Send is never pressed. Pre-flight boxes are ticked only on this suite's own
 * fixture. Never pressed: Send, "Send it again", "Generate plan →", "↻ Regenerate this category",
 * Moment 3's "Move on →", New Event. The browser fails every plan-making request and every request
 * to a door that sends before it leaves the page (both proven on probe URLs first); every click is
 * `clickGuarded`; a "leave site?" dialog is the only kind answered, and every dialog is logged.
 * `installProviderTrap` walls this process; headless Chrome resolves nothing but localhost.
 * Fixtures: example.com addresses, no phones, nothing queued.
 *
 * A check of something absent always carries a presence clause, so it cannot pass before the build.
 * Modules the build adds are loaded with `load`, so the suite runs (red) at HEAD rather than crashing.
 *
 * Needs the dev server on :3000 with the AI and provider keys blanked, and a global WebSocket
 * (NODE_OPTIONS=--experimental-websocket).
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';

import { prisma } from '../src/lib/prisma';
import { installProviderTrap } from './helpers/provider-trap';
import { openHeadless, type Headless } from './helpers/headless';

const realFetch = globalThis.fetch;
installProviderTrap();
const BASE = 'http://localhost:3000';
const ROOT = process.cwd();

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

/** Markup as text: React's text separators dropped, tags turned into breaks. */
const text = (h: string) => h.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, '\n');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── The ruled words, verbatim (GTC-377, PLAN RULINGS 2026-10-09) ─────────────
const W1_ONE = '1 critical thing has no owner yet.';
const W1_MANY = (n: number) => `${n} critical things have no owner yet.`;
const W3_ONE = '1 household has no one to talk to.';
const W3_MANY = (n: number) => `${n} households have no one to talk to.`;
/** GTC-364 W4 to W7, Moment 2's closed Dietary row — W2 repeats them unchanged. */
const NEEDS_CONFIRMATION = 'Needs confirmation';
const NO_DIETARY_NEEDS = 'No dietary needs';
/** As they stand at HEAD, for the controls. */
const W11 = 'Not needed: this event is invites only.';
const STEP_TITLES = [
  'What is still loose',
  'Dietary needs',
  'Who Gather talks to',
  'The message, shown',
  'Ready',
];
const BLURBS = [
  'Everything that has no owner yet. None of it blocks you.',
  'Event-level, not by name. The last check before people eat.',
  'One channel per household, and how hard the system chases.',
  "Exactly what each person will receive, and who I'll chase.",
  'The last look is done.',
];
const GO_TO = (n: number) => `Go to step ${n}: ${STEP_TITLES[n - 1]} ↑`;

/** Send's element exactly as it stands at `0a689ca` — ruled 2: "Send stays exactly where it is". */
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

/** AccordionShell rendered at `0a689ca` (Q1: its markup byte for byte as now). */
const SHELL_CLOSED_AT_HEAD =
  '<div data-accordion="mains" class="border rounded-lg transition-colors border-gray-200 bg-white"><button type="button" aria-expanded="false" class="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"><span class="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0"><span class="font-medium text-gray-900">🍖 Mains</span><span>HINT</span></span><span class="shrink-0 text-gray-400 transition-transform duration-200 ">▾</span></button><div class="grid transition-all duration-200" style="grid-template-rows:0fr;opacity:0"><div class="overflow-hidden min-h-0"><div class="px-4 pb-4"><div class=""><p>CHILD</p></div></div></div></div></div>';
const SHELL_OPEN_AT_HEAD =
  '<div data-accordion="mains" class="border rounded-lg transition-colors border-dashed border-gray-300 bg-gray-50"><button type="button" aria-expanded="true" class="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"><span class="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0"><span class="font-medium text-gray-400">🍖 Mains</span><span class="text-xs text-gray-500">Still deciding · left out of the plan for now</span></span><span class="shrink-0 text-gray-400 transition-transform duration-200 rotate-180">▾</span></button><div class="grid transition-all duration-200" style="grid-template-rows:1fr;opacity:1"><div class="overflow-hidden min-h-0"><div class="px-4 pb-4"><div class="opacity-50"><p>CHILD</p></div><button type="button" class="block text-xs mt-3 text-left transition-colors text-accent font-medium">✓ Still deciding. Tap here, or pick something, to include it in the plan.</button></div></div></div></div>';

// ══ IN MEMORY — the pure layer, the render and the source ══════════════════════
async function runInMemory() {
  const NC = await load('../src/lib/preflight/next-check');
  const DI = await load('../src/lib/dietary');
  const PS = await load('../src/components/preflight/PreflightStep');
  const AS = await load('../src/components/plan/AccordionShell');

  // ── P — the pure rules ─────────────────────────────────────────────────────
  assert(
    'P',
    `P1 W1 composed: nothing at 0, "${W1_ONE}", "${W1_MANY(3)}"`,
    ok(
      () => NC.looseLine(0) === null && NC.looseLine(1) === W1_ONE && NC.looseLine(3) === W1_MANY(3)
    )
  );
  assert(
    'P',
    `P2 W3 composed: nothing at 0, "${W3_ONE}", "${W3_MANY(2)}"`,
    ok(() => NC.talkLine(0) === null && NC.talkLine(1) === W3_ONE && NC.talkLine(2) === W3_MANY(2))
  );
  assert(
    'P',
    'P3 CONTROL: the step titles, firstUnticked, goToStepLine and settledSteps as batch4 and batch7 pin them',
    ok(
      () =>
        NC.PREFLIGHT_STEP_TITLES.length === 5 &&
        STEP_TITLES.every((t, i) => NC.PREFLIGHT_STEP_TITLES[i] === t) &&
        NC.firstUnticked({}) === 1 &&
        NC.goToStepLine(2) === GO_TO(2) &&
        JSON.stringify(NC.settledSteps(true)) === JSON.stringify({ 1: true, 2: true })
    )
  );
  assert(
    'P',
    'P4 CONTROL: Moment 2’s closed Dietary words, which W2 repeats (GTC-364 W4 to W7)',
    ok(
      () =>
        DI.dietaryTitleSummary({ status: 'unanswered', requirements: [] }) === NEEDS_CONFIRMATION &&
        DI.dietaryTitleSummary({ status: 'confirmed_none', requirements: [] }) ===
          NO_DIETARY_NEEDS &&
        DI.dietaryTitleSummary({
          status: 'confirmed_needs',
          requirements: ['Gluten-free', 'Vegetarian'],
          other: 'no shellfish',
        }) === 'Vegetarian, Gluten-free, no shellfish'
    )
  );

  // ── R — what a step renders ────────────────────────────────────────────────
  const step = (props: Record<string, unknown>) =>
    PS?.default
      ? render(
          createElement(
            PS.default,
            {
              n: 2,
              title: 'Dietary needs',
              blurb: 'BLURB-X',
              checked: false,
              onCheck: () => {},
              ...props,
            },
            createElement('p', null, 'INSIDE-X')
          )
        )
      : '';
  const buttons = (h: string) => [...h.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)];
  const toggle = (h: string) => buttons(h).find((m) => /aria-expanded=/.test(m[0]));
  const closed = step({ open: false, onToggle: () => {} });
  const open = step({ open: true, onToggle: () => {} });
  assert(
    'R',
    'R1 a closed step: section step-2, one toggle (aria-expanded false) holding "Step 2 of 5", the title and the blurb; the fold shut (0fr); the ▾ unturned; its content still there',
    ok(() => {
      const t = toggle(closed);
      const words = t ? text(t[1]) : '';
      return (
        /<section[^>]*id="step-2"/.test(closed) &&
        /data-step="2"/.test(closed) &&
        !!t &&
        /aria-expanded="false"/.test(t[0]) &&
        words.includes('Step 2 of 5') &&
        words.includes('Dietary needs') &&
        words.includes('BLURB-X') &&
        t[1].includes('▾') &&
        !t[1].includes('rotate-180') &&
        /grid-template-rows:\s*0fr/.test(closed) &&
        closed.includes('INSIDE-X')
      );
    })
  );
  assert(
    'R',
    'R2 an open step: aria-expanded true, the fold open (1fr), the ▾ turned',
    ok(() => {
      const t = toggle(open);
      return (
        !!t &&
        /aria-expanded="true"/.test(t[0]) &&
        t[1].includes('rotate-180') &&
        /grid-template-rows:\s*1fr/.test(open) &&
        open.includes('INSIDE-X')
      );
    })
  );
  assert(
    'R',
    'R3 the tick box sits in the header, outside every button, labelled "Checked" (or "Settled" when given)',
    ok(() => {
      const settledLabel = step({ open: false, onToggle: () => {}, checkLabel: 'Settled' });
      const header = closed.match(/<header[\s\S]*?<\/header>/)?.[0] ?? '';
      return (
        buttons(closed).length > 0 &&
        buttons(closed).every((m) => !m[1].includes('<input')) &&
        /<label[^>]*>[\s\S]*?<input[^>]*type="checkbox"[\s\S]*?Checked[\s\S]*?<\/label>/.test(
          header
        ) &&
        /<label[^>]*>[\s\S]*?<input[^>]*type="checkbox"[\s\S]*?Settled[\s\S]*?<\/label>/.test(
          settledLabel
        )
      );
    })
  );
  assert(
    'R',
    'R4 a settled step (invites only): no toggle, W11 in place of the blurb, the box ticked and disabled, nothing inside',
    ok(() => {
      const s = step({ settled: true, open: false, onToggle: () => {} });
      return (
        s.length > 0 &&
        !/aria-expanded/.test(s) &&
        text(s).includes(W11) &&
        !text(s).includes('BLURB-X') &&
        /<input[^>]*type="checkbox"[^>]*checked=""[^>]*disabled=""|<input[^>]*type="checkbox"[^>]*disabled=""[^>]*checked=""/.test(
          s
        ) &&
        !s.includes('INSIDE-X')
      );
    })
  );
  assert(
    'R',
    'R5 Ready (no onToggle): no toggle, no ▾, its content shown, no fold',
    ok(() => {
      const r = step({ n: 5, title: 'Ready', blurb: BLURBS[4] });
      return (
        r.length > 0 &&
        /id="step-5"/.test(r) &&
        !/aria-expanded/.test(r) &&
        !r.includes('▾') &&
        r.includes('INSIDE-X') &&
        !/grid-template-rows/.test(r)
      );
    })
  );
  assert(
    'R',
    'R6 a row line renders inside the toggle, under the blurb; with none, nothing',
    ok(() => {
      const withLine = step({
        open: false,
        onToggle: () => {},
        line: { text: 'LINE-X', amber: true },
      });
      const t = toggle(withLine);
      const words = t ? text(t[1]) : '';
      const t0 = toggle(closed);
      return (
        !!t &&
        words.indexOf('LINE-X') > words.indexOf('BLURB-X') &&
        words.indexOf('BLURB-X') >= 0 &&
        !!t0 &&
        !closed.includes('LINE-X') &&
        !/data-step-line/.test(closed)
      );
    })
  );
  const shell = (p: Record<string, unknown>) =>
    AS?.default
      ? render(
          createElement(
            AS.default,
            { id: 'mains', label: '🍖 Mains', onToggle: () => {}, ...p },
            createElement('p', null, 'CHILD')
          )
        )
      : '';
  assert(
    'R',
    'R7 CONTROL: AccordionShell renders byte for byte as at HEAD, closed with a hint and open still deciding (Q1)',
    shell({ open: false, headerHint: createElement('span', null, 'HINT') }) ===
      SHELL_CLOSED_AT_HEAD &&
      shell({ open: true, stillDeciding: true, onStillDecidingToggle: () => {} }) ===
        SHELL_OPEN_AT_HEAD
  );
  const psSrc = codeOnly(read('src/components/preflight/PreflightStep.tsx'));
  const asSrc = codeOnly(read('src/components/plan/AccordionShell.tsx'));
  assert(
    'R',
    'R8 the step’s ▾ and fold are AccordionShell’s own: FoldChevron and FoldBody, exported there, used by both (Q1)',
    psSrc.length > 0 &&
      /import\s*\{[^}]*\bFoldBody\b[^}]*\}\s*from\s*'@\/components\/plan\/AccordionShell'/.test(
        psSrc
      ) &&
      /import\s*\{[^}]*\bFoldChevron\b[^}]*\}\s*from\s*'@\/components\/plan\/AccordionShell'/.test(
        psSrc
      ) &&
      /<FoldBody\b/.test(psSrc) &&
      /<FoldChevron\b/.test(psSrc) &&
      /export function FoldChevron\b/.test(asSrc) &&
      /export function FoldBody\b/.test(asSrc) &&
      /<FoldBody\b/.test(asSrc) &&
      /<FoldChevron\b/.test(asSrc)
  );

  // ── S — the page's source ──────────────────────────────────────────────────
  const raw = read('src/app/plan/[eventId]/pre-flight/page.tsx');
  const page = codeOnly(raw);
  assert(
    'S',
    'S1 CONTROL: Send’s element is byte for byte as it was — its greying, its press, its words (ruling 2)',
    raw.includes(SEND_AT_HEAD)
  );
  const tags = new Map<number, string>();
  for (const m of page.matchAll(/<Step\s+n=\{(\d)\}([\s\S]*?)\n\s*>/g))
    tags.set(Number(m[1]), m[2]);
  assert(
    'S',
    'S2 steps 1 to 4 fold from one open-steps list; Ready does not (Q3)',
    tags.size === 5 &&
      [1, 2, 3, 4].every(
        (n) =>
          (tags.get(n) ?? '').includes(`open={openSteps.includes(${n})}`) &&
          /onToggle=\{/.test(tags.get(n) ?? '')
      ) &&
      !/\bopen=|onToggle=/.test(tags.get(5) ?? 'open=')
  );
  const early = page.indexOf('if (data.event.sentAt)');
  const state = page.indexOf('const [openSteps, setOpenSteps] = useState<number[]>([]);');
  assert(
    'S',
    'S3 the open steps are page state, declared before the after-the-press return, empty on every visit',
    state > 0 && early > state
  );
  const go = page.slice(page.indexOf('const goToStep'), page.indexOf('return (', early));
  assert(
    'S',
    'S4 the line opens the step it names first, and scrolls once the fold has opened (Q6)',
    go.length > 0 &&
      go.includes('setOpenSteps') &&
      /window\.setTimeout\(/.test(go) &&
      go.indexOf('setOpenSteps') < go.indexOf('scrollIntoView') &&
      go.indexOf('scrollIntoView') > 0
  );
  assert(
    'S',
    'S5 the closed rows’ lines come from the page’s own data: W1 from the critical count, W2 from dietaryTitleSummary, W3 from the households with no one to talk to',
    /looseLine\(coverage\.criticalUnassignedCount\)/.test(page) &&
      /dietaryTitleSummary\(dietary\)/.test(page) &&
      /talkLine\(\s*households\.filter\([\s\S]{0,80}channelFor\(/.test(page)
  );
  assert(
    'S',
    'S6 CONTROL: the blurbs, checkLabel="Settled" and "Five things to go through." are still literal in the page (chase-channel W8, W9)',
    BLURBS.every((b) => raw.includes(b)) &&
      /checkLabel="Settled"/.test(raw) &&
      raw.includes('Five things to go through.')
  );
}

// ══ CHROME — the dev server, behind the safeguards ═════════════════════════════
const created = {
  users: [] as string[],
  people: [] as string[],
  events: [] as string[],
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
  if (!up) console.error('    the dev server does not answer on :3000 — every C assertion fails');

  const totals = async () => ({
    invite: await prisma.inviteEvent.count(),
    outbound: await prisma.outboundMessage.count(),
  });
  const before = await totals();

  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const mail = (l: string) => `gtc377-${l}-${stamp}@example.com`;
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
  const guests: Record<string, string> = {};
  for (const name of ['Jo Lowe', 'Ross Lowe', 'Gus Henderson', 'Aroha Henderson', 'Mere Parata']) {
    const p = await prisma.person.create({
      data: { name, email: mail(name.split(' ')[0].toLowerCase()) },
    });
    created.people.push(p.id);
    guests[name] = p.id;
  }
  const start = new Date(Date.now() + 30 * 864e5);
  /** A held event of Kate's: her household and two others, no phones, nothing queued. */
  const mk = async (
    label: string,
    opts: { invitesOnly?: boolean; needs?: boolean; dietary?: unknown }
  ) => {
    const ev = await prisma.event.create({
      data: {
        name: `GTC-377 fold — ${label}`,
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
        invitesOnly: opts.invitesOnly === true,
        ...(opts.dietary ? { dietaryData: opts.dietary as any } : {}),
      } as any,
    });
    const member = async (
      name: string,
      householdId: string,
      householdRole: string,
      role?: 'HOST'
    ) =>
      prisma.personEvent.create({
        data: {
          personId: name === 'Kate Lowe' ? kate.id : guests[name],
          eventId: ev.id,
          householdId,
          householdRole: householdRole as any,
          ...(role ? { role } : {}),
        },
      });
    const hk = await prisma.household.create({ data: { eventId: ev.id } });
    await member('Kate Lowe', hk.id, 'PRIMARY_CONTACT', 'HOST');
    const h1 = await prisma.household.create({ data: { eventId: ev.id } });
    await member('Jo Lowe', h1.id, 'PRIMARY_CONTACT');
    await member('Ross Lowe', h1.id, 'PARTNER');
    const h2 = await prisma.household.create({ data: { eventId: ev.id } });
    await member('Gus Henderson', h2.id, 'PRIMARY_CONTACT');
    await member('Aroha Henderson', h2.id, 'PARTNER');
    if (opts.needs) {
      // W3: a household with no primary contact and no channel picked — "no one to talk to".
      const h3 = await prisma.household.create({ data: { eventId: ev.id } });
      await member('Mere Parata', h3.id, 'PARTNER');
    }
    if (!opts.invitesOnly) {
      const team = await prisma.team.create({ data: { name: 'Mains', eventId: ev.id } });
      const salad = await prisma.item.create({
        data: { name: 'Green salad', teamId: team.id, source: 'MANUAL', kind: 'ITEM' } as any,
      });
      await prisma.assignment.create({ data: { itemId: salad.id, personId: guests['Jo Lowe'] } });
      // W1: one critical thing with no owner, on the event that needs her only.
      await prisma.item.create({
        data: {
          name: 'Glazed ham',
          teamId: team.id,
          source: 'MANUAL',
          kind: 'ITEM',
          critical: opts.needs === true,
        } as any,
      });
    }
    return ev.id;
  };
  const evA = await mk('needs her', { needs: true });
  const evB = await mk('all settled', {
    dietary: { status: 'confirmed_none', requirements: [] },
  });
  const evC = await mk('invites only', { invitesOnly: true });

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

  const r: Record<string, boolean> = {};
  const detail: Record<string, string> = {};
  let chrome: Headless | null = null;
  let probes = { plan: '', send: '' };
  try {
    if (!up) throw new Error('no dev server');
    chrome = await openHeadless({ fetchImpl: realFetch, port: 9476 });
    const c = chrome;
    await c.blockPlanMaking();
    await c.blockSends();
    c.answerLeaveDialogs(true);
    await c.navigate('/', 3000);
    probes = {
      plan: await c.evaluate<string>(
        `fetch('/api/gtc377-probe/finalize-plan', { method: 'POST' }).then(r => 'reached ' + r.status).catch(() => 'failed')`
      ),
      send: await c.evaluate<string>(
        `fetch('/api/events/gtc377-probe/send', { method: 'POST' }).then(r => 'reached ' + r.status).catch(() => 'failed')`
      ),
    };
    await c.setSessionCookie(token);
    const ev = <T = any,>(js: string) => c.evaluate<T>(js);
    /** Tag what `js` finds, then click it — guarded. 'absent' (not a refusal) when not found. */
    const tap = async (js: string, settleMs?: number) => {
      const found = await ev<boolean>(
        `(() => { document.querySelectorAll('[data-t]').forEach(e => e.removeAttribute('data-t')); const el = ${js}; if (!el) return false; el.setAttribute('data-t', 'x'); return true; })()`
      );
      if (!found) return 'absent';
      const why = await c.clickGuarded('[data-t="x"]', settleMs);
      if (why) refusals.push(`${js}: ${why}`);
      return why;
    };
    const st = (n: number) => `document.getElementById('step-${n}')`;
    const tog = (n: number) => `${st(n)}?.querySelector('header button[aria-expanded]')`;
    const box = (n: number) => `${st(n)}?.querySelector('header input[type=checkbox]')`;
    const label = (n: number) => `${st(n)}?.querySelector('header label')`;
    const goLine = `document.querySelector('[data-go-to-step]')`;
    const sendBtn = `[...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Send — finish the five checks first')`;
    /** 'open', 'closed', or 'none' when the step has no toggle; heights read after the fold. */
    const fold = async (n: number) =>
      ev<string>(`(() => { const t = ${tog(n)}; if (!t) return 'none';
        const b = document.getElementById('step-${n}-body'); const h = b ? b.getBoundingClientRect().height : -1;
        const e = t.getAttribute('aria-expanded');
        return e === 'true' && h > 0 ? 'open' : e === 'false' && h === 0 ? 'closed' : 'odd:' + e + ':' + h; })()`);
    const folds = async (ns: number[]) => {
      const out: string[] = [];
      for (const n of ns) out.push(await fold(n));
      return out;
    };
    const rowText = (n: number) => ev<string>(`${tog(n)}?.innerText ?? ''`);
    const openAll = async () => {
      for (const n of [1, 2, 3, 4]) if ((await fold(n)) === 'closed') await tap(tog(n), 500);
    };

    for (const [w, h, mobile, tag] of [
      [1280, 900, false, 'desktop'],
      [390, 844, true, 'phone'],
    ] as const) {
      const k = (id: string) => (tag === 'desktop' ? id : `${id}p`);
      await c.setViewport(w, h, mobile);
      await c.navigate(`/plan/${evA}/pre-flight`, 9000);

      // C1 — the landing: steps 1 to 4 closed, Ready open, Send shown and greyed (C4 as ruled).
      const landing = await folds([1, 2, 3, 4]);
      const ready = await ev<any>(`(() => { const b = ${sendBtn};
        return { toggle: !!${tog(5)}, send: !!b && b.disabled && b.getBoundingClientRect().height > 0 && b.checkVisibility() && ${st(5)}?.contains(b) && !b.closest('[id$="-body"]') }; })()`);
      r[k('C1')] =
        landing.every((s) => s === 'closed') && ready.toggle === false && ready.send === true;
      detail[k('C1')] = `${landing.join(',')} ${JSON.stringify(ready)}`;

      // C2 — a tap opens step 1, then step 3; step 1 stays open (several at once).
      const t2a = await tap(tog(1), 500);
      const t2b = await tap(tog(3), 500);
      const two = await folds([1, 2, 3, 4]);
      r[k('C2')] =
        t2a === null && t2b === null && two.join() === ['open', 'closed', 'open', 'closed'].join();
      detail[k('C2')] = `${t2a} ${t2b} ${two.join(',')}`;

      // C3 — a second tap closes step 1; step 3 stays open.
      const t3 = await tap(tog(1), 500);
      const three = await folds([1, 3]);
      r[k('C3')] = t3 === null && three.join() === 'closed,open';
      detail[k('C3')] = `${t3} ${three.join(',')}`;

      if (tag === 'desktop') {
        // C6 CONTROL — inside step 3, the household rows still fold, two open at once.
        if ((await fold(3)) === 'closed') await tap(tog(3), 500);
        const hh = `[...(${st(3)}?.querySelectorAll('[data-accordion] > button') ?? [])]`;
        const t6a = await tap(`${hh}[0]`, 500);
        const t6b = await tap(`${hh}[1]`, 500);
        const both = await ev<string[]>(
          `${hh}.slice(0, 2).map(b => b.getAttribute('aria-expanded'))`
        );
        r.C6 = t6a === null && t6b === null && both.join() === 'true,true';
        detail.C6 = `${t6a} ${t6b} ${both.join(',')}`;
      }

      // C4 — on a fresh visit, step 1's box ticks it from its closed row; it stays closed.
      await c.navigate(`/plan/${evA}/pre-flight`, 9000);
      const t4 = await tap(label(1), 500);
      const s4 = {
        ticked: await ev<boolean>(`!!${box(1)}?.checked`),
        fold: await fold(1),
        line: await ev<string>(`${goLine}?.innerText.trim() ?? ''`),
      };
      r[k('C4')] = t4 === null && s4.ticked && s4.fold === 'closed' && s4.line === GO_TO(2);
      detail[k('C4')] = `${t4} ${JSON.stringify(s4)}`;

      // C5 — the line opens step 2 and takes her there: its top at the top of the screen, the focus
      // on its box; it ticks nothing and asks the server for nothing.
      await ev(`(() => { window.__reqs = 0; const f = window.fetch.bind(window); window.fetch = (u, o) => { window.__reqs++; return f(u, o); };
        window.__boxes = () => [...document.querySelectorAll('section header input[type=checkbox]')].map(b => b.checked).join(','); window.__before = window.__boxes(); return true; })()`);
      const t5 = await tap(goLine, 2500);
      const s5 = {
        fold: await fold(2),
        top: Math.round(await ev<number>(`${st(2)}.getBoundingClientRect().top`)),
        focus: await ev<boolean>(`document.activeElement === ${box(2)}`),
        quiet: await ev<boolean>(`window.__boxes() === window.__before && window.__reqs === 0`),
      };
      r[k('C5')] =
        t5 === null && s5.fold === 'open' && s5.top >= 0 && s5.top <= 96 && s5.focus && s5.quiet;
      detail[k('C5')] = `${t5} ${JSON.stringify(s5)}`;

      if (tag === 'desktop') {
        // C7 — W1, W2 and W3 on the closed rows of the event that needs her; on the settled one,
        // no W1 and no W3, and W2 reads "No dietary needs".
        await c.navigate(`/plan/${evA}/pre-flight`, 9000);
        const a = [await rowText(1), await rowText(2), await rowText(3)];
        const aFolds = await folds([1, 2, 3]);
        await c.navigate(`/plan/${evB}/pre-flight`, 9000);
        const b = [await rowText(1), await rowText(2), await rowText(3)];
        const bFolds = await folds([1, 2, 3]);
        r.C7 =
          aFolds.every((s) => s === 'closed') &&
          bFolds.every((s) => s === 'closed') &&
          a[0].includes(W1_ONE) &&
          a[1].includes(NEEDS_CONFIRMATION) &&
          a[2].includes(W3_ONE) &&
          !b[0].includes('critical') &&
          b[1].includes(NO_DIETARY_NEEDS) &&
          !b[2].includes('no one to talk to');
        detail.C7 = JSON.stringify({ a, b, aFolds, bFolds }).slice(0, 400);
      }

      // C8 — invites only: steps 1 and 2 read W11, ticked and greyed, with no toggle; step 3 closed;
      // the line names step 3, and a tap opens it.
      await c.navigate(`/plan/${evC}/pre-flight`, 9000);
      const settledRows = await ev<
        any[]
      >(`[1, 2].map(n => { const s = document.getElementById('step-' + n); const b = s?.querySelector('header input[type=checkbox]');
        return { w11: !!s && s.innerText.includes(${JSON.stringify(W11)}), ticked: !!b?.checked, greyed: !!b?.disabled, toggle: !!s?.querySelector('header button[aria-expanded]') }; })`);
      const before8 = await fold(3);
      const line8 = await ev<string>(`${goLine}?.innerText.trim() ?? ''`);
      const t8 = await tap(goLine, 2500);
      const after8 = await fold(3);
      r[k('C8')] =
        settledRows.every((s) => s.w11 && s.ticked && s.greyed && !s.toggle) &&
        before8 === 'closed' &&
        line8 === GO_TO(3) &&
        t8 === null &&
        after8 === 'open';
      detail[k('C8')] = `${JSON.stringify(settledRows)} ${before8} "${line8}" ${t8} ${after8}`;

      // C9 CONTROL — exactly the screen's width: closed, with steps 1 to 4 open, and invites only.
      const widths: number[] = [await ev<number>('document.documentElement.scrollWidth')];
      await c.navigate(`/plan/${evA}/pre-flight`, 9000);
      widths.push(await ev<number>('document.documentElement.scrollWidth'));
      await openAll();
      widths.push(await ev<number>('document.documentElement.scrollWidth'));
      r[k('C9')] = widths.every((x) => x === w);
      detail[k('C9')] = widths.join(',');
    }
  } catch (e) {
    console.error('    chrome threw:', (e as Error).message.split('\n')[0]);
  }
  const blocked = chrome?.planMakingBlocked() ?? ['no chrome'];
  const hosts = chrome?.hostsRequested() ?? [];
  const dialogs = chrome?.dialogs() ?? ['no chrome'];
  chrome?.close();

  const C_LABELS: Record<string, string> = {
    C1: 'it opens with steps 1 to 4 closed and Ready open, Send shown and greyed (C4 as ruled)',
    C2: 'a tap opens step 1, then step 3; step 1 stays open (several at once)',
    C3: 'a second tap closes step 1; step 3 stays open',
    C4: 'step 1’s box ticks it from its closed row; it stays closed; the line names step 2',
    C5: 'the line opens step 2 and takes her there (top within 96px), the focus on its box; nothing ticked, no request',
    C6: 'CONTROL: inside step 3, the household rows still fold, two open at once',
    C7: 'W1, W2 and W3 on the closed rows of the event that needs her; on the settled one no W1, no W3, and W2 reads "No dietary needs"',
    C8: 'invites only: steps 1 and 2 read W11, ticked and greyed, no toggle; step 3 closed; the line names step 3 and opens it',
    C9: 'CONTROL: exactly the screen’s width — invites only, closed, and with steps 1 to 4 open',
  };
  for (const id of ['C1', 'C2', 'C3', 'C6', 'C4', 'C5', 'C7', 'C8', 'C9'])
    assert('C', `${id} desktop: ${C_LABELS[id]}`, r[id] === true, detail[id]);
  for (const id of ['C1', 'C2', 'C3', 'C4', 'C5', 'C8', 'C9'])
    assert('C', `${id}p phone: ${C_LABELS[id]}`, r[`${id}p`] === true, detail[`${id}p`]);

  assert(
    'C',
    'C0 CONTROL: both probes failed in the browser (plan-making and sending blocked)',
    probes.plan === 'failed' && probes.send === 'failed',
    JSON.stringify(probes)
  );
  assert(
    'C',
    'C10 CONTROL: Chrome asked only localhost:3000, and nothing but the two probes was blocked',
    hosts.length > 0 &&
      hosts.every((x) => x === 'localhost:3000') &&
      blocked.length === 2 &&
      blocked.every((b) => /gtc377-probe/.test(b)),
    `${hosts.join(',')} | ${blocked.join(' | ')} | refused: ${refusals.join(' | ')}`
  );
  assert('C', 'C11 CONTROL: no dialog opened', dialogs.length === 0, dialogs.join(','));
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
  assert(
    'C',
    'C12 CONTROL: while the fixture exists, aiCallsUsed is 0 on all three events and nothing is queued or recorded on them',
    ai.length === 3 && ai.every((n) => n === 0) && whileExists.endsWith(',0,0'),
    `ai ${ai}, rows ${whileExists}`
  );
  await cleanup();
  const left = await rows();
  const after = await totals();
  assert(
    'C',
    'C13 CONTROL: the InviteEvent and OutboundMessage totals as found',
    after.invite === before.invite && after.outbound === before.outbound,
    `${JSON.stringify(before)} → ${JSON.stringify(after)}`
  );
  assert(
    'C',
    'C14 CONTROL: every fixture row removed by id',
    created.events.length === 3 && left === '0,0,0,0,0,0,0,0,0,0,0,0,0,0',
    left
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
  // Every row below was made by this suite: its three events and what hangs off them, its people,
  // its user and her session.
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
