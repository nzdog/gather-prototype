/**
 * [[GTC-460]] Stage 3, step 3b — LOADING PEOPLE INTO THE LIST (`src/lib/contacts/load.ts`).
 *
 * WHAT 3b'S LOADING IS, IN PLAIN WORDS. A host pastes a list, or chooses a CSV or vCard file, and the
 * people in it are read in her browser by GTC-448's readers (called here, never changed) and added to
 * her list. This file pins the part with no screen in it: how a file is sent to a reader and refused
 * before it is read; how a load is counted and worded; the cap; loading the same list twice (it
 * doubles, ruling 161); and the three ways forward on a row with a problem (ruling 160) as plain
 * functions. The screen's side of loading is checked in `contacts-page-test.tsx`; the phone's picker
 * in `contacts-picker-test.ts`.
 *
 * WHAT THIS FILE PINS (the plan's `test:contacts-load`, section 8):
 *   W  the load sentences are the ruled ones (W17, W21 to W30, with ruling 159's fix to W27)
 *   D  the limits (file 5 MB, pasted text 100,000 characters) and routing a file to a reader
 *   R  the real readers into the list: paste, CSV, vCard; every flag kept; a flagged number carried
 *      as it is; a person with neither detail loads
 *   S  the summary after a load: the left-out counts, singular and plural; nothing found; the cap;
 *      doubling; an over-long field counted; a failed write adds nothing; no contact content in a
 *      sentence
 *   T  the three ways forward as pure functions (double-check, skip, a different way)
 *   B  break proofs: the same checks run on in-memory copies of load.ts with one rule broken, and
 *      each must go red (no real file is touched)
 *
 * No browser, no database, no network, no server. Nothing is written anywhere. Every store here is
 * an in-memory stand-in. Words are read out of the ticket. Test helpers read text from objects and
 * never strip tags with a regular expression.
 * Run: npx tsx --tsconfig tests/tsconfig.json tests/contacts-load-test.ts  (npm run test:contacts-load)
 */
import fs from 'fs';
import path from 'path';
import { transformSync } from 'esbuild';

const ROOT = path.join(__dirname, '..');
const LOAD = 'src/lib/contacts/load.ts';
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
function check(id: string, label: string, fn: () => Verdict) {
  try {
    const r = fn();
    if (typeof r === 'boolean') report(id, label, r);
    else report(id, label, r.ok, r.got);
  } catch (e) {
    report(id, label, false, `threw: ${String((e as Error).message).slice(0, 200)}`);
  }
}

// ── Reading files ────────────────────────────────────────────────────────────
const read = (rel: string) => {
  try {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
  } catch {
    return '';
  }
};
const flat = (s: string) => s.replace(/\s+/g, ' ');

// ── The ruled words, out of the ticket (section 7 of the Stage 3 plan) ────────
const ticketText = flat(read(TICKET));
const wordsSection = (() => {
  const a = ticketText.indexOf('#### 7. The W-lines, for the founder');
  const b = ticketText.indexOf('#### 8. The tests');
  return a >= 0 && b > a ? ticketText.slice(a, b) : '';
})();
const ruled = (s: unknown) => typeof s === 'string' && wordsSection.includes(`*"${s}"*`);

// ── The module under test, compiled from source text (so a broken copy can be tried) ────
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
const SOURCE = read(LOAD);
function load(text: string): Mod {
  if (!text) throw new Error(`${LOAD} is not there yet`);
  return compile(text);
}
const words = () => require('../src/lib/contacts/words').CONTACTS_WORDS;
const wordFns = () => require('../src/lib/contacts/words');
const store = () => require('../src/lib/contacts/store');
const { WORDS: G448 } = require('../src/lib/contact-import/types');

// ── A browser store in memory, that can be told to fail ──────────────────────
const quotaError = () => {
  const e = new Error('The quota has been exceeded.');
  e.name = 'QuotaExceededError';
  return e;
};
class MemStore {
  m = new Map<string, string>();
  failWrite: false | 'quota' | 'blocked' = false;
  get length() {
    return this.m.size;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    if (this.failWrite === 'quota') throw quotaError();
    if (this.failWrite === 'blocked') throw new Error('blocked');
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}
const USER = 'user-a';
const listOf = (s: MemStore) => store().readContacts(s, USER).contacts as any[];
let idCounter = 0;
const ids = () => `t${++idCounter}`;

// ── Fixtures: the same made-up people in three shapes ────────────────────────
const PASTE = [
  'Mere Tane, 021 555 0147, mere@example.com',
  'Hone Rata, 021 555 0148',
  'Aroha Smith <aroha@example.com>',
  'Brown, Tui, 022 555 0149, tui@example.com',
  'Sam Overseas, +44 20 7946 0958',
  'Bad Email, 021 555 0150, bad@email',
  'Just A Name',
  '021 555 0151, x@y.co',
].join('\n');
const CSV =
  'First Name,Last Name,Email,Phone\nMere,Tane,mere@example.com,021 555 0147\nHone,Rata,,\n,,only@mail.co,021 555 0152\n';
const VCF = [
  'BEGIN:VCARD',
  'VERSION:3.0',
  'FN:Mere Tane',
  'TEL:021 555 0147',
  'EMAIL:mere@example.com',
  'END:VCARD',
  'BEGIN:VCARD',
  'VERSION:3.0',
  'FN:Hone Rata',
  'END:VCARD',
].join('\n');

// ── The checks. Each takes the module, so a broken copy can be tried on all of them ──
const MB5 = 5 * 1024 * 1024;
const defs: Array<[string, string, (L: Mod) => Verdict]> = [];
const def = (id: string, label: string, fn: (L: Mod) => Verdict) => defs.push([id, label, fn]);

// D — the limits, and sending a file to a reader
def('D.1', 'the limits: a file up to 5 MB, pasted text up to 100,000 characters', (L) => ({
  ok:
    L.MAX_FILE_BYTES === MB5 &&
    L.MAX_PASTE_CHARS === 100000 &&
    L.checkPaste('x'.repeat(100000)) === null &&
    L.checkPaste('x'.repeat(100001)) === 'too-long' &&
    L.checkPaste('') === null,
  got: [L.MAX_FILE_BYTES, L.MAX_PASTE_CHARS],
}));
def('D.2', 'a file goes to the CSV or the vCard reader by its name, else by its type', (L) => {
  const route = (name: string, type: string, size = 10) => {
    const r = L.routeFile({ name, type, size });
    return r.kind ?? `refused:${r.refusal}`;
  };
  const got = [
    route('a.csv', 'text/csv'),
    route('A.CSV', ''),
    route('friends.vcf', 'text/vcard'),
    route('ALL.VCF', ''),
    route('export', 'text/csv'),
    route('export', 'text/x-vcard'),
    route('export', 'text/vcard'),
    route('notes.txt', 'text/plain'),
    route('pic.png', 'image/png'),
    route('book.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
    route('', ''),
  ];
  const want = [
    'csv',
    'csv',
    'vcard',
    'vcard',
    'csv',
    'vcard',
    'vcard',
    'refused:wrong-type',
    'refused:wrong-type',
    'refused:wrong-type',
    'refused:wrong-type',
  ];
  return { ok: JSON.stringify(got) === JSON.stringify(want), got };
});
def(
  'D.3',
  'a file over 5 MB is refused before it is read; exactly 5 MB is not; a wrong type is refused first',
  (L) => {
    const r = (name: string, type: string, size: number) => {
      const x = L.routeFile({ name, type, size });
      return x.kind ?? `refused:${x.refusal}`;
    };
    const got = [
      r('a.csv', 'text/csv', MB5),
      r('a.csv', 'text/csv', MB5 + 1),
      r('a.vcf', 'text/vcard', MB5 + 1),
      r('photo.png', 'image/png', MB5 * 10),
      r('empty.csv', 'text/csv', 0),
    ];
    return {
      ok:
        JSON.stringify(got) ===
        JSON.stringify(['csv', 'refused:too-big', 'refused:too-big', 'refused:wrong-type', 'csv']),
      got,
    };
  }
);

// R — the real readers into the list
def(
  'R.1',
  'a pasted list through GTC-448: every flag kept, a flagged number carried as typed, no-detail person loads',
  (L) => {
    const r = L.readText('paste', PASTE, ids);
    const c = r.people.map(L.toContact);
    const byName = (n: string) => c.find((x: any) => x.name === n);
    const sam = byName('Sam Overseas');
    const bad = byName('Bad Email');
    const bare = byName('Just A Name');
    const all448 = Object.values(G448);
    return {
      ok:
        c.length === 7 &&
        r.found === 8 &&
        r.leftOut.noName === 1 &&
        r.tidied === 1 &&
        c.every((x: any, i: number) => x.id === r.people[i].tempId) &&
        sam?.phone === '+44 20 7946 0958' &&
        JSON.stringify(sam?.problems) === JSON.stringify([G448.W2]) &&
        bad?.email === 'bad@email' &&
        JSON.stringify(bad?.problems) === JSON.stringify([G448.W1]) &&
        !!bare &&
        !('email' in bare) &&
        !('phone' in bare) &&
        !('problems' in bare) &&
        !!byName('Tui Brown') &&
        c.every((x: any) => (x.problems ?? []).every((p: string) => all448.includes(p))),
      got: c.map((x: any) => [x.name, x.email, x.phone, x.problems]),
    };
  }
);
def(
  'R.2',
  'a CSV file through GTC-448: the header row skipped, a row with no name counted, not loaded',
  (L) => {
    const r = L.readText('csv', CSV, ids);
    const c = r.people.map(L.toContact);
    return {
      ok:
        c.length === 2 &&
        r.found === 3 &&
        r.leftOut.noName === 1 &&
        c[0].name === 'Mere Tane' &&
        c[0].phone === '+64215550147' &&
        c[1].name === 'Hone Rata' &&
        !('email' in c[1]),
      got: c.map((x: any) => [x.name, x.email, x.phone]),
    };
  }
);
def('R.3', 'a vCard file through GTC-448: a card with no email or number is kept', (L) => {
  const r = L.readText('vcard', VCF, ids);
  const c = r.people.map(L.toContact);
  return {
    ok:
      c.length === 2 &&
      c[0].email === 'mere@example.com' &&
      c[1].name === 'Hone Rata' &&
      !('phone' in c[1]),
    got: c.map((x: any) => [x.name, x.email, x.phone]),
  };
});
def(
  'R.4',
  'the kind decides the reader: the same text read as CSV and as a paste differs; nothing found reads as none',
  (L) => {
    const text = 'First Name,Last Name,Email,Phone\nMere,Tane,mere@example.com,021 555 0147';
    const asCsv = L.readText('csv', text, ids).people[0]?.name;
    const asPaste = L.readText('paste', text, ids).people[0]?.name;
    const asVcard = L.readText('vcard', text, ids);
    const empty = L.readText('paste', '', ids);
    return {
      ok:
        asCsv === 'Mere Tane' &&
        asPaste !== asCsv &&
        asVcard.people.length === 0 &&
        empty.people.length === 0 &&
        empty.found === 0,
      got: [asCsv, asPaste, asVcard.people.length],
    };
  }
);

// S — the summary, the cap, doubling, a failed write
const lines = (L: Mod, s: MemStore, text: string, kind = 'paste') => {
  const r = L.readText(kind, text, ids);
  const out = L.loadPeople(s, USER, r);
  return { out, lines: L.summaryLines(out.summary) as string[] };
};
def(
  'S.1',
  'a load is worded by the ruled sentences: added, names turned round, each left-out count only above zero',
  (L) => {
    const s1 = new MemStore();
    const a = lines(L, s1, PASTE);
    const s2 = new MemStore();
    const b = lines(L, s2, 'Mere Tane, 021 555 0147');
    const s3 = new MemStore();
    const c = lines(L, s3, '021 555 0151, x@y.co\n 022 555 0152, z@y.co');
    const s4 = new MemStore();
    const d = lines(L, s4, '');
    const turned = 'We turned 1 name around from “Last, First” to “First Last”.';
    return {
      ok:
        JSON.stringify(a.lines) ===
          JSON.stringify(['Added 7 people.', turned, '1 had no name, so they were left out.']) &&
        JSON.stringify(b.lines) === JSON.stringify(['Added 1 person.']) &&
        JSON.stringify(c.lines) ===
          JSON.stringify([
            "We couldn't find anyone in that.",
            '2 had no name, so they were left out.',
          ]) &&
        JSON.stringify(d.lines) === JSON.stringify(["We couldn't find anyone in that."]) &&
        listOf(s1).length === 7 &&
        listOf(s3).length === 0,
      got: [a.lines, b.lines, c.lines, d.lines],
    };
  }
);
def(
  'S.2',
  'the other left-out counts, one and many: "couldn\'t be read" and "didn\'t fit" (the ruled W27 words)',
  (L) => {
    const read = (n: number) => ({
      people: new Array(n).fill({}),
      found: n,
      leftOut: { noName: 0, unreadable: 0 },
      tidied: 0,
    });
    const sum = (readUnreadable: number, storeUnreadable: number, didntFit: number, people = 3) => {
      const r = { ...read(people), leftOut: { noName: 0, unreadable: readUnreadable } };
      const w = {
        status: 'ok',
        contacts: [],
        added: people,
        unreadable: storeUnreadable,
        didntFit,
      };
      return L.summaryLines(L.summarise(r, w)) as string[];
    };
    const got = [sum(1, 0, 0), sum(2, 1, 0), sum(0, 0, 1), sum(0, 0, 4), sum(1, 0, 1)];
    const want = [
      ['Added 3 people.', "1 couldn't be read, so it was left out."],
      ['Added 3 people.', "3 couldn't be read, so they were left out."],
      ['Added 3 people.', "1 didn't fit. This page holds up to 2,000 contacts."],
      ['Added 3 people.', "4 didn't fit. This page holds up to 2,000 contacts."],
      [
        'Added 3 people.',
        "1 couldn't be read, so it was left out.",
        "1 didn't fit. This page holds up to 2,000 contacts.",
      ],
    ];
    return { ok: JSON.stringify(got) === JSON.stringify(want), got };
  }
);
def(
  'S.3',
  'under the cap: the people who fit are added and the rest are counted, never dropped silently',
  (L) => {
    const s = new MemStore();
    const seed = Array.from({ length: 1998 }, (_, i) => ({ id: `old${i}`, name: `Old ${i}` }));
    s.m.set(store().contactsKey(USER), JSON.stringify({ v: 1, userId: USER, contacts: seed }));
    const x = lines(L, s, 'A One\nB Two\nC Three\nD Four\nE Five');
    return {
      ok:
        listOf(s).length === 2000 &&
        x.out.summary.added === 2 &&
        x.out.summary.didntFit === 3 &&
        JSON.stringify(x.lines) ===
          JSON.stringify([
            'Added 2 people.',
            "3 didn't fit. This page holds up to 2,000 contacts.",
          ]),
      got: [listOf(s).length, x.lines],
    };
  }
);
def(
  'S.4',
  'loading the same list twice doubles it (ruling 161): no duplicate skipping in Stage 3',
  (L) => {
    const s = new MemStore();
    lines(L, s, PASTE);
    lines(L, s, PASTE);
    const names = listOf(s).map((c: any) => c.name);
    const ids2 = new Set(listOf(s).map((c: any) => c.id));
    return {
      ok:
        names.length === 14 &&
        names.filter((n: string) => n === 'Mere Tane').length === 2 &&
        ids2.size === 14,
      got: names.length,
    };
  }
);
def(
  'S.5',
  'a name over 200, an email over 254 or a number over 40 is left out and counted as "couldn\'t be read"',
  (L) => {
    const s = new MemStore();
    const longName = 'N'.repeat(201);
    const x = lines(L, s, `${longName}, 021 555 0147\nFine Person, 021 555 0148`);
    return {
      ok:
        listOf(s).length === 1 &&
        x.out.summary.unreadable === 1 &&
        x.lines.includes("1 couldn't be read, so it was left out.") &&
        x.lines[0] === 'Added 1 person.',
      got: x.lines,
    };
  }
);
def(
  'S.6',
  'a write that fails adds nothing: full or refused, the list is as it was and the status says which',
  (L) => {
    const full = new MemStore();
    lines(L, full, 'Keep Me, 021 555 0147');
    full.failWrite = 'quota';
    const a = lines(L, full, 'New One, 021 555 0148');
    const refused = new MemStore();
    refused.failWrite = 'blocked';
    const b = lines(L, refused, 'New One, 021 555 0148');
    return {
      ok:
        a.out.written.status === 'full' &&
        b.out.written.status === 'refused' &&
        listOf(full).length === 1 &&
        listOf(refused).length === 0,
      got: [a.out.written.status, b.out.written.status],
    };
  }
);
def('S.7', 'no contact content in any sentence a load or a refusal gives', (L) => {
  const secrets = ['Zelda Qwerty', 'zq.private@example.com', '021 555 0999'];
  const s = new MemStore();
  const x = lines(
    L,
    s,
    `Zelda Qwerty, 021 555 0999, zq.private@example.com\n${'N'.repeat(201)}, 021 555 0147`
  );
  const refusals = ['too-big', 'too-long', 'wrong-type', 'unreadable'].map((r) =>
    L.refusalWords(r)
  );
  const everything = [...x.lines, ...refusals].join(' | ');
  let threw = false;
  try {
    L.readText('paste', undefined as unknown as string, ids);
    L.readText('csv', 42 as unknown as string, ids);
  } catch {
    threw = true;
  }
  return {
    ok:
      secrets.every((t) => !everything.includes(t)) &&
      refusals.every((r) => typeof r === 'string' && r.length > 0) &&
      !threw,
    got: everything.slice(0, 200),
  };
});

// T — the three ways forward, as pure functions (ruling 160)
const flaggedEmail = () => ({
  id: 'c1',
  name: 'Bad Email',
  email: 'bad@email',
  phone: '+64215550150',
  problems: [G448.W1],
});
const overseas = () => ({
  id: 'c2',
  name: 'Sam Overseas',
  phone: '+44 20 7946 0958',
  problems: [G448.W2],
});
const bothBad = () => ({
  id: 'c3',
  name: 'Both Bad',
  email: 'bad@email',
  phone: 'abc',
  problems: [G448.W1, G448.W3],
});
def(
  'T.1',
  'Double-check it: the edited name, email and number are checked again; the sentences follow the details',
  (L) => {
    const fixed = L.doubleCheck(flaggedEmail(), {
      name: 'Bad Email',
      email: 'bad@email.co',
      phone: '+64215550150',
    });
    const stillBad = L.doubleCheck(flaggedEmail(), {
      name: 'Bad Email',
      email: 'nope@x',
      phone: '021 555 0199',
    });
    const nowBad = L.doubleCheck(
      { id: 'c4', name: 'Fine', email: 'fine@x.co' },
      { name: 'Fine', email: 'fine-at-x', phone: '' }
    );
    const blankName = L.doubleCheck(flaggedEmail(), { name: '   ', email: 'a@b.co', phone: '' });
    const cleared = L.doubleCheck(flaggedEmail(), { name: '  Bad   Email ', email: '', phone: '' });
    const oldNote = L.doubleCheck(
      { id: 'c5', name: 'Pat', email: 'p@x.co', problems: [G448.W4, G448.W5] },
      { name: 'Pat', email: 'p@x.co', phone: '' }
    );
    return {
      ok:
        fixed.id === 'c1' &&
        fixed.email === 'bad@email.co' &&
        !('problems' in fixed) &&
        stillBad.email === 'nope@x' &&
        stillBad.phone === '+64215550199' &&
        JSON.stringify(stillBad.problems) === JSON.stringify([G448.W1]) &&
        JSON.stringify(nowBad.problems) === JSON.stringify([G448.W1]) &&
        blankName === null &&
        cleared.name === 'Bad Email' &&
        !('email' in cleared) &&
        !('phone' in cleared) &&
        !('problems' in cleared) &&
        !('problems' in oldNote),
      got: [fixed, stillBad, nowBad, blankName, cleared, oldNote],
    };
  }
);
def(
  'T.2',
  'Skip it: the flagged detail goes, the person and any good detail stay, and the flag goes with it',
  (L) => {
    const a = L.skipIt(flaggedEmail());
    const b = L.skipIt(overseas());
    const c = L.skipIt(bothBad());
    const d = L.skipIt({ id: 'c6', name: 'Only A Note', email: 'o@x.co', problems: [G448.W6] });
    const e = L.skipIt({ id: 'c7', name: 'No Flag', email: 'n@x.co' });
    return {
      ok:
        !('email' in a) &&
        a.phone === '+64215550150' &&
        a.name === 'Bad Email' &&
        !('problems' in a) &&
        !('phone' in b) &&
        b.name === 'Sam Overseas' &&
        !('problems' in b) &&
        !('email' in c) &&
        !('phone' in c) &&
        c.name === 'Both Bad' &&
        !('problems' in c) &&
        d.email === 'o@x.co' &&
        !('problems' in d) &&
        JSON.stringify(e) === JSON.stringify({ id: 'c7', name: 'No Flag', email: 'n@x.co' }),
      got: [a, b, c, d],
    };
  }
);
def(
  'T.3',
  'Use a different way: an email or a number replaces the flagged one; the person stays',
  (L) => {
    const newEmail = L.differentWay(flaggedEmail(), 'Good@Mail.co');
    const newPhoneForBadEmail = L.differentWay(
      { id: 'c8', name: 'No Number', email: 'bad@email', problems: [G448.W1] },
      '021 555 0123'
    );
    const newPhone = L.differentWay(overseas(), '022 555 0124');
    const stillBad = L.differentWay(overseas(), 'abc');
    const blank = L.differentWay(flaggedEmail(), '   ');
    return {
      ok:
        newEmail.email === 'good@mail.co' &&
        newEmail.phone === '+64215550150' &&
        !('problems' in newEmail) &&
        !('email' in newPhoneForBadEmail) &&
        newPhoneForBadEmail.phone === '+64215550123' &&
        !('problems' in newPhoneForBadEmail) &&
        newPhone.phone === '+64225550124' &&
        !('problems' in newPhone) &&
        stillBad.phone === 'abc' &&
        JSON.stringify(stillBad.problems) === JSON.stringify([G448.W3]) &&
        JSON.stringify(blank) === JSON.stringify(flaggedEmail()) &&
        [newEmail, newPhone].every((x: any) => x.name.length > 0),
      got: [newEmail, newPhoneForBadEmail, newPhone, stillBad],
    };
  }
);
def(
  'T.4',
  "none of the three puts contact content into a problem sentence: problems stay GTC-448's own",
  (L) => {
    const all448 = Object.values(G448);
    const outs = [
      L.doubleCheck(flaggedEmail(), { name: 'Secret Person', email: 'secret@x', phone: '999' }),
      L.skipIt(bothBad()),
      L.differentWay(overseas(), 'secret-number'),
    ];
    return {
      ok: outs.every((o: any) => (o.problems ?? []).every((p: string) => all448.includes(p))),
      got: outs.map((o: any) => o.problems),
    };
  }
);

// ── Run: the words, then every check on the real module ─────────────────────
function main() {
  section('W — the load sentences are the ruled ones (W17, W21 to W30)');
  check('W.1', 'the ticket section with the ruled W-lines was found', () => ({
    ok: wordsSection.length > 2000,
    got: wordsSection.length,
  }));
  check(
    'W.2',
    'words.ts says W17 and W21 to W30 exactly as the ticket rules them (singular and plural too)',
    () => {
      const W = words();
      const F = wordFns();
      const wanted: Array<[string, unknown]> = [
        ['W17', W.FULL],
        ['W21 label', W.PASTE_LABEL],
        ['W21 help', W.PASTE_HELP],
        ['W21 button', W.PASTE_BUTTON],
        ['W21 example', W.PASTE_EXAMPLE],
        ['W22 button', W.FILE_BUTTON],
        ['W22 help', W.FILE_HELP],
        ['W43', W.FILE_ODD_LETTERS],
        ['W23', W.PICKER_BUTTON],
        ['W24', W.PICKER_FAILED],
        ['W25', W.LAPTOP_NOTE],
        ['W26 n', F.addedWords(7).replace('7', '{n}')],
        ['W26 one', F.addedWords(1)],
        ['W26 none', W.NOTHING_FOUND],
        ['W27 no name n', F.noNameWords(7).replace('7', '{n}')],
        ['W27 no name one', F.noNameWords(1)],
        ['W27 unreadable n', F.unreadableWords(7).replace('7', '{n}')],
        ['W27 unreadable one', F.unreadableWords(1)],
        ['W27 didnt fit n', F.didntFitWords(7).replace('7', '{n}')],
        ['W27 didnt fit one', F.didntFitWords(1)],
        ['W28 n', F.turnedWords(7).replace('7', '{n}')],
        ['W28 one', F.turnedWords(1)],
        ['W29 too big', W.TOO_BIG],
        ['W29 too long', W.TOO_LONG],
        ['W29 wrong type', W.WRONG_TYPE],
        ['W29 unreadable', W.FILE_UNREADABLE],
        ['W30 care', W.FLAG_CARE],
        ['W30 double-check', W.DOUBLE_CHECK],
        ['W30 skip', W.SKIP_IT],
        ['W30 different', W.DIFFERENT_WAY],
        ['W30 other box', W.FIELD_OTHER],
        ['W30 done', W.DONE],
      ];
      const missing = wanted.filter(([, s]) => !ruled(s)).map(([id]) => id);
      return { ok: missing.length === 0, got: missing };
    }
  );
  check(
    'W.3',
    "the form's own labels Name, Email and Phone are used, and no word has a curly apostrophe",
    () => {
      const W = words();
      const F = wordFns();
      const strings = [
        ...(Object.values(W) as string[]),
        F.addedWords(2),
        F.noNameWords(2),
        F.unreadableWords(2),
        F.didntFitWords(2),
        F.turnedWords(2),
      ];
      return {
        ok:
          W.FIELD_NAME === 'Name' &&
          W.FIELD_EMAIL === 'Email' &&
          W.FIELD_PHONE === 'Phone' &&
          strings.every((s) => !/[‘’]/.test(s)),
        got: [W.FIELD_NAME, W.FIELD_EMAIL, W.FIELD_PHONE],
      };
    }
  );

  check(
    'W.4',
    'W43 (odd letters in a file) holds none of the words the plan bans, and its one digit and one hyphen belong to "UTF-8"',
    () => {
      const w: string = words().FILE_ODD_LETTERS;
      const banned = /\b(by|deadline|until|decide|remind\w*|chase\w*)\b/i.test(w);
      const rest = w.replace('UTF-8', '');
      return {
        ok:
          typeof w === 'string' &&
          w === 'If names show odd letters, save the file as CSV UTF-8 and choose it again.' &&
          !banned &&
          !/[0-9]/.test(rest) &&
          !rest.includes('-') &&
          !/[‘’“”]/.test(w),
        got: w,
      };
    }
  );

  section('D, R, S, T — limits and routing, the real readers, the summary, the three ways forward');
  let real: Mod = null;
  let why = '';
  try {
    real = load(SOURCE);
  } catch (e) {
    why = String((e as Error).message);
  }
  for (const [id, label, fn] of defs) {
    check(id, label, () => {
      if (!real) throw new Error(why);
      return fn(real);
    });
  }

  section(
    'B — break proofs: one rule broken in an in-memory copy of load.ts, and the named checks go red'
  );
  check(
    'B.1',
    'each fault below turns exactly the checks named red and leaves the others green',
    () => {
      // [what is wrong, the text it replaces (exactly once), the replacement, checks that go red]
      const faults: Array<[string, string, string, string[]]> = [
        [
          'the file limit is far too big',
          'export const MAX_FILE_BYTES = 5 * 1024 * 1024;',
          'export const MAX_FILE_BYTES = 50 * 1024 * 1024;',
          ['D.1', 'D.3'],
        ],
        [
          'the paste limit is far too big',
          'export const MAX_PASTE_CHARS = 100000;',
          'export const MAX_PASTE_CHARS = 1000000;',
          ['D.1'],
        ],
        [
          'a file over the limit is not refused',
          "if (size > MAX_FILE_BYTES) return { refusal: 'too-big' };",
          "if (size > MAX_FILE_BYTES * 100) return { refusal: 'too-big' };",
          ['D.3'],
        ],
        [
          'Skip it keeps the flagged email',
          "const email = c.email && checkEmail(c.email).kind === 'ok' ? c.email : undefined;",
          'const email = c.email;',
          ['T.2'],
        ],
        [
          'Double-check it does not check again',
          'const problems = recheck({ email, phone });',
          'const problems = c.problems ?? [];',
          ['T.1'],
        ],
        [
          'a different way keeps a flagged detail of the other kind',
          'const dropOther = true;',
          'const dropOther = false;',
          ['T.3'],
        ],
        [
          'a count is shown at zero',
          'if (s.noName > 0) out.push(noNameWords(s.noName));',
          'if (s.noName >= 0) out.push(noNameWords(s.noName));',
          ['S.1', 'S.2', 'S.3'],
        ],
        [
          'the people who do not fit are not counted',
          'didntFit: written.didntFit,',
          'didntFit: 0,',
          ['S.2', 'S.3'],
        ],
      ];
      const wrong: string[] = [];
      for (const [what, from, to, red] of faults) {
        if (SOURCE.split(from).length !== 2) {
          wrong.push(`${what}: its anchor is not in load.ts exactly once`);
          continue;
        }
        let broken: Mod;
        try {
          broken = load(SOURCE.replace(from, () => to));
        } catch (e) {
          wrong.push(`${what}: the copy did not compile`);
          continue;
        }
        for (const [id, , fn] of defs) {
          let v: string;
          try {
            const r = fn(broken);
            v = (typeof r === 'boolean' ? r : r.ok) ? 'green' : 'red';
          } catch {
            v = 'red'; // a check that crashes is a red check
          }
          const want = red.includes(id) ? 'red' : 'green';
          if (v !== want) wrong.push(`${what}: ${id} was ${v}, wanted ${want}`);
        }
      }
      return { ok: wrong.length === 0, got: wrong.slice(0, 6) };
    }
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
