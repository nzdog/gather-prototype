/**
 * [[GTC-460]] Stage 3, step 3e — THE STAGE 3 BRANCH TOUCHES NOTHING IT SHOULD NOT (the plan's
 * `test:contacts-untouched`; rulings 44 and 53, the tips under "What the plan missed", and
 * rulings 185 and 186).
 *
 * WHAT THIS PINS, IN PLAIN WORDS. Stage 3 adds a contacts page, a list kept in the host's own
 * browser, and a way to pick people on the household form. It must not reach into anything that
 * sends, signs in, bills or reads the database for the first time. This file proves that by
 * comparing the working folder with the base commit and reading the new files.
 *
 * THE BASE. `03bab34`, main's tip, merged into the branch on 21 Nov 2026 (ruling 208). It is no
 * longer `290f828` (ruling 186) or the old `51eda95`: main's twelve commits (GTC-464, GTC-465 and
 * GTC-466) came in with the merge and are not Stage 3's work, just as the GTC-463 fix that came in
 * with the earlier merge was not (it changed three routes under `src/app/api`). The checks compare the
 * working folder (committed, staged or loose) with the base, so they hold before and after any
 * commit. If the base is not in the checkout, the first check goes red and so does every check
 * that needs it: nothing here can pass by looking at nothing.
 *
 *   U  the base is here, and the diff against it really holds Stage 3's work (not vacuous)
 *   R  no file added under `src/app/api`; `route-classifications.json` unchanged
 *   Z  the diff lists nothing in the areas Stage 3 may not touch (prefix logic, not exact names)
 *   B  byte for byte the base: the contact-import folder and four named files
 *   W  no added line of `src` names the words Stage 3 may not use (tests are not scanned: they
 *      hold those words as text)
 *   P  `package.json` differs from the base by the new script lines only (read as data)
 *   N  the new files import no server module (followed through their imports) and hold none of
 *      the plan's forbidden words, except three allowed plain GETs ([[GTC-470]], amendment A5: the
 *      event's households, the event and its summary)
 *
 * No database, no network, no server. It reads git and files. Every check is green on arrival by
 * nature, so each was broken once on a scratch clone outside the repo (see the 3e evidence).
 * Run: npx tsx --tsconfig tests/tsconfig.json tests/contacts-untouched-test.ts
 *      (npm run test:contacts-untouched)
 */
import fs from 'fs';
import path from 'path';
import { execFileSync, type ExecFileSyncOptions } from 'child_process';
import { isDeepStrictEqual } from 'util';

const ROOT = path.join(__dirname, '..');
const BASE = '03bab34';

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
    if (got !== undefined) console.log(`    got: ${String(JSON.stringify(got)).slice(0, 400)}`);
  }
}
const section = (s: string) => console.log(`\n\x1b[1m\x1b[33m${s}\x1b[0m`);

// ── git, read only ───────────────────────────────────────────────────────────
const GIT_IO: ExecFileSyncOptions = {
  cwd: ROOT,
  maxBuffer: 1 << 28,
  stdio: ['ignore', 'pipe', 'pipe'],
};
const git = (args: string[]): string => execFileSync('git', args, { ...GIT_IO, encoding: 'utf8' });
const gitBytes = (args: string[]): Buffer => execFileSync('git', args, { ...GIT_IO }) as Buffer;
/** A `-z` list (NUL between names), so odd characters in a name never get quoted. */
const names = (s: string) => s.split('\0').filter((p) => p && path.basename(p) !== '.DS_Store');

let baseOk = false;
try {
  git(['cat-file', '-e', `${BASE}^{commit}`]);
  baseOk = true;
} catch {
  baseOk = false;
}

/** Every path that differs from the base: committed, staged, edited or loose (untracked). */
const tracked = baseOk ? names(git(['diff', '--no-renames', '--name-only', '-z', BASE, '--'])) : [];
const trackedAdded = baseOk
  ? names(git(['diff', '--no-renames', '--name-only', '-z', '--diff-filter=A', BASE, '--']))
  : [];
const untracked = names(git(['ls-files', '--others', '--exclude-standard', '-z']));
const changed = [...new Set([...tracked, ...untracked])];
const added = [...new Set([...trackedAdded, ...untracked])];
const baseFiles = baseOk ? names(git(['ls-tree', '-r', '--name-only', '-z', BASE])) : [];
const baseHas = (p: string) => baseFiles.includes(p);

/*
 * ⚠ FOUR CHECKS ASKED AT FIXED COMMITS SINCE [[GTC-478]] (23 Nov 2026, the founder's ruling 2 on its
 * plan: "Yes to the older checks you listed being compared at fixed commits ending at c686175").
 * GTC-478 adds a route file, a migration, two classification entries (one corrected) and one test
 * script, on purpose. R1, R2, Z9 and P2 therefore compare the base with c686175 (main's tip when
 * GTC-478 began, the merge of GTC-477) instead of with the working folder: the same question, the
 * same strictness, for the history up to c686175. Every other check here still reads the working
 * folder. A commit missing from the checkout turns them red, so none can pass by looking at nothing.
 */
const GTC478_FROZEN = 'c686175';
let frozenOk = false;
try {
  git(['cat-file', '-e', `${GTC478_FROZEN}^{commit}`]);
  frozenOk = baseOk;
} catch {
  frozenOk = false;
}
const frozenChanged = frozenOk
  ? names(git(['diff', '--no-renames', '--name-only', '-z', BASE, GTC478_FROZEN, '--']))
  : [];
const frozenAdded = frozenOk
  ? names(
      git([
        'diff',
        '--no-renames',
        '--name-only',
        '-z',
        '--diff-filter=A',
        BASE,
        GTC478_FROZEN,
        '--',
      ])
    )
  : [];

const onDisk = (p: string) => path.join(ROOT, p);
const read = (p: string) => fs.readFileSync(onDisk(p), 'utf8');
const isCode = (p: string) => /\.(ts|tsx)$/.test(p);
/**
 * ⚠ NAMED EXCEPTIONS AT [[GTC-472]] (22 Nov 2026, founder ruling on the report: "one named exception for
 * the share route or its files"). These five files are GTC-472's, not Stage 3's: the share route, its two
 * libraries, its screen and the guest amount helper. Each is named in full. R1, R2, Z10, P2 and the new
 * files' scans below carry the same ticket's other named exceptions, each beside its check.
 */
const GTC472_SRC = [
  'src/app/api/events/[id]/items/[itemId]/share/route.ts',
  'src/lib/moment3/share-split.ts',
  'src/lib/moment3/share-dish.ts',
  'src/components/plan/Moment3ShareDish.tsx',
  'src/lib/guest/guest-amount.ts',
];
/** The new source files: added since the base, under src, that are code (GTC-472's five are named out). */
/*
 * ⚠ ONE NAMED FILE AT [[GTC-478]] (23 Nov 2026, under the founder's standing word on older pins: a
 * check red only because of a change approved there may be moved, the narrowest change). The new
 * session route imports the server (it is a route, like GTC-472's share route above) and logs its
 * errors, so it is named out of the new files' scans (N) by its exact path. GTC-478's two other new
 * src files, src/lib/sessions/switch.ts and input.ts, import nothing and stay in the scans.
 */
const GTC478_SRC = ['src/app/api/events/[id]/days/[dayId]/route.ts'];
const newSrc = added.filter(
  (p) =>
    p.startsWith('src/') &&
    isCode(p) &&
    !GTC472_SRC.includes(p) &&
    !GTC478_SRC.includes(p) &&
    fs.existsSync(onDisk(p))
);

/** True when the file now is exactly the file at the base, byte for byte. */
function sameAsBase(p: string): boolean {
  if (!baseHas(p) || !fs.existsSync(onDisk(p))) return false;
  return gitBytes(['show', `${BASE}:${p}`]).equals(fs.readFileSync(onDisk(p)));
}

function main() {
  // ── U: the base, and that the diff is not empty ────────────────────────────
  section('U — the base is here, and the diff holds Stage 3');
  report(
    'U1',
    `the base ${BASE} is in this checkout, so the diff checks below can mean something`,
    baseOk
  );
  const NEED = [
    'src/app/plan/contacts/page.tsx',
    'src/components/contacts/ContactsScreen.tsx',
    'src/lib/contacts/store.ts',
  ];
  report(
    'U2',
    "the diff against the base really holds Stage 3's work (the contacts page, screen and store are added)",
    baseOk && NEED.every((p) => added.includes(p)) && newSrc.length >= 10,
    { missing: NEED.filter((p) => !added.includes(p)), newSrcFiles: newSrc.length }
  );

  // ── R: no new route, no route classification ───────────────────────────────
  section('R — no new route');
  const SHARE_ROUTE = 'src/app/api/events/[id]/items/[itemId]/share/route.ts';
  const newApi = frozenAdded.filter((p) => p.startsWith('src/app/api/') && p !== SHARE_ROUTE);
  report(
    'R1',
    'no file is ADDED under src/app/api (a page under src/app is allowed, ruling 53), from the base to c686175 (GTC-478)',
    frozenOk && baseFiles.some((p) => p.startsWith('src/app/api/')) && newApi.length === 0,
    newApi
  );
  // ⚠ ONE NAMED ENTRY AT [[GTC-472]] (founder ruling D2 A, 22 Nov 2026: "one new entry in
  // route-classifications.json. Counts only."): the file is the base's byte for byte once the share
  // route's one entry, written out here in full, is taken out of it. Any other change still turns R2 red.
  const SHARE_ENTRY =
    '  {\n' +
    '    "filePath": "src/app/api/events/[id]/items/[itemId]/share/route.ts",\n' +
    '    "apiPath": "/api/events/:id/items/:itemId/share",\n' +
    '    "methods": ["POST"],\n' +
    '    "authType": "SESSION",\n' +
    '    "authEvidence": ["requireEventRole"],\n' +
    '    "securityIssues": []\n' +
    '  },\n';
  const classNow = frozenOk ? git(['show', `${GTC478_FROZEN}:route-classifications.json`]) : '';
  const classBase =
    baseOk && baseHas('route-classifications.json')
      ? git(['show', `${BASE}:route-classifications.json`])
      : '';
  report(
    'R2',
    "route-classifications.json is the base's, byte for byte, but for the one share-route entry (GTC-472), read at c686175 (GTC-478)",
    frozenOk &&
      classBase.length > 0 &&
      classNow.split(SHARE_ENTRY).length === 2 &&
      classNow.replace(SHARE_ENTRY, '') === classBase,
    frozenChanged.filter((p) => p.endsWith('route-classifications.json'))
  );

  // ── Z: the areas Stage 3 may not touch ─────────────────────────────────────
  section('Z — the diff lists nothing in these areas');
  // `prefixes` must exist at the base (so a mistyped prefix cannot pass by matching nothing);
  // `alsoWatch` are places a file could appear later, watched but not required to exist.
  const ZONES: { id: string; label: string; prefixes: string[]; alsoWatch?: string[] }[] = [
    {
      id: 'Z1',
      label: 'middleware.ts (at the root, and src/middleware.*)',
      prefixes: ['middleware.'],
      alsoWatch: ['src/middleware.'],
    },
    { id: 'Z2', label: 'src/lib/auth* (the file and the folder)', prefixes: ['src/lib/auth'] },
    { id: 'Z3', label: 'src/app/api/auth', prefixes: ['src/app/api/auth'] },
    { id: 'Z4', label: 'the sign-in pages (src/app/auth)', prefixes: ['src/app/auth/'] },
    {
      id: 'Z5',
      label: 'billing (the pages, the library, the routes)',
      prefixes: ['src/app/billing', 'src/lib/billing', 'src/app/api/billing'],
    },
    {
      id: 'Z6',
      label: 'Stripe (src/lib/stripe*, the Stripe webhook)',
      prefixes: ['src/lib/stripe', 'src/app/api/webhooks/stripe'],
    },
    { id: 'Z7', label: 'src/lib/sms/', prefixes: ['src/lib/sms/'] },
    { id: 'Z8', label: 'src/app/api/cron', prefixes: ['src/app/api/cron'] },
    { id: 'Z9', label: 'prisma/', prefixes: ['prisma/'] },
    { id: 'Z10', label: 'tests/security-*', prefixes: ['tests/security-'] },
  ];
  for (const z of ZONES) {
    const watch = [...z.prefixes, ...(z.alsoWatch ?? [])];
    // ⚠ ONE NAMED FILE AT [[GTC-472]] (22 Nov 2026): Z10 passes over the scan control's counts, which the
    // founder ruled (D2 A, "Counts only"); tests/tweaks-guard-test.ts pins that file's whole text by hash.
    // ⚠ A SECOND NAMED FILE AT [[GTC-477]] (23 Nov 2026, the founder's ruling 2 on its plan: "The security
    // suite grows from 257 to 262 checks. Yes to ... naming tests/security-validation.ts in contacts-untouched
    // Z10, each with a dated note. No existing security check is changed or weakened."): suite 19 gains the
    // host's create. tests/tweaks-guard-test.ts pins that file's whole text by hash too.
    const NAMED: Record<string, string[]> = {
      Z10: ['tests/security-route-scan-control.ts', 'tests/security-validation.ts'],
    };
    // ⚠ Z9 ASKED FROM THE BASE TO c686175 SINCE [[GTC-478]] (the founder's ruling 2 on its plan; see
    // GTC478_FROZEN above): GTC-478's migration is in prisma/ on purpose. Every other zone reads the
    // working folder as before.
    const frozen = z.id === 'Z9';
    const hit = (frozen ? frozenChanged : changed).filter(
      (p) => !(NAMED[z.id] ?? []).includes(p) && watch.some((x) => p.startsWith(x))
    );
    const missing = z.prefixes.filter((x) => !baseFiles.some((p) => p.startsWith(x)));
    report(
      z.id,
      `the diff lists nothing in ${z.label}`,
      (frozen ? frozenOk : baseOk) && missing.length === 0 && hit.length === 0,
      missing.length ? { notInBase: missing } : hit
    );
  }

  // ── B: byte for byte the base ──────────────────────────────────────────────
  section('B — byte for byte the base');
  const FOLDER = 'src/lib/contact-import/';
  const inBase = baseFiles.filter((p) => p.startsWith(FOLDER));
  const nowListed = names(
    git(['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', FOLDER])
  ).filter((p) => fs.existsSync(onDisk(p)));
  const folderDiffs = inBase.filter((p) => !sameAsBase(p));
  const folderExtras = nowListed.filter((p) => !baseHas(p));
  report(
    'B1',
    `${FOLDER} is the base: every file the same, none added, none gone`,
    baseOk &&
      inBase.length >= 5 &&
      folderDiffs.length === 0 &&
      folderExtras.length === 0 &&
      !changed.some((p) => p.startsWith(FOLDER)),
    { files: inBase.length, differ: folderDiffs, extra: folderExtras }
  );
  const FILES: [string, string][] = [
    ['B2', 'src/components/plan/ImportCSVModal.tsx'],
    ['B3', 'src/components/plan/PeopleSection.tsx'],
    ['B4', 'src/components/plan/HouseholdCardList.tsx'],
    ['B5', 'src/components/shared/Providers.tsx'],
  ];
  for (const [id, p] of FILES) {
    report(
      id,
      `${p} is the base, byte for byte, and not listed in the diff`,
      baseOk && sameAsBase(p) && !changed.includes(p)
    );
  }

  // ── W: words that may not be added to src ──────────────────────────────────
  section('W — words that may not be added to src');
  // Every line added since the base, in src. Only added lines: removing a line that names a word
  // is fine. Read hunk by hunk, so a code line that begins with plus signs is not taken for a header.
  const addedLines: string[] = [];
  if (baseOk) {
    let inHunk = false;
    for (const l of git(['diff', '-U0', '--no-renames', '--no-color', BASE, '--', 'src']).split(
      '\n'
    )) {
      if (l.startsWith('diff --git ')) inHunk = false;
      else if (l.startsWith('@@')) inHunk = true;
      else if (inHunk && l.startsWith('+')) addedLines.push(l.slice(1));
    }
  }
  const looseSrc = untracked.filter((p) => p.startsWith('src/') && fs.existsSync(onDisk(p)));
  for (const p of looseSrc) addedLines.push(...read(p).split('\n'));
  // Case-insensitive: Prisma's accessors are `smsOptOut`, `emailOptOut` and `emailBlock`.
  const BANNED = /SmsOptOut|smsOptedOut|opt-out-service|EmailOptOut|EmailBlock|messagingUndecided/i;
  const bannedHits = addedLines.filter((l) => BANNED.test(l));
  report(
    'W1',
    'no line added to src names SmsOptOut, smsOptedOut, opt-out-service, EmailOptOut, EmailBlock or messagingUndecided',
    baseOk && addedLines.length > 0 && bannedHits.length === 0,
    bannedHits.slice(0, 5)
  );
  report(
    'W2',
    "the scan is not vacuous: the added lines really hold Stage 3's code (the contacts store is read)",
    baseOk && addedLines.length > 500 && addedLines.some((l) => /contacts\/store/.test(l)),
    { addedLines: addedLines.length }
  );

  // ── P: package.json ────────────────────────────────────────────────────────
  section('P — package.json');
  let pkgNow: any = null;
  let pkgBase: any = null;
  try {
    pkgNow = JSON.parse(read('package.json'));
    pkgBase = baseOk ? JSON.parse(git(['show', `${BASE}:package.json`])) : null;
  } catch {
    pkgNow = pkgNow ?? null;
  }
  // [[GTC-475]] (founder ruling G, 23 Nov 2026: "Freeze P1 the way GTC-474 froze G3: read package.json at
  // that suite's own ticket commit instead of the working folder"). P1 asked whether Stage 3 changed
  // package.json by anything but added scripts. It read the working folder, so main's Next.js bump
  // (15.5.27 to 15.5.29, d80483d) turned it red for work that is not Stage 3's. It now reads the file at
  // 55a9324, the commit that last edited this suite for its own ticket (ruling 208, 21 Nov 2026), where
  // package.json differs from the base only by the eight added scripts. Same comparison, same strictness;
  // a commit that is not in the checkout turns it red, so it cannot pass by looking at nothing. P2 below
  // still reads the working folder: it is the one that watches which scripts are added later.
  const P1_FROZEN = '55a932488edc2d0c140866893f43d4a607df48ed';
  let pkgFrozen: any = null;
  try {
    git(['cat-file', '-e', `${P1_FROZEN}^{commit}`]);
    pkgFrozen = JSON.parse(git(['show', `${P1_FROZEN}:package.json`]));
  } catch {
    pkgFrozen = null;
  }
  if (pkgFrozen && pkgBase) {
    const { scripts: sFrozen, ...restFrozen } = pkgFrozen;
    const { scripts: sBase, ...restBase } = pkgBase;
    const keptScripts = Object.keys(sBase).filter((k) => sFrozen[k] !== sBase[k]);
    report(
      'P1',
      "package.json differs from the base only by added script lines (nothing else, no script changed or removed), read at this suite's own ticket commit 55a9324",
      isDeepStrictEqual(restFrozen, restBase) && keptScripts.length === 0,
      { changedOrRemovedScripts: keptScripts, restSame: isDeepStrictEqual(restFrozen, restBase) }
    );
  } else {
    report(
      'P1',
      'package.json can be read at the base and at the frozen commit 55a9324 (both must be in this checkout)',
      false
    );
  }
  // ⚠ P2 READS package.json AT c686175 SINCE [[GTC-478]] (the founder's ruling 2 on its plan; see
  // GTC478_FROZEN above): GTC-478 adds test:sessions-foundation on purpose. Same question, same
  // strictness, for the scripts added up to c686175.
  let pkgP2: any = null;
  try {
    pkgP2 = frozenOk ? JSON.parse(git(['show', `${GTC478_FROZEN}:package.json`])) : null;
  } catch {
    pkgP2 = null;
  }
  if (pkgP2 && pkgBase) {
    const newKeys = Object.keys(pkgP2.scripts).filter((k) => !(k in pkgBase.scripts));
    const EIGHT = ['store', 'page', 'load', 'picker', 'match', 'form', 'placed', 'untouched'].map(
      (n) => `test:contacts-${n}`
    );
    // [[GTC-469]] (founder, 22 Nov 2026): exactly one other script may be added, by name. Any
    // other added script, and a missing contacts script, still turn P2 red.
    // [[GTC-472]] (founder, 22 Nov 2026: "one named exception"): and test:share-a-dish, the one new suite.
    const ALLOWED_EXTRA = ['test:demo-new-notice', 'test:share-a-dish'];
    report(
      'P2',
      "the added script lines are this ticket's contacts tests, all eight of them, and nothing else (but GTC-469's test:demo-new-notice)",
      newKeys.length >= EIGHT.length &&
        EIGHT.every((k) => newKeys.includes(k)) &&
        newKeys.every((k) => k.startsWith('test:contacts-') || ALLOWED_EXTRA.includes(k)),
      { added: newKeys, missing: EIGHT.filter((k) => !newKeys.includes(k)) }
    );
  } else {
    report('P2', 'the added script lines can be read', false);
  }

  // ── N: the new files ───────────────────────────────────────────────────────
  section('N — the new files');
  const BUILTINS = new Set(
    (
      'fs path os crypto child_process http https http2 net tls dns dgram stream zlib ' +
      'worker_threads cluster vm readline module process util url buffer events assert perf_hooks ' +
      'v8 inspector tty querystring string_decoder timers async_hooks diagnostics_channel'
    ).split(' ')
  );
  // The server side of this app: the database client, the SDKs that send or bill, and Next's
  // server-only doors. Everything under src that reaches one of these is a server module too.
  const SERVER_PKGS = new Set([
    '@prisma/client',
    'stripe',
    '@anthropic-ai/sdk',
    'twilio',
    'resend',
    'server-only',
    'next/server',
    'next/headers',
  ]);
  const isServerSpec = (s: string) =>
    s.startsWith('node:') ||
    BUILTINS.has(s.split('/')[0]) ||
    SERVER_PKGS.has(s) ||
    s.startsWith('@prisma/');
  const IMPORTS: RegExp[] = [
    /^\s*(?:import|export)\s+(?!type\b)[^;'"]*?\bfrom\s*['"]([^'"]+)['"]/gm,
    /^\s*import\s*['"]([^'"]+)['"]/gm,
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  const specsOf = (text: string) =>
    IMPORTS.flatMap((re) => [...text.matchAll(re)].map((m) => m[1]));
  const resolveSpec = (from: string, spec: string): string | null => {
    const base = spec.startsWith('@/')
      ? path.join('src', spec.slice(2))
      : path.join(path.dirname(from), spec);
    for (const c of [
      `${base}.ts`,
      `${base}.tsx`,
      path.join(base, 'index.ts'),
      path.join(base, 'index.tsx'),
    ]) {
      if (fs.existsSync(onDisk(c)) && fs.statSync(onDisk(c)).isFile()) return c;
    }
    return null;
  };
  const reached = new Set<string>();
  const externals = new Set<string>();
  const serverHits: { file: string; imports: string }[] = [];
  const unresolved: { file: string; imports: string }[] = [];
  const walk = (file: string) => {
    if (reached.has(file)) return;
    reached.add(file);
    for (const spec of specsOf(read(file))) {
      if (spec.startsWith('@/') || spec.startsWith('.')) {
        const to = resolveSpec(file, spec);
        if (to) walk(to);
        else unresolved.push({ file, imports: spec });
      } else {
        externals.add(spec);
        if (isServerSpec(spec)) serverHits.push({ file, imports: spec });
      }
    }
  };
  for (const f of newSrc) walk(f);
  report(
    'N1',
    'the new files import no server module: not the database, a Node built-in, a send or billing library, or Next’s server doors, directly or through anything they import',
    baseOk && newSrc.length >= 10 && unresolved.length === 0 && serverHits.length === 0,
    { serverHits, unresolved }
  );
  report(
    'N2',
    'the scan of N1 is not vacuous: it followed the imports into the shared code and saw react',
    baseOk && reached.size >= newSrc.length + 5 && externals.has('react'),
    { reached: reached.size, newFiles: newSrc.length }
  );

  // The allowed GETs: the contacts screen reads, from an event, with plain fetch of three addresses
  // and nothing else (no second argument, so no method and no body): the event's households (3d),
  // and, [[GTC-470]] (amendment A5), the event itself and its summary, for the Moments row.
  const SCREEN = 'src/components/contacts/ContactsScreen.tsx';
  const FORBIDDEN =
    /\bfetch\b|XMLHttpRequest|sendBeacon|\bconsole\b|dangerouslySetInnerHTML|innerHTML|\beval\b|new\s+RegExp\b/g;
  const ALLOWED_GET =
    /\bfetch\(\s*`\/api\/events\/\$\{[A-Za-z0-9_.]+\}(?:\/households|\/summary)?`\s*\)/g;
  const GET_EVENT = /\bfetch\(\s*`\/api\/events\/\$\{[A-Za-z0-9_.]+\}`\s*\)/g;
  const GET_HOUSEHOLDS = /\bfetch\(\s*`\/api\/events\/\$\{[A-Za-z0-9_.]+\}\/households`\s*\)/g;
  const GET_SUMMARY = /\bfetch\(\s*`\/api\/events\/\$\{[A-Za-z0-9_.]+\}\/summary`\s*\)/g;
  const screenText = newSrc.includes(SCREEN) ? read(SCREEN) : '';
  const screenFetches = (screenText.match(/\bfetch\b/g) ?? []).length;
  const screenAllowed = (screenText.match(ALLOWED_GET) ?? []).length;
  const eachOnce = [GET_EVENT, GET_HOUSEHOLDS, GET_SUMMARY].map(
    (re) => (screenText.match(re) ?? []).length
  );
  report(
    'N3',
    'the contacts screen holds exactly three fetches, each a plain GET: the event’s households, the event, and its summary, once each',
    baseOk &&
      screenText.length > 0 &&
      screenFetches === 3 &&
      screenAllowed === 3 &&
      eachOnce.every((n) => n === 1),
    { fetchWords: screenFetches, plainGets: screenAllowed, eventHouseholdsSummary: eachOnce }
  );
  const wordHits: { file: string; word: string }[] = [];
  for (const f of newSrc) {
    const text = f === SCREEN ? read(f).replace(ALLOWED_GET, '') : read(f);
    for (const m of text.matchAll(FORBIDDEN)) wordHits.push({ file: f, word: m[0] });
  }
  report(
    'N4',
    'the new files hold none of fetch, XMLHttpRequest, sendBeacon, console, dangerouslySetInnerHTML, innerHTML, eval or new RegExp (apart from those three plain GETs)',
    baseOk && newSrc.length >= 10 && wordHits.length === 0,
    wordHits.slice(0, 6)
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
