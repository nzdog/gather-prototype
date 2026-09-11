/**
 * Route Auth Scanner — GTC-268, slice 1 (REPORTING ONLY)
 *
 * Run with: npm run security:routes
 * Its control suite: npm run test:security:routes
 *
 * ⚠ SLICE 1 EXITS 0 ON EVERY SECURITY FINDING, BY DESIGN AND BY FOUNDER RULING
 * (2026-09-11). It fails nothing and blocks nothing. Default-deny, the allowlist and
 * the CI step are slice 2, and slice 2 is blocked on rulings for the handlers this
 * report names. The first honest run should produce a list to rule on, not a broken
 * build. The marker for that end condition is [[GTC-268]] slice 2 — see the
 * Citations rule on provisional states in BUG-TICKET-TEMPLATE.md.
 *
 * THE ONE EXCEPTION IS COVERAGE, AND IT IS A DIFFERENT CATEGORY. If any route file
 * on disk yields no handler verdict the scan exits 2 and prints nothing else — see
 * `assertFullCoverage`. "Here is what I found" and "I could not look properly" are
 * not the same statement, and only the first one is allowed to be quiet.
 *
 * ── WHAT THIS REPLACES, AND WHY A REPLACEMENT WAS NEEDED ───────────────────────
 *
 * `tests/security-inventory-gate.ts` reads one file — `route-classifications.json`,
 * hand-maintained, its generator (`scripts/classify-routes.ts`) deleted 2026-03-04
 * in `00972c0`, a chore commit about an environment variable. It never opens a
 * route file. It cannot fail: all four of its rules filter the contents of a
 * `securityIssues` array that is empty on all 81 entries, and its one non-empty
 * clause tests `authType === 'WEAK_PARAM'`, a value no entry carries. It has no npm
 * script. Its failure text names a generator that does not exist and an npm script
 * that never has.
 *
 * The unit is the difference. That file records ONE verdict PER FILE. Authentication
 * happens PER EXPORTED METHOD. `src/app/api/events/[id]/route.ts` was recorded
 * `"authType": "SESSION"` while its `GET` had no guard and its `PATCH` and `DELETE`
 * did — which is how [[GTC-267]]'s nine unauthenticated reads sat in plain sight
 * under a green gate.
 *
 * ── WHAT THIS SCANNER ACTUALLY PROVES, AND WHAT IT DOES NOT ────────────────────
 *
 * PROVES: that a credential check runs, and that its result is acted on, on every
 * path through an exported handler.
 *
 * DOES NOT PROVE: that the check is CORRECT. `POST` in
 * `src/app/api/templates/route.ts` compares a `User` id to a `Person` id and so
 * refuses its own host — a guarded route with a broken check. This scanner reports
 * it guarded, and is right to: authorisation logic is a test's job, not a scanner's.
 * Recorded here so the green this prints is never read as more than it is.
 *
 * ── DECLARED BLIND SPOTS ───────────────────────────────────────────────────────
 *
 * 1. HELPER DEPTH IS BOUNDED at MAX_HELPER_DEPTH. Guards reached through deeper
 *    chains are missed. Every instance in the tree today is depth 1.
 * 2. NO CROSS-FILE GUARD RESOLUTION. A guard wrapped in a helper imported from
 *    `src/lib/` would be invisible. No route does this today; nothing prevents one.
 * 3. CREDENTIAL COLUMNS ARE A DECLARED LIST (CREDENTIAL_COLUMNS below). A lookup on
 *    `sharedLinkToken` is authentication; a lookup on `name` is not; nothing in the
 *    syntax distinguishes them. This list is a maintained input and is the one place
 *    this tool shares a weakness with the file it replaces — four column names
 *    checked against `prisma/schema.prisma`, rather than 81 hand-written verdicts.
 * 4. SERVER ACTIONS ARE OUT OF SCOPE. This walks `src/app/api` only. `c05cfde` chose
 *    a route over a server action precisely because actions are invisible to the
 *    inventory; that reasoning survives unchanged, and whether it should is an open
 *    question on [[GTC-268]].
 */

import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';

// ────────────────────────────────────────────────────────────────────────────────
// Declared inputs
// ────────────────────────────────────────────────────────────────────────────────

/** Next.js route handler exports. */
const HTTP_METHODS = new Set(['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'HEAD', 'OPTIONS']);

/**
 * Session-shaped guards. `requireEventRoleOrToken` is listed here because it tries
 * session auth first; note it currently has ZERO callers in the tree — an exported
 * guard that guards nothing (recorded in [[GTC-268]]).
 */
const SESSION_GUARDS = new Set(['requireEventRole', 'requireEventRoleOrToken', 'getUser']);

/** Token-scope guards from `src/lib/auth/guards.ts` and `src/lib/auth.ts`. */
const TOKEN_GUARDS = new Set(['requireTokenScope', 'resolveToken']);

/**
 * Columns whose value IS a credential. A `findFirst` keyed on one of these, followed
 * by a refusal, is authentication — structurally identical to any other lookup,
 * which is why the scanner has to be told. Each checked against `prisma/schema.prisma`.
 */
const CREDENTIAL_COLUMNS: ReadonlyArray<{ model: string; field: string }> = [
  { model: 'event', field: 'sharedLinkToken' },
  { model: 'accessToken', field: 'token' },
  { model: 'magicLink', field: 'token' },
  { model: 'session', field: 'token' },
];

/** Environment variables used as a shared secret by cron endpoints. */
const SHARED_SECRETS = new Set(['CRON_SECRET']);

const MAX_HELPER_DEPTH = 3;

// ────────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────────

export type GuardKind = 'SESSION' | 'TOKEN';

export type CredentialKind =
  | 'CREDENTIAL_COLUMN'
  | 'SHARED_SECRET'
  | 'SIGNATURE'
  | 'THIRD_PARTY_RECEIPT'
  | 'ENV_GATE';

export interface GuardEvidence {
  symbol: string;
  kind: GuardKind;
  viaHelper: boolean;
}

export interface OtherCredential {
  kind: CredentialKind;
  detail: string;
  /** True when the check is skipped entirely if its secret is unset (GTC-270). */
  failOpen?: boolean;
}

export interface HandlerVerdict {
  filePath: string;
  apiPath: string;
  method: string;
  /** A session or token guard runs AND its result is acted on. */
  guarded: boolean;
  guardEvidence: GuardEvidence[];
  /** Guards that are CALLED but whose result is discarded — the defect `authEvidence` cannot see. */
  uncheckedGuards: string[];
  otherCredentials: OtherCredential[];
}

export interface ScanResult {
  files: string[];
  handlers: HandlerVerdict[];
  sources: Map<string, string>;
  /**
   * Route files that yielded NO handler verdict — a file the scanner could not
   * read. See `assertFullCoverage`: this is a tool failure, never a finding, and
   * it must never be silent.
   */
  unparsed: UnparsedFile[];
}

export interface UnparsedFile {
  filePath: string;
  reason: string;
}

// ────────────────────────────────────────────────────────────────────────────────
// Core analysis
// ────────────────────────────────────────────────────────────────────────────────

export function toApiPath(filePath: string): string {
  return filePath
    .replace(/^src\/app/, '')
    .replace(/\/route\.ts$/, '')
    .replace(/\[([^\]]+)\]/g, ':$1');
}

export function handlerKey(h: HandlerVerdict): string {
  return `${h.method} ${h.filePath}`;
}

type FnLike = ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression;

function isExported(node: ts.Node): boolean {
  const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

function calleeName(call: ts.CallExpression): string | null {
  if (ts.isIdentifier(call.expression)) return call.expression.text;
  if (ts.isPropertyAccessExpression(call.expression)) return call.expression.name.text;
  return null;
}

/**
 * Is this guard's result acted on?
 *
 * A guard returns a `NextResponse` on failure. Calling it and discarding the result
 * leaves the route wide open while every symbol-matching model reports it guarded.
 * That distinction is the whole reason this file exists, so it is decided
 * structurally: the result must reach a variable that a condition later tests, or be
 * tested inline, or be returned to a caller that can test it.
 */
function guardResultIsChecked(
  call: ts.CallExpression,
  container: ts.Node,
  sf: ts.SourceFile
): boolean {
  let parent: ts.Node | undefined = call.parent;
  if (parent && ts.isAwaitExpression(parent)) parent = parent.parent;
  if (!parent) return false;

  let varName: string | null = null;

  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
    varName = parent.name.text;
  } else if (
    ts.isBinaryExpression(parent) &&
    parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    ts.isIdentifier(parent.left)
  ) {
    // `let auth; try { auth = await requireEventRole(...) } ...` — the shape used by
    // every route that wraps its guard in a try/catch to fail closed on a throw.
    varName = parent.left.text;
  } else if (
    ts.isIfStatement(parent) ||
    ts.isPrefixUnaryExpression(parent) ||
    ts.isConditionalExpression(parent) ||
    (ts.isBinaryExpression(parent) && parent.operatorToken.kind !== ts.SyntaxKind.EqualsToken)
  ) {
    return true; // tested inline
  } else if (ts.isReturnStatement(parent)) {
    return true; // handed to a caller that can test it
  }

  if (!varName) return false;

  // The variable must appear in the condition of an `if` somewhere in the same
  // function body. Merely reading `auth.user` is not checking `auth`.
  let tested = false;
  const name = varName;
  const visit = (node: ts.Node): void => {
    if (tested) return;
    if (ts.isIfStatement(node)) {
      const cond = node.expression.getText(sf);
      if (new RegExp(`\\b${name}\\b`).test(cond)) {
        tested = true;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(container);
  return tested;
}

function refusesSomewhere(container: ts.Node, sf: ts.SourceFile): boolean {
  // A 4xx return anywhere in the function that performs the lookup. Deliberately
  // coarse: proving WHICH branch refuses is authorisation logic, not this tool's job.
  return /status:\s*4\d{2}/.test(container.getText(sf));
}

function collectCredentialColumn(
  call: ts.CallExpression,
  container: ts.Node,
  sf: ts.SourceFile
): OtherCredential | null {
  if (!ts.isPropertyAccessExpression(call.expression)) return null;
  const text = call.expression.getText(sf);
  const m = /^prisma\.([A-Za-z0-9_]+)\.(find\w+)$/.exec(text);
  if (!m) return null;
  const model = m[1];

  const fields = CREDENTIAL_COLUMNS.filter((c) => c.model === model).map((c) => c.field);
  if (fields.length === 0) return null;

  // ⚠ ONLY THE `where` CLAUSE COUNTS. Searching the whole call reads
  // `select: { token: true }` as a credential check — which inverts the meaning of
  // the route that does it. GET /api/gather/[eventId]/directory SELECTS access
  // tokens to hand them to anonymous callers; it is keyed on `eventId` alone and
  // checks nothing. The first run of this scanner reported it as carrying a
  // credential, and a scanner that reads a credential VENDOR as a credential
  // CHECKER is worse than no scanner. Asserted in the control suite.
  const whereClauses: ts.Node[] = [];
  const findWhere = (node: ts.Node): void => {
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && node.name.text === 'where') {
      whereClauses.push(node.initializer);
      return;
    }
    ts.forEachChild(node, findWhere);
  };
  call.arguments.forEach(findWhere);

  let hit: string | null = null;
  const visit = (node: ts.Node): void => {
    if (hit) return;
    if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      fields.includes(node.name.text)
    ) {
      hit = node.name.text;
      return;
    }
    if (ts.isShorthandPropertyAssignment(node) && fields.includes(node.name.text)) {
      hit = node.name.text;
      return;
    }
    ts.forEachChild(node, visit);
  };
  whereClauses.forEach((w) => {
    visit(w);
    ts.forEachChild(w, visit);
  });

  if (!hit || !refusesSomewhere(container, sf)) return null;
  return { kind: 'CREDENTIAL_COLUMN', detail: `prisma.${model} keyed on ${hit}` };
}

function collectSharedSecret(node: ts.IfStatement, sf: ts.SourceFile): OtherCredential | null {
  const cond = node.expression;
  const condText = cond.getText(sf);
  const secret = [...SHARED_SECRETS].find((s) => new RegExp(`\\b${s}\\b`).test(condText));
  if (!secret) return null;

  // FAIL-OPEN, the GTC-270 shape: `if (CRON_SECRET && provided !== CRON_SECRET)`.
  // When the variable is unset the left operand is falsy, the body never runs, and
  // the endpoint is open to anyone — the guard disappears exactly when the
  // deployment forgot to configure it.
  let failOpen = false;
  if (
    ts.isBinaryExpression(cond) &&
    cond.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
    ts.isIdentifier(cond.left) &&
    cond.left.text === secret
  ) {
    failOpen = true;
  }
  return {
    kind: 'SHARED_SECRET',
    detail: `${secret} compared in a refusal branch`,
    failOpen,
  };
}

function collectEnvGate(node: ts.IfStatement, sf: ts.SourceFile): OtherCredential | null {
  const condText = node.expression.getText(sf);
  if (!/process\.env\.NODE_ENV/.test(condText)) return null;
  // Only an `if` CONDITION counts. `secure: process.env.NODE_ENV === 'production'`
  // on a cookie is not a gate, and reading it as one is how POST /api/demo/session
  // looks protected while minting a 30-day HOST session to anyone (GTC-269).
  if (!/status:\s*4\d{2}/.test(node.getText(sf))) return null;
  return { kind: 'ENV_GATE', detail: 'NODE_ENV checked in a refusal branch' };
}

/** Analyse one route file's source. The unit of the result is the exported method. */
export function analyzeSource(filePath: string, text: string): HandlerVerdict[] {
  const sf = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  const localFns = new Map<string, FnLike>();
  const handlerFns = new Map<string, FnLike>();

  sf.forEachChild((n) => {
    if (ts.isFunctionDeclaration(n) && n.name) {
      localFns.set(n.name.text, n);
      if (isExported(n) && HTTP_METHODS.has(n.name.text)) handlerFns.set(n.name.text, n);
    }
    if (ts.isVariableStatement(n)) {
      for (const d of n.declarationList.declarations) {
        if (!ts.isIdentifier(d.name) || !d.initializer) continue;
        if (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer)) {
          localFns.set(d.name.text, d.initializer);
          if (isExported(n) && HTTP_METHODS.has(d.name.text))
            handlerFns.set(d.name.text, d.initializer);
        }
      }
    }
  });

  const verdicts: HandlerVerdict[] = [];

  for (const [method, fn] of handlerFns) {
    const guardEvidence: GuardEvidence[] = [];
    const uncheckedGuards: string[] = [];
    const otherCredentials: OtherCredential[] = [];

    const seen = new Set<string>();

    const walk = (node: ts.Node, container: ts.Node, depth: number): void => {
      const visit = (child: ts.Node): void => {
        if (ts.isIfStatement(child)) {
          const secret = collectSharedSecret(child, sf);
          if (secret) otherCredentials.push(secret);
          const env = collectEnvGate(child, sf);
          if (env) otherCredentials.push(env);
        }

        if (ts.isCallExpression(child)) {
          const name = calleeName(child);

          if (name && (SESSION_GUARDS.has(name) || TOKEN_GUARDS.has(name))) {
            const kind: GuardKind = SESSION_GUARDS.has(name) ? 'SESSION' : 'TOKEN';
            if (guardResultIsChecked(child, container, sf)) {
              guardEvidence.push({ symbol: name, kind, viaHelper: depth > 0 });
            } else {
              uncheckedGuards.push(name);
            }
          }

          const col = collectCredentialColumn(child, container, sf);
          if (col) otherCredentials.push(col);

          if (name === 'constructEvent') {
            otherCredentials.push({ kind: 'SIGNATURE', detail: 'stripe.webhooks.constructEvent' });
          }

          if (ts.isPropertyAccessExpression(child.expression)) {
            const t = child.expression.getText(sf);
            if (t === 'stripe.checkout.sessions.retrieve') {
              otherCredentials.push({
                kind: 'THIRD_PARTY_RECEIPT',
                detail: 'Stripe checkout session retrieved and verified',
              });
            }
          }

          // Follow local helpers and sibling handlers. Both shapes are live in the
          // cron routes: `handleRequest` holds the whole check in two files, and
          // POST delegates to the exported GET in a third.
          if (name && localFns.has(name) && !seen.has(name) && depth < MAX_HELPER_DEPTH) {
            seen.add(name);
            const target = localFns.get(name)!;
            if (target.body) walk(target.body, target.body, depth + 1);
          }
        }

        ts.forEachChild(child, visit);
      };
      ts.forEachChild(node, visit);
    };

    if (fn.body) walk(fn.body, fn.body, 0);

    verdicts.push({
      filePath,
      apiPath: toApiPath(filePath),
      method,
      guarded: guardEvidence.length > 0,
      guardEvidence,
      uncheckedGuards: [...new Set(uncheckedGuards)],
      otherCredentials,
    });
  }

  return verdicts;
}

/**
 * The RETIRED model, kept as a live refutation rather than a claim in a ticket:
 * "does a guard symbol appear anywhere in this file." This is what
 * `authEvidence: ["requireEventRole"]` encodes. Its control suite asserts that it
 * gets GTC-267's headline file WRONG.
 */
export function fileLevelGuardSymbols(text: string): string[] {
  const found: string[] = [];
  for (const s of [...SESSION_GUARDS, ...TOKEN_GUARDS]) {
    if (new RegExp(`\\b${s}\\b`).test(text)) found.push(s);
  }
  return found;
}

// ────────────────────────────────────────────────────────────────────────────────
// Sources: the working tree, and any git ref
// ────────────────────────────────────────────────────────────────────────────────

const API_DIR = 'src/app/api';

function walkDir(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walkDir(p, out);
    else if (entry.name === 'route.ts') out.push(p);
  }
  return out;
}

export function scanWorkingTree(root: string = process.cwd()): ScanResult {
  const abs = walkDir(path.join(root, API_DIR)).sort();
  const sources = new Map<string, string>();
  for (const a of abs) {
    sources.set(path.relative(root, a).split(path.sep).join('/'), fs.readFileSync(a, 'utf-8'));
  }
  return buildResult(sources);
}

/**
 * Read the route surface at an arbitrary commit WITHOUT touching the working tree
 * and without creating a worktree. The control suite compares HEAD against
 * `298b62d`; doing that by checking anything out would make the tool unrunnable
 * while someone has uncommitted work, which is exactly when it is most wanted.
 */
export function scanGitRef(ref: string, root: string = process.cwd()): ScanResult {
  execFileSync('git', ['rev-parse', '--verify', `${ref}^{commit}`], { cwd: root, stdio: 'pipe' });

  const listing = execFileSync('git', ['ls-tree', '-r', ref, '--', API_DIR], {
    cwd: root,
    encoding: 'utf-8',
    maxBuffer: 1 << 28,
  });

  const blobs: Array<{ sha: string; file: string }> = [];
  for (const line of listing.split('\n')) {
    if (!line.trim()) continue;
    const [meta, file] = line.split('\t');
    if (!file || !file.endsWith('/route.ts')) continue;
    const parts = meta.split(/\s+/);
    blobs.push({ sha: parts[2], file });
  }
  blobs.sort((a, b) => a.file.localeCompare(b.file));

  const sources = new Map<string, string>();
  if (blobs.length > 0) {
    // One `cat-file --batch` process for the whole tree rather than one `git show`
    // per file: 105 spawns is the difference between a control you run and one you
    // avoid running.
    const batch = execFileSync('git', ['cat-file', '--batch'], {
      cwd: root,
      input: blobs.map((b) => b.sha).join('\n') + '\n',
      maxBuffer: 1 << 28,
    });

    let offset = 0;
    for (const blob of blobs) {
      const nl = batch.indexOf(0x0a, offset);
      if (nl < 0) break;
      const header = batch.subarray(offset, nl).toString('utf-8');
      const size = Number(header.split(' ')[2]);
      const start = nl + 1;
      sources.set(blob.file, batch.subarray(start, start + size).toString('utf-8'));
      offset = start + size + 1; // trailing newline
    }
  }

  return buildResult(sources);
}

/** Analyse an arbitrary set of sources. Exported so the control can drive fixtures. */
export function scanSources(sources: Map<string, string>): ScanResult {
  return buildResult(sources);
}

function buildResult(sources: Map<string, string>): ScanResult {
  const files = [...sources.keys()].sort();
  const handlers: HandlerVerdict[] = [];
  const unparsed: UnparsedFile[] = [];

  for (const f of files) {
    const text = sources.get(f)!;
    const verdicts = analyzeSource(f, text);

    // TWO WAYS A FILE CAN BE UNREADABLE, AND THE SECOND ONE IS THE DANGEROUS ONE.
    //
    // (a) It yields no handler verdict — an export form this scanner does not
    //     resolve, or source with nothing recognisable in it.
    //
    // (b) It has parse errors but STILL yields verdicts. TypeScript's parser
    //     recovers rather than throwing, so broken source produces a tree anyway —
    //     with an invented shape. `export async function GET( { const ??? <<<`
    //     parses to a `GET` declaration whose body is whatever recovery decided,
    //     and a verdict read off that is a guess wearing the costume of a fact. It
    //     could as easily report GUARDED as UNGUARDED.
    //
    // Case (b) was found by the coverage fixture the founder asked for, within
    // minutes of it being written, against a scanner that had already passed 51
    // assertions. Both cases are the same failure from here: a file whose verdict
    // must not be believed.
    const diagnostics = parseErrorsIn(f, text);
    if (verdicts.length === 0) {
      unparsed.push({ filePath: f, reason: describeWhyNoHandlers(f, text) });
    } else if (diagnostics > 0) {
      unparsed.push({
        filePath: f,
        reason:
          `${diagnostics} parse error(s); the parser recovered and produced ` +
          `${verdicts.length} handler verdict(s) from a tree that does not match the source`,
      });
    }

    handlers.push(...verdicts);
  }

  return { files, handlers, sources, unparsed };
}

/**
 * A Next.js `route.ts` that exports no HTTP handler this scanner recognises is
 * either malformed or written in a shape the scanner does not understand. Both are
 * the same thing from here: a route the tool cannot see.
 */
/**
 * Syntactic diagnostics for one source. `parseDiagnostics` is not on the public
 * `SourceFile` type, so it is read through a narrow cast; if a future TypeScript
 * removes it this returns 0 and the zero-handler check still stands.
 */
function parseErrorsIn(filePath: string, text: string): number {
  const sf = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const diagnostics = (sf as unknown as { parseDiagnostics?: ts.Diagnostic[] }).parseDiagnostics;
  return diagnostics?.length ?? 0;
}

function describeWhyNoHandlers(filePath: string, text: string): string {
  const sf = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const diagnostics = (sf as unknown as { parseDiagnostics?: ts.Diagnostic[] }).parseDiagnostics;
  if (diagnostics && diagnostics.length > 0) {
    const first = ts.flattenDiagnosticMessageText(diagnostics[0].messageText, ' ');
    return `${diagnostics.length} parse error(s); first: ${first}`;
  }
  if (/export\s*\{/.test(text)) {
    return 'no recognised handler export; the file uses an `export { ... }` list, which this scanner does not resolve';
  }
  return 'no exported GET/POST/PATCH/PUT/DELETE/HEAD/OPTIONS handler was found';
}

/**
 * ⚠ THE COVERAGE ASSERTION — the one failure slice 1 is allowed to have.
 *
 * Founder ruling, 2026-09-11, wanted in before the tool has any history:
 *
 *   "The scanner must fail if any route file on disk yields no handler verdict.
 *    A file it cannot parse must be a failure, never a silent omission. The old
 *    gate's deepest defect was not a wrong rule, it was 29 routes it never saw at
 *    all — and a scanner that quietly skips a file it cannot read reintroduces
 *    that on day one, invisibly."
 *
 * THIS IS NOT A SECURITY FINDING AND IS NOT SUBJECT TO "EXIT 0 UNCONDITIONALLY".
 * The two are different categories and the distinction is the whole point:
 *
 *   - "Here is what I found"       -> exit 0. Slice 1 produces a list to rule on.
 *   - "I could not look properly"  -> exit 2. Nothing downstream may be believed.
 *
 * A tool that reports 133 handlers when the tree holds 134 is not reporting a
 * smaller problem than a tool that reports a hole. It is reporting a number that
 * cannot be checked against anything, which is exactly what
 * `route-classifications.json` did for eighteen months.
 */
export function assertFullCoverage(result: ScanResult): void {
  if (result.unparsed.length === 0) return;
  const lines = result.unparsed.map((u) => `  ${u.filePath}\n    ${u.reason}`).join('\n');
  throw new Error(
    `Route scan coverage failure: ${result.unparsed.length} of ${result.files.length} ` +
      `route file(s) yielded no handler verdict.\n${lines}\n` +
      `A route the scanner cannot see is indistinguishable from a route that is safe.`
  );
}

/**
 * Handlers with no SESSION and no TOKEN guard.
 *
 * NOT the same as "unauthenticated": a Stripe signature, a CRON_SECRET comparison
 * and a credential-column lookup are real credentials and are reported separately.
 * This is the count [[GTC-267]] was about, and nothing wider.
 */
export function unguardedHandlers(result: ScanResult): HandlerVerdict[] {
  return result.handlers.filter((h) => !h.guarded);
}

// ────────────────────────────────────────────────────────────────────────────────
// CLI — report, and exit 0 no matter what
// ────────────────────────────────────────────────────────────────────────────────

const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

function main(): void {
  const started = Date.now();
  const result = scanWorkingTree();

  // Coverage first. Everything printed below is meaningless if the scan is partial.
  if (result.unparsed.length > 0) {
    console.error(`${BOLD}${YELLOW}=== ROUTE AUTH SCAN — COVERAGE FAILURE ===${RESET}\n`);
    console.error(
      `${result.unparsed.length} of ${result.files.length} route files yielded no handler verdict.\n`
    );
    for (const u of result.unparsed) {
      console.error(`  ${u.filePath}`);
      console.error(`    ${DIM}${u.reason}${RESET}`);
    }
    console.error(
      `\nA route the scanner cannot see is indistinguishable from a route that is safe.\n` +
        `Slice 1 exits 0 on FINDINGS. It does not exit 0 on being unable to look.\n`
    );
    process.exit(2);
  }

  const open = unguardedHandlers(result);

  console.log(
    `${BOLD}${YELLOW}=== ROUTE AUTH SCAN (GTC-268 slice 1 — reporting only) ===${RESET}\n`
  );
  console.log(`Route files:       ${result.files.length}`);
  console.log(`Exported handlers: ${result.handlers.length}`);
  console.log(
    `With a session or token guard: ${GREEN}${result.handlers.length - open.length}${RESET}`
  );
  console.log(`Without one:                   ${YELLOW}${open.length}${RESET}\n`);

  const unchecked = result.handlers.filter((h) => h.uncheckedGuards.length > 0);
  if (unchecked.length > 0) {
    console.log(`${BOLD}Guards CALLED but not CHECKED — a guard that cannot refuse anyone${RESET}`);
    for (const h of unchecked) {
      console.log(`  ${h.method} ${h.apiPath}  (${h.uncheckedGuards.join(', ')})`);
      console.log(`    ${DIM}${h.filePath}${RESET}`);
    }
    console.log('');
  }

  console.log(`${BOLD}Handlers with no session or token guard${RESET}`);
  console.log(
    `${DIM}Each is either public on purpose or a hole. Slice 2 decides; slice 1 lists.${RESET}\n`
  );

  for (const h of open) {
    const creds = h.otherCredentials;
    const label =
      creds.length === 0
        ? `${YELLOW}no credential of any kind${RESET}`
        : creds
            .map(
              (c) => `${CYAN}${c.kind}${RESET}${c.failOpen ? ` ${YELLOW}[FAIL-OPEN]${RESET}` : ''}`
            )
            .join(', ');
    console.log(`  ${h.method.padEnd(7)}${h.apiPath}`);
    console.log(`    ${label}`);
    for (const c of creds) console.log(`    ${DIM}${c.detail}${RESET}`);
  }

  const noCred = open.filter((h) => h.otherCredentials.length === 0);
  console.log(`\n${BOLD}${YELLOW}=== SUMMARY ===${RESET}`);
  console.log(`No guard and no other credential: ${noCred.length}`);
  console.log(
    `Fail-open credentials (GTC-270):  ${open.filter((h) => h.otherCredentials.some((c) => c.failOpen)).length}`
  );
  console.log(`Scan time: ${Date.now() - started}ms\n`);

  console.log(`${DIM}Slice 1 is reporting only and exits 0 unconditionally. Default-deny,`);
  console.log(`the allowlist and the CI step are slice 2 of GTC-268.${RESET}\n`);

  process.exit(0);
}

if (require.main === module) main();
