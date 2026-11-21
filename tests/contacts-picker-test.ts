/**
 * [[GTC-460]] Stage 3, step 3b — THE PHONE'S OWN CONTACT PICKER, WITH A PRETEND PICKER (ruling 158).
 *
 * WHAT THE PICKER IS, IN PLAIN WORDS. Chrome on an Android phone can show the phone's own contact
 * chooser to a page, if the page asks inside a tap, on a secure page. The host chooses people, the
 * browser hands back their names, emails and numbers, and Gather turns them into the same kind of
 * people the three readers make (so they are flagged the same way). On an iPhone and on a laptop the
 * feature is not there, and the page must stay quietly out of the way. Ruling 158: build it, and
 * prove it with a pretend picker. THE PICKER'S USE ON A REAL ANDROID PHONE IS UNPROVEN: nothing here
 * touches a real phone, its own permission sheet, or the data a real phone returns.
 *
 * WHAT THIS FILE PINS (the plan's `test:contacts-picker`, section 8, the parts with no screen):
 *   P  detection on every shape, never throwing; the call (exact arguments, made before any wait, once
 *      per press); the results through GTC-448's `makeContact`, so a twelve-person fixture gives the
 *      same people and problems as `readPaste` on the equivalent lines; the ways it ends (cancelled
 *      says nothing, failed says it failed, anything odd is a failure); the cap; nothing escapes
 *   B  break proofs: the same checks on in-memory copies of the two files with one rule broken, and
 *      each must go red (no real file is touched)
 * What the screen does with it (no button where it is not there, the button disabled while one is
 * open, W24, W16 and W17) is pinned in `contacts-page-test.tsx`, where the screen harness lives.
 *
 * No browser, no database, no network. Nothing is written anywhere.
 * Run: npx tsx --tsconfig tests/tsconfig.json tests/contacts-picker-test.ts  (npm run test:contacts-picker)
 */
import fs from 'fs';
import path from 'path';
import { transformSync } from 'esbuild';

const ROOT = path.join(__dirname, '..');
const PICKER = 'src/lib/contacts/picker.ts';
const READ_PICKED = 'src/lib/contacts/read-picked.ts';

// ── Reporting; and a spy on anything that could leave the page ────────────────
let passed = 0;
let failed = 0;
let inside = 0;
let escapes = 0;
const say = console.log.bind(console);
for (const k of ['log', 'info', 'warn', 'error', 'debug', 'trace'] as const) {
  (console as any)[k] = (...a: unknown[]) => {
    if (inside > 0) escapes++;
    else if (k === 'log') say(...a);
  };
}
let fetchCalls = 0;
(globalThis as any).fetch = () => {
  fetchCalls++;
  return Promise.reject(new Error('the picker must not call fetch'));
};
function report(id: string, label: string, ok: boolean, got?: unknown) {
  if (ok) {
    passed++;
    say(`\x1b[32m✓\x1b[0m ${id} ${label}`);
  } else {
    failed++;
    say(`\x1b[31m✗\x1b[0m ${id} ${label}`);
    if (got !== undefined) say(`    got: ${String(JSON.stringify(got)).slice(0, 300)}`);
  }
}
const section = (s: string) => say(`\n\x1b[1m\x1b[33m${s}\x1b[0m`);
type Verdict = boolean | { ok: boolean; got?: unknown };

// ── The modules under test, compiled from source text (so a broken copy can be tried) ────
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
const readFile = (rel: string) => {
  try {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
  } catch {
    return '';
  }
};
const SRC = { picker: readFile(PICKER), rp: readFile(READ_PICKED) };
function loadBoth(over: Partial<typeof SRC> = {}): { picker: Mod; rp: Mod } {
  const t = { ...SRC, ...over };
  if (!t.picker) throw new Error(`${PICKER} is not there yet`);
  if (!t.rp) throw new Error(`${READ_PICKED} is not there yet`);
  return { picker: compile(t.picker), rp: compile(t.rp) };
}

// ── A pretend phone ──────────────────────────────────────────────────────────
type Call = { props: unknown; options: unknown; self: unknown };
/** A `window`-shaped thing whose `navigator.contacts.select` records its calls and returns what was scripted. */
function phone(script: (calls: Call[]) => unknown, over: Record<string, unknown> = {}) {
  const calls: Call[] = [];
  const contacts = {
    select(this: unknown, props: unknown, options: unknown) {
      calls.push({ props, options, self: this });
      return script(calls);
    },
  };
  const env: any = {
    navigator: { contacts },
    ContactsManager: function ContactsManager() {},
    isSecureContext: true,
    ...over,
  };
  return { env, calls, contacts };
}
const ok = (v: unknown) => Promise.resolve(v);
const nope = (v: unknown) => Promise.reject(v);
const named = (name: string) => {
  const e = new Error('x');
  e.name = name;
  return e;
};

// ── Twelve people, as the picker hands them back, and the same people as pasted lines ────
const LONG = 'N'.repeat(201);
const PICKED: unknown[] = [
  { name: ['Mere Tane'], email: ['mere@example.com'], tel: ['021 555 0147'] },
  { name: ['Hone Rata'], tel: ['021 555 0148'] },
  { name: ['Bad Email'], email: ['bad@email'], tel: ['021 555 0150'] },
  { name: ['Sam Overseas'], tel: ['+44 20 7946 0958'] },
  { name: ['Two Emails'], email: ['one@example.com', 'two@example.com'], tel: ['021 555 0153'] },
  { name: ['Two Numbers'], email: ['n@example.com'], tel: ['021 555 0154', '021 555 0155'] },
  { name: [], email: ['noname@example.com'], tel: [] },
  { name: ['Just A Name'], email: [], tel: [] },
  { name: ['Smith, John'], tel: ['021 555 0156'] },
  { name: ['Blank Values'], email: ['   '], tel: [''] },
  {},
  { name: [LONG], tel: ['021 555 0157'] },
];
const AS_PASTE = [
  'Mere Tane, 021 555 0147, mere@example.com',
  'Hone Rata, 021 555 0148',
  'Bad Email, 021 555 0150, bad@email',
  'Sam Overseas, +44 20 7946 0958',
  'Two Emails, one@example.com, two@example.com, 021 555 0153',
  'Two Numbers, n@example.com, 021 555 0154, 021 555 0155',
  'noname@example.com',
  'Just A Name',
  'Smith, John, 021 555 0156',
  'Blank Values',
  `${LONG}, 021 555 0157`,
].join('\n');
let counter = 0;
const newId = () => `p${++counter}`;
const shape = (people: any[]) =>
  people.map((p) => [p.name, p.email ?? null, p.phone ?? null, p.problems]);

// ── The checks. Each takes both modules, so a broken copy can be tried on all of them ──
type Mods = { picker: Mod; rp: Mod };
const defs: Array<[string, string, (M: Mods) => Verdict | Promise<Verdict>]> = [];
const def = (id: string, label: string, fn: (M: Mods) => Verdict | Promise<Verdict>) =>
  defs.push([id, label, fn]);

def(
  'P.1',
  'detection: there only when select is a function, the manager exists and the page is secure; never throws',
  (M) => {
    const there = (env: unknown) => M.picker.pickerAvailable(env);
    const noSelect: any = phone(() => ok([])).env;
    noSelect.navigator.contacts = {};
    const throwing: any = {};
    Object.defineProperty(throwing, 'navigator', {
      get() {
        throw new Error('blocked');
      },
    });
    const got = {
      android: there(phone(() => ok([])).env),
      laptop: there({ navigator: {}, isSecureContext: true }),
      iphone: there({ navigator: { userAgent: 'iPhone' }, isSecureContext: true }),
      insecure: there(phone(() => ok([]), { isSecureContext: false }).env),
      secureUnset: there(phone(() => ok([]), { isSecureContext: undefined }).env),
      noManager: there(phone(() => ok([]), { ContactsManager: undefined }).env),
      noSelect: there(noSelect),
      noNavigator: there({ ContactsManager: function () {}, isSecureContext: true }),
      nothing: there(undefined),
      nul: there(null),
      throws: there(throwing),
    };
    const want = {
      android: true,
      laptop: false,
      iphone: false,
      insecure: false,
      secureUnset: false,
      noManager: false,
      noSelect: false,
      noNavigator: false,
      nothing: false,
      nul: false,
      throws: false,
    };
    return { ok: JSON.stringify(got) === JSON.stringify(want), got };
  }
);
def(
  'P.2',
  'the call: exactly select(["name","email","tel"], {multiple:true}), made before any wait, once per press, on the contacts object',
  async (M) => {
    const p = phone(() => ok([]));
    const pending = M.picker.pickPeople(p.env, newId);
    const beforeAwait = p.calls.length; // pickPeople has not been awaited yet
    await pending;
    const c = p.calls[0];
    return {
      ok:
        beforeAwait === 1 &&
        p.calls.length === 1 &&
        JSON.stringify(c.props) === JSON.stringify(['name', 'email', 'tel']) &&
        JSON.stringify(c.options) === JSON.stringify({ multiple: true }) &&
        c.self === p.contacts,
      got: { beforeAwait, calls: p.calls.length, props: c?.props, options: c?.options },
    };
  }
);
def(
  'P.3',
  'the results go through makeContact: twelve people give the same people and problems as readPaste on the same lines',
  (M) => {
    const { readPaste } = require('../src/lib/contact-import/read-paste');
    const picked = M.rp.readPicked(PICKED, newId);
    const pasted = readPaste(AS_PASTE, { newId });
    const a = JSON.stringify(shape(picked.people));
    const b = JSON.stringify(shape(pasted.people));
    return {
      ok:
        a === b &&
        picked.people.length === 10 &&
        picked.found === pasted.found &&
        picked.leftOut.noName === pasted.leftOut.noName &&
        picked.leftOut.noName === 1 &&
        picked.tidied === pasted.tidied &&
        picked.tidied === 1 &&
        picked.people.some((p: any) => p.name === 'John Smith') &&
        picked.people.every((p: any) => typeof p.tempId === 'string' && p.tempId.length > 0),
      got: {
        picked: picked.people.length,
        pasted: pasted.people.length,
        found: [picked.found, pasted.found],
      },
    };
  }
);
def(
  'P.4',
  'it ends in one of three ways: people picked; cancelled (an empty list, says nothing); failed (anything else)',
  async (M) => {
    const end = async (script: () => unknown) =>
      (await M.picker.pickPeople(phone(script).env, newId)).kind;
    const syncThrow = phone(() => {
      throw new TypeError('select is not allowed here');
    }).env;
    const got = {
      picked: await end(() => ok([{ name: ['A B'], tel: ['021 555 0100'] }])),
      cancelled: await end(() => ok([])),
      invalidState: await end(() => nope(named('InvalidStateError'))),
      security: await end(() => nope(named('SecurityError'))),
      notAllowed: await end(() => nope(named('NotAllowedError'))),
      typeError: await end(() => nope(new TypeError('x'))),
      aString: await end(() => nope('no thanks')),
      undef: await end(() => nope(undefined)),
      syncThrow: (await M.picker.pickPeople(syncThrow, newId)).kind,
      notAList: await end(() => ok('not a list')),
      nothingBack: await end(() => ok(undefined)),
    };
    const want = {
      picked: 'picked',
      cancelled: 'cancelled',
      invalidState: 'failed',
      security: 'failed',
      notAllowed: 'failed',
      typeError: 'failed',
      aString: 'failed',
      undef: 'failed',
      syncThrow: 'failed',
      notAList: 'failed',
      nothingBack: 'failed',
    };
    return { ok: JSON.stringify(got) === JSON.stringify(want), got };
  }
);
def(
  'P.5',
  'odd results never throw: people that are not people are ignored, and what is picked carries through',
  async (M) => {
    const odd = M.rp.readPicked(
      [
        null,
        5,
        'a',
        [],
        { name: 'Plain String' },
        { name: [7, null, ' Real Name '], tel: [null, '021 555 0100'] },
      ],
      newId
    );
    const notList = M.rp.readPicked('x', newId);
    const r = await M.picker.pickPeople(phone(() => ok(PICKED)).env, newId);
    return {
      ok:
        odd.people.map((p: any) => p.name).join('|') === 'Plain String|Real Name' &&
        notList.people.length === 0 &&
        notList.found === 0 &&
        r.kind === 'picked' &&
        r.read.people.length === 10,
      got: [odd.people.map((p: any) => p.name), r.kind],
    };
  }
);
def(
  'P.6',
  'a pick that passes the cap: the people who fit are added and the rest are counted; a full or refusing store adds nothing',
  async (M) => {
    const { loadPeople, summaryLines } = require('../src/lib/contacts/load');
    const { contactsKey, readContacts } = require('../src/lib/contacts/store');
    const mem = (fail?: 'quota' | 'blocked') => {
      const m = new Map<string, string>();
      return {
        m,
        get length() {
          return m.size;
        },
        key: (i: number) => [...m.keys()][i] ?? null,
        getItem: (k: string) => m.get(k) ?? null,
        setItem(k: string, v: string) {
          if (fail === 'quota') {
            const e = new Error('The quota has been exceeded.');
            e.name = 'QuotaExceededError';
            throw e;
          }
          if (fail) throw new Error('blocked');
          m.set(k, v);
        },
        removeItem: (k: string) => void m.delete(k),
      };
    };
    const many = Array.from({ length: 2100 }, (_, i) => ({
      name: [`Person ${i}`],
      tel: ['021 555 0100'],
    }));
    const store = mem();
    const r = await M.picker.pickPeople(phone(() => ok(many)).env, newId);
    const done = loadPeople(store, 'u1', r.read);
    const full = loadPeople(mem('quota'), 'u1', M.rp.readPicked(PICKED, newId));
    const refused = loadPeople(mem('blocked'), 'u1', M.rp.readPicked(PICKED, newId));
    return {
      ok:
        readContacts(store, 'u1').contacts.length === 2000 &&
        done.summary.added === 2000 &&
        done.summary.didntFit === 100 &&
        summaryLines(done.summary).includes(
          "100 didn't fit. This page holds up to 2,000 contacts."
        ) &&
        full.written.status === 'full' &&
        full.written.added === 0 &&
        refused.written.status === 'refused' &&
        refused.written.added === 0 &&
        contactsKey('u1').length > 0,
      got: [done.summary.added, done.summary.didntFit, full.written.status, refused.written.status],
    };
  }
);
def(
  'P.7',
  'nothing escapes: no console call and no request in any of the above, and none in the source',
  () => {
    const src = SRC.picker + SRC.rp;
    const banned = [
      'fetch(',
      'XMLHttpRequest',
      'sendBeacon',
      'console.',
      'innerHTML',
      'eval(',
      'new RegExp',
      'localStorage',
      'sessionStorage',
    ];
    const hits = banned.filter((b) => src.includes(b));
    return {
      ok: hits.length === 0 && src.length > 0 && escapes === 0 && fetchCalls === 0,
      got: { hits, escapes, fetchCalls },
    };
  }
);

// ── Run ─────────────────────────────────────────────────────────────────────
async function runAll(
  id: string,
  label: string,
  fn: (M: Mods) => Verdict | Promise<Verdict>,
  M: Mods | null,
  why: string
) {
  inside++;
  try {
    if (!M) throw new Error(why);
    const r = await fn(M);
    if (typeof r === 'boolean') report(id, label, r);
    else report(id, label, r.ok, r.got);
  } catch (e) {
    report(id, label, false, `threw: ${String((e as Error).message).slice(0, 200)}`);
  } finally {
    inside--;
  }
}

async function main() {
  section('P — the pretend picker: detection, the call, the results, the ways it ends');
  let real: Mods | null = null;
  let why = '';
  try {
    real = loadBoth();
  } catch (e) {
    why = String((e as Error).message);
  }
  for (const [id, label, fn] of defs) await runAll(id, label, fn, real, why);

  section('B — break proofs: one rule broken in an in-memory copy, and the named checks go red');
  inside++;
  let wrong: string[] = [];
  try {
    // [which file, what is wrong, the text it replaces (exactly once), the replacement, checks that go red]
    const faults: Array<['picker' | 'rp', string, string, string, string[]]> = [
      [
        'picker',
        'the picker shows on an insecure page',
        'e.isSecureContext === true',
        'true',
        ['P.1'],
      ],
      [
        'picker',
        'it asks for the name and number only',
        "export const PICK_PROPERTIES = ['name', 'email', 'tel'];",
        "export const PICK_PROPERTIES = ['name', 'tel'];",
        ['P.2'],
      ],
      [
        'picker',
        'it waits before it asks (the browser would refuse)',
        '    pending = env.navigator.contacts.select(PICK_PROPERTIES, PICK_OPTIONS);',
        '    await Promise.resolve();\n    pending = env.navigator.contacts.select(PICK_PROPERTIES, PICK_OPTIONS);',
        ['P.2'],
      ],
      [
        'picker',
        'a cancelled pick is called a failure',
        "if (results.length === 0) return { kind: 'cancelled' };",
        "if (results.length === 0) return { kind: 'failed' };",
        ['P.4'],
      ],
      [
        'picker',
        'a refused pick is called cancelled',
        '    results = await pending;',
        '    results = await (pending as Promise<unknown>).catch(() => []);',
        ['P.4'],
      ],
      ['rp', '"Smith, John" is not turned round', 'tidy: true,', 'tidy: false,', ['P.3']],
    ];
    for (const [file, what, from, to, red] of faults) {
      const text = SRC[file];
      if (text.split(from).length !== 2) {
        wrong.push(
          `${what}: its anchor is not in ${file === 'rp' ? 'read-picked.ts' : 'picker.ts'} exactly once`
        );
        continue;
      }
      let broken: Mods;
      try {
        broken = loadBoth({ [file]: text.replace(from, () => to) });
      } catch {
        wrong.push(`${what}: the copy did not compile`);
        continue;
      }
      for (const [id, , fn] of defs) {
        if (id === 'P.7') continue; // a source scan and a spy, not a behaviour of the copy
        let v: string;
        try {
          const r = await fn(broken);
          v = (typeof r === 'boolean' ? r : r.ok) ? 'green' : 'red';
        } catch {
          v = 'red'; // a check that crashes is a red check
        }
        const want = red.includes(id) ? 'red' : 'green';
        if (v !== want) wrong.push(`${what}: ${id} was ${v}, wanted ${want}`);
      }
    }
  } catch (e) {
    wrong = [`the break proofs could not run: ${String((e as Error).message).slice(0, 120)}`];
  } finally {
    inside--;
  }
  report(
    'B.1',
    'each fault turns exactly the checks named red and leaves the others green',
    wrong.length === 0,
    wrong.slice(0, 6)
  );

  say(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  say(String(e));
  process.exit(1);
});
