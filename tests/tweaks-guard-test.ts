/**
 * [[GTC-414]] — THE TWEAKS GUARD: the protected zones held BYTE FOR BYTE as they are at 21a9577.
 *
 * Founder rulings, 28 Oct 2026 (in Cowork): all 18 launch tweaks go in before launch, in
 * batches; T0 (this ticket) comes first and re-bases the old freeze checks of demo-tweaks 1 to 11
 * onto a fixed history, so they stop catching NEW edits by themselves. Two things take that job
 * over: each later ticket's own suite (only its named files changed since 21a9577), and this
 * suite, for the protected zones, for good.
 *
 * WHAT IT ASKS, for every entry in PROTECTED below: the working folder, the index (what is
 * staged) and HEAD each hold that path exactly as 21a9577 holds it. A folder or a pattern also
 * may not gain an untracked file. An entry that names a FUNCTION or a LINE inside a file (in the
 * files a later ticket plans to edit) holds that span only: it is found by its first line, which
 * must occur exactly once, and runs to the first later line that starts with `}` at the same
 * indent (a "line" entry is its one line); the four copies must be byte-identical.
 *
 * TO CHANGE A PROTECTED PATH, a later ticket edits PROTECTED in its own commit, so the founder
 * sees the change in the diff and rules on it. Nothing else turns a check here green.
 *
 * SAFETY. Git and file reads only: no database, no dev server, no browser, no provider, no
 * network, no write.
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const ROOT = path.join(__dirname, '..');
/** GitHub's main when the launch tweaks began (GTC-413's last commit). */
const T0_AT = '21a9577bdc3b2f3d84617f096dd811e891f55305';
/** Git's empty tree: a diff from it to T0_AT lists every file T0_AT holds under a path. */
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

// ═══ THE PROTECTED LIST (edit it only in a ticket of its own, for the founder to rule) ═══════
//
// Zones (the founder's numbering): 1 sessions and cookies; 2 the sign-in link; 3 access tokens
// and their scope; 4 Stripe and payment; 5 the schema and its migrations; 6 the security suite;
// 7 SMS opt-out; 9 email opt-out and block. (8, package.json's module type, is not a file zone.)
//
//   path   a file, a folder, or a git pattern (with *): the whole of it.
//   span   the function or block that starts with `start` (whole first line, indent included).
//   line   the one line that starts with `start`.
type Entry =
  | { zone: number; kind: 'path'; path: string; why: string }
  | { zone: number; kind: 'span' | 'line'; path: string; start: string; why: string };

const PROTECTED: Entry[] = [
  // ── Zone 1: sessions and cookies ──
  {
    zone: 1,
    kind: 'path',
    path: 'middleware.ts',
    why: 'the role-scoped cookies and session isolation (GTC-001)',
  },
  {
    zone: 1,
    kind: 'path',
    path: 'src/lib/auth',
    why: 'the session read, the role and token guards, the signed-in person',
  },
  {
    zone: 1,
    kind: 'path',
    path: 'src/lib/auth.ts',
    why: 'resolveToken: a link token to its event, person and scope (also zone 3)',
  },
  // ── Zone 2: the sign-in link ──
  {
    zone: 2,
    kind: 'path',
    path: 'src/app/api/auth',
    why: 'the magic-link, verify, claim and logout routes',
  },
  {
    zone: 2,
    kind: 'path',
    path: 'src/lib/accounts/user-by-email.ts',
    why: 'one account per address, for sign-in and payment (GTC-411)',
  },
  {
    zone: 2,
    kind: 'span',
    path: 'src/lib/email.ts',
    start:
      'export async function sendMagicLinkEmail(to: string, token: string): Promise<SendResult> {',
    why: 'the sign-in email: its link, words and expiry (ruling 6: no unsubscribe)',
  },
  {
    zone: 2,
    kind: 'span',
    path: 'src/lib/email.ts',
    start: 'export async function sendWelcomeEmail(',
    why: 'the welcome email: its sign-in link, token and 30-day expiry',
  },
  {
    zone: 2,
    kind: 'span',
    path: 'src/app/auth/signin/page.tsx',
    start: '  const handleSubmit = async (e: React.FormEvent) => {',
    why: 'the sign-in page asks /api/auth/magic-link for a link (the words may change)',
  },
  {
    zone: 2,
    kind: 'span',
    path: 'src/app/auth/verify/page.tsx',
    start: '  useEffect(() => {',
    why: 'the sign-in-link page spends the link at /api/auth/verify (the error words may change)',
  },
  // ── Zone 3: access tokens and their scope ──
  {
    zone: 3,
    kind: 'path',
    path: 'src/lib/tokens.ts',
    why: 'the link tokens: made, listed, pruned and built into links',
  },
  // ── Zone 4: Stripe and payment ──
  {
    zone: 4,
    kind: 'path',
    path: 'src/app/api/webhooks',
    why: 'the Stripe webhook: signature, idempotency, billing changes',
  },
  {
    zone: 4,
    kind: 'path',
    path: 'src/app/api/billing',
    why: 'checkout, portal, cancel and status',
  },
  {
    zone: 4,
    kind: 'path',
    path: 'src/lib/stripe*',
    why: 'the Stripe client',
  },
  {
    zone: 4,
    kind: 'path',
    path: 'src/lib/billing',
    why: 'the subscription sync from Stripe to the account',
  },
  {
    zone: 4,
    kind: 'path',
    path: 'src/app/api/events/route.ts',
    why: 'a paid checkout becomes an event (the payment check)',
  },
  {
    zone: 4,
    kind: 'path',
    path: 'src/lib/events/payment-identity.ts',
    why: 'whose account a payment lands on (GTC-411, GTC-412)',
  },
  // ── Zone 5: the schema and its migrations ──
  {
    zone: 5,
    kind: 'path',
    path: 'prisma/schema.prisma',
    why: 'the schema',
  },
  {
    zone: 5,
    kind: 'path',
    path: 'prisma/migrations',
    why: 'the migrations: never edited, deleted or reordered',
  },
  // ── Zone 6: the security suite ──
  {
    zone: 6,
    kind: 'path',
    path: 'tests/security-*',
    why: 'the security suite, its fixtures, its inventory gate and its route scan',
  },
  // ── Zone 7: SMS opt-out ──
  {
    zone: 7,
    kind: 'path',
    path: 'src/lib/sms/opt-out-*',
    why: 'the opt-out store, the STOP and START words, the opt-out line on every text',
  },
  {
    zone: 7,
    kind: 'path',
    path: 'src/lib/sms/send-sms.ts',
    why: 'every text checks the opt-out and the block before it sends',
  },
  {
    zone: 7,
    kind: 'path',
    path: 'src/lib/sms/tnz-reply-record.ts',
    why: 'the reply path: the only writer of an opt-out from a texted STOP',
  },
  {
    zone: 7,
    kind: 'path',
    path: 'src/app/api/sms/tnz-webhook/route.ts',
    why: 'where a texted STOP arrives',
  },
  {
    zone: 7,
    kind: 'path',
    path: 'src/lib/eligibility/text-block.ts',
    why: 'the text blocks, the provider opt-out and lifting it',
  },
  // ── Zone 9: email opt-out and block ──
  {
    zone: 9,
    kind: 'path',
    path: 'src/lib/eligibility/email-opt-out.ts',
    why: 'the email opt-out read',
  },
  {
    zone: 9,
    kind: 'path',
    path: 'src/lib/eligibility/email-block.ts',
    why: 'the email block: its store and its one writer',
  },
  {
    zone: 9,
    kind: 'path',
    path: 'src/lib/unsubscribe-token.ts',
    why: 'the signed unsubscribe link',
  },
  {
    zone: 9,
    kind: 'path',
    path: 'src/app/api/unsubscribe',
    why: 'the one-click unsubscribe route',
  },
  {
    zone: 9,
    kind: 'path',
    path: 'src/app/unsubscribe',
    why: 'the unsubscribe page and its confirm button',
  },
  {
    zone: 9,
    kind: 'span',
    path: 'src/lib/email.ts',
    start: 'function guestEmailParts(',
    why: 'every guest email gets its unsubscribe link and the two headers here',
  },
  {
    zone: 9,
    kind: 'line',
    path: 'src/lib/email-footer.ts',
    start: 'export const GATHER_CONTACT_EMAIL =',
    why: 'the contact address in every guest email (ruling 7)',
  },
  {
    zone: 9,
    kind: 'line',
    path: 'src/lib/email-footer.ts',
    start: 'export const GATHER_CONTACT_LINE =',
    why: 'the contact line in every guest email (GTC-341)',
  },
  {
    zone: 9,
    kind: 'line',
    path: 'src/lib/email-footer.ts',
    start: 'export const UNSUBSCRIBE_INVITATION =',
    why: 'the sentence above the unsubscribe link',
  },
  {
    zone: 9,
    kind: 'span',
    path: 'src/lib/email-footer.ts',
    start: 'export function guestEmailFooter(pageUrl: string): string {',
    why: 'the footer: the way out and the contact line',
  },
  {
    zone: 9,
    kind: 'span',
    path: 'src/lib/email-footer.ts',
    start: 'export function withGuestEmailFooter(body: string, pageUrl: string): string {',
    why: 'the footer attached to every guest body',
  },
  {
    zone: 9,
    kind: 'span',
    path: 'src/lib/email-footer.ts',
    start: 'export function listUnsubscribeHeaders(oneClickUrl: string): Record<string, string> {',
    why: 'the List-Unsubscribe and one-click headers',
  },
];
// ═══ END OF THE PROTECTED LIST ════════════════════════════════════════════════════════════════

// ── Reporting ────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const reds: string[] = [];
function assert(layer: string, label: string, condition: boolean, detail?: string) {
  if (condition) {
    passed++;
    console.log(`\x1b[32m✓\x1b[0m [${layer}] ${label}`);
  } else {
    failed++;
    reds.push(`[${layer}] ${label}`);
    console.log(`\x1b[31m✗\x1b[0m [${layer}] ${label}${detail ? `\n    ${detail}` : ''}`);
  }
}
const section = (s: string) => console.log(`\n\x1b[1m\x1b[33m${s}\x1b[0m`);
const ok = (f: () => boolean) => {
  try {
    return f();
  } catch {
    return false;
  }
};

const git = (args: string[]) => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });

// ── CHECKS: every condition, pure, so each can be tried on a passing and a failing input ─────
export const CHECKS = {
  /** The span that starts with `start` (exactly one such line), to the first later line that
   * starts with `}` at the same indent; for a "line" entry, the one line. '' if not found. */
  spanOf(src: string, start: string, kind: 'span' | 'line'): string {
    const lines = src.split('\n');
    const at = lines.map((l, i) => (l.startsWith(start) ? i : -1)).filter((i) => i >= 0);
    if (at.length !== 1) return '';
    const i = at[0];
    if (kind === 'line') return lines[i];
    const indent = lines[i].match(/^ */)![0];
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].startsWith(`${indent}}`)) return lines.slice(i, j + 1).join('\n');
    }
    return '';
  },
  /** Four copies of a span, all found, all the same bytes; a span is at least three lines. */
  spansSame(fixed: string, head: string, index: string, work: string, kind: 'span' | 'line') {
    const min = kind === 'line' ? 1 : 3;
    return (
      fixed.length > 0 &&
      fixed.split('\n').length >= min &&
      head === fixed &&
      index === fixed &&
      work === fixed
    );
  },
};

/** The files T0_AT holds under a path or pattern (empty if none, or if git fails). */
function filesAtT0(spec: string): string[] {
  const r = git(['diff', '--name-only', EMPTY_TREE, T0_AT, '--', spec]);
  return r.status === 0 ? r.stdout.split('\n').filter(Boolean) : [];
}

/** Which of the three places differ from T0_AT for a whole path ([] when all equal). */
function pathDiffers(spec: string): string[] {
  const out: string[] = [];
  // The working folder, tracked files (a git error counts as a difference).
  if (git(['diff', '--quiet', T0_AT, '--', spec]).status !== 0) out.push('working folder');
  // The working folder, files git does not track yet.
  const untracked = git(['ls-files', '--others', '--exclude-standard', '--', spec]);
  if (untracked.status !== 0 || untracked.stdout.trim().length > 0)
    out.push(`untracked: ${untracked.stdout.trim().split('\n').join(', ')}`);
  if (git(['diff', '--quiet', '--cached', T0_AT, '--', spec]).status !== 0) out.push('index');
  if (git(['diff', '--quiet', T0_AT, 'HEAD', '--', spec]).status !== 0) out.push('HEAD');
  return out;
}

/** A file as git holds it at a revision ('' if it cannot). `:` alone is the index. */
function show(rev: string, rel: string): string {
  const r = git(['show', `${rev}:${rel}`]);
  return r.status === 0 ? r.stdout : '';
}
function readWork(rel: string): string {
  try {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
  } catch {
    return '';
  }
}

function layerC() {
  section('C — CONTROL: the fixed commit and the list');
  assert(
    'C',
    'C1 21a9577 is a commit git can read here',
    ok(() => git(['cat-file', '-t', T0_AT]).stdout.trim() === 'commit')
  );
  const keys = PROTECTED.map((e) => `${e.path}|${e.kind === 'path' ? '' : e.start}`);
  assert(
    'C',
    `C2 the list holds ${PROTECTED.length} entries, none twice, every zone 1 to 7 and 9 named`,
    PROTECTED.length > 0 &&
      new Set(keys).size === keys.length &&
      [1, 2, 3, 4, 5, 6, 7, 9].every((z) => PROTECTED.some((e) => e.zone === z))
  );
}

function layerG() {
  section('G — every protected path and span equals 21a9577 (working folder, index, HEAD)');
  PROTECTED.forEach((e, n) => {
    const id = `G${n + 1}`;
    if (e.kind === 'path') {
      const held = filesAtT0(e.path);
      const differs = held.length > 0 ? pathDiffers(e.path) : ['nothing at 21a9577'];
      assert(
        'G',
        `${id} zone ${e.zone}: ${e.path} (${held.length} file${held.length === 1 ? '' : 's'}) — ${e.why}`,
        held.length > 0 && differs.length === 0,
        `differs in: ${differs.join('; ')}`
      );
    } else {
      const fixed = CHECKS.spanOf(show(T0_AT, e.path), e.start, e.kind);
      const head = CHECKS.spanOf(show('HEAD', e.path), e.start, e.kind);
      const index = CHECKS.spanOf(show('', e.path), e.start, e.kind);
      const work = CHECKS.spanOf(readWork(e.path), e.start, e.kind);
      const where = [
        head !== fixed ? 'HEAD' : '',
        index !== fixed ? 'index' : '',
        work !== fixed ? 'working folder' : '',
      ].filter(Boolean);
      assert(
        'G',
        `${id} zone ${e.zone}: ${e.path}, the ${e.kind} "${e.start.trim().slice(0, 60)}" — ${e.why}`,
        CHECKS.spansSame(fixed, head, index, work, e.kind),
        fixed.length === 0 ? 'not found once at 21a9577' : `differs in: ${where.join(', ')}`
      );
    }
  });
}

function main() {
  layerC();
  layerG();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (reds.length) console.log(reds.map((r) => `  - ${r}`).join('\n'));
}

// A dry run imports CHECKS only (TWEAKS_GUARD_DRY_RUN=1); the suite runs otherwise.
if (process.env.TWEAKS_GUARD_DRY_RUN !== '1') {
  try {
    main();
  } catch (e) {
    console.error(e);
    failed++;
  }
  process.exit(failed > 0 ? 1 : 0);
}
