/**
 * [[GTC-460]] Stage 3, step 3a — THE CONTACTS LIST KEPT IN THIS BROWSER (`src/lib/contacts/store.ts`).
 *
 * WHAT THE STORE IS, IN PLAIN WORDS. A host loads a list of people (3b) so she can pick them as she
 * types a household (3c). The list lives in HER browser, under her sign-in, and nowhere else: no
 * server, no database. It survives sign-out and carries across her events. Another person who signs
 * in on the same device does not see it (hidden, not deleted). Rulings 36, 38 and 155; plan section 5.
 *
 * WHAT THIS FILE PINS (the plan's `test:contacts-store`, section 8):
 *   K  the keys: the three prefixes, and that none can be taken by `sweepDrafts`, which clears
 *      household drafts on every page load
 *   L  one list per person; another person's list hidden and not deleted; signed out shows nothing
 *      and touches nothing; a corrupt, old or other person's value is ignored without a throw
 *   C  the cap (2,000 people) and the length clamps (name 200, email 254, number 40)
 *   F  storage that throws on read, on write, or is full: "refused" or "full", and nothing changes;
 *      a write is whole or nothing
 *   R  remove one; Clear drops the list, the placements and the hand-off, and only mine
 *   B  break proofs: the same checks run on in-memory copies of store.ts with one rule broken, and
 *      each must go red (no real file is touched)
 *
 * No browser, no database, no network, no server. Every store here is an in-memory stand-in.
 * Run: npx tsx --tsconfig tests/tsconfig.json tests/contacts-store-test.ts  (npm run test:contacts-store)
 */
import fs from 'fs';
import path from 'path';
import { transformSync } from 'esbuild';
import { DRAFT_PREFIX, sweepDrafts } from '../src/lib/households/form-draft';

const ROOT = path.join(__dirname, '..');
const STORE = 'src/lib/contacts/store.ts';

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

// ── A browser store in memory, that can be told to fail ──────────────────────
const quotaError = () => {
  const e = new Error('The quota has been exceeded.');
  e.name = 'QuotaExceededError';
  return e;
};
class MemStore {
  m = new Map<string, string>();
  /** Every method call, so "signed out touches nothing" can be shown. */
  calls = 0;
  failRead = false;
  failWrite: false | 'quota' | 'blocked' = false;
  failRemove = false;
  /** A value longer than this is refused as "full" (a small disk). */
  maxValue = Infinity;
  get length() {
    this.calls++;
    if (this.failRead) throw new Error('blocked');
    return this.m.size;
  }
  key(i: number) {
    this.calls++;
    if (this.failRead) throw new Error('blocked');
    return [...this.m.keys()][i] ?? null;
  }
  getItem(k: string) {
    this.calls++;
    if (this.failRead) throw new Error('blocked');
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.calls++;
    if (this.failWrite === 'quota' || v.length > this.maxValue) throw quotaError();
    if (this.failWrite === 'blocked') throw new Error('SecurityError');
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.calls++;
    if (this.failRemove) throw new Error('blocked');
    this.m.delete(k);
  }
  snapshot() {
    return JSON.stringify([...this.m.entries()].sort());
  }
}

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
function readSource(): string {
  try {
    return fs.readFileSync(path.join(ROOT, STORE), 'utf8');
  } catch {
    return '';
  }
}
const SOURCE = readSource();
function load(text: string): { mod: Mod | null; why: string } {
  if (!text) return { mod: null, why: `${STORE} is not there yet` };
  try {
    return { mod: compile(text), why: '' };
  } catch (e) {
    return {
      mod: null,
      why: `${STORE} did not compile: ${String((e as Error).message).slice(0, 120)}`,
    };
  }
}

// ── People to put in a list ──────────────────────────────────────────────────
const person = (i: number, over: Record<string, unknown> = {}) => ({
  id: `c${i}`,
  name: `Person ${i}`,
  email: `p${i}@example.com`,
  phone: `021 555 ${String(1000 + i).slice(-4)}`,
  ...over,
});
const people = (n: number, from = 1) => Array.from({ length: n }, (_, i) => person(from + i));
const KEY_A = (mod: Mod) => mod.contactsKey('user-a');

// ── The checks: each takes the module, so a broken copy can be run through the same list ────
type Check = {
  id: string;
  label: string;
  run: (mod: Mod) => boolean | { ok: boolean; got?: unknown };
};
const CHECKS: Check[] = [
  // K — the keys
  {
    id: 'K1',
    label:
      'the list is one value under gather:contacts:v1:<user id>; the three prefixes are the ruled ones',
    run: (m) =>
      m.contactsKey('user-a') === 'gather:contacts:v1:user-a' &&
      m.CONTACTS_PREFIX === 'gather:contacts:' &&
      m.PLACED_PREFIX === 'gather:contact-placed:' &&
      m.HANDOFF_PREFIX === 'gather:contact-handoff:',
  },
  {
    id: 'K2',
    label:
      'no prefix starts with the draft prefix, none starts with another, and the draft prefix starts with none',
    run: (m) => {
      const ps: string[] = [m.CONTACTS_PREFIX, m.PLACED_PREFIX, m.HANDOFF_PREFIX];
      const clash = ps.some(
        (p, i) =>
          p.startsWith(DRAFT_PREFIX) ||
          DRAFT_PREFIX.startsWith(p) ||
          ps.some((q, j) => i !== j && (p.startsWith(q) || q.startsWith(p)))
      );
      return { ok: !clash, got: ps };
    },
  },
  {
    id: 'K3',
    label:
      'sweepDrafts, run signed in, signed out and as someone else, leaves every contacts, placement and hand-off key where it was',
    run: (m) => {
      const keys = (s: MemStore) =>
        [...s.m.keys()].filter((k) => !k.startsWith(DRAFT_PREFIX)).sort();
      const outcomes: unknown[] = [];
      let allKept = true;
      for (const viewer of ['user-a', null, 'user-b'] as const) {
        const s = new MemStore();
        s.setItem(m.contactsKey('user-a'), '{"kept":1}');
        s.setItem(m.contactsKey('user-b'), '{"kept":2}');
        s.setItem(`${m.PLACED_PREFIX}v1:user-a:ev1`, '[]');
        s.setItem(`${m.HANDOFF_PREFIX}v1:user-a:ev1`, '{}');
        // A draft that is not the viewer's: the sweep must take THIS (it proves the sweep ran).
        s.setItem(`${DRAFT_PREFIX}v1:user-z:ev1:new`, '{}');
        const before = keys(s);
        const gone = sweepDrafts(s, viewer);
        const after = keys(s);
        outcomes.push({ viewer, gone, same: JSON.stringify(before) === JSON.stringify(after) });
        if (gone !== 1 || JSON.stringify(before) !== JSON.stringify(after)) allKept = false;
      }
      return { ok: allKept, got: outcomes };
    },
  },
  // L — one list per person
  {
    id: 'L1',
    label: 'an empty browser reads as an empty list, status ok',
    run: (m) => {
      const r = m.readContacts(new MemStore(), 'user-a');
      return r.status === 'ok' && Array.isArray(r.contacts) && r.contacts.length === 0;
    },
  },
  {
    id: 'L2',
    label: 'people added are read back, in order, and the count is the list',
    run: (m) => {
      const s = new MemStore();
      const w = m.addContacts(s, 'user-a', people(3));
      const r = m.readContacts(s, 'user-a');
      return (
        w.status === 'ok' &&
        w.added === 3 &&
        r.contacts.map((c: any) => c.id).join() === 'c1,c2,c3' &&
        r.contacts[1].name === 'Person 2' &&
        r.contacts[1].email === 'p2@example.com' &&
        r.contacts.length === w.contacts.length
      );
    },
  },
  {
    id: 'L3',
    label: 'the list is one stored value, written whole, carrying its version and its owner',
    run: (m) => {
      const s = new MemStore();
      m.addContacts(s, 'user-a', people(3));
      const raw = s.m.get(KEY_A(m));
      const v = raw ? JSON.parse(raw) : null;
      return {
        ok: s.m.size === 1 && !!v && v.v === 1 && v.userId === 'user-a' && v.contacts.length === 3,
        got: [...s.m.keys()],
      };
    },
  },
  {
    id: 'L4',
    label: "another person's list is hidden from me and is not deleted",
    run: (m) => {
      const s = new MemStore();
      m.addContacts(s, 'user-a', people(2));
      m.addContacts(s, 'user-b', people(1, 50));
      const a = m
        .readContacts(s, 'user-a')
        .contacts.map((c: any) => c.id)
        .join();
      const b = m
        .readContacts(s, 'user-b')
        .contacts.map((c: any) => c.id)
        .join();
      const before = s.snapshot();
      m.readContacts(s, 'user-c');
      return (
        a === 'c1,c2' &&
        b === 'c50' &&
        s.snapshot() === before &&
        m.readContacts(s, 'user-c').contacts.length === 0
      );
    },
  },
  {
    id: 'L5',
    label:
      'signed out (no user id) shows nothing, deletes nothing, writes nothing and does not touch the store',
    run: (m) => {
      const s = new MemStore();
      m.addContacts(s, 'user-a', people(2));
      const before = s.snapshot();
      const calls = s.calls;
      const r = m.readContacts(s, null);
      const w = m.addContacts(s, null, people(1, 9));
      const x = m.removeContact(s, null, 'c1');
      const c = m.clearContacts(s, new MemStore(), null);
      return {
        ok:
          r.status === 'signed-out' &&
          r.contacts.length === 0 &&
          w.status === 'signed-out' &&
          x.status === 'signed-out' &&
          c.status === 'signed-out' &&
          s.snapshot() === before &&
          s.calls === calls,
        got: [r.status, w.status, x.status, c.status, s.calls - calls],
      };
    },
  },
  {
    id: 'L6',
    label:
      "a corrupt, old-version, other person's or oddly shaped value is ignored without a throw",
    run: (m) => {
      const key = KEY_A(m);
      const good = JSON.stringify({ v: 1, userId: 'user-a', contacts: people(1) });
      const cases: Array<[string, string]> = [
        ['not json', '{{{'],
        ['null', 'null'],
        ['a number', '7'],
        ['old version', JSON.stringify({ v: 0, userId: 'user-a', contacts: people(1) })],
        ['future version', JSON.stringify({ v: 2, userId: 'user-a', contacts: people(1) })],
        ['other person', JSON.stringify({ v: 1, userId: 'user-b', contacts: people(1) })],
        ['contacts not a list', JSON.stringify({ v: 1, userId: 'user-a', contacts: 'x' })],
      ];
      const bad: string[] = [];
      for (const [name, raw] of cases) {
        const s = new MemStore();
        s.m.set(key, raw);
        try {
          const r = m.readContacts(s, 'user-a');
          if (!(r.status === 'ok' && r.contacts.length === 0)) bad.push(name);
        } catch {
          bad.push(`${name} (threw)`);
        }
      }
      // One bad entry among good ones: only the bad one goes.
      const s2 = new MemStore();
      s2.m.set(
        key,
        JSON.stringify({
          v: 1,
          userId: 'user-a',
          contacts: [person(1), { id: 'x' }, 5, person(2, { name: 7 })],
        })
      );
      const r2 = m.readContacts(s2, 'user-a');
      const s3 = new MemStore();
      s3.m.set(key, good);
      return {
        ok:
          bad.length === 0 &&
          r2.contacts.map((c: any) => c.id).join() === 'c1' &&
          m.readContacts(s3, 'user-a').contacts.length === 1,
        got: bad,
      };
    },
  },
  // C — the cap and the clamps
  {
    id: 'C1',
    label:
      'the cap is 2,000 people: those that fit are added, the rest counted, nothing dropped silently',
    run: (m) => {
      const s = new MemStore();
      const first = m.addContacts(s, 'user-a', people(1995));
      const second = m.addContacts(s, 'user-a', people(10, 5000));
      const r = m.readContacts(s, 'user-a');
      return {
        ok:
          m.MAX_CONTACTS === 2000 &&
          first.added === 1995 &&
          second.added === 5 &&
          second.didntFit === 5 &&
          r.contacts.length === 2000 &&
          r.contacts[1999].id === 'c5004',
        got: [m.MAX_CONTACTS, first.added, second.added, second.didntFit, r.contacts.length],
      };
    },
  },
  {
    id: 'C2',
    label:
      'a name over 200 characters, an email over 254 or a number over 40 is left out and counted; at the limit is fine',
    run: (m) => {
      const s = new MemStore();
      const ok = m.addContacts(s, 'user-a', [
        person(1, { name: 'n'.repeat(200) }),
        person(2, { email: `${'e'.repeat(242)}@example.com` }),
        person(3, { phone: '0'.repeat(40) }),
      ]);
      const over = m.addContacts(s, 'user-a', [
        person(4, { name: 'n'.repeat(201) }),
        person(5, { email: `${'e'.repeat(243)}@example.com` }),
        person(6, { phone: '0'.repeat(41) }),
      ]);
      return {
        ok:
          m.MAX_NAME === 200 &&
          m.MAX_EMAIL === 254 &&
          m.MAX_PHONE === 40 &&
          ok.added === 3 &&
          over.added === 0 &&
          over.unreadable === 3 &&
          m.readContacts(s, 'user-a').contacts.length === 3,
        got: [ok.added, over.added, over.unreadable],
      };
    },
  },
  {
    id: 'C3',
    label: 'a person with no name, no id, or an id already in the list is left out and counted',
    run: (m) => {
      const s = new MemStore();
      m.addContacts(s, 'user-a', [person(1)]);
      const w = m.addContacts(s, 'user-a', [
        person(2, { name: '   ' }),
        { name: 'No Id' },
        person(1, { name: 'Same id again' }),
        person(3),
      ]);
      return {
        ok:
          w.added === 1 && w.unreadable === 3 && m.readContacts(s, 'user-a').contacts.length === 2,
        got: [w.added, w.unreadable],
      };
    },
  },
  {
    id: 'C4',
    label:
      'an over-long entry already in storage is dropped on reading, so it can never break a household draft',
    run: (m) => {
      const s = new MemStore();
      s.m.set(
        KEY_A(m),
        JSON.stringify({
          v: 1,
          userId: 'user-a',
          contacts: [person(1), person(2, { name: 'n'.repeat(501) })],
        })
      );
      return (
        m
          .readContacts(s, 'user-a')
          .contacts.map((c: any) => c.id)
          .join() === 'c1'
      );
    },
  },
  // F — storage that fails
  {
    id: 'F1',
    label: 'no store at all (the browser gives none): refused, nothing thrown',
    run: (m) => {
      try {
        return (
          m.readContacts(null, 'user-a').status === 'refused' &&
          m.addContacts(null, 'user-a', people(1)).status === 'refused' &&
          m.removeContact(null, 'user-a', 'c1').status === 'refused' &&
          m.clearContacts(null, null, 'user-a').status === 'refused'
        );
      } catch {
        return false;
      }
    },
  },
  {
    id: 'F2',
    label: 'storage that throws on read: refused, and nothing is written',
    run: (m) => {
      const s = new MemStore();
      m.addContacts(s, 'user-a', people(2));
      const before = s.snapshot();
      s.failRead = true;
      try {
        const r = m.readContacts(s, 'user-a');
        const w = m.addContacts(s, 'user-a', people(1, 9));
        s.failRead = false;
        return r.status === 'refused' && w.status === 'refused' && s.snapshot() === before;
      } catch {
        return false;
      }
    },
  },
  {
    id: 'F3',
    label:
      'storage that is full says "full" and changes nothing; storage that is blocked says "refused"',
    run: (m) => {
      const s = new MemStore();
      m.addContacts(s, 'user-a', people(2));
      const before = s.snapshot();
      s.failWrite = 'quota';
      const full = m.addContacts(s, 'user-a', people(1, 9));
      s.failWrite = 'blocked';
      const refused = m.addContacts(s, 'user-a', people(1, 9));
      s.failWrite = false;
      return {
        ok:
          full.status === 'full' &&
          refused.status === 'refused' &&
          full.added === 0 &&
          refused.added === 0 &&
          s.snapshot() === before &&
          m.readContacts(s, 'user-a').contacts.length === 2,
        got: [full.status, refused.status],
      };
    },
  },
  {
    id: 'F4',
    label:
      'a write is whole or nothing: a disk too small for the new list leaves the old list exactly as it was',
    run: (m) => {
      const s = new MemStore();
      m.addContacts(s, 'user-a', people(2));
      const before = s.snapshot();
      s.maxValue = 900; // room for the two, not for fifty
      const w = m.addContacts(s, 'user-a', people(50, 100));
      const after = m.readContacts(s, 'user-a').contacts.length;
      return {
        ok: w.status === 'full' && w.added === 0 && s.snapshot() === before && after === 2,
        got: [w.status, w.added, after],
      };
    },
  },
  {
    id: 'F5',
    label: 'remove with a write that fails leaves the list as it was and says so',
    run: (m) => {
      const s = new MemStore();
      m.addContacts(s, 'user-a', people(3));
      const before = s.snapshot();
      s.failWrite = 'blocked';
      const r = m.removeContact(s, 'user-a', 'c2');
      s.failWrite = false;
      return {
        ok:
          (r.status === 'refused' || r.status === 'full') &&
          s.snapshot() === before &&
          r.contacts.length === 3,
        got: [r.status, r.contacts.length],
      };
    },
  },
  // R — remove, clear
  {
    id: 'R1',
    label: 'remove takes out that one person only; an id that is not there changes nothing',
    run: (m) => {
      const s = new MemStore();
      m.addContacts(s, 'user-a', people(3));
      const r = m.removeContact(s, 'user-a', 'c2');
      const same = m.removeContact(s, 'user-a', 'nobody');
      return (
        r.status === 'ok' &&
        r.contacts.map((c: any) => c.id).join() === 'c1,c3' &&
        same.status === 'ok' &&
        m
          .readContacts(s, 'user-a')
          .contacts.map((c: any) => c.id)
          .join() === 'c1,c3'
      );
    },
  },
  {
    id: 'R2',
    label:
      "Clear drops my list, my placements for every event and my hand-off, and nobody else's, and no draft",
    run: (m) => {
      const local = new MemStore();
      const tab = new MemStore();
      m.addContacts(local, 'user-a', people(3));
      m.addContacts(local, 'user-b', people(1, 50));
      local.setItem(`${m.PLACED_PREFIX}v1:user-a:ev1`, '[1]');
      local.setItem(`${m.PLACED_PREFIX}v1:user-a:ev2`, '[2]');
      local.setItem(`${m.PLACED_PREFIX}v1:user-b:ev1`, '[3]');
      local.setItem(`${DRAFT_PREFIX}v1:user-a:ev1:new`, '{}');
      tab.setItem(`${m.HANDOFF_PREFIX}v1:user-a:ev1`, '{}');
      tab.setItem(`${m.HANDOFF_PREFIX}v1:user-b:ev1`, '{}');
      const r = m.clearContacts(local, tab, 'user-a');
      const left = [...local.m.keys(), ...[...tab.m.keys()].map((k) => `tab:${k}`)].sort();
      const want = [
        `${DRAFT_PREFIX}v1:user-a:ev1:new`,
        m.contactsKey('user-b'),
        `${m.PLACED_PREFIX}v1:user-b:ev1`,
        `tab:${m.HANDOFF_PREFIX}v1:user-b:ev1`,
      ].sort();
      return { ok: r.status === 'ok' && JSON.stringify(left) === JSON.stringify(want), got: left };
    },
  },
  {
    id: 'R3',
    label: 'Clear when the browser will not remove: refused, and the list is still there',
    run: (m) => {
      const local = new MemStore();
      m.addContacts(local, 'user-a', people(2));
      local.failRemove = true;
      const r = m.clearContacts(local, new MemStore(), 'user-a');
      local.failRemove = false;
      return r.status === 'refused' && m.readContacts(local, 'user-a').contacts.length === 2;
    },
  },
  {
    id: 'R4',
    label: 'the count is the list after every operation: add, remove, add, clear',
    run: (m) => {
      const s = new MemStore();
      const t = new MemStore();
      const steps: number[] = [];
      const len = () => m.readContacts(s, 'user-a').contacts.length;
      steps.push(m.addContacts(s, 'user-a', people(4)).contacts.length === len() ? len() : -1);
      steps.push(m.removeContact(s, 'user-a', 'c3').contacts.length === len() ? len() : -1);
      steps.push(m.addContacts(s, 'user-a', people(2, 20)).contacts.length === len() ? len() : -1);
      m.clearContacts(s, t, 'user-a');
      steps.push(len());
      return { ok: steps.join() === '4,3,5,0', got: steps };
    },
  },
  // U — fix one person in place (step 3b: the three ways forward on a flagged row)
  {
    id: 'U1',
    label:
      'updateContact replaces one person by id, in the same place; the others and the count are as they were',
    run: (m) => {
      const s = new MemStore();
      m.addContacts(s, 'user-a', people(4));
      const before = m.readContacts(s, 'user-a').contacts;
      const r = m.updateContact(s, 'user-a', { ...before[1], name: 'Renamed', email: undefined });
      const after = m.readContacts(s, 'user-a').contacts;
      return {
        ok:
          r.status === 'ok' &&
          after.length === 4 &&
          after.map((c: any) => c.id).join() === 'c1,c2,c3,c4' &&
          after[1].name === 'Renamed' &&
          !('email' in after[1]) &&
          JSON.stringify(after[0]) === JSON.stringify(before[0]) &&
          JSON.stringify(after[2]) === JSON.stringify(before[2]) &&
          JSON.stringify(after[3]) === JSON.stringify(before[3]) &&
          r.contacts.length === 4,
        got: after.map((c: any) => [c.id, c.name]),
      };
    },
  },
  {
    id: 'U2',
    label:
      'updateContact when the browser will not save or is full: refused or full, and the list is as it was',
    run: (m) => {
      const s = new MemStore();
      m.addContacts(s, 'user-a', people(3));
      const before = s.snapshot();
      s.failWrite = 'blocked';
      const a = m.updateContact(s, 'user-a', person(2, { name: 'Changed' }));
      s.failWrite = 'quota';
      const b = m.updateContact(s, 'user-a', person(2, { name: 'Changed' }));
      s.failWrite = false;
      return {
        ok: a.status === 'refused' && b.status === 'full' && s.snapshot() === before,
        got: [a.status, b.status],
      };
    },
  },
  {
    id: 'U3',
    label:
      'updateContact with an unknown id, a blank name or an over-long field changes nothing, and signed out touches nothing',
    run: (m) => {
      const s = new MemStore();
      m.addContacts(s, 'user-a', people(3));
      const before = s.snapshot();
      m.updateContact(s, 'user-a', person(99));
      m.updateContact(s, 'user-a', person(2, { name: '   ' }));
      m.updateContact(s, 'user-a', person(2, { name: 'N'.repeat(201) }));
      m.updateContact(s, 'user-a', person(2, { email: 'e'.repeat(255) }));
      m.updateContact(s, 'user-a', person(2, { phone: '1'.repeat(41) }));
      const unchanged = s.snapshot() === before;
      const calls = s.calls;
      const out = m.updateContact(s, null, person(2));
      return {
        ok: unchanged && out.status === 'signed-out' && s.calls === calls,
        got: { unchanged, status: out.status },
      };
    },
  },
];

function runChecks(mod: Mod | null, why: string): Record<string, { ok: boolean; got?: unknown }> {
  const out: Record<string, { ok: boolean; got?: unknown }> = {};
  for (const c of CHECKS) {
    if (!mod) {
      out[c.id] = { ok: false, got: why };
      continue;
    }
    try {
      const r = c.run(mod);
      out[c.id] = typeof r === 'boolean' ? { ok: r } : r;
    } catch (e) {
      out[c.id] = { ok: false, got: `threw: ${String((e as Error).message).slice(0, 120)}` };
    }
  }
  return out;
}

// ── Break proofs: one rule broken in an in-memory copy; the same checks must go red ────
interface Mutant {
  id: string;
  label: string;
  anchor: string;
  replacement: string;
  mustBeRed: string[];
}
const MUTANTS: Mutant[] = [
  {
    id: 'B1',
    label:
      'the contacts prefix made to start with the draft prefix, so sweepDrafts can take the list',
    anchor: "export const CONTACTS_PREFIX = 'gather:contacts:';",
    replacement: "export const CONTACTS_PREFIX = 'gather:household-draft:contacts:';",
    mustBeRed: ['K2', 'K3'],
  },
  {
    id: 'B2',
    label: 'the length clamp taken out',
    anchor:
      '  const tooLong = name.length > MAX_NAME || email.length > MAX_EMAIL || phone.length > MAX_PHONE;',
    replacement: '  const tooLong = false;',
    mustBeRed: ['C2', 'C4'],
  },
  {
    id: 'B3',
    label: 'the list written a person at a time, so a full disk leaves part of it',
    anchor:
      '  const written = writeWhole(store, key, { v: CONTACTS_VERSION, userId, contacts: next });',
    replacement:
      "  let written: WriteStatus = 'ok';\n" +
      '  for (let i = 1; i <= next.length && written === "ok"; i++) {\n' +
      '    written = writeWhole(store, key, { v: CONTACTS_VERSION, userId, contacts: next.slice(0, i) });\n' +
      '  }',
    mustBeRed: ['F4'],
  },
  {
    id: 'B4',
    label: 'a fixed person moved to the end of the list instead of staying in place',
    anchor: '  const next = read.contacts.map((c) => (c.id === clean.id ? clean : c));',
    replacement: '  const next = [...read.contacts.filter((c) => c.id !== clean.id), clean];',
    mustBeRed: ['U1'],
  },
  {
    id: 'B5',
    label: 'a fixed person not checked again (a blank name goes in)',
    anchor: '  const clean = cleanContact(changed);',
    replacement: '  const clean = changed as Contact | null;',
    mustBeRed: ['U3'],
  },
];

function main() {
  section('The checks, on the live store');
  const live = load(SOURCE);
  const results = runChecks(live.mod, live.why);
  for (const c of CHECKS) report(c.id, c.label, results[c.id].ok, results[c.id].got);

  section('B — break proofs: each broken copy must turn its checks red');
  for (const mu of MUTANTS) {
    const times = SOURCE ? SOURCE.split(mu.anchor).length - 1 : 0;
    const text = times === 1 ? SOURCE.replace(mu.anchor, () => mu.replacement) : '';
    const broken = load(text);
    const red = text ? runChecks(broken.mod, broken.why) : null;
    const wentRed = red ? mu.mustBeRed.filter((id) => !red[id].ok) : [];
    report(
      mu.id,
      `${mu.label}: ${mu.mustBeRed.join(' and ')} go red`,
      times === 1 &&
        text !== SOURCE &&
        broken.mod !== null &&
        wentRed.length === mu.mustBeRed.length,
      {
        anchorFoundTimes: times,
        copyLoaded: broken.mod !== null,
        red: wentRed,
        why: SOURCE ? broken.why : live.why,
      }
    );
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
