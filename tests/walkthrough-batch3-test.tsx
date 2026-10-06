/**
 * GTC-365 — walkthrough batch 3: Moment 1's column, the plan's "Add item", and Moment 3.
 *
 * The founder walked the Moment flow himself and sorted what he found (GTC-189's Fourth ruling).
 * This suite pins batch 3 to the words he ruled on the plan (GTC-365, PLAN RULINGS 2026-10-06, W1 to
 * W8, with his fix to W7) and to the behaviour he chose (Q1 to Q14, with his change to Q7), plus the
 * phone plan screen he found in the planning screenshots:
 *
 *   16  the household being entered shows in the column before Save (W1 to W3, Q1 to Q4); on a phone
 *       the column sits below the form, so nothing above it grows while she types
 *   27  "+ Add item" a full-width dashed button, "↻ Regenerate this category" on its own line (Q5);
 *       and on a phone every item's name is readable (layout only, nothing changes on a computer)
 *   4   one tap accepts the suggestions on screen (W4 to W6, Q6), asking why at most once; a person
 *       marked "Just attending" loses their suggestions at once (the founder's change to Q7)
 *   29  a given item is the soft blue (Q12, A), and the pick ring still shows on it
 *   30  a picked person stays picked (W7, W8, Q8), a held item moves or comes back in one tap (Q9,
 *       Q10), and quick taps all count (Q11)
 *
 * Naming: "W6" here is this ticket's part-way line for Accept all. A single failed save still says
 * GTC-355's W6, "That didn't save. Try again." (M3_WORDS.SAVE_FAILED) — the founder's naming note.
 *
 * The render, words and pure layers run in memory. The Chrome layers drive the dev server in the
 * walled-off headless Chrome, on fixtures of their own (example.com addresses, no phones), behind
 * the three safeguards of GATHER-BUILD-CONSTANTS.md ("Looking on screen"): the server runs with the
 * AI key blanked; the browser fails every plan-making request before it leaves the page (proven on a
 * probe URL first); every click is `clickGuarded`. Never pressed: Regenerate, Generate, Move on,
 * Send, New Event. Every fixture row is counted while it exists and removed by id; the InviteEvent
 * and OutboundMessage totals are asserted as found.
 *
 * Needs the dev server on :3000 and a global WebSocket (NODE_OPTIONS=--experimental-websocket).
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';

import HouseholdCardList from '../src/components/plan/HouseholdCardList';
import Moment1InputForm from '../src/components/plan/Moment1InputForm';
import Moment2PlanView from '../src/components/plan/Moment2PlanView';
import { ToastProvider } from '../src/contexts/ToastContext';
import { M3_WORDS } from '../src/lib/moment3/words';
import { suggestAssignments } from '../src/lib/moment3/suggest';
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

// ── The ruled words, verbatim (GTC-365, PLAN RULINGS 2026-10-06) ─────────────
const W1 = 'Not saved yet';
const W2 = 'New household';
const W3 = 'Editing · not saved yet';
const W4 = (n: number) => (n === 1 ? '✓ Accept 1 suggestion' : `✓ Accept all ${n} suggestions`);
const W5 = 'Accepting…';
const W6 = (b: number, n: number) => `${b} of ${n} didn't save. Tap ✓ to try again.`;
const W7 = (name: string) => `Tap items to give them to ${name}.`;
const W8 = 'Done';
/** GTC-355's W6 — a single failed save. Unchanged. */
const GTC355_W6 = "That didn't save. Try again.";
/** Q12, A — the soft blue. */
const BLUE = { background: '#EEF4FB', border: '#B7CCE6', text: '#1F3A5F' };
const BOARD_COLOURS = ['#EAF3DE', '#FAEEDA', '#FCEBEB'];

const html = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const COLUMN_HEADING = 'Ducks in a row so far';

const josie = {
  id: 'h-josie',
  primaryContact: { name: 'Josie Walker' },
  partner: { name: 'Ross Walker' },
  helpers: [],
  littleCount: 0,
  guests: [],
};
const lenaDraft = {
  id: 'draft',
  primaryContact: { name: 'Lena Ford' },
  partner: { name: 'Sam Ford' },
  helpers: [],
  littleCount: 0,
  guests: [{ name: 'Nan Ford' }],
};
const column = (props: Record<string, unknown>) =>
  renderToStaticMarkup(
    createElement(HouseholdCardList as any, { households: [josie], onEdit: () => {}, ...props })
  );

async function runInMemory() {
  // ══ ITEM 16 — the household being entered, in the column ═══════════════════
  const D = await load('../src/lib/households/draft');
  const empty = { name: '', partnerName: null, helperNames: [], littleCount: 0, guestNames: [] };
  assert(
    '16',
    '16a householdDraft: nothing typed (a kid-without-a-job count alone included) is no card',
    ok(
      () =>
        D.householdDraft(empty) === null &&
        D.householdDraft({ ...empty, littleCount: 2, partnerName: '  ' }) === null
    )
  );
  assert(
    '16',
    '16b householdDraft carries the names trimmed, blank rows dropped, and the kids’ count',
    ok(() => {
      const d = D.householdDraft({
        name: '  Lena Ford ',
        partnerName: 'Sam Ford',
        helperNames: ['', ' Mia '],
        littleCount: 2,
        guestNames: ['Nan Ford', '  '],
      });
      return (
        d.primaryContact.name === 'Lena Ford' &&
        d.partner?.name === 'Sam Ford' &&
        d.helpers.length === 1 &&
        d.helpers[0].name === 'Mia' &&
        d.littleCount === 2 &&
        d.guests.length === 1 &&
        d.guests[0].name === 'Nan Ford'
      );
    })
  );
  assert(
    '16',
    '16c only a partner typed: the card is named W2 "New household"',
    ok(
      () =>
        D.householdDraft({ ...empty, partnerName: 'Sam Ford' }).primaryContact.name === W2 &&
        D.DRAFT_WORDS.NEW_HOUSEHOLD === W2 &&
        D.DRAFT_WORDS.NOT_SAVED_YET === W1 &&
        D.DRAFT_WORDS.EDITING === W3
    )
  );
  assert(
    '16',
    '16d the column shows the unsaved household after the saved ones, with W1 and its names',
    ok(() => {
      const out = column({ draft: lenaDraft });
      return (
        out.includes(W1) &&
        out.includes('Sam Ford') &&
        out.includes('Nan Ford') &&
        out.indexOf('Josie Walker') < out.indexOf('Lena Ford') &&
        /data-draft-card/.test(out)
      );
    })
  );
  assert(
    '16',
    '16e with nothing saved yet the column still shows (heading and card); "start" puts it first',
    ok(() => {
      const none = column({ households: [], draft: lenaDraft });
      const first = column({ draft: lenaDraft, draftAt: 'start' });
      return (
        none.includes(COLUMN_HEADING) &&
        none.includes('Lena Ford') &&
        none.includes(W1) &&
        first.indexOf('Lena Ford') < first.indexOf('Josie Walker')
      );
    })
  );
  assert(
    '16',
    '16f a saved household being edited: its own card shows what is typed, with W3, not W1',
    ok(() => {
      const out = column({
        editingHouseholdId: josie.id,
        draft: { ...josie, partner: { name: 'Rossiter Walker' } },
      });
      return (
        out.includes(html(W3)) &&
        out.includes('Rossiter Walker') &&
        !out.includes('Ross Walker<') &&
        !out.includes(W1) &&
        out.split('Josie Walker').length - 1 === 1
      );
    })
  );
  assert(
    '16',
    '16g CONTROL: the column with no unsaved household: no W1, no W3, the saved names',
    ok(() => {
      const out = column({});
      return (
        out.includes(COLUMN_HEADING) &&
        out.includes('Josie Walker') &&
        out.includes('Ross Walker') &&
        !out.includes(W1) &&
        !out.includes(html(W3))
      );
    })
  );
  assert(
    '16',
    '16h CONTROL: the form renders as before when the page listens for the draft',
    ok(() => {
      const out = renderToStaticMarkup(
        createElement(Moment1InputForm as any, {
          eventId: 'e1',
          eventName: 'Boxing Day',
          onComplete: () => {},
          onAddPerson: async () => {},
          onDraftChange: () => {},
          channelCandidates: [],
        })
      );
      return (
        out.includes('Anyone else in this household?') &&
        out.includes(html('Save & add another household'))
      );
    })
  );

  // ══ ITEM 27 — "+ Add item" ═════════════════════════════════════════════════
  const plan = renderToStaticMarkup(
    createElement(
      ToastProvider as any,
      null,
      createElement(Moment2PlanView as any, {
        eventId: 'e1',
        eventName: 'Boxing Day',
        guestCount: 10,
        categories: [
          {
            id: 't-mains',
            name: 'Mains',
            emoji: '🍖',
            items: [{ id: 'i1', name: 'Glazed ham', quantity: 1, unit: 'ham', servingSize: '' }],
          },
        ],
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
  const addItemTag = (plan.match(/<button[^>]*>\+ Add item<\/button>/) ?? [''])[0];
  assert(
    '27',
    '27a "+ Add item" is a full-width dashed button',
    /w-full/.test(addItemTag) && /border-dashed/.test(addItemTag)
  );
  const between = plan.slice(
    plan.indexOf('+ Add item</button>'),
    plan.indexOf('Regenerate this category')
  );
  assert(
    '27',
    '27b "↻ Regenerate this category" is not in "+ Add item"’s row',
    plan.includes('+ Add item</button>') && /<div/.test(between)
  );
  assert(
    '27',
    '27e CONTROL: the words are unchanged — "+ Add item", "↻ Regenerate this category", "+ Add category"',
    plan.includes('>+ Add item<') &&
      plan.includes('↻ Regenerate this category') &&
      plan.includes('>+ Add category<')
  );
  assert(
    '27',
    '27f CONTROL: Regenerate still calls onRegenerateCategory with the category’s key',
    /onClick=\{\(\) => onRegenerateCategory\(categoryKey\)\}/.test(
      codeOnly(read('src/components/plan/Moment2PlanView.tsx'))
    )
  );

  // ══ THE WORDS — W4 to W8, and GTC-355's W6 ═════════════════════════════════
  const Wd = (await load('../src/lib/moment3/words')) ?? {};
  assert(
    'W',
    'Wa W4 both forms: "✓ Accept all 5 suggestions" and "✓ Accept 1 suggestion"',
    ok(() => Wd.acceptAllLabel(5) === W4(5) && Wd.acceptAllLabel(1) === W4(1))
  );
  assert(
    'W',
    'Wb W5 "Accepting…"',
    ok(() => Wd.M3_WORDS.ACCEPTING === W5)
  );
  assert(
    'W',
    'Wc W6 "2 of 5 didn’t save. Tap ✓ to try again."',
    ok(() => Wd.acceptAllFailed(2, 5) === W6(2, 5) && Wd.acceptAllFailed(1, 4) === W6(1, 4))
  );
  assert(
    'W',
    'Wd W7 with the founder’s fix: "Tap items to give them to Gus." — no "Picked:"',
    ok(() => Wd.giveToLine('Gus') === W7('Gus') && !/Picked/.test(Wd.giveToLine('Gus')))
  );
  assert(
    'W',
    'We W8 "Done"',
    ok(() => Wd.M3_WORDS.DONE === W8)
  );
  assert(
    'W',
    'Wf CONTROL: GTC-355’s W6 for a single failed save is unchanged',
    M3_WORDS.SAVE_FAILED === GTC355_W6
  );

  // ══ THE PURE RULES — Moment 3 ══════════════════════════════════════════════
  const A = await load('../src/lib/moment3/assigning');
  assert(
    '4',
    '4b the suggestions on screen are the shown ones whose item nobody holds',
    ok(() => {
      const on = A.suggestionsOnScreen(
        [
          { itemId: 'a', personId: 'gus' },
          { itemId: 'b', personId: 'tom' },
        ],
        { a: { personId: 'ana', name: 'Ana' }, b: null }
      );
      return on.length === 1 && on[0].itemId === 'b';
    })
  );
  assert(
    '4',
    '4n Q7 (the founder’s change): marking a person "Just attending" drops their suggestions',
    ok(() => {
      const left = A.dropSuggestionsFor(
        [
          { itemId: 'a', personId: 'gus' },
          { itemId: 'b', personId: 'tom' },
          { itemId: 'c', personId: 'gus' },
        ],
        'gus'
      );
      return left.length === 1 && left[0].personId === 'tom';
    })
  );
  assert(
    '30',
    '30a with a person picked, a tap gives, moves or takes back — and the person stays picked',
    ok(() => {
      const gus = { kind: 'person', id: 'gus' };
      const give = A.itemTap(gus, 'i1', null);
      const move = A.itemTap(gus, 'i1', 'ross');
      const back = A.itemTap(gus, 'i1', 'gus');
      return (
        give.act === 'give' &&
        give.personId === 'gus' &&
        move.act === 'move' &&
        move.personId === 'gus' &&
        back.act === 'take-back' &&
        A.selectionAfterGive(gus) === gus &&
        A.selectionAfterGive({ kind: 'item', id: 'i1' }) === null
      );
    })
  );
  assert(
    '29',
    '29a a given item’s colour is A, the soft blue (#EEF4FB, #B7CCE6, #1F3A5F)',
    ok(
      () =>
        A.GIVEN_ROW.background === BLUE.background &&
        A.GIVEN_ROW.border === BLUE.border &&
        A.GIVEN_ROW.text === BLUE.text
    )
  );
  assert(
    '29',
    '29d the blue is none of the board’s colours (green settled, amber, red)',
    ok(
      () =>
        typeof A.GIVEN_ROW.background === 'string' &&
        !BOARD_COLOURS.includes(A.GIVEN_ROW.background.toUpperCase()) &&
        !BOARD_COLOURS.includes(A.GIVEN_ROW.border.toUpperCase())
    )
  );

  // ══ STRUCTURE — the view and the page ══════════════════════════════════════
  const view = codeOnly(read('src/components/plan/Moment3AssignView.tsx'));
  const page = codeOnly(read('src/app/plan/[eventId]/setup/page.tsx'));
  assert(
    '4',
    '4c Accept all asks once for the whole batch (askForBatchReason, CREATE_ASSIGNMENT each)',
    /askForBatchReason\(\s*[\s\S]{0,300}?'CREATE_ASSIGNMENT'/.test(view)
  );
  assert(
    '4',
    '4d the setup page hands Moment 3 its batch question',
    /<Moment3AssignView[\s\S]{0,800}?askForBatchReason=\{askForBatchReason\}/.test(page)
  );
  const viewFetches = view.match(/fetch\(\s*`[^`]*`/g) ?? [];
  assert(
    '4',
    '4j CONTROL: every fetch in the view still goes to the assign, people or check route',
    viewFetches.length > 0 &&
      viewFetches.every((f) =>
        /`\/api\/events\/\$\{[^}]+\}\/(items\/\$\{[^}]+\}\/assign|people\/\$\{[^}]+\}|check)`/.test(
          f
        )
      )
  );
  const routes = (dir: string): number =>
    readdirSync(dir).reduce((n, f) => {
      const p = join(dir, f);
      return n + (statSync(p).isDirectory() ? routes(p) : f === 'route.ts' ? 1 : 0);
    }, 0);
  assert(
    '4',
    '4k CONTROL: no new API route — src/app/api still has 112 route.ts',
    routes(join(process.cwd(), 'src/app/api')) === 112
  );
  assert(
    '4',
    '4i CONTROL: who Gather suggests is unchanged (a fixed input, its known answer)',
    ok(() => {
      const s = suggestAssignments(
        [
          { id: 'i1', kind: 'ITEM', assigneePersonId: null },
          { id: 'i2', kind: 'TASK', assigneePersonId: null },
          { id: 'i3', kind: 'ITEM', assigneePersonId: 'b' },
          { id: 'i4', kind: 'ITEM', assigneePersonId: null },
        ],
        [
          { personId: 'h', count: 0, isHost: true, justAttending: false, isKidWithJob: false },
          { personId: 'a', count: 1, isHost: false, justAttending: false, isKidWithJob: false },
          { personId: 'b', count: 1, isHost: false, justAttending: false, isKidWithJob: false },
          { personId: 'k', count: 0, isHost: false, justAttending: false, isKidWithJob: true },
          { personId: 'j', count: 0, isHost: false, justAttending: true, isKidWithJob: false },
        ]
      );
      return (
        JSON.stringify(s) ===
        JSON.stringify([
          { itemId: 'i1', personId: 'a' },
          { itemId: 'i2', personId: 'k' },
          { itemId: 'i4', personId: 'b' },
        ])
      );
    })
  );
}

// ── The Chrome layers ──────────────────────────────────────────────────────────
const created = {
  users: [] as string[],
  people: [] as string[],
  events: [] as string[],
  sessions: [] as string[],
};
const refusals: string[] = [];

/** Clear Moment 1's name field, so its "leave site?" warning never blocks the next page. */
const CLEAR_NAME = `(() => { const i = document.querySelector('input[placeholder="e.g. Sarah Mitchell"]'); if (!i) return false;
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, '');
  i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`;

const HELPERS = `
window.__vis = (el) => !!el && el.getClientRects().length > 0;
window.__tag = (el, t) => { document.querySelectorAll('[data-t]').forEach((e) => e.removeAttribute('data-t')); if (!el) return false; el.setAttribute('data-t', t); return true; };
window.__btn = (text, root) => [...(root || document).querySelectorAll('button')].filter(window.__vis).find((b) => b.innerText.trim() === text) || null;
window.__btnStarts = (text, root) => [...(root || document).querySelectorAll('button')].filter(window.__vis).find((b) => b.innerText.trim().startsWith(text)) || null;
window.__col = () => [...document.querySelectorAll('p')].filter(window.__vis).find((p) => p.innerText.trim() === ${JSON.stringify(COLUMN_HEADING)})?.parentElement || null;
window.__draft = () => [...document.querySelectorAll('[data-draft-card]')].find(window.__vis) || null;
window.__item = (name) => [...document.querySelectorAll('section button[data-m3-row]')].find((b) => b.innerText.includes(name)) || null;
window.__person = (name) => [...document.querySelectorAll('.md\\\\:w-80 button[data-m3-row]')].find((b) => b.innerText.includes(name)) || null;
window.__pressed = () => [...document.querySelectorAll('button[data-m3-row][aria-pressed="true"]')].map((b) => b.innerText.replace(/\\s+/g, ' ').trim());
window.__ghosts = () => [...document.querySelectorAll('button[aria-label^="Give "]')].map((b) => { const l = b.getAttribute('aria-label').slice(5); const k = l.lastIndexOf(' to '); return [l.slice(0, k), l.slice(k + 4)]; });
window.__dialogs = 0;
new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && (n.matches?.('[role="dialog"][aria-label="Keep a note?"]') || n.querySelector?.('[role="dialog"][aria-label="Keep a note?"]'))) window.__dialogs++; }).observe(document.body, { childList: true, subtree: true });
true;`;

async function runLive() {
  const up = await (async () => {
    try {
      return (await realFetch(`${BASE}/`)).ok;
    } catch {
      return false;
    }
  })();
  assert('C', 'S0 PRECONDITION: the dev server answers on :3000', up);
  if (!up) return;

  const totals = async () => ({
    invite: await prisma.inviteEvent.count(),
    outbound: await prisma.outboundMessage.count(),
  });
  const before = await totals();

  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const mail = (l: string) => `gtc365-${l}-${stamp}@example.com`;
  const user = await prisma.user.create({ data: { email: mail('kate') } });
  created.users.push(user.id);
  const kate = await prisma.person.create({
    data: { name: 'Kate B3', email: user.email, userId: user.id },
  });
  created.people.push(kate.id);
  const token = randomBytes(32).toString('hex');
  const session = await prisma.session.create({
    data: { userId: user.id, token, expiresAt: new Date(Date.now() + 3600e3) },
  });
  created.sessions.push(session.id);
  const start = new Date(Date.now() + 40 * 864e5);

  /** One event: the host's household, then `households`; with `sections`, a plan written directly. */
  const mk = async (
    name: string,
    opts: {
      households: Array<[string, string?]>;
      sections?: Array<[string, string[]]>;
      approved?: boolean;
      sent?: boolean;
      given?: Record<string, string>;
    }
  ) => {
    const ev = await prisma.event.create({
      data: {
        name,
        startDate: start,
        endDate: start,
        hostId: kate.id,
        status: opts.sent ? 'CONFIRMING' : 'DRAFT',
        sentAt: opts.sent ? new Date() : null,
        guestCount: 12,
      },
    });
    created.events.push(ev.id);
    await prisma.eventRole.create({ data: { eventId: ev.id, userId: user.id, role: 'HOST' } });
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
    const ids: Record<string, string> = {};
    for (const [lead, partner] of opts.households) {
      const hh = await prisma.household.create({ data: { eventId: ev.id } });
      for (const [i, n] of [lead, ...(partner ? [partner] : [])].entries()) {
        const p = await prisma.person.create({
          data: {
            name: n,
            email: mail(`${n.toLowerCase().replace(/\W/g, '')}-${created.people.length}`),
          },
        });
        created.people.push(p.id);
        ids[n] = p.id;
        await prisma.personEvent.create({
          data: {
            personId: p.id,
            eventId: ev.id,
            role: 'PARTICIPANT',
            householdId: hh.id,
            householdRole: i === 0 ? 'PRIMARY_CONTACT' : 'PARTNER',
          },
        });
      }
    }
    const items: Record<string, string> = {};
    if (opts.sections) {
      await prisma.eventSetup.create({
        data: {
          eventId: ev.id,
          eventType: 'christmas',
          ...(opts.approved ? { planApprovedAt: new Date() } : {}),
        },
      });
      let order = 0;
      for (const [section, names] of opts.sections) {
        const team = await prisma.team.create({
          data: { name: section, eventId: ev.id, displayOrder: order++, source: 'GENERATED' },
        });
        for (const n of names) {
          const holder = opts.given?.[n];
          const it = await prisma.item.create({
            data: {
              name: n,
              teamId: team.id,
              source: 'GENERATED',
              aiGenerated: true,
              quantityAmount: 1,
              quantityUnit: 'CUSTOM',
              quantityUnitCustom: 'serves 12',
              status: holder ? 'ASSIGNED' : 'UNASSIGNED',
            } as any,
          });
          items[n] = it.id;
          if (holder)
            await prisma.assignment.create({ data: { itemId: it.id, personId: ids[holder] } });
        }
      }
    }
    return { id: ev.id, ids, items };
  };

  const GUESTS: Array<[string, string?]> = [
    ['Josie Walker', 'Ross Walker'],
    ['Gus Tane'],
    ['Mere Parata', 'Hemi Parata'],
    ['Ana Lealaiauloto'],
    ['Tom Bryce'],
    ['Priya Shah', 'Dev Shah'],
  ];
  const M3_SECTIONS: Array<[string, string[]]> = [
    ['Mains', ['Glazed ham', 'Roast lamb', 'Roast potatoes', 'Gravy']],
    ['Sides & Salads', ['Green salad', 'Coleslaw', 'Bread rolls', 'Potato salad']],
    ['Dessert', ['Classic pavlova with cream', 'Trifle', 'Christmas pudding']],
    ['Non-Alcoholic Drinks', ['L&P', 'Sparkling water', 'Spare item']],
  ];
  const GIVEN = { 'Glazed ham': 'Josie Walker', 'Roast lamb': 'Ross Walker' };
  const longList: Array<[string, string?]> = [
    ...GUESTS,
    ...[
      'Aroha Ngata',
      'Ben Cole',
      'Cara Doyle',
      'Dan Ellis',
      'Eve Ford',
      'Finn Gray',
      'Gia Hunt',
      'Hugo Ives',
    ].map((n) => [n] as [string]),
  ];
  const m1 = await mk('GTC-365 batch3 — Moment 1', { households: longList });
  const pv = await mk('GTC-365 batch3 — the plan', {
    households: GUESTS,
    sections: [
      [
        'Mains',
        ['Glazed ham with a pineapple and mustard crust', 'Roast potatoes with rosemary', 'Gravy'],
      ],
      ['Dessert', ['Classic pavlova with cream', 'Christmas pudding']],
    ],
  });
  const pick = await mk('GTC-365 batch3 — Moment 3, picking', {
    households: GUESTS,
    sections: M3_SECTIONS,
    approved: true,
    given: GIVEN,
  });
  const acc = await mk('GTC-365 batch3 — Moment 3, accept all', {
    households: GUESTS,
    sections: M3_SECTIONS,
    approved: true,
    given: GIVEN,
  });
  const sent = await mk('GTC-365 batch3 — Moment 3, after the press', {
    households: GUESTS,
    sections: M3_SECTIONS,
    approved: true,
    sent: true,
    given: GIVEN,
  });
  const fail = await mk('GTC-365 batch3 — Moment 3, a part-way failure', {
    households: GUESTS,
    sections: M3_SECTIONS,
    approved: true,
    given: GIVEN,
  });

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
  const fixtureTeams = await prisma.team.count({ where: evIn });
  console.log(
    `  fixture rows (Event, EventSetup, EventRole, Household, PersonEvent, Person, User, Session, Team, Item, Assignment, AccessToken, OutboundMessage, InviteEvent): ${await rows()}`
  );
  const holderOf = async (itemId: string) =>
    (await prisma.assignment.findUnique({ where: { itemId } }))?.personId ?? null;
  const heldBy = async (personId: string, eventId: string) =>
    prisma.assignment.count({ where: { personId, item: { team: { eventId } } } });

  let chrome: Headless | null = null;
  let whileExists = '';
  try {
    chrome = await openHeadless({ fetchImpl: realFetch, port: 9376 });
    await chrome.blockPlanMaking();
    await chrome.setSessionCookie(token);
    const c = chrome;
    const ev = <T = any,>(js: string) => c.evaluate<T>(js);
    const go = async (path: string) => {
      await ev(CLEAR_NAME).catch(() => false);
      await sleep(200);
      await c.navigate(path, 9000);
      await ev(HELPERS);
    };
    /** Tag what `js` finds, then click it — guarded. Resolves to null when clicked, else why not. */
    const tap = async (js: string, settleMs?: number) => {
      const found = await ev<boolean>(`window.__tag(${js}, 'x')`);
      if (!found) return 'not found';
      const why = await c.clickGuarded('[data-t="x"]', settleMs);
      if (why) refusals.push(`${js}: ${why}`);
      return why;
    };
    const focusIn = (ph: string) =>
      ev(
        `(() => { const i = [...document.querySelectorAll('input[placeholder="${ph}"]')].find(window.__vis); if (!i) return false; i.focus(); return true; })()`
      );
    const S = JSON.stringify;
    /** After Accept all: wait until it is no longer saving ("Accepting…"), at most 12s. */
    const settled = async () => {
      await sleep(600);
      for (let i = 0; i < 60; i++) {
        if (await ev<boolean>(`!window.__btn(${S(W5)})`)) break;
        await sleep(200);
      }
      await sleep(300);
    };

    // ── Item 16, desktop ──────────────────────────────────────────────────────
    await c.setViewport(1280, 900, false);
    await go(`/plan/${m1.id}/setup`);
    const probe = await ev<string>(
      `fetch('/__gtc365_probe/finalize-plan', { method: 'POST' }).then((r) => 'reached ' + r.status, () => 'failed in the browser')`
    );
    assert(
      'C',
      'S1 SAFETY: the plan-making block holds — a probe request fails in the browser',
      probe === 'failed in the browser' && c.planMakingBlocked().length === 1,
      probe
    );
    const m1Households = () => prisma.household.count({ where: { eventId: m1.id } });
    const hhBefore = await m1Households();
    const colText = () => ev<string>(`window.__col()?.innerText ?? ''`);
    await focusIn('e.g. Sarah Mitchell');
    await c.insertText('Lena Ford');
    await sleep(300);
    const afterName = await colText();
    assert(
      '16',
      '16i desktop: a typed name shows in the column at once, before Save, marked W1',
      afterName.includes('Lena Ford') && afterName.includes(W1),
      afterName.slice(-120)
    );
    await tap(`window.__btn('👫 Add Partner')`);
    await focusIn("Partner's name");
    await c.insertText('Sam Ford');
    await tap(`window.__btn('👤 Add Guest')`);
    await focusIn("Guest's name");
    await c.insertText('Nan Ford');
    await sleep(300);
    const afterMembers = await colText();
    assert(
      '16',
      '16j desktop: the partner and the guest show on that card as they are typed',
      afterMembers.includes('Sam Ford') && afterMembers.includes('Nan Ford')
    );
    const inView = await ev<string>(`(() => { const d = window.__draft(); if (!d) return 'no card';
      const s = d.closest('.overflow-y-auto'); const a = s.getBoundingClientRect(); const b = d.getBoundingClientRect();
      return JSON.stringify({ overflows: s.scrollHeight > s.clientHeight, inside: b.top >= a.top - 1 && b.bottom <= a.bottom + 1 }); })()`);
    assert(
      '16',
      '16k desktop, a list longer than the column: the unsaved card is in the column’s view',
      inView.includes('"overflows":true') && inView.includes('"inside":true'),
      inView
    );
    assert(
      '16',
      '16o CONTROL: nothing is written before Save — the event’s households are as they were',
      (await m1Households()) === hhBefore
    );
    await tap(`window.__btn('Save & add another household')`);
    await sleep(1500);
    const saved = await colText();
    const nameNow = await ev<string>(
      `document.querySelector('input[placeholder="e.g. Sarah Mitchell"]')?.value ?? 'missing'`
    );
    assert(
      '16',
      '16p CONTROL: after Save the household is saved — in the column without W1, the form clear',
      saved.includes('Lena Ford') &&
        !saved.includes(W1) &&
        nameNow === '' &&
        (await m1Households()) === hhBefore + 1
    );
    const lenaEdit = `[...window.__col().querySelectorAll('button')].filter((b) => b.innerText.trim() === 'Edit').find((b) => b.closest('div.border')?.innerText.includes('Lena Ford'))`;
    await tap(lenaEdit);
    await sleep(500);
    await ev(`(() => { const i = [...document.querySelectorAll('input')].find((x) => x.value === 'Sam Ford'); if (!i) return false;
      i.focus(); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, '');
      i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
    await c.insertText('Samuel Ford');
    await sleep(300);
    const editing = await colText();
    assert(
      '16',
      '16q desktop: editing a saved household shows the change on its card as typed, with W3',
      editing.includes('Samuel Ford') && editing.includes(W3)
    );
    await tap(`window.__btn('Cancel')`);
    await sleep(500);
    const cancelled = await colText();
    assert(
      '16',
      '16r CONTROL: Cancel puts the saved names back, without W3',
      cancelled.includes('Sam Ford') && !cancelled.includes('Samuel') && !cancelled.includes(W3)
    );

    // ── Item 16, phone ────────────────────────────────────────────────────────
    await c.setViewport(390, 844, true);
    await go(`/plan/${m1.id}/setup`);
    const below =
      await ev<string>(`(() => { const col = window.__col(); const save = window.__btn('Save & move on →');
      if (!col || !save) return 'missing'; return String(col.getBoundingClientRect().top >= save.getBoundingClientRect().bottom); })()`);
    assert('16', '16l phone: the column sits below the form', below === 'true', below);
    const fieldAt = () =>
      ev<number>(`(() => { const i = document.querySelector('input[placeholder="e.g. Sarah Mitchell"]'); const s = i.closest('.overflow-y-auto');
        return Math.round(i.getBoundingClientRect().top + (s ? s.scrollTop : window.scrollY)); })()`);
    const at0 = await fieldAt();
    await focusIn('e.g. Sarah Mitchell');
    await c.insertText('Mo Kahu');
    await tap(`window.__btn('👫 Add Partner')`);
    await focusIn("Partner's name");
    await c.insertText('Pita Kahu');
    await sleep(300);
    const at1 = await fieldAt();
    assert(
      '16',
      '16m CONTROL: phone — the name field does not move while she types and adds a member',
      at0 === at1,
      `${at0} -> ${at1}`
    );
    await ev(`window.__btn('Save & move on →')?.scrollIntoView({ block: 'center' })`);
    await sleep(300);
    const cardSeen =
      await ev<string>(`(() => { const d = window.__draft(); if (!d) return 'no card'; const r = d.getBoundingClientRect();
      return String(r.top >= 0 && r.bottom <= innerHeight && d.innerText.includes('Mo Kahu') && d.innerText.includes('Pita Kahu')); })()`);
    assert(
      '16',
      '16n phone: at the Save buttons the unsaved card is in view, with both names',
      cardSeen === 'true',
      cardSeen
    );

    // ── Item 27 and the phone plan screen ─────────────────────────────────────
    const addItemGeometry = () =>
      ev<string>(`(() => { const out = []; for (const b of [...document.querySelectorAll('button')].filter((x) => x.innerText.trim() === '+ Add item')) {
        const sec = b.parentElement.closest('.space-y-6 > div'); const g = [...b.parentElement.parentElement.querySelectorAll('button')].find((x) => x.innerText.includes('Regenerate this category'));
        const r = b.getBoundingClientRect(); const s = sec.getBoundingClientRect(); const q = g ? g.getBoundingClientRect() : null;
        out.push({ wide: Math.abs(r.width - s.width) <= 2, ownLine: q ? q.top >= r.bottom + 4 : false, w: Math.round(r.width), sw: Math.round(s.width) }); }
        return JSON.stringify(out); })()`);
    const rowGeometry = () =>
      ev<string>(`JSON.stringify([...document.querySelectorAll('button[aria-label="Edit quantity"]')].map((q) => { const row = q.parentElement;
        const kids = [...row.children].map((k) => { const r = k.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top + r.height / 2), Math.round(r.width), Math.round(r.height)]; });
        const name = row.querySelector('div > button').getBoundingClientRect(); const rr = row.getBoundingClientRect();
        return { kids, rowH: Math.round(rr.height), nameW: Math.round(name.width), nameH: Math.round(name.height) }; }))`);
    const geo: Record<string, string> = {};
    for (const [w, h, mobile, label] of [
      [1280, 900, false, 'desktop'],
      [390, 844, true, 'phone'],
    ] as const) {
      await c.setViewport(w, h, mobile);
      await go(`/plan/${pv.id}/setup`);
      geo[`add-${label}`] = await addItemGeometry();
      geo[`rows-${label}`] = await rowGeometry();
      geo[`width-${label}`] = String(await ev<number>('document.documentElement.scrollWidth'));
    }
    console.log(
      `  plan view geometry, desktop rows (left, centre-y, width, height per child): ${geo['rows-desktop']}`
    );
    const adds = (k: string): any[] => {
      try {
        return JSON.parse(geo[k]);
      } catch {
        return [];
      }
    };
    assert(
      '27',
      '27c "+ Add item" spans its section’s width, at 1280 and at 390',
      adds('add-desktop').length === 2 &&
        adds('add-phone').length === 2 &&
        [...adds('add-desktop'), ...adds('add-phone')].every((a) => a.wide),
      `${geo['add-desktop']} ${geo['add-phone']}`
    );
    assert(
      '27',
      '27d "↻ Regenerate this category" sits on its own line below it, at both widths',
      [...adds('add-desktop'), ...adds('add-phone')].length === 4 &&
        [...adds('add-desktop'), ...adds('add-phone')].every((a) => a.ownLine)
    );
    const phoneRows = adds('rows-phone');
    assert(
      'P',
      'P1 phone, 390 wide: every item’s name is readable — at least 200px wide, at most two lines',
      phoneRows.length === 5 && phoneRows.every((r) => r.nameW >= 200 && r.nameH <= 44),
      JSON.stringify(phoneRows.map((r) => [r.nameW, r.nameH]))
    );
    assert(
      'P',
      'P2 CONTROL: the plan screen at 390 is exactly 390 wide',
      geo['width-phone'] === '390',
      geo['width-phone']
    );
    const deskRows = adds('rows-desktop');
    assert(
      'P',
      'P3 CONTROL: at 1280 each item row is one line — name, amount and the three buttons side by side',
      deskRows.length === 5 &&
        deskRows.every(
          (r) =>
            r.kids.length === 5 &&
            r.kids.every((k: number[]) => Math.abs(k[1] - r.kids[0][1]) <= 4) &&
            r.kids.every((k: number[], i: number) => i === 0 || k[0] > r.kids[i - 1][0])
        ),
      geo['rows-desktop']
    );

    // ── Items 29 and 30, Moment 3 (desktop) ───────────────────────────────────
    await c.setViewport(1280, 900, false);
    await go(`/plan/${pick.id}/setup`);
    const rowStyle = (name: string) =>
      ev<string>(`(() => { const b = window.__item(${S(name)}); if (!b) return 'missing'; const s = getComputedStyle(b.closest('li'));
        return JSON.stringify({ bg: s.backgroundColor, border: s.borderTopColor, style: s.borderTopStyle, ring: s.boxShadow }); })()`);
    const given = await rowStyle('Glazed ham');
    const open = await rowStyle('Roast potatoes');
    assert(
      '29',
      '29b a given row is the soft blue; an unassigned row keeps its dotted border on white',
      given.includes('"bg":"rgb(238, 244, 251)"') &&
        given.includes('"border":"rgb(183, 204, 230)"') &&
        open.includes('"style":"dotted"') &&
        open.includes('"bg":"rgb(255, 255, 255)"'),
      `${given} ${open}`
    );
    await tap(`window.__item('Glazed ham')`);
    const ringed = await rowStyle('Glazed ham');
    assert(
      '29',
      '29c CONTROL: a picked given row still shows the ring',
      ringed !== 'missing' && !ringed.includes('"ring":"none"'),
      ringed
    );

    const press = () => ev<string[]>('window.__pressed()');
    const GUS = 'Gus Tane';
    await go(`/plan/${pick.id}/setup`);
    await tap(`window.__item('Gravy')`);
    await tap(`window.__person('Ana Lealaiauloto')`);
    await sleep(1200);
    assert(
      '30',
      '30b CONTROL: an item first, then a person — the item is given and the pick clears',
      (await holderOf(pick.items['Gravy'])) === pick.ids['Ana Lealaiauloto'] &&
        (await press()).length === 0
    );

    await go(`/plan/${pick.id}/setup`);
    await tap(`window.__person(${S(GUS)})`);
    for (const dish of ['Trifle', 'Christmas pudding', 'Classic pavlova with cream']) {
      await tap(`window.__item(${S(dish)})`);
      await sleep(900);
    }
    const threeHeld = await Promise.all(
      ['Trifle', 'Christmas pudding', 'Classic pavlova with cream'].map((d) =>
        holderOf(pick.items[d])
      )
    );
    assert(
      '30',
      '30c pick Gus, tap three items: all three are Gus’s, and Gus is still picked',
      threeHeld.every((p) => p === pick.ids[GUS]) && (await press()).some((t) => t.includes(GUS)),
      JSON.stringify({ threeHeld, pressed: await press() })
    );

    await go(`/plan/${pick.id}/setup`);
    await tap(`window.__person(${S(GUS)})`);
    const line = await ev<string>(
      `(() => { const p = document.querySelector('[data-m3="picked"]'); return p ? p.innerText.replace(/\\s+/g, ' ').trim() : 'none'; })()`
    );
    assert(
      '30',
      '30d the foot of the screen says W7 with the founder’s fix, and has W8 — no "Picked:"',
      line.includes(W7(GUS)) && line.includes(W8) && !line.includes('Picked'),
      line
    );
    await tap(`window.__btn('Done')`);
    assert(
      '30',
      '30e "Done" unpicks: nobody picked, and the line is gone',
      (await press()).length === 0 &&
        (await ev<boolean>(`!document.querySelector('[data-m3="picked"]')`)) === true
    );
    await go(`/plan/${pick.id}/setup`);
    await tap(`window.__person(${S(GUS)})`);
    const pickedBeforeEsc = (await press()).some((t) => t.includes(GUS));
    await ev(`window.__person(${S(GUS)})?.focus()`);
    await c.pressKey('Escape');
    assert('30', '30f CONTROL: Escape unpicks', pickedBeforeEsc && (await press()).length === 0);

    await go(`/plan/${pick.id}/setup`);
    await tap(`window.__person(${S(GUS)})`);
    await tap(`window.__item('Roast lamb')`);
    await sleep(1200);
    assert(
      '30',
      '30g with Gus picked, an item Ross holds moves to Gus in one tap, and Gus stays picked',
      (await holderOf(pick.items['Roast lamb'])) === pick.ids[GUS] &&
        (await press()).some((t) => t.includes(GUS))
    );
    await tap(`window.__item('Roast lamb')`);
    await sleep(1200);
    assert(
      '30',
      '30h …and tapping it again takes it back off Gus, who stays picked',
      (await holderOf(pick.items['Roast lamb'])) === null &&
        (await press()).some((t) => t.includes(GUS))
    );

    await go(`/plan/${pick.id}/setup`);
    await tap(`window.__person(${S(GUS)})`);
    await tap(`window.__item('L&P')`, 0);
    await tap(`window.__item('Sparkling water')`, 0);
    await sleep(2000);
    assert(
      '30',
      '30i two taps closer together than a save: both count',
      (await holderOf(pick.items['L&P'])) === pick.ids[GUS] &&
        (await holderOf(pick.items['Sparkling water'])) === pick.ids[GUS]
    );

    await go(`/plan/${pick.id}/setup`);
    await tap(`window.__person(${S(GUS)})`);
    await tap(`window.__item('Roast potatoes')`, 0);
    const shownAtOnce = await ev<string>(`window.__item('Roast potatoes')?.innerText ?? ''`);
    await sleep(1500);
    assert(
      '30',
      '30j the tapped item shows Gus at once, before the save comes back',
      shownAtOnce.includes(GUS) && (await holderOf(pick.items['Roast potatoes'])) === pick.ids[GUS],
      shownAtOnce.replace(/\s+/g, ' ')
    );

    await go(`/plan/${pick.id}/setup`);
    await prisma.item.delete({ where: { id: pick.items['Spare item'] } });
    await tap(`window.__person(${S(GUS)})`);
    await tap(`window.__item('Spare item')`);
    await sleep(1200);
    const spare = await ev<string>(`window.__item('Spare item')?.innerText ?? ''`);
    assert(
      '30',
      '30k CONTROL: a save that fails leaves the item unassigned and says GTC-355’s W6',
      spare.includes(M3_WORDS.UNASSIGNED) &&
        !spare.includes(GUS) &&
        (await ev<string>('document.body.innerText')).includes(GTC355_W6),
      spare.replace(/\s+/g, ' ')
    );

    // ── Item 30, phone ────────────────────────────────────────────────────────
    await c.setViewport(390, 844, true);
    await go(`/plan/${pick.id}/setup`);
    await tap(`window.__person(${S(GUS)})`);
    await sleep(800);
    const phoneLine =
      await ev<string>(`(() => { const p = document.querySelector('[data-m3="picked"]'); const g = window.__person(${S(GUS)});
      const gr = g.getBoundingClientRect(); const listOut = gr.bottom < 0 || gr.top > innerHeight;
      if (!p) return 'no line; list out of view ' + listOut; const r = p.getBoundingClientRect();
      return String(listOut && r.top >= 0 && r.bottom <= innerHeight && p.innerText.includes(${S(W7(GUS))})); })()`);
    assert(
      '30',
      '30m phone: with the people list out of view, W7 with Gus’s name is on screen',
      phoneLine === 'true',
      phoneLine
    );

    // ── Item 4 — accept all, before the press, with the founder's change to Q7 ──
    await c.setViewport(1280, 900, false);
    await go(`/plan/${acc.id}/setup`);
    await tap(`window.__btn('Want me to suggest?')`);
    const shown = await ev<[string, string][]>('window.__ghosts()');
    const leaver = shown.some((g) => g[1] === 'Tom Bryce') ? 'Tom Bryce' : '';
    const leaverRow = `[...document.querySelectorAll('.md\\\\:w-80 li')].find((li) => li.innerText.includes(${S(leaver)}))`;
    await tap(`window.__btn('Just attending', ${leaverRow})`, 150);
    const afterMark = await ev<[string, string][]>('window.__ghosts()');
    assert(
      '4',
      '4l Q7: marking a person "Just attending" takes their suggestions off the screen at once',
      shown.length >= 2 &&
        afterMark.length === shown.length - shown.filter((g) => g[1] === leaver).length &&
        afterMark.every((g) => g[1] !== leaver),
      JSON.stringify({ shown: shown.length, leaver, after: afterMark.length })
    );
    await sleep(800);
    const expected = await ev<[string, string][]>('window.__ghosts()');
    await ev('window.__dialogs = 0');
    await tap(`window.__btnStarts('✓ Accept')`);
    await settled();
    const accHolders = Object.fromEntries(
      await Promise.all(
        Object.entries(acc.items).map(async ([n, id]) => [n, await holderOf(id)] as const)
      )
    );
    const want: Record<string, string | null> = {};
    for (const n of Object.keys(acc.items)) want[n] = null;
    want['Glazed ham'] = acc.ids['Josie Walker'];
    want['Roast lamb'] = acc.ids['Ross Walker'];
    for (const [item, person] of expected) want[item] = acc.ids[person] ?? `?${person}`;
    const exact = Object.keys(want).every((n) => accHolders[n] === want[n]);
    assert(
      '4',
      '4e Accept all gives exactly the suggestions on screen, and nothing else',
      expected.length >= 1 && exact,
      JSON.stringify({ expected, accHolders })
    );
    assert(
      '4',
      '4f …and before the press it asks no why',
      expected.length >= 1 && exact && (await ev<number>('window.__dialogs')) === 0
    );
    assert(
      '4',
      '4m Q7: the person marked "Just attending" was given nothing by Accept all',
      leaver !== '' &&
        (await heldBy(acc.ids[leaver], acc.id)) === 0 &&
        expected.length >= 1 &&
        exact
    );

    // ── Item 4 — after the press: one why ───────────────────────────────────────
    await go(`/plan/${sent.id}/setup`);
    await tap(`window.__btn('Want me to suggest?')`);
    const sentShown = await ev<[string, string][]>('window.__ghosts()');
    await ev('window.__dialogs = 0');
    await tap(`window.__btnStarts('✓ Accept')`, 800);
    const dialogsAtAsk = await ev<number>('window.__dialogs');
    await tap(`window.__btn('Skip')`);
    await settled();
    const sentHeld = await Promise.all(sentShown.map(([item]) => holderOf(sent.items[item])));
    assert(
      '4',
      '4g after the press: one tap of Accept all asks why exactly once; Skip, and every one is given',
      sentShown.length >= 2 &&
        dialogsAtAsk === 1 &&
        (await ev<number>('window.__dialogs')) === 1 &&
        sentShown.every(([, person], i) => sentHeld[i] === sent.ids[person]),
      JSON.stringify({ shown: sentShown.length, dialogsAtAsk, sentHeld })
    );

    // ── Item 4 — a part-way failure ──────────────────────────────────────────────
    await go(`/plan/${fail.id}/setup`);
    await tap(`window.__btn('Want me to suggest?')`);
    const failShown = await ev<[string, string][]>('window.__ghosts()');
    const gone = failShown.length ? failShown[0][0] : '';
    if (gone) await prisma.item.delete({ where: { id: fail.items[gone] } });
    await tap(`window.__btnStarts('✓ Accept')`);
    await settled();
    const failText = await ev<string>('document.body.innerText');
    const rest = failShown.slice(1);
    const restHeld = await Promise.all(rest.map(([item]) => holderOf(fail.items[item])));
    const stillOffered = await ev<[string, string][]>('window.__ghosts()');
    assert(
      '4',
      '4h one fails part-way: the rest are given, that one stays with ✓ and ×, W6 says so once',
      failShown.length >= 2 &&
        rest.every(([, person], i) => restHeld[i] === fail.ids[person]) &&
        stillOffered.length === 1 &&
        stillOffered[0][0] === gone &&
        failText.split(W6(1, failShown.length)).length - 1 === 1,
      JSON.stringify({ shown: failShown.length, stillOffered })
    );

    assert(
      'C',
      'S2 SAFETY: no click was refused for landing outside its target or for its words',
      refusals.every((r) => !/not inside|by its words/.test(r)),
      JSON.stringify(refusals)
    );
    assert(
      'C',
      'S4 SAFETY: the page asked for no plan-making route (the probe is the only request blocked), and only localhost',
      c.planMakingBlocked().length === 1 &&
        /__gtc365_probe/.test(c.planMakingBlocked()[0]) &&
        c.hostsRequested().every((x) => /^localhost(:\d+)?$/.test(x)),
      JSON.stringify({ blocked: c.planMakingBlocked(), hosts: c.hostsRequested() })
    );
    await ev(CLEAR_NAME).catch(() => false);
  } finally {
    chrome?.close();
    whileExists = await rows();
  }
  const ai = await prisma.event.findMany({
    where: { id: { in: created.events } },
    select: { aiCallsUsed: true },
  });
  assert(
    'C',
    'S3 SAFETY: nothing was generated — every fixture event’s aiCallsUsed is 0, and no team was added',
    ai.length === 6 &&
      ai.every((e) => (e.aiCallsUsed ?? 0) === 0) &&
      (await prisma.team.count({ where: evIn })) === fixtureTeams
  );
  await cleanup();
  const after = await totals();
  assert(
    'Z',
    `Z1 every fixture row removed by id (${whileExists} while it existed), and the totals as found (${before.invite}/${before.outbound} -> ${after.invite}/${after.outbound})`,
    (await rows()) === '0,0,0,0,0,0,0,0,0,0,0,0,0,0' &&
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
