/**
 * [[GTC-460]] Stage 3, step 3d — PLACED: WHICH OF HER CONTACTS ARE ALREADY IN A HOUSEHOLD (D13, rulings 40, 156).
 *
 * WHAT PLACED IS, IN PLAIN WORDS. When she saves a household that has people picked from her contacts, this
 * browser remembers, for that event, which contact went into which household. The form then greys those
 * people ("Already in Kate's household") and the contacts page shows a badge on each person. It is
 * remembered at the moment of the save, by the contact's id. It is NEVER matched by email: a person typed
 * in by hand is not known as placed. A remembered placement counts only while it still holds: the household
 * must still be there and still have a member of that name. One plain function says so, and each page
 * turns its own list of households into the simple list that function reads.
 *
 * WHAT THIS FILE PINS (the plan's `test:contacts-placed`, section 8):
 *   W  the sentences of 3d: W32, W36 to W38, W39, W40 are the ruled ones
 *   K  the key, per person and per event, clear of the draft prefix and of the sweep
 *   R  recording: one record per picked row (the id, the household, the name as saved, the outcome), per
 *      event; a failed write changes nothing; nothing else about the contact is kept
 *   H  "still holds": household gone, member gone, member renamed, still there; the latest placement wins
 *   C  the two pages' lists turned into the one simple list; NOT MATCHED BY EMAIL
 *   P  the setup page's own handlers, cut out of its live source and run alone: a placement is written only
 *      AFTER a save returns good, from the household's id in the answer, never for a refused or thrown
 *      save, never when no contact was picked, and with no new name needed on the normal path (ruling 181)
 *   B  break proofs on in-memory copies (no real file is touched)
 *
 * No browser, no database, no network. Every store is an in-memory stand-in.
 * Run: npx tsx --tsconfig tests/tsconfig.json tests/contacts-placed-test.ts  (npm run test:contacts-placed)
 */
import fs from 'fs';
import path from 'path';
import * as ts from 'typescript';
import { transformSync } from 'esbuild';
import { DRAFT_PREFIX, sweepDrafts } from '../src/lib/households/form-draft';

const ROOT = path.join(__dirname, '..');
const PLACED = 'src/lib/contacts/placed.ts';
const SETUP = 'src/app/plan/[eventId]/setup/page.tsx';
const TICKET = 'docs/tickets/GTC-460.md';

// ── Reporting ────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
function report(id: string, label: string, ok: boolean, got?: unknown) {
  if (ok) {
    passed++;
    console.log(`\x1b[32m✓\x1b[0m ${id} ${label}`);
  } else {
    failed++;
    console.log(`\x1b[31m✗\x1b[0m ${id} ${label}`);
    if (got !== undefined) console.log(`    got: ${String(JSON.stringify(got)).slice(0, 300)}`);
  }
}
const section = (s: string) => console.log(`\n\x1b[1m\x1b[33m${s}\x1b[0m`);
type Verdict = boolean | { ok: boolean; got?: unknown };

// ── Files and the ruled words ────────────────────────────────────────────────
const read = (rel: string) => {
  try {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
  } catch {
    return '';
  }
};
const flat = (s: string) => s.replace(/\s+/g, ' ');
const ticketText = flat(read(TICKET));
const wordsSection = (() => {
  const a = ticketText.indexOf('#### 7. The W-lines, for the founder');
  const b = ticketText.indexOf('#### 8. The tests');
  return a >= 0 && b > a ? ticketText.slice(a, b) : '';
})();
const ruled = (s: unknown) => typeof s === 'string' && wordsSection.includes(`*"${s}"*`);

// ── The module, compiled from source text (so a broken copy can be tried) ─────
type Mod = any;
function compile(text: string): Mod {
  const code = transformSync(text, { loader: 'ts', format: 'cjs', target: 'es2020' }).code;
  const m: { exports: any } = { exports: {} };
  const req = (id: string): any => {
    if (id.startsWith('@/')) return require(path.join(ROOT, 'src', id.slice(2)));
    return require(id);
  };
  new Function('require', 'module', 'exports', code)(req, m, m.exports);
  return m.exports;
}
const SRC = read(PLACED);
const load = (text = SRC): Mod => {
  if (!text) throw new Error(`${PLACED} is not there yet`);
  return compile(text);
};
const words = () => require('../src/lib/contacts/words');

// ── A browser store in memory, that can be told to fail ──────────────────────
class Mem {
  m = new Map<string, string>();
  calls = 0;
  failWrite: false | 'quota' | 'blocked' = false;
  failRead = false;
  get length() {
    this.calls++;
    return this.m.size;
  }
  key(i: number) {
    this.calls++;
    return [...this.m.keys()][i] ?? null;
  }
  getItem(k: string) {
    this.calls++;
    if (this.failRead) throw new Error('blocked');
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.calls++;
    if (this.failWrite === 'quota') {
      const e = new Error('The quota has been exceeded.');
      e.name = 'QuotaExceededError';
      throw e;
    }
    if (this.failWrite) throw new Error('blocked');
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.calls++;
    this.m.delete(k);
  }
}

// ── Households, in the two shapes the two pages hold ─────────────────────────
type Raw = {
  id: string;
  members: Array<{
    id: string;
    householdRole: string;
    person: { name: string; email?: string | null };
  }>;
};
const raw = (id: string, members: Array<[string, string, string?]>): Raw => ({
  id,
  members: members.map(([role, name, email]) => ({
    id: `pe-${name}`,
    householdRole: role,
    person: { name, email: email ?? null },
  })),
});
const saved = (
  id: string,
  main: string,
  others: { partner?: string; helpers?: string[]; guests?: string[] } = {}
) => ({
  id,
  primaryContact: { name: main },
  ...(others.partner ? { partner: { name: others.partner } } : {}),
  helpers: (others.helpers ?? []).map((name) => ({ name })),
  guests: (others.guests ?? []).map((name) => ({ name })),
  littleCount: 0,
});
const KATE = raw('hh1', [
  ['PRIMARY_CONTACT', 'Kate Smith', 'kate@example.com'],
  ['PARTNER', 'Pat Smith'],
  ['CHILD', 'Jo Smith'],
  ['GUEST', 'Gus Guest'],
]);
const KATE_SAVED = saved('hh1', 'Kate Smith', {
  partner: 'Pat Smith',
  helpers: ['Jo Smith'],
  guests: ['Gus Guest'],
});
const row = (contactId: string, name: string, over: Record<string, unknown> = {}) => ({
  contactId,
  name,
  role: 'adult',
  ...over,
});

// ── The checks. Each takes the module, so a broken copy can be tried on all of them ──
const defs: Array<[string, string, (P: Mod) => Verdict]> = [];
const def = (id: string, label: string, fn: (P: Mod) => Verdict) => defs.push([id, label, fn]);

def(
  'K.1',
  'the key is gather:contact-placed:v1:<user>:<event>, under the placement prefix, clear of the draft prefix, and the draft sweep leaves it',
  (P) => {
    const { PLACED_PREFIX } = require('../src/lib/contacts/store');
    const k = P.placedKey('user-a', 'ev1');
    const s = new Mem();
    s.m.set(k, '[]');
    s.m.set(`${DRAFT_PREFIX}v1:user-a:ev1:new`, '{}');
    sweepDrafts(s as any, 'user-a');
    sweepDrafts(s as any, null);
    sweepDrafts(s as any, 'user-b');
    return {
      ok:
        k === 'gather:contact-placed:v1:user-a:ev1' &&
        k.startsWith(PLACED_PREFIX) &&
        !k.startsWith(DRAFT_PREFIX) &&
        s.m.has(k),
      got: k,
    };
  }
);
def(
  'R.1',
  "recording writes one record per picked row: the contact's id, the household's id, the name as saved, adult or kid, and the kid's outcome",
  (P) => {
    const s = new Mem();
    const ok = P.recordPlacements(s, 'user-a', 'ev1', 'hh9', [
      row('c1', 'Mere Tane'),
      row('c2', 'Kiri Kid', { role: 'kid', outcome: 'later' }),
      row('c3', 'Pip Kid', { role: 'kid', outcome: 'message' }),
      row('c4', 'Plain Kid', { role: 'kid', outcome: 'plain' }),
    ]);
    const got = P.readPlaced(s, 'user-a', 'ev1');
    return {
      ok:
        ok === true &&
        got.length === 4 &&
        got.every((p: any) => p.householdId === 'hh9') &&
        got[0].contactId === 'c1' &&
        got[0].role === 'adult' &&
        !('outcome' in got[0]) &&
        got[1].outcome === 'later' &&
        got[2].outcome === 'message' &&
        got[3].outcome === 'plain',
      got,
    };
  }
);
def(
  'R.2',
  'it remembers nothing about the contact but its id and the name as saved (no email, no number, no problem sentence)',
  (P) => {
    const s = new Mem();
    P.recordPlacements(s, 'user-a', 'ev1', 'hh9', [
      {
        ...row('c1', 'Mere Tane'),
        email: 'mere@example.com',
        phone: '+64215550147',
        problems: ['x'],
      },
    ]);
    const text = [...s.m.values()].join();
    return {
      ok:
        !text.includes('mere@example.com') &&
        !text.includes('64215550147') &&
        !text.includes('problems'),
      got: text.slice(0, 200),
    };
  }
);
def(
  'R.3',
  "it is per event and per person: another event's and another person's placements are not touched",
  (P) => {
    const s = new Mem();
    P.recordPlacements(s, 'user-a', 'ev1', 'hh1', [row('c1', 'Mere Tane')]);
    P.recordPlacements(s, 'user-a', 'ev2', 'hh7', [row('c1', 'Mere Tane')]);
    P.recordPlacements(s, 'user-b', 'ev1', 'hh8', [row('c1', 'Mere Tane')]);
    const a = P.readPlaced(s, 'user-a', 'ev1');
    return {
      ok:
        a.length === 1 &&
        a[0].householdId === 'hh1' &&
        P.readPlaced(s, 'user-a', 'ev2')[0].householdId === 'hh7' &&
        P.readPlaced(s, 'user-b', 'ev1')[0].householdId === 'hh8' &&
        s.m.size === 3,
      got: s.m.size,
    };
  }
);
def(
  'R.4',
  'placing a contact again replaces the earlier record (one place at a time); the others stay',
  (P) => {
    const s = new Mem();
    P.recordPlacements(s, 'user-a', 'ev1', 'hh1', [row('c1', 'Mere Tane'), row('c2', 'Hone Rata')]);
    P.recordPlacements(s, 'user-a', 'ev1', 'hh2', [row('c1', 'Mere Tane')]);
    const got = P.readPlaced(s, 'user-a', 'ev1');
    const byId = Object.fromEntries(got.map((p: any) => [p.contactId, p.householdId]));
    return { ok: got.length === 2 && byId.c1 === 'hh2' && byId.c2 === 'hh1', got: byId };
  }
);
def(
  'R.5',
  'a browser that will not save or is full: false, and what was remembered is as it was; nothing recorded for no rows; signed out touches nothing',
  (P) => {
    const s = new Mem();
    P.recordPlacements(s, 'user-a', 'ev1', 'hh1', [row('c1', 'Mere Tane')]);
    const before = JSON.stringify([...s.m]);
    s.failWrite = 'blocked';
    const a = P.recordPlacements(s, 'user-a', 'ev1', 'hh2', [row('c2', 'Hone Rata')]);
    s.failWrite = 'quota';
    const b = P.recordPlacements(s, 'user-a', 'ev1', 'hh2', [row('c2', 'Hone Rata')]);
    s.failWrite = false;
    const calls = s.calls;
    const none = P.recordPlacements(s, 'user-a', 'ev1', 'hh3', []);
    const out = P.recordPlacements(s, null, 'ev1', 'hh3', [row('c9', 'X')]);
    return {
      ok:
        a === false &&
        b === false &&
        JSON.stringify([...s.m]) === before &&
        none === true &&
        out === false &&
        s.calls === calls,
      got: [a, b, none, out, s.calls - calls],
    };
  }
);
def(
  'R.6',
  "a corrupt, old-version or other person's value reads as nothing and never throws; a store that throws reads as nothing",
  (P) => {
    const s = new Mem();
    const k = P.placedKey('user-a', 'ev1');
    const tried = (v: string) => {
      s.m.set(k, v);
      return P.readPlaced(s, 'user-a', 'ev1').length;
    };
    const got = [
      tried('not json'),
      tried('{"v":2,"placements":[]}'),
      tried(
        JSON.stringify({
          v: 1,
          userId: 'user-b',
          eventId: 'ev1',
          placements: [{ contactId: 'c1', householdId: 'h', name: 'N', role: 'adult' }],
        })
      ),
      tried('{"v":1}'),
    ];
    s.failRead = true;
    return {
      ok:
        got.every((n) => n === 0) &&
        P.readPlaced(s, 'user-a', 'ev1').length === 0 &&
        P.readPlaced(null, 'user-a', 'ev1').length === 0,
      got,
    };
  }
);
def(
  'R.7',
  'a name over 200 characters or a row with no id or no name is left out; the rest are kept',
  (P) => {
    const s = new Mem();
    P.recordPlacements(s, 'user-a', 'ev1', 'hh1', [
      row('c1', 'N'.repeat(201)),
      row('', 'No Id'),
      row('c3', '   '),
      row('c4', 'Fine Person'),
    ]);
    const got = P.readPlaced(s, 'user-a', 'ev1');
    return { ok: got.length === 1 && got[0].contactId === 'c4', got };
  }
);

def(
  'H.1',
  'a placement holds only while its household is still there and still has a member of that name (capitals ignored)',
  (P) => {
    const p = { contactId: 'c1', householdId: 'hh1', name: 'Jo Smith', role: 'kid' };
    const lite = P.liteFromApi([KATE]);
    const gone = P.holds(
      p,
      P.liteFromApi([
        raw('hh2', [
          ['PRIMARY_CONTACT', 'Someone Else'],
          ['CHILD', 'Jo Smith'],
        ]),
      ])
    );
    const memberGone = P.holds(
      p,
      P.liteFromApi([
        raw('hh1', [
          ['PRIMARY_CONTACT', 'Kate Smith'],
          ['PARTNER', 'Pat Smith'],
        ]),
      ])
    );
    const renamed = P.holds(
      p,
      P.liteFromApi([
        raw('hh1', [
          ['PRIMARY_CONTACT', 'Kate Smith'],
          ['CHILD', 'Joseph Smith'],
        ]),
      ])
    );
    const still = P.holds(p, lite);
    const caps = P.holds({ ...p, name: 'JO smith' }, lite);
    const spaced = P.holds({ ...p, name: ' Jo   Smith ' }, lite);
    return {
      ok:
        gone === null &&
        memberGone === null &&
        renamed === null &&
        still?.id === 'hh1' &&
        caps?.id === 'hh1' &&
        spaced?.id === 'hh1',
      got: { gone, memberGone, renamed, still: still?.id },
    };
  }
);
def(
  'H.2',
  "live placements: by contact; a household's main contact name comes from the live list; the latest record of a contact wins",
  (P) => {
    const lite = P.liteFromApi([KATE]);
    const list = [
      { contactId: 'c1', householdId: 'hh1', name: 'Jo Smith', role: 'kid', outcome: 'plain' },
      { contactId: 'c2', householdId: 'hh-gone', name: 'Ghost', role: 'adult' },
      { contactId: 'c3', householdId: 'hh1', name: 'Gus Guest', role: 'adult' },
    ];
    const live = P.livePlacements(list, lite);
    return {
      ok:
        live.size === 2 &&
        live.get('c1').household.mainName === 'Kate Smith' &&
        live.get('c3').household.id === 'hh1' &&
        !live.has('c2'),
      got: [...live.keys()],
    };
  }
);

def(
  'C.1',
  'one rule, two pages: the raw list the contacts page reads and the list the setup page holds turn into the same simple list',
  (P) => {
    const a = P.liteFromApi([KATE]);
    const b = P.liteFromSaved([KATE_SAVED]);
    const norm = (l: any[]) =>
      JSON.stringify(l.map((h) => [h.id, h.mainName, [...h.memberNames].sort()]));
    return {
      ok: a.length === 1 && norm(a) === norm(b) && a[0].mainName === 'Kate Smith',
      got: [norm(a), norm(b)],
    };
  }
);
def(
  'C.2',
  'the raw list is read safely: anything not shaped like a household is ignored, a household with no primary contact still holds its members',
  (P) => {
    const odd = P.liteFromApi([
      null,
      5,
      'x',
      {},
      { id: 'h', members: 'no' },
      { id: 'h2', members: [{ householdRole: 'GUEST', person: { name: 'Solo Guest' } }] },
      KATE,
    ]);
    const notList = P.liteFromApi('nope');
    return {
      ok:
        odd.length === 2 &&
        odd.find((h: any) => h.id === 'h2')?.memberNames.join() === 'Solo Guest' &&
        Array.isArray(notList) &&
        notList.length === 0,
      got: odd,
    };
  }
);
def(
  'C.3',
  'NOT MATCHED BY EMAIL: a household member with the same email or name as a contact does not place that contact; only a record made at the save does',
  (P) => {
    const lite = P.liteFromApi([
      raw('hh1', [['PRIMARY_CONTACT', 'Mere Tane', 'mere@example.com']]),
    ]);
    const live = P.livePlacements([], lite);
    const text = JSON.stringify(lite);
    return {
      ok:
        live.size === 0 &&
        !text.includes('@') &&
        !/email/i.test(text) &&
        !JSON.stringify(P.liteFromSaved([KATE_SAVED])).includes('@'),
      got: [live.size, text.slice(0, 120)],
    };
  }
);

// ── The setup page's own handlers, cut out of its live source and run alone ──
function fromPage(name: string, scope: Record<string, unknown>): any {
  const src = read(SETUP);
  if (!src) return null;
  const sf = ts.createSourceFile('page.tsx', src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found: ts.Node | null = null;
  const visit = (n: ts.Node) => {
    if (
      !found &&
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.name.text === name &&
      n.initializer &&
      ts.isArrowFunction(n.initializer)
    )
      found = n.initializer;
    if (!found) ts.forEachChild(n, visit);
  };
  visit(sf);
  return build(found, sf, scope);
}
function build(node: ts.Node | null, sf: ts.SourceFile, scope: Record<string, unknown>) {
  if (!node) return null;
  const js = transformSync(`exports.f = ${node.getText(sf)};`, {
    loader: 'ts',
    format: 'cjs',
  }).code;
  const m: { exports: any } = { exports: {} };
  new Function('module', 'exports', ...Object.keys(scope), js)(
    m,
    m.exports,
    ...Object.values(scope)
  );
  return m.exports.f;
}
/** The names the page's handlers reach for, with stand-ins; `placeRows` is the spy. */
function stand(answer: { ok: boolean; body?: unknown; throws?: boolean }, withPlace = true) {
  const calls: any[] = [];
  const scope: Record<string, unknown> = {
    event: { id: 'ev1' },
    fetch: async () => {
      if (answer.throws) throw new Error('offline');
      return { ok: answer.ok, json: async () => answer.body ?? { error: 'no' } };
    },
    apiHouseholdToSaved: (h: any) => ({
      id: h.id,
      primaryContact: { name: 'Saved' },
      helpers: [],
      guests: [],
      littleCount: 0,
    }),
    setHouseholds() {},
    setEditingHousehold() {},
    setMoment1Phase() {},
    jumpMoment1ToTop() {},
    keptEmailNames: () => [],
    households: [],
    moment1FormRef: { current: null },
    window: { innerWidth: 1280 },
    setTimeout: () => 0,
  };
  if (withPlace) scope.placeRows = (...a: unknown[]) => void calls.push(a);
  return { scope, calls };
}
const PICKED = [row('c1', 'Mere Tane')];
const GOOD = { household: { id: 'hh-new' } };
type Door = [string, string, (h: any, picked?: unknown) => Promise<unknown>];
const DOORS: Door[] = [
  [
    'handleAddHousehold',
    'the new household',
    (h, p) =>
      p === undefined
        ? h({ primaryContact: { name: 'X' } })
        : h({ primaryContact: { name: 'X' } }, p),
  ],
  [
    'handleEditSave',
    'the change of a household',
    (h, p) =>
      p === undefined
        ? h('hh-edit', { primaryContact: { name: 'X' } })
        : h('hh-edit', { primaryContact: { name: 'X' } }, p),
  ],
  [
    'handleSaveHostHousehold',
    'her own first save',
    (h, p) =>
      p === undefined ? h({ alone: false, name: 'X' }) : h({ alone: false, name: 'X' }, p),
  ],
];
const doorId = (n: string) => (n === 'handleEditSave' ? 'hh-edit' : 'hh-new');
def(
  'P.1',
  "a placement is written only AFTER the save returns good, once, from the household's id, with the rows as the form listed them (new household, change, her own first save)",
  () => {
    const bad: string[] = [];
    return Promise.all(
      DOORS.map(async ([name, , call]) => {
        const { scope, calls } = stand({ ok: true, body: GOOD });
        const h = fromPage(name, scope);
        if (!h) return bad.push(`${name}: not on the page`);
        await call(h, PICKED);
        if (
          calls.length !== 1 ||
          calls[0][0] !== doorId(name) ||
          JSON.stringify(calls[0][1]) !== JSON.stringify(PICKED)
        )
          bad.push(`${name}: ${JSON.stringify(calls)}`);
      })
    ).then(() => ({ ok: bad.length === 0, got: bad })) as any;
  }
);
def('P.2', 'nothing is written for a save the server refused or that threw', () => {
  const bad: string[] = [];
  return Promise.all(
    DOORS.flatMap(([name, , call]) =>
      [{ ok: false }, { ok: true, throws: true }].map(async (answer) => {
        const { scope, calls } = stand(answer as any);
        const h = fromPage(name, scope);
        if (!h) return void bad.push(`${name}: not on the page`);
        let threw = false;
        try {
          await call(h, PICKED);
        } catch {
          threw = true;
        }
        if (!threw || calls.length !== 0)
          bad.push(`${name} ${JSON.stringify(answer)}: threw ${threw}, calls ${calls.length}`);
      })
    )
  ).then(() => ({ ok: bad.length === 0, got: bad })) as any;
});
def(
  'P.3',
  "when no contact was picked nothing is written, and the handler needs no new name: it runs with the page's old names only (ruling 181)",
  () => {
    const bad: string[] = [];
    return Promise.all(
      DOORS.map(async ([name, , call]) => {
        const spy = stand({ ok: true, body: GOOD });
        const h1 = fromPage(name, spy.scope);
        await call(h1);
        await call(h1, []);
        const old = stand({ ok: true, body: GOOD }, false);
        const h2 = fromPage(name, old.scope);
        try {
          await call(h2);
          await call(h2, []);
        } catch (e) {
          bad.push(`${name}: ${String((e as Error).message).slice(0, 80)}`);
        }
        if (spy.calls.length !== 0) bad.push(`${name}: wrote with nothing picked`);
      })
    ).then(() => ({ ok: bad.length === 0, got: bad })) as any;
  }
);

// P.4 is the link the handlers do not show: how the page learns who is signed in, when it reads what is
// remembered, and that the form is handed the placed list. Without it the form would never grey anyone.
// (Added once the page was built, so it was not seen red before the code; its break proofs below are.)
def(
  'P.4',
  'the setup page takes the signed-in id from the layout, reads what is remembered only after it has mounted, and hands the placed list to the household form',
  () => {
    const src = read(SETUP);
    if (!src) return { ok: false, got: 'no setup page' };
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const flat = code.replace(/\s+/g, ' ');
    const n = (sub: string) => flat.split(sub).length - 1;
    const bad: string[] = [];
    if (n('useContext(ViewerIdContext)') !== 1) bad.push('the id is not read from the layout once');
    if (!flat.includes("import { ViewerIdContext } from '@/components/shared/Providers';"))
      bad.push('the id does not come from Providers');
    if (
      !flat.includes(
        'useEffect(() => { if (!viewerId || !event) { setPlacements([]); return; } setPlacements(readPlaced(browserContactsStore(), viewerId, event.id));'
      )
    )
      bad.push('what is remembered is not read inside an effect');
    if (n('readPlaced(') !== 2) bad.push('readPlaced is called somewhere else too');
    if (
      !flat.includes(
        'const placeRows = (householdId: string, rows: PickedRow[]) => { if (!viewerId || !event) return; if (recordPlacements(browserContactsStore(), viewerId, event.id, householdId, rows)) {'
      )
    )
      bad.push('placeRows does not stop without a signed-in person and an event');
    if (
      !flat.includes(
        'livePlacements(placements, liteFromSaved(households)).forEach((v, id) => { contactsPlaced[id] = v.household.mainName; });'
      )
    )
      bad.push('the form list is not built from the placements that still hold');
    const sf = ts.createSourceFile(
      'page.tsx',
      src,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    );
    const tags: ts.JsxAttributes[] = [];
    const visit = (node: ts.Node) => {
      if (
        (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) &&
        node.tagName.getText(sf) === 'Moment1InputForm'
      )
        tags.push(node.attributes);
      ts.forEachChild(node, visit);
    };
    visit(sf);
    const attr = (a: ts.JsxAttributes, name: string) => {
      const found = a.properties.find((x) => ts.isJsxAttribute(x) && x.name.getText(sf) === name);
      return found && ts.isJsxAttribute(found) && found.initializer
        ? found.initializer.getText(sf)
        : null;
    };
    const second = tags.filter((a) => attr(a, 'onAddPerson') === '{handleAddHousehold}');
    if (tags.length !== 2) bad.push(`${tags.length} household form tags, wanted 2`);
    if (second.length !== 1 || attr(second[0], 'contactsPlaced') !== '{contactsPlaced}')
      bad.push('the household form that adds households is not handed contactsPlaced');
    if (n('contactsPlaced={contactsPlaced}') !== 1)
      bad.push('contactsPlaced is handed to a form twice');
    return { ok: bad.length === 0, got: bad };
  }
);

// ── Run ─────────────────────────────────────────────────────────────────────
async function runOne(
  id: string,
  label: string,
  fn: (P: Mod) => Verdict | Promise<Verdict>,
  P: Mod | null,
  why: string
) {
  try {
    if (!P) throw new Error(why);
    const r = await fn(P);
    if (typeof r === 'boolean') report(id, label, r);
    else report(id, label, r.ok, r.got);
  } catch (e) {
    report(id, label, false, `threw: ${String((e as Error).message).slice(0, 200)}`);
  }
}

async function main() {
  section('W — the sentences of step 3d are the ruled ones (W32, W36 to W38, W39, W40)');
  report(
    'W.1',
    'the ticket section with the ruled W-lines was found',
    wordsSection.length > 2000,
    wordsSection.length
  );
  {
    let W: any = {};
    try {
      W = words();
    } catch {
      W = {};
    }
    const C = W.CONTACTS_WORDS ?? {};
    const sub = (f: unknown, ...a: unknown[]) =>
      typeof f === 'function' ? (f as any)(...a) : undefined;
    const ask = (n: boolean, e: boolean) => sub(W.promptAsk, '{Name}', n, e);
    const tmpl = (s: unknown) =>
      typeof s === 'string'
        ? s
            .replace(
              'has a number and an email in',
              'has {a number | an email | a number and an email} in'
            )
            .replace('has a number in', 'has {a number | an email | a number and an email} in')
            .replace('has an email in', 'has {a number | an email | a number and an email} in')
        : s;
    const wanted: Array<[string, unknown]> = [
      ['W32', sub(W.alreadyInWords, '{Name}')],
      ['W36 number', tmpl(ask(true, false))],
      ['W36 email', tmpl(ask(false, true))],
      ['W36 both', tmpl(ask(true, true))],
      ['W36 message', sub(W.promptMessage, '{Name}')],
      ['W36 dont', sub(W.promptDont, '{Name}')],
      ['W36 later', C.DECIDE_LATER],
      ['W37', sub(W.promptInfo, '{Name}')],
      ['W38', sub(W.promptWarning, '{Name}')],
      ['W39', C.NOT_PLACED],
      ['W40', sub(W.placedWords, '{Name}', '')],
      [
        'W40 kid plain',
        sub(W.placedWords, '{Name}', 'plain')?.replace("In {Name}'s household.", ''),
      ],
      [
        'W40 kid message',
        sub(W.placedWords, '{Name}', 'message')?.replace("In {Name}'s household.", ''),
      ],
      [
        'W40 kid later',
        sub(W.placedWords, '{Name}', 'later')?.replace("In {Name}'s household.", ''),
      ],
      [
        'W40 no details',
        sub(W.placedWords, '{Name}', 'none')?.replace("In {Name}'s household.", ''),
      ],
    ];
    const missing = wanted.filter(([, s]) => !ruled(s)).map(([id]) => id);
    report(
      'W.2',
      'each sentence is exactly the ruled one, with {Name} where the ticket has it',
      missing.length === 0,
      missing
    );
    const all = [...Object.values(C), ...wanted.map(([, s]) => s)].filter(
      (s) => typeof s === 'string'
    ) as string[];
    report(
      'W.3',
      'no apostrophe is curly (the two quotes round "Old enough to message directly" are the ticket\'s double quotes)',
      all.every((s) => !/[‘’]/.test(s)),
      all.filter((s) => /[‘’]/.test(s)).slice(0, 2)
    );
  }

  section(
    "K, R, H, C, P — the key, recording, still holds, the two pages' lists, the setup page's handlers"
  );
  let real: Mod | null = null;
  let why = '';
  try {
    real = load();
  } catch (e) {
    why = String((e as Error).message);
  }
  for (const [id, label, fn] of defs) await runOne(id, label, fn, real, why);

  section('B — break proofs: one rule broken in an in-memory copy, and the named checks go red');
  {
    // [what is wrong, which source, the text it replaces (exactly once), the replacement, checks that go red]
    const faults: Array<['placed' | 'page', string, string, string, string[]]> = [
      [
        'placed',
        'a household that is gone still holds',
        'const h = households.find((x) => x.id === p.householdId);',
        'const h = households[0];',
        ['H.1'],
      ],
      [
        'placed',
        'a renamed member still holds',
        '.some((n) => same(n, p.name))',
        '.some(() => true)',
        ['H.1'],
      ],
      [
        'placed',
        'capitals matter',
        'const same = (a: string, b: string) => norm(a) === norm(b);',
        'const same = (a: string, b: string) => a === b;',
        ['H.1'],
      ],
      [
        'placed',
        "the simple list carries the members' emails (an email match becomes possible)",
        'memberNames: names,',
        'memberNames: names, emails: members.map((m: any) => m?.person?.email),',
        ['C.3'],
      ],
      [
        'placed',
        'a placement is kept for a contact that was placed again',
        'const kept = old.filter((p) => !ids.has(p.contactId));',
        'const kept = old;',
        ['R.4'],
      ],
      [
        'placed',
        'a name over 200 characters is kept',
        'name.length > 200',
        'name.length > 20000',
        ['R.7'],
      ],
      [
        'placed',
        'a failed write says it went through',
        'return write(store, key, userId, eventId, [...kept, ...added]);',
        'write(store, key, userId, eventId, [...kept, ...added]); return true;',
        ['R.5'],
      ],
      [
        'placed',
        "the contact's email is kept too",
        'role: r.role,',
        'role: r.role, email: (r as any).email,',
        ['R.2'],
      ],
      [
        'page',
        'a placement is written for a refused save',
        "throw new Error(data.error || 'Failed to add household');",
        "placeRows('x', picked); throw new Error(data.error || 'Failed to add household');",
        ['P.2'],
      ],
      [
        'page',
        'a placement is written from the wrong household',
        'placeRows(saved.id, picked);',
        "placeRows('hh-wrong', picked);",
        ['P.1'],
      ],
      [
        'page',
        'the guard is gone: it runs when nothing was picked',
        'if (picked.length > 0) placeRows(saved.id, picked);',
        'placeRows(saved.id, picked);',
        ['P.3'],
      ],
      [
        'page',
        'the page forgets to hand the form the placed list',
        'contactsPlaced={contactsPlaced}',
        '',
        ['P.4'],
      ],
      [
        'page',
        'what is remembered is read while the page draws',
        'const [placements, setPlacements] = useState<Placement[]>([]);',
        "const [placements, setPlacements] = useState<Placement[]>(readPlaced(browserContactsStore(), viewerId, event?.id ?? ''));",
        ['P.4'],
      ],
      [
        'page',
        'the signed-in id comes from nowhere',
        'const viewerId = useContext(ViewerIdContext);',
        'const viewerId = null as string | null;',
        ['P.4'],
      ],
      [
        'page',
        'every remembered placement greys a contact, held or not',
        'livePlacements(placements, liteFromSaved(households))',
        'new Map(placements.map((p) => [p.contactId, { placement: p, household: { id: p.householdId, mainName: p.name, memberNames: [] } }]))',
        ['P.4'],
      ],
    ];
    const wrong: string[] = [];
    for (const [which, what, from, to, red] of faults) {
      if (which === 'page') {
        // the page text is swapped in for the run; the real file is never touched
        const page = read(SETUP);
        if (page.split(from).length !== 2) {
          wrong.push(`${what}: its anchor is not in the setup page exactly once`);
          continue;
        }
        const ids = ['P.1', 'P.2', 'P.3', 'P.4'];
        const orig = fs.readFileSync;
        (fs as any).readFileSync = (p: any, ...rest: any[]) =>
          String(p).endsWith('setup/page.tsx')
            ? page.replace(from, () => to)
            : (orig as any)(p, ...rest);
        try {
          for (const id of ids) {
            const fn = defs.find((d) => d[0] === id)![2];
            let v: string;
            try {
              const r: any = await fn(real);
              v = r.ok ? 'green' : 'red';
            } catch {
              v = 'red';
            }
            if (v !== (red.includes(id) ? 'red' : 'green')) wrong.push(`${what}: ${id} was ${v}`);
          }
        } finally {
          (fs as any).readFileSync = orig;
        }
        continue;
      }
      if (SRC.split(from).length !== 2) {
        wrong.push(`${what}: its anchor is not in placed.ts exactly once`);
        continue;
      }
      let broken: Mod;
      try {
        broken = load(SRC.replace(from, () => to));
      } catch {
        wrong.push(`${what}: the copy did not compile`);
        continue;
      }
      for (const [id, , fn] of defs) {
        if (id.startsWith('P.')) continue; // those run the setup page, not this file
        let v: string;
        try {
          const r: any = await fn(broken);
          v = (typeof r === 'boolean' ? r : r.ok) ? 'green' : 'red';
        } catch {
          v = 'red'; // a check that crashes is a red check
        }
        const wanted = red.includes(id) ? 'red' : 'green';
        if (v !== wanted) wrong.push(`${what}: ${id} was ${v}, wanted ${wanted}`);
      }
    }
    report(
      'B.1',
      'each fault turns exactly the checks named red and leaves the others green',
      wrong.length === 0,
      wrong.slice(0, 6)
    );
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.log(String(e));
  process.exit(1);
});
