/**
 * [[GTC-460]] Stage 3, step 3c — PICKING FROM HER OWN LIST: the parts with no screen in them.
 *
 * WHAT PICKING IS, IN PLAIN WORDS. On the household form she types a name and, if she has loaded
 * contacts, a short list drops under the box: people whose name starts like what she typed. One tap
 * fills the row with that person. This file pins the three plain pieces behind it:
 *   M  the match (`match.ts`): the start of any word, ignoring capitals and macrons; names first, then
 *      email or number; up to six lines; an empty box shows nothing; greyed lines carry their reason;
 *      a person with neither detail is offered; a stable order; her own list only; no regular
 *      expression is ever built from what she types
 *   F  the fill (`fill.ts`): an adult row becomes exactly the contact (a box the contact lacks is
 *      emptied, a flagged number is carried as it is); a kid's row gets the name only; nothing is ticked
 *   H  the hand-off note (`handoff.ts`): what the contacts page leaves in this tab for the form
 *      (rulings 12, 37, 38): five minutes, used once, ignored quietly when it is not for this form
 *   B  break proofs: the same checks on in-memory copies of the three files with one rule broken, and
 *      each must go red (no real file is touched)
 * What the form does with them is pinned in `contacts-form-test.tsx`.
 *
 * No browser, no database, no network. Nothing is written anywhere. Words are read out of the ticket.
 * Run: npx tsx --tsconfig tests/tsconfig.json tests/contacts-match-test.ts  (npm run test:contacts-match)
 */
import fs from 'fs';
import path from 'path';
import { transformSync } from 'esbuild';

const ROOT = path.join(__dirname, '..');
const FILES = {
  match: 'src/lib/contacts/match.ts',
  fill: 'src/lib/contacts/fill.ts',
  handoff: 'src/lib/contacts/handoff.ts',
} as const;
type Which = keyof typeof FILES;
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

// ── Files, and the ruled words out of the ticket ─────────────────────────────
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

// ── The modules, compiled from source text (so a broken copy can be tried) ────
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
const SRC: Record<Which, string> = {
  match: read(FILES.match),
  fill: read(FILES.fill),
  handoff: read(FILES.handoff),
};
type Mods = Record<Which, Mod>;
function loadAll(over: Partial<Record<Which, string>> = {}): Mods {
  const out: any = {};
  for (const k of Object.keys(FILES) as Which[]) {
    const text = over[k] ?? SRC[k];
    if (!text) throw new Error(`${FILES[k]} is not there yet`);
    out[k] = compile(text);
  }
  return out;
}

// ── People ───────────────────────────────────────────────────────────────────
const P = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  ...extra,
});
const BOOK = [
  P('c1', 'Mere Tane', { email: 'mere@example.com', phone: '+64215550147' }),
  P('c2', 'Mārama Smith', { phone: '+64215550148' }),
  P('c3', 'Hōne Rata'),
  P('c4', 'Aroha Tane-Brown', { email: 'aroha@example.com' }),
  P('c5', 'Zed Quinn', { email: 'tane.zed@example.com' }),
  P('c6', 'Sam Overseas', { phone: '+44 20 7946 0958' }),
  P('c7', 'Pia Jones', { phone: '+64225550149' }),
];
const ids = (lines: any[]) => lines.map((l) => l.contact.id).join();

// ── A tab's storage in memory, that can be told to fail ──────────────────────
class Mem {
  m = new Map<string, string>();
  failRead = false;
  failRemove = false;
  failWrite = false;
  get length() {
    return this.m.size;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  getItem(k: string) {
    if (this.failRead) throw new Error('blocked');
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    if (this.failWrite) throw new Error('blocked');
    this.m.set(k, v);
  }
  removeItem(k: string) {
    if (this.failRemove) throw new Error('blocked');
    this.m.delete(k);
  }
}
const NOW = 1_700_000_000_000;
const note = (over: Record<string, unknown> = {}) => ({
  userId: 'user-a',
  eventId: 'ev1',
  form: 'new',
  contactId: 'c1',
  now: NOW,
  ...over,
});
const want = (over: Record<string, unknown> = {}) => ({
  userId: 'user-a',
  eventId: 'ev1',
  form: 'new',
  now: NOW,
  ...over,
});

// ── The checks. Each takes the three modules, so a broken copy can be tried on all of them ──
const defs: Array<[string, string, (M: Mods) => Verdict]> = [];
const def = (id: string, label: string, fn: (M: Mods) => Verdict) => defs.push([id, label, fn]);

// M — the match
def(
  'M.1',
  'it matches the start of any word, ignoring capitals; never the middle of a word',
  (M) => {
    const f = (q: string) => ids(M.match.matchContacts(BOOK, q));
    const got = {
      mer: f('mer'),
      MERE: f('MERE'),
      tan: f('tan'),
      ere: f('ere'),
      rata: f('RATA'),
      brown: f('brown'),
    };
    return {
      ok:
        got.mer === 'c1' &&
        got.MERE === 'c1' &&
        got.tan === 'c1,c4,c5' &&
        got.ere === '' &&
        got.rata === 'c3' &&
        got.brown === 'c4',
      got,
    };
  }
);
def('M.2', 'macrons are ignored both ways: "marama" finds "Mārama", "hōne" finds "Hone"', (M) => {
  const f = (q: string, list = BOOK) => ids(M.match.matchContacts(list, q));
  const plain = [P('p1', 'Marama Smith'), P('p2', 'Hone Rata')];
  const got = [
    f('marama'),
    f('MĀRAMA'),
    f('hone'),
    f('hōne'),
    f('hōne', plain),
    f('mārama', plain),
  ];
  return { ok: JSON.stringify(got) === JSON.stringify(['c2', 'c2', 'c3', 'c3', 'p2', 'p1']), got };
});
def('M.3', 'several words: each must start a different word of the name, in any order', (M) => {
  const f = (q: string) => ids(M.match.matchContacts(BOOK, q));
  const got = [f('mere ta'), f('tane mer'), f('mere mere'), f('s mar'), f('tane brown')];
  return { ok: JSON.stringify(got) === JSON.stringify(['c1', 'c1', '', 'c2', 'c4']), got };
});
def('M.4', 'names first, then email or number; the line says which one matched', (M) => {
  const lines = M.match.matchContacts(BOOK, 'tane');
  const phone = M.match.matchContacts(BOOK, '021 555');
  const local = M.match.matchContacts(BOOK, '0215550148');
  const letters = M.match.matchContacts(BOOK, 'abc');
  return {
    ok:
      ids(lines) === 'c1,c4,c5' &&
      lines.map((l: any) => l.via).join() === 'name,name,email' &&
      ids(phone) === 'c1,c2' &&
      phone.every((l: any) => l.via === 'phone') &&
      ids(local) === 'c2' &&
      ids(letters) === '',
    got: [lines.map((l: any) => [l.contact.id, l.via]), ids(phone), ids(local)],
  };
});
def('M.5', 'up to six lines; an empty or blank box shows nothing', (M) => {
  const many = Array.from({ length: 20 }, (_, i) => P(`m${i}`, `Person ${i}`));
  const six = M.match.matchContacts(many, 'per');
  return {
    ok:
      M.match.MAX_LINES === 6 &&
      six.length === 6 &&
      ids(six) === 'm0,m1,m2,m3,m4,m5' &&
      M.match.matchContacts(many, '').length === 0 &&
      M.match.matchContacts(many, '   ').length === 0 &&
      M.match.matchContacts([], 'per').length === 0,
    got: six.length,
  };
});
def('M.6', 'a greyed line carries its reason, stays in the list and counts toward the six', (M) => {
  const reason = (c: any) => (c.id === 'c4' ? 'Already added to this household' : undefined);
  const lines = M.match.matchContacts(BOOK, 'tane', { taken: reason });
  const many = Array.from({ length: 20 }, (_, i) => P(`m${i}`, `Person ${i}`));
  const six = M.match.matchContacts(many, 'per', { taken: () => 'r' });
  return {
    ok:
      ids(lines) === 'c1,c4,c5' &&
      lines[1].taken === 'Already added to this household' &&
      !('taken' in lines[0]) &&
      six.length === 6 &&
      six.every((l: any) => l.taken === 'r'),
    got: lines.map((l: any) => [l.contact.id, l.taken]),
  };
});
def('M.7', 'a person with neither email nor number is offered, by name', (M) => {
  const lines = M.match.matchContacts(BOOK, 'hone');
  return {
    ok:
      ids(lines) === 'c3' &&
      lines[0].via === 'name' &&
      !lines[0].contact.email &&
      !lines[0].contact.phone,
    got: lines,
  };
});
def(
  'M.8',
  'the order is stable: ties keep the order of her list, and the list is never changed',
  (M) => {
    const before = JSON.stringify(BOOK);
    const a = ids(M.match.matchContacts(BOOK, 't'));
    const b = ids(M.match.matchContacts(BOOK, 't'));
    const shuffled = [...BOOK].reverse();
    const c = ids(M.match.matchContacts(shuffled, 'tane'));
    return { ok: a === b && JSON.stringify(BOOK) === before && c === 'c4,c1,c5', got: [a, b, c] };
  }
);
def(
  'M.9',
  'typing is only ever compared as text: brackets, dots and stars match nothing special and throw nothing',
  (M) => {
    const f = (q: unknown) => {
      try {
        return ids(M.match.matchContacts(BOOK, q as string));
      } catch {
        return 'threw';
      }
    };
    const got = [
      f('.*'),
      f('('),
      f('[a-z]'),
      f('\\'),
      f('mere|zed'),
      f('^mere'),
      f('c1'),
      f(undefined),
      f(null),
      f(42),
    ];
    return { ok: got.every((g) => g === ''), got };
  }
);
def(
  'M.10',
  'her own list only: the file imports no server, database or network code and builds no expression from typing',
  () => {
    const src = SRC.match;
    const imports = [...src.matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1]);
    const bad = [
      'fetch(',
      'XMLHttpRequest',
      'sendBeacon',
      'prisma',
      'new RegExp',
      'localStorage',
      'sessionStorage',
      'console.',
    ].filter((t) => src.includes(t));
    const importsOk = [...src.matchAll(/^import (?!type )/gm)].length === 0;
    return { ok: src.length > 0 && importsOk && bad.length === 0, got: { imports, bad } };
  }
);

// F — the fill
def(
  'F.1',
  'an adult row becomes exactly the contact: a box the contact lacks is emptied; a flagged number is carried as it is',
  (M) => {
    const a = M.fill.fillFrom(BOOK[0], 'adult');
    const b = M.fill.fillFrom(BOOK[2], 'adult');
    const c = M.fill.fillFrom(BOOK[5], 'adult');
    const d = M.fill.fillFrom(BOOK[3], 'adult');
    return {
      ok:
        JSON.stringify(a) ===
          JSON.stringify({ name: 'Mere Tane', email: 'mere@example.com', phone: '+64215550147' }) &&
        JSON.stringify(b) === JSON.stringify({ name: 'Hōne Rata', email: '', phone: '' }) &&
        c.phone === '+44 20 7946 0958' &&
        d.phone === '',
      got: [a, b, c, d],
    };
  }
);
def('F.2', "a kid's row gets the name only (the prompt for a number or email comes at 3d)", (M) => {
  const k = M.fill.fillFrom(BOOK[0], 'kid');
  return {
    ok: JSON.stringify(k) === JSON.stringify({ name: 'Mere Tane', email: '', phone: '' }),
    got: k,
  };
});
def('F.3', 'a fill never carries a tick or anything but the three boxes', (M) => {
  const keys = (x: any) => Object.keys(x).sort().join();
  return {
    ok:
      keys(M.fill.fillFrom(BOOK[0], 'adult')) === 'email,name,phone' &&
      keys(M.fill.fillFrom(BOOK[0], 'kid')) === 'email,name,phone',
  };
});

// H — the hand-off note
def(
  'H.1',
  'the key is gather:contact-handoff:v1:<user>:<event>, under the hand-off prefix and clear of the draft prefix',
  (M) => {
    const { HANDOFF_PREFIX } = require('../src/lib/contacts/store');
    const { DRAFT_PREFIX } = require('../src/lib/households/form-draft');
    const k = M.handoff.handoffKey('user-a', 'ev1');
    return {
      ok:
        k === 'gather:contact-handoff:v1:user-a:ev1' &&
        k.startsWith(HANDOFF_PREFIX) &&
        !k.startsWith(DRAFT_PREFIX),
      got: k,
    };
  }
);
def('H.2', "written, then taken once: the form gets the contact's id and the note is gone", (M) => {
  const tab = new Mem();
  const w = M.handoff.writeHandoff(tab, note());
  const first = M.handoff.takeHandoff(tab, want());
  const second = M.handoff.takeHandoff(tab, want());
  return {
    ok: w === true && first?.contactId === 'c1' && second === null && tab.m.size === 0,
    got: [w, first, second, tab.m.size],
  };
});
def(
  'H.3',
  "the note holds no name, email or number: only the version, user, event, form, the contact's id and the time",
  (M) => {
    const tab = new Mem();
    M.handoff.writeHandoff(tab, note({ form: 'edit:hh1' }));
    const stored = JSON.parse([...tab.m.values()][0]);
    return {
      ok:
        Object.keys(stored).sort().join() === 'at,contactId,eventId,form,userId,v' &&
        stored.v === 1 &&
        stored.form === 'edit:hh1' &&
        stored.at === NOW,
      got: stored,
    };
  }
);
def(
  'H.4',
  'five minutes is the limit: exactly five is read, one millisecond more is ignored',
  (M) => {
    const t = (age: number) => {
      const tab = new Mem();
      M.handoff.writeHandoff(tab, note());
      return M.handoff.takeHandoff(tab, want({ now: NOW + age }));
    };
    const FIVE = 5 * 60 * 1000;
    return {
      ok:
        M.handoff.HANDOFF_TTL_MS === FIVE &&
        t(FIVE)?.contactId === 'c1' &&
        t(FIVE + 1) === null &&
        t(0)?.contactId === 'c1',
      got: [t(FIVE), t(FIVE + 1)],
    };
  }
);
def(
  'H.5',
  'ignored quietly, and the note removed all the same, when it is not for this person, event or form, is stale, or cannot be read',
  (M) => {
    const tried = (mutate: (tab: Mem) => void, w = want()) => {
      const tab = new Mem();
      M.handoff.writeHandoff(tab, note());
      mutate(tab);
      const r = M.handoff.takeHandoff(tab, w);
      return { r, left: tab.m.size };
    };
    const key = M.handoff.handoffKey('user-a', 'ev1');
    const cases = {
      otherForm: tried(() => {}, want({ form: 'host' })),
      otherEditForm: tried(() => {}, want({ form: 'edit:hh2' })),
      old: tried(() => {}, want({ now: NOW + 6 * 60 * 1000 })),
      future: tried(() => {}, want({ now: NOW - 10 * 60 * 1000 })),
      junk: tried((t) => t.m.set(key, 'not json')),
      wrongVersion: tried((t) =>
        t.m.set(
          key,
          JSON.stringify({
            v: 2,
            userId: 'user-a',
            eventId: 'ev1',
            form: 'new',
            contactId: 'c1',
            at: NOW,
          })
        )
      ),
      wrongUser: tried((t) =>
        t.m.set(
          key,
          JSON.stringify({
            v: 1,
            userId: 'user-b',
            eventId: 'ev1',
            form: 'new',
            contactId: 'c1',
            at: NOW,
          })
        )
      ),
      wrongEvent: tried((t) =>
        t.m.set(
          key,
          JSON.stringify({
            v: 1,
            userId: 'user-a',
            eventId: 'ev9',
            form: 'new',
            contactId: 'c1',
            at: NOW,
          })
        )
      ),
      noId: tried((t) =>
        t.m.set(
          key,
          JSON.stringify({
            v: 1,
            userId: 'user-a',
            eventId: 'ev1',
            form: 'new',
            contactId: '',
            at: NOW,
          })
        )
      ),
      notText: tried((t) =>
        t.m.set(
          key,
          JSON.stringify({
            v: 1,
            userId: 'user-a',
            eventId: 'ev1',
            form: 'new',
            contactId: 7,
            at: NOW,
          })
        )
      ),
    };
    const bad = Object.entries(cases).filter(([, v]) => v.r !== null || v.left !== 0);
    return { ok: bad.length === 0, got: bad.map(([k]) => k) };
  }
);
def(
  'H.6',
  'no note for nobody: signed out reads and removes nothing; a store that throws gives null and never throws',
  (M) => {
    const tab = new Mem();
    M.handoff.writeHandoff(tab, note());
    const signedOut = M.handoff.takeHandoff(tab, want({ userId: null }));
    const stillThere = tab.m.size === 1;
    const reads = new Mem();
    reads.failRead = true;
    const a = M.handoff.takeHandoff(reads, want());
    const removes = new Mem();
    M.handoff.writeHandoff(removes, note());
    removes.failRemove = true;
    const b = M.handoff.takeHandoff(removes, want());
    const writes = new Mem();
    writes.failWrite = true;
    const c = M.handoff.writeHandoff(writes, note());
    const d = M.handoff.takeHandoff(null, want());
    const e = M.handoff.writeHandoff(null, note());
    return {
      ok:
        signedOut === null &&
        stillThere &&
        a === null &&
        b === null &&
        c === false &&
        d === null &&
        e === false,
      got: [signedOut, a, b, c, d, e],
    };
  }
);

// ── Run ─────────────────────────────────────────────────────────────────────
function run(id: string, label: string, fn: (M: Mods) => Verdict, M: Mods | null, why: string) {
  try {
    if (!M) throw new Error(why);
    const r = fn(M);
    if (typeof r === 'boolean') report(id, label, r);
    else report(id, label, r.ok, r.got);
  } catch (e) {
    report(id, label, false, `threw: ${String((e as Error).message).slice(0, 200)}`);
  }
}

function main() {
  section('W — the sentences this step adds are the ruled ones (W19, W33 to W35)');
  const W = (() => {
    try {
      return require('../src/lib/contacts/words').CONTACTS_WORDS;
    } catch {
      return {};
    }
  })();
  report(
    'W.1',
    'the ticket section with the ruled W-lines was found',
    wordsSection.length > 2000,
    wordsSection.length
  );
  {
    const wanted: Array<[string, unknown]> = [
      ['W19', W.ADD_TO_HOUSEHOLD],
      ['W33', W.ALREADY_IN_FORM],
      ['W34', W.SAVED_ROW],
      ['W34 second sentence', W.SAVED_ROW_REMOVE],
      ['W35', W.OWN_ROW],
    ];
    const missing = wanted.filter(([, s]) => !ruled(s)).map(([id]) => id);
    report(
      'W.2',
      'W19, W33, W34 (with its second sentence) and W35 are exactly the ruled words',
      missing.length === 0,
      missing
    );
    report(
      'W.3',
      'none has a curly apostrophe',
      Object.values(W as Record<string, unknown>).filter(
        (s) => typeof s === 'string' && /[‘’]/.test(s)
      ).length === 0
    );
  }

  section('M, F, H — the match, the fill and the hand-off note');
  let real: Mods | null = null;
  let why = '';
  try {
    real = loadAll();
  } catch (e) {
    why = String((e as Error).message);
  }
  for (const [id, label, fn] of defs) run(id, label, fn, real, why);

  section('B — break proofs: one rule broken in an in-memory copy, and the named checks go red');
  {
    // [which file, what is wrong, the text it replaces (exactly once), the replacement, checks that go red]
    const faults: Array<[Which, string, string, string, string[]]> = [
      ['match', 'it matches the middle of a word', '.startsWith(qw)', '.includes(qw)', ['M.1']],
      [
        'match',
        'macrons are not ignored',
        ".replace(/[\\u0300-\\u036f]/g, '')",
        '',
        ['M.2', 'M.3', 'M.7'],
      ],
      [
        'match',
        'email and number matches come before names',
        'return [...named, ...other].slice(0, max);',
        'return [...other, ...named].slice(0, max);',
        ['M.1', 'M.4', 'M.6', 'M.8'],
      ],
      [
        'match',
        'seven lines instead of six',
        'export const MAX_LINES = 6;',
        'export const MAX_LINES = 7;',
        ['M.5', 'M.6'],
      ],
      [
        'match',
        'a greyed line loses its reason',
        '...(reason ? { taken: reason } : {})',
        '',
        ['M.6'],
      ],
      [
        'fill',
        "a kid's row gets the number and email too",
        "if (kind === 'kid') return { name: c.name, email: '', phone: '' };",
        '',
        ['F.2'],
      ],
      [
        'handoff',
        'the note lasts fifty minutes',
        'export const HANDOFF_TTL_MS = 5 * 60 * 1000;',
        'export const HANDOFF_TTL_MS = 50 * 60 * 1000;',
        ['H.4', 'H.5'],
      ],
      [
        'handoff',
        'the note is not removed when taken',
        '  if (!removeQuietly(tab, key)) return null;',
        '',
        ['H.2', 'H.5', 'H.6'],
      ],
      [
        'handoff',
        'a note for another person is used',
        'if (n.userId !== want.userId) return null;',
        '',
        ['H.5'],
      ],
    ];
    const wrong: string[] = [];
    for (const [file, what, from, to, red] of faults) {
      const text = SRC[file];
      if (text.split(from).length !== 2) {
        wrong.push(`${what}: its anchor is not in ${FILES[file]} exactly once`);
        continue;
      }
      let broken: Mods;
      try {
        broken = loadAll({ [file]: text.replace(from, () => to) });
      } catch {
        wrong.push(`${what}: the copy did not compile`);
        continue;
      }
      for (const [id, , fn] of defs) {
        if (id === 'M.10') continue; // a scan of the real file's text, not a behaviour of the copy
        let v: string;
        try {
          const r = fn(broken);
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

main();
