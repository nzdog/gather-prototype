/**
 * [[GTC-431]] — THE HOUSEHOLD FORM'S SAVE NEVER FAILS SILENTLY.
 *
 * Found on production, 30 Oct 2026 (20:21 NZ): a tester saved her own household with two adults,
 * added six children and pressed Save; Railway's logs show her phone sent NO request for the next
 * eight minutes. The form's own checks had stopped the Save, and their only words sat under the
 * box that failed, out of sight. The founder's fix (31 Oct 2026), one ticket per commit:
 *
 *   431  When a check stops a Save, "Please fix N things above" shows beside the Save buttons
 *        ("Please fix 1 thing above" for one), and the first failing box, in screen order, takes
 *        focus and comes into view. All three Save buttons, and "Save & move on →".
 *   432  The form checks an email and a phone with their spaces trimmed, and a phone typed
 *        "+64 (0)21 123 4567" is stored as +64211234567 (the one 0 after +64 dropped). Phone rules
 *        otherwise unchanged.
 *   433  "Save changes" that fails (an error reply, a network failure) shows "That didn't save —
 *        please try again." as the other Save buttons do, and keeps the form as she left it.
 *   434  "Save & add another household" (POST /api/events/[id]/households) writes the household,
 *        its adults and children, the contact picker and the ledger entry in one transaction: a
 *        failure part-way stores nothing, and a retry stores the household once, whole.
 *   435  What she types is kept in this browser (localStorage, per signed-in person, event and
 *        form, 7 days) until it is saved, and put back with a quiet line when she comes back:
 *        "Got it" / "Discard", or "Carry on" for a saved household she was changing. A sign-out
 *        clears every draft here; nothing is sent anywhere.
 *
 * THE LAYERS
 *   W  the words, typed here by hand
 *   R  the form rendered in this process: no error marker and no count on a clean form
 *   S  the form's source: every Save path runs the checks through one place; the count is drawn
 *      only after a stopped Save
 *   D  the draft module with a stand-in storage: the key, what is refused and removed, the sweep,
 *      a storage that refuses every touch (GTC-435)
 *   T  the form's email and phone rules and normalizePhoneNumber on typed inputs, each expected
 *      value written here by hand (GTC-432)
 *   X  the households POST over HTTP on the guarded dev server, with the fixture host's session
 *      cookie and no browser: a real part-way failure (a NUL in the third kid's name, which
 *      Postgres refuses), a retry, and a refused contact picker, every row counted (GTC-434)
 *   C  the setup page in the walled-off headless Chrome (port 9495) on the guarded dev server, at
 *      1280 and 390, on a fixture of its own (example.com addresses, made-up 021 numbers, nothing
 *      queued): each Save button pressed with a bad box far above it. Every page fetch is recorded
 *      in the page; the browser fails every plan-making and sending request before it leaves; every
 *      click is `clickGuarded`. Never pressed: Move on, Send, Generate. Every fixture row is counted
 *      and removed by id; InviteEvent and OutboundMessage totals are asserted as found.
 *      C18–C26 (GTC-435) leave by "← Your events" or the phone menu (the "Leave site?" a computer
 *      shows answered Leave, as iPhone Safari leaves without asking) and come back by the event's
 *      row, an in-app route change.
 *
 * Needs the dev server on :3000 and a global WebSocket (NODE_OPTIONS=--experimental-websocket).
 * HOUSEHOLD_SAVE_DRY_RUN=1 runs the in-memory layers only.
 */
import fs from 'fs';
import { execFileSync } from 'child_process';
import path from 'path';
import { randomBytes } from 'crypto';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import Moment1InputForm, {
  fixWords,
  validateEmail,
  validatePhone,
} from '../src/components/plan/Moment1InputForm';
import { normalizePhoneNumber } from '../src/lib/phone';
import { validateChannelTarget } from '../src/lib/households/channel';
import {
  DRAFT_KEEP_WORDS,
  DRAFT_MAX_AGE_MS,
  browserDraftStore,
  changingWords,
  draftKey,
  latestEditDraft,
  readDraft,
  removeDraft,
  sweepDrafts,
  writeDraft,
  type DraftStore,
  type FormDraftState,
} from '../src/lib/households/form-draft';
import { prisma } from '../src/lib/prisma';
import { installProviderTrap } from './helpers/provider-trap';
import { openHeadless, type Headless } from './helpers/headless';

const realFetch = globalThis.fetch;
installProviderTrap();

const ROOT = path.join(__dirname, '..');
const BASE = 'http://localhost:3000';
const PORT = 9495;
const FORM = 'src/components/plan/Moment1InputForm.tsx';
const ROUTE = 'src/app/api/events/[id]/households/route.ts';
const DRAFT_FILE = 'src/lib/households/form-draft.ts';
/** [[GTC-435]]: the branch tip it is built on; the two Save handlers must be as they are there. */
const BASE_435 = '9ff914dff007945800f6519bb950e289438f51e7';
const gitShow = (ref: string, rel: string) => {
  try {
    return execFileSync('git', ['show', `${ref}:${rel}`], { cwd: ROOT, encoding: 'utf8' });
  } catch {
    return '';
  }
};
const SETUP = 'src/app/plan/[eventId]/setup/page.tsx';
const LAYOUT = 'src/app/layout.tsx';
const PROVIDERS = 'src/components/shared/Providers.tsx';
const EVENT_D = 'GTC-435 household draft — her household saved';
const EVENT_E = 'GTC-435 household draft — her own household first';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

const read = (rel: string) => {
  try {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
  } catch {
    return '';
  }
};
/** Source with comments taken out, so a check reads code and not what a comment says. */
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const count = (s: string, sub: string) => s.split(sub).length - 1;
const S0 = JSON.stringify;

// ══ W — THE WORDS ════════════════════════════════════════════════════════════
function layerW() {
  section('W — the words beside Save (GTC-431)');
  assert('W', 'W1 one box: "Please fix 1 thing above"', fixWords(1) === 'Please fix 1 thing above');
  assert(
    'W',
    'W2 two boxes: "Please fix 2 things above"',
    fixWords(2) === 'Please fix 2 things above'
  );
  assert(
    'W',
    'W3 six boxes: "Please fix 6 things above"',
    fixWords(6) === 'Please fix 6 things above'
  );
}

// ══ R — THE FORM, RENDERED HERE ══════════════════════════════════════════════
function render(props: Record<string, unknown>): string {
  try {
    return renderToStaticMarkup(
      createElement(Moment1InputForm as any, {
        eventId: 'e1',
        eventName: 'Boxing Day',
        onComplete: () => {},
        onAddPerson: async () => {},
        channelCandidates: [],
        ...props,
      })
    );
  } catch (e) {
    console.log(`    (render threw: ${String((e as Error).message).split('\n')[0]})`);
    return '';
  }
}
function layerR() {
  section('R — a clean form carries no error marker and no count (GTC-431)');
  const add = render({});
  const host = render({
    hostMode: { name: 'Kate', email: 'kate@example.com', phone: null },
    onSaveHostHousehold: async () => {},
  });
  assert(
    'R',
    'R1 the add form renders, with its Save, and no aria-invalid and no "Please fix"',
    add.includes('Save &amp; add another household') &&
      !add.includes('aria-invalid') &&
      !add.includes('Please fix')
  );
  assert(
    'R',
    'R2 her own household’s step renders, with its Save, and no aria-invalid and no "Please fix"',
    host.includes('Save and add everyone else →') &&
      !host.includes('aria-invalid') &&
      !host.includes('Please fix')
  );
  assert(
    'R',
    'R3 a clean form, with nobody signed in, draws no kept line (GTC-435)',
    !add.includes('data-draft-line') &&
      !add.includes(DRAFT_KEEP_WORDS.KEPT) &&
      !host.includes('data-draft-line')
  );
}

// ══ S — THE FORM'S SOURCE ════════════════════════════════════════════════════
function layerS() {
  section('S — every Save runs the checks through one place (GTC-431)');
  const code = codeOnly(read(FORM));
  assert(
    'S',
    'S1 the four Save paths (add, edit, her own household, and "Save & move on") each stop on checksFail()',
    count(code, 'if (checksFail()) return;') === 4 &&
      /const handleAddAnother = async \(\) => \{\s*if \(checksFail\(\)\) return;/.test(code) &&
      /const handleEditSave = async \(\) => \{\s*if \(!editingHousehold \|\| !onEditSave\) return;\s*if \(checksFail\(\)\) return;/.test(
        code
      ) &&
      /const handleSaveHostHousehold = async \(\) => \{\s*if \(!onSaveHostHousehold\) return;\s*if \(checksFail\(\)\) return;/.test(
        code
      ) &&
      /const handleDone = async \(\) => \{\s*if \(name\.trim\(\)\) \{\s*if \(checksFail\(\)\) return;/.test(
        code
      )
  );
  assert(
    'S',
    'S2 the checks themselves are called in one place only, inside checksFail, drawn at once (flushSync)',
    count(code, 'hasValidationErrors()') === 1 &&
      /const checksFail = \(\): boolean => \{[\s\S]{0,120}flushSync\(\(\) => \{\s*bad = hasValidationErrors\(\);\s*setFixPrompt\(bad\);/.test(
        code
      )
  );
  assert(
    'S',
    'S3 the first visible box marked aria-invalid inside the form takes focus; no new scroll call',
    /formBoxRef\.current\?\.querySelectorAll<HTMLElement>\('\[aria-invalid="true"\]'\)/.test(
      code
    ) &&
      /\.find\(\(el\) => el\.getClientRects\(\)\.length > 0\);\s*first\?\.focus\(\);/.test(code) &&
      count(code, 'scrollIntoView') === 1
  );
  assert(
    'S',
    'S4 every box with its own error is marked: name, the primary’s email and phone, partner, kids, guests (9)',
    count(code, 'aria-invalid={') === 9
  );
  assert(
    'S',
    'S5 the count shows only after a stopped Save and while a box shows an error, as an alert',
    /\{fixPrompt && errorCount > 0 && \(\s*<p role="alert" className="text-red-600 text-sm mb-3">\s*\{fixWords\(errorCount\)\}/.test(
      code
    ) && /setFixPrompt\(false\);/.test(code)
  );
  assert(
    'S',
    'S6 "Save changes" clears the failed-save words before it saves, and a failure sets them; the form is not reset (GTC-433)',
    /const handleEditSave = async \(\) => \{[\s\S]{0,160}?setSaving\(true\);\s*setSaveError\(false\);\s*try \{\s*const payload = buildPayload\(\);\s*await onEditSave\(editingHousehold\.id, payload\);\s*resetForm\(\);\s*\} catch \{\s*setSaveError\(true\);\s*\} finally \{\s*setSaving\(false\);\s*\}\s*\};/.test(
      code
    )
  );
}

function layerS7() {
  section('S7 — the households POST writes in one transaction (GTC-434)');
  const route = codeOnly(read(ROUTE));
  const post = route.slice(route.indexOf('export async function POST'));
  const tx = post.slice(
    post.indexOf('const householdId = await prisma.$transaction(async (tx) => {')
  );
  const flat = tx.replace(/\(\s+/g, '(').replace(/\s+/g, ' ');
  const parts = {
    oneTransaction: post.includes('const householdId = await prisma.$transaction(async (tx) => {'),
    householdInTx: /const household = await tx\.household\.create\(/.test(tx),
    fourMemberWrites: count(flat, 'await createMember(tx, ') === 4,
    pickThrows: /if \(!check\.ok\) throw new ChannelValidationError\(check\.error\);/.test(tx),
    pickInTx: /await tx\.household\.update\(/.test(tx),
    ledgerInTx: /await recordChange\(tx, \{/.test(tx),
    personThroughDb: /findOrCreateCapturedPerson\(db, \{/.test(post),
    noWriteOutside: !/prisma\.(person|personEvent)\.|prisma\.household\.(create|update)\(/.test(
      post
    ),
    pick400:
      /if \(error instanceof ChannelValidationError\) \{\s*return NextResponse\.json\(\{ error: error\.message \}, \{ status: 400 \}\);/.test(
        post
      ),
  };
  assert(
    'S',
    'S7 the household, every member, the picker and the ledger entry are written through the transaction; no write outside it',
    Object.values(parts).every(Boolean),
    S0(
      Object.entries(parts)
        .filter(([, v]) => !v)
        .map(([k]) => k)
    )
  );
}

// ══ D — THE DRAFT KEPT IN THIS BROWSER (GTC-435) ═════════════════════════════
/** A stand-in for localStorage, in this process. */
class StandInStore implements DraftStore {
  m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}
/** A storage that refuses every touch, as some private browsers do. */
const refusingStore: DraftStore = {
  get length(): number {
    throw new Error('refused');
  },
  key() {
    throw new Error('refused');
  },
  getItem() {
    throw new Error('refused');
  },
  setItem() {
    throw new Error('refused');
  },
  removeItem() {
    throw new Error('refused');
  },
};
/** A household as typed: a main contact, a partner, six kids with a job, a guest. */
const typedState = (tag: string): FormDraftState => ({
  name: `Nina ${tag}`,
  email: `nina-${tag}@example.com`,
  phone: '021 000 0001',
  showPartner: true,
  partner: { name: `Ollie ${tag}`, email: '', phone: '' },
  helpers: [1, 2, 3, 4, 5, 6].map((i) => ({
    name: `Kid ${tag} ${i}`,
    email: `kid${i}-${tag}@example.com`,
    phone: `021 000 00${10 + i}`,
    adultRoled: false,
  })),
  showLittles: false,
  littleCount: 1,
  guests: [{ name: `Gus ${tag}`, email: '', phone: '' }],
  order: [
    { type: 'guest', index: 0 },
    ...[5, 4, 3, 2, 1, 0].map((index) => ({ type: 'helper' as const, index })),
    { type: 'partner', index: 0 },
  ],
  contactPersonEventId: null,
  hostingAlone: false,
  messagesMuted: true,
});
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 31, 2, 0, 0);
/** A stored value, as the module writes it, with one part changed. */
const storedValue = (over: Record<string, unknown>) =>
  JSON.stringify({
    v: 1,
    userId: 'u1',
    eventId: 'e1',
    form: 'new',
    savedAt: NOW,
    state: typedState('d'),
    ...over,
  });

function layerD() {
  section('D — the draft, kept in this browser per person, event and form (GTC-435)');
  assert(
    'D',
    'D1 the key: gather:household-draft:v1:<user>:<event>:<form>, for her own step, a new household and a saved one',
    draftKey('u1', 'e1', 'host') === 'gather:household-draft:v1:u1:e1:host' &&
      draftKey('u1', 'e1', 'new') === 'gather:household-draft:v1:u1:e1:new' &&
      draftKey('u1', 'e1', 'edit:h9') === 'gather:household-draft:v1:u1:e1:edit:h9'
  );
  {
    const s = new StandInStore();
    const st = typedState('d2');
    const wrote = writeDraft(s, 'u1', 'e1', 'new', st, undefined, NOW);
    const back = readDraft(s, 'u1', 'e1', 'new', NOW + 1000);
    const raw = JSON.parse(s.getItem(draftKey('u1', 'e1', 'new')) ?? '{}');
    assert(
      'D',
      'D2 written and read back for the same person, event and form: every name, email and phone, the rows in order; the value repeats who, which event, which form, and when',
      wrote &&
        S0(back?.state) === S0(st) &&
        raw.userId === 'u1' &&
        raw.eventId === 'e1' &&
        raw.form === 'new' &&
        raw.savedAt === NOW &&
        raw.v === 1
    );
  }
  {
    const cases: Array<[string, string]> = [
      ['another person inside the value', storedValue({ userId: 'u2' })],
      ['another event inside the value', storedValue({ eventId: 'e2' })],
      ['another form inside the value', storedValue({ form: 'host' })],
      ['another version', storedValue({ v: 2 })],
      ['7 days and 1 minute old', storedValue({ savedAt: NOW - 7 * DAY - 60_000 })],
      ['dated 2 minutes ahead', storedValue({ savedAt: NOW + 120_000 })],
      ['not JSON', '{'],
      ['a littles count of 0', storedValue({ state: { ...typedState('d3'), littleCount: 0 } })],
      [
        'a row order past the rows',
        storedValue({ state: { ...typedState('d3'), order: [{ type: 'helper', index: 6 }] } }),
      ],
    ];
    const off = cases.filter(([, value]) => {
      const s = new StandInStore();
      const k = draftKey('u1', 'e1', 'new');
      s.setItem(k, value);
      return readDraft(s, 'u1', 'e1', 'new', NOW) !== null || s.getItem(k) !== null;
    });
    assert(
      'D',
      `D3 refused and removed (${cases.length}): ${cases.map(([w]) => w).join('; ')}`,
      off.length === 0,
      S0(off.map(([w]) => w))
    );
  }
  {
    const s = new StandInStore();
    s.setItem(draftKey('u1', 'e1', 'new'), storedValue({ savedAt: NOW - 7 * DAY + 60_000 }));
    assert(
      'D',
      'D4 7 days less a minute old: still read; asked for by another person or for another event: nothing, and hers kept',
      readDraft(s, 'u1', 'e1', 'new', NOW) !== null &&
        readDraft(s, 'u2', 'e1', 'new', NOW) === null &&
        readDraft(s, 'u1', 'e2', 'new', NOW) === null &&
        s.getItem(draftKey('u1', 'e1', 'new')) !== null
    );
  }
  {
    const s = new StandInStore();
    s.setItem(draftKey('u1', 'e1', 'new'), storedValue({}));
    s.setItem(draftKey('u1', 'e2', 'edit:h1'), storedValue({ eventId: 'e2', form: 'edit:h1' }));
    s.setItem(draftKey('u2', 'e1', 'new'), storedValue({ userId: 'u2' }));
    s.setItem('gather:preflight-ticks:e1:u1', '{"v":1,"ticks":{}}');
    s.setItem('something-else', 'x');
    const gone = sweepDrafts(s, null, NOW);
    assert(
      'D',
      'D5 the sweep with nobody signed in removes every household draft (3) and nothing else',
      gone === 3 &&
        S0([...s.m.keys()].sort()) === S0(['gather:preflight-ticks:e1:u1', 'something-else']),
      S0([...s.m.keys()])
    );
  }
  {
    const s = new StandInStore();
    const keep1 = draftKey('u1', 'e1', 'new');
    const keep2 = draftKey('u1', 'e2', 'edit:h1');
    s.setItem(keep1, storedValue({}));
    s.setItem(keep2, storedValue({ eventId: 'e2', form: 'edit:h1', savedAt: NOW - DAY }));
    s.setItem(draftKey('u1', 'e1', 'host'), storedValue({ form: 'host', savedAt: NOW - 8 * DAY }));
    s.setItem(draftKey('u2', 'e1', 'new'), storedValue({ userId: 'u2' }));
    s.setItem(draftKey('u1', 'e3', 'new'), storedValue({ userId: 'u2', eventId: 'e3' }));
    s.setItem('something-else', 'x');
    const gone = sweepDrafts(s, 'u1', NOW);
    assert(
      'D',
      'D6 the sweep with her signed in removes another person’s draft, her own too old one, and one whose value names someone else (3); keeps her two fresh ones',
      gone === 3 && S0([...s.m.keys()].sort()) === S0([keep1, keep2, 'something-else'].sort()),
      S0([...s.m.keys()])
    );
  }
  {
    let threw = false;
    let read: unknown = 'x';
    let wrote: unknown = 'x';
    let swept: unknown = 'x';
    let latest: unknown = 'x';
    try {
      read = readDraft(refusingStore, 'u1', 'e1', 'new', NOW);
      wrote = writeDraft(refusingStore, 'u1', 'e1', 'new', typedState('d7'), undefined, NOW);
      removeDraft(refusingStore, 'u1', 'e1', 'new');
      swept = sweepDrafts(refusingStore, 'u1', NOW);
      latest = latestEditDraft(refusingStore, 'u1', 'e1', NOW);
    } catch {
      threw = true;
    }
    assert(
      'D',
      'D7 a storage that refuses every touch breaks nothing: no draft read, the write says no, the sweep removes none; with no window there is no storage',
      !threw &&
        read === null &&
        wrote === false &&
        swept === 0 &&
        latest === null &&
        browserDraftStore() === null
    );
  }
  {
    const s = new StandInStore();
    s.setItem(
      draftKey('u1', 'e1', 'edit:h1'),
      storedValue({ form: 'edit:h1', savedAt: NOW - 5000, householdName: 'Kate' })
    );
    s.setItem(
      draftKey('u1', 'e1', 'edit:h2'),
      storedValue({ form: 'edit:h2', savedAt: NOW - 1000, householdName: 'Ana' })
    );
    s.setItem(draftKey('u1', 'e1', 'new'), storedValue({}));
    s.setItem(draftKey('u1', 'e2', 'edit:h3'), storedValue({ eventId: 'e2', form: 'edit:h3' }));
    const latest = latestEditDraft(s, 'u1', 'e1', NOW);
    assert(
      'D',
      'D8 the saved household she was changing last, on this event only: h2 ("Ana"), not h1, not the new household, not another event’s',
      latest?.householdId === 'h2' && latest.draft.householdName === 'Ana'
    );
  }
  assert(
    'D',
    'D9 the words, typed here by hand (founder, 31 Oct 2026, ruling 2)',
    DRAFT_KEEP_WORDS.KEPT === 'We kept what you typed here earlier. It isn’t saved yet.' &&
      DRAFT_KEEP_WORDS.GOT_IT === 'Got it' &&
      DRAFT_KEEP_WORDS.DISCARD === 'Discard' &&
      DRAFT_KEEP_WORDS.CARRY_ON === 'Carry on' &&
      changingWords('Kate HS') === 'You were changing Kate HS’s household and hadn’t saved.' &&
      DRAFT_MAX_AGE_MS === 7 * DAY
  );
}

function layerS8() {
  section(
    'S8 — the form keeps the draft, and clears it only on a good save or her choice (GTC-435)'
  );
  const code = codeOnly(read(FORM));
  const flat = code.replace(/\s+/g, ' ');
  assert(
    'S',
    'S8 nothing is written or removed before the opening check; the check runs only once the opening has settled, once per form',
    /keepDraft\.current = \(\) => \{ if \(!viewerId \|\| draftChecked !== draftForm\) return;/.test(
      flat
    ) &&
      /if \(!viewerId \|\| draftChecked === draftForm\) return; if \(openedForm !== draftForm \|\| opened === null \|\| snapshot !== opened\) return;/.test(
        flat
      ) &&
      count(code, 'writeDraft(') === 1 &&
      count(code, 'setDraftChecked(draftForm)') === 1
  );
  const catches = [...flat.matchAll(/\} catch \{([^}]*)\}/g)].map((m) => m[1]);
  /** One handler's text, from its declaration to its closing line. */
  const handler = (src: string, nameOf: string) => {
    const at = src.indexOf(`  const ${nameOf} = async () => {`);
    return at < 0 ? '' : src.slice(at, src.indexOf('\n  };\n', at) + 5);
  };
  const base = codeOnly(gitShow(BASE_435, FORM));
  assert(
    'S',
    'S9 the draft is cleared where the form resets (after a good "Save & add another household" or "Save changes", and on Cancel), for the form checked at this opening; her own step and "Save & move on" clear theirs after a good save; no catch clears one; both Save handlers are 9ff914d’s, byte for byte',
    /const resetForm = useCallback\(\(\) => \{ forgetOnReset\.current\(\); setName\(''\);/.test(
      flat
    ) &&
      /forgetOnReset\.current = \(\) => \{ if \(draftChecked && draftChecked === openedForm\) forgetDraft\(draftChecked\); \};/.test(
        flat
      ) &&
      count(code, 'resetForm();') === 3 &&
      /setInternalPeopleAdded\(\(prev\) => prev \+ countMembers\(payload\)\); \} forgetDraft\('new'\); \} catch \{ setSaveError\(true\);/.test(
        flat
      ) &&
      /messagesMuted: hostingAlone \? true : messagesMuted, \}\); forgetDraft\('host'\); \} catch \{/.test(
        flat
      ) &&
      catches.length >= 4 &&
      catches.every((c) => !c.includes('forgetDraft') && !c.includes('removeDraft')) &&
      base.length > 0 &&
      ['handleAddAnother', 'handleEditSave'].every(
        (h) => handler(code, h).length > 0 && handler(code, h) === handler(base, h)
      )
  );
  const draftCode = codeOnly(read(DRAFT_FILE));
  const importers: string[] = [];
  const walk = (dir: string) => {
    for (const f of fs.readdirSync(path.join(ROOT, dir))) {
      const rel = `${dir}/${f}`;
      if (fs.statSync(path.join(ROOT, rel)).isDirectory()) walk(rel);
      else if (/\.(ts|tsx)$/.test(f) && read(rel).includes('households/form-draft'))
        importers.push(rel);
    }
  };
  walk('src');
  assert(
    'S',
    'S10 nothing sends a draft: the module makes no request, the form makes none at all, and only the form and Providers use the module (no route, no server code)',
    !/\bfetch\(|XMLHttpRequest|sendBeacon|navigator\./.test(draftCode) &&
      count(code, 'fetch(') === 0 &&
      S0(importers.sort()) === S0([FORM, PROVIDERS].sort()),
    S0(importers)
  );
  const layout = codeOnly(read(LAYOUT)).replace(/\s+/g, ' ');
  const providers = codeOnly(read(PROVIDERS)).replace(/\s+/g, ' ');
  assert(
    'S',
    'S11 the layout hands Providers the user’s id only; Providers offers it and sweeps on every page load and on a change of person',
    layout.includes('<Providers viewerId={user?.id ?? null}>') &&
      providers.includes('<ViewerIdContext.Provider value={viewerId}>') &&
      /useEffect\(\(\) => \{ sweepDrafts\(browserDraftStore\(\), viewerId\); \}, \[viewerId\]\);/.test(
        providers
      )
  );
  const setup = codeOnly(read(SETUP)).replace(/\s+/g, ' ');
  assert(
    'S',
    'S12 the setup page’s one new prop: the saved ids once the list has loaded (null before, and still null if it fails: set only on a good reply), and its own Edit to open one',
    setup.includes(
      'resumeEdit={{ savedIds: householdsLoaded ? households.map((h) => h.id) : null, open: handleEdit, }}'
    ) &&
      setup.includes(
        'if (res.ok) { const data = await res.json(); setHouseholds(data.households.map(apiHouseholdToSaved)); setHouseholdsLoaded(true);'
      ) &&
      count(setup, 'setHouseholdsLoaded(') === 1 &&
      count(setup, 'resumeEdit=') === 1
  );
}

// ══ T — THE RULES, TRIMMED (GTC-432) ═════════════════════════════════════════
const EMAIL_WORDS = 'Invalid email format';
const NZ_WORDS = 'Invalid NZ phone number';
const INTL_WORDS = 'International numbers not supported yet. NZ numbers only.';
/** [typed, the form's words ('' = fine)], by hand. */
const EMAILS: Array<[string, string]> = [
  ['kid@example.com', ''],
  ['kid@example.com ', ''],
  ['  kid@example.com', ''],
  ['', ''],
  ['   ', ''],
  ['kid@test', EMAIL_WORDS],
  ['kid.example.com', EMAIL_WORDS],
  ['kid@@example.com', EMAIL_WORDS],
  ['kid one@example.com', EMAIL_WORDS],
];
/** [typed, the form's words, what normalizePhoneNumber stores (null = nothing)], by hand. */
const PHONES: Array<[string, string, string | null]> = [
  ['021 123 4567', '', '+64211234567'],
  [' 021 123 4567 ', '', '+64211234567'],
  ['022 123 456', '', '+6422123456'],
  ['(09) 123 4567', '', '+6491234567'],
  ['+64 21 123 4567', '', '+64211234567'],
  ['64211234567', '', '+64211234567'],
  ['0800 123 456', '', '+64800123456'],
  ['+64 (0)21 123 4567', '', '+64211234567'],
  ['64 (0)21 123 4567', '', '+64211234567'],
  ['+64 (0)9 123 4567', '', '+6491234567'],
  ['+64 (0)21 1234 5678', '', '+642112345678'],
  ['', '', null],
  ['123 4567', NZ_WORDS, null],
  ['12345678', NZ_WORDS, null],
  ['0064211234567', NZ_WORDS, null],
  ['0064 21 123 456', NZ_WORDS, null],
  ['+64 (0)123 4567', NZ_WORDS, null],
  ['+61 412 345 678', INTL_WORDS, null],
];
function layerT() {
  section('T — the email and phone rules, trimmed; "+64 (0)" stored without the 0 (GTC-432)');
  const emailOff = EMAILS.filter(([v, w]) => validateEmail(v) !== w);
  assert(
    'T',
    `T1 the form's email rule on ${EMAILS.length} typed values: spaces around an address no longer stop it; the rest as before`,
    emailOff.length === 0,
    JSON.stringify(emailOff.map(([v]) => [v, validateEmail(v)]))
  );
  const formOff = PHONES.filter(([v, w]) => validatePhone(v) !== w);
  assert(
    'T',
    `T2 the form's phone rule on ${PHONES.length} typed values: as before, "+64 (0)" numbers accepted, "+64 (0)" + 7 digits refused`,
    formOff.length === 0,
    JSON.stringify(formOff.map(([v]) => [v, validatePhone(v)]))
  );
  const storedOff = PHONES.filter(([v, , n]) => normalizePhoneNumber(v) !== n);
  assert(
    'T',
    'T3 what normalizePhoneNumber stores for each: "+64 (0)21 123 4567" and "64 (0)21 123 4567" are +64211234567, every other row as before',
    storedOff.length === 0,
    JSON.stringify(storedOff.map(([v]) => [v, normalizePhoneNumber(v)]))
  );
  const phoneCode = codeOnly(read('src/lib/phone.ts'));
  assert(
    'T',
    'T4 the 0 is dropped first, only after +64 or 64, once: a local 0… or a 00 64… is never touched',
    /let cleaned = phone\.replace\(\/\[\^\\d\+\]\/g, ''\);\s*if \(cleaned\.startsWith\('\+640'\)\) \{\s*cleaned = '\+64' \+ cleaned\.slice\(4\);\s*\} else if \(cleaned\.startsWith\('640'\)\) \{\s*cleaned = '64' \+ cleaned\.slice\(3\);\s*\}\s*if \(cleaned\.startsWith\('0'\)\)/.test(
      phoneCode
    )
  );
}

// ══ C — THE PAGE, IN CHROME ══════════════════════════════════════════════════
const created = {
  users: [] as string[],
  people: [] as string[],
  events: [] as string[],
  sessions: [] as string[],
};
const refusals: string[] = [];

/** Every fetch the page makes, as "METHOD path", recorded in the page before its scripts run. */
const RECORDER = `(() => { const f = window.fetch; window.__calls = []; window.__unhandled = 0; window.__failPut = null; window.__failedGets = 0;
  window.addEventListener('unhandledrejection', () => { window.__unhandled++; });
  window.fetch = function (u, o) { let call = '';
    try { const url = typeof u === 'string' ? u : u.url;
      call = ((o && o.method) || (u && u.method) || 'GET').toUpperCase() + ' ' + new URL(url, location.href).pathname;
      window.__calls.push(call); } catch (e) {}
    /* [[GTC-433]]: a household PUT failed in the page itself, never reaching the server. */
    if (window.__failPut && call.startsWith('PUT /api/events/') && call.split('/').length === 6 && call.split('/')[4] === 'households') {
      if (window.__failPut === 'network') return Promise.reject(new TypeError('Failed to fetch'));
      return Promise.resolve(new Response(JSON.stringify({ error: 'made-up failure' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }));
    }
    /* [[GTC-435]]: the household list failed in the page itself (C27). */
    if (window.__failHouseholdsGet && call.startsWith('GET /api/events/') && call.split('/').length === 5 && call.split('/')[4] === 'households') {
      window.__failedGets++;
      return Promise.resolve(new Response(JSON.stringify({ error: 'made-up failure' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }));
    }
    return f.apply(this, arguments); }; })();`;
/** The words a failed save shows, as the page draws them. */
const SAVE_FAILED = 'That didn’t save — please try again.';

const HELPERS = `
window.__vis = (el) => !!el && el.getClientRects().length > 0;
window.__tag = (el, t) => { document.querySelectorAll('[data-t]').forEach((e) => e.removeAttribute('data-t')); if (!el) return false; el.setAttribute('data-t', t); return true; };
window.__btn = (text) => [...document.querySelectorAll('button')].filter(window.__vis).find((b) => b.innerText.trim() === text) || null;
window.__set = (el, v) => { if (!el) return false; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); return true; };
window.__kids = () => [...document.querySelectorAll('input[placeholder="Kid\\'s name"]')].filter(window.__vis).map((n) => {
  const row = n.closest('div.border-l-4'); return { name: n, email: row.querySelector('input[type="email"]'), phone: row.querySelector('input[type="tel"]') }; });
window.__alert = () => [...document.querySelectorAll('p[role="alert"]')].filter(window.__vis).map((p) => p.innerText.trim());
window.__inView = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); const s = el.closest('.overflow-y-auto');
  const a = s ? s.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
  return r.top >= Math.max(a.top, 0) - 1 && r.bottom <= Math.min(a.bottom, window.innerHeight) + 1; };
true;`;

async function runLive() {
  section('C — the setup page in Chrome (GTC-431)');
  const up = await (async () => {
    try {
      return (await realFetch(`${BASE}/`)).ok;
    } catch {
      return false;
    }
  })();
  assert('C', 'C0 PRECONDITION: the dev server answers on :3000', up);
  if (!up) return;

  const totals = async () => ({
    invite: await prisma.inviteEvent.count(),
    outbound: await prisma.outboundMessage.count(),
  });
  const before = await totals();

  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const mail = (l: string) => `gtc431-${l}-${stamp}@example.com`;
  const user = await prisma.user.create({ data: { email: mail('kate') } });
  created.users.push(user.id);
  const kate = await prisma.person.create({
    data: { name: 'Kate HS', email: user.email, userId: user.id },
  });
  created.people.push(kate.id);
  const token = randomBytes(32).toString('hex');
  const session = await prisma.session.create({
    data: { userId: user.id, token, expiresAt: new Date(Date.now() + 3600e3) },
  });
  created.sessions.push(session.id);
  const start = new Date(Date.now() + 40 * 864e5);

  /** An event; with `ownHousehold`, her household (her and a partner) is already saved. */
  const mk = async (name: string, ownHousehold: boolean) => {
    const ev = await prisma.event.create({
      data: {
        name,
        startDate: start,
        endDate: start,
        hostId: kate.id,
        status: 'DRAFT',
        guestCount: 12,
      },
    });
    created.events.push(ev.id);
    await prisma.eventRole.create({ data: { eventId: ev.id, userId: user.id, role: 'HOST' } });
    if (ownHousehold) {
      const hh = await prisma.household.create({ data: { eventId: ev.id } });
      await prisma.personEvent.create({
        data: {
          personId: kate.id,
          eventId: ev.id,
          role: 'HOST',
          householdId: hh.id,
          householdRole: 'PRIMARY_CONTACT',
        },
      });
      const ross = await prisma.person.create({ data: { name: 'Ross HS', email: mail('ross') } });
      created.people.push(ross.id);
      await prisma.personEvent.create({
        data: {
          personId: ross.id,
          eventId: ev.id,
          role: 'PARTICIPANT',
          householdId: hh.id,
          householdRole: 'PARTNER',
        },
      });
    }
    return ev.id;
  };
  const evA = await mk('GTC-431 household save — her household saved', true);
  const evB = await mk('GTC-431 household save — her own household first', false);
  const evX = await mk('GTC-434 household save — one transaction', true);
  // [[GTC-435]]: each with its (empty) setup record, as every new event has, so its row on Your
  // Events opens the setup flow; removed with the event (onDelete: Cascade).
  const evD = await mk(EVENT_D, true);
  const evE = await mk(EVENT_E, false);
  for (const eventId of [evD, evE]) await prisma.eventSetup.create({ data: { eventId } });

  const evIn = { eventId: { in: created.events } };
  const rows = async () =>
    [
      await prisma.event.count({ where: { id: { in: created.events } } }),
      await prisma.eventRole.count({ where: evIn }),
      await prisma.household.count({ where: evIn }),
      await prisma.personEvent.count({ where: evIn }),
      await prisma.person.count({ where: { id: { in: created.people } } }),
      await prisma.user.count({ where: { id: { in: created.users } } }),
      await prisma.session.count({ where: { id: { in: created.sessions } } }),
      await prisma.accessToken.count({ where: evIn }),
      await prisma.outboundMessage.count({ where: evIn }),
      await prisma.inviteEvent.count({ where: evIn }),
    ].join(',');
  const whileExists = await rows();
  console.log(
    `  fixture rows (Event, EventRole, Household, PersonEvent, Person, User, Session, AccessToken, OutboundMessage, InviteEvent): ${whileExists}`
  );
  const households = (eventId: string) => prisma.household.count({ where: { eventId } });
  const members = (eventId: string) => prisma.personEvent.count({ where: { eventId } });

  // ── X: the households POST over HTTP, no browser (GTC-434) ─────────────────────
  section('X — the households POST saves all or nothing (GTC-434)');
  const mailX = (l: string, tag: string) => `gtc434-${tag}-${l}-${stamp}@example.com`;
  const NUL = String.fromCharCode(0);
  const hhBody = (tag: string, nulAt: number | null, pick: string | null) => ({
    primaryContact: { name: `Ana ${tag}`, email: mailX('ana', tag), phone: '021 000 0101' },
    partner: { name: `Ben ${tag}`, email: mailX('ben', tag), phone: '021 000 0102' },
    helpers: [1, 2, 3, 4, 5, 6].map((i) => ({
      name: i === nulAt ? `Kid${NUL} ${tag} ${i}` : `Kid ${tag} ${i}`,
      email: mailX(`kid${i}`, tag),
      phone: `021 000 01${10 + i}`,
    })),
    contactPersonEventId: pick,
  });
  const postHh = async (body: unknown) => {
    try {
      const res = await realFetch(`${BASE}/api/events/${evX}/households`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: `session=${token}` },
        body: JSON.stringify(body),
      });
      return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
    } catch (e) {
      return { status: 0, body: { error: String((e as Error).message) } };
    }
  };
  const xState = async (tag: string) =>
    [
      await households(evX),
      await members(evX),
      await prisma.person.count({ where: { email: { contains: `gtc434-${tag}-` } } }),
      await prisma.auditEntry.count({ where: { eventId: evX } }),
      await prisma.household.count({
        where: { eventId: evX, members: { none: { householdRole: 'PRIMARY_CONTACT' } } },
      }),
    ].join(',');
  const whole = async (householdId: string | undefined, tag: string) => {
    if (!householdId) return false;
    const m = await prisma.personEvent.findMany({
      where: { householdId },
      include: { person: true },
    });
    const kids = m.filter((x) => x.householdRole === 'CHILD');
    return (
      m.length === 8 &&
      m.some((x) => x.householdRole === 'PRIMARY_CONTACT' && x.person.name === `Ana ${tag}`) &&
      m.some((x) => x.householdRole === 'PARTNER' && x.person.name === `Ben ${tag}`) &&
      kids.length === 6 &&
      kids.every((k) => !!k.person.email && !!k.person.phoneNumber)
    );
  };
  {
    const x1 = await postHh(hhBody('x1', null, null));
    assert(
      'X',
      'X1 two adults and six kids: 201; one household with its contact, partner and six kids, each kid with email and phone',
      x1.status === 201 && (await whole(x1.body?.household?.id, 'x1')),
      S0({ status: x1.status })
    );
    const before = await xState('x2');
    const x2 = await postHh(hhBody('x2', 3, null));
    const after = await xState('x2');
    assert(
      'X',
      'X2 the third kid’s write refused by the database (a NUL in the name): 500, and nothing kept: households, members, people, ledger rows as before',
      x2.status === 500 && after === before,
      S0({ status: x2.status, before, after })
    );
    const x3 = await postHh(hhBody('x2', null, null));
    const afterRetry = (await xState('x2')).split(',');
    const beforeRetry = before.split(',');
    assert(
      'X',
      'X3 then the same household again: 201; exactly one new household, whole (contact, partner, six kids); no household without a main contact',
      x3.status === 201 &&
        Number(afterRetry[0]) === Number(beforeRetry[0]) + 1 &&
        (await whole(x3.body?.household?.id, 'x2')) &&
        afterRetry[4] === '0',
      S0({ status: x3.status, before, after: afterRetry.join(',') })
    );
    const pickWords = (validateChannelTarget(null, evX) as { error: string }).error;
    const b4 = await xState('x4');
    const x4 = await postHh(hhBody('x4', null, 'not-a-person-event'));
    const a4 = await xState('x4');
    assert(
      'X',
      `X4 a contact pick that does not exist: 400 "${pickWords}", and nothing kept`,
      x4.status === 400 && x4.body?.error === pickWords && a4 === b4,
      S0({ status: x4.status, words: x4.body?.error === pickWords, before: b4, after: a4 })
    );
  }

  let chrome: Headless | null = null;
  try {
    chrome = await openHeadless({ fetchImpl: realFetch, port: PORT });
    chrome.answerLeaveDialogs(true); // a "Leave site?" on the way out is answered "Leave"
    await chrome.blockPlanMaking();
    await chrome.blockSends();
    await chrome.addInitScript(RECORDER);
    await chrome.setSessionCookie(token);
    const c = chrome;
    const ev = <T = any,>(js: string) => c.evaluate<T>(js);
    const S = JSON.stringify;
    const go = async (p: string) => {
      await c.navigate(p, 9000);
      await ev(HELPERS);
    };
    const tap = async (js: string, settleMs?: number) => {
      const found = await ev<boolean>(`window.__tag(${js}, 'x')`);
      if (!found) return 'not found';
      const why = await c.clickGuarded('[data-t="x"]', settleMs);
      if (why) refusals.push(`${js}: ${why}`);
      return why;
    };
    const calls = () => ev<string[]>(`window.__calls.filter((c) => !c.startsWith('GET '))`);
    const clearCalls = () => ev(`window.__calls.length = 0`);
    /** Six kids with names, made-up emails and 021 numbers; `bad` puts wrong values on rows. */
    const sixKids = async (
      tag: string,
      bad: Record<number, { email?: string; phone?: string; name?: string }>
    ) => {
      for (let i = 0; i < 6; i++) await tap(`window.__btn('👦 Kid with a job')`, 150);
      await sleep(300);
      return ev<number>(`(() => { const k = window.__kids(); const bad = ${S(bad)};
        k.forEach((r, i) => { const b = bad[i] || {};
          window.__set(r.name, 'name' in b ? b.name : 'Kid ${tag} ' + (i + 1));
          window.__set(r.email, 'email' in b ? b.email : 'kid' + (i + 1) + '-${tag}-${stamp}@example.com');
          window.__set(r.phone, 'phone' in b ? b.phone : '021 000 00' + (10 + i)); });
        return k.length; })()`);
    };
    /** What a stopped Save left: the words, the focused box's value and whether it is on screen. */
    const stopped = () =>
      ev<{
        alert: string[];
        focusValue: string | null;
        focusPh: string | null;
        inView: boolean;
        firstKid: boolean;
      }>(
        `(() => { const a = document.activeElement; const k = window.__kids();
          return { alert: window.__alert(), focusValue: a && a.tagName === 'INPUT' ? a.value : null,
            focusPh: a && a.getAttribute ? a.getAttribute('placeholder') : null, inView: window.__inView(a),
            firstKid: !!k[0] && [k[0].name, k[0].email, k[0].phone].includes(a) }; })()`
      );

    // ── C1–C6: the add form, at 1280 then 390 ─────────────────────────────────
    for (const [w, h, mobile, tag] of [
      [1280, 900, false, 'desk'],
      [390, 844, true, 'phone'],
    ] as const) {
      await c.setViewport(w, h, mobile);
      await go(`/plan/${evA}/setup`);
      const onForm = await ev<boolean>(`!!window.__btn('Save & add another household')`);
      assert('C', `C1 ${w}: the page opens on the add form (her household saved)`, onForm);
      if (!onForm) continue;
      const hhBefore = await households(evA);
      await ev(`window.__set(document.querySelector('#m1-name'), 'Lena ${tag}')`);
      const n = await sixKids(tag, { 0: { email: 'kid@test' } });
      await clearCalls();
      await tap(`window.__btn('Save & add another household')`, 600);
      const one = await stopped();
      assert(
        'C',
        `C2 ${w}: six kids, the top kid's email "kid@test": Save shows "Please fix 1 thing above", that box has focus and is on screen`,
        n === 6 &&
          S(one.alert) === S([fixWords(1)]) &&
          one.focusValue === 'kid@test' &&
          one.firstKid &&
          one.inView,
        S(one)
      );
      assert(
        'C',
        `C3 ${w}: nothing was sent and nothing stored`,
        (await calls()).length === 0 && (await households(evA)) === hhBefore,
        S(await calls())
      );
      await ev(`window.__set(window.__kids()[3].phone, '12345')`);
      await tap(`window.__btn('Save & add another household')`, 600);
      const two = await stopped();
      assert(
        'C',
        `C4 ${w}: a second bad box (kid 4's phone): "Please fix 2 things above", focus still on the first in screen order`,
        S(two.alert) === S([fixWords(2)]) && two.focusValue === 'kid@test' && two.inView,
        S(two)
      );
      await ev(`(() => { const k = window.__kids(); window.__set(k[0].email, 'kid1-${tag}-${stamp}@example.com');
        window.__set(k[3].phone, '021 000 0013'); })()`);
      await sleep(300);
      assert('C', `C5 ${w}: both fixed: the words go`, S(await ev(`window.__alert()`)) === S([]));
      await clearCalls();
      await tap(`window.__btn('Save & add another household')`, 2000);
      const saved = await prisma.household.findMany({
        where: { eventId: evA },
        include: { members: { include: { person: true } } },
        orderBy: { createdAt: 'desc' },
        take: 1,
      });
      const kids = saved[0]?.members.filter((m) => m.householdRole === 'CHILD') ?? [];
      assert(
        'C',
        `C6 ${w}: then Save stores the household: its contact and six kids, each with email and phone; one POST`,
        (await households(evA)) === hhBefore + 1 &&
          saved[0]?.members.some((m) => m.person.name === `Lena ${tag}`) &&
          kids.length === 6 &&
          kids.every((k) => !!k.person.email && !!k.person.phoneNumber) &&
          S(await calls()) === S([`POST /api/events/${evA}/households`]),
        S(await calls())
      );
    }

    // ── C7–C8: "Save changes" on her own household, at 390 ────────────────────
    await c.setViewport(390, 844, true);
    await go(`/plan/${evA}/setup`);
    const membersBefore = await members(evA);
    const editFound = await tap(
      `[...document.querySelectorAll('button')].filter(window.__vis).filter((b) => b.innerText.trim() === 'Edit').find((b) => (b.closest('[class*="border"]')?.innerText || '').includes('Kate HS'))`,
      600
    );
    const editing = await ev<boolean>(`!!window.__btn('Save changes')`);
    assert(
      'C',
      'C7 390: Edit on her own card opens it with "Save changes"',
      editFound === null && editing
    );
    if (editing) {
      await sixKids('edit', { 2: { name: '' } });
      await clearCalls();
      await tap(`window.__btn('Save changes')`, 600);
      const e = await stopped();
      assert(
        'C',
        'C8 390: a kid row left without a name: "Please fix 1 thing above", that name box has focus and is on screen; no PUT, nothing stored',
        S(e.alert) === S([fixWords(1)]) &&
          e.focusPh === "Kid's name" &&
          e.focusValue === '' &&
          e.inView &&
          (await calls()).length === 0 &&
          (await members(evA)) === membersBefore,
        S(e)
      );
      await tap(`window.__btn('Cancel')`, 500);
    }

    // ── C14–C16: "Save changes" that fails says so, at 390 and 1280 (GTC-433) ──────
    const openOwnEdit = () =>
      tap(
        `[...document.querySelectorAll('button')].filter(window.__vis).filter((b) => b.innerText.trim() === 'Edit').find((b) => (b.closest('[class*="border"]')?.innerText || '').includes('Kate HS'))`,
        600
      );
    const afterFail = () =>
      ev<{
        words: boolean;
        editing: boolean;
        kids: number;
        filled: boolean;
        alert: string[];
        unhandled: number;
      }>(
        `(() => { const k = window.__kids();
          return { words: [...document.querySelectorAll('p')].filter(window.__vis).some((p) => p.innerText.trim() === ${JSON.stringify(SAVE_FAILED)}),
            editing: !!window.__btn('Save changes'), kids: k.length,
            filled: k.every((r) => r.name.value.startsWith('Kid fail') && r.email.value.includes('@') && r.phone.value.startsWith('021')),
            alert: window.__alert(), unhandled: window.__unhandled }; })()`
      );
    const onePut = (cs: string[]) =>
      cs.length === 1 && new RegExp(`^PUT /api/events/${evA}/households/[^/]+$`).test(cs[0]);
    for (const [w, h, mobile] of [
      [390, 844, true],
      [1280, 900, false],
    ] as const) {
      await c.setViewport(w, h, mobile);
      await go(`/plan/${evA}/setup`);
      const before = await members(evA);
      const opened =
        (await openOwnEdit()) === null && (await ev<boolean>(`!!window.__btn('Save changes')`));
      if (!opened) {
        assert('C', `C14 ${w}: her own household opened with Edit`, false);
        continue;
      }
      const kidsAtOpen = await ev<number>(`window.__kids().length`);
      await sixKids(`fail${w}`, {});
      await ev(`window.__failPut = 'http500'`);
      await clearCalls();
      await tap(`window.__btn('Save changes')`, 1200);
      const f1 = await afterFail();
      const c1 = await calls();
      assert(
        'C',
        `C14 ${w}: "Save changes" answered 500: "${SAVE_FAILED}" shows; still editing with the six new kids as typed (and any saved before); one PUT tried; nothing stored; no "Please fix"; no unhandled rejection`,
        f1.words &&
          f1.editing &&
          f1.kids === kidsAtOpen + 6 &&
          f1.filled &&
          onePut(c1) &&
          (await members(evA)) === before &&
          S(f1.alert) === S([]) &&
          f1.unhandled === 0,
        S({ ...f1, calls: c1 })
      );
      if (w !== 390) {
        await ev(`window.__failPut = null`);
        await tap(`window.__btn('Cancel')`, 500);
        continue;
      }
      await ev(`window.__failPut = 'network'`);
      await clearCalls();
      await tap(`window.__btn('Save changes')`, 1200);
      const f2 = await afterFail();
      const c2 = await calls();
      assert(
        'C',
        `C15 390: "Save changes" with the network down: the same words; still editing with all six kids; nothing stored; no unhandled rejection`,
        f2.words &&
          f2.editing &&
          f2.kids === kidsAtOpen + 6 &&
          f2.filled &&
          onePut(c2) &&
          (await members(evA)) === before &&
          f2.unhandled === 0,
        S({ ...f2, calls: c2 })
      );
      await ev(`window.__failPut = null`);
      await clearCalls();
      await tap(`window.__btn('Save changes')`, 2500);
      const f3 = await afterFail();
      const c3 = await calls();
      const stored = await prisma.personEvent.findMany({
        where: {
          eventId: evA,
          householdRole: 'CHILD',
          person: { name: { startsWith: 'Kid fail390' } },
        },
        include: { person: true },
      });
      assert(
        'C',
        'C16 390: then pressed again with nothing in the way: one PUT, the six kids stored with email and phone, the words gone, the form closed',
        onePut(c3) &&
          !f3.words &&
          !f3.editing &&
          stored.length === 6 &&
          stored.every((m) => !!m.person.email && !!m.person.phoneNumber),
        S({ words: f3.words, editing: f3.editing, calls: c3, stored: stored.length })
      );
    }

    // ── C17: a part-way failure in the page, at 390 (GTC-434) ──────────────────────
    await c.setViewport(390, 844, true);
    await go(`/plan/${evX}/setup`);
    if (await ev<boolean>(`!!window.__btn('Save & add another household')`)) {
      const hhC17 = await households(evX);
      await ev(`window.__set(document.querySelector('#m1-name'), 'Cal c17')`);
      await sixKids('c17', {});
      const kept = await ev<boolean>(`(() => { const k = window.__kids()[2];
        window.__set(k.name, 'Kid' + String.fromCharCode(0) + ' c17 3'); return k.name.value.includes(String.fromCharCode(0)); })()`);
      if (!kept) {
        console.log('    (C17 not run: the browser took the NUL out of the text box)');
      } else {
        await clearCalls();
        await tap(`window.__btn('Save & add another household')`, 2000);
        const f17 = await ev<{ words: boolean; kids: number; name: string }>(`(() => ({
          words: [...document.querySelectorAll('p')].filter(window.__vis).some((p) => p.innerText.trim() === ${S(SAVE_FAILED)}),
          kids: window.__kids().length, name: document.querySelector('#m1-name').value }))()`);
        const stored17 = await households(evX);
        await ev(`window.__set(window.__kids()[2].name, 'Kid c17 3')`);
        await clearCalls();
        await tap(`window.__btn('Save & add another household')`, 2500);
        const last = await prisma.household.findFirst({
          where: { eventId: evX },
          orderBy: { createdAt: 'desc' },
          include: { members: { include: { person: true } } },
        });
        assert(
          'C',
          `C17 390: the third kid's write refused on Save: "${SAVE_FAILED}", the form kept, nothing stored; fixed, Save stores it once, whole`,
          f17.words &&
            f17.kids === 6 &&
            f17.name === 'Cal c17' &&
            stored17 === hhC17 &&
            (await households(evX)) === hhC17 + 1 &&
            last?.members.some(
              (m) => m.person.name === 'Cal c17' && m.householdRole === 'PRIMARY_CONTACT'
            ) === true &&
            last?.members.filter((m) => m.householdRole === 'CHILD').length === 6,
          S({ ...f17, stored17, hhC17, now: await households(evX) })
        );
      }
    } else {
      assert('C', 'C17 390: the add form opened on the one-transaction event', false);
    }

    // ── C12–C13: a "+64 (0)" phone saves right, at 390 (GTC-432) ─────────────────
    await c.setViewport(390, 844, true);
    // Found building GTC-432: an email box (type="email") hands the page its value with the spaces
    // at either end already removed (the browser's own value rule), so on these boxes the form
    // never saw them. C13 records that; T1 holds the trimmed rule itself.
    await go(`/plan/${evA}/setup`);
    const trimmedEmail = `kidtrim-${stamp}@example.com`;
    await ev(`window.__set(document.querySelector('#m1-name'), 'Tia trim')`);
    await tap(`window.__btn('👦 Kid with a job')`, 300);
    await ev(`(() => { const k = window.__kids()[0]; window.__set(k.name, 'Kid trim');
      window.__set(k.email, ${S(trimmedEmail + ' ')}); window.__set(k.phone, '+64 (0)21 000 0021');
      return k.email.value; })()`);
    const emailBoxValue = await ev<string>(`window.__kids()[0].email.value`);
    await clearCalls();
    await tap(`window.__btn('Save & add another household')`, 2000);
    const trimKid = await prisma.person.findFirst({
      where: { name: 'Kid trim', eventMemberships: { some: { eventId: evA } } },
    });
    assert(
      'C',
      'C12 390: a kid with phone "+64 (0)21 000 0021": no "Please fix", one POST; stored as +64210000021 (and the email as typed)',
      S(await ev(`window.__alert()`)) === S([]) &&
        S(await calls()) === S([`POST /api/events/${evA}/households`]) &&
        trimKid?.email === trimmedEmail &&
        trimKid?.phoneNumber === '+64210000021',
      S({
        calls: await calls(),
        email: trimKid?.email === trimmedEmail,
        phone: trimKid?.phoneNumber?.slice(0, 4),
      })
    );
    assert(
      'C',
      'C13 FACT: the email box itself drops a space typed after the address (its value holds none), before the form reads it',
      emailBoxValue === trimmedEmail,
      S(emailBoxValue === trimmedEmail)
    );

    // ── C9–C10: her own household's step, at 390 ──────────────────────────────
    await go(`/plan/${evB}/setup`);
    const started = await tap(`window.__btn('Ready to start herding →')`, 1500);
    const hostStep = await ev<boolean>(`!!window.__btn('Save and add everyone else →')`);
    assert(
      'C',
      'C9 390: an event without her household opens her own household’s step',
      started === null && hostStep
    );
    if (hostStep) {
      await tap(`window.__btn('👦 Kid with a job')`, 300);
      await ev(
        `(() => { const k = window.__kids()[0]; window.__set(k.name, 'Mia HS'); window.__set(k.phone, '+61 412 345 678'); })()`
      );
      await clearCalls();
      await tap(`window.__btn('Save and add everyone else →')`, 600);
      const hs = await stopped();
      assert(
        'C',
        'C10 390: a kid with an Australian number: "Please fix 1 thing above", that phone has focus and is on screen; no POST, nothing stored',
        S(hs.alert) === S([fixWords(1)]) &&
          hs.focusValue === '+61 412 345 678' &&
          hs.inView &&
          (await calls()).length === 0 &&
          (await households(evB)) === 0,
        S(hs)
      );
    }
    // ── C18–C27: an unsaved household kept while she is away, at 390 (GTC-435) ─────
    section('C18–C27 — an unsaved household kept in this browser while she is away (GTC-435)');
    await c.setViewport(390, 844, true);
    const KEY_HEAD = `gather:household-draft:v1:${user.id}:`;
    const DRAFT_HELPERS = `
window.__line = () => { const l = [...document.querySelectorAll('[data-draft-line]')].find(window.__vis);
  return l ? { kind: l.getAttribute('data-draft-line'), role: l.getAttribute('role'), text: l.querySelector('p').innerText.trim(),
    buttons: [...l.querySelectorAll('button')].map((b) => b.innerText.trim()) } : null; };
window.__keys = () => { const k = []; for (let i = 0; i < localStorage.length; i++) { const x = localStorage.key(i);
  if (x && x.startsWith('gather:household-draft:')) k.push(x); } return k.sort(); };
window.__form = () => ({ name: (document.querySelector('#m1-name') || {}).value ?? null,
  kids: window.__kids().map((r) => [r.name.value, r.email.value, r.phone.value]) });
window.__lineBtn = (t) => { const l = [...document.querySelectorAll('[data-draft-line]')].find(window.__vis);
  return l ? [...l.querySelectorAll('button')].find((b) => b.innerText.trim() === t) || null : null; };
true;`;
    const dgo = async (p: string) => {
      await go(p);
      await ev(DRAFT_HELPERS);
    };
    /** Six kids as sixKids types them, in screen order. */
    const typedKids = (tag: string) =>
      [0, 1, 2, 3, 4, 5].map((i) => [
        `Kid ${tag} ${i + 1}`,
        `kid${i + 1}-${tag}-${stamp}@example.com`,
        `021 000 00${10 + i}`,
      ]);
    const lineNow = () =>
      ev<{ kind: string; role: string; text: string; buttons: string[] } | null>(`window.__line()`);
    const formNow = () => ev<{ name: string | null; kids: string[][] }>(`window.__form()`);
    const keysNow = () => ev<string[]>(`window.__keys()`);
    /** Out by "← Your events" (a full page load: the "Leave site?" a computer shows is answered Leave). */
    const leaveByLink = async () => {
      const why = await tap(
        `[...document.querySelectorAll('a')].filter(window.__vis).find((a) => a.innerText.trim() === '← Your events')`,
        5000
      );
      await sleep(1500);
      await ev(HELPERS);
      return why === null && (await ev<string>(`location.pathname`)) === '/plan/events';
    };
    /** Back by the event's row on Your Events: an in-app route change, the same document. */
    const backByRow = async (eventName: string) => {
      await ev(`window.__sameDocument = 'yes'`);
      const why = await tap(
        `[...document.querySelectorAll('h2')].filter(window.__vis).find((h) => h.innerText.trim() === ${S(eventName)})`,
        6000
      );
      await sleep(1500);
      await ev(HELPERS);
      await ev(DRAFT_HELPERS);
      return {
        clicked: why === null,
        path: await ev<string>(`location.pathname`),
        sameDocument: (await ev<string | undefined>(`window.__sameDocument`)) === 'yes',
      };
    };
    const writes = () => calls().then((cs) => cs.filter((x) => !x.startsWith('GET ')));
    const membersD = () => members(evD);

    // C18 — the tester's case.
    await dgo(`/plan/${evD}/setup`);
    let c18 = false;
    if (await ev<boolean>(`!!window.__btn('Save & add another household')`)) {
      const hhD = await households(evD);
      const memD = await membersD();
      await ev(`window.__set(document.querySelector('#m1-name'), 'Nina c18')`);
      await sixKids('c18', {});
      await sleep(400);
      const typed = await formNow();
      const keyWritten = (await keysNow()).includes(`${KEY_HEAD}${evD}:new`);
      const w1 = await writes();
      const dialogsBefore = c.dialogs().length;
      const out = await leaveByLink();
      const askedToLeave = c.dialogs().slice(dialogsBefore).includes('beforeunload');
      const w2 = await writes();
      const back = await backByRow(EVENT_D);
      const got = await formNow();
      const line = await lineNow();
      const w3 = await writes();
      c18 =
        S(typed.kids) === S(typedKids('c18')) &&
        keyWritten &&
        out &&
        back.clicked &&
        back.sameDocument &&
        back.path === `/plan/${evD}/setup` &&
        got.name === 'Nina c18' &&
        S(got.kids) === S(typedKids('c18')) &&
        line?.kind === 'kept' &&
        line.role === 'status' &&
        line.text === DRAFT_KEEP_WORDS.KEPT &&
        S(line.buttons) === S([DRAFT_KEEP_WORDS.GOT_IT, DRAFT_KEEP_WORDS.DISCARD]) &&
        [...w1, ...w2, ...w3].length === 0 &&
        (await households(evD)) === hhD &&
        (await membersD()) === memD;
      assert(
        'C',
        'C18 390, the tester’s case: a main contact and six kids (name, email, phone) typed; out by "← Your events", back by the event’s row (an in-app route change); every name, email and phone back in its box, the line shown ("Got it", "Discard"); nothing sent, nothing stored',
        c18,
        S({
          typed: typed.kids.length,
          keyWritten,
          out,
          back,
          got,
          line,
          askedToLeave,
          w: [...w1, ...w2, ...w3],
        })
      );
    } else {
      assert('C', 'C18 390: the add form opened on the draft event', false);
    }

    // C19 — out by the phone menu's "Your Events"; and the address typed again (a full load).
    {
      const menu = await tap(`document.querySelector('button[aria-label="Open menu"]')`, 400);
      const link = await tap(
        `[...document.querySelectorAll('a')].filter(window.__vis).find((a) => a.innerText.trim() === 'Your Events')`,
        5000
      );
      await sleep(1500);
      await ev(HELPERS);
      const onList = (await ev<string>(`location.pathname`)) === '/plan/events';
      const back = await backByRow(EVENT_D);
      const viaMenu = await formNow();
      const lineMenu = await lineNow();
      await dgo(`/plan/${evD}/setup`);
      const viaLoad = await formNow();
      const lineLoad = await lineNow();
      assert(
        'C',
        'C19 390: out by the phone menu’s "Your Events" and back by the row, then the address loaded again: both times every box back and the line shown',
        menu === null &&
          link === null &&
          onList &&
          back.sameDocument &&
          viaMenu.name === 'Nina c18' &&
          S(viaMenu.kids) === S(typedKids('c18')) &&
          lineMenu?.kind === 'kept' &&
          viaLoad.name === 'Nina c18' &&
          S(viaLoad.kids) === S(typedKids('c18')) &&
          lineLoad?.kind === 'kept',
        S({
          menu,
          link,
          onList,
          back,
          viaMenu: viaMenu.kids.length,
          lineMenu,
          viaLoad: viaLoad.kids.length,
          lineLoad,
        })
      );
    }

    // C20 — "Got it" hides the line for this visit only; "Discard" empties the form and the draft.
    {
      await tap(`window.__lineBtn(${S(DRAFT_KEEP_WORDS.GOT_IT)})`, 400);
      const afterGot = { line: await lineNow(), form: await formNow(), keys: await keysNow() };
      await dgo(`/plan/${evD}/setup`);
      const lineAgain = await lineNow();
      await tap(`window.__lineBtn(${S(DRAFT_KEEP_WORDS.DISCARD)})`, 600);
      const afterDiscard = { line: await lineNow(), form: await formNow(), keys: await keysNow() };
      await dgo(`/plan/${evD}/setup`);
      const afterReload = { line: await lineNow(), form: await formNow(), keys: await keysNow() };
      const newKey = `${KEY_HEAD}${evD}:new`;
      assert(
        'C',
        'C20 390: "Got it": the line goes, the form and the draft stay, and the line is back on the next visit; "Discard": the form empty, the draft gone, and a reload opens a clean form with no line',
        afterGot.line === null &&
          S(afterGot.form.kids) === S(typedKids('c18')) &&
          afterGot.keys.includes(newKey) &&
          lineAgain?.kind === 'kept' &&
          afterDiscard.line === null &&
          afterDiscard.form.name === '' &&
          afterDiscard.form.kids.length === 0 &&
          !afterDiscard.keys.includes(newKey) &&
          afterReload.line === null &&
          afterReload.form.name === '' &&
          afterReload.form.kids.length === 0 &&
          !afterReload.keys.includes(newKey),
        S({ afterGot, lineAgain, afterDiscard, afterReload })
      );
    }

    // C21 — a failed save keeps the draft (a real refusal: a NUL in the third kid's name, which
    // Postgres refuses, GTC-434); a good save clears it.
    {
      const hhD = await households(evD);
      await ev(`window.__set(document.querySelector('#m1-name'), 'Rua c21')`);
      await sixKids('c21', {});
      const nul = await ev<boolean>(`(() => { const k = window.__kids()[2];
        window.__set(k.name, 'Kid' + String.fromCharCode(0) + ' c21 3'); return k.name.value.includes(String.fromCharCode(0)); })()`);
      await clearCalls();
      await tap(`window.__btn('Save & add another household')`, 2000);
      const failedWords = await ev<boolean>(
        `[...document.querySelectorAll('p')].filter(window.__vis).some((p) => p.innerText.trim() === ${S(SAVE_FAILED)})`
      );
      const keptAfterFail =
        await ev<number>(`(() => { const v = localStorage.getItem(${S(`${KEY_HEAD}${evD}:new`)});
        try { return JSON.parse(v).state.helpers.length; } catch (e) { return -1; } })()`);
      const failCalls = await writes();
      const out = await leaveByLink();
      const back = await backByRow(EVENT_D);
      const got = await formNow();
      const line = await lineNow();
      const want = typedKids('c21');
      want[2][0] = `Kid${String.fromCharCode(0)} c21 3`;
      const restored = got.name === 'Rua c21' && S(got.kids) === S(want) && line?.kind === 'kept';
      await ev(`window.__set(window.__kids()[2] && window.__kids()[2].name, 'Kid c21 3')`);
      await clearCalls();
      await tap(`window.__btn('Save & add another household')`, 2500);
      const goodCalls = await writes();
      const keysAfter = await keysNow();
      const saved = await prisma.household.findFirst({
        where: { eventId: evD },
        orderBy: { createdAt: 'desc' },
        include: { members: { include: { person: true } } },
      });
      await dgo(`/plan/${evD}/setup`);
      const after = { line: await lineNow(), form: await formNow() };
      assert(
        'C',
        `C21 390: Save refused part-way ("${SAVE_FAILED}", nothing stored): the draft still holds all six; out and back, all six again; fixed, one POST stores it whole, the draft gone, and the next visit opens clean`,
        nul &&
          failedWords &&
          keptAfterFail === 6 &&
          S(failCalls) === S([`POST /api/events/${evD}/households`]) &&
          out &&
          restored &&
          S(goodCalls) === S([`POST /api/events/${evD}/households`]) &&
          (await households(evD)) === hhD + 1 &&
          saved?.members.some(
            (m) => m.person.name === 'Rua c21' && m.householdRole === 'PRIMARY_CONTACT'
          ) === true &&
          saved?.members.filter((m) => m.householdRole === 'CHILD').length === 6 &&
          !keysAfter.includes(`${KEY_HEAD}${evD}:new`) &&
          after.line === null &&
          after.form.name === '',
        S({
          nul,
          failedWords,
          keptAfterFail,
          failCalls,
          out,
          restored,
          got: got.kids.length,
          line,
          goodCalls,
          keysAfter,
        })
      );
    }

    // C22 — "Save changes" on her own household: kept, offered with "Carry on", saved, cleared.
    {
      const opened = await tap(
        `[...document.querySelectorAll('button')].filter(window.__vis).filter((b) => b.innerText.trim() === 'Edit').find((b) => (b.closest('[class*="border"]')?.innerText || '').includes('Kate HS'))`,
        600
      );
      const editing = await ev<boolean>(`!!window.__btn('Save changes')`);
      const kidsAtOpen = await ev<number>(`window.__kids().length`);
      await sixKids('c22', {});
      await sleep(400);
      const editKeys = (await keysNow()).filter((k) => k.startsWith(`${KEY_HEAD}${evD}:edit:`));
      const memD = await membersD();
      const out = await leaveByLink();
      const back = await backByRow(EVENT_D);
      const offered = await lineNow();
      const addFormFirst = await ev<boolean>(`!!window.__btn('Save & add another household')`);
      await tap(`window.__lineBtn(${S(DRAFT_KEEP_WORDS.CARRY_ON)})`, 1200);
      const nowEditing = await ev<boolean>(`!!window.__btn('Save changes')`);
      const got = await formNow();
      const lineThen = await lineNow();
      const sixBack = S(got.kids.slice(0, 6)) === S(typedKids('c22'));
      const nothingYet = (await membersD()) === memD;
      await clearCalls();
      await tap(`window.__btn('Save changes')`, 2500);
      const putCalls = await writes();
      const stored = await prisma.personEvent.count({
        where: {
          eventId: evD,
          householdRole: 'CHILD',
          person: {
            name: { startsWith: 'Kid c22' },
            email: { not: null },
            phoneNumber: { not: null },
          },
        },
      });
      const keysAfter = await keysNow();
      assert(
        'C',
        'C22 390: her own household opened with Edit and six kids added; out and back: the add form, and the line "You were changing Kate HS’s household and hadn’t saved." ("Carry on", "Discard"); "Carry on" opens it with the six as typed and the kept line; "Save changes": one PUT, the six stored with email and phone, the draft gone',
        opened === null &&
          editing &&
          editKeys.length === 1 &&
          out &&
          back.sameDocument &&
          addFormFirst &&
          offered?.kind === 'changing' &&
          offered.text === changingWords('Kate HS') &&
          S(offered.buttons) === S([DRAFT_KEEP_WORDS.CARRY_ON, DRAFT_KEEP_WORDS.DISCARD]) &&
          nowEditing &&
          got.kids.length === kidsAtOpen + 6 &&
          sixBack &&
          lineThen?.kind === 'kept' &&
          nothingYet &&
          putCalls.length === 1 &&
          new RegExp(`^PUT /api/events/${evD}/households/[^/]+$`).test(putCalls[0]) &&
          stored === 6 &&
          keysAfter.filter((k) => k.startsWith(`${KEY_HEAD}${evD}:`)).length === 0,
        S({
          opened,
          editing,
          editKeys,
          out,
          back,
          addFormFirst,
          offered,
          nowEditing,
          kids: got.kids.length,
          kidsAtOpen,
          sixBack,
          lineThen,
          putCalls,
          stored,
          keysAfter,
        })
      );
    }

    // C23 — her own household's step, on an event without her household.
    {
      await dgo(`/plan/${evE}/setup`);
      await tap(`window.__btn('Ready to start herding →')`, 1500);
      await ev(DRAFT_HELPERS);
      const step = await ev<boolean>(`!!window.__btn('Save and add everyone else →')`);
      await tap(`window.__btn('👦 Kid with a job')`, 300);
      await ev(
        `(() => { const k = window.__kids()[0]; window.__set(k.name, 'Mia c23'); window.__set(k.email, 'mia-c23-${stamp}@example.com'); window.__set(k.phone, '021 000 0023'); })()`
      );
      await sleep(400);
      const out = await leaveByLink();
      const back = await backByRow(EVENT_E);
      await tap(`window.__btn('Ready to start herding →')`, 1500);
      await ev(DRAFT_HELPERS);
      const got = await formNow();
      const line = await lineNow();
      await tap(`window.__lineBtn(${S(DRAFT_KEEP_WORDS.DISCARD)})`, 600);
      const discarded = await formNow();
      const keysAfter = await keysNow();
      assert(
        'C',
        'C23 390: her own household’s step: a kid typed; out and back (the opening screen, then the step): the kid back with the line, her name as her account has it; "Discard": the kid gone, her name kept, the draft gone; nothing stored',
        step &&
          out &&
          back.path === `/plan/${evE}/setup` &&
          got.name === 'Kate HS' &&
          S(got.kids) === S([['Mia c23', `mia-c23-${stamp}@example.com`, '021 000 0023']]) &&
          line?.kind === 'kept' &&
          discarded.name === 'Kate HS' &&
          discarded.kids.length === 0 &&
          !keysAfter.includes(`${KEY_HEAD}${evE}:host`) &&
          (await households(evE)) === 0,
        S({ step, out, back, got, line, discarded, keysAfter })
      );
    }

    // C24 — drafts that are not hers, not this event's, or too old never show.
    {
      const value = (over: Record<string, unknown>) =>
        JSON.stringify({
          v: 1,
          userId: user.id,
          eventId: evD,
          form: 'new',
          savedAt: Date.now(),
          state: { ...typedState(`c24-${stamp}`) },
          ...over,
        });
      const someone = `${KEY_HEAD.replace(user.id, 'someone-else')}${evD}:new`;
      const otherEvent = `${KEY_HEAD}other-event:new`;
      const mine = `${KEY_HEAD}${evD}:new`;
      await dgo(`/plan/${evD}/setup`);
      await ev(`(() => { localStorage.setItem(${S(someone)}, ${S(value({ userId: 'someone-else' }))});
        localStorage.setItem(${S(otherEvent)}, ${S(value({ eventId: 'other-event' }))});
        localStorage.setItem(${S(mine)}, ${S(value({ savedAt: Date.now() - 8 * DAY }))}); })()`);
      await dgo(`/plan/${evD}/setup`);
      const old = { line: await lineNow(), form: await formNow(), keys: await keysNow() };
      await ev(`localStorage.setItem(${S(mine)}, ${S(value({ userId: 'someone-else' }))})`);
      await dgo(`/plan/${evD}/setup`);
      const mixed = { line: await lineNow(), form: await formNow(), keys: await keysNow() };
      assert(
        'C',
        'C24 390: drafts planted under another person, for another event, 8 days old, and one under her key naming someone else: none shown (a clean form, no line); the other person’s, the old one and the mixed-up one removed; hers for the other event kept',
        old.line === null &&
          old.form.name === '' &&
          !old.keys.includes(someone) &&
          !old.keys.includes(mine) &&
          old.keys.includes(otherEvent) &&
          mixed.line === null &&
          mixed.form.name === '' &&
          !mixed.keys.includes(mine),
        S({ old, mixed })
      );
    }

    // C27 — a draft for a household no longer on the event: kept while the household list fails to
    // load; dropped with no line once the list has loaded without it (ruling 4 and the founder's
    // safeguard, 31 Oct 2026).
    {
      const goneForm = `edit:gone-household-${stamp}`;
      const goneKey = `${KEY_HEAD}${evD}:${goneForm}`;
      const goneValue = JSON.stringify({
        v: 1,
        userId: user.id,
        eventId: evD,
        form: goneForm,
        savedAt: Date.now(),
        householdName: 'Gone Away',
        state: typedState(`c27-${stamp}`),
      });
      await dgo(`/plan/${evD}/setup`);
      await ev(`localStorage.setItem(${S(goneKey)}, ${S(goneValue)})`);
      const failing = await c.addInitScript(`window.__failHouseholdsGet = true;`);
      await dgo(`/plan/${evD}/setup`);
      await tap(`window.__btn('Ready to start herding →')`, 1500);
      await sleep(800);
      await ev(DRAFT_HELPERS);
      const whileFailing = {
        form: await ev<boolean>(`!!window.__btn('Save & add another household')`),
        failed: await ev<number>(`window.__failedGets`),
        line: await lineNow(),
        kept: (await keysNow()).includes(goneKey),
      };
      await c.removeInitScript(failing);
      await dgo(`/plan/${evD}/setup`);
      await sleep(800);
      const loaded = {
        form: await ev<boolean>(`!!window.__btn('Save & add another household')`),
        line: await lineNow(),
        kept: (await keysNow()).includes(goneKey),
      };
      assert(
        'C',
        'C27 390: a kept draft for a household no longer on the event: while the household list fails to load, the add form opens, the draft is kept and not offered; once the list loads without it, the draft is removed and no line shows',
        whileFailing.form &&
          whileFailing.failed >= 1 &&
          whileFailing.line === null &&
          whileFailing.kept &&
          loaded.form &&
          loaded.line === null &&
          !loaded.kept,
        S({ whileFailing, loaded })
      );
    }

    // C26 — a browser that refuses storage: the form types and saves as before.
    {
      const refuse = await c.addInitScript(`(() => { window.__pageErrors = 0;
        window.addEventListener('error', () => { window.__pageErrors++; });
        Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('refused', 'SecurityError'); } }); })();`);
      await go(`/plan/${evD}/setup`);
      const hhD = await households(evD);
      const refused = await ev<boolean>(
        `(() => { try { localStorage.length; return false; } catch (e) { return true; } })()`
      );
      await ev(`window.__set(document.querySelector('#m1-name'), 'Ari c26')`);
      await tap(`window.__btn('👦 Kid with a job')`, 300);
      await ev(`window.__set(window.__kids()[0].name, 'Kid c26')`);
      await clearCalls();
      await tap(`window.__btn('Save & add another household')`, 2500);
      const post = await writes();
      const errs = await ev<{ page: number; unhandled: number }>(
        `({ page: window.__pageErrors, unhandled: window.__unhandled })`
      );
      await c.removeInitScript(refuse);
      assert(
        'C',
        'C26 390: storage refused before the page loads: the form types and saves as before (one POST, stored), no page error',
        refused &&
          S(post) === S([`POST /api/events/${evD}/households`]) &&
          (await households(evD)) === hhD + 1 &&
          errs.page === 0 &&
          errs.unhandled === 0,
        S({ refused, post, errs })
      );
    }

    // C25 — sign-out clears every household draft here; signed in again, nothing comes back.
    {
      await dgo(`/plan/${evD}/setup`);
      await ev(`window.__set(document.querySelector('#m1-name'), 'Sol c25')`);
      await sleep(400);
      const before = await keysNow();
      await tap(`document.querySelector('button[aria-label="Open menu"]')`, 400);
      const signedOut = await tap(`window.__btn('Sign Out')`, 4000);
      await sleep(2000);
      await ev(DRAFT_HELPERS);
      const afterOut = { path: await ev<string>(`location.pathname`), keys: await keysNow() };
      const token2 = randomBytes(32).toString('hex');
      const s2 = await prisma.session.create({
        data: { userId: user.id, token: token2, expiresAt: new Date(Date.now() + 3600e3) },
      });
      created.sessions.push(s2.id);
      await c.setSessionCookie(token2);
      await dgo(`/plan/${evD}/setup`);
      const again = { line: await lineNow(), form: await formNow(), keys: await keysNow() };
      assert(
        'C',
        'C25 390: with drafts here (this event’s and another’s), Sign Out from the phone menu leaves no household draft in this browser; signed in again, a clean form and no line',
        before.includes(`${KEY_HEAD}${evD}:new`) &&
          before.includes(`${KEY_HEAD}other-event:new`) &&
          signedOut === null &&
          afterOut.keys.length === 0 &&
          again.line === null &&
          again.form.name === '' &&
          again.keys.length === 0,
        S({ before, signedOut, afterOut, again })
      );
    }

    assert(
      'C',
      'C11 SAFETY: no click was refused, and Chrome asked for no host but localhost',
      refusals.length === 0 && c.hostsRequested().every((h) => h.startsWith('localhost')),
      S({ refusals, hosts: c.hostsRequested() })
    );
  } catch (e) {
    assert('C', 'C-run the Chrome layer ran to its end', false, String((e as Error).message));
  } finally {
    chrome?.close();
  }

  // People the app made (the kids, Lena) are on the fixture events only; adopt them for removal.
  const onFixture = await prisma.person.findMany({
    where: { id: { notIn: created.people }, eventMemberships: { some: evIn } },
    select: {
      id: true,
      userId: true,
      eventMemberships: { select: { eventId: true } },
      _count: { select: { hostedEvents: true, cohostedEvents: true } },
    },
  });
  for (const p of onFixture) {
    if (
      !p.userId &&
      p._count.hostedEvents === 0 &&
      p._count.cohostedEvents === 0 &&
      p.eventMemberships.every((m) => created.events.includes(m.eventId))
    )
      created.people.push(p.id);
    else console.error('cleanup: left', p.id, '- not only a fixture guest');
  }
  await cleanup();
  const after = await totals();
  assert(
    'Z',
    `Z1 every fixture row removed by id (${whileExists} while it existed), the totals as found (${before.invite}/${before.outbound} -> ${after.invite}/${after.outbound})`,
    (await rows()) === '0,0,0,0,0,0,0,0,0,0' &&
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
  layerW();
  layerR();
  layerS();
  layerS7();
  layerD();
  layerS8();
  layerT();
  if (process.env.HOUSEHOLD_SAVE_DRY_RUN !== '1') {
    try {
      await runLive();
    } finally {
      await prisma.$disconnect();
    }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  if (reds.length) {
    console.log('\nRED:');
    for (const r of reds) console.log(`  ${r}`);
  }
  process.exit(failed > 0 ? 1 : 0);
}
main();
