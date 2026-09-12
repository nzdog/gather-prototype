/**
 * Route Auth Scanner — GTC-268, slice 1 / 1b (REPORTING ONLY)
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
 * THE ONE EXCEPTION IS COVERAGE, AND IT IS A DIFFERENT CATEGORY. If any exported
 * handler on disk yields no verdict the scan exits 2 and prints nothing else — see
 * `assertFullCoverage`. "Here is what I found" and "I could not look properly" are
 * not the same statement, and only the first one is allowed to be quiet.
 *
 * ── SLICE 1b — GTC-273: THREE VERDICTS, BECAUSE TWO WAS THE DEFECT ─────────────
 *
 * [[GTC-273]] was filed about ONE rule: the fail-open detector fired only when the
 * condition was an `&&` whose left operand was the bare identifier `CRON_SECRET`.
 * Four rewrites that are genuinely fail-open passed unflagged, and one of them
 * reported "no credential of any kind" — so a broken guard read as no guard.
 *
 * The investigation measured all ten of this scanner's rules and found every one of
 * them deciding by spelling in at least one direction. Five failed toward GREEN,
 * which is to say they reported a guard or a credential where there was none:
 *
 *   `guardResultIsChecked`   tested `\b<var>\b` against the `if` condition TEXT, and
 *                            that matches inside `auth.user` — so
 *                            `if (auth.user.role === 'HOST')` counted as checking a
 *                            guard whose NextResponse is never returned. The comment
 *                            above that code asserted the opposite.
 *   `refusesSomewhere`       a `status: 401` inside a COMMENT satisfied it.
 *   `collectEnvGate`         any 4xx anywhere in the `if` satisfied it, and a local
 *                            binding of NODE_ENV defeated it entirely.
 *   SIGNATURE                any function named `constructEvent` satisfied it;
 *                            Stripe's own `constructEventAsync` defeated it.
 *   THIRD_PARTY_RECEIPT      retrieving a Stripe session counted as a verified
 *                            receipt without ever reading `payment_status` — the
 *                            guard-versus-call defect this scanner exists to catch,
 *                            left unfixed for receipts.
 *   `collectCredentialColumn` an aliased client (`db.accessToken`) defeated it, a
 *                            credential consumed by `update()` defeated it, and
 *                            `where: { token: { not: null } }` and a permissive `OR`
 *                            both satisfied it.
 *   guard symbols            `calleeName` returned the PROPERTY name, so any
 *                            `analytics.getUser()` counted as a session guard.
 *   path sensitivity         `guarded = guardEvidence.length > 0` is existential,
 *                            where [[GTC-268]] states the property as universal:
 *                            "every terminal path either passes a check or returns a
 *                            refusal."
 *   coverage                 per FILE, for a property that lives per METHOD — which
 *                            is the retired gate's own defect, rebuilt inside the
 *                            safety net that exists to prevent it.
 *
 * THE ONE DIAGNOSIS UNDERNEATH ALL TEN. Every rule was BINARY, and in every rule the
 * absence of evidence was printed as the absence of the thing. There was no verdict
 * for "I could not tell". This scanner already had that vocabulary — it built it for
 * parsing, and stated the principle four paragraphs above — and applied it nowhere
 * else. `failOpen: false` did not mean fail-closed. It meant "not the one shape I
 * recognise", and the report printed nothing to distinguish those.
 *
 * So every rule now answers `Proof`: PROVEN, REFUTED, or UNPROVEN. UNPROVEN is never
 * read as either of the others.
 *
 * ⚠ FOUNDER RULING, 2026-09-12 — RECORDED HERE SO SLICE 2 INHERITS IT RATHER THAN
 * RELITIGATING IT: **UNPROVEN BLOCKS AT SLICE 2, AND PRINTS AS UNPROVEN.**
 *
 *   "A handler the scanner cannot decide must not be silently admitted, and must not
 *    silently acquire a permanent exception either."
 *
 * The reason is the mechanism already visible in this tree. When a gate flags correct
 * code nobody disables the gate — they add an allowlist entry, and that entry is
 * permanent and blinds the gate on that handler for good.
 * `GET /api/gather/:eventId/directory` is simultaneously on [[GTC-268]]'s proposed
 * allowlist and the subject of open High-severity [[GTC-262]]. Crying wolf does not
 * get a gate switched off. It gets it hollowed out one justified exception at a time.
 *
 * ⚠ AND WHERE THE HONEST RULE WAS TOO LARGE FOR GTC-273, THE ANSWER IS UNPROVEN AND
 * NOT A WIDER MATCHER. Branch-nested guards are that case: the correct property is
 * per-path and needs branch enumeration. Rather than approximate it, a handler whose
 * every guard call sits inside a branch reports UNPROVEN. Zero handlers are in that
 * state at HEAD, so it costs nothing today and catches the shape when it arrives.
 *
 * ⚠ BINDING PRECONDITION ON SLICE 2, FOUNDER RULING 2026-09-12. `npm run
 * test:security` GOES INTO `.github/workflows/ci.yml` IN THE SAME COMMIT THAT GIVES
 * THIS SCANNER TEETH, AND NOT ONE COMMIT LATER. [[GTC-268]]'s slice 4 moves ahead of
 * or alongside slice 2 for this reason, in the founder's words:
 *
 *   "Suite 12 is what actually holds the fail-open property, so shipping the gate
 *    first ships the weaker instrument and calls it the contract."
 *
 * Measured, not assumed: at the time of writing `ci.yml` runs `npm ci`, `typecheck`,
 * `format:check`, `prisma generate`, `next build` and `npm audit`. Neither
 * `test:security` nor `test:security:routes` is in it. So slice 2 as originally
 * sequenced would put a gate in CI whose blind spots are covered only by a suite CI
 * does not run. **Slice 1b does NOT wire anything into CI — it is reporting-only and
 * stays that way.**
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
 * PROVES: that a credential check runs, and that its result is acted on, on a path
 * that is not itself conditional.
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
 * 2. CROSS-FILE RESOLUTION IS ONE LEVEL AND RELATIVE-ONLY (`MAX_MODULE_DEPTH`).
 *    ⚠ THIS BLIND SPOT WAS DECLARED BY [[GTC-268]] AND IS NOW PARTLY RETIRED, BY
 *    NECESSITY RATHER THAN AMBITION. [[GTC-270]] put the cron secret decision in
 *    `src/app/api/cron/cron-secret.ts` on a founder ruling, precisely BECAUSE this
 *    scanner read the `if` condition and a helper that swallowed the whole check
 *    reported all six handlers as "no credential of any kind". Without one level of
 *    relative-import following, GTC-270's own fix is unprovable here. The blast
 *    radius is countable: the entire route tree contains exactly TWO relative
 *    imports, `../cron-secret` and `../cron-response`, both in the cron directory.
 *    A guard wrapped in a helper imported by ALIAS (`@/lib/...`) is still invisible.
 * 3. CREDENTIAL COLUMNS ARE A DECLARED LIST (CREDENTIAL_COLUMNS below). A lookup on
 *    `sharedLinkToken` is authentication; a lookup on `name` is not; nothing in the
 *    syntax distinguishes them. This list is a maintained input and is the one place
 *    this tool shares a weakness with the file it replaces — four column names
 *    checked against `prisma/schema.prisma`, rather than 81 hand-written verdicts.
 * 4. SERVER ACTIONS ARE OUT OF SCOPE. This walks `src/app/api` only. `c05cfde` chose
 *    a route over a server action precisely because actions are invisible to the
 *    inventory; that reasoning survives unchanged, and whether it should is an open
 *    question on [[GTC-268]].
 * 5. THE FAIL-OPEN EVALUATOR MODELS ONE HYPOTHESIS AND A SMALL LANGUAGE. See
 *    `evaluateSecretAbsent`. Loops and `switch` BEFORE the credential decision are
 *    not modelled and yield UNPROVEN rather than a guess. Neither shape exists in
 *    the tree.
 * 6. A REFUSAL IS A 4xx. A HANDLER THAT REFUSES WITH HTTP 200 AND A BODY FLAG IS
 *    UNPROVEN, AND THIS SCANNER WILL NOT BE TAUGHT OTHERWISE.
 *
 *    `POST /api/auth/verify` refuses an unknown, expired or used magic-link token
 *    with `Response.json({ success: false, error: 'invalid' })` — at HTTP 200. Its
 *    only 4xx is a `status: 400` for a MISSING token in the request body, a different
 *    branch answering a different question, and the retired `refusesSomewhere`
 *    reported the credential PROVEN by borrowing it.
 *
 *    ⚠ THE OBVIOUS FIX IS REFUSED, DELIBERATELY, AND THIS IS THE REASON. Teaching
 *    this scanner that `success: false` in a returned body means refusal would encode
 *    a BODY CONVENTION — and nothing distinguishes a 200 carrying `success: false`
 *    from a 200 carrying data except that convention. That is another spelling test,
 *    of exactly the kind [[GTC-273]] exists to remove. A rule that reads one
 *    codebase's JSON idiom is not more behavioural than a rule that reads one `&&`;
 *    it is the same mistake with a wider vocabulary.
 *
 *    So the verdict stays UNPROVEN and the route stays as it is.
 *
 *    ⚠ FOUNDER RULING, 2026-09-12 — A SLICE-2 PRECONDITION, recorded here and
 *    against [[GTC-268]] so slice 2 inherits it rather than rediscovering it:
 *    **the allowlist entry carries the reason explicitly; the route is NOT changed
 *    to refuse with a 401.**
 *
 *      "The check is real — a magic-link token consumed through findUnique, with
 *       unknown, expired and used all refused. What is missing is the scanner's
 *       ability to confirm it, and changing a working auth route's response shape to
 *       satisfy a static analyser is the tail wagging the dog. The allowlist exists
 *       precisely for 'genuinely fine, provably so by a human and not by the tool',
 *       and an entry whose reason names the unprovability is worth more than a 401
 *       added to make a report tidy."
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
 * GTC-273: a guard is a SYMBOL IMPORTED FROM AN AUTH MODULE, not a name.
 *
 * The retired rule read the property name off any call, so `analytics.getUser()`
 * reported a SESSION guard. All 117 real guard call sites in the tree are bare
 * identifiers imported from exactly these three specifiers — measured, not assumed:
 * 62 from `@/lib/auth/guards`, 15 from `@/lib/auth`, 14 from `@/lib/auth/session`.
 */
const AUTH_MODULE = /^@\/lib\/auth(\/|$)/;

/** Modules that export the Prisma client. 93 route files import it from the first. */
const PRISMA_MODULE = /^@\/lib\/(prisma|db)$/;

/** Modules that export the Stripe client. 5 route files import it from this one. */
const STRIPE_MODULE = /^@\/lib\/stripe(\/|$)/;

/**
 * Columns whose value IS a credential. A lookup keyed on one of these, COMPARED to a
 * value the caller supplied and followed by a refusal, is authentication —
 * structurally identical to any other lookup, which is why the scanner has to be
 * told. Each checked against `prisma/schema.prisma`.
 */
const CREDENTIAL_COLUMNS: ReadonlyArray<{ model: string; field: string }> = [
  { model: 'event', field: 'sharedLinkToken' },
  { model: 'accessToken', field: 'token' },
  { model: 'magicLink', field: 'token' },
  { model: 'session', field: 'token' },
];

/**
 * Prisma methods that can CONSUME a credential. GTC-273: the retired rule required
 * `find*`, so `prisma.magicLink.update({ where: { token } })` — consuming the
 * magic-link token in the same statement that burns it — reported no credential.
 */
const PRISMA_CREDENTIAL_METHODS = /^(find[A-Za-z]*|update|updateMany|delete|deleteMany|upsert)$/;

/** Environment variables used as a shared secret by cron endpoints. */
const SHARED_SECRETS = new Set(['CRON_SECRET']);

const MAX_HELPER_DEPTH = 3;

/** GTC-273, blind spot 2: relative imports only, and one level deep. */
const MAX_MODULE_DEPTH = 1;

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

/**
 * GTC-273. The verdict every rule in this file now returns.
 *
 * PROVEN    the property the rule names was demonstrated to hold.
 * REFUTED   it was demonstrated NOT to hold.
 * UNPROVEN  the analysis could not decide. **Never read as either of the others.**
 *
 * The distinction is the whole of GTC-273. Before it, every rule was binary and the
 * absence of evidence was printed as the absence of the thing, so a shape the rule
 * did not recognise was indistinguishable from a shape it had cleared.
 */
export type Proof = 'PROVEN' | 'REFUTED' | 'UNPROVEN';

export interface GuardEvidence {
  symbol: string;
  kind: GuardKind;
  viaHelper: boolean;
  /** PROVEN when the guard's result reaches a condition whose branch REFUSES. */
  proof: Proof;
  proofReason: string;
  /** GTC-273: true when this guard call sits inside a branch, so it is reached on
   *  SOME path rather than provably on every one. */
  branchNested: boolean;
}

export interface OtherCredential {
  kind: CredentialKind;
  detail: string;
  /** GTC-273: three-valued. See `Proof`. */
  proof: Proof;
  proofReason: string;
  /**
   * True iff this is a SHARED_SECRET whose refusal was PROVEN UNREACHABLE when the
   * secret is unset (GTC-270's defect). Retained as a named field because
   * [[GTC-270]] pinned an assertion on it. **`failOpen === false` no longer means
   * "not the shape I know" — it now means PROVEN or UNPROVEN, and those are
   * different, so read `proof`.**
   */
  failOpen?: boolean;
}

export interface HandlerVerdict {
  filePath: string;
  apiPath: string;
  method: string;
  /** `guardProof === 'PROVEN'`. Kept as a boolean because the report and the
   *  GTC-267 control are both counted on it. */
  guarded: boolean;
  /** GTC-273: PROVEN / REFUTED / UNPROVEN, so "no guard found" and "a guard I could
   *  not decide about" stop being the same answer. */
  guardProof: Proof;
  guardProofReason: string;
  guardEvidence: GuardEvidence[];
  /** Guards that are CALLED but whose result is not acted on — the defect
   *  `authEvidence` cannot see. Includes results discarded entirely (REFUTED) and
   *  results whose witness condition does not refuse (UNPROVEN). */
  uncheckedGuards: string[];
  otherCredentials: OtherCredential[];
}

export interface ScanResult {
  files: string[];
  handlers: HandlerVerdict[];
  sources: Map<string, string>;
  /**
   * Exported handlers the scanner could not read. See `assertFullCoverage`: this is
   * a tool failure, never a finding, and it must never be silent.
   */
  unparsed: UnparsedFile[];
}

export interface UnparsedFile {
  filePath: string;
  reason: string;
  /**
   * GTC-273: set when a SPECIFIC exported method could not be resolved rather than
   * the whole file. Coverage used to be a FILE-level test, so a file exporting one
   * resolvable handler beside one unresolvable one passed while a handler vanished
   * from the report — which is the retired gate's "one verdict per file" defect,
   * rebuilt inside the safety net that exists to prevent it.
   */
  method?: string;
}

/**
 * Reads a module's source for one level of relative-import following.
 * Returns null when the module cannot be read — which must produce UNPROVEN, never
 * a guess. See blind spot 2.
 */
export type ModuleReader = (specifier: string, fromFilePath: string) => string | null;

/** Never reads anything. The default for fixture-driven analysis. */
export const noModuleReader: ModuleReader = () => null;

/** Reads `<dir of fromFilePath>/<specifier>.ts` beneath `root`. */
export function diskModuleReader(root: string = process.cwd()): ModuleReader {
  return (specifier, fromFilePath) => {
    if (!specifier.startsWith('.')) return null;
    const rel = path.posix.normalize(path.posix.join(path.posix.dirname(fromFilePath), specifier));
    for (const candidate of [`${rel}.ts`, `${rel}/index.ts`]) {
      const abs = path.resolve(root, candidate);
      if (fs.existsSync(abs)) return fs.readFileSync(abs, 'utf-8');
    }
    return null;
  };
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

/** Local binding name -> module specifier it was imported from. */
function collectImports(sf: ts.SourceFile): Map<string, string> {
  const out = new Map<string, string>();
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
    const spec = st.moduleSpecifier.text;
    const clause = st.importClause;
    if (!clause) continue;
    if (clause.name) out.set(clause.name.text, spec);
    const b = clause.namedBindings;
    if (b && ts.isNamespaceImport(b)) out.set(b.name.text, spec);
    if (b && ts.isNamedImports(b)) for (const e of b.elements) out.set(e.name.text, spec);
  }
  return out;
}

/** The leftmost identifier of a property-access / call chain. */
function rootIdentifier(e: ts.Expression): string | null {
  let cur: ts.Node = e;
  for (;;) {
    if (ts.isPropertyAccessExpression(cur) || ts.isElementAccessExpression(cur))
      cur = cur.expression;
    else if (ts.isCallExpression(cur)) cur = cur.expression;
    else if (
      ts.isAwaitExpression(cur) ||
      ts.isNonNullExpression(cur) ||
      ts.isParenthesizedExpression(cur)
    )
      cur = cur.expression;
    else break;
  }
  return ts.isIdentifier(cur) ? cur.text : null;
}

/**
 * The 4xx/5xx status codes returned by `return` statements inside `container`.
 *
 * ⚠ READ OFF THE AST, NOT THE SOURCE TEXT. The retired rule was
 * `/status:\s*4\d{2}/.test(container.getText(sf))`, which a COMMENT satisfies. A
 * credential lookup whose only refusal was `// TODO: should return status: 401`
 * reported a real credential check. This is [[GTC-267]]'s `readCode` lesson — reading
 * a tombstone as the thing itself — and [[GTC-269]] wrote the comment-stripping fix
 * in `tests/demo-endpoints-test.ts` for the same reason. Walking returns instead of
 * matching text removes the whole class rather than one instance of it.
 */
function refusalStatusesIn(container: ts.Node): number[] {
  const out: number[] = [];
  const statusesOf = (node: ts.Node): void => {
    if (
      ts.isPropertyAssignment(node) &&
      ((ts.isIdentifier(node.name) && node.name.text === 'status') ||
        (ts.isStringLiteral(node.name) && node.name.text === 'status')) &&
      ts.isNumericLiteral(node.initializer)
    ) {
      out.push(Number(node.initializer.text));
    }
    ts.forEachChild(node, statusesOf);
  };
  const visit = (node: ts.Node): void => {
    if (ts.isReturnStatement(node) && node.expression) statusesOf(node.expression);
    if (ts.isThrowStatement(node)) out.push(401); // a throw before any work fails closed
    ts.forEachChild(node, visit);
  };
  visit(container);
  return out;
}

function refusesSomewhere(container: ts.Node): boolean {
  return refusalStatusesIn(container).some((s) => s >= 400 && s < 500);
}

/** Does this statement — or its own block, not a nested `if` inside it — refuse? */
function branchRefusesDirectly(branch: ts.Statement | undefined): boolean {
  if (!branch) return false;
  const stmts = ts.isBlock(branch) ? [...branch.statements] : [branch];
  for (const s of stmts) {
    if (ts.isReturnStatement(s) && s.expression) {
      if (refusalStatusesIn(s).some((n) => n >= 400 && n < 500)) return true;
    }
    if (ts.isThrowStatement(s)) return true;
  }
  return false;
}

/**
 * Is this guard call sitting inside a branch?
 *
 * GTC-273. `guarded = guardEvidence.length > 0` is EXISTENTIAL, where [[GTC-268]]
 * states the property as universal — "every terminal path either passes a check or
 * returns a refusal." A guard inside `if (!preview) { ... }` is reached on some path
 * and not on others, and the retired model could not tell those apart.
 *
 * The honest rule needs branch enumeration and is larger than [[GTC-273]]. Founder
 * ruling 2026-09-12: the answer is UNPROVEN, not a wider matcher. Zero handlers at
 * HEAD are in this state, so this costs nothing today and catches the shape when it
 * arrives.
 *
 * A `try` block is NOT a branch — `let auth; try { auth = await requireEventRole()
 * ... }` is the shape `events/[id]/transition`, `h/[token]` and
 * `confirm-invites-sent` use deliberately, to fail closed on a throw. A `catch`
 * clause IS one: a guard reached only when something else already failed is not on
 * the success path.
 */
function isBranchNested(call: ts.Node, container: ts.Node): boolean {
  let p: ts.Node | undefined = call.parent;
  while (p && p !== container) {
    if (
      ts.isIfStatement(p) ||
      ts.isConditionalExpression(p) ||
      ts.isSwitchStatement(p) ||
      ts.isCatchClause(p) ||
      ts.isForStatement(p) ||
      ts.isForOfStatement(p) ||
      ts.isForInStatement(p) ||
      ts.isWhileStatement(p) ||
      ts.isDoStatement(p)
    )
      return true;
    p = p.parent;
  }
  return false;
}

/**
 * Is this guard's result acted on?
 *
 * A guard returns a `NextResponse` on failure. Calling it and discarding the result
 * leaves the route wide open while every symbol-matching model reports it guarded.
 *
 * ⚠ GTC-273 NARROWED THIS, AND THE OLD VERSION IS WHY. It required only that the
 * variable appear in SOME `if` condition, tested with a `\b`-anchored regex over the
 * condition TEXT — and `\bauth\b` matches inside `auth.user`. So:
 *
 *     const auth = await requireEventRole(id, ['HOST']);
 *     if (auth.user.role === 'HOST') { ...work... }
 *     ...work anyway...
 *
 * reported GUARDED with nothing in `uncheckedGuards`, on a route whose NextResponse
 * is never returned. The comment that used to sit here said "Merely reading
 * `auth.user` is not checking `auth`" — a property the code did not have.
 *
 * The witness must now REFUSE: the branch guarded by the condition must return a 4xx
 * or return the guard's own result. Measured across the tree at the time of the
 * change: all 111 guarded handlers have a refusing witness, so this narrowing flags
 * nothing that was previously clean — 77 use `if (auth instanceof NextResponse)
 * return auth`, 19 a null-plus-scope test on `resolveToken`, and 17 `if (!user)`.
 */
function guardProofFor(
  call: ts.CallExpression,
  container: ts.Node,
  sf: ts.SourceFile
): { proof: Proof; reason: string } {
  let parent: ts.Node | undefined = call.parent;
  if (parent && ts.isAwaitExpression(parent)) parent = parent.parent;
  if (!parent) return { proof: 'REFUTED', reason: 'the guard result goes nowhere' };

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
    return { proof: 'PROVEN', reason: 'tested inline' };
  } else if (ts.isReturnStatement(parent)) {
    return { proof: 'PROVEN', reason: 'returned to a caller that can test it' };
  }

  if (!varName) {
    return {
      proof: 'REFUTED',
      reason: 'the guard is called and its result is discarded, so it can refuse nobody',
    };
  }

  const name = varName;
  let witness: ts.IfStatement | null = null;
  const visit = (node: ts.Node): void => {
    if (witness) return;
    if (ts.isIfStatement(node) && new RegExp(`\\b${name}\\b`).test(node.expression.getText(sf))) {
      witness = node;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(container);

  if (!witness) {
    return {
      proof: 'REFUTED',
      reason: `\`${name}\` is assigned from a guard and never tested in any condition`,
    };
  }

  const w: ts.IfStatement = witness;
  const returnsTheGuard = (branch: ts.Statement | undefined): boolean => {
    if (!branch) return false;
    let found = false;
    const look = (n: ts.Node): void => {
      if (found) return;
      if (
        ts.isReturnStatement(n) &&
        n.expression &&
        ts.isIdentifier(n.expression) &&
        n.expression.text === name
      )
        found = true;
      ts.forEachChild(n, look);
    };
    look(branch);
    return found;
  };

  const refuses =
    branchRefusesDirectly(w.thenStatement) ||
    branchRefusesDirectly(w.elseStatement) ||
    returnsTheGuard(w.thenStatement) ||
    returnsTheGuard(w.elseStatement);

  if (refuses) return { proof: 'PROVEN', reason: `tested by \`if (${w.expression.getText(sf)})\`` };
  return {
    proof: 'UNPROVEN',
    reason:
      `\`${name}\` reaches \`if (${w.expression.getText(sf)})\`, but that branch neither ` +
      `refuses nor returns the guard result — so nothing establishes that the guard can ` +
      `refuse anyone`,
  };
}

/**
 * A lookup keyed on a credential column.
 *
 * GTC-273 changed this rule in four ways, each measured against a fixture:
 *
 *  - THE CLIENT IS RESOLVED THROUGH ITS IMPORT, not matched as the literal text
 *    `prisma.`. `import { db } from '@/lib/prisma'` then `db.accessToken.findFirst`
 *    is the same check and used to report no credential at all.
 *  - `update` / `delete` / `upsert` COUNT. `prisma.magicLink.update({ where: {
 *    token } })` consumes the magic-link token in the statement that burns it; the
 *    old `find\w+` requirement reported nothing.
 *  - THE COLUMN MUST BE COMPARED, NOT MERELY NAMED. `where: { token: { not: null } }`
 *    is a filter, not a credential check — the caller presents no secret — and it
 *    used to report CREDENTIAL_COLUMN.
 *  - AN OPTIONAL CREDENTIAL IS NOT A CREDENTIAL. `where: { OR: [{ token }, {
 *    eventId }] }` is satisfied by an event id alone.
 *
 * ⚠ ONLY THE `where` CLAUSE COUNTS, and that predates GTC-273. Searching the whole
 * call reads `select: { token: true }` as a credential check — which inverts the
 * meaning of the route that does it. `GET /api/gather/[eventId]/directory` SELECTS
 * access tokens to hand them to anonymous callers; it is keyed on `eventId` alone
 * and checks nothing. The first run of this scanner reported it as carrying a
 * credential, and a scanner that reads a credential VENDOR as a credential CHECKER
 * is worse than no scanner. Asserted in the control suite.
 */
/**
 * ⚠ DOES THIS LOOKUP'S RESULT GATE A REFUSAL?
 *
 * FOUNDER RULING, 2026-09-12. This is `guardProofFor`'s own test, applied to
 * credential columns for the same reason and in the same words: **a result consumed
 * by `.then()` or `.catch()`, or never tested, is not a credential check.** It is not
 * tuning to the tree — it is the rule already applied to guards, applied
 * consistently — and it keeps every capability GTC-273 gained: the aliased client,
 * the `update`-keyed credential, the `OR`/filter rejection, and the multiline callee.
 *
 * WHAT IT REMOVED, AND WHY THAT MATTERS MORE THAN A FALSE POSITIVE WOULD. Three
 * handlers acquired a `CREDENTIAL_COLUMN` when the rule was first widened:
 *
 *   GET /api/c/:token      prisma.accessToken.findFirst(...).then(...)  -- "Track
 *   GET /api/p/:token      prisma.accessToken.findFirst(...).then(...)     first
 *                                                                         link open"
 *   POST /api/auth/logout  prisma.session.delete({ where: { token } }).catch(...)
 *
 * Every one of those labels was TRUE — a declared credential column really is
 * compared to a caller-supplied value in each. The ATTRIBUTION was wrong. On the
 * first two the lookup is analytics and the route's actual credential is
 * `resolveToken`; on logout there is nothing to authorise, which is [[GTC-268]]'s own
 * allowlist reason for it. Founder ruling, in his words:
 *
 *   "A true statement pointed at the wrong check is not a lesser error than a false
 *    one; it is the one that survives review."
 *
 * And at slice 2 a misattributed credential becomes an allowlist entry, which is
 * permanent. That is the hollowing-out this scanner's header already describes.
 */
type Gating = 'GATES' | 'UNDECIDABLE' | 'NOT_A_CHECK';

function credentialResultGates(
  call: ts.CallExpression,
  container: ts.Node,
  sf: ts.SourceFile
): { gating: Gating; reason: string } {
  let parent: ts.Node | undefined = call.parent;
  if (parent && ts.isAwaitExpression(parent)) parent = parent.parent;
  if (!parent) return { gating: 'NOT_A_CHECK', reason: 'the result goes nowhere' };

  // `prisma.x.findFirst(...).then(...)` / `.catch(...)` — a promise consumer, not a
  // credential decision. This is the shape on /c/:token, /p/:token and logout.
  if (ts.isPropertyAccessExpression(parent))
    return {
      gating: 'NOT_A_CHECK',
      reason: `the result is consumed by \`.${parent.name.text}()\`, not tested`,
    };

  if (ts.isReturnStatement(parent))
    return { gating: 'GATES', reason: 'returned to a caller that can test it' };
  if (
    ts.isIfStatement(parent) ||
    ts.isPrefixUnaryExpression(parent) ||
    (ts.isBinaryExpression(parent) && parent.operatorToken.kind !== ts.SyntaxKind.EqualsToken)
  )
    return { gating: 'GATES', reason: 'tested inline' };

  let varName: string | null = null;
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) varName = parent.name.text;
  else if (
    ts.isBinaryExpression(parent) &&
    parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    ts.isIdentifier(parent.left)
  )
    varName = parent.left.text;

  // The throw-on-not-found form: the lookup IS the check and the refusal is the
  // `catch`. `prisma.magicLink.update({ where: { token } })` in a try whose catch
  // answers 401 is a real credential check with no `if` anywhere.
  const inTryWhoseCatchRefuses = (): boolean => {
    let q: ts.Node | undefined = call.parent;
    while (q && q !== container) {
      if (ts.isTryStatement(q) && q.catchClause && branchRefusesDirectly(q.catchClause.block))
        return true;
      q = q.parent;
    }
    return false;
  };

  if (!varName) {
    if (inTryWhoseCatchRefuses())
      return { gating: 'GATES', reason: 'the lookup throws and the catch refuses' };
    return { gating: 'NOT_A_CHECK', reason: 'the result is not bound to anything testable' };
  }

  const name = varName;
  let witness: ts.IfStatement | null = null;
  const visit = (node: ts.Node): void => {
    if (witness) return;
    if (ts.isIfStatement(node) && new RegExp(`\\b${name}\\b`).test(node.expression.getText(sf)))
      witness = node;
    else ts.forEachChild(node, visit);
  };
  visit(container);

  if (!witness) {
    if (inTryWhoseCatchRefuses())
      return { gating: 'GATES', reason: 'the lookup throws and the catch refuses' };
    return {
      gating: 'NOT_A_CHECK',
      reason: `\`${name}\` is never tested in any condition, so the lookup decides nothing`,
    };
  }

  const w: ts.IfStatement = witness;
  if (branchRefusesDirectly(w.thenStatement) || branchRefusesDirectly(w.elseStatement))
    return { gating: 'GATES', reason: `refused by \`if (${w.expression.getText(sf)})\`` };

  return {
    gating: 'UNDECIDABLE',
    reason:
      `\`${name}\` reaches \`if (${w.expression.getText(sf)})\`, but that branch does not ` +
      `return a 4xx — so this looks like a credential check whose refusal cannot be found`,
  };
}

function collectCredentialColumn(
  call: ts.CallExpression,
  container: ts.Node,
  sf: ts.SourceFile,
  imports: Map<string, string>
): OtherCredential | null {
  if (!ts.isPropertyAccessExpression(call.expression)) return null;
  const modelAccess = call.expression.expression;
  const method = call.expression.name.text;
  if (!PRISMA_CREDENTIAL_METHODS.test(method)) return null;
  if (!ts.isPropertyAccessExpression(modelAccess)) return null;

  const model = modelAccess.name.text;
  const clientRoot = rootIdentifier(modelAccess.expression);
  if (!clientRoot) return null;
  const clientModule = imports.get(clientRoot);
  if (!clientModule || !PRISMA_MODULE.test(clientModule)) return null;

  const fields = CREDENTIAL_COLUMNS.filter((c) => c.model === model).map((c) => c.field);
  if (fields.length === 0) return null;

  const whereClauses: ts.Expression[] = [];
  const findWhere = (node: ts.Node): void => {
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && node.name.text === 'where') {
      whereClauses.push(node.initializer);
      return;
    }
    ts.forEachChild(node, findWhere);
  };
  call.arguments.forEach(findWhere);
  if (whereClauses.length === 0) return null;

  let hit: string | null = null;
  let comparedToAValue = false;
  const visit = (node: ts.Node): void => {
    if (hit) return;
    if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      fields.includes(node.name.text)
    ) {
      hit = node.name.text;
      // `token: someValue` compares. `token: { not: null }` filters.
      comparedToAValue = !ts.isObjectLiteralExpression(node.initializer);
      return;
    }
    if (ts.isShorthandPropertyAssignment(node) && fields.includes(node.name.text)) {
      hit = node.name.text;
      comparedToAValue = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  whereClauses.forEach((w) => {
    visit(w);
    ts.forEachChild(w, visit);
  });
  if (!hit) return null;

  const detail = `${clientRoot}.${model}.${method} keyed on ${hit}`;

  // RULING 1: does the result gate a refusal? If not this is not a credential check
  // at all and emits nothing — see `credentialResultGates`.
  const { gating, reason } = credentialResultGates(call, container, sf);
  if (gating === 'NOT_A_CHECK') return null;
  if (gating === 'UNDECIDABLE')
    return { kind: 'CREDENTIAL_COLUMN', detail, proof: 'UNPROVEN', proofReason: reason };

  // Is the credential MANDATORY in this query, or one arm of a disjunction?
  let optional = false;
  for (const w of whereClauses) {
    if (!ts.isObjectLiteralExpression(w)) continue;
    for (const p of w.properties) {
      if (
        ts.isPropertyAssignment(p) &&
        ts.isIdentifier(p.name) &&
        (p.name.text === 'OR' || p.name.text === 'NOT')
      )
        optional = true;
    }
  }
  if (optional)
    return {
      kind: 'CREDENTIAL_COLUMN',
      detail,
      proof: 'UNPROVEN',
      proofReason: `the \`where\` clause is a disjunction, so ${hit} is not required to match`,
    };

  if (!comparedToAValue)
    return {
      kind: 'CREDENTIAL_COLUMN',
      detail,
      proof: 'UNPROVEN',
      proofReason: `${hit} is filtered, not compared — the caller presents no secret`,
    };

  return {
    kind: 'CREDENTIAL_COLUMN',
    detail,
    proof: 'PROVEN',
    proofReason: `compared, then ${reason}`,
  };
}

/**
 * An environment gate.
 *
 * GTC-273, both directions. The retired rule matched `process.env.NODE_ENV` in the
 * condition TEXT and any 4xx anywhere in the `if`. So a gate moved into a local
 * binding disappeared entirely, and an `if (NODE_ENV !== 'production')` containing an
 * unrelated `400` validation error read as a gate over an unguarded `deleteMany`.
 *
 * Only an `if` CONDITION counts, and that predates GTC-273: `secure:
 * process.env.NODE_ENV === 'production'` on a cookie is not a gate, and reading it as
 * one is how `POST /api/demo/session` looks protected while minting a 30-day HOST
 * session to anyone ([[GTC-269]]).
 */
function collectEnvGate(
  node: ts.IfStatement,
  sf: ts.SourceFile,
  envBindings: Set<string>
): OtherCredential | null {
  const condText = node.expression.getText(sf);
  const direct = /process\.env\.NODE_ENV/.test(condText);
  const viaBinding = [...envBindings].some((b) => new RegExp(`\\b${b}\\b`).test(condText));
  if (!direct && !viaBinding) return null;

  const detail =
    viaBinding && !direct
      ? 'NODE_ENV checked through a local binding'
      : 'NODE_ENV checked in a refusal branch';

  if (branchRefusesDirectly(node.thenStatement) || branchRefusesDirectly(node.elseStatement))
    return {
      kind: 'ENV_GATE',
      detail,
      proof: 'PROVEN',
      proofReason: 'the NODE_ENV branch refuses',
    };

  // ⚠ RULING 2, FOUNDER, 2026-09-12 — THE BOUNDARY THE WHOLE THREE-VALUED DESIGN
  // TURNS ON, IN HIS WORDS:
  //
  //   "UNPROVEN is for a thing whose verdict you cannot reach, not for a thing that
  //    is not the kind of thing being verdicted. An `if` whose branch contains no
  //    return is not a gate."
  //
  // `GET /api/h/:token` is the case that forced it. Its
  // `if (process.env.NODE_ENV !== 'development')` sets an `authStatus` field for the
  // client; it returns nothing and gates nothing. Reporting ENV_GATE [UNPROVEN] there
  // asserts a defect that is not present — and a gate that cries wolf gets hollowed
  // out by allowlist entries, which is the failure mode already visible in this tree,
  // where `GET /api/gather/:eventId/directory` sits on GTC-268's proposed allowlist
  // AND under open High-severity GTC-262.
  //
  // So the discriminator is a DIRECT return. None in either branch: not a gate, emit
  // nothing. A direct return this scanner cannot classify as a 4xx: a gate whose
  // verdict it cannot reach, and THAT is UNPROVEN.
  const directReturn = (b: ts.Statement | undefined): boolean => {
    if (!b) return false;
    const stmts = ts.isBlock(b) ? [...b.statements] : [b];
    return stmts.some((x) => ts.isReturnStatement(x) || ts.isThrowStatement(x));
  };
  if (!directReturn(node.thenStatement) && !directReturn(node.elseStatement)) return null;

  return {
    kind: 'ENV_GATE',
    detail,
    proof: 'UNPROVEN',
    proofReason:
      'the NODE_ENV branch returns, but not a 4xx this scanner can identify — so it ' +
      'looks like a gate whose refusal cannot be confirmed',
  };
}

// ────────────────────────────────────────────────────────────────────────────────
// The fail-open evaluator — GTC-273
// ────────────────────────────────────────────────────────────────────────────────
/**
 * ⚠ THE RULE THAT ASKS WHAT THE CONDITION MEANS INSTEAD OF HOW IT IS SPELLED.
 *
 * THE PROPERTY. A fail-open guard refuses when a secret MISMATCHES but proceeds when
 * the secret is ABSENT. That is a property of behaviour. The retired detector tested
 * for one AST shape:
 *
 *     ts.isBinaryExpression(cond) && cond.operatorToken.kind === AmpersandAmpersand
 *       && ts.isIdentifier(cond.left) && cond.left.text === secret
 *
 * Thirteen rewrites defeat it, all genuinely fail-open — four filed on [[GTC-273]],
 * nine found by its investigation. Two of the thirteen additionally drop the handler
 * out of the credential classification altogether and report "no credential of any
 * kind", so a broken guard reads as no guard and a reviewer sees an unguarded handler
 * where there is a wrongly-guarded one.
 *
 * HOW THIS DECIDES INSTEAD. Fix the secret to ABSENT, evaluate every condition with
 * a three-valued logic, prune branches that are decidably false, and ask whether any
 * surviving path returns a non-refusal. It never asks how the condition is typed, so
 * a fourteenth shape nobody has thought of is decided correctly without this file
 * changing.
 *
 * ⚠ THE TWO DISTINCTIONS THAT MAKE IT HONEST, BOTH FOUND BY RUNNING IT RATHER THAN
 * BY REASONING ABOUT IT. Recorded because each was a wrong design that looked right:
 *
 *  1. CALLER-CONTROLLED UNKNOWNS ARE THE QUESTION, NOT A LIMIT OF THE ANALYSIS. The
 *     first prototype treated every unresolvable call as undecidable. Since
 *     `request.headers.get('authorization')` is unresolvable, it reported UNPROVEN on
 *     ALL SEVENTEEN fixtures and ALL SIX real handlers — the cry-wolf failure in its
 *     purest form, and GTC-273's Stop Condition 9 exactly. The attacker CHOOSES the
 *     header, so those branches are existential: if some path reaches the work, the
 *     attacker can reach the work. `INPUT` below is that, and it is not a failure.
 *  2. AN UNDECIDABLE CONDITION AFTER THE DECISION MUST NOT POISON IT. The second
 *     prototype reported UNPROVEN on correct code because `if (result.errors.length
 *     > 0)` stands in the cron handlers' bodies AFTER the guard has already decided.
 *     Fix: explore both branches of an undecidable condition and JOIN. If both agree,
 *     the opacity did not matter. Only a disagreement is UNPROVEN — see `joinOutcome`.
 *
 * WHAT IT CANNOT DO, stated rather than discovered later. Loops and `switch`
 * statements BEFORE the credential decision are not modelled and yield UNPROVEN.
 * Neither shape exists in the tree. `OPAQUE` values — a call that is neither
 * caller-derived nor resolvable — also yield UNPROVEN when they gate the refusal,
 * which is what makes one level of relative-import following necessary rather than
 * merely nice: [[GTC-270]] put the decision in `../cron-secret` on a founder ruling.
 */

type Abs =
  | { k: 'ABSENT' }
  | { k: 'STR'; s: string }
  | { k: 'BOOL'; v: boolean }
  | { k: 'NUM'; n: number }
  /** Caller-controlled. Existential: the attacker picks it. */
  | { k: 'INPUT' }
  /** Neither caller-derived nor resolvable. Universal and undecided. */
  | { k: 'OPAQUE'; why: string };

const ABSENT: Abs = { k: 'ABSENT' };
const INPUT: Abs = { k: 'INPUT' };
type Tri = 'T' | 'F' | 'U';

interface EvalCtx {
  sf: ts.SourceFile;
  env: Map<string, Abs>;
  fns: Map<string, ts.FunctionLikeDeclaration>;
  depth: number;
}

function truthy(a: Abs): Tri {
  switch (a.k) {
    case 'ABSENT':
      return 'F';
    case 'STR':
      return a.s.length > 0 ? 'T' : 'F';
    case 'BOOL':
      return a.v ? 'T' : 'F';
    case 'NUM':
      return a.n !== 0 ? 'T' : 'F';
    default:
      return 'U';
  }
}

/** OPAQUE dominates INPUT: an undecidable universal beats an existential. */
function worstOf(...as: Abs[]): Abs {
  for (const a of as) if (a.k === 'OPAQUE') return a;
  return INPUT;
}

function absValue(e: ts.Expression | undefined, c: EvalCtx): Abs {
  if (!e) return ABSENT;
  if (
    ts.isParenthesizedExpression(e) ||
    ts.isNonNullExpression(e) ||
    ts.isAwaitExpression(e) ||
    ts.isAsExpression(e)
  )
    return absValue(e.expression, c);

  if (ts.isIdentifier(e)) {
    if (e.text === 'undefined') return ABSENT;
    return c.env.get(e.text) ?? { k: 'OPAQUE', why: `unbound identifier \`${e.text}\`` };
  }
  if (e.kind === ts.SyntaxKind.NullKeyword) return ABSENT;
  if (e.kind === ts.SyntaxKind.TrueKeyword) return { k: 'BOOL', v: true };
  if (e.kind === ts.SyntaxKind.FalseKeyword) return { k: 'BOOL', v: false };
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e))
    return { k: 'STR', s: e.text };
  if (ts.isNumericLiteral(e)) return { k: 'NUM', n: Number(e.text) };

  if (ts.isPropertyAccessExpression(e) || ts.isElementAccessExpression(e)) {
    const t = e.getText(c.sf);
    for (const s of SHARED_SECRETS)
      if (t === `process.env.${s}` || t === `process.env['${s}']` || t === `process.env["${s}"]`)
        return ABSENT;
    if (/^process\.env\b/.test(t)) return INPUT;
    const recv = absValue(e.expression, c);
    if (recv.k === 'ABSENT') return ABSENT;
    if (ts.isPropertyAccessExpression(e) && recv.k === 'STR' && e.name.text === 'length')
      return { k: 'NUM', n: recv.s.length };
    if (recv.k === 'INPUT') return INPUT;
    if (recv.k === 'OPAQUE') return recv;
    return { k: 'OPAQUE', why: `property \`${t}\`` };
  }

  if (ts.isPrefixUnaryExpression(e) && e.operator === ts.SyntaxKind.ExclamationToken) {
    const inner = absValue(e.operand, c);
    const t = truthy(inner);
    return t === 'U' ? inner : { k: 'BOOL', v: t === 'F' };
  }
  if (ts.isTypeOfExpression(e)) {
    const v = absValue(e.expression, c);
    if (v.k === 'ABSENT') return { k: 'STR', s: 'undefined' };
    if (v.k === 'STR') return { k: 'STR', s: 'string' };
    if (v.k === 'BOOL') return { k: 'STR', s: 'boolean' };
    if (v.k === 'NUM') return { k: 'STR', s: 'number' };
    return v;
  }
  if (ts.isConditionalExpression(e)) {
    const cv = absValue(e.condition, c);
    const t = truthy(cv);
    if (t === 'T') return absValue(e.whenTrue, c);
    if (t === 'F') return absValue(e.whenFalse, c);
    const a = absValue(e.whenTrue, c);
    const b = absValue(e.whenFalse, c);
    if (truthy(a) !== 'U' && truthy(a) === truthy(b)) return a; // the choice did not matter
    return worstOf(cv);
  }

  if (ts.isBinaryExpression(e)) {
    const op = e.operatorToken.kind;
    const L = absValue(e.left, c);
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) {
      if (truthy(L) === 'F') return { k: 'BOOL', v: false };
      const R = absValue(e.right, c);
      if (truthy(L) === 'T') return R;
      if (truthy(R) === 'F') return { k: 'BOOL', v: false };
      return worstOf(L, R);
    }
    if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken) {
      if (truthy(L) === 'T') return L;
      const R = absValue(e.right, c);
      if (truthy(L) === 'F') return R;
      if (truthy(R) === 'T') return R;
      return worstOf(L, R);
    }
    const EQ = [
      ts.SyntaxKind.EqualsEqualsEqualsToken,
      ts.SyntaxKind.EqualsEqualsToken,
      ts.SyntaxKind.ExclamationEqualsEqualsToken,
      ts.SyntaxKind.ExclamationEqualsToken,
    ];
    if (EQ.includes(op)) {
      const R = absValue(e.right, c);
      const neg =
        op === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
        op === ts.SyntaxKind.ExclamationEqualsToken;
      let same: Tri = 'U';
      const unknown = (a: Abs) => a.k === 'INPUT' || a.k === 'OPAQUE';
      if (unknown(L) || unknown(R)) same = 'U';
      else if (L.k === 'ABSENT' && R.k === 'ABSENT') same = 'T';
      else if (L.k === 'ABSENT' || R.k === 'ABSENT') same = 'F';
      else if (L.k === 'STR' && R.k === 'STR') same = L.s === R.s ? 'T' : 'F';
      else if (L.k === 'BOOL' && R.k === 'BOOL') same = L.v === R.v ? 'T' : 'F';
      else if (L.k === 'NUM' && R.k === 'NUM') same = L.n === R.n ? 'T' : 'F';
      else same = 'F';
      if (same === 'U') return worstOf(L, R);
      return { k: 'BOOL', v: neg ? same === 'F' : same === 'T' };
    }
    if (op === ts.SyntaxKind.GreaterThanToken || op === ts.SyntaxKind.GreaterThanEqualsToken) {
      const R = absValue(e.right, c);
      if (L.k === 'NUM' && R.k === 'NUM')
        return { k: 'BOOL', v: op === ts.SyntaxKind.GreaterThanToken ? L.n > R.n : L.n >= R.n };
      return worstOf(L, R);
    }
    return worstOf(L, absValue(e.right, c));
  }

  if (ts.isCallExpression(e)) {
    if (ts.isIdentifier(e.expression) && e.expression.text === 'Boolean') {
      const a = absValue(e.arguments[0], c);
      const t = truthy(a);
      return t === 'U' ? a : { k: 'BOOL', v: t === 'T' };
    }
    // A resolvable pure predicate — local, or one level through a relative import.
    const nm = ts.isIdentifier(e.expression) ? e.expression.text : null;
    if (nm && c.fns.has(nm) && c.depth < MAX_HELPER_DEPTH + 2) {
      const fn = c.fns.get(nm)!;
      const inner = new Map<string, Abs>();
      fn.parameters.forEach((p, i) => {
        if (ts.isIdentifier(p.name)) inner.set(p.name.text, absValue(e.arguments[i], c));
      });
      const r = pureReturnValue(fn, { ...c, env: inner, depth: c.depth + 1 });
      if (r) return r;
    }
    if (ts.isPropertyAccessExpression(e.expression)) {
      const recv = absValue(e.expression.expression, c);
      if (recv.k === 'INPUT') return INPUT;
      if (recv.k === 'ABSENT') return ABSENT; // `x?.replace(...)` on an absent value
    }
    return { k: 'OPAQUE', why: `call \`${e.expression.getText(c.sf)}\`` };
  }
  return { k: 'OPAQUE', why: `unmodelled ${ts.SyntaxKind[e.kind]}` };
}

/** Evaluate a small pure predicate to one abstract value, or null if it is not pure enough. */
function pureReturnValue(fn: ts.FunctionLikeDeclaration, c: EvalCtx): Abs | null {
  if (!fn.body) return null;
  if (!ts.isBlock(fn.body)) return absValue(fn.body as ts.Expression, c);
  for (const st of fn.body.statements) {
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations)
        if (ts.isIdentifier(d.name)) c.env.set(d.name.text, absValue(d.initializer, c));
      continue;
    }
    if (ts.isIfStatement(st)) {
      const t = truthy(absValue(st.expression, c));
      if (t === 'U') return null;
      if (t === 'T') {
        const b = st.thenStatement;
        const ret = ts.isBlock(b)
          ? b.statements.find(ts.isReturnStatement)
          : ts.isReturnStatement(b)
            ? b
            : undefined;
        return ret ? absValue(ret.expression, c) : null;
      }
      continue;
    }
    if (ts.isReturnStatement(st)) return absValue(st.expression, c);
    return null;
  }
  return null;
}

export type SecretReachability = 'FAIL_CLOSED' | 'FAIL_OPEN' | 'UNPROVEN';
interface Outcome {
  verdict: SecretReachability;
  reason: string;
}

/**
 * Join two outcomes reached under a condition that could not be decided.
 *
 * If both agree, the undecided condition did not matter — this is what stops an
 * opaque condition standing AFTER the credential decision from poisoning the verdict.
 * If they disagree, who chose decides: a caller-controlled condition is the
 * attacker's to pick, so a reaching branch means the work is reachable. An OPAQUE
 * one is nobody's to pick and the honest answer is UNPROVEN.
 */
function joinOutcome(a: Outcome, b: Outcome, opaqueWhy: string | null): Outcome {
  if (a.verdict === b.verdict) return a;
  if (a.verdict === 'UNPROVEN') return a;
  if (b.verdict === 'UNPROVEN') return b;
  if (opaqueWhy)
    return { verdict: 'UNPROVEN', reason: `the refusal depends on an undecidable ${opaqueWhy}` };
  return {
    verdict: 'FAIL_OPEN',
    reason: 'a caller-controlled branch reaches the handler body with the secret absent',
  };
}

/**
 * Can this statement change the fail-open answer? It can if it returns, throws, or
 * assigns to a binding the decision reads. A `for` loop that only logs cannot.
 */
function canAffectDecision(st: ts.Statement, c: EvalCtx): boolean {
  let risky = false;
  const visit = (n: ts.Node): void => {
    if (risky) return;
    if (ts.isReturnStatement(n) || ts.isThrowStatement(n)) {
      risky = true;
      return;
    }
    if (
      ts.isBinaryExpression(n) &&
      n.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(n.left) &&
      c.env.has(n.left.text)
    ) {
      risky = true;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(st);
  return risky;
}

function runPaths(list: ts.Statement[], c: EvalCtx, budget: { n: number }): Outcome {
  for (let i = 0; i < list.length; i++) {
    if (--budget.n < 0) return { verdict: 'UNPROVEN', reason: 'path budget exhausted' };
    const st = list[i];

    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations)
        if (ts.isIdentifier(d.name)) c.env.set(d.name.text, absValue(d.initializer, c));
      continue;
    }
    if (ts.isReturnStatement(st)) {
      const statuses = refusalStatusesIn(st);
      const refuses = statuses.some((s) => s >= 400 && s < 500);
      return refuses
        ? { verdict: 'FAIL_CLOSED', reason: 'every path refuses when the secret is absent' }
        : { verdict: 'FAIL_OPEN', reason: 'a path returns a non-refusal with the secret absent' };
    }
    if (ts.isThrowStatement(st))
      return { verdict: 'FAIL_CLOSED', reason: 'the path throws before reaching any work' };

    if (ts.isIfStatement(st)) {
      const cv = absValue(st.expression, c);
      const t = truthy(cv);
      const rest = list.slice(i + 1);
      const take = (b: ts.Statement | undefined): Outcome =>
        runPaths(
          [...(b ? (ts.isBlock(b) ? [...b.statements] : [b]) : []), ...rest],
          { ...c, env: new Map(c.env) },
          budget
        );
      if (t === 'T') return take(st.thenStatement);
      if (t === 'F') return take(st.elseStatement);
      return joinOutcome(
        take(st.thenStatement),
        take(st.elseStatement),
        cv.k === 'OPAQUE' ? cv.why : null
      );
    }

    if (ts.isTryStatement(st))
      return runPaths(
        [...st.tryBlock.statements, ...list.slice(i + 1)],
        { ...c, env: new Map(c.env) },
        budget
      );
    if (ts.isBlock(st))
      return runPaths(
        [...st.statements, ...list.slice(i + 1)],
        { ...c, env: new Map(c.env) },
        budget
      );
    if (
      ts.isSwitchStatement(st) ||
      ts.isForStatement(st) ||
      ts.isForOfStatement(st) ||
      ts.isForInStatement(st) ||
      ts.isWhileStatement(st) ||
      ts.isDoStatement(st)
    ) {
      // ⚠ AN UNMODELLED CONSTRUCT IS ONLY UNDECIDABLE IF IT CAN CHANGE THE ANSWER.
      // The first version returned UNPROVEN on sight, which reported a correct guard
      // as undecidable merely because an unrelated `for` loop preceded it. That is
      // the cry-wolf failure GTC-273 Stop Condition 9 is about, so the test is
      // whether the construct can return, throw, or write to anything the decision
      // reads — not whether this evaluator models its semantics in general.
      if (!canAffectDecision(st, c)) continue;
      return {
        verdict: 'UNPROVEN',
        reason:
          `an unmodelled ${ts.SyntaxKind[st.kind]} that can return, throw or reassign ` +
          `stands before the credential decision`,
      };
    }
  }
  return { verdict: 'FAIL_OPEN', reason: 'the handler falls off its end without refusing' };
}

/**
 * Is this handler's refusal unreachable when the shared secret is absent?
 *
 * Exported so the control suite can drive it directly against real route files —
 * "the detector still fires on the shape GTC-270 removed" needs to be an assertion,
 * not a paragraph.
 */
export function evaluateSecretAbsent(
  filePath: string,
  text: string,
  method: string,
  readModule: ModuleReader = diskModuleReader()
): Outcome {
  const sf = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const fns = new Map<string, ts.FunctionLikeDeclaration>();

  const ingest = (src: ts.SourceFile) =>
    src.forEachChild((n) => {
      if (ts.isFunctionDeclaration(n) && n.name) fns.set(n.name.text, n);
      if (ts.isVariableStatement(n))
        for (const d of n.declarationList.declarations)
          if (
            ts.isIdentifier(d.name) &&
            d.initializer &&
            (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))
          )
            fns.set(d.name.text, d.initializer);
    });
  ingest(sf);

  // One level, relative only. See blind spot 2 and the GTC-270 note above.
  if (MAX_MODULE_DEPTH >= 1) {
    for (const st of sf.statements) {
      if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
      const spec = st.moduleSpecifier.text;
      if (!spec.startsWith('.')) continue;
      const src = readModule(spec, filePath);
      if (src === null) continue;
      ingest(ts.createSourceFile(spec, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS));
    }
  }

  const modEnv = new Map<string, Abs>();
  const seed: EvalCtx = { sf, env: modEnv, fns, depth: 0 };
  sf.forEachChild((n) => {
    if (ts.isVariableStatement(n))
      for (const d of n.declarationList.declarations)
        if (
          ts.isIdentifier(d.name) &&
          d.initializer &&
          !ts.isArrowFunction(d.initializer) &&
          !ts.isFunctionExpression(d.initializer)
        )
          modEnv.set(d.name.text, absValue(d.initializer, seed));
  });

  const fn = fns.get(method);
  if (!fn?.body || !ts.isBlock(fn.body))
    return { verdict: 'UNPROVEN', reason: `the body of \`${method}\` could not be resolved` };

  const env = new Map(modEnv);
  const bindParams = (f: ts.FunctionLikeDeclaration) =>
    f.parameters.forEach((p) => {
      if (ts.isIdentifier(p.name)) env.set(p.name.text, INPUT);
    });
  bindParams(fn);

  // Inline single-call delegation: `return handleRequest(request)` in two cron files,
  // and `return GET(request)` in the third. All three shapes are live.
  let body: ts.Statement[] = [...fn.body.statements];
  for (let k = 0; k < MAX_HELPER_DEPTH + 1; k++) {
    if (body.length !== 1 || !ts.isReturnStatement(body[0]) || !body[0].expression) break;
    let e: ts.Expression = body[0].expression;
    if (ts.isAwaitExpression(e)) e = e.expression;
    if (!ts.isCallExpression(e) || !ts.isIdentifier(e.expression)) break;
    const target = fns.get(e.expression.text);
    if (!target?.body || !ts.isBlock(target.body)) break;
    bindParams(target);
    body = [...target.body.statements];
  }

  return runPaths(body, { sf, env, fns, depth: 0 }, { n: 8000 });
}

// ────────────────────────────────────────────────────────────────────────────────
// analyzeSource — the unit of the result is the exported method
// ────────────────────────────────────────────────────────────────────────────────

/** Analyse one route file's source. The unit of the result is the exported method. */
export function analyzeSource(
  filePath: string,
  text: string,
  readModule: ModuleReader = noModuleReader
): HandlerVerdict[] {
  const sf = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const imports = collectImports(sf);

  const localFns = new Map<string, FnLike>();
  const handlerFns = new Map<string, FnLike>();
  /** Bindings whose value IS `process.env.NODE_ENV` — for `collectEnvGate`. */
  const envBindings = new Set<string>();

  /**
   * ⚠ THE SHARED SECRET, AND EVERY BINDING DERIVED FROM IT.
   *
   * GTC-273's worst single finding: `const s = CRON_SECRET; if (s && p !== s)` did
   * not merely lose the fail-open flag — it dropped the handler out of the credential
   * classification entirely and reported "NO CREDENTIAL OF ANY KIND", because the
   * site finder matched `\bCRON_SECRET\b` against the condition TEXT and a local
   * named `s` does not contain it. So a broken guard read as no guard, and a reviewer
   * would see an unguarded handler where there is a wrongly-guarded one. The ternary
   * form (`const ok = CRON_SECRET ? p === CRON_SECRET : true; if (!ok)`) did the same.
   *
   * Closed by following the DATA rather than the spelling: the transitive closure of
   * bindings whose initialiser reads the secret, or reads something that did.
   * Computed over identifier references in the AST rather than over source text, so
   * a string or a comment mentioning the secret does not enrol a binding.
   */
  const secretTokens = new Set<string>(SHARED_SECRETS);
  {
    const decls: ts.VariableDeclaration[] = [];
    const collect = (n: ts.Node): void => {
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) decls.push(n);
      ts.forEachChild(n, collect);
    };
    collect(sf);
    for (let pass = 0; pass < 8; pass++) {
      let added = false;
      for (const d of decls) {
        const name = (d.name as ts.Identifier).text;
        if (secretTokens.has(name)) continue;
        let reads = false;
        const look = (n: ts.Node): void => {
          if (reads) return;
          if (ts.isIdentifier(n) && secretTokens.has(n.text)) {
            reads = true;
            return;
          }
          ts.forEachChild(n, look);
        };
        look(d.initializer!);
        if (reads) {
          secretTokens.add(name);
          added = true;
        }
      }
      if (!added) break;
    }
  }

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
        } else if (/process\.env\.NODE_ENV/.test(d.initializer.getText(sf))) {
          envBindings.add(d.name.text);
        }
      }
    }
  });

  /** A guard is the SYMBOL, imported from an auth module. See AUTH_MODULE. */
  const guardKindOf = (call: ts.CallExpression): GuardKind | null => {
    if (!ts.isIdentifier(call.expression)) return null;
    const name = call.expression.text;
    if (!SESSION_GUARDS.has(name) && !TOKEN_GUARDS.has(name)) return null;
    const from = imports.get(name);
    if (!from || !AUTH_MODULE.test(from)) return null;
    return SESSION_GUARDS.has(name) ? 'SESSION' : 'TOKEN';
  };

  const verdicts: HandlerVerdict[] = [];

  for (const [method, fn] of handlerFns) {
    const guardEvidence: GuardEvidence[] = [];
    const uncheckedGuards: string[] = [];
    const otherCredentials: OtherCredential[] = [];
    /** SHARED_SECRET credentials, and whether each sits in a branch that refuses. */
    const secretSites: Array<{ cred: OtherCredential; refuses: boolean }> = [];

    const seen = new Set<string>();

    const walk = (node: ts.Node, container: ts.Node, depth: number, nested: boolean): void => {
      const visit = (child: ts.Node): void => {
        if (ts.isIfStatement(child)) {
          const condText = child.expression.getText(sf);
          const secret = [...secretTokens].find((s) => new RegExp(`\\b${s}\\b`).test(condText));
          if (secret) {
            // The DIRECTION is decided once per handler by `evaluateSecretAbsent`,
            // below. This pass only finds the sites and notes whether each refuses,
            // so the credential count stays one per `if` as it has always been.
            const cred: OtherCredential = {
              kind: 'SHARED_SECRET',
              detail: `${secret} compared in a refusal branch`,
              proof: 'UNPROVEN',
              proofReason: 'not yet evaluated',
            };
            const refuses =
              branchRefusesDirectly(child.thenStatement) ||
              branchRefusesDirectly(child.elseStatement);
            secretSites.push({ cred, refuses });
            otherCredentials.push(cred);
          }
          const env = collectEnvGate(child, sf, envBindings);
          if (env) otherCredentials.push(env);
        }

        if (ts.isCallExpression(child)) {
          const kind = guardKindOf(child);
          if (kind) {
            const name = (child.expression as ts.Identifier).text;
            const { proof, reason } = guardProofFor(child, container, sf);
            guardEvidence.push({
              symbol: name,
              kind,
              viaHelper: depth > 0,
              proof,
              proofReason: reason,
              branchNested: nested || isBranchNested(child, container),
            });
            if (proof !== 'PROVEN') uncheckedGuards.push(name);
          }

          const col = collectCredentialColumn(child, container, sf, imports);
          if (col) otherCredentials.push(col);

          const sig = collectSignature(child, container, sf, imports);
          if (sig) otherCredentials.push(sig);

          const receipt = collectThirdPartyReceipt(child, container, sf, imports);
          if (receipt) otherCredentials.push(receipt);

          // Follow local helpers and sibling handlers. Both shapes are live in the
          // cron routes: `handleRequest` holds the whole check in two files, and
          // POST delegates to the exported GET in a third. GTC-273: nesting is
          // CUMULATIVE — a guard inside a helper that is only called from a `catch`
          // is not on the success path, and the nesting lives at the call site.
          const calleeName = ts.isIdentifier(child.expression) ? child.expression.text : null;
          if (
            calleeName &&
            localFns.has(calleeName) &&
            !seen.has(calleeName) &&
            depth < MAX_HELPER_DEPTH
          ) {
            seen.add(calleeName);
            const target = localFns.get(calleeName)!;
            const callNested = nested || isBranchNested(child, container);
            if (target.body) walk(target.body, target.body, depth + 1, callNested);
          }
        }

        ts.forEachChild(child, visit);
      };
      ts.forEachChild(node, visit);
    };

    if (fn.body) walk(fn.body, fn.body, 0, false);

    // ── The shared-secret DIRECTION, decided once, by evaluation ──────────────
    if (secretSites.length > 0) {
      const anyRefuses = secretSites.some((s) => s.refuses);
      if (!anyRefuses) {
        for (const s of secretSites) {
          s.cred.detail = `${[...SHARED_SECRETS][0]} referenced in a condition`;
          s.cred.proof = 'UNPROVEN';
          s.cred.proofReason =
            'the secret appears in a condition but no branch keyed on it returns a 4xx, ' +
            'so nothing establishes that it guards anything';
          s.cred.failOpen = false;
        }
      } else {
        const outcome = evaluateSecretAbsent(filePath, text, method, readModule);
        for (const s of secretSites) {
          if (outcome.verdict === 'FAIL_CLOSED') {
            s.cred.proof = 'PROVEN';
            s.cred.failOpen = false;
          } else if (outcome.verdict === 'FAIL_OPEN') {
            s.cred.proof = 'REFUTED';
            s.cred.failOpen = true;
          } else {
            s.cred.proof = 'UNPROVEN';
            s.cred.failOpen = false;
          }
          s.cred.proofReason = outcome.reason;
        }
      }
    }

    // ── The guard verdict, three-valued ──────────────────────────────────────
    let guardProof: Proof;
    let guardProofReason: string;
    const proven = guardEvidence.filter((g) => g.proof === 'PROVEN');
    const provenOnEveryPath = proven.filter((g) => !g.branchNested);
    if (guardEvidence.length === 0) {
      guardProof = 'REFUTED';
      guardProofReason = 'no session or token guard is called in this handler';
    } else if (provenOnEveryPath.length > 0) {
      guardProof = 'PROVEN';
      guardProofReason = provenOnEveryPath.map((g) => `${g.symbol}: ${g.proofReason}`).join('; ');
      // ⚠ RULING 2, SECOND HALF — "a guard symbol computing a field is not a guard
      // being ignored." `GET /api/h/:token` and `GET /api/p/:token` call `getUser()`
      // and test the result to set an `authStatus` field for the client, while the
      // route's actual credential is a PROVEN `resolveToken`. Listing `getUser` under
      // "Guards CALLED but not CHECKED — a guard that cannot refuse anyone" asserts a
      // defect that is not there.
      //
      // The discriminator is NOT the witness shape — it is whether anything else in
      // the handler gates a refusal. Where nothing does, a guard whose witness does
      // not refuse IS the real defect and stays named: that is the
      // `if (auth.user.role === 'HOST')` shape, which is a wide-open route.
      uncheckedGuards.length = 0;
      for (const g of guardEvidence) if (g.proof === 'REFUTED') uncheckedGuards.push(g.symbol);
    } else if (proven.length > 0) {
      guardProof = 'UNPROVEN';
      guardProofReason =
        `every call to ${proven.map((g) => g.symbol).join(', ')} sits inside a branch, so the ` +
        `guard is reached on SOME path and not provably on every one. The correct property is ` +
        `per-path; GTC-273 answers UNPROVEN rather than approximating it`;
    } else {
      const unproven = guardEvidence.filter((g) => g.proof === 'UNPROVEN');
      if (unproven.length > 0) {
        guardProof = 'UNPROVEN';
        guardProofReason = unproven.map((g) => `${g.symbol}: ${g.proofReason}`).join('; ');
      } else {
        guardProof = 'REFUTED';
        guardProofReason = guardEvidence.map((g) => `${g.symbol}: ${g.proofReason}`).join('; ');
      }
    }

    verdicts.push({
      filePath,
      apiPath: toApiPath(filePath),
      method,
      guarded: guardProof === 'PROVEN',
      guardProof,
      guardProofReason,
      guardEvidence,
      uncheckedGuards: [...new Set(uncheckedGuards)],
      otherCredentials,
    });
  }

  return verdicts;
}

/**
 * A verified third-party signature.
 *
 * GTC-273: the retired rule was `name === 'constructEvent'`, matched off the property
 * name of any call. So `stripe.webhooks.constructEventAsync` — Stripe's own async API
 * — reported no credential at all, and a local `function constructEvent(raw) { return
 * JSON.parse(raw) }` reported a verified signature. The webhook is Do-Not-Touch
 * Zone 4; moving to the async API must not silently drop its only classification.
 */
function collectSignature(
  call: ts.CallExpression,
  container: ts.Node,
  sf: ts.SourceFile,
  imports: Map<string, string>
): OtherCredential | null {
  const name = ts.isPropertyAccessExpression(call.expression)
    ? call.expression.name.text
    : ts.isIdentifier(call.expression)
      ? call.expression.text
      : null;
  if (name !== 'constructEvent' && name !== 'constructEventAsync') return null;

  const detail = ts.isPropertyAccessExpression(call.expression)
    ? call.expression.getText(sf)
    : `${name}()`;

  if (!ts.isPropertyAccessExpression(call.expression))
    return {
      kind: 'SIGNATURE',
      detail,
      proof: 'UNPROVEN',
      proofReason: `\`${name}\` is called as a bare function, not on a verified Stripe client`,
    };

  const root = rootIdentifier(call.expression.expression);
  const from = root ? imports.get(root) : undefined;
  if (!from || !STRIPE_MODULE.test(from))
    return {
      kind: 'SIGNATURE',
      detail,
      proof: 'UNPROVEN',
      proofReason: `the receiver \`${root ?? '?'}\` does not resolve to a Stripe client import`,
    };

  if (!refusesSomewhere(container))
    return {
      kind: 'SIGNATURE',
      detail,
      proof: 'UNPROVEN',
      proofReason: 'the signature is constructed but nothing in this handler returns a 4xx',
    };

  return {
    kind: 'SIGNATURE',
    detail,
    proof: 'PROVEN',
    proofReason: 'verified against the webhook secret, and a mismatch refuses',
  };
}

/**
 * A verified third-party receipt.
 *
 * GTC-273, and this one is the scanner's own defect turned on itself. The retired
 * rule matched the exact text `stripe.checkout.sessions.retrieve` and asked nothing
 * else — so retrieving a Stripe session counted as a verified receipt WITHOUT ever
 * reading `payment_status`. [[GTC-268]]'s allowlist reason for `POST /api/events` is
 * precisely that it "is refused unless `payment_status === 'paid'` (402)". That is
 * the guard-versus-call distinction — the single thing this scanner exists to catch —
 * and it was unenforced for receipts.
 */
function collectThirdPartyReceipt(
  call: ts.CallExpression,
  container: ts.Node,
  sf: ts.SourceFile,
  imports: Map<string, string>
): OtherCredential | null {
  if (!ts.isPropertyAccessExpression(call.expression)) return null;
  if (call.expression.name.text !== 'retrieve') return null;
  const text = call.expression.getText(sf);
  if (!/\bcheckout\.sessions\.retrieve$/.test(text)) return null;

  const root = rootIdentifier(call.expression.expression);
  const from = root ? imports.get(root) : undefined;
  const detail = 'Stripe checkout session retrieved and verified';

  if (!from || !STRIPE_MODULE.test(from))
    return {
      kind: 'THIRD_PARTY_RECEIPT',
      detail,
      proof: 'UNPROVEN',
      proofReason: `the receiver \`${root ?? '?'}\` does not resolve to a Stripe client import`,
    };

  // The receipt is the PAYMENT, not the retrieval. Require a refusal keyed on it.
  let verified = false;
  const look = (n: ts.Node): void => {
    if (verified) return;
    if (ts.isIfStatement(n) && /payment_status/.test(n.expression.getText(sf))) {
      if (branchRefusesDirectly(n.thenStatement) || branchRefusesDirectly(n.elseStatement))
        verified = true;
    }
    ts.forEachChild(n, look);
  };
  look(container);

  if (!verified)
    return {
      kind: 'THIRD_PARTY_RECEIPT',
      detail: 'Stripe checkout session retrieved',
      proof: 'UNPROVEN',
      proofReason:
        'the session is retrieved but no branch keyed on `payment_status` refuses, so ' +
        'nothing establishes that the payment completed',
    };

  return {
    kind: 'THIRD_PARTY_RECEIPT',
    detail,
    proof: 'PROVEN',
    proofReason: '`payment_status` is checked and a non-paid session is refused',
  };
}

/**
 * Exported HTTP handlers this scanner could NOT resolve to a function body.
 *
 * ⚠ GTC-273: THE COVERAGE RULE WAS PER FILE, FOR A PROPERTY THAT LIVES PER METHOD.
 *
 * `assertFullCoverage` fired only when a file yielded NO verdict. So a file exporting
 * one resolvable handler beside one unresolvable one passed coverage while a handler
 * vanished from the report entirely — measured, with an unauthenticated
 * `prisma.event.deleteMany()` behind `export { deleteHandler as DELETE }`.
 *
 * That is `route-classifications.json`'s own defect — one verdict per file for a
 * property that lives per method, which is how [[GTC-267]]'s nine reads hid — rebuilt
 * inside the safety net that exists to prevent it. No route file in the tree uses an
 * `export { ... }` list today. Nothing stopped one tomorrow.
 */
export function unresolvedHandlerExports(filePath: string, text: string): string[] {
  const sf = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const resolved = new Set(analyzeSource(filePath, text).map((v) => v.method));
  const out: string[] = [];

  for (const st of sf.statements) {
    // `export { handler as DELETE }` / `export { GET }`
    if (ts.isExportDeclaration(st) && st.exportClause && ts.isNamedExports(st.exportClause)) {
      for (const el of st.exportClause.elements) {
        const exported = el.name.text;
        if (HTTP_METHODS.has(exported) && !resolved.has(exported)) out.push(exported);
      }
    }
    // `export const GET = withSomething(handler)` — an initialiser that is not a
    // function expression, so the body is not this file's to read.
    if (ts.isVariableStatement(st) && isExported(st)) {
      for (const d of st.declarationList.declarations) {
        if (!ts.isIdentifier(d.name) || !HTTP_METHODS.has(d.name.text)) continue;
        if (resolved.has(d.name.text)) continue;
        out.push(d.name.text);
      }
    }
  }
  return [...new Set(out)];
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
  return buildResult(sources, diskModuleReader(root));
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

  return buildResult(sources, gitRefModuleReader(ref, root));
}

/**
 * GTC-273: relative-import following must read the module AT THE SAME REF as the
 * route, not from the working tree. Resolving `../cron-secret` from disk while
 * analysing `298b62d` would be reading today's fix into yesterday's code, and the
 * GTC-267 control's whole value is that the two commits are read independently.
 * `src/app/api/cron/cron-secret.ts` does not exist at `298b62d`, so this correctly
 * returns null there and the verdict is UNPROVEN rather than borrowed.
 */
function gitRefModuleReader(ref: string, root: string): ModuleReader {
  return (specifier, fromFilePath) => {
    if (!specifier.startsWith('.')) return null;
    const rel = path.posix.normalize(path.posix.join(path.posix.dirname(fromFilePath), specifier));
    for (const candidate of [`${rel}.ts`, `${rel}/index.ts`]) {
      try {
        return execFileSync('git', ['show', `${ref}:${candidate}`], {
          cwd: root,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'ignore'],
          maxBuffer: 1 << 26,
        });
      } catch {
        /* not present at this ref */
      }
    }
    return null;
  };
}

/** Analyse an arbitrary set of sources. Exported so the control can drive fixtures. */
export function scanSources(
  sources: Map<string, string>,
  readModule: ModuleReader = noModuleReader
): ScanResult {
  return buildResult(sources, readModule);
}

function buildResult(sources: Map<string, string>, readModule: ModuleReader): ScanResult {
  const files = [...sources.keys()].sort();
  const handlers: HandlerVerdict[] = [];
  const unparsed: UnparsedFile[] = [];

  for (const f of files) {
    const text = sources.get(f)!;
    const verdicts = analyzeSource(f, text, readModule);

    // THREE WAYS A HANDLER CAN BE UNREADABLE, AND THE LAST TWO ARE THE DANGEROUS ONES.
    //
    // (a) The file yields no handler verdict at all — an export form this scanner
    //     does not resolve, or source with nothing recognisable in it.
    //
    // (b) It has parse errors but STILL yields verdicts. TypeScript's parser
    //     recovers rather than throwing, so broken source produces a tree anyway —
    //     with an invented shape. `export async function GET( { const ??? <<<`
    //     parses to a `GET` declaration whose body is whatever recovery decided,
    //     and a verdict read off that is a guess wearing the costume of a fact. It
    //     could as easily report GUARDED as UNGUARDED.
    //
    // (c) GTC-273: A SPECIFIC EXPORTED METHOD does not resolve while its siblings
    //     do. Cases (a) and (b) were the whole of the old rule, and both are
    //     FILE-level — so one resolvable handler was enough to certify a file whose
    //     other handler had silently vanished from the report. That is the retired
    //     gate's "one verdict per file" defect rebuilt inside the coverage check.
    //
    // Case (b) was found by the coverage fixture the founder asked for, within
    // minutes of it being written, against a scanner that had already passed 51
    // assertions. Case (c) was found by GTC-273 measuring the coverage rule itself.
    // All three are the same failure from here: a handler whose verdict must not be
    // believed, or which is not there to believe.
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
    } else {
      for (const method of unresolvedHandlerExports(f, text)) {
        unparsed.push({
          filePath: f,
          method,
          reason:
            `\`${method}\` is exported in a form this scanner does not resolve, while its ` +
            `sibling handler(s) did resolve. Coverage used to be per FILE, so this handler ` +
            `would have vanished from the report under a green check`,
        });
      }
    }

    handlers.push(...verdicts);
  }

  return { files, handlers, sources, unparsed };
}

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

/**
 * A Next.js `route.ts` that exports no HTTP handler this scanner recognises is
 * either malformed or written in a shape the scanner does not understand. Both are
 * the same thing from here: a route the tool cannot see.
 */
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
 * GTC-273 extended it from the FILE to the EXPORTED METHOD. See case (c) in
 * `buildResult`: the file-level form let one resolvable handler certify a file whose
 * sibling had vanished, which is the same wrong denominator the retired gate used.
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
  const lines = result.unparsed
    .map((u) => `  ${u.filePath}${u.method ? ` [${u.method}]` : ''}\n    ${u.reason}`)
    .join('\n');
  throw new Error(
    `Route scan coverage failure: ${result.unparsed.length} unreadable handler(s) or ` +
      `file(s) across ${result.files.length} route file(s).\n${lines}\n` +
      `A route the scanner cannot see is indistinguishable from a route that is safe.`
  );
}

/**
 * Handlers with no SESSION and no TOKEN guard.
 *
 * NOT the same as "unauthenticated": a Stripe signature, a `CRON_SECRET` comparison
 * and a credential-column lookup are real credentials and are reported separately.
 * This is the count [[GTC-267]] was about, and nothing wider.
 *
 * GTC-273: this is `guardProof !== 'PROVEN'`, so it now contains both handlers with
 * no guard (REFUTED) and handlers whose guard could not be decided (UNPROVEN). Those
 * are different findings and `unprovenHandlers` separates them — at slice 2 a
 * REFUTED handler needs an allowlist entry or a fix, and an UNPROVEN one needs the
 * scanner or the route made legible before either is possible.
 */
export function unguardedHandlers(result: ScanResult): HandlerVerdict[] {
  return result.handlers.filter((h) => !h.guarded);
}

/**
 * Handlers the scanner could not decide about — an undecidable guard, or any
 * credential whose proof did not come out.
 *
 * ⚠ FOUNDER RULING, 2026-09-12: THESE BLOCK AT SLICE 2 AND PRINT AS UNPROVEN.
 * "A handler the scanner cannot decide must not be silently admitted, and must not
 * silently acquire a permanent exception either." Zero handlers are in this set at
 * HEAD, which is what makes the ruling safe to adopt now rather than later — slice 2
 * does not start red because of it.
 */
export function unprovenHandlers(result: ScanResult): HandlerVerdict[] {
  return result.handlers.filter(
    (h) => h.guardProof === 'UNPROVEN' || h.otherCredentials.some((c) => c.proof === 'UNPROVEN')
  );
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

/**
 * GTC-273: the label a credential prints.
 *
 * SHARED_SECRET always states its DIRECTION, because the direction is the whole
 * property and `[FAIL-OPEN]`-or-silence is what made `failOpen: false` read as
 * fail-closed when it meant "not the shape I know". Every other kind prints a marker
 * only when its proof did not come out, so a PROVEN credential reads exactly as it
 * always has.
 */
function credentialLabel(c: OtherCredential): string {
  if (c.kind === 'SHARED_SECRET') {
    const tag =
      c.proof === 'PROVEN' ? 'FAIL-CLOSED' : c.proof === 'REFUTED' ? 'FAIL-OPEN' : 'UNPROVEN';
    const colour = c.proof === 'PROVEN' ? GREEN : YELLOW;
    return `${CYAN}${c.kind}${RESET} ${colour}[${tag}]${RESET}`;
  }
  if (c.proof === 'PROVEN') return `${CYAN}${c.kind}${RESET}`;
  return `${CYAN}${c.kind}${RESET} ${YELLOW}[${c.proof}]${RESET}`;
}

function main(): void {
  const started = Date.now();
  const result = scanWorkingTree();

  // Coverage first. Everything printed below is meaningless if the scan is partial.
  if (result.unparsed.length > 0) {
    console.error(`${BOLD}${YELLOW}=== ROUTE AUTH SCAN — COVERAGE FAILURE ===${RESET}\n`);
    console.error(
      `${result.unparsed.length} unreadable handler(s) or file(s) across ${result.files.length} route files.\n`
    );
    for (const u of result.unparsed) {
      console.error(`  ${u.filePath}${u.method ? ` [${u.method}]` : ''}`);
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
      console.log(`    ${DIM}${h.guardProofReason}${RESET}`);
    }
    console.log('');
  }

  // GTC-273. Printed only when non-empty, and it is empty at HEAD.
  const undecided = unprovenHandlers(result);
  if (undecided.length > 0) {
    console.log(`${BOLD}${YELLOW}UNPROVEN — the scanner could not decide${RESET}`);
    console.log(
      `${DIM}Not a finding and not a clearance. Founder ruling 2026-09-12: these BLOCK at\n` +
        `slice 2 and print as UNPROVEN — a handler the scanner cannot decide must not be\n` +
        `silently admitted, and must not silently acquire a permanent exception either.${RESET}\n`
    );
    for (const h of undecided) {
      console.log(`  ${h.method.padEnd(7)}${h.apiPath}`);
      if (h.guardProof === 'UNPROVEN')
        console.log(`    ${DIM}guard: ${h.guardProofReason}${RESET}`);
      for (const c of h.otherCredentials.filter((x) => x.proof === 'UNPROVEN'))
        console.log(`    ${DIM}${c.kind}: ${c.proofReason}${RESET}`);
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
        : creds.map(credentialLabel).join(', ');
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
  console.log(
    `Fail-closed, PROVEN (GTC-273):    ${
      result.handlers.filter((h) =>
        h.otherCredentials.some((c) => c.kind === 'SHARED_SECRET' && c.proof === 'PROVEN')
      ).length
    }`
  );
  console.log(`Undecidable, UNPROVEN (GTC-273):  ${undecided.length}`);
  console.log(`Scan time: ${Date.now() - started}ms\n`);

  console.log(`${DIM}Slice 1 is reporting only and exits 0 unconditionally. Default-deny,`);
  console.log(`the allowlist and the CI step are slice 2 of GTC-268.${RESET}\n`);

  process.exit(0);
}

if (require.main === module) main();
