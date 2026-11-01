/**
 * [[GTC-448]] — CONTACT IMPORT, PIECE ONE: the reading and checking code under a host's contact
 * import (a pasted list, a file, a vCard). Pure functions in src/lib/contact-import/. No screen,
 * no storage, no server route, no migration, nothing wired into any page.
 *
 * Run: npm run test:contact-import. It needs no database, dev server, network or .env, and it
 * sends nothing. Every person, number and address in it is invented (example.com, 021 555 01xx).
 *
 * THE CONTRACT THIS SUITE PINS (the ticket's rulings 1 to 13; the names below are the suite's)
 *   types.ts        WORDS = { W1 … W7 }, the seven sentences a host will read
 *   check-email.ts  checkEmail(raw)  -> { kind:'none' } | { kind:'ok', email }
 *                                       | { kind:'bad', email, problem }
 *   check-phone.ts  checkPhone(raw)  -> { kind:'none' } | { kind:'ok', phone }
 *                                       | { kind:'overseas'|'malformed', phone, problem }
 *   tidy-name.ts    tidyName(raw)    -> { name, flipped }
 *   read-paste.ts   readPaste(text, opts?)  -> ReadResult
 *   read-vcard.ts   readVCard(text, opts?)  -> ReadResult
 *   read-csv.ts     readCsv(text, opts?)    -> ReadResult
 *                   guessColumns(headers)   -> Field[]  (one per header; email and phone may repeat)
 *   ReadResult = { people, found, leftOut: { noName, unreadable }, tidied }
 *   ContactPerson = { tempId, name, problems, email?, phone? }   (absent = key missing)
 *   opts = { newId?: () => string }   Field = 'first'|'last'|'name'|'email'|'phone'|'ignore'
 *
 * READINGS THE SUITE MAKES WHERE THE TICKET LEAVES ROOM (flagged in the report, not decided here)
 *   - `found` counts people-lines, rows and cards: not blank lines, not a skipped heading line,
 *     not a CSV header row.
 *   - readCsv returns exactly a ReadResult (S7 holds for all three readers); the guess is read
 *     with guessColumns(headers).
 *   - Ruling 6's first-match applies to first / last / name; every non-skipped email or phone
 *     column is a candidate and ruling 5's chooser picks one (C12).
 *   - A vCard FN with an unescaped comma ("Example, Aroha") reaches vcard-parser as a split array
 *     that the old extractName joins with a space; readVCard must keep the comma to tidy it (V10).
 *
 * THE LAYERS: K controls on files that exist · Z what must not change · E email · H phone ·
 * N name tidy · P paste · C CSV · V vCard · S shape · T `tidied` · G purity.
 * Each new module is loaded through a guarded dynamic import, so a missing module turns only its
 * own checks red and the run goes to its end.
 */
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { isDeepStrictEqual } from 'util';

const ROOT = path.join(__dirname, '..');
// origin/main when GTC-448 was planned (df782c4): the base every "unchanged" control reads.
const BASE = 'df782c463885602907b00564991eb8422768ec66';
const NEW_SCRIPT = 'test:contact-import';
const NEW_SCRIPT_LINE = 'tsx --tsconfig tests/tsconfig.json tests/contact-import-test.ts';

// ── Reporting ────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const greens: string[] = [];
const reds: string[] = [];
type Verdict = boolean | { ok: boolean; detail?: string };

function firstLine(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  return m.split('\n')[0].slice(0, 160);
}
function record(id: string, label: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    greens.push(id);
    console.log(`\x1b[32m✓\x1b[0m ${id} ${label}`);
  } else {
    failed++;
    reds.push(id);
    console.log(`\x1b[31m✗\x1b[0m ${id} ${label}${detail ? ` — ${detail}` : ''}`);
  }
}
function check(id: string, label: string, fn: () => Verdict) {
  try {
    const v = fn();
    if (typeof v === 'boolean') record(id, label, v);
    else record(id, label, v.ok, v.detail);
  } catch (e) {
    record(id, label, false, firstLine(e));
  }
}
const j = (v: unknown) => JSON.stringify(v);
/** Every case must satisfy `pred`; the cases that do not are shown. */
function allOk<T>(cases: T[], pred: (c: T) => boolean): Verdict {
  const off = cases.filter((c) => !pred(c));
  return { ok: off.length === 0, detail: off.length ? `off: ${j(off).slice(0, 300)}` : undefined };
}

// ── Git and files ────────────────────────────────────────────────────────────
function git(args: string[]): string {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });
}
const atBase = (p: string) => git(['show', `${BASE}:${p}`]);
const readWork = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// ── Loading the modules under test (guarded) ─────────────────────────────────
/* eslint-disable @typescript-eslint/no-explicit-any */
const loaded: Record<string, any> = {};
const loadErrors: Record<string, string> = {};
const LOADERS: Record<string, () => Promise<any>> = {
  types: () => import('../src/lib/contact-import/types'),
  email: () => import('../src/lib/contact-import/check-email'),
  phone: () => import('../src/lib/contact-import/check-phone'),
  tidy: () => import('../src/lib/contact-import/tidy-name'),
  paste: () => import('../src/lib/contact-import/read-paste'),
  vcard: () => import('../src/lib/contact-import/read-vcard'),
  csv: () => import('../src/lib/contact-import/read-csv'),
  oldvcf: () => import('../src/lib/vcard'),
  form: () => import('../src/components/plan/Moment1InputForm'),
};
function mod(name: string): any {
  if (!loaded[name]) throw new Error(`module not loaded: ${name} (${loadErrors[name] ?? 'n/a'})`);
  return loaded[name];
}

// ── Fixtures: invented people only ───────────────────────────────────────────
const W = {
  W1: "This email address doesn't look right.",
  W2: 'This looks like an overseas number. Gather only handles New Zealand numbers for now.',
  W3: "This doesn't look like a New Zealand phone number.",
  W4: 'More than one email came with this person. We kept one.',
  W5: 'More than one number came with this person. We kept one.',
  W6: "We couldn't tell which part of this name is the first name, so we left it as it was.",
  W7: "Part of this person's details didn't look like a name, number or email, so we left it out.",
};
const W_ALL = Object.values(W);
const ids = () => {
  let n = 0;
  return { newId: () => `t${++n}` };
};
const paste = (t: string) => mod('paste').readPaste(t, ids());
const csv = (t: string) => mod('csv').readCsv(t, ids());
const vcf = (t: string) => mod('vcard').readVCard(t, ids());
const card = (...lines: string[]) =>
  ['BEGIN:VCARD', 'VERSION:3.0', ...lines, 'END:VCARD'].join('\r\n');
const cards = (...cs: string[]) => cs.join('\r\n');

/** A person has exactly these keys, with these values. */
function personIs(
  p: any,
  want: { name: string; email?: string; phone?: string; problems?: string[] }
): boolean {
  if (!p) return false;
  const wantKeys = ['name', 'problems', 'tempId'];
  if (want.email !== undefined) wantKeys.push('email');
  if (want.phone !== undefined) wantKeys.push('phone');
  return (
    isDeepStrictEqual(Object.keys(p).sort(), wantKeys.sort()) &&
    typeof p.tempId === 'string' &&
    p.name === want.name &&
    p.email === want.email &&
    p.phone === want.phone &&
    isDeepStrictEqual(p.problems, want.problems ?? [])
  );
}
const shown = (v: unknown) => j(v).slice(0, 400);

// The samples the shape, tidied and purity layers read (every reader, a mix of good and flagged).
const PASTE_SAMPLE = [
  'Aroha Example, 021 555 0101, aroha@example.com',
  'Ben Example',
  'Example, Cara, 09 555 0103',
  'Dan Example, +61 4 1234 5678, bad-address',
  'Eve Example, ---, 021 555 0104, e1@example.com, e2@example.com',
  'Example, Jr, 021 555 0105',
  '021 555 0106',
].join('\n');
const CSV_SAMPLE = [
  'Name,Phone,Email',
  'Aroha Example,021 555 0101,aroha@example.com',
  '"Example, Cara",+61 4 1234 5678,bad',
  'Ben Example,,',
].join('\n');
const VCF_SAMPLE = cards(
  card('FN:Aroha Example', 'TEL:021 555 0101'),
  card('FN:Example\\, Cara', 'EMAIL:bad'),
  card('FN:Ben Example'),
  card('EMAIL:nameless@example.com')
);
const samples = () => [paste(PASTE_SAMPLE), csv(CSV_SAMPLE), vcf(VCF_SAMPLE)];
const allPeople = () => samples().flatMap((r: any) => r.people);

// Corpora the parity checks run both the new check and the household form's own through.
const EMAIL_CORPUS = [
  'aroha@example.com',
  'Aroha@Example.COM',
  '  aroha@example.com  ',
  'a.b+c@x.y.z',
  'a@b.c',
  'a-b_c@d-e.fg',
  "o'brien@example.com",
  'aroha@example.co.nz',
  '1@2.3',
  'a@b.c.d',
  'aroha@example..com',
  'aroha@[127.0.0.1]',
  '"aroha"@example.com',
  'mailto:aroha@example.com',
  '',
  '   ',
  'aroha',
  'aroha@',
  '@example.com',
  'aroha@example',
  'aroha@@example.com',
  'a b@c.d',
  'a@b c.d',
  'a@b.',
  'a@.com',
  'a@b.c@d.e',
  'a@b\t.c',
  'aroha @example.com',
  'aroha@example.com extra',
  'aroha@example.com.',
  'ＡＢＣ@example.com',
  'aroha@exam,ple.com',
  ' a@b.c',
  'a@b.c ',
  'aroha.example.com',
  'aroha@ example.com',
  '@',
  '..@..',
  'x@y.z.',
  'aroha;ben@example.com',
];
const PHONE_CORPUS = [
  '',
  '   ',
  '021 555 0101',
  '+64 21 555 0101',
  '64 21 555 0101',
  '021-555-0101',
  '(021) 555 0101',
  '215550101',
  '4155550100',
  '+64 (0)21 555 0101',
  '64 (0)21 555 0101',
  '09 555 0101',
  '03 555 0102',
  '+64 9 555 0101',
  '+61 4 1234 5678',
  '+1 415 555 0100',
  '+44 20 7946 0000',
  '0064 21 555 0101',
  '0044 20 7946 0000',
  '021 555',
  '12345',
  'abc',
  '021 555 0101 ext 12',
  '0215550101123',
  '021 555 0101 / 09 555 0102',
  '+64',
  '+',
  '0',
  '00',
  '+640',
  '+6421',
  '+64 21 555 010',
  '+64 21 555 01011',
  '+64 2155501011',
  '++64215550101',
  '021555-0101x',
  '(09) 555-0101',
  '09555 0101',
  '+64-21-555-0101',
  ' 021 555 0101 ',
];

// The pop-up's own column rule (ImportCSVModal.tsx L293-330), copied as the oracle for C6.
function popUpGuess(header: string): string {
  const h = header.toLowerCase();
  if (h.includes('first') || h === 'fname' || h === 'given') return 'first';
  if (h.includes('last') || h === 'lname' || h === 'surname' || h === 'family') return 'last';
  if (h.includes('name')) return 'name';
  if (h.includes('email') || h.includes('e-mail') || h === 'mail') return 'email';
  if (h.includes('phone') || h.includes('mobile') || h.includes('tel')) return 'phone';
  return 'ignore';
}

// Source files of the new folder, for the purity layer.
const SRC_DIR = path.join(ROOT, 'src/lib/contact-import');
const EXPECTED_FILES = [
  'build-contact.ts',
  'check-email.ts',
  'check-phone.ts',
  'read-csv.ts',
  'read-paste.ts',
  'read-vcard.ts',
  'split-cells.ts',
  'tidy-name.ts',
  'types.ts',
];
function srcFiles(): string[] {
  try {
    return fs.readdirSync(SRC_DIR).filter((f) => /\.tsx?$/.test(f));
  } catch {
    return [];
  }
}
function stripComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1');
}
function codeOf(file: string): string {
  return stripComments(fs.readFileSync(path.join(SRC_DIR, file), 'utf8'));
}
function noneMatch(re: RegExp): Verdict {
  const files = srcFiles();
  if (files.length === 0)
    return { ok: false, detail: 'src/lib/contact-import/ is empty or missing' };
  const hits = files.filter((f) => re.test(codeOf(f)));
  return { ok: hits.length === 0, detail: hits.length ? `found in ${hits.join(', ')}` : undefined };
}

async function main() {
  for (const [name, loader] of Object.entries(LOADERS)) {
    try {
      loaded[name] = await loader();
    } catch (e) {
      loadErrors[name] = firstLine(e);
    }
  }
  console.log('Modules:');
  for (const name of Object.keys(LOADERS)) {
    console.log(`  ${name}: ${loaded[name] ? 'loaded' : `NOT LOADED (${loadErrors[name]})`}`);
  }
  console.log('');

  // ── K · controls on files that exist today ────────────────────────────────
  check('K1', 'phone.ts, the form and the pop-up equal the base', () => {
    const files = [
      'src/lib/phone.ts',
      'src/components/plan/Moment1InputForm.tsx',
      'src/components/plan/ImportCSVModal.tsx',
    ];
    return allOk(files, (f) => atBase(f) === readWork(f));
  });
  check('K2', 'old parseVCF results as at the base (fixture)', () => {
    const { parseVCF } = mod('oldvcf');
    const text = cards(
      card('FN:Aroha Example', 'EMAIL:Aroha@Example.com', 'TEL;TYPE=CELL:021 555 0101'),
      card('FN:Ben Example'),
      card('EMAIL:nameless@example.com')
    );
    const r = parseVCF(text);
    const want = [{ name: 'Aroha Example', email: 'aroha@example.com', phone: '+64215550101' }];
    return {
      ok: r.totalFound === 3 && r.skippedCount === 2 && isDeepStrictEqual(r.contacts, want),
      detail: shown(r),
    };
  });
  check('K3', 'tests/vcf-import-test.ts equals the base', () => {
    return atBase('tests/vcf-import-test.ts') === readWork('tests/vcf-import-test.ts');
  });

  // ── Z · what must not change ──────────────────────────────────────────────
  check('Z1', 'nothing changed in src/app, prisma, auth, security', () => {
    const paths = [
      'src/app',
      'prisma',
      'middleware.ts',
      'tests/security-*.ts',
      'scripts/triage-unknown-routes.ts',
      'route-classifications.json',
    ];
    const changed = git(['diff', '--name-only', BASE, '--', ...paths]).trim();
    const fresh = git(['ls-files', '--others', '--exclude-standard', '--', ...paths]).trim();
    return { ok: changed === '' && fresh === '', detail: j({ changed, fresh }) };
  });
  check('Z2', 'changed files are only the allowed list', () => {
    const allowed = (f: string) =>
      f === 'docs/tickets/GTC-448.md' ||
      f === 'package.json' ||
      f === 'tests/contact-import-test.ts' ||
      f === 'src/lib/vcard.ts' ||
      f.startsWith('src/lib/contact-import/');
    const changed = git(['diff', '--name-only', BASE]).split('\n').filter(Boolean);
    const off = changed.filter((f) => !allowed(f));
    return { ok: off.length === 0, detail: j(off) };
  });
  check('Z3', 'package.json is the base plus the one script line', () => {
    const baseText = atBase('package.json');
    const nowText = readWork('package.json');
    const before = '    "test:sample-marker": "tsx tests/sample-marker-test.ts"\n  },';
    const after =
      '    "test:sample-marker": "tsx tests/sample-marker-test.ts",\n' +
      `    "${NEW_SCRIPT}": "${NEW_SCRIPT_LINE}"\n  },`;
    const expected = baseText.replace(before, after);
    const now = JSON.parse(nowText);
    const base = JSON.parse(baseText);
    const nKeys = Object.keys(now.scripts);
    const bKeys = Object.keys(base.scripts);
    const sameScripts = bKeys.every((k) => now.scripts[k] === base.scripts[k]);
    const { scripts: _ns, ...nRest } = now;
    const { scripts: _bs, ...bRest } = base;
    return {
      ok:
        expected !== baseText &&
        nowText === expected &&
        isDeepStrictEqual(nRest, bRest) &&
        isDeepStrictEqual(nKeys, [...bKeys, NEW_SCRIPT]) &&
        sameScripts &&
        now.scripts[NEW_SCRIPT] === NEW_SCRIPT_LINE,
    };
  });

  // ── E · the email check ───────────────────────────────────────────────────
  check('E1', 'good addresses accepted (table)', () => {
    const { checkEmail } = mod('email');
    const good: [string, string][] = [
      ['aroha@example.com', 'aroha@example.com'],
      ['Aroha@Example.COM', 'aroha@example.com'],
      ['a.b+c@x.y.z', 'a.b+c@x.y.z'],
      ['a@b.c', 'a@b.c'],
      ["o'brien@example.com", "o'brien@example.com"],
      ['aroha@example.co.nz', 'aroha@example.co.nz'],
    ];
    return allOk(good, ([raw, want]) => {
      const r = checkEmail(raw);
      return r.kind === 'ok' && r.email === want && !('problem' in r);
    });
  });
  check('E2', 'bad addresses refused (table)', () => {
    const { checkEmail } = mod('email');
    const bad = ['aroha', 'aroha@', '@example.com', 'aroha@example', 'aroha@@example.com', 'a@b.'];
    bad.push('a b@c.d', 'a@b c.d');
    return allOk(bad, (raw) => {
      const r = checkEmail(raw);
      return r.kind === 'bad' && r.problem === W.W1 && r.email === raw.trim().toLowerCase();
    });
  });
  check('E3', 'outer spaces trimmed; inner spaces refused', () => {
    const { checkEmail } = mod('email');
    const a = checkEmail('  aroha@example.com  ');
    const b = checkEmail('aroha @example.com');
    const c = checkEmail('aroha@example.com extra');
    return (
      a.kind === 'ok' && a.email === 'aroha@example.com' && b.kind === 'bad' && c.kind === 'bad'
    );
  });
  check('E4', 'blank is no email and no problem', () => {
    const { checkEmail } = mod('email');
    return allOk(['', '   ', '\t'], (raw) => {
      const r = checkEmail(raw);
      return isDeepStrictEqual(Object.keys(r), ['kind']) && r.kind === 'none';
    });
  });
  check('E5', "agrees with the form's validateEmail (40 strings)", () => {
    const { checkEmail } = mod('email');
    const { validateEmail } = mod('form');
    return allOk(EMAIL_CORPUS, (raw) => {
      const mine = checkEmail(raw).kind;
      const form = validateEmail(raw);
      return form === '' ? mine === 'ok' || mine === 'none' : mine === 'bad';
    });
  });
  check('E6', 'reason is W1; no contact content in it', () => {
    const { checkEmail } = mod('email');
    const r = checkEmail('zzyzx@bad');
    return r.kind === 'bad' && r.problem === W.W1 && !/zzyzx|@|\d/i.test(r.problem);
  });

  // ── H · the number check ──────────────────────────────────────────────────
  check('H1', 'NZ mobiles in ten spellings give one +64 number', () => {
    const { checkPhone } = mod('phone');
    const spellings = [
      '021 555 0101',
      '021-555-0101',
      '(021) 555 0101',
      '0215550101',
      '+64 21 555 0101',
      '+64215550101',
      '64 21 555 0101',
      '64215550101',
      '215550101',
      '021.555.0101',
    ];
    return allOk(spellings, (raw) => {
      const r = checkPhone(raw);
      return r.kind === 'ok' && r.phone === '+64215550101' && !('problem' in r);
    });
  });
  check('H2', 'landline spellings (09, 03, +64 9)', () => {
    const { checkPhone } = mod('phone');
    const cases: [string, string][] = [
      ['09 555 0101', '+6495550101'],
      ['(09) 555-0101', '+6495550101'],
      ['+64 9 555 0101', '+6495550101'],
      ['095550101', '+6495550101'],
      ['09555 0101', '+6495550101'],
      ['+64-9-555-0101', '+6495550101'],
      ['03 555 0102', '+6435550102'],
      ['+64 3 555 0102', '+6435550102'],
    ];
    return allOk(cases, ([raw, want]) => {
      const r = checkPhone(raw);
      return r.kind === 'ok' && r.phone === want;
    });
  });
  check('H3', '"+64 (0)21" and "64 (0)21" (GTC-432)', () => {
    const { checkPhone } = mod('phone');
    return allOk(['+64 (0)21 555 0101', '64 (0)21 555 0101'], (raw) => {
      const r = checkPhone(raw);
      return r.kind === 'ok' && r.phone === '+64215550101';
    });
  });
  check('H4', 'bare 9 or 10 digits taken as NZ (4155550100 too)', () => {
    const { checkPhone } = mod('phone');
    const cases: [string, string][] = [
      ['215550101', '+64215550101'],
      ['2155501012', '+642155501012'],
      ['4155550100', '+644155550100'], // a US number with no +1 passes the form today (C8)
    ];
    return allOk(cases, ([raw, want]) => {
      const r = checkPhone(raw);
      return r.kind === 'ok' && r.phone === want;
    });
  });
  check('H5', '+61, +1, +44 flagged overseas; text kept', () => {
    const { checkPhone } = mod('phone');
    const cases: [string, string][] = [
      ['+61 4 1234 5678', '+61 4 1234 5678'],
      ['+1 415 555 0100', '+1 415 555 0100'],
      ['+44 20 7946 0000', '+44 20 7946 0000'],
      ['  +61  4 1234   5678 ', '+61 4 1234 5678'],
    ];
    return allOk(cases, ([raw, want]) => {
      const r = checkPhone(raw);
      return r.kind === 'overseas' && r.phone === want && r.problem === W.W2;
    });
  });
  check('H6', 'short, long, letters, 0064, 0044 flagged malformed', () => {
    const { checkPhone } = mod('phone');
    const cases = [
      '021 555',
      '0215550101123',
      'abc',
      '0064 21 555 0101',
      '0044 20 7946 0000',
      '12345',
    ];
    return allOk(cases, (raw) => {
      const r = checkPhone(raw);
      return r.kind === 'malformed' && r.phone === raw && r.problem === W.W3;
    });
  });
  check('H7', 'blank is no number and no problem', () => {
    const { checkPhone } = mod('phone');
    return allOk(['', '   ', '\t'], (raw) => {
      const r = checkPhone(raw);
      return isDeepStrictEqual(Object.keys(r), ['kind']) && r.kind === 'none';
    });
  });
  check('H8', 'extension or two numbers in one cell: malformed', () => {
    const { checkPhone } = mod('phone');
    return allOk(['021 555 0101 ext 12', '021 555 0101 / 09 555 0102'], (raw) => {
      const r = checkPhone(raw);
      return r.kind === 'malformed' && r.phone === raw && r.problem === W.W3;
    });
  });
  check('H9', "agrees with the form's validatePhone (40 strings)", () => {
    const { checkPhone } = mod('phone');
    const { validatePhone } = mod('form');
    return allOk(PHONE_CORPUS, (raw) => {
      const mine = checkPhone(raw).kind;
      const form = validatePhone(raw);
      if (form === '') return mine === 'ok' || mine === 'none';
      if (form === 'International numbers not supported yet. NZ numbers only.') {
        return mine === 'overseas';
      }
      return form === 'Invalid NZ phone number' && mine === 'malformed';
    });
  });
  check('H10', 'reasons are W2 or W3; no contact content', () => {
    const { checkPhone } = mod('phone');
    const flagged = ['+61 4 1234 5678', '+44 20 7946 0000', '021 555', 'abc', '0064 21 555 0101'];
    return allOk(flagged, (raw) => {
      const r = checkPhone(raw);
      return (r.problem === W.W2 || r.problem === W.W3) && !/\d|\+/.test(r.problem);
    });
  });

  // ── N · the name tidy ─────────────────────────────────────────────────────
  const FLIPS: [string, string][] = [
    ['Example, Aroha', 'Aroha Example'],
    ['van der Example, Ben', 'Ben van der Example'],
    ['Example, Aroha Jane', 'Aroha Jane Example'],
    ['Example-Sample, Ben', 'Ben Example-Sample'],
    ['Te Example, Hine', 'Hine Te Example'],
  ];
  const PARTICLES: [string, string][] = [
    ["O'Example, Hēmi", "Hēmi O'Example"],
    ['O’Example, Aroha', 'Aroha O’Example'],
    ['De La Example, Hēmi', 'Hēmi De La Example'],
    ['Tūhoe-Example, Hana', 'Hana Tūhoe-Example'],
  ];
  const CASES: [string, string][] = [
    ['EXAMPLE, AROHA', 'AROHA EXAMPLE'],
    ['example, aroha', 'aroha example'],
  ];
  const stays = (raw: string) => {
    const { tidyName } = mod('tidy');
    const r = tidyName(raw);
    return r.flipped === false && r.name === raw;
  };
  check('N1', 'flips: Smith, John / van der Berg, Anna / hyphen', () => {
    const { tidyName } = mod('tidy');
    return allOk(FLIPS, ([raw, want]) => {
      const r = tidyName(raw);
      return r.flipped === true && r.name === want;
    });
  });
  check('N2', 'leaves titles and suffixes (Jr, Dr, III, PhD)', () => {
    const left = [
      'Example, Jr',
      'Aroha Example, Jr.',
      'Example, Dr Aroha',
      'Dr Example, Aroha',
      'Example, Aroha III',
      'Example, Aroha PhD',
      'Mrs Example, Aroha',
    ];
    return allOk(left, stays);
  });
  check('N3', 'leaves business names (Ltd, Trust, Plumbing, &)', () => {
    const left = [
      'Plumbing, Example',
      'Bakery, Example',
      'Trust, Example',
      'Example Trust, Albany',
      'Example & Sons, Albany',
      'Example, Ltd',
      'Example Dental, Takanini',
    ];
    return allOk(left, stays);
  });
  check('N4', 'leaves two commas, digits, @, brackets', () => {
    const left = [
      'Example, Aroha, Jr',
      'Example, Aroha2',
      'Example, aroha@example.com',
      'Example, (Aroha)',
      'Example, Aroha & Ben',
      'Example/Sample, Aroha',
    ];
    return allOk(left, stays);
  });
  check('N5', 'leaves "John Smith, dad" (two plain left words)', () => {
    return allOk(['Aroha Example, dad', 'Ben Sample, Cara'], stays);
  });
  check('N6', 'particles, apostrophes, macrons survive a flip', () => {
    const { tidyName } = mod('tidy');
    return allOk(PARTICLES, ([raw, want]) => {
      const r = tidyName(raw);
      return r.flipped === true && r.name === want;
    });
  });
  check('N7', 'case is never changed', () => {
    const { tidyName } = mod('tidy');
    return allOk(CASES, ([raw, want]) => {
      const r = tidyName(raw);
      return r.flipped === true && r.name === want;
    });
  });
  check('N8', 'tidying twice equals tidying once', () => {
    const { tidyName } = mod('tidy');
    const outs = [...FLIPS, ...PARTICLES, ...CASES].map(([, want]) => want);
    return allOk(outs, (out) => {
      const r = tidyName(out);
      return r.flipped === false && r.name === out;
    });
  });
  check('N9', 'a left-alone name changes spaces only', () => {
    const { tidyName } = mod('tidy');
    const cases: [string, string][] = [
      ['Example   Trust,   Albany', 'Example Trust, Albany'],
      ['  Aroha    Example  ', 'Aroha Example'],
    ];
    return allOk(cases, ([raw, want]) => {
      const r = tidyName(raw);
      return r.flipped === false && r.name === want;
    });
  });
  check('N10', 'no comma untouched; blank gives ""', () => {
    const { tidyName } = mod('tidy');
    const cases: [string, string][] = [
      ['Aroha Example', 'Aroha Example'],
      ['', ''],
      ['   ', ''],
    ];
    return allOk(cases, ([raw, want]) => {
      const r = tidyName(raw);
      return r.flipped === false && r.name === want;
    });
  });

  // ── P · the paste reader ──────────────────────────────────────────────────
  check('P1', 'name, phone, email in order', () => {
    const r = paste(
      'Aroha Example, 021 555 0101, aroha@example.com\nBen Example, 09 555 0102, ben@example.com'
    );
    return {
      ok:
        r.people.length === 2 &&
        r.found === 2 &&
        personIs(r.people[0], {
          name: 'Aroha Example',
          phone: '+64215550101',
          email: 'aroha@example.com',
        }) &&
        personIs(r.people[1], {
          name: 'Ben Example',
          phone: '+6495550102',
          email: 'ben@example.com',
        }),
      detail: shown(r),
    };
  });
  check('P2', 'missing parts: empty slot, trailing comma, name only', () => {
    const r = paste(
      [
        'Aroha Example,,aroha@example.com',
        'Ben Example, 021 555 0102,',
        'Hēmi Example',
        'Cara Example, , ',
      ].join('\n')
    );
    const p = r.people;
    return {
      ok:
        p.length === 4 &&
        personIs(p[0], { name: 'Aroha Example', email: 'aroha@example.com' }) &&
        personIs(p[1], { name: 'Ben Example', phone: '+64215550102' }) &&
        personIs(p[2], { name: 'Hēmi Example' }) &&
        personIs(p[3], { name: 'Cara Example' }),
      detail: shown(r),
    };
  });
  check('P3', 'phone first, email first, email last: found by shape', () => {
    const r = paste(
      [
        '021 555 0101, Aroha Example, aroha@example.com',
        'ben@example.com, Ben Example',
        'Cara Example, cara@example.com, 021 555 0103',
      ].join('\n')
    );
    const p = r.people;
    return {
      ok:
        p.length === 3 &&
        personIs(p[0], {
          name: 'Aroha Example',
          phone: '+64215550101',
          email: 'aroha@example.com',
        }) &&
        personIs(p[1], { name: 'Ben Example', email: 'ben@example.com' }) &&
        personIs(p[2], { name: 'Cara Example', phone: '+64215550103', email: 'cara@example.com' }),
      detail: shown(r),
    };
  });
  check('P4', 'numbers without a plus: 64..., 9 or 10 digits', () => {
    const r = paste(
      ['Aroha Example, 64215550101', 'Ben Example, 215550102', 'Cara Example, 0215550103'].join(
        '\n'
      )
    );
    const want = ['+64215550101', '+64215550102', '+64215550103'];
    return {
      ok: r.people.length === 3 && r.people.every((p: any, i: number) => p.phone === want[i]),
      detail: shown(r),
    };
  });
  check('P5', 'extra spaces, NBSP, trailing spaces', () => {
    const r = paste(
      [
        '  Aroha   Example ,  021  555  0101 ,  aroha@example.com  ',
        'Ben Example, 021 555 0102',
      ].join('\n')
    );
    const p = r.people;
    return {
      ok:
        p.length === 2 &&
        personIs(p[0], {
          name: 'Aroha Example',
          phone: '+64215550101',
          email: 'aroha@example.com',
        }) &&
        personIs(p[1], { name: 'Ben Example', phone: '+64215550102' }),
      detail: shown(r),
    };
  });
  check('P6', 'tab-separated rows, empty cells', () => {
    const r = paste(
      [
        'Aroha Example\t021 555 0101\taroha@example.com',
        'Ben Example\t\tben@example.com',
        'Cara Example\t021 555 0103\t',
      ].join('\n')
    );
    const p = r.people;
    return {
      ok:
        p.length === 3 &&
        personIs(p[0], {
          name: 'Aroha Example',
          phone: '+64215550101',
          email: 'aroha@example.com',
        }) &&
        personIs(p[1], { name: 'Ben Example', email: 'ben@example.com' }) &&
        personIs(p[2], { name: 'Cara Example', phone: '+64215550103' }),
      detail: shown(r),
    };
  });
  check('P7', 'tab row with "Smith, John" in the name cell', () => {
    const r = paste('Example, Aroha\t021 555 0101\taroha@example.com');
    return {
      ok:
        r.people.length === 1 &&
        personIs(r.people[0], {
          name: 'Aroha Example',
          phone: '+64215550101',
          email: 'aroha@example.com',
        }) &&
        r.tidied === 1,
      detail: shown(r),
    };
  });
  check('P8', '"Smith, John, 021..., a@x" flips when sure', () => {
    const r = paste('Example, Aroha, 021 555 0101, aroha@example.com');
    return {
      ok:
        r.people.length === 1 &&
        personIs(r.people[0], {
          name: 'Aroha Example',
          phone: '+64215550101',
          email: 'aroha@example.com',
        }) &&
        r.tidied === 1,
      detail: shown(r),
    };
  });
  check('P9', '"Smith, Jr", "John Smith, dad" stay as typed; W6', () => {
    const r = paste(['Example, Jr, 021 555 0101', 'Aroha Example, dad, 021 555 0102'].join('\n'));
    const p = r.people;
    return {
      ok:
        p.length === 2 &&
        personIs(p[0], { name: 'Example, Jr', phone: '+64215550101', problems: [W.W6] }) &&
        personIs(p[1], {
          name: 'Aroha Example, dad',
          phone: '+64215550102',
          problems: [W.W6],
        }) &&
        r.tidied === 0,
      detail: shown(r),
    };
  });
  check('P10', 'quoted cell holding a comma', () => {
    const r = paste(
      [
        '"Example, Aroha",021 555 0101,aroha@example.com',
        '"Example Trust, Albany",09 555 0102',
      ].join('\n')
    );
    const p = r.people;
    return {
      ok:
        p.length === 2 &&
        personIs(p[0], {
          name: 'Aroha Example',
          phone: '+64215550101',
          email: 'aroha@example.com',
        }) &&
        personIs(p[1], { name: 'Example Trust, Albany', phone: '+6495550102' }) &&
        r.tidied === 1,
      detail: shown(r),
    };
  });
  check('P11', 'two emails: first kept, W4; two phones: W5', () => {
    const r = paste(
      [
        'Aroha Example, aroha@example.com, aroha2@example.com',
        'Ben Example, 021 555 0102, 09 555 0103',
        'Cara Example, +61 4 1234 5678, 022 555 0104',
        'Dan Example, 09 555 0105, 021 555 0106',
      ].join('\n')
    );
    const p = r.people;
    return {
      ok:
        p.length === 4 &&
        personIs(p[0], { name: 'Aroha Example', email: 'aroha@example.com', problems: [W.W4] }) &&
        personIs(p[1], { name: 'Ben Example', phone: '+64215550102', problems: [W.W5] }) &&
        personIs(p[2], { name: 'Cara Example', phone: '+64225550104', problems: [W.W5] }) &&
        personIs(p[3], { name: 'Dan Example', phone: '+64215550106', problems: [W.W5] }),
      detail: shown(r),
    };
  });
  check('P12', 'unplaced part gives W7; space-only line left out', () => {
    const a = paste('Aroha Example, ---, 021 555 0101');
    const b = paste('Aroha Example 021 555 0101 aroha@example.com');
    return {
      ok:
        a.people.length === 1 &&
        personIs(a.people[0], { name: 'Aroha Example', phone: '+64215550101', problems: [W.W7] }) &&
        b.people.length === 0 &&
        b.leftOut.noName === 1 &&
        b.found === 1,
      detail: shown([a, b]),
    };
  });
  check('P13', 'CRLF, CR, blank and space-only lines, last newline', () => {
    const r = paste('A Example,021 555 0101\r\nB Example\r\n\r\n   \r\nC Example\rD Example\n');
    return {
      ok:
        r.people.length === 4 &&
        r.found === 4 &&
        isDeepStrictEqual(
          r.people.map((p: any) => p.name),
          ['A Example', 'B Example', 'C Example', 'D Example']
        ),
      detail: shown(r),
    };
  });
  check('P14', 'no name: counted in leftOut.noName, not in people', () => {
    const r = paste('021 555 0101, aroha@example.com\nBen Example');
    return {
      ok:
        r.people.length === 1 &&
        r.people[0].name === 'Ben Example' &&
        r.leftOut.noName === 1 &&
        r.found === 2,
      detail: shown(r),
    };
  });
  check('P15', 'heading-only first line skipped (tab and comma)', () => {
    const a = paste('Name,Phone,Email\nAroha Example,021 555 0101,aroha@example.com');
    const b = paste('Name\tMobile\tE-mail\nBen Example\t021 555 0102\tben@example.com');
    const c = paste('Name, Aroha');
    return {
      ok:
        a.people.length === 1 &&
        a.found === 1 &&
        a.people[0].name === 'Aroha Example' &&
        b.people.length === 1 &&
        b.found === 1 &&
        b.people[0].name === 'Ben Example' &&
        c.people.length === 1,
      detail: shown([a, b, c]),
    };
  });
  check('P16', '"Name <email>" form', () => {
    const a = paste('Aroha Example <aroha@example.com>, 021 555 0101');
    const b = paste('<ben@example.com>');
    return {
      ok:
        personIs(a.people[0], {
          name: 'Aroha Example',
          phone: '+64215550101',
          email: 'aroha@example.com',
        }) &&
        b.people.length === 0 &&
        b.leftOut.noName === 1,
      detail: shown([a, b]),
    };
  });
  check('P17', 'macrons and apostrophes survive', () => {
    const r = paste("Hēmi O'Example, 021 555 0101");
    return {
      ok:
        r.people.length === 1 &&
        personIs(r.people[0], { name: "Hēmi O'Example", phone: '+64215550101' }),
      detail: shown(r),
    };
  });
  check('P18', 'empty or space-only input: empty result, no throw', () => {
    const want = { people: [], found: 0, leftOut: { noName: 0, unreadable: 0 }, tidied: 0 };
    return allOk(['', '   ', '\n \r\n\t\n'], (t) => isDeepStrictEqual(paste(t), want));
  });
  check('P19', 'same line twice: two people, no merge, no flag', () => {
    const line = 'Aroha Example, 021 555 0101, aroha@example.com';
    const r = paste(`${line}\n${line}\nAroha E, aroha@example.com`);
    const p = r.people;
    return {
      ok:
        p.length === 3 &&
        p[0].tempId !== p[1].tempId &&
        p.every((x: any) => isDeepStrictEqual(x.problems, [])) &&
        p[2].email === 'aroha@example.com',
      detail: shown(r),
    };
  });

  // ── C · the CSV reader ────────────────────────────────────────────────────
  check('C1', 'header plus rows', () => {
    const r = csv(
      'Name,Email,Phone\nAroha Example,aroha@example.com,021 555 0101\nBen Example,ben@example.com,09 555 0102'
    );
    return {
      ok:
        r.people.length === 2 &&
        r.found === 2 &&
        personIs(r.people[0], {
          name: 'Aroha Example',
          email: 'aroha@example.com',
          phone: '+64215550101',
        }) &&
        personIs(r.people[1], {
          name: 'Ben Example',
          email: 'ben@example.com',
          phone: '+6495550102',
        }),
      detail: shown(r),
    };
  });
  check('C2', 'quoted comma stays in its cell', () => {
    const r = csv('Name,Email,Phone\n"Example Trust, Albany",office@example.com,09 555 0101');
    return {
      ok:
        r.people.length === 1 &&
        personIs(r.people[0], {
          name: 'Example Trust, Albany',
          email: 'office@example.com',
          phone: '+6495550101',
        }),
      detail: shown(r),
    };
  });
  check('C3', 'doubled quote unescaped', () => {
    const r = csv('Name,Email\n"Aroha ""Ro"" Example",aroha@example.com');
    return {
      ok:
        r.people.length === 1 &&
        personIs(r.people[0], { name: 'Aroha "Ro" Example', email: 'aroha@example.com' }),
      detail: shown(r),
    };
  });
  check('C4', 'line break inside a quoted cell', () => {
    const r = csv(
      'Name,Email,Phone\n"Aroha\nExample",aroha@example.com,021 555 0101\nBen Example,ben@example.com,021 555 0102'
    );
    return {
      ok:
        r.people.length === 2 &&
        r.found === 2 &&
        personIs(r.people[0], {
          name: 'Aroha Example',
          email: 'aroha@example.com',
          phone: '+64215550101',
        }) &&
        r.people[1].name === 'Ben Example',
      detail: shown(r),
    };
  });
  check('C5', 'CRLF, BOM, final newline, blank lines', () => {
    const r = csv(
      '﻿Name,Email,Phone\r\nAroha Example,aroha@example.com,021 555 0101\r\n\r\nBen Example,ben@example.com,\r\n'
    );
    return {
      ok:
        r.people.length === 2 &&
        r.found === 2 &&
        personIs(r.people[0], {
          name: 'Aroha Example',
          email: 'aroha@example.com',
          phone: '+64215550101',
        }) &&
        personIs(r.people[1], { name: 'Ben Example', email: 'ben@example.com' }),
      detail: shown(r),
    };
  });
  check('C6', 'guess = pop-up rule where the fixes do not apply', () => {
    const { guessColumns } = mod('csv');
    const corpus = [
      ['Name', 'Email', 'Phone'],
      ['Full Name', 'E-mail', 'Mobile'],
      ['First Name', 'Last Name', 'E-mail Address', 'Mobile Phone'],
      ['fname', 'lname', 'mail', 'tel'],
      ['Given', 'Surname', 'Notes', 'Telephone'],
      ['NAME', 'EMAIL ADDRESS', 'PHONE NUMBER', 'Address', 'Notes'],
      ['First', 'Family', 'Email', 'Mobile'],
    ];
    return allOk(corpus, (headers) =>
      isDeepStrictEqual(guessColumns(headers), headers.map(popUpGuess))
    );
  });
  check('C7', 'pop-up still holds that rule (oracle cannot drift)', () => {
    const popUp = readWork('src/components/plan/ImportCSVModal.tsx');
    const rule = [
      "lowerHeader.includes('first') || lowerHeader === 'fname' || lowerHeader === 'given'",
      "lowerHeader.includes('last') ||",
      "lowerHeader === 'lname' ||",
      "lowerHeader === 'surname' ||",
      "lowerHeader === 'family'",
      "lowerHeader.includes('name')",
      "lowerHeader.includes('email') ||",
      "lowerHeader.includes('e-mail') ||",
      "lowerHeader === 'mail'",
      "lowerHeader.includes('phone') ||",
      "lowerHeader.includes('mobile') ||",
      "lowerHeader.includes('tel')",
    ];
    const missing = rule.filter((s) => !popUp.includes(s));
    return {
      ok: missing.length === 0 && typeof mod('csv').guessColumns === 'function',
      detail: j(missing),
    };
  });
  check('C8', 'Google, Outlook, Apple headers; first match wins', () => {
    const { guessColumns, readCsv } = mod('csv');
    const googleNew = guessColumns([
      'First Name',
      'Middle Name',
      'Last Name',
      'Phonetic First Name',
      'Phonetic Middle Name',
      'Phonetic Last Name',
      'E-mail 1 - Label',
      'E-mail 1 - Value',
      'Phone 1 - Label',
      'Phone 1 - Value',
    ]);
    const googleOld = guessColumns([
      'Name',
      'E-mail 1 - Type',
      'E-mail 1 - Value',
      'Phone 1 - Type',
      'Phone 1 - Value',
    ]);
    const outlook = guessColumns([
      'First Name',
      'Last Name',
      'E-mail Address',
      'E-mail Type',
      'E-mail Display Name',
      'Mobile Phone',
      'Home Phone',
    ]);
    const apple = guessColumns(['Name', 'Mobile', 'Email']);
    const firstWins = readCsv('First Name,First Name,Last Name\nAroha,Other,Example', ids());
    const typeSkipped = readCsv(
      'Name,Phone 1 - Type,Phone 1 - Value\nAroha Example,Mobile,021 555 0101',
      ids()
    );
    return {
      ok:
        googleNew[0] === 'first' &&
        googleNew[2] === 'last' &&
        [3, 4, 5, 6, 8].every((i) => googleNew[i] === 'ignore') &&
        googleNew[7] === 'email' &&
        googleNew[9] === 'phone' &&
        isDeepStrictEqual(googleOld, ['name', 'ignore', 'email', 'ignore', 'phone']) &&
        outlook[0] === 'first' &&
        outlook[1] === 'last' &&
        outlook[2] === 'email' &&
        outlook[3] === 'ignore' &&
        outlook[5] === 'phone' &&
        outlook[6] === 'phone' &&
        isDeepStrictEqual(apple, ['name', 'phone', 'email']) &&
        personIs(firstWins.people[0], { name: 'Aroha Example' }) &&
        personIs(typeSkipped.people[0], { name: 'Aroha Example', phone: '+64215550101' }),
      detail: shown({ googleNew, googleOld, outlook, apple, firstWins, typeSkipped }),
    };
  });
  check('C9', 'First plus Last columns give "First Last"', () => {
    const r = csv('First Name,Last Name,Email\nAroha,Example,aroha@example.com');
    return {
      ok:
        r.people.length === 1 &&
        personIs(r.people[0], { name: 'Aroha Example', email: 'aroha@example.com' }) &&
        r.tidied === 0,
      detail: shown(r),
    };
  });
  check('C10', 'short rows and long rows', () => {
    const r = csv(
      'Name,Email,Phone\nAroha Example,aroha@example.com\nBen Example,ben@example.com,021 555 0102,extra,cells'
    );
    return {
      ok:
        r.people.length === 2 &&
        personIs(r.people[0], { name: 'Aroha Example', email: 'aroha@example.com' }) &&
        personIs(r.people[1], {
          name: 'Ben Example',
          email: 'ben@example.com',
          phone: '+64215550102',
        }),
      detail: shown(r),
    };
  });
  check('C11', 'empty file, header only, no name column', () => {
    const empty = csv('');
    const headerOnly = csv('Name,Email');
    const noName = csv('Email,Phone\naroha@example.com,021 555 0101');
    return {
      ok:
        empty.people.length === 0 &&
        empty.found === 0 &&
        headerOnly.people.length === 0 &&
        headerOnly.found === 0 &&
        noName.people.length === 0 &&
        noName.found === 1 &&
        noName.leftOut.noName === 1,
      detail: shown([empty, headerOnly, noName]),
    };
  });
  check('C12', 'several phone or email columns: one kept; W4/W5', () => {
    const r = csv(
      [
        'Name,Phone 1 - Value,Phone 2 - Value,Email 1 - Value,Email 2 - Value',
        'Aroha Example,+61 4 1234 5678,021 555 0101,bad-address,aroha@example.com',
        'Ben Example,021 555 0102,,ben@example.com,',
      ].join('\n')
    );
    const a = r.people[0];
    return {
      ok:
        r.people.length === 2 &&
        a.phone === '+64215550101' &&
        a.email === 'aroha@example.com' &&
        a.problems.length === 2 &&
        a.problems.includes(W.W4) &&
        a.problems.includes(W.W5) &&
        personIs(r.people[1], {
          name: 'Ben Example',
          phone: '+64215550102',
          email: 'ben@example.com',
        }),
      detail: shown(r),
    };
  });
  check('C13', 'name cell "Smith, John" tidied; same rows no merge', () => {
    const a = csv('Name,Email\n"Example, Aroha",aroha@example.com');
    const b = csv('Name,Email\nAroha Example,aroha@example.com\nAroha Example,aroha@example.com');
    return {
      ok:
        personIs(a.people[0], { name: 'Aroha Example', email: 'aroha@example.com' }) &&
        a.tidied === 1 &&
        b.people.length === 2 &&
        b.people.every((p: any) => isDeepStrictEqual(p.problems, [])),
      detail: shown([a, b]),
    };
  });

  // ── V · the vCard reader ──────────────────────────────────────────────────
  check('V1', 'card with no email and no phone is kept', () => {
    const r = vcf(card('FN:Ben Example'));
    return {
      ok:
        r.people.length === 1 &&
        personIs(r.people[0], { name: 'Ben Example' }) &&
        r.found === 1 &&
        r.leftOut.noName === 0,
      detail: shown(r),
    };
  });
  check('V2', 'no-name cards dropped, counted (email/none/ORG)', () => {
    const r = vcf(
      cards(
        card('EMAIL:nameless@example.com'),
        card(),
        card('ORG:Example Trust'),
        card('FN:', 'N:;;;;', 'TEL:021 555 0101'),
        card('FN:Kept Person')
      )
    );
    return {
      ok:
        r.people.length === 1 &&
        r.people[0].name === 'Kept Person' &&
        r.leftOut.noName === 4 &&
        r.leftOut.unreadable === 0 &&
        r.found === 5,
      detail: shown(r),
    };
  });
  check('V3', 'corrupt block counted unreadable; others read', () => {
    // vcard-parser throws on a property named "constructor" (result[key] is not an array).
    const r = vcf(
      cards(
        card('FN:Aroha Example', 'TEL:021 555 0101'),
        card('FN:Broken Card', 'constructor:boom'),
        card('FN:Ben Example')
      )
    );
    return {
      ok:
        r.people.length === 2 &&
        r.leftOut.unreadable === 1 &&
        r.leftOut.noName === 0 &&
        r.found === 3 &&
        r.people[0].name === 'Aroha Example' &&
        r.people[1].name === 'Ben Example',
      detail: shown(r),
    };
  });
  check('V4', 'several emails: the chosen rule', () => {
    const r = vcf(
      cards(
        card('FN:Aroha Example', 'EMAIL:bad-address', 'EMAIL:second@example.com'),
        card(
          'FN:Ben Example',
          'EMAIL;TYPE=HOME:home@example.com',
          'EMAIL;TYPE=WORK,PREF:pref@example.com'
        ),
        card('FN:Cara Example', 'EMAIL:first@example.com', 'EMAIL:second@example.com'),
        card('FN:Dan Example', 'EMAIL:bad-one', 'EMAIL:bad-two')
      )
    );
    const p = r.people;
    return {
      ok:
        p.length === 4 &&
        personIs(p[0], { name: 'Aroha Example', email: 'second@example.com', problems: [W.W4] }) &&
        personIs(p[1], { name: 'Ben Example', email: 'pref@example.com', problems: [W.W4] }) &&
        personIs(p[2], { name: 'Cara Example', email: 'first@example.com', problems: [W.W4] }) &&
        p[3].email === 'bad-one' &&
        p[3].problems.length === 2 &&
        p[3].problems.includes(W.W1) &&
        p[3].problems.includes(W.W4),
      detail: shown(r),
    };
  });
  check('V5', 'several phones: the chosen rule', () => {
    const r = vcf(
      cards(
        card('FN:Aroha Example', 'TEL:+61 4 1234 5678', 'TEL:021 555 0101'),
        card('FN:Ben Example', 'TEL;TYPE=HOME:09 555 0102', 'TEL;TYPE=CELL:021 555 0103'),
        card('FN:Cara Example', 'TEL;TYPE=WORK,PREF:09 555 0104', 'TEL:021 555 0105'),
        card('FN:Dan Example', 'TEL:09 555 0106', 'TEL;TYPE=PREF:03 555 0107'),
        card('FN:Eve Example', 'TEL:09 555 0108')
      )
    );
    const p = r.people;
    return {
      ok:
        p.length === 5 &&
        personIs(p[0], { name: 'Aroha Example', phone: '+64215550101', problems: [W.W5] }) &&
        personIs(p[1], { name: 'Ben Example', phone: '+64215550103', problems: [W.W5] }) &&
        personIs(p[2], { name: 'Cara Example', phone: '+64215550105', problems: [W.W5] }) &&
        personIs(p[3], { name: 'Dan Example', phone: '+6435550107', problems: [W.W5] }) &&
        personIs(p[4], { name: 'Eve Example', phone: '+6495550108' }),
      detail: shown(r),
    };
  });
  check('V6', 'dropped extras give W4 or W5', () => {
    const r = vcf(
      cards(
        card('FN:Aroha Example', 'EMAIL:a@example.com', 'TEL:021 555 0101'),
        card('FN:Ben Example', 'EMAIL:b1@example.com', 'EMAIL:b2@example.com'),
        card('FN:Cara Example', 'TEL:021 555 0103', 'TEL:021 555 0104'),
        card(
          'FN:Dan Example',
          'EMAIL:d1@example.com',
          'EMAIL:d2@example.com',
          'TEL:021 555 0105',
          'TEL:021 555 0106'
        )
      )
    );
    const p = r.people;
    return {
      ok:
        p.length === 4 &&
        isDeepStrictEqual(p[0].problems, []) &&
        isDeepStrictEqual(p[1].problems, [W.W4]) &&
        isDeepStrictEqual(p[2].problems, [W.W5]) &&
        p[3].problems.length === 2 &&
        p[3].problems.includes(W.W4) &&
        p[3].problems.includes(W.W5),
      detail: shown(r),
    };
  });
  check('V7', 'overseas and malformed numbers kept and flagged', () => {
    const r = vcf(
      cards(
        card('FN:Aroha Example', 'TEL:+61 4 1234 5678'),
        card('FN:Ben Example', 'TEL:12345'),
        card('FN:Cara Example', 'EMAIL:bad')
      )
    );
    const p = r.people;
    return {
      ok:
        p.length === 3 &&
        personIs(p[0], { name: 'Aroha Example', phone: '+61 4 1234 5678', problems: [W.W2] }) &&
        personIs(p[1], { name: 'Ben Example', phone: '12345', problems: [W.W3] }) &&
        personIs(p[2], { name: 'Cara Example', email: 'bad', problems: [W.W1] }),
      detail: shown(r),
    };
  });
  check('V8', 'quoted-printable macrons', () => {
    const r = vcf(
      cards(
        card(
          'FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:H=C4=93mi T=C5=ABhoe',
          'EMAIL:hemi@example.com'
        ),
        card('FN:Hana Tūhoe-Example')
      )
    );
    return {
      ok:
        r.people.length === 2 &&
        personIs(r.people[0], { name: 'Hēmi Tūhoe', email: 'hemi@example.com' }) &&
        r.people[1].name === 'Hana Tūhoe-Example',
      detail: shown(r),
    };
  });
  check('V9', 'vCard 3.0 and 4.0, folded lines, CRLF and LF', () => {
    const lf = ['BEGIN:VCARD', 'VERSION:3.0', 'FN:Ben Example', 'TEL:021 555 0102', 'END:VCARD'];
    const folded = [
      'BEGIN:VCARD',
      'VERSION:4.0',
      'FN:Aroha Exa',
      ' mple',
      'EMAIL:aroha@example.com',
      'END:VCARD',
    ];
    const r = vcf(`${lf.join('\n')}\n${folded.join('\r\n')}`);
    return {
      ok:
        r.people.length === 2 &&
        personIs(r.people[0], { name: 'Ben Example', phone: '+64215550102' }) &&
        personIs(r.people[1], { name: 'Aroha Example', email: 'aroha@example.com' }),
      detail: shown(r),
    };
  });
  check('V10', 'N-only card gives "Given Middle Family"; FN tidied', () => {
    const n = vcf(card('N:Example;Aroha;Jane;;'));
    const escaped = vcf(card('FN:Example\\, Aroha'));
    const loose = vcf(card('FN:Example, Aroha')); // an unescaped comma reaches the parser as an array
    return {
      ok:
        n.people.length === 1 &&
        n.people[0].name === 'Aroha Jane Example' &&
        n.tidied === 0 &&
        escaped.people[0]?.name === 'Aroha Example' &&
        escaped.tidied === 1 &&
        loose.people[0]?.name === 'Aroha Example' &&
        loose.tidied === 1,
      detail: shown([n, escaped, loose]),
    };
  });
  check('V11', 'grouped lines (item1.TEL): records what happens', () => {
    // vcard-parser reads "item1.TEL" as tel (the group becomes a namespace).
    const r = vcf(
      card(
        'FN:Aroha Example',
        'item1.TEL;type=CELL;type=VOICE:021 555 0101',
        'item1.X-ABLabel:Mobile'
      )
    );
    return {
      ok:
        r.people.length === 1 &&
        personIs(r.people[0], { name: 'Aroha Example', phone: '+64215550101' }),
      detail: shown(r),
    };
  });
  check('V12', 'new reader = old parseVCF + the cards it dropped', () => {
    const { parseVCF } = mod('oldvcf');
    const text = cards(
      card('FN:Aroha Example', 'EMAIL:aroha@example.com', 'TEL:021 555 0101'),
      card('FN:Ben Example', 'EMAIL:ben@example.com'),
      card('FN:Cara Example', 'TEL:021 555 0103'),
      card('FN:Dan Example'),
      card('FN:Eve Example'),
      card('EMAIL:nameless@example.com')
    );
    const old = parseVCF(text);
    const r = vcf(text);
    const sameAsOld = old.contacts.every((c: any) => {
      const p = r.people.find((x: any) => x.name === c.name);
      return p && p.email === (c.email ?? undefined) && p.phone === (c.phone ?? undefined);
    });
    return {
      ok:
        old.contacts.length === 3 &&
        old.skippedCount === 3 &&
        r.people.length === 5 &&
        r.leftOut.noName === 1 &&
        sameAsOld,
      detail: shown({ old, r }),
    };
  });
  check('V13', 'file with no cards: found 0', () => {
    const r = vcf('not a card at all\nBEGIN:VCARDX\n');
    return {
      ok:
        r.people.length === 0 &&
        r.found === 0 &&
        isDeepStrictEqual(r.leftOut, { noName: 0, unreadable: 0 }) &&
        r.tidied === 0,
      detail: shown(r),
    };
  });

  // ── S · the shape ─────────────────────────────────────────────────────────
  check('S1', 'a person has exactly tempId, name, problems (+)', () => {
    const full = paste('Aroha Example, 021 555 0101, aroha@example.com').people[0];
    const bare = paste('Ben Example').people[0];
    return {
      ok:
        isDeepStrictEqual(Object.keys(full).sort(), [
          'email',
          'name',
          'phone',
          'problems',
          'tempId',
        ]) && isDeepStrictEqual(Object.keys(bare).sort(), ['name', 'problems', 'tempId']),
      detail: shown([full, bare]),
    };
  });
  check('S2', 'tempIds unique; injectable', () => {
    const text = Array.from({ length: 50 }, (_, i) => `Person ${i} Example`).join('\n');
    const a = mod('paste').readPaste(text);
    const b = mod('paste').readPaste(text);
    const all = [...a.people, ...b.people].map((p: any) => p.tempId);
    const injected = paste('A Example\nB Example').people.map((p: any) => p.tempId);
    return {
      ok:
        all.length === 100 &&
        all.every((x: unknown) => typeof x === 'string' && (x as string).length > 0) &&
        new Set(all).size === 100 &&
        isDeepStrictEqual(injected, ['t1', 't2']),
      detail: j(injected),
    };
  });
  check('S3', 'absent email or phone: key missing, never "" / null', () => {
    const people = allPeople();
    return allOk(people, (p: any) => {
      if ('email' in p && !(typeof p.email === 'string' && p.email.length > 0)) return false;
      if ('phone' in p && !(typeof p.phone === 'string' && p.phone.length > 0)) return false;
      return Object.values(p).every((v) => v !== null && v !== undefined);
    });
  });
  check('S4', 'JSON round trip equals itself', () => {
    return samples().every((r: any) => isDeepStrictEqual(JSON.parse(JSON.stringify(r)), r));
  });
  check('S5', 'name trimmed, single spaces, never empty', () => {
    const odd = paste(
      '  Aroha    Example  , 021 555 0101\n\tBen  Example\t\t021 555 0102\n"Cara\nExample",x'
    );
    const names = [...allPeople(), ...odd.people].map((p: any) => p.name);
    return allOk(
      names,
      (n: string) => n.length > 0 && n === n.trim() && !/\s{2,}/.test(n) && !/[\t\n\r ]/.test(n)
    );
  });
  check('S6', 'every problem sentence is one of W1 to W7', () => {
    const words = mod('types').WORDS;
    const wordsOk = isDeepStrictEqual(
      [words.W1, words.W2, words.W3, words.W4, words.W5, words.W6, words.W7],
      W_ALL
    );
    const seen = allPeople().flatMap((p: any) => p.problems);
    return {
      ok: wordsOk && seen.length > 0 && seen.every((s: string) => W_ALL.includes(s)),
      detail: j(seen.filter((s: string) => !W_ALL.includes(s))),
    };
  });
  check('S7', 'a result has exactly people, found, leftOut, tidied', () => {
    return allOk(samples(), (r: any) => {
      return (
        isDeepStrictEqual(Object.keys(r).sort(), ['found', 'leftOut', 'people', 'tidied']) &&
        isDeepStrictEqual(Object.keys(r.leftOut).sort(), ['noName', 'unreadable']) &&
        Array.isArray(r.people) &&
        [r.found, r.tidied, r.leftOut.noName, r.leftOut.unreadable].every(
          (n) => Number.isInteger(n) && n >= 0
        )
      );
    });
  });

  // ── T · the tidied count ──────────────────────────────────────────────────
  check('T1', 'paste: a flipped name adds 1 to tidied', () => {
    const r = paste('Example, Aroha, 021 555 0101\nBen Example, 021 555 0102');
    return { ok: r.tidied === 1 && r.people[0].name === 'Aroha Example', detail: shown(r) };
  });
  check('T2', 'file: a flipped name adds 1 to tidied', () => {
    const r = csv('Name,Phone\n"Example, Aroha",021 555 0101\nBen Example,021 555 0102');
    return { ok: r.tidied === 1 && r.people[0].name === 'Aroha Example', detail: shown(r) };
  });
  check('T3', 'vCard: a flipped name adds 1 to tidied', () => {
    const r = vcf(cards(card('FN:Example\\, Aroha'), card('FN:Ben Example')));
    return { ok: r.tidied === 1 && r.people[0].name === 'Aroha Example', detail: shown(r) };
  });
  check('T4', 'a name left as typed adds nothing to tidied', () => {
    const a = paste('Example, Jr, 021 555 0101\nAroha Example, dad\nAroha Example');
    const b = csv('Name\n"Example Trust, Albany"\nBen Example');
    const c = vcf(cards(card('FN:Example Trust\\, Albany'), card('FN:Ben Example')));
    const d = csv('First Name,Last Name\nAroha,Example');
    const e = vcf(card('N:Example;Aroha;;;'));
    return {
      ok: [a, b, c, d, e].every((r: any) => r.tidied === 0),
      detail: shown([a.tidied, b.tidied, c.tidied, d.tidied, e.tidied]),
    };
  });
  check('T5', 'no name is counted twice', () => {
    const text = [
      'Example, Aroha, 021 555 0101',
      'Sample, Ben, 021 555 0102',
      'Example, Jr, 021 555 0103',
      'Cara Example',
      'Dan Example',
    ].join('\n');
    const r = paste(text);
    const again = paste(r.people.map((p: any) => p.name).join('\n'));
    return {
      ok: r.tidied === 2 && again.tidied === 0,
      detail: shown([r.tidied, again.tidied]),
    };
  });

  // ── G · pure functions, in the browser, nothing else ──────────────────────
  check('G1', 'the folder holds the expected files', () => {
    const have = srcFiles();
    const missing = EXPECTED_FILES.filter((f) => !have.includes(f));
    return { ok: missing.length === 0, detail: `missing: ${j(missing)}` };
  });
  check('G2', 'no server imports (prisma, next/server, fs, …)', () => {
    const files = srcFiles();
    if (files.length === 0)
      return { ok: false, detail: 'src/lib/contact-import/ is empty or missing' };
    const re = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+)['"]([^'"]+)['"]/gm;
    const off: string[] = [];
    for (const f of files) {
      for (const m of codeOf(f).matchAll(re)) {
        const spec = m[1];
        const ok = spec.startsWith('./') || spec === '@/lib/phone' || spec === '@/lib/vcard';
        if (!ok) off.push(`${f}: ${spec}`);
      }
    }
    return { ok: off.length === 0, detail: j(off) };
  });
  check('G3', 'no storage, network, logging or DOM', () => {
    return noneMatch(
      /\b(localStorage|sessionStorage|indexedDB|fetch|XMLHttpRequest|WebSocket|console|document|window|navigator|process\.env)\b/
    );
  });
  check('G4', 'no child, kid, role or household logic', () => {
    return noneMatch(
      /\b(child|children|kid|kids|isChild|role|roles|household|households|littleCount)\b/i
    );
  });
  check('G5', 'no duplicate or merge logic', () => {
    return noneMatch(/\b(duplicate|duplicates|dedupe|dedup|isDuplicate|merge|merged|merging)\b/i);
  });
  check('G6', 'same input, same output (ids injected)', () => {
    const once = [paste(PASTE_SAMPLE), csv(CSV_SAMPLE), vcf(VCF_SAMPLE)];
    const twice = [paste(PASTE_SAMPLE), csv(CSV_SAMPLE), vcf(VCF_SAMPLE)];
    return isDeepStrictEqual(once, twice);
  });
  check('G7', 'problem sentences hold no contact content', () => {
    const results = [
      paste(
        [
          'Zzyzx Qux, 021 555 0147, zzyzx@bad',
          'Qux Zzyzx, Jr, +61 4 5555 0147',
          'Zzyzx Qux, ###, a@example.com, b@example.com',
        ].join('\n')
      ),
      csv('Name,Phone,Email\nZzyzx Qux,+61 4 5555 0147,zzyzx@bad'),
      vcf(
        card('FN:Zzyzx Qux', 'TEL:+61 4 5555 0147', 'EMAIL:zzyzx@bad', 'EMAIL:other@example.com')
      ),
    ];
    const seen = results.flatMap((r: any) => r.people.flatMap((p: any) => p.problems));
    const leak = seen.filter((s: string) => /\d|@|zzyzx|qux/i.test(s));
    return { ok: seen.length > 0 && leak.length === 0, detail: j(leak) };
  });

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n──────────────────────────');
  console.log(`Results: ${passed} passed, ${failed} failed (of ${passed + failed})`);
  console.log(`GREEN (${greens.length}): ${greens.join(' ')}`);
  console.log(`RED (${reds.length}): ${reds.join(' ')}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
