/**
 * GTC-367 — walkthrough batch 5: getting around the Moments.
 *
 * The founder walked the Moment flow himself and sorted what he found (GTC-189's Fourth ruling).
 * This suite pins batch 5's first half to the words he ruled on the plan (GTC-367, PLAN RULINGS
 * 2026-10-08: W1 to W5 as written, W6 to W8 with his curly quotes, W9 and W9b in his words) and to
 * the behaviour he chose (Q2 to Q9, Q18 as recommended; Q1 approving GTC-362):
 *
 *   1   from Moment 2's questions, a way back to Moment 1 (W2, in the footer where the × was), and
 *       every way out of the questions saves first (Q7)
 *   31  a way back and a way out on every screen of the flow: W1 on the overlays, W3 on the plan
 *       view, W4 on the pre-flight before the press, W5 on "Who I chase"
 *   2   the Moments strip shown and tappable: each Moment she can reach opens; one she can't yet
 *       says W6, W7 or W8 and goes nowhere (Q5, Q6); a typed household not saved keeps her where
 *       she is (W9, W9b, Q9); on Moment 2's questions and the pre-flight too, never on the board
 *       (Q3, Q4); a tap never approves, holds or sends anything
 *   362 after signing in, Back no longer lands on the used link ("Link Already Used")
 *
 * The pure and render layers run in memory. The Chrome layer drives the dev server in the
 * walled-off headless Chrome, on fixtures of its own (example.com addresses, no phones; the sent
 * event written directly, with nothing queued), behind the three safeguards of
 * GATHER-BUILD-CONSTANTS.md ("Looking on screen") and the fourth wall: the browser fails every
 * plan-making request and every request to a door that sends before it leaves the page (both proven
 * on probe URLs first); every click is `clickGuarded`. Never pressed: Send, Generate, Regenerate,
 * Move on, New Event. GTC-362's walk (C14) makes a sign-in link of its own, a MagicLink row written
 * directly for the fixture's example.com user and never emailed; it, the Sessions of that user and
 * the user are counted while they exist and removed by id. Every fixture row is counted while it
 * exists and removed by id; the InviteEvent and OutboundMessage totals are asserted as found.
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
import MomentArc from '../src/components/plan/MomentArc';
import SetupOpeningScreen from '../src/components/plan/SetupOpeningScreen';
import Moment1Summary from '../src/components/plan/Moment1Summary';
import Moment2Opening from '../src/components/plan/Moment2Opening';
import Moment2PlanView from '../src/components/plan/Moment2PlanView';

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

// ── The ruled words, verbatim (GTC-367, PLAN RULINGS 2026-10-08) ─────────────
const W1 = '← Your events';
const W2 = '← Back to the people';
const W3 = '← Back to the questions';
const W4 = '← Back to who’s on what';
const W5 = '← Back to the board';
const W6 = 'You’ll get to “What’s the plan?” once your own household is saved.';
const W7 = 'You’ll get to “Who’s on what?” once you’ve said the plan looks good.';
const W8 = 'You’ll get to “Is everyone sorted?” when you finish “Who’s on what?” and move on.';
const W9 = 'Save this household first, or clear what you’ve typed.';
const W9b = 'Save your changes first, or press Cancel.';

const L1 = "Who's coming?";
const L2 = "What's the plan?";
const L3 = "Who's on what?";
const L4 = 'Is everyone sorted?';

/** React escapes these in text and attributes; `’`, `“`, `”` and `←` pass through. */
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const escApos = (s: string) => esc(s).replace(/'/g, '&#x27;');

// ══ IN MEMORY ═══════════════════════════════════════════════════════════════════
async function runInMemory() {
  // ── P — the rule: where each tap goes (src/lib/moments/strip.ts) ──────────────
  const S = await load('../src/lib/moments/strip');
  const doors = (f: Record<string, boolean>) =>
    S.stripDoors({
      hostSaved: false,
      hasPlan: false,
      planApproved: false,
      held: false,
      sent: false,
      ...f,
    });
  const go = (d: any, target: string) => d?.kind === 'go' && d.target === target;
  const locked = (d: any, line: string) => d?.kind === 'locked' && d.line === line;

  assert(
    'P',
    'P1 nothing saved: 1 opens Moment 1; 2, 3 and 4 say W6, W7 and W8',
    ok(() => {
      const d = doors({});
      return go(d[1], 'moment1') && locked(d[2], W6) && locked(d[3], W7) && locked(d[4], W8);
    })
  );
  assert(
    'P',
    'P2 her own household saved, no plan: 2 opens Moment 2’s opening',
    ok(() => go(doors({ hostSaved: true })[2], 'moment2-opening'))
  );
  assert(
    'P',
    'P3 a plan made, not approved: 2 opens the plan view; 3 says W7 (a tap never approves)',
    ok(() => {
      const d = doors({ hostSaved: true, hasPlan: true });
      return go(d[2], 'plan') && locked(d[3], W7);
    })
  );
  assert(
    'P',
    'P4 approved, not held: 3 opens Moment 3; 4 says W8 (a tap never holds)',
    ok(() => {
      const d = doors({ hostSaved: true, hasPlan: true, planApproved: true });
      return go(d[3], 'moment3') && locked(d[4], W8);
    })
  );
  assert(
    'P',
    'P5 held, not sent: 4 opens the pre-flight',
    ok(() =>
      go(doors({ hostSaved: true, hasPlan: true, planApproved: true, held: true })[4], 'preflight')
    )
  );
  assert(
    'P',
    'P6 sent: 1, 2 and 3 open Moment 1, the plan view and Moment 3; 4 opens the board, never the pre-flight',
    ok(() => {
      const d = doors({
        hostSaved: true,
        hasPlan: true,
        planApproved: true,
        held: true,
        sent: true,
      });
      return go(d[1], 'moment1') && go(d[2], 'plan') && go(d[3], 'moment3') && go(d[4], 'board');
    })
  );
  assert(
    'P',
    'P7 across every combination of the facts, no door opens the questions, and 1 is never locked',
    ok(() => {
      const keys = ['hostSaved', 'hasPlan', 'planApproved', 'held', 'sent'];
      for (let m = 0; m < 32; m++) {
        const f: Record<string, boolean> = {};
        keys.forEach((k, i) => (f[k] = Boolean(m & (1 << i))));
        const d = doors(f);
        if (d[1]?.kind !== 'go') return false;
        for (const n of [1, 2, 3, 4]) {
          if (d[n]?.kind === 'go' && /step1|question/i.test(d[n].target)) return false;
        }
      }
      return true;
    })
  );
  assert(
    'P',
    'P8 opening at a Moment from another page: people → Moment 1; plan → the plan only if one exists; anything else → the entry rule decides',
    ok(
      () =>
        S.requestedStage('people', { hasPlan: false }) === 'moment1' &&
        S.requestedStage('plan', { hasPlan: true }) === 'plan' &&
        S.requestedStage('plan', { hasPlan: false }) === null &&
        S.requestedStage('moment3', { hasPlan: true }) === null &&
        S.requestedStage(null, { hasPlan: true }) === null
    )
  );
  assert(
    'P',
    'P9 the words, exactly: W1 to W9 and W9b',
    ok(() => {
      const w = S.STRIP_WORDS;
      return (
        w.YOUR_EVENTS === W1 &&
        w.BACK_TO_PEOPLE === W2 &&
        w.BACK_TO_QUESTIONS === W3 &&
        w.BACK_TO_WHOS_ON_WHAT === W4 &&
        w.BACK_TO_BOARD === W5 &&
        w.LOCKED_PLAN === W6 &&
        w.LOCKED_WHOS_ON_WHAT === W7 &&
        w.LOCKED_SORTED === W8 &&
        w.SAVE_NEW_HOUSEHOLD === W9 &&
        w.SAVE_CHANGES === W9b
      );
    })
  );

  // ── R — what the screens render ───────────────────────────────────────────────
  const plainArc = render(
    createElement(MomentArc as any, { currentMoment: 2, completedMoments: [1] })
  );
  assert(
    'R',
    'R1 CONTROL: with no doors the strip renders as it always has — no button, no link',
    plainArc.includes(escApos(L1)) && !/<button|<a /.test(plainArc)
  );
  const doorArc = render(
    createElement(MomentArc as any, {
      currentMoment: 2,
      completedMoments: [1],
      doors: { 1: { onGo: () => {} }, 3: { href: '/plan/e1/setup' }, 4: { locked: W8 } },
    })
  );
  assert(
    'R',
    'R2 with doors: a Moment she can reach is a button or a link with its label; the current one is marked aria-current="step" and is not a button',
    /<button[^>]*>[\s\S]*?Who&#x27;s coming\?[\s\S]*?<\/button>/.test(doorArc) &&
      /<a [^>]*href="\/plan\/e1\/setup"[^>]*>[\s\S]*?Who&#x27;s on what\?[\s\S]*?<\/a>/.test(
        doorArc
      ) &&
      /aria-current="step"[^>]*>(?:(?!<\/?(?:button|a)\b)[\s\S])*?What&#x27;s the plan\?/.test(
        doorArc
      ) &&
      !/<(?:button|a)\b[^>]*aria-current/.test(doorArc)
  );
  assert(
    'R',
    'R3 a Moment she can’t reach yet is a button marked aria-disabled, with no link (its line shows on a tap)',
    /<button[^>]*aria-disabled="true"[^>]*>[\s\S]*?Is everyone sorted\?[\s\S]*?<\/button>/.test(
      doorArc
    ) && !/href="[^"]*"[^>]*>[\s\S]{0,400}Is everyone sorted/.test(doorArc)
  );
  const arcSrc = read('src/components/plan/MomentArc.tsx');
  assert(
    'R',
    'R4 CONTROL: the four labels keep the literal shape moment-three E14/E15 read',
    /number:\s*1,\s*label:\s*"Who's coming\?"/.test(arcSrc) &&
      /number:\s*2,\s*label:\s*"What's the plan\?"/.test(arcSrc) &&
      /number:\s*3,\s*label:\s*"Who's on what\?"/.test(arcSrc) &&
      /number:\s*4,\s*label:\s*'Is everyone sorted\?'/.test(arcSrc)
  );
  const outLink = (html: string) =>
    new RegExp(`<a [^>]*href="/plan/events"[^>]*>${W1}</a>`).test(html);
  const opening = render(createElement(SetupOpeningScreen as any, { onStart: () => {} }));
  assert('R', 'R5 the opening screen has W1, to Your events', outLink(opening));
  const summary = render(
    createElement(Moment1Summary as any, {
      eventId: 'e1',
      eventName: 'Boxing Day',
      households: [
        {
          id: 'h1',
          primaryContact: { name: 'Kate', email: 'k@example.com' },
          helpers: [],
          littleCount: 0,
          guests: [],
          isHostHousehold: true,
        },
      ],
      onContinue: () => {},
      onBackToEditing: () => {},
    })
  );
  assert('R', 'R6 Moment 1’s summary has W1', outLink(summary));
  const m2open = render(
    createElement(Moment2Opening as any, {
      eventName: 'Boxing Day',
      onStart: () => {},
      onBack: () => {},
    })
  );
  assert(
    'R',
    'R7 Moment 2’s opening has W1, and W2 as a button',
    outLink(m2open) && new RegExp(`<button[^>]*>${W2}</button>`).test(m2open)
  );
  const modal = codeOnly(read('src/components/plan/Moment2Step1Modal.tsx'));
  assert(
    'R',
    'R8a Moment 2’s questions: no × (aria-label="Close"); W2 sits in the footer before "Generate plan →"',
    modal.length > 0 &&
      !/aria-label="Close"/.test(modal) &&
      modal.lastIndexOf('{STRIP_WORDS.BACK_TO_PEOPLE}') >
        modal.indexOf('fixed bottom-0 left-0 right-0') &&
      modal.indexOf('fixed bottom-0 left-0 right-0') > 0 &&
      modal.lastIndexOf('{STRIP_WORDS.BACK_TO_PEOPLE}') < modal.indexOf('Generate plan &rarr;')
  );
  assert(
    'R',
    'R8b Moment 2’s questions: every way out waits for the pending save, and stays if it fails',
    /const leave = useCallback\(\s*async[\s\S]{0,900}await saveToApi\([\s\S]{0,300}if \(!saved\) return;/.test(
      modal
    )
  );
  const planView = render(
    createElement(
      ToastProvider as any,
      null,
      createElement(Moment2PlanView as any, {
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
      })
    )
  );
  assert(
    'R',
    'R9 the plan view says W3, and no longer "← Back to event setup"',
    planView.includes(W3) && !planView.includes('← Back to event setup')
  );
  const after = await load('../src/components/preflight/AfterThePress');
  const chaseView = render(
    after?.AfterThePressView
      ? createElement(after.AfterThePressView, {
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
        })
      : null
  );
  assert(
    'R',
    'R10 "Who I chase" has W5, to the board',
    new RegExp(`<a [^>]*href="/plan/e1/glance"[^>]*>${W5}</a>`).test(chaseView)
  );
  const preflight = codeOnly(read('src/app/plan/[eventId]/pre-flight/page.tsx'));
  assert(
    'R',
    'R11 the pre-flight, before the press: W4 to the setup page (Moment 3), and the strip with Moments 1 to 3 done and 4 current',
    /href=\{`\/plan\/\$\{eventId\}\/setup`\}[^>]*>\s*\{STRIP_WORDS\.BACK_TO_WHOS_ON_WHAT\}/.test(
      preflight
    ) && /<MomentArc\s+currentMoment=\{4\}\s+completedMoments=\{\[1, 2, 3\]\}/.test(preflight)
  );
  const setup = codeOnly(read('src/app/plan/[eventId]/setup/page.tsx'));
  const hostBlock = setup.slice(
    setup.indexOf("if (moment1Phase === 'host')"),
    setup.indexOf('const handleAddHousehold')
  );
  assert(
    'R',
    'R12 Moment 1’s first step (her own household) has W1',
    /href="\/plan\/events"[\s\S]{0,300}\{STRIP_WORDS\.YOUR_EVENTS\}/.test(hostBlock)
  );
  assert(
    'R',
    'R13 CONTROL: nothing the strip renders in calls useRouter (walkthrough-batch1 and batch3 render these statically)',
    [
      'src/components/plan/MomentArc.tsx',
      'src/components/plan/Moment1InputForm.tsx',
      'src/components/plan/Moment2PlanView.tsx',
      'src/components/plan/Moment3AssignView.tsx',
    ].every((f) => read(f).length > 0 && !/useRouter/.test(read(f)))
  );
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
  assert(
    'R',
    'R-send CONTROL: the pre-flight’s Send is byte for byte as it was',
    read('src/app/plan/[eventId]/pre-flight/page.tsx').includes(SEND_AT_HEAD)
  );

  // ── V — GTC-362, the sign-in page (founder ruling Q1) ─────────────────────────
  const verify = codeOnly(read('src/app/auth/verify/page.tsx'));
  assert(
    'V',
    'V1 GTC-362: the sign-in page replaces its address with where she lands (router.replace), and pushes nothing',
    /router\.replace\(data\.redirectUrl\)/.test(verify) && !/router\.push\(/.test(verify)
  );
}

// ══ CHROME — the dev server, behind the safeguards ═════════════════════════════
const created = {
  users: [] as string[],
  people: [] as string[],
  events: [] as string[],
  sessions: [] as string[],
  magicLinks: [] as string[],
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
  const mail = (l: string) => `gtc367-${l}-${stamp}@example.com`;
  const user = await prisma.user.create({ data: { email: mail('kate') } });
  created.users.push(user.id);
  const kate = await prisma.person.create({
    data: { name: 'Kate B5', email: user.email, userId: user.id },
  });
  created.people.push(kate.id);
  const token = randomBytes(32).toString('hex');
  const session = await prisma.session.create({
    data: { userId: user.id, token, expiresAt: new Date(Date.now() + 3600e3) },
  });
  created.sessions.push(session.id);
  const start = new Date(Date.now() + 20 * 864e5);

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
    for (const [i, nm] of names.entries()) {
      const p = await prisma.person.create({
        data: { name: nm, email: mail(`${nm.toLowerCase().replace(/\W/g, '')}-${n++}`) },
      });
      created.people.push(p.id);
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
  const addPlan = async (eventId: string) => {
    let order = 0;
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
        await prisma.item.create({
          data: {
            name: d,
            teamId: t.id,
            source: 'GENERATED',
            aiGenerated: true,
            quantityAmount: 2,
            quantityUnit: 'TRAYS',
            status: 'UNASSIGNED',
            displayOrder: i,
          } as any,
        });
      }
    }
  };

  // The opening screen: nothing saved. The first step: a household, but not hers yet.
  const evOpen = await mkEvent('GTC-367 b5 — opening');
  const evHost = await mkEvent('GTC-367 b5 — first step');
  await addHousehold(evHost.id, ['Josie Walker'], null);
  // Moment 1's form: her household and two more, nothing past Moment 1.
  const evM1 = await mkEvent('GTC-367 b5 — the people');
  await addHost(evM1.id, null);
  await addHousehold(evM1.id, ['Josie Walker'], null);
  await addHousehold(evM1.id, ['Gus Tane'], null);
  // The flow: walked through its stages by writing its stored state, one step at a time.
  const evFlow = await mkEvent('GTC-367 b5 — the flow');
  await addHost(evFlow.id, null);
  await addHousehold(evFlow.id, ['Josie Walker', 'Ross Walker'], null);
  await addHousehold(evFlow.id, ['Gus Tane'], null);
  await prisma.eventSetup.create({ data: { eventId: evFlow.id, eventType: 'Christmas' } });
  // Sent: the press's stamps written directly, nothing queued.
  const sentAt = new Date(Date.now() - 2 * 864e5);
  const evSent = await mkEvent('GTC-367 b5 — sent', { status: 'CONFIRMING', sentAt });
  await addHost(evSent.id, sentAt);
  await addHousehold(evSent.id, ['Mere Parata'], sentAt);
  await prisma.eventSetup.create({
    data: { eventId: evSent.id, eventType: 'Christmas', planApprovedAt: new Date() },
  });
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
      await prisma.magicLink.count({ where: { id: { in: created.magicLinks } } }),
      await prisma.team.count({ where: evIn }),
      await prisma.item.count({ where: { team: evIn } }),
      await prisma.accessToken.count({ where: evIn }),
      await prisma.outboundMessage.count({ where: evIn }),
      await prisma.inviteEvent.count({ where: evIn }),
    ].join(',');

  let chrome: Headless | null = null;
  let whileExists = '';
  let probes = { plan: '', send: '' };
  try {
    chrome = await openHeadless({ fetchImpl: realFetch, port: 9387 });
    const c = chrome;
    await c.blockPlanMaking();
    await c.blockSends();
    await c.navigate('/', 3000);
    probes = {
      plan: await c.evaluate<string>(
        `fetch('/api/gtc367-probe/finalize-plan', { method: 'POST' }).then(r => 'reached ' + r.status).catch(() => 'failed')`
      ),
      send: await c.evaluate<string>(
        `fetch('/api/events/gtc367-probe/send', { method: 'POST' }).then(r => 'reached ' + r.status).catch(() => 'failed')`
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
    const link = (words: string) =>
      `[...document.querySelectorAll('a, button')].find(b => b.innerText.trim() === ${JSON.stringify(words)})`;
    const note = () =>
      ev<string>(`(document.querySelector('[data-strip-note]')?.innerText ?? '').trim()`);
    const isM1Form = async () => (await body()).includes('Who’s coming to GTC-367 b5');
    const isQuestions = async () => (await body()).includes('What kind of event are you planning?');
    const isM2Opening = async () => (await body()).includes('Let’s do this →');
    const isPlanView = async () => (await body()).includes('Here’s what I’d suggest for');
    const isM3 = async () => (await body()).includes("Now. Who's on what.");
    const setupOf = (id: string) => `/plan/${id}/setup`;
    /** Empties Moment 1's name field the way typing would, so leaving raises no "leave site?". */
    const clearName = () =>
      ev(`(() => { const i = document.querySelector('#m1-name'); if (!i) return false;
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, '');
        i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
    const hasOut = async () => (await ev<boolean>(`!!(${link(W1)})`)) === true;

    // ── C4 — a way out on every overlay ─────────────────────────────────────────
    await c.navigate(setupOf(evOpen.id), 6000);
    assert('C', 'C4a the opening screen has W1', await hasOut());
    await c.navigate(setupOf(evHost.id), 6000);
    const onFirstStep = (await body()).includes('First — you’re at');
    assert(
      'C',
      'C4b Moment 1’s first step (her own household) has W1',
      onFirstStep && (await hasOut())
    );

    // ── The flow, at Moment 2's questions (EventSetup, no plan) ──────────────────
    await c.navigate(setupOf(evFlow.id), 7000);
    assert('C', 'C4e Moment 2’s questions have W1', (await isQuestions()) && (await hasOut()));

    // C3: a choice made, then straight out by W1 — the save lands before the page goes.
    const chip = await tap(
      `[...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Easter')`,
      50
    );
    const out = await tap(link(W1), 2500);
    const typeAfter = (
      await prisma.eventSetup.findUnique({
        where: { eventId: evFlow.id },
        select: { eventType: true },
      })
    )?.eventType;
    assert(
      'C',
      'C3 a choice made just before leaving by W1 is saved before the page goes',
      chip === null && out === null && (await path()) === '/plan/events' && typeAfter === 'Easter',
      `chip ${chip}, out ${out}, eventType ${typeAfter}`
    );

    // C1: W2 in the questions' footer opens Moment 1.
    await c.navigate(setupOf(evFlow.id), 7000);
    const back = await tap(link(W2), 1500);
    assert(
      'C',
      'C1 from Moment 2’s questions, W2 opens Moment 1’s form',
      back === null && (await isM1Form())
    );

    // C2: the strip on the questions opens Moment 1.
    await c.navigate(setupOf(evFlow.id), 7000);
    const s1 = await tap(strip(L1), 1500);
    assert(
      'C',
      'C2 from Moment 2’s questions, the strip’s “Who’s coming?” opens Moment 1',
      s1 === null && (await isM1Form())
    );

    // ── Moment 1's form, on its own event (households, no EventSetup) ──────────────
    await c.navigate(setupOf(evM1.id), 7000);
    assert('C', 'C4c CONTROL: Moment 1’s form has W1', (await isM1Form()) && (await hasOut()));

    // C12a: a new household typed, not saved — the tap keeps her here and says W9.
    await tap(`document.querySelector('#m1-name')`, 300);
    await c.insertText('Aunt May');
    const t12a = await tap(strip(L2), 900);
    const n12a = await note();
    const kept = await ev<string>(`document.querySelector('#m1-name')?.value ?? ''`);
    assert(
      'C',
      'C12a a new household typed and not saved: a strip tap stays, says W9, and keeps what she typed',
      t12a === null && n12a === W9 && kept === 'Aunt May' && (await isM1Form()),
      `note "${n12a}", kept "${kept}"`
    );
    await clearName();
    await sleep(300);

    // C12b: a saved household being changed — the tap keeps her here and says W9b.
    const edit = await tap(
      `[...document.querySelectorAll('button')].filter(b => b.innerText.trim() === 'Edit' && b.offsetParent !== null).pop()`,
      900
    );
    const t12b = await tap(strip(L2), 900);
    const n12b = await note();
    const stillEditing = (await body()).includes('Save changes');
    assert(
      'C',
      'C12b a saved household being changed: a strip tap stays and says W9b',
      edit === null && t12b === null && n12b === W9b && stillEditing,
      `note "${n12b}"`
    );
    await tap(link('Cancel'), 600);
    await clearName();
    await sleep(300);

    // C4d: from Moment 1, the strip's "What's the plan?" opens Moment 2's opening (no plan yet).
    const s2 = await tap(strip(L2), 1500);
    assert(
      'C',
      'C4d with no plan, the strip opens Moment 2’s opening, which has W1 and W2',
      s2 === null &&
        (await isM2Opening()) &&
        (await hasOut()) &&
        (await ev<boolean>(`!!(${link(W2)})`))
    );

    // ── The plan made (written directly) ──────────────────────────────────────────
    await addPlan(evFlow.id);
    await c.navigate(setupOf(evFlow.id), 7000);
    const s5a = await tap(strip(L1), 1500);
    assert(
      'C',
      'C5a from the plan view, the strip’s “Who’s coming?” opens Moment 1',
      s5a === null && (await isM1Form())
    );
    await c.navigate(setupOf(evFlow.id), 7000);
    const b5 = await tap(link(W3), 1500);
    assert('C', 'C5b the plan view’s W3 opens the questions', b5 === null && (await isQuestions()));
    await c.navigate(setupOf(evFlow.id), 7000);
    const t6 = await tap(strip(L3), 900);
    const n6 = await note();
    const approvedAt = (
      await prisma.eventSetup.findUnique({
        where: { eventId: evFlow.id },
        select: { planApprovedAt: true },
      })
    )?.planApprovedAt;
    assert(
      'C',
      'C6 before approval, “Who’s on what?” says W7 and stays; nothing is approved',
      t6 === null && n6 === W7 && (await isPlanView()) && approvedAt === null,
      `note "${n6}"`
    );

    // ── Approved ─────────────────────────────────────────────────────────────────
    const stamped = new Date();
    await prisma.eventSetup.update({
      where: { eventId: evFlow.id },
      data: { planApprovedAt: stamped },
    });
    await c.navigate(setupOf(evFlow.id), 8000);
    const t7 = await tap(strip(L4), 900);
    const n7 = await note();
    const status7 = (
      await prisma.event.findUnique({ where: { id: evFlow.id }, select: { status: true } })
    )?.status;
    assert(
      'C',
      'C7 before the plan is held, “Is everyone sorted?” says W8 and stays; nothing is held',
      t7 === null && n7 === W8 && (await isM3()) && status7 === 'DRAFT',
      `note "${n7}"`
    );
    await c.navigate(setupOf(evFlow.id), 8000);
    const t8 = await tap(strip(L2), 1500);
    const approvedAfter = (
      await prisma.eventSetup.findUnique({
        where: { eventId: evFlow.id },
        select: { planApprovedAt: true },
      })
    )?.planApprovedAt;
    assert(
      'C',
      'C8 from Moment 3, “What’s the plan?” opens the plan view; the approval is unchanged',
      t8 === null && (await isPlanView()) && approvedAfter?.getTime() === stamped.getTime()
    );

    // ── Held, not sent: the pre-flight ────────────────────────────────────────────
    await prisma.event.update({ where: { id: evFlow.id }, data: { status: 'CONFIRMING' } });
    const pre = `/plan/${evFlow.id}/pre-flight`;
    await c.navigate(pre, 8000);
    const w4 = await tap(link(W4), 8000);
    assert('C', 'C9a the pre-flight’s W4 opens Moment 3', w4 === null && (await isM3()));
    await c.navigate(pre, 8000);
    const p1 = await tap(strip(L1), 8000);
    const p1Path = await path();
    assert(
      'C',
      'C9b from the pre-flight, the strip’s “Who’s coming?” opens Moment 1, and the address is the setup page’s own again',
      p1 === null && (await isM1Form()) && p1Path === setupOf(evFlow.id),
      `path ${p1Path}`
    );
    await c.navigate(pre, 8000);
    const p2 = await tap(strip(L2), 8000);
    assert(
      'C',
      'C9c from the pre-flight, “What’s the plan?” opens the plan view',
      p2 === null && (await isPlanView())
    );
    await c.navigate(pre, 8000);
    const p3 = await tap(strip(L3), 8000);
    assert(
      'C',
      'C9d from the pre-flight, “Who’s on what?” opens Moment 3',
      p3 === null && (await isM3())
    );

    // ── Sent ─────────────────────────────────────────────────────────────────────
    await c.navigate(setupOf(evSent.id), 8000);
    const t10 = await tap(strip(L4), 8000);
    assert(
      'C',
      'C10a after the press, Moment 3’s “Is everyone sorted?” opens the board',
      t10 === null && (await path()) === `/plan/${evSent.id}/glance`
    );
    await c.navigate(setupOf(evSent.id), 8000);
    const t10b = await tap(strip(L2), 1500);
    assert(
      'C',
      'C10b after the press, “What’s the plan?” opens the plan view',
      t10b === null && (await isPlanView())
    );
    await c.navigate(`/plan/${evSent.id}/pre-flight`, 8000);
    const onChase = (await body()).includes('Who I chase');
    const t11 = await tap(link(W5), 8000);
    assert(
      'C',
      'C11 “Who I chase” has W5, and it opens the board',
      onChase && t11 === null && (await path()) === `/plan/${evSent.id}/glance`
    );

    // ── C13 — every screen stays the phone's width ──────────────────────────────
    await c.setViewport(390, 844, true);
    const widths: string[] = [];
    for (const p of [
      setupOf(evOpen.id),
      setupOf(evHost.id),
      setupOf(evFlow.id),
      `/plan/${evFlow.id}/pre-flight`,
      setupOf(evSent.id),
      `/plan/${evSent.id}/pre-flight`,
    ]) {
      await c.navigate(p, 7000);
      widths.push(
        `${p.split('/').pop()}:${await ev<number>(`document.documentElement.scrollWidth`)}`
      );
    }
    assert(
      'C',
      'C13 CONTROL: at 390 every screen walked is 390 wide',
      widths.every((w) => Number(w.split(':')[1]) <= 390),
      widths.join(' ')
    );
    await c.setViewport(1280, 900, false);

    // ── C14 — GTC-362: Back after signing in (founder ruling Q1) ────────────────
    const linkToken = randomBytes(32).toString('hex');
    const ml = await prisma.magicLink.create({
      data: { email: user.email, token: linkToken, expiresAt: new Date(Date.now() + 15 * 60e3) },
    });
    created.magicLinks.push(ml.id);
    await c.navigate('/', 4000);
    await c.navigate(`/auth/verify?token=${linkToken}&returnUrl=%2Fplan%2Fevents`, 8000);
    const landed = await ev<string>(`location.pathname`);
    await ev(`history.back()`);
    await sleep(6000);
    const afterBack = await ev<string>(`location.pathname`);
    const usedShown = (await body()).includes('Link Already Used');
    assert(
      'C',
      'C14 GTC-362: signed in from a link, Back returns to the page before it, never "Link Already Used"',
      landed === '/plan/events' && afterBack === '/' && !usedShown,
      `landed ${landed}, after Back ${afterBack}, used shown ${usedShown}`
    );

    whileExists = await rows();
    console.log(
      `  fixture rows (Event, EventSetup, EventRole, Household, PersonEvent, Person, User, Session, MagicLink, Team, Item, AccessToken, OutboundMessage, InviteEvent): ${whileExists}`
    );
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
      blocked.every((b) => b.includes('gtc367-probe')) &&
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
  assert(
    'S',
    `S4 aiCallsUsed 0 on every event; every row removed by id (${whileExists} while it existed); totals as found (${before.invite}/${before.outbound} -> ${after.invite}/${after.outbound})`,
    ai.length === 5 &&
      ai.every((e) => e.aiCallsUsed === 0) &&
      whileExists.length > 0 &&
      left === '0,0,0,0,0,0,0,0,0,0,0,0,0,0' &&
      after.invite === before.invite &&
      after.outbound === before.outbound,
    `left ${left}`
  );

  const routes = (dir: string): number =>
    readdirSync(dir).reduce((acc, f) => {
      const p = join(dir, f);
      return acc + (statSync(p).isDirectory() ? routes(p) : f === 'route.ts' ? 1 : 0);
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
  const evIds = created.events;
  // Every row below was made by this suite: its events and what hangs off them, its people, its
  // user, that user's sessions (its own, and the one its sign-in wrote) and its sign-in link.
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
  await del(() => prisma.magicLink.deleteMany({ where: { id: { in: created.magicLinks } } }));
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
