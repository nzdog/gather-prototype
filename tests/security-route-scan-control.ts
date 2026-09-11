/**
 * Route Scanner Control Suite — GTC-268, slice 1
 *
 * Run with: npm run test:security:routes
 *
 * THIS SUITE EXISTS TO MAKE THE SCANNER TRUSTWORTHY BEFORE IT IS TRUSTED.
 *
 * `tests/security-inventory-gate.ts` prints `✓ SECURITY GATE PASSED` and has never
 * done anything else. It cannot fail: all four of its rules filter the contents of a
 * `securityIssues` array that is empty on all 81 entries of the hand-maintained
 * `route-classifications.json`, and the one clause that does not — `authType ===
 * 'WEAK_PARAM'` — matches a value no entry carries. Ten Executor-Completed evidence
 * sections cite it green ([[GTC-192]] phases 3, 3b, 4, 6a, 6a-fix, 6b, 6c, 6d, 6e, 7
 * and [[GTC-171]]). It did pass. It was not checking.
 *
 * A replacement that merely prints a different number has earned nothing. So the
 * first thing the new scanner does is reproduce a finding whose answer is already
 * known independently of it:
 *
 *   [[GTC-267]] closed nine unauthenticated `GET` handlers and the `?hostId=` branch
 *   of a tenth, and added one deliberately-public route. Run against `298b62d` —
 *   the commit before that fix — the scanner must report those ten unguarded. Run
 *   against HEAD it must report none of them, and exactly one new one.
 *
 * That is the control, and it is an assertion here rather than a paragraph in a
 * ticket, because a paragraph cannot go red when someone changes the scanner.
 *
 * ── THE NUMBERS ARE PINNED ON PURPOSE ──────────────────────────────────────────
 *
 * 106 files / 134 handlers / 23 unguarded at HEAD, and 105 / 133 / 32 at `298b62d`,
 * are asserted as exact equalities, not floors. A pinned number fails when a route
 * is added, which is the point: the old gate's ONE real property was that its count
 * moved 80 -> 81 when someone hand-edited the JSON. This keeps that property and
 * takes the hand-editing out. When a route is legitimately added, this number is
 * updated in the same commit, and the update is visible in review.
 *
 * ── WHAT "UNGUARDED" MEANS HERE, EXACTLY ───────────────────────────────────────
 *
 * No SESSION guard and no TOKEN guard whose result is checked. It does NOT mean
 * "unauthenticated": a Stripe signature, a `CRON_SECRET` comparison and a lookup on
 * a credential column are all real credentials, and the scanner reports them
 * separately as `otherCredentials`. Slice 2 is where those become allowlist
 * decisions. Slice 1 counts the class [[GTC-267]] was about and nothing else, which
 * is why 23 at HEAD is the right answer and not a finding of 23 holes.
 */

import {
  analyzeSource,
  scanWorkingTree,
  scanGitRef,
  unguardedHandlers,
  fileLevelGuardSymbols,
  handlerKey,
  assertFullCoverage,
  scanSources,
  type ScanResult,
} from './security-route-scan';

let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

function logTest(name: string, passed: boolean, message?: string) {
  testsRun++;
  if (passed) {
    testsPassed++;
    console.log(`${GREEN}✓${RESET} ${name}`);
  } else {
    testsFailed++;
    console.log(`${RED}✗${RESET} ${name}`);
    if (message) console.log(`  ${RED}Error: ${message}${RESET}`);
  }
}

function logSection(title: string) {
  console.log(`\n${BOLD}${YELLOW}${title}${RESET}`);
}

/** The commit immediately before GTC-267's fix landed. */
const PRE_FIX = '298b62d';

/**
 * The nine `GET` handlers GTC-267 found unauthenticated, by handler key.
 * Named individually so a scanner that gets the COUNT right by accident still fails.
 */
const GTC267_NINE = [
  'GET src/app/api/events/[id]/route.ts',
  'GET src/app/api/events/[id]/summary/route.ts',
  'GET src/app/api/events/[id]/items/route.ts',
  'GET src/app/api/events/[id]/days/route.ts',
  'GET src/app/api/events/[id]/conflicts/route.ts',
  'GET src/app/api/events/[id]/conflicts/dismissed/route.ts',
  'GET src/app/api/events/[id]/conflicts/[conflictId]/route.ts',
  'GET src/app/api/events/[id]/revisions/route.ts',
  'GET src/app/api/events/[id]/revisions/[revisionId]/route.ts',
];

/**
 * The tenth: `GET /api/events/[id]/tokens` had no session guard at 298b62d — its
 * only session-shaped path was the `?hostId=` query parameter, which GTC-267 proved
 * was not authentication because a sibling route published that value to anonymous
 * callers. Removing it and calling `requireEventRole` is what closed it.
 */
const GTC267_TENTH = 'GET src/app/api/events/[id]/tokens/route.ts';

/** GTC-267 added exactly one deliberately-public route. */
const GTC267_ADDED = 'GET src/app/api/events/[id]/clone-source/route.ts';

function keys(result: ScanResult): Set<string> {
  return new Set(unguardedHandlers(result).map(handlerKey));
}

function sortedDiff(a: Set<string>, b: Set<string>): string[] {
  return [...a].filter((k) => !b.has(k)).sort();
}

// ────────────────────────────────────────────────────────────────────────────────
// Suite 0 — COVERAGE. Asserted first, because nothing below it means anything
//           if the scan is partial.
// ────────────────────────────────────────────────────────────────────────────────
function suite0_Coverage(head: ScanResult, pre: ScanResult) {
  logSection('Suite 0: coverage — a file the scanner cannot read is a FAILURE, not a gap');

  // Founder ruling, 2026-09-11, wanted in before the tool had any history:
  // "The old gate's deepest defect was not a wrong rule, it was 29 routes it never
  //  saw at all — and a scanner that quietly skips a file it cannot read
  //  reintroduces that on day one, invisibly."
  logTest(
    'every route file at HEAD yields at least one handler verdict',
    head.unparsed.length === 0,
    `${head.unparsed.length} unreadable: ${head.unparsed.map((u) => u.filePath).join(', ')}`
  );

  logTest(
    `every route file at ${PRE_FIX} yields at least one handler verdict`,
    pre.unparsed.length === 0,
    `${pre.unparsed.length} unreadable: ${pre.unparsed.map((u) => u.filePath).join(', ')}`
  );

  // Belt and braces: the handler set must cover the file set exactly. A file could
  // in principle be dropped before it was ever analysed, which `unparsed` would not
  // catch — so the two are reconciled rather than trusted.
  const covered = new Set(head.handlers.map((h) => h.filePath));
  const missing = head.files.filter((f) => !covered.has(f));
  logTest(
    'the handler set covers every discovered file — no file is silently dropped',
    missing.length === 0 && covered.size === head.files.length,
    `covered ${covered.size} of ${head.files.length}; missing: ${missing.join(', ')}`
  );

  logTest(
    'assertFullCoverage does not throw on a complete scan',
    (() => {
      try {
        assertFullCoverage(head);
        return true;
      } catch {
        return false;
      }
    })(),
    'a clean tree must not trip the coverage assertion'
  );

  // A route file whose handlers are exported through a list — a shape this scanner
  // deliberately does not resolve. It must be a loud failure, not a quiet 133.
  const UNRESOLVED_EXPORT = `
    import { NextResponse } from 'next/server';
    async function handler() { return NextResponse.json({ ok: true }); }
    export { handler as GET };
  `;
  logTest(
    'a route exporting its handler through an `export { ... }` list yields NO verdict',
    analyzeSource('src/app/api/fixture/route.ts', UNRESOLVED_EXPORT).length === 0,
    'the scanner must not pretend to understand an export form it does not resolve'
  );

  // Syntactically broken source. TypeScript's parser is permissive and returns a
  // tree rather than throwing, so "cannot parse" shows up here as "yields nothing".
  // ⚠ FOUND BY THIS FIXTURE, AGAINST A SCANNER THAT HAD ALREADY PASSED 51
  // ASSERTIONS. TypeScript's parser recovers instead of throwing, so this broken
  // source DOES yield a `GET` verdict — read off a tree that recovery invented. A
  // verdict from a recovered tree is a guess wearing the costume of a fact, and it
  // could as easily read GUARDED as UNGUARDED. So parse errors are a coverage
  // failure in their own right, whether or not handlers came out.
  const BROKEN = `export async function GET( { const ??? <<< `;
  const brokenVerdicts = analyzeSource('src/app/api/fixture/route.ts', BROKEN);
  logTest(
    'broken source still yields a verdict — recorded, because it is why the next assertion exists',
    brokenVerdicts.length > 0,
    'if TypeScript stops recovering, this fixture needs rewriting rather than deleting'
  );

  const brokenScan = scanSources(new Map([['src/app/api/fixture/route.ts', BROKEN]]));
  logTest(
    'a syntactically broken route file is reported UNREADABLE despite yielding a verdict',
    brokenScan.unparsed.length === 1,
    `unparsed: ${brokenScan.unparsed.length}`
  );

  let brokenThrew = false;
  try {
    assertFullCoverage(brokenScan);
  } catch {
    brokenThrew = true;
  }
  logTest(
    'assertFullCoverage THROWS on a file with parse errors',
    brokenThrew,
    'a recovered parse tree must never pass silently as a clean result'
  );

  // And the assertion itself must have teeth.
  const fake: ScanResult = {
    files: ['src/app/api/fixture/route.ts'],
    handlers: [],
    sources: new Map([['src/app/api/fixture/route.ts', BROKEN]]),
    unparsed: [{ filePath: 'src/app/api/fixture/route.ts', reason: 'test' }],
  };
  let threw = false;
  try {
    assertFullCoverage(fake);
  } catch {
    threw = true;
  }
  logTest(
    'assertFullCoverage THROWS when any file yielded no verdict',
    threw,
    'a partial scan that reports itself as complete is the defect this tool exists to end'
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// Suite 1 — the shape of the tree at HEAD
// ────────────────────────────────────────────────────────────────────────────────
function suite1_HeadShape(head: ScanResult) {
  logSection('Suite 1: the surface at HEAD — counted from disk, not from a ledger');

  logTest(
    'the scanner discovers exactly 106 route files under src/app/api',
    head.files.length === 106,
    `found ${head.files.length}`
  );

  logTest(
    'the scanner enumerates exactly 134 exported HTTP handlers',
    head.handlers.length === 134,
    `found ${head.handlers.length}`
  );

  // The unit is the reason GTC-267's GET could hide behind a guarded PATCH.
  logTest(
    'the handler count exceeds the file count — the unit is the method, not the file',
    head.handlers.length > head.files.length,
    `${head.handlers.length} handlers vs ${head.files.length} files`
  );

  logTest(
    'exactly 23 handlers carry no session or token guard at HEAD',
    keys(head).size === 23,
    `found ${keys(head).size}: ${[...keys(head)].sort().join(', ')}`
  );

  // route-classifications.json records 81 file-shaped entries. That is a different
  // denominator, not a shortfall of 25 — recorded so the two are never reconciled
  // by arithmetic.
  logTest(
    'the surface is larger than the retired inventory could express (81 entries)',
    head.files.length === 106 && head.handlers.length === 134,
    `files ${head.files.length}, handlers ${head.handlers.length}`
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// Suite 2 — THE CONTROL. Reproduce GTC-267 at the commit before it was fixed.
// ────────────────────────────────────────────────────────────────────────────────
function suite2_Gtc267Control(head: ScanResult, pre: ScanResult) {
  logSection(`Suite 2: THE CONTROL — GTC-267 reproduced at ${PRE_FIX}`);

  logTest(
    `${PRE_FIX} has 105 route files — one fewer than HEAD (clone-source did not exist)`,
    pre.files.length === 105,
    `found ${pre.files.length}`
  );

  logTest(
    `${PRE_FIX} has 133 exported handlers`,
    pre.handlers.length === 133,
    `found ${pre.handlers.length}`
  );

  logTest(
    `exactly 32 handlers carry no session or token guard at ${PRE_FIX}`,
    keys(pre).size === 32,
    `found ${keys(pre).size}`
  );

  // Each of the nine named individually. A count alone can be right by accident.
  const preKeys = keys(pre);
  const headKeys = keys(head);

  for (const k of GTC267_NINE) {
    logTest(
      `${PRE_FIX}: ${k.replace('src/app/api', '')} is reported UNGUARDED`,
      preKeys.has(k),
      'the scanner failed to reproduce a known GTC-267 finding'
    );
  }

  logTest(
    `${PRE_FIX}: ${GTC267_TENTH.replace('src/app/api', '')} is reported UNGUARDED`,
    preKeys.has(GTC267_TENTH),
    'the ?hostId= branch was not a session guard and must not read as one'
  );

  for (const k of GTC267_NINE) {
    logTest(
      `HEAD: ${k.replace('src/app/api', '')} is reported GUARDED`,
      !headKeys.has(k),
      'GTC-267 closed this handler; the scanner still reports it open'
    );
  }

  logTest(
    `HEAD: ${GTC267_TENTH.replace('src/app/api', '')} is reported GUARDED`,
    !headKeys.has(GTC267_TENTH),
    'the session path added by GTC-267 was not detected'
  );

  // The set equality is the real assertion: not "at least the ten", but "exactly".
  const closed = sortedDiff(preKeys, headKeys);
  const expectedClosed = [...GTC267_NINE, GTC267_TENTH].sort();
  logTest(
    'the set closed between the two commits is EXACTLY GTC-267’s ten, no more and no fewer',
    JSON.stringify(closed) === JSON.stringify(expectedClosed),
    `got ${closed.length}: ${closed.join(', ')}`
  );

  const opened = sortedDiff(headKeys, preKeys);
  logTest(
    'exactly one handler became unguarded — clone-source, deliberately public',
    JSON.stringify(opened) === JSON.stringify([GTC267_ADDED]),
    `got ${opened.length}: ${opened.join(', ')}`
  );

  // 32 - 10 + 1 = 23. Stated as arithmetic so a drift in either number is visible.
  logTest(
    'the arithmetic closes: 32 - 10 + 1 = 23',
    preKeys.size - closed.length + opened.length === headKeys.size,
    `${preKeys.size} - ${closed.length} + ${opened.length} !== ${headKeys.size}`
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// Suite 3 — why the retired model could not have found this
// ────────────────────────────────────────────────────────────────────────────────
function suite3_FileLevelModelIsBlind(pre: ScanResult) {
  logSection('Suite 3: the refutation — a file-level symbol model cannot see it');

  // This is the exact shape `authEvidence: ["requireEventRole"]` records: does the
  // symbol appear anywhere in the file. GTC-267's headline route is the proof that
  // the question is the wrong one.
  const target = 'src/app/api/events/[id]/route.ts';
  const source = pre.sources.get(target);

  if (!source) {
    logTest(`${PRE_FIX} source for ${target} is available to the suite`, false, 'not found');
    return;
  }

  const symbols = fileLevelGuardSymbols(source);
  logTest(
    `${PRE_FIX}: a file-level symbol scan calls events/[id]/route.ts GUARDED`,
    symbols.length > 0,
    `expected the old model to find a guard symbol; found ${symbols.length}`
  );

  const perMethod = analyzeSource(target, source);
  const get = perMethod.find((h) => h.method === 'GET');
  const patch = perMethod.find((h) => h.method === 'PATCH');
  const del = perMethod.find((h) => h.method === 'DELETE');

  logTest(
    `${PRE_FIX}: the per-method scan calls GET in the same file UNGUARDED`,
    get !== undefined && !get.guarded,
    `GET verdict: ${get ? String(get.guarded) : 'handler not found'}`
  );

  logTest(
    `${PRE_FIX}: PATCH and DELETE in that same file are GUARDED`,
    patch !== undefined && patch.guarded && del !== undefined && del.guarded,
    `PATCH ${patch?.guarded}, DELETE ${del?.guarded}`
  );

  // One file, one entry, one verdict — versus one file, three handlers, two verdicts.
  logTest(
    'one file yields three handlers and two different verdicts — which one entry cannot hold',
    perMethod.length === 3 && new Set(perMethod.map((h) => h.guarded)).size === 2,
    `${perMethod.length} handlers, ${new Set(perMethod.map((h) => h.guarded)).size} distinct verdicts`
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// Suite 4 — mention is not enforcement (synthetic, in-memory)
// ────────────────────────────────────────────────────────────────────────────────
function suite4_MentionIsNotEnforcement() {
  logSection('Suite 4: calling a guard is not checking one');

  const CHECKED = `
    import { NextResponse } from 'next/server';
    import { requireEventRole } from '@/lib/auth/guards';
    export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
      const { id } = await ctx.params;
      const auth = await requireEventRole(id, ['HOST']);
      if (auth instanceof NextResponse) return auth;
      return NextResponse.json({ ok: true });
    }
  `;
  const checked = analyzeSource('src/app/api/fixture/route.ts', CHECKED)[0];
  logTest(
    'a guard whose result is checked and returned counts as GUARDED',
    checked !== undefined && checked.guarded,
    `verdict ${checked?.guarded}`
  );

  // THE ASSERTION THAT MATTERS MOST. This is the defect `authEvidence` can never
  // see: the symbol is present, the route is wide open.
  const IGNORED = `
    import { NextResponse } from 'next/server';
    import { requireEventRole } from '@/lib/auth/guards';
    export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
      const { id } = await ctx.params;
      await requireEventRole(id, ['HOST']);
      return NextResponse.json({ ok: true });
    }
  `;
  const ignored = analyzeSource('src/app/api/fixture/route.ts', IGNORED)[0];
  logTest(
    'a guard whose result is DISCARDED counts as UNGUARDED',
    ignored !== undefined && !ignored.guarded,
    'the scanner accepted a guard call that cannot refuse anyone'
  );
  logTest(
    'the discarded guard is reported as an unchecked call, not silently dropped',
    ignored !== undefined && ignored.uncheckedGuards.length > 0,
    'a route that mentions a guard without enforcing it must be named, not merely excluded'
  );

  const VIA_HELPER = `
    import { NextResponse } from 'next/server';
    import { requireEventRole } from '@/lib/auth/guards';
    async function handleRequest(id: string) {
      const auth = await requireEventRole(id, ['HOST']);
      if (auth instanceof NextResponse) return auth;
      return NextResponse.json({ ok: true });
    }
    export async function GET() { return handleRequest('x'); }
    export async function POST() { return handleRequest('x'); }
  `;
  const helper = analyzeSource('src/app/api/fixture/route.ts', VIA_HELPER);
  logTest(
    'a guard inside a local helper is followed — both handlers GUARDED',
    helper.length === 2 && helper.every((h) => h.guarded),
    `${helper.length} handlers, guarded: ${helper.map((h) => h.guarded).join(',')}`
  );

  const DELEGATED = `
    import { NextResponse } from 'next/server';
    import { requireEventRole } from '@/lib/auth/guards';
    export async function GET(req: Request) {
      const auth = await requireEventRole('x', ['HOST']);
      if (auth instanceof NextResponse) return auth;
      return NextResponse.json({ ok: true });
    }
    export async function POST(req: Request) { return GET(req); }
  `;
  const delegated = analyzeSource('src/app/api/fixture/route.ts', DELEGATED);
  logTest(
    'a handler delegating to another exported handler inherits its guard',
    delegated.length === 2 && delegated.every((h) => h.guarded),
    `guarded: ${delegated.map((h) => `${h.method}=${h.guarded}`).join(',')}`
  );

  const BARE = `
    import { NextResponse } from 'next/server';
    import { prisma } from '@/lib/prisma';
    export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
      const { id } = await ctx.params;
      const event = await prisma.event.findUnique({ where: { id } });
      return NextResponse.json({ event });
    }
  `;
  const bare = analyzeSource('src/app/api/fixture/route.ts', BARE)[0];
  logTest(
    'a handler with no guard at all counts as UNGUARDED',
    bare !== undefined && !bare.guarded,
    'the scanner cannot report a bare handler as safe'
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// Suite 5 — the hard cases, pinned against the real tree
// ────────────────────────────────────────────────────────────────────────────────
function suite5_HardCasesAtHead(head: ScanResult) {
  logSection('Suite 5: the hard cases — pinned so a future simplification breaks here');

  const find = (method: string, file: string) =>
    head.handlers.find((h) => h.method === method && h.filePath === file);

  // BRANCH CASE. The session guard sits in the `else` of `if (token)`; the `if`
  // branch is itself a full credential check. A "guard must precede the first
  // prisma call" rule flags this route, and that rule is wrong — it was the only
  // hit across all 134 handlers during GTC-268's investigation.
  const tokens = find('GET', 'src/app/api/events/[id]/tokens/route.ts');
  logTest(
    'the branch case is not a false positive — GET /events/:id/tokens is GUARDED',
    tokens !== undefined && tokens.guarded,
    'a guard reached only in an else-branch is still a guard'
  );

  // HELPER + FAIL-OPEN. `handleRequest` holds the whole secret check; the exported
  // GET and POST are two lines each. And `CRON_SECRET && ...` means an unset
  // variable disables the check silently. Founder ruling, 2026-09-11: these are a
  // hole, not an allowlist entry — filed as GTC-270.
  const cronFiles = [
    'src/app/api/cron/nudges/route.ts',
    'src/app/api/cron/wrap-up-dispatch/route.ts',
    'src/app/api/cron/decide-by-followups/route.ts',
  ];
  const cron = head.handlers.filter((h) => cronFiles.includes(h.filePath));
  logTest('all six cron handlers are found', cron.length === 6, `found ${cron.length}`);
  logTest(
    'no cron handler carries a session or token guard',
    cron.length === 6 && cron.every((h) => !h.guarded),
    'a CRON_SECRET comparison is a shared secret, not a session guard'
  );
  logTest(
    'every cron handler carries a SHARED_SECRET credential, found through the helper',
    cron.length === 6 &&
      cron.every((h) => h.otherCredentials.some((c) => c.kind === 'SHARED_SECRET')),
    `detected on ${cron.filter((h) => h.otherCredentials.some((c) => c.kind === 'SHARED_SECRET')).length}/6`
  );
  logTest(
    'every cron handler is flagged FAIL-OPEN (GTC-270)',
    cron.length === 6 &&
      cron.every((h) => h.otherCredentials.some((c) => c.kind === 'SHARED_SECRET' && c.failOpen)),
    'an unset CRON_SECRET disables the check silently and the report must say so'
  );

  // TOKEN-AS-CREDENTIAL. Structurally identical to an ordinary lookup; the scanner
  // can only know because it is told which columns are credentials.
  const join = find('POST', 'src/app/api/join/[token]/claim/route.ts');
  logTest(
    'POST /join/:token/claim carries a CREDENTIAL_COLUMN (sharedLinkToken)',
    join !== undefined &&
      !join.guarded &&
      join.otherCredentials.some((c) => c.kind === 'CREDENTIAL_COLUMN'),
    'a capability URL is authentication and must not read as a bare lookup'
  );

  // ⚠ A CREDENTIAL VENDOR IS NOT A CREDENTIAL CHECKER. This route selects access
  // tokens and hands them to unauthenticated callers; it is keyed on `eventId` alone.
  // The scanner's first run reported it carrying a CREDENTIAL_COLUMN because
  // `select: { token: true }` matched a credential field name. Reading a route that
  // GIVES OUT tokens as one that CHECKS one inverts its meaning, so the detector was
  // narrowed to the `where` clause and the inversion is pinned here.
  // ([[GTC-262]] is open against this route for the COORDINATOR scope.)
  const directory = find('GET', 'src/app/api/gather/[eventId]/directory/route.ts');
  logTest(
    'GET /gather/:eventId/directory is reported with NO credential — it vends tokens, it does not check one',
    directory !== undefined && !directory.guarded && directory.otherCredentials.length === 0,
    `guarded=${directory?.guarded}, credentials=${JSON.stringify(directory?.otherCredentials)}`
  );

  const stripe = find('POST', 'src/app/api/webhooks/stripe/route.ts');
  logTest(
    'POST /webhooks/stripe carries a SIGNATURE credential',
    stripe !== undefined &&
      !stripe.guarded &&
      stripe.otherCredentials.some((c) => c.kind === 'SIGNATURE'),
    'a verified webhook signature is a credential'
  );

  const noCredential = head.handlers.filter((h) => !h.guarded && h.otherCredentials.length === 0);
  logTest(
    'exactly 12 handlers carry no guard and no other credential of any kind',
    noCredential.length === 12,
    `found ${noCredential.length}: ${noCredential.map(handlerKey).sort().join(', ')}`
  );

  // GTC-269. Removed from GTC-268's scope by founder ruling, 2026-09-11: it is a
  // live auth bypass, not a gate finding. Pinned here so the scanner's verdict on
  // it is a committed fact while that ticket is open.
  const demoSession = find('POST', 'src/app/api/demo/session/route.ts');
  logTest(
    'POST /demo/session carries NO guard and NO other credential of any kind (GTC-269)',
    demoSession !== undefined && !demoSession.guarded && demoSession.otherCredentials.length === 0,
    `guarded=${demoSession?.guarded}, otherCredentials=${demoSession?.otherCredentials.length}`
  );
}

// ────────────────────────────────────────────────────────────────────────────────
function main() {
  console.log(`${BOLD}${YELLOW}=== Route Scanner Control Suite (GTC-268 slice 1) ===${RESET}\n`);
  console.log('Contract under test:');
  console.log('1. The scanner reproduces GTC-267 at 298b62d and its absence at HEAD');
  console.log('2. The unit is the exported method, not the file');
  console.log('3. Calling a guard is not checking one');
  console.log('4. The known-hard cases are pinned, not assumed');
  console.log('5. A route file the scanner cannot read is a failure, not a gap\n');

  let head: ScanResult;
  let pre: ScanResult;

  try {
    head = scanWorkingTree();
  } catch (error) {
    console.error(`${RED}Fatal: could not scan the working tree:${RESET}`, error);
    process.exit(1);
  }

  try {
    pre = scanGitRef(PRE_FIX);
  } catch (error) {
    // Fixture rule 5, inherited from tests/security-validation.ts: a suite that
    // cannot report its red is not a red. If the control commit is unreachable the
    // suite FAILS — it does not skip quietly and print a partial green.
    console.error(
      `${RED}Fatal: could not read the control commit ${PRE_FIX} from git.${RESET}\n` +
        `  The GTC-267 control is the reason this scanner is trustworthy. Without it\n` +
        `  this suite proves nothing, so it fails rather than passing what it can.\n`,
      error
    );
    process.exit(1);
  }

  suite0_Coverage(head, pre);
  suite1_HeadShape(head);
  suite2_Gtc267Control(head, pre);
  suite3_FileLevelModelIsBlind(pre);
  suite4_MentionIsNotEnforcement();
  suite5_HardCasesAtHead(head);

  console.log(`\n${BOLD}${YELLOW}=== Test Summary ===${RESET}`);
  console.log(`Total tests: ${testsRun}`);
  console.log(`${GREEN}Passed: ${testsPassed}${RESET}`);
  console.log(`${RED}Failed: ${testsFailed}${RESET}`);

  if (testsFailed === 0) {
    console.log(
      `\n${GREEN}${BOLD}✓ Scanner control passed — the GTC-267 finding reproduces${RESET}`
    );
    process.exit(0);
  }
  console.log(`\n${RED}${BOLD}✗ Scanner control FAILED — do not trust this scanner${RESET}`);
  process.exit(1);
}

main();
