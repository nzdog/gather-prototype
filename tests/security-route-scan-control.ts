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
  evaluateSecretAbsent,
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

/**
 * ⚠ TWO MORE HANDLERS CLOSED BETWEEN THE SAME TWO COMMITS, AND THEY ARE NOT
 * GTC-267's. FOUND BY THE CONTROL COMMIT RATHER THAN BY ANYONE LOOKING.
 *
 * This pin moved from 32 to 34, and the closed set from ten to twelve, when
 * [[GTC-273]] made the guard rule per-path. It is recorded at length because of what
 * it proves rather than what it counts.
 *
 * At `298b62d` both handlers below look like this — the `?hostId=` shape GTC-267
 * removed from `/api/events/[id]/tokens`:
 *
 *     if (hostIdParam) {
 *       // Method 2: hostId query param auth
 *       ...compare hostIdParam against event.hostId / coHostId...
 *     } else {
 *       let auth;
 *       try {
 *         auth = await requireEventRole(eventId, ['HOST']);
 *         if (auth instanceof NextResponse) return auth;
 *       } catch (authError) { return 401; }
 *     }
 *
 * The session guard is BRANCH-NESTED in the `else`, and the other branch is the
 * `?hostId=` mechanism GTC-267 proved was not authentication, because a sibling route
 * published that value to anonymous callers. At HEAD both routes call
 * `requireEventRole` unconditionally.
 *
 * **THE OLD SCANNER REPORTED BOTH AS GUARDED AT BOTH COMMITS. That is a THIRD false
 * positive of the retired guard rule** — after `if (auth.user.role === 'HOST')` and
 * `analytics.getUser()` — and nobody was looking for it; the control commit
 * surfaced it.
 *
 * FOUNDER RULING, 2026-09-12: keep it and re-pin. **Suppressing it would mean
 * choosing a weaker guard rule to protect a number.** The pinned-number convention
 * exists so exactly this is visible in review.
 */
const GTC273_ALSO_CLOSED = [
  'GET src/app/api/events/[id]/invite-status/route.ts',
  'POST src/app/api/events/[id]/people/batch-import/route.ts',
];

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
    `exactly 34 handlers carry no session or token guard at ${PRE_FIX}`,
    keys(pre).size === 34,
    `found ${keys(pre).size}` +
      ' — was 32 before GTC-273 made the guard rule per-path. See GTC273_ALSO_CLOSED: ' +
      'the two extra are real, and the retired rule called them guarded at both commits.'
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

  // Each of GTC-273's two, named individually, for the same reason the ten are.
  for (const k of GTC273_ALSO_CLOSED) {
    logTest(
      `${PRE_FIX}: ${k.replace('src/app/api', '')} is reported UNGUARDED (GTC-273, branch-nested behind ?hostId=)`,
      preKeys.has(k),
      'the guard sits in the else of `if (hostIdParam)` at this commit, so it is reached ' +
        'on SOME path — the retired rule reported this handler guarded'
    );
    logTest(
      `HEAD: ${k.replace('src/app/api', '')} is reported GUARDED`,
      !headKeys.has(k),
      'the ?hostId= branch is gone and requireEventRole is unconditional at HEAD'
    );
  }

  // The set equality is the real assertion: not "at least", but "exactly".
  const closed = sortedDiff(preKeys, headKeys);
  const expectedClosed = [...GTC267_NINE, GTC267_TENTH, ...GTC273_ALSO_CLOSED].sort();
  logTest(
    'the set closed between the two commits is EXACTLY GTC-267’s ten plus GTC-273’s two, ' +
      'no more and no fewer',
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

  // HELPER + INLINE, AND NO LONGER FAIL-OPEN. `handleRequest` holds the whole secret
  // check in wrap-up-dispatch and decide-by-followups; nudges has it inline in `GET`
  // and its `POST` is `return GET(request)`. Three delegation shapes, six handlers,
  // and the scanner resolves all three because it follows local helpers and sibling
  // handlers within a file.
  //
  // GTC-270 CLOSED THE FAIL-OPEN. `if (CRON_SECRET && provided !== CRON_SECRET)` meant
  // an unset variable disabled the check silently and three SMS sender routes answered
  // 200 to anyone. The assertion below USED TO ASSERT THAT STATE, pinned so it could
  // not change while the ticket was open. It is now pointed at the fixed state.
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
    'every cron handler carries a SHARED_SECRET credential, found through the helper or inline',
    cron.length === 6 &&
      cron.every((h) => h.otherCredentials.some((c) => c.kind === 'SHARED_SECRET')),
    `detected on ${cron.filter((h) => h.otherCredentials.some((c) => c.kind === 'SHARED_SECRET')).length}/6`
  );
  logTest(
    'NO cron handler is flagged FAIL-OPEN any more (GTC-270 — do not relax this to make it pass)',
    cron.length === 6 && cron.every((h) => h.otherCredentials.every((c) => !c.failOpen)),
    'a cron handler is fail-open again: an unset CRON_SECRET would admit every caller ' +
      'to an SMS sender. Fix the route so it refuses when the secret is not configured ' +
      '— suite 12 in tests/security-validation.ts holds the behaviour. Never satisfy ' +
      'this assertion by editing it.'
  );

  // ⚠ THE CONTROL FOR THE ASSERTION ABOVE, AND IT IS NOT OPTIONAL.
  //
  // "Nothing is flagged" is also what a BROKEN DETECTOR reports. GTC-267's rule: an
  // empty search result is a claim, and a claim needs a control. So feed the detector
  // the exact shape GTC-270 removed and require it to fire. If this control goes red,
  // the assertion above has stopped meaning anything and the six routes are unwatched.
  //
  // The detector is narrower than it looks — see GTC-273, which records four rewrites
  // that are genuinely fail-open and are NOT flagged. This control proves it still
  // catches the one shape it knows; it does not prove the six routes are safe. The
  // behaviour is held by suite 12, not by this file.
  const failOpenSpecimen = [
    "import { NextResponse } from 'next/server';",
    'const CRON_SECRET = process.env.CRON_SECRET;',
    'export async function GET(request: any) {',
    "  const provided = request.nextUrl.searchParams.get('secret');",
    '  if (CRON_SECRET && provided !== CRON_SECRET) {',
    "    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });",
    '  }',
    '  return NextResponse.json({ ok: true });',
    '}',
  ].join('\n');
  const specimenVerdict = analyzeSource(
    'src/app/api/cron/__detector_control__/route.ts',
    failOpenSpecimen
  );
  logTest(
    '[CONTROL] the FAIL-OPEN detector still fires on the shape GTC-270 removed',
    specimenVerdict.length === 1 &&
      specimenVerdict[0].otherCredentials.some((c) => c.kind === 'SHARED_SECRET' && c.failOpen),
    'the detector is broken, so "no handler is flagged FAIL-OPEN" above proves nothing'
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

  // The count did NOT move when GTC-269 was fixed, and that is the correct result,
  // not a stale number. GTC-269 closed a credential-scope defect, not a missing
  // guard: `POST /demo/session` is still callable by anyone, so it is still one of
  // these twelve. See the assertion immediately below for why that is deliberate.
  const noCredential = head.handlers.filter((h) => !h.guarded && h.otherCredentials.length === 0);
  logTest(
    // ⚠ THIS ASSERTION CATCHES TWO OF GTC-273's THIRTEEN FAIL-OPEN REWRITES. THAT IS
    // LUCK, NOT DESIGN, AND IT IS RECORDED AS LUCK ON FOUNDER INSTRUCTION 2026-09-12.
    //
    // Two of the thirteen — `const s = CRON_SECRET; if (s && p !== s)` and the
    // ternary form — do not merely lose the fail-open verdict. They drop the handler
    // out of the credential classification altogether, so this count would move
    // 12 -> 14 and go red. The other ELEVEN move nothing here.
    //
    // Deliberately NOT strengthened to cover the other eleven. The property belongs
    // to the fail-open rule, which now decides it by evaluation rather than by shape
    // (see `evaluateSecretAbsent` and suite 6). An assertion that catches a defect
    // for an unrelated reason is worth keeping and worth labelling; it is not worth
    // promoting into the thing that holds the property.
    'exactly 12 handlers carry no guard and no other credential of any kind',
    noCredential.length === 12,
    `found ${noCredential.length}: ${noCredential.map(handlerKey).sort().join(', ')}`
  );

  // GTC-269 — REWRITTEN WHEN THAT TICKET WAS FIXED. Read this before changing it.
  //
  // The previous version of this assertion was titled "carries NO guard and NO
  // other credential of any kind (GTC-269)" and its comment said it pinned the
  // scanner's verdict "while that ticket is open". Both are now misleading in the
  // dangerous direction: the verdict is unchanged and still true, but the ticket is
  // closed, so a reader meeting the old wording would reasonably conclude the
  // vulnerability is still open. The name is the thing a failing suite prints, so
  // the name has to say what is actually being held.
  //
  // What is deliberate: this handler requires no credential because GTC-015
  // (`f6e4b41`, 2026-03-08) removed its production gate on purpose, so a stranger
  // on the deployed site can click "Open Planning Dashboard" on `/demo`. Founder
  // ruling, 2026-09-11, reaffirmed it.
  //
  // Where the containment actually lives — and it is NOT here. GTC-269's defect was
  // that the route handed back a credential wider than the thing it demoed: a
  // `Session` for a user whose `EventRole` set grew with the demo Person's hosting
  // history. The fix bounds what the minted session REACHES, which no static scan
  // of this route can see. It is asserted behaviourally in suite 11 of
  // `tests/security-validation.ts`, by enumerating the events that session can
  // reach. If you are here because you want proof that GTC-269 is still closed,
  // this assertion is not it — suite 11 is.
  const demoSession = find('POST', 'src/app/api/demo/session/route.ts');
  logTest(
    'POST /demo/session is DELIBERATELY uncredentialed — it mints a bounded session, ' +
      'it does not check one (GTC-015 product decision; scope held by GTC-269 in ' +
      'security-validation suite 11)',
    demoSession !== undefined && !demoSession.guarded && demoSession.otherCredentials.length === 0,
    `guarded=${demoSession?.guarded}, otherCredentials=${demoSession?.otherCredentials.length}. ` +
      'A change here means someone added a guard or a credential to the route. That ' +
      'may be correct, but it reverses GTC-015 — get a product ruling, do not just ' +
      'update this number.'
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// ────────────────────────────────────────────────────────────────────────────────
// Suite 6 — GTC-273: the fail-open property is EVALUATED, not matched
// ────────────────────────────────────────────────────────────────────────────────
/**
 * ⚠ THE TICKET ASKED FOR FOUR SHAPES. THERE ARE THIRTEEN, AND THAT IS THE POINT.
 *
 * [[GTC-273]]'s Acceptance section asks for "one control assertion per shape in the
 * table above" — four rewrites. The investigation found nine more, and the ticket's
 * own "harder question" paragraph anticipated exactly that:
 *
 *   "every widening above is another spelling. The property is 'is the refusal
 *    unreachable when the secret is absent', and the shapes are unbounded. A scanner
 *    that decides this structurally will always be behind."
 *
 * Recorded here rather than quietly exceeded, on founder instruction 2026-09-12:
 * this suite asserts FOURTEEN fail-open shapes (the four filed, nine found, and the
 * original GTC-270 control) and THIRTEEN fail-closed ones. The count is not the
 * achievement. The achievement is that `collectSharedSecret` no longer decides by
 * shape at all, so a fifteenth shape nobody has thought of is decided correctly
 * without this list growing.
 *
 * HOW IT DECIDES NOW. `evaluateSecretAbsent` fixes the secret to absent, evaluates
 * every condition with a three-valued logic, prunes branches that are decidably
 * false, and asks whether any surviving path returns a non-refusal. It never asks
 * how the condition is typed.
 */
function suite6_FailOpenIsEvaluated() {
  logSection('Suite 6: fail-open is EVALUATED, not matched (GTC-273)');

  const REFUSE = "    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });";

  /**
   * The fixture mirrors the real cron shape: a module-scope secret read, both
   * credential channels, delegation from GET/POST into a local helper, and — on
   * purpose — AN OPAQUE CONDITION AFTER THE DECISION.
   *
   * That last part is load-bearing and is why this fixture is not smaller. An
   * earlier prototype of this evaluator reported UNPROVEN on correct code because
   * `if (result.errors.length > 0)` stands in the handler body after the guard has
   * already decided. The fix is to explore both branches of an undecidable condition
   * and join: if both agree, the opacity did not matter. A fixture without an opaque
   * post-decision condition would not hold that fix.
   */
  const cronFixture = (guard: string, extra = '') => `
import { NextRequest, NextResponse } from 'next/server';
import { runSweep } from '@/lib/sweep';
${extra}
const CRON_SECRET = process.env.CRON_SECRET;

async function handleRequest(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const secretParam = request.nextUrl.searchParams.get('secret');
  const providedSecret = authHeader?.replace('Bearer ', '') || secretParam;

${guard}

  try {
    const result = await runSweep();
    if (result.errors.length > 0) {
      console.error('[Cron] failures:', result.errors);
    }
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handleRequest(request);
}

export async function POST(request: NextRequest) {
  return handleRequest(request);
}
`;

  const FIXTURE = 'src/app/api/cron/__fixture__/route.ts';

  // ── FOURTEEN GENUINELY FAIL-OPEN SHAPES ─────────────────────────────────────
  // Every one admits any caller when CRON_SECRET is unset. #1 is the shape GTC-270
  // removed (the only one the retired detector caught); #2-#5 are GTC-273's four;
  // #6-#14 were found by GTC-273's investigation and are not in the ticket's table.
  const failOpen: Array<[string, string]> = [
    [
      'bare identifier — the shape GTC-270 removed',
      `  if (CRON_SECRET && providedSecret !== CRON_SECRET) {\n${REFUSE}\n  }`,
    ],
    [
      'process.env read inline, twice',
      `  if (process.env.CRON_SECRET && providedSecret !== process.env.CRON_SECRET) {\n${REFUSE}\n  }`,
    ],
    [
      'moved into a local const',
      `  const s = CRON_SECRET;\n  if (s && providedSecret !== s) {\n${REFUSE}\n  }`,
    ],
    [
      'Boolean() around the truthiness test',
      `  if (Boolean(CRON_SECRET) && providedSecret !== CRON_SECRET) {\n${REFUSE}\n  }`,
    ],
    [
      'loose null comparison',
      `  if (CRON_SECRET != null && providedSecret !== CRON_SECRET) {\n${REFUSE}\n  }`,
    ],
    [
      'strict undefined comparison',
      `  if (CRON_SECRET !== undefined && providedSecret !== CRON_SECRET) {\n${REFUSE}\n  }`,
    ],
    [
      'typeof test, wrong polarity',
      `  if (typeof CRON_SECRET === 'string' && providedSecret !== CRON_SECRET) {\n${REFUSE}\n  }`,
    ],
    [
      'optional chaining on length',
      `  if (CRON_SECRET?.length && providedSecret !== CRON_SECRET) {\n${REFUSE}\n  }`,
    ],
    [
      'nested ifs instead of &&',
      `  if (CRON_SECRET) {\n    if (providedSecret !== CRON_SECRET) {\n${REFUSE}\n    }\n  }`,
    ],
    [
      'operands swapped across the &&',
      `  if (providedSecret !== CRON_SECRET && CRON_SECRET) {\n${REFUSE}\n  }`,
    ],
    [
      'truthiness hoisted to a boolean local',
      `  const configured = !!CRON_SECRET;\n  if (configured && providedSecret !== CRON_SECRET) {\n${REFUSE}\n  }`,
    ],
    [
      'else-if with an empty allow branch',
      `  if (!CRON_SECRET) {\n    // unconfigured: let it through\n  } else if (providedSecret !== CRON_SECRET) {\n${REFUSE}\n  }`,
    ],
    [
      'early 200 return when unconfigured',
      `  if (!CRON_SECRET) {\n    return NextResponse.json({ success: true, skipped: 'unconfigured' });\n  }\n\n  if (providedSecret !== CRON_SECRET) {\n${REFUSE}\n  }`,
    ],
    [
      'ternary defaulting to accept',
      `  const ok = CRON_SECRET ? providedSecret === CRON_SECRET : true;\n  if (!ok) {\n${REFUSE}\n  }`,
    ],
  ];

  for (const [label, guard] of failOpen) {
    const v = analyzeSource(FIXTURE, cronFixture(guard))[0];
    const cred = v?.otherCredentials.find((c) => c.kind === 'SHARED_SECRET');
    logTest(
      `FAIL-OPEN is REFUTED — ${label}`,
      cred !== undefined && cred.proof === 'REFUTED' && cred.failOpen === true,
      `got proof=${cred?.proof ?? 'no SHARED_SECRET credential'} failOpen=${cred?.failOpen} ` +
        `— an unset CRON_SECRET admits every caller in this shape and the scanner did not say so`
    );
  }

  // ── THIRTEEN GENUINELY FAIL-CLOSED SHAPES ───────────────────────────────────
  // ⚠ THESE ARE THE ASSERTIONS THAT STOP THIS BEING A WIDER MATCHER. GTC-273's Stop
  // Condition 9: "a false positive is a worse outcome than the false negative being
  // fixed, because it trains readers to ignore the flag." Each shape below is
  // correct code, written awkwardly on purpose.
  const localHelper = `
function accepted(configured: string | undefined, provided: string | null) {
  if (typeof configured !== 'string' || configured.length === 0) return false;
  return provided === configured;
}
`;
  const failClosed: Array<[string, string, string]> = [
    [
      'negate-and-or, the GTC-270 recommendation',
      `  if (!CRON_SECRET || providedSecret !== CRON_SECRET) {\n${REFUSE}\n  }`,
      '',
    ],
    [
      'two plain ifs',
      `  if (!CRON_SECRET) {\n${REFUSE}\n  }\n  if (providedSecret !== CRON_SECRET) {\n${REFUSE}\n  }`,
      '',
    ],
    [
      'explicit undefined and empty',
      `  if (CRON_SECRET === undefined || CRON_SECRET === '') {\n${REFUSE}\n  }\n  if (providedSecret !== CRON_SECRET) {\n${REFUSE}\n  }`,
      '',
    ],
    [
      'through a local const',
      `  const s = CRON_SECRET;\n  if (!s || providedSecret !== s) {\n${REFUSE}\n  }`,
      '',
    ],
    [
      'throws instead of refusing',
      `  if (!CRON_SECRET) {\n    throw new Error('CRON_SECRET not configured');\n  }\n  if (providedSecret !== CRON_SECRET) {\n${REFUSE}\n  }`,
      '',
    ],
    [
      'explicit length check',
      `  if (!CRON_SECRET || CRON_SECRET.length === 0 || providedSecret !== CRON_SECRET) {\n${REFUSE}\n  }`,
      '',
    ],
    [
      'typeof test, correct polarity',
      `  if (typeof CRON_SECRET !== 'string' || CRON_SECRET.length === 0) {\n${REFUSE}\n  }\n  if (providedSecret !== CRON_SECRET) {\n${REFUSE}\n  }`,
      '',
    ],
    [
      'decision in a LOCAL predicate',
      `  if (!accepted(CRON_SECRET, providedSecret)) {\n${REFUSE}\n  }`,
      localHelper,
    ],
    [
      'ternary defaulting to refuse',
      `  const ok = CRON_SECRET ? providedSecret === CRON_SECRET : false;\n  if (!ok) {\n${REFUSE}\n  }`,
      '',
    ],
    [
      '403 rather than 401',
      `  if (!CRON_SECRET || providedSecret !== CRON_SECRET) {\n    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });\n  }`,
      '',
    ],
    [
      'nested, correct polarity',
      `  if (!CRON_SECRET) {\n${REFUSE}\n  } else if (providedSecret !== CRON_SECRET) {\n${REFUSE}\n  }`,
      '',
    ],
    [
      'a loop before the decision does not defeat it',
      `  for (const h of ['a']) {\n    console.log(h);\n  }\n  if (!CRON_SECRET || providedSecret !== CRON_SECRET) {\n${REFUSE}\n  }`,
      '',
    ],
    [
      'a switch before the decision does not defeat it',
      `  switch (request.method) {\n    default:\n      break;\n  }\n  if (!CRON_SECRET || providedSecret !== CRON_SECRET) {\n${REFUSE}\n  }`,
      '',
    ],
  ];

  for (const [label, guard, extra] of failClosed) {
    const v = analyzeSource(FIXTURE, cronFixture(guard, extra))[0];
    const cred = v?.otherCredentials.find((c) => c.kind === 'SHARED_SECRET');
    logTest(
      `FAIL-CLOSED is PROVEN — ${label}`,
      cred !== undefined && cred.proof === 'PROVEN' && cred.failOpen === false,
      `got proof=${cred?.proof ?? 'no SHARED_SECRET credential'} — this code is CORRECT. ` +
        `A red here is a FALSE POSITIVE and GTC-273 Stop Condition 9 says stop and ` +
        `report rather than loosening the rule to make it pass`
    );
  }

  // ── RELATIVE-IMPORT FOLLOWING, one level ────────────────────────────────────
  // ⚠ WITHOUT THIS, GTC-270's OWN FIX IS UNPROVABLE. That ticket put the decision in
  // `../cron-secret` by founder ruling, precisely because the retired detector read
  // the `if` CONDITION and a helper swallowing the whole check reported "no
  // credential of any kind". So the evaluator must be able to see one level through
  // a relative import or it reports UNPROVEN on the six handlers the fix landed on.
  // Driven through a stub reader so this control needs no disk.
  const CRON_SECRET_MODULE = `
export function isCronSecretConfigured(configured: string | undefined): boolean {
  return typeof configured === 'string' && configured.length > 0;
}
export function cronSecretAccepted(
  configured: string | undefined,
  provided: string | null | undefined
): boolean {
  if (!isCronSecretConfigured(configured)) return false;
  return provided === configured;
}
`;
  const stubReader = (spec: string) => (spec === '../cron-secret' ? CRON_SECRET_MODULE : null);
  const imported = "import { cronSecretAccepted, isCronSecretConfigured } from '../cron-secret';";

  const headShape =
    `  if (!isCronSecretConfigured(CRON_SECRET)) {\n${REFUSE}\n  }\n\n` +
    `  if (!cronSecretAccepted(CRON_SECRET, providedSecret)) {\n${REFUSE}\n  }`;

  const withFollow = analyzeSource(FIXTURE, cronFixture(headShape, imported), stubReader)[0];
  logTest(
    "HEAD's shape is PROVEN fail-closed THROUGH a relative import",
    withFollow?.otherCredentials.some((c) => c.kind === 'SHARED_SECRET' && c.proof === 'PROVEN') ===
      true,
    'the decision lives in ../cron-secret by GTC-270 ruling; without one level of ' +
      'relative-import following the fix that closed the hole cannot be proven'
  );

  const noFollow = analyzeSource(FIXTURE, cronFixture(headShape, imported), () => null)[0];
  logTest(
    '[CONTROL] the same shape is UNPROVEN when the import cannot be read',
    noFollow?.otherCredentials.some((c) => c.kind === 'SHARED_SECRET' && c.proof === 'UNPROVEN') ===
      true,
    'an unreadable module must yield UNPROVEN, never PROVEN and never REFUTED — ' +
      'if this reports PROVEN the assertion above proves nothing'
  );

  // ── THE REAL SIX, at HEAD ───────────────────────────────────────────────────
  // GTC-270 achieved this; until now the scanner could only say "not the one shape
  // I recognise". It can now say fail-closed and mean it.
  logTest(
    'the evaluator proves all six real cron handlers FAIL-CLOSED at HEAD',
    (() => {
      const files = [
        'src/app/api/cron/nudges/route.ts',
        'src/app/api/cron/wrap-up-dispatch/route.ts',
        'src/app/api/cron/decide-by-followups/route.ts',
      ];
      const fs = require('fs') as typeof import('fs');
      let n = 0;
      for (const f of files) {
        const text = fs.readFileSync(f, 'utf-8');
        for (const m of ['GET', 'POST']) {
          const r = evaluateSecretAbsent(f, text, m);
          if (r.verdict === 'FAIL_CLOSED') n++;
        }
      }
      return n === 6;
    })(),
    'GTC-270 made these fail closed; the scanner must be able to say so'
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// Suite 7 — GTC-273: three verdicts, across every rule
// ────────────────────────────────────────────────────────────────────────────────
/**
 * ⚠ THE DIAGNOSIS THIS SUITE HOLDS, AND WHY IT IS BIGGER THAN THE FAIL-OPEN RULE.
 *
 * [[GTC-273]] was filed about one detector. The investigation measured all ten of
 * this scanner's rules and found every one of them deciding by spelling in at least
 * one direction — four of them failing toward GREEN, which is to say reporting a
 * credential or a guard where there is none:
 *
 *   guardResultIsChecked   `if (auth.user.role === 'HOST')` counted as checking
 *                          `auth`, because the test was a \\b-anchored regex over
 *                          the condition TEXT and it matches inside `auth.user`.
 *                          The comment above that code said it did not.
 *   refusesSomewhere       a 4xx inside a COMMENT satisfied it.
 *   collectEnvGate         any nearby 4xx satisfied it; a local binding defeated it.
 *   SIGNATURE              any function named `constructEvent` satisfied it;
 *                          `constructEventAsync` defeated it.
 *   THIRD_PARTY_RECEIPT    retrieving a Stripe session counted, without ever
 *                          looking at `payment_status`.
 *   collectCredentialColumn  an aliased client defeated it; `{ not: null }` and a
 *                          permissive `OR` satisfied it.
 *   guard symbols          `analytics.getUser()` counted as a session guard.
 *   path sensitivity       a guard on ONE branch counted for all of them.
 *   coverage               per FILE, for a property that lives per METHOD.
 *
 * The single fix underneath all of them: every rule was BINARY, and in every rule
 * the absence of evidence was printed as the absence of the thing. There was no
 * verdict for "I could not tell". The scanner already had that vocabulary — it built
 * it for parsing, and stated the principle in its own header — and applied it
 * nowhere else.
 *
 * So: PROVEN / REFUTED / UNPROVEN on every rule. UNPROVEN is never read as either.
 * Founder ruling 2026-09-12, recorded so slice 2 inherits it rather than
 * relitigating it: "a handler the scanner cannot decide must not be silently
 * admitted, and must not silently acquire a permanent exception either."
 *
 * ⚠ AND WHERE THE HONEST RULE WAS TOO LARGE FOR THIS TICKET, THE ANSWER IS UNPROVEN
 * AND NOT A WIDER MATCHER. Branch-nested guards are the case: the correct property is
 * per-path and needs branch enumeration. Rather than approximate it, a handler whose
 * every guard call sits inside a branch reports UNPROVEN. Zero handlers are in that
 * state at HEAD, so it costs nothing today and catches the shape when it arrives.
 */
function suite7_ThreeVerdicts() {
  logSection('Suite 7: PROVEN / REFUTED / UNPROVEN on every rule (GTC-273)');

  const F = 'src/app/api/fixture/route.ts';
  const one = (src: string) => analyzeSource(F, src)[0];
  const credOf = (src: string, kind: string) =>
    one(src)?.otherCredentials.find((c) => c.kind === kind);

  // ── RULE: is the guard's result acted on? ──────────────────────────────────
  // The witness must REFUSE, not merely mention the variable.
  logTest(
    'a guard result that is READ but never refused is UNPROVEN, not guarded',
    (() => {
      const v = one(`
        import { NextResponse } from 'next/server';
        import { requireEventRole } from '@/lib/auth/guards';
        import { prisma } from '@/lib/prisma';
        export async function GET(request: Request) {
          const auth = await requireEventRole('x', ['HOST']);
          if (auth.user.role === 'HOST') {
            return NextResponse.json(await prisma.event.findMany());
          }
          return NextResponse.json(await prisma.event.findMany());
        }
      `);
      return v !== undefined && !v.guarded && v.guardProof === 'UNPROVEN';
    })(),
    'the NextResponse is never returned, so this route is open — and the old test ' +
      'was a \\b-anchored regex that matched inside `auth.user`'
  );

  logTest(
    'a guard result tested inline and returned is PROVEN',
    (() => {
      const v = one(`
        import { NextResponse } from 'next/server';
        import { requireEventRole } from '@/lib/auth/guards';
        export async function GET(request: Request) {
          const auth = await requireEventRole('x', ['HOST']);
          if (auth instanceof NextResponse) return auth;
          return NextResponse.json({ ok: true });
        }
      `);
      return v !== undefined && v.guarded && v.guardProof === 'PROVEN';
    })(),
    'the shape 77 of 111 guarded handlers use — a red here is a false positive'
  );

  // ── RULE: path sensitivity (interim: UNPROVEN, not branch enumeration) ─────
  logTest(
    'a guard reached only inside a branch is UNPROVEN, not guarded',
    (() => {
      const v = one(`
        import { NextResponse } from 'next/server';
        import { requireEventRole } from '@/lib/auth/guards';
        import { prisma } from '@/lib/prisma';
        export async function GET(request: Request) {
          const preview = request.url.includes('preview');
          if (!preview) {
            const auth = await requireEventRole('x', ['HOST']);
            if (auth instanceof NextResponse) return auth;
          }
          return NextResponse.json(await prisma.event.findMany());
        }
      `);
      return v !== undefined && !v.guarded && v.guardProof === 'UNPROVEN';
    })(),
    'one terminal path passes no check; the correct property is per-path and this ' +
      'ticket answers UNPROVEN rather than approximating it'
  );

  logTest(
    'a guard inside a try block is still PROVEN — a try is not a branch',
    (() => {
      const v = one(`
        import { NextResponse } from 'next/server';
        import { requireEventRole } from '@/lib/auth/guards';
        export async function POST(request: Request) {
          let auth;
          try {
            auth = await requireEventRole('x', ['HOST']);
            if (auth instanceof NextResponse) return auth;
          } catch (e) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
          }
          return NextResponse.json({ ok: true });
        }
      `);
      return v !== undefined && v.guarded && v.guardProof === 'PROVEN';
    })(),
    'the shape in events/[id]/transition and two others — a red here is a false positive'
  );

  logTest(
    'a guard reached only from a catch block is UNPROVEN',
    (() => {
      const v = one(`
        import { NextResponse } from 'next/server';
        import { requireEventRole } from '@/lib/auth/guards';
        import { prisma } from '@/lib/prisma';
        async function auditFailure() {
          const auth = await requireEventRole('x', ['HOST']);
          if (auth instanceof NextResponse) return auth;
          return null;
        }
        export async function GET(request: Request) {
          try {
            return NextResponse.json(await prisma.event.findMany());
          } catch (e) {
            await auditFailure();
            return NextResponse.json({ error: 'boom' }, { status: 500 });
          }
        }
      `);
      return v !== undefined && !v.guarded && v.guardProof === 'UNPROVEN';
    })(),
    'the guard is not on the success path'
  );

  // ── RULE: guard symbol resolution ─────────────────────────────────────────
  logTest(
    'a method named getUser on an unrelated object is NOT a session guard',
    (() => {
      const v = one(`
        import { NextResponse } from 'next/server';
        import { prisma } from '@/lib/prisma';
        import { analytics } from '@/lib/analytics';
        export async function GET(request: Request) {
          const who = await analytics.getUser(request);
          if (who) { console.log('seen', who); }
          return NextResponse.json(await prisma.event.findMany());
        }
      `);
      return v !== undefined && !v.guarded && v.guardEvidence.length === 0;
    })(),
    'calleeName returned the PROPERTY name, so any x.getUser() counted as a guard'
  );

  // ── RULE: refusesSomewhere ────────────────────────────────────────────────
  logTest(
    'a 4xx that appears only in a COMMENT does not satisfy a refusal',
    (() => {
      const c = credOf(
        `
        import { NextResponse } from 'next/server';
        import { prisma } from '@/lib/prisma';
        export async function GET(request: Request) {
          const token = new URL(request.url).searchParams.get('t');
          // TODO(GTC-999): this should return status: 401 when the token is unknown.
          const at = await prisma.accessToken.findFirst({ where: { token: token ?? '' } });
          return NextResponse.json({ scope: at?.scope ?? null });
        }
      `,
        'CREDENTIAL_COLUMN'
      );
      return c === undefined || c.proof === 'UNPROVEN';
    })(),
    "GTC-267's readCode lesson: reading a tombstone as the thing itself. GTC-269 " +
      'wrote the comment-stripping fix in the neighbouring file; this applies it here'
  );

  // ── RULE: collectCredentialColumn ─────────────────────────────────────────
  logTest(
    'an ALIASED prisma client still yields a PROVEN credential column',
    (() => {
      const c = credOf(
        `
        import { NextResponse } from 'next/server';
        import { db } from '@/lib/prisma';
        export async function GET(request: Request) {
          const token = new URL(request.url).searchParams.get('t');
          const at = await db.accessToken.findFirst({ where: { token: token ?? '' } });
          if (!at) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
          return NextResponse.json({ scope: at.scope });
        }
      `,
        'CREDENTIAL_COLUMN'
      );
      return c !== undefined && c.proof === 'PROVEN';
    })(),
    'the rule matched the literal text `prisma.`, so renaming the import hid a real check'
  );

  logTest(
    'a credential column consumed by update() yields a PROVEN credential column',
    (() => {
      const c = credOf(
        `
        import { NextResponse } from 'next/server';
        import { prisma } from '@/lib/prisma';
        export async function POST(request: Request) {
          const token = (await request.json()).token as string;
          try {
            const ml = await prisma.magicLink.update({ where: { token }, data: { usedAt: new Date() } });
            return NextResponse.json({ ok: true, userId: ml.userId });
          } catch {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
          }
        }
      `,
        'CREDENTIAL_COLUMN'
      );
      return c !== undefined && c.proof === 'PROVEN';
    })(),
    'the rule required find*, so consuming the token by update() hid a real check'
  );

  logTest(
    'a column NAMED but not COMPARED — where: { token: { not: null } } — is UNPROVEN',
    (() => {
      const c = credOf(
        `
        import { NextResponse } from 'next/server';
        import { prisma } from '@/lib/prisma';
        export async function GET(request: Request) {
          const id = new URL(request.url).searchParams.get('id');
          const rows = await prisma.accessToken.findMany({ where: { token: { not: null }, eventId: id ?? '' } });
          if (rows.length === 0) return NextResponse.json({ error: 'none' }, { status: 404 });
          return NextResponse.json(rows);
        }
      `,
        'CREDENTIAL_COLUMN'
      );
      return c !== undefined && c.proof === 'UNPROVEN';
    })(),
    'the caller presents no secret; this is a filter, not a credential check'
  );

  logTest(
    'a credential inside a permissive OR is UNPROVEN — an id alone satisfies the query',
    (() => {
      const c = credOf(
        `
        import { NextResponse } from 'next/server';
        import { prisma } from '@/lib/prisma';
        export async function GET(request: Request) {
          const token = new URL(request.url).searchParams.get('t') ?? '';
          const eventId = new URL(request.url).searchParams.get('e') ?? '';
          const at = await prisma.accessToken.findFirst({ where: { OR: [{ token }, { eventId }] } });
          if (!at) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
          return NextResponse.json({ scope: at.scope });
        }
      `,
        'CREDENTIAL_COLUMN'
      );
      return c !== undefined && c.proof === 'UNPROVEN';
    })(),
    'the token is optional in the query, so it cannot be the credential'
  );

  // ── RULE: collectEnvGate ──────────────────────────────────────────────────
  logTest(
    'an env gate through a local binding is PROVEN',
    (() => {
      const c = credOf(
        `
        import { NextResponse } from 'next/server';
        import { prisma } from '@/lib/prisma';
        const env = process.env.NODE_ENV;
        export async function POST(request: Request) {
          if (env === 'production') {
            return NextResponse.json({ error: 'Not found' }, { status: 404 });
          }
          await prisma.event.deleteMany();
          return NextResponse.json({ ok: true });
        }
      `,
        'ENV_GATE'
      );
      return c !== undefined && c.proof === 'PROVEN';
    })(),
    'identical behaviour to the inline form; only the spelling differs'
  );

  logTest(
    'a NODE_ENV test whose own branch does not refuse is UNPROVEN',
    (() => {
      const c = credOf(
        `
        import { NextResponse } from 'next/server';
        import { prisma } from '@/lib/prisma';
        export async function POST(request: Request) {
          if (process.env.NODE_ENV !== 'production') {
            const body = await request.json();
            if (!body.confirm) return NextResponse.json({ error: 'confirm required' }, { status: 400 });
          }
          await prisma.event.deleteMany();
          return NextResponse.json({ ok: true });
        }
      `,
        'ENV_GATE'
      );
      return c === undefined || c.proof === 'UNPROVEN';
    })(),
    'the 400 is a validation error inside the non-production branch; nothing is gated'
  );

  // ── RULE: SIGNATURE ───────────────────────────────────────────────────────
  logTest(
    "Stripe's async signature API is a PROVEN signature",
    (() => {
      const c = credOf(
        `
        import { NextResponse } from 'next/server';
        import { stripe } from '@/lib/stripe';
        export async function POST(request: Request) {
          const sig = request.headers.get('stripe-signature') ?? '';
          const body = await request.text();
          let event;
          try {
            event = await stripe.webhooks.constructEventAsync(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
          } catch {
            return NextResponse.json({ error: 'bad signature' }, { status: 400 });
          }
          return NextResponse.json({ received: event.id });
        }
      `,
        'SIGNATURE'
      );
      return c !== undefined && c.proof === 'PROVEN';
    })(),
    'Zone 4. Moving to the async API must not silently drop the only classification ' +
      'the webhook has'
  );

  logTest(
    'a LOCAL function named constructEvent that verifies nothing is UNPROVEN',
    (() => {
      const c = credOf(
        `
        import { NextResponse } from 'next/server';
        import { prisma } from '@/lib/prisma';
        function constructEvent(raw: string) { return JSON.parse(raw); }
        export async function POST(request: Request) {
          const event = constructEvent(await request.text());
          await prisma.event.create({ data: event });
          return NextResponse.json({ ok: true });
        }
      `,
        'SIGNATURE'
      );
      return c === undefined || c.proof === 'UNPROVEN';
    })(),
    'the rule matched the bare name, so JSON.parse behind that name read as a ' +
      'verified Stripe signature'
  );

  // ── RULE: THIRD_PARTY_RECEIPT ─────────────────────────────────────────────
  logTest(
    'a Stripe session retrieved without checking payment_status is UNPROVEN',
    (() => {
      const c = credOf(
        `
        import { NextResponse } from 'next/server';
        import { stripe } from '@/lib/stripe';
        import { prisma } from '@/lib/prisma';
        export async function POST(request: Request) {
          const { stripeSessionId } = await request.json();
          const session = await stripe.checkout.sessions.retrieve(stripeSessionId);
          const ev = await prisma.event.create({ data: { title: 'x', hostUserId: session.client_reference_id! } });
          return NextResponse.json(ev);
        }
      `,
        'THIRD_PARTY_RECEIPT'
      );
      return c !== undefined && c.proof === 'UNPROVEN';
    })(),
    "GTC-268's allowlist reason for POST /api/events is that it refuses unless " +
      'payment_status === "paid". The scanner never checked that — the same ' +
      'guard-versus-call defect it exists to catch, unfixed for receipts'
  );

  // ── RULE: collectSharedSecret must sit in a refusing branch ───────────────
  logTest(
    'a CRON_SECRET mention with no comparison and no refusal is UNPROVEN',
    (() => {
      const c = credOf(
        `
        import { NextResponse } from 'next/server';
        import { prisma } from '@/lib/prisma';
        const CRON_SECRET = process.env.CRON_SECRET;
        export async function GET(request: Request) {
          if (CRON_SECRET) {
            console.log('[Cron] secret configured');
          }
          return NextResponse.json(await prisma.event.findMany());
        }
      `,
        'SHARED_SECRET'
      );
      return c !== undefined && c.proof === 'UNPROVEN';
    })(),
    'the old rule reported SHARED_SECRET with the detail "compared in a refusal ' +
      'branch" on a handler containing neither a comparison nor a refusal'
  );

  // ── RULE: coverage, per METHOD ────────────────────────────────────────────
  // ⚠ THE RETIRED GATE'S OWN DEFECT, REBUILT INSIDE THE SAFETY NET.
  // assertFullCoverage was a FILE-level test for a property that lives per METHOD —
  // which is precisely the "one authType per file" model this scanner replaced.
  logTest(
    'a file with one resolvable handler and one unresolvable export FAILS coverage',
    (() => {
      const mixed = `
        import { NextResponse } from 'next/server';
        import { requireEventRole } from '@/lib/auth/guards';
        import { prisma } from '@/lib/prisma';
        export async function GET(request: Request) {
          const auth = await requireEventRole('x', ['HOST']);
          if (auth instanceof NextResponse) return auth;
          return NextResponse.json(await prisma.event.findMany());
        }
        async function deleteHandler(request: Request) {
          await prisma.event.deleteMany();
          return NextResponse.json({ ok: true });
        }
        export { deleteHandler as DELETE };
      `;
      const res = scanSources(new Map([[F, mixed]]));
      if (res.unparsed.length === 0) return false;
      let threw = false;
      try {
        assertFullCoverage(res);
      } catch {
        threw = true;
      }
      return threw && res.unparsed.some((u) => u.method === 'DELETE');
    })(),
    'the DELETE performs an unauthenticated deleteMany and used to vanish from the ' +
      'report while coverage stayed green, because the FILE yielded a verdict'
  );

  logTest(
    '[CONTROL] a file whose handlers all resolve does NOT fail coverage',
    (() => {
      const clean = `
        import { NextResponse } from 'next/server';
        export async function GET(request: Request) {
          return NextResponse.json({ ok: true });
        }
        export async function POST(request: Request) {
          return NextResponse.json({ ok: true });
        }
      `;
      const res = scanSources(new Map([[F, clean]]));
      return res.unparsed.length === 0 && res.handlers.length === 2;
    })(),
    'per-method coverage that fires on everything is the cry-wolf failure; this ' +
      'control is what makes the assertion above mean something'
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// Suite 8 — GTC-273: the no-op property, asserted rather than reported
// ────────────────────────────────────────────────────────────────────────────────
/**
 * ⚠ THIS SUITE IS THE DELIVERABLE OF GTC-273, NOT SUITES 6 AND 7.
 *
 * Founder instruction, 2026-09-12: "You measured zero newly-flagged correct
 * handlers across every proposed rule. Assert that, don't report it: the full scan
 * output before and after must be identical except the six cron verdicts moving from
 * unflagged to FAIL_CLOSED. If anything else moves, HALT and tell me before changing
 * a rule to make it stop."
 *
 * Ten rules were rewritten. The value of that is entirely in what they would catch
 * NEXT, and it is worth nothing if the rewrite moved a verdict on today's tree —
 * because then the rewrite is a behaviour change wearing the costume of a fix, and
 * GTC-273's Stop Condition 9 applies.
 *
 * So the table below is the complete verdict set at HEAD, pinned as an exact
 * equality on BOTH the credential kind and its proof. It was kinds-only at first and
 * that was too weak — it passed while `POST /api/auth/verify` moved from PROVEN to
 * UNPROVEN, because the kind had not changed. A control that cannot see a movement
 * is the same failure as a gate that cannot fail. It is every handler that is unguarded or carries a credential —
 * 24 rows, the only rows any of the ten rules could have moved. The other 110
 * handlers are covered by the guarded/unguarded counts in suite 1.
 *
 * THE ONE INTENDED CHANGE is the six cron `SHARED_SECRET` credentials, which had
 * `failOpen: false` meaning "not the one shape I recognise" and now have
 * `proof: 'PROVEN'` meaning fail-closed and demonstrated. That is asserted
 * separately, in suite 6, against the real files.
 */
const HEAD_VERDICTS: ReadonlyArray<readonly [string, boolean, string]> = [
  [
    'GET src/app/api/cron/decide-by-followups/route.ts',
    false,
    'SHARED_SECRET:PROVEN+SHARED_SECRET:PROVEN',
  ],
  ['GET src/app/api/cron/nudges/route.ts', false, 'SHARED_SECRET:PROVEN+SHARED_SECRET:PROVEN'],
  [
    'GET src/app/api/cron/wrap-up-dispatch/route.ts',
    false,
    'SHARED_SECRET:PROVEN+SHARED_SECRET:PROVEN',
  ],
  ['GET src/app/api/demo/tokens/route.ts', false, ''],
  ['GET src/app/api/events/[id]/clone-source/route.ts', false, ''],
  ['GET src/app/api/events/[id]/tokens/route.ts', true, 'CREDENTIAL_COLUMN:PROVEN'],
  ['GET src/app/api/gather/[eventId]/directory/route.ts', false, ''],
  ['GET src/app/api/sms/inbound/route.ts', false, ''],
  ['GET src/app/api/templates/gather/route.ts', false, ''],
  ['POST src/app/api/auth/claim/route.ts', false, ''],
  ['POST src/app/api/auth/logout/route.ts', false, ''],
  ['POST src/app/api/auth/magic-link/route.ts', false, ''],
  ['POST src/app/api/auth/verify/route.ts', false, 'CREDENTIAL_COLUMN:UNPROVEN'],
  ['POST src/app/api/billing/checkout/route.ts', false, ''],
  [
    'POST src/app/api/cron/decide-by-followups/route.ts',
    false,
    'SHARED_SECRET:PROVEN+SHARED_SECRET:PROVEN',
  ],
  ['POST src/app/api/cron/nudges/route.ts', false, 'SHARED_SECRET:PROVEN+SHARED_SECRET:PROVEN'],
  [
    'POST src/app/api/cron/wrap-up-dispatch/route.ts',
    false,
    'SHARED_SECRET:PROVEN+SHARED_SECRET:PROVEN',
  ],
  ['POST src/app/api/demo/reset/route.ts', false, 'ENV_GATE:PROVEN'],
  ['POST src/app/api/demo/session/route.ts', false, ''],
  ['POST src/app/api/events/[id]/households/[householdId]/claim/route.ts', false, ''],
  ['POST src/app/api/events/route.ts', false, 'THIRD_PARTY_RECEIPT:PROVEN'],
  ['POST src/app/api/join/[token]/claim/route.ts', false, 'CREDENTIAL_COLUMN:PROVEN'],
  ['POST src/app/api/sms/inbound/route.ts', false, ''],
  ['POST src/app/api/webhooks/stripe/route.ts', false, 'SIGNATURE:PROVEN'],
];

function suite8_NoOpAtHead(head: ScanResult) {
  logSection('Suite 8: GTC-273 moved nothing on the tree it was written against');

  const actual = head.handlers
    .filter((h) => !h.guarded || h.otherCredentials.length > 0)
    .map(
      (h) =>
        `${h.method} ${h.filePath}|${h.guarded}|${h.otherCredentials
          .map((c) => `${c.kind}:${c.proof}`)
          .sort()
          .join('+')}`
    )
    .sort();
  const expected = HEAD_VERDICTS.map(([k, g, c]) => `${k}|${g}|${c}`).sort();

  logTest(
    'the full verdict set at HEAD matches the pinned table, kind AND proof',
    actual.length === expected.length && actual.every((a, i) => a === expected[i]),
    `moved:\n    ${sortedDiff(new Set(actual), new Set(expected)).join('\n    ') || '(count only)'}\n` +
      `  GTC-273 Stop Condition 9 and the founder's HALT instruction both apply: a ` +
      `rule that moved a verdict on today's tree is a behaviour change, not a fix. ` +
      `Report it before touching the rule that did it.`
  );

  // Nothing at HEAD is undecidable. This is the number that makes UNPROVEN safe to
  // make blocking at slice 2 — if it were not zero, slice 2 would start red.
  const unprovenGuards = head.handlers.filter((h) => h.guardProof === 'UNPROVEN');
  logTest(
    'no handler at HEAD has an UNPROVEN guard verdict',
    unprovenGuards.length === 0,
    `${unprovenGuards.length} undecidable: ${unprovenGuards.map(handlerKey).join(', ')}`
  );

  // ⚠ EXACTLY ONE CREDENTIAL AT HEAD IS UNDECIDABLE, AND IT IS A REAL FINDING THAT
  // THE RETIRED RULE ANSWERED BY ACCIDENT.
  //
  // `POST /api/auth/verify` looks up the magic-link token, then refuses an unknown,
  // expired or used token with `Response.json({ success: false, error: 'invalid' })`
  // — at HTTP **200**. The only 4xx in the whole handler is line 13's `status: 400`
  // for a MISSING token in the request body, which is a different branch and a
  // different question. The retired rule tested `/status:\s*4\d{2}/` over the entire
  // function text, so it reported PROVEN by borrowing that unrelated 400.
  //
  // This is the same misattribution species as the /c/ and /p/ analytics lookups, on
  // a handler that sits on GTC-268's PROPOSED SLICE-2 ALLOWLIST with the reason "the
  // credential is the magic-link token it consumes, checked via
  // prisma.magicLink.findUnique". The check is real. Whether a scanner keyed on
  // status codes can confirm it is a different matter, and the honest answer is no:
  // nothing distinguishes a 200 carrying `success: false` from a 200 carrying data
  // without knowing the body convention, and teaching the scanner that convention
  // would be another spelling test of exactly the kind GTC-273 exists to remove.
  //
  // So it stays UNPROVEN and it is pinned by name. At slice 2 it needs a ruling: an
  // allowlist entry with this reason recorded, or a route that refuses with a 401.
  const unprovenCreds = head.handlers.filter((h) =>
    h.otherCredentials.some((c) => c.proof === 'UNPROVEN')
  );
  const UNPROVEN_AT_HEAD = ['POST src/app/api/auth/verify/route.ts'];
  logTest(
    'exactly one credential at HEAD is UNPROVEN, and it is POST /auth/verify (200-bodied refusal)',
    JSON.stringify(unprovenCreds.map(handlerKey).sort()) === JSON.stringify(UNPROVEN_AT_HEAD),
    `got ${unprovenCreds.length}: ${unprovenCreds.map(handlerKey).join(', ')} — a new ` +
      `undecidable credential is a finding to report, not a rule to loosen`
  );

  // ⚠ AND THE CONTROL FOR THE TWO ABOVE. "Nothing is UNPROVEN" is also what a
  // scanner with a broken UNPROVEN verdict reports. GTC-267's rule: an empty search
  // result is a claim, and a claim needs a control. Suites 6 and 7 are full of
  // fixtures that must report UNPROVEN; this asserts the verdict can reach a real
  // ScanResult and is not merely reachable in a fixture.
  const unprovable = scanSources(
    new Map([
      [
        'src/app/api/__unproven__/route.ts',
        `
        import { NextResponse } from 'next/server';
        import { requireEventRole } from '@/lib/auth/guards';
        import { prisma } from '@/lib/prisma';
        export async function GET(request: Request) {
          const preview = new URL(request.url).searchParams.get('preview');
          if (!preview) {
            const auth = await requireEventRole('x', ['HOST']);
            if (auth instanceof NextResponse) return auth;
          }
          return NextResponse.json(await prisma.event.findMany());
        }
      `,
      ],
    ])
  );
  logTest(
    '[CONTROL] UNPROVEN is reachable in a real ScanResult, not only in a fixture',
    unprovable.handlers.length === 1 && unprovable.handlers[0].guardProof === 'UNPROVEN',
    'if UNPROVEN can never be produced, the two assertions above prove nothing and ' +
      "slice 2's blocking rule has nothing to block on"
  );
}

function main() {
  console.log(`${BOLD}${YELLOW}=== Route Scanner Control Suite (GTC-268 slice 1) ===${RESET}\n`);
  console.log('Contract under test:');
  console.log('1. The scanner reproduces GTC-267 at 298b62d and its absence at HEAD');
  console.log('2. The unit is the exported method, not the file');
  console.log('3. Calling a guard is not checking one');
  console.log('4. The known-hard cases are pinned, not assumed');
  console.log('5. A route file the scanner cannot read is a failure, not a gap');
  console.log('6. Fail-open is EVALUATED, not matched — 14 shapes, 13 fail-closed');
  console.log('7. Every rule answers PROVEN / REFUTED / UNPROVEN, never two-valued');
  console.log('8. And none of it moved a verdict on the tree it was written against\n');

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
  suite6_FailOpenIsEvaluated();
  suite7_ThreeVerdicts();
  suite8_NoOpAtHead(head);

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
